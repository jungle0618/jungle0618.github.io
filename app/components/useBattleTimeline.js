"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BATTLE_EFFECT_ICONS as BI } from "../lib/assetConfig";
const EFFECT_MS = 820;
const FINAL_POSE_DELAY_MS = 760;
/** 進入戰鬥後、第一個特效播放前的預備畫面（對應 0/n） */
const PRE_FIRST_EFFECT_MS = 620;

function clampPlaybackSpeed(s) {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(4, Math.max(0.25, n));
}

/** speed 愈大播放愈快（間隔 = baseMs / speed） */
function scaledTimelineMs(baseMs, speed) {
  return Math.max(80, Math.round(baseMs / clampPlaybackSpeed(speed)));
}

const COMBAT_DAMAGE_TYPES = new Set([
  "main_strike",
  "self_swift_strike",
  "ally_followup_strike",
  "death_execute_front",
]);
const COMBAT_HEAL_TYPES = new Set(["leech_heal", "self_heal", "attack_armored_or_dodge_heal"]);

function spawnedPetFromEvent(pet, ev) {
  if (!pet) return null;
  const hp = ev.targetHpAfter ?? 1;
  return {
    ...pet,
    tier: pet.tier ?? 4,
    isEnemy: ownSideFromEvent(ev) === "right",
    special: pet.special ?? {},
    atk: ev.targetAtkAfter ?? 0,
    hp,
    maxHp: ev.targetMaxHpAfter ?? hp,
    battleArmor: 0,
    dodge: false,
    pierce: false,
  };
}

function ownSideFromEvent(ev) {
  return ev.targetSide ?? ev.side;
}

export function applyCombatEventsToLineup(working, events, ownSide) {
  const findByUid = (arr, uid) => arr.find((x) => x && x.uid === uid);
  for (const ev of events) {
    if (!ev) continue;
    if (ev.type === "round_front_summon" && ownSideFromEvent(ev) === ownSide) {
      const sourceIndex = working.findIndex((pet) => pet?.uid === ev.source?.uid);
      const summoned = spawnedPetFromEvent(ev.target ?? ev.summoned, ev);
      if (sourceIndex >= 0 && summoned && !findByUid(working, summoned.uid)) {
        working.splice(sourceIndex + 1, 0, summoned);
      }
      continue;
    }
    if (ev.type === "death_split" && ownSideFromEvent(ev) === ownSide) {
      const sourceIndex = working.findIndex((pet) => pet?.uid === ev.source?.uid);
      if (sourceIndex < 0) continue;
      const children = [ev.target, ev.secondaryTarget]
        .map((pet) => spawnedPetFromEvent(pet, ev))
        .filter((pet) => pet && !findByUid(working, pet.uid));
      if (children.length) working.splice(sourceIndex + 1, 0, ...children);
      continue;
    }
    if (COMBAT_DAMAGE_TYPES.has(ev.type)) {
      if (ev.targetSide !== ownSide) continue;
      const pet = findByUid(working, ev.target?.uid);
      if (pet) {
        pet.hp = ev.targetHpAfter ?? pet.hp;
        pet.battleArmor = ev.targetArmorAfter ?? pet.battleArmor;
      }
      continue;
    }
    if (COMBAT_HEAL_TYPES.has(ev.type)) {
      if (ev.side !== ownSide) continue;
      const src = findByUid(working, ev.source?.uid);
      if (!src) continue;
      src.hp = ev.targetHpAfter ?? ev.hpAfter ?? src.hp;
      if (typeof ev.maxHp === "number") src.maxHp = ev.maxHp;
      continue;
    }
    if (ev.type === "kill_atk") {
      if (ev.side !== ownSide) continue;
      const src = findByUid(working, ev.source?.uid);
      if (src) src.atk = ev.atkAfter ?? src.atk;
      continue;
    }
    if (ev.type === "post_attack_self_armor") {
      if (ev.side !== ownSide) continue;
      const src = findByUid(working, ev.source?.uid);
      if (src) src.battleArmor = ev.targetArmorAfter ?? src.battleArmor;
      continue;
    }
    if (ev.type === "round_shield" || ev.type === "death_double_shield") {
      if (ev.side !== ownSide) continue;
      const target = findByUid(working, ev.target?.uid ?? ev.source?.uid);
      if (target) target.battleArmor = ev.targetArmorAfter ?? target.battleArmor;
      continue;
    }
    if (ev.type === "round_end_halve_hp") {
      if (ev.side !== ownSide) continue;
      const target = findByUid(working, ev.target?.uid ?? ev.source?.uid);
      if (target) target.hp = ev.targetHpAfter ?? target.hp;
      continue;
    }
    if (ev.side === ownSide || ev.targetSide === ownSide) {
      const target = findByUid(working, ev.target?.uid ?? ev.source?.uid);
      if (!target) continue;
      if (typeof ev.targetAtkAfter === "number") target.atk = ev.targetAtkAfter;
      if (typeof ev.targetHpAfter === "number") target.hp = ev.targetHpAfter;
      if (typeof ev.targetMaxHpAfter === "number") target.maxHp = ev.targetMaxHpAfter;
      if (typeof ev.targetArmorAfter === "number") target.battleArmor = ev.targetArmorAfter;
      if (typeof ev.dodgeAfter === "boolean") target.dodge = ev.dodgeAfter;
    }
  }
}

const MAIN_ATTACK_EVENT_TYPES = new Set(["main_strike", "attack_all_damage"]);

/**
 * 一回合內雙方的第一輪普通攻擊是同一個視覺批次。
 * 不管其中一方是單體攻擊或範圍普通攻擊，都不能把另一方的承傷留到下一幕。
 */
function mergeSimultaneousMainAttacks(items) {
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const first = items[i];
    if (first.isOpening || !MAIN_ATTACK_EVENT_TYPES.has(first.ev?.type)) {
      out.push(first);
      continue;
    }

    const events = [];
    const sides = new Set();
    let j = i;
    while (j < items.length) {
      const candidate = items[j];
      if (
        candidate.isOpening ||
        candidate.frameIndex !== first.frameIndex ||
        candidate.ev?.step !== first.ev?.step ||
        !MAIN_ATTACK_EVENT_TYPES.has(candidate.ev?.type)
      ) break;
      events.push(candidate.ev);
      if (candidate.ev?.side) sides.add(candidate.ev.side);
      j += 1;
    }

    if (sides.has("left") && sides.has("right")) {
      out.push({
        frameIndex: first.frameIndex,
        isOpening: false,
        ev: null,
        bundleType: "simultaneous_main_attack",
        events,
      });
      i = j - 1;
    } else {
      out.push(first);
    }
  }
  return out;
}

const MULTI_EFFECT_TYPES = new Set([
  "attack_all_damage",
  "opening_enemy_all_damage",
  "round_enemy_all_damage",
  "round_ten_enemy_all_damage",
  "death_enemy_all_damage",
  "death_effect_count_damage",
  "death_team_stats",
  "opening_adjacent_armor",
  "opening_team_armor",
  "opening_team_atk",
  "round_adjacent_armor",
  "round_ahead_hp",
  "round_ahead_shield",
  "round_team_atk",
  "round_team_heal",
  "team_atk_aura",
  "team_armor",
  "debuff_atk",
  "debuff_hp",
]);

function multiEffectGroupKey(item) {
  const ev = item?.ev;
  if (!ev || !MULTI_EFFECT_TYPES.has(ev.type)) return null;
  return [
    item.frameIndex,
    item.isOpening ? "opening" : "combat",
    ev.type,
    ev.side ?? "",
    ev.targetSide ?? "",
    ev.source?.uid ?? "",
    ev.effectHit ?? "",
  ].join("|");
}

function mergeAdjacentMultiEffects(items) {
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const key = multiEffectGroupKey(items[i]);
    if (!key) {
      out.push(items[i]);
      continue;
    }

    const events = [items[i].ev];
    let j = i + 1;
    while (j < items.length && multiEffectGroupKey(items[j]) === key) {
      events.push(items[j].ev);
      j += 1;
    }

    if (events.length > 1) {
      out.push({
        frameIndex: items[i].frameIndex,
        isOpening: items[i].isOpening,
        ev: null,
        bundleType: "multi_effect",
        events,
      });
    } else {
      out.push(items[i]);
    }
    i = j - 1;
  }
  return out;
}

const TRIGGERED_DAMAGE_TYPES = new Map([
  ["triple_strike_trigger", "triple_strike"],
  ["double_strike_trigger", "double_strike"],
  ["cleave_trigger", "cleave_strike"],
  ["round_lowest_enemy_trigger", "round_lowest_enemy_damage"],
  ["round_front_fixed_trigger", "round_front_fixed_damage"],
  ["death_front_percent", "death_front_percent_damage"],
  ["death_effect_count_aoe", "death_effect_count_damage"],
]);

function firstEventFromTimelineItem(item) {
  return Array.isArray(item?.events) ? item.events[0] : item?.ev;
}

/** 技能提示與它緊接的傷害共用一幕，避免「亮一下、停一下、才扣血」。 */
function mergeTriggeredEffects(items) {
  const out = [];
  for (let index = 0; index < items.length; index += 1) {
    const triggerItem = items[index];
    const trigger = triggerItem?.ev;
    const expectedDamageType = TRIGGERED_DAMAGE_TYPES.get(trigger?.type);
    const damageItem = items[index + 1];
    const firstDamage = firstEventFromTimelineItem(damageItem);
    const sameMoment = triggerItem && damageItem
      && triggerItem.isOpening === damageItem.isOpening
      && triggerItem.frameIndex === damageItem.frameIndex;
    const sameSource = !trigger?.source?.uid || !firstDamage?.source?.uid
      || trigger.source.uid === firstDamage.source.uid;
    if (expectedDamageType && sameMoment && sameSource && firstDamage?.type === expectedDamageType) {
      out.push({
        frameIndex: triggerItem.frameIndex,
        isOpening: triggerItem.isOpening,
        ev: null,
        bundleType: "triggered_effect",
        events: [trigger, ...(Array.isArray(damageItem.events) ? damageItem.events : [damageItem.ev])],
      });
      index += 1;
      continue;
    }
    out.push(triggerItem);
  }
  return out;
}

/** 順劈的主目標與第二目標在畫面上必須同時受擊。 */
function mergeCleaveIntoMainAttack(items) {
  const out = [];
  for (const item of items) {
    const cleave = item?.bundleType === "triggered_effect"
      ? item.events?.find((event) => event?.type === "cleave_strike")
      : null;
    const previous = out[out.length - 1];
    const canJoin = cleave
      && previous?.bundleType === "simultaneous_main_attack"
      && previous.frameIndex === item.frameIndex
      && previous.events?.some((event) => event?.source?.uid === cleave.source?.uid);
    if (canJoin) {
      previous.events.push(...item.events);
      continue;
    }
    out.push(item);
  }
  return out;
}

export function buildBattleTimelineItems(openingEvents = [], frames = []) {
  const items = [];
  if (Array.isArray(openingEvents)) {
    openingEvents.forEach((ev) => items.push({ ev, frameIndex: 0, isOpening: true }));
  }
  frames.forEach((frame, frameIndex) => {
    const sequence = Array.isArray(frame?.animationSequence) ? frame.animationSequence : null;
    if (sequence) {
      sequence.forEach((row) => {
        if (row?.event) items.push({ ev: row.event, frameIndex, isOpening: false });
      });
      return;
    }
    const events = Array.isArray(frame?.events) ? frame.events : [];
    events.forEach((ev) => items.push({ ev, frameIndex, isOpening: false }));
  });
  if (items.length === 0 && frames.length > 0) {
    frames.forEach((_, frameIndex) => items.push({ ev: null, frameIndex, isOpening: false }));
  }

  // 先合併雙方普通攻擊，避免 attack_all_damage 先被多目標合併後無法與對手攻擊同步。
  const mainAttacksMerged = mergeSimultaneousMainAttacks(items);
  const multiTargetsMerged = mergeAdjacentMultiEffects(mainAttacksMerged);
  const triggersMerged = mergeTriggeredEffects(multiTargetsMerged);
  return mergeCleaveIntoMainAttack(triggersMerged);
}

function expandTimelineEvents(it, isOpening = false) {
  if (!it || Boolean(it.isOpening) !== isOpening) return [];
  if (Array.isArray(it.events)) return it.events;
  return it.ev ? [it.ev] : [];
}

function currentDeathUidsForSide(events, side) {
  const out = new Set();
  for (const ev of Array.isArray(events) ? events : []) {
    const deaths = ev?.animation?.deaths;
    if (!Array.isArray(deaths)) continue;
    for (const death of deaths) {
      if (death?.side === side && death.pet?.uid != null) out.add(death.pet.uid);
    }
  }
  return out;
}

function stripFallenForDisplay(lineup, protectedDeathUids) {
  const keep = protectedDeathUids instanceof Set ? protectedDeathUids : new Set();
  return lineup.filter((pet) => pet && ((pet.hp ?? 0) > 0 || keep.has(pet.uid)));
}

function sliceCombatEventsForFrame(timeline, effectIndex, frameIdx) {
  const out = [];
  if (effectIndex < 0) return out;
  for (let i = 0; i <= effectIndex && i < timeline.length; i += 1) {
    const it = timeline[i];
    if (it.isOpening || it.frameIndex !== frameIdx) continue;
    out.push(...expandTimelineEvents(it));
  }
  return out;
}

export function buildOpeningLineups(openingLeftBefore, openingRightBefore, timeline, effectIndex) {
  const workingL = openingLeftBefore.map((p) => ({ ...p }));
  const workingR = (Array.isArray(openingRightBefore) ? openingRightBefore : []).map((p) => ({ ...p }));
  if (effectIndex < 0) return { left: workingL, right: [...workingR].reverse() };
  for (let i = 0; i <= effectIndex && i < timeline.length; i += 1) {
    const currentEvents = expandTimelineEvents(timeline[i], true);
    const protectedDeathUids = i === effectIndex
      ? {
          left: currentDeathUidsForSide(currentEvents, "left"),
          right: currentDeathUidsForSide(currentEvents, "right"),
        }
      : null;
    for (const ev of currentEvents) applyOpeningEventToLineupPair(workingL, workingR, ev, protectedDeathUids);
  }
  return { left: workingL, right: [...workingR].reverse() };
}

/** 將單一開戰事件套到左右陣列（依 uid），與 battleLogic 開戰結算一致 */
function applyOpeningEventToLineupPair(leftArr, rightArr, ev, protectedDeathUids = null) {
  if (!ev) return;
  const find = (arr, uid) => (Array.isArray(arr) ? arr.find((p) => p && p.uid === uid) : null);
  const lineup = (side) => (side === "left" ? leftArr : side === "right" ? rightArr : null);

  switch (ev.type) {
    case "team_armor": {
      const arr = lineup(ev.side);
      const t = find(arr, ev.target?.uid ?? ev.source?.uid);
      if (t && typeof ev.targetArmorAfter === "number") t.battleArmor = ev.targetArmorAfter;
      else if (t && typeof ev.battleArmorAfter === "number") t.battleArmor = ev.battleArmorAfter;
      break;
    }
    case "self_leech": {
      const arr = lineup(ev.side);
      const t = find(arr, ev.target?.uid ?? ev.source?.uid);
      if (t && typeof ev.targetLeechAfter === "number") t.battleLeech = ev.targetLeechAfter;
      break;
    }
    case "front_chaos": {
      const arr = lineup(ev.targetSide);
      const target = find(arr, ev.target?.uid);
      if (!target) return;
      target.atk = ev.atkAfter ?? target.atk;
      target.hp = ev.hpAfter ?? target.hp;
      target.maxHp = ev.maxHpAfter ?? target.maxHp;
      break;
    }
    case "debuff_atk":
    case "front_debuff_atk":
    case "back_debuff_atk": {
      const arr = lineup(ev.targetSide);
      const t = find(arr, ev.target?.uid);
      if (t && typeof ev.atkAfter === "number") t.atk = ev.atkAfter;
      break;
    }
    case "debuff_hp":
    case "back_debuff_hp": {
      const arr = lineup(ev.targetSide);
      const t = find(arr, ev.target?.uid);
      if (!t) return;
      if (typeof ev.hpAfter === "number") t.hp = ev.hpAfter;
      if (typeof ev.maxHpAfter === "number") t.maxHp = ev.maxHpAfter;
      break;
    }
    default: {
      const arr = lineup(ev.targetSide ?? ev.side);
      const target = find(arr, ev.target?.uid ?? ev.source?.uid);
      if (!target) break;
      if (typeof ev.targetAtkAfter === "number") target.atk = ev.targetAtkAfter;
      if (typeof ev.atkAfter === "number") target.atk = ev.atkAfter;
      if (typeof ev.targetHpAfter === "number") target.hp = ev.targetHpAfter;
      if (typeof ev.hpAfter === "number") target.hp = ev.hpAfter;
      if (typeof ev.targetMaxHpAfter === "number") target.maxHp = ev.targetMaxHpAfter;
      if (typeof ev.maxHpAfter === "number") target.maxHp = ev.maxHpAfter;
      if (typeof ev.targetArmorAfter === "number") target.battleArmor = ev.targetArmorAfter;
      if (typeof ev.dodgeAfter === "boolean") target.dodge = ev.dodgeAfter;
      const protectedForSide = protectedDeathUids?.[ev.targetSide ?? ev.side];
      if ((target.hp ?? 1) <= 0 && !protectedForSide?.has(target.uid)) arr.splice(arr.indexOf(target), 1);
      break;
    }
  }
}

const OPENING_BUFF_TYPES = new Set([
  "team_armor",
  "self_leech",
  "debuff_atk",
  "debuff_hp",
  "front_debuff_atk",
  "back_debuff_atk",
  "back_debuff_hp",
  "front_chaos",
]);

function uidLineupIndex(lineup, uid) {
  if (uid == null) return -1;
  return lineup.findIndex((p) => p && p.uid === uid);
}

export function scheduledEffectCountdown(pet, currentRound) {
  const schedules = [
    ["roundTenEnemyAllDamage", 10],
  ];
  const turns = schedules
    .filter(([key]) => Number(pet?.special?.[key] ?? 0) !== 0)
    .map(([, turn]) => turn);
  if (!turns.length) return null;
  const remaining = Math.min(...turns) - Math.max(0, currentRound);
  return remaining >= 0 ? remaining : null;
}

function buffFlyLabel(ev) {
  if (!ev) return "";
  if (ev.heal != null) return `+${ev.heal}`;
  if (ev.atkDelta != null && Number(ev.atkDelta)) return `+${ev.atkDelta}`;
  if (ev.extraDamage != null && Number(ev.extraDamage)) return `+${ev.extraDamage}`;
  if (ev.armorDelta != null && Number(ev.armorDelta)) return `+${ev.armorDelta}`;
  if (ev.leechDelta != null && Number(ev.leechDelta)) return `+${ev.leechDelta}`;
  if (ev.reduction != null && Number(ev.reduction)) return `-${ev.reduction}`;
  return "+";
}

/** 單一特效對應「左／右陣列上」要播格內動畫的格（若有）。 */
export function petSlotFxFromEffect(ev, leftLineup, rightLineup) {
  const empty = { left: null, right: null };
  if (!ev) return empty;

  const iconForKind = (kind) =>
    kind === "heal" || kind === "cast-heal" ? BI.heal :
      kind === "atk" || kind === "cast-atk" ? BI.atkBuff :
        kind === "armor" || kind === "armor-block" || kind === "guard" || kind === "cast-armor" || kind === "cast-guard" ? BI.armor :
          kind === "damage" || kind === "debuff" || kind === "chaos" || kind === "cast-damage" || kind === "cast-debuff" || kind === "cast-chaos" ? BI.damage :
            BI.star;

  const slotFor = (side, uid, kind, flyText, extra = {}) => {
    const lineup = side === "left" ? leftLineup : rightLineup;
    const idx = uidLineupIndex(lineup, uid);
    if (idx < 0) return null;
    return { idx, kind, flyText: flyText ?? "", iconSrc: iconForKind(kind), ...extra };
  };

  const pack = (...rows) => {
    const bySide = { left: [], right: [] };
    rows.filter(Boolean).forEach(({ side, slot }) => {
      if (!slot) return;
      bySide[side].push(slot);
    });
    return {
      left: bySide.left.length ? bySide.left : null,
      right: bySide.right.length ? bySide.right : null,
    };
  };

  const floatSizeFor = (amount) => {
    const magnitude = Math.abs(Number(amount) || 0);
    if (magnitude <= 0) return 15;
    return Math.max(15, Math.min(36, Math.round(3 * Math.log2(magnitude) + 10)));
  };
  const targetFx = (side, uid, kind, flyText, extra = {}) => ({ side, slot: slotFor(side, uid, kind, flyText, extra) });
  const casterFx = (kind, { allowSelf = false } = {}) => {
    if (!ev.source?.uid || !ev.side) return null;
    const targetUid = ev.target?.uid;
    const targetSide = ev.targetSide ?? ev.side;
    if (!allowSelf && targetUid === ev.source.uid && targetSide === ev.side) return null;
    return { side: ev.side, slot: slotFor(ev.side, ev.source.uid, `cast-${kind}`, "", { showFly: false }) };
  };

  // 顯示減傷後的完整傷害，允許數值超過目標剩餘生命（overkill）。
  const damage = ev.damageApplied ?? ev.effectiveDamageToHp;
  if (ev.target?.uid && ev.targetSide && damage != null) {
    const reduced = Math.max(0, Number(ev.mitigatedDamage ?? ev.damageReduced ?? ev.shieldAbsorbed ?? 0));
    return pack(
      casterFx("damage"),
      reduced > 0
        ? targetFx(ev.targetSide, ev.target.uid, "armor-block", `-${Math.max(0, damage)}`, { fontSize: floatSizeFor(damage), blockedAmount: reduced })
        : targetFx(ev.targetSide, ev.target.uid, "damage", `-${Math.max(0, damage)}`, { fontSize: floatSizeFor(damage) })
    );
  }
  if (ev.type === "dodge") return pack(targetFx(ev.side, ev.source?.uid ?? ev.target?.uid, "dodge", "閃避"));
  if (ev.type === "mount_dodge") return pack(casterFx("dodge"), targetFx(ev.side, ev.target?.uid, "dodge", "閃避"));
  if (ev.type === "damage_redirect") return pack(targetFx(ev.side, ev.source?.uid, "guard", "承擔"));
  if (ev.type === "round_front_summon") {
    return pack(
      casterFx("summon"),
      targetFx(ev.targetSide ?? ev.side, ev.target?.uid ?? ev.summoned?.uid, "summon", "召喚")
    );
  }
  if (ev.type === "death_split") {
    return pack(
      targetFx(ev.targetSide ?? ev.side, ev.target?.uid, "split", "分裂"),
      targetFx(ev.targetSide ?? ev.side, ev.secondaryTarget?.uid, "split", "分裂")
    );
  }
  if (ev.type === "triple_strike_trigger") {
    return pack(targetFx(ev.side, ev.source?.uid, "atk", `第 ${ev.hit} 擊`));
  }
  if (ev.type === "front_chaos") return pack(casterFx("chaos"), targetFx(ev.targetSide, ev.target?.uid, "chaos", "轉換"));
  if (ev.heal != null && ev.target?.uid) return pack(casterFx("heal", { allowSelf: true }), targetFx(ev.side, ev.target.uid, "heal", `+${ev.heal}`, { fontSize: floatSizeFor(ev.heal) }));

  const statFx = [];
  if (typeof ev.armorDelta === "number" && ev.armorDelta !== 0 && ev.target?.uid) {
    statFx.push(casterFx("armor", { allowSelf: ev.armorDelta > 0 }), targetFx(ev.targetSide ?? ev.side, ev.target.uid, "armor", `${ev.armorDelta >= 0 ? "+" : ""}${ev.armorDelta}`, { fontSize: floatSizeFor(ev.armorDelta) }));
  }
  if (typeof ev.hpDelta === "number" && ev.hpDelta !== 0 && ev.target?.uid) {
    const kind = ev.hpDelta >= 0 ? "heal" : "damage";
    statFx.push(casterFx(kind, { allowSelf: kind === "heal" }), targetFx(ev.targetSide ?? ev.side, ev.target.uid, kind, `${ev.hpDelta >= 0 ? "+" : ""}${ev.hpDelta}`, { fontSize: floatSizeFor(ev.hpDelta) }));
  }
  if (typeof ev.atkDelta === "number" && ev.atkDelta !== 0 && (ev.target?.uid || ev.source?.uid)) {
    const kind = ev.atkDelta >= 0 ? "atk" : "debuff";
    statFx.push(casterFx(kind, { allowSelf: ev.atkDelta > 0 }), targetFx(ev.targetSide ?? ev.side, ev.target?.uid ?? ev.source?.uid, kind, `${ev.atkDelta >= 0 ? "+" : ""}${ev.atkDelta}`, { fontSize: floatSizeFor(ev.atkDelta) }));
  }
  if (statFx.length) return pack(...statFx);

  if (OPENING_BUFF_TYPES.has(ev.type)) {
    if (ev.type === "team_armor") {
      return pack(casterFx("armor"), targetFx(ev.side, ev.target?.uid ?? ev.source?.uid, "armor", buffFlyLabel(ev)));
    }
    if (ev.type === "self_leech") return pack(targetFx(ev.side, ev.target?.uid ?? ev.source?.uid, "buff", buffFlyLabel(ev)));
    if (
      ev.type === "debuff_atk" ||
      ev.type === "front_debuff_atk" ||
      ev.type === "back_debuff_atk" ||
      ev.type === "debuff_hp" ||
      ev.type === "back_debuff_hp"
      || ev.type === "front_chaos"
    ) {
      const kind = ev.type === "front_chaos" ? "chaos" : "debuff";
      return pack(casterFx(kind), targetFx(ev.targetSide, ev.target?.uid, kind, buffFlyLabel(ev)));
    }
    return empty;
  }

  if (ev.type === "leech_heal") return pack(targetFx(ev.side, ev.source?.uid, "heal", buffFlyLabel(ev)));
  if (ev.type === "self_heal") return pack(targetFx(ev.side, ev.source?.uid, "heal", buffFlyLabel(ev)));
  if (ev.type === "post_attack_self_armor") return pack(targetFx(ev.side, ev.source?.uid, "armor", buffFlyLabel(ev)));
  if (ev.type === "round_shield" || ev.type === "death_double_shield")
    return pack(casterFx("armor"), targetFx(ev.side, ev.target?.uid ?? ev.source?.uid, "armor", buffFlyLabel(ev)));
  if (ev.type === "round_end_halve_hp") return pack(targetFx(ev.side, ev.target?.uid, "damage", undefined));
  if (ev.type === "kill_atk" || ev.type === "first_strike_extra")
    return pack(targetFx(ev.side, ev.source?.uid, "atk", buffFlyLabel(ev)));

  if (COMBAT_DAMAGE_TYPES.has(ev.type) && ev.targetSide && ev.target?.uid) {
    return pack(casterFx("damage"), targetFx(ev.targetSide, ev.target.uid, "damage", `-${Math.max(0, ev.damageApplied ?? ev.effectiveDamageToHp ?? 0)}`));
  }
  return empty;
}

function petSlotFxFromTimelineSlot(slot, leftLineup, rightLineup) {
  const empty = { left: null, right: null };
  if (!slot) return empty;
  if (!Array.isArray(slot.events)) {
    return petSlotFxFromEffect(slot?.ev, leftLineup, rightLineup);
  }

  const bySide = { left: [], right: [] };
  const seenBySide = { left: new Set(), right: new Set() };
  for (const ev of slot.events) {
    const fx = petSlotFxFromEffect(ev, leftLineup, rightLineup);
    // 多目標原子效果必須保留每一格的 overlay；不能把陣列再包成巢狀陣列。
    for (const side of ["left", "right"]) {
      for (const row of fx[side] ?? []) {
        const key = [row.idx, row.kind, row.flyText, row.showFly].join("|");
        if (seenBySide[side].has(key)) continue;
        seenBySide[side].add(key);
        bySide[side].push(row);
      }
    }
  }
  return {
    left: bySide.left.length ? bySide.left : null,
    right: bySide.right.length ? bySide.right : null,
  };
}

function slotPlaybackMs(slot, speed) {
  if (slot?.bundleType === "simultaneous_main_attack") return scaledTimelineMs(820, speed);
  if (slot?.bundleType === "multi_effect") {
    const count = Math.max(1, slot.events?.length ?? 1);
    return scaledTimelineMs(Math.min(980, EFFECT_MS + (count - 1) * 45), speed);
  }
  if (slot?.bundleType === "triggered_effect") return scaledTimelineMs(860, speed);
  return scaledTimelineMs(EFFECT_MS, speed);
}

function bundledEffectForSlot(slot) {
  if (!slot) return null;
  if (!Array.isArray(slot.events) || slot.events.length === 0) {
    return slot.ev ?? null;
  }
  const first = slot.bundleType === "triggered_effect"
    ? slot.events.find((event) => event?.animation?.damages?.length || event?.animation?.attacks?.length) ?? slot.events[0]
    : slot.events[0];
  return {
    ...first,
    target: null,
    targets: slot.events.map((ev) => ev.target).filter(Boolean),
    targetCount: slot.events.length,
    bundleType: slot.bundleType,
    events: slot.events,
  };
}

export function petMotionFromEffects(events, leftLineup, rightLineup) {
  const rows = Array.isArray(events) ? events : [];
  const animations = rows.map((ev) => ev?.animation).filter(Boolean);
  const build = (side, lineup) => {
    const attackIndices = animations
      .flatMap((animation) => animation.attacks ?? [])
      .filter((row) => row?.side === side && row.pet?.uid != null)
      .map((row) => uidLineupIndex(lineup, row.pet.uid))
      .filter((index) => index >= 0);
    const deathIndices = animations
      .flatMap((animation) => animation.deaths ?? [])
      .filter((row) => row?.side === side && row.pet?.uid != null)
      .map((row) => uidLineupIndex(lineup, row.pet.uid))
      .filter((index) => index >= 0);
    if (!attackIndices.length && !deathIndices.length) return null;
    return {
      attackIndices: [...new Set(attackIndices)],
      deathIndices: [...new Set(deathIndices)],
    };
  };
  return {
    left: build("left", leftLineup),
    right: build("right", rightLineup),
  };
}

function statRefForPet(displayPet, baselineLineup) {
  if (!displayPet) return { atk: 0, hp: 0 };
  const b = Array.isArray(baselineLineup) ? baselineLineup.find((x) => x && x.uid === displayPet.uid) : null;
  return { atk: b?.atk ?? displayPet.atk, hp: b?.hp ?? displayPet.hp };
}

/** 首回合若 before 為空陣列，避免誤用 [] 而應改用戰後快照（修復首幀／首擊顯示異常） */
function lineupBeforeOrAfter(frame, side) {
  if (!frame) return [];
  const beforeKey = side === "left" ? "leftLineupBefore" : "rightLineupBefore";
  const afterKey = side === "left" ? "leftLineup" : "rightLineup";
  const before = frame[beforeKey];
  const after = frame[afterKey];
  if (Array.isArray(before) && before.length > 0) return before;
  if (Array.isArray(after) && after.length > 0) return after;
  return Array.isArray(before) ? before : after ?? [];
}

/**
 * 單場戰鬥 timeline 播放控制：
 * - 把 opening events + 每回合 combat events 串成 timeline
 * - 以 effectIndex 對應目前要展示/播放的單一效果
 * - showFinalPose 決定戰鬥陣列顯示哪個快照
 */
export function useBattleTimeline({ battleReplay }) {
  const [paused, setPaused] = useState(false);
  const [effectIndex, setEffectIndex] = useState(-1);
  const [showFinalPose, setShowFinalPose] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [timelineRestartNonce, setTimelineRestartNonce] = useState(0);

  const finalPoseTimeoutRef = useRef(null);
  const intervalRef = useRef(null);

  const frames = battleReplay?.frames ?? [];

  const openingEvents = battleReplay?.battleDetail?.opening?.events ?? [];

  const timeline = useMemo(() => {
    return buildBattleTimelineItems(openingEvents, frames);
  }, [frames, openingEvents]);

  const effectCount = timeline.length;
  const lastIndex = Math.max(0, effectCount - 1);

  const effectStepMs = useMemo(
    () => slotPlaybackMs(timeline[effectIndex], playbackSpeed),
    [timeline, effectIndex, playbackSpeed]
  );
  const preFirstMs = useMemo(
    () => scaledTimelineMs(PRE_FIRST_EFFECT_MS, playbackSpeed),
    [playbackSpeed]
  );
  const finalPoseDelayMs = useMemo(
    () => scaledTimelineMs(FINAL_POSE_DELAY_MS, playbackSpeed),
    [playbackSpeed]
  );

  const openingLeftBefore = battleReplay?.battleDetail?.opening?.leftLineupBeforeOpen;
  const openingRightBefore = battleReplay?.battleDetail?.opening?.rightLineupBeforeOpen;

  /** 僅在換一場重播時變動，避免父層每次 render 新物件參考導致時間軸被重設 */
  const replaySyncKey = useMemo(() => {
    const f = battleReplay?.frames;
    if (!battleReplay || !Array.isArray(f) || f.length === 0) {
      return battleReplay ? `no-frames|${battleReplay.encounterId ?? ""}|${openingEvents.length}` : null;
    }
    return [
      f.length,
      battleReplay.encounterId ?? "",
      openingEvents.length,
      f[0]?.leftPet?.name ?? "",
      f[f.length - 1]?.leftPet?.name ?? "",
    ].join("|");
  }, [battleReplay, battleReplay?.frames, battleReplay?.encounterId, openingEvents.length]);

  const inOpeningPhase = useMemo(() => {
    if (showFinalPose || effectIndex < 0) return false;
    const openingEventCount = timeline.filter((t) => t.isOpening).length;
    return (
      openingEventCount > 0 &&
      Array.isArray(openingLeftBefore) &&
      openingLeftBefore.length > 0 &&
      effectIndex < openingEventCount
    );
  }, [showFinalPose, timeline, openingLeftBefore, effectIndex]);

  const displayFrameIndex = showFinalPose
    ? Math.max(0, frames.length - 1)
    : effectIndex < 0
      ? 0
      : (timeline[effectIndex]?.frameIndex ?? 0);

  const currentFrame = frames[displayFrameIndex] ?? null;

  const currentEffect = showFinalPose || effectIndex < 0 ? null : bundledEffectForSlot(timeline[effectIndex]);
  const battleLogSlots = useMemo(() => {
    if (effectIndex < 0) return [];
    const end = showFinalPose ? timeline.length : Math.min(timeline.length, effectIndex + 1);
    return timeline.slice(0, end);
  }, [timeline, effectIndex, showFinalPose]);

  const { leftLineupDisplay, rightLineupDisplay, leftStatRefs, rightStatRefs, petSlotFx, petMotionFx, dualMainStrike } = useMemo(() => {
    const emptyFx = { left: null, right: null };
    const emptyMotion = { left: null, right: null };
    const empty = {
      leftLineupDisplay: [],
      rightLineupDisplay: [],
      leftStatRefs: [],
      rightStatRefs: [],
      petSlotFx: emptyFx,
      petMotionFx: emptyMotion,
      dualMainStrike: null,
    };
    if (!currentFrame) return empty;

    if (effectIndex < 0 && !showFinalPose) {
      const hasOpenSnap = Array.isArray(openingLeftBefore) && openingLeftBefore.length > 0;
      if (hasOpenSnap) {
        const { left, right } = buildOpeningLineups(openingLeftBefore, openingRightBefore, timeline, -1);
        const rb = openingRightBefore ?? [];
        return {
          leftLineupDisplay: left,
          rightLineupDisplay: right,
          leftStatRefs: left.map((p) => statRefForPet(p, openingLeftBefore)),
          rightStatRefs: right.map((p) => statRefForPet(p, rb)),
          petSlotFx: emptyFx,
          petMotionFx: emptyMotion,
          dualMainStrike: null,
        };
      }
      const statF = currentFrame;
      const left0 = lineupBeforeOrAfter(statF, "left");
      const rightRaw = lineupBeforeOrAfter(statF, "right");
      const rightRev = [...rightRaw].reverse();
      return {
        leftLineupDisplay: left0.map((p) => ({ ...p })),
        rightLineupDisplay: rightRev.map((p) => ({ ...p })),
        leftStatRefs: left0.map((p) => statRefForPet(p, left0)),
        rightStatRefs: rightRev.map((p) => statRefForPet(p, rightRaw)),
        petSlotFx: emptyFx,
        petMotionFx: emptyMotion,
        dualMainStrike: null,
      };
    }

    if (inOpeningPhase) {
      const { left, right } = buildOpeningLineups(openingLeftBefore, openingRightBefore, timeline, effectIndex);
      const rb = openingRightBefore ?? [];
      const slotOpening = timeline[effectIndex];
      const petFx =
        !showFinalPose && inOpeningPhase && slotOpening ? petSlotFxFromTimelineSlot(slotOpening, left, right) : emptyFx;
      const openingEvents = slotOpening ? expandTimelineEvents(slotOpening, true) : [];
      return {
        leftLineupDisplay: left,
        rightLineupDisplay: right,
        leftStatRefs: left.map((p) => statRefForPet(p, openingLeftBefore)),
        rightStatRefs: right.map((p) => statRefForPet(p, rb)),
        petSlotFx: petFx,
        petMotionFx: !showFinalPose ? petMotionFromEffects(openingEvents, left, right) : emptyMotion,
        dualMainStrike: null,
      };
    }

    const statFrame = showFinalPose && frames.length ? frames[frames.length - 1] : currentFrame;
    const leftBaseline = lineupBeforeOrAfter(statFrame, "left");
    const rightBaseline = lineupBeforeOrAfter(statFrame, "right");

    const leftBase = showFinalPose ? currentFrame.leftLineup ?? [] : lineupBeforeOrAfter(currentFrame, "left");
    const rightBase = showFinalPose ? currentFrame.rightLineup ?? [] : lineupBeforeOrAfter(currentFrame, "right");

    const slot = effectIndex >= 0 ? timeline[effectIndex] : null;
    const currentSlotEvents = slot ? expandTimelineEvents(slot) : [];
    const combatEvs = showFinalPose ? [] : sliceCombatEventsForFrame(timeline, effectIndex, displayFrameIndex);

    let leftW = leftBase.map((p) => ({ ...p }));
    if (!showFinalPose) applyCombatEventsToLineup(leftW, combatEvs, "left");
    if (!showFinalPose) {
      leftW = stripFallenForDisplay(leftW, currentDeathUidsForSide(currentSlotEvents, "left"));
    }

    let rightW = rightBase.map((p) => ({ ...p }));
    let rightDisplay;
    if (showFinalPose) rightDisplay = [...rightW].reverse();
    else {
      applyCombatEventsToLineup(rightW, combatEvs, "right");
      rightW = stripFallenForDisplay(rightW, currentDeathUidsForSide(currentSlotEvents, "right"));
      rightDisplay = rightW.reverse();
    }

    let dual = null;
    let petFx = emptyFx;
    let motionFx = emptyMotion;
    if (!showFinalPose && slot) {
      if (slot.bundleType === "simultaneous_main_attack" && Array.isArray(slot.events)) {
        dual = slot.events;
        petFx = petSlotFxFromTimelineSlot(slot, leftW, rightDisplay);
        motionFx = petMotionFromEffects(slot.events, leftW, rightDisplay);
      } else if (slot.ev) {
        petFx = petSlotFxFromTimelineSlot(slot, leftW, rightDisplay);
        motionFx = petMotionFromEffects([slot.ev], leftW, rightDisplay);
      } else if (Array.isArray(slot.events)) {
        petFx = petSlotFxFromTimelineSlot(slot, leftW, rightDisplay);
        motionFx = petMotionFromEffects(slot.events, leftW, rightDisplay);
      }
    }

    return {
      leftLineupDisplay: leftW,
      rightLineupDisplay: rightDisplay,
      leftStatRefs: leftW.map((p) => statRefForPet(p, leftBaseline)),
      rightStatRefs: rightDisplay.map((p) => statRefForPet(p, rightBaseline)),
      petSlotFx: petFx,
      petMotionFx: motionFx,
      dualMainStrike: dual,
    };
  }, [
    currentFrame,
    inOpeningPhase,
    openingLeftBefore,
    openingRightBefore,
    timeline,
    effectIndex,
    showFinalPose,
    displayFrameIndex,
    frames,
  ]);

  const leftFrontIndex = leftLineupDisplay.length - 1;

  function cancelFinalPoseTimeout() {
    if (finalPoseTimeoutRef.current) {
      window.clearTimeout(finalPoseTimeoutRef.current);
      finalPoseTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    setPaused(false);
    setEffectIndex(timeline.length > 0 ? -1 : 0);
    setShowFinalPose(false);
    cancelFinalPoseTimeout();
    if (intervalRef.current) {
      window.clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  }, [replaySyncKey, timeline.length]);

  useEffect(() => {
    cancelFinalPoseTimeout();
    return undefined;
  }, [paused]);

  useEffect(() => {
    if (!battleReplay) return undefined;
    if (paused) return undefined;
    if (showFinalPose) return undefined;
    if (effectCount <= 0) return undefined;
    if (effectIndex !== -1) return undefined;
    const t = window.setTimeout(() => {
      setEffectIndex(0);
    }, preFirstMs);
    return () => window.clearTimeout(t);
  }, [battleReplay, paused, showFinalPose, effectCount, effectIndex, preFirstMs, timelineRestartNonce]);

  useEffect(() => {
    if (!battleReplay) return undefined;
    if (paused) return undefined;
    if (showFinalPose) return undefined;
    if (effectCount <= 1) return undefined;
    if (effectIndex < 0) return undefined;
    if (effectIndex >= lastIndex) return undefined;

    intervalRef.current = window.setTimeout(() => {
      setEffectIndex((prev) => Math.min(prev + 1, lastIndex));
    }, effectStepMs);

    return () => {
      if (intervalRef.current) {
        window.clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [battleReplay, paused, showFinalPose, effectCount, effectIndex, lastIndex, effectStepMs]);

  useEffect(() => {
    if (!battleReplay) return undefined;
    if (paused) return undefined;
    if (showFinalPose) return undefined;
    if (effectIndex < 0) return undefined;
    if (effectIndex !== lastIndex) return undefined;

    finalPoseTimeoutRef.current = window.setTimeout(() => {
      setShowFinalPose(true);
    }, finalPoseDelayMs);

    return () => cancelFinalPoseTimeout();
  }, [battleReplay, paused, showFinalPose, effectIndex, effectCount, lastIndex, finalPoseDelayMs]);

  function stepBy(delta) {
    if (effectCount <= 0) return;
    const minIdx = effectCount > 0 ? -1 : 0;
    cancelFinalPoseTimeout();
    setShowFinalPose(false);
    setPaused(true);
    setEffectIndex((prev) => Math.max(minIdx, Math.min(lastIndex, prev + delta)));
  }

  function endBattle() {
    cancelFinalPoseTimeout();
    setPaused(true);
    setEffectIndex(lastIndex);
    setShowFinalPose(true);
  }

  function goToStart() {
    if (effectCount <= 0) return;
    cancelFinalPoseTimeout();
    if (intervalRef.current) {
      window.clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setShowFinalPose(false);
    setEffectIndex(timeline.length > 0 ? -1 : 0);
    setPaused(false);
    setTimelineRestartNonce((n) => n + 1);
  }

  return {
    paused,
    setPaused,
    playbackSpeed,
    setPlaybackSpeed,
    effectIndex,
    effectCount,
    showFinalPose,
    inOpeningPhase,
    beforeFirstEffect: effectIndex < 0 && effectCount > 0,
    displayFrameIndex,
    currentFrame,
    currentEffect,
    battleLogSlots,
    leftLineupDisplay,
    rightLineupDisplay,
    leftStatRefs,
    rightStatRefs,
    leftFrontIndex,
    petSlotFx,
    petMotionFx,
    dualMainStrike,
    stepPrev: () => stepBy(-1),
    stepNext: () => stepBy(1),
    endBattle,
    goToStart,
  };
}
