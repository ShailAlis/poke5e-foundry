/** Comprueba la tabla, el sorteo y la aplicación mecánica de naturalezas. */
import assert from "node:assert/strict";
import { NATURES, applyNatureEffects, natureDefinition, natureLabel, randomNature } from "../pokemon/natures.mjs";

assert.equal(NATURES.length, 25);
assert.equal(new Set(NATURES).size, 25);
assert.equal(randomNature(() => 0), "Hardy");
assert.equal(randomNature(() => 0.999), "Quirky");
assert.deepEqual(applyNatureEffects({ str: 12, dex: 10, con: 8, wis: 14, cha: 9 }, "Lonely"), { str: 13, dex: 10, con: 7, wis: 14, cha: 9 });
assert.deepEqual(applyNatureEffects({ str: 12, dex: 10 }, "Hardy"), { str: 12, dex: 10 });
assert.equal(natureDefinition("Adamant").increase, "str");
assert.equal(natureDefinition("Adamant").decrease, "wis");
assert.equal(natureLabel("Adamant", "es"), "Firme");
assert.equal(natureLabel("Adamant", "en"), "Adamant");

console.log("Pokémon nature validation passed.");
