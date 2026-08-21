import assert from "node:assert/strict";
import { acupressureEffect, hiddenPowerType, magnitudeDice } from "./random-tables.mjs";

assert.equal(hiddenPowerType(1), "normal");
assert.equal(hiddenPowerType(18), "fairy");
assert.equal(hiddenPowerType(19), "typeless");
assert.equal(hiddenPowerType(20), null, "El 20 deja elegir a quien tira");

assert.equal(magnitudeDice(1), "1d4");
assert.equal(magnitudeDice(5), "1d4");
assert.equal(magnitudeDice(6), "1d8");
assert.equal(magnitudeDice(15), "1d8");
assert.equal(magnitudeDice(16), "1d10");
assert.equal(magnitudeDice(65), "1d12");
assert.equal(magnitudeDice(66), "2d6");
assert.equal(magnitudeDice(96), "2d12");
assert.equal(magnitudeDice(100), "2d12");
assert.equal(magnitudeDice(0), "1d4", "Nunca por debajo del primer tramo");
assert.equal(magnitudeDice(150), "2d12", "Nunca por encima del último tramo");

assert.deepEqual(acupressureEffect(1).modifiers, { attack: 1 });
assert.equal(acupressureEffect(3).tempHp, 10);
assert.deepEqual(acupressureEffect(5).modifiers, { criticalRangeBonus: 1 });
assert.deepEqual(acupressureEffect(6).modifiers, { ac: 1 });

console.log("Random tables validation passed.");
