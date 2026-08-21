/**
 * Terreno, clima y campo de batalla compartido: Terreno Eléctrico, Terreno
 * de Hierba, Terreno Místico, Terreno Psíquico, Gravedad y los cinco climas
 * (Danza Lluvia, Día Soleado, Tormenta de Arena, Granizo, Paisaje Nevado)
 * afectan a todos los combatientes, no a un único objetivo, así que se
 * guardan en el combate activo (no en un actor) y se consultan desde
 * cualquier movimiento que dependa de ellos (Deslizamiento de Hierba,
 * Psicoespada, Diluvio Iónico, Bola Clima, Síntesis, Recuperar Costa...).
 * Solo el director puede escribir en el combate, así que las peticiones
 * viajan por el mismo socket delegado que el resto de motores de movimiento.
 */
import { MODULE_ID } from "../core/model.mjs";

const SOCKET_ACTION = "applyFieldEffect";
const FLAG = "field";

/** Terrenos y su duración en rondas al activarse. */
export const TERRAIN_MOVES = Object.freeze({
  "electric-terrain": { id: "electric-terrain", rounds: 3 },
  "grassy-terrain": { id: "grassy-terrain", rounds: 3 },
  "misty-terrain": { id: "misty-terrain", rounds: 3 },
  "psychic-terrain": { id: "psychic-terrain", rounds: 3 }
});
/** Climas y su duración en rondas al activarse. */
export const WEATHER_MOVES = Object.freeze({
  "rain-dance": { id: "rain", rounds: 5 },
  "sunny-day": { id: "sun", rounds: 5 },
  sandstorm: { id: "sandstorm", rounds: 5 },
  hail: { id: "hail", rounds: 5 },
  snowscape: { id: "snow", rounds: 10 }
});
/** Reglas de campo que no son terreno ni clima pero comparten el mismo hueco compartido (Gravedad). */
export const FIELD_RULE_MOVES = Object.freeze({ gravity: { id: "gravity", rounds: 10 } });
/** Efecto instantáneo de campo con duración propia en rondas (Diluvio Iónico). */
export const FIELD_PULSE_MOVES = Object.freeze({ "ion-deluge": { id: "ion-deluge", rounds: 1 } });
/** Tabla de Bola Clima: tipo de daño según el clima activo. */
export const WEATHER_BALL_TYPES = Object.freeze({ sun: "fire", rain: "water", sandstorm: "rock", hail: "ice", snow: "ice" });

export function registerFieldEffects() {
  game.socket.on(`module.${MODULE_ID}`, payload => {
    if (!isResponsibleGm()) return;
    if (payload?.action === SOCKET_ACTION) completeFieldEffect(payload).catch(error => console.error(`${MODULE_ID} | Field effect application failed`, error));
    else if (payload?.action === "clearFieldEffect") completeClearField(payload).catch(error => console.error(`${MODULE_ID} | Field effect clear failed`, error));
  });
  Hooks.on("combatRound", combat => {
    if (!isResponsibleGm()) return;
    advanceField(combat).catch(error => console.error(`${MODULE_ID} | Field effect round advance failed`, error));
  });
}

/** Estado de campo del combate activo: terreno, clima, regla de campo y pulso instantáneo, cada uno con sus rondas restantes o null. */
export function currentField(combat) {
  return combat?.getFlag(MODULE_ID, FLAG) ?? { terrain: null, weather: null, fieldRule: null, pulse: null };
}

/** Niebla: despeja terreno, clima, regla de campo y pulso instantáneo del combate activo de una vez. */
export async function clearField(combat) {
  if (!combat) return;
  if (game.user.isGM) await combat.setFlag(MODULE_ID, FLAG, { terrain: null, weather: null, fieldRule: null, pulse: null });
  else {
    game.socket.emit(`module.${MODULE_ID}`, { action: "clearFieldEffect", userId: game.user.id, combatUuid: combat.uuid });
    ui.notifications.info(game.i18n.localize("POKE5E.MoveEffects.FieldCleared"));
  }
}

/** Pide activar un terreno, regla de campo o pulso instantáneo en el combate activo. */
export async function requestFieldEffect(combat, slot, id, rounds, sourceName) {
  if (!combat) return ui.notifications.warn(game.i18n.localize("POKE5E.MoveEffects.MustBeDeployed"));
  const payload = { action: SOCKET_ACTION, userId: game.user.id, combatUuid: combat.uuid, slot, id, rounds, sourceName };
  if (game.user.isGM) await completeFieldEffect(payload);
  else {
    game.socket.emit(`module.${MODULE_ID}`, payload);
    ui.notifications.info(game.i18n.format("POKE5E.MoveEffects.ModifierRequested", { move: sourceName }));
  }
}

async function completeFieldEffect(payload) {
  const requester = game.users.get(payload.userId);
  if (!requester?.active) return;
  const combat = await fromUuid(payload.combatUuid);
  if (combat?.documentName !== "Combat") return;
  const field = foundry.utils.deepClone(currentField(combat));
  field[payload.slot] = { id: payload.id, remaining: payload.rounds };
  await combat.setFlag(MODULE_ID, FLAG, field);
  await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(payload.sourceName)}</strong> activa ${escapeHtml(payload.id)} (${payload.rounds} ronda${payload.rounds === 1 ? "" : "s"}).</p></div>` });
}

async function completeClearField(payload) {
  const requester = game.users.get(payload.userId);
  if (!requester?.active) return;
  const combat = await fromUuid(payload.combatUuid);
  if (combat?.documentName !== "Combat") return;
  await combat.setFlag(MODULE_ID, FLAG, { terrain: null, weather: null, fieldRule: null, pulse: null });
}

async function advanceField(combat) {
  const field = foundry.utils.deepClone(currentField(combat));
  let changed = false;
  for (const slot of ["terrain", "weather", "fieldRule", "pulse"]) {
    if (!field[slot]) continue;
    field[slot].remaining -= 1;
    if (field[slot].remaining <= 0) field[slot] = null;
    changed = true;
  }
  if (changed) await combat.setFlag(MODULE_ID, FLAG, field);
}

function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
function isResponsibleGm() {
  const active = game.users.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return active[0]?.id === game.user.id;
}
