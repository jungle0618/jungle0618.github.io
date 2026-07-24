"use client";

import { useState } from "react";

export default function ModeLogin({ role, onSubmit, onBack, error, busy }) {
  const isWorker = role === "worker";
  const [accountId, setAccountId] = useState(isWorker ? "worker" : "1");
  const [password, setPassword] = useState("");

  return (
    <main className="mode-login-page">
      <form
        className="mode-login-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ accountId, password });
        }}
      >
        <p className="main-menu-kicker">IMOC 2026</p>
        <h1>{isWorker ? "工人模式登入" : "多人模式登入"}</h1>
        <label>
          <span>{isWorker ? "工人帳號" : "小隊"}</span>
          {isWorker ? (
            <input value={accountId} onChange={(event) => setAccountId(event.target.value)} autoComplete="username" required disabled={busy} />
          ) : (
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={busy}>
              {Array.from({ length: 10 }, (_, index) => (
                <option key={index + 1} value={String(index + 1)}>第 {index + 1} 小隊</option>
              ))}
            </select>
          )}
        </label>
        <label>
          <span>密碼</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={busy} />
        </label>
        {error ? <p className="mode-error" role="alert">{error}</p> : null}
        <div className="mode-login-actions">
          <button type="button" className="main-menu-button" onClick={onBack} disabled={busy}>返回</button>
          <button type="submit" className={`main-menu-button main-menu-button--primary${busy ? " is-pending" : ""}`} disabled={busy}>
            {busy ? "登入中…" : "登入"}
          </button>
        </div>
      </form>
    </main>
  );
}
