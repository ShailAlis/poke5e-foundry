/**
 * Validador de encounter-generator.mjs, ejecutado por `npm run check`. Con
 * Bulbasaur como caso de prueba y un generador aleatorio fijo, comprueba el
 * filtrado por bioma y tipo, los movimientos por nivel, el aumento de PG al
 * subir, la generación de un encuentro reproducible y que la instancia salvaje
 * salga con su nivel, experiencia, cuatro movimientos como mucho con sus PP
 * correctos y fuera de todo equipo.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  adjustedHitPoints,
  buildWildInstance,
  filterEncounterSpecies,
  generateEncounter,
  naturalMovesAtLevel
} from "./encounter-generator.mjs";

const pokemon = JSON.parse(await readFile(new URL("../data/pokemon.json", import.meta.url), "utf8")).items;
const moves = JSON.parse(await readFile(new URL("../data/moves.json", import.meta.url), "utf8")).moves;
const movesById = new Map(moves.map(move => [move.id, move]));
const bulbasaur = pokemon.find(entry => entry.id === "bulbasaur");

assert(filterEncounterSpecies(pokemon, { biome: "forest", type: "grass", levelMax: 5 }).includes(bulbasaur));
assert(!filterEncounterSpecies(pokemon, { biome: "ocean", type: "grass", levelMax: 5 }).includes(bulbasaur));
assert(naturalMovesAtLevel(bulbasaur, 1).includes("tackle"));
assert(naturalMovesAtLevel(bulbasaur, 6).includes("vine-whip"));
assert(adjustedHitPoints(bulbasaur, 2) > bulbasaur.hp);

const generated = generateEncounter([bulbasaur], { count: 3, levelMin: 2, levelMax: 4 }, () => 0);
assert.equal(generated.length, 3);
assert(generated.every(entry => entry.speciesId === "bulbasaur" && entry.level === 2));

let id = 0;
const instance = buildWildInstance(bulbasaur, movesById, { level: 6, random: () => 0, idFactory: () => `move-${++id}` });
assert.equal(instance.level, 6);
assert.equal(instance.experience, 12000);
assert(instance.moves.length <= 4);
assert(instance.moves.every(entry => entry.pp.max === movesById.get(entry.moveId).pp));
assert.equal(instance.inTeam, false);

console.log("Encounter generation validation passed.");
