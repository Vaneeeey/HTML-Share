"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
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

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "登录失败");
      return;
    }

    router.push("/dashboard");
    router.refresh();
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
