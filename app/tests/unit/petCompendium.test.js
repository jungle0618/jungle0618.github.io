import { describe, expect, it } from "vitest";
import { filterCompendiumEntries, findPlayerCompendiumEntry } from "../../lib/compendiumVisibility";

const entries = [
  { name: "狗", tier: 1, isEnemy: false },
  { name: "變色龍", tier: 4, isEnemy: false },
  { name: "獅子", tier: 4, isEnemy: true },
];

describe("圖鑑可見範圍", () => {
  it("非工人列表隱藏傳奇我方角色，但保留敵方項目", () => {
    expect(filterCompendiumEntries(entries).map((entry) => entry.name)).toEqual(["狗", "獅子"]);
  });

  it("工人列表顯示傳奇卡，非工人仍能由卡片直接開啟傳奇詳情", () => {
    expect(filterCompendiumEntries(entries, true).map((entry) => entry.name)).toEqual(["狗", "變色龍", "獅子"]);
    expect(findPlayerCompendiumEntry(entries, "變色龍")).toMatchObject({ tier: 4 });
  });
});
