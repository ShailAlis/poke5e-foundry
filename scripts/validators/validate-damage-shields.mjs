import assert from "node:assert/strict";
import fs from "node:fs";
import { FULL_NEGATION_MOVES, HALF_NEGATION_MOVES, SURVIVE_MOVES, shieldedDamage } from "../combat/damage-shields.mjs";

const moves = JSON.parse(fs.readFileSync(new URL("../../data/moves.json", import.meta.url), "utf8")).moves;
const movesById = new Map(moves.map(move => [move.id, move]));
for (const id of [...FULL_NEGATION_MOVES, ...HALF_NEGATION_MOVES, ...SURVIVE_MOVES]) assert.ok(movesById.has(id), `${id} no existe en el catálogo de movimientos`);

assert.equal(shieldedDamage(10, 30, "full"), 30, "Anula el golpe entero: los PG no cambian");
assert.equal(shieldedDamage(10, 30, "half"), 20, "La mitad del golpe (20 de caída) se reduce a 10: 30-10=20");
assert.equal(shieldedDamage(30, 30, "full"), 30, "Sin caída de PG, no hay nada que recortar");
assert.equal(shieldedDamage(0, 15, "full"), 15);
assert.equal(shieldedDamage(1, 16, "half"), 8, "Caída de 15 -> mitad 8 (redondeo hacia arriba) -> 16-8=8");
assert.equal(shieldedDamage(0, 20, "survive"), 1, "Aguante nunca deja el golpe en 0 PG");
assert.equal(shieldedDamage(0, 0, "survive"), 0, "Aguante no revive a quien ya estaba a 0");
assert.equal(shieldedDamage(5, 20, "survive"), 5, "Aguante no toca golpes que no dejan a 0 PG");

console.log(`Damage shield validation passed for ${FULL_NEGATION_MOVES.size} full-negation, ${HALF_NEGATION_MOVES.size} half-negation, and ${SURVIVE_MOVES.size} survive moves.`);
