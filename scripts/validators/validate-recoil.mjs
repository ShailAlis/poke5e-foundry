import assert from "node:assert/strict";
import fs from "node:fs";
import { DRAIN_FRACTION_MOVES, RECOIL_FRACTION_MOVES, recoilAmount } from "../combat/recoil.mjs";

const moves = JSON.parse(fs.readFileSync(new URL("../../data/moves.json", import.meta.url), "utf8")).moves;
const movesById = new Map(moves.map(move => [move.id, move]));
for (const id of Object.keys(RECOIL_FRACTION_MOVES)) assert.ok(movesById.has(id), `${id} no existe en el catálogo de movimientos`);
for (const id of Object.keys(DRAIN_FRACTION_MOVES)) assert.ok(movesById.has(id), `${id} no existe en el catálogo de movimientos`);

assert.equal(recoilAmount(17, 0.25), 4);
assert.equal(recoilAmount(17, 0.5), 8);
assert.equal(recoilAmount(0, 0.5), 0);
assert.equal(recoilAmount(-5, 0.5), 0, "Nunca debe devolver retroceso negativo");
assert.equal(recoilAmount(3, 0.25), 0, "Redondea hacia abajo, no hacia el entero más cercano");

console.log(`Recoil validation passed for ${Object.keys(RECOIL_FRACTION_MOVES).length} recoil moves and ${Object.keys(DRAIN_FRACTION_MOVES).length} drain moves.`);
