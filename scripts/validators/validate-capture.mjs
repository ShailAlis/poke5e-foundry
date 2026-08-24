/**
 * Validador de capture-rules.mjs, ejecutado por `npm run check`. Comprueba la CD
 * base, los dos escalones de reducción por PG, la ventaja por estado, el efecto
 * de varias Poké Balls con su contexto, el éxito automático de la Master Ball y
 * el desglose completo que devuelve captureDifficulty().
 */
import assert from "node:assert/strict";
import {
  baseCaptureDifficulty,
  captureDifficulty,
  captureExperienceReward,
  captureHasAdvantage,
  capturedHitPoints,
  healthCaptureReduction,
  pokeballAdjustment
} from "../pokemon/capture-rules.mjs";

assert.equal(baseCaptureDifficulty(0.5, 2), 12);
assert.equal(baseCaptureDifficulty(7.9, 10), 27);
assert.equal(healthCaptureReduction(50, 100), 0);
assert.equal(healthCaptureReduction(49, 100), 5);
assert.equal(healthCaptureReduction(9, 100), 10);
assert.equal(captureHasAdvantage(["poisoned"]), true);
assert.equal(captureHasAdvantage(["prone"]), false);
assert.equal(captureExperienceReward(125), 62);
assert.deepEqual(capturedHitPoints("poke-ball", 7, 20), { value: 7, max: 20 });
assert.deepEqual(capturedHitPoints("heal-ball", 7, 20), { value: 20, max: 20 });
assert.equal(pokeballAdjustment("net-ball", { types: ["water"] }).reduction, 10);
assert.equal(pokeballAdjustment("heavy-ball", { size: "medium" }).reduction, 10);
assert.equal(pokeballAdjustment("quick-ball", { combatRound: 1 }).reduction, 15);
assert.equal(pokeballAdjustment("master-ball").automaticSuccess, true);
assert.deepEqual(captureDifficulty({
  speciesRating: 5,
  level: 10,
  currentHp: 9,
  maximumHp: 100,
  ballId: "ultra-ball"
}), {
  base: 25,
  healthReduction: 10,
  ballReduction: 10,
  dc: 5,
  reasons: [{ label: "Ultra Ball", value: 10 }],
  automaticSuccess: false
});

console.log("Capture rules validation passed.");
