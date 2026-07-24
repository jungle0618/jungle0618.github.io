/**
 * 正式關卡的預選池。
 *
 * 這份資料不會被遊戲讀取，只供 `npm run balance:candidates` 評估。
 * 陣列順序與正式關卡相同，皆為後排到前排。
 */
export const CANDIDATE_ENEMY_ENCOUNTERS = Object.freeze([
  { name: "獅王基準", description: "沒有特殊效果的單體首領，檢查隊伍基本攻防。", enemyIds: ["forest_tyrant"] },
  { name: "赤潮魚群", description: "五個中小型白板敵人，考驗清場速度與死亡連鎖。", enemyIds: ["swarm_piranha", "swarm_piranha", "swarm_piranha", "swarm_piranha", "swarm_piranha"] },
  { name: "薄甲連牙", description: "全隊薄甲掩護前排三連擊，讓穿透與多段承傷各有價值。", enemyIds: ["bombard_pulser", "twin_serpent"] },
  { name: "泉庭誘餌", description: "低生命誘餌保護治療核心，自癒前排拖長戰線。", enemyIds: ["life_chanter", "high_priest", "sleepy_healer"] },
  { name: "白鐵倒數", description: "厚甲穿透前排拖延時間，後排在第十回合引爆全場。", enemyIds: ["forest_deer", "iron_fortress"] },
  { name: "爆羽火線", description: "開場傷害接上死亡爆破，逼迫隊伍處理傷害時序。", enemyIds: ["bombard_opener", "bombard_martyr", "swarm_boar"] },
  { name: "竹林風眼", description: "範圍攻擊藏在減傷守衛身後，必須突破保護或直取後排。", enemyIds: ["storm_archer", "bamboo_guard"] },
  { name: "深海替身", description: "後排刺客與最低生命追擊受鯨魚轉傷保護。", enemyIds: ["endless_colossus", "royal_assassin", "abyss_guard"] },
  { name: "反擊鐵岸", description: "反傷前排懲罰高攻普通攻擊，後排提供持續治療。", enemyIds: ["rage_hp_aide", "high_priest", "retribution_guard"] },
  { name: "蜃影重甲", description: "閃避與厚甲交替擋住攻勢，測試穩定輸出與穿透。", enemyIds: ["mirage_lord", "shell_guard"] },
  { name: "前後夾獵", description: "前排逐步成長，赤狐從後排方向攻擊脆弱核心。", enemyIds: ["swarm_fox", "rage_atk_aide", "rage_champion"] },
  { name: "震地餌陣", description: "後排誘餌、全體震擊核心與自癒前排形成多種突破路線。", enemyIds: ["life_chanter", "burrow_raider", "sleepy_healer"] },
  { name: "霧沼三震", description: "開戰三段全體傷害後進入奇數回合閃避節奏。", enemyIds: ["shadow_assassin"] },
  { name: "封攻長城", description: "前排攻擊會被壓制，厚甲守衛則拖延輸出節奏。", enemyIds: ["attack_sealer", "shell_guard"] },
  { name: "狂牙育成", description: "猴子與水獺共同強化前排花豹，越晚處理越危險。", enemyIds: ["rage_atk_aide", "rage_hp_aide", "rage_champion"] },
  { name: "爆羽鬥獸", description: "中央爆破會餵養兩側鬣狗，擊殺順序會改變戰局。", enemyIds: ["sweep_brute", "bombard_martyr", "sweep_brute"] },
  { name: "駝羽風暴", description: "開場轟炸、死亡爆破與範圍普攻形成三種不同傷害波段。", enemyIds: ["storm_archer", "bombard_opener", "bombard_martyr"] },
  { name: "低血追獵", description: "多個最低生命追擊者持續收割脆弱角色。", enemyIds: ["swarm_raccoon", "endless_colossus", "swarm_raccoon"] },
  { name: "鯨幕砲陣", description: "鯨魚替後方範圍攻擊者承傷，鼓勵後排打擊或快速突破前線。", enemyIds: ["burrow_raider", "storm_archer", "abyss_guard"] },
  { name: "終局多線", description: "薄甲、後排突襲、全隊治療與前排連擊同時施壓。", enemyIds: ["high_priest", "swarm_fox", "bombard_pulser", "twin_serpent"] },
]);
