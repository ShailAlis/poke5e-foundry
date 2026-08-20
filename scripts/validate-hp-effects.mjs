import assert from "node:assert/strict";
import { floorAtOne, halveCurrentHp, matchSourceHp } from "./hp-effects.mjs";

// Resignación: nunca cura, respeta el tope de 5x el nivel del objetivo.
assert.equal(matchSourceHp(20, 30, 10), 20, "No puede superar los PG propios");
assert.equal(matchSourceHp(80, 30, 10), 30, "No puede superar los PG que ya tenía el objetivo (no cura)");
assert.equal(matchSourceHp(80, 90, 10), 50, "Tope de 5x el nivel del objetivo");
assert.equal(matchSourceHp(-5, 30, 10), 0, "Nunca negativo");

// Fatalidad: mitad de los PG actuales, redondeando hacia abajo.
assert.deepEqual(halveCurrentHp(17), { lost: 8, newHp: 9 });
assert.deepEqual(halveCurrentHp(1), { lost: 0, newHp: 1 });
assert.deepEqual(halveCurrentHp(0), { lost: 0, newHp: 0 });

// Falso Tortazo: cualquier resultado a 0 o menos queda en 1, salvo que ya estuviera a 0.
assert.equal(floorAtOne(-3, 10), 1);
assert.equal(floorAtOne(0, 10), 1);
assert.equal(floorAtOne(5, 10), 5, "No toca resultados que no dejan al objetivo a 0");
assert.equal(floorAtOne(0, 0), 0, "No revive a un objetivo que ya estaba a 0");

console.log("HP effects validation passed.");
