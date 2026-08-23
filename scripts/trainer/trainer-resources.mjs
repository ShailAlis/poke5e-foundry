/**
 * Recursos de Camino de Entrenador que se gastan para modificar la tirada de
 * un Pokémon: dados de batalla (Ace Trainer), dados de habilidad (Hobbyist),
 * Puntos de Sombra (Grunt) y Puntos Tácticos (Tactician). El propio Item de
 * la dote que los concede (trainerPathFeatureSources() en model.mjs) ya lleva
 * un `system.uses.max` calculado por pathFeatureUses() y D&D 5e lo recupera
 * solo con los descansos declarados; este archivo solo lo lee y lo gasta.
 *
 * Vínculo y Cría (Commander, Pokémon Breeder) no tienen recurso aquí: sus
 * rasgos dependen de un suplemento opcional que este proyecto no implementa
 * (pathFeatureAutomation() los marca "supplement" en model.mjs).
 *
 * Lo consume pokemon-sheet.mjs en los puntos donde ya tira daño, curación o
 * salvaciones de un Pokémon.
 */
import { MODULE_ID } from "../core/model.mjs";
import { hasTrainerPath, trainerLevel } from "./trainer-path-rules.mjs";
import { confirmHeldItemReaction } from "../pokemon/held-items.mjs";

/** Camino → nivel al que se concede el recurso, característica que fija su tamaño y si es un dado o una reserva de puntos. */
const POOLS = Object.freeze({
  "ace-trainer": { grantLevel: 5, label: "Dado de batalla", ability: "dex", dice: true },
  hobbyist: { grantLevel: 5, label: "Dado de habilidad", ability: "wis", dice: true },
  grunt: { grantLevel: 2, label: "Punto de Sombra", points: true },
  tactician: { grantLevel: 2, label: "Punto Táctico", points: true },
  nurse: { grantLevel: 5, label: "Golosina preparada (Pokéchef)", heal: true },
  guru: { grantLevel: 15, label: "Uso de Espíritu", points: true }
});

/** Tamaño del dado de Ace Trainer/Hobbyist: d6 en su nivel base, d8 en 9, d10 en 15. */
function dieSize(level) {
  return level >= 15 ? "d10" : level >= 9 ? "d8" : "d6";
}

/** Curación de Pokéchef (Nurse): 2d4+2 en su nivel base, 3d10+6 en 9, 4d12+10 en 15. */
function pokechefFormula(level) {
  return level >= 15 ? "4d12+10" : level >= 9 ? "3d10+6" : "2d4+2";
}

/** Localiza el Item de dote que concede y guarda el recurso de un camino. */
function poolItem(trainer, pathId) {
  if (!POOLS[pathId] || !trainer) return null;
  return [...(trainer.items ?? [])].find(item => item.getFlag?.(MODULE_ID, "pathId") === pathId && Number(item.getFlag?.(MODULE_ID, "level")) === POOLS[pathId].grantLevel) ?? null;
}

/**
 * Estado legible del recurso de un camino: usos restantes, máximo, si es un
 * dado (con su fórmula `1dN` ya escalada por nivel) o una reserva de puntos.
 * Devuelve null si el entrenador no tiene el camino o el rasgo que lo concede.
 * La usa trainer-actor-sheet.mjs para mostrarlo y este mismo archivo antes de
 * ofrecer gastarlo.
 */
export function trainerResourceState(trainer, pathId) {
  const pool = POOLS[pathId];
  const item = poolItem(trainer, pathId);
  if (!pool || !item || !hasTrainerPath(trainer, pathId, pool.grantLevel)) return null;
  const max = Number(item.system.uses?.max) || 0;
  const spent = Number(item.system.uses?.spent) || 0;
  return {
    pathId, label: pool.label, itemId: item.id,
    remaining: Math.max(0, max - spent), max,
    points: Boolean(pool.points),
    formula: pool.dice ? `1${dieSize(trainerLevel(trainer))}` : pool.heal ? pokechefFormula(trainerLevel(trainer)) : null
  };
}

/** Gasta `amount` usos del recurso si hay suficientes; devuelve false sin tocar nada si no. */
export async function spendTrainerResource(trainer, pathId, amount = 1) {
  const item = poolItem(trainer, pathId);
  if (!item) return false;
  const max = Number(item.system.uses?.max) || 0;
  const spent = Number(item.system.uses?.spent) || 0;
  const cost = Math.max(1, Math.trunc(Number(amount) || 1));
  if (spent + cost > max) return false;
  await item.update({ "system.uses.spent": spent + cost });
  return true;
}

/**
 * Pregunta si se quiere gastar el recurso de un camino (con su estado
 * restante en el propio diálogo) y lo gasta si se confirma. Devuelve el
 * estado ya actualizado del recurso gastado, o null si no había recurso, no
 * quedaban usos o se canceló. Auxiliar central de todos los puntos de
 * pokemon-sheet.mjs que ofrecen esta mejora.
 */
export async function promptSpendTrainerResource(trainer, pathId, { title, prompt, cost = 1 } = {}) {
  const state = trainerResourceState(trainer, pathId);
  if (!state || state.remaining < cost) return null;
  const confirmed = await confirmHeldItemReaction(
    title ?? `${state.label} (${state.remaining}/${state.max})`,
    `<p>${prompt ?? `¿Gastar ${cost > 1 ? `${cost} ${state.label.toLocaleLowerCase()}s` : `un ${state.label.toLocaleLowerCase()}`}?`}</p>`
  );
  if (!confirmed) return null;
  if (!await spendTrainerResource(trainer, pathId, cost)) return null;
  return trainerResourceState(trainer, pathId);
}

/** Entradas de todos los recursos de camino que tiene un entrenador, para mostrarlas en su ficha. */
export function trainerResourceEntries(trainer) {
  return Object.keys(POOLS).map(pathId => trainerResourceState(trainer, pathId)).filter(Boolean);
}

/**
 * Ofrece el dado de habilidad de Hobbyist (1d6/1d8/1d10 según el nivel del
 * entrenador) para sumarlo a una salvación de Pokémon ya tirada, si su
 * entrenador tiene el camino y le quedan usos; se calla sin más si no. Vive
 * aquí (y no en status-effects.mjs, donde se usa) para que move-modifiers.mjs
 * pueda importarlo también sin crear un ciclo, ya que status-effects.mjs
 * importa de move-modifiers.mjs.
 */
export async function applyHobbyistSaveBoost(actor, total, abilityKey) {
  const pokemonItem = await pokemonItemForActor(actor);
  const trainer = pokemonItem?.parent?.type === "character" ? pokemonItem.parent : null;
  if (!trainer) return total;
  const state = trainerResourceState(trainer, "hobbyist");
  if (!state?.remaining) return total;
  const spent = await promptSpendTrainerResource(trainer, "hobbyist", { prompt: `¿Sumar un dado de habilidad (${state.formula}) a esta salvación de ${String(abilityKey).toUpperCase()}?` });
  if (!spent) return total;
  const bonus = await new Roll(state.formula).evaluate();
  await bonus.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — Dado de habilidad (Aficionado)` });
  return total + (Number(bonus.total) || 0);
}

/**
 * Ofrece Ventaja oscura (Grunt 5, 3 Puntos de Sombra) para dar ventaja a una
 * salvación de Pokémon antes de tirarla —hay que llamarla antes de construir
 * los dados de la tirada, no después—. Misma razón de ciclo de importación
 * que applyHobbyistSaveBoost(): la usan rollTargetSave() de status-effects.mjs
 * y rollModifierSave() de move-modifiers.mjs.
 */
export async function applyGruntSaveAdvantage(actor) {
  const pokemonItem = await pokemonItemForActor(actor);
  const trainer = pokemonItem?.parent?.type === "character" ? pokemonItem.parent : null;
  if (!trainer) return false;
  const spent = await promptSpendTrainerResource(trainer, "grunt", { cost: 3, title: "Ventaja oscura (Recluta 5)", prompt: `¿Gastar 3 Puntos de Sombra para dar ventaja a esta salvación de ${actor.name}?` });
  return Boolean(spent);
}

/**
 * Ofrece Esta vez no (Tactician 15): si la salvación ya es un éxito, deja al
 * entrenador de quien lanzó el movimiento (no de quien salva) subir la CD
 * hasta 5 puntos —1 Punto Táctico por punto— para convertirlo en fallo. Si no
 * hace falta ningún punto (ya ha fallado) o hacen falta más de 5, no ofrece
 * nada. Devuelve la CD final (la misma si no se gastó nada). Misma razón de
 * ciclo de importación que applyHobbyistSaveBoost(): la usan rollTargetSave()
 * de status-effects.mjs y rollModifierSave() de move-modifiers.mjs.
 */
export async function applyTacticianDcBoost(sourceActor, targetName, total, dc) {
  const trainer = sourceActor?.type === "character" ? sourceActor : null;
  if (!trainer || total < dc || !hasTrainerPath(trainer, "tactician", 15)) return dc;
  const needed = total - dc + 1;
  if (needed > 5) return dc;
  const spent = await promptSpendTrainerResource(trainer, "tactician", {
    cost: needed,
    title: "Esta vez no (Estratega 15)",
    prompt: `${targetName} supera la CD por ${total - dc}. ¿Gastar ${needed} Punto${needed === 1 ? "" : "s"} Táctico${needed === 1 ? "" : "s"} para que falle en su lugar?`
  });
  return spent ? dc + needed : dc;
}

/**
 * En plena forma (Nurse 15): true si el entrenador de este Pokémon tiene el
 * rasgo, para dar ventaja de verdad a sus salvaciones contra estados
 * negativos. A diferencia de Ventaja oscura (Grunt 5) es un rasgo pasivo sin
 * coste, así que no pregunta nada. Misma razón de ciclo de importación que
 * applyHobbyistSaveBoost(): la usan rollTargetSave() de status-effects.mjs,
 * rollModifierSave() de move-modifiers.mjs y rollSaveWithStatus() de
 * ongoing-effects.mjs (salvaciones de agarre/apresamiento).
 */
export async function applyNurseStatusSaveAdvantage(actor) {
  const pokemonItem = await pokemonItemForActor(actor);
  const trainer = pokemonItem?.parent?.type === "character" ? pokemonItem.parent : null;
  return Boolean(trainer && hasTrainerPath(trainer, "nurse", 15));
}

/**
 * Localiza el Item Pokémon que respalda a un actor: por el UUID que guarda un
 * desplegado o, si no lo hay, entre los Items embebidos de un salvaje. Copia
 * local de la misma función de status-effects.mjs/ongoing-effects.mjs, por la
 * misma razón de ciclo de importación que applyHobbyistSaveBoost().
 */
async function pokemonItemForActor(actor) {
  const uuid = actor?.getFlag?.(MODULE_ID, "pokemonItemUuid");
  if (uuid) return fromUuid(uuid);
  return actor?.items?.find(item => item.getFlag?.(MODULE_ID, "kind") === "pokemon") ?? null;
}
