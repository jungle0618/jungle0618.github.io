# 多人模式資料契約

多人模式的陣列順序固定為「後排 → 前排」。空值代表缺席格，不補位也不壓縮。

## 資料分層

- 玩家視圖：自己的角色池與陣容、雙人關搭檔在該關的當前陣容、所有隊伍的排名／分數／等級分布、歷史戰報。
- 工人摘要視圖：所有隊伍的排名、分數、解鎖數與本回合配對；點選隊伍或執行操作時才按需載入角色池與陣容。戰鬥回放與單關分析也按需載入。
- 正式結算：由工人模式前端使用 `battleLogic` 計算，再透過後端一次儲存結果。

## 雙人關

依回合開始前排名固定配對：9–10 永遠同組；其餘八隊依名次配成 1–8、2–7、3–6、4–5。名次先比較總分，同分時小隊編號較小者在前。弱隊三格排在聯隊後排；強隊（高排名）三格排在聯隊前排，並以 `Pairings.higherRankTeamId` 為準。因此合併陣列是：

```text
低排名隊 [後排 → 前排] 三格 + 高排名隊 [後排 → 前排] 三格
```

任何未填角色都以 `null` 保留並直接參戰。工人端結算不因缺席而停止。

玩家與工人模式發出讀取或讀寫請求後，畫面會鎖定到 API 回覆為止；觸發按鈕維持下壓狀態，避免等待期間重複送出或修改陣容。

## Google Sheet 建議工作表

| 工作表 | 主要欄位 | 用途 |
| --- | --- | --- |
| `GameState` | `round`, `phase`, `version`, `updatedAt` | 目前正式回合與寫入版本 |
| `Teams` | `teamId`, `teamName`, `passwordHash`, `score`, `rank` | 十二隊登入與排名 |
| `Roster` | `teamId`, `petName`, `level`, `gameRoundsDeployed`, `version` | 各隊角色等級及持久狀態 |
| `Lineups` | `round`, `challengeId`, `teamId`, `slotIndex`, `petName`, `version` | 玩家最後儲存的陣容；`petName` 可空白 |
| `Pairings` | `round`, `challengeId`, `pairId`, `higherRankTeamId`, `lowerRankTeamId`, `createdAt` | 回合開始時固定的雙人關配對快照 |
| `Battles` | `battleId`, `round`, `challengeId`, `teamIds`, `score`, `result`, `replayJson` | 工人端正式結算與完整回放 |
| `WorkerAuth` | `workerId`, `passwordHash`, `enabled` | 工人模式登入 |

瀏覽器一律呼叫 Apps Script Web App；GitHub Pages 前端不持有 Sheet 權限或 Google 金鑰。Apps Script 以部署者身分讀寫私人 Sheet。玩家 API 只額外回傳本回合雙人關搭檔在該關的 `Lineups`，完整回放必須按需請求且只允許相關隊伍；工人則以指定隊伍與關卡按需讀取回放。

## 寫入規則

- 玩家可儲存含空格的陣容，API 只檢查登入身分、角色所有權、格數與資料版本。
- 工人每次自動抽卡會讓每隊各抽 `GAME_CONFIG.drawCards` 張非傳奇角色；角色可在 `characterConfig` 以 `drawFromRound` 設定最早可抽回合，單人與多人共用此限制。新角色以 Lv.1 解鎖，重複角色升級，最高與最低等級差最多為 4。陣容不自動產生，由工人後台或玩家手動儲存。
- 工人點入單一小隊後可查看所有我方角色；Lv.0 表示未解鎖，使用 `＋`／`－` 在 Lv.0～Lv.10 間調整，按下確認才批次送出。0→1 會新增至 `Roster`，1→0 會從 `Roster` 移除；仍在本回合陣容中的角色不能鎖回 Lv.0。
- 工人「所有隊伍一鍵組隊」會依角色等級與能力替每隊配置本回合全部關卡；同隊角色不跨關卡重複，雙人關只寫入該隊自己的 3 格，所有結果以一次批次請求寫入。
- 同一角色在同一回合只能用於一個關卡，同一陣容內也不能重複。
- 多人模式的一鍵組隊與隨機組隊只使用自己的角色池；雙人關搭檔陣容僅供查看，不會被加入本隊三格。
- 工人 Reset 會清除角色池、陣容、配對快照、戰報及分數並回到第 1 回合；後端會確認 `Pairings` 已清空並回傳 `clearedPairings`，但不修改 `Teams.passwordHash` 或 `WorkerAuth`。
- 正式結算後依最新排名產生下一回合的 `Pairings`；玩家畫面、工人畫面與正式戰鬥都讀取同一份快照。
- 工人模式前端負責缺席規則與正式戰鬥計算。
- 正式結算時，本回合出現在任一最終陣容的角色會將 `Roster.gameRoundsDeployed` 加 1；同回合跨關卡或連打 Lv.1～Lv.20 仍只加一次，測試戰鬥不累計。
- 具有 `evolvesAfterGameRounds` 等跨回合效果的角色，會在多人角色卡顯示目前出戰回合數與目標回合數。
- 工人結算後，以一次請求提交完整回放、所有分數與下一版角色資料。
- 正式結算前會重新讀取陣容；寫入時再次核對每隊、每關的陣容版本，計算期間若有人改動陣容就拒絕舊結果。
- `version` 不一致時回傳 `409`，前端重新載入，避免舊分頁覆蓋新資料。
