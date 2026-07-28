import { simulateBattle } from "./battleLogic";
import { buildNewPet } from "./petCatalog";

function cloneLineup(lineup = []) {
  return lineup.map((pet) => (pet ? { ...pet, special: { ...(pet.special ?? {}) } } : null));
}

function applyEnvironmentToLineup(lineup = [], environment = null) {
  const flags = environment?.teamFlags ?? [];
  const isRaining = Boolean(environment?.isRaining);
  const waterParkTeamIds = new Set(
    flags.filter((flag) => flag?.waterParkEnabled).map((flag) => String(flag.teamId))
  );
  const turtleNetTeamIds = new Set(
    flags.filter((flag) => flag?.turtleNetEnabled).map((flag) => String(flag.teamId))
  );
  const inferSingleWaterParkBoost = waterParkTeamIds.size === 1;

  return cloneLineup(lineup).map((pet) => {
    if (!pet) return null;
    const teamId = pet.teamId != null ? String(pet.teamId) : null;
    const turtleNetEnabled = teamId ? turtleNetTeamIds.has(teamId) : turtleNetTeamIds.size > 0;
    const waterParkEnabled = isRaining && (teamId ? waterParkTeamIds.has(teamId) : inferSingleWaterParkBoost);
    if (!waterParkEnabled) return { ...pet, turtleNetEnabled };

    const boostedLevel = Math.max(1, Number(pet.level) || 1) + 2;
    return {
      ...buildNewPet({ ...pet, name: pet.name }, boostedLevel),
      teamId: pet.teamId,
      rosterId: pet.rosterId,
      version: pet.version,
      ownerName: pet.ownerName,
      turtleNetEnabled,
    };
  });
}

/**
 * 所有遊戲模式共用的戰鬥入口。呼叫端資料會先複製，避免測試戰鬥或
 * 工人正式結算意外修改畫面／伺服器快照。
 */
export function runBattle(leftTeam, rightTeam, options = {}) {
  return simulateBattle(
    applyEnvironmentToLineup(leftTeam, options.environment ?? null),
    cloneLineup(rightTeam)
  );
}

/** 將引擎結果轉成 BattleSection、歷史紀錄與後端都能共用的回放格式。 */
export function createBattleReplay(battleResult, metadata = {}) {
  return {
    ...metadata,
    frames: battleResult.battleFrames,
    battleDetail: battleResult.battleDetail,
    contributions: battleResult.contributions,
    outcome: {
      leftRemaining: battleResult.leftRemaining,
      rightRemaining: battleResult.rightRemaining,
      leftFinalHp: battleResult.leftFinalHp,
      rightFinalHp: battleResult.rightFinalHp,
      timedOut: Boolean(battleResult.timedOut),
    },
  };
}
