import { buildNewPet } from "../../lib/petCatalog";
import { normalizeLineup } from "../../lib/multiplayerLogic";

/** Teams.teamName 可留白；所有多人畫面仍要顯示穩定的小隊編號。 */
export function multiplayerTeamName(team = {}) {
  const name = String(team.teamName ?? "").trim();
  return name || `第 ${team.teamId ?? "—"} 小隊`;
}

/**
 * Google Sheet 只需保存角色名稱、等級與持久狀態；攻擊、生命、技能與圖片
 * 一律由共用角色目錄建立，因此調整角色規則時單人與多人會同步生效。
 */
export function hydrateMultiplayerRoster(rows = []) {
  return rows
    .filter((row) => row?.name || row?.petName)
    .map((row) => {
      const name = row.name ?? row.petName;
      return {
        ...buildNewPet({ ...row, name }, row.level ?? 1),
        teamId: row.teamId != null ? String(row.teamId) : undefined,
        rosterId: row.rosterId ?? `${row.teamId ?? "team"}:${name}`,
        version: row.version,
      };
    });
}

/** 將 Sheet 儲存的角色名稱格子轉成共用 GameShell 可使用的角色物件。 */
export function hydrateSavedLineup(savedSlots = [], roster = [], size = savedSlots.length) {
  const byName = new Map(roster.map((pet) => [pet.name, pet]));
  const lineup = Array.from({ length: size }, (_, index) => {
    const slot = savedSlots[index];
    const name = typeof slot === "string" ? slot : slot?.name;
    return name && byName.has(name) ? { ...byName.get(name) } : null;
  });
  return normalizeLineup(lineup, size);
}

/** 前端儲存陣容時只送穩定名稱與空格，不把可由規則重建的數值寫回 Sheet。 */
export function serializeLineup(lineup = [], size = lineup.length) {
  return normalizeLineup(lineup, size).map((pet) => pet?.name ?? null);
}

export function hydrateTeamSnapshot(teamRow = {}) {
  const roster = hydrateMultiplayerRoster(teamRow.roster);
  const lineupSize = Number(teamRow.lineupSize) || teamRow.currentLineup?.length || 0;
  return {
    ...teamRow,
    roster,
    currentLineup: hydrateSavedLineup(teamRow.currentLineup, roster, lineupSize),
  };
}
