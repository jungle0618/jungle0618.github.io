import { getCharacterTags, scaleSpecialForLevel, validateSpecialDefinitions } from "./effectRegistry";
import { ONCE_PER_GAME_PET_NAMES } from "./gameConfig";

export { getCharacterTags, scaleSpecialForLevel } from "./effectRegistry";

const PET_DEFINITIONS = {
  秦始皇: { tier: 4, image: "/pet_images/allies/empire.png", baseStats: { atk: 10, hp: 3 }, special: { fixedIncomingDamage: 1, cannotReceiveAllyHealing: true }, tags: ["坦克", "控制"] },
  隼: { tier: 4, image: "/pet_images/allies/falcon.png", baseStats: { atk: 1, hp: 1 }, special: { mountDodge: true }, tags: ["保排"] },
  鯊魚: { tier: 4, image: "/pet_images/allies/shark.png", baseStats: { atk: 200, hp: 1 }, special: { oncePerGame: true }, tags: ["主C"] },
  貓頭鷹: { tier: 4, image: "/pet_images/allies/owl.png", baseStats: { atk: 15, hp: 20 }, special: { openingSwapEnemyEnds: true }, tags: ["控制"] },
  變色龍: { tier: 4, image: "/pet_images/allies/chameleon.png", baseStats: { atk: 5, hp: 5 }, special: { frontSwapAtkHp: true, oncePerGame: true }, tags: ["控制"] },

  橘子: { tier: 3, drawFromRound: 4, image: "/pet_images/allies/orange.png", baseStats: { atk: 1, hp: 1 }, special: { splitUnitCount: 4, splitUnitAtk: 1, splitUnitHp: 1 }, tags: ["死亡"] },
  鯉魚王: { tier: 3, image: "/pet_images/allies/magikarp.png", baseStats: { atk: 0, hp: 8 }, special: { evolvesAfterGameRounds: 2, evolvedName: "暴鯉龍", evolvedImage: "/pet_images/allies/gyarados.png", evolvedStats: { atk: 25, hp: 35 } }, tags: ["成長", "主C"] },
  巨嘴鳥: { tier: 3, image: "/pet_images/allies/toucan.png", baseStats: { atk: 15, hp: 10 }, special: { attackAll: true }, tags: ["範圍", "主C"] },
  蜜獾: { tier: 3, drawFromRound: 4, image: "/pet_images/allies/honey_badger.png", baseStats: { atk: 5, hp: 5 }, special: { effectDamageMultiplier: 2 }, tags: ["主C", "增益"] },

  豪豬: { tier: 2, drawFromRound: 4, image: "/pet_images/allies/porcupine.png", baseStats: { atk: 5, hp: 15 }, special: { roundShield: 1, atkPerArmorGained: 2 }, tags: ["護甲", "主C"] },
  犰狳: { tier: 2, drawFromRound: 4, image: "/pet_images/allies/armadillo.png", baseStats: { atk: 10, hp: 16 }, special: { shieldGainHp: 4 }, tags: ["護甲", "成長"] },
  魟魚: { tier: 2, image: "/pet_images/allies/manta_ray.png", baseStats: { atk: 5, hp: 35 }, special: { backlineDamageMultiplier: 0.4 }, tags: ["保排", "坦克"] },
  犀牛: { tier: 2, image: "/pet_images/allies/rhino.png", baseStats: { atk: 15, hp: 15 }, pierce: true, special: { attackArmoredOrDodgeHeal: 5 }, tags: ["主C", "回復"] },
  禿鷹: { tier: 2, image: "/pet_images/allies/vulture.png", baseStats: { atk: 6, hp: 6 }, special: { gainAtkOnAnyDeath: 4, gainHpOnAnyDeath: 4 }, tags: ["死亡", "成長"] },
  獨角仙: { tier: 2, image: "/pet_images/allies/rhinoceros_beetle.png", baseStats: { atk: 3, hp: 3 }, special: { deathBacklineDamage: 25 }, tags: ["死亡", "刺客"] },

  烏龜: { tier: 1, image: "/pet_images/allies/turtle.png", baseStats: { atk: 5, hp: 25 }, special: { openingSelfArmor: 6 }, tags: ["護甲", "坦克"] },
  長頸鹿: { tier: 1, image: "/pet_images/allies/giraffe.png", baseStats: { atk: 5, hp: 10 }, special: { roundHpAllAhead: 2 }, tags: ["保排", "增益"] },
  穿山甲: { tier: 1,  drawFromRound: 4, image: "/pet_images/allies/pangolin.png", baseStats: { atk: 8, hp: 16 }, special: { roundShield: 1, roundFrontArmor: 1 }, tags: ["護甲", "保排"] },
  河馬: { tier: 1, image: "/pet_images/allies/hippopotamus.png", baseStats: { atk: 5, hp: 5 }, special: { openingFrontStats: 8 }, tags: ["增益", "保排"] },
  蛇: { tier: 1, image: "/pet_images/allies/snake.png", baseStats: { atk: 10, hp: 18 }, special: { enemyHpGainMultiplier: 0.5 }, tags: ["控制"] },
  耳廓狐: { tier: 1, image: "/pet_images/allies/fennec_fox.png", baseStats: { atk: 5, hp: 5 }, special: { roundFrontFixedDamage: 4 }, tags: ["刺客", "主C"] },
  渡鴉: { tier: 1, image: "/pet_images/allies/raven.png", baseStats: { atk: 6, hp: 6 }, special: { deathTeamAtk: 6 }, tags: ["死亡", "增益"] },
  雪貂: { tier: 1, image: "/pet_images/allies/ferret.png", baseStats: { atk: 5, hp: 10 }, special: { roundFrontmostHeal: 4 }, tags: ["保排", "增益"] },
  大猩猩: { tier: 1, image: "/pet_images/allies/gorilla.png", baseStats: { atk: 3, hp: 3 }, special: { roundFrontAtk: 3 }, tags: ["增益", "保排"] },
  兔子: { tier: 1, image: "/pet_images/allies/rabbit.png", baseStats: { atk: 5, hp: 15 }, special: { roundSelfAtk: 2, roundSelfHp: 1 }, tags: ["成長", "主C"] },
  熊: { tier: 1, image: "/pet_images/allies/bear.png", baseStats: { atk: 6, hp: 150 }, special: { roundStartSelfDamage: 15 }, tags: ["坦克"] },
  跳蛛: { tier: 1, image: "/pet_images/allies/jumping_spider.png", baseStats: { atk: 3, hp: 3 }, special: { openingLowestHpDamage: 20 }, tags: ["刺客", "主C"] },
  螳螂: { tier: 1, image: "/pet_images/allies/mantis.png", baseStats: { atk: 27, hp: 9 }, special: { attackBackline: true }, tags: ["刺客", "主C"] },
  狗: { tier: 1, image: "/pet_images/allies/dog.png", baseStats: { atk: 11, hp: 46 }, tags: ["坦克"] },
  貓: { tier: 1, image: "/pet_images/allies/cat.png", baseStats: { atk: 33, hp: 10 }, tags: ["主C"] },
};

/** 抽卡補正需要沿用角色在 PET_DEFINITIONS 中的原始定義順序。 */
export const PET_DEFINITION_ORDER = Object.freeze(Object.keys(PET_DEFINITIONS));
export { ONCE_PER_GAME_PET_NAMES } from "./gameConfig";
const definedOncePerGameNames = Object.entries(PET_DEFINITIONS)
  .filter(([, pet]) => pet.special?.oncePerGame)
  .map(([name]) => name);
if (JSON.stringify(definedOncePerGameNames) !== JSON.stringify(ONCE_PER_GAME_PET_NAMES)) {
  throw new Error("gameConfig.oncePerGamePetNames 必須與角色 oncePerGame 設定一致");
}

export const PLAYER_LEVEL_GROWTH = 1.20;
export const ENEMY_LEVEL_GROWTH = 1.10;

export function getLevelMultiplier(level, growth = PLAYER_LEVEL_GROWTH) {
  return Math.pow(growth, Math.max(0, Number(level ?? 1) - 1));
}

export function getArmorCap(level) {
  return Math.max(0, Math.floor(7 * getLevelMultiplier(level, PLAYER_LEVEL_GROWTH)));
}

export function getEnemyLevelMultiplier(level) {
  return getLevelMultiplier(level, ENEMY_LEVEL_GROWTH);
}

export const PET_POOL = Object.entries(PET_DEFINITIONS).reduce((pool, [name, pet]) => {
  pool[pet.tier] ??= [];
  pool[pet.tier].push({
    name,
    image: pet.image,
    drawFromRound: Number(pet.drawFromRound) || 1,
    baseStats: pet.baseStats,
    pierce: Boolean(pet.pierce),
    special: pet.special ?? {},
    tags: getCharacterTags(pet),
  });
  return pool;
}, {});

export const ENEMY_DEFINITIONS = {
  // 大致依單體威脅由低到高排列；關卡實際難度由敵方陣容決定。
  bombard_martyr: { name: "鸚鵡", image: "/pet_images/enemies/parrot.png", atk: 5, hp: 5, special: { deathEnemyAllDamage: 12 } },
  rage_atk_aide: { name: "猴子", image: "/pet_images/enemies/monkey.png", atk: 3, hp: 7, special: { roundFrontmostAtk: 5 } },
  swarm_squirrel: { name: "松鼠", image: "/pet_images/enemies/squirrel.png", atk: 3, hp: 12, special: { roundFrontAtk: 6 } },
  swarm_piranha: { name: "食人魚", image: "/pet_images/enemies/piranha.png", atk: 8, hp: 18 },
  rage_hp_aide: { name: "水獺", image: "/pet_images/enemies/otter.png", atk: 3, hp: 13, special: { roundFrontmostHeal: 8 } },
  swarm_raccoon: { name: "浣熊", image: "/pet_images/enemies/raccoon.png", atk: 5, hp: 10, special: { roundLowestEnemyDamage: 3 } },
  bombard_pulser: { name: "綿羊", image: "/pet_images/enemies/sheep.png", atk: 3, hp: 10, special: { openingTeamArmor: 3 } },
  high_priest: { name: "企鵝", image: "/pet_images/enemies/penguin.png", atk: 2, hp: 12, special: { roundTeamHeal: 9 } },
  life_chanter: { name: "海豹", image: "/pet_images/enemies/seal.png", atk: 1, hp: 1 },
  storm_archer: { name: "野馬", image: "/pet_images/enemies/horse.png", atk: 5, hp: 35, special: { attackAll: true } },
  bombard_opener: { name: "駱駝", image: "/pet_images/enemies/camel.png", atk: 6, hp: 6, special: { openingEnemyAllDamage: 5 } },
  twin_serpent: { name: "鱷魚", image: "/pet_images/enemies/crocodile.png", atk: 6, hp: 30, special: { tripleStrikeDamage: 6, tripleStrikeHitCount: 2 } },
  swarm_boar: { name: "野豬", image: "/pet_images/enemies/pig.png", atk: 7, hp: 20, special: { gainAtkWhenDamaged: 4 } },
  burrow_raider: { name: "土豚", image: "/pet_images/enemies/aardvark.png", atk: 18, hp: 40, special: { roundEnemyAllDamage: 3, attackAll: true } },
  forest_deer: { name: "梅花鹿", image: "/pet_images/enemies/deer.png", atk: 5, hp: 50, special: { roundTenEnemyAllDamage: 30 } },
  sleepy_healer: { name: "無尾熊", image: "/pet_images/enemies/koala.png", atk: 7, hp: 29, special: { roundSelfHeal: 10 } },
  holy_beast: { name: "羚羊", image: "/pet_images/enemies/antelope.png", atk: 6, hp: 38, special: { roundSelfHp: 6 } },
  swarm_fox: { name: "赤狐", image: "/pet_images/enemies/fox.png", atk: 12, hp: 20, special: { attackBackline: true } },
  shadow_assassin: { name: "青蛙", image: "/pet_images/enemies/frog.png", atk: 4, hp: 50, special: { openingEnemyAllDamage: 30, openingEnemyAllHitCount: 1, dodge: true } },
  sweep_brute: { name: "鬣狗", image: "/pet_images/enemies/hyena.png", atk: 5, hp: 13, special: { gainAtkOnAnyDeath: 4, gainHpOnAnyDeath: 7 } },
  mirage_lord: { name: "山羊", image: "/pet_images/enemies/goat.png", atk: 11, hp: 48, special: { dodge: true } },
  forest_tyrant: { name: "獅子", image: "/pet_images/enemies/lion.png", atk: 10, hp: 60 },
  attack_sealer: { name: "電鰻", image: "/pet_images/enemies/electric_eel.png", atk: 5, hp: 36, special: { roundEnemyFrontAtkSet: 4 } },
  abyss_guard: { name: "鯨魚", image: "/pet_images/enemies/whale.png", atk: 8, hp: 58, special: { redirectBehindDamage: true } },
  royal_assassin: { name: "灰狼", image: "/pet_images/enemies/wolf.png", atk: 16, hp: 24, special: { attackBackline: true, dodge: true } },
  iron_fortress: { name: "海龜", image: "/pet_images/enemies/sea_turtle.png", atk: 5, hp: 50, battleArmor: 12, pierce: true },
  rage_champion: { name: "花豹", image: "/pet_images/enemies/leopard.png", atk: 2, hp: 45, special: { roundSelfAtk: 5, doubleStrike: true } },
  retribution_guard: { name: "海象", image: "/pet_images/enemies/walrus.png", atk: 3, hp: 70, special: { reflectBasicAttackDamage: true } },
  shell_guard: { name: "陸龜", image: "/pet_images/enemies/tortoise.png", atk: 7, hp: 40, special: { openingSelfArmor: 30 } },
  bamboo_guard: { name: "熊貓", image: "/pet_images/enemies/panda.png", atk: 3, hp: 52, special: { teamIncomingDamageMultiplier: 0.5 } },
  glass_cannon_king: { name: "老虎", image: "/pet_images/enemies/tiger.png", atk: 36, hp: 40 },
  endless_colossus: { name: "水豚", image: "/pet_images/enemies/capybara.png", atk: 5, hp: 5, special: { roundLowestEnemyDamage: 5 } },
  tutorial_guard: { name: "斑馬", image: "/pet_images/enemies/zebra.png", atk: 20, hp: 200 },

  // 正式關自訂角色改用正式關未出場的既有敵方動物與圖片；母雞／雞蛋保留在關卡內定義。
  worker_living_enemy_power: { name: "奶龍", image: "/pet_images/enemies/milk_dragon.png", atk: 6, hp: 30, livingEnemyAtkBase: 0, special: { livingEnemyAtkPerUnit: 6, livingEnemyHpPerUnit: 30 } },
  worker_living_enemy_guard: { name: "小蜜蜂", image: "/pet_images/enemies/little_bee.png", atk: 5, hp: 40, special: {} },
  worker_survival_splitter: { name: "芒果", image: "/pet_images/enemies/mango.png", atk: 20, hp: 20, special: { deathSplitMaxGenerations: 3 } },
};

validateSpecialDefinitions(PET_DEFINITIONS, "我方角色");
validateSpecialDefinitions(ENEMY_DEFINITIONS, "敵方角色");

/** Demo 專用關卡；以白板或單純面板敵人為主，避免重播正式關卡的特殊機制。 */
export const DEMO_ENEMY_ENCOUNTERS = [
  { name: "獨虎擂台", description: "一隻老虎正面迎戰整隊，先檢查隊伍的基本輸出與續戰力。", enemyIds: ["glass_cannon_king"] },
  { name: "鸚鵡爆竹", description: "鸚鵡倒下時留下爆炸餘波，綿羊則替整隊披上薄甲；集中火力也要計算代價。", enemyIds: ["bombard_martyr", "bombard_pulser"] },
  { name: "浣熊撿漏", description: "浣熊追擊最低生命角色，老虎守在前方等待收尾，治療順序比純輸出更重要。", enemyIds: ["swarm_raccoon", "glass_cannon_king", "swarm_raccoon"] },
  { name: "水獺溪谷", description: "兩側食人魚壓迫前線，水獺持續把生命拉回來；先斷治療還是先清魚潮各有解法。", enemyIds: ["swarm_piranha", "rage_hp_aide", "swarm_piranha", "swarm_squirrel"] },
  { name: "五路動物園", description: "五個方向同時施壓：魚潮、浣熊、赤狐、豬與鸚鵡，考驗隊伍能否兼顧後排與死亡連鎖。", enemyIds: ["swarm_piranha", "swarm_raccoon", "swarm_fox", "swarm_boar", "bombard_martyr"] },
  { name: "豹影雙擊", description: "花豹逐回合變強並連續攻擊，兩隻食人魚迫使隊伍在速攻與拖延間做選擇。", enemyIds: ["swarm_piranha", "rage_champion", "swarm_piranha"] },
  { name: "狐狸穿線", description: "赤狐直取後排，前方松鼠把增益接力傳遞；前後排都不能完全放著不管。", enemyIds: ["swarm_fox", "swarm_squirrel"] },
  { name: "海象收費站", description: "海象反射普通攻擊，浣熊則持續削弱最低生命角色；每一下攻擊都要先看回彈風險。", enemyIds: ["swarm_raccoon", "retribution_guard", "swarm_raccoon", "swarm_squirrel"] },
  { name: "斑馬魚潮", description: "高生命斑馬吸收火力，兩側魚潮逼迫隊伍不能無限拖延。", enemyIds: ["swarm_piranha", "tutorial_guard", "swarm_piranha", "swarm_piranha"] },
  { name: "松鼠接力賽", description: "四隻松鼠把攻擊增益逐步推向前線，範圍傷害與集中擊殺都有價值。", enemyIds: ["swarm_squirrel", "swarm_squirrel", "swarm_squirrel", "swarm_squirrel"] },
  { name: "幻羊魚港", description: "山羊靠閃避拖時間，食人魚則讓玩家不能只等待命中；穩定輸出比單次爆發可靠。", enemyIds: ["swarm_piranha", "mirage_lord", "swarm_piranha", "swarm_squirrel", "swarm_piranha"] },
  { name: "雙虎追逐", description: "兩隻高攻老虎把站位與前排生命拉到極限，沒有特殊機制卻極度直接。", enemyIds: ["glass_cannon_king", "swarm_piranha"] },
  { name: "熊貓避風港", description: "熊貓替全隊減傷，野馬從後排施加範圍壓力；先拆保護還是先拆火力由玩家決定。", enemyIds: ["storm_archer", "bamboo_guard", "bombard_opener"] },
  { name: "終局動物園", description: "老虎、花豹、浣熊與斑馬各自製造不同威脅，作為 Demo 的綜合收尾。", enemyIds: ["swarm_raccoon", "rage_champion", "glass_cannon_king", "tutorial_guard", "swarm_fox"] },
];

export const FORMAL_ENEMY_ENCOUNTERS = [
  { name: "獅王基準", description: "沒有特殊效果的單體首領，檢查隊伍基本攻防。", enemyIds: ["forest_tyrant"] },
  { name: "泉庭誘餌", description: "低生命誘餌保護治療核心，自癒前排拖長戰線。", enemyIds: ["life_chanter", "high_priest", "sleepy_healer"] },
  { name: "薄甲連牙", description: "全隊薄甲掩護前排三連擊，讓穿透與多段承傷各有價值。", enemyIds: ["bombard_pulser", "twin_serpent"] },
  { name: "白鐵倒數", description: "厚甲穿透前排拖延時間，後排在第十回合引爆全場。", enemyIds: ["forest_deer", "iron_fortress"] },
  { name: "爆羽火線", description: "開場傷害接上死亡爆破，逼迫隊伍處理傷害時序。", enemyIds: ["bombard_opener", "bombard_martyr", "swarm_boar"] },
  { name: "竹林風眼", description: "範圍攻擊藏在減傷守衛身後，必須突破保護或直取後排。", enemyIds: ["storm_archer", "bamboo_guard"] },
  { name: "深海替身", description: "後排刺客與最低生命追擊者，獅子以高攻擊力施壓。", enemyIds: ["endless_colossus", "royal_assassin", "forest_tyrant"] },
  { name: "封攻長城", description: "電鰻封鎖前排攻擊，陸龜以護甲拖延戰鬥。", enemyIds: ["attack_sealer", "shell_guard"] },
  { name: "霧沼三震", description: "開戰三段全體傷害後進入奇數回合閃避節奏。", enemyIds: ["shadow_assassin"] },
  { name: "存活威壓", description: "猴子與水獺依序排列；猴子攻擊力與生命上限為 6 × 我方目前存活角色數，水獺為 5/40 白板。", enemyIds: ["worker_living_enemy_power", "worker_living_enemy_guard"] },
  { name: "誘餌獵場", description: "後排治療核心、高攻中衛與低生命前衛組成多線壓力；跳蛛、獨角仙與蜜獾各有發揮空間，但一般輸出也能通關。", enemyIds: ["sleepy_healer", "swarm_piranha", "endless_colossus"] },
  { name: "孵蛋母雞", description: "母雞持續在前方孵化雞蛋，考驗清場速度與前線壓力控制。", enemies: [{ id: "worker_summoning_hen", name: "母雞", image: "/pet_images/enemies/hen.png", atk: 12, hp: 40, special: { roundFrontSummonEvery: 2, roundFrontSummonName: "雞蛋", roundFrontSummonImage: "/pet_images/enemies/egg.png", roundFrontSummonAtk: 4, roundFrontSummonHp: 3 } }] },
  { name: "死亡分裂", description: "羚羊死亡時分裂成兩個較弱個體，考驗範圍傷害與持續作戰。", enemyIds: ["worker_survival_splitter"] },
  { name: "駝羽風暴", description: "開場轟炸、死亡爆破與範圍普攻形成三種不同傷害波段。", enemyIds: ["storm_archer", "bombard_opener", "bombard_martyr"] },
];

export function getEnemyDefinition(id) {
  return ENEMY_DEFINITIONS[id] ?? null;
}
