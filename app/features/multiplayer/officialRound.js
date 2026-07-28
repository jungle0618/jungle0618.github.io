import { getMultiplayerRoundChallenges } from "../../lib/challengeConfig";
import { buildChallengeEncounterTeam } from "../../lib/encounterLogic";
import { DUO_CLEAR_SCORE } from "../../lib/gameConfig";
import { buildDuoLineup, createMultiplayerBattleEnvironment, resolveDuoPairings } from "../../lib/multiplayerLogic";
import { hydrateMultiplayerRoster, hydrateSavedLineup } from "./multiplayerAdapter";
import { resolveOfficialRound } from "./workerBattleResolver";

function teamLineup(team, challenge) {
  const roster = hydrateMultiplayerRoster(team.roster ?? []);
  const size = challenge.kind === "duo" ? 3 : challenge.teamSize;
  const rows = (team.currentLineups ?? []).filter((row) => String(row.challengeId) === String(challenge.id));
  const slots = Array(size).fill(null);
  rows.forEach((row) => {
    const index = Number(row.slotIndex);
    if (index >= 0 && index < size) slots[index] = row.petName || null;
  });
  return hydrateSavedLineup(slots, roster, size);
}

export function buildOfficialBattleJobs(game) {
  const challenges = getMultiplayerRoundChallenges(game.round);
  const teamsById = new Map(game.teams.map((team) => [String(team.teamId), team]));
  const jobs = [];

  challenges.forEach((challenge) => {
    if (challenge.kind === "duo") {
      resolveDuoPairings(game, challenge.id).forEach((pair) => {
        const higher = teamsById.get(String(pair.higherRankTeamId));
        const lower = teamsById.get(String(pair.lowerRankTeamId));
        const lineup = buildDuoLineup(teamLineup(lower, challenge), teamLineup(higher, challenge));
        const environment = createMultiplayerBattleEnvironment(game, [higher, lower]);
        for (let level = 1; level <= challenge.maxBossLevel; level += 1) {
          jobs.push({
            battleId: `r${game.round}-${challenge.id}-${pair.pairId}-lv${level}`,
            encounterId: `${challenge.id}-${level}`,
            encounterName: challenge.encounter.name,
            challengeId: challenge.id,
            kind: "duo",
            round: game.round,
            bossLevel: level,
            teamIds: [String(higher.teamId), String(lower.teamId)],
            environment,
            leftTeam: lineup,
            rightTeam: buildChallengeEncounterTeam(challenge, level),
          });
        }
      });
      return;
    }

    game.teams.forEach((team) => {
      const lineup = teamLineup(team, challenge);
      const environment = createMultiplayerBattleEnvironment(game, [team]);
      for (let level = 1; level <= challenge.maxBossLevel; level += 1) {
        jobs.push({
          battleId: `r${game.round}-${challenge.id}-t${team.teamId}-lv${level}`,
          encounterId: `${challenge.id}-${level}`,
          encounterName: challenge.encounter.name,
          challengeId: challenge.id,
          kind: "single",
          round: game.round,
          bossLevel: level,
          teamIds: [String(team.teamId)],
          environment,
          leftTeam: lineup,
          rightTeam: buildChallengeEncounterTeam(challenge, level),
        });
      }
    });
  });
  return jobs;
}

export function calculateOfficialRound(game) {
  const result = resolveOfficialRound(buildOfficialBattleJobs(game), (battle, job) => {
    const cleared = battle.rightRemaining === 0 && !battle.timedOut;
    return { total: cleared ? (job.kind === "duo" ? DUO_CLEAR_SCORE : 1) : 0, cleared, bossLevel: job.bossLevel };
  });
  return { ...result, version: game.version };
}

/** 正式結算時一併提交每隊、每關的陣容版本，避免用舊畫面結果覆蓋新陣容。 */
export function getOfficialLineupVersions(game) {
  const challengeIds = getMultiplayerRoundChallenges(game.round).map((challenge) => challenge.id);
  return game.teams.flatMap((team) => challengeIds.map((challengeId) => ({
    teamId: String(team.teamId),
    challengeId,
    version: Math.max(0, ...(team.currentLineups ?? [])
      .filter((row) => String(row.challengeId) === challengeId)
      .map((row) => Number(row.version) || 0)),
  })));
}
