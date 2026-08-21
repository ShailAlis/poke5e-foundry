/**
 * Validador de progression.mjs, ejecutado por `npm run check`. Comprueba la
 * tabla de experiencia, la equivalencia entre nivel y PX en sus umbrales, el
 * desglose completo de experienceProgress(), la recompensa por derrota y que
 * evolutionReadiness() separe bien las condiciones automáticas de las manuales.
 */
import assert from "node:assert/strict";
import {
  EXPERIENCE_BY_LEVEL,
  experienceAtLevel,
  experienceAward,
  experienceProgress,
  evolutionStageCount,
  evolutionReadiness,
  levelForExperience,
  normalizedExperience,
  pokemonAdvancementsBetween,
  pokemonAsiPoints,
  applyPokemonAbilityAdvancement
} from "../pokemon/progression.mjs";

assert.equal(EXPERIENCE_BY_LEVEL.length, 20);
assert.equal(experienceAtLevel(1), 0);
assert.equal(experienceAtLevel(20), 450000);
assert.equal(levelForExperience(199), 1);
assert.equal(levelForExperience(200), 2);
assert.equal(levelForExperience(450000), 20);
assert.equal(normalizedExperience(0, 5), 6000);
assert.deepEqual(experienceProgress(7000, 5), {
  total: 7000, floor: 6000, ceiling: 12000, gained: 1000, span: 6000,
  remaining: 5000, percent: 17, maximumLevel: false
});
assert.equal(experienceAward(5, 0.5), 500);

const evolutions = [
  { from: "bulbasaur", to: "ivysaur" }, { from: "ivysaur", to: "venusaur" },
  { from: "eevee", to: "vaporeon" }, { from: "eevee", to: "jolteon" }
];
assert.equal(evolutionStageCount("ivysaur", evolutions), 3);
assert.equal(evolutionStageCount("eevee", evolutions), 2);
assert.equal(evolutionStageCount("tauros", evolutions), 1);
assert.equal(pokemonAsiPoints(1), 4);
assert.equal(pokemonAsiPoints(2), 3);
assert.equal(pokemonAsiPoints(3), 2);
const advancements = pokemonAdvancementsBetween(3, 10, { stageCount: 3, speciesRating: 0.5 });
assert.equal(advancements.hitPointLevels, 7);
assert.equal(advancements.moveReplacements, 7);
assert.deepEqual(advancements.asi, [
  { level: 4, points: 2, cap: 20, peakPower: false },
  { level: 8, points: 2, cap: 20, peakPower: false }
]);
assert.deepEqual(advancements.moveLevels, [6, 10]);
assert.deepEqual(advancements.damageLevels, [5, 10]);
const allocated = applyPokemonAbilityAdvancement({ str: 10, con: 18 }, { str: 2, con: 2 }, advancements);
assert.deepEqual(allocated.attributes, { str: 12, con: 20, dex: 10, int: 10, wis: 10, cha: 10 });
assert.equal(applyPokemonAbilityAdvancement({ str: 20 }, { str: 4 }, advancements), null);
assert.equal(applyPokemonAbilityAdvancement({ str: 10 }, { str: 3 }, advancements, 1), null);
// Los descuentos de Camino de Entrenador (Poké Mentor 5, Guru 9) rebajan una
// dote a 1 punto; allowOddFeatCost es la única forma legítima de superar la paridad.
assert.equal(applyPokemonAbilityAdvancement({ str: 10 }, { str: 3 }, advancements, 1, { allowOddFeatCost: true }).featPoints, 1);
assert.equal(applyPokemonAbilityAdvancement({ str: 24, dex: 10 }, { dex: 4 }, advancements).attributes.str, 24);
const peak = pokemonAdvancementsBetween(19, 20, { stageCount: 1, speciesRating: 15 });
assert.equal(peak.asi[0].cap, 30);
assert.equal(applyPokemonAbilityAdvancement({ str: 20 }, { str: 4 }, peak).attributes.str, 24);

const moves = new Map([["ember", { type: "fire" }]]);
const ready = evolutionReadiness({ conditions: [
  { type: "level", value: 5 },
  { type: "move-type", value: "fire" },
  { type: "item", value: "Fire Stone" }
] }, { level: 5, knownMoveIds: ["ember"], movesById: moves });
assert.equal(ready.available, true);
assert.equal(ready.manual.length, 1);
assert.equal(evolutionReadiness({ conditions: [{ type: "level", value: 6 }] }, { level: 5 }).available, false);

console.log("Progression validation passed.");
