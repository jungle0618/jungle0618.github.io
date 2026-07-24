"use client";

import { useEffect, useRef, useState } from "react";
import {
  getCardTier,
  getPetQualityLabel,
  getPetSpecialEffectText,
} from "../lib/petCatalog";
import { BATTLE_EFFECT_ICONS } from "../lib/assetConfig";
import { describeBattleSlot } from "../lib/battleNarration";
import { scheduledEffectCountdown } from "./useBattleTimeline";
import CardTooltip from "./CardTooltip";

function battlePetTooltipProps(pet, baselineRef) {
  if (!pet?.name) return null;
  const tier = getCardTier(pet);
  const level = pet.level ?? 1;
  const special = getPetSpecialEffectText(pet);
  const effectText = special;
  const statText = baselineRef
    ? `戰鬥中：ATK ${pet.atk ?? 0} / HP ${pet.hp ?? 0}（本特效前：ATK ${baselineRef.atk}／HP ${baselineRef.hp}）`
    : `戰鬥中：ATK ${pet.atk ?? 0} / HP ${pet.hp ?? 0}`;
  return {
    title: `名稱：${pet.name}`,
    statText,
    levelText: `等級：Lv.${level}`,
    tierText: pet.isEnemy ? "類型：Boss 敵人" : `品質：${getPetQualityLabel(tier)}`,
    tierClassName: pet.isEnemy ? "" : `card-tooltip-tier card-tooltip-tier-${tier}`,
    effectText,
  };
}

const atkStatIcon = BATTLE_EFFECT_ICONS.damage;
const hpStatIcon = BATTLE_EFFECT_ICONS.heal;

function PetSlotFxOverlay({ slot, delayMs = 0 }) {
  if (!slot?.kind) return null;
  const style = {
    "--battle-fx-delay": `${delayMs}ms`,
    "--battle-float-size": `${slot.fontSize ?? 24}px`,
  };
  return (
    <>
      <span className={`battle-pet-slot-fx battle-pet-slot-fx--${slot.kind}`} style={style} aria-hidden>
        <span className="battle-pet-slot-fx-core" />
      </span>
      {slot.showFly === false ? null : (
        <span className={`battle-pet-slot-fly battle-pet-slot-fly--${slot.kind}`} style={style} aria-hidden>
          <span className="battle-pet-slot-fly-inner">
            <img src={slot.iconSrc ?? BATTLE_EFFECT_ICONS.star} alt="" draggable={false} className="battle-pet-slot-fly-img" />
            {slot.flyText ? <span className="battle-pet-slot-fly-val">{slot.flyText}</span> : null}
          </span>
        </span>
      )}
    </>
  );
}

function slotFxForIndex(slotFx, idx) {
  if (Array.isArray(slotFx)) return slotFx.filter((slot) => slot?.idx === idx);
  return slotFx?.idx === idx ? [slotFx] : [];
}

function motionForIndex(motionFx, idx) {
  return {
    attack: motionFx?.attackIndices?.includes(idx) ?? motionFx?.attackIdx === idx,
    death: motionFx?.deathIndices?.includes(idx) ?? motionFx?.deathIdx === idx,
  };
}

function BattleLineupPetSlot({
  pet,
  idx,
  effectIndex,
  overlayKeyPrefix,
  imageClass,
  petRowClass,
  baselineRef,
  slotFx,
  renderAbilities,
  isFront,
  currentRound,
  motion,
}) {
  const wrapRef = useRef(null);
  const previousStatsRef = useRef({ uid: pet?.uid, atk: pet?.atk, hp: pet?.hp });
  const [hover, setHover] = useState(false);
  const [statFx, setStatFx] = useState({ atk: null, hp: null });
  const tip = battlePetTooltipProps(pet, baselineRef);
  const currentHp = Math.max(0, pet.hp ?? 0);
  const maxHp = Math.max(1, pet.maxHp ?? pet.hp ?? 1);
  const hpPct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
  const activeSlotFx = slotFxForIndex(slotFx, idx);
  const dodgeWithOtherMotion = activeSlotFx.some((slot) => slot.kind === "dodge")
    && Boolean(motion?.attack || motion?.death);
  const rowClass = `battle-lineup-pet ${isFront ? "battle-lineup-pet--front" : ""} ${dodgeWithOtherMotion ? "battle-lineup-pet--dodge-with-motion" : ""} ${petRowClass}`.trim();
  const countdown = scheduledEffectCountdown(pet, currentRound);

  useEffect(() => {
    const previous = previousStatsRef.current;
    const next = { uid: pet?.uid, atk: pet?.atk, hp: pet?.hp };
    previousStatsRef.current = next;
    if (previous.uid !== next.uid) {
      setStatFx({ atk: null, hp: null });
      return undefined;
    }
    const atk = next.atk === previous.atk ? null : next.atk > previous.atk ? "up" : "down";
    const hp = next.hp === previous.hp ? null : next.hp > previous.hp ? "up" : "down";
    if (!atk && !hp) return undefined;
    setStatFx({ atk, hp });
    const timeoutId = window.setTimeout(() => setStatFx({ atk: null, hp: null }), 620);
    return () => window.clearTimeout(timeoutId);
  }, [pet?.uid, pet?.atk, pet?.hp]);

  return (
    <div
      ref={wrapRef}
      className={rowClass}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      {activeSlotFx.map((slot, fxIndex) => (
        <PetSlotFxOverlay key={`${overlayKeyPrefix}-${effectIndex}-${idx}-${fxIndex}`} slot={slot} delayMs={fxIndex * 65} />
      ))}
      {pet.mountImage ? (
        <div className={`battle-lineup-portrait battle-lineup-portrait--mounted${imageClass.includes("--mirrored") ? " battle-lineup-portrait--mirrored" : ""}`} aria-label={`${pet.name}騎乘${pet.mountName ?? "隼"}`}>
          <img src={pet.mountImage} alt="" className="battle-lineup-mount-image" draggable={false} />
          <img src={pet.image} alt={pet.name} className="battle-lineup-rider-image" draggable={false} />
        </div>
      ) : <img src={pet.image} alt={pet.name} className={imageClass} draggable={false} />}
      {renderAbilities(pet)}
      {countdown != null ? (
        <span className="battle-scheduled-countdown" aria-label={`距離指定回合效果還有 ${countdown} 回合`}>
          {countdown}
        </span>
      ) : null}
      <div className="battle-hp-bar" aria-hidden="true">
        <span style={{ width: `${hpPct}%` }} />
      </div>
      <div className="battle-lineup-stats" aria-label={`攻擊 ${pet.atk}，生命 ${pet.hp}`}>
        <span className="battle-lineup-stat">
          <img src={atkStatIcon} alt="atk" draggable={false} />
          <span className={`battle-lineup-stat-num${statFx.atk ? ` battle-lineup-stat-num--${statFx.atk}` : ""}`}>{pet.atk}</span>
        </span>
        <span className="battle-lineup-stat">
          <img src={hpStatIcon} alt="hp" draggable={false} />
          <span className={`battle-lineup-stat-num${statFx.hp ? ` battle-lineup-stat-num--${statFx.hp}` : ""}`}>{pet.hp}</span>
        </span>
      </div>
      {tip ? (
        <CardTooltip
          anchorRef={wrapRef}
          open={hover}
          rootClassName="card-tooltip"
          lineClassName="card-tooltip-line"
          title={tip.title}
          statText={tip.statText}
          levelText={tip.levelText}
          tierText={tip.tierText}
          tierClassName={tip.tierClassName}
          effectText={tip.effectText}
        />
      ) : null}
    </div>
  );
}

export default function BattleArena({
  battleReplay,
  currentFrame,
  showFinalPose,
  inOpeningPhase = false,
  leftLineupDisplay,
  rightLineupDisplay,
  leftStatRefs = [],
  rightStatRefs = [],
  displayFrameIndex,
  effectIndex,
  effectCount,
  playbackSpeed = 1,
  beforeFirstEffect = false,
  petSlotFx = { left: null, right: null },
  petMotionFx = { left: null, right: null },
  battleLogSlots = [],
}) {
  const chatLogRef = useRef(null);
  const battleMessages = battleLogSlots.flatMap((slot) => describeBattleSlot(slot));
  useEffect(() => {
    const node = chatLogRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [battleMessages.length]);
  if (!battleReplay || !currentFrame) return null;

  const totalFrames = battleReplay.frames.length;
  const currentBattleRound = inOpeningPhase || beforeFirstEffect ? 0 : displayFrameIndex + 1;
  const canPlayMotionAnimation = !beforeFirstEffect && !showFinalPose;
  const renderAbilities = (pet) => {
    if (!pet) return null;
    const items = [
      ["armor", "armor", pet.battleArmor],
      ["leech", "leech", pet.battleLeech],
      ["pierce", "pierce", pet.pierce],
      ["dodge", "star", pet.dodge ? true : 0],
    ]
      .filter(([, , value]) => (value ?? 0) > 0)
      .map(([key, icon, value]) => ({ key, icon: BATTLE_EFFECT_ICONS[icon], value }));
    if (!items.length) return null;
    return (
      <div className="battle-ability-corner" aria-label="特殊能力">
        {items.map((it) => (
          <span key={it.key} className="battle-ability-pill">
            <img src={it.icon} alt="" draggable={false} className="battle-ability-icon" />
            {it.value === true ? null : it.value}
          </span>
        ))}
      </div>
    );
  };
  const renderTeam = (side, lineup, statRefs) => (
    <div className={`battle-team battle-team-${side}`}>
      {lineup.map((pet, idx) => {
        const isFront = side === "left" ? idx === lineup.length - 1 : idx === 0;
        const motion = canPlayMotionAnimation ? motionForIndex(petMotionFx?.[side], idx) : { attack: false, death: false };
        const petRowClass = [
          motion.attack ? `battle-lineup-front-${side}` : "",
          motion.death ? `battle-lineup-front-${side}-defeated` : "",
        ].filter(Boolean).join(" ");
        return (
          <BattleLineupPetSlot
            key={`${pet.uid ?? pet.name}-${side}`}
            pet={pet}
            idx={idx}
            effectIndex={effectIndex}
            overlayKeyPrefix={side === "left" ? "L" : "R"}
            imageClass={`battle-lineup-image${side === "right" ? " battle-lineup-image--mirrored" : ""}`}
            petRowClass={petRowClass}
            baselineRef={statRefs[idx]}
            slotFx={petSlotFx?.[side]}
            renderAbilities={renderAbilities}
            isFront={isFront}
            currentRound={currentBattleRound}
            motion={motion}
          />
        );
      })}
    </div>
  );

  return (
    <div className="battle-arena-stack" style={{ "--battle-playback-speed": playbackSpeed }}>
      <div className="battle-arena">
        <div key={`arena-${displayFrameIndex}`} className="battle-lane-full">
          {renderTeam("left", leftLineupDisplay, leftStatRefs)}

          {renderTeam("right", rightLineupDisplay, rightStatRefs)}
        </div>

        <div className="battle-frame-indicator">回合 {displayFrameIndex + 1} / {Math.max(1, totalFrames)}</div>
      </div>
      <div className="battle-chat-log" role="log" aria-live="polite" aria-label="戰鬥文字紀錄">
        <div className="battle-chat-log__title"><span>戰鬥紀錄</span><small>Battle Log</small></div>
        <div ref={chatLogRef} className="battle-chat-log__messages">
          {battleMessages.length ? battleMessages.map((message, index) => (
            <p key={`${index}-${message}`} className={index === battleMessages.length - 1 ? "battle-chat-log__message battle-chat-log__message--current" : "battle-chat-log__message"}>
              <span aria-hidden>›</span>{message}
            </p>
          )) : <p className="battle-chat-log__message battle-chat-log__message--muted"><span aria-hidden>›</span>雙方正在準備戰鬥……</p>}
        </div>
      </div>
    </div>
  );
}
