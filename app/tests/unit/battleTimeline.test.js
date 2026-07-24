import { describe, expect, it } from "vitest";
import { applyCombatEventsToLineup, buildBattleTimelineItems, buildOpeningLineups, petMotionFromEffects, petSlotFxFromEffect, scheduledEffectCountdown } from "../../components/useBattleTimeline";

const pet = (uid, name = `角色${uid}`) => ({ uid, name });
const damageEvent = (type, targetUid, extra = {}) => ({
  type,
  side: "left",
  targetSide: "right",
  source: pet(1, "施法者"),
  target: pet(targetUid),
  damageApplied: 5,
  effectiveDamageToHp: 5,
  ...extra,
});

describe("戰鬥範圍效果時間軸", () => {
  it("自己替自己回血也同時播放治療施法與回血動畫", () => {
    const self = pet(1, "自癒者");
    const fx = petSlotFxFromEffect(
      { type: "round_self_heal", side: "left", source: self, target: self, heal: 10 },
      [self],
      []
    );

    expect(fx.left.map((row) => row.kind)).toEqual(["cast-heal", "heal"]);
    expect(fx.left.find((row) => row.kind === "heal")).toMatchObject({ flyText: "+10" });
  });

  it("護甲實際減免傷害時同時播放受擊與盾牌抵擋特效", () => {
    const target = pet(2, "護甲角色");
    const fx = petSlotFxFromEffect(
      damageEvent("main_strike", 2, { damageApplied: 3, effectiveDamageToHp: 3, damageReduced: 7 }),
      [pet(1, "攻擊者")],
      [target]
    );

    expect(fx.right).toEqual([
      expect.objectContaining({ kind: "armor-block", flyText: "-3", blockedAmount: 7 }),
    ]);
  });

  it("任何形式的非零抵免都播放藍色防護圈", () => {
    const fx = petSlotFxFromEffect(
      damageEvent("attack_all_damage", 2, { damageApplied: 5, mitigatedDamage: 5, damageReduced: 0 }),
      [pet(1, "攻擊者")],
      [pet(2, "減傷角色")]
    );

    expect(fx.right.map((row) => row.kind)).toEqual(["armor-block"]);
  });

  it("指定回合技能顯示倒數並在發動回合歸零", () => {
    const deer = { special: { roundTenEnemyAllDamage: 30 } };
    expect(scheduledEffectCountdown(deer, 0)).toBe(10);
    expect(scheduledEffectCountdown(deer, 1)).toBe(9);
    expect(scheduledEffectCountdown(deer, 10)).toBe(0);
    expect(scheduledEffectCountdown(deer, 11)).toBeNull();
    expect(scheduledEffectCountdown({ special: { roundTeamHeal: 5 } }, 1)).toBeNull();
  });

  it("穿透或沒有減傷時不播放盾牌抵擋特效", () => {
    const fx = petSlotFxFromEffect(
      damageEvent("main_strike", 2, { damageReduced: 0, pierced: true }),
      [pet(1, "攻擊者")],
      [pet(2, "護甲角色")]
    );

    expect(fx.right.map((row) => row.kind)).toEqual(["damage"]);
  });

  it("兔子自我增加攻擊時同時播放黃色光圈與 +X 數值", () => {
    const rabbit = pet(1, "兔子");
    const fx = petSlotFxFromEffect(
      { type: "round_self_atk", side: "left", source: rabbit, target: rabbit, atkDelta: 2, targetAtkAfter: 7 },
      [rabbit],
      []
    );

    expect(fx.left).toEqual([
      expect.objectContaining({ kind: "cast-atk", showFly: false }),
      expect.objectContaining({ kind: "atk", flyText: "+2" }),
    ]);
  });

  it("召喚事件在當幕插入新角色並同時播放施法與出場特效", () => {
    const hen = { ...pet(1, "母雞"), atk: 12, hp: 40 };
    const egg = pet(2, "雞蛋");
    const event = {
      type: "round_front_summon",
      side: "right",
      targetSide: "right",
      source: hen,
      target: egg,
      targetAtkAfter: 4,
      targetHpAfter: 3,
      targetMaxHpAfter: 3,
    };
    const lineup = [hen];

    applyCombatEventsToLineup(lineup, [event], "right");

    expect(lineup).toEqual([
      hen,
      expect.objectContaining({ uid: 2, name: "雞蛋", atk: 4, hp: 3, maxHp: 3 }),
    ]);
    const fx = petSlotFxFromEffect(event, [...lineup].reverse(), [...lineup].reverse());
    expect(fx.right.map((row) => row.kind)).toEqual(["cast-summon", "summon"]);
  });

  it("分裂事件在死亡來源後插入兩個子代並讓兩者同幕出場", () => {
    const parent = { ...pet(1, "分裂體"), atk: 20, hp: 0 };
    const event = {
      type: "death_split",
      side: "right",
      targetSide: "right",
      source: parent,
      target: pet(2, "分裂體"),
      secondaryTarget: pet(3, "分裂體"),
      targetAtkAfter: 10,
      targetHpAfter: 10,
      targetMaxHpAfter: 10,
    };
    const lineup = [parent];

    applyCombatEventsToLineup(lineup, [event], "right");

    expect(lineup.map((row) => row.uid)).toEqual([1, 2, 3]);
    const display = [...lineup].reverse();
    const fx = petSlotFxFromEffect(event, display, display);
    expect(fx.right.map((row) => row.kind)).toEqual(["split", "split"]);
    expect(fx.right.map((row) => row.idx).sort()).toEqual([0, 1]);
  });

  it.each([
    "opening_enemy_all_damage",
    "round_enemy_all_damage",
    "round_ten_enemy_all_damage",
    "death_enemy_all_damage",
    "death_effect_count_damage",
  ])("%s 的所有目標合併在同一動畫批次", (type) => {
    const events = [2, 3, 4].map((uid) => damageEvent(type, uid));
    const timeline = type === "opening_enemy_all_damage"
      ? buildBattleTimelineItems(events, [])
      : buildBattleTimelineItems([], [{ events }]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ bundleType: "multi_effect" });
    expect(timeline[0].events.map((event) => event.target.uid)).toEqual([2, 3, 4]);
  });

  it("多段全體傷害每一段獨立，但同一段的所有目標同時", () => {
    const events = [1, 2, 3, 4].flatMap((effectHit) =>
      [2, 3].map((uid) => damageEvent("opening_enemy_all_damage", uid, { effectHit, effectHitCount: 4 }))
    );
    const timeline = buildBattleTimelineItems(events, []);

    expect(timeline).toHaveLength(4);
    timeline.forEach((slot, index) => {
      expect(slot.events).toHaveLength(2);
      expect(slot.events.every((event) => event.effectHit === index + 1)).toBe(true);
    });
  });

  it("同一批次的所有攻擊者與所有被擊倒角色都同時取得動畫", () => {
    const left = [pet(1, "左一"), pet(2, "左二")];
    const right = [pet(3, "右一"), pet(4, "右二")];
    const events = [{
      animation: {
        attacks: [
          { side: "left", pet: left[0] },
          { side: "left", pet: left[1] },
        ],
        damages: [],
        deaths: [
          { side: "right", pet: right[0] },
          { side: "right", pet: right[1] },
        ],
      },
    }];

    expect(petMotionFromEffects(events, left, right)).toEqual({
      left: { attackIndices: [0, 1], deathIndices: [] },
      right: { attackIndices: [], deathIndices: [0, 1] },
    });
  });

  it("範圍普通攻擊與對手普通攻擊維持同一動畫批次", () => {
    const events = [
      damageEvent("attack_all_damage", 2),
      damageEvent("attack_all_damage", 3),
      { ...damageEvent("main_strike", 1), side: "right", targetSide: "left", source: pet(2, "對手"), target: pet(1, "施法者") },
    ];
    const timeline = buildBattleTimelineItems([], [{ events }]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ bundleType: "simultaneous_main_attack" });
    expect(timeline[0].events).toHaveLength(3);
  });

  it("順劈的主目標和第二目標在同一動畫批次受擊", () => {
    const main = damageEvent("main_strike", 2);
    const opposing = { ...damageEvent("main_strike", 1), side: "right", targetSide: "left", source: pet(2, "對手"), target: pet(1, "施法者") };
    const trigger = { type: "cleave_trigger", side: "left", source: pet(1, "施法者"), target: pet(3) };
    const cleave = damageEvent("cleave_strike", 3);
    const timeline = buildBattleTimelineItems([], [{ events: [main, opposing, trigger, cleave] }]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ bundleType: "simultaneous_main_attack" });
    expect(timeline[0].events.map((event) => event.type)).toEqual([
      "main_strike", "main_strike", "cleave_trigger", "cleave_strike",
    ]);
  });

  it("全隊護甲與治療的所有目標也各自同步", () => {
    for (const type of ["opening_team_armor", "round_team_heal", "death_team_stats"]) {
      const events = [2, 3, 4].map((uid) => ({ type, side: "left", source: pet(1), target: pet(uid) }));
      const timeline = buildBattleTimelineItems(type.startsWith("opening") ? events : [], type.startsWith("opening") ? [] : [{ events }]);
      expect(timeline).toHaveLength(1);
      expect(timeline[0].events).toHaveLength(3);
    }
  });

  it("非普通攻擊的致死傷害保留獨立受傷動畫與傷害數字", () => {
    const lethal = damageEvent("round_front_fixed_damage", 2, {
      damageApplied: 12,
      effectiveDamageToHp: 7,
      targetHpBefore: 7,
      targetHpAfter: 0,
      animation: {
        kind: "round_front_fixed_damage",
        attacks: [],
        damages: [{ side: "right", pet: pet(2), amount: 12, hpBefore: 7, hpAfter: 0 }],
        deaths: [{ side: "right", pet: pet(2), amount: 12, hpBefore: 7, hpAfter: 0 }],
      },
    });
    const timeline = buildBattleTimelineItems([], [{ events: [lethal] }]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0].ev).toMatchObject({
      type: "round_front_fixed_damage",
      effectiveDamageToHp: 7,
      animation: { damages: [expect.objectContaining({ amount: 12, hpAfter: 0 })] },
    });
  });

  it("開戰非普通攻擊秒殺時，該幕仍保留目標以播放受傷動畫與傷害數字", () => {
    const target = { ...pet(2, "目標"), hp: 7, maxHp: 7 };
    const lethal = damageEvent("opening_lowest_damage", 2, {
      damageApplied: 12,
      effectiveDamageToHp: 7,
      targetHpBefore: 7,
      targetHpAfter: 0,
      animation: {
        kind: "opening_lowest_damage",
        attacks: [],
        damages: [{ side: "right", pet: target, amount: 12, hpBefore: 7, hpAfter: 0 }],
        deaths: [{ side: "right", pet: target, amount: 12, hpBefore: 7, hpAfter: 0 }],
      },
    });
    const following = { type: "opening_team_armor", side: "left", source: pet(1), target: pet(1), armorDelta: 1 };
    const timeline = buildBattleTimelineItems([lethal, following], []);

    const lethalFrame = buildOpeningLineups([{ ...pet(1), hp: 10 }], [target], timeline, 0);
    expect(lethalFrame.right).toEqual([expect.objectContaining({ uid: 2, hp: 0 })]);
    expect(petSlotFxFromEffect(lethal, lethalFrame.left, lethalFrame.right).right).toEqual([
      expect.objectContaining({ kind: "damage", flyText: "-12" }),
    ]);

    const nextFrame = buildOpeningLineups([{ ...pet(1), hp: 10 }], [target], timeline, 1);
    expect(nextFrame.right).toEqual([]);
  });
});
