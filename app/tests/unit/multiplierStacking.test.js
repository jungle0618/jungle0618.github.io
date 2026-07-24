import { describe, expect, it } from "vitest";
import { simulateBattle } from "../../lib/battleLogic";

const unit = (name, atk, hp, special = {}) => ({
  name,
  image: "",
  atk,
  hp,
  special,
});

describe("相同乘算效果不重複累加", () => {
  it("兩個蜜獾只讓同一段效果傷害乘 2，不會乘 4", () => {
    const result = simulateBattle(
      [
        unit("效果施術者", 0, 100, { openingEnemyAllDamage: 10 }),
        unit("蜜獾甲", 0, 100, { effectDamageMultiplier: 2 }),
        unit("蜜獾乙", 0, 100, { effectDamageMultiplier: 2 }),
      ],
      [unit("測試目標", 0, 100)]
    );
    const hit = result.battleDetail.opening.events.find(
      (event) => event.type === "opening_enemy_all_damage"
    );

    expect(hit).toMatchObject({
      rawDamage: 20,
      damageApplied: 20,
      targetHpAfter: 80,
    });
  });

  it("兩個相同的全隊 0.5 承傷效果只套用一次", () => {
    const result = simulateBattle(
      [unit("攻擊者", 20, 100)],
      [
        unit("減傷者甲", 0, 100, { teamIncomingDamageMultiplier: 0.5 }),
        unit("減傷者乙", 0, 100, { teamIncomingDamageMultiplier: 0.5 }),
      ]
    );
    const hit = result.battleFrames[0].events.find(
      (event) => event.type === "main_strike" && event.side === "left"
    );

    expect(hit).toMatchObject({
      rawDamage: 10,
      damageApplied: 10,
    });
  });
});
