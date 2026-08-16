import assert from "node:assert/strict";

globalThis.game = { settings: { get: () => "" }, packs: new Map() };
globalThis.foundry = { utils: { escapeHTML: String } };

const { hasTrainerPath, machineConsumption, machineUsesPerCopy, nurseHealingBonus, pokemonPathMoveBonuses, trainerControlBonus, trainerPathFeatCost } = await import("./trainer-path-rules.mjs");

assert.equal(machineUsesPerCopy("tm", false), 1);
assert.equal(machineUsesPerCopy("tm", true), 2);
assert.equal(machineUsesPerCopy("hm", false), Infinity);
assert.deepEqual(machineConsumption({ kind: "tm", quantity: 2 }), { quantity: 1, used: 0, consumed: true, delete: false });
assert.deepEqual(machineConsumption({ kind: "tm", quantity: 1, pokeMentor: true }), { quantity: 1, used: 1, consumed: false, delete: false });
assert.deepEqual(machineConsumption({ kind: "tm", quantity: 1, used: 1, pokeMentor: true }), { quantity: 0, used: 0, consumed: true, delete: true });
assert.deepEqual(machineConsumption({ kind: "hm", quantity: 1 }), { quantity: 1, used: 0, consumed: false, delete: false });

const mockItem = (type, system, flags = {}) => ({ type, system, getFlag: (module, key) => module === "poke5e-foundry" ? flags[key] : undefined });
const trainer = pathId => {
  const trainerClass = mockItem("class", { identifier: "trainer", levels: 9 }, { kind: "trainer-class" });
  const path = mockItem("subclass", { identifier: pathId, classIdentifier: "trainer" }, { kind: "trainer-path", pathId });
  const specialization = mockItem("feat", {}, { specializationType: "fire" });
  const items = [trainerClass, path, specialization];
  return { items, itemTypes: { class: [trainerClass], subclass: [path] }, system: { abilities: { wis: { mod: 3 } } }, getFlag: () => null };
};
assert.equal(hasTrainerPath(trainer("ace-trainer"), "ace-trainer", 2), true);
assert.deepEqual(pokemonPathMoveBonuses(trainer("ace-trainer"), ["water"], "water"), { attack: 1, damage: 1, stab: 0 });
assert.deepEqual(pokemonPathMoveBonuses(trainer("type-master"), ["fire"], "fire"), { attack: 2, damage: 0, stab: 1 });
assert.equal(nurseHealingBonus(trainer("nurse")), 3);
assert.equal(trainerControlBonus(trainer("guru")), 1);
assert.equal(trainerPathFeatCost(trainer("poke-mentor"), "Movimiento adicional", 2), 1);
assert.equal(trainerPathFeatCost(trainer("guru"), "Incansable", 2), 1);

console.log("Trainer Path rules validation passed.");
