import assert from "node:assert/strict";
import { EFFECT_ICON_SLOTS, customEffectIconPath, pokemonEffectIcon } from "./effect-icons.mjs";

assert.deepEqual(Object.keys(EFFECT_ICON_SLOTS), ["statuses", "buffs", "debuffs"]);
assert.equal(EFFECT_ICON_SLOTS.statuses.length, 8);
assert.equal(EFFECT_ICON_SLOTS.buffs.length, 4);
assert.equal(EFFECT_ICON_SLOTS.debuffs.length, 19);

for (const [category, ids] of Object.entries(EFFECT_ICON_SLOTS)) {
  assert.equal(new Set(ids).size, ids.length, `Hay nombres duplicados en ${category}`);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(customEffectIconPath(category, id), `modules/poke5e-foundry/assets/icons/effects/${category}/${id}.png`);
  }
}

assert.equal(pokemonEffectIcon("statuses", "burned", "icons/svg/fire.svg"), "icons/svg/fire.svg");
console.log("Validated 31 optional effect icon slots and their fallback behavior.");
