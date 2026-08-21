/**
 * Intercambio de objetos equipados entre dos Pokémon (Truco, Robo): swapHeldItems()
 * calcula el resultado puro y pokemon-sheet.mjs lo aplica por el mismo patrón
 * de socket delegado al director que usan status-effects.mjs y hp-effects.mjs,
 * porque el Pokémon objetivo normalmente no pertenece a quien tira el
 * movimiento.
 */
import { MODULE_ID } from "./model.mjs";

const SOCKET_ACTION = "applyHeldItemSwap";

/** Calcula el resultado del intercambio: el objetivo se queda con el objeto propio (o ninguno). */
export function swapHeldItems(sourceHeldItem, targetHeldItem) {
  return { nextSourceHeldItem: targetHeldItem ?? null, nextTargetHeldItem: sourceHeldItem ?? null };
}

const DESTROY_SOCKET_ACTION = "applyHeldItemDestroy";
const KNOCKED_OFF_FLAG = "knockedOffHeldItem";

/** Cualquier objeto cuyo id termine en "-berry" se considera una baya (Chamusca, Ladronzuelo/Picoteo). */
export function isBerryHeldItem(sourceId) {
  return String(sourceId ?? "").toLocaleLowerCase().endsWith("-berry");
}

export function registerItemSwap() {
  game.socket.on(`module.${MODULE_ID}`, payload => {
    if (!isResponsibleGm()) return;
    if (payload?.action === SOCKET_ACTION) completeItemSwap(payload).catch(error => console.error(`${MODULE_ID} | Held item swap failed`, error));
    else if (payload?.action === DESTROY_SOCKET_ACTION) completeItemDestroy(payload).catch(error => console.error(`${MODULE_ID} | Held item destroy failed`, error));
  });
  Hooks.on("deleteCombat", combat => {
    if (!isResponsibleGm()) return;
    restoreKnockedOffItems(combat).catch(error => console.error(`${MODULE_ID} | Knocked-off item restore failed`, error));
  });
}

/**
 * Destruye (Chamusca) o retira temporalmente hasta el fin del combate
 * (Robo/Golpe Bajo... Knock Off) el objeto equipado de un objetivo ajeno. Con
 * `restoreAfterCombat: true` guarda el objeto en una bandera del propio Item
 * para devolverlo cuando termine el combate (deleteCombat, arriba); sin ella
 * se pierde para siempre, como Chamusca.
 */
export async function requestHeldItemDestroy({ targetActor, sourceName, targetName, restoreAfterCombat = false }) {
  const targetPokemonItem = await pokemonItemForActor(targetActor);
  if (!targetPokemonItem) return;
  const payload = { action: DESTROY_SOCKET_ACTION, userId: game.user.id, targetPokemonItemUuid: targetPokemonItem.uuid, sourceName, targetName, restoreAfterCombat };
  if (game.user.isGM || targetActor.canUserModify(game.user, "update")) await completeItemDestroy(payload);
  else {
    game.socket.emit(`module.${MODULE_ID}`, payload);
    ui.notifications.info(game.i18n.format("POKE5E.MoveEffects.ModifierRequested", { move: sourceName }));
  }
}

async function completeItemDestroy(payload) {
  const requester = game.users.get(payload.userId);
  if (!requester?.active) return;
  const targetItem = await fromUuid(payload.targetPokemonItemUuid);
  if (targetItem?.documentName !== "Item") return;
  const instance = foundry.utils.deepClone(targetItem.getFlag(MODULE_ID, "instance") ?? {});
  if (!instance.heldItem) return;
  const removed = instance.heldItem;
  instance.heldItem = null;
  const updates = { [`flags.${MODULE_ID}.instance`]: instance };
  if (payload.restoreAfterCombat) updates[`flags.${MODULE_ID}.${KNOCKED_OFF_FLAG}`] = removed;
  await targetItem.update(updates);
  const verb = payload.restoreAfterCombat ? "pierde su objeto equipado hasta el final del combate" : "ve su objeto equipado reducido a cenizas";
  await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(payload.targetName)}</strong> ${verb} por <strong>${escapeHtml(payload.sourceName)}</strong>.</p></div>` });
}

/** Devuelve los objetos retirados por Knock Off a quienes los perdieron cuando termina el combate. */
async function restoreKnockedOffItems(combat) {
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    const pokemonItem = await pokemonItemForActor(actor);
    const knockedOff = pokemonItem?.getFlag(MODULE_ID, KNOCKED_OFF_FLAG);
    if (!pokemonItem || !knockedOff) continue;
    const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
    if (!instance.heldItem) instance.heldItem = knockedOff;
    await pokemonItem.update({ [`flags.${MODULE_ID}.instance`]: instance, [`flags.${MODULE_ID}.-=${KNOCKED_OFF_FLAG}`]: null });
  }
}

/**
 * Pide el intercambio de objetos equipados entre el Pokémon que usa el
 * movimiento y un objetivo seleccionado. Lo llama pokemon-sheet.mjs tras
 * confirmar el impacto (Trick) o la salvación fallida (Switcheroo).
 */
export async function requestHeldItemSwap({ sourcePokemonItem, targetActor, sourceName, targetName }) {
  const targetPokemonItem = await pokemonItemForActor(targetActor);
  if (!targetPokemonItem) return;
  const payload = {
    action: SOCKET_ACTION, userId: game.user.id,
    sourcePokemonItemUuid: sourcePokemonItem.uuid, targetPokemonItemUuid: targetPokemonItem.uuid,
    sourceName, targetName
  };
  if (game.user.isGM || (sourcePokemonItem.parent?.isOwner && targetActor.canUserModify(game.user, "update"))) await completeItemSwap(payload);
  else {
    game.socket.emit(`module.${MODULE_ID}`, payload);
    ui.notifications.info(game.i18n.format("POKE5E.MoveEffects.ModifierRequested", { move: sourceName }));
  }
}

async function completeItemSwap(payload) {
  const requester = game.users.get(payload.userId);
  if (!requester?.active) return;
  const sourceItem = await fromUuid(payload.sourcePokemonItemUuid);
  const targetItem = await fromUuid(payload.targetPokemonItemUuid);
  if (sourceItem?.documentName !== "Item" || targetItem?.documentName !== "Item") return;
  if (!sourceItem.parent?.testUserPermission(requester, "OWNER")) return;
  const sourceInstance = foundry.utils.deepClone(sourceItem.getFlag(MODULE_ID, "instance") ?? {});
  const targetInstance = foundry.utils.deepClone(targetItem.getFlag(MODULE_ID, "instance") ?? {});
  const { nextSourceHeldItem, nextTargetHeldItem } = swapHeldItems(sourceInstance.heldItem ?? null, targetInstance.heldItem ?? null);
  sourceInstance.heldItem = nextSourceHeldItem;
  targetInstance.heldItem = nextTargetHeldItem;
  await sourceItem.setFlag(MODULE_ID, "instance", sourceInstance);
  await targetItem.setFlag(MODULE_ID, "instance", targetInstance);
  await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(payload.sourceName)}</strong> y <strong>${escapeHtml(payload.targetName)}</strong> intercambian objetos equipados.</p></div>` });
}

async function pokemonItemForActor(actor) {
  const uuid = actor?.getFlag(MODULE_ID, "pokemonItemUuid");
  if (uuid) return fromUuid(uuid);
  return actor?.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? null;
}

function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
function isResponsibleGm() {
  const active = game.users.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return active[0]?.id === game.user.id;
}
