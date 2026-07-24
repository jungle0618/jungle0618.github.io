import { createBattleReplay, runBattle } from "../../lib/battleService";

/**
 * 工人模式前端的正式結算入口。每個 job 已包含單人或合併後的雙人陣容；
 * 空格會由共用戰鬥引擎自然略過。計分規則由呼叫端傳入，避免綁死單人分數。
 */
export function resolveOfficialBattle(job, calculateScore) {
  const battleResult = runBattle(job.leftTeam, job.rightTeam);
  const score = calculateScore(battleResult, job);
  return createBattleReplay(battleResult, {
    battleId: job.battleId,
    encounterId: job.encounterId,
    encounterName: job.encounterName,
    challengeId: job.challengeId,
    kind: job.kind,
    round: job.round,
    teamIds: [...(job.teamIds ?? [])],
    score,
  });
}

export function resolveOfficialRound(jobs = [], calculateScore) {
  if (typeof calculateScore !== "function") {
    throw new TypeError("resolveOfficialRound requires a score calculator");
  }
  const battles = jobs.map((job) => resolveOfficialBattle(job, calculateScore));
  const scoreByTeamId = {};
  battles.forEach((battle) => {
    const points = Number(battle.score?.total) || 0;
    battle.teamIds.forEach((teamId) => {
      scoreByTeamId[teamId] = (scoreByTeamId[teamId] ?? 0) + points;
    });
  });
  return {
    round: jobs[0]?.round,
    battles,
    scoreByTeamId,
  };
}
