/**
 * Rastro de acciones recientes que algunos movimientos consultan sobre sí
 * mismos o sobre el objetivo:
 *
 * - `damagedSinceLastTurn`: si el usuario ha recibido daño desde que acabó su
 *   último turno (Payback/Avalanche). El texto original exige que sea
 *   concretamente el objetivo quien lo golpeó, pero este proyecto no rastrea
 *   la identidad de quien inflige cada golpe (mismo límite que Vínculo
 *   Destino), así que se aproxima a "cualquier daño recibido desde entonces".
 * - `damagedThisRound`: si el objetivo ya ha recibido daño en la ronda actual
 *   (Certeza), reiniciado al empezar cada ronda nueva.
 * - `lastAttackMissed`: si la última tirada de ataque del propio usuario
 *   falló (Berrinche Pisotón, Bengala Cansada). Se actualiza directamente en
 *   pokemon-sheet.mjs justo después de resolver cada ataque, no aquí.
 *
 * "El objetivo no usó un movimiento de ataque en su último turno" (Pico
 * Trueno, Colmillo Rayo) no necesita nada de este archivo: ya se responde
 * consultando instance.lastMoveId, que pokemon-sheet.mjs actualiza en cada
 * uso de movimiento.
 */
import { MODULE_ID } from "../core/model.mjs";

export function registerCombatHistory() {
  Hooks.on("preUpdateActor", (actor, changes) => monitorDamageForHistory(actor, changes));
  Hooks.on("combatTurnChange", (combat, prior) => {
    if (!isResponsibleGm()) return;
    const previousActor = prior?.combatantId ? combat.combatants.get(prior.combatantId)?.actor : null;
    if (previousActor) clearHistoryFlag(previousActor, "damagedSinceLastTurn").catch(error => console.error(`${MODULE_ID} | Combat history turn reset failed`, error));
  });
  Hooks.on("combatRound", combat => {
    if (!isResponsibleGm()) return;
    for (const combatant of combat.combatants) {
      if (combatant.actor) clearHistoryFlag(combatant.actor, "damagedThisRound").catch(error => console.error(`${MODULE_ID} | Combat history round reset failed`, error));
    }
  });
}

function monitorDamageForHistory(actor, changes) {
  const pendingHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  const currentHp = Number(actor.system.attributes?.hp?.value);
  if (pendingHp == null || !Number.isFinite(currentHp) || Number(pendingHp) >= currentHp) return;
  setTimeout(() => markDamaged(actor).catch(error => console.error(`${MODULE_ID} | Combat history damage tracking failed`, error)), 0);
}

async function markDamaged(actor) {
  const pokemonItem = await pokemonItemForActor(actor);
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  if (!instance) return;
  const next = foundry.utils.deepClone(instance);
  next.damagedSinceLastTurn = true;
  next.damagedThisRound = true;
  await pokemonItem.setFlag(MODULE_ID, "instance", next);
}

async function clearHistoryFlag(actor, flag) {
  const pokemonItem = await pokemonItemForActor(actor);
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  if (!instance?.[flag]) return;
  const next = foundry.utils.deepClone(instance);
  next[flag] = false;
  await pokemonItem.setFlag(MODULE_ID, "instance", next);
}

async function pokemonItemForActor(actor) {
  const uuid = actor?.getFlag?.(MODULE_ID, "pokemonItemUuid");
  if (uuid) return fromUuid(uuid);
  return actor?.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? null;
}

function isResponsibleGm() {
  const active = game.users.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return active[0]?.id === game.user.id;
}
