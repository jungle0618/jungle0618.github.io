import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const configUrl = pathToFileURL(path.join(root, "app/lib/gameConfig.js"));
const { GAME_CONFIG } = await import(`${configUrl.href}?sync=${Date.now()}`);
const codePath = path.join(root, "apps-script/Code.gs");
const checkOnly = process.argv.includes("--check");

if (GAME_CONFIG.maxRound !== GAME_CONFIG.roundChallengeSchedule.length) {
  throw new Error("GAME_CONFIG.maxRound 必須等於 roundChallengeSchedule 的回合數");
}

const roundKinds = GAME_CONFIG.roundChallengeSchedule.map((challenges) =>
  challenges.map((challenge) => challenge.kind)
);
const generated = [
  "// BEGIN GENERATED GAME CONFIG — run: npm run config:sync",
  `const MAX_LEVEL = ${GAME_CONFIG.maxPetLevel};`,
  `const MAX_LEVEL_GAP = ${GAME_CONFIG.maxLevelGap};`,
  `const MAX_ROUND = ${GAME_CONFIG.maxRound};`,
  `const BATTLE_TURN_LIMIT = ${GAME_CONFIG.battleTurnLimit};`,
  `const MAX_BOSS_LEVEL = ${GAME_CONFIG.maxBossLevel};`,
  `const DRAW_CARDS = ${GAME_CONFIG.drawCards};`,
  `const SINGLE_TEAM_SIZE = ${GAME_CONFIG.teamSize};`,
  `const DUO_CONTRIBUTION_SIZE = ${GAME_CONFIG.duoContributionSize};`,
  `const DUO_CLEAR_SCORE = ${GAME_CONFIG.duoClearScore};`,
  `const ONCE_PER_GAME_PET_NAMES = Object.freeze(${JSON.stringify(GAME_CONFIG.oncePerGamePetNames)});`,
  `const ROUND_KINDS = ${JSON.stringify(roundKinds, null, 2)};`,
  "// END GENERATED GAME CONFIG",
].join("\n");

const source = fs.readFileSync(codePath, "utf8");
const pattern = /\/\/ BEGIN GENERATED GAME CONFIG[^\n]*\n[\s\S]*?\/\/ END GENERATED GAME CONFIG/;
if (!pattern.test(source)) throw new Error("Code.gs 找不到生成設定區塊");
const next = source.replace(pattern, generated);

if (checkOnly) {
  if (next !== source) {
    console.error("Code.gs 的遊戲參數未同步；請執行 npm run config:sync");
    process.exit(1);
  }
  console.log("Game config sync check: OK");
} else {
  fs.writeFileSync(codePath, next);
  console.log("Synced gameConfig.js -> apps-script/Code.gs");
}
