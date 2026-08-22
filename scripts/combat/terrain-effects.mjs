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
 *
 * También recalcula, cada vez que el campo cambia, el ActiveEffect de
 * velocidad/CA que aportan las habilidades de clima o terreno de cada
 * Pokémon desplegado o salvaje (Clorofila, Nado Rápido, Paso Arena,
 * Aguanieve, Onda Voltaica, Velo Arena, Manto Nieve, Pelaje Herboso — lote 18
 * de pokemon-abilities.mjs). Vive aquí y no en pokemon-abilities.mjs porque
 * ese archivo ya importa requestFieldEffect() de este mismo módulo (para el
 * clima de despliegue de la fase 1); importar en la otra dirección crearía
 * un ciclo, así que refreshFieldAbilityBonuses() lee el flag síncrono
 * `pokemonAbilities` (lote 9) directamente en vez de depender de una función
 * de allí.
 */
import { MODULE_ID } from "../core/model.mjs";
import { escapeHtml, isResponsibleGm } from "../core/utils.mjs";

const SOCKET_ACTION = "applyFieldEffect";
const FLAG = "field";

/** Habilidad → climas que duplican la velocidad propia. */
const WEATHER_SPEED_DOUBLE_ABILITIES = Object.freeze({
  chlorophyll: ["sun"],
  "swift-swim": ["rain"],
  "sand-rush": ["sandstorm"],
  "slush-rush": ["hail", "snow"]
});
/** Habilidad → terreno que duplica la velocidad propia. */
const TERRAIN_SPEED_DOUBLE_ABILITIES = Object.freeze({ "surge-surfer": "electric-terrain" });
/** Habilidad → {weather, bonus} de CA por clima activo. */
const WEATHER_AC_BONUS_ABILITIES = Object.freeze({
  "sand-veil": { weather: ["sandstorm"], bonus: 2 },
  "snow-cloak": { weather: ["hail", "snow"], bonus: 2 }
});
/** Habilidad → {terrain, bonus} de CA por terreno activo. */
const TERRAIN_AC_BONUS_ABILITIES = Object.freeze({ "grass-pelt": { terrain: "grassy-terrain", bonus: 1 } });

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
  if (game.user.isGM) {
    await combat.setFlag(MODULE_ID, FLAG, { terrain: null, weather: null, fieldRule: null, pulse: null });
    await refreshFieldAbilityBonuses(combat);
  } else {
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
  if (payload.slot === "weather" || payload.slot === "terrain") await refreshFieldAbilityBonuses(combat);
  await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(payload.sourceName)}</strong> activa ${escapeHtml(payload.id)} (${payload.rounds} ronda${payload.rounds === 1 ? "" : "s"}).</p></div>` });
}

async function completeClearField(payload) {
  const requester = game.users.get(payload.userId);
  if (!requester?.active) return;
  const combat = await fromUuid(payload.combatUuid);
  if (combat?.documentName !== "Combat") return;
  await combat.setFlag(MODULE_ID, FLAG, { terrain: null, weather: null, fieldRule: null, pulse: null });
  await refreshFieldAbilityBonuses(combat);
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
  if (changed) {
    await combat.setFlag(MODULE_ID, FLAG, field);
    await refreshFieldAbilityBonuses(combat);
  }
}

/**
 * ActiveEffect con la velocidad duplicada y/o el bono de CA que aportan las
 * habilidades de clima/terreno conocidas, según el clima y terreno
 * ACTUALMENTE activos, o null si ninguna coincide. Función pura para poder
 * probarla desde validate-terrain-effects.mjs sin montar un Combat falso.
 */
export function abilityFieldBonusEffectSource(abilities = [], { weatherId = null, terrainId = null } = {}) {
  const changes = [];
  for (const id of abilities ?? []) {
    if (WEATHER_SPEED_DOUBLE_ABILITIES[id]?.includes(weatherId) || TERRAIN_SPEED_DOUBLE_ABILITIES[id] === terrainId) {
      for (const type of ["walk", "fly", "swim", "burrow", "climb"]) {
        changes.push({ key: `system.attributes.movement.${type}`, mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: 2, priority: 20 });
      }
    }
    const weatherAc = WEATHER_AC_BONUS_ABILITIES[id];
    if (weatherAc && weatherId && weatherAc.weather.includes(weatherId)) {
      changes.push({ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: weatherAc.bonus });
    }
    const terrainAc = TERRAIN_AC_BONUS_ABILITIES[id];
    if (terrainAc && terrainId && terrainAc.terrain === terrainId) {
      changes.push({ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: terrainAc.bonus });
    }
  }
  if (!changes.length) return null;
  return {
    name: "Bono de campo por habilidad",
    icon: "icons/svg/upgrade.svg",
    img: "icons/svg/upgrade.svg",
    description: "Velocidad duplicada y/o bono de CA mientras el clima o terreno activos coincidan con la habilidad conocida.",
    changes,
    duration: {},
    flags: { [MODULE_ID]: { kind: "ability-field-bonus" } }
  };
}

/**
 * Recalcula el ActiveEffect de habilidad de clima/terreno de todos los
 * actores desplegados y salvajes del mundo: lo borra y, si corresponde con el
 * campo actual, lo vuelve a crear. Se llama tras cualquier cambio real del
 * campo (activar, limpiar o que una ronda agote una entrada). Mismo patrón de
 * "borrar y recrear entero" que ya usa abilityStatusBonusEffectSource() (lote
 * 7) en vez de intentar parchear un ActiveEffect existente.
 */
async function refreshFieldAbilityBonuses(combat) {
  const field = currentField(combat);
  const weatherId = field.weather?.id ?? null;
  const terrainId = field.terrain?.id ?? null;
  for (const actor of game.actors.filter(candidate => ["deployed", "wild"].includes(candidate.getFlag(MODULE_ID, "kind")))) {
    const abilities = actor.getFlag(MODULE_ID, "pokemonAbilities") ?? [];
    const existing = actor.effects.filter(effect => effect.getFlag(MODULE_ID, "kind") === "ability-field-bonus");
    const source = abilityFieldBonusEffectSource(abilities, { weatherId, terrainId });
    if (existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(effect => effect.id));
    if (source) await actor.createEmbeddedDocuments("ActiveEffect", [source]);
  }
}
