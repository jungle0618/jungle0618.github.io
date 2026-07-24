"use client";

import { useEffect, useState } from "react";
import BattleSection from "./BattleSection";
import CollectionSection from "./CollectionSection";
import EncounterPanel from "./EncounterPanel";
import GameCard from "./GameCard";
import GameTutorialLauncher from "./GameTutorialLauncher";
import HeaderPanel from "./HeaderPanel";
import PetCompendiumLauncher from "./PetCompendiumLauncher";
import TeamSection from "./TeamSection";

/**
 * 單人與多人共用的遊戲工作區。此元件只負責呈現，不擁有抽卡、登入、
 * 回合推進或正式結算規則；各模式控制器只需提供資料與操作。
 */
export default function GameShell({
  phase,
  headerProps,
  teamProps,
  collectionProps,
  battleProps,
  encounterProps,
  prepareAction,
  prepareActions,
  battleActions,
  pointerDragGhost,
  cardProps,
  compendiumPet,
  onCompendiumPetOpened,
  quickActions,
  children,
}) {
  const resolvedPrepareActions = prepareActions ?? (prepareAction ? [prepareAction] : []);
  const [mobileShellPage, setMobileShellPage] = useState("team");

  useEffect(() => {
    if (phase === "prepare") setMobileShellPage("team");
  }, [phase]);

  useEffect(() => {
    const root = document.documentElement;
    let animationFrame = 0;
    let settleTimers = [];

    const updateViewportHeight = () => {
      const viewportHeight = window.visualViewport?.height ?? 0;
      const height = Math.ceil(Math.max(
        viewportHeight,
        window.innerHeight
      ));
      const value = `${height}px`;
      if (root.style.getPropertyValue("--app-visible-height") !== value) {
        root.style.setProperty("--app-visible-height", value);
      }
    };

    const scheduleViewportUpdate = () => {
      updateViewportHeight();
      window.cancelAnimationFrame(animationFrame);
      settleTimers.forEach(window.clearTimeout);
      animationFrame = window.requestAnimationFrame(updateViewportHeight);
      // Android Chrome 的網址列／全螢幕動畫可能在 resize 後才完成。
      settleTimers = [120, 360].map((delay) => window.setTimeout(updateViewportHeight, delay));
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) scheduleViewportUpdate();
    };

    const viewportObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleViewportUpdate);

    scheduleViewportUpdate();
    viewportObserver?.observe(root);
    window.addEventListener("resize", scheduleViewportUpdate);
    window.addEventListener("orientationchange", scheduleViewportUpdate);
    window.addEventListener("pageshow", scheduleViewportUpdate);
    document.addEventListener("fullscreenchange", scheduleViewportUpdate);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.screen.orientation?.addEventListener?.("change", scheduleViewportUpdate);
    window.visualViewport?.addEventListener("resize", scheduleViewportUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleViewportUpdate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      settleTimers.forEach(window.clearTimeout);
      viewportObserver?.disconnect();
      window.removeEventListener("resize", scheduleViewportUpdate);
      window.removeEventListener("orientationchange", scheduleViewportUpdate);
      window.removeEventListener("pageshow", scheduleViewportUpdate);
      document.removeEventListener("fullscreenchange", scheduleViewportUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.screen.orientation?.removeEventListener?.("change", scheduleViewportUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleViewportUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleViewportUpdate);
      root.style.removeProperty("--app-visible-height");
    };
  }, []);

  const mobileView = phase === "battle" ? "battle" : mobileShellPage;

  return (
    <>
      <main className={`page-root page-root--game-shell mobile-shell-view--${mobileView}`}>
        {phase === "prepare" ? (
          <nav className="mobile-shell-tabs" aria-label="手機版遊戲頁面">
            <button
              type="button"
              className={mobileShellPage === "team" ? "is-active" : ""}
              aria-current={mobileShellPage === "team" ? "page" : undefined}
              onClick={() => setMobileShellPage("team")}
            >
              組隊
            </button>
            <button
              type="button"
              className={mobileShellPage === "home" ? "is-active" : ""}
              aria-current={mobileShellPage === "home" ? "page" : undefined}
              onClick={() => setMobileShellPage("home")}
            >
              遊戲首頁
            </button>
          </nav>
        ) : null}
        <HeaderPanel {...headerProps} />
        <div className="game-shell-canvas">
          <div className="game-shell-main-stack">
            <div className="game-shell-team-wrap">
              {phase === "battle" ? (
                <BattleSection {...battleProps} />
              ) : (
                <TeamSection {...teamProps} {...cardProps} />
              )}
            </div>
            {phase === "prepare" ? (
              <div className="game-shell-breakout">
                <CollectionSection {...collectionProps} {...cardProps} />
              </div>
            ) : null}
          </div>
        </div>
        <EncounterPanel {...encounterProps} />
        <div className="bottom-action-bar">
          {phase === "prepare" ? (
            <>
              {resolvedPrepareActions.map((action, index) => {
                const isPrimary = action.primary ?? index === resolvedPrepareActions.length - 1;
                return (
                  <button
                    key={action.id ?? action.label}
                    type="button"
                    className={`save-button ${isPrimary ? "primary-bottom-button" : "retry-bottom-button"}${action.active ? " is-pending" : ""}`}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    data-guided-target={action.guidedTarget}
                  >
                    {action.icon ?? null}
                    {action.label}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {battleActions?.secondary ? (
                <button
                  type="button"
                  className="save-button retry-bottom-button"
                  onClick={battleActions.secondary.onClick}
                  disabled={battleActions.secondary.disabled}
                >
                  {battleActions.secondary.label}
                </button>
              ) : null}
              {battleActions?.primary ? (
                <button
                  type="button"
                  className="save-button primary-bottom-button"
                  onClick={battleActions.primary.onClick}
                  disabled={battleActions.primary.disabled}
                >
                  {battleActions.primary.label}
                </button>
              ) : null}
            </>
          )}
        </div>
        {pointerDragGhost ? (
          <div className="pointer-drag-ghost" style={{ left: pointerDragGhost.x, top: pointerDragGhost.y }}>
            <GameCard
              data={pointerDragGhost.data}
              showLevel
              {...cardProps}
              className="pointer-drag-ghost-card"
            />
          </div>
        ) : null}
        {children}
      </main>
      <div className="game-quick-fab-group" aria-label="快速功能">
        <GameTutorialLauncher />
        {(quickActions ?? []).map((action) => (
          <button
            type="button"
            className="game-tutorial-fab game-quick-action-fab"
            key={action.id ?? action.label}
            onClick={action.onClick}
            aria-expanded={action.expanded}
          >
            {action.label}
          </button>
        ))}
        <PetCompendiumLauncher selectedPet={compendiumPet} onSelectedPetOpened={onCompendiumPetOpened} />
      </div>
    </>
  );
}
