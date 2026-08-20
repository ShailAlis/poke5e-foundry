import assert from "node:assert/strict";
import { swapHeldItems } from "./item-swap.mjs";

assert.deepEqual(swapHeldItems({ name: "Sitrus Berry" }, { name: "Leftovers" }), {
  nextSourceHeldItem: { name: "Leftovers" },
  nextTargetHeldItem: { name: "Sitrus Berry" }
});
assert.deepEqual(swapHeldItems(null, { name: "Leftovers" }), { nextSourceHeldItem: { name: "Leftovers" }, nextTargetHeldItem: null });
assert.deepEqual(swapHeldItems({ name: "Sitrus Berry" }, null), { nextSourceHeldItem: null, nextTargetHeldItem: { name: "Sitrus Berry" } });
assert.deepEqual(swapHeldItems(null, null), { nextSourceHeldItem: null, nextTargetHeldItem: null });

console.log("Item swap validation passed.");
