import { getChallengeLabel, getMultiplayerRoundChallenges } from "./challengeConfig";
import { selectTeamByLevel } from "./lineupLogic";
import { buildNewPet, getPetCompendiumList } from "./petCatalog";
import { getPrecomputedOptimalTestTeams } from "./testModeOptimalTeams";
import { WORKER_ONLY_TEST_CHALLENGES } from "./workerTestConfig";

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

function lineupNames(team = []) {
  return team.filter(Boolean).map((pet) => pet.name);
}

export function getLocalWorkerTestData() {
  const challenges = [...scheduledWorkerChallenges(), ...WORKER_ONLY_TEST_CHALLENGES];
  const collection = getPetCompendiumList().map((card) => buildNewPet(card, 1));
  return {
    challenges,
    oneClickLineups: Object.fromEntries(challenges.map((challenge) => [
      challenge.id,
      lineupNames(selectTeamByLevel(collection, challenge.teamSize)),
    ])),
    optimalLineups: Object.fromEntries(challenges.map((challenge) => [
      challenge.id,
      getPrecomputedOptimalTestTeams(challenge.id, collection).map(lineupNames),
    ])),
    metrics: {},
  };
}
