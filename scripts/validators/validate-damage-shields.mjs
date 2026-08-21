import assert from "node:assert/strict";
import fs from "node:fs";
import { FULL_NEGATION_MOVES, HALF_NEGATION_MOVES, SURVIVE_MOVES, shieldedDamage, abilityAutoHalvesDamage } from "../combat/damage-shields.mjs";

const moves = JSON.parse(fs.readFileSync(new URL("../../data/moves.json", import.meta.url), "utf8")).moves;
const movesById = new Map(moves.map(move => [move.id, move]));
// "sabotage" no es un movimiento: es la reacción de Sabotaje (Grunt 2), armada
// desde pokemon-sheet.mjs al gastar un Punto de Sombra, no desde el catálogo.
const NON_MOVE_SHIELD_IDS = new Set(["sabotage", "shadow-dodge"]);
for (const id of [...FULL_NEGATION_MOVES, ...HALF_NEGATION_MOVES, ...SURVIVE_MOVES]) {
  if (NON_MOVE_SHIELD_IDS.has(id)) continue;
  assert.ok(movesById.has(id), `${id} no existe en el catálogo de movimientos`);
}

assert.equal(shieldedDamage(10, 30, "full"), 30, "Anula el golpe entero: los PG no cambian");
assert.equal(shieldedDamage(10, 30, "half"), 20, "La mitad del golpe (20 de caída) se reduce a 10: 30-10=20");
assert.equal(shieldedDamage(30, 30, "full"), 30, "Sin caída de PG, no hay nada que recortar");
assert.equal(shieldedDamage(0, 15, "full"), 15);
assert.equal(shieldedDamage(1, 16, "half"), 8, "Caída de 15 -> mitad 8 (redondeo hacia arriba) -> 16-8=8");
assert.equal(shieldedDamage(0, 20, "survive"), 1, "Aguante nunca deja el golpe en 0 PG");
assert.equal(shieldedDamage(0, 0, "survive"), 0, "Aguante no revive a quien ya estaba a 0");
assert.equal(shieldedDamage(5, 20, "survive"), 5, "Aguante no toca golpes que no dejan a 0 PG");

// Lote 9: Multiescama/Escudo Sombra (a PG máximos) y Robustez (golpe >= mitad
// de los PG actuales, 1d4 y en 3 o 4 se reduce). abilityAutoHalvesDamage() no
// tira el dado por su cuenta: recibe `sturdyRoll` ya resuelto, así se puede
// probar cada resultado sin depender de Math.random().
assert.equal(abilityAutoHalvesDamage(["multiscale"], { pendingHp: 10, currentHp: 20, maxHp: 20 }), true, "Multiescama a PG máximos reduce el primer golpe");
assert.equal(abilityAutoHalvesDamage(["shadow-shield"], { pendingHp: 10, currentHp: 20, maxHp: 20 }), true, "Escudo Sombra comparte el mismo texto que Multiescama");
assert.equal(abilityAutoHalvesDamage(["multiscale"], { pendingHp: 10, currentHp: 18, maxHp: 20 }), false, "Multiescama no aplica si ya no está a PG máximos");
assert.equal(abilityAutoHalvesDamage(["multiscale"], { pendingHp: 20, currentHp: 20, maxHp: 20 }), false, "Sin caída de PG no hay golpe que reducir");
assert.equal(abilityAutoHalvesDamage([], { pendingHp: 10, currentHp: 20, maxHp: 20 }), false, "Sin la habilidad conocida no se reduce nada");

assert.equal(abilityAutoHalvesDamage(["sturdy"], { pendingHp: 9, currentHp: 20, maxHp: 20, sturdyRoll: 3 }), true, "Robustez: golpe >= mitad de los PG actuales (11 de 20) y 3 en 1d4 reduce");
assert.equal(abilityAutoHalvesDamage(["sturdy"], { pendingHp: 9, currentHp: 20, maxHp: 20, sturdyRoll: 4 }), true, "Robustez también reduce con un 4");
assert.equal(abilityAutoHalvesDamage(["sturdy"], { pendingHp: 9, currentHp: 20, maxHp: 20, sturdyRoll: 2 }), false, "Robustez no reduce con 1 o 2 en 1d4");
assert.equal(abilityAutoHalvesDamage(["sturdy"], { pendingHp: 15, currentHp: 20, maxHp: 20, sturdyRoll: 3 }), false, "Robustez no aplica si el golpe (5) es menos de la mitad de los PG actuales (10)");
assert.equal(abilityAutoHalvesDamage(["sturdy"], { pendingHp: 10, currentHp: 20, maxHp: 20, sturdyRoll: 3 }), true, "Robustez sí aplica en el límite exacto de la mitad (10 de 20)");

console.log(`Damage shield validation passed for ${FULL_NEGATION_MOVES.size} full-negation, ${HALF_NEGATION_MOVES.size} half-negation, and ${SURVIVE_MOVES.size} survive moves.`);
