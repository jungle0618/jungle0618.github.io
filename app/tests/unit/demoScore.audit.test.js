import { expect, it } from "vitest";
import { simulateBattle } from "../../lib/battleLogic";
import { canDrawPetAtRound } from "../../lib/cardDrawLogic";
import { buildChallengeEncounterTeam } from "../../lib/encounterLogic";
import { MAX_BOSS_LEVEL } from "../../lib/gameConfig";
import { selectRandomTeam } from "../../lib/lineupLogic";
import { buildNewPet, getPetCompendiumList } from "../../lib/petCatalog";
import { getRoundChallenges } from "../../lib/soloConfig";

it("超難 Demo 每關的隨機 Lv.1 隊伍平均分數不超過 3", () => {
  let seed = 20260722;
  const random = () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const trials = 100;
  const rows = [];
  for (let round = 1; round <= 10; round += 1) {
    for (const challenge of getRoundChallenges(round)) {
      const pool = getPetCompendiumList()
        .filter((pet) => pet.tier < 4 && canDrawPetAtRound(pet, round))
        .map((pet) => buildNewPet(pet, 1));
      let total = 0;
      for (let trial = 0; trial < trials; trial += 1) {
        const team = selectRandomTeam(pool, challenge.teamSize, random).filter(Boolean);
        for (let level = 1; level <= MAX_BOSS_LEVEL; level += 1) {
          const battle = simulateBattle(team, buildChallengeEncounterTeam(challenge, level));
          if (battle.rightRemaining === 0 && !battle.timedOut) total += 1;
        }
      }
      rows.push({ order: rows.length + 1, name: challenge.encounter.name, averageScore: Number((total / trials).toFixed(2)) });
    }
  }
  expect(rows).toHaveLength(14);
  rows.forEach((row) => {
    expect(row.averageScore, row.name).toBeLessThanOrEqual(3);
  });
}, 60000);
