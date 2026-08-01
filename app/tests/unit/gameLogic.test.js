import { describe, expect, it } from "vitest";
import {
  buildNewPet,
  getPetCompendiumList,
  getPetLevelStats,
  getPetQualityLabel,
  getPetSpecialEffectText,
} from "../../lib/petCatalog";
import {
  compactTeamToRight,
  selectRandomTeam,
  syncTeamWithCollection,
} from "../../lib/lineupLogic";
import {
  advanceDeploymentStates,
  applyDrawsToCollection,
  buildInitialRoundCollection,
  drawPetCards,
} from "../../features/solo/soloProgression";
import { simulateBattle } from "../../lib/battleLogic";
import { DUO_CHALLENGE_TEAM_SIZE, getRoundChallenges, getTutorialChallenge, SINGLE_CHALLENGE_TEAM_SIZE, SOLO_ENCOUNTERS, SOLO_MAX_BOSS_LEVEL, SOLO_TURN_LIMIT, TUTORIAL_POOL_NAMES, TUTORIAL_RECOMMENDED_TEAM } from "../../lib/soloConfig";
import { buildChallengeEncounterTeam, buildEncounterTeam, buildRoundScore, calculateSoloScore } from "../../lib/soloLogic";
import { DRAW_CARDS, INITIAL_ROUND_POOL_NAMES, MAX_BOSS_LEVEL } from "../../lib/gameConfig";
import { canDrawPetAtRound } from "../../lib/cardDrawLogic";
import { getMultiplayerRoundChallenges, setFormalEncounterCatalog } from "../../lib/challengeConfig";
import { DEMO_ENEMY_ENCOUNTERS, ENEMY_DEFINITIONS } from "../../lib/characterConfig";
import { ADDITIVE_EFFECT_KEYS } from "../../lib/effectRegistry";
import { WORKER_ONLY_TEST_CHALLENGES } from "../../lib/workerTestConfig";
import { buildEncounterTeamFromConfig } from "../../lib/encounterLogic";
import { FORMAL_ENCOUNTER_SEED } from "../../../scripts/formalEncounterSeed.mjs";

setFormalEncounterCatalog(FORMAL_ENCOUNTER_SEED);

const unit = (name, atk, hp, special = {}, extra = {}) => ({
  name, atk, hp, special, level: 1, image: "", ...extra,
});

const getFormalEncounter = (name) => FORMAL_ENCOUNTER_SEED.find((encounter) => encounter.name === name);
const buildEncounterTeamByName = (name, level = 1) => buildEncounterTeamFromConfig(getFormalEncounter(name), level);

describe("新角色池", () => {
  it("角色池為 15 普通、6 稀有、4 史詩", () => {
    const cards = getPetCompendiumList();
    expect(cards).toHaveLength(30);
    expect(cards.filter((pet) => pet.tier === 4)).toHaveLength(5);
    expect(cards.filter((pet) => pet.tier === 3)).toHaveLength(4);
    expect(cards.filter((pet) => pet.tier === 2)).toHaveLength(6);
    expect(cards.filter((pet) => pet.tier === 1)).toHaveLength(15);
    expect(cards.filter((pet) => pet.tier === 3).map((pet) => pet.name)).toEqual(["橘子", "鯉魚王", "巨嘴鳥", "蜜獾"]);
    expect(cards.filter((pet) => pet.tier === 2).map((pet) => pet.name)).toEqual(["豪豬", "犰狳", "魟魚", "犀牛", "禿鷹", "獨角仙"]);
    expect(cards.map((pet) => pet.name)).not.toContain("狒狒");
    expect(cards.map((pet) => pet.name)).toEqual(expect.arrayContaining(["橘子", "渡鴉", "禿鷹", "熊"]));
    expect(cards.map((pet) => pet.name)).not.toEqual(expect.arrayContaining(["隨機護甲師", "鼓舞樂師"]));
    expect(cards.map((pet) => pet.name)).not.toEqual(expect.arrayContaining(["計數炸彈", "蚊子", "不屈石像"]));
  });

  it("抽卡可重現、重複抽取會升級", () => {
    expect(drawPetCards(1, 20, 1, 123).map((pet) => pet.name)).toEqual(drawPetCards(1, 20, 1, 123).map((pet) => pet.name));
    const card = buildNewPet({ name: "狗" });
    expect(applyDrawsToCollection([], [card, card])[0].level).toBe(2);
    expect(getPetLevelStats("狗", 1, 1)).toEqual({ atk: 11, hp: 46 });
    expect([1, 2, 3, 4].map(getPetQualityLabel)).toEqual(["普通", "稀有", "史詩", "傳奇"]);
  });

  it("新手限制角色到第 4 回合才進入單人與多人共用抽卡池", () => {
    const cards = getPetCompendiumList();
    const restrictedNames = cards.filter((pet) => pet.drawFromRound === 4).map((pet) => pet.name);
    expect(restrictedNames.length).toBeGreaterThan(0);
    expect(cards.filter((pet) => restrictedNames.includes(pet.name)).every((pet) => !canDrawPetAtRound(pet, 3))).toBe(true);
    expect(cards.filter((pet) => restrictedNames.includes(pet.name)).every((pet) => canDrawPetAtRound(pet, 4))).toBe(true);
    expect(drawPetCards(1, 10_000, 1, 2468).some((pet) => restrictedNames.includes(pet.name))).toBe(false);
    const roundFourNames = new Set(drawPetCards(4, 10_000, 1, 2468).map((pet) => pet.name));
    expect(restrictedNames.every((name) => roundFourNames.has(name))).toBe(true);
  });

  it("抽卡若讓已解鎖角色等級差達到 5，改升定義順序最前的最低等角色", () => {
    const collection = [
      buildNewPet({ name: "長頸鹿" }, 1),
      buildNewPet({ name: "橘子" }, 1),
      buildNewPet({ name: "鯉魚王" }, 5),
    ];
    const result = applyDrawsToCollection(collection, [buildNewPet({ name: "鯉魚王" }, 1)]);
    const levels = Object.fromEntries(result.map((pet) => [pet.name, pet.level]));
    expect(levels).toMatchObject({ 橘子: 2, 長頸鹿: 1, 鯉魚王: 5 });
  });

  it("新解鎖角色造成等級差達到 5 時，會先解鎖再接受最低等補正", () => {
    const collection = [buildNewPet({ name: "鯉魚王" }, 6)];
    const result = applyDrawsToCollection(collection, [buildNewPet({ name: "長頸鹿" }, 1)]);
    const levels = Object.fromEntries(result.map((pet) => [pet.name, pet.level]));
    expect(levels).toMatchObject({ 長頸鹿: 2, 鯉魚王: 6 });
  });

  it("每個回合固定抽 7 張", () => {
    expect(DRAW_CARDS).toBe(7);
  });

  it("正式第 1 回合使用固定 10 張初始角色池", () => {
    expect(buildInitialRoundCollection().map((pet) => pet.name)).toEqual(INITIAL_ROUND_POOL_NAMES);
    expect(buildInitialRoundCollection().every((pet) => pet.level === 1)).toBe(true);
  });

  it("隨機配置會從收藏選出指定數量並靠右填入隊伍", () => {
    const collection = [unit("甲", 1, 1), unit("乙", 1, 1), unit("丙", 1, 1)];
    const team = selectRandomTeam(collection, 5, () => 0);
    expect(team.slice(0, 2)).toEqual([null, null]);
    expect(team.filter(Boolean)).toHaveLength(3);
    expect(new Set(team.filter(Boolean).map((pet) => pet.name))).toEqual(new Set(["甲", "乙", "丙"]));
  });

  it("開戰前會把有空格的隊伍靠右壓縮，避免視覺站位與戰鬥站位不一致", () => {
    const back = unit("後排", 1, 10);
    const front = unit("前排", 1, 10);
    expect(compactTeamToRight([back, front, null, null, null], 5).map((pet) => pet?.name ?? null)).toEqual([
      null,
      null,
      null,
      "後排",
      "前排",
    ]);
  });

  it("角色圖鑑與角色實例包含可搜尋的功能標籤", () => {
    const cards = getPetCompendiumList();
    expect(cards.find((pet) => pet.name === "河馬").tags).toContain("增益");
    expect(cards.find((pet) => pet.name === "魟魚").tags).toContain("保排");
    expect(cards.find((pet) => pet.name === "巨嘴鳥").tags).toEqual(expect.arrayContaining(["主C", "範圍"]));
    expect(buildNewPet({ name: "渡鴉" }).tags).toContain("死亡");
  });

  it("我方角色攻防與固定加值技能每級乘 1.2，倍率技能不變", () => {
    expect(getPetLevelStats("狗", 1, 2)).toEqual({ atk: 13, hp: 55 });
    const leveled = buildNewPet({ name: "河馬" }, 5);
    expect(leveled.special.openingFrontStats).toBe(16);
    const chaos = buildNewPet({ name: "變色龍" }, 10);
    expect(chaos.special.frontSwapAtkHp).toBe(true);
    const emperor = buildNewPet({ name: "秦始皇" }, 1);
    expect(emperor).toMatchObject({ atk: 10, hp: 3, special: { fixedIncomingDamage: 1, cannotReceiveAllyHealing: true } });
    const missile = buildNewPet({ name: "鯊魚" }, 1);
    expect(missile).toMatchObject({ atk: 200, hp: 1, special: { oncePerGame: true } });
    expect(missile.special.openingHighestHpDamage).toBeUndefined();
  });

  it("玩家目前無法抽到傳奇角色", () => {
    const cards = getPetCompendiumList();
    const draws = drawPetCards(1, 10_000, 1, 9876);
    expect(draws.every((pet) => pet.tier < 4)).toBe(true);
    expect(new Set(draws.map((pet) => pet.name)).size).toBe(cards.filter((pet) => pet.tier < 4 && canDrawPetAtRound(pet, 1)).length);
    expect(new Set(drawPetCards(4, 10_000, 1, 9876).map((pet) => pet.name)).size).toBe(cards.filter((pet) => pet.tier < 4 && canDrawPetAtRound(pet, 4)).length);
  });

  it("指定卡片使用精簡後的效果文字", () => {
    expect(getPetSpecialEffectText("犀牛")).toBe("穿透：普通攻擊可無視護甲；攻擊具有護甲或閃避的敵人時：自身回復 5 生命");
    expect(getPetSpecialEffectText("橘子")).toBe("進入戰鬥時：展開成 4 個 1/1 無技能單位");
    expect(getPetSpecialEffectText("鯉魚王")).not.toContain("同一大回合內連打多個 Lv.");
    expect(getPetSpecialEffectText("秦始皇")).not.toContain("其他友方增益仍可正常生效");
  });

  it("所有目前角色技能都有文字，且固定數值與實際設定一致", () => {
    const allies = getPetCompendiumList();
    const enemies = Object.values(ENEMY_DEFINITIONS).map((enemy) => ({ ...enemy, level: 1 }));
    for (const character of [...allies, ...enemies]) {
      const entries = Object.entries(character.special ?? {});
      if (!entries.length && !character.pierce) continue;
      const text = getPetSpecialEffectText(character);
      expect(text, `${character.name} 應有技能文字`).toBeTruthy();
      for (const [key, value] of entries) {
        if (!ADDITIVE_EFFECT_KEYS.has(key) || typeof value !== "number") continue;
        expect(text, `${character.name}.${key} 應顯示數值 ${value}`).toContain(String(value));
      }
    }
    expect(getPetSpecialEffectText("熊")).toBe("每回合開始時：自身受到 15 傷害");
  });

  it("鯉魚王出戰兩個大遊戲回合後進化成暴鯉龍並更換圖片", () => {
    let collection = [buildNewPet({ name: "鯉魚王" })];
    collection = advanceDeploymentStates(collection, collection);
    expect(collection[0]).toMatchObject({ gameRoundsDeployed: 1, evolved: false, atk: 0, hp: 8, image: "/pet_images/allies/magikarp.png" });
    collection = advanceDeploymentStates(collection, []);
    expect(collection[0]).toMatchObject({ gameRoundsDeployed: 1, evolved: false });
    collection = advanceDeploymentStates(collection, collection);
    expect(collection[0]).toMatchObject({ gameRoundsDeployed: 2, evolved: true, displayName: "暴鯉龍", atk: 25, hp: 35, image: "/pet_images/allies/gyarados.png" });
    expect(getPetSpecialEffectText("鯉魚王")).toBe("在隊伍中完整出戰 2 個大遊戲回合後：永久進化成暴鯉龍，攻擊/生命變為 25/35");
    expect(getPetSpecialEffectText(buildNewPet({ name: "鯉魚王" }, 2))).toContain("攻擊/生命變為 30/42");
  });

  it("鯊魚整場遊戲只能進場一次", () => {
    const missile = buildNewPet({ name: "鯊魚", deployments: 1 });
    const result = simulateBattle([missile], [unit("敵人", 0, 500)]);
    expect(result.leftRemaining).toBe(0);
    expect(result.battleFrames).toHaveLength(1);
  });

  it("變色龍整場遊戲只能出戰一次", () => {
    const chameleon = buildNewPet({ name: "變色龍" });
    expect(chameleon.special).toMatchObject({ frontSwapAtkHp: true, oncePerGame: true });
    expect(advanceDeploymentStates([chameleon], [chameleon])).toEqual([]);

    const multiplayerChameleon = buildNewPet({ name: "變色龍", gameRoundsDeployed: 1 });
    expect(multiplayerChameleon.deployments).toBe(1);
    expect(simulateBattle([multiplayerChameleon], [unit("敵人", 0, 10)]).leftRemaining).toBe(0);
  });

  it("秦始皇每次只受 1 點傷害，且無法接受友軍治療", () => {
    const emperor = buildNewPet({ name: "秦始皇" });
    const healer = unit("治療者", 0, 10, { roundTeamHeal: 5 });
    const result = simulateBattle([healer, emperor], [unit("敵人", 99, 100)]);
    const evolvedEmperor = result.battleFrames[0].leftLineup.find((pet) => pet.name === "秦始皇");
    expect(evolvedEmperor.hp).toBe(2);
    expect(getPetSpecialEffectText("秦始皇")).toBe("受到傷害時：每次固定只失去 1 點生命；無法接受友方治療");
  });

  it("秦始皇不會受到長頸鹿的生命增加效果", () => {
    const giraffe = buildNewPet({ name: "長頸鹿" });
    const emperor = buildNewPet({ name: "秦始皇" });
    const result = simulateBattle([giraffe, emperor], [unit("敵人", 0, 100)]);
    const finalEmperor = result.battleFrames[0].leftLineup.find((pet) => pet.name === "秦始皇");
    expect(finalEmperor).toMatchObject({ hp: 3, maxHp: 3 });
    expect(result.battleFrames[0].events.some((event) => event.type === "round_ahead_hp" && event.target?.name === "秦始皇")).toBe(false);
  });

  it("鯊魚出場後從收藏與原隊伍位置刪除", () => {
    const missile = buildNewPet({ name: "鯊魚" });
    const collection = advanceDeploymentStates([missile], [missile]);
    expect(collection).toEqual([]);
    expect(syncTeamWithCollection([null, missile], collection)).toEqual([null, null]);
  });
});

describe("戰鬥效果", () => {
  it("隼讓後方角色騎乘，騎乘者獲得閃避且戰場少一名角色", () => {
    const result = simulateBattle(
      [unit("騎乘者", 0, 100), buildNewPet({ name: "隼" })],
      [unit("敵人", 5, 100)]
    );
    expect(result.battleFrames[0].leftLineupBefore).toHaveLength(1);
    expect(result.battleFrames[0].leftLineupBefore.at(-1)).toMatchObject({
      name: "騎乘者", dodge: true, mountName: "隼", mountImage: "/pet_images/allies/falcon.png",
    });
    expect(result.battleFrames[0].leftLineup.at(-1).hp).toBe(100);
    expect(result.battleFrames[1].leftLineup.at(-1).hp).toBe(95);
    expect(getPetSpecialEffectText("隼")).toContain("騎乘者保留原本面板與技能，並獲得閃避");
  });

  it("秦始皇每次受到的傷害固定為 1", () => {
    const result = simulateBattle([unit("攻擊者", 99, 20)], [buildNewPet({ name: "秦始皇" })]);
    expect(result.battleFrames[0].rightLineup[0].hp).toBe(2);
  });

  it("二連擊會對秦始皇造成兩次獨立傷害", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "秦始皇" })],
      [unit("二連擊敵人", 20, 100, { doubleStrike: true }, { isEnemy: true })]
    );
    expect(result.battleFrames[0].leftLineup[0].hp).toBe(1);
    expect(result.battleFrames[0].events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "main_strike", damageApplied: 1 }),
      expect.objectContaining({ type: "double_strike", damageApplied: 1 }),
    ]));
  });

  it("豪豬每回合獲得一點護甲，且每點護甲使攻擊增加一點", () => {
    const result = simulateBattle([unit("攻擊者", 2, 20)], [buildNewPet({ name: "豪豬" })]);
    expect(result.battleFrames[0].rightLineup[0]).toMatchObject({ atk: 7, hp: 14, battleArmor: 1 });
    expect(result.battleFrames[0].leftLineup[0].hp).toBe(13);
  });

  it("穿山甲每回合使自己和前方一格各獲得一點護甲", () => {
    const result = simulateBattle(
      [unit("後方", 0, 20), buildNewPet({ name: "穿山甲" }), unit("前方", 0, 20)],
      [unit("敵人", 0, 100)]
    );
    expect(result.battleFrames[0].leftLineup.map((pet) => pet.battleArmor)).toEqual([0, 1, 1]);
    expect(getPetSpecialEffectText("穿山甲")).toBe("每回合開始時：自身和前方一格友方各獲得 1 護甲");
  });

  it("犰狳使友方每獲得一點護甲就增加三點生命", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "犰狳" }), unit("護甲來源", 5, 5, { roundShieldAllAhead: 1 }), unit("前排", 1, 20)],
      [unit("敵人", 0, 100)]
    );
    expect(result.battleFrames[0].leftLineup.at(-1)).toMatchObject({ atk: 1, hp: 24, battleArmor: 1 });
  });

  it("秦始皇不會受到犰狳護甲轉換的生命增加", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "犰狳" }), unit("護甲來源", 5, 5, { roundShieldAllAhead: 1 }), buildNewPet({ name: "秦始皇" })],
      [unit("敵人", 0, 100)]
    );
    const emperor = result.battleFrames[0].leftLineup.at(-1);

    expect(emperor).toMatchObject({ hp: 3, maxHp: 3, battleArmor: 1 });
    expect(result.battleFrames[0].events.some((event) => event.type === "round_ahead_shield" && event.target?.name === "秦始皇" && event.hpDelta > 0)).toBe(false);
  });

  it("角色護甲上限為⌊7 × 1.2^(等級-1)⌋，超出的護甲不會觸發增益", () => {
    const result = simulateBattle(
      [unit("大量護甲來源", 0, 20, { roundFrontArmor: 20 }), buildNewPet({ name: "豪豬" })],
      [unit("敵人", 0, 100)]
    );
    expect(result.battleFrames[0].leftLineup.at(-1)).toMatchObject({ battleArmor: 7, atk: 19 });
  });

  it("烏龜開戰時獲得七點護甲", () => {
    const result = simulateBattle([buildNewPet({ name: "烏龜" })], [unit("敵人", 0, 100)]);
    expect(result.battleFrames[0].leftLineup[0]).toMatchObject({ atk: 5, hp: 25, battleArmor: 6 });
  });

  it("變色龍交換敵方前排的攻擊與生命", () => {
    const result = simulateBattle([buildNewPet({ name: "變色龍" })], [unit("目標", 3, 8)]);
    expect(result.battleFrames[0].rightLineupBefore[0]).toMatchObject({ atk: 8, hp: 3 });
  });

  it("貓頭鷹交換敵方最前排與最後排", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "貓頭鷹" })],
      [unit("最後排", 0, 20), unit("中排", 0, 20), unit("最前排", 0, 20)]
    );
    expect(result.battleDetail.opening.rightLineupBeforeOpen.map((pet) => pet.name)).toEqual(["最後排", "中排", "最前排"]);
    expect(result.battleFrames[0].rightLineupBefore.map((pet) => pet.name)).toEqual(["最前排", "中排", "最後排"]);
  });

  it("河馬在開戰時增加前方角色攻擊與生命", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "河馬" }), unit("前方", 2, 10)],
      [unit("敵人", 0, 100)]
    );
    expect(result.battleFrames[0].leftLineupBefore.at(-1)).toMatchObject({ atk: 10, hp: 18 });
  });

  it("河馬先播放攻擊增加，再播放生命增加", () => {
    const result = simulateBattle(
      [unit("河馬", 0, 10, { openingFrontStats: 8 }), unit("前方", 2, 10)],
      [unit("敵人", 0, 100)]
    );
    const hippoEvents = result.battleDetail.opening.events.filter(
      (event) => event.source?.name === "河馬" && ["opening_front_atk", "opening_front_hp"].includes(event.type)
    );

    expect(hippoEvents.map((event) => event.type)).toEqual(["opening_front_atk", "opening_front_hp"]);
    expect(hippoEvents[0]).toMatchObject({ atkDelta: 8 });
    expect(hippoEvents[0]).not.toHaveProperty("hpDelta");
    expect(hippoEvents[1]).toMatchObject({ hpDelta: 8 });
    expect(hippoEvents[1]).not.toHaveProperty("atkDelta");
  });

  it("破甲效果每回合削減敵方前排護甲", () => {
    const result = simulateBattle(
      [unit("破甲來源", 0, 20, { roundFrontArmorBreak: 5 })],
      [unit("裝甲目標", 0, 100, {}, { battleArmor: 12 })]
    );
    expect(result.battleFrames[0].rightLineup[0].battleArmor).toBe(2);
  });

  it("護甲降低傷害且至少受到 1 傷害，穿透忽略護甲與奇數回合閃避", () => {
    const normal = simulateBattle([unit("攻擊者", 12, 100)], [unit("目標", 0, 100, {}, { battleArmor: 5 })]);
    expect(normal.battleFrames[0].rightLineup[0]).toMatchObject({ hp: 93, battleArmor: 5 });
    const blocked = simulateBattle([unit("攻擊者", 5, 100)], [unit("目標", 0, 100, {}, { battleArmor: 10 })]);
    expect(blocked.battleFrames[0].rightLineup[0]).toMatchObject({ hp: 99, battleArmor: 7 });
    const pierce = simulateBattle([unit("攻擊者", 5, 100, {}, { pierce: true })], [unit("目標", 0, 100, {}, { battleArmor: 10 })]);
    expect(pierce.battleFrames[0].rightLineup[0]).toMatchObject({ hp: 95, battleArmor: 7 });
    const undodged = simulateBattle([unit("穿透者", 5, 100, {}, { pierce: true })], [unit("閃避者", 0, 100, { dodge: true })]);
    expect(undodged.battleFrames[0].rightLineup[0].hp).toBe(95);
    const dodged = simulateBattle([unit("攻擊者", 5, 100)], [unit("閃避者", 0, 100, { dodge: true })]);
    expect(dodged.battleFrames[0].rightLineup[0].hp).toBe(100);
  });

  it("犀牛攻擊帶護甲或閃避的敵人時只回復一次生命", () => {
    const armored = simulateBattle(
      [unit("犀牛", 5, 10, { attackArmoredOrDodgeHeal: 5 }, { pierce: true })],
      [unit("裝甲目標", 0, 100, {}, { battleArmor: 3 })]
    );
    expect(armored.battleFrames[0].leftLineup[0].hp).toBe(15);

    const armoredDodger = simulateBattle(
      [unit("犀牛", 5, 10, { attackArmoredOrDodgeHeal: 5 }, { pierce: true })],
      [unit("裝甲閃避目標", 0, 100, { dodge: true }, { battleArmor: 3 })]
    );
    expect(armoredDodger.battleFrames[0].leftLineup[0].hp).toBe(15);

    const plain = simulateBattle(
      [unit("犀牛", 5, 10, { attackArmoredOrDodgeHeal: 5 }, { pierce: true })],
      [unit("普通目標", 0, 100)]
    );
    expect(plain.battleFrames[0].leftLineup[0].hp).toBe(10);
  });

  it("犀牛擊殺帶護甲或閃避的敵人時仍會回復生命", () => {
    const armoredKill = simulateBattle(
      [unit("犀牛", 5, 10, { attackArmoredOrDodgeHeal: 5 }, { pierce: true })],
      [unit("低血裝甲目標", 0, 5, {}, { battleArmor: 3 })]
    );
    expect(armoredKill.battleFrames[0].leftLineup[0].hp).toBe(15);
    expect(armoredKill.battleFrames[0].events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "attack_armored_or_dodge_heal", heal: 5 }),
    ]));

    const dodgeKill = simulateBattle(
      [unit("犀牛", 5, 10, { attackArmoredOrDodgeHeal: 5 }, { pierce: true })],
      [unit("低血閃避目標", 0, 5, { dodge: true })]
    );
    expect(dodgeKill.battleFrames[0].leftLineup[0].hp).toBe(15);
    expect(dodgeKill.battleFrames[0].events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "attack_armored_or_dodge_heal", heal: 5 }),
    ]));
  });

  it("犀牛攻擊後若被同回合普通攻擊打死，不回血也不產生回血動畫事件", () => {
    const result = simulateBattle(
      [unit("犀牛", 5, 5, { attackArmoredOrDodgeHeal: 5 }, { pierce: true })],
      [unit("裝甲反擊者", 5, 100, {}, { battleArmor: 3 })]
    );

    expect(result.battleFrames[0].leftDefeated).toBe(true);
    expect(result.battleFrames[0].events.some((event) => event.type === "attack_armored_or_dodge_heal")).toBe(false);
  });

  it("存活犀牛的受擊血量先下降，之後才由獨立事件回血", () => {
    const result = simulateBattle(
      [unit("犀牛", 5, 10, { attackArmoredOrDodgeHeal: 5 }, { pierce: true })],
      [unit("裝甲反擊者", 4, 100, {}, { battleArmor: 3 })]
    );
    const events = result.battleFrames[0].events;
    const receivedDamageIndex = events.findIndex((event) => event.type === "main_strike" && event.target?.name === "犀牛");
    const healIndex = events.findIndex((event) => event.type === "attack_armored_or_dodge_heal");

    expect(events[receivedDamageIndex]).toMatchObject({ targetHpBefore: 10, targetHpAfter: 6 });
    expect(events[healIndex]).toMatchObject({ heal: 5, targetHpAfter: 11 });
    expect(receivedDamageIndex).toBeLessThan(healIndex);
  });

  it("非普通攻擊直接擊殺時仍記錄受傷數值、受擊動畫與死亡動畫", () => {
    const result = simulateBattle(
      [unit("技能攻擊者", 0, 100, { openingLowestHpDamage: 20 })],
      [unit("低血目標", 0, 7)]
    );
    const lethal = result.battleDetail.opening.events.find(
      (event) => event.type === "opening_lowest_damage" && event.damageApplied != null
    );

    expect(lethal).toMatchObject({
      effectiveDamageToHp: 7,
      targetHpBefore: 7,
      targetHpAfter: 0,
      animation: {
        damages: [expect.objectContaining({ amount: 20, hpBefore: 7, hpAfter: 0 })],
        deaths: [expect.objectContaining({ amount: 20, hpBefore: 7, hpAfter: 0 })],
      },
    });
  });

  it("奇數回合閃避可抵銷穿透以外的普通、範圍、回合與死亡效果傷害", () => {
    const dodgeTarget = () => unit("閃避者", 0, 100, { dodge: true });

    const normal = simulateBattle([unit("普通攻擊者", 20, 100)], [dodgeTarget()]);
    expect(normal.battleFrames[0].rightLineup[0].hp).toBe(100);

    const range = simulateBattle([unit("範圍攻擊者", 20, 100, { attackAll: true })], [dodgeTarget()]);
    expect(range.battleFrames[0].rightLineup[0].hp).toBe(100);

    const roundEffect = simulateBattle(
      [unit("回合效果攻擊者", 0, 100, { roundLowestEnemyDamage: 20 })],
      [dodgeTarget()]
    );
    expect(roundEffect.battleFrames[0].rightLineup[0].hp).toBe(100);

    const deathEffect = simulateBattle(
      [unit("閃避攻擊者", 20, 100, { dodge: true })],
      [unit("死亡爆炸者", 0, 1, { deathEnemyAllDamage: 30 }, { isEnemy: true })]
    );
    expect(deathEffect.battleFrames[0].leftLineup[0].hp).toBe(100);

    const piercingEffect = simulateBattle(
      [unit("穿透效果攻擊者", 0, 100, { roundLowestEnemyDamage: 20 }, { pierce: true })],
      [dodgeTarget()]
    );
    expect(piercingEffect.battleFrames[0].rightLineup[0].hp).toBe(80);

    const openingEffect = simulateBattle(
      [unit("開戰效果攻擊者", 0, 100, { openingEnemyAllDamage: 20 })],
      [dodgeTarget()]
    );
    expect(openingEffect.battleFrames[0].rightLineup[0].hp).toBe(100);
    expect(openingEffect.battleDetail.opening.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "dodge", target: expect.objectContaining({ name: "閃避者" }) }),
    ]));
  });

  it("護甲也能降低效果傷害，只有帶穿透的傷害來源能無視護甲", () => {
    const protectedResult = simulateBattle(
      [unit("效果來源", 0, 100, { openingEnemyAllDamage: 10 })],
      [unit("護甲目標", 0, 100, {}, { battleArmor: 7 })]
    );
    expect(protectedResult.battleFrames[0].rightLineup[0].hp).toBe(97);

    const piercedResult = simulateBattle(
      [unit("穿透效果來源", 0, 100, { openingEnemyAllDamage: 10 }, { pierce: true })],
      [unit("護甲目標", 0, 100, {}, { battleArmor: 7 })]
    );
    expect(piercedResult.battleFrames[0].rightLineup[0].hp).toBe(90);
  });

  it("青蛙開戰時對全體造成一次三十點傷害並具有閃避", () => {
    const result = simulateBattle(
      [unit("青蛙", 0, 100, { openingEnemyAllDamage: 30, openingEnemyAllHitCount: 1, dodge: true })],
      [unit("無護甲", 0, 100), unit("有護甲", 0, 100, {}, { battleArmor: 5 })]
    );
    expect(result.battleFrames[0].rightLineup.map((pet) => pet.hp)).toEqual([70, 75]);
    const hits = result.battleDetail.opening.events.filter((event) => event.type === "opening_enemy_all_damage");
    expect(hits).toHaveLength(2);
    expect([...new Set(hits.map((event) => event.effectHit))]).toEqual([1]);
    expect(hits.every((event) => event.effectHitCount === 1)).toBe(true);
  });

  it("魟魚存活時使自身後方所有友方受到的傷害變為 50%，且不必位於最前排", () => {
    const result = simulateBattle(
      [unit("全體攻擊者", 10, 100, { attackAllDamage: 10 })],
      [unit("後排", 0, 20), buildNewPet({ name: "魟魚" })]
    );
    expect(result.battleFrames[0].rightLineup.find((pet) => pet.name === "後排").hp).toBe(16);
    const backlineAttack = simulateBattle(
      [unit("後排攻擊者", 10, 100, { attackBackline: true })],
      [unit("後排", 0, 20), buildNewPet({ name: "魟魚" })]
    );
    expect(backlineAttack.battleFrames[0].rightLineup.find((pet) => pet.name === "後排").hp).toBe(16);

    const mantaInBack = simulateBattle(
      [unit("後排攻擊者", 10, 100, { attackBackline: true })],
      [buildNewPet({ name: "魟魚" }), unit("前排", 0, 100)]
    );
    expect(mantaInBack.battleFrames[0].rightLineup.find((pet) => pet.name === "魟魚").hp).toBe(25);

    const mantaInMiddle = simulateBattle(
      [unit("後排攻擊者", 10, 100, { attackBackline: true })],
      [unit("後排", 0, 20), buildNewPet({ name: "魟魚" }), unit("前排", 0, 100)]
    );
    expect(mantaInMiddle.battleFrames[0].rightLineup.find((pet) => pet.name === "後排").hp).toBe(16);
  });

  it("非護甲形式的減傷也記錄總抵免量供防護圈動畫使用", () => {
    const result = simulateBattle(
      [unit("攻擊者", 10, 100)],
      [unit("減傷來源", 0, 100, { teamIncomingDamageMultiplier: 0.5 })]
    );
    const hit = result.battleFrames[0].events.find(
      (event) => event.type === "main_strike" && event.target?.name === "減傷來源"
    );

    expect(hit).toMatchObject({ damageApplied: 5, mitigatedDamage: 5, damageReduced: 0 });
  });

  it("attackAllDamage 會把普通攻擊改為對所有敵人造成指定範圍傷害", () => {
    const result = simulateBattle(
      [unit("全體攻擊者", 4, 100, { attackAllDamage: 15 })],
      [unit("後排", 0, 100), unit("中排", 0, 100), unit("前排", 0, 100)]
    );
    expect(result.battleFrames[0].rightLineup).toEqual([
      expect.objectContaining({ name: "後排", hp: 85 }),
      expect.objectContaining({ name: "中排", hp: 85 }),
      expect.objectContaining({ name: "前排", hp: 85 }),
    ]);
    expect(result.battleFrames[0].events.filter((event) => event.type === "attack_all_damage")).toHaveLength(3);
  });

  it("跳蛛同生命時選擇位置靠後的敵人", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "跳蛛" })],
      [unit("後排", 0, 20), unit("前排", 0, 20)]
    );
    const openingDamage = result.battleDetail.opening.events.find((event) => event.type === "opening_lowest_damage" && event.targetHpAfter != null);
    expect(openingDamage.target.name).toBe("後排");
  });

  it("鯊魚是 200/1 白板，只透過普通攻擊造成傷害", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "鯊魚" })],
      [unit("低生命", 0, 100), unit("高生命", 0, 300)]
    );
    expect(result.battleDetail.opening.events.some((row) => row.type === "opening_missile_damage")).toBe(false);
    expect(result.battleFrames[0].events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "main_strike", source: expect.objectContaining({ name: "鯊魚" }), damageApplied: 200 }),
    ]));
  });

  it("熊具有高面板，並在每回合開始時受到 15 點傷害", () => {
    const result = simulateBattle([buildNewPet({ name: "熊" })], [unit("敵人", 10, 100)]);
    expect(result.battleFrames[0].leftLineup[0]).toMatchObject({ atk: 6, hp: 125 });
  });

  it("渡鴉死亡時使其他存活友方攻擊增加 7", () => {
    const result = simulateBattle(
      [unit("隊友", 2, 20), buildNewPet({ name: "渡鴉" })],
      [unit("敵人", 20, 100)]
    );
    expect(result.battleFrames[0].leftLineup[0]).toMatchObject({ atk: 8, hp: 20, battleArmor: 0 });
  });

  it("純攻擊死亡增益事件不夾帶生命或護甲零值", () => {
    const result = simulateBattle(
      [unit("隊友", 2, 20), unit("渡鴉", 0, 1, { deathTeamAtk: 7 })],
      [unit("敵人", 20, 100)]
    );
    const ravenBuff = result.battleFrames[0].events.find((event) => event.type === "death_team_stats");
    expect(ravenBuff).toMatchObject({ atkDelta: 7 });
    expect(ravenBuff).not.toHaveProperty("hpDelta");
    expect(ravenBuff).not.toHaveProperty("armorDelta");
  });

  it("兔子每回合先播放攻擊增加，再播放生命增加", () => {
    const result = simulateBattle(
      [unit("兔子", 5, 15, { roundSelfAtk: 2, roundSelfHp: 1 })],
      [unit("敵人", 0, 100)]
    );
    const rabbitEvents = result.battleFrames[0].events.filter(
      (event) => event.source?.name === "兔子" && ["round_self_atk", "round_self_hp"].includes(event.type)
    );

    expect(rabbitEvents.map((event) => event.type)).toEqual(["round_self_atk", "round_self_hp"]);
    expect(rabbitEvents[0]).toMatchObject({ atkDelta: 2 });
    expect(rabbitEvents[0]).not.toHaveProperty("hpDelta");
    expect(rabbitEvents[1]).toMatchObject({ hpDelta: 1 });
    expect(rabbitEvents[1]).not.toHaveProperty("atkDelta");
  });

  it("獨角仙死亡時對敵方最後排造成 27 點傷害", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "獨角仙" })],
      [unit("敵方後排", 0, 100), unit("敵方前排", 20, 100)]
    );
    expect(result.battleFrames[0].rightLineup.map((pet) => pet.hp)).toEqual([75, 97]);
    expect(result.battleFrames[0].events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "death_backline_damage", damageApplied: 25, target: expect.objectContaining({ name: "敵方後排" }) }),
    ]));
  });

  it("禿鷹在任一角色死亡時增加 4 攻擊與 4 生命", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "禿鷹" })],
      [unit("敵人", 0, 1)]
    );
    expect(result.battleFrames[0].leftLineup[0]).toMatchObject({ atk: 10, hp: 10 });
  });

  it("橘子只占一張卡，但進入戰鬥時展開成可隨等級增加的多個白板單位", () => {
    const level1 = buildNewPet({ name: "橘子" }, 1);
    const level5 = buildNewPet({ name: "橘子" }, 5);
    expect(level1.special.splitUnitCount).toBe(4);
    expect(level5.special.splitUnitCount).toBe(5);
    expect([1, 3, 4, 6, 7, 9, 10].map((level) => buildNewPet({ name: "橘子" }, level).special.splitUnitCount)).toEqual([4, 4, 5, 5, 6, 6, 7]);
    const result = simulateBattle([level1], [unit("敵人", 100, 100)]);
    expect(result.battleDetail.opening.leftLineupBeforeOpen).toHaveLength(4);
    expect(result.battleDetail.opening.leftLineupBeforeOpen).toEqual(expect.arrayContaining([
      expect.objectContaining({ atk: 1, hp: 1, special: {} }),
    ]));
  });

  it("螳螂會越過前排攻擊最後方角色", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "螳螂" })],
      [unit("最後方", 0, 30), unit("最前排", 0, 30)]
    );
    expect(result.battleFrames[0].rightLineup.map((pet) => pet.hp)).toEqual([3, 30]);
  });

  it("蜜獾使友方開戰、回合開始、死亡效果傷害加倍，但不影響普通攻擊型範圍傷害", () => {
    const opening = simulateBattle(
      [buildNewPet({ name: "蜜獾" }), buildNewPet({ name: "跳蛛" })],
      [unit("敵人", 0, 100)]
    );
    expect(opening.battleDetail.opening.events.find((event) => event.type === "opening_lowest_damage" && event.damageApplied != null).damageApplied).toBe(40);

    const roundStart = simulateBattle(
      [buildNewPet({ name: "蜜獾" }), buildNewPet({ name: "耳廓狐" })],
      [unit("敵人", 0, 100)]
    );
    expect(roundStart.battleFrames[0].events.find((event) => event.type === "round_front_fixed_damage").damageApplied).toBe(8);

    const death = simulateBattle(
      [buildNewPet({ name: "蜜獾" }), buildNewPet({ name: "獨角仙" })],
      [unit("敵人", 20, 100)]
    );
    expect(death.battleFrames[0].events.find((event) => event.type === "death_backline_damage").damageApplied).toBe(50);

    const attackExtra = simulateBattle(
      [buildNewPet({ name: "蜜獾" }), buildNewPet({ name: "巨嘴鳥" })],
      [unit("後排", 0, 100), unit("前排", 0, 100)]
    );
    expect(attackExtra.battleFrames[0].events.find((event) => event.type === "attack_all_damage").damageApplied).toBe(15);
  });

  it("耳廓狐每回合對敵方最前排造成不隨攻擊力改變的固定傷害", () => {
    const result = simulateBattle(
      [{ ...buildNewPet({ name: "耳廓狐" }), atk: 99 }],
      [unit("後排", 0, 100), unit("最前排", 0, 100)]
    );
    const skillDamage = result.battleFrames[0].events.find((event) => event.type === "round_front_fixed_damage");
    expect(skillDamage).toMatchObject({ damageApplied: 4, target: { name: "最前排" } });
  });

  it("雙方主攻擊鎖定回合開始數值並以相鄰事件同步播放", () => {
    const result = simulateBattle(
      [unit("左方", 4, 20)],
      [unit("受傷增攻者", 2, 18, { gainAtkWhenDamaged: 3 })]
    );
    const frame = result.battleFrames[0];
    expect(frame.leftLineup[0].hp).toBe(18);
    expect(frame.rightLineup[0].atk).toBe(5);
    const mainIndexes = frame.events
      .map((event, index) => event.type === "main_strike" ? index : -1)
      .filter((index) => index >= 0);
    expect(mainIndexes[1] - mainIndexes[0]).toBe(1);
    expect(frame.events[mainIndexes[0]].animation.attacks[0].side).toBe("left");
    expect(frame.events[mainIndexes[1]].animation.attacks[0].side).toBe("right");
  });

  it("戰鬥結算統計我方角色的傷害、承傷、增益與護甲貢獻", () => {
    const result = simulateBattle(
      [unit("輔助", 0, 10, { roundFrontAtk: 2, roundFrontArmor: 3 }), unit("輸出", 1, 20)],
      [unit("敵人", 4, 3)]
    );
    expect(result.contributions).toEqual([
      expect.objectContaining({ name: "輔助", damage: 0, damageTaken: 0, buffs: 2, armor: 3 }),
      expect.objectContaining({ name: "輸出", damage: 3, damageTaken: 1 }),
    ]);
  });

  it("前方一格與前方全體的回合增益依位置生效", () => {
    const result = simulateBattle(
      [unit("護甲來源", 5, 5, { roundShieldAllAhead: 1 }), unit("中間", 0, 20), unit("前排", 0, 20)],
      [unit("敵人", 0, 100)]
    );
    expect(result.battleFrames[0].leftLineupBefore.map((pet) => pet.battleArmor)).toEqual([0, 0, 0]);
    expect(result.battleFrames[0].leftLineup.map((pet) => pet.battleArmor)).toEqual([0, 1, 1]);
  });

  it("長頸鹿使用低基礎面板，每回合增加前方所有隊友 2 生命且不會自傷", () => {
    const giraffe = buildNewPet({ name: "長頸鹿" });
    expect(giraffe).toMatchObject({ atk: 5, hp: 10, special: { roundHpAllAhead: 2 } });
    expect(giraffe.special).not.toHaveProperty("roundStartSelfDamage");

    const result = simulateBattle(
      [giraffe, unit("中間", 0, 20), unit("前排", 0, 20)],
      [unit("敵人", 0, 100)]
    );
    expect(result.battleFrames[0].leftLineup.map((pet) => pet.hp)).toEqual([10, 22, 22]);
  });

  it("大猩猩只強化正前方一格", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "大猩猩" }), unit("正前方", 1, 20), unit("更前方", 1, 20)],
      [unit("敵人", 0, 100)]
    );
    expect(result.battleFrames[0].leftLineup.map((pet) => pet.atk)).toEqual([3, 4, 1]);
  });

  it("雪貂每回合治療我方最前排", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "雪貂" }), unit("中排", 0, 20), unit("最前排", 0, 20)],
      [unit("敵人", 0, 100)]
    );
    expect(result.battleFrames[0].leftLineup.map((pet) => pet.hp)).toEqual([10, 20, 24]);
  });

  it("穿山甲每回合使自己和正前方角色各獲得一點護甲", () => {
    const result = simulateBattle(
      [unit("左側", 1, 30), buildNewPet({ name: "穿山甲" }), unit("右側", 1, 30)],
      [unit("敵方", 0, 100)]
    );
    expect(result.battleFrames[0].leftLineupBefore.map((pet) => pet.battleArmor)).toEqual([0, 0, 0]);
    expect(result.battleFrames[0].leftLineup.map((pet) => pet.battleArmor)).toEqual([0, 1, 1]);
  });

  it("烏龜開戰時會對自己生效護甲", () => {
    const lineup = ["雪貂", "長頸鹿", "穿山甲", "烏龜", "狗", "魟魚"].map((name) => buildNewPet({ name }));
    const result = simulateBattle(lineup, [unit("敵人", 0, 100)]);
    const turtle = result.battleFrames[0].leftLineup.find((pet) => pet.name === "烏龜");
    const turtleArmorEvent = result.battleDetail.opening.events.find(
      (event) => event.type === "opening_self_armor" && event.source?.name === "烏龜"
    );

    expect(turtle).toMatchObject({ battleArmor: 7 });
    expect(turtleArmorEvent).toMatchObject({
      target: expect.objectContaining({ name: "烏龜" }),
      armorDelta: 6,
      targetArmorAfter: 6,
    });
  });

  it("公館水樂園組中的魟魚會替後方隊友承接減傷效果", () => {
    const lineup = ["長頸鹿", "熊", "渡鴉", "魟魚", "螳螂"].map((name) => buildNewPet({ name }));
    const result = simulateBattle(
      [unit("後排攻擊者", 10, 100, { attackBackline: true })],
      lineup
    );
    const giraffe = result.battleFrames[0].rightLineup.find((pet) => pet.name === "長頸鹿");
    const hit = result.battleFrames[0].events.find(
      (event) => event.type === "main_strike" && event.target?.name === "長頸鹿"
    );

    expect(giraffe).toMatchObject({ hp: 6 });
    expect(hit).toMatchObject({
      rawDamage: 4,
      damageApplied: 4,
      mitigatedDamage: 6,
      target: expect.objectContaining({ name: "長頸鹿" }),
    });
  });
});

describe("Solo", () => {
  it("單場戰鬥最多進行 35 回合", () => {
    expect(SOLO_TURN_LIMIT).toBe(35);
  });

  it("每個 Boss 會獨立挑戰 1 到 20 等", () => {
    expect(SOLO_MAX_BOSS_LEVEL).toBe(MAX_BOSS_LEVEL);
  });

  it("教學關會在正式第一回合之前，正式回合依序安排單人與雙人關卡", () => {
    expect(getTutorialChallenge()).toMatchObject({ kind: "tutorial", maxBossLevel: 1, scoreEnabled: false });
    expect(getRoundChallenges(1).map((challenge) => challenge.kind)).toEqual(["single"]);
    expect(getRoundChallenges(2).map((challenge) => challenge.kind)).toEqual(["duo"]);
    expect(getRoundChallenges(5).map((challenge) => challenge.kind)).toEqual(["single", "duo"]);
    expect(getRoundChallenges(7).map((challenge) => challenge.kind)).toEqual(["single", "single"]);
    expect(getRoundChallenges(10).map((challenge) => challenge.kind)).toEqual(["single", "duo"]);
    expect(getRoundChallenges(3)[0].teamSize).toBe(SINGLE_CHALLENGE_TEAM_SIZE);
    expect(getRoundChallenges(4)[0].teamSize).toBe(DUO_CHALLENGE_TEAM_SIZE);
    expect(getRoundChallenges(1)[0]).toMatchObject({ maxBossLevel: SOLO_MAX_BOSS_LEVEL, scoreEnabled: true });
  });

  it("教學關使用固定角色池，推薦站位能通過但隨便組不穩", () => {
    expect(TUTORIAL_POOL_NAMES).toHaveLength(8);
    expect(TUTORIAL_RECOMMENDED_TEAM).toEqual(["大猩猩", "兔子", "雪貂", "河馬", "橘子"]);
    const challenge = getTutorialChallenge();
    const recommended = simulateBattle(
      TUTORIAL_RECOMMENDED_TEAM.map((name) => buildNewPet({ name }, 1)),
      buildChallengeEncounterTeam(challenge, 1)
    );
    const randomish = simulateBattle(
      ["鯉魚王", "橘子", "雪貂", "大猩猩", "貓"].map((name) => buildNewPet({ name }, 1)),
      buildChallengeEncounterTeam(challenge, 1)
    );
    expect(recommended.rightRemaining).toBe(1);
    expect(recommended.leftRemaining).toBe(0);
    expect(recommended.timedOut).toBe(false);
    expect(randomish.rightRemaining).toBeGreaterThan(0);
  });

  it("正式關卡排程可重複使用部分敵人陣容", () => {
    const challenges = Array.from({ length: 10 }, (_, index) => getMultiplayerRoundChallenges(index + 1)).flat();
    const lineupKeys = challenges.map((challenge) => (challenge.encounter.enemyIds ?? challenge.encounter.enemies?.map((enemy) => enemy.id)).join("|"));
    expect(SOLO_ENCOUNTERS).toHaveLength(14);
    expect(challenges).toHaveLength(14);
    expect(new Set(lineupKeys).size).toBe(14);
    const encounterSizes = SOLO_ENCOUNTERS.map((encounter) => (encounter.enemyIds ?? encounter.enemies ?? []).length);
    expect(encounterSizes).toEqual([1, 3, 2, 2, 3, 2, 3, 2, 1, 2, 3, 1, 1, 3]);
    expect(encounterSizes.filter((size) => size >= 3)).toHaveLength(5);
    expect(encounterSizes.filter((size) => size === 1)).toHaveLength(4);
    const rangeDamageEncounters = SOLO_ENCOUNTERS.filter((encounter) => (encounter.enemyIds ?? []).some((enemyId) => {
      const special = ENEMY_DEFINITIONS[enemyId]?.special ?? {};
      return special.attackAll || special.openingEnemyAllDamage || special.deathEnemyAllDamage || special.cleaveFrontTwo;
    }));
    expect(rangeDamageEncounters).toHaveLength(5);
    expect(buildEncounterTeam(1, 1)[0].special).toEqual({});
    expect(buildEncounterTeamByName("泉庭誘餌").map((enemy) => enemy.name)).toEqual(["海豹", "企鵝", "無尾熊"]);
  });

  it("敵方角色各自使用唯一名稱與敵方圖片", () => {
    const enemies = Object.values(ENEMY_DEFINITIONS);
    const formalEnemyIds = new Set(SOLO_ENCOUNTERS.flatMap((encounter) => encounter.enemyIds ?? []));
    expect(enemies).toHaveLength(37);
    expect(new Set(enemies.map((enemy) => enemy.name)).size).toBe(37);
    expect(new Set(enemies.map((enemy) => enemy.image)).size).toBe(37);
    expect(enemies.every((enemy) => enemy.image.startsWith("/pet_images/enemies/"))).toBe(true);
    expect(getPetCompendiumList().every((pet) => pet.image.startsWith("/pet_images/allies/"))).toBe(true);
    expect([...formalEnemyIds].every((id) => id in ENEMY_DEFINITIONS)).toBe(true);
    expect(formalEnemyIds.has("tutorial_guard")).toBe(false);
  });

  it("敵方角色不會有數值相近且完全相同的數值型效果", () => {
    const entries = Object.entries(ENEMY_DEFINITIONS);
    const allowedSimilarPairs = new Set(["endless_colossus|swarm_raccoon", "swarm_raccoon|endless_colossus"]);
    entries.forEach(([leftId, left], leftIndex) => {
      const leftKeys = Object.keys(left.special ?? {}).filter((key) => typeof left.special[key] === "number").sort();
      if (!leftKeys.length) return;
      entries.slice(leftIndex + 1).forEach(([rightId, right]) => {
        if (allowedSimilarPairs.has(`${leftId}|${rightId}`)) return;
        const rightKeys = Object.keys(right.special ?? {}).filter((key) => typeof right.special[key] === "number").sort();
        if (leftKeys.join(",") !== rightKeys.join(",")) return;
        const areClose = leftKeys.every((key) => Math.abs(left.special[key] - right.special[key]) <= 2);
        expect(areClose, `${leftId} 與 ${rightId} 的效果與數值過於接近`).toBe(false);
      });
    });
  });

  it("新版浣熊、鸚鵡、綿羊與熊貓使用指定效果", () => {
    expect(ENEMY_DEFINITIONS.swarm_raccoon).toMatchObject({ atk: 5, hp: 10, special: { roundLowestEnemyDamage: 3 } });
    expect(ENEMY_DEFINITIONS.bombard_martyr).toMatchObject({ atk: 5, hp: 5, special: { deathEnemyAllDamage: 12 } });
    expect(getPetSpecialEffectText({ ...ENEMY_DEFINITIONS.bombard_pulser, level: 1 })).toBe("開戰時：所有友方各獲得 3 護甲");
    expect(getPetSpecialEffectText({ ...ENEMY_DEFINITIONS.bamboo_guard, level: 1 })).toBe("存活時：我方受到的所有傷害降低 50%");

    const panda = unit("熊貓", 0, 100, { teamIncomingDamageMultiplier: 0.5 });
    const ally = unit("友方", 0, 100);
    const reduced = simulateBattle([unit("攻擊者", 20, 100)], [panda, ally]);
    expect(reduced.battleFrames[0].rightLineup.at(-1).hp).toBe(90);

    const sheep = unit("綿羊", 0, 20, { openingTeamArmor: 3 }, { isEnemy: true });
    const guarded = unit("友方", 0, 20, {}, { isEnemy: true });
    const armored = simulateBattle([unit("等待者", 0, 100)], [sheep, guarded]);
    expect(armored.battleFrames[0].rightLineup.map((pet) => pet.battleArmor)).toEqual([3, 3]);
  });

  it("Demo 與多人模式使用獨立的關卡編成", () => {
    for (let round = 1; round <= 10; round += 1) {
      const demoChallenges = getRoundChallenges(round);
      const multiplayerChallenges = getMultiplayerRoundChallenges(round);
      expect(demoChallenges).toHaveLength(multiplayerChallenges.length);
      demoChallenges.forEach((challenge, index) => {
        expect(challenge.encounter.enemyIds).not.toEqual(multiplayerChallenges[index].encounter.enemyIds);
      });
    }
  });

  it("第 10 回合單人關使用封攻長城", () => {
    const [singleChallenge, duoChallenge] = getMultiplayerRoundChallenges(10);

    expect(singleChallenge.kind).toBe("single");
    expect(singleChallenge.encounter).toMatchObject({ name: "封攻長城", enemyIds: ["attack_sealer", "shell_guard"] });
    expect(duoChallenge.kind).toBe("duo");
    expect(duoChallenge.encounter).toMatchObject({ name: "霧沼三震", enemyIds: ["shadow_assassin"] });
  });

  it("保留原本 Demo 的 14 組不重複敵方陣容", () => {
    const lineupKeys = DEMO_ENEMY_ENCOUNTERS.map((encounter) => encounter.enemyIds.join("|"));
    expect(DEMO_ENEMY_ENCOUNTERS).toHaveLength(14);
    expect(new Set(lineupKeys).size).toBe(14);
  });

  it("Demo 不使用指定的特殊敵人", () => {
    const forbidden = new Set(["holy_beast", "rage_atk_aide", "worker_summoning_hen", "attack_sealer", "shadow_assassin"]);
    DEMO_ENEMY_ENCOUNTERS.forEach((encounter) => {
      expect((encounter.enemyIds ?? []).some((enemyId) => forbidden.has(enemyId))).toBe(false);
    });
  });

  it("重新設計的四關讓隨機 Lv.1 隊伍仍保有基本通關率", () => {
    const pool = getPetCompendiumList()
      .filter((pet) => pet.tier < 4)
      .map((pet) => buildNewPet(pet, 1));
    let seed = 20260713;
    const random = () => {
      let value = (seed += 0x6d2b79f5);
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };

    const redesignedChallenges = [5, 7, 9, 10].map((round) => getMultiplayerRoundChallenges(round)[1]);
    for (const challenge of redesignedChallenges) {
      const { encounter } = challenge;
      const trials = 500;
      let wins = 0;
      for (let trial = 0; trial < trials; trial += 1) {
        const team = selectRandomTeam(pool, challenge.teamSize, random).filter(Boolean);
        const result = simulateBattle(team, buildChallengeEncounterTeam(challenge, 1));
        if (result.rightRemaining === 0 && !result.timedOut) wins += 1;
      }
      expect(wins / trials, `${encounter.name} 的隨機隊伍勝率`).toBeGreaterThanOrEqual(0.08);
    }
  });

  it("新版敵方關卡使用指定面板與簡單效果", () => {
    expect(buildEncounterTeamByName("泉庭誘餌")).toHaveLength(3);
    expect(buildEncounterTeamByName("泉庭誘餌")).toEqual([
      expect.objectContaining({ name: "海豹", atk: 1, hp: 1, special: {} }),
      expect.objectContaining({ name: "企鵝", atk: 2, hp: 12, special: expect.objectContaining({ roundTeamHeal: 9 }) }),
      expect.objectContaining({ name: "無尾熊", atk: 7, hp: 29, special: expect.objectContaining({ roundSelfHeal: 10 }) }),
    ]);
    expect(buildEncounterTeamByName("爆羽火線").map((enemy) => enemy.name)).toEqual(["駱駝", "鸚鵡", "野豬"]);
    expect(buildEncounterTeamByName("深海替身")[0]).toEqual(expect.objectContaining({
      name: "水豚",
      atk: 5,
      hp: 5,
      special: expect.objectContaining({ roundLowestEnemyDamage: 5 }),
    }));
    expect(buildEncounterTeamByName("存活威壓")).toEqual([
      expect.objectContaining({ name: "奶龍", atk: 6, hp: 30, special: expect.objectContaining({ livingEnemyAtkPerUnit: 6, livingEnemyHpPerUnit: 30 }) }),
      expect.objectContaining({ name: "小蜜蜂", atk: 5, hp: 40, special: {} }),
    ]);
    expect(buildEncounterTeamByName("駝羽風暴")).toEqual([
      expect.objectContaining({ name: "野馬", atk: 5, hp: 35, special: expect.objectContaining({ attackAll: true }) }),
      expect.objectContaining({ name: "駱駝", atk: 6, hp: 6, special: expect.objectContaining({ openingEnemyAllDamage: 5 }) }),
      expect.objectContaining({ name: "鸚鵡", atk: 5, hp: 5, special: expect.objectContaining({ deathEnemyAllDamage: 12 }) }),
    ]);
    expect(buildEncounterTeamByName("孵蛋母雞")).toEqual([
      expect.objectContaining({ name: "母雞", atk: 12, hp: 40, special: expect.objectContaining({ roundFrontSummonEvery: 2 }) }),
    ]);
    expect(buildEncounterTeamByName("霧沼三震")).toEqual([
      expect.objectContaining({ name: "青蛙", atk: 4, hp: 50, special: expect.objectContaining({ openingEnemyAllDamage: 30, openingEnemyAllHitCount: 1, dodge: true }) }),
    ]);
    expect(SOLO_ENCOUNTERS.flatMap((encounter) => encounter.enemyIds)).not.toContain("void_bomb");
    expect(getPetSpecialEffectText(buildEncounterTeamByName("深海替身")[1])).toContain("普通攻擊：優先攻擊敵方最後排");
  });

  it("跳蛛會優先命中當前 encounter 中生命最低且最靠後的敵人", () => {
    const result = simulateBattle([buildNewPet({ name: "跳蛛" })], buildEncounterTeamByName("爆羽火線"));
    expect(result.battleDetail.opening.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "opening_lowest_damage", target: expect.objectContaining({ name: "鸚鵡" }) }),
    ]));
    expect(result.battleFrames[0].rightLineup.map((pet) => pet.name)).not.toContain("鸚鵡");
  });

  it("死亡分裂關中，螳螂與獨角仙都會鎖定唯一敵人", () => {
    const result = simulateBattle(
      [buildNewPet({ name: "跳蛛" }), buildNewPet({ name: "螳螂" })],
      buildEncounterTeamByName("死亡分裂")
    );
    const mantisStrikes = result.battleFrames
      .flatMap((frame) => frame.events)
      .filter((event) => event.type === "main_strike" && event.source?.name === "螳螂");
    expect(mantisStrikes[0]?.target?.name).toBe("芒果");

    const beetle = simulateBattle([buildNewPet({ name: "獨角仙" })], buildEncounterTeamByName("死亡分裂"));
    const deathStrike = beetle.battleFrames
      .flatMap((frame) => frame.events)
      .find((event) => event.type === "death_backline_damage" && event.source?.name === "獨角仙");
    expect(deathStrike?.target?.name).toBe("芒果");
  });

  it("土豚的普通攻擊會對敵方全體造成傷害", () => {
    const result = simulateBattle(
      [unit("後排", 0, 100), unit("前排", 0, 100)],
      [unit("土豚", ENEMY_DEFINITIONS.burrow_raider.atk, ENEMY_DEFINITIONS.burrow_raider.hp, ENEMY_DEFINITIONS.burrow_raider.special, { isEnemy: true })]
    );
    expect(result.battleFrames[0].leftLineup.map((pet) => pet.hp)).toEqual([79, 79]);
    expect(result.battleFrames[0].events.filter((event) => event.type === "attack_all_damage")).toHaveLength(2);
  });

  it("鱷魚以較低攻擊力對同一目標連續攻擊兩次", () => {
    const crocodile = buildEncounterTeam(3, 1).find((pet) => pet.name === "鱷魚");
    const result = simulateBattle([unit("後排嘲諷", 0, 100, {}, { taunt: true }), unit("第一格", 0, 100)], [crocodile]);
    expect(result.battleFrames[0].leftLineup.map((pet) => pet.hp)).toEqual([100, 88]);
    const strikes = result.battleFrames[0].events.filter((event) => ["main_strike", "triple_strike"].includes(event.type) && event.source?.name === "鱷魚");
    expect(strikes).toHaveLength(2);
    expect(strikes.every((event) => event.animation?.attacks?.some((attack) => attack.pet?.name === "鱷魚"))).toBe(true);
  });

  it("鱷魚在同步主攻擊後死亡時不再發動後續連擊", () => {
    const crocodile = buildEncounterTeam(3, 1).find((pet) => pet.name === "鱷魚");
    const result = simulateBattle([unit("致命反擊者", 30, 100)], [crocodile]);
    const strikes = result.battleFrames[0].events.filter(
      (event) => ["main_strike", "triple_strike"].includes(event.type) && event.source?.name === "鱷魚"
    );

    expect(result.battleFrames[0].rightLineup).toHaveLength(0);
    expect(result.battleFrames[0].leftLineup[0].hp).toBe(94);
    expect(strikes).toHaveLength(1);
  });

  it("衰減型首領每回合降低三點攻擊且最低為五", () => {
    const result = simulateBattle(
      [unit("目標", 0, 500)],
      [unit("衰減首領", 20, 500, { roundSelfAtkLoss: 3, roundSelfAtkMinimum: 5 })]
    );
    expect(result.battleFrames.slice(0, 7).map((frame) => frame.rightLineup[0].atk)).toEqual([17, 14, 11, 8, 5, 5, 5]);
  });

  it("梅花鹿只在第十戰鬥回合開始時對敵方全體造成傷害", () => {
    const result = simulateBattle(
      [unit("梅花鹿", 0, 100, { roundTenEnemyAllDamage: 30 })],
      [unit("後排目標", 0, 100), unit("前排目標", 0, 100)]
    );
    expect(result.battleFrames[8].rightLineup.map((pet) => pet.hp)).toEqual([100, 100]);
    expect(result.battleFrames[9].rightLineup.map((pet) => pet.hp)).toEqual([70, 70]);
    const tenthRoundHits = result.battleFrames[9].events.filter((event) => event.type === "round_ten_enemy_all_damage");
    expect(tenthRoundHits).toHaveLength(2);
    expect(tenthRoundHits.every((event) => event.animation?.damages?.length === 1)).toBe(true);
  });

  it("風暴回音壁偏向能承受多次非穿透傷害的防禦隊伍", () => {
    const buildTeam = (names) => names.map((name) => buildNewPet({ name }));
    const enemies = buildEncounterTeamByName("駝羽風暴");
    const defensive = simulateBattle(
      buildTeam(["雪貂", "長頸鹿", "穿山甲", "烏龜", "狗", "魟魚"]),
      enemies
    );
    const fragileBurst = simulateBattle(
      buildTeam(["禿鷹", "巨嘴鳥", "獨角仙", "跳蛛", "螳螂", "貓"]),
      buildEncounterTeamByName("駝羽風暴")
    );

    expect(defensive.rightRemaining).toBeLessThanOrEqual(fragileBurst.rightRemaining);
    expect(defensive.leftRemaining).toBeGreaterThan(fragileBurst.leftRemaining);
  });

  it("霧沼封界讓最前排魟魚有效保護隊伍", () => {
    const buildTeam = (frontName) => ["貓", "雪貂", "長頸鹿", "穿山甲", "狗", frontName]
      .map((name) => buildNewPet({ name }));
    const withManta = simulateBattle(buildTeam("魟魚"), buildEncounterTeam(14, 1));
    const withoutManta = simulateBattle(buildTeam("烏龜"), buildEncounterTeam(14, 1));

    expect(withManta.rightRemaining).toBe(0);
    expect(withManta.leftRemaining).toBeGreaterThanOrEqual(withoutManta.leftRemaining);
    expect(withManta.leftFinalHp).toBeGreaterThan(withoutManta.leftFinalHp);
  });

  it("鸚鵡死亡時對玩家全體造成 12 傷害", () => {
    const parrot = ENEMY_DEFINITIONS.bombard_martyr;
    const result = simulateBattle(
      [unit("玩家後排", 0, 100), unit("玩家前排", 10, 100)],
      [unit(parrot.name, parrot.atk, parrot.hp, parrot.special, { isEnemy: true })]
    );
    expect(result.battleFrames[0].leftLineup.map((pet) => pet.hp)).toEqual([88, 83]);
    expect(result.battleFrames[0].events.filter((event) => event.type === "death_enemy_all_damage")).toHaveLength(2);
  });

  it("鬣狗會在任一敵我角色死亡時增加攻擊與生命", () => {
    const collector = unit("鬣狗", ENEMY_DEFINITIONS.sweep_brute.atk, ENEMY_DEFINITIONS.sweep_brute.hp, ENEMY_DEFINITIONS.sweep_brute.special, { isEnemy: true });
    expect(getPetSpecialEffectText(collector)).toBe("任一角色死亡時：自身攻擊 +4、生命 +7");
    const result = simulateBattle([unit("犧牲者", 0, 1)], [collector]);
    expect(result.battleFrames[0].rightLineup[0]).toMatchObject({ atk: 9, hp: 20 });
  });

  it("駝羽風暴依序放置野馬、駱駝與鸚鵡", () => {
    const enemies = buildEncounterTeamByName("駝羽風暴");
    expect(enemies).toEqual([
      expect.objectContaining({ atk: 5, hp: 35, special: expect.objectContaining({ attackAll: true }) }),
      expect.objectContaining({ atk: 6, hp: 6, special: expect.objectContaining({ openingEnemyAllDamage: 5 }) }),
      expect.objectContaining({ atk: 5, hp: 5, special: expect.objectContaining({ deathEnemyAllDamage: 12 }) }),
    ]);

    const opening = simulateBattle([unit("玩家後排", 0, 100), unit("玩家前排", 0, 100)], [enemies[1]]);
    expect(opening.battleDetail.opening.events.filter((event) => event.type === "opening_enemy_all_damage")).toHaveLength(2);
    expect(opening.battleFrames[0].leftLineup.map((pet) => pet.hp)).toEqual([95, 89]);

  });

  it("海象會反射實際受到的普通攻擊傷害，且穿透攻擊也會觸發", () => {
    const attacker = unit("犀牛", 20, 100, { dodge: true }, { pierce: true, battleArmor: 50 });
    const walrus = unit("海象", ENEMY_DEFINITIONS.retribution_guard.atk, ENEMY_DEFINITIONS.retribution_guard.hp, ENEMY_DEFINITIONS.retribution_guard.special, { isEnemy: true });
    const result = simulateBattle([attacker], [walrus]);
    expect(result.battleFrames[0].rightLineup[0].hp).toBe(50);
    expect(result.battleFrames[0].leftLineup[0]).toMatchObject({ hp: 80, battleArmor: 7 });
    expect(result.battleFrames[0].events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "basic_attack_counter_damage", damageApplied: 20, pierced: true }),
    ]));
  });

  it("海象會反彈範圍普通攻擊", () => {
    const result = simulateBattle(
      [unit("範圍攻擊者", 10, 100, { attackAll: true })],
      [unit("敵方後排", 0, 100), unit("海象", 5, 100, { reflectBasicAttackDamage: true })]
    );

    expect(result.battleFrames[0].leftLineup[0].hp).toBe(85);
    expect(result.battleFrames[0].events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "basic_attack_counter_damage", damageApplied: 10, pierced: true }),
    ]));
  });

  it("開戰效果依左至右結算，死亡連鎖會先中斷尚未發動的角色", () => {
    const result = simulateBattle(
      [
        unit("開戰擊殺者", 0, 5, { openingLowestHpDamage: 10 }),
        unit("原本會嘲諷者", 0, 5, { openingSelfTaunt: true }),
      ],
      [unit("死亡炸彈", 0, 5, { deathEnemyAllDamage: 10 })]
    );
    const events = result.battleDetail.opening.events;
    expect(events.findIndex((event) => event.type === "opening_lowest_damage")).toBeLessThan(
      events.findIndex((event) => event.type === "death_enemy_all_damage")
    );
    expect(events.some((event) => event.type === "opening_self_taunt")).toBe(false);
  });

  it("同時死亡的死亡效果依左至右結算", () => {
    const result = simulateBattle(
      [unit("範圍擊殺者", 0, 20, { openingEnemyAllDamage: 10 })],
      [
        unit("敵方左側", 0, 5, { deathEnemyAllDamage: 1 }),
        unit("敵方右側", 0, 5, { deathEnemyAllDamage: 1 }),
      ]
    );
    const events = result.battleDetail.opening.events;
    const areaDamageIndexes = events
      .map((event, index) => event.type === "opening_enemy_all_damage" ? index : -1)
      .filter((index) => index >= 0);
    const deathDamageIndex = events.findIndex((event) => event.type === "death_enemy_all_damage");
    expect(areaDamageIndexes).toHaveLength(2);
    expect(deathDamageIndex).toBeGreaterThan(Math.max(...areaDamageIndexes));
    expect(events
      .filter((event) => event.type === "death_enemy_all_damage")
      .map((event) => event.source.name))
      .toEqual(["敵方左側", "敵方右側"]);
  });

  it("多段效果開始後，即使來源在中途死亡仍會完整發動", () => {
    const result = simulateBattle(
      [unit("四段施術者", 0, 5, { openingEnemyAllDamage: 8, openingEnemyAllHitCount: 4 })],
      [unit("後排承傷者", 0, 100), unit("死亡炸彈", 0, 5, { deathEnemyAllDamage: 10 })]
    );
    const hits = result.battleDetail.opening.events
      .filter((event) => event.type === "opening_enemy_all_damage" && event.target?.name === "後排承傷者");

    expect(hits).toHaveLength(4);
    expect(hits.map((event) => event.effectHit)).toEqual([1, 2, 3, 4]);
    expect(result.battleDetail.opening.events.some((event) => event.type === "death_enemy_all_damage")).toBe(true);
  });

  it("回合開始效果被死亡連鎖中斷後，已死亡角色不再發動", () => {
    const result = simulateBattle(
      [
        unit("回合擊殺者", 0, 5, { roundFrontFixedDamage: 10 }),
        unit("原本會成長者", 0, 5, { roundSelfAtk: 10 }),
      ],
      [unit("回合死亡炸彈", 0, 5, { deathEnemyAllDamage: 10 })]
    );
    const events = result.battleFrames[0].events;
    expect(events.findIndex((event) => event.type === "round_front_fixed_damage")).toBeLessThan(
      events.findIndex((event) => event.type === "death_enemy_all_damage")
    );
    expect(events.some((event) => event.type === "round_self_growth")).toBe(false);
  });

  it("豆花每回合把玩家最前排攻擊變成 4", () => {
    const definition = ENEMY_DEFINITIONS.attack_sealer;
    const enemy = unit(definition.name, definition.atk, definition.hp, definition.special, { isEnemy: true });
    expect(enemy).toEqual(expect.objectContaining({
      name: "豆花",
      atk: 5,
      hp: 36,
      special: expect.objectContaining({ roundEnemyFrontAtkSet: 4 }),
    }));
    const result = simulateBattle([unit("玩家前排", 30, 100)], [enemy]);
    expect(result.battleFrames[0].leftLineup[0].atk).toBe(4);
    expect(getPetSpecialEffectText(enemy)).toBe("每回合開始時：敵方最前排攻擊變為 4");
  });

  it("敵人種類不會出現在玩家抽卡池", () => {
    const playerNames = new Set(getPetCompendiumList().map((pet) => pet.name));
    for (let round = 1; round <= SOLO_ENCOUNTERS.length; round += 1) {
      buildEncounterTeam(round, 1).forEach((enemy) => {
        expect(enemy.isEnemy).toBe(true);
        expect(playerNames.has(enemy.name)).toBe(false);
      });
    }
  });

  it("同一 Boss 等級越高攻防越高", () => {
    const level1 = buildEncounterTeam(1, 1)[0];
    const level4 = buildEncounterTeam(1, 4)[0];
    expect(level4.level).toBe(4);
    expect(level4.atk).toBeGreaterThan(level1.atk);
    expect(level4.hp).toBeGreaterThan(level1.hp);
  });

  it("敵方固定加值技能每級乘 1.1 成長", () => {
    const level1 = buildEncounterTeamByName("泉庭誘餌", 1)[1];
    const level5 = buildEncounterTeamByName("泉庭誘餌", 5)[1];
    expect(level1.special.roundTeamHeal).toBe(9);
    expect(level5.special.roundTeamHeal).toBe(13);
  });

  it("高護甲與高閃避關卡保留各自特色", () => {
    expect(buildEncounterTeamByName("白鐵倒數").at(-1).battleArmor).toBe(12);
    expect(buildEncounterTeamByName("霧沼三震")[0].special.dodge).toBe(true);
  });

  it("禁療效果會降低敵方回合治療", () => {
    const healer = unit("治療者", 0, 20, { roundSelfHeal: 10 });
    const normal = simulateBattle([unit("攻擊者", 8, 100)], [healer]);
    const reduced = simulateBattle([unit("禁療攻擊者", 8, 100, { enemyHpGainMultiplier: 0.3 })], [healer]);
    expect(normal.battleFrames[1].rightLineup[0].hp).toBe(24);
    expect(reduced.battleFrames[1].rightLineup[0].hp).toBe(10);
  });

  it("工人測試模式的母雞每兩回合在自己前方召喚雞蛋", () => {
    const challenge = WORKER_ONLY_TEST_CHALLENGES.find((item) => item.id === "worker-special-summoning-hen");
    const levelOne = buildEncounterTeamFromConfig(challenge.encounter, 1);
    expect(levelOne[0]).toMatchObject({
      name: "母雞",
      atk: 12,
      hp: 40,
      special: expect.objectContaining({
        roundFrontSummonEvery: 2,
        roundFrontSummonName: "雞蛋",
        roundFrontSummonAtk: 4,
        roundFrontSummonHp: 3,
        roundFrontSummonDeathSourceAtk: 3,
      }),
    });

    const result = simulateBattle([unit("觀察者", 0, 1000)], levelOne);
    expect(result.battleFrames[0].rightLineup.map((pet) => pet.name)).toEqual(["母雞"]);
    expect(result.battleFrames[1].rightLineup).toEqual([
      expect.objectContaining({ name: "母雞", atk: 12, hp: 40 }),
      expect.objectContaining({ name: "雞蛋", atk: 4, hp: 3 }),
    ]);
    expect(result.battleFrames[1].events).toContainEqual(
      expect.objectContaining({
        type: "round_front_summon",
        source: expect.objectContaining({ name: "母雞" }),
        target: expect.objectContaining({ name: "雞蛋" }),
      })
    );
    expect(result.battleFrames[3].rightLineup.map((pet) => pet.name)).toEqual(["母雞", "雞蛋", "雞蛋"]);
    const henBuffResult = simulateBattle([unit("清蛋者", 4, 1000, { attackAllDamage: 4 })], levelOne);
    expect(henBuffResult.battleFrames[1].events).toContainEqual(
      expect.objectContaining({
        type: "summon_death_source_atk",
        source: expect.objectContaining({ name: "雞蛋" }),
        target: expect.objectContaining({ name: "母雞" }),
        atkDelta: 3,
        targetAtkAfter: 15,
      })
    );

    const levelThirty = buildEncounterTeamFromConfig(challenge.encounter, 30);
    expect(levelThirty[0]).toMatchObject({
      atk: 190,
      hp: 634,
      special: expect.objectContaining({
        roundFrontSummonAtk: 63,
        roundFrontSummonHp: 47,
        roundFrontSummonDeathSourceAtk: 47,
      }),
    });
  });

  it("工人測試模式的分裂體死亡時逐代減半且最多分裂三次", () => {
    const challenge = WORKER_ONLY_TEST_CHALLENGES.find((item) => item.id === "worker-special-survival-split");
    const levelOne = buildEncounterTeamFromConfig(challenge.encounter, 1);
    expect(levelOne[0]).toMatchObject({
      name: "分裂體",
      atk: 20,
      hp: 20,
      special: expect.objectContaining({ deathSplitMaxGenerations: 3 }),
    });

    const result = simulateBattle([unit("範圍測試者", 0, 1000, { attackAllDamage: 20 })], levelOne);
    expect(result.battleFrames[0].rightLineup).toEqual([
      expect.objectContaining({ name: "分裂體", atk: 10, hp: 10 }),
      expect.objectContaining({ name: "分裂體", atk: 10, hp: 10 }),
    ]);
    expect(result.battleFrames[1].rightLineup).toHaveLength(4);
    expect(result.battleFrames[1].rightLineup.every((pet) => pet.atk === 5 && pet.hp === 5)).toBe(true);
    expect(result.battleFrames[2].rightLineup).toHaveLength(8);
    expect(result.battleFrames[2].rightLineup.every((pet) => pet.atk === 2 && pet.hp === 2)).toBe(true);
    expect(result.battleFrames[3].rightLineup).toHaveLength(0);
    expect(result.battleFrames.flatMap((frame) => frame.events).filter((event) => event.type === "death_split")).toHaveLength(7);
  });

  it("蛇會降低敵方所有戰鬥中的生命增加，包含直接增加生命", () => {
    const lifeBuffer = unit("生命增益者", 0, 20, { roundFrontHp: 10 });
    const frontliner = unit("前排", 0, 20);
    const normal = simulateBattle([unit("攻擊者", 0, 100)], [lifeBuffer, frontliner]);
    const reduced = simulateBattle([unit("蛇", 0, 100, { enemyHpGainMultiplier: 0.3 })], [lifeBuffer, frontliner]);

    expect(normal.battleFrames[0].rightLineup.find((pet) => pet.name === "前排").hp).toBe(30);
    expect(reduced.battleFrames[0].rightLineup.find((pet) => pet.name === "前排").hp).toBe(23);
  });

  it("後排攻擊會越過前排命中最後方角色", () => {
    const result = simulateBattle(
      [unit("我方後排", 0, 20), unit("我方前排", 0, 20)],
      [unit("刺客", 5, 100, { attackBackline: true })]
    );
    expect(result.battleFrames[0].leftLineup).toEqual([
      expect.objectContaining({ name: "我方後排", hp: 15 }),
      expect.objectContaining({ name: "我方前排", hp: 20 }),
    ]);
  });

  it("分數等於 Boss 通過的不同等級數", () => {
    const base = { rightInitialHp: 100, enemyRemainingHp: 0, leftInitialHp: 100, leftFinalHp: 50, timedOut: false, battleFrames: [{}] };
    const scores = Array.from({ length: 20 }, (_, index) => {
      const level = index + 1;
      const cleared = level >= 3 && level <= 7;
      return calculateSoloScore({
        ...base,
        rightFinalHp: cleared ? 0 : 20,
        rightRemaining: cleared ? 0 : 1,
        leftRemaining: cleared ? 1 : 0,
      }, level);
    });
    expect(scores[0]).toMatchObject({ cleared: false, total: 0, highestCleared: 0, clearedLevels: [] });
    expect(scores[2]).toMatchObject({ cleared: true, total: 1, highestCleared: 3, clearedLevels: [3] });
    expect(buildRoundScore(scores)).toMatchObject({ total: 5, highestCleared: 7, clearedLevels: [3, 4, 5, 6, 7] });
  });

  it("雙方同時全滅的平手算玩家勝利", () => {
    const score = calculateSoloScore({
      rightInitialHp: 10,
      rightFinalHp: 0,
      rightRemaining: 0,
      leftRemaining: 0,
      timedOut: false,
      battleFrames: [{}],
    }, 4);
    expect(score).toMatchObject({ cleared: true, total: 1, highestCleared: 4, clearedLevels: [4] });
  });
});
