export function filterCompendiumEntries(entries, includeLegendary = false) {
  return entries.filter((entry) => entry.isEnemy || includeLegendary || entry.tier < 4);
}

export function findPlayerCompendiumEntry(entries, name) {
  return entries.find((entry) => !entry.isEnemy && entry.name === name) ?? null;
}
