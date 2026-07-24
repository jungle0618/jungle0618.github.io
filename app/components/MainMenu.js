"use client";

export default function MainMenu({
  kicker = "IMOC 2026",
  title = "動物自走棋挑戰",
  subtitle,
  actions = [],
}) {
  return (
    <main className="main-menu-page">
      <section className="main-menu-card" aria-label="主頁面">
        <p className="main-menu-kicker">{kicker}</p>
        <h1 className="main-menu-title">{title}</h1>
        {subtitle ? <p className="main-menu-subtitle">{subtitle}</p> : null}
        <div className="main-menu-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`main-menu-button${action.primary ? " main-menu-button--primary" : ""}`}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
