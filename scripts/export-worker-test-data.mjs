import { buildNewPet, getPetCompendiumList } from "../app/lib/petCatalog.js";
import { getChallengeLabel, getMultiplayerRoundChallenges, setFormalEncounterCatalog } from "../app/lib/challengeConfig.js";
import { selectTeamByLevel } from "../app/lib/lineupLogic.js";
import { WORKER_ONLY_TEST_CHALLENGES } from "../app/lib/workerTestConfig.js";
import { getPrecomputedOptimalTestTeams } from "../app/lib/testModeOptimalTeams.js";
import { FORMAL_CARD_VALUE_METRICS } from "../app/lib/formalCardValueMetrics.js";
import { FORMAL_ENCOUNTER_SEED } from "./formalEncounterSeed.mjs";

setFormalEncounterCatalog(FORMAL_ENCOUNTER_SEED);

const scheduled = Array.from({ length: 10 }, (_, index) => getMultiplayerRoundChallenges(index + 1)
  .map((challenge) => ({
    ...challenge,
    testRound: index + 1,
    kindLabel: getChallengeLabel(challenge),
    label: `${getChallengeLabel(challenge)}｜${challenge.encounter.name}`,
  }))
).flat();
const challenges = [...scheduled, ...WORKER_ONLY_TEST_CHALLENGES];
const collection = getPetCompendiumList().map((card) => buildNewPet(card, 1));
const names = (team) => team.filter(Boolean).map((pet) => pet.name);

const optimalLineups = Object.fromEntries(challenges.map((challenge) => [
  challenge.id,
  getPrecomputedOptimalTestTeams(challenge.id, collection).map(names),
]));
const oneClickLineups = Object.fromEntries(challenges.map((challenge) => [
  challenge.id,
  names(selectTeamByLevel(collection, challenge.teamSize)),
]));

process.stdout.write(`${JSON.stringify({
  challenges,
  oneClickLineups,
  optimalLineups,
  metrics: FORMAL_CARD_VALUE_METRICS,
}, null, 2)}\n`);
