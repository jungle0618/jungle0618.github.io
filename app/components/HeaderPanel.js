"use client";

export default function HeaderPanel({
  round,
  maxRound,
  totalScore = 0,
  title = "遊戲資訊",
  subtitle = "",
}) {
  return (
    <header className="header-card header-card--compact">
      <div className="header-summary" role="group" aria-label="遊戲狀態概要">
        <div className="header-summary-main">
          <span className="header-summary-label">{title}</span>
          <h1 className="header-compact-heading">第 {round}/{maxRound} 回合</h1>
          {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
        </div>
        <div className="header-score-card" title="目前累積分數">
          <span>總分</span>
          <strong>{totalScore.toLocaleString()}</strong>
        </div>
      </div>
    </header>
  );
}
