import { getSoloEncounter } from "./soloConfig";
import { buildChallengeEncounterTeam, buildEncounterTeamFromConfig } from "./encounterLogic";
import { buildLevelSeriesScore, calculateLevelScore } from "./battleScoring";

export function buildEncounterTeam(round, bossLevel = 1) {
  return buildEncounterTeamFromConfig(getSoloEncounter(round), bossLevel);
}

export { buildChallengeEncounterTeam };

export function calculateSoloScore(battleResult, bossLevel = 1, options) {
  return calculateLevelScore(battleResult, bossLevel, options);
}

export function buildRoundScore(levelScores = [], { scoreEnabled = true } = {}) {
  return buildLevelSeriesScore(levelScores, { scoreEnabled });
}

export function buildSoloSummary(roundResults) {
  const totalScore = roundResults.reduce((sum, result) => sum + result.score.total, 0);
  return { totalScore, roundResults };
}
