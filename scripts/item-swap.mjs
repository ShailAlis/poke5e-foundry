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

export function registerItemSwap() {
  game.socket.on(`module.${MODULE_ID}`, payload => {
    if (payload?.action !== SOCKET_ACTION || !isResponsibleGm()) return;
    completeItemSwap(payload).catch(error => console.error(`${MODULE_ID} | Held item swap failed`, error));
  });
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
