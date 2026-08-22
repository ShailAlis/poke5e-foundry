/**
 * Motor de modificadores de movimientos. Convierte las reglas explícitas de
 * move-modifier-rules.mjs en ActiveEffects visibles, acumulables y consumibles,
 * y expone sus totales a las tiradas personalizadas de la ficha Pokémon.
 */
import { MODULE_ID } from "../core/model.mjs";
import { pokemonEffectIcon } from "../core/effect-icons.mjs";
import { MOVE_MODIFIER_EFFECTS, modifierTriggerMatches, nextModifierStacks, scaledMoveModifiers } from "./move-modifier-rules.mjs";
import { abilityGrantsDebuffImmunity, abilityGrantsMeleeAttackAdvantage, abilityGrantsSelfAttackAdvantage, abilityLowHpCombatModifiers } from "../pokemon/pokemon-abilities.mjs";
import { applyGruntSaveAdvantage, applyHobbyistSaveBoost, applyNurseStatusSaveAdvantage, applyTacticianDcBoost } from "../trainer/trainer-resources.mjs";

const SOCKET_ACTION = "applyMoveModifiers";
const KIND = "move-modifier";
const CONCENTRATION_KIND = "move-modifier-concentration";
const STATUS_KIND = "pokemon-status";

/**
 * Modificadores mecánicos que arrastra cada estado alterado mientras esté
 * activo: desventaja en ataques, pruebas y salvaciones concretas, tal como
 * describe su texto en POKEMON_STATUS_EFFECTS (status-effects.mjs). Se leen
 * aquí por el id de estado que ya guarda el ActiveEffect (`flags.<módulo>.status`)
 * en vez de duplicar el catálogo de estados, y pokemonCombatModifiers() los sube
 * exactamente igual que los modificadores de move-modifier-rules.mjs. Quemado,
 * Congelado, Dormido dependen de dnd5e (daño con desventaja aparte, o de las
 * condiciones nativas incapacitated/restrained enlazadas) y no necesitan
 * entrada aquí.
 */
const STATUS_COMBAT_MODIFIERS = Object.freeze({
  poisoned: { attackDisadvantage: true, abilityCheckDisadvantage: true },
  "badly-poisoned": { attackDisadvantage: true, abilityCheckDisadvantage: true },
  paralyzed: { saveDisadvantageAbilities: ["str", "dex"] },
  flinched: { attackDisadvantage: true, abilityCheckDisadvantage: true, saveDisadvantageAbilities: ["str", "dex", "con", "int", "wis", "cha"] }
});

/** Registra el socket, la limpieza del combate y la reparación de iconos. */
export function registerMoveModifierEffects() {
  game.socket.on(`module.${MODULE_ID}`, payload => {
    if (payload?.action !== SOCKET_ACTION || !isResponsibleGm()) return;
    completeModifierApplication(payload).catch(error => console.error(`${MODULE_ID} | Move modifier application failed`, error));
  });
  Hooks.on("deleteCombat", combat => {
    if (!isResponsibleGm()) return;
    clearCombatModifiers(combat).catch(error => console.error(`${MODULE_ID} | Move modifier cleanup failed`, error));
  });
  Hooks.on("combatTurnChange", (combat, prior, current) => {
    if (!isResponsibleGm()) return;
    const actor = current?.combatantId ? combat.combatants.get(current.combatantId)?.actor : null;
    processModifierRepeatSaves(actor).catch(error => console.error(`${MODULE_ID} | Modifier repeat save failed`, error));
  });
  Hooks.on("preUpdateActor", (actor, changes) => monitorModifierConcentration(actor, changes));
  synchronizeModifierIcons().catch(error => console.error(`${MODULE_ID} | Move modifier icon synchronization failed`, error));
}

/**
 * Resuelve impacto y salvación para el modificador de un movimiento. Reutiliza
 * las salvaciones que status-effects.mjs ya haya tirado para evitar duplicados.
 */
export async function applyMoveModifierEffects({ move, attack = null, saveDc, saveResults = new Map(), sourceOwnerActor, sourceCombatActor, sourceName, proficiency = 2 }) {
  const rule = MOVE_MODIFIER_EFFECTS[move?.id];
  if (!rule) return;
  if (!sourceCombatActor) {
    ui.notifications.warn(game.i18n.format("POKE5E.MoveEffects.MustBeDeployed", { move: move.name }));
    return;
  }
  const selected = [...(game.user.targets ?? [])].map(token => ({ actor: token.actor, tokenName: token.name }));
  if (rule.target === "selected" && !selected.length) {
    ui.notifications.warn(game.i18n.format("POKE5E.MoveEffects.NoTargetModifier", { move: move.name }));
    return;
  }
  const candidates = rule.target === "self"
    ? [{ actor: sourceCombatActor, tokenName: sourceName }]
    : rule.target === "source-and-selected"
      ? [{ actor: sourceCombatActor, tokenName: sourceName }, ...selected.filter(entry => entry.actor?.uuid !== sourceCombatActor.uuid)]
      : selected;
  const sourceModifiers = pokemonCombatModifiers(sourceCombatActor);
  const selectedAttackHit = Boolean(attack) && selected.some(candidate => attackHitsPokemonTarget(attack, candidate.actor));
  const targets = [];
  for (const candidate of candidates) {
    const actor = candidate.actor;
    if (!actor?.uuid) continue;
    if (rule.category === "debuffs" && pokemonCombatModifiers(actor).debuffImmune) continue;
    if (!await actorMatchesModifierRule(actor, rule)) continue;
    const resolvedAttack = attack ? { ...attack, hit: rule.target === "self" ? selectedAttackHit : attackHitsPokemonTarget(attack, actor) } : null;
    let save = saveResults.get(actor.uuid) ?? null;
    if (["failed-save", "failed-save-margin"].includes(rule.trigger) && (!rule.requiresHit || resolvedAttack?.hit) && !save) {
      save = await rollModifierSave(actor, move, saveDc, sourceModifiers, sourceOwnerActor);
      saveResults.set(actor.uuid, save);
    }
    if (!modifierTriggerMatches(rule, { attack: resolvedAttack, save })) continue;
    targets.push({ actorUuid: actor.uuid, tokenName: candidate.tokenName });
  }
  if (!targets.length) return;
  if (move.id === "memento" && Number(sourceCombatActor.system.attributes?.hp?.value) > 0) {
    await sourceCombatActor.update({ "system.attributes.hp.value": 0 });
  }
  const payload = {
    action: SOCKET_ACTION,
    userId: game.user.id,
    sourceOwnerActorUuid: sourceOwnerActor?.uuid,
    sourceCombatActorUuid: sourceCombatActor.uuid,
    sourceName,
    proficiency,
    moveId: move.id,
    moveName: move.name,
    saveDc: Number(saveDc) || 10,
    linkId: rule.concentration ? foundry.utils.randomID() : null,
    targets
  };
  const actors = await Promise.all(targets.map(target => fromUuid(target.actorUuid)));
  if (game.user.isGM || actors.every(actor => actor?.canUserModify(game.user, "update"))) await completeModifierApplication(payload);
  else {
    game.socket.emit(`module.${MODULE_ID}`, payload);
    ui.notifications.info(game.i18n.format("POKE5E.MoveEffects.ModifierRequested", { move: move.name }));
  }
}

/** Suma los modificadores activos que afectan a las tiradas del actor. */
export function pokemonCombatModifiers(actor, { targetUuids = [] } = {}) {
  const total = { attack: 0, damage: 0, criticalRangeBonus: 0, moveModifierMultiplier: 1, attackDice: [], saveDice: [], saves: {}, attackAdvantage: false, attackDisadvantage: false, incomingAttackAdvantage: false, saveAdvantage: false, saveTargetsAdvantage: false, suppressAttackProficiency: false, disableHeldItem: false, abilityCheckDisadvantage: false, attackAdvantageAbilities: [], saveDisadvantageAbilities: [], saveTargetsDisadvantageAbilities: [], saveAdvantageAbilities: [], meleeAttackAdvantage: false, guaranteedHit: false, guaranteedCritical: false, moveLockAll: false, debuffImmune: false, statusImmune: false, recallLock: false, damageHalved: false };
  // Cuerpo Puro/Cuerpo de Metal Pleno/Humo Blanco (lote 16 de habilidades
  // Pokémon): mismo flag `debuffImmune` que ya activaba un ActiveEffect de
  // movimiento (categoría "debuffs"), leído del flag síncrono `pokemonAbilities`
  // que ya llevan los actores desplegados y salvajes (lote 9) para no
  // convertir esta función en async por una sola comprobación.
  if (abilityGrantsDebuffImmunity(actor?.getFlag?.(MODULE_ID, "pokemonAbilities"))) total.debuffImmune = true;
  // Desertor/Descontrol (lote 24): desventaja de ataque propia y, con
  // Descontrol, ventaja de salvación del objetivo, al 25% o menos de PG
  // máximos. Misma lectura síncrona del flag `pokemonAbilities` que el
  // debuffImmune de arriba, con la fracción de PG calculada aquí mismo.
  const hp = actor?.system?.attributes?.hp;
  const hpFraction = hp?.max ? Number(hp.value) / Number(hp.max) : 1;
  const lowHpModifiers = abilityLowHpCombatModifiers(actor?.getFlag?.(MODULE_ID, "pokemonAbilities"), hpFraction);
  total.attackDisadvantage ||= lowHpModifiers.attackDisadvantage;
  total.saveTargetsAdvantage ||= lowHpModifiers.saveTargetsAdvantage;
  // Espada Justiciera/Sin Reparos (lotes 34/35): ventaja en los propios
  // ataques, mismo flag síncrono `pokemonAbilities` que el resto de esta
  // función.
  const ownAbilities = actor?.getFlag?.(MODULE_ID, "pokemonAbilities");
  total.meleeAttackAdvantage ||= abilityGrantsMeleeAttackAdvantage(ownAbilities);
  total.attackAdvantage ||= abilityGrantsSelfAttackAdvantage(ownAbilities);
  // Desafiante (lote 41): +2 a los propios ataques mientras el Pokémon sufra
  // cualquier estado alterado activo. El texto original también cubre una
  // reducción de característica impuesta por el rival, pero este proyecto no
  // lleva un registro de "quién causó" cada cambio de característica, así
  // que se simplifica al caso de estado alterado (mismo `hasActiveStatus`
  // que se calcula abajo al recorrer los ActiveEffect del actor).
  const hasActiveStatus = (actor?.effects ?? []).some(effect => effect.getFlag?.(MODULE_ID, "kind") === STATUS_KIND);
  if (hasActiveStatus && (ownAbilities ?? []).includes("defiant")) total.attack += 2;
  for (const effect of actor?.effects ?? []) {
    const kind = effect.getFlag?.(MODULE_ID, "kind");
    if (kind === STATUS_KIND) {
      const modifiers = STATUS_COMBAT_MODIFIERS[effect.getFlag(MODULE_ID, "status")];
      if (modifiers) mergeCombatModifiers(total, modifiers);
      continue;
    }
    if (kind !== KIND) continue;
    const state = effect.getFlag(MODULE_ID, "modifier") ?? {};
    if (state.sourceOnly && !targetUuids.includes(state.sourceCombatActorUuid)) continue;
    mergeCombatModifiers(total, state.modifiers ?? {});
  }
  return total;
}

/** Suma un objeto `modifiers` (catálogo de movimientos o de estados) en el total acumulado de pokemonCombatModifiers(). */
function mergeCombatModifiers(total, modifiers) {
  total.attack += Number(modifiers.attack) || 0;
  total.damage += Number(modifiers.damage) || 0;
  total.criticalRangeBonus += Number(modifiers.criticalRangeBonus) || 0;
  total.moveModifierMultiplier = Math.max(total.moveModifierMultiplier, Number(modifiers.moveModifierMultiplier) || 1);
  if (modifiers.attackDice) total.attackDice.push(modifiers.attackDice);
  if (modifiers.saveDice) total.saveDice.push(modifiers.saveDice);
  for (const [ability, amount] of Object.entries(modifiers.saves ?? {})) total.saves[ability] = (total.saves[ability] ?? 0) + (Number(amount) || 0);
  total.attackAdvantage ||= Boolean(modifiers.attackAdvantage);
  total.attackDisadvantage ||= Boolean(modifiers.attackDisadvantage);
  total.incomingAttackAdvantage ||= Boolean(modifiers.incomingAttackAdvantage);
  total.saveAdvantage ||= Boolean(modifiers.saveAdvantage);
  total.saveTargetsAdvantage ||= Boolean(modifiers.saveTargetsAdvantage);
  total.suppressAttackProficiency ||= Boolean(modifiers.suppressAttackProficiency);
  total.disableHeldItem ||= Boolean(modifiers.disableHeldItem);
  total.abilityCheckDisadvantage ||= Boolean(modifiers.abilityCheckDisadvantage);
  total.meleeAttackAdvantage ||= Boolean(modifiers.meleeAttackAdvantage);
  total.guaranteedHit ||= Boolean(modifiers.guaranteedHit);
  total.guaranteedCritical ||= Boolean(modifiers.guaranteedCritical);
  total.moveLockAll ||= Boolean(modifiers.moveLockAll);
  total.debuffImmune ||= Boolean(modifiers.debuffImmune);
  total.statusImmune ||= Boolean(modifiers.statusImmune);
  total.recallLock ||= Boolean(modifiers.recallLock);
  total.damageHalved ||= Boolean(modifiers.damageHalved);
  total.attackAdvantageAbilities.push(...(modifiers.attackAdvantageAbilities ?? []));
  total.saveDisadvantageAbilities.push(...(modifiers.saveDisadvantageAbilities ?? []));
  total.saveTargetsDisadvantageAbilities.push(...(modifiers.saveTargetsDisadvantageAbilities ?? []));
  total.saveAdvantageAbilities.push(...(modifiers.saveAdvantageAbilities ?? []));
}

/** Resume las ventajas defensivas que los objetivos seleccionados conceden al atacante. */
export function targetedPokemonModifiers(tokens = []) {
  const total = { incomingAttackAdvantage: false };
  for (const token of tokens) {
    for (const effect of token.actor?.effects ?? []) {
      if (effect.getFlag?.(MODULE_ID, "kind") !== KIND) continue;
      total.incomingAttackAdvantage ||= Boolean(effect.getFlag(MODULE_ID, "modifier")?.modifiers?.incomingAttackAdvantage);
    }
  }
  return total;
}

/** Captura antes de la tirada qué efectos deberán consumirse al terminarla. */
export function moveModifierIdsToConsume(actor, event = "move") {
  return (actor?.effects ?? []).filter(effect => {
    if (effect.getFlag(MODULE_ID, "kind") !== KIND) return false;
    const consume = effect.getFlag(MODULE_ID, "modifier")?.consume;
    return consume === event || (consume === "roll" && event === "move");
  }).map(effect => effect.id);
}

/** Elimina una captura previa sin consumir efectos nuevos creados por la acción. */
export async function consumeCapturedMoveModifiers(actor, ids = []) {
  const existing = ids.filter(id => actor?.effects?.has(id));
  if (existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing);
}

/** Entradas visibles en el panel de efectos de la ficha Pokédex. */
export function moveModifierEntries(actor) {
  return (actor?.effects ?? []).filter(effect => effect.getFlag(MODULE_ID, "kind") === KIND).map(effect => {
    const state = effect.getFlag(MODULE_ID, "modifier") ?? {};
    const remaining = Number.isFinite(Number(state.durationRounds)) ? `${state.durationRounds} ronda${Number(state.durationRounds) === 1 ? "" : "s"}` : "Hasta retirarse o terminar el combate";
    return { id: effect.id, name: effect.name, img: effect.img ?? effect.icon, description: effect.description ?? state.description, remaining, stacks: state.stacks ?? 1 };
  });
}

/** Permite terminar manualmente un modificador desde la ficha. */
export async function removeMoveModifier(actor, effectId) {
  if (actor?.effects?.get(effectId)) await actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
}

/** Borra todos los modificadores de movimiento activos de un actor (Clear Smog). */
export async function removeAllMoveModifiers(actor) {
  const ids = (actor?.effects ?? []).filter(effect => [KIND, CONCENTRATION_KIND].includes(effect.getFlag(MODULE_ID, "kind"))).map(effect => effect.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  return ids.length;
}

/**
 * Pilas ya acumuladas de un movimiento de escalada consecutiva (Bola de
 * Hielo, Rodada, Enfado) antes del golpe actual: 0 si es el primer uso o si no
 * queda ningún efecto activo. La usa pokemon-sheet.mjs para calcular el
 * multiplicador de dados de este golpe con diceMultiplierForStacks() de
 * multi-hit.mjs, antes de que applyMoveModifierEffects() incremente la pila.
 */
export function consecutiveStrikeStacks(actor, moveId) {
  const effect = actor?.effects?.find(candidate => candidate.getFlag(MODULE_ID, "modifier")?.moveId === moveId);
  return Number(effect?.getFlag(MODULE_ID, "modifier")?.stacks) || 0;
}

/**
 * Borra el rastreo de escalada consecutiva de un movimiento tras un fallo (o
 * cualquier otra condición de reinicio): el disparador "hit" de la regla no se
 * ejecuta en un fallo, así que sin este borrado explícito la pila seguiría
 * acumulada la próxima vez que el movimiento impacte.
 */
export async function resetConsecutiveStrike(actor, moveId) {
  const effect = actor?.effects?.find(candidate => candidate.getFlag(MODULE_ID, "modifier")?.moveId === moveId);
  if (effect) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
}

/**
 * Bloquea dinámicamente un movimiento concreto de un actor, con el mismo
 * mecanismo que lee isMoveRecharging() (rechargeLock), pero sin depender de
 * una entrada estática de MOVE_MODIFIER_EFFECTS: Anular (disable) necesita
 * bloquear "el último movimiento que activó el objetivo", que solo se conoce
 * en el momento de resolverse, no de antemano en el catálogo.
 */
export async function applyMoveLock(actor, moveId, { durationRounds = 1, concentration = false, sourceName = "", description = "" } = {}) {
  if (!actor || !moveId) return;
  const source = {
    name: `${sourceName} — bloqueo de movimiento`.trim(),
    img: pokemonEffectIcon("debuffs", "disable", "icons/svg/hazard.svg"),
    icon: pokemonEffectIcon("debuffs", "disable", "icons/svg/hazard.svg"),
    description,
    statuses: [],
    changes: [],
    duration: durationRounds == null ? {} : { rounds: durationRounds, startRound: game.combat?.round ?? 0, startTurn: game.combat?.turn ?? 0 },
    flags: {
      [MODULE_ID]: {
        kind: KIND,
        modifier: { moveId, moveName: sourceName, category: "debuffs", stacks: 1, stackMax: 1, durationRounds, consume: null, sourceOnly: false, concentration, modifiers: { rechargeLock: true }, description }
      }
    }
  };
  await actor.createEmbeddedDocuments("ActiveEffect", [source]);
}

/**
 * Aplica un modificador dinámico con la forma que elija quien llama, sin
 * depender de una entrada estática de MOVE_MODIFIER_EFFECTS: lo usa Acupresión
 * (acupressure), cuyo efecto concreto depende de una tirada de 1d6 en vez de
 * ser fijo por movimiento. Sustituye cualquier efecto anterior del mismo
 * moveId sobre el actor, tal como indica su propio texto ("cualquier efecto
 * previo termina").
 */
export async function applyDynamicModifier(actor, moveId, { modifiers, description = "", durationRounds = null, concentration = false, sourceName = "", category = "buffs", icon = "buffs/concentration" } = {}) {
  if (!actor || !moveId) return;
  const previous = actor.effects?.filter(effect => effect.getFlag(MODULE_ID, "kind") === KIND && effect.getFlag(MODULE_ID, "modifier")?.moveId === moveId) ?? [];
  if (previous.length) await actor.deleteEmbeddedDocuments("ActiveEffect", previous.map(effect => effect.id));
  const [iconCategory, iconId] = icon.split("/");
  const img = pokemonEffectIcon(iconCategory, iconId, "icons/svg/aura.svg");
  const source = {
    name: sourceName || moveId,
    img, icon: img, description,
    statuses: [],
    changes: activeEffectChanges(modifiers),
    duration: durationRounds == null ? {} : { rounds: durationRounds, startRound: game.combat?.round ?? 0, startTurn: game.combat?.turn ?? 0 },
    flags: {
      [MODULE_ID]: {
        kind: KIND,
        modifier: { moveId, moveName: sourceName, category, stacks: 1, stackMax: 1, durationRounds, consume: null, sourceOnly: false, concentration, modifiers, description }
      }
    }
  };
  await actor.createEmbeddedDocuments("ActiveEffect", [source]);
}

/**
 * Indica si un movimiento de recarga (Hiperrayo, Envite Ígneo...) sigue
 * bloqueado por su propio uso anterior: existe un efecto de recarga activo
 * para ese id concreto. El efecto caduca solo por su `durationRounds`, así
 * que basta con comprobar si sigue presente. La usa pokemon-sheet.mjs antes
 * de dejar activar el movimiento, igual que ya hace con los PP agotados.
 */
export function isMoveRecharging(actor, moveId) {
  return (actor?.effects ?? []).some(effect => effect.getFlag(MODULE_ID, "modifier")?.moveId === moveId && effect.getFlag(MODULE_ID, "modifier")?.modifiers?.rechargeLock);
}

/** Comprueba un ataque contra la CA preparada del objetivo. */
export function attackHitsPokemonTarget(attack, actor) {
  if (!attack) return false;
  if (Number(attack.natural) === 1) return false;
  if (Number(attack.natural) === 20) return true;
  const ac = Number(actor?.system?.attributes?.ac?.value ?? actor?.system?.attributes?.ac?.flat);
  return !Number.isFinite(ac) || Number(attack.total) >= ac;
}

async function completeModifierApplication(payload) {
  const requester = game.users.get(payload.userId);
  const owner = payload.sourceOwnerActorUuid ? await fromUuid(payload.sourceOwnerActorUuid) : null;
  if (!requester?.active || owner?.documentName !== "Actor" || !owner.testUserPermission(requester, "OWNER")) return;
  const rule = MOVE_MODIFIER_EFFECTS[payload.moveId];
  if (!rule) return;
  if (rule.concentration) await removeModifierConcentration(payload.sourceCombatActorUuid);
  let sourceIsTarget = false;
  for (const target of payload.targets ?? []) {
    const actor = await fromUuid(target.actorUuid);
    if (actor?.documentName !== "Actor") continue;
    sourceIsTarget ||= actor.uuid === payload.sourceCombatActorUuid;
    await applyModifierToActor(actor, rule, payload);
  }
  if (rule.concentration && !sourceIsTarget) {
    const sourceActor = await fromUuid(payload.sourceCombatActorUuid);
    if (sourceActor?.documentName === "Actor") await sourceActor.createEmbeddedDocuments("ActiveEffect", [modifierConcentrationSource(rule, payload)]);
  }
}

async function applyModifierToActor(actor, rule, payload) {
  const existing = actor.effects.find(effect => effect.getFlag(MODULE_ID, "modifier")?.moveId === payload.moveId);
  const current = existing?.getFlag(MODULE_ID, "modifier")?.stacks ?? 0;
  const stacks = nextModifierStacks(current, rule.stackMax);
  const source = modifierEffectSource(rule, payload, stacks);
  if (existing) await actor.updateEmbeddedDocuments("ActiveEffect", [{ _id: existing.id, ...source }]);
  else await actor.createEmbeddedDocuments("ActiveEffect", [source]);
  await ChatMessage.create({
    content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(actor.name)}</strong> recibe <strong>${escapeHtml(payload.moveName)}</strong>${rule.stackMax > 1 ? ` (${stacks}/${rule.stackMax})` : ""}.<br>${escapeHtml(rule.description)}</p></div>`
  });
}

async function actorMatchesModifierRule(actor, rule) {
  const types = actor.getFlag(MODULE_ID, "pokemonTypes") ?? [];
  if (rule.requiredTypes.length && !rule.requiredTypes.some(type => types.includes(type))) return false;
  if (!rule.requiredAbilities.length) return true;
  let pokemonItem = actor.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? null;
  if (!pokemonItem) {
    const uuid = actor.getFlag(MODULE_ID, "pokemonItemUuid");
    if (uuid) pokemonItem = await fromUuid(uuid);
  }
  const abilities = pokemonItem?.getFlag(MODULE_ID, "instance")?.abilities ?? [];
  return rule.requiredAbilities.some(ability => abilities.includes(ability));
}

/**
 * Construye la fuente de un ActiveEffect de modificador a partir de una regla
 * (con la forma de MOVE_MODIFIER_EFFECTS) y un payload de contexto. La usan
 * applyMoveModifierEffects() y también condition-catalog.mjs para empaquetar
 * los modificadores genéricos (sin movimiento) del compendio de estados.
 */
export function modifierEffectSource(rule, payload, stacks) {
  const modifiers = scaledMoveModifiers(rule.modifiers, stacks);
  if (modifiers.acProficiency) modifiers.ac = (Number(modifiers.ac) || 0) + (Number(payload.proficiency) || 2);
  const icon = pokemonEffectIcon(rule.category, payload.moveId, rule.category === "buffs" ? "icons/svg/upgrade.svg" : "icons/svg/downgrade.svg");
  return {
    name: `${payload.moveName}${rule.stackMax > 1 ? ` ×${stacks}` : ""}`,
    img: icon,
    icon,
    description: rule.description,
    statuses: modifiers.statuses ?? [],
    changes: activeEffectChanges(modifiers),
    duration: rule.durationRounds == null ? {} : { rounds: rule.durationRounds, startRound: game.combat?.round ?? 0, startTurn: game.combat?.turn ?? 0 },
    flags: {
      [MODULE_ID]: {
        kind: KIND,
        modifier: {
          moveId: payload.moveId,
          moveName: payload.moveName,
          category: rule.category,
          stacks,
          stackMax: rule.stackMax,
          durationRounds: rule.durationRounds,
          consume: rule.consume,
          sourceOnly: rule.sourceOnly,
          sourceCombatActorUuid: payload.sourceCombatActorUuid,
          sourceName: payload.sourceName,
          linkId: payload.linkId,
          concentration: rule.concentration,
          repeatSave: rule.repeatSave,
          saveDc: payload.saveDc,
          modifiers,
          description: rule.description
        }
      }
    }
  };
}

function modifierConcentrationSource(rule, payload) {
  const description = `Concentración de ${payload.sourceName} para mantener ${payload.moveName}.`;
  const icon = pokemonEffectIcon("buffs", "concentration", "icons/svg/aura.svg");
  return {
    name: `Concentración: ${payload.moveName}`,
    img: icon,
    icon,
    description,
    duration: rule.durationRounds == null ? {} : { rounds: rule.durationRounds, startRound: game.combat?.round ?? 0, startTurn: game.combat?.turn ?? 0 },
    flags: { [MODULE_ID]: { kind: CONCENTRATION_KIND, modifier: { moveId: payload.moveId, moveName: payload.moveName, sourceCombatActorUuid: payload.sourceCombatActorUuid, linkId: payload.linkId, concentration: true, durationRounds: rule.durationRounds, description } } }
  };
}

function activeEffectChanges(modifiers) {
  const changes = [];
  if (modifiers.ac) changes.push(change("system.attributes.ac.bonus", "ADD", modifiers.ac, 20));
  if (modifiers.attack) {
    for (const scope of ["mwak", "rwak", "msak", "rsak"]) changes.push(change(`system.bonuses.${scope}.attack`, "ADD", modifiers.attack, 20));
  }
  for (const [ability, amount] of Object.entries(modifiers.abilities ?? {})) changes.push(change(`system.abilities.${ability}.value`, "ADD", amount, 20));
  if (modifiers.speed) {
    for (const type of ["walk", "fly", "swim", "burrow", "climb"]) changes.push(change(`system.attributes.movement.${type}`, "ADD", modifiers.speed, 20));
  }
  if (modifiers.speedMultiplier != null) {
    for (const type of ["walk", "fly", "swim", "burrow", "climb"]) changes.push(change(`system.attributes.movement.${type}`, "MULTIPLY", modifiers.speedMultiplier, 25));
  }
  if (modifiers.speedOverride != null) {
    for (const type of ["walk", "fly", "swim", "burrow", "climb"]) changes.push(change(`system.attributes.movement.${type}`, "OVERRIDE", modifiers.speedOverride, 30));
  }
  if (modifiers.speedFlyOverride != null) changes.push(change("system.attributes.movement.fly", "OVERRIDE", modifiers.speedFlyOverride, 35));
  if (modifiers.fireVulnerability) changes.push(change("system.traits.dv.value", "ADD", "fire", 20));
  if (modifiers.normalResistance) changes.push(change("system.traits.dr.value", "ADD", "normal", 20));
  if (modifiers.fireResistance) changes.push(change("system.traits.dr.value", "ADD", "fire", 20));
  if (modifiers.electricResistance) changes.push(change("system.traits.dr.value", "ADD", "electric", 20));
  if (modifiers.groundImmunity) changes.push(change("system.traits.di.value", "ADD", "ground", 20));
  return changes;
}

function change(key, modeName, value, priority) {
  return { key, mode: CONST.ACTIVE_EFFECT_MODES[modeName], value, priority };
}

async function rollModifierSave(actor, move, dc, sourceModifiers = {}, sourceOwnerActor = null) {
  const abilities = move.save?.attribute?.length ? move.save.attribute : ["con"];
  const choices = abilities.map(key => ({ key, modifier: savingThrowModifier(actor, key) })).sort((a, b) => b.modifier - a.modifier);
  const chosen = choices[0];
  const combat = pokemonCombatModifiers(actor);
  const sourceDisadvantage = (sourceModifiers.saveTargetsDisadvantageAbilities ?? []).some(key => abilities.includes(key));
  const darkAdvantage = await applyGruntSaveAdvantage(actor);
  const nurseAdvantage = await applyNurseStatusSaveAdvantage(actor);
  const advantage = combat.saveAdvantage || combat.saveAdvantageAbilities.includes(chosen.key) || Boolean(sourceModifiers.saveTargetsAdvantage) || darkAdvantage || nurseAdvantage;
  const disadvantage = combat.saveDisadvantageAbilities.includes(chosen.key) || sourceDisadvantage;
  const dice = advantage === disadvantage ? "1d20" : advantage ? "2d20kh" : "2d20kl";
  const bonusDice = combat.saveDice.map(formula => ` + ${formula}`).join("");
  const modifier = chosen.modifier + (combat.saves[chosen.key] ?? 0);
  const roll = await new Roll(`${dice} + @modifier${bonusDice}`, { modifier }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — Salvación ${chosen.key.toUpperCase()} contra ${move.name} (CD ${dc})` });
  const total = await applyHobbyistSaveBoost(actor, Number(roll.total) || 0, chosen.key);
  const finalDc = await applyTacticianDcBoost(sourceOwnerActor, actor.name, total, Number(dc));
  return { total, dc: finalDc, success: total >= finalDc };
}

function savingThrowModifier(actor, key) {
  const ability = actor.system.abilities?.[key] ?? {};
  const prepared = Number(ability.save?.value ?? ability.save?.total ?? ability.save);
  if (Number.isFinite(prepared)) return prepared;
  const score = Number(ability.value) || 10;
  const modifier = Number.isFinite(Number(ability.mod)) ? Number(ability.mod) : Math.floor((score - 10) / 2);
  return modifier + ((Number(actor.system.attributes?.prof) || 2) * (Number(ability.proficient) || 0));
}

async function synchronizeModifierIcons() {
  if (!isResponsibleGm()) return;
  for (const actor of game.actors) {
    const updates = [];
    for (const effect of actor.effects) {
      if (![KIND, CONCENTRATION_KIND].includes(effect.getFlag(MODULE_ID, "kind"))) continue;
      const state = effect.getFlag(MODULE_ID, "modifier") ?? {};
      const concentration = effect.getFlag(MODULE_ID, "kind") === CONCENTRATION_KIND;
      const category = concentration ? "buffs" : state.category;
      const iconId = concentration ? "concentration" : state.moveId;
      const fallback = category === "buffs" ? "icons/svg/upgrade.svg" : "icons/svg/downgrade.svg";
      const icon = pokemonEffectIcon(category, iconId, fallback);
      if ((effect.img ?? effect.icon) !== icon) updates.push({ _id: effect.id, img: icon, icon });
    }
    if (updates.length) await actor.updateEmbeddedDocuments("ActiveEffect", updates);
  }
}

async function clearCombatModifiers(combat) {
  for (const actor of combat.combatants.map(combatant => combatant.actor).filter(Boolean)) {
    const ids = actor.effects.filter(effect => [KIND, CONCENTRATION_KIND].includes(effect.getFlag(MODULE_ID, "kind"))).map(effect => effect.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}

async function processModifierRepeatSaves(actor) {
  if (!actor) return;
  for (const effect of actor.effects.filter(entry => entry.getFlag(MODULE_ID, "kind") === KIND && entry.getFlag(MODULE_ID, "modifier")?.repeatSave)) {
    const state = effect.getFlag(MODULE_ID, "modifier");
    const modifier = savingThrowModifier(actor, state.repeatSave) + (pokemonCombatModifiers(actor).saves[state.repeatSave] ?? 0);
    const roll = await new Roll("1d20 + @modifier", { modifier }).evaluate();
    const success = Number(roll.total) >= Number(state.saveDc);
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — ${state.moveName}: salvación ${state.repeatSave.toUpperCase()} CD ${state.saveDc}${success ? " · Termina" : " · Continúa"}` });
    if (success) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  }
}

function monitorModifierConcentration(actor, changes) {
  const next = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (next == null || Number(next) >= Number(actor.system.attributes?.hp?.value)) return;
  const damage = Number(actor.system.attributes?.hp?.value) - Number(next);
  setTimeout(() => checkModifierConcentration(actor, damage).catch(error => console.error(`${MODULE_ID} | Modifier concentration check failed`, error)), 0);
}

async function checkModifierConcentration(actor, damage) {
  const effects = worldActors().flatMap(candidate => candidate.effects.filter(effect => effect.getFlag(MODULE_ID, "modifier")?.concentration && effect.getFlag(MODULE_ID, "modifier")?.sourceCombatActorUuid === actor.uuid));
  if (!effects.length) return;
  if (Number(actor.system.attributes?.hp?.value) <= 0) return removeModifierConcentration(actor.uuid);
  const dc = Math.max(10, Math.floor(Number(damage) / 2));
  const modifier = savingThrowModifier(actor, "con") + (pokemonCombatModifiers(actor).saves.con ?? 0);
  const roll = await new Roll("1d20 + @modifier", { modifier }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — Concentración CD ${dc}` });
  if (Number(roll.total) < dc) await removeModifierConcentration(actor.uuid);
}

async function removeModifierConcentration(sourceActorUuid) {
  const groups = new Map();
  for (const actor of worldActors()) {
    const ids = actor.effects.filter(effect => {
      const state = effect.getFlag(MODULE_ID, "modifier");
      return state?.concentration && state.sourceCombatActorUuid === sourceActorUuid;
    }).map(effect => effect.id);
    if (ids.length) groups.set(actor, ids);
  }
  for (const [actor, ids] of groups) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

function worldActors() { return game.actors?.contents ?? [...game.actors]; }

function isResponsibleGm() {
  const active = game.users.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return active[0]?.id === game.user.id;
}

function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
