import { PET_DEFINITION_ORDER } from "./characterConfig";
import { DRAW_CARDS, INITIAL_ROUND_POOL_NAMES, MAX_LEVEL_GAP, MAX_PET_LEVEL } from "./gameConfig";
import { buildNewPet, getPetCompendiumList } from "./petCatalog";

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawSeed(round, cardCount) {
  return (round * 1_000_003 + cardCount * 1_000_019 + 7_741_329_653) >>> 0;
}

function sortCollection(collection) {
  return [...collection].sort((a, b) =>
    (a.tier ?? 1) - (b.tier ?? 1) || String(a.name).localeCompare(String(b.name))
  );
}

export function canDrawPetAtRound(pet, round) {
  return Number(round) >= (Number(pet?.drawFromRound) || 1);
}

export function buildInitialRoundCollection() {
  return INITIAL_ROUND_POOL_NAMES.map((name) => buildNewPet({ name }, 1));
}

/** 單人與多人共用的可重現抽卡規則；傳入不同 salt 可讓各小隊分別抽卡。 */
export function drawPetCards(round, cardCount = DRAW_CARDS, salt = 0, gameSeed = 0) {
  const pool = getPetCompendiumList().filter((pet) => pet.tier < 4 && canDrawPetAtRound(pet, round));
  const seed = (
    drawSeed(round, cardCount) ^
    (Math.imul(Number(salt) | 0, 2654435761) | 0) ^
    (Math.imul(Number(gameSeed) | 0, 1597334677) | 0)
  ) >>> 0;
  const rand = mulberry32(seed);
  return Array.from({ length: cardCount }, (_, index) => {
    const pet = pool[Math.floor(rand() * pool.length)];
    return {
      id: `draw-r${round}-s${salt}-i${index}-${pet.name}`,
      ...buildNewPet(pet),
    };
  });
}

/** 抽到新角色就解鎖；重複角色升級，並維持已解鎖角色最高最低不超過設定上限。 */
export function applyDrawsToCollection(collection, draws) {
  const byName = new Map(collection.filter(Boolean).map((pet) => [pet.name, { ...pet }]));
  const definitionIndex = new Map(PET_DEFINITION_ORDER.map((name, index) => [name, index]));
  const getLevelRange = () => {
    const levels = [...byName.values()].map((pet) => pet.level ?? 1);
    return levels.length ? Math.max(...levels) - Math.min(...levels) : 0;
  };
  const upgradeFirstLowest = () => {
    const unlocked = [...byName.values()];
    if (!unlocked.length) return;
    const lowestLevel = Math.min(...unlocked.map((pet) => pet.level ?? 1));
    const target = unlocked
      .filter((pet) => (pet.level ?? 1) === lowestLevel)
      .sort((a, b) =>
        (definitionIndex.get(a.name) ?? Number.MAX_SAFE_INTEGER) -
        (definitionIndex.get(b.name) ?? Number.MAX_SAFE_INTEGER)
      )[0];
    if (!target || lowestLevel >= MAX_PET_LEVEL) return;
    byName.set(target.name, buildNewPet(target, lowestLevel + 1));
  };

  for (const draw of draws) {
    const owned = byName.get(draw.name);
    if (!owned) {
      byName.set(draw.name, buildNewPet(draw, 1));
      if (getLevelRange() > MAX_LEVEL_GAP) upgradeFirstLowest();
      continue;
    }
    const fromLevel = owned.level ?? 1;
    const toLevel = Math.min(MAX_PET_LEVEL, fromLevel + 1);
    byName.set(draw.name, buildNewPet(owned, toLevel));
    if (getLevelRange() > MAX_LEVEL_GAP) {
      byName.set(draw.name, owned);
      upgradeFirstLowest();
    }
  }
  return sortCollection([...byName.values()]);
}
