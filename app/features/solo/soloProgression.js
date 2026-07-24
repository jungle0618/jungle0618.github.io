import { buildNewPet } from "../../lib/petCatalog";

export { applyDrawsToCollection, drawPetCards } from "../../lib/cardDrawLogic";

/** 每個大遊戲回合只結算一次出戰狀態。 */
export function advanceDeploymentStates(collection, previousTeam) {
  const participated = new Set(previousTeam.filter(Boolean).map((pet) => pet.name));
  return collection.flatMap((pet) => {
    if (!participated.has(pet.name)) return [pet];
    if (pet.special?.oncePerGame) return [];
    const deployments = (pet.deployments ?? 0) + 1;
    const gameRoundsDeployed = (pet.gameRoundsDeployed ?? 0) + 1;
    return [buildNewPet({ ...pet, deployments, gameRoundsDeployed }, pet.level)];
  });
}
