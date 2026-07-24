import { describe, expect, it } from "vitest";
import { createBattleReplay, runBattle } from "../../lib/battleService";

describe("共用戰鬥入口", () => {
  it("不會修改呼叫端傳入的角色快照", () => {
    const left = [{ name: "玩家", atk: 10, hp: 20, special: {} }, null];
    const right = [{ name: "敵人", atk: 2, hp: 5, special: {} }];
    const before = JSON.stringify({ left, right });

    const result = runBattle(left, right);

    expect(result.rightRemaining).toBe(0);
    expect(JSON.stringify({ left, right })).toBe(before);
  });

  it("產生所有模式共用的可儲存回放格式", () => {
    const result = runBattle(
      [{ name: "玩家", atk: 10, hp: 20, special: {} }],
      [{ name: "敵人", atk: 1, hp: 5, special: {} }]
    );
    const replay = createBattleReplay(result, { encounterId: "round-1", score: { total: 1 } });

    expect(replay.encounterId).toBe("round-1");
    expect(replay.frames).toBe(result.battleFrames);
    expect(replay.outcome.rightRemaining).toBe(0);
    expect(replay.outcome.timedOut).toBe(false);
  });
});
