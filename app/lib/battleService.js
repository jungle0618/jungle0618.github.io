import { simulateBattle } from "./battleLogic";

function cloneLineup(lineup = []) {
  return lineup.map((pet) => (pet ? { ...pet, special: { ...(pet.special ?? {}) } } : null));
}

/**
 * 所有遊戲模式共用的戰鬥入口。呼叫端資料會先複製，避免測試戰鬥或
 * 工人正式結算意外修改畫面／伺服器快照。
 */
export function runBattle(leftTeam, rightTeam) {
  return simulateBattle(cloneLineup(leftTeam), cloneLineup(rightTeam));
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
