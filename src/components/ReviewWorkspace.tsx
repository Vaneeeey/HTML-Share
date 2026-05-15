"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSSProperties, FormEvent, PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileUp,
  MessageCircle,
  MousePointer2,
  PanelRight,
  Send,
  Settings,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { IdentityForm } from "@/components/IdentityForm";
import type { SerializedComment, SerializedPage, SerializedReply } from "@/lib/serializers";

type ElementTarget = {
  selector: string;
  xpath: string;
  textSnippet: string;
  rect: Record<string, number>;
  clickAnchor?: Record<string, number>;
  viewport: Record<string, number>;
  targetMeta?: Record<string, unknown>;
};

type Anchor = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type Mode = "comment" | "interact";
type TourStep = "comment" | "interact" | null;

const REVIEW_TOOLBAR_TOUR_KEY = "html_share_review_toolbar_tour_20260515";

type LocateHint = {
  title?: string;
  lines?: string[];
  interactionPath?: string[];
  stableAncestor?: Record<string, unknown> | null;
};

type Props = {
  identityName: string;
  initialComments: SerializedComment[];
  initialMode?: Mode;
  isAdmin?: boolean;
  page: SerializedPage;
};

function firstChar(value: string) {
  return Array.from(value.trim())[0] ?? "?";
}

function relativeTime(value: string) {
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} min. ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr. ago`;
  return `${Math.floor(hours / 24)} d. ago`;
}

function commentCountLabel(comments: SerializedComment[]) {
  return comments.reduce((total, comment) => total + 1 + comment.replies.length, 0);
}

function pageVersion(value?: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 1;
}

function versionLabel(value?: number) {
  return `第${pageVersion(value)}版`;
}

export function ReviewWorkspace({
  identityName,
  initialComments,
  initialMode = "comment",
  isAdmin = false,
  page,
}: Props) {
  const router = useRouter();
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  const updateInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const ignoreCanvasClickUntilRef = useRef(0);
  const [comments, setComments] = useState(initialComments);
  const [uploadedPage, setUploadedPage] = useState<SerializedPage | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [target, setTarget] = useState<ElementTarget | null>(null);
  const [targetAnchor, setTargetAnchor] = useState<Anchor | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftError, setDraftError] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<Anchor | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<Anchor | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [locateNotice, setLocateNotice] = useState("");
  const [locateHint, setLocateHint] = useState<LocateHint | null>(null);
  const [accessPassword, setAccessPassword] = useState("");
  const [uploadingPageFile, setUploadingPageFile] = useState<"reupload" | "update" | null>(null);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [stageSize, setStageSize] = useState({ height: 1, width: 1 });
  const [tourStep, setTourStep] = useState<TourStep>(null);

  const pageState = uploadedPage ?? page;
  const currentVersion = pageVersion(pageState.currentVersion);
  const iframeSrc = `/uploads/${pageState.id}/${pageState.entryPath}?v=${currentVersion}-${encodeURIComponent(pageState.updatedAt)}`;
  const activeComment = comments.find((comment) => comment.id === activeCommentId) ?? null;
  const hoveredComment = comments.find((comment) => comment.id === hoveredCommentId) ?? null;
  const totalComments = commentCountLabel(comments);
  const currentVersionComments = useCallback(
    (items: SerializedComment[]) => items.filter((comment) => pageVersion(comment.pageVersion) === currentVersion),
    [currentVersion],
  );

  const postToFrame = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ source: "html-share-parent", ...message }, "*");
  }, []);

  const syncFrame = useCallback(
    (nextComments = comments, nextMode = mode) => {
      postToFrame({ type: "set-mode", enabled: nextMode === "comment" });
      postToFrame({ type: "render-comments", comments: currentVersionComments(nextComments) });
    },
    [comments, currentVersionComments, mode, postToFrame],
  );

  const closeActiveComment = useCallback(
    (clearFrameSelection = true) => {
      setActiveCommentId(null);
      setActiveAnchor(null);
      setEditingCommentId(null);
      setEditingReplyId(null);
      setEditBody("");
      setReplyError("");
      setLocateNotice("");
      setLocateHint(null);
      if (clearFrameSelection) postToFrame({ type: "clear-selection" });
    },
    [postToFrame],
  );

  const frameAnchorToStage = useCallback((anchor: Record<string, unknown>): Anchor | null => {
    const iframe = iframeRef.current;
    const stage = stageRef.current;
    if (!iframe || !stage) return null;
    const iframeRect = iframe.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    return {
      height: Number(anchor.height ?? 0),
      width: Number(anchor.width ?? 0),
      x: iframeRect.left - stageRect.left + Number(anchor.x ?? 0),
      y: iframeRect.top - stageRect.top + Number(anchor.y ?? 0),
    };
  }, []);

  const floatingStyle = useCallback((anchor: Anchor | null, preferredWidth = 430): CSSProperties => {
    if (!anchor) return { display: "none" };
    const margin = 14;
    const stageWidth = stageSize.width;
    const stageHeight = stageSize.height;
    let left = anchor.x + anchor.width + margin;
    if (left + preferredWidth > stageWidth - margin) {
      left = Math.max(margin, anchor.x - preferredWidth - margin);
    }
    const top = Math.min(Math.max(margin, anchor.y), Math.max(margin, stageHeight - 260));
    return { left, top, width: Math.min(preferredWidth, stageWidth - margin * 2) };
  }, [stageSize]);

  const detailStyle = useCallback((anchor: Anchor | null): CSSProperties => {
    if (anchor) return floatingStyle(anchor, 520);
    const margin = 16;
    return {
      right: margin,
      top: 72,
      width: Math.min(520, Math.max(320, stageSize.width - margin * 2)),
    };
  }, [floatingStyle, stageSize.width]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function measure() {
      setStageSize({ height: stage?.clientHeight || 1, width: stage?.clientWidth || 1 });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isAdmin) return;

    const startTour = () => setTourStep("interact");
    try {
      if (window.localStorage.getItem(REVIEW_TOOLBAR_TOUR_KEY) === "done") return;
      const timer = window.setTimeout(startTour, 450);
      return () => window.clearTimeout(timer);
    } catch {
      startTour();
    }
  }, [isAdmin]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const message = event.data || {};
      if (message.source !== "html-share-bridge") return;
      if (message.type === "ready" || message.type === "request-comments") syncFrame();
      if (message.type === "element-click") {
        const payload = message.payload as ElementTarget;
        setTarget(payload);
        setTargetAnchor(frameAnchorToStage(payload.clickAnchor ?? payload.rect));
        setDraftError("");
      }
      if (message.type === "marker-hover") {
        setHoveredCommentId(String(message.id));
        setHoverAnchor(frameAnchorToStage(message.anchor ?? {}));
      }
      if (message.type === "marker-leave") {
        setHoveredCommentId((current) => (current === message.id ? null : current));
      }
      if (message.type === "marker-click" || message.type === "pin-click") {
        const id = String(message.id);
        const comment = comments.find((item) => item.id === id);
        ignoreCanvasClickUntilRef.current = Date.now() + 400;
        setLocateNotice("");
        setLocateHint(null);
        setActiveCommentId(id);
        setActiveAnchor(frameAnchorToStage(message.anchor ?? {}) ?? hoverAnchor);
        if (comment) postToFrame({ type: "locate", comment, reason: "user-open", openDetail: true, replay: false });
      }
      if (message.type === "comment-located") {
        const id = String(message.id);
        const nextAnchor = frameAnchorToStage(message.anchor ?? {}) ?? null;
        if (message.openDetail) setActiveCommentId(id);
        setActiveAnchor((current) => (activeCommentId === id || message.openDetail ? nextAnchor : current));
        setLocateNotice("");
        setLocateHint(null);
      }
      if (message.type === "comment-missing") {
        const id = String(message.id);
        if (message.openDetail) setActiveCommentId(id);
        setActiveAnchor(null);
        setLocateHint((message.hint ?? null) as LocateHint | null);
        setLocateNotice("当前页面状态里还没有这个批注元素。请先在页面中打开对应弹窗或完成当时的交互，元素出现后会自动定位。");
      }
      if (message.type === "canvas-click") {
        if (Date.now() < ignoreCanvasClickUntilRef.current) return;
        closeActiveComment(false);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [activeCommentId, closeActiveComment, comments, frameAnchorToStage, hoverAnchor, postToFrame, syncFrame]);

  useEffect(() => syncFrame(), [comments, mode, syncFrame]);

  function updateComment(nextComment: SerializedComment) {
    setComments((current) => {
      const next = current.map((comment) => (comment.id === nextComment.id ? nextComment : comment));
      syncFrame(next);
      return next;
    });
  }

  function removeCommentLocally(id: string) {
    setComments((current) => {
      const next = current.filter((comment) => comment.id !== id);
      syncFrame(next);
      return next;
    });
    if (activeCommentId === id) closeActiveComment();
  }

  async function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    setSavingDraft(true);
    setDraftError("");

    const response = await fetch(`/api/share/${page.slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draftBody, ...target }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      comment?: SerializedComment;
      error?: string;
    };

    setSavingDraft(false);

    if (!response.ok || !data.comment) {
      setDraftError(data.error ?? "评论保存失败");
      return;
    }

    const next = [...comments, data.comment];
    setComments(next);
    setTarget(null);
    setTargetAnchor(null);
    setDraftBody("");
    setLocateNotice("");
    setLocateHint(null);
    postToFrame({ type: "clear-selection" });
    syncFrame(next);
  }

  async function editComment(comment: SerializedComment) {
    const response = await fetch(`/api/share/${page.slug}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editBody }),
    });
    const data = (await response.json().catch(() => ({}))) as { comment?: SerializedComment };
    if (response.ok && data.comment) {
      updateComment(data.comment);
      setEditingCommentId(null);
      setEditBody("");
    }
  }

  async function deleteComment(comment: SerializedComment) {
    const confirmed = window.confirm("删除这条评论及其回复？");
    if (!confirmed) return;
    const response = await fetch(`/api/share/${page.slug}/comments/${comment.id}`, { method: "DELETE" });
    if (response.ok) removeCommentLocally(comment.id);
  }

  async function setStatus(comment: SerializedComment, status: "open" | "resolved") {
    const response = await fetch(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = (await response.json().catch(() => ({}))) as { comment?: SerializedComment };
    if (response.ok && data.comment) updateComment(data.comment);
  }

  async function submitReply(event: FormEvent<HTMLFormElement>, comment: SerializedComment) {
    event.preventDefault();
    setReplyError("");
    const response = await fetch(`/api/share/${page.slug}/comments/${comment.id}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: replyBody }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; reply?: SerializedReply };
    if (!response.ok || !data.reply) {
      setReplyError(data.error ?? "回复失败");
      return;
    }
    updateComment({ ...comment, replies: [...comment.replies, data.reply] });
    setReplyBody("");
  }

  async function editReply(comment: SerializedComment, reply: SerializedReply) {
    const response = await fetch(`/api/share/${page.slug}/replies/${reply.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editBody }),
    });
    const data = (await response.json().catch(() => ({}))) as { reply?: SerializedReply };
    if (response.ok && data.reply) {
      updateComment({
        ...comment,
        replies: comment.replies.map((item) => (item.id === reply.id ? data.reply! : item)),
      });
      setEditingReplyId(null);
      setEditBody("");
    }
  }

  async function deleteReply(comment: SerializedComment, reply: SerializedReply) {
    const response = await fetch(`/api/share/${page.slug}/replies/${reply.id}`, { method: "DELETE" });
    if (response.ok) {
      updateComment({ ...comment, replies: comment.replies.filter((item) => item.id !== reply.id) });
    }
  }

  async function updateAccessPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsError("");
    setSettingsNotice("");
    const response = await fetch(`/api/pages/${pageState.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessPassword }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setSettingsError(data.error ?? "访问密码更新失败");
      return;
    }
    setAccessPassword("");
    setSettingsNotice("访问密码已更新，旧访问授权已失效。");
  }

  async function uploadPageFile(event: FormEvent<HTMLFormElement>, mode: "reupload" | "update") {
    event.preventDefault();
    const input = mode === "reupload" ? reuploadInputRef.current : updateInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setSettingsError("请选择要上传的 HTML 或 ZIP 文件。");
      return;
    }

    setUploadingPageFile(mode);
    setSettingsError("");
    setSettingsNotice("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);

    const response = await fetch(`/api/pages/${pageState.id}/upload`, {
      method: "POST",
      body: formData,
    });
    const data = (await response.json().catch(() => ({}))) as {
      comments?: SerializedComment[];
      error?: string;
      page?: SerializedPage;
    };

    setUploadingPageFile(null);

    if (!response.ok || !data.page || !data.comments) {
      setSettingsError(data.error ?? "文件上传失败");
      return;
    }

    setUploadedPage(data.page);
    setComments(data.comments);
    setTarget(null);
    setTargetAnchor(null);
    closeActiveComment();
    if (input) input.value = "";
    setSettingsNotice(
      mode === "update"
        ? `HTML 已更新为${versionLabel(data.page.currentVersion)}，旧版本评论图标已从页面隐藏。`
        : "HTML 已重新上传，当前版本号保持不变。",
    );
    router.refresh();
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    if (nextMode === "interact") {
      setTarget(null);
      setTargetAnchor(null);
      postToFrame({ type: "clear-selection" });
    }
  }

  function advanceTour() {
    if (tourStep === "interact") {
      setTourStep("comment");
      return;
    }

    setTourStep(null);
    try {
      window.localStorage.setItem(REVIEW_TOOLBAR_TOUR_KEY, "done");
    } catch {
      // Ignore storage failures; the tour is non-critical UI guidance.
    }
  }

  function closeFloatingSurfaces(event: PointerEvent<HTMLElement>) {
    const targetElement = event.target instanceof Element ? event.target : null;
    if (
      targetElement?.closest(
        ".comment-detail-card, .comment-preview-card, .quick-composer, .comment-drawer, .settings-modal",
      )
    ) {
      return;
    }
    if (activeComment) closeActiveComment();
  }

  const preview = hoveredComment && !activeComment ? hoveredComment : null;

  return (
    <div className="review-workspace">
      <header className="review-topbar">
        <div className="review-topbar-left">
          {isAdmin ? (
            <Link className="icon-button" href="/dashboard" title="返回工作台">
              <ArrowLeft size={18} />
            </Link>
          ) : null}
          <div>
            <p className="eyebrow">{isAdmin ? "Review Queue" : "Share Link"}</p>
            <h1>
              {pageState.title}
              {currentVersion > 1 ? <span className="version-pill">{versionLabel(currentVersion)}</span> : null}
            </h1>
          </div>
        </div>
        <div className="review-topbar-actions">
          <button className="identity-chip" onClick={() => setIdentityOpen(true)} title="修改名字" type="button">
            当前身份：{identityName}
          </button>
          <button className="secondary-button" onClick={() => setDrawerOpen((current) => !current)} type="button">
            <PanelRight size={17} />
            全部评论（{totalComments}）
          </button>
          {isAdmin ? (
            <>
              <button className="icon-button" onClick={() => setSettingsOpen(true)} title="设置" type="button">
                <Settings size={18} />
              </button>
              <Link className="icon-button" href={`/s/${pageState.slug}`} target="_blank" title="打开分享页">
                <ExternalLink size={18} />
              </Link>
            </>
          ) : null}
        </div>
      </header>

      <main className="review-stage" onPointerDown={closeFloatingSurfaces} ref={stageRef}>
        <iframe ref={iframeRef} sandbox="allow-scripts allow-forms allow-popups" src={iframeSrc} title={pageState.title} />

        {locateNotice ? (
          <div className="stage-toast" role="status">
            {locateNotice}
          </div>
        ) : null}

        {target ? (
          <form className="quick-composer" onSubmit={submitDraft} style={floatingStyle(targetAnchor, 500)}>
            <span className="comment-glyph" />
            <input
              autoFocus
              onChange={(event) => setDraftBody(event.target.value)}
              placeholder="Add a comment"
              value={draftBody}
            />
            <button className="send-button" disabled={savingDraft} type="submit">
              <Send size={18} />
            </button>
            <button
              className="quick-close"
              onClick={() => {
                setTarget(null);
                setTargetAnchor(null);
                postToFrame({ type: "clear-selection" });
              }}
              type="button"
            >
              <X size={16} />
            </button>
            {draftError ? <p className="error-text">{draftError}</p> : null}
          </form>
        ) : null}

        {preview ? (
          <button
            className="comment-preview-card"
            onClick={() => {
              setActiveCommentId(preview.id);
              setActiveAnchor(hoverAnchor);
            }}
            style={floatingStyle(hoverAnchor, 360)}
            type="button"
          >
            <span className="avatar-dot">{firstChar(preview.authorName)}</span>
            <span>
              <strong>{preview.authorName}</strong> <small>{relativeTime(preview.createdAt)}</small>
              <em>{preview.body}</em>
            </span>
          </button>
        ) : null}

        {activeComment ? (
          <CommentDetail
            comment={activeComment}
            editBody={editBody}
            editingCommentId={editingCommentId}
            editingReplyId={editingReplyId}
            isAdmin={isAdmin}
            onClose={() => closeActiveComment()}
            onDeleteComment={deleteComment}
            onDeleteReply={deleteReply}
            onEditBodyChange={setEditBody}
            onEditComment={editComment}
            onEditReply={editReply}
            onReply={submitReply}
            onReplyBodyChange={setReplyBody}
            onSetEditComment={(comment) => {
              setEditingCommentId(comment.id);
              setEditingReplyId(null);
              setEditBody(comment.body);
            }}
            onSetEditReply={(reply) => {
              setEditingReplyId(reply.id);
              setEditingCommentId(null);
              setEditBody(reply.body);
            }}
            onSetStatus={setStatus}
            locateHint={locateHint}
            locateNotice={locateNotice}
            replyBody={replyBody}
            replyError={replyError}
            style={detailStyle(activeAnchor)}
          />
        ) : null}
      </main>

      {!isAdmin ? (
        <nav className="mode-toolbar" aria-label="模式切换">
          <button className={mode === "interact" ? "active" : ""} onClick={() => changeMode("interact")} type="button">
            <MousePointer2 size={19} />
            交互模式
          </button>
          <button className={mode === "comment" ? "active" : ""} onClick={() => changeMode("comment")} type="button">
            <MessageCircle size={19} />
            评论模式
          </button>
          {tourStep ? <ToolbarTour step={tourStep} onNext={advanceTour} /> : null}
        </nav>
      ) : null}

      {drawerOpen ? (
        <CommentDrawer
          comments={comments}
          currentVersion={currentVersion}
          onClose={() => setDrawerOpen(false)}
          onSelect={(comment) => {
            setTarget(null);
            setTargetAnchor(null);
            setActiveCommentId(comment.id);
            setActiveAnchor(null);
            setLocateHint(null);
            if (pageVersion(comment.pageVersion) !== currentVersion) {
              postToFrame({ type: "clear-selection" });
              setLocateNotice(
                `这条评论属于${versionLabel(comment.pageVersion)}，当前 HTML 是${versionLabel(currentVersion)}，旧版本评论不会在当前页面显示图标。`,
              );
              return;
            }
            setLocateNotice("正在定位批注。如果它属于弹窗、菜单或交互后才出现的内容，请先在页面里打开对应状态。");
            postToFrame({ type: "locate", comment, reason: "user-open", openDetail: true });
          }}
        />
      ) : null}

      {settingsOpen ? (
        <div className="modal-backdrop">
          <div className="settings-modal">
            <div className="composer-head">
              <div>
                <p className="eyebrow">Page Settings</p>
                <h2>页面设置</h2>
              </div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} type="button">
                <X size={18} />
              </button>
            </div>

            <form className="settings-section" onSubmit={updateAccessPassword}>
              <h3>访问密码</h3>
              <label className="field">
                <span>新访问密码</span>
                <input
                  minLength={4}
                  onChange={(event) => setAccessPassword(event.target.value)}
                  placeholder="至少 4 位"
                  required
                  type="password"
                  value={accessPassword}
                />
              </label>
              <button className="primary-button" type="submit">保存设置</button>
            </form>

            <form className="settings-section" onSubmit={(event) => uploadPageFile(event, "reupload")}>
              <h3>重新上传当前 HTML</h3>
              <p className="muted">用于恢复或修补服务器上的当前文件，不新增版本，当前评论图标保持显示。</p>
              <label className="field">
                <span>选择 .html / .htm / .zip</span>
                <input ref={reuploadInputRef} accept=".html,.htm,.zip" type="file" />
              </label>
              <button className="secondary-button" disabled={uploadingPageFile === "reupload"} type="submit">
                <FileUp size={16} />
                {uploadingPageFile === "reupload" ? "上传中" : "重新上传"}
              </button>
            </form>

            <form className="settings-section" onSubmit={(event) => uploadPageFile(event, "update")}>
              <h3>更新为新版 HTML</h3>
              <p className="muted">
                上传后变为{versionLabel(currentVersion + 1)}。旧版本评论仍保留在列表中，但不会在新版页面上显示图标。
              </p>
              <label className="field">
                <span>选择 .html / .htm / .zip</span>
                <input ref={updateInputRef} accept=".html,.htm,.zip" type="file" />
              </label>
              <button className="primary-button" disabled={uploadingPageFile === "update"} type="submit">
                <FileUp size={16} />
                {uploadingPageFile === "update" ? "更新中" : `更新为${versionLabel(currentVersion + 1)}`}
              </button>
            </form>

            {settingsError ? <p className="error-text">{settingsError}</p> : null}
            {settingsNotice ? <p className="success-text">{settingsNotice}</p> : null}
          </div>
        </div>
      ) : null}

      {identityOpen ? (
        <div className="modal-backdrop">
          <div className="identity-modal">
            <IdentityForm
              buttonLabel="保存名字"
              description="修改后只影响之后的新评论；历史评论作者名不会改变。"
              initialName={identityName}
              onSaved={() => {
                setIdentityOpen(false);
                router.refresh();
              }}
              title="修改你的名字"
            />
            <button className="text-button modal-cancel" onClick={() => setIdentityOpen(false)} type="button">
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolbarTour({ onNext, step }: { onNext: () => void; step: Exclude<TourStep, null> }) {
  const isCommentStep = step === "comment";

  return (
    <section className={`toolbar-tour ${isCommentStep ? "comment-step" : "interact-step"}`} role="status">
      <strong>{isCommentStep ? "评论模式" : "交互模式"}</strong>
      <p>
        {isCommentStep
          ? "切到评论模式后，移动到页面元素会出现蓝色高亮，点击任意位置即可添加批注。"
          : "交互模式下可以正常点击、滚动和使用页面，不会误触发新增评论。"}
      </p>
      <button className="text-button" onClick={onNext} type="button">
        {isCommentStep ? "知道了" : "下一步"}
      </button>
    </section>
  );
}

function CommentDrawer({
  comments,
  currentVersion,
  onClose,
  onSelect,
}: {
  comments: SerializedComment[];
  currentVersion: number;
  onClose: () => void;
  onSelect: (comment: SerializedComment) => void;
}) {
  return (
    <aside className="comment-drawer">
      <div className="composer-head">
        <h2>全部评论</h2>
        <button className="icon-button" onClick={onClose} type="button">
          <X size={18} />
        </button>
      </div>
      <div className="drawer-list">
        {comments.length === 0 ? (
          <div className="empty-state compact-empty">暂无评论</div>
        ) : (
          comments.map((comment) => (
            <button className="drawer-comment" key={comment.id} onClick={() => onSelect(comment)} type="button">
              <span className="avatar-dot">{firstChar(comment.authorName)}</span>
              <span>
                <strong>{comment.authorName}</strong>
                <small>
                  {versionLabel(comment.pageVersion)} · {comment.status === "resolved" ? "已处理" : "待处理"} ·{" "}
                  {comment.replies.length} 条回复
                  {pageVersion(comment.pageVersion) !== currentVersion ? " · 旧版本" : ""}
                </small>
                <em>{comment.body}</em>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function CommentDetail({
  comment,
  editBody,
  editingCommentId,
  editingReplyId,
  isAdmin,
  onClose,
  onDeleteComment,
  onDeleteReply,
  onEditBodyChange,
  onEditComment,
  onEditReply,
  onReply,
  onReplyBodyChange,
  onSetEditComment,
  onSetEditReply,
  onSetStatus,
  locateHint,
  locateNotice,
  replyBody,
  replyError,
  style,
}: {
  comment: SerializedComment;
  editBody: string;
  editingCommentId: string | null;
  editingReplyId: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onDeleteComment: (comment: SerializedComment) => void;
  onDeleteReply: (comment: SerializedComment, reply: SerializedReply) => void;
  onEditBodyChange: (body: string) => void;
  onEditComment: (comment: SerializedComment) => void;
  onEditReply: (comment: SerializedComment, reply: SerializedReply) => void;
  onReply: (event: FormEvent<HTMLFormElement>, comment: SerializedComment) => void;
  onReplyBodyChange: (body: string) => void;
  onSetEditComment: (comment: SerializedComment) => void;
  onSetEditReply: (reply: SerializedReply) => void;
  onSetStatus: (comment: SerializedComment, status: "open" | "resolved") => void;
  locateHint: LocateHint | null;
  locateNotice: string;
  replyBody: string;
  replyError: string;
  style: CSSProperties;
}) {
  return (
    <article className="comment-detail-card" style={style}>
      <header>
        <strong>Comment</strong>
        <span />
        {isAdmin ? (
          <button
            className="icon-button slim"
            onClick={() => onSetStatus(comment, comment.status === "resolved" ? "open" : "resolved")}
            title={comment.status === "resolved" ? "重开评论" : "标记已处理"}
            type="button"
          >
            {comment.status === "resolved" ? <Undo2 size={17} /> : <CheckCircle2 size={17} />}
          </button>
        ) : null}
        <button className="icon-button slim" onClick={onClose} type="button">
          <X size={17} />
        </button>
      </header>

      <section className="detail-body">
        <span className="avatar-dot">{firstChar(comment.authorName)}</span>
        <div>
          <div className="detail-meta">
            <strong>{comment.authorName}</strong>
            <small>
              {relativeTime(comment.createdAt)} · {versionLabel(comment.pageVersion)}
            </small>
            {comment.canDelete ? (
              <button className="menu-button" onClick={() => onDeleteComment(comment)} title="删除评论" type="button">
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
          {editingCommentId === comment.id ? (
            <form
              className="edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                onEditComment(comment);
              }}
            >
              <textarea value={editBody} onChange={(event) => onEditBodyChange(event.target.value)} rows={3} />
              <button className="secondary-button compact" type="submit">保存</button>
            </form>
          ) : (
            <button
              className={comment.canEdit ? "editable-text" : "plain-text"}
              onClick={() => comment.canEdit && onSetEditComment(comment)}
              type="button"
            >
              {comment.body}
            </button>
          )}
        </div>
      </section>

      {locateNotice || locateHint ? (
        <section className="locate-hint">
          {locateNotice ? <p>{locateNotice}</p> : null}
          {locateHint?.interactionPath?.length ? (
            <div>
              <strong>打开路径</strong>
              <ol>
                {locateHint.interactionPath.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {locateHint?.lines?.length ? (
            <div>
              <strong>目标层级</strong>
              <ol>
                {locateHint.lines.slice(0, 8).map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="reply-list">
        {comment.replies.map((reply) => (
          <section className="detail-body reply-row" key={reply.id}>
            <span className="avatar-dot small">{firstChar(reply.authorName)}</span>
            <div>
              <div className="detail-meta">
                <strong>{reply.authorName}</strong>
                <small>{relativeTime(reply.createdAt)}</small>
                {reply.canDelete ? (
                  <button className="menu-button" onClick={() => onDeleteReply(comment, reply)} type="button">
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
              {editingReplyId === reply.id ? (
                <form
                  className="edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onEditReply(comment, reply);
                  }}
                >
                  <textarea value={editBody} onChange={(event) => onEditBodyChange(event.target.value)} rows={2} />
                  <button className="secondary-button compact" type="submit">保存</button>
                </form>
              ) : (
                <button
                  className={reply.canEdit ? "editable-text" : "plain-text"}
                  onClick={() => reply.canEdit && onSetEditReply(reply)}
                  type="button"
                >
                  {reply.body}
                </button>
              )}
            </div>
          </section>
        ))}
      </div>

      <form className="reply-form" onSubmit={(event) => onReply(event, comment)}>
        <span className="avatar-dot small">+</span>
        <input onChange={(event) => onReplyBodyChange(event.target.value)} placeholder="Reply" value={replyBody} />
        <button className="send-button" type="submit">
          <Send size={17} />
        </button>
      </form>
      {replyError ? <p className="error-text">{replyError}</p> : null}
    </article>
  );
}
