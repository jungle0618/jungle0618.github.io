import { describe, expect, it } from "vitest";
import { getPrecomputedOptimalTestTeams, updateOptimalTestTeams } from "../../lib/testModeOptimalTeams";

const team = (...names) => names.map((name) => ({ name, atk: 1, hp: 1 }));

describe("測試模式最優組隊", () => {
  it("更高分解會取代較低分解", () => {
    const first = updateOptimalTestTeams({}, "stage-1", 8, team("貓", "狗"));
    const next = updateOptimalTestTeams(first, "stage-1", 10, team("熊", "兔子"));

    expect(next["stage-1"]).toMatchObject({
      score: 10,
      teams: [[{ name: "熊" }, { name: "兔子" }]],
    });
  });

  it("並列最優且站位不同的解會保留，重複解不會重複加入", () => {
    const first = updateOptimalTestTeams({}, "stage-1", 10, team("貓", "狗"));
    const tied = updateOptimalTestTeams(first, "stage-1", 10, team("狗", "貓"));
    const duplicate = updateOptimalTestTeams(tied, "stage-1", 10, team("貓", "狗"));

    expect(tied["stage-1"].teams).toHaveLength(2);
    expect(duplicate).toBe(tied);
  });

  it("較低分解不會改動目前候選", () => {
    const first = updateOptimalTestTeams({}, "stage-1", 10, team("貓", "狗"));
    expect(updateOptimalTestTeams(first, "stage-1", 8, team("熊", "兔子"))).toBe(first);
  });

  it("保留最高分上下 1 分內的不同近最佳解", () => {
    const first = updateOptimalTestTeams({}, "stage-1", 10, team("貓", "狗"));
    const near = updateOptimalTestTeams(first, "stage-1", 9, team("熊", "兔子"));
    expect(near).not.toBe(first);
    expect(near["stage-1"].score).toBe(10);
    expect(near["stage-1"].teams).toHaveLength(2);

    const better = updateOptimalTestTeams(near, "stage-1", 11, team("大猩猩", "兔子"));
    expect(better["stage-1"].score).toBe(11);
    expect(better["stage-1"].teams).toEqual([
      [expect.objectContaining({ name: "貓" }), expect.objectContaining({ name: "狗" })],
      [expect.objectContaining({ name: "大猩猩" }), expect.objectContaining({ name: "兔子" })],
    ]);
  });

  it("其他特別測試關會預載近最佳隊伍", () => {
    const collection = ["長頸鹿", "熊", "渡鴉", "魟魚", "螳螂", "犰狳", "穿山甲", "雪貂", "跳蛛", "禿鷹", "豪豬", "貓", "獨角仙", "橘子"]
      .map((name) => ({ name }));
    expect(getPrecomputedOptimalTestTeams("worker-special-summoning-hen", collection)).not.toHaveLength(0);
    expect(getPrecomputedOptimalTestTeams("worker-special-survival-split", collection)).not.toHaveLength(0);
    expect(getPrecomputedOptimalTestTeams("worker-special-living-enemy-power", collection)).not.toHaveLength(0);
  });
});
