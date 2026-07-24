# Google Sheet 初始化

正式版本使用 GitHub Pages＋Google Apps Script，不再使用 Service Account 或 Node.js API。

完整步驟請見 [GITHUB_PAGES_APPS_SCRIPT.md](./GITHUB_PAGES_APPS_SCRIPT.md)。

全新 Sheet 由 Apps Script 的以下函式初始化：

```js
initializeScriptProperties("你的 Spreadsheet ID")
initializeSpreadsheet()
```

會建立八張工作表：

- `GameState`
- `Teams`
- `Roster`
- `Lineups`
- `Pairings`
- `Battles`
- `WorkerAuth`
- `WorkerTestData`

其中 `Roster` 包含 `gameRoundsDeployed`，正式結算時會累計跨回合效果所需的出戰回合數。

既有專案若只要新增 `Pairings`、不清除其他資料，可在 Apps Script 執行：

```js
addPairingsSheet()
```

若已經位於雙人回合、工作表存在但沒有配對資料，更新 Apps Script 後執行：

```js
backfillCurrentPairings()
```

Sheet 必須維持私人；玩家只透過 Apps Script Web App 存取資料。
