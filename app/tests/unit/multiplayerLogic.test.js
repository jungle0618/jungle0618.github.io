import { describe, expect, it } from "vitest";
import {
  buildDuoLineup,
  buildLevelDistribution,
  createPlayerGameView,
  hasHiddenSingleTestAchievement,
  isHigherRankTeamInPairing,
  normalizeLineup,
  resolveDuoPairings,
} from "../../lib/multiplayerLogic";
import {
  hydrateMultiplayerRoster,
  hydrateSavedLineup,
  multiplayerTeamName,
  serializeLineup,
} from "../../features/multiplayer/multiplayerAdapter";
import { resolveOfficialRound } from "../../features/multiplayer/workerBattleResolver";
import { buildOfficialBattleJobs, getOfficialLineupVersions } from "../../features/multiplayer/officialRound";
import { DUO_CLEAR_SCORE, MAX_BOSS_LEVEL } from "../../lib/gameConfig";
import { setFormalEncounterCatalog } from "../../lib/challengeConfig";
import { FORMAL_ENCOUNTER_SEED } from "../../../scripts/formalEncounterSeed.mjs";

setFormalEncounterCatalog(FORMAL_ENCOUNTER_SEED);

describe("多人模式基礎規則", () => {
  it("隊名留白時仍顯示小隊編號", () => {
    expect(multiplayerTeamName({ teamId: "8", teamName: "" })).toBe("第 8 小隊");
    expect(multiplayerTeamName({ teamId: "8", teamName: "藍隊" })).toBe("藍隊");
  });

  it("保留空格，讓未填滿陣容可直接參戰", () => {
    expect(normalizeLineup([{ name: "後排" }, null, { name: "前排" }], 5).map((pet) => pet?.name ?? null))
      .toEqual(["後排", null, "前排", null, null]);
  });

  it("雙人關將低排名隊放後排、高排名隊放前排，且保留空格", () => {
    const lineup = buildDuoLineup(
      [{ name: "低後" }, null, { name: "低前" }],
      [null, { name: "高中" }, { name: "高前" }]
    );
    expect(lineup.map((pet) => pet?.name ?? null)).toEqual(["低後", null, "低前", null, "高中", "高前"]);
  });

  it("雙人關依配對快照將強隊放在前排三格", () => {
    const game = {
      duoPairings: [{ higherRankTeamId: "8", lowerRankTeamId: "1" }],
      teams: [{ teamId: "1", rank: 1 }, { teamId: "8", rank: 8 }],
    };
    expect(isHigherRankTeamInPairing(game, "8", "1")).toBe(true);
    expect(isHigherRankTeamInPairing(game, "1", "8")).toBe(false);
    expect(buildDuoLineup([{ name: "弱隊" }], [{ name: "強隊" }]).map((pet) => pet?.name ?? null))
      .toEqual(["弱隊", null, null, "強隊", null, null]);
  });

  it("多人單人關測試戰鬥的隱藏成就不看順序，只看五隻是否剛好到齊", () => {
    expect(hasHiddenSingleTestAchievement([
      { name: "耳廓狐" },
      { name: "狗" },
      { name: "雪貂" },
      { name: "兔子" },
      { name: "熊" },
    ])).toBe(true);
    expect(hasHiddenSingleTestAchievement([
      { name: "耳廓狐" },
      { name: "狗" },
      { name: "雪貂" },
      { name: "兔子" },
      null,
    ])).toBe(false);
    expect(hasHiddenSingleTestAchievement([
      { name: "耳廓狐" },
      { name: "狗" },
      { name: "雪貂" },
      { name: "兔子" },
      { name: "貓" },
    ])).toBe(false);
  });

  it("雙人正式關優先使用工作表保存的配對快照", () => {
    const teams = Array.from({ length: 8 }, (_, index) => ({ teamId: String(index + 1), rank: index + 1 }));
    const saved = [{ challengeId: "2-1-duo", pairId: "saved", higherRankTeamId: "1", lowerRankTeamId: "2" }];
    expect(resolveDuoPairings({ teams, currentPairings: saved }, "2-1-duo")).toEqual(saved);
    expect(resolveDuoPairings({ teams }, "2-1-duo")).toEqual([]);
  });

  it("正式戰鬥沿用配對快照而不是重新依目前排名配對", () => {
    const jobs = buildOfficialBattleJobs({
      round: 2,
      currentPairings: [{ challengeId: "2-1-duo", pairId: "saved", higherRankTeamId: "1", lowerRankTeamId: "2" }],
      teams: Array.from({ length: 8 }, (_, index) => ({
        teamId: String(index + 1), rank: index + 1, roster: [], currentLineups: [],
      })),
    });
    expect(jobs).toHaveLength(MAX_BOSS_LEVEL);
    expect(jobs.every((job) => job.teamIds.join(",") === "1,2")).toBe(true);
  });

  it("玩家視圖不會包含其他隊伍的當前陣容", () => {
    const view = createPlayerGameView({
      round: 2,
      phase: "prepare",
      teams: [
        { teamId: "a", teamName: "A", rank: 1, roster: [{ level: 2 }], currentLineup: [{ name: "自己的角色" }] },
        { teamId: "b", teamName: "B", rank: 2, roster: [{ level: 1 }, { level: 3 }], currentLineup: [{ name: "不能外洩" }] },
      ],
    }, "a");
    expect(view.teams[0].currentLineup[0]?.name).toBe("自己的角色");
    expect(view.teams[1].currentLineup).toBeUndefined();
    expect(view.teams[1].levelDistribution).toEqual({ 1: 1, 3: 1 });
  });

  it("計算角色等級分布", () => {
    expect(buildLevelDistribution([{ level: 1 }, { level: 2 }, { level: 2 }])).toEqual({ 1: 1, 2: 2 });
  });

  it("只靠後端角色名稱與等級建立共用戰鬥角色", () => {
    const roster = hydrateMultiplayerRoster([
      { teamId: "a", name: "貓", level: 2, version: 3 },
      { teamId: "a", name: "狗", level: 1, version: 3 },
    ]);
    const lineup = hydrateSavedLineup(["狗", null, "貓"], roster, 5);

    expect(roster[0]).toMatchObject({ name: "貓", level: 2, version: 3, rosterId: "a:貓" });
    expect(roster[0].atk).toBeGreaterThan(35);
    expect(lineup.map((pet) => pet?.name ?? null)).toEqual(["狗", null, "貓", null, null]);
    expect(serializeLineup(lineup, 5)).toEqual(["狗", null, "貓", null, null]);
  });

  it("工人結算接受缺席空格，雙人關分數同時計入兩隊", () => {
    const result = resolveOfficialRound([{
      battleId: "duo-1-8",
      encounterId: "boss-1",
      encounterName: "測試關",
      challengeId: "duo",
      kind: "duo",
      round: 2,
      teamIds: ["team-1", "team-8"],
      leftTeam: [{ name: "貓", atk: 35, hp: 10, special: {} }, null, null, null, null, null],
      rightTeam: [{ name: "敵人", atk: 0, hp: 1, special: {} }],
    }], (battle) => ({ total: battle.rightRemaining === 0 ? 3 : 0, cleared: battle.rightRemaining === 0 }));

    expect(result.battles[0].score.cleared).toBe(true);
    expect(result.scoreByTeamId).toEqual({ "team-1": 3, "team-8": 3 });
    expect(result.battles[0].outcome.rightRemaining).toBe(0);
  });

  it("雙人正式關只使用 Apps Script 回傳的六組聯隊", () => {
    const jobs = buildOfficialBattleJobs({
      round: 2,
      currentPairings: [
        { challengeId: "2-1-duo", pairId: "r1-8", higherRankTeamId: "1", lowerRankTeamId: "8" },
        { challengeId: "2-1-duo", pairId: "r2-7", higherRankTeamId: "2", lowerRankTeamId: "7" },
        { challengeId: "2-1-duo", pairId: "r3-6", higherRankTeamId: "3", lowerRankTeamId: "6" },
        { challengeId: "2-1-duo", pairId: "r4-5", higherRankTeamId: "4", lowerRankTeamId: "5" },
        { challengeId: "2-1-duo", pairId: "fixed-9-10", higherRankTeamId: "9", lowerRankTeamId: "10" },
        { challengeId: "2-1-duo", pairId: "fixed-11-12", higherRankTeamId: "11", lowerRankTeamId: "12" },
      ],
      teams: Array.from({ length: 12 }, (_, index) => ({
        teamId: String(index + 1),
        rank: index + 1,
        roster: [],
        currentLineups: [],
      })),
    });
    expect(jobs).toHaveLength(6 * MAX_BOSS_LEVEL);
    expect(jobs[0].teamIds).toEqual(["1", "8"]);
    expect(jobs.some((job) => job.teamIds.join(",") === "9,10")).toBe(true);
    expect(jobs.some((job) => job.teamIds.join(",") === "11,12")).toBe(true);
    expect(jobs.every((job) => job.leftTeam.length === 6)).toBe(true);
  });

  it("正式結算會記錄每隊每關最新的陣容版本", () => {
    expect(getOfficialLineupVersions({
      round: 2,
      teams: [{
        teamId: "1",
        currentLineups: [
          { challengeId: "2-1-duo", version: 1, slotIndex: 0 },
          { challengeId: "2-1-duo", version: 3, slotIndex: 0 },
          { challengeId: "2-1-duo", version: 3, slotIndex: 1 },
        ],
      }],
    })).toEqual([{ teamId: "1", challengeId: "2-1-duo", version: 3 }]);
  });

  it("雙人正式關每通過一級算 1.5 分", () => {
    const result = resolveOfficialRound([{
      battleId: "duo-score",
      encounterId: "boss-1",
      encounterName: "測試關",
      challengeId: "duo",
      kind: "duo",
      round: 2,
      bossLevel: 1,
      teamIds: ["team-1", "team-8"],
      leftTeam: [{ name: "貓", atk: 35, hp: 10, special: {} }, null, null, null, null, null],
      rightTeam: [{ name: "敵人", atk: 0, hp: 1, special: {} }],
    }], (battle, job) => {
      const cleared = battle.rightRemaining === 0 && !battle.timedOut;
      return { total: cleared ? (job.kind === "duo" ? DUO_CLEAR_SCORE : 1) : 0, cleared, bossLevel: job.bossLevel };
    });
    expect(result.battles[0].score.total).toBe(DUO_CLEAR_SCORE);
  });
});
