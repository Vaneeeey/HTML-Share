"use client";

import { FormEvent, useState } from "react";
import { UserRound } from "lucide-react";

type Props = {
  buttonLabel?: string;
  description?: string;
  onSaved: (name: string) => void;
  title?: string;
};

export function IdentityForm({
  buttonLabel = "继续",
  description = "输入你的名字，后续评论会使用这个名字显示。",
  onSaved,
  title = "输入你的名字",
}: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; name?: string };

    setLoading(false);

    if (!response.ok || !data.name) {
      setError(data.error ?? "保存失败");
      return;
    }

    onSaved(data.name);
  }

  return (
    <form className="panel narrow-panel" onSubmit={submit}>
      <div>
        <p className="eyebrow">HTML Share</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      <label className="field">
        <span>名字</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：Fan"
        />
      </label>
      {error ? <p className="error-text">{error}</p> : null}
      <button className="primary-button" disabled={loading} type="submit">
        <UserRound size={18} />
        {loading ? "保存中" : buttonLabel}
      </button>
    </form>
  );
}
