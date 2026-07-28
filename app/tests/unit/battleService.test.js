import { describe, expect, it } from "vitest";
import { createBattleReplay, runBattle } from "../../lib/battleService";
import { buildNewPet } from "../../lib/petCatalog";

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

  it("下雨且隊伍有公館水樂園時，該隊角色戰鬥時等級 +2", () => {
    const player = { ...buildNewPet({ name: "狗" }, 1), teamId: "4" };
    const result = runBattle(
      [player],
      [{ name: "敵人", atk: 0, hp: 999, special: {} }],
      {
        environment: {
          is_raining: "TRUE",
          isRaining: true,
          teamFlags: [{ teamId: "4", turtleNetEnabled: false, waterParkEnabled: true }],
        },
      }
    );

    expect(result.battleDetail.opening.leftLineupBeforeOpen[0]).toMatchObject({
      name: "狗",
      level: 3,
      atk: buildNewPet({ name: "狗" }, 3).atk,
      hp: buildNewPet({ name: "狗" }, 3).hp,
    });
  });

  it("雙人關只有有公館水樂園的那一隊會在下雨時升兩級", () => {
    const lower = { ...buildNewPet({ name: "狗" }, 1), teamId: "8" };
    const higher = { ...buildNewPet({ name: "貓" }, 1), teamId: "1" };
    const result = runBattle(
      [lower, higher],
      [{ name: "敵人", atk: 0, hp: 999, special: {} }],
      {
        environment: {
          is_raining: "TRUE",
          isRaining: true,
          teamFlags: [
            { teamId: "1", turtleNetEnabled: false, waterParkEnabled: false },
            { teamId: "8", turtleNetEnabled: false, waterParkEnabled: true },
          ],
        },
      }
    );

    expect(result.battleDetail.opening.leftLineupBeforeOpen[0]).toMatchObject({
      name: "狗",
      level: 3,
    });
    expect(result.battleDetail.opening.leftLineupBeforeOpen[1]).toMatchObject({
      name: "貓",
      level: 1,
    });
  });

  it("烏龜網路會讓全場其餘名字含龜的角色在其中一隻死亡時一起死亡", () => {
    const front = { ...buildNewPet({ name: "烏龜" }, 1), teamId: "3" };
    const back = { name: "小龜", atk: 1, hp: 20, level: 1, image: "", special: {}, teamId: "3" };
    const enemyTurtle = { name: "敵方烏龜", atk: 1, hp: 18, level: 1, image: "", special: {} };
    const result = runBattle(
      [back, front],
      [enemyTurtle, { name: "敵人", atk: 40, hp: 999, special: {} }],
      {
        environment: {
          teamFlags: [{ teamId: "3", turtleNetEnabled: true, waterParkEnabled: false }],
        },
      }
    );

    const cascadeEvents = result.battleFrames[0].events.filter((event) => event.type === "turtle_net_cascade_death");
    expect(cascadeEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: expect.objectContaining({ name: "烏龜" }),
        target: expect.objectContaining({ name: "小龜" }),
        targetSide: "left",
        targetHpBefore: 20,
        targetHpAfter: 0,
      }),
      expect.objectContaining({
        source: expect.objectContaining({ name: "烏龜" }),
        target: expect.objectContaining({ name: "敵方烏龜" }),
        targetSide: "right",
        targetHpBefore: 18,
        targetHpAfter: 0,
      }),
    ]));
    expect(result.leftRemaining).toBe(0);
    expect(result.rightRemaining).toBe(1);
  });
});
