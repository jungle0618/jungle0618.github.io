# `app/lib` 導覽

`lib` 只放不依賴 React 畫面的設定、規則與純資料轉換。模式狀態、API 呼叫及畫面流程應留在 `features`。

## 設定與資料

- `gameConfig.js`：全局遊戲參數、Demo／多人關卡類型與敵方編成索引。
- `characterConfig.js`：我方、敵方角色定義及敵方關卡內容。
- `challengeConfig.js`：把關卡排程轉為 Demo 或多人模式可使用的 challenge。
- `soloConfig.js`：Demo 教學關、固定角色池與 Demo challenge 入口。
- `multiplayerConfig.js`：多人編隊大小及站位順序。
- `assetConfig.js`：UI 圖示路徑，不放遊戲規則。
- `gameTutorialPages.js`：教學頁面文字。

## 角色與編隊

- `petCatalogCore.js`：角色卡資料、等級面板及技能說明的實作。
- `petCatalog.js`：角色資料的穩定公開入口。
- `cardDrawLogic.js`：抽卡資格、隨機抽卡及升級。
- `lineupLogic.js`：組隊、排序、同步與換位。
- `encounterLogic.js`：把敵方關卡設定轉成指定等級的戰鬥角色。
- `effectRegistry.js`：技能欄位、標籤與等級縮放規則。

## 戰鬥與模式純邏輯

- `battleLogic.js`：戰鬥引擎。
- `battleService.js`：畫面呼叫戰鬥引擎的入口與回放快照。
- `battleScoring.js`：關卡分數計算。
- `soloLogic.js`：Demo 計分與摘要。
- `multiplayerLogic.js`：排名配對、雙人陣容及玩家可見資料。

依賴方向原則：`features/components → lib 模式入口 → 共用規則 → 基礎設定`，不要讓 `lib` 反向引用 React 元件或模式狀態。
