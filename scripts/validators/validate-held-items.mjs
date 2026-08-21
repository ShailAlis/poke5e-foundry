/**
 * Validador de held-items.mjs, ejecutado por `npm run check`. Comprueba que las
 * tablas apunten a objetos reales del catálogo y fija casos representativos de
 * bayas, cargas, mitigación de PG, cambios de tipo/movimiento, ajustes de actor,
 * modificadores de tirada y bloqueos de objetos Elegidos.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  HEALING_BERRIES,
  RESISTANCE_BERRY_TYPES,
  STATUS_BERRIES,
  choiceHeldItemAllowsMove,
  healingBerryReaction,
  heldItemActorAdjustments,
  heldItemEffectiveMove,
  heldItemEffectiveTypes,
  heldItemHpResolution,
  heldItemInitialCharges,
  heldItemMoveModifiers,
  moveCriticalRangeExtension,
  statusBerryMatches
} from "../pokemon/held-items.mjs";

const items = JSON.parse(fs.readFileSync(new URL("../../data/items.json", import.meta.url))).items;
const byId = new Map(items.map(item => [String(item.id).toLocaleLowerCase(), item]));

for (const id of [...Object.keys(STATUS_BERRIES), ...Object.keys(HEALING_BERRIES), ...Object.keys(RESISTANCE_BERRY_TYPES)]) {
  assert.ok(byId.has(id), `${id}: missing berry definition`);
}

assert.equal(statusBerryMatches("pecha-berry", "badly-poisoned"), true);
assert.equal(statusBerryMatches("lum-berry", "confused"), true);
assert.equal(statusBerryMatches("cheri-berry", "burned"), false);

assert.deepEqual(healingBerryReaction({ sourceId: "oran-berry", previousHp: 30, nextHp: 20, maximumHp: 50 }), {
  formula: "2d4 + 2", threshold: 0.5, sourceId: "oran-berry"
});
assert.equal(healingBerryReaction({ sourceId: "oran-berry", previousHp: 20, nextHp: 10, maximumHp: 50 }), null);

const eviolite = heldItemHpResolution({ sourceId: "eviolite", previousHp: 12, nextHp: 4, maximumHp: 20, hasEvolution: true });
assert.equal(eviolite.hp, 7);
assert.equal(eviolite.events[0].amount, 3);
const sash = heldItemHpResolution({ sourceId: "focus-sash", charges: 1, previousHp: 12, nextHp: 0, maximumHp: 20 });
assert.equal(sash.hp, 1);
assert.equal(sash.charges, 0);
const balloon = heldItemHpResolution({ sourceId: "air-balloon", charges: 1, previousHp: 12, nextHp: 8, maximumHp: 20 });
assert.equal(balloon.charges, 0);

assert.equal(heldItemInitialCharges("leftovers"), 10);
assert.equal(heldItemInitialCharges("eject-button"), 1);
assert.equal(heldItemInitialCharges("Steelium-z"), 1);
assert.equal(heldItemActorAdjustments({ sourceId: "metal-powder", speciesId: "ditto" }).ac, 3);
assert.equal(heldItemActorAdjustments({ sourceId: "quick-claw", speciesId: "pikachu" }).initiative, 3);

assert.deepEqual(heldItemEffectiveTypes({ sourceId: "flame-plate", speciesId: "arceus", baseTypes: ["normal"] }), ["fire"]);
assert.deepEqual(heldItemEffectiveTypes({ sourceId: "water-memory-disc", speciesId: "silvally", baseTypes: ["normal"], abilities: ["rks-system"] }), ["water"]);
assert.equal(heldItemEffectiveMove({ id: "techno-blast", type: "normal", damage: { type: "normal" } }, { sourceId: "burn-drive", speciesId: "genesect" }).type, "fire");

const boosted = heldItemMoveModifiers({ sourceId: "charcoal", speciesId: "charmander", speciesTypes: ["fire"], move: { type: "fire", attack: { scope: "ranged" } }, proficiency: 3, hasDamage: true });
assert.equal(boosted.damage, 3);
assert.equal(heldItemMoveModifiers({ sourceId: "wide-lens", move: { attack: { scope: "ranged" } }, hasDamage: true }).attack, 1);
assert.equal(heldItemMoveModifiers({ sourceId: "assault-vest", move: {}, hasDamage: false }).allowed, false);
assert.equal(heldItemMoveModifiers({ sourceId: "leek", speciesId: "galarian-farfetchd", move: {}, hasDamage: true }).criticalRange, 2);
assert.equal(heldItemMoveModifiers({ sourceId: "griseous-orb", speciesId: "giratina-origin-forme", move: { type: "ghost" }, hasDamage: true }).stab, 2);
assert.equal(moveCriticalRangeExtension({ description: ["This move scores a critical hit on 19 and 20."] }), 1);
assert.equal(heldItemMoveModifiers({ sourceId: "scope-lens", move: { description: ["This move scores a critical hit on 19 and 20."] }, hasDamage: true }).criticalRange, 2);
assert.equal(choiceHeldItemAllowsMove({ sourceId: "choice-band", state: { choiceMoveId: "ember" } }, "water-gun"), false);

console.log(`Held-item validation passed for ${items.length} catalog objects.`);
