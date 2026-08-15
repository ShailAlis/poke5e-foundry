/**
 * Efectos mantenidos de movimientos Pokémon. Los representa como ActiveEffects
 * visibles sobre el token y resuelve sus pulsos al inicio o al final del turno.
 *
 * Las definiciones son deliberadamente explícitas: el texto libre sirve para
 * mostrarlas, pero las reglas temporales no se infieren para evitar aplicar
 * daño o curación en un momento incorrecto.
 */
import { loadPoke5eData } from "./data-service.mjs";
import { MODULE_ID } from "./model.mjs";
import { typeLabel } from "./combat.mjs";
import { applyEndTurnStatusDamage } from "./status-effects.mjs";
import { pokemonEffectIcon } from "./effect-icons.mjs";

const SOCKET_ACTION = "applyOngoingMoveEffects";
const KIND = "ongoing-move";
const CONCENTRATION_KIND = "ongoing-concentration";

/** Movimientos cuyo bloque de daño describe solo el pulso posterior. */
const NO_IMMEDIATE_DAMAGE = new Set(["leech-seed", "curse"]);

/** Catálogo de reglas mantenidas admitidas por el motor. */
export const ONGOING_MOVE_EFFECTS = Object.freeze({
  "anchor-shot": maintainedCondition("hit", "start", "str", ["restrained"], "Queda apresado por la cadena. Repite una salvación de FUE al inicio de cada turno y no puede ser retirado mientras siga atrapado.", { recallLock: true }),
  bind: maintainedCondition("hit", "start", "str", ["grappled"], "Queda agarrado. Repite una salvación de FUE al inicio de cada turno para escapar."),
  clamp: maintainedCondition("hit", "start", "str", ["grappled"], "Queda agarrado durante un minuto. Repite una salvación de FUE al inicio de cada turno para escapar.", { remaining: 10 }),
  constrict: maintainedCondition("hit", "start", "str", ["grappled"], "Queda agarrado. Repite una salvación de FUE al inicio de cada turno para escapar."),
  glare: maintainedCondition("failed-save", "end", "wis", ["frightened"], "Queda asustado. Repite una salvación de SAB al final de cada turno para terminar el efecto.", { remaining: 10 }),
  "leech-seed": {
    target: "selected", trigger: "hit", timing: "end", damageType: "grass",
    formula: "scaled", remaining: null, healFraction: 0.5, uniqueBySource: true,
    immuneTypes: ["grass"], icon: "icons/svg/regen.svg",
    description: "Recibe daño de Planta al final de cada turno; la mitad del daño cura a un Pokémon activo del atacante. Termina al debilitarse, retirarse o acabar el combate."
  },
  "fire-spin": {
    target: "selected", trigger: "hit", timing: "end", damageType: "fire",
    formula: "scaled", remaining: 3, concentration: true, icon: "icons/svg/fire.svg",
    description: "Recibe daño de Fuego al final de sus próximos tres turnos mientras se mantenga la concentración."
  },
  infestation: {
    target: "selected", trigger: "hit", timing: "end", damageType: "bug",
    formula: "scaled", remaining: 3, concentration: true, icon: "icons/svg/hazard.svg",
    description: "Recibe daño de Bicho al final de sus próximos tres turnos mientras se mantenga la concentración."
  },
  "aqua-ring": {
    target: "self", trigger: "automatic", timing: "end", healing: true,
    formula: "proficiency", remaining: 10, concentration: true, icon: "icons/svg/regen.svg",
    description: "Recupera PG iguales a su competencia al final de cada turno durante un minuto mientras mantenga la concentración."
  },
  ingrain: {
    target: "self", trigger: "automatic", timing: "end", healing: true,
    formula: "scaled-plus-move", remaining: 3, movementZero: true, icon: "icons/svg/hazard.svg",
    description: "Recupera PG al final de sus próximos tres turnos, incluido el actual. Su velocidad es 0 y no puede ser retirado voluntariamente."
  },
  roar: maintainedCondition("failed-save", "end", "wis", ["frightened"], "Queda asustado tras huir del atacante. Repite una salvación de SAB al final de cada turno para terminar el efecto."),
  "rock-tomb": maintainedCondition("failed-save", "start", "str", ["restrained"], "Queda apresado por las rocas. Repite una salvación de FUE al inicio de cada turno para escapar."),
  "sand-tomb": maintainedCondition("failed-save", "start", "str", ["restrained"], "Queda apresado por la arena. Repite una salvación de FUE al inicio de cada turno para escapar."),
  "salt-cure": {
    target: "selected", trigger: "failed-save", timing: "start", damageType: "rock",
    formula: "1d4", remaining: null, removeOnHealing: true, vulnerableTypes: ["water", "steel"],
    icon: "icons/svg/hazard.svg",
    description: "Recibe 1d4 de daño de Roca al inicio de cada turno. Agua y Acero son vulnerables. Termina al recibir curación o retirarse."
  },
  "scary-face": maintainedCondition("failed-save", "end", "wis", ["frightened"], "Queda asustado. Repite una salvación de SAB al final de cada turno para terminar el efecto.", { remaining: 10 }),
  submission: maintainedCondition("hit", "start", "str", ["grappled"], "Queda agarrado. Repite una salvación de FUE al inicio de cada turno para escapar."),
  telekinesis: {
    target: "selected", trigger: "failed-save", timing: "end", formula: null,
    remaining: 3, concentration: true, statuses: ["grappled", "restrained"], icon: "icons/svg/aura.svg",
    description: "Queda agarrado, apresado y elevado durante tres rondas mientras se mantenga la concentración."
  },
  "thunder-cage": maintainedCondition("hit", "start", "dex", ["restrained"], "Queda apresado en la jaula. Repite una salvación de DES al inicio de cada turno para escapar."),
  whirlpool: maintainedCondition("hit", "start", "str", ["restrained"], "Queda apresado en el remolino. Repite una salvación de FUE al inicio de cada turno para escapar."),
  wrap: maintainedCondition("hit", "start", "str", ["grappled"], "Queda agarrado. Repite una salvación de FUE al inicio de cada turno para escapar."),
  curse: {
    target: "conditional", trigger: "failed-save", timing: "end", damageType: "ghost",
    formula: "scaled", remaining: 10, concentration: true, icon: "icons/svg/skull.svg",
    description: "La variante Fantasma causa daño al final de cada turno; la variante de otros tipos modifica FUE, CON y DES mientras se mantenga la concentración."
  }
});

/** Indica si #rollMove debe lanzar el daño inicial declarado en el JSON. */
export function moveHasImmediateDamage(move) {
  return !NO_IMMEDIATE_DAMAGE.has(move?.id);
}

/** Devuelve una regla resuelta para el nivel y la variante del usuario. */
export function resolveOngoingMoveEffect(move, { level = 1, moveModifier = 0, proficiency = 2, sourceTypes = [] } = {}) {
  const base = ONGOING_MOVE_EFFECTS[move?.id];
  if (!base) return null;
  if (move.id === "curse" && !sourceTypes.includes("ghost")) {
    return {
      ...base, target: "self", trigger: "automatic", timing: null, formula: null,
      recoil: null, changes: [
        { key: "system.abilities.str.value", mode: 2, value: 2, priority: 20 },
        { key: "system.abilities.con.value", mode: 2, value: 2, priority: 20 },
        { key: "system.abilities.dex.value", mode: 2, value: -4, priority: 20 }
      ]
    };
  }
  return {
    ...base,
    formula: ongoingFormula(base.formula, move, level, moveModifier, proficiency),
    recoil: move.id === "curse" ? "1d6" : null
  };
}

/** Registra socket, turnos, concentración, curación y limpieza del combate. */
export function registerOngoingMoveEffects() {
  game.socket.on(`module.${MODULE_ID}`, payload => {
    if (payload?.action !== SOCKET_ACTION || !isResponsibleGm()) return;
    completeOngoingApplication(payload).catch(error => console.error(`${MODULE_ID} | Ongoing move application failed`, error));
  });
  Hooks.on("combatTurnChange", async (combat, prior, current) => {
    if (!isResponsibleGm()) return;
    const previousActor = prior?.combatantId ? combat.combatants.get(prior.combatantId)?.actor : null;
    const currentActor = current?.combatantId ? combat.combatants.get(current.combatantId)?.actor : null;
    try {
      await applyEndTurnStatusDamage(previousActor);
      await processOngoingEffects(previousActor, "end");
      await processOngoingEffects(currentActor, "start");
    } catch (error) {
      console.error(`${MODULE_ID} | Ongoing turn processing failed`, error);
    }
  });
  Hooks.on("preUpdateActor", (actor, changes) => monitorHpChange(actor, changes));
  Hooks.on("deleteActiveEffect", effect => cascadeDeletedEffect(effect));
  Hooks.on("deleteCombat", combat => {
    if (!isResponsibleGm()) return;
    clearCombatEffects(combat).catch(error => console.error(`${MODULE_ID} | Ongoing combat cleanup failed`, error));
  });
  synchronizeOngoingEffectIcons().catch(error => console.error(`${MODULE_ID} | Ongoing effect icon synchronization failed`, error));
}

/**
 * Resuelve objetivos e impacto/salvación y crea la petición segura al DJ.
 * Se llama después de gastar PP y resolver el daño inicial.
 */
export async function applyMoveOngoingEffects({ move, attack = null, saveDc, sourceOwnerActor, sourceCombatActor, sourcePokemonItem, sourceName, level, moveModifier, proficiency, sourceTypes }) {
  const rule = resolveOngoingMoveEffect(move, { level, moveModifier, proficiency, sourceTypes });
  if (!rule) return;
  if (!sourceCombatActor) {
    ui.notifications.warn(`${move.name} necesita que el Pokémon esté desplegado para mantener su efecto.`);
    return;
  }
  const tokens = rule.target === "self" ? [] : [...(game.user.targets ?? [])];
  if (rule.target !== "self" && !tokens.length) {
    ui.notifications.warn(`${move.name} mantiene un efecto, pero no hay ningún objetivo seleccionado.`);
    return;
  }
  const targets = [];
  if (rule.target === "self") targets.push({ actorUuid: sourceCombatActor.uuid, tokenName: sourceCombatActor.name });
  else {
    for (const token of tokens) {
      if (!token.actor?.uuid || (rule.trigger === "hit" && attack && !attackHitsTarget(attack, token.actor))) continue;
      if (rule.trigger === "failed-save" && (await rollTargetSave(token.actor, move, saveDc)).success) continue;
      targets.push({ actorUuid: token.actor.uuid, tokenName: token.name });
    }
  }
  if (!targets.length) return;
  const payload = {
    action: SOCKET_ACTION,
    userId: game.user.id,
    sourceOwnerActorUuid: sourceOwnerActor?.uuid,
    sourceCombatActorUuid: sourceCombatActor.uuid,
    sourcePokemonItemUuid: sourcePokemonItem?.uuid,
    sourceTrainerUuid: sourceCombatActor.getFlag(MODULE_ID, "trainerUuid") ?? (sourceOwnerActor?.type === "character" ? sourceOwnerActor.uuid : null),
    sourceName,
    sourceTypes,
    moveId: move.id,
    moveName: move.name,
    level,
    moveModifier,
    proficiency,
    saveDc,
    targets
  };
  const actors = await Promise.all(targets.map(target => fromUuid(target.actorUuid)));
  if (game.user.isGM || actors.every(actor => actor?.canUserModify(game.user, "update"))) await completeOngoingApplication(payload);
  else {
    game.socket.emit(`module.${MODULE_ID}`, payload);
    ui.notifications.info(`Se ha solicitado al DJ aplicar el efecto mantenido de ${move.name}.`);
  }
}

/** Efectos mantenidos visibles en la ficha Pokédex. */
export function ongoingEffectEntries(actor) {
  return (actor?.effects ?? []).filter(effect => [KIND, CONCENTRATION_KIND].includes(effect.getFlag(MODULE_ID, "kind"))).map(effect => {
    const ongoing = effect.getFlag(MODULE_ID, "ongoing") ?? {};
    const remaining = Number.isFinite(Number(ongoing.remaining)) ? `${ongoing.remaining} turno${Number(ongoing.remaining) === 1 ? "" : "s"}` : "Hasta que termine";
    return { id: effect.id, name: effect.name, img: effect.img ?? effect.icon, description: effect.description ?? ongoing.description, remaining };
  });
}

/** Permite retirar manualmente un efecto desde la ficha personalizada. */
export async function removeOngoingEffect(actor, effectId) {
  if (actor?.effects?.get(effectId)) await actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
}

/** Impide una retirada voluntaria mientras Arraigo siga activo. */
export function actorHasRecallLock(actor) {
  return actor?.effects?.some(effect => {
    const ongoing = effect.getFlag(MODULE_ID, "ongoing");
    return ongoing?.moveId === "ingrain" || ongoing?.recallLock;
  }) ?? false;
}

async function completeOngoingApplication(payload) {
  const requester = game.users.get(payload.userId);
  const owner = payload.sourceOwnerActorUuid ? await fromUuid(payload.sourceOwnerActorUuid) : null;
  if (!requester?.active || owner?.documentName !== "Actor" || !owner.testUserPermission(requester, "OWNER")) return;
  const data = await loadPoke5eData();
  const move = data.movesById.get(payload.moveId);
  const rule = resolveOngoingMoveEffect(move, payload);
  const sourceActor = await fromUuid(payload.sourceCombatActorUuid);
  if (!rule || sourceActor?.documentName !== "Actor") return;

  if (rule.concentration) await removeSourceConcentration(payload.sourcePokemonItemUuid, payload.sourceCombatActorUuid);
  if (rule.uniqueBySource) await removeUniqueSourceEffect(payload.moveId, payload.sourcePokemonItemUuid, payload.sourceCombatActorUuid);
  const linkId = foundry.utils.randomID();
  let applied = 0;
  for (const target of payload.targets ?? []) {
    const actor = await fromUuid(target.actorUuid);
    if (actor?.documentName !== "Actor") continue;
    const targetTypes = pokemonTypes(actor);
    if (rule.immuneTypes?.some(type => targetTypes.includes(type))) {
      await postEffectMessage(`${actor.name} es inmune al efecto de ${move.name}.`);
      continue;
    }
    const old = actor.effects.filter(effect => effect.getFlag(MODULE_ID, "ongoing")?.moveId === move.id);
    if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old.map(effect => effect.id));
    await actor.createEmbeddedDocuments("ActiveEffect", [effectSource(move, rule, payload, linkId)]);
    applied += 1;
    await postEffectMessage(`<strong>${escapeHtml(actor.name)}</strong> queda bajo el efecto mantenido de <strong>${escapeHtml(move.name)}</strong>.<br>${escapeHtml(rule.description)}`, true);
  }
  if (!applied) return;
  if (rule.concentration && !payload.targets.some(target => target.actorUuid === sourceActor.uuid)) {
    await sourceActor.createEmbeddedDocuments("ActiveEffect", [concentrationSource(move, rule, payload, linkId)]);
  }
  if (rule.recoil) await applyDirectDamage(sourceActor, rule.recoil, null, `${move.name}: coste inicial`);
}

function effectSource(move, rule, payload, linkId) {
  const iconSlot = ongoingIconSlot(move.id, rule.target);
  const icon = pokemonEffectIcon(iconSlot.category, iconSlot.id, rule.icon);
  const changes = rule.movementZero
    ? ["walk", "fly", "swim", "burrow", "climb"].map(type => ({ key: `system.attributes.movement.${type}`, mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: 0, priority: 30 }))
    : (rule.changes ?? []);
  const ongoing = {
    moveId: move.id, moveName: move.name, timing: rule.timing, formula: rule.formula,
    damageType: rule.damageType, healing: Boolean(rule.healing), remaining: rule.remaining,
    concentration: Boolean(rule.concentration), healFraction: rule.healFraction ?? 0,
    removeOnHealing: Boolean(rule.removeOnHealing), vulnerableTypes: rule.vulnerableTypes ?? [],
    immuneTypes: rule.immuneTypes ?? [], sourceCombatActorUuid: payload.sourceCombatActorUuid,
    sourcePokemonItemUuid: payload.sourcePokemonItemUuid, sourceTrainerUuid: payload.sourceTrainerUuid,
    sourceName: payload.sourceName, linkId, description: rule.description,
    repeatSave: rule.repeatSave ?? null, saveDc: Number(payload.saveDc) || 10,
    statuses: rule.statuses ?? [], recallLock: Boolean(rule.recallLock),
    iconCategory: iconSlot.category, iconId: iconSlot.id
  };
  return {
    name: move.name, img: icon, icon, description: rule.description,
    statuses: rule.statuses ?? [],
    changes, duration: rule.timing ? {} : { rounds: 10, startRound: game.combat?.round ?? 0, startTurn: game.combat?.turn ?? 0 },
    flags: { [MODULE_ID]: { kind: KIND, ongoing } }
  };
}

function concentrationSource(move, rule, payload, linkId) {
  const description = `Concentración de ${payload.sourceName} para mantener ${move.name}.`;
  const icon = pokemonEffectIcon("buffs", "concentration", "icons/svg/aura.svg");
  return {
    name: `Concentración: ${move.name}`, img: icon, icon, description,
    flags: { [MODULE_ID]: { kind: CONCENTRATION_KIND, ongoing: { moveId: move.id, moveName: move.name, concentration: true, sourceCombatActorUuid: payload.sourceCombatActorUuid, sourcePokemonItemUuid: payload.sourcePokemonItemUuid, linkId, description, iconCategory: "buffs", iconId: "concentration" } } }
  };
}

/** Clasifica cada efecto para buscar su icono en buffs/ o debuffs/. */
function ongoingIconSlot(moveId, target) {
  if (["aqua-ring", "ingrain"].includes(moveId)) return { category: "buffs", id: moveId };
  if (moveId === "curse" && target === "self") return { category: "buffs", id: "curse-buff" };
  return { category: "debuffs", id: moveId };
}

/** Actualiza también los ActiveEffects creados antes de instalar los PNG. */
async function synchronizeOngoingEffectIcons() {
  if (!isResponsibleGm()) return;
  for (const actor of game.actors) {
    const updates = [];
    for (const effect of actor.effects) {
      const kind = effect.getFlag(MODULE_ID, "kind");
      if (![KIND, CONCENTRATION_KIND].includes(kind)) continue;
      const ongoing = effect.getFlag(MODULE_ID, "ongoing") ?? {};
      let slot;
      if (kind === CONCENTRATION_KIND) slot = { category: "buffs", id: "concentration" };
      else if (ongoing.iconCategory && ongoing.iconId) slot = { category: ongoing.iconCategory, id: ongoing.iconId };
      else slot = ongoingIconSlot(ongoing.moveId, ongoing.moveId === "curse" && effect.changes?.length ? "self" : "selected");
      const fallback = ONGOING_MOVE_EFFECTS[ongoing.moveId]?.icon ?? effect.img ?? effect.icon;
      const icon = pokemonEffectIcon(slot.category, slot.id, fallback);
      if ((effect.img ?? effect.icon) === icon && ongoing.iconCategory === slot.category && ongoing.iconId === slot.id) continue;
      updates.push({
        _id: effect.id, img: icon, icon,
        [`flags.${MODULE_ID}.ongoing.iconCategory`]: slot.category,
        [`flags.${MODULE_ID}.ongoing.iconId`]: slot.id
      });
    }
    if (updates.length) await actor.updateEmbeddedDocuments("ActiveEffect", updates);
  }
}

async function processOngoingEffects(actor, timing) {
  if (!actor) return;
  const effects = actor.effects.filter(effect => effect.getFlag(MODULE_ID, "kind") === KIND && effect.getFlag(MODULE_ID, "ongoing")?.timing === timing);
  for (const effect of effects) {
    const ongoing = effect.getFlag(MODULE_ID, "ongoing");
    if (Number(actor.system.attributes?.hp?.value) <= 0) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      continue;
    }
    if (ongoing.concentration) {
      const source = await fromUuid(ongoing.sourceCombatActorUuid);
      if (source?.documentName !== "Actor" || Number(source.system.attributes?.hp?.value) <= 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
        continue;
      }
    }
    if (ongoing.repeatSave && await rollOngoingSave(actor, ongoing)) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      continue;
    }
    let amount = 0;
    if (ongoing.healing) amount = await applyDirectHealing(actor, ongoing.formula, ongoing.moveName);
    else amount = await applyDirectDamage(actor, ongoing.formula, ongoing.damageType, ongoing.moveName, ongoing);
    if (ongoing.healFraction && amount > 0) await healLeechSeedSource(ongoing, amount);
    if (Number(actor.system.attributes?.hp?.value) <= 0) {
      if (actor.effects.has(effect.id)) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      continue;
    }
    if (Number.isFinite(Number(ongoing.remaining))) {
      const remaining = Math.max(0, Number(ongoing.remaining) - 1);
      if (!remaining) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      else await effect.update({ [`flags.${MODULE_ID}.ongoing.remaining`]: remaining });
    }
  }
}

async function applyDirectDamage(actor, formula, damageType, label, ongoing = {}) {
  if (!formula) return 0;
  const roll = await new Roll(formula).evaluate();
  const raw = Math.max(0, Number(roll.total) || 0);
  const multiplier = damageMultiplier(actor, damageType, ongoing);
  const damage = Math.max(0, Math.floor(raw * multiplier));
  const hp = actor.system.attributes.hp;
  const actual = Math.min(Number(hp.value) || 0, damage);
  if (damage) await actor.update({ "system.attributes.hp.value": Math.max(0, Number(hp.value) - damage) });
  const affinity = multiplier === 0 ? " · Inmune" : multiplier > 1 ? " · Vulnerable" : multiplier < 1 ? " · Resistente" : "";
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${label} · ${damageType ? typeLabel(damageType) : "Daño"}: ${damage}${affinity}` });
  return actual;
}

async function applyDirectHealing(actor, formula, label) {
  if (!formula) return 0;
  const roll = await new Roll(formula).evaluate();
  const hp = actor.system.attributes.hp;
  const healing = Math.max(0, Number(roll.total) || 0);
  const actual = Math.min(Math.max(0, Number(hp.max) - Number(hp.value)), healing);
  if (actual) await actor.update({ "system.attributes.hp.value": Number(hp.value) + actual });
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${label} · Curación: ${actual} PG` });
  return actual;
}

async function healLeechSeedSource(ongoing, damage) {
  const candidates = game.combat?.combatants?.map(combatant => combatant.actor).filter(Boolean) ?? [];
  let recipient = candidates.find(actor => actor.uuid === ongoing.sourceCombatActorUuid && Number(actor.system.attributes?.hp?.value) > 0);
  if (!recipient && ongoing.sourceTrainerUuid) recipient = candidates.find(actor => actor.getFlag(MODULE_ID, "trainerUuid") === ongoing.sourceTrainerUuid && Number(actor.system.attributes?.hp?.value) > 0);
  if (!recipient) return;
  const amount = Math.floor(damage * Number(ongoing.healFraction));
  if (amount > 0) await applyDirectHealing(recipient, String(amount), `${ongoing.moveName}: energía drenada`);
}

function monitorHpChange(actor, changes) {
  const next = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (next == null) return;
  const previous = Number(actor.system.attributes?.hp?.value) || 0;
  const difference = Number(next) - previous;
  if (!difference) return;
  setTimeout(() => {
    if (difference > 0) removeEffectsOnHealing(actor).catch(error => console.error(`${MODULE_ID} | Healing cleanup failed`, error));
    else if (Number(next) <= 0) removeFaintedEffects(actor).catch(error => console.error(`${MODULE_ID} | Fainted effect cleanup failed`, error));
    else checkConcentration(actor, Math.abs(difference)).catch(error => console.error(`${MODULE_ID} | Concentration check failed`, error));
  }, 0);
}

async function removeFaintedEffects(actor) {
  const effects = actor.effects.filter(effect => [KIND, CONCENTRATION_KIND].includes(effect.getFlag(MODULE_ID, "kind")));
  if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
}

async function removeEffectsOnHealing(actor) {
  const effects = actor.effects.filter(effect => effect.getFlag(MODULE_ID, "ongoing")?.removeOnHealing);
  if (effects.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
    await postEffectMessage(`<strong>${escapeHtml(actor.name)}</strong> recibe curación y elimina Cura Salina.`, true);
  }
}

async function checkConcentration(actor, damage) {
  const effects = actor.effects.filter(effect => effect.getFlag(MODULE_ID, "ongoing")?.concentration);
  if (!effects.length || Number(actor.system.attributes?.hp?.value) <= 0) {
    if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
    return;
  }
  const dc = Math.max(10, Math.floor(damage / 2));
  const modifier = savingThrowModifier(actor, "con");
  const roll = await new Roll("1d20 + @modifier", { modifier }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} · Concentración CD ${dc}` });
  if (Number(roll.total) < dc) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
}

async function cascadeDeletedEffect(effect) {
  if (!isResponsibleGm()) return;
  const kind = effect.getFlag(MODULE_ID, "kind");
  if (![KIND, CONCENTRATION_KIND].includes(kind)) return;
  const linkId = effect.getFlag(MODULE_ID, "ongoing")?.linkId;
  if (!linkId) return;
  const linked = worldActors().flatMap(actor => actor.effects.filter(candidate => candidate.getFlag(MODULE_ID, "ongoing")?.linkId === linkId));
  const byActor = new Map();
  for (const candidate of linked) {
    const ids = byActor.get(candidate.parent.id) ?? [];
    ids.push(candidate.id);
    byActor.set(candidate.parent.id, ids);
  }
  for (const [actorId, ids] of byActor) await game.actors.get(actorId)?.deleteEmbeddedDocuments("ActiveEffect", ids);
}

async function removeSourceConcentration(itemUuid, actorUuid) {
  const effects = worldActors().flatMap(actor => actor.effects.filter(effect => {
    const ongoing = effect.getFlag(MODULE_ID, "ongoing");
    return ongoing?.concentration && ((itemUuid && ongoing.sourcePokemonItemUuid === itemUuid) || (!itemUuid && ongoing.sourceCombatActorUuid === actorUuid));
  }));
  await deleteEffects(effects);
}

async function removeUniqueSourceEffect(moveId, itemUuid, actorUuid) {
  const effects = worldActors().flatMap(actor => actor.effects.filter(effect => {
    const ongoing = effect.getFlag(MODULE_ID, "ongoing");
    return ongoing?.moveId === moveId && ((itemUuid && ongoing.sourcePokemonItemUuid === itemUuid) || (!itemUuid && ongoing.sourceCombatActorUuid === actorUuid));
  }));
  await deleteEffects(effects);
}

async function deleteEffects(effects) {
  const groups = new Map();
  for (const effect of effects) {
    const entries = groups.get(effect.parent.id) ?? [];
    entries.push(effect.id);
    groups.set(effect.parent.id, entries);
  }
  for (const [actorId, ids] of groups) await game.actors.get(actorId)?.deleteEmbeddedDocuments("ActiveEffect", ids);
}

async function clearCombatEffects(combat) {
  for (const actor of combat.combatants.map(combatant => combatant.actor).filter(Boolean)) {
    const ids = actor.effects.filter(effect => [KIND, CONCENTRATION_KIND].includes(effect.getFlag(MODULE_ID, "kind"))).map(effect => effect.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}

function damageMultiplier(actor, damageType, ongoing) {
  if (!damageType) return 1;
  const types = pokemonTypes(actor);
  if (ongoing.immuneTypes?.some(type => types.includes(type))) return 0;
  if (ongoing.vulnerableTypes?.some(type => types.includes(type))) return 2;
  if (traitValues(actor.system.traits?.di).includes(damageType)) return 0;
  if (traitValues(actor.system.traits?.dv).includes(damageType)) return 2;
  if (traitValues(actor.system.traits?.dr).includes(damageType)) return 0.5;
  return 1;
}

function traitValues(trait) {
  const value = trait?.value ?? trait ?? [];
  if (value instanceof Set) return [...value];
  if (Array.isArray(value)) return value;
  return typeof value === "string" ? value.split(/[;,\s]+/).filter(Boolean) : [];
}

function pokemonTypes(actor) {
  const flagged = actor.getFlag(MODULE_ID, "pokemonTypes");
  if (Array.isArray(flagged)) return flagged;
  return actor.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon")?.getFlag(MODULE_ID, "species")?.type ?? [];
}

function ongoingFormula(kind, move, level, moveModifier, proficiency) {
  if (!kind) return null;
  if (/^\d+d\d+(?:\s*[+-]\s*\d+)?$/i.test(kind)) return kind;
  if (kind === "proficiency") return String(Math.max(0, Number(proficiency) || 0));
  const dice = scaledDice(move, level);
  if (!dice) return null;
  return kind === "scaled-plus-move" ? appendModifier(dice, moveModifier) : dice;
}

function maintainedCondition(trigger, timing, saveAttribute, statuses, description, { remaining = null, recallLock = false } = {}) {
  return {
    target: "selected", trigger, timing, formula: null, remaining,
    repeatSave: saveAttribute, statuses, recallLock, description, icon: "icons/svg/net.svg"
  };
}

function scaledDice(move, level) {
  const diceByLevel = move?.damage?.dice ?? ({ ingrain: { 1: "1d6", 5: "1d10", 10: "2d8", 17: "5d4" } }[move?.id]);
  if (!diceByLevel) return null;
  const tiers = Object.keys(diceByLevel).map(Number).filter(tier => tier <= Number(level)).sort((a, b) => b - a);
  return diceByLevel[String(tiers[0] ?? 1)] ?? null;
}

function appendModifier(dice, modifier) {
  const value = Number(modifier) || 0;
  return value ? `${dice} ${value > 0 ? "+" : "-"} ${Math.abs(value)}` : dice;
}

function attackHitsTarget(attack, actor) {
  if (!attack) return false;
  if (Number(attack.natural) === 1) return false;
  if (Number(attack.natural) === 20) return true;
  const ac = Number(actor?.system?.attributes?.ac?.value ?? actor?.system?.attributes?.ac?.flat);
  return !Number.isFinite(ac) || Number(attack.total) >= ac;
}

async function rollTargetSave(actor, move, dc) {
  const choices = (move.save?.attribute?.length ? move.save.attribute : ["con"]).map(key => ({ key, modifier: savingThrowModifier(actor, key) })).sort((a, b) => b.modifier - a.modifier);
  const chosen = choices[0];
  const roll = await new Roll("1d20 + @modifier", { modifier: chosen.modifier }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} · Salvación ${chosen.key.toUpperCase()} contra ${move.name} (CD ${dc})` });
  return { success: Number(roll.total) >= Number(dc) };
}

async function rollOngoingSave(actor, ongoing) {
  const key = ongoing.repeatSave;
  const roll = await new Roll("1d20 + @modifier", { modifier: savingThrowModifier(actor, key) }).evaluate();
  const success = Number(roll.total) >= Number(ongoing.saveDc);
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} · ${ongoing.moveName}: salvación ${key.toUpperCase()} CD ${ongoing.saveDc}${success ? " · Escapa" : " · Continúa"}` });
  return success;
}

function savingThrowModifier(actor, key) {
  const ability = actor.system.abilities?.[key] ?? {};
  const prepared = Number(ability.save?.value ?? ability.save?.total ?? ability.save);
  if (Number.isFinite(prepared)) return prepared;
  const score = Number(ability.value) || 10;
  const modifier = Number.isFinite(Number(ability.mod)) ? Number(ability.mod) : Math.floor((score - 10) / 2);
  return modifier + ((Number(actor.system.attributes?.prof) || 2) * (Number(ability.proficient) || 0));
}

function worldActors() { return game.actors?.contents ?? [...game.actors]; }
function isResponsibleGm() {
  const active = game.users.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return active[0]?.id === game.user.id;
}
async function postEffectMessage(content, html = false) {
  await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p>${html ? content : escapeHtml(content)}</p></div>` });
}
function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
