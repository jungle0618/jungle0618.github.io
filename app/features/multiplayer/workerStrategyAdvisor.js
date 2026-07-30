import { runBattle } from "../../lib/battleService";
import { getMultiplayerRoundChallenges } from "../../lib/challengeConfig";
import { ONCE_PER_GAME_PET_NAMES } from "../../lib/characterConfig";
import { buildChallengeEncounterTeam } from "../../lib/encounterLogic";
import { buildDuoLineup } from "../../lib/multiplayerLogic";
import { buildNewPet } from "../../lib/petCatalog";

const POPULATION_SIZE = 180;
const GENERATION_COUNT = 90;
const ELITE_COUNT = 36;
const MUTATION_RATE = 0.44;
const LOCAL_SEARCH_PASSES = 2;

function pauseFrame() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function normalizeName(value) {
  return String(value ?? "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createRosterLevelDraft(team, allPets) {
  const rosterByName = new Map(safeArray(team.rosterMeta ?? team.roster).map((pet) => [String(pet.petName), pet]));
  return Object.fromEntries(allPets.map((pet) => [
    pet.name, Number(rosterByName.get(pet.name)?.level) || 0,
  ]));
}

function createRosterEnableDraft(team, allPets) {
  const rosterByName = new Map(safeArray(team.rosterMeta ?? team.roster).map((pet) => [String(pet.petName), pet]));
  return Object.fromEntries(allPets.map((pet) => {
    const row = rosterByName.get(pet.name);
    return [pet.name, row ? row.enable !== false && (Number(row.level) || 0) > 0 : false];
  }));
}

function getSavedLineup(team, challenge, slotCount) {
  const rows = safeArray(team.currentLineups)
    .filter((row) => String(row.challengeId) === String(challenge.id))
    .sort((a, b) => Number(a.slotIndex) - Number(b.slotIndex));
  return Array.from({ length: slotCount }, (_, index) => rows.find((row) => Number(row.slotIndex) === index)?.petName ?? "");
}

function createLineupDraft(team, challenges) {
  return Object.fromEntries(challenges.map((challenge) => {
    const slotCount = challenge.kind === "duo" ? 3 : challenge.teamSize;
    return [challenge.id, getSavedLineup(team, challenge, slotCount)];
  }));
}

function isSingleUseName(name) {
  return ONCE_PER_GAME_PET_NAMES.includes(String(name));
}

function buildRoster(team, allPets, levelDraft, enableDraft, { includeSingleUse = false } = {}) {
  const rosterByName = new Map(safeArray(team.rosterMeta ?? team.roster).map((pet) => [String(pet.petName), pet]));
  return allPets
    .map((pet) => {
      const level = Number(levelDraft[pet.name]) || 0;
      if (level <= 0) return null;
      if (enableDraft?.[pet.name] === false) return null;
      if (!includeSingleUse && isSingleUseName(pet.name)) return null;
      const base = rosterByName.get(pet.name) ?? {};
      return buildNewPet({
        name: pet.name,
        gameRoundsDeployed: Number(base.gameRoundsDeployed) || 0,
        version: Number(base.version) || 0,
      }, level);
    })
    .filter(Boolean);
}

function sortRosterByStrength(roster = []) {
  return [...roster].sort((a, b) =>
    (b.level ?? 1) - (a.level ?? 1) ||
    (b.atk ?? 0) - (a.atk ?? 0) ||
    (b.hp ?? 0) - (a.hp ?? 0) ||
    String(a.name).localeCompare(String(b.name), "zh-Hant")
  );
}

function buildPartnerMap(game, challenges) {
  const pairings = new Map();
  safeArray(game.currentPairings ?? game.duoPairings).forEach((pair) => {
    if (!pair?.challengeId) return;
    pairings.set(String(pair.challengeId), {
      higherRankTeamId: String(pair.higherRankTeamId),
      lowerRankTeamId: String(pair.lowerRankTeamId),
    });
  });
  return Object.fromEntries(challenges.map((challenge) => [challenge.id, pairings.get(String(challenge.id)) ?? null]));
}

function sanitizeLineupNames(names, slotCount, allowedNameSet, usedNames = null) {
  const next = Array(slotCount).fill("");
  const seen = new Set();
  safeArray(names).slice(0, slotCount).forEach((name, index) => {
    const normalized = normalizeName(name);
    if (!normalized || !allowedNameSet.has(normalized) || seen.has(normalized)) return;
    if (usedNames && usedNames.has(normalized)) return;
    next[index] = normalized;
    seen.add(normalized);
    usedNames?.add(normalized);
  });
  return next;
}

function buildActualLineupDraft(team, challenges, lineupDraft, rosterMap) {
  const allowedNames = new Set([...rosterMap.keys()]);
  const usedNames = new Set();
  return Object.fromEntries(challenges.map((challenge) => {
    const slotCount = challenge.kind === "duo" ? 3 : challenge.teamSize;
    return [challenge.id, sanitizeLineupNames(lineupDraft[challenge.id] ?? [], slotCount, allowedNames, usedNames)];
  }));
}

function lineupNamesToPets(names, rosterMap, slotCount) {
  return Array.from({ length: slotCount }, (_, index) => {
    const name = normalizeName(names[index]);
    return name && rosterMap.has(name) ? { ...rosterMap.get(name) } : null;
  });
}

function createEnemyCache(challenges) {
  const cache = new Map();
  function getEnemy(challenge, bossLevel) {
    const key = `${challenge.id}:${bossLevel}`;
    if (!cache.has(key)) {
      cache.set(key, buildChallengeEncounterTeam(challenge, bossLevel));
    }
    return cache.get(key).map((pet) => ({ ...pet, special: { ...(pet.special ?? {}) } }));
  }
  getEnemy.battleCache = new Map();
  return getEnemy;
}

function battleAtLevel(leftTeam, challenge, bossLevel, getEnemy) {
  const result = runBattle(
    leftTeam.map((pet) => (pet ? { ...pet, special: { ...(pet.special ?? {}) } } : null)),
    getEnemy(challenge, bossLevel)
  );
  const cleared = result.rightRemaining === 0 && !result.timedOut;
  const remainingHp = Math.max(0, Number(result.rightFinalHp) || 0);
  const initialHp = Math.max(1, Number(result.rightInitialHp) || 1);
  return { cleared, remainingHp, initialHp };
}

function buildBattleCacheKey(challenge, lineup, bossLevel) {
  const names = lineup.map((pet) => (pet ? `${pet.name}@${pet.level ?? 1}` : "")).join("|");
  return `${challenge.id}:${bossLevel}:${names}`;
}

function getBattleAtLevelCached(leftTeam, challenge, bossLevel, getEnemy) {
  const key = buildBattleCacheKey(challenge, leftTeam, bossLevel);
  if (!getEnemy.battleCache.has(key)) {
    getEnemy.battleCache.set(key, battleAtLevel(leftTeam, challenge, bossLevel, getEnemy));
  }
  return getEnemy.battleCache.get(key);
}

function evaluateChallengeLineup({ challenge, lineup, partnerLineup = null, ownIsHigherRank = false, getEnemy }) {
  const leftTeam = challenge.kind === "duo"
    ? (ownIsHigherRank ? buildDuoLineup(partnerLineup ?? [], lineup ?? []) : buildDuoLineup(lineup ?? [], partnerLineup ?? []))
    : lineup;
  const firstBattle = getBattleAtLevelCached(leftTeam, challenge, 1, getEnemy);
  if (!firstBattle.cleared) {
    return {
      highestCleared: 0,
      nextLevelRemainingHp: firstBattle.remainingHp,
      nextLevelInitialHp: firstBattle.initialHp,
      progress: (firstBattle.initialHp - firstBattle.remainingHp) / firstBattle.initialHp,
    };
  }
  const maxBattle = getBattleAtLevelCached(leftTeam, challenge, challenge.maxBossLevel, getEnemy);
  if (maxBattle.cleared) {
    return {
      highestCleared: challenge.maxBossLevel,
      nextLevelRemainingHp: 0,
      nextLevelInitialHp: 1,
      progress: 1,
    };
  }
  let low = 1;
  let high = challenge.maxBossLevel;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    const battle = getBattleAtLevelCached(leftTeam, challenge, middle, getEnemy);
    if (battle.cleared) low = middle;
    else high = middle;
  }
  const nextBattle = getBattleAtLevelCached(leftTeam, challenge, high, getEnemy);
  return {
    highestCleared: low,
    nextLevelRemainingHp: nextBattle.remainingHp,
    nextLevelInitialHp: nextBattle.initialHp,
    progress: (nextBattle.initialHp - nextBattle.remainingHp) / nextBattle.initialHp,
  };
}

function buildGenomeSignature(lineupsByChallenge, challenges) {
  return challenges.map((challenge) => `${challenge.id}:${safeArray(lineupsByChallenge[challenge.id]).join(",")}`).join("|");
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function createGreedyGenome(challenges, sortedNames) {
  let cursor = 0;
  return Object.fromEntries(challenges.map((challenge) => {
    const slotCount = challenge.kind === "duo" ? 3 : challenge.teamSize;
    const names = Array.from({ length: slotCount }, () => sortedNames[cursor++] ?? "");
    return [challenge.id, names];
  }));
}

function createRandomGenome(challenges, sortedNames) {
  const pool = [...sortedNames];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return createGreedyGenome(challenges, pool);
}

function repairGenome(genome, challenges, sortedNames) {
  const remaining = new Set(sortedNames);
  const repaired = {};
  challenges.forEach((challenge) => {
    const slotCount = challenge.kind === "duo" ? 3 : challenge.teamSize;
    const source = safeArray(genome[challenge.id]);
    const next = Array(slotCount).fill("");
    for (let index = 0; index < slotCount; index += 1) {
      const name = normalizeName(source[index]);
      if (!name || !remaining.has(name)) continue;
      next[index] = name;
      remaining.delete(name);
    }
    for (let index = 0; index < slotCount; index += 1) {
      if (next[index]) continue;
      const candidate = remaining.values().next().value;
      if (!candidate) break;
      next[index] = candidate;
      remaining.delete(candidate);
    }
    repaired[challenge.id] = next;
  });
  return repaired;
}

function crossoverGenome(left, right, challenges, sortedNames) {
  const mixed = {};
  challenges.forEach((challenge) => {
    mixed[challenge.id] = Math.random() < 0.5 ? safeArray(left[challenge.id]) : safeArray(right[challenge.id]);
  });
  return repairGenome(mixed, challenges, sortedNames);
}

function mutateGenome(genome, challenges, sortedNames) {
  const next = Object.fromEntries(challenges.map((challenge) => [challenge.id, [...safeArray(genome[challenge.id])]]));
  if (Math.random() < MUTATION_RATE) {
    const challenge = pickRandom(challenges);
    const slots = next[challenge.id];
    const a = Math.floor(Math.random() * slots.length);
    const b = Math.floor(Math.random() * slots.length);
    [slots[a], slots[b]] = [slots[b], slots[a]];
  }
  if (challenges.length > 1 && Math.random() < MUTATION_RATE) {
    const from = pickRandom(challenges);
    const to = pickRandom(challenges);
    const fromSlots = next[from.id];
    const toSlots = next[to.id];
    const fromIndex = Math.floor(Math.random() * fromSlots.length);
    const toIndex = Math.floor(Math.random() * toSlots.length);
    [fromSlots[fromIndex], toSlots[toIndex]] = [toSlots[toIndex], fromSlots[fromIndex]];
  }
  if (Math.random() < MUTATION_RATE) {
    const shuffled = [...sortedNames];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    const challenge = pickRandom(challenges);
    next[challenge.id] = [...safeArray(createGreedyGenome([challenge], shuffled)[challenge.id])];
  }
  return repairGenome(next, challenges, sortedNames);
}

function compareEvaluation(left, right) {
  if (!right) return -1;
  if (left.totalCleared !== right.totalCleared) return right.totalCleared - left.totalCleared;
  if (left.totalProgress !== right.totalProgress) return right.totalProgress - left.totalProgress;
  if (left.signature !== right.signature) return right.signature.localeCompare(left.signature);
  return 0;
}

function evaluateGenome(genome, context) {
  const signature = buildGenomeSignature(genome, context.challenges);
  if (context.cache.has(signature)) return context.cache.get(signature);
  const details = context.challenges.map((challenge) => {
    const slotCount = challenge.kind === "duo" ? 3 : challenge.teamSize;
    const ownLineup = lineupNamesToPets(genome[challenge.id], context.rosterMap, slotCount);
    const duoMeta = context.duoContext[challenge.id];
    const result = evaluateChallengeLineup({
      challenge,
      lineup: ownLineup,
      partnerLineup: duoMeta?.partnerLineup ?? null,
      ownIsHigherRank: Boolean(duoMeta?.ownIsHigherRank),
      getEnemy: context.getEnemy,
    });
    return {
      challengeId: challenge.id,
      challengeName: challenge.encounter.name,
      highestCleared: result.highestCleared,
      progress: result.progress,
      lineupNames: [...genome[challenge.id]],
    };
  });
  const evaluation = {
    signature,
    lineupsByChallenge: Object.fromEntries(context.challenges.map((challenge) => [challenge.id, [...genome[challenge.id]]])),
    details,
    totalCleared: details.reduce((sum, item) => sum + item.highestCleared, 0),
    totalProgress: details.reduce((sum, item) => sum + item.highestCleared + item.progress, 0),
  };
  context.cache.set(signature, evaluation);
  return evaluation;
}

function buildDuoContext(team, game, challenges, teamLineupDrafts, teamLevelDrafts, teamEnableDrafts, allPets) {
  const teamsById = new Map(safeArray(game.teams).map((entry) => [String(entry.teamId), entry]));
  const pairings = buildPartnerMap(game, challenges);
  return Object.fromEntries(challenges.map((challenge) => {
    if (challenge.kind !== "duo") return [challenge.id, null];
    const pairing = pairings[challenge.id];
    if (!pairing) return [challenge.id, null];
    const ownTeamId = String(team.teamId);
    const partnerId = ownTeamId === pairing.higherRankTeamId ? pairing.lowerRankTeamId : pairing.higherRankTeamId;
    const partner = teamsById.get(String(partnerId));
    if (!partner) return [challenge.id, null];
    const partnerLevels = teamLevelDrafts[String(partner.teamId)] ?? createRosterLevelDraft(partner, allPets);
    const partnerEnables = teamEnableDrafts[String(partner.teamId)] ?? createRosterEnableDraft(partner, allPets);
    const partnerRoster = buildRoster(partner, allPets, partnerLevels, partnerEnables, { includeSingleUse: true });
    const partnerRosterMap = new Map(partnerRoster.map((pet) => [pet.name, pet]));
    const partnerDraft = teamLineupDrafts[String(partner.teamId)] ?? createLineupDraft(partner, challenges);
    const partnerActual = buildActualLineupDraft(partner, [challenge], partnerDraft, partnerRosterMap);
    const slotCount = 3;
    return [challenge.id, {
      ownIsHigherRank: ownTeamId === pairing.higherRankTeamId,
      partnerLineup: lineupNamesToPets(partnerActual[challenge.id], partnerRosterMap, slotCount),
    }];
  }));
}

function createSeedPopulation(challenges, sortedNames) {
  const seeds = [
    createGreedyGenome(challenges, sortedNames),
    createGreedyGenome(challenges, [...sortedNames].reverse()),
    mutateGenome(createGreedyGenome(challenges, sortedNames), challenges, sortedNames),
    mutateGenome(createGreedyGenome(challenges, [...sortedNames].reverse()), challenges, sortedNames),
  ];
  while (seeds.length < POPULATION_SIZE) {
    seeds.push(createRandomGenome(challenges, sortedNames));
  }
  return seeds.map((seed) => repairGenome(seed, challenges, sortedNames));
}

function swapGenomeSlots(lineupsByChallenge, leftChallengeId, leftIndex, rightChallengeId, rightIndex, challenges, sortedNames) {
  const genome = Object.fromEntries(challenges.map((challenge) => [challenge.id, [...safeArray(lineupsByChallenge[challenge.id])]]));
  const leftSlots = genome[leftChallengeId];
  const rightSlots = genome[rightChallengeId];
  [leftSlots[leftIndex], rightSlots[rightIndex]] = [rightSlots[rightIndex], leftSlots[leftIndex]];
  return repairGenome(genome, challenges, sortedNames);
}

function improveGenomeLocally(evaluation, context, sortedNames) {
  let best = evaluation;
  for (let pass = 0; pass < LOCAL_SEARCH_PASSES; pass += 1) {
    let improved = false;
    for (const leftChallenge of context.challenges) {
      const leftSlots = safeArray(best.lineupsByChallenge[leftChallenge.id]);
      for (let leftIndex = 0; leftIndex < leftSlots.length; leftIndex += 1) {
        for (const rightChallenge of context.challenges) {
          const rightSlots = safeArray(best.lineupsByChallenge[rightChallenge.id]);
          const startIndex = leftChallenge.id === rightChallenge.id ? leftIndex + 1 : 0;
          for (let rightIndex = startIndex; rightIndex < rightSlots.length; rightIndex += 1) {
            const candidateGenome = swapGenomeSlots(
              best.lineupsByChallenge,
              leftChallenge.id,
              leftIndex,
              rightChallenge.id,
              rightIndex,
              context.challenges,
              sortedNames
            );
            const candidate = evaluateGenome(candidateGenome, context);
            if (compareEvaluation(candidate, best) < 0) {
              best = candidate;
              improved = true;
            }
          }
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

async function estimateTeamStrategy(team, game, challenges, options) {
  const levelDraft = options.teamLevelDrafts[String(team.teamId)] ?? createRosterLevelDraft(team, options.allPets);
  const enableDraft = options.teamEnableDrafts[String(team.teamId)] ?? createRosterEnableDraft(team, options.allPets);
  const actualRoster = sortRosterByStrength(buildRoster(team, options.allPets, levelDraft, enableDraft, { includeSingleUse: true }));
  const optimizerRoster = sortRosterByStrength(buildRoster(team, options.allPets, levelDraft, enableDraft, { includeSingleUse: false }));
  const actualRosterMap = new Map(actualRoster.map((pet) => [pet.name, pet]));
  const rosterMap = new Map(optimizerRoster.map((pet) => [pet.name, pet]));
  const sortedNames = optimizerRoster.map((pet) => pet.name);
  const actualDraft = options.teamLineupDrafts[String(team.teamId)] ?? createLineupDraft(team, challenges);
  const actualLineups = buildActualLineupDraft(team, challenges, actualDraft, actualRosterMap);
  const duoContext = buildDuoContext(team, game, challenges, options.teamLineupDrafts, options.teamLevelDrafts, options.teamEnableDrafts, options.allPets);
  const getEnemy = createEnemyCache(challenges);
  const actualContext = {
    challenges,
    rosterMap: actualRosterMap,
    duoContext,
    getEnemy,
    cache: new Map(),
  };
  const optimizerContext = {
    challenges,
    rosterMap,
    duoContext,
    getEnemy,
    cache: new Map(),
  };
  const actualGenome = Object.fromEntries(challenges.map((challenge) => [challenge.id, [...actualLineups[challenge.id]]]));
  const actualEvaluation = evaluateGenome(actualGenome, actualContext);
  if (sortedNames.length === 0) {
    return { teamId: String(team.teamId), teamName: team.teamName, rank: team.rank, actual: actualEvaluation, best: actualEvaluation, gap: 0 };
  }

  let population = createSeedPopulation(challenges, sortedNames);
  let best = null;
  for (let generation = 0; generation < GENERATION_COUNT; generation += 1) {
    const evaluated = population.map((genome) => evaluateGenome(genome, optimizerContext))
      .sort((a, b) => compareEvaluation(a, b));
    if (!best || compareEvaluation(evaluated[0], best) < 0) best = evaluated[0];
    const elites = evaluated.slice(0, ELITE_COUNT).map((entry) => entry.lineupsByChallenge);
    const nextPopulation = [...elites];
    while (nextPopulation.length < POPULATION_SIZE) {
      const left = pickRandom(elites);
      const right = pickRandom(elites);
      const child = crossoverGenome(left, right, challenges, sortedNames);
      nextPopulation.push(mutateGenome(child, challenges, sortedNames));
      if (nextPopulation.length < POPULATION_SIZE && Math.random() < 0.35) {
        nextPopulation.push(mutateGenome(left, challenges, sortedNames));
      }
      if (nextPopulation.length < POPULATION_SIZE && Math.random() < 0.2) {
        nextPopulation.push(createRandomGenome(challenges, sortedNames));
      }
    }
    population = nextPopulation;
    if (generation < GENERATION_COUNT - 1) await pauseFrame();
  }
  const bestEvaluation = best ? improveGenomeLocally(best, optimizerContext, sortedNames) : actualEvaluation;
  return {
    teamId: String(team.teamId),
    teamName: team.teamName,
    rank: team.rank,
    actual: actualEvaluation,
    best: bestEvaluation,
    gap: bestEvaluation.totalCleared - actualEvaluation.totalCleared,
  };
}

export async function estimateWorkerStrategies(game, { teamLevelDrafts = {}, teamEnableDrafts = {}, teamLineupDrafts = {}, allPets = [], onProgress } = {}) {
  const currentChallenges = safeArray(game?.currentRoundChallenges?.length ? game.currentRoundChallenges : getMultiplayerRoundChallenges(game?.round));
  const results = [];
  for (let index = 0; index < safeArray(game?.teams).length; index += 1) {
    const team = game.teams[index];
    const result = await estimateTeamStrategy(team, game, currentChallenges, { teamLevelDrafts, teamEnableDrafts, teamLineupDrafts, allPets });
    results.push(result);
    onProgress?.({ completed: index + 1, total: game.teams.length, teamId: String(team.teamId) });
    await pauseFrame();
  }
  return results.sort((a, b) => b.gap - a.gap || b.best.totalCleared - a.best.totalCleared || (Number(a.rank) || 99) - (Number(b.rank) || 99));
}
