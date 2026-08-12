import assert from "node:assert/strict";
import fs from "node:fs";
import { POKEMON_STATUS_EFFECTS, inferMoveStatusEffects } from "./status-effects.mjs";

const moves = JSON.parse(fs.readFileSync(new URL("../data/moves.json", import.meta.url))).moves;
const translated = JSON.parse(fs.readFileSync(new URL("../data/es/moves.json", import.meta.url))).moves;
const effects = id => inferMoveStatusEffects(moves.find(move => move.id === id));

assert.deepEqual(effects("fire-punch"), [{ id: "burned", trigger: "natural", minimum: 19 }]);
assert.deepEqual(effects("will-o-wisp"), [{ id: "burned", trigger: "hit", minimum: null }]);
assert.deepEqual(effects("ice-punch"), [{ id: "frozen", trigger: "natural", minimum: 19 }]);
assert.deepEqual(effects("thunder-punch"), [{ id: "paralyzed", trigger: "natural", minimum: 19 }]);
assert.deepEqual(effects("poison-fang"), [{ id: "badly-poisoned", trigger: "failed-save", minimum: null }]);
assert.equal(effects("toxic-spikes").every(effect => effect.trigger === "manual"), true);
assert.equal(effects("triple-arrows").every(effect => effect.trigger === "manual"), true);
assert.equal(effects("yawn").every(effect => effect.trigger === "manual"), true);
assert.equal(inferMoveStatusEffects(translated.find(move => move.id === "fire-punch"))[0]?.minimum, 19);
assert.equal(POKEMON_STATUS_EFFECTS.burned.immuneTypes.includes("fire"), true);
assert.equal(POKEMON_STATUS_EFFECTS.frozen.immuneTypes.includes("ice"), true);
assert.ok(moves.filter(move => inferMoveStatusEffects(move).length).length >= 80);

console.log("Pokémon status-effect validation passed.");
