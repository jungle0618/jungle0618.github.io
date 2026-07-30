import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ROUND_CHALLENGE_SCHEDULE } from "../app/lib/gameConfig.js";
import { FORMAL_ENCOUNTER_SEED } from "./formalEncounterSeed.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const options = {
    desiredOrderPath: path.resolve(projectRoot, "temp"),
    outputDir: path.resolve(projectRoot, "tmp", "formal-stage-json"),
    reportPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--desired-order") {
      options.desiredOrderPath = path.resolve(projectRoot, argv[index + 1]);
      index += 1;
    } else if (arg === "--report") {
      options.reportPath = path.resolve(projectRoot, argv[index + 1]);
      index += 1;
    } else if (arg === "--output-dir") {
      options.outputDir = path.resolve(projectRoot, argv[index + 1]);
      index += 1;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知參數：${arg}`);
    }
  }

  if (!options.reportPath) {
    throw new Error("缺少 --report <path>，需要提供正式分析 Markdown。");
  }

  return options;
}

function printHelp() {
  console.log(`用法：
node --loader ./scripts/extensionless-loader.mjs scripts/export-reordered-formal-stage-json.mjs \\
  --report <formal-report.md> \\
  [--desired-order temp] \\
  [--output-dir tmp/formal-stage-json]`);
}

function parseTempJsonBlocks(source) {
  const decoder = JSON;
  const blocks = [];
  let cursor = 0;
  while (cursor < source.length) {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (cursor >= source.length) break;
    if (source[cursor] !== "{") throw new Error(`temp 格式錯誤：第 ${cursor + 1} 個字元不是 JSON 物件開頭`);
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = cursor;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }
    if (depth !== 0) throw new Error("temp 格式錯誤：JSON 物件未正常結束");
    blocks.push(decoder.parse(source.slice(cursor, end)));
    cursor = end;
  }
  return blocks;
}

function loadDesiredOrder(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const blocks = parseTempJsonBlocks(source);
  if (blocks.length !== 3) throw new Error(`預期 temp 內有 3 個 JSON，實際找到 ${blocks.length} 個`);
  const singleOrder = blocks.find((item) => Array.isArray(item.singleOrder))?.singleOrder;
  const duoOrder = blocks.find((item) => Array.isArray(item.duoOrder))?.duoOrder;
  const roundChallengeSchedule = blocks.find((item) => Array.isArray(item.roundChallengeSchedule))?.roundChallengeSchedule;
  if (!singleOrder || !duoOrder || !roundChallengeSchedule) {
    throw new Error("temp 內缺少 singleOrder、duoOrder 或 roundChallengeSchedule");
  }
  return { singleOrder, duoOrder, roundChallengeSchedule };
}

function buildOriginalChallengeMaps() {
  const allChallenges = [];
  const byChallengeId = new Map();
  const byEncounterRound = new Map();
  ROUND_CHALLENGE_SCHEDULE.forEach((roundChallenges, roundIndex) => {
    roundChallenges.forEach((spec, challengeIndex) => {
      const round = roundIndex + 1;
      const challengeId = `${round}-${challengeIndex + 1}-${spec.kind}`;
      const encounterRound = Number(spec.multiplayerEncounterRound);
      const encounter = FORMAL_ENCOUNTER_SEED[encounterRound - 1];
      const record = {
        challengeId,
        round,
        slotIndex: challengeIndex,
        kind: spec.kind,
        multiplayerEncounterRound: encounterRound,
        demoEncounterRound: Number(spec.demoEncounterRound ?? encounterRound),
        encounterName: encounter?.name ?? null,
        encounterDescription: encounter?.description ?? null,
        originalSpec: spec,
      };
      allChallenges.push(record);
      byChallengeId.set(challengeId, record);
      byEncounterRound.set(encounterRound, record);
    });
  });
  return { allChallenges, byChallengeId, byEncounterRound };
}

function parseFormalReport(source) {
  const matches = [...`${source}\n## END`.matchAll(
    /^## (\d+)\.(?:（已撤下）)? 第 (\d+) 回合 (單人關|雙人關)｜(.+?)\n\n搜尋最佳分數：\*\*(\d+) \/ \d+\*\*\n\n最佳陣容（後排 → 前排）：(.+?)\n([\s\S]*?)(?=^## )/gm
  )];
  if (matches.length === 0) {
    throw new Error("正式分析 Markdown 解析失敗：找不到關卡區塊");
  }

  const result = new Map();
  matches.forEach((match) => {
    const [, index, round, kindLabel, name, score, lineup, body] = match;
    const trimmedBody = body.trim();
    const metricRows = [...trimmedBody.matchAll(/^\| \d+ \| ([^|]+?) \| ([\d.-]+) \| (\d+) \| ([\d.]+)% \|$/gm)]
      .map((row, metricIndex) => ({
        rank: metricIndex + 1,
        name: row[1].trim(),
        shapleyValue: Number(row[2]),
        coreLoss: Number(row[3]),
        nearBestRate: Number(row[4]) / 100,
      }));
    const analysisLines = trimmedBody
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("|") && !line.startsWith("近最佳組隊") && !line.startsWith("排名以"));
    result.set(name, {
      reportIndex: Number(index),
      originalRound: Number(round),
      kind: kindLabel === "雙人關" ? "duo" : "single",
      bestScore: Number(score),
      bestLineup: lineup.split("、").map((item) => item.trim()).filter(Boolean),
      metricRows,
      analysis: trimmedBody,
      analysisSummary: analysisLines.slice(0, 6),
    });
  });
  return result;
}

function attachMetadata(entries, kind, originalMaps, reportMap) {
  return entries.map((entry, orderIndex) => {
    const original = originalMaps.byChallengeId.get(entry.challengeId);
    if (!original) throw new Error(`找不到原始 challengeId：${entry.challengeId}`);
    const report = reportMap.get(entry.name ?? "");
    if (!report) throw new Error(`正式分析缺少關卡：${entry.name}`);
    if (report.kind !== kind) throw new Error(`關卡類型不一致：${entry.name} 預期 ${kind}，實際 ${report.kind}`);
    return {
      order: orderIndex + 1,
      challengeId: entry.challengeId,
      round: original.round,
      slotIndex: original.slotIndex,
      kind,
      name: entry.name,
      originalEncounterRound: original.multiplayerEncounterRound,
      originalEncounterName: original.encounterName,
      updatedEncounterRound: entry.multiplayerEncounterRound,
      updatedEncounterName: entry.name,
      demoEncounterRound: entry.demoEncounterRound,
      encounterDescription: FORMAL_ENCOUNTER_SEED[entry.multiplayerEncounterRound - 1]?.description ?? null,
      bestScore: report.bestScore,
      bestLineup: report.bestLineup,
      analysisSummary: report.analysisSummary,
      analysis: report.analysis,
    };
  });
}

function buildUpdatedRoundSchedule(desiredSchedule, originalMaps, reportMap) {
  return desiredSchedule.map((roundChallenges, roundIndex) => roundChallenges.map((entry, slotIndex) => {
    const original = originalMaps.byChallengeId.get(entry.challengeId);
    if (!original) throw new Error(`找不到原始 challengeId：${entry.challengeId}`);
    const report = reportMap.get(entry.name ?? "");
    if (!report) throw new Error(`正式分析缺少關卡：${entry.name}`);
    return {
      challengeId: entry.challengeId,
      round: roundIndex + 1,
      slotIndex,
      kind: entry.kind,
      originalEncounterRound: original.multiplayerEncounterRound,
      originalEncounterName: original.encounterName,
      multiplayerEncounterRound: entry.multiplayerEncounterRound,
      demoEncounterRound: entry.demoEncounterRound,
      name: entry.name,
      encounterDescription: FORMAL_ENCOUNTER_SEED[entry.multiplayerEncounterRound - 1]?.description ?? null,
      bestScore: report.bestScore,
      bestLineup: report.bestLineup,
      analysisSummary: report.analysisSummary,
      analysis: report.analysis,
    };
  }));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const desired = loadDesiredOrder(options.desiredOrderPath);
  const originalMaps = buildOriginalChallengeMaps();
  const reportMap = parseFormalReport(fs.readFileSync(options.reportPath, "utf8"));

  const singleOrder = attachMetadata(desired.singleOrder, "single", originalMaps, reportMap);
  const duoOrder = attachMetadata(desired.duoOrder, "duo", originalMaps, reportMap);
  const roundChallengeSchedule = buildUpdatedRoundSchedule(desired.roundChallengeSchedule, originalMaps, reportMap);

  ensureDir(options.outputDir);
  const singlePath = path.join(options.outputDir, "single-order.updated.json");
  const duoPath = path.join(options.outputDir, "duo-order.updated.json");
  const schedulePath = path.join(options.outputDir, "round-challenge-schedule.updated.json");

  writeJson(singlePath, { singleOrder });
  writeJson(duoPath, { duoOrder });
  writeJson(schedulePath, { roundChallengeSchedule });

  console.log(JSON.stringify({
    singlePath,
    duoPath,
    schedulePath,
    singleCount: singleOrder.length,
    duoCount: duoOrder.length,
    roundCount: roundChallengeSchedule.length,
  }, null, 2));
}

main();
