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
  naturalMovesAtLevel,
  withEggMoveChance
} from "../world/encounter-generator.mjs";
import { UNIQUE_LEGENDARY_NUMBERS, capturedLegendaryNumbers, uniqueLegendaryNumber } from "../pokemon/legendary-species.mjs";

const pokemon = JSON.parse(await readFile(new URL("../../data/pokemon.json", import.meta.url), "utf8")).items;
const moves = JSON.parse(await readFile(new URL("../../data/moves.json", import.meta.url), "utf8")).moves;
const movesById = new Map(moves.map(move => [move.id, move]));
const bulbasaur = pokemon.find(entry => entry.id === "bulbasaur");
const unnumbered = pokemon.find(entry => Number(entry.number) === 0);
const mewtwo = pokemon.find(entry => Number(entry.number) === 150);

assert(filterEncounterSpecies(pokemon, { biome: "forest", type: "grass", levelMax: 5 }).includes(bulbasaur));
assert(!filterEncounterSpecies(pokemon, { levelMax: 20 }).includes(unnumbered));
assert(!filterEncounterSpecies(pokemon, { biome: "ocean", type: "grass", levelMax: 5 }).includes(bulbasaur));
assert(!filterEncounterSpecies(pokemon, { levelMax: 20, excludedLegendaryNumbers: new Set([150]) }).includes(mewtwo));
assert.equal(uniqueLegendaryNumber(mewtwo), 150);
assert([...UNIQUE_LEGENDARY_NUMBERS].every(number => pokemon.some(species => Number(species.number) === number)), "Every configured unique Legendary must exist in the species catalog.");
const ownedMewtwo = { getFlag: (_module, key) => key === "kind" ? "pokemon" : key === "species" ? mewtwo : null };
const playerActor = { id: "player", type: "character", hasPlayerOwner: true, items: [ownedMewtwo], getFlag: () => null };
const npcActor = { id: "npc", type: "character", hasPlayerOwner: true, items: [ownedMewtwo], getFlag: (_module, key) => key === "kind" ? "npc-trainer" : null };
assert.deepEqual([...capturedLegendaryNumbers([playerActor, npcActor], [])], [150]);
const wildActor = { id: "wild", type: "npc", items: [ownedMewtwo], getFlag: (_module, key) => key === "kind" ? "wild" : null };
assert.deepEqual([...capturedLegendaryNumbers([wildActor], [])], [150]);
assert.deepEqual([...capturedLegendaryNumbers([wildActor], [], { excludeActorId: "wild" })], []);
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
assert.equal(instance.nature, "Hardy");

// Los movimientos huevo no se pueden elegir al subir de nivel (move-learning.mjs);
// la generación aleatoria es su única vía de aparición, con una probabilidad baja.
let eggId = 0;
const alwaysEgg = buildWildInstance(bulbasaur, movesById, { level: 1, random: () => 0, idFactory: () => `egg-${++eggId}` });
assert(alwaysEgg.moves.some(entry => (bulbasaur.moves.egg ?? []).includes(entry.moveId)), "random() === 0 must always roll below EGG_MOVE_CHANCE and include an egg move.");
let noEggId = 0;
const neverEgg = buildWildInstance(bulbasaur, movesById, { level: 1, random: () => 0.99, idFactory: () => `no-egg-${++noEggId}` });
assert(neverEgg.moves.every(entry => !(bulbasaur.moves.egg ?? []).includes(entry.moveId)), "random() near 1 must never roll below EGG_MOVE_CHANCE.");

// withEggMoveChance() es la misma probabilidad aplicada a una lista de
// movimientos ya cerrada (Pokémon inicial del asistente de creación de
// entrenador), en vez de a la bolsa de la que buildWildInstance() escoge cuatro.
const starterMoves = (bulbasaur.moves.start ?? []).slice(0, 4).map(moveId => ({ id: moveId, moveId, pp: { value: 1, max: 1 } }));
const starterWithEgg = withEggMoveChance(starterMoves, bulbasaur, movesById, { random: () => 0, idFactory: () => "egg-slot" });
assert(starterWithEgg.some(entry => (bulbasaur.moves.egg ?? []).includes(entry.moveId)), "random() === 0 must always add/replace with an egg move.");
assert(starterWithEgg.length <= 4, "withEggMoveChance() must never exceed four known moves.");
const starterWithoutEgg = withEggMoveChance(starterMoves, bulbasaur, movesById, { random: () => 0.99 });
assert.deepEqual(starterWithoutEgg, starterMoves, "random() near 1 must return the original moves untouched.");
const shortList = withEggMoveChance(starterMoves.slice(0, 2), bulbasaur, movesById, { random: () => 0, idFactory: () => "egg-slot" });
assert.equal(shortList.length, 3, "With fewer than four known moves, the egg move should be added rather than replace one.");

console.log("Encounter generation validation passed.");
