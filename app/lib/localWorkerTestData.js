import { getChallengeLabel, getMultiplayerRoundChallenges } from "./challengeConfig";
import { MAX_BOSS_LEVEL, TEAM_SIZE } from "./gameConfig";

const WORKER_ONLY_TEST_CHALLENGES = Object.freeze([
  Object.freeze({
    id: "worker-special-living-enemy-power",
    round: 0,
    index: -1,
    kind: "single",
    kindLabel: "工人測試關",
    label: "工人測試關｜存活威壓",
    encounter: Object.freeze({
      name: "存活威壓",
      description: "前衛依我方存活數成長，搭配白板後衛檢查壓力曲線。",
      enemyIds: ["worker_living_enemy_power", "worker_living_enemy_guard"],
    }),
    teamSize: TEAM_SIZE,
    maxBossLevel: MAX_BOSS_LEVEL,
    scoreEnabled: false,
  }),
  Object.freeze({
    id: "worker-special-summoning-hen",
    round: 0,
    index: -1,
    kind: "single",
    kindLabel: "工人測試關",
    label: "工人測試關｜孵蛋母雞",
    encounter: Object.freeze({
      name: "孵蛋母雞",
      description: "母雞持續在前方召喚雞蛋，測試清場與前線壓力。",
      enemyIds: ["worker_summoning_hen"],
    }),
    teamSize: TEAM_SIZE,
    maxBossLevel: MAX_BOSS_LEVEL,
    scoreEnabled: false,
  }),
  Object.freeze({
    id: "worker-special-survival-split",
    round: 0,
    index: -1,
    kind: "single",
    kindLabel: "工人測試關",
    label: "工人測試關｜死亡分裂",
    encounter: Object.freeze({
      name: "死亡分裂",
      description: "單體首領死亡後分裂，測試範圍輸出與收尾能力。",
      enemyIds: ["worker_survival_splitter"],
    }),
    teamSize: TEAM_SIZE,
    maxBossLevel: MAX_BOSS_LEVEL,
    scoreEnabled: false,
  }),
]);

function scheduledWorkerChallenges() {
  return Array.from({ length: 10 }, (_, index) => getMultiplayerRoundChallenges(index + 1)
    .map((challenge) => ({
      ...challenge,
      testRound: index + 1,
      kindLabel: getChallengeLabel(challenge),
      label: `${getChallengeLabel(challenge)}｜${challenge.encounter.name}`,
    }))
  ).flat();
}

export function getLocalWorkerTestData() {
  return {
    challenges: [...scheduledWorkerChallenges(), ...WORKER_ONLY_TEST_CHALLENGES],
  };
}
