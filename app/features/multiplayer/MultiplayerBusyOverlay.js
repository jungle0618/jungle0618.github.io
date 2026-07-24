"use client";

export default function MultiplayerBusyOverlay({ active, label = "正在讀取資料…" }) {
  if (!active) return null;
  return (
    <div className="multiplayer-busy-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="multiplayer-busy-indicator">
        <span className="multiplayer-busy-spinner" aria-hidden="true" />
        <strong>{label}</strong>
      </div>
    </div>
  );
}
