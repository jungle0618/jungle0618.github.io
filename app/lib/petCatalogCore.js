import { MAX_PET_LEVEL } from "./gameConfig";
import {
  PET_POOL,
  getLevelMultiplier,
  scaleSpecialForLevel,
} from "./characterConfig";

function getPetTierByName(name) {
  if (PET_POOL[1].some((pet) => pet.name === name)) return 1;
  if (PET_POOL[2].some((pet) => pet.name === name)) return 2;
  if (PET_POOL[3].some((pet) => pet.name === name)) return 3;
  if (PET_POOL[4]?.some((pet) => pet.name === name)) return 4;
  return 1;
}

export function getPetLevelStats(name, tier, level) {
  const base = PET_POOL[tier]?.find((pet) => pet.name === name)?.baseStats;
  if (!base) return null;
  const resolvedLevel = Math.max(1, Math.min(MAX_PET_LEVEL, Number(level ?? 1)));
  const scale = getLevelMultiplier(resolvedLevel);
  return {
    atk: Math.floor(base.atk * scale),
    hp: Math.floor(base.hp * scale),
  };
}

export function getPetCompendiumList() {
  return [1, 2, 3, 4].flatMap((tier) =>
    (PET_POOL[tier] ?? []).map((pet) => ({
      name: pet.name,
      image: pet.image,
      tier,
      drawFromRound: Number(pet.drawFromRound) || 1,
      pierce: Boolean(pet.pierce),
      special: pet.special ?? {},
      tags: pet.tags ?? [],
    }))
  );
}

export function getPetSpecialEffectText(petOrName) {
  const pet = typeof petOrName === "string" ? { name: petOrName } : petOrName ?? {};
  const tier = pet.tier ?? getPetTierByName(pet.name);
  const catalogPet = PET_POOL[tier]?.find((entry) => entry.name === pet.name);
  const parts = [];
  const percent = (value) => `${Math.round((1 - value) * 100)}%`;
  if (pet.pierce ?? catalogPet?.pierce) parts.unshift("穿透：普通攻擊可無視護甲");
  const special = pet.special ?? scaleSpecialForLevel(catalogPet?.special ?? {}, pet.level ?? 1);
  if (special.attackArmoredOrDodgeHeal) parts.push(`攻擊具有護甲或閃避的敵人時：自身回復 ${special.attackArmoredOrDodgeHeal} 生命`);
  if (special.dodge) parts.push("閃避：在奇數戰鬥回合（包含開戰效果）免疫所有非穿透傷害");
  if (special.mountDodge) parts.push("開戰時：若後方相鄰有友方，該友方會騎上隼；隼不再單獨出現於戰場，騎乘者保留原本面板與技能，並獲得閃避");
  if (special.deathFrontCurrentHpPercent) parts.push(`死亡時：對敵方最前排造成其當前生命 ${special.deathFrontCurrentHpPercent}% 的傷害`);
  if (special.oncePerGame) parts.push(`限制：整場遊戲只能出戰 1 個大回合，出戰後從收藏移除`);
  if (special.oncePerGame && special.openingHighestHpDamage) parts.push(`開戰時：對敵方生命最高角色造成 ${special.openingHighestHpDamage} 傷害`);
  if (!special.oncePerGame && special.openingHighestHpDamage) parts.push(`開戰時：對敵方生命最高角色造成 ${special.openingHighestHpDamage} 傷害`);
  if (special.openingEnemyAllDamage && Number(special.openingEnemyAllHitCount) > 1) parts.push(`開戰時：對敵方全體造成 ${special.openingEnemyAllHitCount} 次 ${special.openingEnemyAllDamage} 傷害`);
  else if (special.openingEnemyAllDamage) parts.push(`開戰時：對敵方全體造成 ${special.openingEnemyAllDamage} 傷害`);
  if (special.openingSelfArmor) parts.push(`開戰時：自身獲得 ${special.openingSelfArmor} 護甲`);
  const selfAndFrontArmor = special.roundShield && special.roundFrontArmor
    && Number(special.roundShield) === Number(special.roundFrontArmor);
  if (selfAndFrontArmor) parts.push(`每回合開始時：自身和前方一格友方各獲得 ${special.roundShield} 護甲`);
  else if (special.roundShield) parts.push(`每回合開始時：自身獲得 ${special.roundShield} 護甲`);
  if (special.atkPerArmorGained) parts.push(`每當自身獲得 1 護甲：自身攻擊 +${special.atkPerArmorGained}`);
  if (special.deathEffectCountAoe) parts.push("死亡時：對敵方全體造成傷害，數值等於本場已發動的效果次數");
  if (special.deathEnemyAllDamage) parts.push(`死亡時：對敵方全體造成 ${special.deathEnemyAllDamage} 傷害`);
  if (special.fixedIncomingDamage) parts.push(`受到傷害時：每次固定只失去 ${special.fixedIncomingDamage} 點生命`);
  if (special.cannotReceiveAllyHealing) parts.push("無法接受友方治療");
  if (special.frontSwapAtkHp) parts.push("開戰時：交換敵方最前排的攻擊與生命");
  if (special.openingSwapEnemyEnds) parts.push("開戰時：交換敵方最前排與最後排的位置");
  if (special.roundShieldAllAhead) parts.push(`每回合開始時：前方所有友方各獲得 ${special.roundShieldAllAhead} 護甲`);
  if (special.evolvesAfterGameRounds) {
    const evolvedScale = getLevelMultiplier(pet.level ?? 1);
    const evolvedAtk = Math.floor(special.evolvedStats.atk * evolvedScale);
    const evolvedHp = Math.floor(special.evolvedStats.hp * evolvedScale);
    parts.push(`在隊伍中完整出戰 ${special.evolvesAfterGameRounds} 個大遊戲回合後：永久進化成${special.evolvedName}，攻擊/生命變為 ${evolvedAtk}/${evolvedHp}`);
  }
  if (special.roundHpAllAhead) parts.push(`每回合開始時：前方所有友方生命 +${special.roundHpAllAhead}`);
  if (special.shieldGainStats) parts.push(`存活時：友方每獲得 1 護甲，該友方攻擊與生命各 +${special.shieldGainStats}`);
  if (special.shieldGainHp) parts.push(`存活時：友方每獲得 1 護甲，該友方生命 +${special.shieldGainHp}`);
  if (special.roundFrontArmor && !selfAndFrontArmor) parts.push(`每回合開始時：前方一格友方獲得 ${special.roundFrontArmor} 護甲`);
  if (special.roundAdjacentArmor) parts.push(`每回合開始時：左右相鄰友方各獲得 ${special.roundAdjacentArmor} 護甲`);
  if (special.roundFrontArmorBreak) parts.push(`每回合開始時：敵方最前排失去 ${special.roundFrontArmorBreak} 護甲`);
  const enemyHpGainMultiplier = special.enemyHpGainMultiplier ?? special.enemyHealingMultiplier;
  if (enemyHpGainMultiplier != null) parts.push(`存活時：敵方所有生命增加效果變為 ${Math.round(enemyHpGainMultiplier * 100)}%`);
  if (special.roundLowestEnemyDamage) parts.push(`每回合開始時：對敵方生命最低角色造成 ${special.roundLowestEnemyDamage} 傷害；同生命優先選最後排`);
  if (special.roundFrontFixedDamage) parts.push(`每回合開始時：對敵方最前排造成 ${special.roundFrontFixedDamage} 傷害`);
  if (special.roundEnemyAllDamage) parts.push(`每回合開始時：對敵方全體造成 ${special.roundEnemyAllDamage} 傷害`);
  if (special.roundTenEnemyAllDamage) parts.push(`第 10 戰鬥回合開始時：對敵方全體造成 ${special.roundTenEnemyAllDamage} 傷害`);
  if (special.rangeDamageMultiplier) parts.push(`存活時：我方受到的範圍傷害降低 ${percent(special.rangeDamageMultiplier)}`);
  if (special.teamIncomingDamageMultiplier) parts.push(`存活時：我方受到的所有傷害降低 ${percent(special.teamIncomingDamageMultiplier)}`);
  if (special.backlineDamageMultiplier) parts.push(`存活時：自身後方所有友方受到的傷害變為 ${Math.round(special.backlineDamageMultiplier * 100)}%`);
  if (special.redirectBehindDamage) parts.push("存活時：代替後方友方承受傷害");
  if (special.reflectBasicAttackDamage) parts.push("受到普通攻擊後：攻擊者受到等同於本次實際傷害的傷害，且無法被護甲或閃避抵銷");
  if (special.roundStartSelfDamage) parts.push(`每回合開始時：自身受到 ${special.roundStartSelfDamage} 傷害`);
  if (special.cleaveFrontTwo) parts.push("普通攻擊：同時攻擊敵方最前面兩個角色");
  if (special.gainAtkWhenDamaged) parts.push(`每次受到生命傷害後：自身攻擊 +${special.gainAtkWhenDamaged}`);
  if (special.roundFrontHp) parts.push(`每回合開始時：前方一格友方生命 +${special.roundFrontHp}`);
  if (special.roundFrontmostHeal) parts.push(`每回合開始時：我方最前排生命 +${special.roundFrontmostHeal}`);
  if (special.roundFrontAtk) parts.push(`每回合開始時：前方一格友方攻擊 +${special.roundFrontAtk}`);
  if (special.roundFrontmostAtk) parts.push(`每回合開始時：我方最前方角色攻擊 +${special.roundFrontmostAtk}`);
  if (special.roundEnemyFrontAtkSet != null) parts.push(`每回合開始時：敵方最前排攻擊變為 ${special.roundEnemyFrontAtkSet}`);
  if (special.roundSelfAtkLoss) parts.push(`每回合開始時：自身攻擊 -${special.roundSelfAtkLoss}，最低降至 ${special.roundSelfAtkMinimum ?? 0}`);
  if (special.roundSelfAtk || special.roundSelfHp) {
    const gains = [
      special.roundSelfAtk ? `攻擊 +${special.roundSelfAtk}` : null,
      special.roundSelfHp ? `生命 +${special.roundSelfHp}` : null,
    ].filter(Boolean).join("、");
    parts.push(`每回合開始時：自身${gains}`);
  }
  if (special.roundRandomAllyArmor) parts.push(`每回合開始時：隨機一名友方獲得 ${special.roundRandomAllyArmor} 護甲`);
  if (special.teamAtkAura) parts.push(`開戰時：每有一個此效果，友方全體攻擊 +${special.teamAtkAura}`);
  if (special.roundTeamAtk) parts.push(`每回合開始時：友方全體攻擊 +${special.roundTeamAtk}`);
  if (special.nonAttackDamageMultiplier) parts.push(`存活時：友方非普通攻擊傷害變為 ${special.nonAttackDamageMultiplier} 倍`);
  if (special.effectDamageMultiplier) parts.push(`存活時：友方開戰、每回合開始、死亡效果造成的傷害變為 ${special.effectDamageMultiplier} 倍`);
  if (special.attackAllDamage) parts.push(`普通攻擊：改為對所有敵方各造成 ${special.attackAllDamage} 傷害`);
  else if (special.attackAll) parts.push("普通攻擊：攻擊敵方全體");
  if (special.attackBackline) parts.push("普通攻擊：優先攻擊敵方最後排");
  if (special.doubleStrike) parts.push("普通攻擊：對目標造成兩次獨立傷害");
  if (special.tripleStrikeDamage) parts.push(`普通攻擊：對敵方最前排造成 ${special.tripleStrikeHitCount ?? 3} 次 ${special.tripleStrikeDamage} 傷害`);
  if (special.roundSelfHeal) parts.push(`每回合開始時：自身生命 +${special.roundSelfHeal}`);
  if (special.roundFrontSummonEvery) {
    parts.push(
      `每 ${special.roundFrontSummonEvery} 回合開始時：在自身前方召喚`
      + `${special.roundFrontSummonName ?? "召喚物"}`
      + `（${special.roundFrontSummonAtk ?? 0}/${special.roundFrontSummonHp ?? 1}）`
    );
  }
  if (special.livingEnemyAtkPerUnit && special.livingEnemyHpPerUnit) {
    parts.push(`攻擊力／生命上限為 ${special.livingEnemyAtkPerUnit}／${special.livingEnemyHpPerUnit} × 敵方目前存活角色數`);
  } else if (special.livingEnemyAtkPerUnit) {
    parts.push(`攻擊力恆為基礎攻擊 + ${special.livingEnemyAtkPerUnit} × 敵方目前存活角色數`);
  }
  if (special.livingEnemyHpPerUnit && !special.livingEnemyAtkPerUnit) {
    parts.push(`生命上限為 ${special.livingEnemyHpPerUnit} × 敵方目前存活角色數`);
  }
  if (special.roundTeamHeal) parts.push(`每回合開始時：全隊生命 +${special.roundTeamHeal}`);
  if (special.deathBehindHpPerRound) parts.push(`死亡時：後方一格友方生命 +${special.deathBehindHpPerRound} × 當前回合數`);
  if (special.deathFrontDamage) parts.push(`死亡時：對敵方最前排造成 ${special.deathFrontDamage} 傷害`);
  if (special.deathBacklineDamage) parts.push(`死亡時：對敵方最後排造成 ${special.deathBacklineDamage} 傷害`);
  if (special.deathTeamAtk || special.deathTeamHp || special.deathTeamArmor) {
    const gains = [
      special.deathTeamAtk ? `攻擊 +${special.deathTeamAtk}` : null,
      special.deathTeamHp ? `生命 +${special.deathTeamHp}` : null,
      special.deathTeamArmor ? `護甲 +${special.deathTeamArmor}` : null,
    ].filter(Boolean).join("、");
    parts.push(`死亡時：其他存活友方${gains}`);
  }
  if (special.gainAtkOnAnyDeath || special.gainHpOnAnyDeath) parts.push(`任一角色死亡時：自身攻擊 +${special.gainAtkOnAnyDeath ?? 0}、生命 +${special.gainHpOnAnyDeath ?? 0}`);
  if (special.splitUnitCount) parts.push(`進入戰鬥時：展開成 ${special.splitUnitCount} 個 ${special.splitUnitAtk}/${special.splitUnitHp} 無技能單位`);
  if (special.deathSplitMaxGenerations) parts.push(`死亡時：分裂成兩個攻擊與生命為該代初始值一半的角色，最多分裂 ${special.deathSplitMaxGenerations} 次`);
  if (special.openingLowestHpDamage) parts.push(`開戰時：對敵方生命最低角色造成 ${special.openingLowestHpDamage} 傷害；同生命優先選最後排`);
  if (special.openingFrontHp) parts.push(`開戰時：前方一格友方生命 +${special.openingFrontHp}`);
  if (special.openingFrontAtk) parts.push(`開戰時：前方一格友方攻擊 +${special.openingFrontAtk}`);
  if (special.openingFrontStats) parts.push(`開戰時：前方一格友方攻擊與生命各 +${special.openingFrontStats}`);
  if (special.openingSelfTaunt) parts.push("開戰時：自身獲得嘲諷，使敵方非範圍傷害優先攻擊自己");
  if (special.openingAdjacentArmor) parts.push(`開戰時：左右相鄰友方各獲得 ${special.openingAdjacentArmor} 護甲`);
  if (special.openingTeamAtk) parts.push(`開戰時：友方全體攻擊 +${special.openingTeamAtk}`);
  if (special.openingTeamArmor) parts.push(`開戰時：所有友方各獲得 ${special.openingTeamArmor} 護甲`);
  return parts.join("；") || null;
}

export function getCardTier(data) {
  return data?.tier ?? getPetTierByName(data?.name ?? "");
}

export function getPetQualityLabel(tier) {
  return { 1: "普通", 2: "稀有", 3: "史詩", 4: "傳奇" }[tier] ?? "普通";
}

export function buildNewPet(basePet, level = 1) {
  const tier = basePet.tier ?? getPetTierByName(basePet.name);
  const catalogPet = PET_POOL[tier]?.find((pet) => pet.name === basePet.name);
  const resolvedLevel = Math.max(1, Math.min(MAX_PET_LEVEL, level));
  const gameRoundsDeployed = basePet.gameRoundsDeployed ?? 0;
  const evolved = Boolean(basePet.evolved || (catalogPet?.special?.evolvesAfterGameRounds && gameRoundsDeployed >= catalogPet.special.evolvesAfterGameRounds));
  const regularStats = getPetLevelStats(basePet.name, tier, resolvedLevel);
  const evolvedBase = catalogPet?.special?.evolvedStats;
  const levelScale = getLevelMultiplier(resolvedLevel);
  const stats = evolved && evolvedBase
    ? { atk: Math.floor(evolvedBase.atk * levelScale), hp: Math.floor(evolvedBase.hp * levelScale) }
    : regularStats;
  const baseSpecial = catalogPet?.special ?? basePet.special ?? {};
  const special = scaleSpecialForLevel(baseSpecial, resolvedLevel);
  const deployments = basePet.deployments ?? (special.oncePerGame ? gameRoundsDeployed : 0);
  return {
    name: basePet.name,
    image: evolved ? (special.evolvedImage ?? basePet.image ?? catalogPet?.image ?? "") : (basePet.image ?? catalogPet?.image ?? ""),
    displayName: evolved ? special.evolvedName : undefined,
    atk: stats?.atk ?? basePet.atk ?? 0,
    hp: stats?.hp ?? basePet.hp ?? 0,
    level: resolvedLevel,
    tier,
    tags: basePet.tags ?? catalogPet?.tags ?? [],
    pierce: Boolean(basePet.pierce ?? catalogPet?.pierce),
    special,
    deployments,
    gameRoundsDeployed,
    evolved,
  };
}

export function formatDisplayName(name) {
  return String(name ?? "").replaceAll("_", " ");
}
