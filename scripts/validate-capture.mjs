import assert from "node:assert/strict";
import {
  baseCaptureDifficulty,
  captureDifficulty,
  captureHasAdvantage,
  healthCaptureReduction,
  pokeballAdjustment
} from "./capture-rules.mjs";

assert.equal(baseCaptureDifficulty(0.5, 2), 12);
assert.equal(baseCaptureDifficulty(7.9, 10), 27);
assert.equal(healthCaptureReduction(50, 100), 0);
assert.equal(healthCaptureReduction(49, 100), 5);
assert.equal(healthCaptureReduction(9, 100), 10);
assert.equal(captureHasAdvantage(["poisoned"]), true);
assert.equal(captureHasAdvantage(["prone"]), false);
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
