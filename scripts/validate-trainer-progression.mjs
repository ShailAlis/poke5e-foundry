import assert from "node:assert/strict";
import { TRAINER_EXPERIENCE_LEVELS, trainerExperienceProgress, trainerLevelForExperience } from "./trainer-progression.mjs";

assert.equal(TRAINER_EXPERIENCE_LEVELS.length, 20);
assert.equal(trainerLevelForExperience(0), 1);
assert.equal(trainerLevelForExperience(299), 1);
assert.equal(trainerLevelForExperience(300), 2);
assert.equal(trainerLevelForExperience(6499), 4);
assert.equal(trainerLevelForExperience(6500), 5);
assert.equal(trainerLevelForExperience(999999), 20);

const waiting = trainerExperienceProgress(500, 2);
assert.equal(waiting.targetLevel, 2);
assert.equal(waiting.pendingLevels, 0);
assert.equal(waiting.remaining, 400);

const ready = trainerExperienceProgress(2700, 1);
assert.equal(ready.targetLevel, 4);
assert.equal(ready.pendingLevels, 3);
assert.equal(ready.percent, 100);

console.log("Trainer experience and class-advancement validation passed.");
