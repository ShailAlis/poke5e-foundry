import assert from "node:assert/strict";
import { isMoveTargetInRange, moveMaximumRange } from "../combat/move-range.mjs";

const melee = { range: "melee", attack: { scope: "melee" } };
const ranged = { range: "30ft", attack: { scope: "ranged" } };
assert.equal(moveMaximumRange(melee), 5);
assert.equal(moveMaximumRange(ranged), 30);
assert.equal(moveMaximumRange({ range: "self (50ft line)", attack: { scope: "ranged" } }), 50);
assert.equal(moveMaximumRange({ range: "self" }), null);
assert.equal(isMoveTargetInRange(melee, 5), true);
assert.equal(isMoveTargetInRange(melee, 10), false);
assert.equal(isMoveTargetInRange(ranged, 30), true);
assert.equal(isMoveTargetInRange(ranged, 35), false);

console.log("Move range validation passed.");
