import assert from "node:assert/strict";
import {
  EXPERIENCE_BY_LEVEL,
  experienceAtLevel,
  experienceAward,
  experienceProgress,
  evolutionReadiness,
  levelForExperience,
  normalizedExperience
} from "./progression.mjs";

assert.equal(EXPERIENCE_BY_LEVEL.length, 20);
assert.equal(experienceAtLevel(1), 0);
assert.equal(experienceAtLevel(20), 450000);
assert.equal(levelForExperience(199), 1);
assert.equal(levelForExperience(200), 2);
assert.equal(levelForExperience(450000), 20);
assert.equal(normalizedExperience(0, 5), 6000);
assert.deepEqual(experienceProgress(7000, 5), {
  total: 7000, floor: 6000, ceiling: 12000, gained: 1000, span: 6000,
  remaining: 5000, percent: 17, maximumLevel: false
});
assert.equal(experienceAward(5, 0.5), 500);

const moves = new Map([["ember", { type: "fire" }]]);
const ready = evolutionReadiness({ conditions: [
  { type: "level", value: 5 },
  { type: "move-type", value: "fire" },
  { type: "item", value: "Fire Stone" }
] }, { level: 5, knownMoveIds: ["ember"], movesById: moves });
assert.equal(ready.available, true);
assert.equal(ready.manual.length, 1);
assert.equal(evolutionReadiness({ conditions: [{ type: "level", value: 6 }] }, { level: 5 }).available, false);

console.log("Progression validation passed.");
