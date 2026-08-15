/**
 * Validador de contests.mjs, ejecutado por `npm run check`. Revisa que las más
 * de 600 entradas de `contest.json` usen categorías y efectos existentes con
 * Appeal y Jam válidos; comprueba con Acid la lectura de un movimiento definido,
 * la sugerencia por tipo de uno sin definir, las tres compatibilidades y la
 * puntuación en crítico, fallo, pifia complementaria e incompatible.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { CONTEST_TYPES, contestAppealOutcome, contestCompatibility, contestDetailsForMove } from "./contests.mjs";

const moves = JSON.parse(fs.readFileSync(new URL("../data/moves.json", import.meta.url))).moves;
const contests = JSON.parse(fs.readFileSync(new URL("../data/contest.json", import.meta.url))).items;
const effects = JSON.parse(fs.readFileSync(new URL("../data/contest-effects.json", import.meta.url))).items;
const movesById = new Map(moves.map(move => [move.id, move]));
const effectsById = new Map(effects.map(effect => [String(effect.id), effect]));

assert.equal(new Set(Object.keys(CONTEST_TYPES)).size, 5);
assert.equal(new Set(contests.map(entry => entry.id)).size, contests.length);
assert.ok(contests.length > 600);
for (const entry of contests) {
  assert.ok(CONTEST_TYPES[entry.contest], `Unknown contest type ${entry.contest}`);
  assert.ok(effectsById.has(String(entry.effect)), `Unknown contest effect ${entry.effect}`);
  assert.ok(Number.isInteger(entry.appeal) && entry.appeal >= 0);
  assert.ok(Number.isInteger(entry.jam) && entry.jam >= 0);
}
const definedMoves = moves.filter(move => contests.some(entry => entry.id === move.id)).length;
assert.ok(definedMoves > 600);

const acid = { ...movesById.get("acid"), contest: { ...contests.find(entry => entry.id === "acid"), effect: effectsById.get("10") } };
const acidContest = contestDetailsForMove(acid, effectsById);
assert.equal(acidContest.contest, "clever");
assert.equal(acidContest.effect.id, "10");
assert.equal(contestCompatibility("clever", "clever").id, "compatible");
assert.equal(contestCompatibility("cute", "clever").id, "complementary");
assert.equal(contestCompatibility("cool", "clever").id, "incompatible");

const fallback = contestDetailsForMove({ id: "custom", type: "water" }, effectsById);
assert.equal(fallback.contest, "cute");
assert.equal(fallback.appeal, 4);
assert.equal(fallback.fallback, true);

assert.deepEqual(contestAppealOutcome({ compatibility: "compatible", appeal: 4, natural: 20, total: 25, dc: 11 }), { success: true, critical: true, fumble: false, points: 8, crowd: 1 });
assert.equal(contestAppealOutcome({ compatibility: "compatible", appeal: 3, natural: 8, total: 9, dc: 11 }).points, 2);
assert.equal(contestAppealOutcome({ compatibility: "complementary", appeal: 3, natural: 1, total: 5, dc: 11 }).points, -3);
assert.equal(contestAppealOutcome({ compatibility: "incompatible", appeal: 3, natural: 12, total: 15, dc: 11 }).points, 0);

console.log(`Contest validation passed for ${definedMoves} defined moves, ${moves.length - definedMoves} fallbacks, and ${effects.length} effects.`);
