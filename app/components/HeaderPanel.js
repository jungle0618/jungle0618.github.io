"use client";

export default function HeaderPanel({
  round,
  maxRound,
  totalScore = 0,
  title = "遊戲資訊",
  subtitle = "",
  desktopAsideTitle = "",
  desktopAsideItems = [],
}) {
  return (
    <header className="header-card header-card--compact">
      <div className="header-summary" role="group" aria-label="遊戲狀態概要">
        <div className="header-summary-main">
          <span className="header-summary-label">{title}</span>
          <h1 className="header-compact-heading">第 {round}/{maxRound} 回合</h1>
          {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
        </div>
        <div className="header-summary-side">
          {desktopAsideItems.length ? (
            <section className="header-effect-card" aria-label={desktopAsideTitle || "生效的特殊卡效果"}>
              <span className="header-effect-label">{desktopAsideTitle || "生效的特殊卡效果"}</span>
              <div className="header-effect-list">
                {desktopAsideItems.map((item, index) => (
                  <span key={`${item}-${index}`} className="header-effect-chip">{item}</span>
                ))}
              </div>
            </section>
          ) : null}
          <div className="header-score-card" title="目前累積分數">
            <span>總分</span>
            <strong>{totalScore.toLocaleString()}</strong>
          </div>
        </div>
      </div>
    </header>
  );
}
