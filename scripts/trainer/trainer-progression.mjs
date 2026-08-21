/**
 * Progresión por experiencia de la clase Entrenador. Mantiene la XP en el
 * actor de D&D 5e y delega el cambio de nivel y sus elecciones al gestor nativo
 * de avances del sistema.
 */

/** Umbrales estándar de D&D 5e, usados si el sistema no expone su configuración. */
export const TRAINER_EXPERIENCE_LEVELS = Object.freeze([
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
]);

/** Devuelve el nivel que corresponde a una cantidad total de experiencia. */
export function trainerLevelForExperience(experience, thresholds = TRAINER_EXPERIENCE_LEVELS) {
  const xp = Math.max(0, Math.trunc(Number(experience) || 0));
  let level = 1;
  for (let index = 1; index < thresholds.length; index++) {
    if (xp < Number(thresholds[index])) break;
    level = index + 1;
  }
  return Math.min(20, level);
}

/** Resume el progreso de XP y los niveles de clase pendientes. */
export function trainerExperienceProgress(experience, classLevel, thresholds = TRAINER_EXPERIENCE_LEVELS) {
  const currentLevel = Math.max(1, Math.min(20, Math.trunc(Number(classLevel) || 1)));
  const total = Math.max(0, Math.trunc(Number(experience) || 0));
  const targetLevel = Math.max(currentLevel, trainerLevelForExperience(total, thresholds));
  const floor = Number(thresholds[currentLevel - 1]) || 0;
  const ceiling = currentLevel >= 20 ? floor : Number(thresholds[currentLevel]) || floor;
  const span = Math.max(0, ceiling - floor);
  const gained = span ? Math.max(0, Math.min(span, total - floor)) : 0;
  return {
    currentLevel,
    nextLevel: Math.min(20, currentLevel + 1),
    targetLevel,
    pendingLevels: Math.max(0, targetLevel - currentLevel),
    total,
    floor,
    ceiling,
    remaining: span ? Math.max(0, ceiling - total) : 0,
    percent: span ? Math.round((gained / span) * 100) : 100,
    maximumLevel: currentLevel >= 20
  };
}

/** Localiza la clase Entrenador de un PJ, excluyendo las copias simplificadas de NPC. */
export function trainerClassForActor(actor) {
  if (!actor || actor.type !== "character" || actor.getFlag?.("poke5e-foundry", "kind") === "npc-trainer") return null;
  return (actor.itemTypes?.class ?? []).find(item => {
    const kind = String(item.getFlag?.("poke5e-foundry", "kind") ?? "");
    return kind !== "npc-trainer-class" && (item.system?.identifier === "trainer" || kind.includes("trainer-class"));
  }) ?? null;
}

/** Datos listos para presentar la progresión del Entrenador en su ficha. */
export function trainerProgressionForActor(actor) {
  const trainerClass = trainerClassForActor(actor);
  if (!trainerClass) return null;
  const thresholds = globalThis.CONFIG?.DND5E?.CHARACTER_EXP_LEVELS ?? TRAINER_EXPERIENCE_LEVELS;
  const progress = trainerExperienceProgress(actor.system?.details?.xp?.value, trainerClass.system?.levels, thresholds);
  return { ...progress, classId: trainerClass.id, canAdvance: Boolean(actor.isOwner && progress.pendingLevels) };
}

/** Abre el flujo nativo que aplica todos los niveles permitidos por la XP. */
export async function advanceTrainerClassFromExperience(actor, { sheet = null, notify = true } = {}) {
  if (!actor?.isOwner) {
    if (notify) ui.notifications.warn(game.i18n.localize("POKE5E.TrainerProgression.NoPermission"));
    return false;
  }
  const trainerClass = trainerClassForActor(actor);
  if (!trainerClass) {
    if (notify) ui.notifications.warn(game.i18n.localize("POKE5E.TrainerProgression.NoClass"));
    return false;
  }
  const progress = trainerProgressionForActor(actor);
  if (!progress?.pendingLevels) {
    if (notify) ui.notifications.info(game.i18n.localize(progress?.maximumLevel ? "POKE5E.TrainerProgression.MaximumLevel" : "POKE5E.TrainerProgression.NoPending"));
    return false;
  }
  if (game.settings.get("dnd5e", "disableAdvancements")) {
    if (notify) ui.notifications.warn(game.i18n.localize("POKE5E.TrainerProgression.Disabled"));
    return false;
  }
  const Manager = globalThis.dnd5e?.applications?.advancement?.AdvancementManager;
  if (!Manager) throw new Error("D&D 5e AdvancementManager is not available.");
  const id = `actor-${actor.id}-advancement`;
  const existing = foundry.applications.instances?.get?.(id);
  if (existing) {
    existing.bringToFront?.();
    return true;
  }
  const manager = Manager.forLevelChange(actor, trainerClass.id, progress.pendingLevels);
  if (!manager.steps.length) return false;
  if (sheet?._renderChild) sheet._renderChild(manager);
  else manager.render(true);
  return true;
}

/**
 * Cuando cambia la XP de un PJ, abre el avance si ha alcanzado otro nivel. Solo
 * responde el cliente que hizo el cambio para evitar diálogos duplicados.
 */
export function registerTrainerExperienceAutomation() {
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || options?.isAdvancement) return;
    const xpChanged = Object.hasOwn(changes ?? {}, "system.details.xp.value")
      || foundry.utils.hasProperty(changes, "system.details.xp.value");
    if (!xpChanged) return;
    const progress = trainerProgressionForActor(actor);
    if (!progress?.pendingLevels) return;
    queueMicrotask(() => advanceTrainerClassFromExperience(actor, { notify: false }).catch(error => {
      console.error("poke5e-foundry | Trainer XP advancement failed", error);
      ui.notifications.error(game.i18n.localize("POKE5E.TrainerProgression.Failed"));
    }));
  });
}
