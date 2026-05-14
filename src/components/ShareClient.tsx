"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { IdentityForm } from "@/components/IdentityForm";
import { ReviewWorkspace } from "@/components/ReviewWorkspace";
import type { SerializedComment, SerializedPage } from "@/lib/serializers";

type Props = {
  accessGranted: boolean;
  identityId: string | null;
  identityName: string | null;
  page: SerializedPage;
  initialComments: SerializedComment[];
};

export function ShareClient({ accessGranted, identityName, page, initialComments }: Props) {
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessError, setAccessError] = useState("");
  const [checkingAccess, setCheckingAccess] = useState(false);

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
    <ReviewWorkspace
      identityName={identityName}
      initialComments={initialComments}
      initialMode="interact"
      page={page}
    />
  );
}
