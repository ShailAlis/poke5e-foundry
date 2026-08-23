/**
 * Reglas mecánicas de los rasgos propios de la clase Entrenador que no puede
 * resolver por sí solo el AdvancementManager de D&D 5e.
 */
import { MODULE_ID, trainerLevel } from "../core/model.mjs";
import { ABILITIES, SKILLS, SPECIALIZATIONS } from "./trainer-creation-data.mjs";
import { hasTrainerPath, trainerSpecializationTypes } from "./trainer-path-rules.mjs";

const SPECIALIZATION_LEVELS = Object.freeze([1, 7, 18]);
const TRACKER_SOURCE_ID = "trainer-feature-pokemon-tracker";
const MASTER_SOURCE_ID = "trainer-feature-master-trainer";

/** Número de especializaciones que corresponde al nivel de clase. */
export function trainerSpecializationCapacity(level) {
  const current = Math.max(1, Number(level) || 1);
  return SPECIALIZATION_LEVELS.filter(required => current >= required).length;
}

/** Especializaciones aún seleccionables, sin permitir duplicados. */
export function availableTrainerSpecializations(actor) {
  const chosen = trainerSpecializationTypes(actor);
  return SPECIALIZATIONS.filter(entry => !chosen.has(entry.type));
}

/** Número de elecciones de especialización que el actor tiene pendientes. */
export function pendingTrainerSpecializations(actor) {
  return Math.max(0, trainerSpecializationCapacity(trainerLevel(actor)) - trainerSpecializationTypes(actor).size);
}

/**
 * Aplica una especialización de forma permanente e idempotente: actualiza la
 * característica o competencia del Entrenador y convierte el Item descriptivo
 * concedido por el avance en el rasgo elegido.
 */
export async function chooseTrainerSpecialization(actor, type) {
  if (!actor?.isOwner || !pendingTrainerSpecializations(actor)) return false;
  const specialization = availableTrainerSpecializations(actor).find(entry => entry.type === type);
  if (!specialization) return false;

  const feature = specializationFeatureSlot(actor) ?? await createSpecializationSlot(actor);
  const actorUpdate = {};
  if (specialization.ability) {
    const current = Number(actor.system?.abilities?.[specialization.ability]?.value) || 10;
    actorUpdate[`system.abilities.${specialization.ability}.value`] = Math.min(20, current + 1);
  } else if (specialization.skill) {
    const current = Number(actor.system?.skills?.[specialization.skill]?.value) || 0;
    actorUpdate[`system.skills.${specialization.skill}.value`] = Math.min(2, current + 1);
  }
  if (Object.keys(actorUpdate).length) await actor.update(actorUpdate, { poke5eTrainerSpecialization: true });

  const personal = specialization.ability
    ? game.i18n.format("POKE5E.TrainerClass.SpecializationAbility", { ability: ABILITIES[specialization.ability] })
    : game.i18n.format("POKE5E.TrainerClass.SpecializationSkill", { skill: SKILLS[specialization.skill] });
  await feature.update({
    name: game.i18n.format("POKE5E.TrainerClass.SpecializationName", { name: specialization.name }),
    "system.description.value": `<p>${foundry.utils.escapeHTML(personal)}</p><p>${game.i18n.format("POKE5E.TrainerClass.SpecializationPokemon", { type: foundry.utils.escapeHTML(specialization.type) })}</p>`,
    [`flags.${MODULE_ID}.specializationType`]: specialization.type,
    [`flags.${MODULE_ID}.specializationApplied`]: true
  });
  return true;
}

/** Estado del recurso de Rastreador Pokémon, ampliado por Ranger 15. */
export function pokemonTrackerState(actor) {
  if (trainerLevel(actor) < 13) return null;
  const item = classFeature(actor, TRACKER_SOURCE_ID);
  if (!item) return null;
  const max = hasTrainerPath(actor, "ranger", 15) ? 2 : 1;
  const spent = Math.max(0, Number(item.system?.uses?.spent) || 0);
  return { item, max, remaining: Math.max(0, max - spent), expert: hasTrainerPath(actor, "ranger", 15) };
}

/** Gasta un uso de Rastreador Pokémon. */
export async function spendPokemonTracker(actor) {
  const state = pokemonTrackerState(actor);
  if (!state?.remaining) return null;
  if (String(state.item.system?.uses?.max) !== String(state.max)) {
    await state.item.update({ "system.uses.max": String(state.max) });
  }
  await state.item.update({ "system.uses.spent": (Number(state.item.system?.uses?.spent) || 0) + 1 });
  return { ...state, remaining: state.remaining - 1 };
}

/** Estado de los dos usos de Maestro Entrenador. */
export function masterTrainerState(actor) {
  if (trainerLevel(actor) < 20) return null;
  const item = classFeature(actor, MASTER_SOURCE_ID);
  if (!item) return null;
  const max = 2;
  const spent = Math.max(0, Number(item.system?.uses?.spent) || 0);
  return { item, max, remaining: Math.max(0, max - spent) };
}

/**
 * Convierte un fallo de salvación del Entrenador o de uno de sus Pokémon en
 * éxito, preguntando al propietario y consumiendo un uso real del rasgo.
 */
export async function applyMasterTrainerSave(actor, total, dc, { label = "" } = {}) {
  if (Number(total) >= Number(dc)) return false;
  const trainer = await trainerForSaveActor(actor);
  const state = masterTrainerState(trainer);
  if (!trainer?.isOwner || !state?.remaining) return false;
  let confirmed = false;
  try {
    confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("POKE5E.TrainerClass.MasterTrainer") },
      content: `<p>${game.i18n.format("POKE5E.TrainerClass.MasterTrainerPrompt", { name: foundry.utils.escapeHTML(actor.name), total, dc, label: foundry.utils.escapeHTML(label) })}</p>`,
      modal: true,
      rejectClose: false
    });
  } catch { confirmed = false; }
  if (!confirmed) return false;
  await state.item.update({ "system.uses.spent": (Number(state.item.system?.uses?.spent) || 0) + 1 });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: trainer }),
    content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${game.i18n.localize("POKE5E.TrainerClass.MasterTrainer")}</strong>: ${game.i18n.format("POKE5E.TrainerClass.MasterTrainerSuccess", { name: foundry.utils.escapeHTML(actor.name) })}</p></div>`
  });
  return true;
}

/** Ajusta recursos dinámicos de clase en actores existentes. */
export async function synchronizeTrainerClassRules(actor) {
  if (!actor || actor.type !== "character") return;
  const hpOverrideUpdate = trainerHitPointOverrideUpdate(actor);
  if (hpOverrideUpdate) await actor.update(hpOverrideUpdate, { poke5eTrainerHpMigration: true });
  const tracker = pokemonTrackerState(actor);
  if (tracker && (String(tracker.item.system?.uses?.max) !== String(tracker.max) || !tracker.item.system?.uses?.recovery?.length)) {
    await tracker.item.update({ "system.uses.max": String(tracker.max), "system.uses.recovery": [{ period: "lr", type: "recoverAll" }] });
  }
  const master = masterTrainerState(actor);
  if (master && (String(master.item.system?.uses?.max) !== "2" || !master.item.system?.uses?.recovery?.length)) {
    await master.item.update({ "system.uses.max": "2", "system.uses.recovery": [{ period: "lr", type: "recoverAll" }] });
  }
}

/**
 * El asistente antiguo escribía el máximo inicial en `hp.max`, que D&D 5e
 * interpreta como un override permanente y oculta los PG de los avances. Lo
 * limpia una sola vez en actores creados por el asistente; un override que el
 * usuario configure después de la migración se conserva.
 */
export function trainerHitPointOverrideUpdate(actor) {
  if (!actor || actor.type !== "character" || actor.getFlag?.(MODULE_ID, "kind") === "npc-trainer") return null;
  if (!actor.getFlag?.(MODULE_ID, "trainerCreation")?.completed || actor.getFlag?.(MODULE_ID, "trainerHpOverrideMigrated")) return null;
  const hasTrainerClass = [...(actor.items ?? [])].some(item => item.type === "class" && (item.system?.identifier === "trainer" || String(item.getFlag?.(MODULE_ID, "kind") ?? "").includes("trainer-class")));
  if (!hasTrainerClass) return null;
  const update = { [`flags.${MODULE_ID}.trainerHpOverrideMigrated`]: true };
  const storedMaximum = foundry.utils.getProperty(actor._source ?? actor, "system.attributes.hp.max");
  if (storedMaximum != null) update["system.attributes.hp.max"] = null;
  return update;
}

/**
 * Conecta Maestro Entrenador con las salvaciones nativas de D&D 5e cuando la
 * propia tirada contiene una CD. Las tiradas sin CD siguen siendo deliberación
 * de mesa y no pueden determinar si han fallado.
 */
export function registerTrainerClassAutomation() {
  Hooks.on("dnd5e.rollSavingThrow", (rolls, data) => {
    const actor = data?.subject;
    const roll = rolls?.[0];
    const dc = Number(roll?.options?.target ?? roll?.options?.targetValue ?? data?.target ?? data?.dc);
    if (!actor || !roll || !Number.isFinite(dc) || Number(roll.total) >= dc) return;
    queueMicrotask(() => applyMasterTrainerSave(actor, Number(roll.total), dc, { label: game.i18n.localize("POKE5E.TrainerClass.SavingThrow") }).catch(error => {
      console.error(`${MODULE_ID} | Master Trainer native save failed`, error);
    }));
  });
}

function classFeature(actor, sourceId) {
  return [...(actor?.items ?? [])].find(item => item.getFlag?.(MODULE_ID, "sourceId") === sourceId) ?? null;
}

function specializationFeatureSlot(actor) {
  const selected = trainerSpecializationTypes(actor);
  return [...(actor?.items ?? [])]
    .filter(item => ["trainer-feature-specialization-1", "trainer-feature-specialization-2", "trainer-feature-specialization-3"].includes(item.getFlag?.(MODULE_ID, "sourceId")))
    .filter(item => !item.getFlag?.(MODULE_ID, "specializationType"))
    .sort((a, b) => Number(a.getFlag(MODULE_ID, "level")) - Number(b.getFlag(MODULE_ID, "level")))
    .find(() => selected.size < trainerSpecializationCapacity(trainerLevel(actor))) ?? null;
}

async function createSpecializationSlot(actor) {
  const index = trainerSpecializationTypes(actor).size;
  const level = SPECIALIZATION_LEVELS[Math.min(index, SPECIALIZATION_LEVELS.length - 1)];
  const [item] = await actor.createEmbeddedDocuments("Item", [{
    name: game.i18n.localize("POKE5E.TrainerClass.SpecializationPending"),
    type: "feat",
    img: "icons/svg/upgrade.svg",
    system: { description: { value: `<p>${game.i18n.localize("POKE5E.TrainerClass.SpecializationPendingHint")}</p>`, chat: "" }, identifier: `trainer-specialization-${index + 1}`, requirements: `Entrenador ${level}`, type: { value: "class", subtype: "" } },
    flags: { [MODULE_ID]: { kind: "trainer-feature", sourceId: `trainer-feature-specialization-${index + 1}`, level, featureOrigin: "trainer" } }
  }]);
  return item;
}

async function trainerForSaveActor(actor) {
  if (actor?.type === "character") return actor;
  const itemUuid = actor?.getFlag?.(MODULE_ID, "pokemonItemUuid");
  const item = itemUuid ? await fromUuid(itemUuid) : actor?.items?.find(entry => entry.getFlag?.(MODULE_ID, "kind") === "pokemon");
  return item?.parent?.type === "character" ? item.parent : null;
}
