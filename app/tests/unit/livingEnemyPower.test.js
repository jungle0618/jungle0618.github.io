import { describe, expect, it } from "vitest";
import { simulateBattle } from "../../lib/battleLogic";
import { buildChallengeEncounterTeam } from "../../lib/encounterLogic";
import { WORKER_ONLY_TEST_CHALLENGES } from "../../lib/workerTestConfig";

const observer = (index) => ({
  name: `觀察者 ${index}`,
  image: "",
  atk: 0,
  hp: 1000,
  special: {},
});

describe("存活威壓測試關", () => {
  const challenge = WORKER_ONLY_TEST_CHALLENGES.find(
    (item) => item.id === "worker-special-living-enemy-power"
  );

  it("使用後排 5/40 與前排 6x/30x 的指定站位", () => {
    expect(buildChallengeEncounterTeam(challenge, 1)).toEqual([
      expect.objectContaining({ name: "威壓前衛", atk: 6, hp: 30 }),
      expect.objectContaining({ name: "威壓獵手", atk: 5, hp: 40 }),
    ]);
  });

  it("效果角色初始攻擊與生命上限為 6x 與 30x", () => {
    const result = simulateBattle(
      Array.from({ length: 5 }, (_, index) => observer(index + 1)),
      buildChallengeEncounterTeam(challenge, 1)
    );
    const update = result.battleDetail.opening.events.find(
      (event) => event.type === "living_enemy_stats"
    );

    expect(update).toMatchObject({
      source: { name: "威壓前衛" },
      atkDelta: 24,
      targetAtkAfter: 30,
      targetMaxHpAfter: 150,
    });
    expect(result.battleFrames[0].rightLineup[0]).toMatchObject({ atk: 30, hp: 150, maxHp: 150 });
  });

  it("我方死亡後降低生命上限，超出的目前生命會被壓回上限", () => {
    const result = simulateBattle(
      [
        observer(1), observer(2), observer(3), observer(4),
        { ...observer(5), hp: 1 },
      ],
      buildChallengeEncounterTeam(challenge, 1)
    );
    const changedFrame = result.battleFrames.find((frame) => frame.events.some((event) => event.type === "living_enemy_stats"));
    expect(changedFrame.rightLineup[0]).toMatchObject({ atk: 24, hp: 120, maxHp: 120 });
    expect(changedFrame.events).toContainEqual(
      expect.objectContaining({
        type: "living_enemy_stats",
        targetMaxHpAfter: 120,
        targetHpAfter: 120,
      })
    );
  });
});
