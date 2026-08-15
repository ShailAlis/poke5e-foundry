/**
 * Validador de status-effects.mjs, ejecutado por `npm run check`. Es el que
 * protege la deducción de estados a partir del texto de los movimientos: fija
 * los disparadores esperados de varios casos representativos (natural, impacto,
 * salvación fallida y manual), comprueba que también funcione sobre el texto en
 * español, verifica las inmunidades por tipo y el icono del efecto generado, y
 * exige que al menos 80 movimientos sigan produciendo algún estado.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { POKEMON_STATUS_EFFECTS, inferMoveStatusEffects, pokemonStatusEffectSource } from "./status-effects.mjs";

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
globalThis.CONST = { ACTIVE_EFFECT_MODES: { MULTIPLY: 1 } };
globalThis.game = { combat: null };
const burnedSource = pokemonStatusEffectSource("burned");
assert.equal(burnedSource.icon, POKEMON_STATUS_EFFECTS.burned.img);
assert.equal(burnedSource.img, POKEMON_STATUS_EFFECTS.burned.img);
assert.ok(moves.filter(move => inferMoveStatusEffects(move).length).length >= 80);

console.log("Pokémon status-effect validation passed.");
