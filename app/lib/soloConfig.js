import { getDemoRoundChallenges, SINGLE_CHALLENGE_TEAM_SIZE } from "./challengeConfig";

export { BATTLE_TURN_LIMIT as SOLO_TURN_LIMIT } from "./gameConfig";
export {
  DUO_CHALLENGE_TEAM_SIZE,
  GAME_ENCOUNTERS as SOLO_ENCOUNTERS,
  MAX_BOSS_LEVEL as SOLO_MAX_BOSS_LEVEL,
  ROUND_CHALLENGE_SCHEDULE,
  SINGLE_CHALLENGE_TEAM_SIZE,
  getChallengeLabel,
  getGameEncounter as getSoloEncounter,
} from "./challengeConfig";
export const getRoundChallenges = getDemoRoundChallenges;
export const TUTORIAL_POOL_NAMES = [
  "貓",
  "河馬",
  "雪貂",
  "兔子",
  "熊",
  "大猩猩",
  "鯉魚王",
  "橘子",
];
export const TUTORIAL_RECOMMENDED_TEAM = [
  "大猩猩",
  "兔子",
  "雪貂",
  "河馬",
  "橘子",
];

export const TUTORIAL_ENCOUNTER = {
  name: "教學關",
  description: "訓練用單人關卡；需要安排增益鏈與前排承傷，通過 Lv.1 後才會進入正式第 1 回合。",
  enemyIds: ["tutorial_guard"],
};

export const TUTORIAL_CHALLENGE = {
  id: "tutorial-before-round-1",
  round: 0,
  index: 0,
  kind: "tutorial",
  encounter: TUTORIAL_ENCOUNTER,
  teamSize: SINGLE_CHALLENGE_TEAM_SIZE,
  maxBossLevel: 1,
  scoreEnabled: false,
};

export function getTutorialChallenge() {
  return { ...TUTORIAL_CHALLENGE };
}
