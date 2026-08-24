import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EFFECT_ICON_SLOTS, customEffectIconPath, pokemonEffectIcon } from "../core/effect-icons.mjs";

assert.deepEqual(Object.keys(EFFECT_ICON_SLOTS), ["statuses", "buffs", "debuffs"]);
assert.equal(EFFECT_ICON_SLOTS.statuses.length, 8);
assert.equal(EFFECT_ICON_SLOTS.buffs.length, 105);
assert.equal(EFFECT_ICON_SLOTS.debuffs.length, 149);

for (const [category, ids] of Object.entries(EFFECT_ICON_SLOTS)) {
  assert.equal(new Set(ids).size, ids.length, `Hay nombres duplicados en ${category}`);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(customEffectIconPath(category, id), `modules/poke5e-foundry/assets/icons/effects/${category}/${id}.png`);
    const png = readFileSync(new URL(`../../assets/icons/effects/${category}/${id}.png`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${category}/${id} no es un PNG válido`);
    assert.equal(png.readUInt32BE(16), 32, `${category}/${id} no mide 32 px de ancho`);
    assert.equal(png.readUInt32BE(20), 32, `${category}/${id} no mide 32 px de alto`);
    assert.equal(png[25], 6, `${category}/${id} no conserva un canal alfa RGBA`);
  }
}

assert.equal(pokemonEffectIcon("statuses", "burned", "icons/svg/fire.svg"), customEffectIconPath("statuses", "burned"));
assert.equal(pokemonEffectIcon("debuffs", "unknown-effect", "icons/svg/downgrade.svg"), "icons/svg/downgrade.svg");
for (const category of Object.keys(EFFECT_ICON_SLOTS)) {
  const readme = readFileSync(new URL(`../../assets/icons/effects/${category}/README.md`, import.meta.url), "utf8");
  const documented = [...readme.matchAll(/`([a-z0-9-]+)\.png`/g)].map(match => match[1]).sort();
  assert.deepEqual(documented, [...EFFECT_ICON_SLOTS[category]].sort(), `El README de ${category} no coincide con los huecos del código`);
}
console.log("Validated 262 effect icons, their dimensions, transparency, slots, and fallback behavior.");
