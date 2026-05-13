"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, MessageSquarePlus, MousePointer2, X } from "lucide-react";
import { IdentityForm } from "@/components/IdentityForm";
import type { SerializedComment, SerializedPage } from "@/lib/serializers";

type ElementTarget = {
  selector: string;
  xpath: string;
  textSnippet: string;
  rect: Record<string, number>;
  viewport: Record<string, number>;
};

type Props = {
  accessGranted: boolean;
  identityName: string | null;
  page: SerializedPage;
  initialComments: SerializedComment[];
};

export function ShareClient({ accessGranted, identityName, page, initialComments }: Props) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [comments, setComments] = useState(initialComments);
  const [commentMode, setCommentMode] = useState(true);
  const [target, setTarget] = useState<ElementTarget | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessError, setAccessError] = useState("");
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const iframeSrc = `/uploads/${page.id}/${page.entryPath}`;
  const openCount = useMemo(
    () => comments.filter((comment) => comment.status !== "resolved").length,
    [comments],
  );

  const postToFrame = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ source: "html-share-parent", ...message }, "*");
  }, []);

  const syncFrame = useCallback(
    (nextComments = comments, nextMode = commentMode) => {
      postToFrame({ type: "set-mode", enabled: nextMode });
      postToFrame({ type: "render-comments", comments: nextComments });
    },
    [commentMode, comments, postToFrame],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const message = event.data || {};
      if (message.source !== "html-share-bridge") return;
      if (message.type === "ready" || message.type === "request-comments") syncFrame();
      if (message.type === "element-click") {
        setTarget(message.payload as ElementTarget);
        setError("");
      }
      if (message.type === "pin-click") {
        const comment = comments.find((item) => item.id === message.id);
        if (comment) postToFrame({ type: "locate", comment });
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [comments, commentMode, postToFrame, syncFrame]);

  useEffect(() => {
    syncFrame();
  }, [comments, commentMode, syncFrame]);

  async function submitAccessPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckingAccess(true);
    setAccessError("");

    const response = await fetch(`/api/share/${page.slug}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: accessPassword }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    setCheckingAccess(false);

    if (!response.ok) {
      setAccessError(data.error ?? "访问密码错误");
      return;
    }

    router.refresh();
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;

    setSaving(true);
    setError("");

    const response = await fetch(`/api/share/${page.slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, ...target }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      comment?: SerializedComment;
      error?: string;
    };

    setSaving(false);

    if (!response.ok || !data.comment) {
      setError(data.error ?? "评论保存失败");
      return;
    }

    const nextComments = [...comments, data.comment];
    setComments(nextComments);
    setTarget(null);
    setBody("");
    postToFrame({ type: "clear-selection" });
    syncFrame(nextComments);
  }

  if (!identityName || editingName) {
    return (
      <main className="center-screen">
        <IdentityForm
          buttonLabel="继续"
          description="评论会显示这个名字；同一浏览器 90 天内无需再次输入。"
          onSaved={() => {
            setEditingName(false);
            router.refresh();
          }}
          title={identityName ? "修改你的名字" : "先输入你的名字"}
        />
      </main>
    );
  }

  if (!page.hasAccessPassword) {
    return (
      <main className="center-screen">
        <section className="panel narrow-panel">
          <div>
            <p className="eyebrow">Access Required</p>
            <h1>等待管理员设置访问密码</h1>
            <p className="muted">这个旧分享页面还没有访问密码。管理员设置后，评论者才能访问。</p>
          </div>
        </section>
      </main>
    );
  }

  if (!accessGranted) {
    return (
      <main className="center-screen">
        <form className="panel narrow-panel" onSubmit={submitAccessPassword}>
          <div>
            <p className="eyebrow">Share Access</p>
            <h1>输入访问密码</h1>
            <p className="muted">你好，{identityName}。首次访问这个分享链接需要输入页面访问密码。</p>
          </div>
          <label className="field">
            <span>访问密码</span>
            <input
              autoFocus
              onChange={(event) => setAccessPassword(event.target.value)}
              placeholder="由分享者提供"
              type="password"
              value={accessPassword}
            />
          </label>
          {accessError ? <p className="error-text">{accessError}</p> : null}
          <button className="primary-button" disabled={checkingAccess} type="submit">
            <KeyRound size={18} />
            {checkingAccess ? "验证中" : "进入评论页"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="review-shell">
      <aside className="review-sidebar">
        <div>
          <p className="eyebrow">Share Link</p>
          <h1>{page.title}</h1>
          <p className="muted">{openCount} 条待处理评论</p>
          <p className="muted identity-line">
            当前身份：<strong>{identityName}</strong>
            <button className="text-button" onClick={() => setEditingName(true)} type="button">
              修改
            </button>
          </p>
        </div>

        <button
          className={commentMode ? "primary-button" : "secondary-button"}
          onClick={() => setCommentMode((current) => !current)}
          type="button"
        >
          <MousePointer2 size={18} />
          {commentMode ? "评论模式已开启" : "开启评论模式"}
        </button>

        <div className="comment-list">
          {comments.map((comment, index) => (
            <button
              className="comment-item"
              key={comment.id}
              onClick={() => postToFrame({ type: "locate", comment })}
              type="button"
            >
              <span className={comment.status === "resolved" ? "pin muted-pin" : "pin"}>{index + 1}</span>
              <span>
                <strong>{comment.authorName}</strong>
                <small>{comment.status === "resolved" ? "已处理" : "待处理"}</small>
                <em>{comment.body}</em>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="frame-stage">
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts allow-forms allow-popups"
          src={iframeSrc}
          title={page.title}
        />
      </main>

      {target ? (
        <div className="composer-backdrop">
          <form className="composer" onSubmit={submitComment}>
            <div className="composer-head">
              <div>
                <p className="eyebrow">New Comment</p>
                <h2>添加评论</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setTarget(null);
                  postToFrame({ type: "clear-selection" });
                }}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <p className="target-snippet">{target.textSnippet || target.selector || "已选择元素"}</p>
            <label className="field">
              <span>评论</span>
              <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} />
            </label>
            <p className="muted">将以「{identityName}」的名字提交。</p>
            {error ? <p className="error-text">{error}</p> : null}
            <button className="primary-button" disabled={saving} type="submit">
              <Check size={18} />
              {saving ? "保存中" : "保存评论"}
            </button>
          </form>
        </div>
      ) : null}

      {!target && commentMode ? (
        <div className="floating-hint">
          <MessageSquarePlus size={16} />
          鼠标悬停预览，点击元素添加评论
        </div>
      ) : null}
    </div>
  );
}
