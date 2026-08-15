/**
 * Estados alterados Pokémon: los define como efectos de Foundry, deduce del
 * texto de cada movimiento cuáles aplica, los reparte entre los objetivos
 * seleccionados, resuelve el daño de fin de turno y ofrece las reacciones de
 * Cinta Focus y bayas cuando acaba de aplicar un estado compatible.
 *
 * Los jugadores no pueden modificar actores ajenos, así que las peticiones
 * viajan por socket hasta el director responsable (isResponsibleGm()), que las
 * ejecuta en completeStatusApplication(). Lo arranca main.mjs, lo consultan
 * data-service.mjs (al cargar los movimientos), pokemon-sheet.mjs (al atacar y
 * al mostrar los estados) y deployment.mjs y wild-deployment.mjs (al crear el
 * token con sus estados previos).
 */
import { MODULE_ID } from "./model.mjs";
import { pokemonEffectIcon } from "./effect-icons.mjs";
import { attackHitsPokemonTarget, pokemonCombatModifiers } from "./move-modifiers.mjs";
import { confirmHeldItemReaction, consumeHeldItem, heldItemId, postHeldItemMessage, statusBerryMatches } from "./held-items.mjs";

/** Acción del socket con la que un jugador pide al director aplicar estados. */
const STATUS_SOCKET_ACTION = "applyMoveStatuses";
/**
 * Movimientos que mencionan un estado pero no lo aplican directamente al
 * objetivo tras la tirada normal (efectos retardados, reacciones, multiataques,
 * trampas de campo, curaciones o mejoras condicionales). inferMoveStatusEffects()
 * los marca con `trigger: "manual"` para que los resuelva el director.
 */
const MANUAL_STATUS_MOVES = new Set([
  "beak-blast", "glaciate", "incinerate", "sing", "smelling-salts",
  "sparkling-aria", "spore", "toxic-spikes", "triple-arrows", "twineedle",
  "uproar", "venom-drench", "yawn"
]);

/** Casos que el texto libre no puede expresar sin ambigüedad. */
const EXPLICIT_MOVE_STATUSES = Object.freeze({
  "alluring-voice": [explicitStatus("confused", "failed-save", { requiresHit: true })],
  "axe-kick": [explicitStatus("confused", "failed-save", { requiresHit: true })],
  "baneful-bunker": [explicitStatus("poisoned", "automatic")],
  "barb-barrage": [explicitStatus("poisoned", "failed-save")],
  blizzard: [explicitStatus("frozen", "failed-save", { margin: 5 })],
  "burning-jealousy": [explicitStatus("burned", "failed-save")],
  chatter: [explicitStatus("confused", "hit")],
  confide: [explicitStatus("confused", "failed-save")],
  "confuse-ray": [explicitStatus("confused", "hit")],
  "dynamic-punch": [explicitStatus("confused", "hit")],
  "grass-whistle": [explicitStatus("asleep", "failed-save")],
  hurricane: [explicitStatus("confused", "failed-save", { margin: 5 })],
  hypnosis: [explicitStatus("asleep", "failed-save")],
  "ice-beam": [explicitStatus("frozen", "failed-save", { margin: 5 })],
  "lava-plume": [explicitStatus("burned", "failed-save")],
  "mortal-spin": [explicitStatus("poisoned", "failed-save")],
  nuzzle: [explicitStatus("paralyzed", "failed-save", { requiresHit: true })],
  outrage: [explicitStatus("confused", "manual", { target: "self" })],
  "petal-dance": [explicitStatus("confused", "manual", { target: "self" })],
  "poison-gas": [explicitStatus("poisoned", "manual")],
  "poison-powder": [explicitStatus("poisoned", "failed-save")],
  psybeam: [explicitStatus("confused", "failed-save", { margin: 5 })],
  psywave: [explicitStatus("confused", "failed-save")],
  "raging-fury": [explicitStatus("confused", "manual", { target: "self" })],
  "relic-song": [explicitStatus("asleep", "failed-save", { margin: 5 })],
  rest: [explicitStatus("asleep", "automatic", { target: "self" })],
  "sandsear-storm": [explicitStatus("burned", "failed-save")],
  "shell-side-arm": [explicitStatus("poisoned", "failed-save", { requiresHit: true })],
  sludge: [explicitStatus("poisoned", "failed-save", { requiresHit: true })],
  "sludge-bomb": [explicitStatus("poisoned", "manual")],
  smog: [explicitStatus("poisoned", "manual")],
  "stun-spore": [explicitStatus("paralyzed", "failed-save")],
  supersonic: [explicitStatus("confused", "failed-save")],
  "sweet-kiss": [explicitStatus("confused", "failed-save")],
  "teeter-dance": [explicitStatus("confused", "failed-save")],
  thrash: [explicitStatus("confused", "automatic", { target: "self" })],
  thunder: [explicitStatus("paralyzed", "failed-save", { margin: 5 })],
  "thunder-wave": [explicitStatus("paralyzed", "failed-save")],
  "wildbolt-storm": [explicitStatus("paralyzed", "failed-save")]
});

/**
 * Catálogo de estados construido con status(): nombre, icono, descripción,
 * inmunidades por tipo, condiciones de D&D 5e enlazadas y duración. Los estados
 * no volátiles son excluyentes entre sí y se guardan en el Item del Pokémon.
 * Es la referencia de todo el archivo y de la ficha Pokémon.
 */
export const POKEMON_STATUS_EFFECTS = Object.freeze({
  burned: status("Quemado", "icons/svg/fire.svg", "Tira el daño dos veces y usa el resultado menor. Recibe daño igual a su competencia al final de cada turno.", { nonVolatile: true, immuneTypes: ["fire"] }),
  frozen: status("Congelado", "icons/svg/frozen.svg", "Incapacitado y apresado hasta liberarse. El daño de Fuego elimina el estado.", { nonVolatile: true, immuneTypes: ["ice"], linked: ["incapacitated", "restrained"] }),
  paralyzed: status("Paralizado", "icons/svg/paralysis.svg", "Desventaja en salvaciones de FUE y DES, velocidad reducida a la mitad y posibilidad de perder el turno.", { nonVolatile: true, immuneTypes: ["electric"] }),
  poisoned: status("Envenenado", "icons/svg/poison.svg", "Desventaja en pruebas y ataques. Recibe daño igual a su competencia al final de cada turno.", { nonVolatile: true, immuneTypes: ["poison", "steel"], linked: ["poisoned"] }),
  "badly-poisoned": status("Gravemente envenenado", "icons/svg/poison.svg", "Como Envenenado, pero recibe el doble de su competencia como daño al final de cada turno.", { nonVolatile: true, immuneTypes: ["poison", "steel"], linked: ["poisoned"] }),
  asleep: status("Dormido", "icons/svg/sleep.svg", "Incapacitado y apresado; salvaciones con desventaja. Dura hasta tres rondas.", { nonVolatile: true, linked: ["incapacitated", "restrained"], rounds: 3 }),
  confused: status("Confuso", "icons/svg/daze.svg", "No puede usar reacciones y debe tirar en la tabla de Confusión al comenzar su turno.", { rounds: 3 }),
  flinched: status("Amedrentado", "icons/svg/terror.svg", "Desventaja en ataques, pruebas y salvaciones hasta el final de su siguiente turno.", { rounds: 1 })
});

/**
 * Añade los estados del módulo a `CONFIG.statusEffects` mediante
 * pokemonStatusConfig(), sin duplicar los ya presentes y admitiendo las dos
 * formas (array u objeto) que ha tenido esa configuración en Foundry.
 * La llama `main.mjs` tras la reconstrucción de D&D 5e en `i18nInit` y de
 * nuevo en `ready` como comprobación idempotente.
 */
export function registerPokemonStatusEffects() {
  for (const [id, definition] of Object.entries(POKEMON_STATUS_EFFECTS)) {
    const config = pokemonStatusConfig(id, definition);
    if (Array.isArray(CONFIG.statusEffects)) {
      const existing = CONFIG.statusEffects.find(entry => entry.id === config.id);
      if (existing) Object.assign(existing, config);
      else CONFIG.statusEffects.push(config);
    } else CONFIG.statusEffects[config.id] = { ...(CONFIG.statusEffects[config.id] ?? {}), ...config };
  }
}

/**
 * Deja al director escuchando: atiende por socket las peticiones de
 * applyMoveStatuses(), engancha el daño de fin de turno al cambio de turno del
 * combate y sincroniza los iconos con synchronizePokemonStatusEffects().
 * La llama el hook `ready` de main.mjs.
 */
export function registerPokemonStatusSocket() {
  game.socket.on(`module.${MODULE_ID}`, payload => {
    if (payload?.action !== STATUS_SOCKET_ACTION || !isResponsibleGm()) return;
    completeStatusApplication(payload).catch(error => console.error(`${MODULE_ID} | Status application failed`, error));
  });
  synchronizePokemonStatusEffects().catch(error => console.error(`${MODULE_ID} | Status icon synchronization failed`, error));
}

/**
 * Deduce del texto de un movimiento (en inglés o español) qué estados provoca y
 * con qué disparador: "automatic", "hit", "failed-save", "natural" (con el
 * mínimo que devuelve naturalThreshold()) o "manual" si figura en
 * MANUAL_STATUS_MOVES. data-service.mjs la ejecuta una sola vez al cargar el
 * catálogo y guarda el resultado en `move.statusEffects`, que después consume
 * applyMoveStatuses().
 */
export function inferMoveStatusEffects(move) {
  if (EXPLICIT_MOVE_STATUSES[move?.id]) return EXPLICIT_MOVE_STATUSES[move.id].map(effect => ({ ...effect }));
  const text = [...(move.description ?? []), move.higherLevels ?? ""].filter(Boolean).join(" ");
  const sentences = text.split(/(?<=[.!?])\s+/);
  const effects = [];
  const patterns = [
    ["badly-poisoned", /(?:target|creature|opponent).{0,100}badly poisoned|objetivo.{0,100}gravemente envenenad/i],
    ["burned", /(?:target|creature|opponent).{0,100}(?:burned|burnt)|caus(?:e|es|ing) burn on (?:a )?hit|objetivo.{0,100}quemad|causando quemaduras? si impactas/i],
    ["frozen", /(?:target|creature|opponent).{0,100}(?:is|becomes) frozen|objetivo.{0,100}(?:queda )?congelad/i],
    ["paralyzed", /(?:target|creature|opponent).{0,100}(?:is|becomes) paraly[sz]ed|objetivo.{0,100}(?:queda )?paralizad/i],
    ["poisoned", /(?:target|creature|opponent).{0,100}(?:is|becomes) poisoned|objetivo.{0,100}(?:queda )?envenenad/i],
    ["asleep", /(?:target|creature|opponent).{0,100}(?:falls? asleep|put .* to sleep)|objetivo.{0,100}(?:queda )?dormid/i],
    ["confused", /(?:target|creature|opponent).{0,100}(?:becomes|is) confused|objetivo.{0,100}(?:queda )?confundid/i],
    ["flinched", /\bflinches\b|\bobjetivo retrocede\b/i]
  ];
  for (const sentence of sentences) {
    for (const [id, pattern] of patterns) {
      if (!pattern.test(sentence) || effects.some(entry => entry.id === id)) continue;
      const minimum = naturalThreshold(sentence);
      const requiresFailedSave = /on (?:a )?fail(?:ure)?|on failure|si falla|al fallar/i.test(sentence);
      const trigger = MANUAL_STATUS_MOVES.has(move.id) ? "manual" : minimum ? "natural" : requiresFailedSave || move.save ? "failed-save" : move.attack?.scope ? "hit" : "automatic";
      effects.push({ id, trigger, minimum });
    }
  }
  return effects;
}

/**
 * Reparte los estados de un movimiento entre los objetivos seleccionados:
 * descarta los que el ataque no alcanza (attackHitsPokemonTarget()), tira una sola
 * salvación por objetivo con rollTargetSave() y avisa de los estados manuales.
 * Aplica los resultados directamente si quien juega tiene permisos y, si no, los
 * envía por socket al director. La llama pokemon-sheet.mjs tras cada ataque.
 */
export async function applyMoveStatuses({ move, attack = null, saveDc, sourceActor, sourceCombatActor = null, sourceName }) {
  const saveResults = new Map();
  const sourceModifiers = pokemonCombatModifiers(sourceCombatActor);
  const effects = move.statusEffects ?? inferMoveStatusEffects(move);
  if (!effects.length) return { saveResults };
  const selectedEffects = effects.filter(effect => effect.target !== "self");
  const selfEffects = effects.filter(effect => effect.target === "self");
  const selected = [...(game.user.targets ?? [])];
  if (selectedEffects.length && !selected.length) {
    ui.notifications.warn(`${move.name} puede causar estados alterados, pero no hay ningún objetivo seleccionado.`);
    if (!selfEffects.length) return { saveResults };
  }
  const targets = [];
  for (const token of selected) {
    if (attack && !attackHitsPokemonTarget(attack, token.actor)) continue;
    const applicable = [];
    for (const effect of selectedEffects) {
      if (effect.trigger === "manual") continue;
      if (effect.requiresHit && (!attack || !attackHitsPokemonTarget(attack, token.actor))) continue;
      if (effect.trigger === "natural" && (!attack || Number(attack.natural) < Number(effect.minimum))) continue;
      if (effect.trigger === "hit" && (!attack || !attackHitsPokemonTarget(attack, token.actor))) continue;
      if (effect.trigger === "failed-save") {
        let save = saveResults.get(token.actor.uuid);
        if (!save) {
          save = await rollTargetSave(token.actor, move, saveDc, sourceModifiers);
          saveResults.set(token.actor.uuid, save);
        }
        if (save.success) continue;
        if (effect.margin && Number(save.dc) - Number(save.total) < Number(effect.margin)) continue;
      }
      applicable.push(effect);
    }
    if (applicable.length) targets.push({ actorUuid: token.actor.uuid, tokenName: token.name, effects: applicable });
  }
  if (selfEffects.length && sourceCombatActor?.uuid) {
    const applicable = selfEffects.filter(effect => {
      if (effect.trigger === "manual") return false;
      if (effect.trigger === "automatic") return true;
      if (effect.trigger === "hit") return Boolean(attack);
      if (effect.trigger === "natural") return Boolean(attack) && Number(attack.natural) >= Number(effect.minimum);
      return false;
    });
    if (applicable.length) targets.push({ actorUuid: sourceCombatActor.uuid, tokenName: sourceName, effects: applicable });
  }
  const manual = effects.filter(effect => effect.trigger === "manual");
  if (manual.length) ui.notifications.info(`${move.name} contiene un estado contextual que debe resolver el DJ según su descripción.`);
  if (!targets.length) return { saveResults };
  const payload = {
    action: STATUS_SOCKET_ACTION,
    userId: game.user.id,
    sourceActorUuid: sourceActor?.uuid,
    sourceName,
    moveId: move.id,
    moveName: move.name,
    targets
  };
  if (game.user.isGM || selected.every(token => token.actor.canUserModify(game.user, "update"))) await completeStatusApplication(payload);
  else {
    game.socket.emit(`module.${MODULE_ID}`, payload);
    ui.notifications.info(`Se ha solicitado al DJ aplicar los estados de ${move.name}.`);
  }
  return { saveResults };
}

/**
 * Construye el ActiveEffect de un estado a partir de POKEMON_STATUS_EFFECTS,
 * con sus condiciones enlazadas, la duración en rondas y la reducción de
 * velocidad propia de Paralizado. La usan applyPokemonStatus(),
 * synchronizePokemonStatusEffects() y el despliegue de tokens en deployment.mjs
 * y wild-deployment.mjs.
 */
export function pokemonStatusEffectSource(id, { sourceName = "", moveName = "" } = {}) {
  const definition = POKEMON_STATUS_EFFECTS[id];
  if (!definition) return null;
  const effectId = statusId(id);
  const icon = statusIcon(id, definition);
  return {
    name: definition.name,
    icon,
    img: icon,
    description: definition.description,
    statuses: [effectId, ...definition.linked],
    changes: id === "paralyzed" ? ["walk", "fly", "swim", "burrow", "climb"].map(type => ({
      key: `system.attributes.movement.${type}`,
      mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY,
      value: 0.5,
      priority: 20
    })) : [],
    duration: definition.rounds ? { rounds: definition.rounds, startRound: game.combat?.round ?? 0, startTurn: game.combat?.turn ?? 0 } : {},
    flags: { [MODULE_ID]: { kind: "pokemon-status", status: id, sourceName, moveName } }
  };
}

/**
 * Repara los estados de los actores ya desplegados: actualiza nombre, icono y
 * conjunto exacto de identificadores, eliminando asociaciones erróneas como
 * Bloodied, y vuelve a crear los que consten en el Item pero falten en el actor.
 * Solo la ejecuta el director al arrancar, desde
 * registerPokemonStatusSocket().
 */
export async function synchronizePokemonStatusEffects() {
  if (!isResponsibleGm()) return;
  for (const actor of game.actors.filter(candidate => ["deployed", "wild"].includes(candidate.getFlag(MODULE_ID, "kind")))) {
    const updates = [];
    const existing = new Set();
    for (const effect of actor.effects) {
      const id = effect.getFlag(MODULE_ID, "status");
      const definition = POKEMON_STATUS_EFFECTS[id];
      if (!definition) continue;
      const icon = statusIcon(id, definition);
      existing.add(id);
      const expectedStatuses = [statusId(id), ...definition.linked];
      const actualStatuses = [...(effect.statuses ?? [])];
      if (effect.name !== definition.name || (effect.img ?? effect.icon) !== icon || !sameValues(actualStatuses, expectedStatuses)) {
        updates.push({
          _id: effect.id,
          name: definition.name,
          icon,
          img: icon,
          description: definition.description,
          statuses: expectedStatuses
        });
      }
    }
    if (updates.length) await actor.updateEmbeddedDocuments("ActiveEffect", updates);
    const pokemonItem = await pokemonItemForActor(actor);
    const conditions = pokemonItem?.getFlag(MODULE_ID, "instance")?.conditions ?? [];
    const missing = conditions.filter(id => POKEMON_STATUS_EFFECTS[id] && !existing.has(id)).map(id => pokemonStatusEffectSource(id));
    if (missing.length) await actor.createEmbeddedDocuments("ActiveEffect", missing);
  }
}

/**
 * Convierte los estados guardados en un Pokémon en entradas con nombre, icono y
 * descripción para la ficha. La usa pokemon-sheet.mjs.
 */
export function pokemonStatusEntries(instance) {
  return [...new Set(instance?.conditions ?? [])].map(id => {
    const definition = POKEMON_STATUS_EFFECTS[id];
    return definition ? { id, ...definition, img: statusIcon(id, definition) } : { id };
  }).filter(entry => entry.name);
}

/** Expone statusId() fuera del módulo; lo usa pokemon-sheet.mjs para los iconos. */
export function pokemonStatusId(id) { return statusId(id); }

/**
 * Cura un estado: lo borra del Item del Pokémon y elimina su ActiveEffect del
 * actor asociado, ya sea un salvaje o un desplegado localizado por su UUID.
 * Inversa de applyPokemonStatus(); la llama pokemon-sheet.mjs.
 */
export async function removePokemonStatus(pokemonItem, id) {
  const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  instance.conditions = (instance.conditions ?? []).filter(condition => condition !== id);
  await pokemonItem.setFlag(MODULE_ID, "instance", instance);
  const actor = pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild"
    ? pokemonItem.parent
    : game.actors.find(candidate => candidate.getFlag(MODULE_ID, "pokemonItemUuid") === pokemonItem.uuid);
  const effects = actor?.effects?.filter(effect => effect.statuses.has(statusId(id)) || effect.getFlag(MODULE_ID, "status") === id) ?? [];
  if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
}

/**
 * Ejecuta la aplicación de estados solicitada, ya venga de applyMoveStatuses()
 * en local o del socket. Antes comprueba que quien la pidió siga conectado y sea
 * dueño del actor origen, para que el socket no pueda usarse en nombre de otro.
 * Delega cada estado en applyPokemonStatus().
 */
async function completeStatusApplication(payload) {
  const requester = game.users.get(payload.userId);
  const sourceActor = payload.sourceActorUuid ? await fromUuid(payload.sourceActorUuid) : null;
  if (!requester?.active || sourceActor?.documentName !== "Actor" || !sourceActor.testUserPermission(requester, "OWNER")) return;
  for (const target of payload.targets ?? []) {
    const actor = await fromUuid(target.actorUuid);
    if (actor?.documentName !== "Actor") continue;
    for (const effect of target.effects ?? []) await applyPokemonStatus(actor, effect.id, { sourceName: payload.sourceName, moveName: payload.moveName });
  }
}

/**
 * Aplica un estado concreto a un actor: descarta las inmunidades por tipo
 * (pokemonTypes()), los duplicados y los no volátiles cuando ya hay otro; crea
 * el efecto con pokemonStatusEffectSource(), lo guarda en el Item con
 * persistPokemonStatus() si es no volátil, lo anuncia en el chat y finalmente
 * delega en resolveHeldItemStatusReaction() para el objeto equipado.
 */
export async function applyPokemonStatus(actor, id, source) {
  const definition = POKEMON_STATUS_EFFECTS[id];
  if (!definition) return;
  const types = pokemonTypes(actor);
  if (definition.immuneTypes.some(type => types.includes(type))) {
    ui.notifications.info(`${actor.name} es inmune a ${definition.name.toLocaleLowerCase()}.`);
    return;
  }
  const effectId = statusId(id);
  const activePokemonStatuses = new Set(actor.effects.map(effect => effect.getFlag(MODULE_ID, "status")).filter(Boolean));
  if (activePokemonStatuses.has(id) || actor.statuses.has(effectId)) return;
  if (definition.nonVolatile && Object.entries(POKEMON_STATUS_EFFECTS).some(([status, entry]) => entry.nonVolatile && activePokemonStatuses.has(status))) {
    ui.notifications.info(`${actor.name} ya tiene un estado no volátil y no puede recibir ${definition.name.toLocaleLowerCase()}.`);
    return;
  }
  const effectSource = pokemonStatusEffectSource(id, source);
  await actor.createEmbeddedDocuments("ActiveEffect", [effectSource]);
  if (definition.nonVolatile) await persistPokemonStatus(actor, id);
  await ChatMessage.create({
    content: `<div class="dnd5e chat-card poke5e-status-card"><header class="card-header"><h3>${escapeHtml(actor.name)}: ${escapeHtml(definition.name)}</h3></header><p>${escapeHtml(source.moveName)} aplica <strong>${escapeHtml(definition.name)}</strong>.</p><p>${escapeHtml(definition.description)}</p></div>`
  });
  await resolveHeldItemStatusReaction(actor, id);
}

/**
 * Resuelve Cinta Focus y las bayas que reaccionan al estado recién aplicado.
 * Las bayas siempre piden confirmación; Cinta Focus realiza su tirada obligatoria.
 */
async function resolveHeldItemStatusReaction(actor, status) {
  const pokemonItem = await pokemonItemForActor(actor);
  if (!pokemonItem) return;
  const instance = pokemonItem.getFlag(MODULE_ID, "instance") ?? {};
  const held = instance.heldItem;
  const id = heldItemId(held?.sourceId);
  if (id === "focus-band" && status === "flinched") {
    const roll = await new Roll("1d20").evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${held.name} · Evitar retroceso (10+)` });
    if (Number(roll.total) >= 10) {
      await removePokemonStatus(pokemonItem, status);
      await postHeldItemMessage(pokemonItem, held, "La tirada tiene éxito y evita el retroceso.");
    }
    return;
  }
  if (!statusBerryMatches(id, status)) return;
  const confirmed = await confirmHeldItemReaction(held.name, `<p>${escapeHtml(actor.name)} acaba de sufrir ${escapeHtml(POKEMON_STATUS_EFFECTS[status]?.name ?? status)}. ¿Consumir ${escapeHtml(held.name)} para curarlo?</p>`);
  if (!confirmed) return;
  await removePokemonStatus(pokemonItem, status);
  await consumeHeldItem(pokemonItem, id);
  await postHeldItemMessage(pokemonItem, held, `Se consume como reacción y cura ${POKEMON_STATUS_EFFECTS[status]?.name ?? status}.`);
}

/**
 * Guarda un estado no volátil en el Item del Pokémon (vía pokemonItemForActor())
 * para que sobreviva a retirarlo del mapa. Su inversa es removePokemonStatus().
 */
async function persistPokemonStatus(actor, id) {
  const pokemonItem = await pokemonItemForActor(actor);
  if (!pokemonItem) return;
  const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  instance.conditions = [...new Set([...(instance.conditions ?? []), id])];
  await pokemonItem.setFlag(MODULE_ID, "instance", instance);
}

/**
 * Daño periódico de veneno y quemadura al terminar el turno, calculado sobre la
 * competencia que corresponde al nivel del Pokémon (doble si está gravemente
 * envenenado). Lo invoca ongoing-effects.mjs dentro de su procesamiento
 * secuencial de `combatTurnChange`, y solo en el cliente del director.
 */
export async function applyEndTurnStatusDamage(actor) {
  if (!actor || Number(actor.system.attributes?.hp?.value) <= 0) return;
  let multiplier = 0;
  let label = "";
  if (actorHasPokemonStatus(actor, "badly-poisoned")) { multiplier = 2; label = "envenenamiento grave"; }
  else if (actorHasPokemonStatus(actor, "poisoned")) { multiplier = 1; label = "envenenamiento"; }
  else if (actorHasPokemonStatus(actor, "burned")) { multiplier = 1; label = "quemadura"; }
  if (!multiplier) return;
  const pokemonItem = await pokemonItemForActor(actor);
  const level = Number(pokemonItem?.getFlag(MODULE_ID, "instance")?.level) || 1;
  const damage = (2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4)) * multiplier;
  const hp = actor.system.attributes.hp;
  await actor.update({ "system.attributes.hp.value": Math.max(0, Number(hp.value) - damage) });
  await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(actor.name)}</strong> recibe <strong>${damage} de daño</strong> por ${escapeHtml(label)} al final de su turno.</p></div>` });
}

/**
 * Localiza el Item Pokémon que respalda a un actor: por el UUID que guarda un
 * desplegado o, si no lo hay, entre los Items embebidos de un salvaje.
 * Puente entre actor y ficha para el resto del archivo.
 */
async function pokemonItemForActor(actor) {
  const uuid = actor.getFlag(MODULE_ID, "pokemonItemUuid");
  if (uuid) return fromUuid(uuid);
  return actor.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? null;
}

/**
 * Decide si un ataque alcanzó a un objetivo comparando el total con su CA, con
 * pifia y crítico automáticos. Ante una CA ilegible da el impacto por bueno.
 * Auxiliar de applyMoveStatuses().
 */
/**
 * Tira la salvación de un objetivo contra un movimiento, eligiendo la
 * característica más favorable de entre las que este permite (Constitución por
 * defecto) según savingThrowModifier(), y publica la tirada en el chat.
 * Auxiliar de applyMoveStatuses().
 */
async function rollTargetSave(actor, move, dc, sourceModifiers = {}) {
  const attributes = move.save?.attribute?.length ? move.save.attribute : ["con"];
  const choices = attributes.map(key => ({ key, modifier: savingThrowModifier(actor, key) }));
  const chosen = choices.sort((a, b) => b.modifier - a.modifier)[0];
  const combat = pokemonCombatModifiers(actor);
  const bonusDice = combat.saveDice.map(formula => ` + ${formula}`).join("");
  const modifier = chosen.modifier + (combat.saves[chosen.key] ?? 0);
  const sourceDisadvantage = (sourceModifiers.saveTargetsDisadvantageAbilities ?? []).some(key => attributes.includes(key));
  const advantage = combat.saveAdvantage || Boolean(sourceModifiers.saveTargetsAdvantage);
  const disadvantage = combat.saveDisadvantageAbilities.includes(chosen.key) || sourceDisadvantage;
  const dice = advantage === disadvantage ? "1d20" : advantage ? "2d20kh" : "2d20kl";
  const roll = await new Roll(`${dice} + @modifier${bonusDice}`, { modifier }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — Salvación ${chosen.key.toUpperCase()} contra ${move.name} (CD ${dc})` });
  return { total: Number(roll.total) || 0, dc: Number(dc), success: Number(roll.total) >= Number(dc) };
}

/**
 * Modificador de salvación de una característica: usa el que ya calcula D&D 5e
 * y, si no está disponible, lo reconstruye desde la puntuación y la competencia.
 * Auxiliar de rollTargetSave().
 */
function savingThrowModifier(actor, key) {
  const ability = actor.system.abilities?.[key] ?? {};
  const prepared = Number(ability.save?.value ?? ability.save?.total ?? ability.save);
  if (Number.isFinite(prepared)) return prepared;
  const score = Number(ability.value) || 10;
  const modifier = Number.isFinite(Number(ability.mod)) ? Number(ability.mod) : Math.floor((score - 10) / 2);
  const proficiency = Number(actor.system.attributes?.prof) || 2;
  return modifier + (proficiency * (Number(ability.proficient) || 0));
}

/**
 * Tipos Pokémon de un actor, tomados del flag que escriben deployment.mjs y
 * wild-deployment.mjs o, en su defecto, de la especie de su Item.
 * Auxiliar de applyPokemonStatus() para resolver las inmunidades.
 */
function pokemonTypes(actor) {
  const flagged = actor.getFlag(MODULE_ID, "pokemonTypes");
  if (Array.isArray(flagged)) return flagged;
  return actor.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon")?.getFlag(MODULE_ID, "species")?.type ?? [];
}

/**
 * Extrae de una frase el resultado natural mínimo que exige un estado ("con una
 * tirada natural de 18 o más"), en inglés o español, o null si no lo indica.
 * Auxiliar de inferMoveStatusEffects() para el disparador "natural".
 */
function naturalThreshold(sentence) {
  const match = sentence.match(/natural(?: attack)? roll(?:s)?(?: of| is| result(?: is)?| de)?\s*(?:a )?(\d+)|(?:tirada de ataque|resultado|tirada)(?: es| de)?\s*(?:a )?(\d+)(?: o| natural)/i);
  if (match) return Number(match[1] ?? match[2]);
  const spanish = sentence.match(/(?:tirada de ataque|resultado) (?:natural )?de (\d+)|(?:tirada de ataque|resultado) de (\d+)(?: o| natural)/i);
  return spanish ? Number(spanish[1] ?? spanish[2]) : null;
}

/**
 * Adapta una entrada de POKEMON_STATUS_EFFECTS al formato de
 * `CONFIG.statusEffects`. Auxiliar de registerPokemonStatusEffects().
 */
function pokemonStatusConfig(id, definition) {
  const effectId = statusId(id);
  const icon = statusIcon(id, definition);
  return {
    _id: staticStatusDocumentId(id),
    id: effectId,
    name: definition.name,
    img: icon,
    icon,
    description: definition.description,
    hud: true,
    flags: { [MODULE_ID]: { pokemonStatus: id } }
  };
}

function explicitStatus(id, trigger, { target = "selected", requiresHit = false, margin = 0 } = {}) {
  return Object.freeze({ id, trigger, minimum: null, target, requiresHit, margin });
}

/** Resuelve el PNG opcional de un estado y conserva su icono de Foundry como respaldo. */
function statusIcon(id, definition) {
  return pokemonEffectIcon("statuses", id, definition.img);
}

/**
 * Constructor abreviado de las entradas de POKEMON_STATUS_EFFECTS, que fija los
 * valores por defecto de los campos opcionales.
 */
function status(name, img, description, { nonVolatile = false, immuneTypes = [], linked = [], rounds = 0 } = {}) {
  return { name, img, description, nonVolatile, immuneTypes, linked, rounds };
}

/** Prefija el id de un estado con el del módulo para no chocar con D&D 5e. */
function statusId(id) { return `${MODULE_ID}-${id}`; }
/** ID estable de 16 caracteres exigido por los StatusEffectConfig modernos. */
function staticStatusDocumentId(id) {
  return (`p5e${String(id).replace(/[^a-zA-Z0-9]/g, "")}0000000000000000`).slice(0, 16);
}
/** Compara dos colecciones de identificadores sin depender de su orden. */
function sameValues(left, right) {
  return left.length === right.length && left.every(value => right.includes(value));
}
/** Comprueba el flag persistente y, como respaldo, el Set de estados del actor. */
function actorHasPokemonStatus(actor, id) {
  return actor.effects.some(effect => effect.getFlag(MODULE_ID, "status") === id) || actor.statuses.has(statusId(id));
}
/** Escapa texto para los mensajes de chat que genera este archivo. */
function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
/**
 * Elige un único director responsable (el de id menor entre los conectados) para
 * que las tareas compartidas —socket, daño de fin de turno y sincronización— se
 * ejecuten una sola vez aunque haya varios directores en la partida.
 */
function isResponsibleGm() {
  const active = game.users.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return active[0]?.id === game.user.id;
}
