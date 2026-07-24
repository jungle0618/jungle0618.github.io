import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SHARED_FILES = [
  "components/GameShell.js",
  "components/TeamSection.js",
  "components/CollectionSection.js",
  "components/EncounterPanel.js",
  "components/BattleSection.js",
  "hooks/usePointerDrag.js",
  "hooks/useTeamSelectionActions.js",
  "lib/battleLogic.js",
  "lib/battleService.js",
  "lib/lineupLogic.js",
  "lib/petCatalog.js",
  "lib/petCatalogCore.js",
];

describe("模式依賴邊界", () => {
  it("共用 UI 與戰鬥規則不引用單人模式", () => {
    SHARED_FILES.forEach((relativePath) => {
      const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
      expect(source, relativePath).not.toMatch(/features\/solo|soloConfig|soloLogic|soloProgression/);
    });
  });

  it("多人基礎層不引用單人抽卡或計分", () => {
    [
      "features/multiplayer/multiplayerAdapter.js",
      "features/multiplayer/multiplayerApi.js",
      "features/multiplayer/workerBattleResolver.js",
      "lib/multiplayerLogic.js",
    ].forEach((relativePath) => {
      const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
      expect(source, relativePath).not.toMatch(/features\/solo|soloConfig|soloLogic|drawPetCards/);
    });
  });

  it("多人玩家與工人控制器只透過共用元件合作", () => {
    const workerSource = readFileSync(new URL("../../features/multiplayer/WorkerMode.js", import.meta.url), "utf8");
    const playerSource = readFileSync(new URL("../../features/multiplayer/MultiplayerMode.js", import.meta.url), "utf8");
    expect(workerSource).not.toMatch(/from ["']\.\/MultiplayerMode["']/);
    expect(playerSource).not.toMatch(/soloLogic|features\/solo/);
    expect(workerSource).toMatch(/from ["']\.\/MultiplayerOverview["']/);
    expect(playerSource).toMatch(/from ["']\.\/MultiplayerOverview["']/);
  });

  it("正式多人 client 只呼叫 Apps Script，不依賴 Next API 或 Node server", () => {
    const source = readFileSync(new URL("../../features/multiplayer/multiplayerApi.js", import.meta.url), "utf8");
    expect(source).toMatch(/NEXT_PUBLIC_APPS_SCRIPT_URL/);
    expect(source).not.toMatch(/["']\/api\//);
    expect(source).not.toMatch(/server\//);
    const appsScript = readFileSync(new URL("../../../apps-script/Code.gs", import.meta.url), "utf8");
    expect(appsScript).toMatch(/PropertiesService|getScriptLock|SpreadsheetApp/);
    expect(appsScript).not.toMatch(/GOOGLE_PRIVATE_KEY|SERVICE_ACCOUNT/);
  });

  it("大遊戲參數集中於 gameConfig，Apps Script 使用可檢查的生成區塊", () => {
    const challengeConfig = readFileSync(new URL("../../lib/challengeConfig.js", import.meta.url), "utf8");
    const multiplayerConfig = readFileSync(new URL("../../lib/multiplayerConfig.js", import.meta.url), "utf8");
    const appsScript = readFileSync(new URL("../../../apps-script/Code.gs", import.meta.url), "utf8");
    expect(challengeConfig).toMatch(/from ["']\.\/gameConfig["']/);
    expect(challengeConfig).not.toMatch(/MAX_BOSS_LEVEL\s*=\s*\d/);
    expect(multiplayerConfig).toMatch(/from ["']\.\/gameConfig["']/);
    expect(multiplayerConfig).not.toMatch(/MULTIPLAYER_TEAM_COUNT\s*=\s*\d/);
    expect(appsScript).toMatch(/BEGIN GENERATED GAME CONFIG/);
    expect(appsScript).toMatch(/END GENERATED GAME CONFIG/);
    expect(appsScript).toMatch(/const BATTLE_TURN_LIMIT = 35;/);
    expect(appsScript).toMatch(/const MAX_BOSS_LEVEL = 30;/);
    expect(appsScript).toMatch(/const MULTIPLAYER_TEAM_COUNT = 10;/);
    expect(appsScript).toMatch(/const ONCE_PER_GAME_PET_NAMES = Object\.freeze\(\["鯊魚","變色龍"\]\);/);
  });
});
