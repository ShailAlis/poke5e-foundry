import assert from "node:assert/strict";
import fs from "node:fs";
import { CHAIN_MULTI_HIT_MOVES, CONSECUTIVE_ESCALATION_MOVES, FIXED_MULTI_ATTACK_MOVES, STOP_ON_MISS_MOVES, continuesChain, diceMultiplierForStacks, resolveChainHits, scaleDiceCount, swiftProjectileCount } from "./multi-hit.mjs";

const moves = JSON.parse(fs.readFileSync(new URL("../data/moves.json", import.meta.url), "utf8")).moves;
const movesById = new Map(moves.map(move => [move.id, move]));

for (const id of Object.keys(CHAIN_MULTI_HIT_MOVES)) assert.ok(movesById.has(id), `${id} no existe en el catálogo de movimientos`);
assert.equal(CHAIN_MULTI_HIT_MOVES.thrash, 2, "Enfado limita la cadena a 2 golpes extra, no 4");
assert.equal(CHAIN_MULTI_HIT_MOVES["bullet-seed"], 4);
for (const id of Object.keys(CONSECUTIVE_ESCALATION_MOVES)) assert.ok(movesById.has(id), `${id} no existe en el catálogo de movimientos`);
for (const id of Object.keys(FIXED_MULTI_ATTACK_MOVES)) assert.ok(movesById.has(id), `${id} no existe en el catálogo de movimientos`);
for (const id of STOP_ON_MISS_MOVES) assert.ok(movesById.has(id), `${id} no existe en el catálogo de movimientos`);
assert.ok(movesById.has("swift"));

assert.equal(continuesChain(3), true);
assert.equal(continuesChain(4), true);
assert.equal(continuesChain(2), false);
assert.equal(continuesChain(1), false);

assert.equal(resolveChainHits([3, 4, 3, 1]), 3);
assert.equal(resolveChainHits([1]), 0);
assert.equal(resolveChainHits([3, 3, 3, 3, 3]), 4, "Tope de 4 golpes adicionales aunque la cadena siga");
assert.equal(resolveChainHits([]), 0);
assert.equal(resolveChainHits([3, 3, 3], 2), 2, "Enfado se detiene en 2 golpes extra aunque la cadena siga");

assert.equal(diceMultiplierForStacks(0), 1);
assert.equal(diceMultiplierForStacks(1), 2);
assert.equal(diceMultiplierForStacks(2), 4);
assert.equal(diceMultiplierForStacks(3), 8);

assert.equal(scaleDiceCount("1d6", 1), "1d6");
assert.equal(scaleDiceCount("1d6", 4), "4d6");
assert.equal(scaleDiceCount("2d4", 2), "4d4");
assert.equal(scaleDiceCount("not-dice", 4), "not-dice");
assert.equal(scaleDiceCount("3d8", 0.5), "2d8", "Chorro de Agua redondea 1.5 a 2 dados");
assert.equal(scaleDiceCount("1d6", 0.5), "1d6", "Nunca baja de 1 dado");

assert.equal(swiftProjectileCount(1), 2);
assert.equal(swiftProjectileCount(4), 2);
assert.equal(swiftProjectileCount(5), 4);
assert.equal(swiftProjectileCount(9), 4);
assert.equal(swiftProjectileCount(10), 5);
assert.equal(swiftProjectileCount(16), 5);
assert.equal(swiftProjectileCount(17), 6);
assert.equal(swiftProjectileCount(20), 6);

console.log(`Multi-hit validation passed for ${Object.keys(CHAIN_MULTI_HIT_MOVES).length} chain moves, ${Object.keys(CONSECUTIVE_ESCALATION_MOVES).length} escalation moves, and ${Object.keys(FIXED_MULTI_ATTACK_MOVES).length + 1} fixed multi-attack moves.`);
