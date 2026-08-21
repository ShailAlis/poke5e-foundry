import assert from "node:assert/strict";
import { isBerryHeldItem, swapHeldItems } from "../combat/item-swap.mjs";

assert.deepEqual(swapHeldItems({ name: "Sitrus Berry" }, { name: "Leftovers" }), {
  nextSourceHeldItem: { name: "Leftovers" },
  nextTargetHeldItem: { name: "Sitrus Berry" }
});
assert.deepEqual(swapHeldItems(null, { name: "Leftovers" }), { nextSourceHeldItem: { name: "Leftovers" }, nextTargetHeldItem: null });
assert.deepEqual(swapHeldItems({ name: "Sitrus Berry" }, null), { nextSourceHeldItem: null, nextTargetHeldItem: { name: "Sitrus Berry" } });
assert.deepEqual(swapHeldItems(null, null), { nextSourceHeldItem: null, nextTargetHeldItem: null });

assert.equal(isBerryHeldItem("oran-berry"), true);
assert.equal(isBerryHeldItem("Oran-Berry"), true, "No distingue mayúsculas");
assert.equal(isBerryHeldItem("leftovers"), false);
assert.equal(isBerryHeldItem(undefined), false);

console.log("Item swap validation passed.");
