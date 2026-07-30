import { DEMO_ENEMY_ENCOUNTERS, FORMAL_ENEMY_ENCOUNTERS } from "./characterConfig";
import {
  DUO_CONTRIBUTION_SIZE,
  DEMO_USES_FORMAL_ENCOUNTERS,
  MAX_BOSS_LEVEL,
  ROUND_CHALLENGE_SCHEDULE,
  TEAM_SIZE,
} from "./gameConfig";

export { MAX_BOSS_LEVEL, ROUND_CHALLENGE_SCHEDULE } from "./gameConfig";
export const SINGLE_CHALLENGE_TEAM_SIZE = TEAM_SIZE;
export const DUO_CHALLENGE_TEAM_SIZE = DUO_CONTRIBUTION_SIZE * 2;
export const DEMO_GAME_ENCOUNTERS = DEMO_ENEMY_ENCOUNTERS;
export const CHALLENGE_MODES = Object.freeze({
  DEMO: "demo",
  MULTIPLAYER: "multiplayer",
});

let formalEncounterCatalog = FORMAL_ENEMY_ENCOUNTERS.map((encounter) => cloneEncounter(encounter)).filter(Boolean);
export { formalEncounterCatalog as GAME_ENCOUNTERS };

function cloneEncounter(encounter) {
  if (!encounter) return null;
  return JSON.parse(JSON.stringify(encounter));
}

export function setFormalEncounterCatalog(encounters = []) {
  formalEncounterCatalog = Array.isArray(encounters)
    ? encounters.map((encounter) => cloneEncounter(encounter)).filter(Boolean)
    : [];
}

export function getFormalEncounterCatalog() {
  return formalEncounterCatalog.map((encounter) => cloneEncounter(encounter)).filter(Boolean);
}

export function getGameEncounter(round) {
  return getFormalEncounterCatalog()[Math.max(0, Math.min(Math.max(0, formalEncounterCatalog.length - 1), round - 1))] ?? null;
}

export function getMultiplayerRoundChallenges(round) {
  return getRoundChallengesForMode(round, CHALLENGE_MODES.MULTIPLAYER);
}

export function getDemoRoundChallenges(round) {
  return getRoundChallengesForMode(round, CHALLENGE_MODES.DEMO);
}

export function getRoundChallengesForMode(round, mode) {
  const challengeSpecs = ROUND_CHALLENGE_SCHEDULE[Math.max(0, Math.min(ROUND_CHALLENGE_SCHEDULE.length - 1, round - 1))] ?? [];
  const usesDemoEncounters = mode === CHALLENGE_MODES.DEMO && !DEMO_USES_FORMAL_ENCOUNTERS;
  const encounterKey = usesDemoEncounters ? "demoEncounterRound" : "multiplayerEncounterRound";
  const encounters = usesDemoEncounters ? DEMO_GAME_ENCOUNTERS : formalEncounterCatalog;
  if (!usesDemoEncounters && encounters.length === 0) return [];
  return challengeSpecs.map((spec, index) => ({
    id: `${round}-${index + 1}-${spec.kind}`,
    round,
    index,
    kind: spec.kind,
    encounter: encounters[Math.max(0, Math.min(encounters.length - 1, Number(spec[encounterKey] ?? spec.multiplayerEncounterRound ?? spec.encounterRound ?? round) - 1))],
    teamSize: spec.kind === "duo" ? DUO_CHALLENGE_TEAM_SIZE : SINGLE_CHALLENGE_TEAM_SIZE,
    maxBossLevel: MAX_BOSS_LEVEL,
    scoreEnabled: true,
  }));
}

export function getChallengeLabel(challenge) {
  if (challenge.kind === "tutorial") return "教學關";
  if (challenge.kind === "duo") return "雙人關";
  return "單人關";
}
