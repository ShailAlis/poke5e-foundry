import assert from "node:assert/strict";
import fs from "node:fs";
// abilityFieldBonusEffectSource() (lote 18 de habilidades Pokémon) usa
// CONST.ACTIVE_EFFECT_MODES, global en Foundry pero ausente en Node — se
// define aquí como ya hace validate-status-effects.mjs.
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };
const { FIELD_PULSE_MOVES, FIELD_RULE_MOVES, TERRAIN_MOVES, WEATHER_BALL_TYPES, WEATHER_MOVES, abilityFieldBonusEffectSource } = await import("../combat/terrain-effects.mjs");

const moves = JSON.parse(fs.readFileSync(new URL("../../data/moves.json", import.meta.url), "utf8")).moves;
const movesById = new Map(moves.map(move => [move.id, move]));
for (const catalog of [TERRAIN_MOVES, FIELD_RULE_MOVES, FIELD_PULSE_MOVES]) {
  for (const [id, entry] of Object.entries(catalog)) {
    assert.ok(movesById.has(id), `${id} no existe en el catálogo de movimientos`);
    assert.equal(entry.id, id);
    assert.ok(Number(entry.rounds) > 0);
  }
}

const knownWeatherIds = new Set(["rain", "sun", "sandstorm", "hail", "snow"]);
for (const [id, entry] of Object.entries(WEATHER_MOVES)) {
  assert.ok(movesById.has(id), `${id} no existe en el catálogo de movimientos`);
  assert.ok(knownWeatherIds.has(entry.id), `${id} activa un clima desconocido: ${entry.id}`);
  assert.ok(Number(entry.rounds) > 0);
}
for (const weatherId of Object.keys(WEATHER_BALL_TYPES)) assert.ok(knownWeatherIds.has(weatherId), `Bola Clima referencia un clima desconocido: ${weatherId}`);

assert.equal(abilityFieldBonusEffectSource([]), null, "Sin habilidades de campo no hay ActiveEffect que crear");
assert.equal(abilityFieldBonusEffectSource(["overgrow"], { weatherId: "sun" }), null, "Una habilidad sin este efecto no aporta nada");

const chlorophyllSource = abilityFieldBonusEffectSource(["chlorophyll"], { weatherId: "sun" });
assert.equal(chlorophyllSource.changes.length, 5, "Clorofila duplica las cinco formas de movimiento");
for (const change of chlorophyllSource.changes) {
  assert.ok(change.key.startsWith("system.attributes.movement."));
  assert.equal(change.mode, CONST.ACTIVE_EFFECT_MODES.MULTIPLY);
  assert.equal(change.value, 2);
}
assert.equal(abilityFieldBonusEffectSource(["chlorophyll"], { weatherId: "rain" }), null, "Clorofila solo duplica la velocidad con sol");

const surgeSurferSource = abilityFieldBonusEffectSource(["surge-surfer"], { terrainId: "electric-terrain" });
assert.equal(surgeSurferSource.changes.length, 5, "Onda Voltaica también duplica las cinco formas de movimiento, por terreno");

const sandVeilSource = abilityFieldBonusEffectSource(["sand-veil"], { weatherId: "sandstorm" });
assert.deepEqual(sandVeilSource.changes, [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 2 }]);

const snowCloakSource = abilityFieldBonusEffectSource(["snow-cloak"], { weatherId: "snow" });
assert.equal(snowCloakSource.changes[0].value, 2);
assert.equal(abilityFieldBonusEffectSource(["snow-cloak"], { weatherId: "sandstorm" }), null, "Manto Nieve solo protege con granizo o nieve");

const grassPeltSource = abilityFieldBonusEffectSource(["grass-pelt"], { terrainId: "grassy-terrain" });
assert.deepEqual(grassPeltSource.changes, [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 1 }]);

const bothSource = abilityFieldBonusEffectSource(["chlorophyll", "sand-veil"], { weatherId: "sun" });
assert.equal(bothSource.changes.length, 5, "Sand Veil no se activa sin tormenta de arena aunque Chlorophyll sí lo haga con sol");

console.log(`Terrain effects validation passed for ${Object.keys(TERRAIN_MOVES).length} terrains, ${Object.keys(WEATHER_MOVES).length} weathers, ${Object.keys(FIELD_RULE_MOVES).length} field rules, ${Object.keys(FIELD_PULSE_MOVES).length} pulses.`);
