"use client";

import { useEffect, useMemo, useState } from "react";
import { DUO_CLEAR_SCORE, MAX_BOSS_LEVEL } from "../lib/gameConfig";

const STEPS = [
  {
    key: "pick-one",
    title: "第一步：放上一隻角色",
    body: "從下方角色池拖一張角色卡到上方隊伍格。越靠右的位置越前排。",
    doneText: "已放上角色",
    targetSelector: ".page-root--game-shell .collection-panel",
    arrowText: "從這裡拖卡",
  },
  {
    key: "read-card",
    title: "第二步：先看懂卡片",
    body: "卡片上會顯示名字、標籤、攻擊、生命與等級。標籤可以快速判斷角色定位，例如增益、護甲、主C、保排；滑過卡片可以看完整效果敘述。",
    doneText: "了解卡片資訊",
    targetSelector: ".page-root--game-shell .team-panel",
    arrowText: "卡片資訊在這裡",
    manual: true,
  },
  {
    key: "fill-team",
    title: "第三步：補滿上場隊伍",
    body: "繼續從角色池拖卡，或使用「一鍵配置 / 隨機配置」。教學關的敵人需要規劃增益與前排，隨便放滿不一定能過；角色上場後會從角色池隱藏。",
    doneText: "隊伍已補滿",
    targetSelector: ".page-root--game-shell .team-panel",
    arrowText: "放到隊伍格",
  },
  {
    key: "enemy-and-rules",
    title: "第四步：確認敵方與站位",
    body: "右側會顯示本回合敵方陣容。開戰前要根據敵方技能調整站位：隊伍越靠右越前排，最前排會先承受普通攻擊。",
    doneText: "了解敵方與規則",
    targetSelector: ".page-root--game-shell .encounter-panel",
    arrowText: "先看本關敵人",
    manual: true,
  },
  {
    key: "battle-rules",
    title: "第五步：戰鬥規則",
    body: "開戰效果算第 1 回合的一部分，所以開戰傷害也可能被閃避；接著依序處理每回合開始效果、雙方最前排同時普通攻擊、追加攻擊或範圍效果與死亡效果。敵方全滅就通關；35 回合內沒贏就失敗。",
    doneText: "了解戰鬥規則",
    targetSelector: ".page-root--game-shell .team-panel",
    arrowText: "右側角色先承傷",
    manual: true,
  },
  {
    key: "start-battle",
    title: "第六步：開始戰鬥",
    body: `按下畫面下方的「開始戰鬥」。正式第 1 回合前會先檢查教學關 Lv.1；正式關卡會分別挑戰 Boss Lv.1～Lv.${MAX_BOSS_LEVEL}，每個等級獨立計分。`,
    doneText: "已進入戰鬥",
    targetSelector: "[data-guided-target='start-battle']",
    arrowText: "按這裡開戰",
  },
  {
    key: "watch-battle",
    title: "第七步：算分與結算",
    body: `每個正式關卡都會挑戰 Boss Lv.1～Lv.${MAX_BOSS_LEVEL}。單人關每通過 1 個等級算 1 分；雙人關每通過 1 個等級算 ${DUO_CLEAR_SCORE} 分，例如雙人關只通過 Lv.3～Lv.7 就是 ${5 * DUO_CLEAR_SCORE} 分。10 回合總分是每個正式關卡分數相加。結算也會列出每隻角色的傷害、承傷、增益與護甲貢獻。`,
    doneText: "完成教學",
    targetSelector: ".page-root--game-shell .battle-section-panel",
    arrowText: "這裡看回放與分數",
  },
];

function getStepIndex({
  gamePhase,
  selectedCount,
  requiredCount,
  canStartBattle,
  cardRead,
  rulesRead,
  battleRulesRead,
}) {
  if (gamePhase === "battle") return STEPS.findIndex((step) => step.key === "watch-battle");
  if (selectedCount <= 0) return 0;
  if (!cardRead) return 1;
  if (selectedCount < requiredCount || !canStartBattle) return 2;
  if (!rulesRead) return 3;
  if (!battleRulesRead) return 4;
  return 5;
}

export default function GuidedGameTutorial({
  gamePhase,
  selectedCount,
  requiredCount,
  canStartBattle,
  onDismiss,
}) {
  const [cardRead, setCardRead] = useState(false);
  const [rulesRead, setRulesRead] = useState(false);
  const [battleRulesRead, setBattleRulesRead] = useState(false);
  const stepIndex = getStepIndex({
    gamePhase,
    selectedCount,
    requiredCount,
    canStartBattle,
    cardRead,
    rulesRead,
    battleRulesRead,
  });
  const step = STEPS[stepIndex];
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100);
  const [targetRect, setTargetRect] = useState(null);

  useEffect(() => {
    if (selectedCount <= 0) setCardRead(false);
    if (selectedCount < requiredCount) {
      setRulesRead(false);
      setBattleRulesRead(false);
    }
  }, [selectedCount, requiredCount]);

  function handleManualStep() {
    if (step.key === "read-card") {
      setCardRead(true);
      return;
    }
    if (step.key === "enemy-and-rules") {
      setRulesRead(true);
      return;
    }
    if (step.key === "battle-rules") {
      setBattleRulesRead(true);
    }
  }

  useEffect(() => {
    let raf = 0;
    function updateTargetRect() {
      const target = document.querySelector(step.targetSelector);
      if (!target) {
        setTargetRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setTargetRect({
        left: Math.max(8, rect.left),
        top: Math.max(8, rect.top),
        width: Math.max(0, Math.min(window.innerWidth - 16, rect.width)),
        height: Math.max(0, Math.min(window.innerHeight - 16, rect.height)),
      });
    }
    function schedule() {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(updateTargetRect);
    }
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [step.targetSelector, selectedCount, requiredCount, gamePhase]);

  const arrowStyle = useMemo(() => {
    if (!targetRect) return null;
    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;
    const nearTop = centerY < window.innerHeight * 0.45;
    const nearLeft = centerX < window.innerWidth * 0.5;
    const top = nearTop
      ? Math.min(window.innerHeight - 92, targetRect.top + targetRect.height + 10)
      : Math.max(14, targetRect.top - 64);
    const left = nearLeft
      ? Math.min(window.innerWidth - 178, targetRect.left + Math.min(28, targetRect.width * 0.25))
      : Math.max(14, targetRect.left + targetRect.width - 170);
    const rotation = nearTop ? -90 : 90;
    return { top, left, "--guided-arrow-rotate": `${rotation}deg` };
  }, [targetRect]);

  return (
    <>
      {targetRect ? (
        <>
          <div
            className="guided-tutorial-highlight"
            style={{
              left: targetRect.left,
              top: targetRect.top,
              width: targetRect.width,
              height: targetRect.height,
            }}
            aria-hidden="true"
          />
          {arrowStyle ? (
            <div className="guided-tutorial-arrow" style={arrowStyle} aria-hidden="true">
              <span className="guided-tutorial-arrow-icon">➜</span>
              <span>{step.arrowText}</span>
            </div>
          ) : null}
        </>
      ) : null}
      <aside className="guided-tutorial-panel" aria-label="互動式遊戲教學">
        <div className="guided-tutorial-head">
          <span className="guided-tutorial-kicker">互動教學</span>
          <button type="button" className="guided-tutorial-skip" onClick={onDismiss}>跳過</button>
        </div>
        <h2 className="guided-tutorial-title">{step.title}</h2>
        <p className="guided-tutorial-body">{step.body}</p>
        <div className="guided-tutorial-progress" aria-label={`教學進度 ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="guided-tutorial-footer">
          <span>上場 {selectedCount}/{requiredCount}</span>
          {step.manual ? (
            <button type="button" className="guided-tutorial-done" onClick={handleManualStep}>
              下一步
            </button>
          ) : stepIndex >= STEPS.length - 1 ? (
            <button type="button" className="guided-tutorial-done" onClick={onDismiss}>完成教學</button>
          ) : (
            <span className="guided-tutorial-state">{step.doneText}後自動前進</span>
          )}
        </div>
      </aside>
    </>
  );
}
