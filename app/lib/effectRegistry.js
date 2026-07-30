/**
 * 技能的共用中繼資料。
 * 新增固定數值型技能時，只需在此標示成長與標籤，不必分別維護多份 key 清單。
 */
export const ADDITIVE_EFFECT_KEYS = new Set([
  "openingHighestHpDamage", "openingEnemyAllDamage", "roundShield", "roundShieldAllAhead",
  "roundSelfHeal", "roundTeamHeal", "roundHpAllAhead", "roundFrontArmor",
  "roundFrontArmorBreak", "roundLowestEnemyDamage", "roundFrontFixedDamage",
  "roundEnemyAllDamage", "roundTenEnemyAllDamage", "gainAtkWhenDamaged", "roundFrontHp", "roundFrontmostHeal",
  "roundFrontAtk", "roundFrontmostAtk", "roundSelfAtk", "roundSelfHp",
  "roundRandomAllyArmor", "roundStartSelfDamage", "teamAtkAura", "roundTeamAtk",
  "attackAllDamage", "deathBehindHpPerRound", "deathFrontDamage", "deathBacklineDamage",
  "deathEnemyAllDamage", "deathTeamAtk", "deathTeamHp", "deathTeamArmor",
  "gainAtkOnAnyDeath", "gainHpOnAnyDeath", "openingLowestHpDamage", "openingFrontHp",
  "openingFrontAtk", "openingFrontStats", "openingAdjacentArmor", "openingSelfArmor",
  "openingTeamAtk", "openingTeamArmor", "roundAdjacentArmor", "tripleStrikeDamage",
  "roundSelfAtkLoss", "roundSelfAtkMinimum",
  "attackArmoredOrDodgeHeal",
  "roundFrontSummonAtk", "roundFrontSummonHp",
  "roundFrontSummonDeathSourceAtk",
  "livingEnemyAtkPerUnit", "livingEnemyHpPerUnit",
]);

const NON_ADDITIVE_EFFECT_KEYS = [
  "atkPerArmorGained", "attackAll", "attackBackline", "backlineDamageMultiplier", "cannotReceiveAllyHealing",
  "cleaveFrontTwo", "reflectBasicAttackDamage", "deathEffectCountAoe",
  "deathFrontCurrentHpPercent", "dodge", "effectDamageMultiplier", "enemyHealingMultiplier",
  "enemyHpGainMultiplier", "evolvedImage", "evolvedName", "evolvedStats", "evolvesAfterGameRounds",
  "fixedIncomingDamage", "frontDamageMultiplier", "frontSwapAtkHp", "mountDodge", "nonAttackDamageMultiplier",
  "oncePerGame", "openingEnemyAllHitCount", "openingSelfTaunt", "openingSwapEnemyEnds", "rangeDamageMultiplier", "teamIncomingDamageMultiplier",
  "redirectBehindDamage", "roundEnemyFrontAtkSet", "shieldGainHp", "shieldGainStats", "splitUnitAtk", "splitUnitCount", "tripleStrikeHitCount",
  "splitUnitHp", "doubleStrike",
  "roundFrontSummonEvery", "roundFrontSummonName", "roundFrontSummonImage",
  "deathSplitMaxGenerations",
];

/** 所有可在 characterConfig 的 special 中使用的欄位。 */
export const KNOWN_SPECIAL_KEYS = new Set([...ADDITIVE_EFFECT_KEYS, ...NON_ADDITIVE_EFFECT_KEYS]);

/**
 * 防止技能 key 拼錯後靜默失效。保留舊版 enemyHealingMultiplier 以相容既有存檔。
 */
export function validateSpecialDefinitions(definitions, collectionName) {
  Object.entries(definitions).forEach(([characterName, character]) => {
    const unknownKeys = Object.keys(character.special ?? {}).filter((key) => !KNOWN_SPECIAL_KEYS.has(key));
    if (unknownKeys.length) {
      throw new Error(`${collectionName} 的「${characterName}」包含未知技能欄位：${unknownKeys.join(", ")}`);
    }
  });
}

const TAG_EFFECT_KEYS = {
  增益: ["teamAtkAura", "roundTeamAtk", "openingFrontStats", "openingAdjacentArmor", "openingSelfArmor", "openingTeamAtk", "openingTeamArmor", "roundFrontAtk", "roundFrontmostAtk", "roundSelfAtk", "roundSelfHeal", "roundTeamHeal", "roundFrontmostHeal", "roundFrontHp", "roundHpAllAhead", "roundSelfHp", "shieldGainStats", "shieldGainHp", "nonAttackDamageMultiplier", "effectDamageMultiplier"],
  護甲: ["roundShield", "roundShieldAllAhead", "roundFrontArmor", "roundAdjacentArmor", "roundRandomAllyArmor", "openingAdjacentArmor", "openingSelfArmor", "openingTeamArmor", "shieldGainStats", "shieldGainHp", "deathTeamArmor"],
  保排: ["rangeDamageMultiplier", "teamIncomingDamageMultiplier", "backlineDamageMultiplier", "redirectBehindDamage", "openingSelfTaunt", "mountDodge", "dodge", "roundShieldAllAhead", "roundHpAllAhead", "roundFrontmostHeal"],
  死亡: ["deathEffectCountAoe", "deathEnemyAllDamage", "deathBehindHpPerRound", "deathFrontDamage", "deathBacklineDamage", "deathTeamAtk", "deathTeamHp", "deathTeamArmor", "gainAtkOnAnyDeath", "splitUnitCount", "deathSplitMaxGenerations"],
  範圍: ["attackAll", "attackAllDamage", "openingEnemyAllDamage", "roundEnemyAllDamage", "roundTenEnemyAllDamage", "deathEffectCountAoe", "deathEnemyAllDamage"],
  刺客: ["attackBackline", "openingLowestHpDamage", "roundLowestEnemyDamage"],
  成長: ["evolvesAfterGameRounds", "gainAtkWhenDamaged", "roundSelfAtk", "gainAtkOnAnyDeath"],
  控制: ["openingSwapEnemyEnds", "frontSwapAtkHp", "openingSelfTaunt", "enemyHpGainMultiplier", "enemyHealingMultiplier", "cannotReceiveAllyHealing", "roundEnemyFrontAtkSet", "roundFrontArmorBreak"],
};

export function scaleSpecialForLevel(special = {}, level = 1, growth = 1.2) {
  const multiplier = Math.pow(growth, Math.max(0, Number(level ?? 1) - 1));
  const resolvedLevel = Math.max(1, Math.min(10, Number(level ?? 1)));
  return Object.fromEntries(Object.entries(special).map(([key, value]) => [
    key,
    key === "splitUnitCount" && typeof value === "number"
      ? value + Math.floor((resolvedLevel - 1) / 3)
      : ADDITIVE_EFFECT_KEYS.has(key) && typeof value === "number"
      ? Math.floor(value * multiplier)
      : value,
  ]));
}

export function getCharacterTags(character = {}) {
  const declaredTags = character.tags?.filter((tag) => typeof tag === "string" && tag.trim());
  if (declaredTags?.length) return [...new Set(declaredTags)];

  const special = character.special ?? {};
  const stats = character.baseStats ?? character;
  const hasAny = (...keys) => keys.some((key) => special[key] != null && special[key] !== false);
  const tags = new Set();

  Object.entries(TAG_EFFECT_KEYS).forEach(([tag, keys]) => {
    if (hasAny(...keys)) tags.add(tag);
  });
  if ((character.battleArmor ?? 0) > 0) tags.add("護甲");
  if (hasAny("roundFrontmostHeal")) tags.add("保排");
  if (hasAny("fixedIncomingDamage", "roundShield", "rangeDamageMultiplier", "backlineDamageMultiplier", "roundStartSelfDamage") || (stats.hp ?? 0) >= 30) tags.add("坦克");
  if (hasAny("attackAll", "attackAllDamage", "attackBackline", "doubleStrike", "tripleStrikeDamage", "openingHighestHpDamage", "openingLowestHpDamage", "roundLowestEnemyDamage", "roundFrontFixedDamage", "deathFrontDamage", "deathBacklineDamage", "gainAtkWhenDamaged", "atkPerArmorGained") || character.pierce || (stats.atk ?? 0) >= 15) tags.add("主C");

  return [...tags];
}
