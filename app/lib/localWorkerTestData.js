import { getChallengeLabel, getMultiplayerRoundChallenges } from "./challengeConfig";
import { WORKER_ONLY_TEST_CHALLENGES } from "./workerTestConfig.js";

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
