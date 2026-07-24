import { TEAM_SIZE } from "./gameConfig";

export function clonePetSlotRow(row) {
  return row.map((pet) => (pet ? { ...pet } : null));
}

/** 保留上場位置，並套用角色池中最新的等級與數值。 */
export function syncTeamWithCollection(team, collection) {
  const collectionByName = new Map(
    collection.filter(Boolean).map((pet) => [pet.name, pet])
  );
  return team.map((pet) => {
    if (!pet) return null;
    const current = collectionByName.get(pet.name);
    return current ? { ...current } : null;
  });
}

export function compactTeamToRight(team, teamSize = team.length) {
  const pets = team.filter(Boolean);
  return [...Array(Math.max(0, teamSize - pets.length)).fill(null), ...pets.slice(-teamSize)];
}

/** 依等級挑選最強角色；較高等級排在較靠右的前排位置。 */
export function selectTeamByLevel(collection, teamSize = TEAM_SIZE) {
  const byStrengthDescending = (a, b) =>
    (b.level ?? 1) - (a.level ?? 1) ||
    (b.atk ?? 0) - (a.atk ?? 0) ||
    (b.hp ?? 0) - (a.hp ?? 0) ||
    String(a.name).localeCompare(String(b.name));
  const selected = collection
    .filter(Boolean)
    .filter((pet) => !(pet.special?.oncePerGame && (Number(pet.deployments) || Number(pet.gameRoundsDeployed) || 0) > 0))
    .sort(byStrengthDescending)
    .slice(0, teamSize)
    .reverse();
  return compactTeamToRight(selected, teamSize);
}

export function selectRandomTeam(collection, teamSize = TEAM_SIZE, random = Math.random) {
  const shuffled = collection
    .filter(Boolean)
    .filter((pet) => !(pet.special?.oncePerGame && (Number(pet.deployments) || Number(pet.gameRoundsDeployed) || 0) > 0))
    .map((pet) => pet);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return compactTeamToRight(shuffled.slice(0, teamSize), teamSize);
}

/** 依序替多個關卡組隊；同一角色不會被配置到本回合的第二個關卡。 */
export function configureTeamsFromCollection(collection, challenges, random = null) {
  let remaining = collection
    .filter(Boolean)
    .filter((pet) => !(pet.special?.oncePerGame && (Number(pet.deployments) || Number(pet.gameRoundsDeployed) || 0) > 0))
    .map((pet) => ({ ...pet }));
  return challenges.map((challenge) => {
    const candidates = random
      ? selectRandomTeam(remaining, remaining.length, random).filter(Boolean)
      : [...remaining].sort((a, b) =>
          (b.level ?? 1) - (a.level ?? 1) ||
          (b.atk ?? 0) - (a.atk ?? 0) ||
          (b.hp ?? 0) - (a.hp ?? 0) ||
          String(a.name).localeCompare(String(b.name))
        );
    const selected = candidates.slice(0, challenge.teamSize);
    const selectedNames = new Set(selected.map((pet) => pet.name));
    remaining = remaining.filter((pet) => !selectedNames.has(pet.name));
    return compactTeamToRight(selected.reverse(), challenge.teamSize);
  });
}

export function swapTwoSlotsInRow(row, i, j) {
  const next = clonePetSlotRow(row);
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
