"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, MessageSquarePlus, MousePointer2, X } from "lucide-react";
import type { SerializedComment, SerializedPage } from "@/lib/serializers";

type ElementTarget = {
  selector: string;
  xpath: string;
  textSnippet: string;
  rect: Record<string, number>;
  viewport: Record<string, number>;
};

type Props = {
  page: SerializedPage;
  initialComments: SerializedComment[];
};

export function ShareClient({ page, initialComments }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [comments, setComments] = useState(initialComments);
  const [commentMode, setCommentMode] = useState(true);
  const [target, setTarget] = useState<ElementTarget | null>(null);
  const [authorName, setAuthorName] = useState(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem("html-share-author") ?? ""),
  );
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

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;

    setSaving(true);
    setError("");
    window.localStorage.setItem("html-share-author", authorName.trim());

    const response = await fetch(`/api/share/${page.slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorName, body, ...target }),
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
    syncFrame(nextComments);
  }

  return (
    <div className="review-shell">
      <aside className="review-sidebar">
        <div>
          <p className="eyebrow">Share Link</p>
          <h1>{page.title}</h1>
          <p className="muted">{openCount} 条待处理评论</p>
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
              <button className="icon-button" onClick={() => setTarget(null)} type="button">
                <X size={18} />
              </button>
            </div>
            <p className="target-snippet">{target.textSnippet || target.selector || "已选择元素"}</p>
            <label className="field">
              <span>昵称</span>
              <input value={authorName} onChange={(event) => setAuthorName(event.target.value)} />
            </label>
            <label className="field">
              <span>评论</span>
              <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} />
            </label>
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
          点击页面元素添加评论
        </div>
      ) : null}
    </div>
  );
}
