"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileArchive, FileUp, RefreshCw, Trash2 } from "lucide-react";
import { IdentityForm } from "@/components/IdentityForm";
import type { SerializedPage } from "@/lib/serializers";

type Props = {
  identityName: string;
  initialPages: SerializedPage[];
};

export function DashboardClient({ identityName, initialPages }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState(initialPages);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const pageCountLabel = useMemo(() => `${pages.length} 个分享页面`, [pages.length]);

  async function refreshPages() {
    const response = await fetch("/api/pages");
    if (!response.ok) return;
    const data = (await response.json()) as { pages: SerializedPage[] };
    setPages(data.pages);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setNotice("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("accessPassword", accessPassword);

    const response = await fetch("/api/pages/upload", { method: "POST", body: formData });
    const data = (await response.json().catch(() => ({}))) as {
      page?: SerializedPage;
      error?: string;
    };

    setUploading(false);

    if (!response.ok || !data.page) {
      setError(data.error ?? "上传失败");
      return;
    }

    setPages((current) => [data.page!, ...current]);
    setNotice(`已生成分享链接：/s/${data.page.slug}`);
    setAccessPassword("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function removePage(page: SerializedPage) {
    const confirmed = window.confirm(`删除「${page.title}」及其评论？`);
    if (!confirmed) return;

    const response = await fetch(`/api/pages/${page.id}`, { method: "DELETE" });
    if (response.ok) {
      setPages((current) => current.filter((item) => item.id !== page.id));
    }
  }

  return (
    <div className="workbench">
      <section className="dashboard-head">
        <div>
          <p className="eyebrow">Internal Review Links</p>
          <h1>HTML 评论工作台</h1>
          <p className="muted">
            当前身份：{identityName}。上传页面并生成带访问密码的内部评论链接。{" "}
            <button className="inline-text-button" onClick={() => setIdentityOpen(true)} type="button">
              修改名字
            </button>
          </p>
        </div>
        <button className="icon-button" onClick={refreshPages} title="刷新列表" type="button">
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="panel upload-panel">
        <form onSubmit={upload}>
          <label className="file-drop">
            <FileUp size={22} />
            <span>选择 .html / .htm / .zip 文件</span>
            <input ref={inputRef} accept=".html,.htm,.zip" name="file" type="file" />
          </label>
          <label className="field upload-password-field">
            <span>分享访问密码</span>
            <input
              minLength={4}
              onChange={(event) => setAccessPassword(event.target.value)}
              placeholder="至少 4 位，分享给评论者"
              required
              type="password"
              value={accessPassword}
            />
          </label>
          <button className="primary-button" disabled={uploading} type="submit">
            <FileArchive size={18} />
            {uploading ? "上传中" : "上传并生成链接"}
          </button>
        </form>
        {notice ? <p className="success-text">{notice}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="list-section">
        <div className="section-bar">
          <h2>{pageCountLabel}</h2>
          <span>SQLite + 本地上传目录</span>
        </div>

        <div className="page-list">
          {pages.length === 0 ? (
            <div className="empty-state">还没有页面。上传一个 HTML 文件开始。</div>
          ) : (
            pages.map((page) => (
              <article className="page-row" key={page.id}>
                <div>
                  <p className="page-title">{page.title}</p>
                  <p className="muted">
                    {page.originalName} · {page.uploadType.toUpperCase()} · 第{page.currentVersion}版 ·{" "}
                    {page.commentCount} 条评论 ·{" "}
                    {page.hasAccessPassword ? "已设置访问密码" : "未设置访问密码"}
                  </p>
                </div>
                <div className="row-actions">
                  <Link className="secondary-button" href={`/s/${page.slug}`} target="_blank">
                    <ExternalLink size={16} />
                    分享页
                  </Link>
                  <Link className="primary-button compact" href={`/dashboard/pages/${page.id}`}>
                    查看评论
                  </Link>
                  <button
                    className="icon-button danger"
                    onClick={() => removePage(page)}
                    title="删除页面"
                    type="button"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

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
