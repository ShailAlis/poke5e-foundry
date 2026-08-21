/** Reglas compartidas de los Caminos de Entrenador. */
import { MODULE_ID, trainerLevel } from "../core/model.mjs";

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

/**
 * Tipo elegido para Almacenar poder (Type Master 9), o null si el
 * entrenador no tiene el rasgo o aún no ha elegido uno válido (tiene que
 * seguir siendo uno de sus tipos especializados actuales). Se guarda en el
 * flag `typeMasteryResistance` del propio entrenador, elegido desde su ficha.
 */
export function typeMasteryResistanceType(actor) {
  if (!hasTrainerPath(actor, "type-master", 9)) return null;
  const chosen = actor?.getFlag?.(MODULE_ID, "typeMasteryResistance");
  return chosen && trainerSpecializationTypes(actor).has(chosen) ? chosen : null;
}

/**
 * Aplica Almacenar poder (Type Master 9) a los rasgos dr/dv/di que ya
 * construye damageTraitsForPokemonTypes(): si el Pokémon coincide con alguna
 * especialización del entrenador, quita el tipo elegido de sus
 * vulnerabilidades y lo añade a sus resistencias (a menos que ya sea inmune).
 * Muta `traits` en el sitio, igual que ya hacen los ajustes de objeto
 * equipado justo antes en deployment.mjs. Solo se aplica al desplegar o
 * resincronizar el objeto equipado; un Pokémon ya desplegado no se actualiza
 * solo si el entrenador elige el rasgo o cambia el tipo más tarde.
 */
export function applyTypeMasteryDefense(traits, actor, pokemonTypes) {
  const chosen = typeMasteryResistanceType(actor);
  if (!chosen) return;
  const types = new Set((pokemonTypes ?? []).map(type => String(type).toLocaleLowerCase()));
  const specialized = trainerSpecializationTypes(actor);
  if (![...specialized].some(type => types.has(type))) return;
  traits.dv.value = traits.dv.value.filter(type => type !== chosen);
  if (!traits.di.value.includes(chosen) && !traits.dr.value.includes(chosen)) traits.dr.value.push(chosen);
}

/**
 * Liberar poder (Type Master 15): true si el entrenador tiene el rasgo y el
 * Pokémon coincide con alguna de sus especializaciones, sea cual sea el tipo
 * del movimiento. damageFormula() (pokemon-sheet.mjs) lo usa para saltarse su
 * comprobación normal de "el movimiento comparte tipo con el Pokémon" en el
 * modificador "MOVE + STAB".
 */
export function typeMasteryForcesStab(actor, pokemonTypes) {
  if (!hasTrainerPath(actor, "type-master", 15)) return false;
  const types = new Set((pokemonTypes ?? []).map(type => String(type).toLocaleLowerCase()));
  return [...trainerSpecializationTypes(actor)].some(type => types.has(type));
}

/**
 * Item Pokémon designado como compañero de Ranger 9/15 (flag `rangerCompanion`
 * en el entrenador, elegido desde su ficha), o null si no hay rasgo o el
 * elegido ya no pertenece al entrenador. El texto dice "tras cada descanso
 * largo eliges un compañero"; aquí se simplifica a "el elegido se mantiene
 * hasta que lo cambies", igual que otras simplificaciones de "una vez por
 * descanso" ya documentadas en el proyecto (p. ej. las bayas).
 */
export function rangerCompanionItem(actor) {
  if (!hasTrainerPath(actor, "ranger", 9)) return null;
  const id = actor?.getFlag?.(MODULE_ID, "rangerCompanion");
  if (!id) return null;
  const item = actor.items?.get(id);
  return item?.getFlag?.(MODULE_ID, "kind") === "pokemon" ? item : null;
}

/** Tipos del compañero de Ranger, en minúsculas. Vacío si no hay compañero. */
export function rangerCompanionTypes(actor) {
  const item = rangerCompanionItem(actor);
  return new Set((item?.getFlag(MODULE_ID, "species")?.type ?? []).map(type => String(type).toLocaleLowerCase()));
}

/**
 * Compañero (Ranger 9): modificador de Sabiduría del entrenador a los ataques
 * del propio compañero contra Pokémon salvajes. La mitad de "pruebas de
 * habilidad" del texto original queda sin automatizar: no hay tirada de
 * prueba de habilidad de Pokémon en este módulo.
 */
export function rangerCompanionAttackBonus(actor, pokemonItem, targetsAreWild) {
  const companion = rangerCompanionItem(actor);
  if (!companion || !pokemonItem || companion.id !== pokemonItem.id || !targetsAreWild) return 0;
  return Math.max(0, Number(actor.system?.abilities?.wis?.mod) || 0);
}

/**
 * Compañero (Ranger 9): modificador de Sabiduría del entrenador a las
 * pruebas de habilidad del propio compañero (sin la restricción "contra
 * salvajes" que sí tienen sus ataques, porque el texto original no la pone
 * para esta parte).
 */
export function rangerCompanionCheckBonus(actor, pokemonItem) {
  const companion = rangerCompanionItem(actor);
  if (!companion || !pokemonItem || companion.id !== pokemonItem.id) return 0;
  return Math.max(0, Number(actor.system?.abilities?.wis?.mod) || 0);
}

/** Poké Assist (Ranger 15): ventaja en un ataque cuyo tipo coincida con el del compañero. */
export function rangerAssistAdvantage(actor, moveType) {
  if (!hasTrainerPath(actor, "ranger", 15)) return false;
  return rangerCompanionTypes(actor).has(String(moveType ?? "").toLocaleLowerCase());
}

/** Poké Assist (Ranger 15): ventaja al capturar un Pokémon de algún tipo del compañero. */
export function rangerCaptureAdvantage(actor, targetTypes) {
  if (!hasTrainerPath(actor, "ranger", 15)) return false;
  const companionTypes = rangerCompanionTypes(actor);
  if (!companionTypes.size) return false;
  return (targetTypes ?? []).map(type => String(type).toLocaleLowerCase()).some(type => companionTypes.has(type));
}

/**
 * Maestría táctica (Ace Trainer 9): característica elegida (flag
 * `aceTrainerAbility` del entrenador, un desplegable en su ficha) que suma +1
 * a la puntuación de esa característica de TODOS sus Pokémon, incluidos los
 * que capture después. Igual que la competencia en Sabiduría de Guru 5, se
 * aplica en deployedActorSource() (deployment.mjs) al calcular las
 * características del actor de combate en vez de escribirla en
 * `instance.attributes`: así cubre solo con el flag del entrenador tanto al
 * equipo ya capturado como a cualquier futuro, sin tener que tocar cada punto
 * donde se crea un Pokémon ni preocuparse de revertir nada si cambia la
 * elección más adelante.
 */
export function aceTrainerAbilityBonus(actor, key) {
  if (!hasTrainerPath(actor, "ace-trainer", 9)) return 0;
  return actor?.getFlag?.(MODULE_ID, "aceTrainerAbility") === key ? 1 : 0;
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
