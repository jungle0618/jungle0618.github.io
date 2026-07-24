# 專案架構

## 大遊戲參數

`app/lib/gameConfig.js` 是大遊戲流程參數的唯一手動設定來源，包含回合數、抽卡數、等級上限、戰鬥回合上限、Boss 等級、單／雙人隊伍大小、多人隊伍數及每回合關卡排程。UI 圖示集中於 `app/lib/assetConfig.js`，避免外觀資源與遊戲規則混在一起。修改遊戲參數後執行 `npm run config:sync`，將 Apps Script 需要的子集合更新到 `apps-script/Code.gs`；`npm test` 與 `npm run build` 會先執行 `config:check`，未同步時直接失敗。

## 依賴方向

```text
模式控制器（features/solo、未來 features/multiplayer）
                ↓ 提供資料與操作
共用 GameShell 與 components
                ↓
共用 battleService → battleLogic、characterConfig、effectRegistry
```

模式控制器可以依賴共用層；共用層不可反向引用單人或多人模式。修改共用角色卡、編隊、角色池、戰鬥回放或戰鬥規則時，所有模式會一起生效。

## 共用層

- `components/GameShell.js`：編隊、角色池、戰鬥回放、敵方資訊與操作列的共用畫面。
- `components/GameCard.js`、`TeamSection.js`、`CollectionSection.js`：受控 UI，不決定資料來源。
- `lib/battleService.js`：所有畫面進行戰鬥的唯一入口，先複製快照再交給戰鬥引擎。
- `lib/battleLogic.js`、`characterConfig.js`、`effectRegistry.js`：所有模式共用的角色與戰鬥規則。
- `lib/petCatalog.js`：角色名稱與等級轉成完整卡片／戰鬥資料。
- `lib/lineupLogic.js`：所有模式共用的編隊複製、排序與換位工具。

## 模式層

- `features/solo/SoloGame.js`：單人 state、教學、抽卡、回合推進與單人計分。
- `features/solo/soloProgression.js`：單人抽卡與角色成長的公開入口，多人模式不可引用。
- `features/multiplayer`：Google Sheet 資料、玩家編隊儲存、工人結算與排名。
- `features/multiplayer/MultiplayerOverview.js`：玩家與工人共用的各隊資訊及歷史戰鬥視窗，模式控制器彼此不互相 import。
- `features/multiplayer/multiplayerAdapter.js`：把 Sheet 的名稱、等級與空格轉為共用角色及編隊模型。
- `features/multiplayer/multiplayerApi.js`：玩家與工人頁面的唯一後端介面；UI 不直接碰 Google Sheet。
- `features/multiplayer/workerBattleResolver.js`：工人端正式單人／雙人關結算與隊伍分數彙整。

## 正式資料層

- `features/multiplayer/multiplayerApi.js`：GitHub Pages 前端的單一 Apps Script action client。
- `apps-script/Code.gs`：正式登入、權限、Sheet 讀寫、版本檢查與寫入鎖。
- `apps-script/appsscript.json`：Apps Script Web App manifest。

多人模式應把後端資料轉換成 `GameShell` 需要的 props，不複製 `GameShell` JSX。工人正式戰鬥與玩家測試戰鬥都呼叫 `runBattle`，確保角色規則一致。
