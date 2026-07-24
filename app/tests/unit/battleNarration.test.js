import { describe, expect, it } from "vitest";
import { describeBattleEvent } from "../../lib/battleNarration";

describe("戰鬥文字紀錄", () => {
  it("描述傷害、護甲減免與死亡", () => {
    expect(describeBattleEvent({
      type: "round_front_fixed_damage",
      source: { name: "技能攻擊者" }, target: { name: "目標" },
      damageApplied: 12, effectiveDamageToHp: 7, damageReduced: 3, targetHpAfter: 0,
    })).toBe("技能攻擊者 對 目標 造成 12 點傷害（護甲減免 3），目標 被擊倒了！");
  });

  it("純攻擊增益不描述不存在的生命或護甲", () => {
    expect(describeBattleEvent({
      type: "death_team_stats", source: { name: "渡鴉" }, target: { name: "隊友" }, atkDelta: 7,
    })).toBe("渡鴉 使 隊友 的攻擊 +7。");
  });

  it("描述閃避與治療", () => {
    expect(describeBattleEvent({ type: "dodge", target: { name: "山羊" }, attacker: { name: "兔子" } })).toBe("山羊 閃避了 兔子 的攻擊！");
    expect(describeBattleEvent({ type: "round_self_heal", source: { name: "無尾熊" }, target: { name: "無尾熊" }, heal: 10 })).toBe("無尾熊 使 無尾熊 回復 10 點生命。");
  });
});
