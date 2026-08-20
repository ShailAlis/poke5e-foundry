/**
 * Cambios forzados de Pokémon en combate (Golpe Vuelta, Cola Dragón, U-Turn...):
 * reutiliza recallPokemon() de deployment.mjs para retirar al Pokémon propio,
 * y un socket delegado al director —mismo patrón que status-effects.mjs y
 * hp-effects.mjs— para retirar al de un objetivo que normalmente no pertenece
 * a quien tira el movimiento.
 */
import { MODULE_ID } from "./model.mjs";
import { recallPokemon } from "./deployment.mjs";

const SOCKET_ACTION = "applyForcedSwitch";

export function registerForcedSwitch() {
  game.socket.on(`module.${MODULE_ID}`, payload => {
    if (payload?.action !== SOCKET_ACTION || !isResponsibleGm()) return;
    completeForcedSwitch(payload).catch(error => console.error(`${MODULE_ID} | Forced switch failed`, error));
  });
}

/**
 * Retira al propio Pokémon del usuario tras un movimiento de "cambio libre"
 * (Golpe Vuelta, U-Turn, Chirrido Gélido...). Siempre pertenece a quien tira,
 * así que no necesita delegado de socket.
 */
export async function selfForcedSwitch(pokemonItem) {
  await recallPokemon(pokemonItem, { forced: true });
  ui.notifications.info(game.i18n.format("POKE5E.Notifications.ChooseNextPokemon", { name: pokemonItem.parent?.name ?? "" }));
}

/**
 * Fuerza el cambio del Pokémon objetivo (Circle Throw, Dragon Tail...). Los
 * salvajes solo reciben un aviso en el chat —el director decide si el
 * combate acaba ahí—; los de entrenador se retiran de verdad, localmente si
 * quien juega ya es dueño o por el director si no.
 */
export async function requestForcedSwitch(targetActor, sourceName) {
  const targetName = targetActor?.name ?? "";
  if (targetActor?.getFlag(MODULE_ID, "kind") === "wild") {
    await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(targetName)}</strong> es lanzado fuera del combate por ${escapeHtml(sourceName)}. Si su nivel es menor, huye del combate (a criterio del director).</p></div>` });
    return;
  }
  const payload = { action: SOCKET_ACTION, userId: game.user.id, targetActorUuid: targetActor?.uuid, sourceName, targetName };
  if (game.user.isGM || targetActor?.canUserModify(game.user, "update")) await completeForcedSwitch(payload);
  else {
    game.socket.emit(`module.${MODULE_ID}`, payload);
    ui.notifications.info(game.i18n.format("POKE5E.MoveEffects.ModifierRequested", { move: sourceName }));
  }
}

async function completeForcedSwitch(payload) {
  const requester = game.users.get(payload.userId);
  if (!requester?.active) return;
  const targetActor = payload.targetActorUuid ? await fromUuid(payload.targetActorUuid) : null;
  if (targetActor?.documentName !== "Actor") return;
  const uuid = targetActor.getFlag(MODULE_ID, "pokemonItemUuid");
  const pokemonItem = uuid ? await fromUuid(uuid) : null;
  if (!pokemonItem) return;
  const switched = await recallPokemon(pokemonItem, { forced: true });
  if (switched) await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(payload.targetName)}</strong> es retirado del combate por ${escapeHtml(payload.sourceName)}. Su entrenador debe sacar otro Pokémon del equipo si le queda alguno.</p></div>` });
}

function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
function isResponsibleGm() {
  const active = game.users.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return active[0]?.id === game.user.id;
}
