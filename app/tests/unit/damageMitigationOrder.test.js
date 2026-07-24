import { describe, expect, it } from "vitest";
import { simulateBattle } from "../../lib/battleLogic";

const unit = (name, atk, hp, special = {}, extra = {}) => ({
  name,
  image: "",
  atk,
  hp,
  special,
  ...extra,
});

describe("傷害倍率與護甲計算順序", () => {
  it("先乘承傷倍率再減持續型護甲", () => {
    const result = simulateBattle(
      [unit("後排攻擊者", 20, 100, { attackBackline: true })],
      [
        unit("五護甲目標", 0, 100, {}, { battleArmor: 5 }),
        unit("前方減傷者", 0, 100, { backlineDamageMultiplier: 0.5 }),
      ]
    );
    const hit = result.battleFrames[0].events.find(
      (event) => event.type === "main_strike" && event.side === "left"
    );

    expect(hit).toMatchObject({
      rawDamage: 10,
      damageApplied: 5,
      damageReduced: 5,
      targetHpAfter: 95,
      targetArmorAfter: 5,
    });
  });
});
