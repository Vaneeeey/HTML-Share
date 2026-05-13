"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, LocateFixed, Trash2, Undo2 } from "lucide-react";
import type { SerializedComment, SerializedPage } from "@/lib/serializers";

type Props = {
  page: SerializedPage;
  initialComments: SerializedComment[];
};

export function PageReviewClient({ page, initialComments }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [comments, setComments] = useState(initialComments);
  const iframeSrc = `/uploads/${page.id}/${page.entryPath}`;
  const openCount = useMemo(
    () => comments.filter((comment) => comment.status !== "resolved").length,
    [comments],
  );

  const postToFrame = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ source: "html-share-parent", ...message }, "*");
  }, []);

  const syncFrame = useCallback(
    (nextComments = comments) => {
      postToFrame({ type: "set-mode", enabled: false });
      postToFrame({ type: "render-comments", comments: nextComments });
    },
    [comments, postToFrame],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const message = event.data || {};
      if (message.source !== "html-share-bridge") return;
      if (message.type === "ready" || message.type === "request-comments") syncFrame();
      if (message.type === "pin-click") {
        const comment = comments.find((item) => item.id === message.id);
        if (comment) postToFrame({ type: "locate", comment });
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [comments, postToFrame, syncFrame]);

  useEffect(() => syncFrame(), [comments, syncFrame]);

  async function setStatus(comment: SerializedComment, status: "open" | "resolved") {
    const response = await fetch(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = (await response.json().catch(() => ({}))) as { comment?: SerializedComment };
    if (response.ok && data.comment) {
      setComments((current) => current.map((item) => (item.id === comment.id ? data.comment! : item)));
    }
  }

  async function removeComment(comment: SerializedComment) {
    const confirmed = window.confirm("删除这条评论？");
    if (!confirmed) return;

    const response = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
    if (response.ok) {
      setComments((current) => current.filter((item) => item.id !== comment.id));
    }
  }

  return (
    <div className="review-shell admin-review">
      <aside className="review-sidebar">
        <Link className="secondary-button fit" href="/dashboard">
          <ArrowLeft size={16} />
          返回工作台
        </Link>
        <div>
          <p className="eyebrow">Review Queue</p>
          <h1>{page.title}</h1>
          <p className="muted">{openCount} 条待处理 · {comments.length} 条全部评论</p>
        </div>
        <Link className="primary-button" href={`/s/${page.slug}`} target="_blank">
          <ExternalLink size={16} />
          打开分享页
        </Link>

        <div className="comment-list">
          {comments.length === 0 ? (
            <div className="empty-state compact-empty">暂无评论</div>
          ) : (
            comments.map((comment, index) => (
              <article className="comment-card" key={comment.id}>
                <button
                  className="comment-jump"
                  onClick={() => postToFrame({ type: "locate", comment })}
                  type="button"
                >
                  <span className={comment.status === "resolved" ? "pin muted-pin" : "pin"}>{index + 1}</span>
                  <span>
                    <strong>{comment.authorName}</strong>
                    <small>{new Date(comment.createdAt).toLocaleString()}</small>
                  </span>
                  <LocateFixed size={16} />
                </button>
                <p>{comment.body}</p>
                {comment.textSnippet ? <em>{comment.textSnippet}</em> : null}
                <div className="comment-actions">
                  {comment.status === "resolved" ? (
                    <button className="secondary-button" onClick={() => setStatus(comment, "open")} type="button">
                      <Undo2 size={15} />
                      重开
                    </button>
                  ) : (
                    <button className="secondary-button" onClick={() => setStatus(comment, "resolved")} type="button">
                      <CheckCircle2 size={15} />
                      已处理
                    </button>
                  )}
                  <button className="icon-button danger" onClick={() => removeComment(comment)} type="button">
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))
          )}
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
    </div>
  );
}
