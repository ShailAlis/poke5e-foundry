import assert from "node:assert/strict";
import { accumulateBideDamage, releaseBideDamage } from "./bide.mjs";

assert.equal(accumulateBideDamage(0, 5), 5);
assert.equal(accumulateBideDamage(5, 3), 8);
assert.equal(accumulateBideDamage(undefined, 4), 4);
assert.equal(accumulateBideDamage(5, -3), 5, "Ignora pérdidas negativas (curación) al acumular");

assert.equal(releaseBideDamage(8), 16);
assert.equal(releaseBideDamage(0), 0);

console.log("Bide validation passed.");
