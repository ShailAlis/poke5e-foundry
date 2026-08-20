import assert from "node:assert/strict";
import fs from "node:fs";
import { FIELD_PULSE_MOVES, FIELD_RULE_MOVES, TERRAIN_MOVES, WEATHER_BALL_TYPES, WEATHER_MOVES } from "./terrain-effects.mjs";

const moves = JSON.parse(fs.readFileSync(new URL("../data/moves.json", import.meta.url), "utf8")).moves;
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

console.log(`Terrain effects validation passed for ${Object.keys(TERRAIN_MOVES).length} terrains, ${Object.keys(WEATHER_MOVES).length} weathers, ${Object.keys(FIELD_RULE_MOVES).length} field rules, ${Object.keys(FIELD_PULSE_MOVES).length} pulses.`);
