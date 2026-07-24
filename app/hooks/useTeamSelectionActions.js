"use client";

import { useCallback } from "react";
import { clonePetSlotRow, swapTwoSlotsInRow } from "../lib/lineupLogic";

export default function useTeamSelectionActions({
  gamePhase,
  team,
  teams,
  setTeam,
  setTeams,
  setStatusSuccess,
  notifyLineupChanges = true,
  clearDragging,
}) {
  const onDropToSlot = useCallback((target, payload) => {
    if (gamePhase !== "prepare" || !target || !payload) {
      clearDragging();
      return;
    }

    if (payload.source === "collection" && target.zone === "team") {
      if (setTeams && teams) {
        const next = teams.map(clonePetSlotRow);
        next[target.teamIndex][target.index] = { ...payload.data };
        setTeams(next);
      } else {
        const next = clonePetSlotRow(team);
        next[target.index] = { ...payload.data };
        setTeam(next);
      }
      if (notifyLineupChanges) setStatusSuccess(`已將 ${payload.data.name} 加入上場隊伍`);
      clearDragging();
      return;
    }

    if (payload.source === "team" && target.zone === "collection") {
      if (setTeams && teams) {
        const next = teams.map(clonePetSlotRow);
        next[payload.teamIndex][payload.slotIndex] = null;
        setTeams(next);
      } else {
        const next = clonePetSlotRow(team);
        next[payload.slotIndex ?? payload.teamIndex] = null;
        setTeam(next);
      }
      if (notifyLineupChanges) setStatusSuccess(`已將 ${payload.data.name} 放回收藏`);
      clearDragging();
      return;
    }

    if (payload.source === "team" && target.zone === "team") {
      if (setTeams && teams) {
        const next = teams.map(clonePetSlotRow);
        const fromTeam = payload.teamIndex;
        const fromSlot = payload.slotIndex;
        const toTeam = target.teamIndex;
        const toSlot = target.index;
        [next[fromTeam][fromSlot], next[toTeam][toSlot]] = [next[toTeam][toSlot], next[fromTeam][fromSlot]];
        setTeams(next);
      } else if (target.index !== (payload.slotIndex ?? payload.teamIndex)) {
        setTeam(swapTwoSlotsInRow(team, payload.slotIndex ?? payload.teamIndex, target.index));
      }
      if (notifyLineupChanges) setStatusSuccess("已調整上場順序");
    }
    clearDragging();
  }, [gamePhase, team, teams, setTeam, setTeams, setStatusSuccess, notifyLineupChanges, clearDragging]);

  return { onDropToSlot };
}
