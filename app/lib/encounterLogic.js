import {
  ENEMY_LEVEL_GROWTH,
  getEnemyDefinition,
  getEnemyLevelMultiplier,
  scaleSpecialForLevel,
} from "./characterConfig";

export function buildEncounterTeamFromConfig(encounter, bossLevel = 1) {
  const level = Math.max(1, Math.floor(bossLevel));
  const multiplier = getEnemyLevelMultiplier(level);
  const entries = encounter.enemies ?? encounter.enemyIds ?? [];
  return entries.map((entry, index) => {
    const enemyId = typeof entry === "string" ? entry : entry.id ?? `custom-enemy-${index + 1}`;
    const base = typeof entry === "string" ? getEnemyDefinition(entry) : entry;
    if (!base) throw new Error(`找不到敵方角色定義：${enemyId}`);
    return {
      ...base,
      id: enemyId,
      isEnemy: true,
      tier: 4,
      special: scaleSpecialForLevel(base.special ?? {}, level, ENEMY_LEVEL_GROWTH),
      pierce: Boolean(base.pierce),
      battleArmor: Math.max(0, Math.floor((base.battleArmor ?? 0) * multiplier)),
      level,
      atk: Math.max(0, Math.floor(base.atk * multiplier)),
      hp: Math.max(1, Math.floor(base.hp * multiplier)),
    };
  });
}

export function buildChallengeEncounterTeam(challenge, bossLevel = 1) {
  return buildEncounterTeamFromConfig(challenge.encounter, bossLevel);
}
