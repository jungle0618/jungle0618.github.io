"use client";

import { useState } from "react";

const TEAM_LOGIN_OPTIONS = [
  { id: "1", label: "第 1 小隊" },
  { id: "2", label: "第 2 小隊" },
  { id: "3", label: "第 3 小隊" },
  { id: "4", label: "第 4 小隊" },
  { id: "5", label: "第 5 小隊" },
  { id: "6", label: "第 6 小隊" },
  { id: "7", label: "第 7 小隊" },
  { id: "8", label: "第 8 小隊" },
  { id: "9", label: "王叢林" },
  { id: "10", label: "李承翰" },
  { id: "11", label: "黃柏澄" },
  { id: "12", label: "任禾翔" },
];

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
              {TEAM_LOGIN_OPTIONS.map((team) => (
                <option key={team.id} value={team.id}>{team.label}</option>
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
