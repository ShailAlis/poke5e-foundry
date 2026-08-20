import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EFFECT_ICON_SLOTS, customEffectIconPath, pokemonEffectIcon } from "./effect-icons.mjs";

assert.deepEqual(Object.keys(EFFECT_ICON_SLOTS), ["statuses", "buffs", "debuffs"]);
assert.equal(EFFECT_ICON_SLOTS.statuses.length, 8);
assert.equal(EFFECT_ICON_SLOTS.buffs.length, 105);
assert.equal(EFFECT_ICON_SLOTS.debuffs.length, 149);

for (const [category, ids] of Object.entries(EFFECT_ICON_SLOTS)) {
  assert.equal(new Set(ids).size, ids.length, `Hay nombres duplicados en ${category}`);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(customEffectIconPath(category, id), `modules/poke5e-foundry/assets/icons/effects/${category}/${id}.png`);
  }
}

assert.equal(pokemonEffectIcon("statuses", "burned", "icons/svg/fire.svg"), "icons/svg/fire.svg");
for (const category of Object.keys(EFFECT_ICON_SLOTS)) {
  const readme = readFileSync(new URL(`../assets/icons/effects/${category}/README.md`, import.meta.url), "utf8");
  const documented = [...readme.matchAll(/`([a-z0-9-]+)\.png`/g)].map(match => match[1]).sort();
  assert.deepEqual(documented, [...EFFECT_ICON_SLOTS[category]].sort(), `El README de ${category} no coincide con los huecos del código`);
}
console.log("Validated 262 optional effect icon slots and their fallback behavior.");
