import fs from "node:fs";

const source = fs.readFileSync(new URL("../docs/exact-team-size-card-values.md", import.meta.url), "utf8");
const outputPath = new URL("../docs/formal-stage-mix-recommendation.md", import.meta.url);
const matches = [...`${source}\n### `.matchAll(/^### (\d+)\. (.+?)（(正式關|測試關)）\n([\s\S]*?)(?=^### )/gm)];
if (matches.length !== 20) throw new Error(`預期 20 關，實際解析到 ${matches.length} 關`);

const stages = matches.map((match) => {
  const [, number, name, origin, body] = match;
  const best5 = body.match(/五人最佳 (\d+) 分：(.+)/);
  const best6 = body.match(/六人最佳 (\d+) 分：(.+)/);
  const cards = {};
  for (const row of body.matchAll(/^\| ([^|]+?) \| ([\d.]+) \| ([\d.]+) \| [^|]+ \| ([\d.]+)% \| ([\d.]+)% \|$/gm)) {
    cards[row[1].trim()] = { 5: { strength: +row[2], near: +row[4] }, 6: { strength: +row[3], near: +row[5] } };
  }
  return { number: +number, name, origin, best: { 5: +best5?.[1], 6: +best6?.[1] }, lineup: { 5: best5?.[2].trim(), 6: best6?.[2].trim() }, cards };
});
const cardNames = Object.keys(stages[0].cards);
if (cardNames.length !== 24) throw new Error(`預期 24 張卡，實際解析到 ${cardNames.length} 張`);

// 每關前六名且強度至少 25 才算真正擅長，避免把全員都不適合的末段誤認為專長。
for (const stage of stages) for (const size of [5, 6]) {
  const ranked = cardNames.slice().sort((a, b) => stage.cards[b][size].strength - stage.cards[a][size].strength);
  stage.specialists ??= {};
  stage.specialists[size] = new Set(ranked.slice(0, 6).filter((name) => stage.cards[name][size].strength >= 25));
}

let rngState = 0x260721;
const random = () => ((rngState = (rngState * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const sample = (items) => items[Math.floor(random() * items.length)];
const sd = (values) => { const mean = values.reduce((a, b) => a + b, 0) / values.length; return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length); };

function randomConfig() {
  const selected = stages.slice().sort(() => random() - 0.5).slice(0, 14);
  const six = new Set(selected.slice().sort(() => random() - 0.5).slice(0, 5).map((stage) => stage.number));
  return selected.map((stage) => ({ stage: stage.number, size: six.has(stage.number) ? 6 : 5 }));
}

function evaluate(config) {
  const selected = config.map(({ stage, size }) => ({ stage: stages[stage - 1], size }));
  const averages = {}, specialties = {};
  for (const card of cardNames) {
    averages[card] = selected.reduce((sum, item) => sum + item.stage.cards[card][item.size].strength, 0) / 14;
    specialties[card] = selected.filter((item) => item.stage.specialists[item.size].has(card)).length;
  }
  const values = Object.values(averages), specialtyDeficit = Object.values(specialties).reduce((sum, count) => sum + Math.max(0, 2 - count), 0);
  const max = Math.max(...values), min = Math.min(...values), stageScores = selected.map((item) => item.stage.best[item.size]);
  return { cost: specialtyDeficit * 100000 + sd(values) * 100 + (max - min) * 3 + sd(stageScores) * 2, specialtyDeficit, averages, specialties, strengthSd: sd(values), range: max - min, mean: values.reduce((a, b) => a + b, 0) / values.length, stageScoreSd: sd(stageScores) };
}

function mutate(config) {
  const next = config.map((item) => ({ ...item }));
  if (random() < 0.55) {
    const position = Math.floor(random() * next.length);
    next[position].stage = sample(stages.filter((stage) => !next.some((item) => item.stage === stage.number))).number;
  } else {
    sample(next.filter((item) => item.size === 5)).size = 6;
    sample(next.filter((item) => item.size === 6)).size = 5;
  }
  return next;
}

let population = Array.from({ length: 1800 }, randomConfig);
for (let generation = 0; generation < 1200; generation += 1) {
  const ranked = population.map((config) => ({ config, result: evaluate(config) })).sort((a, b) => a.result.cost - b.result.cost);
  const elite = ranked.slice(0, 180).map((item) => item.config);
  population = elite.slice();
  while (population.length < 1800) population.push(mutate(sample(elite)));
}
const winner = population.map((config) => ({ config, result: evaluate(config) })).sort((a, b) => a.result.cost - b.result.cost)[0];
const chosen = winner.config.slice().sort((a, b) => a.stage - b.stage);
const currentDuoNames = new Set(["赤潮魚群", "泉庭誘餌", "封攻長城", "爆羽鬥獸", "終局多線"]);
const currentConfig = stages.filter((stage) => stage.origin === "正式關").map((stage) => ({ stage: stage.number, size: currentDuoNames.has(stage.name) ? 6 : 5 }));
const current = evaluate(currentConfig);

const lines = ["# 正式關卡配關建議", "", "資料來源：逐關五人／六人精確分析。配置固定為 14 關，其中 9 關五人、5 關六人。排除傳奇卡與鯉魚王。", "", "擅長關定義：該關該模式綜合強度前六名，且綜合強度至少 25。最佳化首先要求每張卡至少有兩個擅長關，再降低角色平均強度標準差與最高／最低落差。", "", "## 建議配置", "", "| 原編號 | 關卡 | 原分類 | 人數 | 最佳分 | 最佳陣容 |", "|---:|---|---|---:|---:|---|"];
for (const item of chosen) { const stage = stages[item.stage - 1]; lines.push(`| ${stage.number} | ${stage.name} | ${stage.origin} | ${item.size} | ${stage.best[item.size]} | ${stage.lineup[item.size]} |`); }
lines.push("", "## 與目前正式配置比較", "", "| 配置 | 平均強度 | 角色標準差 | 最強／最弱落差 | 未滿兩個擅長關缺口 |", "|---|---:|---:|---:|---:|", `| 目前正式配置 | ${current.mean.toFixed(2)} | ${current.strengthSd.toFixed(2)} | ${current.range.toFixed(2)} | ${current.specialtyDeficit} |`, `| 建議配置 | ${winner.result.mean.toFixed(2)} | ${winner.result.strengthSd.toFixed(2)} | ${winner.result.range.toFixed(2)} | ${winner.result.specialtyDeficit} |`, "", `建議配置把角色標準差降低 ${((1 - winner.result.strengthSd / current.strengthSd) * 100).toFixed(1)}%，最高／最低落差降低 ${((1 - winner.result.range / current.range) * 100).toFixed(1)}%。`, "", "## 每張卡的覆蓋", "", "| 角色 | 14 關平均強度 | 擅長關數 | 最擅長的三關 |", "|---|---:|---:|---|");
for (const card of cardNames.slice().sort((a, b) => winner.result.averages[b] - winner.result.averages[a])) {
  const top = chosen.map((item) => ({ item, value: stages[item.stage - 1].cards[card][item.size].strength })).sort((a, b) => b.value - a.value).slice(0, 3).map(({ item, value }) => `${stages[item.stage - 1].name}（${item.size}人，${value.toFixed(1)}）`).join("、");
  lines.push(`| ${card} | ${winner.result.averages[card].toFixed(2)} | ${winner.result.specialties[card]} | ${top} |`);
}
lines.push("", "## 解讀", "", "這是從現有 20 個敵方陣容中挑選與分配人數的數值建議，不等於直接修改正式關卡。若某張卡雖有兩個擅長關、但平均強度仍偏高，應避免再加入同類受利關；若平均偏低，則應保留其專屬機制關。", "");
fs.writeFileSync(outputPath, lines.join("\n"));
console.log(JSON.stringify({ config: chosen, specialtyDeficit: winner.result.specialtyDeficit, mean: winner.result.mean, strengthSd: winner.result.strengthSd, range: winner.result.range, stageScoreSd: winner.result.stageScoreSd, specialties: winner.result.specialties }, null, 2));
