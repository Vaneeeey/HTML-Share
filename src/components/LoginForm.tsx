"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { IdentityForm } from "@/components/IdentityForm";

type Props = {
  initialIdentityStep?: boolean;
};

export function LoginForm({ initialIdentityStep = false }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [identityStep, setIdentityStep] = useState(initialIdentityStep);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      hasIdentity?: boolean;
    };

    if (!response.ok) {
      setError(data.error ?? "登录失败");
      return;
    }

    if (!data.hasIdentity) {
      setIdentityStep(true);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (identityStep) {
    return (
      <IdentityForm
        buttonLabel="进入工作台"
        description="管理员密码已通过。再输入你的名字，后续操作会使用这个身份。"
        onSaved={() => {
          router.push("/dashboard");
          router.refresh();
        }}
        title="设置你的名字"
      />
    );
  }

  return (
    <form className="panel narrow-panel" onSubmit={submit}>
      <div>
        <p className="eyebrow">HTML Share</p>
        <h1>管理端登录</h1>
        <p className="muted">输入共享管理员密码，上传页面并查看内部评论。</p>
      </div>
      <label className="field">
        <span>管理员密码</span>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="ADMIN_PASSWORD"
        />
      </label>
      {error ? <p className="error-text">{error}</p> : null}
      <button className="primary-button" disabled={loading} type="submit">
        <LogIn size={18} />
        {loading ? "登录中" : "进入工作台"}
      </button>
    </form>
  );
}
