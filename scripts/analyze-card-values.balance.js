import fs from "node:fs"; // 報表輸出僅由 balance:cards 執行。
import path from "node:path";
import { it } from "vitest";
import { simulateBattle } from "../app/lib/battleLogic";
import { buildChallengeEncounterTeam } from "../app/lib/encounterLogic";
import { MAX_BOSS_LEVEL } from "../app/lib/gameConfig";
import { buildNewPet, getPetCompendiumList, getPetQualityLabel } from "../app/lib/petCatalog";
import { GAME_ENCOUNTERS, getChallengeLabel, getMultiplayerRoundChallenges } from "../app/lib/challengeConfig";
import { CANDIDATE_ENEMY_ENCOUNTERS } from "../app/lib/candidateEncounterConfig";
import { WORKER_ONLY_TEST_CHALLENGES } from "../app/lib/workerTestConfig";

const CANDIDATE_MODE = process.env.BALANCE_CANDIDATES === "1";
const TEAM_SIZE_COMPARISON_MODE = process.env.BALANCE_COMPARE_TEAM_SIZES === "1";
const EXACT_TEAM_SIZE_MODE = process.env.BALANCE_EXACT_TEAM_SIZES === "1";
const WORKER_HEN_STAGE_MODE = process.env.BALANCE_WORKER_HEN === "1";
const WORKER_SPLIT_STAGE_MODE = process.env.BALANCE_WORKER_SPLIT === "1";
const WORKER_LIVING_ENEMY_POWER_MODE = process.env.BALANCE_WORKER_LIVING_ENEMY_POWER === "1";
const TEST_ONLY_MODE = process.env.BALANCE_TEST_ONLY === "1";
const HEN_TUNING_MODE = process.env.BALANCE_HEN_TUNING === "1";
const PRECISE_MODE = process.env.BALANCE_PRECISE === "1";
const QUICK_MODE = process.env.BALANCE_QUICK === "1";
const EXPANDED_POOL_MODE = process.env.BALANCE_EXPANDED_POOL === "1";
const SIMPLE_GYARADOS_14_MODE = process.env.BALANCE_SIMPLE_GYARADOS_14 === "1";
const SCREENING_MODE = CANDIDATE_MODE || TEAM_SIZE_COMPARISON_MODE || WORKER_HEN_STAGE_MODE || WORKER_SPLIT_STAGE_MODE || HEN_TUNING_MODE;
const POPULATION_SIZE = QUICK_MODE ? 24 : HEN_TUNING_MODE ? 28 : SCREENING_MODE ? 40 : PRECISE_MODE ? 100 : 84;
const GENERATIONS = QUICK_MODE ? 6 : HEN_TUNING_MODE ? 8 : SCREENING_MODE ? 12 : PRECISE_MODE ? 34 : 28;
const CONSTRAINED_POPULATION_SIZE = QUICK_MODE ? 12 : HEN_TUNING_MODE ? 20 : SCREENING_MODE ? 24 : PRECISE_MODE ? 50 : 40;
const CONSTRAINED_GENERATIONS = QUICK_MODE ? 4 : HEN_TUNING_MODE ? 6 : SCREENING_MODE ? 7 : PRECISE_MODE ? 15 : 12;
const SHAPLEY_SAMPLES = QUICK_MODE ? 120 : HEN_TUNING_MODE ? 60 : SCREENING_MODE ? 160 : PRECISE_MODE ? 1200 : 800;
const GLOBAL_RESTARTS = QUICK_MODE ? 2 : HEN_TUNING_MODE ? 2 : SCREENING_MODE ? 3 : PRECISE_MODE ? 10 : 8;
const UPGRADE_CANDIDATE_LINEUPS = 12;

function buildAnalysisDefinitions() {
  const cards = getPetCompendiumList();
  if (!EXPANDED_POOL_MODE && !SIMPLE_GYARADOS_14_MODE) return cards.filter((card) => card.tier < 4 && card.name !== "鯉魚王");

  const whiteboard = (card, name = card.name) => ({
    ...card,
    name,
    atk: 30,
    hp: 40,
    analysisWhiteboard: true,
    special: {},
    pierce: false,
  });
  const magikarp = cards.find((card) => card.name === "鯉魚王");
  const gyarados = {
    ...(magikarp ?? { tier: 3, tags: [] }),
    name: "暴鯉龍",
    image: "/pet_images/allies/gyarados.png",
    atk: 25,
    hp: 35,
    analysisWhiteboard: true,
    special: {},
    pierce: false,
  };
  if (SIMPLE_GYARADOS_14_MODE) {
    return [
      ...cards.filter((card) => card.tier < 4 && card.name !== "鯉魚王"),
      gyarados,
    ];
  }
  const legendary = cards.filter((card) => card.tier === 4).map((card) => whiteboard(card));
  return [
    ...cards.filter((card) => card.tier < 4 && card.name !== "鯉魚王"),
    ...(magikarp ? [whiteboard(magikarp)] : []),
    gyarados,
    ...legendary,
  ];
}

function buildAnalysisPet(definition, level = 1) {
  const pet = buildNewPet(definition, level);
  return definition?.analysisWhiteboard
    ? { ...pet, atk: definition.name === "暴鯉龍" ? 25 : 30, hp: definition.name === "暴鯉龍" ? 35 : 40, maxHp: definition.name === "暴鯉龍" ? 35 : 40, special: {}, pierce: false }
    : pet;
}

function seededRandom(initialSeed) {
  let seed = initialSeed >>> 0;
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function repair(lineup, names, size, random, requiredName = null, bannedName = null) {
  if (size === 6) {
    const repairHalf = (values) => {
      const half = [];
      values.forEach((name) => {
        if (name !== bannedName && names.includes(name) && !half.includes(name) && half.length < 3) half.push(name);
      });
      const available = shuffle(names.filter((name) => name !== bannedName && !half.includes(name)), random);
      while (half.length < 3 && available.length) half.push(available.pop());
      return half;
    };
    const result = [...repairHalf(lineup.slice(0, 3)), ...repairHalf(lineup.slice(3, 6))];
    if (requiredName && !result.includes(requiredName)) {
      const index = Math.floor(random() * result.length);
      const halfStart = index < 3 ? 0 : 3;
      const duplicateIndex = result.slice(halfStart, halfStart + 3).indexOf(requiredName);
      if (duplicateIndex < 0) result[index] = requiredName;
    }
    return result;
  }
  const result = [];
  for (const name of lineup) {
    if (name === bannedName || result.includes(name) || !names.includes(name)) continue;
    result.push(name);
  }
  if (requiredName && !result.includes(requiredName)) {
    if (result.length >= size) result[Math.floor(random() * result.length)] = requiredName;
    else result.push(requiredName);
  }
  const available = shuffle(names.filter((name) => name !== bannedName && !result.includes(name)), random);
  while (result.length < size && available.length) result.push(available.pop());
  return result.slice(0, size);
}

function mutate(lineup, names, random, requiredName, bannedName) {
  const result = [...lineup];
  if (random() < 0.55) {
    const index = Math.floor(random() * result.length);
    const group = result.length === 6 ? result.slice(index < 3 ? 0 : 3, index < 3 ? 3 : 6) : result;
    const available = names.filter((name) => name !== bannedName && !group.includes(name));
    if (available.length) result[index] = available[Math.floor(random() * available.length)];
  }
  if (random() < 0.7) {
    const left = Math.floor(random() * result.length);
    const right = Math.floor(random() * result.length);
    [result[left], result[right]] = [result[right], result[left]];
  }
  return repair(result, names, lineup.length, random, requiredName, bannedName);
}

function crossover(left, right, names, random, requiredName, bannedName) {
  const cut = 1 + Math.floor(random() * Math.max(1, left.length - 1));
  return repair([...left.slice(0, cut), ...right], names, left.length, random, requiredName, bannedName);
}

function analyzeChallenge(challenge, definitions, random, {
  includeUpgradeValues = true,
  searchEveryCard = true,
  enemyTeamBuilder = (level) => buildChallengeEncounterTeam(challenge, level),
} = {}) {
  const names = definitions.map((card) => card.name);
  const byName = new Map(definitions.map((card) => [card.name, card]));
  const enemyByLevel = Array.from({ length: MAX_BOSS_LEVEL }, (_, index) =>
    enemyTeamBuilder(index + 1)
  );
  const cache = new Map();

  function evaluate(lineup) {
    const key = lineup.join("|");
    if (cache.has(key)) return cache.get(key);
    if (!lineup.length) {
      const empty = { score: 0, rating: 0, fitness: 0, lineup: [] };
      cache.set(key, empty);
      return empty;
    }
    const team = lineup.map((name) => buildAnalysisPet(byName.get(name), 1));
    let score = 0;
    let rating = 0;
    for (let index = 0; index < enemyByLevel.length; index += 1) {
      const battle = simulateBattle(team, enemyByLevel[index]);
      const won = battle.rightRemaining === 0 && !battle.timedOut;
      const finalFrame = battle.battleFrames.at(-1);
      const allyHp = finalFrame?.leftLineup.reduce((sum, pet) => sum + Math.max(0, pet.hp), 0) ?? 0;
      const allyMaxHp = Math.max(1, finalFrame?.leftLineup.reduce((sum, pet) => sum + Math.max(1, pet.maxHp ?? pet.hp), 0) ?? 0);
      const survival = Math.max(0, Math.min(1, allyHp / allyMaxHp));
      if (!won) {
        const enemyHp = finalFrame?.rightLineup.reduce((sum, pet) => sum + Math.max(0, pet.hp), 0)
          ?? enemyByLevel[index].reduce((sum, pet) => sum + pet.hp, 0);
        const enemyMaxHp = enemyByLevel[index].reduce((sum, pet) => sum + Math.max(1, pet.hp), 0);
        const damageProgress = Math.max(0, Math.min(1, 1 - enemyHp / enemyMaxHp));
        rating = score + damageProgress * 0.8 + survival * 0.2;
        break;
      }
      score += 1;
      rating = score + survival * 0.01;
    }
    const value = { score, rating, fitness: rating * 1000, lineup: [...lineup] };
    cache.set(key, value);
    return value;
  }

  function evaluateWithUpgrade(lineup, upgradedName, { evolved = false, targetLevel = 2 } = {}) {
    const team = lineup.map((name) => buildAnalysisPet(
      evolved && name === upgradedName
        ? { ...byName.get(name), evolved: true, gameRoundsDeployed: 2 }
        : byName.get(name),
      name === upgradedName ? targetLevel : 1
    ));
    let score = 0;
    let rating = 0;
    for (let index = 0; index < enemyByLevel.length; index += 1) {
      const battle = simulateBattle(team, enemyByLevel[index]);
      const won = battle.rightRemaining === 0 && !battle.timedOut;
      const finalFrame = battle.battleFrames.at(-1);
      const allyHp = finalFrame?.leftLineup.reduce((sum, pet) => sum + Math.max(0, pet.hp), 0) ?? 0;
      const allyMaxHp = Math.max(1, finalFrame?.leftLineup.reduce((sum, pet) => sum + Math.max(1, pet.maxHp ?? pet.hp), 0) ?? 0);
      const survival = Math.max(0, Math.min(1, allyHp / allyMaxHp));
      if (!won) {
        const enemyHp = finalFrame?.rightLineup.reduce((sum, pet) => sum + Math.max(0, pet.hp), 0)
          ?? enemyByLevel[index].reduce((sum, pet) => sum + pet.hp, 0);
        const enemyMaxHp = enemyByLevel[index].reduce((sum, pet) => sum + Math.max(1, pet.hp), 0);
        const damageProgress = Math.max(0, Math.min(1, 1 - enemyHp / enemyMaxHp));
        rating = score + damageProgress * 0.8 + survival * 0.2;
        break;
      }
      score += 1;
      rating = score + survival * 0.01;
    }
    return { score, rating };
  }

  function search({ requiredName = null, bannedName = null, seeds = [], populationSize, generations }) {
    let population = seeds.map((lineup) => repair(lineup, names, challenge.teamSize, random, requiredName, bannedName));
    const seedLimit = Math.floor(populationSize / 2);
    if (population.length > seedLimit) {
      population = population
        .map(evaluate)
        .sort((a, b) => b.fitness - a.fitness)
        .slice(0, seedLimit)
        .map((item) => item.lineup);
    }
    while (population.length < populationSize) {
      population.push(repair(shuffle(names, random), names, challenge.teamSize, random, requiredName, bannedName));
    }
    let best = null;
    for (let generation = 0; generation < generations; generation += 1) {
      const ranked = population.map(evaluate).sort((a, b) => b.fitness - a.fitness);
      if (!best || ranked[0].fitness > best.fitness) best = ranked[0];
      const eliteCount = Math.max(4, Math.floor(populationSize * 0.2));
      const elites = ranked.slice(0, eliteCount).map((item) => item.lineup);
      population = elites.map((lineup) => [...lineup]);
      while (population.length < populationSize) {
        const left = elites[Math.floor(random() * elites.length)];
        const right = elites[Math.floor(random() * elites.length)];
        population.push(mutate(crossover(left, right, names, random, requiredName, bannedName), names, random, requiredName, bannedName));
      }
    }
    const finalBest = population.map(evaluate).sort((a, b) => b.fitness - a.fitness)[0];
    return !best || finalBest.fitness > best.fitness ? finalBest : best;
  }

  const shapley = new Map(definitions.map((card) => [card.name, { sum: 0, lateSum: 0, count: 0, lateCount: 0, positive: 0 }]));
  const fullSeeds = [];
  for (let sample = 0; sample < SHAPLEY_SAMPLES; sample += 1) {
    const selected = shuffle(names, random).slice(0, challenge.teamSize);
    let lineup = [];
    let current = evaluate(lineup);
    selected.forEach((name) => {
      const candidates = Array.from({ length: lineup.length + 1 }, (_, index) =>
        evaluate([...lineup.slice(0, index), name, ...lineup.slice(index)])
      );
      const next = candidates.sort((a, b) => b.fitness - a.fitness)[0];
      const delta = next.rating - current.rating;
      const stats = shapley.get(name);
      stats.sum += delta;
      stats.count += 1;
      if (delta > 0.01) stats.positive += 1;
      if (lineup.length >= challenge.teamSize - 2) {
        stats.lateSum += delta;
        stats.lateCount += 1;
      }
      lineup = next.lineup;
      current = next;
    });
    fullSeeds.push(lineup);
  }

  const globalCandidates = [search({ seeds: fullSeeds, populationSize: POPULATION_SIZE, generations: GENERATIONS })];
  for (let restart = 1; restart < GLOBAL_RESTARTS; restart += 1) {
    globalCandidates.push(search({ populationSize: POPULATION_SIZE, generations: GENERATIONS }));
  }
  const anchor = globalCandidates.sort((a, b) => b.fitness - a.fitness)[0];
  if (searchEveryCard) {
    for (const card of definitions) {
      const forcedSeeds = [anchor.lineup, ...Array.from({ length: 5 }, () => mutate(anchor.lineup, names, random, card.name, null))];
      globalCandidates.push(search({
        requiredName: card.name,
        seeds: forcedSeeds,
        populationSize: CONSTRAINED_POPULATION_SIZE,
        generations: CONSTRAINED_GENERATIONS,
      }));
    }
  }
  const global = globalCandidates.sort((a, b) => b.fitness - a.fitness)[0];
  const bannedSearchBest = new Map();
  for (const name of global.lineup) {
    const withoutCard = search({ bannedName: name, seeds: [global.lineup], populationSize: CONSTRAINED_POPULATION_SIZE, generations: CONSTRAINED_GENERATIONS });
    bannedSearchBest.set(name, withoutCard);
  }
  const fullEvaluations = [...cache.values()].filter((item) => item.lineup.length === challenge.teamSize);
  const coreLoss = new Map();
  for (const name of global.lineup) {
    const cachedWithoutCard = fullEvaluations
      .filter((item) => !item.lineup.includes(name))
      .sort((left, right) => right.fitness - left.fitness)[0];
    const withoutCard = [bannedSearchBest.get(name), cachedWithoutCard]
      .filter(Boolean)
      .sort((left, right) => right.fitness - left.fitness)[0];
    coreLoss.set(name, Math.max(0, global.score - (withoutCard?.score ?? 0)));
  }
  const nearBest = fullEvaluations.filter((item) => item.score >= global.score - 1);
  const upgradeValues = includeUpgradeValues ? definitions.map((card) => {
    const candidates = fullEvaluations
      .filter((item) => item.lineup.includes(card.name))
      .sort((left, right) => right.fitness - left.fitness)
      .slice(0, UPGRADE_CANDIDATE_LINEUPS);
    const comparisons = candidates.map((base) => ({ base, upgraded: evaluateWithUpgrade(base.lineup, card.name) }));
    const divisor = Math.max(1, comparisons.length);
    const levelOneRating = comparisons.reduce((sum, item) => sum + item.base.rating, 0) / divisor;
    const levelTwoRating = comparisons.reduce((sum, item) => sum + item.upgraded.rating, 0) / divisor;
    const bestLevelOneScore = Math.max(0, ...comparisons.map((item) => item.base.score));
    const bestLevelTwoScore = Math.max(0, ...comparisons.map((item) => item.upgraded.score));
    const evolvedLevelOne = card.name === "鯉魚王"
      ? candidates.map((base) => evaluateWithUpgrade(base.lineup, card.name, { evolved: true, targetLevel: 1 }))
      : [];
    const evolvedLevelTwo = card.name === "鯉魚王"
      ? candidates.map((base) => evaluateWithUpgrade(base.lineup, card.name, { evolved: true, targetLevel: 2 }))
      : [];
    return {
      name: card.name,
      levelOneRating,
      levelTwoRating,
      ratingGain: levelTwoRating - levelOneRating,
      bestScoreGain: bestLevelTwoScore - bestLevelOneScore,
      evolvedLevelOneRating: evolvedLevelOne.reduce((sum, item) => sum + item.rating, 0) / Math.max(1, evolvedLevelOne.length),
      evolvedLevelTwoRating: evolvedLevelTwo.reduce((sum, item) => sum + item.rating, 0) / Math.max(1, evolvedLevelTwo.length),
      evolvedBestScoreGain: Math.max(0, ...evolvedLevelTwo.map((item) => item.score)) - Math.max(0, ...evolvedLevelOne.map((item) => item.score)),
    };
  }) : [];
  const values = definitions.map((card) => {
    const stats = shapley.get(card.name);
    const withCard = fullEvaluations.filter((item) => item.lineup.includes(card.name)).sort((a, b) => b.fitness - a.fitness)[0];
    return {
      name: card.name,
      tier: card.tier,
      shapleyValue: stats.sum / Math.max(1, stats.count),
      lateValue: stats.lateSum / Math.max(1, stats.lateCount),
      positiveRate: stats.positive / Math.max(1, stats.count),
      coreLoss: coreLoss.get(card.name) ?? 0,
      nearBestRate: nearBest.filter((item) => item.lineup.includes(card.name)).length / Math.max(1, nearBest.length),
      bestWith: withCard?.score ?? 0,
      samples: stats.count,
    };
  }).sort((a, b) => b.nearBestRate - a.nearBestRate
    || b.coreLoss - a.coreLoss
    || b.shapleyValue - a.shapleyValue
    || a.tier - b.tier
    || a.name.localeCompare(b.name, "zh-Hant"));
  const inconsistentCore = values.find((row) => row.coreLoss > 1 && row.nearBestRate < 1);
  if (inconsistentCore) {
    throw new Error(`${challenge.encounter.name}：${inconsistentCore.name} 的禁用損失與近最佳選用率不一致`);
  }

  const nearBestLineups = nearBest
    .slice()
    .sort((left, right) => right.fitness - left.fitness)
    .filter((item, index, all) => all.findIndex((other) => other.lineup.join("|") === item.lineup.join("|")) === index)
    .slice(0, 12)
    .map((item) => ({ score: item.score, lineup: item.lineup }));

  return { global, nearBestLineups, values, upgradeValues, evaluatedLineups: cache.size };
}

function normalizedCompositeStrength(challenges, cardName) {
  const normalize = (value, values) => {
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    return maximum > minimum ? (value - minimum) / (maximum - minimum) : 0;
  };
  const strengths = challenges.map(({ result }) => {
    const value = result.values.find((row) => row.name === cardName);
    return (
      normalize(value.shapleyValue, result.values.map((row) => row.shapleyValue))
      + normalize(value.coreLoss, result.values.map((row) => row.coreLoss))
      + normalize(value.nearBestRate, result.values.map((row) => row.nearBestRate))
    ) / 3;
  });
  return strengths.reduce((sum, value) => sum + value, 0) / Math.max(1, strengths.length);
}

function levelUpgradeReport(challenges, definitions) {
  const rows = definitions.map((card) => {
    const values = challenges.map(({ result }) => result.upgradeValues.find((value) => value.name === card.name));
    return {
      name: card.name,
      tier: card.tier,
      compositeStrength: normalizedCompositeStrength(challenges, card.name),
      levelOneRating: values.reduce((sum, value) => sum + value.levelOneRating, 0) / values.length,
      levelTwoRating: values.reduce((sum, value) => sum + value.levelTwoRating, 0) / values.length,
      ratingGain: values.reduce((sum, value) => sum + value.ratingGain, 0) / values.length,
      scoreGainStages: values.filter((value) => value.bestScoreGain > 0).length,
    };
  });
  const evolvedValues = challenges.map(({ result }) => result.upgradeValues.find((value) => value.name === "鯉魚王"));
  const evolvedLevelOneRating = evolvedValues.reduce((sum, value) => sum + value.evolvedLevelOneRating, 0) / evolvedValues.length;
  const evolvedLevelTwoRating = evolvedValues.reduce((sum, value) => sum + value.evolvedLevelTwoRating, 0) / evolvedValues.length;
  rows.push({
    name: "暴鯉龍",
    tier: 3,
    compositeStrength: null,
    levelOneRating: evolvedLevelOneRating,
    levelTwoRating: evolvedLevelTwoRating,
    ratingGain: evolvedLevelTwoRating - evolvedLevelOneRating,
    scoreGainStages: evolvedValues.filter((value) => value.evolvedBestScoreGain > 0).length,
  });
  rows.sort((left, right) => right.ratingGain - left.ratingGain || (right.compositeStrength ?? -1) - (left.compositeStrength ?? -1));
  const lines = [
    "# 正式模式角色 Lv.1 → Lv.2 強度分析",
    "",
    `產生時間：${new Date().toISOString()}`,
    "",
    `基準：正式 14 關、所有非傳奇卡；每張卡從各關已評估陣容中取前 ${UPGRADE_CANDIDATE_LINEUPS} 組含該卡的頂尖陣容，隊友與站位維持 Lv.1，只將目標卡升至 Lv.2。`,
    "",
    "「Lv.1／Lv.2 實戰強度」是可通關 Boss 等級加上下一級傷害進度與存活率的連續分數，再對 14 關取平均；「提升關卡數」是升級後最高整數通關等級增加的關卡數。",
    "",
    "| 升級收益排名 | 角色 | 品質 | 目前綜合強度 | Lv.1 實戰強度 | Lv.2 實戰強度 | 平均提升 | 提升關卡數 |",
    "|---:|---|---|---:|---:|---:|---:|---:|",
  ];
  rows.forEach((row, index) => lines.push(`| ${index + 1} | ${row.name} | ${getPetQualityLabel(row.tier)} | ${row.compositeStrength == null ? "—" : (row.compositeStrength * 100).toFixed(1)} | ${row.levelOneRating.toFixed(3)} | ${row.levelTwoRating.toFixed(3)} | ${row.ratingGain >= 0 ? "+" : ""}${row.ratingGain.toFixed(3)} | ${row.scoreGainStages} |`));
  lines.push("", "## 使用提醒", "", "- 這是單卡升級收益，不是整隊從 Lv.1 升到 Lv.2。", "- 頂尖候選陣容固定隊友與站位，因此能隔離單張卡升級的效果，但不包含升級後重新搜尋全新隊伍的額外收益。", "- 暴鯉龍以鯉魚王頂尖候選陣容中的進化形態獨立計算，Lv.1 為 25/35、Lv.2 套用 1.2 倍成長；因它不是獨立卡片，所以沒有目前綜合強度。", "- 鯉魚王本體的數值不包含跨大回合進化收益。", "");
  return lines.join("\n");
}

function markdownReport(challenges, definitions, testChallenges = []) {
  const generatedAt = new Date().toISOString();
  const lines = [
    "# 正式關卡角色價值（演化搜尋）",
    "",
    `產生時間：${generatedAt}`,
    "",
    `基準：${EXPANDED_POOL_MODE ? "加入鯉魚王、暴鯉龍與所有傳奇卡；新增卡皆視為 30/40 無技能白板" : SIMPLE_GYARADOS_14_MODE ? "加入暴鯉龍 25/35 白板，排除鯉魚王與全部傳奇卡" : "排除鯉魚王與全部傳奇卡"}；我方皆為 Lv.1、Boss Lv.1～Lv.30；單人關五格、雙人關六格。演化搜尋會同時調整選卡與站位。${PRECISE_MODE ? "本次使用高精度搜尋參數。" : ""}`,
    "",
    `排名以「近最佳選用率」由高至低排列：統計所有距離搜尋最佳分數至多 1 分的已評估陣容中，角色出現的比例；同率時依序比較核心禁用損失、Shapley 價值。`,
    `Shapley 價值採用 ${SHAPLEY_SAMPLES} 次 Monte Carlo 近似抽樣：從空隊伍開始以隨機順序加入角色，每次重新選擇最佳插入位置，計算角色在不同隊友數量下增加的連續分數。連續分數包含已通關 Boss 等級、下一級傷害進度與我方存活比例。`,
    "「核心禁用損失」表示完全禁用該角色後，重新搜尋所得最佳隊伍相對全角色最佳隊伍損失的整數通關分數；若損失大於 1，該角色的近最佳選用率必須為 100%。",
    "",
  ];
  const appendChallengeSection = ({ challenge, result }, index, isTest = false) => {
    lines.push(isTest
      ? `## 測試關 ${index + 1}｜${challenge.encounter.name}`
      : `## ${index + 1}. 第 ${challenge.round} 回合 ${getChallengeLabel(challenge)}｜${challenge.encounter.name}`);
    lines.push("");
    lines.push(`搜尋最佳分數：**${result.global.score} / ${MAX_BOSS_LEVEL}**`);
    lines.push("");
    lines.push(`最佳陣容（後排 → 前排）：${result.global.lineup.join("、")}`);
    lines.push("");
    lines.push("近最佳組隊（最高分差 1 分內）：");
    result.nearBestLineups.forEach((item) => lines.push(`- ${item.score} 分：${item.lineup.join("、")}`));
    lines.push("");
    lines.push(`共評估 ${result.evaluatedLineups.toLocaleString("en-US")} 個不同陣容。`);
    lines.push("");
    lines.push("| 排名 | 角色 | Shapley 價值 | 核心禁用損失 | 近最佳選用率 |");
    lines.push("|---:|---|---:|---:|---:|");
    result.values.forEach((row, rank) => {
      lines.push(`| ${rank + 1} | ${row.name} | ${row.shapleyValue.toFixed(3)} | ${row.coreLoss} | ${(row.nearBestRate * 100).toFixed(1)}% |`);
    });
    lines.push("");
  };
  challenges.forEach((entry, index) => appendChallengeSection(entry, index));
  if (testChallenges.length) {
    lines.push("## 測試模式逐關分析", "", "測試關使用與主線相同的角色價值分析方法，並不納入只有主線的綜合數據。", "");
    testChallenges.forEach((entry, index) => appendChallengeSection(entry, index, true));
  }
  const normalize = (value, values) => {
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    return maximum > minimum ? (value - minimum) / (maximum - minimum) : 0;
  };
  const aggregate = definitions.map((card) => {
    const rows = challenges.map(({ challenge, result }) => ({
      challenge,
      value: result.values.find((row) => row.name === card.name),
      allValues: result.values,
    }));
    const stageStrengths = rows.map(({ value, allValues }) => {
      const shapleyScore = normalize(value.shapleyValue, allValues.map((row) => row.shapleyValue));
      const coreScore = normalize(value.coreLoss, allValues.map((row) => row.coreLoss));
      const nearBestScore = normalize(value.nearBestRate, allValues.map((row) => row.nearBestRate));
      return (shapleyScore + coreScore + nearBestScore) / 3;
    });
    const versatileStages = rows.filter(({ value, allValues }) => {
      const stageAverage = allValues.reduce((sum, row) => sum + row.nearBestRate, 0) / allValues.length;
      return value.nearBestRate >= stageAverage;
    }).length;
    const strongestStages = rows
      .slice()
      .sort((left, right) => right.value.nearBestRate - left.value.nearBestRate)
      .slice(0, 2)
      .map(({ challenge }) => `第${challenge.round}回合${getChallengeLabel(challenge)}・${challenge.encounter.name}`)
      .join("、");
    return {
      name: card.name,
      tier: card.tier,
      averageStrength: stageStrengths.reduce((sum, value) => sum + value, 0) / stageStrengths.length,
      versatility: versatileStages / rows.length,
      averageShapley: rows.reduce((sum, row) => sum + row.value.shapleyValue, 0) / rows.length,
      averageNearBestRate: rows.reduce((sum, row) => sum + row.value.nearBestRate, 0) / rows.length,
      totalCoreLoss: rows.reduce((sum, row) => sum + row.value.coreLoss, 0),
      coreStages: rows.filter((row) => row.value.coreLoss > 0).length,
      strongestStages,
    };
  }).sort((left, right) => right.averageStrength - left.averageStrength
    || right.versatility - left.versatility
    || left.tier - right.tier
    || left.name.localeCompare(right.name, "zh-Hant"));

  lines.push(`## 全角色綜合數據（1～${challenges.length} 關）`, "");
  lines.push(`本表將 1～${challenges.length} 關的角色數值彙整；「平均強度」會先在每個關卡內分別將 Shapley、核心禁用損失、近最佳選用率正規化為 0～100，再取各關卡平均。適合比較整體強度，但不是實際戰鬥分數。`);
  lines.push("「泛用程度」是角色近最佳選用率達到該關全角色平均的關卡比例；數值越高，代表越不是只靠少數優勢關卡。", "");
  lines.push("| 綜合排名 | 角色 | 品質 | 平均強度 | 泛用程度 | 平均 Shapley | 平均近最佳選用率 | 禁用損失總和 | 核心關卡數 | 最突出關卡 |");
  lines.push("|---:|---|---|---:|---:|---:|---:|---:|---:|---|");
  aggregate.forEach((row, rank) => {
    lines.push(`| ${rank + 1} | ${row.name} | ${getPetQualityLabel(row.tier)} | ${(row.averageStrength * 100).toFixed(1)} | ${(row.versatility * 100).toFixed(1)}% | ${row.averageShapley.toFixed(3)} | ${(row.averageNearBestRate * 100).toFixed(1)}% | ${row.totalCoreLoss} | ${row.coreStages} | ${row.strongestStages} |`);
  });
  if (testChallenges.length) {
  const combinedChallenges = [...challenges, ...testChallenges];
  const combinedAggregate = definitions.map((card) => {
    const rows = combinedChallenges.map(({ challenge, result }) => ({
      challenge,
      value: result.values.find((row) => row.name === card.name),
      allValues: result.values,
    }));
    const stageStrengths = rows.map(({ value, allValues }) => {
      const shapleyScore = normalize(value.shapleyValue, allValues.map((row) => row.shapleyValue));
      const coreScore = normalize(value.coreLoss, allValues.map((row) => row.coreLoss));
      const nearBestScore = normalize(value.nearBestRate, allValues.map((row) => row.nearBestRate));
      return (shapleyScore + coreScore + nearBestScore) / 3;
    });
    const versatileStages = rows.filter(({ value, allValues }) => {
      const stageAverage = allValues.reduce((sum, row) => sum + row.nearBestRate, 0) / allValues.length;
      return value.nearBestRate >= stageAverage;
    }).length;
    const strongestStages = rows
      .slice()
      .sort((left, right) => right.value.nearBestRate - left.value.nearBestRate)
      .slice(0, 2)
      .map(({ challenge }) => challenge.testOnly
        ? `測試關・${challenge.encounter.name}`
        : `第${challenge.round}回合${getChallengeLabel(challenge)}・${challenge.encounter.name}`)
      .join("、");
    return {
      name: card.name,
      tier: card.tier,
      averageStrength: stageStrengths.reduce((sum, value) => sum + value, 0) / stageStrengths.length,
      versatility: versatileStages / rows.length,
      averageShapley: rows.reduce((sum, row) => sum + row.value.shapleyValue, 0) / rows.length,
      averageNearBestRate: rows.reduce((sum, row) => sum + row.value.nearBestRate, 0) / rows.length,
      totalCoreLoss: rows.reduce((sum, row) => sum + row.value.coreLoss, 0),
      coreStages: rows.filter((row) => row.value.coreLoss > 0).length,
      strongestStages,
    };
  }).sort((left, right) => right.averageStrength - left.averageStrength
    || right.versatility - left.versatility
    || left.tier - right.tier
    || left.name.localeCompare(right.name, "zh-Hant"));
  lines.push("## 全角色綜合數據（主線＋測試關）", "");
  lines.push("本表將 14 個主線關卡與 4 個測試關合併計算；測試關使用相同的 Shapley、核心禁用損失與近最佳選用率指標。", "");
  lines.push("| 綜合排名 | 角色 | 品質 | 平均強度 | 泛用程度 | 平均 Shapley | 平均近最佳選用率 | 禁用損失總和 | 核心關卡數 | 最突出關卡 |");
  lines.push("|---:|---|---|---:|---:|---:|---:|---:|---:|---|");
  combinedAggregate.forEach((row, rank) => {
    lines.push(`| ${rank + 1} | ${row.name} | ${getPetQualityLabel(row.tier)} | ${(row.averageStrength * 100).toFixed(1)} | ${(row.versatility * 100).toFixed(1)}% | ${row.averageShapley.toFixed(3)} | ${(row.averageNearBestRate * 100).toFixed(1)}% | ${row.totalCoreLoss} | ${row.coreStages} | ${row.strongestStages} |`);
  });
  }
  lines.push("");
  lines.push("## 使用提醒", "", "- 同分角色不代表完全同強度，只表示目前最高可通過的 Boss 等級相同。", EXPANDED_POOL_MODE ? "- 本報表中的鯉魚王、暴鯉龍與傳奇卡皆以暴鯉龍 25/35、其餘新增卡 30/40 無技能白板計算，僅供比較面板影響。" : "- 鯉魚王與全部傳奇卡（包含貓頭鷹）排除於候選陣容及角色價值表。", "- 若要比較細微差距，可用 `BALANCE_PRECISE=1 npm run balance:cards` 執行高精度搜尋。", "");
  return lines.join("\n");
}

function parseExistingFormalReport(source, definitions) {
  const definitionByName = new Map(definitions.map((card) => [card.name, card]));
  const matches = [...`${source}\n## END`.matchAll(/^## (\d+)\.(?:（已撤下）)? 第 (\d+) 回合 (單人關|雙人關)｜(.+?)\n\n搜尋最佳分數：\*\*(\d+) \/ \d+\*\*\n\n最佳陣容（後排 → 前排）：(.+?)\n([\s\S]*?)(?=^## )/gm)];
  if (matches.length !== 14) throw new Error(`現有正式報表應有 14 關，實際解析到 ${matches.length} 關`);
  return matches.map((match) => {
    const [, , round, kindLabel, name, score, lineup, body] = match;
    const values = [...body.matchAll(/^\| \d+ \| ([^|]+?) \| ([\d.-]+) \| (\d+) \| ([\d.]+)% \|$/gm)]
      .map((row) => {
        const card = definitionByName.get(row[1].trim());
        return {
          name: row[1].trim(),
          tier: card?.tier ?? 1,
          shapleyValue: Number(row[2]),
          coreLoss: Number(row[3]),
          nearBestRate: Number(row[4]) / 100,
        };
      });
    if (values.length !== definitions.length) throw new Error(`${name} 的正式報表角色數據不完整`);
    return {
      challenge: {
        round: Number(round),
        kind: kindLabel === "雙人關" ? "duo" : "single",
        encounter: { name },
        testOnly: false,
      },
      result: {
        global: { score: Number(score), lineup: lineup.trim().split("、") },
        nearBestLineups: [{ score: Number(score), lineup: lineup.trim().split("、") }],
        values,
        evaluatedLineups: 0,
      },
    };
  });
}

function candidateCardStrength(result, row) {
  const normalize = (value, values) => {
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    return maximum > minimum ? (value - minimum) / (maximum - minimum) : 0;
  };
  return (
    normalize(row.shapleyValue, result.values.map((item) => item.shapleyValue))
    + normalize(row.coreLoss, result.values.map((item) => item.coreLoss))
    + normalize(row.nearBestRate, result.values.map((item) => item.nearBestRate))
  ) / 3;
}

function selectCandidateChallenges(challenges) {
  const selectionSize = 14;
  const cardNames = challenges[0].result.values.map((row) => row.name);
  const stageRows = challenges.map(({ result }) => result.values
    .map((row) => ({ ...row, strength: candidateCardStrength(result, row) }))
    .sort((left, right) => right.strength - left.strength));
  const topSets = stageRows.map((rows) => new Set(rows.slice(0, 6).map((row) => row.name)));
  const candidates = [];
  const visit = (start, selected) => {
    if (selected.length === selectionSize) {
      const coverage = new Set(selected.flatMap((index) => [...topSets[index]]));
      if (coverage.size !== cardNames.length) return;
      const averages = cardNames.map((name) => selected.reduce((sum, index) =>
        sum + stageRows[index].find((row) => row.name === name).strength, 0) / selectionSize);
      const mean = averages.reduce((sum, value) => sum + value, 0) / averages.length;
      const deviation = Math.sqrt(averages.reduce((sum, value) => sum + (value - mean) ** 2, 0) / averages.length);
      let overlap = 0;
      let pairs = 0;
      for (let left = 0; left < selected.length; left += 1) {
        for (let right = left + 1; right < selected.length; right += 1) {
          const leftSet = topSets[selected[left]];
          const rightSet = topSets[selected[right]];
          const intersection = [...leftSet].filter((name) => rightSet.has(name)).length;
          overlap += intersection / Math.max(1, leftSet.size + rightSet.size - intersection);
          pairs += 1;
        }
      }
      const difficultyPenalty = selected.reduce((sum, index) => {
        const score = challenges[index].result.global.score;
        return sum + Math.max(0, 5 - score) ** 2 + Math.max(0, score - 14) ** 2;
      }, 0);
      candidates.push({ selected, deviation, difficultyPenalty, overlap: overlap / Math.max(1, pairs) });
      return;
    }
    const remaining = selectionSize - selected.length;
    for (let index = start; index <= challenges.length - remaining; index += 1) visit(index + 1, [...selected, index]);
  };
  visit(0, []);
  candidates.sort((left, right) => left.deviation - right.deviation
    || left.difficultyPenalty - right.difficultyPenalty
    || left.overlap - right.overlap);
  const best = candidates[0];
  if (!best) throw new Error("沒有任何 14 關組合能讓全部角色進入至少一關的受利前六名");
  const teachingOrder = [1, 2, 7, 4, 11, 3, 9, 16, 8, 5, 14, 13, 17, 20, 6, 10, 12, 15, 18, 19];
  const orderIndex = new Map(teachingOrder.map((id, index) => [id, index]));
  return best.selected.map((index) => challenges[index]).sort((left, right) => {
    const leftId = Number(left.challenge.id.replace("candidate-", ""));
    const rightId = Number(right.challenge.id.replace("candidate-", ""));
    return orderIndex.get(leftId) - orderIndex.get(rightId);
  });
}

function candidateMarkdownReport(challenges) {
  const recommendations = selectCandidateChallenges(challenges);
  const recommendedIds = new Set(recommendations.map(({ challenge }) => challenge.id));
  const lines = [
    "# 正式關卡預選池評估",
    "",
    `產生時間：${new Date().toISOString()}`,
    "",
    "基準：20 個候選單人關、五格隊伍、我方非傳奇卡 Lv.1（排除鯉魚王）、Boss Lv.1～Lv.30。候選池不會直接出現在遊戲中。",
    "",
    "選擇方法：窮舉 20 選 14 的全部 38,760 種組合，先要求全部受測角色至少在一關進入綜合表現前六名，再最小化全角色跨關平均強度的標準差；同分時依序選難度離群較少、受利角色重疊較低的組合。關卡顯示順序再依教學難度排列。",
    "",
    "## 建議正式候選",
    "",
    "| 建議順序 | 候選 | 最佳分數 | 最佳陣容（後排 → 前排） |",
    "|---:|---|---:|---|",
  ];
  recommendations.forEach(({ challenge, result }, index) => {
    lines.push(`| ${index + 1} | ${challenge.encounter.name} | ${result.global.score} | ${result.global.lineup.join("、")} |`);
  });
  lines.push("", "## 全候選摘要", "", "| 編號 | 候選 | 敵方（後排 → 前排） | 最佳分數 | 建議 | 前六名受利角色 |", "|---:|---|---|---:|---|---|");
  challenges.forEach(({ challenge, result }, index) => {
    const top = result.values.slice().sort((left, right) => candidateCardStrength(result, right) - candidateCardStrength(result, left)).slice(0, 6);
    lines.push(`| ${index + 1} | ${challenge.encounter.name} | ${challenge.encounter.enemyIds.join("、")} | ${result.global.score} | ${recommendedIds.has(challenge.id) ? "是" : "—"} | ${top.map((row) => row.name).join("、")} |`);
  });
  challenges.forEach(({ challenge, result }, index) => {
    lines.push("", `## ${index + 1}. ${challenge.encounter.name}${recommendedIds.has(challenge.id) ? "（建議）" : ""}`, "");
    lines.push(challenge.encounter.description, "");
    lines.push(`最佳分數：**${result.global.score} / ${MAX_BOSS_LEVEL}**  `);
    lines.push(`最佳陣容（後排 → 前排）：${result.global.lineup.join("、")}  `);
    lines.push(`共評估 ${result.evaluatedLineups.toLocaleString("en-US")} 個不同陣容。`, "");
    lines.push("| 排名 | 角色 | 綜合表現 | Shapley | 禁用損失 | 近最佳選用率 |", "|---:|---|---:|---:|---:|---:|");
    result.values.slice().sort((left, right) => candidateCardStrength(result, right) - candidateCardStrength(result, left)).forEach((row, rank) => {
      lines.push(`| ${rank + 1} | ${row.name} | ${(candidateCardStrength(result, row) * 100).toFixed(1)} | ${row.shapleyValue.toFixed(3)} | ${row.coreLoss} | ${(row.nearBestRate * 100).toFixed(1)}% |`);
    });
  });
  lines.push("");
  return lines.join("\n");
}

function teamSizeComparisonReport(pairs, definitions, duoEncounterNames) {
  const aggregate = (size) => definitions.map((card) => {
    const strengths = pairs.map((pair) => candidateCardStrength(pair[size].result, pair[size].result.values.find((row) => row.name === card.name)));
    return { name: card.name, average: strengths.reduce((sum, value) => sum + value, 0) / strengths.length };
  });
  const mixed = definitions.map((card) => {
    const strengths = pairs.map((pair) => {
      const size = duoEncounterNames.has(pair.encounter.name) ? "six" : "five";
      return candidateCardStrength(pair[size].result, pair[size].result.values.find((row) => row.name === card.name));
    });
    return { name: card.name, average: strengths.reduce((sum, value) => sum + value, 0) / strengths.length };
  });
  const five = aggregate("five");
  const six = aggregate("six");
  const stats = (rows) => {
    const mean = rows.reduce((sum, row) => sum + row.average, 0) / rows.length;
    return { mean, deviation: Math.sqrt(rows.reduce((sum, row) => sum + (row.average - mean) ** 2, 0) / rows.length) };
  };
  const lines = [
    "# 正式關卡五人／六人比較",
    "",
    `產生時間：${new Date().toISOString()}`,
    "",
    "基準：同一批 14 個正式敵方陣容分別固定使用五人與六人隊伍；排除傳奇卡與鯉魚王。這是快速對照搜尋，用來隔離隊伍格數的影響。",
    "",
    "## 整體離散程度",
    "",
    "| 情境 | 平均強度 | 角色強度標準差 |",
    "|---|---:|---:|",
    `| 全部五人 | ${(stats(five).mean * 100).toFixed(1)} | ${(stats(five).deviation * 100).toFixed(2)} |`,
    `| 全部六人 | ${(stats(six).mean * 100).toFixed(1)} | ${(stats(six).deviation * 100).toFixed(2)} |`,
    `| 目前正式混合排程 | ${(stats(mixed).mean * 100).toFixed(1)} | ${(stats(mixed).deviation * 100).toFixed(2)} |`,
    "",
    "## 每關最佳結果",
    "",
    "| 關卡 | 五人分數 | 五人最佳陣容 | 六人分數 | 六人最佳陣容 | 分數差 |",
    "|---|---:|---|---:|---|---:|",
  ];
  pairs.forEach((pair) => lines.push(`| ${pair.encounter.name} | ${pair.five.result.global.score} | ${pair.five.result.global.lineup.join("、")} | ${pair.six.result.global.score} | ${pair.six.result.global.lineup.join("、")} | ${pair.six.result.global.score - pair.five.result.global.score >= 0 ? "+" : ""}${pair.six.result.global.score - pair.five.result.global.score} |`));
  const comparison = definitions.map((card) => {
    const fiveRow = five.find((row) => row.name === card.name);
    const sixRow = six.find((row) => row.name === card.name);
    const mixedRow = mixed.find((row) => row.name === card.name);
    return { name: card.name, five: fiveRow.average, six: sixRow.average, mixed: mixedRow.average, delta: sixRow.average - fiveRow.average };
  }).sort((left, right) => right.delta - left.delta);
  lines.push("", "## 角色受隊伍格數影響", "", "| 角色 | 五人平均強度 | 六人平均強度 | 六人－五人 | 正式混合強度 |", "|---|---:|---:|---:|---:|");
  comparison.forEach((row) => lines.push(`| ${row.name} | ${(row.five * 100).toFixed(1)} | ${(row.six * 100).toFixed(1)} | ${row.delta >= 0 ? "+" : ""}${(row.delta * 100).toFixed(1)} | ${(row.mixed * 100).toFixed(1)} |`));
  lines.push("");
  return lines.join("\n");
}

function exactTeamSizeReport(pairs, definitions, formalEncounterNames, duoEncounterNames) {
  const formalPairs = pairs.filter((pair) => formalEncounterNames.has(pair.encounter.name));
  const lines = [
    teamSizeComparisonReport(formalPairs, definitions, duoEncounterNames),
    "## 全部正式／測試關逐卡精確結果",
    "",
    "「綜合強度」會在各關內分別正規化 Shapley、核心禁用損失與近最佳選用率，再取三者平均；適合比較同一關內及跨格數的角色相對地位。",
    "",
  ];
  pairs.forEach((pair, index) => {
    const isFormal = formalEncounterNames.has(pair.encounter.name);
    lines.push(`### ${index + 1}. ${pair.encounter.name}（${isFormal ? "正式關" : "測試關"}）`, "");
    lines.push(`五人最佳 ${pair.five.result.global.score} 分：${pair.five.result.global.lineup.join("、")}  `);
    lines.push(`六人最佳 ${pair.six.result.global.score} 分：${pair.six.result.global.lineup.join("、")}`, "");
    lines.push("| 角色 | 五人綜合強度 | 六人綜合強度 | 六人－五人 | 五人近最佳率 | 六人近最佳率 |", "|---|---:|---:|---:|---:|---:|");
    definitions.map((card) => {
      const fiveRow = pair.five.result.values.find((row) => row.name === card.name);
      const sixRow = pair.six.result.values.find((row) => row.name === card.name);
      const fiveStrength = candidateCardStrength(pair.five.result, fiveRow);
      const sixStrength = candidateCardStrength(pair.six.result, sixRow);
      return { name: card.name, fiveRow, sixRow, fiveStrength, sixStrength, average: (fiveStrength + sixStrength) / 2 };
    }).sort((left, right) => right.average - left.average).forEach((row) => {
      const delta = (row.sixStrength - row.fiveStrength) * 100;
      lines.push(`| ${row.name} | ${(row.fiveStrength * 100).toFixed(1)} | ${(row.sixStrength * 100).toFixed(1)} | ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} | ${(row.fiveRow.nearBestRate * 100).toFixed(1)}% | ${(row.sixRow.nearBestRate * 100).toFixed(1)}% |`);
    });
    lines.push("");
  });
  return lines.join("\n");
}

function workerHenStageReport(challenge, result, frontier) {
  const cleared = frontier[0];
  const failed = frontier[1];
  const lines = [
    "# 工人測試關：孵蛋母雞",
    "",
    `產生時間：${new Date().toISOString()}`,
    "",
    "基準：我方所有非傳奇卡與鯉魚王以 Lv.1 組成五人隊；母雞 Boss Lv.1～Lv.30。演化搜尋同時調整選卡與站位，方法與 formal-card-values 相同。",
    "",
    "敵方：母雞 Lv.1 為 12/40；每第 2、4、6…戰鬥回合，在自己正前方召喚一顆 Lv.1 為 4/3 的雞蛋。母雞與雞蛋數值隨 Boss 等級乘 1.1 成長。",
    "",
    `搜尋最佳分數：**${result.global.score} / ${MAX_BOSS_LEVEL}**`,
    "",
    `最佳陣容（後排 → 前排）：${result.global.lineup.join("、")}`,
    "",
    "近最佳組隊（最高分差 1 分內）：",
    ...result.nearBestLineups.map((item) => `- ${item.score} 分：${item.lineup.join("、")}`),
    "",
    `共評估 ${result.evaluatedLineups.toLocaleString("en-US")} 個不同陣容。`,
    "",
    "## 臨界等級實戰",
    "",
    `- Lv.${cleared.level}：第 ${cleared.turns} 回合通關；母雞共召喚 ${cleared.summons} 顆雞蛋，我方剩 ${cleared.leftRemaining} 隻、合計 ${cleared.leftFinalHp} 生命。`,
    `- Lv.${failed.level}：第 ${failed.turns} 回合我方全滅；母雞共召喚 ${failed.summons} 顆雞蛋，敵方剩 ${failed.rightRemaining} 隻、合計 ${failed.rightFinalHp} 生命（${failed.lastRight.join("、")}）。`,
    "",
    "| 排名 | 角色 | 綜合表現 | Shapley | 核心禁用損失 | 近最佳選用率 |",
    "|---:|---|---:|---:|---:|---:|",
  ];
  result.values
    .slice()
    .sort((left, right) => candidateCardStrength(result, right) - candidateCardStrength(result, left))
    .forEach((row, index) => {
      lines.push(`| ${index + 1} | ${row.name} | ${(candidateCardStrength(result, row) * 100).toFixed(1)} | ${row.shapleyValue.toFixed(3)} | ${row.coreLoss} | ${(row.nearBestRate * 100).toFixed(1)}% |`);
    });
  lines.push(
    "",
    "## 解讀限制",
    "",
    "- 分數從 Boss Lv.1 起連續測試，遇到第一個失敗等級即停止。",
    "- 此分析只測試工人模式特別關，不修改正式關卡排程。",
    "",
  );
  return lines.join("\n");
}

function workerSplitStageReport(result, frontier) {
  const cleared = frontier[0];
  const failed = frontier[1];
  const formatResult = (row) => row.won
    ? `第 ${row.turns} 回合通關，我方剩 ${row.leftRemaining} 隻、${row.leftFinalHp} 生命`
    : `第 ${row.turns} 回合失敗，敵方剩 ${row.rightRemaining} 隻、${row.rightFinalHp} 生命`;
  const lines = [
    "# 工人測試關：死亡分裂",
    "",
    `產生時間：${new Date().toISOString()}`,
    "",
    "基準：我方所有非傳奇卡與鯉魚王以 Lv.1 組成五人隊；分裂體 Boss Lv.1～Lv.30。演化搜尋同時調整選卡與站位，方法與 formal-card-values 相同。",
    "",
    "敵方 Lv.1 為 20/20。死亡時分裂成兩個相同角色，攻擊與生命皆為該代初始值的一半；最多分裂三次，因此依序為 20/20 → 兩隻 10/10 → 四隻 5/5 → 八隻 2/2。",
    "",
    `搜尋最佳分數：**${result.global.score} / ${MAX_BOSS_LEVEL}**`,
    "",
    `最佳陣容（後排 → 前排）：${result.global.lineup.join("、")}`,
    "",
    "近最佳組隊（最高分差 1 分內）：",
    ...result.nearBestLineups.map((item) => `- ${item.score} 分：${item.lineup.join("、")}`),
    "",
    `共評估 ${result.evaluatedLineups.toLocaleString("en-US")} 個不同陣容。`,
    "",
    "## 臨界等級實戰",
    "",
    `- Lv.${cleared.level}：${formatResult(cleared)}；觸發 ${cleared.splits} 次分裂。`,
    ...(failed
      ? [`- Lv.${failed.level}：${formatResult(failed)}；觸發 ${failed.splits} 次分裂。`]
      : ["- 已通過 Lv.30，因此沒有下一個失敗等級。"]),
    "",
    "| 排名 | 角色 | 綜合表現 | Shapley | 核心禁用損失 | 近最佳選用率 |",
    "|---:|---|---:|---:|---:|---:|",
  ];
  result.values
    .slice()
    .sort((left, right) => candidateCardStrength(result, right) - candidateCardStrength(result, left))
    .forEach((row, index) => {
      lines.push(`| ${index + 1} | ${row.name} | ${(candidateCardStrength(result, row) * 100).toFixed(1)} | ${row.shapleyValue.toFixed(3)} | ${row.coreLoss} | ${(row.nearBestRate * 100).toFixed(1)}% |`);
    });
  lines.push("", "此分析只測試工人模式特別關，不修改正式關卡排程。", "");
  return lines.join("\n");
}

function henTuningChallenge(baseChallenge, { henAtk, summonEvery, eggAtk }) {
  return {
    ...baseChallenge,
    id: `hen-tuning-${henAtk}-${summonEvery}-${eggAtk}`,
    encounter: {
      ...baseChallenge.encounter,
      name: `母雞 ${henAtk}/40・每${summonEvery}回合・蛋 ${eggAtk}/3`,
      enemies: baseChallenge.encounter.enemies.map((enemy) => ({
        ...enemy,
        atk: henAtk,
        hp: 40,
        special: {
          roundFrontSummonEvery: summonEvery,
          roundFrontSummonName: "雞蛋",
          roundFrontSummonImage: "/pet_images/allies/orange.png",
          roundFrontSummonAtk: eggAtk,
          roundFrontSummonHp: 3,
        },
      })),
    },
  };
}

function henTuningStrength(result, name) {
  const row = result.values.find((value) => value.name === name);
  return {
    composite: candidateCardStrength(result, row),
    nearBestRate: row.nearBestRate,
    shapley: row.shapleyValue,
    coreLoss: row.coreLoss,
  };
}

function henTuningObjective(entry) {
  const bear = henTuningStrength(entry.result, "熊");
  const mantis = henTuningStrength(entry.result, "螳螂");
  const bothInBest = Number(entry.result.global.lineup.includes("熊") && entry.result.global.lineup.includes("螳螂"));
  const oneInBest = Number(entry.result.global.lineup.includes("熊")) + Number(entry.result.global.lineup.includes("螳螂"));
  const difficultyPenalty = entry.result.global.score < 10
    ? (10 - entry.result.global.score) * 0.04
    : entry.result.global.score > 24
      ? (entry.result.global.score - 24) * 0.04
      : 0;
  return (
    Math.min(bear.composite, mantis.composite) * 0.45
    + (bear.composite + mantis.composite) * 0.15
    + Math.min(bear.nearBestRate, mantis.nearBestRate) * 0.15
    + bothInBest * 0.16
    + oneInBest * 0.045
    - difficultyPenalty
  );
}

function henTuningReport(entries) {
  const lines = [
    "# 母雞關參數搜尋：熊＋螳螂",
    "",
    `產生時間：${new Date().toISOString()}`,
    "",
    "固定條件：母雞生命 40、雞蛋生命 3、單體普通攻擊、無死亡成長；我方使用非傳奇 Lv.1 五人隊，測試 Boss Lv.1～Lv.30。",
    "",
    "搜尋目標同時提高熊與螳螂的關內綜合表現、近最佳選用率及進入最佳陣容的情形，並對最高分低於 10 或高於 24 的極端難度扣分。",
    "",
    "| 排名 | 母雞攻擊 | 生蛋間隔 | 蛋攻擊 | 最高通關 | 最佳陣容（後排 → 前排） | 熊表現 | 熊近最佳率 | 螳螂表現 | 螳螂近最佳率 |",
    "|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|",
  ];
  entries.forEach((entry, index) => {
    const bear = henTuningStrength(entry.result, "熊");
    const mantis = henTuningStrength(entry.result, "螳螂");
    lines.push(
      `| ${index + 1} | ${entry.params.henAtk} | ${entry.params.summonEvery} | ${entry.params.eggAtk} | `
      + `${entry.result.global.score} | ${entry.result.global.lineup.join("、")} | `
      + `${(bear.composite * 100).toFixed(1)} | ${(bear.nearBestRate * 100).toFixed(1)}% | `
      + `${(mantis.composite * 100).toFixed(1)} | ${(mantis.nearBestRate * 100).toFixed(1)}% |`
    );
  });
  lines.push(
    "",
    "## 建議",
    "",
    entries.length
      ? `優先採用：母雞 ${entries[0].params.henAtk}/40、每 ${entries[0].params.summonEvery} 回合生蛋、雞蛋 ${entries[0].params.eggAtk}/3。`
      : "沒有找到候選設定。",
    "",
  );
  return lines.join("\n");
}

it("計算每個正式關卡中每個角色的價值", () => {
  const definitions = buildAnalysisDefinitions();
  const random = seededRandom(20260721);
  const challenges = [];
  if (WORKER_LIVING_ENEMY_POWER_MODE) {
    const challenge = WORKER_ONLY_TEST_CHALLENGES.find((item) => item.id === "worker-special-living-enemy-power");
    if (!challenge) throw new Error("找不到工人測試關：存活威壓");
    const result = analyzeChallenge(challenge, definitions, seededRandom(20260724), {
      includeUpgradeValues: false,
      searchEveryCard: true,
    });
    const outputPath = path.resolve("/tmp", "imoc-formal-card-values-worker-special-living-enemy-power.md");
    fs.writeFileSync(outputPath, markdownReport([{ challenge, result }], definitions, []), "utf8");
    console.log(`完成存活威壓 formal-card-values 測試：最佳 ${result.global.score} 分，評估 ${result.evaluatedLineups} 陣容`);
    console.log(`報表：${outputPath}`);
    return;
  }
  if (HEN_TUNING_MODE) {
    const baseChallenge = WORKER_ONLY_TEST_CHALLENGES.find((item) => item.id === "worker-special-summoning-hen");
    if (!baseChallenge) throw new Error("找不到工人測試關：孵蛋母雞");
    const coarse = [];
    for (const henAtk of [8, 12, 16, 20]) {
      for (const summonEvery of [2, 3, 4]) {
        for (const eggAtk of [1, 3, 6, 9]) {
          const params = { henAtk, summonEvery, eggAtk };
          const challenge = henTuningChallenge(baseChallenge, params);
          const result = analyzeChallenge(challenge, definitions, seededRandom(20260723), {
            includeUpgradeValues: false,
            searchEveryCard: false,
          });
          coarse.push({ params, challenge, result });
          console.log(`母雞參數 ${henAtk}/40、每${summonEvery}回合、蛋${eggAtk}/3：${result.global.score} 分`);
        }
      }
    }
    const finalists = coarse
      .sort((left, right) => henTuningObjective(right) - henTuningObjective(left))
      .slice(0, 6)
      .map(({ params, challenge }) => ({
        params,
        challenge,
        result: analyzeChallenge(challenge, definitions, seededRandom(20260724), {
          includeUpgradeValues: false,
          searchEveryCard: true,
        }),
      }))
      .sort((left, right) => henTuningObjective(right) - henTuningObjective(left));
    const outputPath = path.resolve(process.cwd(), "docs/worker-hen-parameter-search.md");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, henTuningReport(finalists), "utf8");
    console.log(`母雞參數建議：${JSON.stringify(finalists[0]?.params ?? null)}`);
    console.log(`報表：${outputPath}`);
    return;
  }
  if (WORKER_HEN_STAGE_MODE) {
    const challenge = WORKER_ONLY_TEST_CHALLENGES.find((item) => item.id === "worker-special-summoning-hen");
    if (!challenge) throw new Error("找不到工人測試關：孵蛋母雞");
    const result = analyzeChallenge(challenge, definitions, seededRandom(20260723), {
      includeUpgradeValues: false,
      searchEveryCard: true,
    });
    const byName = new Map(definitions.map((card) => [card.name, card]));
    const inspectLevel = (level) => {
      const battle = simulateBattle(
        result.global.lineup.map((name) => buildAnalysisPet(byName.get(name), 1)),
        buildChallengeEncounterTeam(challenge, level)
      );
      return {
        level,
        turns: battle.battleFrames.length,
        leftRemaining: battle.leftRemaining,
        rightRemaining: battle.rightRemaining,
        timedOut: battle.timedOut,
        leftFinalHp: battle.leftFinalHp,
        rightFinalHp: battle.rightFinalHp,
        summons: battle.battleFrames.flatMap((frame) => frame.events).filter((event) => event.type === "round_front_summon").length,
        lastLeft: battle.battleFrames.at(-1)?.leftLineup.map((pet) => `${pet.name}:${pet.hp}`),
        lastRight: battle.battleFrames.at(-1)?.rightLineup.map((pet) => `${pet.name}:${pet.hp}`),
      };
    };
    const frontier = [
      inspectLevel(result.global.score),
      inspectLevel(Math.min(MAX_BOSS_LEVEL, result.global.score + 1)),
    ];
    const outputPath = path.resolve(process.cwd(), "docs/worker-hen-stage-analysis.md");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, workerHenStageReport(challenge, result, frontier), "utf8");
    console.log(`完成母雞關：最佳 ${result.global.score} 分，評估 ${result.evaluatedLineups} 陣容`);
    console.log(`報表：${outputPath}`);
    return;
  }
  if (WORKER_SPLIT_STAGE_MODE) {
    const challenge = WORKER_ONLY_TEST_CHALLENGES.find((item) => item.id === "worker-special-survival-split");
    if (!challenge) throw new Error("找不到工人測試關：死亡分裂");
    const result = analyzeChallenge(challenge, definitions, seededRandom(20260723), {
      includeUpgradeValues: false,
      searchEveryCard: true,
    });
    const byName = new Map(definitions.map((card) => [card.name, card]));
    const inspectLevel = (level) => {
      const battle = simulateBattle(
        result.global.lineup.map((name) => buildAnalysisPet(byName.get(name), 1)),
        buildChallengeEncounterTeam(challenge, level)
      );
      return {
        level,
        turns: battle.battleFrames.length,
        leftRemaining: battle.leftRemaining,
        rightRemaining: battle.rightRemaining,
        leftFinalHp: battle.leftFinalHp,
        rightFinalHp: battle.rightFinalHp,
        won: battle.rightRemaining === 0 && !battle.timedOut,
        splits: battle.battleFrames.flatMap((frame) => frame.events).filter((event) => event.type === "death_split").length,
      };
    };
    const frontier = [inspectLevel(Math.max(1, result.global.score))];
    if (result.global.score < MAX_BOSS_LEVEL) frontier.push(inspectLevel(result.global.score + 1));
    const outputPath = path.resolve(process.cwd(), "docs/worker-split-stage-analysis.md");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, workerSplitStageReport(result, frontier), "utf8");
    console.log(`完成分裂關：最佳 ${result.global.score} 分，評估 ${result.evaluatedLineups} 陣容`);
    console.log(`報表：${outputPath}`);
    return;
  }
  if (EXACT_TEAM_SIZE_MODE) {
    const actualChallenges = Array.from({ length: 10 }, (_, index) => getMultiplayerRoundChallenges(index + 1)).flat();
    const formalEncounterNames = new Set(GAME_ENCOUNTERS.map((encounter) => encounter.name));
    const duoEncounterNames = new Set(actualChallenges.filter((challenge) => challenge.kind === "duo").map((challenge) => challenge.encounter.name));
    const pairs = CANDIDATE_ENEMY_ENCOUNTERS.map((encounter, index) => {
      const analyzeSize = (teamSize) => {
        const challenge = { id: `exact-team-size-${teamSize}-${index + 1}`, round: index + 1, index: 0, kind: teamSize === 6 ? "duo" : "single", encounter, teamSize, maxBossLevel: MAX_BOSS_LEVEL, scoreEnabled: true };
        return { challenge, result: analyzeChallenge(challenge, definitions, seededRandom(20260721 + index * 100 + teamSize), { includeUpgradeValues: false, searchEveryCard: true }) };
      };
      const five = analyzeSize(5);
      const six = analyzeSize(6);
      console.log(`完成精確格數分析 ${index + 1}/${CANDIDATE_ENEMY_ENCOUNTERS.length}：${encounter.name}，五人 ${five.result.global.score} 分，六人 ${six.result.global.score} 分`);
      return { encounter, five, six };
    });
    const outputPath = path.resolve(process.cwd(), "docs/exact-team-size-card-values.md");
    fs.writeFileSync(outputPath, exactTeamSizeReport(pairs, definitions, formalEncounterNames, duoEncounterNames), "utf8");
    console.log(`報表：${outputPath}`);
    return;
  }
  if (TEAM_SIZE_COMPARISON_MODE) {
    const actualChallenges = Array.from({ length: 10 }, (_, index) => getMultiplayerRoundChallenges(index + 1)).flat();
    const duoEncounterNames = new Set(actualChallenges.filter((challenge) => challenge.kind === "duo").map((challenge) => challenge.encounter.name));
    const pairs = GAME_ENCOUNTERS.map((encounter, index) => {
      const analyzeSize = (teamSize) => {
        const challenge = { id: `team-size-${teamSize}-${index + 1}`, round: index + 1, index: 0, kind: "single", encounter, teamSize, maxBossLevel: MAX_BOSS_LEVEL, scoreEnabled: true };
        return { challenge, result: analyzeChallenge(challenge, definitions, random, { includeUpgradeValues: false, searchEveryCard: false }) };
      };
      const five = analyzeSize(5);
      const six = analyzeSize(6);
      console.log(`完成格數比較 ${index + 1}/${GAME_ENCOUNTERS.length}：${encounter.name}，五人 ${five.result.global.score} 分，六人 ${six.result.global.score} 分`);
      return { encounter, five, six };
    });
    const outputPath = path.resolve(process.cwd(), "docs/formal-team-size-comparison.md");
    fs.writeFileSync(outputPath, teamSizeComparisonReport(pairs, definitions, duoEncounterNames), "utf8");
    console.log(`報表：${outputPath}`);
    return;
  }
  if (CANDIDATE_MODE) {
    CANDIDATE_ENEMY_ENCOUNTERS.forEach((encounter, index) => {
      const challenge = { id: `candidate-${index + 1}`, round: index + 1, index: 0, kind: "single", encounter, teamSize: 5, maxBossLevel: MAX_BOSS_LEVEL, scoreEnabled: true };
      const result = analyzeChallenge(challenge, definitions, random, { includeUpgradeValues: false, searchEveryCard: false });
      challenges.push({ challenge, result });
      console.log(`完成候選 ${index + 1}/${CANDIDATE_ENEMY_ENCOUNTERS.length}：${encounter.name}，最佳 ${result.global.score} 分，評估 ${result.evaluatedLineups} 陣容`);
    });
    const outputPath = path.resolve(process.cwd(), "docs/candidate-stage-analysis.md");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, candidateMarkdownReport(challenges), "utf8");
    console.log(`報表：${outputPath}`);
    return;
  }
  if (TEST_ONLY_MODE) {
    const outputPath = path.resolve(process.cwd(), "docs/formal-card-values.md");
    const existingSource = fs.readFileSync(outputPath, "utf8");
    const mainChallenges = parseExistingFormalReport(existingSource, definitions);
    fs.writeFileSync(outputPath, markdownReport(mainChallenges, definitions, []), "utf8");
    console.log(`報表：${outputPath}（主線沿用既有結果）`);
    return;
  }
  if (SIMPLE_GYARADOS_14_MODE) {
    const simpleChallenges = Array.from({ length: 10 }, (_, index) => getMultiplayerRoundChallenges(index + 1)).flat();
    if (simpleChallenges.length !== GAME_ENCOUNTERS.length) {
      throw new Error(`正式排程有 ${simpleChallenges.length} 關，但正式敵方設定有 ${GAME_ENCOUNTERS.length} 關`);
    }
    for (const challenge of simpleChallenges) {
      const result = analyzeChallenge(challenge, definitions, random, { includeUpgradeValues: false, searchEveryCard: false });
      challenges.push({ challenge, result });
      console.log(`完成簡易測試：第 ${challenge.round} 回合 ${getChallengeLabel(challenge)}｜${challenge.encounter.name}，最佳 ${result.global.score} 分，評估 ${result.evaluatedLineups} 陣容`);
    }
    const outputPath = path.resolve("/tmp", "imoc-quick-formal-card-values.md");
    fs.writeFileSync(outputPath, markdownReport(challenges, definitions, []), "utf8");
    console.log(`報表：${outputPath}`);
    return;
  }
  const onlyChallengeId = String(process.env.BALANCE_ONLY_CHALLENGE_ID ?? "").trim();
  const scheduledChallenges = Array.from({ length: 10 }, (_, index) =>
    getMultiplayerRoundChallenges(index + 1)
  ).flat();
  if (scheduledChallenges.length !== GAME_ENCOUNTERS.length) {
    throw new Error(`正式排程有 ${scheduledChallenges.length} 關，但正式敵方設定有 ${GAME_ENCOUNTERS.length} 關`);
  }
  if (new Set(scheduledChallenges.map((challenge) => challenge.encounter)).size !== GAME_ENCOUNTERS.length) {
    throw new Error("正式排程與敵方關卡不是一對一對應，請先修正 ROUND_CHALLENGE_SCHEDULE");
  }
  for (const challenge of scheduledChallenges) {
    if (onlyChallengeId && challenge.id !== onlyChallengeId) continue;
    const result = analyzeChallenge(challenge, definitions, random, { includeUpgradeValues: false });
    challenges.push({ challenge, result });
    console.log(`完成：第 ${challenge.round} 回合 ${getChallengeLabel(challenge)}｜${challenge.encounter.name}，最佳 ${result.global.score} 分，評估 ${result.evaluatedLineups} 陣容`);
  }
  if (onlyChallengeId && challenges.length === 0) throw new Error(`找不到正式關卡：${onlyChallengeId}`);
  const testChallenges = [];
  const bestCompositionOwners = new Map();
  const duplicateBestCompositions = [];
  challenges.forEach(({ challenge, result }) => {
    const key = result.global.lineup.slice().sort((left, right) => left.localeCompare(right, "zh-Hant")).join("|");
    const previous = bestCompositionOwners.get(key);
    if (previous) {
      duplicateBestCompositions.push(`${previous} 與第 ${challenge.round} 回合 ${getChallengeLabel(challenge)}｜${challenge.encounter.name}`);
      return;
    }
    bestCompositionOwners.set(key, `第 ${challenge.round} 回合 ${getChallengeLabel(challenge)}｜${challenge.encounter.name}`);
  });
  const outputPath = EXPANDED_POOL_MODE
    ? path.resolve("/tmp", "imoc-expanded-formal-card-values.md")
    : onlyChallengeId
    ? path.resolve("/tmp", `imoc-formal-card-values-${onlyChallengeId}.md`)
    : QUICK_MODE
      ? path.resolve("/tmp", "imoc-quick-formal-card-values.md")
    : path.resolve(process.cwd(), "docs/formal-card-values.md");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdownReport(challenges, definitions, testChallenges), "utf8");
  duplicateBestCompositions.forEach((pair) => console.warn(`警告：最佳陣容重複：${pair}`));
  console.log(`報表：${outputPath}`);
}, QUICK_MODE ? 10 * 60 * 1000 : PRECISE_MODE ? 2 * 60 * 60 * 1000 : 45 * 60 * 1000);
