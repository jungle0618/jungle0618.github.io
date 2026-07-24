"use client";

import { useEffect, useState } from "react";
import BattleArena from "./BattleArena";
import BattleTimelineControls from "./BattleTimelineControls";
import { useBattleTimeline } from "./useBattleTimeline";

function ContributionSummary({ rows = [] }) {
  if (!rows.length) return null;
  return (
    <div className="battle-contribution-summary">
      <h3>我方角色貢獻結算</h3>
      <div className="battle-contribution-table-wrap">
        <table className="battle-contribution-table">
          <thead><tr><th>角色</th><th>傷害</th><th>承傷</th><th>增益量</th><th>護甲量</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <th scope="row"><img src={row.image} alt="" draggable={false} /><span>{row.name}</span></th>
                <td>{row.damage}</td><td>{row.damageTaken}</td><td>{row.buffs}</td><td>{row.armor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContributionDialog({ rows, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="battle-contribution-backdrop" onMouseDown={onClose}>
      <div className="battle-contribution-dialog" role="dialog" aria-modal="true" aria-labelledby="battle-contribution-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="battle-contribution-dialog__header">
          <div>
            <span>戰鬥結算</span>
            <h2 id="battle-contribution-title">角色貢獻</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉角色貢獻視窗">關閉</button>
        </div>
        <ContributionSummary rows={rows} />
      </div>
    </div>
  );
}

function groupBattleReplays(replays = []) {
  const groups = [];
  const groupByKey = new Map();
  for (const replay of replays) {
    const key = replay.challenge?.id ?? replay.challengeIndex ?? replay.encounterName;
    if (!groupByKey.has(key)) {
      const group = {
        key,
        label: replay.challenge?.label ?? replay.encounterName,
        shortLabel: replay.challenge?.kindLabel
          ?? (replay.challenge?.kind === "duo" ? "雙人關" : replay.challenge?.kind === "tutorial" ? "教學關" : "單人關"),
        encounterName: replay.encounterName,
        replays: [],
      };
      groups.push(group);
      groupByKey.set(key, group);
    }
    groupByKey.get(key).replays.push(replay);
  }
  return groups;
}

export default function BattleSection({ battleReplay, battleReplays = [], onSelectReplay }) {
  const [contributionOpen, setContributionOpen] = useState(false);
  const [levelPickerOpen, setLevelPickerOpen] = useState(false);
  const {
    paused,
    effectIndex,
    effectCount,
    showFinalPose,
    inOpeningPhase,
    beforeFirstEffect,
    displayFrameIndex,
    currentFrame,
    battleLogSlots,
    petSlotFx,
    petMotionFx,
    leftLineupDisplay,
    rightLineupDisplay,
    leftStatRefs,
    rightStatRefs,
    stepPrev,
    stepNext,
    endBattle,
    goToStart,
    setPaused,
    playbackSpeed,
    setPlaybackSpeed,
  } = useBattleTimeline({ battleReplay });

  const canPrev = effectIndex > -1;
  const canNext = effectCount > 0 && effectIndex < Math.max(0, effectCount - 1);
  const canEnd = !showFinalPose && effectCount > 0;
  const canGoToStart = effectCount > 0;
  const scoreTotal = battleReplay?.score.roundTotal ?? battleReplay?.score.total ?? 0;
  const replayGroups = groupBattleReplays(battleReplays);

  useEffect(() => {
    setContributionOpen(false);
    setLevelPickerOpen(false);
  }, [battleReplay?.encounterId]);

  return (
    <section className="panel battle-section-panel">
      <div className="battle-section-header">
        <div>
          <span className="battle-section-kicker">戰鬥階段</span>
          <h2 className="panel-title">戰鬥回放</h2>
        </div>
        {battleReplay ? (
          <div className={`battle-result-pill${battleReplay.score.cleared ? " battle-result-pill--clear" : " battle-result-pill--failed"}`}>
            <strong>{battleReplay.score.cleared ? "擊敗成功" : "挑戰失敗"}</strong>
            <span>通過 {scoreTotal} 個等級</span>
          </div>
        ) : null}
      </div>
      {battleReplays.length ? (
        <div className="battle-replay-strip">
          <span className="battle-replay-strip-label">戰況</span>
          <button
            type="button"
            className="battle-replay-picker-button"
            aria-expanded={levelPickerOpen}
            onClick={() => setLevelPickerOpen((open) => !open)}
          >
            <span>選擇等級</span>
            <strong>Lv.{battleReplay?.bossLevel ?? 1}</strong>
            <small aria-hidden="true">{levelPickerOpen ? "▲" : "▼"}</small>
          </button>
          <div className={`battle-replay-groups${levelPickerOpen ? " battle-replay-groups--picker-open" : ""}`} aria-label="Boss 各等級戰況">
            {replayGroups.map((group) => (
              <div key={group.key} className="battle-replay-group">
                <div className="battle-replay-group-title">
                  <strong className="battle-replay-group-full-label">{group.label}</strong>
                  <strong className="battle-replay-group-short-label">{group.shortLabel}</strong>
                  <span>{group.encounterName}</span>
                </div>
                <div className="battle-replay-level-grid" role="tablist" aria-label={`${group.label} 各等級戰況`}>
                  {group.replays.map((replay) => {
                    const selected = replay.encounterId === battleReplay?.encounterId;
                    const tooltip = `${group.label} ${replay.encounterName} Lv.${replay.bossLevel}：${replay.score.cleared ? "勝利" : "失敗"}`;
                    return (
                      <button
                        key={replay.encounterId}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-label={tooltip}
                        title={tooltip}
                        className={`boss-level-replay-tab${selected ? " boss-level-replay-tab--active" : ""}${replay.score.cleared ? " boss-level-replay-tab--clear" : " boss-level-replay-tab--failed"}`}
                        onClick={() => {
                          onSelectReplay?.(replay);
                          setLevelPickerOpen(false);
                        }}
                      >
                        <span>{replay.bossLevel}</span>
                        <small>{replay.score.cleared ? "✓" : "✕"}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {battleReplay && currentFrame ? (
        <>
          <BattleArena
            battleReplay={battleReplay}
            currentFrame={currentFrame}
            showFinalPose={showFinalPose}
            inOpeningPhase={inOpeningPhase}
            leftLineupDisplay={leftLineupDisplay}
            rightLineupDisplay={rightLineupDisplay}
            leftStatRefs={leftStatRefs}
            rightStatRefs={rightStatRefs}
            displayFrameIndex={displayFrameIndex}
            effectIndex={effectIndex}
            effectCount={effectCount}
            playbackSpeed={playbackSpeed}
            beforeFirstEffect={beforeFirstEffect}
            petSlotFx={petSlotFx}
            petMotionFx={petMotionFx}
            battleLogSlots={battleLogSlots}
          />
          <BattleTimelineControls
            paused={paused}
            onTogglePause={() => setPaused((p) => !p)}
            canPrev={canPrev}
            canNext={canNext}
            onPrev={stepPrev}
            onNext={stepNext}
            onEnd={endBattle}
            canEnd={canEnd}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={setPlaybackSpeed}
            onGoToStart={goToStart}
            canGoToStart={canGoToStart}
            onShowContribution={() => setContributionOpen(true)}
            canShowContribution={Boolean(battleReplay.contributions?.length)}
          />
          {contributionOpen ? <ContributionDialog rows={battleReplay.contributions} onClose={() => setContributionOpen(false)} /> : null}
        </>
      ) : battleReplay ? (
        <div style={{ marginTop: 12 }}>
          <div className="status-box">本場沒有可播放的交戰畫面。</div>
        </div>
      ) : null}
    </section>
  );
}
