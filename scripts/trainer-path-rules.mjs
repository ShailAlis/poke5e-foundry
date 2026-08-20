/** Reglas compartidas de los Caminos de Entrenador. */
import { MODULE_ID, trainerLevel } from "./model.mjs";

export { trainerLevel };

export function trainerPathId(actor) {
  if (!actor) return null;
  const subclasses = actor.itemTypes?.subclass ?? [...(actor.items ?? [])].filter(item => item.type === "subclass");
  const path = subclasses.find(item => item.system?.classIdentifier === "trainer" || item.getFlag?.(MODULE_ID, "kind") === "trainer-path");
  return path?.getFlag?.(MODULE_ID, "pathId") ?? path?.system?.identifier ?? null;
}

export function hasTrainerPath(actor, pathId, minimumLevel = 2) {
  return trainerPathId(actor) === pathId && trainerLevel(actor) >= minimumLevel;
}

export function trainerSpecializationTypes(actor) {
  const result = new Set();
  const initial = actor?.getFlag?.(MODULE_ID, "trainerCreation")?.specialization;
  if (initial) result.add(String(initial).toLocaleLowerCase());
  for (const item of actor?.items ?? []) {
    const type = item.getFlag?.(MODULE_ID, "specializationType");
    if (type) result.add(String(type).toLocaleLowerCase());
  }
  return result;
}

export function pokemonPathMoveBonuses(actor, pokemonTypes = [], moveType = "", { healing = false } = {}) {
  const types = new Set((pokemonTypes ?? []).map(type => String(type).toLocaleLowerCase()));
  const specialized = trainerSpecializationTypes(actor);
  const matchesSpecialization = [...specialized].some(type => types.has(type));
  const moveMatchesPokemon = types.has(String(moveType).toLocaleLowerCase());
  return {
    attack: (hasTrainerPath(actor, "ace-trainer", 2) ? 1 : 0) + (hasTrainerPath(actor, "type-master", 5) && matchesSpecialization ? 2 : 0),
    damage: !healing && hasTrainerPath(actor, "ace-trainer", 2) ? 1 : healing ? nurseHealingBonus(actor) : 0,
    stab: !healing && hasTrainerPath(actor, "type-master", 2) && matchesSpecialization && moveMatchesPokemon
      ? [...specialized].filter(type => types.has(type)).length
      : 0
  };
}

export function machineUsesPerCopy(kind, pokeMentor = false) {
  if (String(kind).toLocaleLowerCase() === "hm") return Infinity;
  return pokeMentor ? 2 : 1;
}

export function machineConsumption({ kind, quantity = 1, used = 0, pokeMentor = false } = {}) {
  const copies = Math.max(0, Math.trunc(Number(quantity) || 0));
  const uses = machineUsesPerCopy(kind, pokeMentor);
  if (!copies || uses === Infinity) return { quantity: copies, used: Math.max(0, Number(used) || 0), consumed: false, delete: false };
  const nextUsed = Math.max(0, Math.trunc(Number(used) || 0)) + 1;
  if (nextUsed < uses) return { quantity: copies, used: nextUsed, consumed: false, delete: false };
  const nextQuantity = copies - 1;
  return { quantity: nextQuantity, used: 0, consumed: true, delete: nextQuantity <= 0 };
}

export function trainerControlBonus(actor) {
  return hasTrainerPath(actor, "guru", 2) ? 1 : 0;
}

export function nurseHealingBonus(actor) {
  if (!hasTrainerPath(actor, "nurse", 2)) return 0;
  return Math.max(1, Number(actor.system?.abilities?.wis?.mod) || 0);
}

/** Indica si featName se beneficia del descuento a 1 punto (Poké Mentor 5 / Guru 9). */
export function trainerPathFeatDiscount(actor, featName) {
  const normalized = String(featName ?? "").trim().toLocaleLowerCase();
  if (hasTrainerPath(actor, "poke-mentor", 5) && ["extra move", "movimiento adicional"].includes(normalized)) return true;
  if (hasTrainerPath(actor, "guru", 9) && ["tireless", "incansable"].includes(normalized)) return true;
  return false;
}

export function trainerPathFeatCost(actor, featName, defaultCost = 2) {
  const cost = Math.max(0, Number(defaultCost) || 0);
  if (cost && trainerPathFeatDiscount(actor, featName)) return Math.min(1, cost);
  return cost;
}
