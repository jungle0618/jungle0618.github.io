import { FORMAL_ENCOUNTER_SEED } from "./formalEncounterSeed.mjs";

process.stdout.write(`${JSON.stringify({ formalEncounters: FORMAL_ENCOUNTER_SEED }, null, 2)}\n`);
