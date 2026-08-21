import assert from "node:assert/strict";

globalThis.game = { settings: { get: () => "" }, packs: new Map() };
globalThis.foundry = { utils: { escapeHTML: String } };

const { applyTypeMasteryDefense, hasTrainerPath, machineConsumption, machineUsesPerCopy, nurseHealingBonus, pokemonPathMoveBonuses, trainerControlBonus, trainerPathFeatCost, trainerPathFeatDiscount, typeMasteryForcesStab, typeMasteryResistanceType } = await import("../trainer/trainer-path-rules.mjs");

assert.equal(machineUsesPerCopy("tm", false), 1);
assert.equal(machineUsesPerCopy("tm", true), 2);
assert.equal(machineUsesPerCopy("hm", false), Infinity);
assert.deepEqual(machineConsumption({ kind: "tm", quantity: 2 }), { quantity: 1, used: 0, consumed: true, delete: false });
assert.deepEqual(machineConsumption({ kind: "tm", quantity: 1, pokeMentor: true }), { quantity: 1, used: 1, consumed: false, delete: false });
assert.deepEqual(machineConsumption({ kind: "tm", quantity: 1, used: 1, pokeMentor: true }), { quantity: 0, used: 0, consumed: true, delete: true });
assert.deepEqual(machineConsumption({ kind: "hm", quantity: 1 }), { quantity: 1, used: 0, consumed: false, delete: false });

const mockItem = (type, system, flags = {}) => ({ type, system, getFlag: (module, key) => module === "poke5e-foundry" ? flags[key] : undefined });
const trainer = (pathId, { level = 9, actorFlags = {} } = {}) => {
  const trainerClass = mockItem("class", { identifier: "trainer", levels: level }, { kind: "trainer-class" });
  const path = mockItem("subclass", { identifier: pathId, classIdentifier: "trainer" }, { kind: "trainer-path", pathId });
  const specialization = mockItem("feat", {}, { specializationType: "fire" });
  const items = [trainerClass, path, specialization];
  return { items, itemTypes: { class: [trainerClass], subclass: [path] }, system: { abilities: { wis: { mod: 3 } } }, getFlag: (module, key) => module === "poke5e-foundry" ? actorFlags[key] ?? null : null };
};
assert.equal(hasTrainerPath(trainer("ace-trainer"), "ace-trainer", 2), true);
assert.deepEqual(pokemonPathMoveBonuses(trainer("ace-trainer"), ["water"], "water"), { attack: 1, damage: 1, stab: 0 });
assert.deepEqual(pokemonPathMoveBonuses(trainer("type-master"), ["fire"], "fire"), { attack: 2, damage: 0, stab: 1 });
assert.equal(nurseHealingBonus(trainer("nurse")), 3);
assert.equal(trainerControlBonus(trainer("guru")), 1);
assert.equal(trainerPathFeatCost(trainer("poke-mentor"), "Movimiento adicional", 2), 1);
assert.equal(trainerPathFeatCost(trainer("guru"), "Incansable", 2), 1);
assert.equal(trainerPathFeatDiscount(trainer("poke-mentor"), "Movimiento adicional"), true);
assert.equal(trainerPathFeatDiscount(trainer("poke-mentor"), "Incansable"), false);
// Sin puntos reservados el descuento no debe forzar un gasto que nadie pidió.
assert.equal(trainerPathFeatCost(trainer("poke-mentor"), "Movimiento adicional", 0), 0);

// Almacenar poder (Type Master 9): resistencia al tipo elegido para Pokémon
// de la especialización del entrenador (aquí, "fire").
const typeMaster9 = trainer("type-master", { level: 9, actorFlags: { typeMasteryResistance: "fire" } });
assert.equal(typeMasteryResistanceType(typeMaster9), "fire", "El tipo elegido debe ser una de las especializaciones (aquí, fire)");
assert.equal(typeMasteryResistanceType(trainer("type-master", { level: 9 })), null, "Sin tipo elegido no hay nada que aplicar");
assert.equal(typeMasteryResistanceType(trainer("type-master", { level: 9, actorFlags: { typeMasteryResistance: "water" } })), null, "El tipo elegido tiene que ser una especialización real");
assert.equal(typeMasteryResistanceType(trainer("type-master", { level: 2, actorFlags: { typeMasteryResistance: "fire" } })), null, "Hace falta el nivel 9, no basta con el 2");
const traits = { dr: { value: [] }, dv: { value: ["fire"] }, di: { value: [] } };
applyTypeMasteryDefense(traits, typeMaster9, ["fire"]);
assert.deepEqual(traits.dv.value, [], "La vulnerabilidad al tipo elegido desaparece");
assert.deepEqual(traits.dr.value, ["fire"], "Y pasa a ser una resistencia");
const untouchedTraits = { dr: { value: [] }, dv: { value: ["fire"] }, di: { value: [] } };
applyTypeMasteryDefense(untouchedTraits, typeMaster9, ["grass"]);
assert.deepEqual(untouchedTraits.dv.value, ["fire"], "Un Pokémon fuera de la especialización no se ve afectado");

// Liberar poder (Type Master 15): STAB aunque el movimiento no comparta tipo.
assert.equal(typeMasteryForcesStab(trainer("type-master", { level: 15 }), ["fire"]), true);
assert.equal(typeMasteryForcesStab(trainer("type-master", { level: 15 }), ["grass"]), false, "Fuera de la especialización no fuerza nada");
assert.equal(typeMasteryForcesStab(trainer("type-master", { level: 9 }), ["fire"]), false, "Hace falta el nivel 15");

console.log("Trainer Path rules validation passed.");
