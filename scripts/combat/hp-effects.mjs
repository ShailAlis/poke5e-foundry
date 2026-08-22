/**
 * Movimientos que leen o escriben directamente los Puntos de Golpe de un
 * objetivo en vez de infligir una tirada de daño normal: Resignación
 * (iguala los PG del objetivo a los propios), Fatalidad (pierde la mitad de
 * sus PG actuales y su máximo se reduce en esa cantidad) y Falso Tortazo (el
 * daño normal nunca lo deja a 0 PG).
 *
 * Resignación y Fatalidad exigen una salvación y, si falla, escriben los PG
 * de un actor que normalmente no pertenece a quien tira el movimiento: viajan
 * por el mismo patrón de socket delegado al director que ya usa
 * status-effects.mjs (completeStatusApplication). Falso Tortazo, en cambio,
 * solo hace de tope sobre el daño normal que ya se aplica por el botón de
 * "Aplicar daño" de la tarjeta de chat de D&D 5e —no por este módulo—, así
 * que se resuelve con un `preUpdateActor` que recorta el resultado antes de
 * guardarlo, marcado por una bandera temporal en el objetivo mientras dure el
 * turno en que se activó el movimiento.
 */
import { MODULE_ID } from "../core/model.mjs";
import { escapeHtml, isResponsibleGm } from "../core/utils.mjs";

const SOCKET_ACTION = "applyHpEffect";
const FALSE_SWIPE_FLAG = "falseSwipeFloor";

/** Resignación nunca puede curar: el mínimo de los PG propios, los del objetivo y el tope por nivel. */
export function matchSourceHp(sourceHp, targetHp, targetLevel, capMultiplier = 5) {
  const cap = Math.max(0, Number(targetLevel) || 0) * capMultiplier;
  return Math.max(0, Math.min(Number(targetHp) || 0, Number(sourceHp) || 0, cap || Number(targetHp) || 0));
}

/** Fatalidad: pierde la mitad de sus PG actuales (redondeo hacia abajo) y el máximo baja lo mismo. */
export function halveCurrentHp(currentHp) {
  const lost = Math.floor((Number(currentHp) || 0) / 2);
  return { lost, newHp: Math.max(0, (Number(currentHp) || 0) - lost) };
}

/** Falso Tortazo: cualquier resultado que dejaría al objetivo a 0 PG queda en 1. */
export function floorAtOne(pendingHp, currentHp) {
  return Number(pendingHp) <= 0 && Number(currentHp) > 0 ? 1 : Number(pendingHp);
}

/**
 * Registra el socket de Resignación/Fatalidad y el recorte de Falso Tortazo.
 * Lo arranca main.mjs junto al resto de motores de movimiento.
 */
export function registerHpEffects() {
  game.socket.on(`module.${MODULE_ID}`, payload => {
    if (payload?.action !== SOCKET_ACTION || !isResponsibleGm()) return;
    completeHpEffectApplication(payload).catch(error => console.error(`${MODULE_ID} | HP effect application failed`, error));
  });
  Hooks.on("preUpdateActor", (actor, changes) => {
    const pendingHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
    if (pendingHp == null || !actor.getFlag(MODULE_ID, FALSE_SWIPE_FLAG)) return;
    const currentHp = Number(actor.system.attributes?.hp?.value) || 0;
    const clamped = floorAtOne(pendingHp, currentHp);
    if (clamped !== pendingHp) foundry.utils.setProperty(changes, "system.attributes.hp.value", clamped);
    foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FALSE_SWIPE_FLAG}`, false);
  });
}

/** Marca a un objetivo golpeado por Falso Tortazo para que el próximo cambio de PG no pueda dejarlo en 0. */
export async function markFalseSwipeTarget(actor) {
  if (actor) await actor.setFlag(MODULE_ID, FALSE_SWIPE_FLAG, true);
}

/**
 * Explosión deja PG a 0 en los objetivos seleccionados sin tirada de daño
 * (solo se activa con un 20 natural, ya resuelto en pokemon-sheet.mjs). Viaja
 * por el mismo socket delegado que Resignación/Fatalidad porque el objetivo
 * normalmente no pertenece a quien usa el movimiento.
 */
export async function requestFaintTargets(selectedTokens, sourceName) {
  const targets = selectedTokens.map(token => ({ actorUuid: token.actor.uuid, tokenName: token.name }));
  if (!targets.length) return;
  const payload = { action: SOCKET_ACTION, userId: game.user.id, moveId: "explosion", targets };
  if (game.user.isGM || targets.every(target => selectedTokens.find(token => token.actor.uuid === target.actorUuid)?.actor.canUserModify(game.user, "update"))) await completeHpEffectApplication(payload);
  else {
    game.socket.emit(`module.${MODULE_ID}`, payload);
    ui.notifications.info(game.i18n.format("POKE5E.MoveEffects.ModifierRequested", { move: sourceName }));
  }
}

/**
 * Resuelve Resignación o Fatalidad sobre los objetivos seleccionados: tira la
 * salvación localmente (igual que rollTargetSave() en status-effects.mjs) y
 * envía el resultado al director si quien juega no tiene permiso para
 * modificar el objetivo directamente.
 */
export async function requestHpEffect({ moveId, selectedTokens, saveDc, sourceCombatActor, sourceName, speaker }) {
  const ability = ["ruination", "natures-madness"].includes(moveId) ? "con" : "wis";
  const label = moveId === "ruination" ? "Fatalidad" : moveId === "natures-madness" ? "Furia de la Naturaleza" : "Resignación";
  const failed = await rollFailedSaves(selectedTokens, ability, saveDc, speaker, label);
  if (!failed.length) return;
  const targets = failed.map(({ actorUuid, tokenName }) => ({ actorUuid, tokenName }));
  const payload = {
    action: SOCKET_ACTION, userId: game.user.id, moveId,
    sourceCombatActorUuid: sourceCombatActor?.uuid, sourceName, targets
  };
  if (game.user.isGM || targets.every(target => selectedTokens.find(token => token.actor.uuid === target.actorUuid)?.actor.canUserModify(game.user, "update"))) await completeHpEffectApplication(payload);
  else {
    game.socket.emit(`module.${MODULE_ID}`, payload);
    ui.notifications.info(game.i18n.format("POKE5E.MoveEffects.ModifierRequested", { move: sourceName }));
  }
}

async function completeHpEffectApplication(payload) {
  const requester = game.users.get(payload.userId);
  if (!requester?.active) return;
  const sourceActor = payload.sourceCombatActorUuid ? await fromUuid(payload.sourceCombatActorUuid) : null;
  const sourceHp = Number(sourceActor?.system?.attributes?.hp?.value) || 0;
  for (const target of payload.targets ?? []) {
    const actor = await fromUuid(target.actorUuid);
    if (actor?.documentName !== "Actor") continue;
    const currentHp = Number(actor.system.attributes?.hp?.value) || 0;
    if (payload.moveId === "explosion") {
      if (!currentHp) continue;
      await actor.update({ "system.attributes.hp.value": 0 });
      await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(target.tokenName)}</strong> se debilita por la explosión.</p></div>` });
    } else if (payload.moveId === "ruination") {
      const { lost, newHp } = halveCurrentHp(currentHp);
      if (!lost) continue;
      const currentMax = Number(actor.system.attributes?.hp?.max ?? actor.system.attributes?.hp?.value) || 0;
      await actor.update({ "system.attributes.hp.value": newHp, "system.attributes.hp.max": Math.max(1, currentMax - lost) });
      await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(target.tokenName)}</strong> pierde ${lost} PG (y su máximo) por Fatalidad.</p></div>` });
    } else if (payload.moveId === "natures-madness") {
      const { lost, newHp } = halveCurrentHp(currentHp);
      const actualLost = Math.max(1, lost);
      const clamped = Math.max(0, currentHp - actualLost);
      if (!currentHp) continue;
      await actor.update({ "system.attributes.hp.value": clamped });
      await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(target.tokenName)}</strong> pierde ${currentHp - clamped} PG por Furia de la Naturaleza.</p></div>` });
    } else {
      const level = Number(actor.getFlag?.(MODULE_ID, "instance")?.level) || 1;
      const newHp = matchSourceHp(sourceHp, currentHp, level);
      if (newHp === currentHp) continue;
      await actor.update({ "system.attributes.hp.value": newHp });
      await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(target.tokenName)}</strong> queda con ${newHp} PG por Resignación.</p></div>` });
    }
  }
}

/**
 * Tira una salvación local por cada objetivo y devuelve solo los que fallan,
 * como `{actorUuid, tokenName}`. La usan requestHpEffect() aquí y Switcheroo
 * en item-swap.mjs a través de pokemon-sheet.mjs, para no duplicar la tirada
 * de salvación de status-effects.mjs (que sí necesita más contexto de combate).
 */
export async function rollFailedSaves(selectedTokens, ability, dc, speaker, label) {
  const failed = [];
  for (const token of selectedTokens) {
    const modifier = savingThrowModifier(token.actor, ability);
    const roll = await new Roll("1d20 + @modifier", { modifier }).evaluate();
    await roll.toMessage({ speaker, flavor: `${token.name} — Salvación ${ability.toUpperCase()} contra ${label} (CD ${dc})` });
    if (Number(roll.total) >= Number(dc)) continue;
    failed.push({ actorUuid: token.actor.uuid, tokenName: token.name, actor: token.actor });
  }
  return failed;
}

function savingThrowModifier(actor, key) {
  const ability = actor.system.abilities?.[key] ?? {};
  const prepared = Number(ability.save?.value ?? ability.save?.total ?? ability.save);
  if (Number.isFinite(prepared)) return prepared;
  const score = Number(ability.value) || 10;
  const modifier = Number.isFinite(Number(ability.mod)) ? Number(ability.mod) : Math.floor((score - 10) / 2);
  return modifier + ((Number(actor.system.attributes?.prof) || 2) * (Number(ability.proficient) || 0));
}
