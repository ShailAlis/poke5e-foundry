import { MODULE_ID } from "./model.mjs";

const STATUS_SOCKET_ACTION = "applyMoveStatuses";
// These moves mention a condition, but do not apply it directly to the selected
// target after the normal move roll (delayed effects, reactions, multiattacks,
// battlefield hazards, cures, or conditional upgrades).
const MANUAL_STATUS_MOVES = new Set([
  "beak-blast", "glaciate", "incinerate", "sing", "smelling-salts",
  "sparkling-aria", "spore", "toxic-spikes", "triple-arrows", "twineedle",
  "uproar", "venom-drench", "yawn"
]);

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

const NON_VOLATILE = new Set(Object.entries(POKEMON_STATUS_EFFECTS).filter(([, value]) => value.nonVolatile).map(([id]) => statusId(id)));

export function registerPokemonStatusEffects() {
  for (const [id, definition] of Object.entries(POKEMON_STATUS_EFFECTS)) {
    const config = pokemonStatusConfig(id, definition);
    if (Array.isArray(CONFIG.statusEffects)) {
      if (!CONFIG.statusEffects.some(entry => entry.id === config.id)) CONFIG.statusEffects.push(config);
    } else if (!CONFIG.statusEffects[config.id]) CONFIG.statusEffects[config.id] = config;
  }
}

export function registerPokemonStatusSocket() {
  game.socket.on(`module.${MODULE_ID}`, payload => {
    if (payload?.action !== STATUS_SOCKET_ACTION || !isResponsibleGm()) return;
    completeStatusApplication(payload).catch(error => console.error(`${MODULE_ID} | Status application failed`, error));
  });
  Hooks.on("combatTurnChange", (combat, prior) => {
    if (!isResponsibleGm() || !prior?.combatantId) return;
    applyEndTurnStatusDamage(combat.combatants.get(prior.combatantId)?.actor).catch(error => console.error(`${MODULE_ID} | End-turn status damage failed`, error));
  });
  synchronizePokemonStatusEffects().catch(error => console.error(`${MODULE_ID} | Status icon synchronization failed`, error));
}

export function inferMoveStatusEffects(move) {
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

export async function applyMoveStatuses({ move, attack = null, saveDc, sourceActor, sourceName }) {
  const effects = move.statusEffects ?? inferMoveStatusEffects(move);
  if (!effects.length) return;
  const selected = [...(game.user.targets ?? [])];
  if (!selected.length) {
    ui.notifications.warn(`${move.name} puede causar estados alterados, pero no hay ningún objetivo seleccionado.`);
    return;
  }
  const saveResults = new Map();
  const targets = [];
  for (const token of selected) {
    if (attack && !attackHitsTarget(attack, token.actor)) continue;
    const applicable = [];
    for (const effect of effects) {
      if (effect.trigger === "manual") continue;
      if (effect.trigger === "natural" && (!attack || Number(attack.natural) < Number(effect.minimum))) continue;
      if (effect.trigger === "failed-save") {
        let save = saveResults.get(token.actor.uuid);
        if (!save) {
          save = await rollTargetSave(token.actor, move, saveDc);
          saveResults.set(token.actor.uuid, save);
        }
        if (save.success) continue;
      }
      applicable.push(effect);
    }
    if (applicable.length) targets.push({ actorUuid: token.actor.uuid, tokenName: token.name, effects: applicable });
  }
  const manual = effects.filter(effect => effect.trigger === "manual");
  if (manual.length) ui.notifications.info(`${move.name} contiene un estado contextual que debe resolver el DJ según su descripción.`);
  if (!targets.length) return;
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
}

export function pokemonStatusEffectSource(id, { sourceName = "", moveName = "" } = {}) {
  const definition = POKEMON_STATUS_EFFECTS[id];
  if (!definition) return null;
  const effectId = statusId(id);
  return {
    name: definition.name,
    icon: definition.img,
    img: definition.img,
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

export async function synchronizePokemonStatusEffects() {
  if (!isResponsibleGm()) return;
  for (const actor of game.actors.filter(candidate => ["deployed", "wild"].includes(candidate.getFlag(MODULE_ID, "kind")))) {
    const updates = [];
    const existing = new Set();
    for (const effect of actor.effects) {
      const id = effect.getFlag(MODULE_ID, "status");
      const definition = POKEMON_STATUS_EFFECTS[id];
      if (!definition) continue;
      existing.add(id);
      if (effect.icon !== definition.img) updates.push({ _id: effect.id, icon: definition.img, img: definition.img });
    }
    if (updates.length) await actor.updateEmbeddedDocuments("ActiveEffect", updates);
    const pokemonItem = await pokemonItemForActor(actor);
    const conditions = pokemonItem?.getFlag(MODULE_ID, "instance")?.conditions ?? [];
    const missing = conditions.filter(id => POKEMON_STATUS_EFFECTS[id] && !existing.has(id)).map(id => pokemonStatusEffectSource(id));
    if (missing.length) await actor.createEmbeddedDocuments("ActiveEffect", missing);
  }
}

export function pokemonStatusEntries(instance) {
  return [...new Set(instance?.conditions ?? [])].map(id => ({ id, ...POKEMON_STATUS_EFFECTS[id] })).filter(entry => entry.name);
}

export function pokemonStatusId(id) { return statusId(id); }

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

async function applyPokemonStatus(actor, id, source) {
  const definition = POKEMON_STATUS_EFFECTS[id];
  if (!definition) return;
  const types = pokemonTypes(actor);
  if (definition.immuneTypes.some(type => types.includes(type))) {
    ui.notifications.info(`${actor.name} es inmune a ${definition.name.toLocaleLowerCase()}.`);
    return;
  }
  const effectId = statusId(id);
  if (actor.statuses.has(effectId)) return;
  if (definition.nonVolatile && [...NON_VOLATILE].some(status => actor.statuses.has(status))) {
    ui.notifications.info(`${actor.name} ya tiene un estado no volátil y no puede recibir ${definition.name.toLocaleLowerCase()}.`);
    return;
  }
  const effectSource = pokemonStatusEffectSource(id, source);
  await actor.createEmbeddedDocuments("ActiveEffect", [effectSource]);
  if (definition.nonVolatile) await persistPokemonStatus(actor, id);
  await ChatMessage.create({
    content: `<div class="dnd5e chat-card poke5e-status-card"><header class="card-header"><h3>${escapeHtml(actor.name)}: ${escapeHtml(definition.name)}</h3></header><p>${escapeHtml(source.moveName)} aplica <strong>${escapeHtml(definition.name)}</strong>.</p><p>${escapeHtml(definition.description)}</p></div>`
  });
}

async function persistPokemonStatus(actor, id) {
  const pokemonItem = await pokemonItemForActor(actor);
  if (!pokemonItem) return;
  const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  instance.conditions = [...new Set([...(instance.conditions ?? []), id])];
  await pokemonItem.setFlag(MODULE_ID, "instance", instance);
}

async function applyEndTurnStatusDamage(actor) {
  if (!actor || Number(actor.system.attributes?.hp?.value) <= 0) return;
  let multiplier = 0;
  let label = "";
  if (actor.statuses.has(statusId("badly-poisoned"))) { multiplier = 2; label = "envenenamiento grave"; }
  else if (actor.statuses.has(statusId("poisoned"))) { multiplier = 1; label = "envenenamiento"; }
  else if (actor.statuses.has(statusId("burned"))) { multiplier = 1; label = "quemadura"; }
  if (!multiplier) return;
  const pokemonItem = await pokemonItemForActor(actor);
  const level = Number(pokemonItem?.getFlag(MODULE_ID, "instance")?.level) || 1;
  const damage = (2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4)) * multiplier;
  const hp = actor.system.attributes.hp;
  await actor.update({ "system.attributes.hp.value": Math.max(0, Number(hp.value) - damage) });
  await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(actor.name)}</strong> recibe <strong>${damage} de daño</strong> por ${escapeHtml(label)} al final de su turno.</p></div>` });
}

async function pokemonItemForActor(actor) {
  const uuid = actor.getFlag(MODULE_ID, "pokemonItemUuid");
  if (uuid) return fromUuid(uuid);
  return actor.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? null;
}

function attackHitsTarget(attack, actor) {
  if (Number(attack.natural) === 1) return false;
  if (Number(attack.natural) === 20) return true;
  const ac = Number(actor?.system?.attributes?.ac?.value ?? actor?.system?.attributes?.ac?.flat);
  return !Number.isFinite(ac) || Number(attack.total) >= ac;
}

async function rollTargetSave(actor, move, dc) {
  const attributes = move.save?.attribute?.length ? move.save.attribute : ["con"];
  const choices = attributes.map(key => ({ key, modifier: savingThrowModifier(actor, key) }));
  const chosen = choices.sort((a, b) => b.modifier - a.modifier)[0];
  const roll = await new Roll("1d20 + @modifier", { modifier: chosen.modifier }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — Salvación ${chosen.key.toUpperCase()} contra ${move.name} (CD ${dc})` });
  return { total: Number(roll.total) || 0, success: Number(roll.total) >= Number(dc) };
}

function savingThrowModifier(actor, key) {
  const ability = actor.system.abilities?.[key] ?? {};
  const prepared = Number(ability.save?.value ?? ability.save?.total ?? ability.save);
  if (Number.isFinite(prepared)) return prepared;
  const score = Number(ability.value) || 10;
  const modifier = Number.isFinite(Number(ability.mod)) ? Number(ability.mod) : Math.floor((score - 10) / 2);
  const proficiency = Number(actor.system.attributes?.prof) || 2;
  return modifier + (proficiency * (Number(ability.proficient) || 0));
}

function pokemonTypes(actor) {
  const flagged = actor.getFlag(MODULE_ID, "pokemonTypes");
  if (Array.isArray(flagged)) return flagged;
  return actor.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon")?.getFlag(MODULE_ID, "species")?.type ?? [];
}

function naturalThreshold(sentence) {
  const match = sentence.match(/natural(?: attack)? roll(?:s)?(?: of| is| result(?: is)?| de)?\s*(?:a )?(\d+)|(?:tirada de ataque|resultado|tirada)(?: es| de)?\s*(?:a )?(\d+)(?: o| natural)/i);
  if (match) return Number(match[1] ?? match[2]);
  const spanish = sentence.match(/(?:tirada de ataque|resultado) (?:natural )?de (\d+)|(?:tirada de ataque|resultado) de (\d+)(?: o| natural)/i);
  return spanish ? Number(spanish[1] ?? spanish[2]) : null;
}

function pokemonStatusConfig(id, definition) {
  return { id: statusId(id), name: definition.name, img: definition.img, description: definition.description, flags: { [MODULE_ID]: { pokemonStatus: id } } };
}

function status(name, img, description, { nonVolatile = false, immuneTypes = [], linked = [], rounds = 0 } = {}) {
  return { name, img, description, nonVolatile, immuneTypes, linked, rounds };
}

function statusId(id) { return `${MODULE_ID}-${id}`; }
function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
function isResponsibleGm() {
  const active = game.users.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return active[0]?.id === game.user.id;
}
