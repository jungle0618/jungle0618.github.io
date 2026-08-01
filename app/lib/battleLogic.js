import { getArmorCap } from "./characterConfig";
import { BATTLE_TURN_LIMIT } from "./gameConfig";

const MAX_BATTLE_STEPS = BATTLE_TURN_LIMIT;
// 開戰效果視為第 1 回合，因此奇數回合閃避在開戰傷害上也會生效。
const OPENING_BATTLE_STEP = 1;
const RANGE_DAMAGE_TYPES = new Set(["cleave_strike", "attack_all_damage", "opening_enemy_all_damage", "round_enemy_all_damage", "death_effect_count_damage", "death_enemy_all_damage"]);
const EFFECT_DAMAGE_TYPES = new Set([
  "opening_missile_damage",
  "opening_lowest_damage",
  "opening_enemy_all_damage",
  "round_lowest_enemy_damage",
  "round_front_fixed_damage",
  "round_enemy_all_damage",
  "death_front_percent_damage",
  "death_effect_count_damage",
  "death_enemy_all_damage",
  "death_front_damage",
  "death_backline_damage",
]);
function petBrief(pet) {
  if (!pet) return null;
  return { uid: pet.uid, name: pet.displayName ?? pet.name, ownerName: pet.ownerName, image: pet.image, mountImage: pet.mountImage, mountName: pet.mountName, level: pet.level ?? 1 };
}

function snapshotLineup(lineup) {
  return lineup.map((pet) => ({
    uid: pet.uid,
    name: pet.displayName ?? pet.name,
    ownerName: pet.ownerName,
    image: pet.image,
    mountImage: pet.mountImage,
    mountName: pet.mountName,
    level: pet.level ?? 1,
    tier: pet.tier,
    isEnemy: Boolean(pet.isEnemy),
    special: pet.special ?? {},
    atk: Math.floor(pet.atk ?? 0),
    hp: Math.floor(pet.hp ?? 0),
    maxHp: Math.floor(pet.maxHp ?? pet.hp ?? 0),
    battleArmor: Math.floor(pet.battleArmor ?? 0),
    dodge: Boolean(pet.dodge ?? pet.special?.dodge),
    taunt: Boolean(pet.taunt),
    pierce: Boolean(pet.pierce),
  }));
}

function buildFighter(pet, uid) {
  const level = pet.level ?? 1;
  const livingEnemyAtkBase = pet.special?.livingEnemyAtkPerUnit
    ? Math.max(0, Math.floor(pet.livingEnemyAtkBase ?? pet.atk ?? 0))
    : null;
  const livingEnemyHpBase = pet.special?.livingEnemyHpPerUnit
    ? Math.max(1, Math.floor(pet.livingEnemyHpBase ?? pet.hp ?? 1))
    : null;
  const deathSplitInitialAtk = pet.special?.deathSplitMaxGenerations
    ? Math.max(0, Math.floor(pet.deathSplitInitialAtk ?? pet.atk ?? 0))
    : undefined;
  const deathSplitInitialHp = pet.special?.deathSplitMaxGenerations
    ? Math.max(1, Math.floor(pet.deathSplitInitialHp ?? pet.hp ?? 1))
    : undefined;
  return {
    ...pet,
    uid,
    ownerName: pet.ownerName ?? pet.displayName ?? pet.name,
    atk: Math.floor(pet.atk ?? 0),
    hp: Math.floor(pet.hp ?? 0),
    maxHp: Math.floor(pet.hp ?? 0),
    battleArmor: pet.isEnemy
      ? Math.max(0, Math.floor(pet.battleArmor ?? 0))
      : Math.min(getArmorCap(level), Math.floor(pet.battleArmor ?? 0)),
    dodge: Boolean(pet.special?.dodge),
    auraBonus: 0,
    effectResolved: {},
    ...(deathSplitInitialAtk != null ? {
      deathSplitInitialAtk,
      deathSplitInitialHp,
      deathSplitGeneration: Math.max(0, Math.floor(pet.deathSplitGeneration ?? 0)),
    } : {}),
    ...(livingEnemyAtkBase != null ? { livingEnemyAtkBase } : {}),
    ...(livingEnemyHpBase != null ? { livingEnemyHpBase } : {}),
  };
}

function buildContributions(initialLeft, openingEvents, frames) {
  const byUid = new Map(initialLeft.map((pet) => [pet.uid, pet]));
  const rows = new Map();
  const rowFor = (pet) => {
    if (!pet) return null;
    const original = byUid.get(pet.uid) ?? pet;
    const name = original.ownerName ?? original.name;
    if (!name) return null;
    if (!rows.has(name)) rows.set(name, { name, image: original.image, damage: 0, damageTaken: 0, buffs: 0, armor: 0 });
    return rows.get(name);
  };
  initialLeft.forEach(rowFor);
  const events = [...openingEvents, ...frames.flatMap((frame) => frame.events ?? [])];
  events.forEach((event) => {
    const source = event.side === "left" ? rowFor(event.source) : null;
    const target = event.targetSide === "left" ? rowFor(event.target) : null;
    if (source) {
      if (event.source?.uid !== event.target?.uid) source.damage += Math.max(0, event.effectiveDamageToHp ?? 0);
      source.buffs += Math.max(0, event.atkDelta ?? 0) + Math.max(0, event.hpDelta ?? 0) + Math.max(0, event.heal ?? 0);
      source.armor += Math.max(0, event.armorDelta ?? 0);
    }
    if (target) target.damageTaken += Math.max(0, event.effectiveDamageToHp ?? 0);
  });
  return [...rows.values()];
}

function stripFallen(lineup) {
  for (let i = lineup.length - 1; i >= 0; i -= 1) {
    if ((lineup[i]?.hp ?? 0) <= 0) lineup.splice(i, 1);
  }
}

function lowestHpTarget(lineup) {
  return lineup.reduce((chosen, pet) => {
    if (!pet || pet.hp <= 0) return chosen;
    if (!chosen || pet.hp < chosen.hp) return pet;
    return chosen;
  }, null);
}

function highestHpTarget(lineup) {
  return lineup.reduce((chosen, pet) => (!chosen || pet.hp > chosen.hp ? pet : chosen), null);
}

function isAlive(pet) {
  return Boolean(pet && pet.hp > 0);
}

// 同一個全隊乘算效果不因相同角色重複上場而連乘，只採用其中最強的倍率。
// 放大效果取最大值；減傷、壓制等縮小效果取最小值。
function strongestLineupMultiplier(lineup, keys, mode) {
  const effectKeys = Array.isArray(keys) ? keys : [keys];
  return (lineup ?? [])
    .filter(isAlive)
    .reduce((strongest, pet) => {
      const key = effectKeys.find((candidate) => pet.special?.[candidate] != null);
      if (!key) return strongest;
      const value = Number(pet.special[key]);
      if (!Number.isFinite(value)) return strongest;
      return mode === "amplify" ? Math.max(strongest, value) : Math.min(strongest, value);
    }, 1);
}

function livingAhead(lineup, index) {
  return lineup.slice(index + 1).filter(isAlive);
}

function adjacentAllies(lineup, index) {
  return [lineup[index - 1], lineup[index + 1]].filter(isAlive);
}

/**
 * 戰鬥中的所有生命增加都必須經過此處。
 * 鯉魚王進化是編隊資料換面板，並非戰鬥中的生命增加，因此不使用這個函式。
 */
function gainHp(source, target, amount, opposingLineup = [], { isAllyHealing = false } = {}) {
  if (!target || target.hp <= 0 || amount <= 0) return 0;
  const comesFromAnotherAlly = source?.uid != null && source.uid !== target.uid;
  if (target.special?.cannotReceiveAllyHealing && (comesFromAnotherAlly || (isAllyHealing && source?.uid !== target.uid))) return 0;
  const multiplier = strongestLineupMultiplier(
    opposingLineup,
    ["enemyHpGainMultiplier", "enemyHealingMultiplier"],
    "reduce"
  );
  const gained = Math.max(0, Math.floor(amount * multiplier));
  target.hp = Math.floor(target.hp + gained);
  target.maxHp = Math.floor(target.maxHp + gained);
  return gained;
}

function addAtk(target, amount) {
  if (!target || target.hp <= 0 || amount <= 0) return false;
  target.atk = Math.floor(target.atk + amount);
  return true;
}

function addArmor(target, amount, lineup, opposingLineup = []) {
  if (!target || target.hp <= 0 || amount <= 0) return { armor: 0, atk: 0, hp: 0 };
  const before = Math.floor(target.battleArmor ?? 0);
  const cap = target.isEnemy ? Infinity : getArmorCap(target.level ?? 1);
  target.battleArmor = Math.min(cap, before + Math.floor(amount));
  const gained = target.battleArmor - before;
  if (gained <= 0) return { armor: 0, atk: 0, hp: 0 };
  const auraStats = (lineup ?? [])
    .filter((pet) => pet.hp > 0 && (pet.special?.shieldGainStats || pet.special?.shieldGainHp))
    .reduce((sum, pet) => ({
      atk: sum.atk + Number(pet.special?.shieldGainStats ?? 0),
      hp: sum.hp + Number(pet.special?.shieldGainStats ?? 0) + Number(pet.special?.shieldGainHp ?? 0),
    }), { atk: 0, hp: 0 });
  const atkGain = Math.floor(gained * (auraStats.atk + Number(target.special?.atkPerArmorGained ?? 0)));
  const hpGain = Math.floor(gained * auraStats.hp);
  target.atk += atkGain;
  const hpDelta = gainHp(null, target, hpGain, opposingLineup, { isAllyHealing: true });
  return { armor: gained, atk: atkGain, hp: hpDelta };
}

function makeContext() {
  return { effectCount: 0, resolvingDeaths: false, deathCount: 0 };
}

function emitEffect(ctx, emit, event) {
  ctx.effectCount += 1;
  emit?.(event);
}

/**
 * 同一時點的效果排程器。
 *
 * 呼叫端只要依左至右建立角色順序、依技能順序提供 effects；每個效果完成後
 * 都會先清空死亡連鎖。角色在中途死亡或被移出隊伍時，剩餘效果自動略過。
 * 範圍傷害等需要同時命中多個目標的行為，應包成同一個 effect。
 */
function runEffectSequence({ source, lineup, effects, settle, allowDeadSource = false }) {
  for (const effect of effects) {
    if ((!allowDeadSource && !isAlive(source)) || !lineup.includes(source)) break;
    effect();
    settle();
  }
}

function runLineupEffectSequence({ lineup, createEffects, settle }) {
  for (const source of [...lineup]) {
    if (!isAlive(source) || !lineup.includes(source)) continue;
    runEffectSequence({ source, lineup, effects: createEffects(source), settle });
  }
}

function makeEffectEmitter(ctx, emit, side, source) {
  return (type, target, values = {}) => emitEffect(ctx, emit, {
    type,
    side,
    source: petBrief(source),
    target: petBrief(target),
    ...values,
  });
}

function buffAtk(target, amount) {
  const value = Math.floor(amount ?? 0);
  return addAtk(target, value) ? value : 0;
}

function buffHp(source, target, amount, opposingLineup) {
  return gainHp(source, target, Math.floor(amount ?? 0), opposingLineup, { isAllyHealing: true });
}

function emitTargetStats(trigger, type, target, values = {}) {
  const changedValues = Object.fromEntries(
    Object.entries(values).filter(([key, value]) => !key.endsWith("Delta") || Number(value) !== 0)
  );
  trigger(type, target, {
    targetAtkAfter: target?.atk,
    targetHpAfter: target?.hp,
    targetMaxHpAfter: target?.maxHp,
    targetArmorAfter: target?.battleArmor,
    ...changedValues,
  });
}

function findRedirectTarget(target, lineup) {
  const index = lineup.indexOf(target);
  if (index < 0) return target;
  for (let i = index + 1; i < lineup.length; i += 1) {
    const candidate = lineup[i];
    if (candidate.hp > 0 && candidate.special?.redirectBehindDamage) return candidate;
  }
  return target;
}

function takeDamage({
  source,
  target,
  targetLineup,
  amount,
  emit,
  ctx,
  side,
  targetSide,
  type,
  step,
  isAttack = false,
  pierce = false,
  allowRedirect = true,
  ignoreOutgoingModifiers = false,
}) {
  if (!target || target.hp <= 0 || amount <= 0) return { damage: 0, dodged: false, target };
  const sourceLineup = side === "left" ? ctx.left : ctx.right;
  let actualTarget = allowRedirect ? findRedirectTarget(target, targetLineup) : target;
  if (actualTarget !== target) {
    emitEffect(ctx, emit, {
      type: "damage_redirect",
      side: targetSide,
      source: petBrief(actualTarget),
      target: petBrief(target),
    });
  }
  if (!pierce && actualTarget.dodge && step % 2 === 1) {
    emitEffect(ctx, emit, {
      type: "dodge",
      side: targetSide,
      targetSide,
      source: petBrief(actualTarget),
      target: petBrief(actualTarget),
      attacker: petBrief(source),
      attackerSide: side,
    });
    return { damage: 0, dodged: true, target: actualTarget };
  }

  const effectDamageMultiplier = !ignoreOutgoingModifiers && EFFECT_DAMAGE_TYPES.has(type)
    ? strongestLineupMultiplier(sourceLineup, "effectDamageMultiplier", "amplify")
    : 1;
  const rangeMultiplier = RANGE_DAMAGE_TYPES.has(type)
    ? strongestLineupMultiplier(targetLineup, "rangeDamageMultiplier", "reduce")
    : 1;
  const teamIncomingMultiplier = strongestLineupMultiplier(
    targetLineup,
    "teamIncomingDamageMultiplier",
    "reduce"
  );
  const targetIndex = targetLineup.indexOf(actualTarget);
  const backlineMultiplier = strongestLineupMultiplier(
    targetLineup.slice(Math.max(0, targetIndex + 1)),
    "backlineDamageMultiplier",
    "reduce"
  );
  const frontline = targetLineup.at(-1);
  const frontMultiplier = actualTarget === targetLineup.at(-1)
    ? Number(actualTarget.special?.frontDamageMultiplier ?? 1)
    : 1;
  const damageBeforeMitigation = Math.max(0, Math.floor(amount * effectDamageMultiplier));
  const raw = Math.max(0, Math.floor(damageBeforeMitigation * rangeMultiplier * teamIncomingMultiplier * backlineMultiplier * frontMultiplier));
  const fixed = actualTarget.special?.fixedIncomingDamage;
  const incoming = fixed ? Math.floor(fixed) : raw;
  const shieldBefore = Math.max(0, actualTarget.battleArmor ?? 0);
  const shieldAfter = shieldBefore;
  const hpDamage = pierce ? incoming : Math.max(1, incoming - shieldBefore);
  const damageReduced = incoming - hpDamage;
  // 包含護甲、範圍減傷、全隊減傷、後排減傷、前排減傷與固定承傷等所有抵免。
  const mitigatedDamage = Math.max(0, damageBeforeMitigation - hpDamage);
  const hpBefore = actualTarget.hp;
  actualTarget.battleArmor = shieldAfter;
  actualTarget.hp = Math.max(0, hpBefore - hpDamage);
  const dealt = Math.min(hpBefore, hpDamage);
  emit?.({
    type,
    side,
    targetSide,
    source: petBrief(source),
    target: petBrief(actualTarget),
    rawDamage: raw,
    damageApplied: hpDamage,
    effectiveDamageToHp: dealt,
    shieldBefore,
    shieldAfter,
    shieldAbsorbed: 0,
    damageReduced,
    mitigatedDamage,
    targetArmorAfter: shieldAfter,
    targetHpBefore: hpBefore,
    targetHpAfter: actualTarget.hp,
    pierced: pierce,
    isBasicAttack: isAttack,
  });

  if (dealt > 0 && actualTarget.hp > 0 && actualTarget.special?.gainAtkWhenDamaged) {
    const gain = Math.floor(actualTarget.special.gainAtkWhenDamaged);
    actualTarget.atk += gain;
    emitEffect(ctx, emit, {
      type: "damaged_gain_atk",
      side: targetSide,
      source: petBrief(actualTarget),
      atkDelta: gain,
      targetAtkAfter: actualTarget.atk,
    });
  }

  return { damage: dealt, dodged: false, target: actualTarget };
}

function applySkillHeal({
  source,
  target,
  enemy,
  amount,
  isAllyHealing = true,
}) {
  if (!target || target.hp <= 0 || amount <= 0) return { heal: 0, damage: 0 };
  return {
    heal: gainHp(source, target, Math.floor(amount), enemy, { isAllyHealing }),
    damage: 0,
  };
}

function applyOpeningEffects(lineup, enemy, ctx, emit, side, left, right) {
  const targetSide = side === "left" ? "right" : "left";

  const applyPetOpeningEffects = (pet, index) => {
    const front = lineup[index + 1];
    const openingFrontHp = pet.special?.openingFrontHp
      ? gainHp(pet, front, pet.special.openingFrontHp, enemy)
      : 0;
    if (openingFrontHp > 0) {
      emitEffect(ctx, emit, { type: "opening_front_hp", side, source: petBrief(pet), target: petBrief(front), hpDelta: openingFrontHp, targetHpAfter: front.hp, targetMaxHpAfter: front.maxHp });
    }
    if (pet.special?.openingFrontAtk && addAtk(front, pet.special.openingFrontAtk)) {
      emitEffect(ctx, emit, { type: "opening_front_atk", side, source: petBrief(pet), target: petBrief(front), atkDelta: pet.special.openingFrontAtk, targetAtkAfter: front.atk });
    }
    if (pet.special?.openingFrontStats && front) {
      const amount = Math.floor(pet.special.openingFrontStats);
      addAtk(front, amount);
      emitEffect(ctx, emit, {
        type: "opening_front_atk",
        side,
        source: petBrief(pet),
        target: petBrief(front),
        atkDelta: amount,
        targetAtkAfter: front.atk,
      });
      const hpDelta = gainHp(pet, front, amount, enemy);
      if (hpDelta > 0) emitEffect(ctx, emit, {
        type: "opening_front_hp",
        side,
        source: petBrief(pet),
        target: petBrief(front),
        hpDelta,
        targetHpAfter: front.hp,
        targetMaxHpAfter: front.maxHp,
      });
    }
    if (pet.special?.openingSelfTaunt) {
      pet.taunt = true;
      emitEffect(ctx, emit, { type: "opening_self_taunt", side, source: petBrief(pet), target: petBrief(pet) });
    }
    if (pet.special?.openingTeamAtk) {
      const amount = Math.floor(pet.special.openingTeamAtk);
      lineup.forEach((target) => {
        if (addAtk(target, amount)) emitEffect(ctx, emit, { type: "opening_team_atk", side, source: petBrief(pet), target: petBrief(target), atkDelta: amount, targetAtkAfter: target.atk });
      });
    }
    if (pet.special?.openingTeamArmor) {
      lineup.forEach((target) => {
        const gain = addArmor(target, pet.special.openingTeamArmor, lineup, enemy);
        if (gain.armor > 0) emitEffect(ctx, emit, { type: "opening_team_armor", side, source: petBrief(pet), target: petBrief(target), armorDelta: gain.armor, atkDelta: gain.atk, hpDelta: gain.hp, targetArmorAfter: target.battleArmor, targetAtkAfter: target.atk, targetHpAfter: target.hp, targetMaxHpAfter: target.maxHp });
      });
    }
    if (pet.special?.openingAdjacentArmor) {
      [lineup[index - 1], lineup[index + 1]].filter(Boolean).forEach((target) => {
        const gain = addArmor(target, pet.special.openingAdjacentArmor, lineup, enemy);
        if (gain.armor > 0) emitEffect(ctx, emit, { type: "opening_adjacent_armor", side, source: petBrief(pet), target: petBrief(target), armorDelta: gain.armor, atkDelta: gain.atk, hpDelta: gain.hp, targetArmorAfter: target.battleArmor, targetAtkAfter: target.atk, targetHpAfter: target.hp, targetMaxHpAfter: target.maxHp });
      });
    }
    if (pet.special?.openingSelfArmor) {
      const gain = addArmor(pet, pet.special.openingSelfArmor, lineup, enemy);
      if (gain.armor > 0) emitEffect(ctx, emit, { type: "opening_self_armor", side, source: petBrief(pet), target: petBrief(pet), armorDelta: gain.armor, atkDelta: gain.atk, hpDelta: gain.hp, targetArmorAfter: pet.battleArmor, targetAtkAfter: pet.atk, targetHpAfter: pet.hp, targetMaxHpAfter: pet.maxHp });
    }
    if (pet.special?.openingSwapEnemyEnds && enemy.length > 1) {
      const back = enemy[0];
      const front = enemy[enemy.length - 1];
      [enemy[0], enemy[enemy.length - 1]] = [front, back];
      emitEffect(ctx, emit, { type: "opening_swap_enemy_ends", side, targetSide, source: petBrief(pet), target: petBrief(front), secondaryTarget: petBrief(back) });
    }
    if (pet.special?.frontSwapAtkHp) {
      const target = enemy[enemy.length - 1];
      if (target) {
        const atkBefore = target.atk;
        const hpBefore = target.hp;
        target.atk = hpBefore;
        target.hp = atkBefore;
        target.maxHp = atkBefore;
        emitEffect(ctx, emit, { type: "front_swap_atk_hp", side, targetSide, source: petBrief(pet), target: petBrief(target), atkBefore, atkAfter: target.atk, hpBefore, hpAfter: target.hp, maxHpAfter: target.maxHp });
      }
    }
    if (pet.special?.openingEnemyAllDamage) {
      const damage = Math.floor(pet.special.openingEnemyAllDamage);
      const hitCount = Math.max(1, Math.floor(pet.special.openingEnemyAllHitCount ?? 1));
      for (let hit = 1; hit <= hitCount; hit += 1) {
        // 同一段範圍傷害是原子操作；多段傷害會在每段之間結算死亡效果。
        // 效果一旦開始，即使施術者在其中一段引發的死亡連鎖中死亡，剩餘段數仍會完整發動。
        enemy.filter((target) => target.hp > 0).forEach((target) => takeDamage({
          source: pet,
          target,
          targetLineup: enemy,
          amount: damage,
          emit: (event) => emit({ ...event, effectHit: hit, effectHitCount: hitCount }),
          ctx,
          side,
          targetSide,
          type: "opening_enemy_all_damage",
          step: OPENING_BATTLE_STEP,
          pierce: pet.pierce,
        }));
        resolveDeaths(left, right, ctx, emit, OPENING_BATTLE_STEP);
      }
    }
    const openingDamage = pet.special?.openingHighestHpDamage;
    const lowDamage = pet.special?.openingLowestHpDamage;
    const target = openingDamage ? highestHpTarget(enemy) : lowDamage ? lowestHpTarget(enemy) : null;
    const amount = openingDamage ?? lowDamage;
    if (target && amount) {
      emitEffect(ctx, emit, { type: openingDamage ? "opening_missile" : "opening_lowest_damage", side, source: petBrief(pet), target: petBrief(target) });
      takeDamage({ source: pet, target, targetLineup: enemy, amount, emit, ctx, side, targetSide, type: openingDamage ? "opening_missile_damage" : "opening_lowest_damage", step: OPENING_BATTLE_STEP, pierce: pet.pierce });
    }
  };

  runLineupEffectSequence({
    lineup,
    settle: () => resolveDeaths(left, right, ctx, emit, OPENING_BATTLE_STEP),
    createEffects: (pet) => {
      const index = lineup.indexOf(pet);
      return index < 0 ? [] : [() => applyPetOpeningEffects(pet, index)];
    },
  });

  const teamAtk = lineup.reduce((sum, pet) => sum + (pet.hp > 0 ? Math.floor(pet.special?.teamAtkAura ?? 0) : 0), 0);
  if (teamAtk > 0) lineup.forEach((target) => {
    if (addAtk(target, teamAtk)) emitEffect(ctx, emit, { type: "team_atk_aura", side, targetSide: side, target: petBrief(target), atkDelta: teamAtk, targetAtkAfter: target.atk });
  });
  resolveDeaths(left, right, ctx, emit, OPENING_BATTLE_STEP);
}

function applyMountEffects(lineup, ctx, emit, side) {
  for (let index = lineup.length - 1; index >= 0; index -= 1) {
    const mount = lineup[index];
    if (!mount?.special?.mountDodge) continue;
    const rider = lineup[index - 1];
    if (!rider || rider.hp <= 0) continue;
    rider.dodge = true;
    rider.mountImage = mount.image;
    rider.mountName = mount.displayName ?? mount.name;
    lineup.splice(index, 1);
    emitEffect(ctx, emit, {
      type: "mount_dodge",
      side,
      source: petBrief(mount),
      target: petBrief(rider),
      dodgeAfter: rider.dodge,
      mountRemoved: true,
    });
  }
}

function applyRoundDefenseEffects(state) {
  const { pet, index, lineup, enemy, ctx, emit, side, step, targetSide, front, ahead, trigger } = state;
    if (pet.special?.roundShield) {
      const gain = addArmor(pet, pet.special.roundShield, lineup, enemy);
      if (gain.armor > 0) emitTargetStats(trigger, "round_shield", pet, { armorDelta: gain.armor, atkDelta: gain.atk, hpDelta: gain.hp });
    }
    if (pet.special?.roundShieldAllAhead) ahead.forEach((target) => {
      const gain = addArmor(target, pet.special.roundShieldAllAhead, lineup, enemy);
      if (gain.armor > 0) emitTargetStats(trigger, "round_ahead_shield", target, { armorDelta: gain.armor, atkDelta: gain.atk, hpDelta: gain.hp });
    });
    if (pet.special?.roundHpAllAhead) ahead.forEach((target) => {
      const hpDelta = buffHp(pet, target, pet.special.roundHpAllAhead, enemy);
      if (hpDelta > 0) emitTargetStats(trigger, "round_ahead_hp", target, { hpDelta });
    });
    if (pet.special?.roundStartSelfDamage) {
      takeDamage({ source: pet, target: pet, targetLineup: lineup, amount: pet.special.roundStartSelfDamage, emit, ctx, side, targetSide: side, type: "round_start_self_damage", step, pierce: pet.pierce, allowRedirect: false, ignoreOutgoingModifiers: true });
    }
    if (pet.special?.roundFrontArmor) {
      const gain = addArmor(front, pet.special.roundFrontArmor, lineup, enemy);
      if (gain.armor > 0) emitTargetStats(trigger, "round_front_armor", front, { armorDelta: gain.armor, atkDelta: gain.atk, hpDelta: gain.hp });
    }
    if (pet.special?.roundAdjacentArmor) {
      adjacentAllies(lineup, index).forEach((target) => {
        const gain = addArmor(target, pet.special.roundAdjacentArmor, lineup, enemy);
        if (gain.armor > 0) emitTargetStats(trigger, "round_adjacent_armor", target, { armorDelta: gain.armor, atkDelta: gain.atk, hpDelta: gain.hp });
      });
    }
    if (pet.special?.roundFrontArmorBreak) {
      const target = enemy[enemy.length - 1];
      const reduction = Math.min(Math.max(0, target?.battleArmor ?? 0), Math.floor(pet.special.roundFrontArmorBreak));
      if (target && target.hp > 0 && reduction > 0) {
        target.battleArmor -= reduction;
        trigger("round_front_armor_break", target, { targetSide, armorDelta: -reduction, targetArmorAfter: target.battleArmor });
      }
    }
}

function applyRoundGrowthEffects(state) {
  const { pet, index, lineup, enemy, ctx, emit, side, step, targetSide, front, trigger } = state;
    const summonEvery = Math.max(0, Math.floor(pet.special?.roundFrontSummonEvery ?? 0));
    if (summonEvery > 0 && step % summonEvery === 0) {
      const summoned = buildFighter({
        name: pet.special.roundFrontSummonName ?? "召喚物",
        image: pet.special.roundFrontSummonImage ?? pet.image,
        atk: Math.max(0, Math.floor(pet.special.roundFrontSummonAtk ?? 0)),
        hp: Math.max(1, Math.floor(pet.special.roundFrontSummonHp ?? 1)),
        level: pet.level ?? 1,
        tier: pet.tier,
        isEnemy: pet.isEnemy,
        special: {
          deathSourceAtk: Math.max(0, Math.floor(pet.special.roundFrontSummonDeathSourceAtk ?? 0)),
        },
      }, ctx.nextUid++);
      summoned.summonSourceUid = pet.uid;
      lineup.splice(index + 1, 0, summoned);
      trigger("round_front_summon", summoned, {
        targetSide: side,
        summoned: petBrief(summoned),
        targetAtkAfter: summoned.atk,
        targetHpAfter: summoned.hp,
        targetMaxHpAfter: summoned.maxHp,
      });
    }
    if (pet.special?.roundFrontHp) {
      const hpDelta = buffHp(pet, front, pet.special.roundFrontHp, enemy);
      if (hpDelta > 0) emitTargetStats(trigger, "round_front_hp", front, { hpDelta });
    }
    if (pet.special?.roundFrontmostHeal) {
      const target = lineup[lineup.length - 1];
      const { heal } = applySkillHeal({
        source: pet, target, enemy, amount: pet.special.roundFrontmostHeal,
      });
      if (heal > 0) trigger("round_frontmost_heal", target, { heal, targetHpAfter: target.hp, maxHp: target.maxHp });
    }
    if (pet.special?.roundFrontAtk) {
      const atkDelta = buffAtk(front, pet.special.roundFrontAtk);
      if (atkDelta > 0) emitTargetStats(trigger, "round_front_atk", front, { atkDelta });
    }
    if (pet.special?.roundFrontmostAtk) {
      const target = lineup[lineup.length - 1];
      const atkDelta = buffAtk(target, pet.special.roundFrontmostAtk);
      if (atkDelta > 0) emitTargetStats(trigger, "round_frontmost_atk", target, { atkDelta });
    }
    if (pet.special?.roundEnemyFrontAtkSet != null) {
      const target = enemy[enemy.length - 1];
      if (target && target.hp > 0) {
        const nextAtk = Math.max(0, Math.floor(pet.special.roundEnemyFrontAtkSet));
        const atkDelta = nextAtk - target.atk;
        target.atk = nextAtk;
        trigger("round_enemy_front_atk_set", target, { targetSide, atkDelta, targetAtkAfter: target.atk });
      }
    }
    if (pet.special?.roundSelfAtkLoss) {
      const minimum = Math.max(0, Math.floor(pet.special.roundSelfAtkMinimum ?? 0));
      const before = Math.floor(pet.atk);
      if (before > minimum) {
        pet.atk = Math.max(minimum, before - Math.floor(pet.special.roundSelfAtkLoss));
        trigger("round_self_atk_loss", pet, { atkDelta: pet.atk - before, targetAtkAfter: pet.atk });
      }
    }
    if (pet.special?.roundSelfHeal) {
      const { heal } = applySkillHeal({
        source: pet, target: pet, enemy, amount: pet.special.roundSelfHeal,
      });
      if (heal > 0) trigger("round_self_heal", pet, { heal, targetHpAfter: pet.hp, maxHp: pet.maxHp });
    }
    if (pet.special?.roundTeamHeal) {
      lineup.forEach((target) => {
        const { heal } = applySkillHeal({
          source: pet, target, enemy, amount: pet.special.roundTeamHeal,
        });
        if (heal > 0) trigger("round_team_heal", target, { heal, targetHpAfter: target.hp, maxHp: target.maxHp });
      });
    }
    if (pet.special?.roundSelfAtk || pet.special?.roundSelfHp) {
      const atk = Math.floor(pet.special.roundSelfAtk ?? 0);
      const hp = Math.floor(pet.special.roundSelfHp ?? 0);
      pet.atk += atk;
      if (atk !== 0) emitTargetStats(trigger, "round_self_atk", pet, { atkDelta: atk });
      const hpDelta = gainHp(pet, pet, hp, enemy);
      if (hpDelta !== 0) emitTargetStats(trigger, "round_self_hp", pet, { hpDelta });
    }
    if (pet.special?.roundTeamAtk) {
      const amount = Math.floor(pet.special.roundTeamAtk);
      lineup.forEach((target) => {
        const atkDelta = buffAtk(target, amount);
        if (atkDelta > 0) emitTargetStats(trigger, "round_team_atk", target, { atkDelta });
      });
    }
    if (pet.special?.roundRandomAllyArmor) {
      const living = lineup.filter((ally) => ally.hp > 0);
      const target = living[(pet.uid + step) % living.length];
      const gain = target ? addArmor(target, pet.special.roundRandomAllyArmor, lineup, enemy) : { armor: 0, atk: 0, hp: 0 };
      if (target && gain.armor > 0) emitTargetStats(trigger, "round_random_armor", target, { armorDelta: gain.armor, atkDelta: gain.atk, hpDelta: gain.hp });
    }
}

function applyRoundDamageEffects(state) {
  const { pet, enemy, ctx, emit, side, step, targetSide, trigger, settle } = state;
    if (pet.special?.roundLowestEnemyDamage) {
      const target = lowestHpTarget(enemy);
      if (target) {
        trigger("round_lowest_enemy_trigger", target);
        takeDamage({ source: pet, target, targetLineup: enemy, amount: pet.special.roundLowestEnemyDamage, emit, ctx, side, targetSide, type: "round_lowest_enemy_damage", step, pierce: pet.pierce });
      }
    }
    if (pet.special?.roundFrontFixedDamage) {
      const target = enemy[enemy.length - 1];
      if (target) {
        trigger("round_front_fixed_trigger", target);
        takeDamage({ source: pet, target, targetLineup: enemy, amount: pet.special.roundFrontFixedDamage, emit, ctx, side, targetSide, type: "round_front_fixed_damage", step, pierce: pet.pierce });
      }
    }
    if (pet.special?.roundEnemyAllDamage) {
      const damage = Math.floor(pet.special.roundEnemyAllDamage);
      // 同一次全體傷害不會被其中一個目標的死亡效果插隊。
      enemy.filter((target) => target.hp > 0).forEach((target) => takeDamage({
        source: pet,
        target,
        targetLineup: enemy,
        amount: damage,
        emit,
        ctx,
        side,
        targetSide,
        type: "round_enemy_all_damage",
        step,
        pierce: pet.pierce,
      }));
      settle();
    }
    if (step === 10 && pet.special?.roundTenEnemyAllDamage) {
      const damage = Math.floor(pet.special.roundTenEnemyAllDamage);
      enemy.filter((target) => target.hp > 0).forEach((target) => takeDamage({
        source: pet,
        target,
        targetLineup: enemy,
        amount: damage,
        emit,
        ctx,
        side,
        targetSide,
        type: "round_ten_enemy_all_damage",
        step,
        pierce: pet.pierce,
      }));
      settle();
    }
}

/**
 * 回合開始的效果依登錄順序執行；新增效果時優先新增 handler，而不是擴大主迴圈。
 * 順序本身是規則的一部分，例如護甲必須先於同回合傷害結算。
 */
const ROUND_START_HANDLERS = [
  applyRoundDefenseEffects,
  applyRoundGrowthEffects,
  applyRoundDamageEffects,
];

function applyRoundStart(lineup, enemy, ctx, emit, side, step, left, right) {
  const targetSide = side === "left" ? "right" : "left";
  runLineupEffectSequence({
    lineup,
    settle: () => resolveDeaths(left, right, ctx, emit, step),
    createEffects: (pet) => {
    const index = lineup.indexOf(pet);
    if (index < 0) return [];
    const state = {
      pet,
      index,
      lineup,
      enemy,
      ctx,
      emit,
      side,
      step,
      targetSide,
      front: lineup[index + 1],
      ahead: livingAhead(lineup, index),
      trigger: makeEffectEmitter(ctx, emit, side, pet),
      settle: () => resolveDeaths(left, right, ctx, emit, step),
    };
    return ROUND_START_HANDLERS.map((handler) => () => handler(state));
    },
  });
}

function applyDeathDamageEffects({ pet, lineup, enemy, ctx, emit, side, targetSide, step, index, left, right }) {
  const flushDeaths = () => resolveDeaths(left, right, ctx, emit, step);
  if (pet.special?.deathFrontCurrentHpPercent) {
    const target = enemy[enemy.length - 1];
    const damage = Math.floor((target?.hp ?? 0) * pet.special.deathFrontCurrentHpPercent / 100);
    if (target && damage > 0) {
      emitEffect(ctx, emit, { type: "death_front_percent", side, source: petBrief(pet), target: petBrief(target) });
      takeDamage({ source: pet, target, targetLineup: enemy, amount: damage, emit, ctx, side, targetSide, type: "death_front_percent_damage", step, pierce: pet.pierce });
      flushDeaths();
    }
  }
  if (pet.special?.deathEffectCountAoe) {
    const damage = ctx.effectCount;
    emitEffect(ctx, emit, { type: "death_effect_count_aoe", side, source: petBrief(pet), damageApplied: damage });
    enemy.filter((target) => target.hp > 0).forEach((target) => takeDamage({ source: pet, target, targetLineup: enemy, amount: damage, emit, ctx, side, targetSide, type: "death_effect_count_damage", step, pierce: pet.pierce }));
    flushDeaths();
  }
  if (pet.special?.deathEnemyAllDamage) {
    const damage = Math.floor(pet.special.deathEnemyAllDamage);
    enemy.filter((target) => target.hp > 0).forEach((target) => takeDamage({ source: pet, target, targetLineup: enemy, amount: damage, emit, ctx, side, targetSide, type: "death_enemy_all_damage", step, pierce: pet.pierce }));
    flushDeaths();
  }
  if (pet.special?.deathBehindHpPerRound) {
    const behind = lineup[index - 1];
    const hpDelta = gainHp(pet, behind, Math.floor(pet.special.deathBehindHpPerRound * step), enemy);
    if (hpDelta > 0) emitEffect(ctx, emit, { type: "death_behind_hp", side, source: petBrief(pet), target: petBrief(behind), hpDelta, targetHpAfter: behind.hp, targetMaxHpAfter: behind.maxHp });
  }
  if (pet.special?.deathFrontDamage) {
    const target = enemy[enemy.length - 1];
    if (target) {
      takeDamage({ source: pet, target, targetLineup: enemy, amount: pet.special.deathFrontDamage, emit, ctx, side, targetSide, type: "death_front_damage", step, pierce: pet.pierce });
      flushDeaths();
    }
  }
  if (pet.special?.deathBacklineDamage) {
    const target = enemy[0];
    if (target) {
      takeDamage({ source: pet, target, targetLineup: enemy, amount: pet.special.deathBacklineDamage, emit, ctx, side, targetSide, type: "death_backline_damage", step, pierce: pet.pierce });
      flushDeaths();
    }
  }
}

function applyDeathTeamBuffEffects({ pet, lineup, enemy, ctx, emit, side }) {
  if (!(pet.special?.deathTeamAtk || pet.special?.deathTeamHp || pet.special?.deathTeamArmor)) return;
  const atk = Math.floor(pet.special.deathTeamAtk ?? 0);
  const hp = Math.floor(pet.special.deathTeamHp ?? 0);
  const armor = Math.floor(pet.special.deathTeamArmor ?? 0);
  lineup.filter((ally) => ally !== pet && ally.hp > 0).forEach((ally) => {
    addAtk(ally, atk);
    const hpDelta = gainHp(pet, ally, hp, enemy);
    const armorGain = addArmor(ally, armor, lineup, enemy);
    const atkDelta = atk + armorGain.atk;
    const totalHpDelta = hpDelta + armorGain.hp;
    emitEffect(ctx, emit, {
      type: "death_team_stats",
      side,
      source: petBrief(pet),
      target: petBrief(ally),
      ...(atkDelta !== 0 ? { atkDelta } : {}),
      ...(totalHpDelta !== 0 ? { hpDelta: totalHpDelta } : {}),
      ...(armorGain.armor !== 0 ? { armorDelta: armorGain.armor } : {}),
      targetAtkAfter: ally.atk,
      targetHpAfter: ally.hp,
      targetMaxHpAfter: ally.maxHp,
      targetArmorAfter: ally.battleArmor,
    });
  });
}

function applySummonSourceBuffOnDeath({ pet, lineup, enemy, ctx, emit, side }) {
  const atk = Math.max(0, Math.floor(pet.special?.deathSourceAtk ?? 0));
  if (atk <= 0) return;
  const source = lineup.find((ally) => ally.uid === pet.summonSourceUid && ally.hp > 0);
  if (!source) return;
  const atkDelta = buffAtk(source, atk);
  if (atkDelta <= 0) return;
  emitEffect(ctx, emit, {
    type: "summon_death_source_atk",
    side,
    source: petBrief(pet),
    target: petBrief(source),
    atkDelta,
    targetAtkAfter: source.atk,
  });
}

function applyTurtleNetCascade({ pet, left, right, ctx, emit, side }) {
  if (!pet.turtleNetEnabled || !String(pet.name ?? "").includes("龜")) return;
  [...left, ...right]
    .filter((unit) => unit !== pet && unit.hp > 0 && String(unit.name ?? "").includes("龜"))
    .forEach((unit) => {
      const hpBefore = unit.hp;
      unit.hp = 0;
      const unitSide = left.includes(unit) ? "left" : "right";
      emitEffect(ctx, emit, {
        type: "turtle_net_cascade_death",
        side,
        targetSide: unitSide,
        source: petBrief(pet),
        target: petBrief(unit),
        damageApplied: hpBefore,
        effectiveDamageToHp: hpBefore,
        targetHpBefore: hpBefore,
        targetHpAfter: 0,
      });
    });
}

function applyAnyDeathGrowth({ pet, left, right, ctx, emit }) {
  [...left, ...right].filter((unit) => unit !== pet && unit.hp > 0 && (unit.special?.gainAtkOnAnyDeath || unit.special?.gainHpOnAnyDeath)).forEach((unit) => {
    const atk = Math.floor(unit.special.gainAtkOnAnyDeath ?? 0);
    const hp = Math.floor(unit.special.gainHpOnAnyDeath ?? 0);
    addAtk(unit, atk);
    const unitSide = left.includes(unit) ? "left" : "right";
    const hpDelta = gainHp(unit, unit, hp, unitSide === "left" ? right : left);
    emitEffect(ctx, emit, {
      type: "any_death_gain_stats",
      side: unitSide,
      source: petBrief(unit),
      target: petBrief(unit),
      ...(atk !== 0 ? { atkDelta: atk } : {}),
      ...(hpDelta !== 0 ? { hpDelta } : {}),
      targetAtkAfter: unit.atk,
      targetHpAfter: unit.hp,
      targetMaxHpAfter: unit.maxHp,
    });
  });
}

function applyDeathSplitEffects({ pet, index, lineup, ctx, emit, side }) {
  const maxGenerations = Math.max(0, Math.floor(pet.special?.deathSplitMaxGenerations ?? 0));
  const generation = Math.max(0, Math.floor(pet.deathSplitGeneration ?? 0));
  if (maxGenerations <= 0 || generation >= maxGenerations || index < 0) return;

  const nextGeneration = generation + 1;
  const nextAtk = Math.max(0, Math.floor((pet.deathSplitInitialAtk ?? pet.atk ?? 0) / 2));
  const nextHp = Math.max(1, Math.floor((pet.deathSplitInitialHp ?? pet.maxHp ?? 1) / 2));
  const children = Array.from({ length: 2 }, () => buildFighter({
    ...pet,
    atk: nextAtk,
    hp: nextHp,
    battleArmor: 0,
    deathSplitInitialAtk: nextAtk,
    deathSplitInitialHp: nextHp,
    deathSplitGeneration: nextGeneration,
  }, ctx.nextUid++));
  lineup.splice(index + 1, 0, ...children);
  emitEffect(ctx, emit, {
    type: "death_split",
    side,
    targetSide: side,
    source: petBrief(pet),
    target: petBrief(children[0]),
    secondaryTarget: petBrief(children[1]),
    splitGeneration: nextGeneration,
    targetAtkAfter: nextAtk,
    targetHpAfter: nextHp,
    targetMaxHpAfter: nextHp,
  });
}

const DEATH_EFFECT_HANDLERS = [
  applyDeathDamageEffects,
  applyDeathTeamBuffEffects,
  applySummonSourceBuffOnDeath,
  applyTurtleNetCascade,
  applyAnyDeathGrowth,
  applyDeathSplitEffects,
];

function resolveDeaths(left, right, ctx, emit, step) {
  const isRootResolution = !ctx.resolvingDeaths;
  if (isRootResolution) ctx.resolvingDeaths = true;

  try {
    // 同時死亡時依我方、敵方各自由左至右處理；死亡效果中造成的新死亡會在
    // 原死亡角色的下一個效果前遞迴插入，形成明確的 LIFO 結算堆疊。
    const next = [...left, ...right].find((pet) => pet.hp <= 0 && !pet.effectResolved.death);
    if (!next) return;
    if (++ctx.deathCount > 100) throw new Error("死亡效果連鎖超過安全上限");

    next.effectResolved.death = true;
    const lineup = left.includes(next) ? left : right;
    const enemy = lineup === left ? right : left;
    const side = lineup === left ? "left" : "right";
    const index = lineup.indexOf(next);
    const state = { pet: next, index, lineup, enemy, side, targetSide: side === "left" ? "right" : "left", step, left, right, ctx, emit };

    runEffectSequence({
      source: next,
      lineup,
      effects: DEATH_EFFECT_HANDLERS.map((handler) => () => handler(state)),
      settle: () => resolveDeaths(left, right, ctx, emit, step),
      allowDeadSource: true,
    });
    resolveDeaths(left, right, ctx, emit, step);
  } finally {
    if (isRootResolution) {
      ctx.resolvingDeaths = false;
      stripFallen(left);
      stripFallen(right);
    }
  }
}

function withAnimation(event) {
  const attackTypes = new Set([
    "main_strike",
    "cleave_strike",
    "attack_all_damage",
    "double_strike",
    "triple_strike",
    "self_swift_strike",
    "ally_followup_strike",
    "death_execute_front",
    "basic_attack_counter_damage",
  ]);
  // 動畫使用完整傷害；effectiveDamageToHp 仍保留給實際扣血與貢獻統計。
  const amount = Math.max(0, event.damageApplied ?? event.effectiveDamageToHp ?? 0);
  const attacks = attackTypes.has(event.type) && event.side && event.source
    ? [{ side: event.side, pet: event.source }]
    : event.type === "dodge" && event.attackerSide && event.attacker
      ? [{ side: event.attackerSide, pet: event.attacker }]
      : [];
  const damages = amount > 0 && event.targetSide && event.target
    ? [{ side: event.targetSide, pet: event.target, amount, hpBefore: event.targetHpBefore, hpAfter: event.targetHpAfter }]
    : [];
  const deaths = damages.filter((row) => row.hpBefore > 0 && row.hpAfter <= 0);
  return { ...event, animation: { kind: event.type, attacks, damages, deaths } };
}

function mainAttack(attacker, defender, enemy, ctx, emit, side, step, attackValue) {
  const targetSide = side === "left" ? "right" : "left";
  // 必須在傷害結算前記錄資格；目標即使被這次攻擊擊殺，犀牛仍有回血資格。
  // 實際回血延後到雙方普通攻擊都結算完，避免同一幕先回血再被打死，造成動畫復活。
  const targetBeforeDamage = findRedirectTarget(defender, enemy);
  const targetQualifiedBeforeDamage = Number(targetBeforeDamage?.battleArmor ?? 0) > 0
    || Boolean(targetBeforeDamage?.dodge ?? targetBeforeDamage?.special?.dodge);
  const result = takeDamage({ source: attacker, target: defender, targetLineup: enemy, amount: attackValue, emit, ctx, side, targetSide, type: "main_strike", step, isAttack: true, pierce: attacker.pierce });
  const healAmount = Number(attacker.special?.attackArmoredOrDodgeHeal ?? 0);
  const pendingHeal = result.damage > 0 && healAmount > 0 && targetQualifiedBeforeDamage
    ? { attacker, enemy, amount: healAmount, side }
    : null;
  return { ...result, pendingHeal };
}

function settlePostAttackHeal(pending, ctx, emit) {
  if (!pending?.attacker || pending.attacker.hp <= 0) return;
  const { heal } = applySkillHeal({
    source: pending.attacker,
    target: pending.attacker,
    enemy: pending.enemy,
    amount: pending.amount,
    isAllyHealing: false,
  });
  if (heal <= 0) return;
  emitEffect(ctx, emit, {
    type: "attack_armored_or_dodge_heal",
    side: pending.side,
    source: petBrief(pending.attacker),
    target: petBrief(pending.attacker),
    heal,
    targetHpAfter: pending.attacker.hp,
    maxHp: pending.attacker.maxHp,
  });
}

/** 嘲諷在選擇普通攻擊目標時生效，不在傷害結算時重新導向。 */
function selectBasicAttackTarget(requestedTarget, enemy) {
  return enemy.find((pet) => pet.hp > 0 && pet.taunt) ?? requestedTarget;
}

function mainAttackEvents(attacker, defender, enemy, ctx, side, step, attackValue) {
  const rows = [];
  const targetSide = side === "left" ? "right" : "left";
  const attackAllDamage = attacker.special?.attackAllDamage ?? (attacker.special?.attackAll ? attackValue : 0);
  if (attackAllDamage > 0) {
    enemy
      .filter((target) => target.hp > 0)
      .forEach((target) => takeDamage({
        source: attacker,
        target,
        targetLineup: enemy,
        amount: attackAllDamage,
        emit: (event) => rows.push(event),
        ctx,
        side,
        targetSide,
        type: "attack_all_damage",
        step,
        isAttack: true,
        pierce: attacker.pierce,
      }));
    return { rows, pendingHeal: null };
  }
  const primaryDamage = Number(attacker.special?.tripleStrikeDamage ?? attackValue);
  const result = mainAttack(attacker, defender, enemy, ctx, (event) => rows.push(event), side, step, primaryDamage);
  return { rows, pendingHeal: result.pendingHeal };
}

function attackExtras(attacker, primaryTarget, enemy, ctx, emit, side, step, attackValue) {
  // 追加攻擊尚未出手前若攻擊者已在同步主攻擊中死亡，就不再發動。
  // 主攻擊已經造成的傷害則會保留，符合動畫上「出手後倒下」的呈現。
  if (attacker.hp <= 0) return;
  const targetSide = side === "left" ? "right" : "left";
  if (attacker.special?.tripleStrikeDamage && primaryTarget?.hp > 0) {
    const damage = Number(attacker.special.tripleStrikeDamage);
    const hitCount = Math.max(1, Math.floor(attacker.special.tripleStrikeHitCount ?? 3));
    for (let hit = 2; hit <= hitCount && primaryTarget.hp > 0; hit += 1) {
      emitEffect(ctx, emit, { type: "triple_strike_trigger", side, source: petBrief(attacker), target: petBrief(primaryTarget), hit });
      takeDamage({ source: attacker, target: primaryTarget, targetLineup: enemy, amount: damage, emit, ctx, side, targetSide, type: "triple_strike", step, isAttack: true, pierce: attacker.pierce });
    }
  }
  if (attacker.special?.doubleStrike && primaryTarget?.hp > 0) {
    emitEffect(ctx, emit, { type: "double_strike_trigger", side, source: petBrief(attacker), target: petBrief(primaryTarget) });
    takeDamage({ source: attacker, target: primaryTarget, targetLineup: enemy, amount: attackValue, emit, ctx, side, targetSide, type: "double_strike", step, isAttack: true, pierce: attacker.pierce });
  }
  if (attacker.special?.cleaveFrontTwo && enemy.length > 1) {
    const second = enemy[enemy.length - 2];
    emitEffect(ctx, emit, { type: "cleave_trigger", side, source: petBrief(attacker), target: petBrief(second) });
    takeDamage({ source: attacker, target: second, targetLineup: enemy, amount: attackValue, emit, ctx, side, targetSide, type: "cleave_strike", step, isAttack: true, pierce: attacker.pierce });
  }
}

function refreshLivingEnemyPowerStats(lineup, enemy, side, emit, fillInitialHealth = false) {
  lineup.filter(isAlive).forEach((pet) => {
    const livingCount = enemy.filter(isAlive).length;
    const atkPerUnit = Number(pet.special?.livingEnemyAtkPerUnit ?? 0);
    const hpPerUnit = Number(pet.special?.livingEnemyHpPerUnit ?? 0);
    if (!atkPerUnit && !hpPerUnit) return;
    const nextAtk = atkPerUnit
      ? Math.max(0, Math.floor((pet.livingEnemyAtkBase ?? pet.atk ?? 0) + atkPerUnit * livingCount))
      : pet.atk;
    const nextMaxHp = hpPerUnit
      ? Math.max(1, Math.floor(hpPerUnit * livingCount))
      : pet.maxHp;
    const atkDelta = nextAtk - pet.atk;
    const maxHpDelta = nextMaxHp - pet.maxHp;
    const hpBefore = pet.hp;
    pet.atk = nextAtk;
    pet.maxHp = nextMaxHp;
    if (fillInitialHealth) pet.hp = nextMaxHp;
    else if (pet.hp > nextMaxHp) pet.hp = nextMaxHp;
    if (atkDelta !== 0 || maxHpDelta !== 0) {
      emit({
        type: "living_enemy_stats",
        side,
        targetSide: side,
        source: petBrief(pet),
        target: petBrief(pet),
        atkDelta,
        targetAtkAfter: nextAtk,
        maxHpDelta,
        hpDelta: pet.hp - hpBefore,
        targetHpAfter: pet.hp,
        targetMaxHpAfter: nextMaxHp,
      });
    }
  });
}

function resolveRound(left, right, ctx, step) {
  const events = [];
  const emit = (event) => events.push(withAnimation({ ...event, phase: "combat", step }));
  const leftLineupBefore = snapshotLineup(left);
  const rightLineupBefore = snapshotLineup(right);

  applyRoundStart(left, right, ctx, emit, "left", step, left, right);
  applyRoundStart(right, left, ctx, emit, "right", step, left, right);
  resolveDeaths(left, right, ctx, emit, step);

  refreshLivingEnemyPowerStats(left, right, "left", emit);
  refreshLivingEnemyPowerStats(right, left, "right", emit);

  const leftFront = left[left.length - 1];
  const rightFront = right[right.length - 1];
  if (leftFront && rightFront) {
    // 先鎖定雙方攻擊力，再各自結算到暫存事件；確保受傷加攻或死亡不會改變
    // 本回合已經發出的另一側攻擊。
    const leftAtk = Math.floor(leftFront.atk);
    const rightAtk = Math.floor(rightFront.atk);
    const leftRequestedTarget = leftFront.special?.attackBackline ? right[0] : rightFront;
    const rightRequestedTarget = rightFront.special?.attackBackline ? left[0] : leftFront;
    const leftTarget = leftFront.special?.tripleStrikeDamage ? rightFront : selectBasicAttackTarget(leftRequestedTarget, right);
    const rightTarget = rightFront.special?.tripleStrikeDamage ? leftFront : selectBasicAttackTarget(rightRequestedTarget, left);
    const leftMain = mainAttackEvents(leftFront, leftTarget, right, ctx, "left", step, leftAtk);
    const rightMain = mainAttackEvents(rightFront, rightTarget, left, ctx, "right", step, rightAtk);
    const leftMainEvents = leftMain.rows;
    const rightMainEvents = rightMain.rows;
    const basicAttackHits = [...leftMainEvents, ...rightMainEvents]
      .filter((event) => event.isBasicAttack && event.damageApplied > 0);

    const flushMain = (rows, attacker, defender, side) => {
      const areaRows = rows.filter((event) => event.type === "attack_all_damage");
      if (areaRows.length) {
        areaRows.forEach((event) => events.push(withAnimation({ ...event, phase: "combat", step })));
        return rows.filter((event) => event.type !== "attack_all_damage");
      }
      const primaryType = rows.some((event) => event.type === "attack_all_damage") ? "attack_all_damage" : "main_strike";
      const primaryIndex = rows.findIndex((event) => event.type === primaryType || event.type === "dodge");
      const primary = primaryIndex >= 0
        ? rows.splice(primaryIndex, 1)[0]
        : {
            type: primaryType,
            side,
            targetSide: side === "left" ? "right" : "left",
            source: petBrief(attacker),
            target: petBrief(defender),
            rawDamage: side === "left" ? leftAtk : rightAtk,
            damageApplied: 0,
            effectiveDamageToHp: 0,
            targetHpBefore: defender.hp,
            targetHpAfter: defender.hp,
          };
      events.push(withAnimation({ ...primary, phase: "combat", step }));
      return rows;
    };
    const leftAfterMain = flushMain(leftMainEvents, leftFront, leftTarget, "left");
    const rightAfterMain = flushMain(rightMainEvents, rightFront, rightTarget, "right");
    [...leftAfterMain, ...rightAfterMain].forEach(emit);

    // 同一回合雙方傷害先完整呈現，再讓仍存活的犀牛回血；死亡角色絕不產生回血事件。
    settlePostAttackHeal(leftMain.pendingHeal, ctx, emit);
    settlePostAttackHeal(rightMain.pendingHeal, ctx, emit);

    basicAttackHits.forEach((strike) => {
      const defenderLineup = strike.targetSide === "left" ? left : right;
      const attackerLineup = strike.side === "left" ? left : right;
      const struck = defenderLineup.find((pet) => pet.uid === strike.target?.uid);
      const counterTarget = attackerLineup.find((pet) => pet.uid === strike.source?.uid && pet.hp > 0);
      if (!struck?.special?.reflectBasicAttackDamage || !counterTarget) return;
      takeDamage({
        source: struck,
        target: counterTarget,
        targetLineup: attackerLineup,
        amount: strike.effectiveDamageToHp,
        emit,
        ctx,
        side: strike.targetSide,
        targetSide: strike.side,
        type: "basic_attack_counter_damage",
        step,
        pierce: true,
        allowRedirect: false,
        ignoreOutgoingModifiers: true,
      });
    });

    // 主攻擊動畫固定相鄰，時間軸會合併為雙方同時出手；追加效果在其後結算。
    attackExtras(leftFront, leftTarget, right, ctx, emit, "left", step, leftAtk);
    attackExtras(rightFront, rightTarget, left, ctx, emit, "right", step, rightAtk);
  }
  resolveDeaths(left, right, ctx, emit, step);
  refreshLivingEnemyPowerStats(left, right, "left", emit);
  refreshLivingEnemyPowerStats(right, left, "right", emit);
  return {
    leftLineup: snapshotLineup(left),
    rightLineup: snapshotLineup(right),
    leftLineupBefore,
    rightLineupBefore,
    leftPet: leftFront ? { name: leftFront.displayName ?? leftFront.name, image: leftFront.image, atk: leftFront.atk, hpBefore: leftLineupBefore.at(-1)?.hp ?? 0, hpAfter: Math.max(0, leftFront.hp) } : null,
    rightPet: rightFront ? { name: rightFront.displayName ?? rightFront.name, image: rightFront.image, atk: rightFront.atk, hpBefore: rightLineupBefore.at(-1)?.hp ?? 0, hpAfter: Math.max(0, rightFront.hp) } : null,
    leftDefeated: !leftFront || leftFront.hp <= 0,
    rightDefeated: !rightFront || rightFront.hp <= 0,
    events,
    animations: events.map((event) => event.animation),
    animationSequence: events.map((event, index) => ({ index, step, event, animation: event.animation })),
  };
}

export function simulateBattle(leftTeam, rightTeam) {
  let uid = 1;
  const buildTeam = (team) => team
    .filter(Boolean)
    .filter((pet) => !(pet.special?.oncePerGame && (pet.deployments ?? 0) > 0))
    .flatMap((pet) => {
      const count = Math.max(1, Math.floor(pet.special?.splitUnitCount ?? 1));
      if (count === 1) return [buildFighter(pet, uid++)];
      const atk = Math.floor(pet.special?.splitUnitAtk ?? pet.atk ?? 0);
      const hp = Math.floor(pet.special?.splitUnitHp ?? pet.hp ?? 1);
      return Array.from({ length: count }, (_, index) => buildFighter({
        ...pet,
        ownerName: pet.displayName ?? pet.name,
        name: `${pet.displayName ?? pet.name} ${index + 1}`,
        displayName: undefined,
        atk,
        hp,
        special: {},
        pierce: false,
      }, uid++));
    });
  const left = buildTeam(leftTeam);
  const right = buildTeam(rightTeam);
  const ctx = makeContext();
  ctx.left = left;
  ctx.right = right;
  ctx.nextUid = uid;
  const openingEvents = [];
  // 開戰傷害也必須帶完整動畫資料；即使直接致死，畫面仍先顯示受擊特效與數值再退場。
  const emitOpen = (event) => openingEvents.push(withAnimation({ ...event, phase: "opening" }));
  refreshLivingEnemyPowerStats(left, right, "left", emitOpen, true);
  refreshLivingEnemyPowerStats(right, left, "right", emitOpen, true);
  const openingBefore = { left: snapshotLineup(left), right: snapshotLineup(right) };
  applyMountEffects(left, ctx, emitOpen, "left");
  applyMountEffects(right, ctx, emitOpen, "right");
  applyOpeningEffects(left, right, ctx, emitOpen, "left", left, right);
  applyOpeningEffects(right, left, ctx, emitOpen, "right", left, right);
  resolveDeaths(left, right, ctx, emitOpen, OPENING_BATTLE_STEP);
  refreshLivingEnemyPowerStats(left, right, "left", emitOpen);
  refreshLivingEnemyPowerStats(right, left, "right", emitOpen);

  const frames = [];
  let step = 0;
  if (!left.length || !right.length) {
    frames.push({
      leftLineup: snapshotLineup(left),
      rightLineup: snapshotLineup(right),
      leftLineupBefore: snapshotLineup(left),
      rightLineupBefore: snapshotLineup(right),
      leftPet: left.at(-1) ? { name: left.at(-1).displayName ?? left.at(-1).name, image: left.at(-1).image, atk: left.at(-1).atk, hpBefore: left.at(-1).hp, hpAfter: left.at(-1).hp } : null,
      rightPet: right.at(-1) ? { name: right.at(-1).displayName ?? right.at(-1).name, image: right.at(-1).image, atk: right.at(-1).atk, hpBefore: right.at(-1).hp, hpAfter: right.at(-1).hp } : null,
      leftDefeated: !left.length,
      rightDefeated: !right.length,
      events: [],
      animations: [],
      animationSequence: [],
    });
  }
  while (left.length && right.length && step < MAX_BATTLE_STEPS) {
    step += 1;
    frames.push(resolveRound(left, right, ctx, step));
  }
  const sumHp = (lineup) => lineup.reduce((sum, pet) => sum + Math.max(0, pet.hp), 0);
  const contributions = buildContributions(openingBefore.left, openingEvents, frames);
  return {
    leftRemaining: left.length,
    rightRemaining: right.length,
    leftInitialHp: sumHp(openingBefore.left),
    rightInitialHp: sumHp(openingBefore.right),
    leftFinalHp: sumHp(left),
    rightFinalHp: sumHp(right),
    timedOut: Boolean(left.length && right.length && step >= MAX_BATTLE_STEPS),
    battleFrames: frames,
    battleDetail: { opening: { events: openingEvents, leftLineupBeforeOpen: openingBefore.left, rightLineupBeforeOpen: openingBefore.right } },
    effectCount: ctx.effectCount,
    contributions,
  };
}
