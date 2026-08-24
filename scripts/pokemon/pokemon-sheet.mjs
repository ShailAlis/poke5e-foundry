/**
 * Ficha Pokédex de un Pokémon individual, el archivo más extenso del módulo.
 * Reúne en una sola ventana los datos de la especie y de la instancia, las
 * tiradas de ataque y daño, el modo Concurso, el gestor de movimientos, la
 * experiencia y la evolución, los objetos equipados y los estados alterados.
 *
 * Casi no contiene reglas propias: las toma de move-learning.mjs, combat.mjs,
 * contests.mjs, progression.mjs, status-effects.mjs y held-items.mjs, y aquí
 * las presenta y guarda el resultado en el flag `instance` del Item. La abren trainer-team.mjs,
 * trainer-actor-sheet.mjs, pokemon-actor-sheet.mjs y main.mjs. Su plantilla es
 * `templates/pokemon-sheet.hbs`.
 */
import { loadPoke5eData } from "../core/data-service.mjs";
import { natureDefinition, natureLabel, pokemonAttributesWithNature } from "./natures.mjs";
import { MODULE_ID, MODULE_PATH, displayPokemonName, evolutionRequirementLabel, gearItemSource, portraitUrl } from "../core/model.mjs";
import { pokedollars, updatePokedollars } from "../world/economy.mjs";
import { MAX_KNOWN_MOVES, applyLearnedMove, filterMoveCatalog, moveEligibility } from "./move-learning.mjs";
import { normalizeMoveDamageTypes, pokemonDefenses, typeLabel } from "../combat/combat.mjs";
import { isMoveTargetInRange, moveMaximumRange } from "../combat/move-range.mjs";
import { deployedActorFor, recallPokemon, setPokemonCombatantsDefeated, syncPokemonHeldItemToDeployment, syncPokemonIdentityToDeployment } from "../world/deployment.mjs";
import { CONTEST_TYPES, contestAppealOutcome, contestCompatibility, contestDetailsForMove, contestTypeOptions } from "../world/contests.mjs";
import { POKEMON_STATUS_EFFECTS, applyMoveStatuses, applyPokemonStatus, inferMoveStatusEffects, pokemonIncapacitatingStatus, pokemonStatusEntries, pokemonStatusId, removePokemonStatus } from "../combat/status-effects.mjs";
import { applyMoveOngoingEffects, moveHasImmediateDamage, ongoingEffectEntries, removeOngoingEffect } from "../combat/ongoing-effects.mjs";
import { applyDynamicModifier, applyMoveLock, applyMoveModifierEffects, attackHitsPokemonTarget, consecutiveStrikeStacks, consumeCapturedMoveModifiers, isMoveRecharging, moveModifierEntries, moveModifierIdsToConsume, pokemonCombatModifiers, removeAllMoveModifiers, removeMoveModifier, resetConsecutiveStrike, targetedPokemonModifiers } from "../combat/move-modifiers.mjs";
import { CHAIN_MULTI_HIT_MOVES, CONSECUTIVE_ESCALATION_MOVES, FIXED_MULTI_ATTACK_MOVES, STOP_ON_MISS_MOVES, addExtraDie, diceMultiplierForStacks, resolveChainHits, scaleDiceCount, swiftProjectileCount } from "../combat/multi-hit.mjs";
import { DRAIN_FRACTION_MOVES, RECOIL_FRACTION_MOVES, recoilAmount } from "../combat/recoil.mjs";
import { markFalseSwipeTarget, requestFaintTargets, requestHpEffect, rollFailedSaves } from "../combat/hp-effects.mjs";
import { releaseBideDamage } from "../combat/bide.mjs";
import { isBerryHeldItem, requestHeldItemDestroy, requestHeldItemSwap } from "../combat/item-swap.mjs";
import { acupressureEffect, hiddenPowerType, magnitudeDice } from "../combat/random-tables.mjs";
import { MOVE_MODIFIER_EFFECTS } from "../combat/move-modifier-rules.mjs";
import { requestForcedSwitch, selfForcedSwitch } from "../combat/forced-switch.mjs";
import { FULL_NEGATION_MOVES, HALF_NEGATION_MOVES, SURVIVE_MOVES, armDamageShield } from "../combat/damage-shields.mjs";
import { FIELD_PULSE_MOVES, FIELD_RULE_MOVES, TERRAIN_MOVES, WEATHER_BALL_TYPES, WEATHER_MOVES, clearField, currentField, requestFieldEffect } from "../combat/terrain-effects.mjs";
import { ABILITY_REST_RESOURCES, abilityBlocksBulletproofMove, abilityBlocksIncomingMove, abilityBlocksRepeatingMove, abilityCriticalDamageProfile, abilityDamageImmunity, abilityDoublesDiceAgainstPoisoned, abilityDoublesRecoilStab, abilityFaintedAllyAttackBonus, abilityForcesMoveStab, abilityGrantsAnalyticAdvantage, abilityHealsFromPoisonTick, abilityIceScalesDiceMultiplier, abilityIgnoresAbilityDamageImmunity, abilityIgnoresCriticalDamage, abilityIgnoresNormalFightingImmunity, abilityIgnoresRecoil, abilityIgnoresStatusPenalty, abilityLowHpDamageDiceMultiplier, abilityLowHpStabBonus, abilityMinimumChainExtraHits, abilityMoveActivationTime, abilityMoveDamageBonus, abilityMovePpCost, abilityMoveProfile, abilityMoveStabBonus, abilityMoveTypeOverride, abilityMoveUserTypeChange, abilityPreventsHoldingItem, abilityProtectsHeldItem, abilityReceivedDamageTypeChange, abilityRestUseAvailable, abilityRollsDamageTwiceHigher, abilityRollsSuperEffectiveTwice, abilityRollsVulnerableDamageTwiceLower, abilitySaveDcBonus, abilitySelfStatusDamageBonus, abilitySharpnessDoublesModifier, abilitySheerForceProfile, abilitySuppressesTargetAbilities, abilityTargetAttackRollModifier, abilityTargetDamageDiceMultiplier, abilityTypeTriggeredAdvantage, abilityVulnerabilityFilter, abilityWeatherDamageBonus, abilityWeatherStabBonus, absorbHealType, applyCombatAbilityTypeChange, applyContactDamageReaction, applyContactStatusReaction, applyCursedBodyReaction, applyDamageTypeSelfReaction, applyGooeyReaction, damageTypeSelfReactionTrigger, markAbilityRestUseSpent, ownMeleeHitStatusTrigger } from "./pokemon-abilities.mjs";
import { batteryDiceMultiplier, costarAdvantage, flowerGiftDamageBonus, nearbyAllyActors, nearbyPokemonActors, plusMinusAttackDamageBonus, powerSpotExtraDie, steelySpiritDamageBonus, supersweetSyrupExtraDie, typeAuraDiceMultiplier, victoryStarAttackBonus, weatherAbilitiesSuppressed } from "../combat/aura-abilities.mjs";
import { promptSpendTrainerResource, trainerResourceState } from "../trainer/trainer-resources.mjs";
import { pokemonFeatOptions } from "../trainer/feat-catalog.mjs";
import { SKILLS, speciesSkillKey } from "../trainer/trainer-creation-data.mjs";
import { abilityAutomationMode, visiblePokemonAbilities } from "./ability-coverage.mjs";
import { abilityTriggeredMoveModifierMultiplier } from "./pokemon-abilities.mjs";

const DAMAGE_SHIELD_MOVES = new Set([...FULL_NEGATION_MOVES, ...HALF_NEGATION_MOVES, ...SURVIVE_MOVES]);

const SELF_SWITCH_MOVES = new Set(["baton-pass", "chilly-reception", "flip-turn", "parting-shot", "u-turn", "volt-switch"]);
const TARGET_SWITCH_MOVES = new Set(["circle-throw", "dragon-tail"]);

const ITEM_SWAP_SAVE_MOVES = new Set(["switcheroo"]);

const HP_EFFECT_MOVES = new Set(["endeavor", "ruination", "natures-madness"]);
/** Movimientos que dejan a 0 PG al propio usuario tras resolverse (Fatalidad Final, Autodestrucción). */
const SELF_FAINT_MOVES = new Set(["final-gambit", "self-destruct"]);

/** Movimientos cuyos dados se doblan si el clima indicado está activo (Síntesis en Día Soleado). */
const WEATHER_DICE_DOUBLE_MOVES = { synthesis: "sun" };
/** Movimientos cuyo modificador MOVE se dobla si el clima indicado está activo (Rayo Solar/Hoja Solar en sol, Recuperar Costa en tormenta de arena). */
const WEATHER_MODIFIER_DOUBLE_MOVES = { "solar-beam": "sun", "solar-blade": "sun", "shore-up": "sandstorm" };
/** Los 8 estados que puede tener un objetivo, para comprobar "si el objetivo sufre cualquier estado" (Hex, Desfile Infernal, Andanada Tóxica). */
const POKEMON_STATUS_IDS = ["badly-poisoned", "burned", "frozen", "paralyzed", "poisoned", "asleep", "confused", "flinched"];
/** Doblan el modificador MOVE del daño si el objetivo sufre cualquier estado. */
const TARGET_STATUS_MODIFIER_DOUBLE_MOVES = new Set(["hex", "infernal-parade", "barb-barrage"]);
/** Doblan los dados de daño si el objetivo sufre alguno de estos estados concretos (Golpe Tóxico, Sales Aromáticas). */
const TARGET_STATUS_DICE_DOUBLE_MOVES = { venoshock: ["poisoned", "badly-poisoned"], "smelling-salts": ["paralyzed"] };
/** Doblan el modificador MOVE del daño si el objetivo conserva al menos la mitad de sus PG máximos (Escurrir). */
const TARGET_HP_MODIFIER_DOUBLE_MOVES = new Set(["wring-out"]);
/** Multiplican los dados de daño según los PG actuales del propio usuario (Golpe Descuido, Inversión: ×2 por debajo del 50%, ×3 por debajo del 10%). */
const SELF_HP_DICE_MULTIPLIER_MOVES = new Set(["flail", "reversal"]);
/** Reducen a la mitad los dados de daño si el propio usuario está por debajo del 50% de sus PG máximos (Chorro de Agua). */
const SELF_HP_HALF_DICE_MOVES = new Set(["water-spout"]);
/** Doblan los dados de daño si el usuario ha recibido daño desde que acabó su último turno (Payback/Avalanche, ver combat-history.mjs). */
const OWN_DAMAGED_DICE_DOUBLE_MOVES = new Set(["payback", "avalanche"]);
/** Doblan el modificador MOVE si el último movimiento del objetivo (instance.lastMoveId) no fue un movimiento de ataque. */
const TARGET_LAST_MOVE_NOT_ATTACK_MODIFIER_DOUBLE_MOVES = new Set(["bolt-beak", "fishious-rend"]);
/** Doblan los dados de daño si el propio último ataque del usuario falló (Berrinche Pisotón). */
const OWN_MISSED_DICE_DOUBLE_MOVES = new Set(["stomping-tantrum"]);
/** Suman un dado extra a la tirada si el propio último ataque del usuario falló (Bengala Cansada). */
const OWN_MISSED_EXTRA_DIE_MOVES = new Set(["temper-flare"]);
/** Doblan los dados de daño si el objetivo ya recibió daño esta misma ronda (Certeza, ver combat-history.mjs). */
const TARGET_DAMAGED_THIS_ROUND_DICE_DOUBLE_MOVES = new Set(["assurance"]);
/**
 * Movimientos cuyo estado no es fijo sino que sale de una tirada propia en su
 * texto: se tira una sola vez para toda la activación (no una por objetivo,
 * simplificación deliberada para Certeza Tri-Ataque) y se construye un
 * `move.statusEffects` sintético que reutiliza applyMoveStatuses() tal cual.
 */
const RANDOM_STATUS_TABLE_MOVES = {
  "secret-power": { faces: 6, trigger: "natural", minimum: 15, resolve: roll => ["poisoned", "burned", "confused", "frozen", "paralyzed", "asleep"][roll - 1] },
  "tri-attack": { faces: 6, trigger: "failed-save", margin: 5, resolve: roll => (roll <= 2 ? "burned" : roll <= 4 ? "frozen" : "paralyzed") }
};
import { aceTrainerAbilityBonus, hasTrainerPath, machineConsumption, pokemonPathMoveBonuses, rangerAssistAdvantage, rangerCompanionAttackBonus, rangerCompanionCheckBonus, trainerSpecializationTypes, typeMasteryForcesStab } from "../trainer/trainer-path-rules.mjs";
import {
  activateHeldItem,
  applyPostMoveHeldItemEffects,
  choiceHeldItemAllowsMove,
  confirmHeldItemReaction,
  heldItemActorAdjustments,
  heldItemEffectiveMove,
  heldItemEffectiveTypes,
  heldItemId,
  heldItemInitialCharges,
  heldItemMoveModifiers,
  lockChoiceHeldItem,
  resolvePokemonHpBerryReaction,
  tryLeppaBerryReaction
} from "./held-items.mjs";
import {
  evolutionReadiness,
  experienceAtLevel,
  experienceAward,
  experienceProgress,
  levelForExperience,
  normalizedExperience
} from "./progression.mjs";
import { ABILITIES, applyPendingPokemonAdvancements, attachStepperGroup, hasPendingPokemonAdvancements, initializePokemonAdvancement, stepperGrid } from "./pokemon-advancement.mjs";
import { abilityModifier, escapeHtml, formatNumber, signed, titleCase } from "../core/utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Característica asociada a cada competencia de D&D 5e. */
const SKILL_ABILITIES = {
  acr: "dex", ani: "wis", arc: "int", ath: "str", dec: "cha", his: "int",
  ins: "wis", itm: "cha", inv: "int", med: "wis", nat: "int", prc: "wis",
  prf: "cha", per: "cha", rel: "int", slt: "dex", ste: "dex", sur: "wis"
};

/**
 * Prepara la lista completa de competencias y su modificador final. Usa la
 * progresión de competencia por nivel Pokémon que emplean sus ataques y CD,
 * además de los ajustes de la especie y del entrenador. Si está desplegado,
 * conserva cualquier cambio activo en su puntuación de característica.
 */
function preparePokemonSkills({ combatActor, trainer, pokemonItem, species, instance, effectiveTypes, level }) {
  const proficiency = 2 + Math.floor((Math.max(1, Number(level) || 1) - 1) / 4);
  const speciesSkills = new Set((species.skills ?? []).map(speciesSkillKey).filter(Boolean));
  if (trainer?.type === "character" && hasTrainerPath(trainer, "hobbyist", 15) && instance.multitalentSkill) {
    speciesSkills.add(instance.multitalentSkill);
  }
  const specializedTypes = trainerSpecializationTypes(trainer);
  const specializationBonus = (effectiveTypes ?? []).filter(type => specializedTypes.has(String(type).toLocaleLowerCase())).length;
  const companionBonus = trainer?.type === "character" ? rangerCompanionCheckBonus(trainer, pokemonItem) : 0;
  const effectiveAttributes = pokemonAttributesWithNature(species, instance);

  return Object.entries(SKILLS).map(([key, fallbackLabel]) => {
    const actorSkill = combatActor?.system.skills?.[key];
    const ability = actorSkill?.ability ?? CONFIG.DND5E.skills?.[key]?.ability ?? SKILL_ABILITIES[key];
    const rank = actorSkill ? Number(actorSkill.value) || 0 : (speciesSkills.has(key) ? 1 : 0);
    const proficient = rank >= 1;
    const hobbyistBonus = trainer?.type === "character" && !proficient && hasTrainerPath(trainer, "hobbyist", 9)
      ? Math.floor(proficiency / 2)
      : 0;
    const projectedScore = (Number(effectiveAttributes[ability]) || 10)
      + (trainer?.type === "character" ? aceTrainerAbilityBonus(trainer, ability) : 0);
    const abilityScore = Number(combatActor?.system.abilities?.[ability]?.value) || projectedScore;
    const baseTotal = Math.floor((abilityScore - 10) / 2) + (rank * proficiency) + specializationBonus;
    const labelKey = CONFIG.DND5E.skills?.[key]?.label;
    const abilityLabelKey = CONFIG.DND5E.abilities?.[ability]?.label;
    return {
      key,
      label: labelKey ? game.i18n.localize(labelKey) : fallbackLabel,
      ability: String(ability ?? "").toUpperCase(),
      abilityLabel: abilityLabelKey ? game.i18n.localize(abilityLabelKey) : String(ability ?? "").toUpperCase(),
      rank,
      proficient,
      expertise: rank >= 2,
      modifier: baseTotal + hobbyistBonus + companionBonus,
      modifierLabel: signed(baseTotal + hobbyistBonus + companionBonus)
    };
  });
}

const MOVE_ACCORDION_DURATION = 180;

/**
 * Anima la apertura/cierre de un <details> y, si se abre, cierra los demás
 * <details> del mismo grupo (acordeón de un solo elemento abierto). Se
 * reengancha en cada _onRender porque el HTML se redibuja entero. La técnica
 * de animar `height` con details.animate() evita el salto brusco por defecto
 * de <details>, y se apoya en el <summary> como "altura cerrada" en vez de un
 * valor fijo, para no romperse si cambia el tamaño de fuente o el ancho.
 */
function initAccordionGroup(container) {
  if (!container) return;
  const items = container.querySelectorAll(":scope > details");
  items.forEach(details => {
    const summary = details.querySelector(":scope > summary");
    if (!summary || details.dataset.accordionBound) return;
    details.dataset.accordionBound = "true";
    details._accordionState = { animation: null, closing: false, expanding: false };
    summary.addEventListener("click", event => {
      event.preventDefault();
      const state = details._accordionState;
      if (state.closing || !details.open) {
        items.forEach(other => { if (other !== details && other.open) collapseAccordionItem(other); });
        expandAccordionItem(details, summary);
      } else if (state.expanding || details.open) {
        collapseAccordionItem(details, summary);
      }
    });
  });
}

function expandAccordionItem(details, summary = details.querySelector(":scope > summary")) {
  const state = details._accordionState;
  details.style.overflow = "hidden";
  details.style.height = `${details.offsetHeight}px`;
  details.open = true;
  requestAnimationFrame(() => {
    state.expanding = true;
    const startHeight = details.offsetHeight;
    const endHeight = summary.offsetHeight + Array.from(details.children).filter(child => child !== summary)
      .reduce((sum, child) => sum + child.offsetHeight, 0);
    state.animation?.cancel();
    state.animation = details.animate(
      { height: [`${startHeight}px`, `${endHeight}px`] },
      { duration: MOVE_ACCORDION_DURATION, easing: "ease-out" }
    );
    state.animation.onfinish = () => finishAccordionAnimation(details, true);
    state.animation.oncancel = () => { state.expanding = false; };
  });
}

function collapseAccordionItem(details, summary = details.querySelector(":scope > summary")) {
  const state = details._accordionState;
  state.closing = true;
  details.style.overflow = "hidden";
  const startHeight = details.offsetHeight;
  const endHeight = summary.offsetHeight;
  state.animation?.cancel();
  state.animation = details.animate(
    { height: [`${startHeight}px`, `${endHeight}px`] },
    { duration: MOVE_ACCORDION_DURATION, easing: "ease-out" }
  );
  state.animation.onfinish = () => finishAccordionAnimation(details, false);
  state.animation.oncancel = () => { state.closing = false; };
}

function finishAccordionAnimation(details, open) {
  const state = details._accordionState;
  details.open = open;
  state.animation = null;
  state.closing = false;
  state.expanding = false;
  details.style.height = "";
  details.style.overflow = "";
}

/**
 * Ficha de un Pokémon individual. Trabaja siempre sobre el Item embebido en el
 * entrenador (o en el actor salvaje), nunca sobre el actor temporal del mapa,
 * que es el que redirige aquí pokemon-actor-sheet.mjs.
 */
export class Poke5ePokemonSheet extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-pokemon",
    classes: ["poke5e", "poke5e-pokemon-sheet"],
    window: { icon: "fa-solid fa-circle-dot", resizable: true },
    position: { width: 760, height: 720 }
  };

  static PARTS = {
    main: {
      template: `${MODULE_PATH}/templates/pokemon-sheet.hbs`,
      scrollable: [""]
    }
  };

  /**
   * Guarda el Item Pokémon y el estado propio de la ventana —gestor de
   * movimientos abierto, sus filtros y el modo Combate/Concurso—, que no se
   * persiste en el documento. El id incluye el del Item para que cada Pokémon
   * tenga su ventana.
   */
  constructor({ pokemonItem, ...options } = {}) {
    super({ ...options, id: `poke5e-pokemon-${pokemonItem?.id ?? "unknown"}` });
    this.pokemonItem = pokemonItem;
    this.moveManagerOpen = false;
    this.moveFilters = { query: "", category: "available" };
    this.refocusMoveSearch = false;
    this.sheetMode = "combat";
    this.pokemonTab = "moves";
    this.contestType = "cool";
  }

  /** Título traducido con el nombre visible del Pokémon. */
  get title() {
    return game.i18n.format("POKE5E.Sheet.Title", { name: displayPokemonName(this.pokemonItem) });
  }

  /**
   * Reúne todo lo que muestra la plantilla: movimientos conocidos con
   * prepareMove(), catálogo del gestor si está abierto (filterMoveCatalog()),
   * habilidades y características, afinidades de pokemonDefenses(), experiencia
   * y recompensa de progression.mjs, objeto equipado, estados —cruzando los
   * guardados en la instancia con los activos en el actor del mapa—, objetos del
   * inventario que puede equipar, evoluciones con prepareEvolutions() y los
   * datos del modo Concurso. Usa las características de la instancia si las
   * tiene y aplica tipos, CA y modificadores de movimiento del objeto equipado
   * para que la vista previa coincida con las tiradas reales.
   */
  async _prepareContext() {
    const data = await loadPoke5eData();
    const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const instance = this.pokemonItem.getFlag(MODULE_ID, "instance") ?? {};
    const trainer = this.pokemonItem.parent;
    const hasTrainer = trainer?.type === "character";
    const heldItem = instance.heldItem ?? null;
    const effectiveTypes = heldItemEffectiveTypes({
      sourceId: heldItem?.sourceId,
      speciesId: species.id,
      baseTypes: species.type ?? [],
      abilities: instance.abilities ?? []
    });
    const combatSpecies = { ...species, type: effectiveTypes, attributes: pokemonAttributesWithNature(species, instance) };
    const level = Number(instance.level) || 1;
    const moves = (instance.moves ?? []).map(entry => {
      const move = data.movesById.get(entry.moveId);
      return move ? prepareMove(entry, move, combatSpecies, level, data.contestEffectsById, this.contestType, heldItem, trainer, instance.abilities) : null;
    }).filter(Boolean);
    const knownMoveIds = new Set((instance.moves ?? []).map(entry => entry.moveId));
    const machineIds = trainerMoveMachineIds(trainer);
    const catalog = this.moveManagerOpen
      ? filterMoveCatalog(data.moves, species, level, knownMoveIds, { ...this.moveFilters, machineIds })
      : [];
    const abilities = visiblePokemonAbilities(species.abilities, instance.abilities, { isGM: game.user.isGM }).map(entry => {
      const ability = data.abilitiesById.get(entry.id);
      if (!ability) return null;
      const automation = abilityAutomationMode(ability.id);
      return {
        id: ability.id,
        name: ability.name,
        description: `<p>${escapeHtml(ability.description)}</p>`,
        hidden: entry.hidden,
        known: entry.known,
        automation,
        automatic: automation === "automatic"
      };
    }).filter(Boolean);
    const abilityScores = Object.entries(combatSpecies.attributes).map(([key, score]) => ({
      key: key.toUpperCase(), score, modifier: signed(Math.floor((Number(score) - 10) / 2))
    }));
    const defenses = pokemonDefenses(effectiveTypes);
    const experience = experienceProgress(instance.experience, level);
    const hpMaximum = Math.max(1, Number(instance.hp?.max) || Number(species.hp) || 1);
    const hpCurrent = Math.max(0, Math.min(hpMaximum, Number(instance.hp?.value) || 0));
    const hpFraction = hpCurrent / hpMaximum;
    const pendingAdvancements = hasPendingPokemonAdvancements(instance);
    const heldActor = heldItemActorAdjustments({ sourceId: heldItem?.sourceId, speciesId: species.id, charges: heldItem?.charges, state: heldItem?.state });
    const combatActor = trainer?.getFlag?.(MODULE_ID, "kind") === "wild" ? trainer : deployedActorFor(this.pokemonItem);
    const death = combatActor?.system?.attributes?.death;
    const deathSuccess = Math.max(0, Math.min(3, Number(death?.success) || 0));
    const deathFailure = Math.max(0, Math.min(3, Number(death?.failure) || 0));
    const deathSaves = hasTrainer && combatActor?.getFlag(MODULE_ID, "kind") === "deployed" && hpCurrent <= 0 && death
      ? {
          success: deathSuccess,
          failure: deathFailure,
          successes: Array.from({ length: 3 }, (_, index) => ({ filled: index < deathSuccess })),
          failures: Array.from({ length: 3 }, (_, index) => ({ filled: index < deathFailure })),
          canRoll: deathSuccess < 3 && deathFailure < 3,
          stabilized: deathSuccess >= 3,
          dead: deathFailure >= 3
        }
      : null;
    const skills = preparePokemonSkills({ combatActor, trainer, pokemonItem: this.pokemonItem, species, instance, effectiveTypes, level });
    const activeConditions = POKEMON_STATUS_IDS.filter(id => combatActor?.statuses?.has(pokemonStatusId(id)));
    const inventoryItems = hasTrainer
      ? trainer.items
        .filter(item => item.getFlag(MODULE_ID, "kind") === "gear" && Number(item.system.quantity ?? 1) > 0)
        .map(item => ({ id: item.id, sourceId: item.getFlag(MODULE_ID, "sourceId"), name: item.name, quantity: Number(item.system.quantity ?? 1) }))
      : [];
    // Recurso de Macarra: se consulta una sola vez y lo comparten Sabotaje y
    // Esquive Sombrío, que solo se ofrecen si el escudo no está ya armado.
    const gruntResource = hasTrainer && !combatActor?.getFlag(MODULE_ID, "damageShield")
      ? (state => state?.remaining ? state : null)(trainerResourceState(trainer, "grunt"))
      : null;
    const award = experienceAward(level, species.sr);
    const natureEffect = natureDefinition(instance.nature);
    const abilityLabel = key => {
      const labelKey = CONFIG.DND5E.abilities?.[key]?.label;
      return labelKey ? game.i18n.localize(labelKey) : String(key ?? "").toUpperCase();
    };
    return {
      item: this.pokemonItem,
      trainer,
      hasTrainer,
      sabotageResource: gruntResource,
      shadowDodgeResource: gruntResource && hasTrainerPath(trainer, "grunt", 9) ? gruntResource : null,
      canFieldMedicine: hasTrainer && hasTrainerPath(trainer, "nurse", 9)
        && (instance.conditions ?? []).some(id => POKEMON_STATUS_EFFECTS[id]?.nonVolatile),
      multitalentChoice: hasTrainer && hasTrainerPath(trainer, "hobbyist", 15)
        ? { options: SKILLS, selected: instance.multitalentSkill ?? "" }
        : null,
      name: displayPokemonName(this.pokemonItem),
      img: portraitUrl(species, instance.shiny),
      species,
      instance,
      nature: {
        ...natureEffect,
        label: natureLabel(instance.nature),
        increaseLabel: natureEffect.increase ? abilityLabel(natureEffect.increase) : "",
        decreaseLabel: natureEffect.decrease ? abilityLabel(natureEffect.decrease) : ""
      },
      level,
      skills,
      pokemonTabs: {
        details: this.pokemonTab === "details",
        skills: this.pokemonTab === "skills",
        moves: this.pokemonTab === "moves"
      },
      experience: {
        ...experience,
        totalLabel: formatNumber(experience.total),
        remainingLabel: formatNumber(experience.remaining),
        nextLabel: formatNumber(experience.ceiling),
        nextLevel: Math.min(level + 1, 20),
        progressMax: Math.max(experience.span, 1),
        progressValue: experience.maximumLevel ? 1 : experience.gained,
        award,
        awardLabel: formatNumber(award)
      },
      pendingAdvancements,
      deathSaves,
      heldItem: heldItem ? { ...heldItem, hasCharges: heldItem.charges != null } : null,
      statuses: pokemonStatusEntries({ conditions: [...new Set([...(instance.conditions ?? []), ...activeConditions])] }),
      ongoingEffects: [...ongoingEffectEntries(combatActor), ...moveModifierEntries(combatActor)],
      heldItemOptions: Object.fromEntries([["", "Ninguno"], ...inventoryItems.map(entry => [entry.id, `${entry.name} ×${entry.quantity}`])]),
      moves,
      sheetMode: { id: this.sheetMode, combat: this.sheetMode === "combat", contest: this.sheetMode === "contest" },
      contest: {
        type: this.contestType,
        label: CONTEST_TYPES[this.contestType].label,
        icon: CONTEST_TYPES[this.contestType].icon,
        typeOptions: contestTypeOptions()
      },
      maxKnownMoves: MAX_KNOWN_MOVES,
      moveLimitExceeded: moves.length > MAX_KNOWN_MOVES,
      moveManager: {
        open: this.moveManagerOpen,
        filters: this.moveFilters,
        categoryOptions: {
          available: "Disponibles ahora",
          future: "Niveles posteriores",
          incompatible: "No compatibles",
          all: "Todos"
        },
        total: catalog.length,
        truncated: catalog.length > 120,
        entries: catalog.slice(0, 120).map(entry => prepareCatalogMove(entry, data.movesById.get(entry.id), combatSpecies, level, data.contestEffectsById, this.contestType, trainer))
      },
      abilities,
      abilityScores,
      types: effectiveTypes.map(type => ({ id: type, label: typeLabel(type) })),
      hp: {
        value: hpCurrent,
        max: hpMaximum,
        state: hpFraction < 0.15 ? "critical" : hpFraction < 0.5 ? "warning" : "healthy"
      },
      ac: (Number(instance.ac ?? species.ac) || 10) + heldActor.ac,
      speeds: prepareSpeeds(species.speed),
      gender: prepareGender(instance.gender, species.gender),
      captureBall: instance.caughtWith ? (data.itemsById.get(instance.caughtWith)?.name ?? instance.caughtWith) : "",
      evolutions: prepareEvolutions(data.evolutionsByFrom.get(species.id) ?? [], data, instance),
      defenses: {
        vulnerabilities: defenses.vulnerabilities.map(prepareType),
        resistances: defenses.resistances.map(prepareType),
        immunities: defenses.immunities.map(prepareType)
      },
      canEdit: this.pokemonItem.isOwner
    };
  }

  /**
   * Conecta todos los controles de la plantilla con los métodos privados de la
   * clase: tiradas, selector Combate/Concurso, gestor de movimientos con su
   * búsqueda (que recupera el foco tras redibujar), nivel y experiencia,
   * evolución, PG, apodo, objeto equipado, curación de estados y el soltar
   * movimientos u objetos sobre la ficha.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll("[data-action='roll-move']").forEach(button => button.addEventListener("click", event => {
      this.#rollMove(event).catch(error => {
        console.error(`${MODULE_ID} | Pokemon move roll failed`, error);
        ui.notifications.error(game.i18n.localize("POKE5E.PokemonNotifications.MoveRollFailed"));
      });
    }));
    this.element.querySelectorAll("[data-action='roll-contest-move']").forEach(button => button.addEventListener("click", event => this.#rollContestMove(event)));
    this.element.querySelectorAll("[data-action='sheet-mode']").forEach(button => button.addEventListener("click", event => {
      this.sheetMode = event.currentTarget.dataset.mode === "contest" ? "contest" : "combat";
      this.render({ force: true });
    }));
    this.element.querySelectorAll("[data-action='pokemon-tab']").forEach(button => button.addEventListener("click", event => {
      const tab = event.currentTarget.dataset.tab;
      this.pokemonTab = ["details", "skills", "moves"].includes(tab) ? tab : "details";
      this.render({ force: true });
    }));
    this.element.querySelector("[data-action='contest-type']")?.addEventListener("change", event => {
      this.contestType = CONTEST_TYPES[event.currentTarget.value] ? event.currentTarget.value : "cool";
      this.render({ force: true });
    });
    this.element.querySelectorAll("[data-action='restore-pp']").forEach(button => button.addEventListener("click", event => this.#restorePp(event)));
    this.element.querySelectorAll("[data-action='remove-move']").forEach(button => button.addEventListener("click", event => this.#removeMove(event)));
    this.element.querySelectorAll("[data-action='remove-ability']").forEach(button => button.addEventListener("click", event => this.#removeAbility(event)));
    this.element.querySelectorAll("[data-action='use-ability']").forEach(button => button.addEventListener("click", event => this.#useAbility(event)));
    this.element.querySelectorAll("[data-action='remove-ongoing-effect']").forEach(button => button.addEventListener("click", event => this.#removeOngoingEffect(event)));
    this.element.querySelectorAll("[data-action='learn-move']").forEach(button => button.addEventListener("click", event => this.#learnMove(event)));
    this.element.querySelector("[data-action='toggle-move-manager']")?.addEventListener("click", () => {
      this.moveManagerOpen = !this.moveManagerOpen;
      this.render({ force: true });
    });
    const moveSearch = this.element.querySelector("[data-action='search-moves']");
    moveSearch?.addEventListener("input", foundry.utils.debounce(event => {
      this.moveFilters.query = event.target.value;
      this.refocusMoveSearch = true;
      this.render({ force: true });
    }, 200));
    this.element.querySelector("[data-action='filter-moves']")?.addEventListener("change", event => {
      this.moveFilters.category = event.target.value;
      this.render({ force: true });
    });
    if (this.refocusMoveSearch && moveSearch) {
      moveSearch.focus();
      moveSearch.setSelectionRange(moveSearch.value.length, moveSearch.value.length);
      this.refocusMoveSearch = false;
    }
    this.element.querySelector("[data-action='change-level']")?.addEventListener("change", event => this.#changeLevel(event));
    this.element.querySelector("[data-action='change-experience']")?.addEventListener("change", event => this.#changeExperience(event));
    this.element.querySelector("[data-action='add-experience']")?.addEventListener("click", () => this.#addExperience());
    this.element.querySelector("[data-action='apply-advancements']")?.addEventListener("click", () => this.#applyAdvancements());
    this.element.querySelectorAll("[data-action='evolve-pokemon']").forEach(button => button.addEventListener("click", event => this.#evolve(event)));
    this.element.querySelector("[data-action='change-hp']")?.addEventListener("change", event => this.#changeHp(event));
    this.element.querySelector("[data-action='roll-death-save']")?.addEventListener("click", event => this.#rollDeathSave(event));
    this.element.querySelector("[data-action='change-nickname']")?.addEventListener("change", event => this.#changeNickname(event));
    this.element.querySelector("[data-action='equip-held-item']")?.addEventListener("change", event => this.#equipHeldItem(event));
    this.element.querySelector("[data-action='use-held-item']")?.addEventListener("click", () => this.#useHeldItem());
    this.element.querySelector("[data-action='restore-held-item']")?.addEventListener("click", () => this.#restoreHeldItem());
    this.element.querySelectorAll("[data-action='remove-status']").forEach(button => button.addEventListener("click", event => this.#removeStatus(event)));
    this.element.querySelector("[data-action='open-trainer-sheet']")?.addEventListener("click", () => this.pokemonItem.parent?.sheet.render(true));
    this.element.querySelector("[data-action='arm-sabotage']")?.addEventListener("click", () => this.#armSabotage());
    this.element.querySelector("[data-action='arm-shadow-dodge']")?.addEventListener("click", () => this.#armShadowDodge());
    this.element.querySelector("[data-action='field-medicine']")?.addEventListener("click", () => this.#fieldMedicine());
    this.element.querySelectorAll("[data-action='roll-skill']").forEach(button => button.addEventListener("click", event => {
      const key = event.currentTarget.dataset.skillKey;
      if (key) this.#rollSkillCheck(key);
    }));
    this.element.querySelector("[data-action='select-multitalent']")?.addEventListener("change", async event => {
      const instance = this.#instance();
      instance.multitalentSkill = event.currentTarget.value || null;
      await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
      this.render({ force: true });
    });
    this.element.addEventListener("dragover", event => event.preventDefault());
    this.element.addEventListener("drop", event => this.#onDrop(event));
    initAccordionGroup(this.element.querySelector(".poke5e-move-list"));
    initAccordionGroup(this.element.querySelector(".poke5e-move-catalog"));
  }

  /**
   * Fija el nivel a mano (1-20) y reajusta la experiencia al umbral de ese
   * nivel con experienceAtLevel(). Su contraparte es #changeExperience().
   */
  async #changeLevel(event) {
    const instance = this.#instance();
    const oldLevel = Math.max(1, Math.min(20, Number(instance.level) || 1));
    initializePokemonAdvancement(instance);
    instance.level = Math.max(1, Math.min(20, Number(event.currentTarget.value) || 1));
    instance.experience = experienceAtLevel(instance.level);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    if (instance.level > oldLevel) await applyPendingPokemonAdvancements(this.pokemonItem);
    this.render({ force: true });
  }

  /**
   * Fija la experiencia total y sube de nivel si procede, según
   * levelForExperience(). Nunca baja el nivel ya alcanzado, y anuncia la subida
   * con notifyLevelGain().
   */
  async #changeExperience(event) {
    const instance = this.#instance();
    const oldLevel = Math.max(1, Math.min(20, Number(instance.level) || 1));
    initializePokemonAdvancement(instance);
    instance.experience = normalizedExperience(event.currentTarget.value, oldLevel);
    instance.level = Math.max(oldLevel, levelForExperience(instance.experience));
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    if (instance.level > oldLevel) await applyPendingPokemonAdvancements(this.pokemonItem);
    this.render({ force: true });
  }

  /**
   * Suma experiencia preguntando la cantidad con promptExperienceAmount(); por
   * lo demás se comporta igual que #changeExperience().
   */
  async #addExperience() {
    const instance = this.#instance();
    const oldLevel = Math.max(1, Math.min(20, Number(instance.level) || 1));
    initializePokemonAdvancement(instance);
    const amount = await promptExperienceAmount();
    if (!amount) return;
    instance.experience = normalizedExperience(instance.experience, oldLevel) + amount;
    instance.level = Math.max(oldLevel, levelForExperience(instance.experience));
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    if (instance.level > oldLevel) await applyPendingPokemonAdvancements(this.pokemonItem);
    this.render({ force: true });
  }

  /** Retoma un avance que se canceló al subir de nivel. */
  async #applyAdvancements() {
    await applyPendingPokemonAdvancements(this.pokemonItem);
    this.render({ force: true });
  }

  /**
   * Evolución guiada. Comprueba las condiciones automáticas con
   * evolutionReadiness(), pide confirmación y el reparto de puntos de
   * característica con promptEvolution(), lo valida con applyAbilityAllocation(),
   * retira al Pokémon del mapa y reescribe el Item con la nueva especie:
   * primero rechaza la acción si lleva Mineral Evolutivo; si procede, conserva
   * el daño recibido al ampliar los PG máximos, actualiza CA,
   * características, habilidades (evolvedAbilities()), nombre e imagen.
   */
  async #evolve(event) {
    const evolutionId = event.currentTarget.dataset.evolutionId;
    const data = await loadPoke5eData();
    const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const evolution = (data.evolutionsByFrom.get(species.id) ?? []).find(entry => entry.id === evolutionId);
    const target = data.pokemonById.get(evolution?.to);
    if (!evolution || !target) return ui.notifications.error(game.i18n.localize("POKE5E.PokemonNotifications.EvolutionMissing"));
    const instance = this.#instance();
    if (heldItemId(instance.heldItem?.sourceId) === "eviolite") {
      return ui.notifications.warn(game.i18n.format("POKE5E.PokemonNotifications.EvolutionBlocked", { item: instance.heldItem.name }));
    }
    const readiness = evolutionReadiness(evolution, {
      level: instance.level,
      gender: instance.gender,
      knownMoveIds: (instance.moves ?? []).map(entry => entry.moveId),
      movesById: data.movesById
    });
    if (!readiness.available) return ui.notifications.warn(game.i18n.localize("POKE5E.PokemonNotifications.NotReadyToEvolve"));
    const asiPoints = Number(evolution.effects?.find(effect => effect.type === "asi")?.value) || 0;
    const allocation = await promptEvolution({ evolution, target, data, instance, species, asiPoints, manual: readiness.manual, trainer: this.pokemonItem.parent });
    if (!allocation) return;
    // Experto en evolución (Researcher 9): 2 de los puntos a repartir se
    // gastan en una dote en vez de característica. Igual que el resto de
    // dotes Pokémon de este proyecto, queda como registro en
    // instance.evolutionFeats — ninguna dote Pokémon tiene todavía un efecto
    // mecánico propio conectado (ver pathFeatureAutomation() en model.mjs).
    const researcherFeat = allocation.__researcherFeat;
    delete allocation.__researcherFeat;
    const featCost = researcherFeat ? 2 : 0;
    const currentAttributes = foundry.utils.deepClone(instance.attributes ?? species.attributes ?? {});
    if (!applyAbilityAllocation(currentAttributes, allocation, asiPoints - featCost)) {
      return ui.notifications.warn(game.i18n.format("POKE5E.PokemonNotifications.InvalidAbilityIncrease", { points: asiPoints - featCost }));
    }
    if (researcherFeat) instance.evolutionFeats = [...(instance.evolutionFeats ?? []), researcherFeat];
    await recallPokemon(this.pokemonItem);
    const missingHp = Math.max(0, Number(instance.hp?.max) - Number(instance.hp?.value));
    const evolutionHpBonus = 2 * (Number(instance.level) || 1);
    const newMaximumHp = Math.max(1, Number(instance.hp?.max) || Number(species.hp) || 1) + evolutionHpBonus;
    instance.hp = { value: Math.max(0, newMaximumHp - missingHp), max: newMaximumHp };
    instance.ac = Number(target.ac) || instance.ac || 10;
    instance.attributes = currentAttributes;
    instance.abilities = evolvedAbilities(instance.abilities, target);
    await this.pokemonItem.update({
      name: target.name,
      img: portraitUrl(target),
      [`flags.${MODULE_ID}.sourceId`]: target.id,
      [`flags.${MODULE_ID}.species`]: foundry.utils.deepClone(target),
      [`flags.${MODULE_ID}.instance`]: instance
    });
    ui.notifications.info(game.i18n.format("POKE5E.PokemonNotifications.Evolved", { pokemon: displayPokemonName(this.pokemonItem), target: target.name }));
    this.render({ force: true });
  }

  /**
   * Edita los PG acotándolos entre 0 y el máximo. Antes de guardar ofrece una
   * baya curativa si la bajada cruza la mitad; si se consume, guarda curación y
   * retirada del objeto juntas. El hook `updateItem` de main.mjs propaga el
   * resultado al mapa mediante syncPokemonHpToDeployment().
   */
  async #changeHp(event) {
    const instance = this.#instance();
    const previousHp = Math.max(0, Number(instance.hp.value) || 0);
    const nextHp = Math.max(0, Math.min(Number(instance.hp.max) || 1, Number(event.currentTarget.value) || 0));
    const reaction = await resolvePokemonHpBerryReaction(this.pokemonItem, previousHp, nextHp);
    if (reaction.handled) {
      await syncPokemonHeldItemToDeployment(this.pokemonItem);
      this.render({ force: true });
      return;
    }
    instance.hp.value = nextHp;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  /**
   * Ejecuta la salvación contra muerte nativa de D&D5e sobre el actor temporal
   * del Pokémon. Un tercer fallo lo marca como derrotado en el combate; un 20
   * natural devuelve 1 PG mediante la propia regla del sistema y se sincroniza
   * de vuelta a la ficha Pokémon por el hook de updateActor.
   */
  async #rollDeathSave(event) {
    const actor = deployedActorFor(this.pokemonItem);
    const death = actor?.system?.attributes?.death;
    if (!actor || actor.getFlag(MODULE_ID, "kind") !== "deployed" || Number(actor.system.attributes?.hp?.value) > 0 || !death) return;
    if (Number(death.success) >= 3 || Number(death.failure) >= 3) return;
    await actor.rollDeathSave({ event, legacy: false });
    if (Number(actor.system.attributes?.death?.failure) >= 3) await setPokemonCombatantsDefeated(actor, true);
    this.render({ force: true });
  }

  /**
   * Cambia el apodo (o lo borra para recuperar el nombre de la especie) y lo
   * propaga a los tokens con syncPokemonIdentityToDeployment().
   */
  async #changeNickname(event) {
    if (!this.pokemonItem.isOwner) return;
    const instance = this.#instance();
    const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    instance.nickname = String(event.currentTarget.value ?? "").trim().slice(0, 80);
    await this.pokemonItem.update({
      name: instance.nickname || species.name || this.pokemonItem.name,
      [`flags.${MODULE_ID}.instance`]: instance
    });
    await syncPokemonIdentityToDeployment(this.pokemonItem);
    this.render({ force: true });
  }

  /**
   * Equipa o retira el objeto que lleva el Pokémon, moviendo la unidad entre el
   * inventario del entrenador y la instancia: devuelve el anterior con
   * returnHeldItem(), descuenta el nuevo con decrementInventoryItem(), le fija
   * sus cargas con heldItemInitialCharges() y sincroniza sus ajustes al actor.
   */
  async #equipHeldItem(event) {
    const trainer = this.pokemonItem.parent;
    if (trainer?.type !== "character" || !this.pokemonItem.isOwner) return;
    const instance = this.#instance();
    const selectedId = event.currentTarget.value;
    const selected = selectedId ? trainer.items.get(selectedId) : null;
    if (selected && selected.getFlag(MODULE_ID, "kind") !== "gear") return;
    if (instance.heldItem?.sourceId === selected?.getFlag(MODULE_ID, "sourceId")) return;
    if (selected && abilityPreventsHoldingItem(instance.abilities)) {
      // Torpeza (klutz, lote 14): nunca puede llevar objeto equipado. Quitar
      // uno ya puesto (selected null) sigue permitido, solo se bloquea poner
      // uno nuevo.
      ui.notifications.warn(game.i18n.format("POKE5E.PokemonNotifications.KlutzCannotHold", { name: displayPokemonName(this.pokemonItem) }));
      this.render({ force: true });
      return;
    }
    const data = await loadPoke5eData();
    if (instance.heldItem) await returnHeldItem(trainer, instance.heldItem, data);
    if (selected) {
      const sourceId = selected.getFlag(MODULE_ID, "sourceId");
      const definition = data.itemsById.get(sourceId);
      instance.heldItem = {
        sourceId,
        name: selected.name,
        img: selected.img,
        description: (definition?.description ?? []).join("\n"),
        charges: heldItemInitialCharges(sourceId, definition)
      };
      await decrementInventoryItem(selected);
    } else delete instance.heldItem;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    await syncPokemonHeldItemToDeployment(this.pokemonItem);
    this.render({ force: true });
  }

  /**
   * Usa voluntariamente el objeto equipado mediante activateHeldItem(): cura PG,
   * estados o PP y consume cargas/bayas cuando la regla lo exige; los objetos
   * sin resolución directa solo publican su descripción. Respeta los efectos que
   * bloquean objetos y sincroniza el resultado al actor desplegado.
   */
  async #useHeldItem() {
    const held = this.#instance().heldItem;
    if (!held) return;
    const combatActor = this.pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild" ? this.pokemonItem.parent : deployedActorFor(this.pokemonItem);
    if (pokemonCombatModifiers(combatActor).disableHeldItem) return ui.notifications.warn(game.i18n.format("POKE5E.PokemonNotifications.HeldItemBlocked", { item: held.name }));
    await activateHeldItem(this.pokemonItem, { removeStatus: id => removePokemonStatus(this.pokemonItem, id) });
    await syncPokemonHeldItemToDeployment(this.pokemonItem);
    this.render({ force: true });
  }

  /**
   * Devuelve manualmente al objeto equipado sus cargas iniciales y sincroniza el
   * actor. El reinicio normal por descanso lo realiza el hook de main.mjs; este
   * control se conserva como herramienta explícita de ficha.
   */
  async #restoreHeldItem() {
    const instance = this.#instance();
    if (!instance.heldItem) return;
    const data = await loadPoke5eData();
    instance.heldItem.charges = heldItemInitialCharges(instance.heldItem.sourceId, data.itemsById.get(instance.heldItem.sourceId));
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    await syncPokemonHeldItemToDeployment(this.pokemonItem);
    this.render({ force: true });
  }

  /**
   * Cura un estado alterado delegando en removePokemonStatus()
   * (status-effects.mjs), que lo borra tanto del Item como del actor del mapa.
   */
  async #removeStatus(event) {
    if (!this.pokemonItem.isOwner) return;
    await removePokemonStatus(this.pokemonItem, event.currentTarget.dataset.statusId);
    this.render({ force: true });
  }

  /** Devuelve un movimiento a sus PP máximos. Lo contrario lo hace #rollMove(). */
  async #restorePp(event) {
    const instance = this.#instance();
    const entry = instance.moves.find(move => move.id === event.currentTarget.dataset.moveEntryId);
    if (!entry) return;
    entry.pp.value = Number(entry.pp.max) || 0;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  /** Olvida un movimiento aprendido, liberando un hueco de MAX_KNOWN_MOVES. */
  async #removeMove(event) {
    const instance = this.#instance();
    instance.moves = instance.moves.filter(move => move.id !== event.currentTarget.dataset.moveEntryId);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  /** Quita una habilidad Pokémon de la instancia. */
  async #removeAbility(event) {
    const instance = this.#instance();
    instance.abilities = instance.abilities.filter(id => id !== event.currentTarget.dataset.abilityId);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  /** Publica una habilidad asistida con su texto exacto para resolverla en mesa. */
  async #useAbility(event) {
    const data = await loadPoke5eData();
    const ability = data.abilitiesById.get(event.currentTarget.dataset.abilityId);
    if (!ability) return;
    const name = displayPokemonName(this.pokemonItem);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name }),
      content: `<div class="dnd5e chat-card poke5e-status-card"><header class="card-header"><h3>${escapeHtml(name)} — ${escapeHtml(ability.name)}</h3></header><p>${escapeHtml(ability.description ?? "")}</p><p><em>${game.i18n.localize("POKE5E.Abilities.AssistedHint")}</em></p></div>`
    });
  }

  /**
   * Aprende un movimiento desde el gestor: comprueba con moveEligibility() que
   * la especie pueda aprenderlo ya —si no, lo explica con notifyMoveUnavailable()—,
   * descarta los repetidos y delega en #addMove() la sustitución si hace falta.
   */
  async #learnMove(event) {
    event.preventDefault();
    event.stopPropagation();
    const moveId = event.currentTarget.dataset.moveId;
    const data = await loadPoke5eData();
    const move = data.movesById.get(moveId);
    if (!move) return ui.notifications.error(game.i18n.localize("POKE5E.PokemonNotifications.MoveMissing"));
    const instance = this.#instance();
    const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const eligibility = moveEligibility(species, move, Number(instance.level) || 1, { machineIds: trainerMoveMachineIds(this.pokemonItem.parent) });
    if (!eligibility.availableNow) return notifyMoveUnavailable(move, eligibility);
    if (instance.moves.some(entry => entry.moveId === move.id)) return ui.notifications.warn(game.i18n.localize("POKE5E.PokemonNotifications.MoveKnown"));
    if (!await this.#addMove(instance, move, data.movesById)) return;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    if (eligibility.usesMachine) await consumeMoveMachine(this.pokemonItem.parent, eligibility.machine);
    this.render({ force: true });
  }

  /**
   * Acepta movimientos y habilidades arrastrados desde los compendios,
   * aplicando a los movimientos las mismas comprobaciones que #learnMove().
   * Cualquier otro tipo de Item se ignora.
   */
  async #onDrop(event) {
    event.preventDefault();
    if (!this.pokemonItem.isOwner) return;
    const TextEditor = foundry.applications.ux.TextEditor;
    const dragData = (TextEditor.implementation ?? TextEditor).getDragEventData(event);
    if (!dragData.uuid) return;
    const document = await fromUuid(dragData.uuid);
    if (document?.documentName !== "Item") return;
    const kind = document.getFlag(MODULE_ID, "kind");
    const sourceId = document.getFlag(MODULE_ID, "sourceId");
    const instance = this.#instance();
    if (kind === "move") {
      if (instance.moves.some(entry => entry.moveId === sourceId)) return ui.notifications.warn(game.i18n.localize("POKE5E.PokemonNotifications.MoveKnown"));
      const move = document.getFlag(MODULE_ID, "move");
      if (!move?.id) return ui.notifications.error(game.i18n.localize("POKE5E.PokemonNotifications.InvalidMove"));
      const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
      const eligibility = moveEligibility(species, move, Number(instance.level) || 1, { machineIds: trainerMoveMachineIds(this.pokemonItem.parent) });
      if (!eligibility.availableNow) return notifyMoveUnavailable(move, eligibility);
      const data = await loadPoke5eData();
      if (!await this.#addMove(instance, move, data.movesById)) return;
      await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
      if (eligibility.usesMachine) await consumeMoveMachine(this.pokemonItem.parent, eligibility.machine);
      this.render({ force: true });
      return;
    } else if (kind === "ability") {
      if (instance.abilities.includes(sourceId)) return ui.notifications.warn(game.i18n.localize("POKE5E.PokemonNotifications.AbilityKnown"));
      instance.abilities.push(sourceId);
    } else return;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  /**
   * Inserta un movimiento en la instancia resolviendo el límite de cuatro: pide
   * con chooseMoveToForget() cuál se sustituye y aplica applyLearnedMove(). Ante
   * datos antiguos con más movimientos de los permitidos, obliga a olvidar antes
   * de seguir. Devuelve false si la operación no llegó a realizarse.
   * La comparten #learnMove() y #onDrop().
   */
  async #addMove(instance, move, movesById) {
    if (instance.moves.length > MAX_KNOWN_MOVES) {
      ui.notifications.warn(game.i18n.format("POKE5E.PokemonNotifications.LegacyMoves", { count: instance.moves.length }));
      return false;
    }
    let replacedEntryId = null;
    if (instance.moves.length === MAX_KNOWN_MOVES) {
      replacedEntryId = await chooseMoveToForget(instance.moves, move, movesById);
      if (!replacedEntryId) return false;
    }
    instance.moves = applyLearnedMove(instance.moves, moveEntry(move), replacedEntryId);
    return true;
  }

  /**
   * Ejecuta un movimiento en modo Combate. Comprueba los PP y los descuenta,
   * ofreciendo Baya Zanama al llegar a 0; calcula MOVE con getMoveModifier(),
   * competencia y modificadores del objeto equipado; según el
   * movimiento tira ataque (con desventaja si está envenenado o amedrentado),
   * anuncia una CD de salvación o solo publica su descripción; tira el daño con
   * el DamageRoll de D&D 5e —pidiendo el tipo con chooseDamageType() cuando hay
   * varios y quedándose con la menor de dos tiradas si está quemado— y termina
   * repartiendo estados y efectos mantenidos, resolviendo Campana Concha o
   * Vidaesfera y guardando el bloqueo de los objetos Elegidos. Su gemela para
   * concursos es #rollContestMove().
   */
  async #rollMove(event) {
    const data = await loadPoke5eData();
    const instance = this.#instance();
    const entry = instance.moves.find(candidate => candidate.id === event.currentTarget.dataset.moveEntryId);
    const catalogMove = data.movesById.get(entry?.moveId);
    if (!entry || !catalogMove) return;
    const combatActor = this.pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild" ? this.pokemonItem.parent : deployedActorFor(this.pokemonItem);
    const selectedTokens = [...(game.user.targets ?? [])];
    if (!validateMoveTargetRanges(combatActor, selectedTokens, catalogMove)) return;
    const incapacitated = pokemonIncapacitatingStatus(combatActor);
    // Congelado y Dormido impiden actuar de verdad, salvo Somnitalk
    // (#rollSleepTalk), que en los videojuegos existe precisamente para
    // usarse estando dormido sin despertar. Va antes de cualquier redirect a
    // un método #roll* especial para que también les llegue el bloqueo.
    if (incapacitated && !(incapacitated === "asleep" && catalogMove.id === "sleep-talk")) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.Incapacitated", { name: displayPokemonName(this.pokemonItem), status: incapacitated === "frozen" ? "Congelado" : "Dormido" }));
    }
    if (catalogMove.id === "bide") return this.#rollBide(instance, entry, catalogMove);
    if (catalogMove.id === "sleep-talk") return this.#rollSleepTalk(instance, entry, data);
    if (catalogMove.id === "metal-burst") return this.#rollMetalBurst(instance, entry, catalogMove);
    if (catalogMove.id === "counter") return this.#rollRetaliation(instance, entry, catalogMove, { dice: "1d4", damageType: "fighting", trackingKey: "counterArmed", label: "Melee" });
    if (catalogMove.id === "mirror-coat") return this.#rollRetaliation(instance, entry, catalogMove, { dice: "1d6", damageType: "psychic", trackingKey: "mirrorCoatArmed", label: "Ranged" });
    if (catalogMove.id === "explosion") return this.#rollExplosion(instance, entry, catalogMove);
    if (FIXED_MULTI_ATTACK_MOVES[catalogMove.id]) return this.#rollFixedMultiAttack(instance, entry, catalogMove, FIXED_MULTI_ATTACK_MOVES[catalogMove.id]);
    if (STOP_ON_MISS_MOVES.has(catalogMove.id)) return this.#rollFixedMultiAttack(instance, entry, catalogMove, 3, { stopOnMiss: true });
    if (catalogMove.id === "swift") return this.#rollFixedMultiAttack(instance, entry, catalogMove, swiftProjectileCount(instance.level));
    if (catalogMove.id === "acupressure") return this.#rollAcupressure(instance, entry, catalogMove);
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) <= 0) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.NoPP", { name: displayPokemonName(this.pokemonItem), move: catalogMove.name }));
    }
    const storedSpecies = this.pokemonItem.getFlag(MODULE_ID, "species");
    const effectiveTypes = heldItemEffectiveTypes({
      sourceId: instance.heldItem?.sourceId, speciesId: storedSpecies.id,
      baseTypes: storedSpecies.type ?? [], abilities: instance.abilities ?? []
    });
    const species = { ...storedSpecies, type: effectiveTypes, attributes: pokemonAttributesWithNature(storedSpecies, instance) };
    const heldMove = heldItemEffectiveMove(catalogMove, { sourceId: instance.heldItem?.sourceId, speciesId: storedSpecies.id });
    const move = { ...heldMove, time: abilityMoveActivationTime(instance.abilities, { moveId: heldMove.id, time: heldMove.time, healing: moveIsHealing(heldMove) }) };
    const temporaryUserType = abilityMoveUserTypeChange(instance.abilities, move.type);
    if (temporaryUserType) {
      species.type = [temporaryUserType];
      if (combatActor) await applyCombatAbilityTypeChange(combatActor, instance.abilities, temporaryUserType, instance.abilities.includes("protean") ? "Protean" : "Libero");
    }
    const level = Number(instance.level) || 1;
    const proficiency = 2 + Math.floor((level - 1) / 4);
    const heldProfile = heldItemMoveModifiers({
      sourceId: instance.heldItem?.sourceId, speciesId: storedSpecies.id, speciesTypes: effectiveTypes,
      move, proficiency, hasDamage: moveHasImmediateDamage(move)
    });
    const pathProfile = pokemonPathMoveBonuses(this.pokemonItem.parent, effectiveTypes, move.type, { healing: moveIsHealing(move) });
    if (!heldProfile.allowed) return ui.notifications.warn(game.i18n.format("POKE5E.PokemonNotifications.DamagingMovesOnly", { item: instance.heldItem.name }));
    if (!choiceHeldItemAllowsMove(instance.heldItem, move.id)) return ui.notifications.warn(game.i18n.format("POKE5E.PokemonNotifications.ChoiceLocked", { item: instance.heldItem.name }));
    const moveModifier = getMoveModifier(species, move) + heldProfile.moveModifierBonus;
    const attackMoveModifier = moveModifier * heldProfile.attackMoveMultiplier;
    // Gracia Sereno (lote 21): +1 a la CD de salvación de todos sus
    // movimientos, sin tocar el modificador de ataque.
    const serenegraceBonus = abilitySaveDcBonus(instance.abilities);
    const name = displayPokemonName(this.pokemonItem);
    const flavor = `${name} — ${move.name}`;
    const speaker = ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name });
    const trainer = this.pokemonItem.parent?.type === "character" ? this.pokemonItem.parent : null;
    const faintedAllies = trainer?.items?.filter(item => item !== this.pokemonItem && item.getFlag?.(MODULE_ID, "kind") === "pokemon" && Number(item.getFlag(MODULE_ID, "instance")?.hp?.value) <= 0).length ?? 0;
    const supremeOverlordBonus = abilityFaintedAllyAttackBonus(instance.abilities, faintedAllies);
    if (isMoveRecharging(combatActor, move.id)) return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.Recharging", { name, move: move.name }));
    if (pokemonCombatModifiers(combatActor).moveLockAll) return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.MoveLocked", { name, move: move.name }));
    // Constancia (lote 30): no puede repetir el mismo movimiento en rondas consecutivas.
    if (abilityBlocksRepeatingMove(instance.abilities) && instance.lastMoveId === move.id) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.TruantRepeat", { name, move: move.name }));
    }
    const singleTargetPokemonItem = selectedTokens.length === 1 ? await pokemonItemForActor(selectedTokens[0].actor) : null;
    const singleTargetInstance = singleTargetPokemonItem?.getFlag(MODULE_ID, "instance") ?? null;
    const sourceSuppressesTargetAbilities = abilitySuppressesTargetAbilities(instance.abilities);
    const effectiveTargetAbilities = sourceSuppressesTargetAbilities ? [] : (singleTargetInstance?.abilities ?? []);
    const combatModifiers = pokemonCombatModifiers(combatActor, { targetUuids: selectedTokens.map(token => token.actor?.uuid).filter(Boolean) });
    const targetedModifiers = targetedPokemonModifiers(selectedTokens);
    const consumedModifierIds = moveModifierIdsToConsume(combatActor, "move");
    const targetAsleep = move.id === "wake-up-slap" && selectedTokens.some(token => token.actor?.statuses?.has(pokemonStatusId("asleep")));
    const activeWeather = currentField(game.combat).weather?.id ?? null;
    const targetHasAnyStatus = selectedTokens.some(token => POKEMON_STATUS_IDS.some(id => token.actor?.statuses?.has(pokemonStatusId(id))));
    const targetStatusModifierMultiplier = TARGET_STATUS_MODIFIER_DOUBLE_MOVES.has(move.id) && targetHasAnyStatus ? 2 : 1;
    const ownHpFraction = combatActor?.system?.attributes?.hp?.max ? Number(combatActor.system.attributes.hp.value) / Number(combatActor.system.attributes.hp.max) : 1;
    const targetHpFraction = selectedTokens[0]?.actor?.system?.attributes?.hp?.max ? Number(selectedTokens[0].actor.system.attributes.hp.value) / Number(selectedTokens[0].actor.system.attributes.hp.max) : 1;
    const targetHpModifierMultiplier = TARGET_HP_MODIFIER_DOUBLE_MOVES.has(move.id) && targetHpFraction >= 0.5 ? 2 : 1;
    const weatherModifierMultiplier = WEATHER_MODIFIER_DOUBLE_MOVES[move.id] && WEATHER_MODIFIER_DOUBLE_MOVES[move.id] === activeWeather ? 2 : 1;
    let targetLastMoveNotAttackMultiplier = 1;
    if (TARGET_LAST_MOVE_NOT_ATTACK_MODIFIER_DOUBLE_MOVES.has(move.id) && selectedTokens.length) {
      const targetPokemonItem = await pokemonItemForActor(selectedTokens[0].actor);
      const targetLastMoveId = targetPokemonItem?.getFlag(MODULE_ID, "instance")?.lastMoveId;
      const targetLastMove = targetLastMoveId ? data.movesById.get(targetLastMoveId) : null;
      if (!targetLastMove?.damage) targetLastMoveNotAttackMultiplier = 2;
    }
    // Filo (lote 21): dobla el modificador MOVE en movimientos cuyo nombre
    // (en inglés, el único dato disponible) suene a corte.
    const sharpnessMultiplier = abilitySharpnessDoublesModifier(instance.abilities, move.name) ? 2 : 1;
    // Fuerza Bruta/Energía Pura/Simple (lote 42): recurso de una vez por
    // descanso corto (ABILITY_REST_RESOURCES, pokemon-abilities.mjs),
    // confirmado con un diálogo antes de construir la fórmula de daño, mismo
    // patrón que ya usa Golpes disciplinados para preguntar antes de actuar.
    // Fuerza Bruta/Energía Pura duplican los dados de daño; Simple duplica el
    // modificador MOVE del daño (el texto original también deja aplicarlo al
    // ataque, simplificado siempre al daño para no bifurcar el diálogo).
    let restResourceDiceMultiplier = 1;
    let restResourceModifierMultiplier = 1;
    if (moveHasImmediateDamage(move)) {
      const diceAbilityId = ["huge-power", "pure-power"].find(id => instance.abilities?.includes(id) && abilityRestUseAvailable(instance, id));
      const modifierAbilityId = !diceAbilityId && instance.abilities?.includes("simple") && abilityRestUseAvailable(instance, "simple") ? "simple" : null;
      const restAbilityId = diceAbilityId ?? modifierAbilityId;
      if (restAbilityId) {
        const label = ABILITY_REST_RESOURCES[restAbilityId].name;
        const use = await confirmHeldItemReaction(label, `<p>¿Usar <strong>${label}</strong> para duplicar ${diceAbilityId ? "los dados de daño" : "el modificador MOVE del daño"} de este golpe? (una vez por descanso corto)</p>`);
        if (use) {
          if (diceAbilityId) restResourceDiceMultiplier = 2; else restResourceModifierMultiplier = 2;
          instance.abilityUses = markAbilityRestUseSpent(instance, restAbilityId).abilityUses;
        }
      }
    }
    const sheerForce = abilitySheerForceProfile(instance.abilities, {
      damaging: Boolean(move.damage?.dice) && moveHasImmediateDamage(move),
      hasSecondaryEffect: inferMoveStatusEffects(move).length > 0 || MOVE_MODIFIER_EFFECTS[move.id]?.category === "debuffs"
    });
    const triggeredMoveMultiplier = abilityTriggeredMoveModifierMultiplier(instance.abilities, instance.abilityTriggers, move.type);
    const damageMoveModifier = moveModifier * (targetAsleep ? 2 : 1) * weatherModifierMultiplier * targetStatusModifierMultiplier * targetHpModifierMultiplier * targetLastMoveNotAttackMultiplier * heldProfile.damageMoveMultiplier * combatModifiers.moveModifierMultiplier * sharpnessMultiplier * restResourceModifierMultiplier * sheerForce.moveModifierMultiplier * triggeredMoveMultiplier;
    const escalation = CONSECUTIVE_ESCALATION_MOVES[move.id];
    const escalationMultiplier = escalation ? diceMultiplierForStacks(consecutiveStrikeStacks(combatActor, move.id)) : 1;
    const weatherDiceMultiplier = (WEATHER_DICE_DOUBLE_MOVES[move.id] && WEATHER_DICE_DOUBLE_MOVES[move.id] === activeWeather) || (move.id === "weather-ball" && activeWeather) ? 2 : 1;
    const targetStatusDiceMultiplier = TARGET_STATUS_DICE_DOUBLE_MOVES[move.id]?.some(id => selectedTokens.some(token => token.actor?.statuses?.has(pokemonStatusId(id)))) ? 2 : 1;
    const selfHpDiceMultiplier = SELF_HP_DICE_MULTIPLIER_MOVES.has(move.id) ? (ownHpFraction <= 0.1 ? 3 : ownHpFraction < 0.5 ? 2 : 1) : SELF_HP_HALF_DICE_MOVES.has(move.id) && ownHpFraction < 0.5 ? 0.5 : 1;
    const ownDamagedDiceMultiplier = OWN_DAMAGED_DICE_DOUBLE_MOVES.has(move.id) && instance.damagedSinceLastTurn ? 2 : 1;
    const ownMissedDiceMultiplier = OWN_MISSED_DICE_DOUBLE_MOVES.has(move.id) && instance.lastAttackMissed ? 2 : 1;
    const ownMissedExtraDie = OWN_MISSED_EXTRA_DIE_MOVES.has(move.id) && Boolean(instance.lastAttackMissed);
    let targetDamagedThisRoundMultiplier = 1;
    if (TARGET_DAMAGED_THIS_ROUND_DICE_DOUBLE_MOVES.has(move.id) && selectedTokens.length) {
      const targetPokemonItem = await pokemonItemForActor(selectedTokens[0].actor);
      if (targetPokemonItem?.getFlag(MODULE_ID, "instance")?.damagedThisRound) targetDamagedThisRoundMultiplier = 2;
    }
    const forceStab = (trainer ? typeMasteryForcesStab(trainer, species.type) : false) || abilityForcesMoveStab(instance.abilities, move.attack?.scope === "melee");
    // Blaze/Overgrow/Swarm/Torrent: duplican el bono de STAB al 25% o menos
    // de PG máximos. abilityLowHpStabBonus() ya solo devuelve algo cuando
    // corresponde, así que se suma al mismo hueco que el STAB de un objeto
    // equipado sin condición adicional aquí.
    const lowHpStabBonus = abilityLowHpStabBonus(instance.abilities, ownHpFraction);
    // Ojo Compuesto/Alas Danza/Metaltrabajador/Rivalidad/Suertudo: mismo
    // hueco que heldProfile/pathProfile para ataque, daño y rango de
    // crítico, sin más estado que el tipo del movimiento y el de los
    // objetivos ya seleccionados.
    const targetTypes = selectedTokens.flatMap(token => token.actor?.getFlag?.(MODULE_ID, "pokemonTypes") ?? []);
    const abilityProfile = abilityMoveProfile(instance.abilities, {
      moveType: move.type, hasDamage: moveHasImmediateDamage(move), proficiency, sourceTypes: species.type ?? [], targetTypes
    });
    const abilityDamageBonus = abilityMoveDamageBonus(instance.abilities, { moveName: move.name, proficiency });
    const abilityStabBonus = abilityMoveStabBonus(instance.abilities, {
      moveId: move.id, moveName: move.name, moveType: move.type,
      speciesTypes: species.type ?? [], isMelee: move.attack?.scope === "melee"
    });
    // Batería/Punto de Poder/Espíritu Metálico/Costar/Regalo Flor/Estrella
    // Victoria (lote 38): bonos de proximidad entre tokens del lienzo
    // (aura-abilities.mjs). Cada habilidad exige un alcance distinto, así que
    // se consulta el lienzo una vez por alcance; Estrella Victoria no tiene
    // límite de distancia en su texto, se aproxima a "todo el bando en la
    // escena" con un alcance muy amplio.
    const nearbyAllies20 = nearbyAllyActors(combatActor, 20);
    const nearbyAllies15 = nearbyAllyActors(combatActor, 15);
    const nearbyAllies30 = nearbyAllyActors(combatActor, 30);
    const nearbyAllies5 = nearbyAllyActors(combatActor, 5);
    const nearbyAlliesUnlimited = nearbyAllyActors(combatActor, 9999);
    const nearbyActors100 = nearbyPokemonActors(combatActor, 100);
    const nearbyActors30 = nearbyPokemonActors(combatActor, 30);
    const abilityWeather = weatherAbilitiesSuppressed(instance.abilities, nearbyActors100) ? null : activeWeather;
    const batteryMultiplier = batteryDiceMultiplier(nearbyAllies20, move.type);
    const powerSpotDie = powerSpotExtraDie(nearbyAllies15, level);
    const steelySpiritBonus = steelySpiritDamageBonus({
      selfAbilities: instance.abilities, selfChaMod: Number(combatActor?.system?.abilities?.cha?.mod) || 0,
      nearbyAllies: nearbyAllies30, moveType: move.type
    });
    const costarAttackAdvantage = costarAdvantage(instance.abilities, nearbyAllies5);
    const flowerGiftBonus = flowerGiftDamageBonus(nearbyAllies30, abilityWeather, proficiency);
    const victoryStarBonus = victoryStarAttackBonus(nearbyAlliesUnlimited);
    // Más/Menos (lote 41): mismo alcance amplio que Estrella Victoria; se
    // suma tanto al ataque como al daño (ver damageMoveModifier más abajo).
    const plusMinusBonus = plusMinusAttackDamageBonus(instance.abilities, nearbyAlliesUnlimited);
    const auraDiceMultiplier = typeAuraDiceMultiplier({ selfAbilities: instance.abilities, nearbyActors: nearbyActors100, moveType: move.type });
    const supersweetDie = moveIsHealing(move) ? null : supersweetSyrupExtraDie(instance.abilities, nearbyActors30);
    const finalGambitFormula = move.id === "final-gambit" ? appendModifier(String(Math.max(0, Number(combatActor?.system?.attributes?.hp?.value) || 0)), (species.type ?? []).includes(move.type) || forceStab ? 2 + heldProfile.stab + lowHpStabBonus : 0) : null;
    const trumpCardBonus = move.id === "trump-card" ? moveModifier * Math.max(0, Number(entry.pp.max) - Number(entry.pp.value)) : 0;
    let magnitudeFormula = null;
    if (move.id === "magnitude") {
      const magnitudeRoll = await new Roll("1d100").evaluate();
      await magnitudeRoll.toMessage({ speaker, flavor: `${flavor} — Magnitud` });
      magnitudeFormula = appendModifier(magnitudeDice(magnitudeRoll.total), damageMoveModifier);
    }
    // Poder Solar (+2 daño con sol) y Fuerza de Arena (STAB×2 con tormenta de
    // arena): mismos huecos que el bono por estado propio y el STAB por poca
    // vida, condicionados al clima activo en vez de al estado o la vida.
    const weatherDamageBonus = abilityWeatherDamageBonus(instance.abilities, abilityWeather);
    const weatherStabBonus = abilityWeatherStabBonus(instance.abilities, abilityWeather);
    // Alocado (lote 40): dobla el STAB con movimientos que tienen retroceso.
    const recklessStabBonus = abilityDoublesRecoilStab(instance.abilities) && RECOIL_FRACTION_MOVES[move.id] ? 2 : 0;
    // Descontrol (lote 24): dobla los dados de daño al 25% o menos de PG máximos.
    const berserkDiceMultiplier = abilityLowHpDamageDiceMultiplier(instance.abilities, ownHpFraction);
    // Antibalas (lote 26)/Escamas de Hielo (lote 31)/Despiadado (lote 33):
    // solo se resuelven con un único objetivo seleccionado, misma limitación
    // que Armadura Bélica (lote 11); se consulta una sola vez el Item del
    // objetivo para las tres.
    let targetBulletproofImmune = false;
    let targetAbilityBlock = null;
    let iceScalesDiceMultiplier = 1;
    let mercilessDiceMultiplier = 1;
    let targetAbilityDiceMultiplier = 1;
    let vulnerableDamageTwiceLower = false;
    let ignoreTargetDamageImmunity = false;
    if (selectedTokens.length === 1) {
      const targetTypesSingle = selectedTokens[0].actor?.getFlag?.(MODULE_ID, "pokemonTypes") ?? [];
      const targetDefenses = pokemonDefenses(targetTypesSingle);
      const vulnerable = targetDefenses.vulnerabilities.includes(move.type);
      const resistant = targetDefenses.resistances.includes(move.type);
      targetBulletproofImmune = !sourceSuppressesTargetAbilities && abilityBlocksBulletproofMove(effectiveTargetAbilities, move.name);
      targetAbilityBlock = sourceSuppressesTargetAbilities ? null : abilityBlocksIncomingMove(effectiveTargetAbilities, { moveId: move.id, moveName: move.name });
      iceScalesDiceMultiplier = abilityIceScalesDiceMultiplier(effectiveTargetAbilities, move.power);
      mercilessDiceMultiplier = abilityDoublesDiceAgainstPoisoned(instance.abilities, singleTargetInstance?.conditions) ? 2 : 1;
      targetAbilityDiceMultiplier = abilityTargetDamageDiceMultiplier(instance.abilities, effectiveTargetAbilities, {
        moveId: move.id, moveName: move.name, moveType: move.type,
        isMelee: move.attack?.scope === "melee", targetResists: resistant
      });
      vulnerableDamageTwiceLower = abilityRollsVulnerableDamageTwiceLower(effectiveTargetAbilities, vulnerable);
      const filterRule = abilityVulnerabilityFilter(effectiveTargetAbilities, vulnerable);
      if (filterRule) {
        const filterRoll = await new Roll(`1d${filterRule.die}`).evaluate();
        await filterRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: selectedTokens[0].actor }), flavor: `${selectedTokens[0].name} — Filtro` });
        if (Number(filterRoll.total) === filterRule.on) targetAbilityDiceMultiplier *= filterRule.multiplier;
      }
      ignoreTargetDamageImmunity = abilityIgnoresNormalFightingImmunity(instance.abilities, move.type)
        || abilityIgnoresAbilityDamageImmunity(instance.abilities, singleTargetInstance?.abilities, move.type);
    }
    const baseFormula = targetBulletproofImmune || targetAbilityBlock ? null : finalGambitFormula ?? magnitudeFormula ?? (moveHasImmediateDamage(move) ? damageFormula(move, level, damageMoveModifier, species, combatModifiers.damage + heldProfile.damage + pathProfile.damage + trumpCardBonus + abilityProfile.damage + abilityDamageBonus + abilitySelfStatusDamageBonus(instance.abilities, instance.conditions ?? [], proficiency) + weatherDamageBonus + steelySpiritBonus + flowerGiftBonus + plusMinusBonus, heldProfile.stab + pathProfile.stab + abilityStabBonus + lowHpStabBonus + weatherStabBonus + recklessStabBonus, escalationMultiplier * weatherDiceMultiplier * targetStatusDiceMultiplier * selfHpDiceMultiplier * ownDamagedDiceMultiplier * ownMissedDiceMultiplier * targetDamagedThisRoundMultiplier * berserkDiceMultiplier * iceScalesDiceMultiplier * mercilessDiceMultiplier * batteryMultiplier * auraDiceMultiplier * targetAbilityDiceMultiplier * restResourceDiceMultiplier, ownMissedExtraDie, forceStab) : null);
    // Punto de Poder (lote 38): dado extra fijo (no escala con el resto de
    // multiplicadores), se añade tras construir la fórmula normal.
    const extraAuraDice = [powerSpotDie, supersweetDie].filter(Boolean);
    const formula = baseFormula && extraAuraDice.length ? `${baseFormula} + ${extraAuraDice.join(" + ")}` : baseFormula;
    if (targetBulletproofImmune) {
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(selectedTokens[0].name)}</strong> es inmune a ${escapeHtml(move.name)} gracias a Antibalas.</p></div>` });
    }
    if (targetAbilityBlock) {
      const labels = { soundproof: "Insonorizar", damp: "Humedad", overcoat: "Funda" };
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(selectedTokens[0].name)}</strong> es inmune a ${escapeHtml(move.name)} gracias a ${labels[targetAbilityBlock] ?? targetAbilityBlock}.</p></div>` });
    }
    let hiddenPowerRoll = null;
    if (formula && move.id === "hidden-power") {
      hiddenPowerRoll = await new Roll("1d20").evaluate();
      await hiddenPowerRoll.toMessage({ speaker, flavor: `${flavor} — Tipo` });
    }
    let damageType = formula ? (hiddenPowerRoll ? hiddenPowerType(hiddenPowerRoll.total) ?? await chooseDamageType(move) : await chooseDamageType(move)) : null;
    if (formula && !damageType) return;
    if (damageType === "normal" && move.type === "normal" && currentField(game.combat).pulse?.id === "ion-deluge") damageType = "electric";
    // Galvanismo/Pixelado/Refrigerar/Normalizar (lote 19): cambian el tipo de
    // daño final, no el STAB (que sigue mirando el tipo original del
    // movimiento, la misma simplificación que ya usaba Diluvio Iónico arriba).
    const abilityMoveType = abilityMoveTypeOverride(instance.abilities, damageType, { moveId: move.id, moveName: move.name });
    if (abilityMoveType) damageType = abilityMoveType;
    if (ignoreTargetDamageImmunity && damageType === move.type) damageType = "typeless";
    if (move.id === "weather-ball" && activeWeather && WEATHER_BALL_TYPES[activeWeather]) damageType = WEATHER_BALL_TYPES[activeWeather];
    if (move.id === "final-gambit") damageType = "fighting";

    // La afinidad de dnd5e sigue guardada en el actor, pero la tirada Pokémon
    // detiene también el movimiento para que la inmunidad no dependa del botón
    // usado para aplicar el daño. Las habilidades absorbentes continúan porque
    // necesitan el total bruto de la tirada para calcular su curación.
    const targetDamageImmunity = selectedTokens.length === 1 && !ignoreTargetDamageImmunity
      ? abilityDamageImmunity(effectiveTargetAbilities, damageType)
      : null;
    const targetAbsorbsDamage = targetDamageImmunity && absorbHealType(effectiveTargetAbilities) === damageType;

    instance.lastMoveId = move.id;
    const ppCost = abilityMovePpCost(effectiveTargetAbilities, selectedTokens.length === 1);
    if (Number(entry.pp.max) > 0) entry.pp.value = Math.max(0, Number(entry.pp.value) - ppCost);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) === 0) await tryLeppaBerryReaction(this.pokemonItem, entry.id);
    if (targetAbilityBlock) {
      this.render({ force: true });
      return;
    }
    if (targetDamageImmunity && !targetAbsorbsDamage) {
      const abilityName = data.abilitiesById.get(targetDamageImmunity)?.name ?? targetDamageImmunity;
      await ChatMessage.create({
        speaker,
        content: `<div class="dnd5e chat-card poke5e-status-card"><p>${game.i18n.format("POKE5E.Abilities.DamageImmunity", {
          actor: `<strong>${escapeHtml(selectedTokens[0].name)}</strong>`,
          move: escapeHtml(move.name),
          ability: escapeHtml(abilityName)
        })}</p></div>`
      });
      this.render({ force: true });
      return;
    }

    let attackResult = null;
    if (move.attack?.scope) {
      // Vigor (guts) anula la desventaja por Envenenado/Gravemente
      // envenenado, pero no la de Amedrentado, que sigue aplicando igual;
      // Cura Tóxica (poison-heal, lote 32) hace lo mismo solo para Veneno.
      const ignoresPoisonPenalty = abilityIgnoresStatusPenalty(instance.abilities) || abilityHealsFromPoisonTick(instance.abilities);
      const statusDisadvantageIds = ignoresPoisonPenalty
        ? ["flinched"]
        : ["poisoned", "badly-poisoned", "flinched"];
      const statusDisadvantage = statusDisadvantageIds.some(id => (instance.conditions ?? []).includes(id) || combatActor?.statuses?.has(pokemonStatusId(id)));
      const powerAbilities = Array.isArray(move.power) ? move.power : [move.power].filter(Boolean);
      const abilityAdvantage = combatModifiers.attackAdvantageAbilities.some(key => powerAbilities.includes(key));
      const meleeAdvantage = combatModifiers.meleeAttackAdvantage && move.attack.scope === "melee";
      const terrainAdvantage = move.id === "psyblade" && currentField(game.combat).terrain?.id === "electric-terrain";
      const weatherAdvantage = move.id === "hydro-steam" && activeWeather === "sun";
      const darkAdvantage = trainer ? Boolean(await promptSpendTrainerResource(trainer, "grunt", { cost: 3, title: "Ventaja oscura (Recluta 5)", prompt: "¿Gastar 3 Puntos de Sombra para tener ventaja en este ataque?" })) : false;
      const assistAdvantage = trainer ? rangerAssistAdvantage(trainer, move.type) : false;
      // Sin Reparos/Escudo Intrépido (lotes 35/36): el objetivo también puede
      // dar ventaja o desventaja a quien le ataca por su propia habilidad,
      // solo con un único objetivo seleccionado.
      let targetAttackRollModifier = { advantage: false, disadvantage: false };
      if (selectedTokens.length === 1) {
        const targetPokemonItem = await pokemonItemForActor(selectedTokens[0].actor);
        const targetInstance = targetPokemonItem?.getFlag(MODULE_ID, "instance");
        targetAttackRollModifier = abilityTargetAttackRollModifier(targetInstance?.abilities, move.attack.scope === "melee", targetInstance?.conditions);
      }
      const advantage = combatModifiers.attackAdvantage || abilityAdvantage || meleeAdvantage || targetedModifiers.incomingAttackAdvantage || terrainAdvantage || weatherAdvantage || darkAdvantage || assistAdvantage || targetAttackRollModifier.advantage || costarAttackAdvantage;
      const disadvantage = statusDisadvantage || combatModifiers.attackDisadvantage || targetAttackRollModifier.disadvantage;
      const die = advantage === disadvantage ? "1d20" : advantage ? "2d20kh" : "2d20kl";
      const effectDice = combatModifiers.attackDice.map(formula => ` + ${formula}`).join("");
      const effectProficiency = combatModifiers.suppressAttackProficiency ? 0 : proficiency;
      const targetsAreWild = Boolean(selectedTokens.length) && selectedTokens.every(token => token.actor?.getFlag?.(MODULE_ID, "kind") === "wild");
      const companionBonus = trainer ? rangerCompanionAttackBonus(trainer, this.pokemonItem, targetsAreWild) : 0;
      const attack = await new Roll(`${die} + @mod + @prof + @effect${effectDice}`, { mod: attackMoveModifier, prof: effectProficiency, effect: combatModifiers.attack + heldProfile.attack + pathProfile.attack + companionBonus + abilityProfile.attack + victoryStarBonus + plusMinusBonus + supremeOverlordBonus }).evaluate();
      await attack.toMessage({ speaker, flavor: `${flavor} (${attackScopeLabel(move.attack.scope)})` });
      const rolledNatural = Number(attack.dice?.[0]?.results?.find(result => result.active)?.result ?? attack.dice?.[0]?.total) || 0;
      const guaranteed = combatModifiers.guaranteedHit || combatModifiers.guaranteedCritical;
      const natural = guaranteed ? 20 : rolledNatural;
      attackResult = {
        natural,
        total: guaranteed ? Number.MAX_SAFE_INTEGER : Number(attack.total) || 0,
        critical: combatModifiers.guaranteedCritical || natural >= Math.max(1, 20 - heldProfile.criticalRange - combatModifiers.criticalRangeBonus - abilityProfile.criticalRange)
      };
      // Alza tus defensas (Tactician 9): solo con un único objetivo, porque el
      // truco de restar del total del ataque para simular "sube su CA lo
      // justo" afectaría por igual a todos los objetivos de un movimiento de
      // área, favoreciendo a quien no pagó nada. No se ofrece en golpes
      // garantizados (combatModifiers.guaranteedHit): esos no comparan con la
      // CA en absoluto.
      if (!combatModifiers.guaranteedHit && selectedTokens.length === 1) {
        const targetToken = selectedTokens[0];
        const targetAc = Number(targetToken.actor.system.attributes?.ac?.value ?? targetToken.actor.system.attributes?.ac?.flat);
        if (Number.isFinite(targetAc) && attackResult.total >= targetAc) {
          const needed = attackResult.total - targetAc + 1;
          if (needed <= 5) {
            const targetPokemonItem = await pokemonItemForActor(targetToken.actor);
            const targetTrainer = targetPokemonItem?.parent?.type === "character" ? targetPokemonItem.parent : null;
            const spent = targetTrainer && hasTrainerPath(targetTrainer, "tactician", 9)
              ? await promptSpendTrainerResource(targetTrainer, "tactician", { cost: needed, title: "Alza tus defensas (Estratega 9)", prompt: `¿Gastar ${needed} Puntos Tácticos para que ${escapeHtml(targetToken.name)} evite este golpe?` })
              : null;
            if (spent) {
              attackResult.total = targetAc - 1;
              await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>Alza tus defensas</strong>: ${escapeHtml(targetToken.name)} sube su CA lo justo y el golpe falla.</p></div>` });
            }
          }
        }
      }
      if (selectedTokens.length) {
        const missed = !selectedTokens.some(token => attackHitsPokemonTarget(attackResult, token.actor));
        if (instance.lastAttackMissed !== missed) {
          instance.lastAttackMissed = missed;
          await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
        }
        // Analítico (lote 29): ventaja en el próximo ataque tras fallar.
        if (missed && abilityGrantsAnalyticAdvantage(instance.abilities)) {
          await applyDynamicModifier(combatActor, "analytic", { modifiers: { attackAdvantage: true }, durationRounds: 1, sourceName: name, description: "Ventaja en el próximo ataque tras fallar (Analítico)." });
        }
      }
    } else if (move.save) {
      const dc = 8 + attackMoveModifier + proficiency + serenegraceBonus;
      const attributes = (move.save.attribute ?? []).map(key => key.toUpperCase()).join("/");
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card"><header class="card-header"><h3>${escapeHtml(flavor)}</h3></header><p><strong>Salvación ${escapeHtml(attributes)} CD ${dc}</strong></p>${moveDescription(move)}</div>` });
      if (HP_EFFECT_MOVES.has(move.id)) {
        if (!selectedTokens.length) ui.notifications.warn(game.i18n.format("POKE5E.StatusEffects.NoTarget", { move: move.name }));
        else await requestHpEffect({ moveId: move.id, selectedTokens, saveDc: dc, sourceCombatActor: combatActor, sourceName: name, speaker });
      }
      if (ITEM_SWAP_SAVE_MOVES.has(move.id)) {
        if (!selectedTokens.length) ui.notifications.warn(game.i18n.format("POKE5E.StatusEffects.NoTarget", { move: move.name }));
        else {
          const failed = await rollFailedSaves(selectedTokens, "dex", dc, speaker, move.name);
          for (const target of failed) await requestHeldItemSwap({ sourcePokemonItem: this.pokemonItem, targetActor: target.actor, sourceName: name, targetName: target.tokenName });
        }
      }
      if (move.id === "disable") {
        if (!selectedTokens.length) ui.notifications.warn(game.i18n.format("POKE5E.StatusEffects.NoTarget", { move: move.name }));
        else {
          const failed = await rollFailedSaves(selectedTokens, "wis", dc, speaker, move.name);
          for (const target of failed) {
            const targetPokemonItem = await pokemonItemForActor(target.actor);
            const lastMoveId = targetPokemonItem?.getFlag(MODULE_ID, "instance")?.lastMoveId;
            const lastMove = lastMoveId ? data.movesById.get(lastMoveId) : null;
            if (!lastMove) continue;
            await applyMoveLock(target.actor, lastMoveId, { durationRounds: null, concentration: true, sourceName: name, description: `${lastMove.name} no puede usarse mientras ${escapeHtml(name)} mantenga la concentración en Anular.` });
          }
        }
      }
      if (move.id === "spite") {
        if (!selectedTokens.length) ui.notifications.warn(game.i18n.format("POKE5E.StatusEffects.NoTarget", { move: move.name }));
        else {
          const failed = await rollFailedSaves(selectedTokens, "wis", dc, speaker, move.name);
          for (const target of failed) {
            const targetPokemonItem = await pokemonItemForActor(target.actor);
            const targetInstance = targetPokemonItem?.getFlag(MODULE_ID, "instance");
            const lastEntry = targetInstance?.moves?.find(candidate => candidate.moveId === targetInstance.lastMoveId);
            if (!targetPokemonItem || !lastEntry || Number(lastEntry.pp?.max) <= 0) continue;
            const drop = await new Roll("1d4").evaluate();
            await drop.toMessage({ speaker: ChatMessage.getSpeaker({ actor: target.actor, alias: target.tokenName }), flavor: `${target.tokenName} — PP perdidos por Rencor` });
            const nextInstance = foundry.utils.deepClone(targetInstance);
            const nextEntry = nextInstance.moves.find(candidate => candidate.id === lastEntry.id);
            nextEntry.pp.value = Math.max(0, Number(lastEntry.pp.value) - Number(drop.total));
            await targetPokemonItem.setFlag(MODULE_ID, "instance", nextInstance);
          }
        }
      }
      if (move.id === "make-it-rain") {
        if (!selectedTokens.length) ui.notifications.warn(game.i18n.format("POKE5E.StatusEffects.NoTarget", { move: move.name }));
        else {
          const failed = await rollFailedSaves(selectedTokens, "dex", dc, speaker, move.name);
          const failedUuids = new Set(failed.map(target => target.actorUuid));
          const succeededCount = selectedTokens.filter(token => !failedUuids.has(token.actor?.uuid)).length;
          const trainer = this.pokemonItem.parent?.type === "character" ? this.pokemonItem.parent : null;
          if (trainer && (failed.length || succeededCount)) {
            const formula = [failed.length ? `${failed.length}d10` : null, succeededCount ? `${succeededCount * 2}d10` : null].filter(Boolean).join(" + ");
            const earnings = await new Roll(formula).evaluate();
            await earnings.toMessage({ speaker, flavor: `${flavor} — ₽ recogidos` });
            await updatePokedollars(trainer, pokedollars(trainer) + (Number(earnings.total) || 0));
          }
        }
      }
      if (move.id === "pain-split") {
        if (!selectedTokens.length) ui.notifications.warn(game.i18n.format("POKE5E.StatusEffects.NoTarget", { move: move.name }));
        else {
          const failed = await rollFailedSaves(selectedTokens, "con", dc, speaker, move.name);
          for (const target of failed) {
            const targetHp = target.actor.system.attributes?.hp;
            const sourceHp = combatActor?.system.attributes?.hp;
            if (!targetHp || !sourceHp) continue;
            const average = Math.floor((Number(targetHp.value) + Number(sourceHp.value)) / 2);
            await target.actor.update({ "system.attributes.hp.value": Math.min(Number(targetHp.max) || average, average) });
            await combatActor.update({ "system.attributes.hp.value": Math.min(Number(sourceHp.max) || average, average) });
            await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p>${escapeHtml(flavor)} iguala sus PG con ${escapeHtml(target.tokenName)} a ${average}.</p></div>` });
          }
        }
      }
    } else {
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card"><header class="card-header"><h3>${escapeHtml(flavor)}</h3></header>${moveDescription(move)}</div>` });
    }
    let dealtDamageTotal = null;
    // Armadura Bélica/Armadura Concha/Roca Sólida (lote 11): sin extra de
    // crítico. Solo se resuelve con un único objetivo seleccionado —igual
    // que Alza tus defensas más abajo— porque el daño se tira una sola vez
    // para todos los alcanzados y no hay forma de tratar distinto a dos
    // objetivos con habilidades distintas en la misma tirada.
    let targetIgnoresCritical = false;
    if (attackResult?.critical && selectedTokens.length === 1) {
      const targetPokemonItem = await pokemonItemForActor(selectedTokens[0].actor);
      targetIgnoresCritical = abilityIgnoresCriticalDamage(targetPokemonItem?.getFlag(MODULE_ID, "instance")?.abilities);
    }
    // Adaptabilidad/Fauces de Dragón/Carga Rocosa/Transistor/Técnico (lote
    // 13): tiran el daño dos veces y se quedan con el resultado MAYOR, lo
    // contrario de Quemado (menor). Si el Pokémon está quemado, Quemado tiene
    // prioridad y esta ronda no se activa —dos tiradas ya cubren "el mismo
    // dado dos veces", combinarlas exigiría una tercera tirada y decidir cuál
    // de las dos reglas gana el desempate, algo que el texto original no
    // contempla—.
    const notBurned = !((instance.conditions ?? []).includes("burned"));
    // Fuerza Neuronal (lote 40): mismo mecanismo, pero condicionado a que el
    // golpe sea supereficaz contra el único objetivo seleccionado.
    let neuroforceTrigger = false;
    if (notBurned && selectedTokens.length === 1 && damageType) {
      const targetTypesSingle = selectedTokens[0].actor?.getFlag?.(MODULE_ID, "pokemonTypes") ?? [];
      const isSuperEffective = pokemonDefenses(targetTypesSingle).vulnerabilities.includes(damageType);
      neuroforceTrigger = abilityRollsSuperEffectiveTwice(instance.abilities, isSuperEffective ? 2 : 1);
    }
    const rollsTwiceHigher = (notBurned && abilityRollsDamageTwiceHigher(instance.abilities, { moveType: move.type, speciesTypes: species.type ?? [], movePp: move.pp, moveId: move.id, moveName: move.name })) || neuroforceTrigger;
    if (formula) {
      const DamageRoll = CONFIG.Dice?.DamageRoll;
      if (DamageRoll) {
        // Vigor (guts) ignora la tirada doble-quedarse-con-la-menor de Quemado.
        const burned = damageType !== "healing" && (instance.conditions ?? []).includes("burned") && !abilityIgnoresStatusPenalty(instance.abilities);
        const rollsTwiceLower = burned || vulnerableDamageTwiceLower;
        const criticalProfile = abilityCriticalDamageProfile(instance.abilities, formula, Boolean(attackResult?.critical) && !targetIgnoresCritical, true);
        const damageOptions = damageRollOptions(damageType, criticalProfile.systemCritical);
        const damageRolls = [await new DamageRoll(criticalProfile.formula, {}, damageOptions).evaluate()];
        if (rollsTwiceLower || rollsTwiceHigher) damageRolls.push(await new DamageRoll(criticalProfile.formula, {}, damageOptions).evaluate());
        const damage = damageRolls.reduce((chosen, candidate) => {
          if (rollsTwiceLower) return Number(candidate.total) < Number(chosen.total) ? candidate : chosen;
          if (rollsTwiceHigher) return Number(candidate.total) > Number(chosen.total) ? candidate : chosen;
          return chosen;
        });
        dealtDamageTotal = Number(damage.total) || 0;
        const rollType = damageType === "healing" ? "healing" : "damage";
        await postDamageRoll(damage, {
          speaker,
          flavor: `${flavor} — ${typeLabel(damageType)}${burned ? ` · Quemado: menor de ${damageRolls.map(roll => roll.total).join("/")}` : ""}${vulnerableDamageTwiceLower ? ` · Armadura Prisma: menor de ${damageRolls.map(roll => roll.total).join("/")}` : ""}${rollsTwiceHigher ? ` · Mayor de ${damageRolls.map(roll => roll.total).join("/")}` : ""}${targetIgnoresCritical ? " · Sin extra de crítico" : ""}`,
          rollType
        });
      } else {
        // Vigor (guts) ignora la tirada doble-quedarse-con-la-menor de Quemado.
        const burned = damageType !== "healing" && (instance.conditions ?? []).includes("burned") && !abilityIgnoresStatusPenalty(instance.abilities);
        const rollsTwiceLower = burned || vulnerableDamageTwiceLower;
        const criticalProfile = abilityCriticalDamageProfile(instance.abilities, formula, Boolean(attackResult?.critical) && !targetIgnoresCritical, false);
        const damageRolls = [await new Roll(criticalProfile.formula).evaluate()];
        if (rollsTwiceLower || rollsTwiceHigher) damageRolls.push(await new Roll(criticalProfile.formula).evaluate());
        const damage = damageRolls.reduce((chosen, candidate) => {
          if (rollsTwiceLower) return Number(candidate.total) < Number(chosen.total) ? candidate : chosen;
          if (rollsTwiceHigher) return Number(candidate.total) > Number(chosen.total) ? candidate : chosen;
          return chosen;
        });
        dealtDamageTotal = Number(damage.total) || 0;
        const rollType = damageType === "healing" ? "healing" : "damage";
        await postDamageRoll(damage, {
          speaker,
          flavor: `${flavor} — ${typeLabel(damageType)}${burned ? ` · Quemado: menor de ${damageRolls.map(roll => roll.total).join("/")}` : ""}${vulnerableDamageTwiceLower ? ` · Armadura Prisma: menor de ${damageRolls.map(roll => roll.total).join("/")}` : ""}${rollsTwiceHigher ? ` · Mayor de ${damageRolls.map(roll => roll.total).join("/")}` : ""}`,
          rollType
        });
      }
    }
    if (dealtDamageTotal != null) dealtDamageTotal = await this.#offerTrainerRollBoosts({ damageType, dealtDamageTotal, formula, speaker, flavor });
    if (formula && triggeredMoveMultiplier > 1) {
      delete instance.abilityTriggers?.electromorphosis;
      await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    }
    if (damageType === "fire" && dealtDamageTotal != null) {
      // El daño de Fuego descongela de verdad a quien lo recibe (Congelado
      // ya no depende de que la mesa se acuerde de quitarlo), sea el
      // objetivo de un ataque o de un movimiento con salvación.
      const scorchedTargets = attackResult ? selectedTokens.filter(token => attackHitsPokemonTarget(attackResult, token.actor)) : selectedTokens;
      for (const token of scorchedTargets) {
        if (pokemonIncapacitatingStatus(token.actor) !== "frozen") continue;
        const targetPokemonItem = await pokemonItemForActor(token.actor);
        if (targetPokemonItem) await removePokemonStatus(targetPokemonItem, "frozen");
      }
    }
    if (dealtDamageTotal != null && damageType) {
      // Absorbe Agua/Absorbe Electricidad/Come Tierra (lote 10): además de la
      // inmunidad de tipo ya aplicada al desplegar, absorben la mitad del
      // daño en bruto tirado (antes de que esa inmunidad lo reduzca a cero al
      // aplicarlo) como curación. Mismo criterio "objetivo alcanzado o todos
      // los seleccionados si no hay tirada de ataque" que el descongelado por
      // Fuego de arriba.
      const absorbingTargets = attackResult ? selectedTokens.filter(token => attackHitsPokemonTarget(attackResult, token.actor)) : selectedTokens;
      for (const token of absorbingTargets) {
        const targetPokemonItem = await pokemonItemForActor(token.actor);
        const targetAbilities = targetPokemonItem?.getFlag(MODULE_ID, "instance")?.abilities;
        if (absorbHealType(targetAbilities) !== damageType) continue;
        const healed = recoilAmount(dealtDamageTotal, 0.5);
        const hp = token.actor.system.attributes?.hp;
        if (healed <= 0 || !hp) continue;
        const newValue = Math.min(Number(hp.max), Number(hp.value) + healed);
        if (newValue <= Number(hp.value)) continue;
        await token.actor.update({ "system.attributes.hp.value": newValue });
        await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(token.name)}</strong> absorbe el golpe y recupera <strong>${newValue - Number(hp.value)} PG</strong>.</p></div>` });
      }
      // Firmeza/Nervios/Impulso Tóxico/Intercambio Térmico (lote 20): ventaja
      // en el próximo ataque del objetivo si el tipo de daño recibido
      // coincide, vía applyDynamicModifier() (mismo criterio de bucle).
      for (const token of absorbingTargets) {
        const targetPokemonItem = await pokemonItemForActor(token.actor);
        const targetAbilities = targetPokemonItem?.getFlag(MODULE_ID, "instance")?.abilities;
        if (!abilityTypeTriggeredAdvantage(targetAbilities, damageType)) continue;
        await applyDynamicModifier(token.actor, "type-triggered-advantage", {
          modifiers: { attackAdvantage: true }, durationRounds: 1, sourceName: token.name,
          description: `Ventaja en el próximo ataque por recibir daño de tipo ${typeLabel(damageType)}.`
        });
      }
      // Motor de Vapor/Vigor (lote 41): reacción propia (no de contacto) que
      // crea un ActiveEffect de una ronda sobre el propio objetivo alcanzado.
      for (const token of absorbingTargets) {
        const targetPokemonItem = await pokemonItemForActor(token.actor);
        const targetAbilities = targetPokemonItem?.getFlag(MODULE_ID, "instance")?.abilities;
        const reaction = damageTypeSelfReactionTrigger(targetAbilities, damageType);
        if (reaction) await applyDamageTypeSelfReaction(token.actor, reaction);
      }
      // Cambio Color: el tipo del actor defensor cambia después de recibir el
      // golpe; no se escribe en el Item y desaparece al retirarlo.
      for (const token of absorbingTargets) {
        const targetPokemonItem = await pokemonItemForActor(token.actor);
        const targetAbilities = targetPokemonItem?.getFlag(MODULE_ID, "instance")?.abilities ?? [];
        const nextType = abilityReceivedDamageTypeChange(targetAbilities, damageType);
        if (nextType) await applyCombatAbilityTypeChange(token.actor, targetAbilities, nextType, "Cambio Color");
      }
    }
    const selectedHit = Boolean(attackResult) && selectedTokens.some(token => attackHitsPokemonTarget(attackResult, token.actor));
    // Cabeza Roca (lote 21): sin daño de retroceso propio.
    const recoilFraction = abilityIgnoresRecoil(instance.abilities) ? 0 : RECOIL_FRACTION_MOVES[move.id];
    if (recoilFraction && selectedHit && dealtDamageTotal != null) {
      const recoilHp = recoilAmount(dealtDamageTotal, recoilFraction);
      const infamous = trainer && hasTrainerPath(trainer, "grunt", 15)
        ? await promptSpendTrainerResource(trainer, "grunt", { cost: 2, title: "Golpe infame (Recluta 15)", prompt: `¿Gastar 2 Puntos de Sombra para que ${escapeHtml(name)} quede Aturdido en vez de sufrir ${recoilHp} de retroceso?` })
        : null;
      if (infamous) {
        const stunnedConfig = CONFIG.statusEffects?.find?.(entry => entry.id === "stunned");
        await combatActor.createEmbeddedDocuments("ActiveEffect", [{
          name: stunnedConfig?.name ?? "Aturdido",
          img: stunnedConfig?.img ?? stunnedConfig?.icon ?? "icons/svg/daze.svg",
          statuses: ["stunned"],
          duration: { rounds: 1, startRound: game.combat?.round ?? 0, startTurn: game.combat?.turn ?? 0 }
        }]);
        await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>Golpe infame</strong>: ${escapeHtml(flavor)} evita el retroceso, pero ${escapeHtml(name)} queda Aturdido hasta el final de su próximo turno.</p></div>` });
      } else {
        await applySelfRecoil(this.pokemonItem.parent, combatActor, recoilHp, speaker, flavor);
      }
    }
    const drainFraction = DRAIN_FRACTION_MOVES[move.id];
    if (drainFraction && dealtDamageTotal != null && (attackResult ? selectedHit : true)) {
      const cap = move.id === "parabolic-charge" ? 5 * level : Infinity;
      await applySelfDrain(combatActor, Math.min(cap, recoilAmount(dealtDamageTotal, drainFraction)), speaker, flavor);
    }
    if (SELF_FAINT_MOVES.has(move.id) && combatActor && Number(combatActor.system.attributes?.hp?.value) > 0) {
      await combatActor.update({ "system.attributes.hp.value": 0 });
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p>${escapeHtml(flavor)} se debilita al activar el movimiento.</p></div>` });
    }
    if (move.id === "pay-day" && attackResult) {
      const trainer = this.pokemonItem.parent?.type === "character" ? this.pokemonItem.parent : null;
      for (const token of selectedTokens) {
        if (!attackHitsPokemonTarget(attackResult, token.actor) || token.actor?.getFlag(MODULE_ID, "payDayTriggered")) continue;
        await token.actor.setFlag(MODULE_ID, "payDayTriggered", true);
        if (!trainer) continue;
        const earned = 10 * level;
        await updatePokedollars(trainer, pokedollars(trainer) + earned);
        await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p>${escapeHtml(flavor)} desparrama ${earned}₽ por el suelo.</p></div>` });
      }
    }
    if (move.id === "false-swipe" && attackResult) {
      for (const token of selectedTokens) if (attackHitsPokemonTarget(attackResult, token.actor)) await markFalseSwipeTarget(token.actor);
    }
    if (move.id !== "false-swipe" && attackResult && trainer && hasTrainerPath(trainer, "pokemon-collector", 9)) {
      // Golpes disciplinados (Pokémon Collector 9): reutiliza el mismo tope
      // "nunca a 0 PG" de Falso Tortazo (markFalseSwipeTarget(), hp-effects.mjs),
      // pero como oferta opcional en cualquier golpe en vez de automática por
      // el propio movimiento. Se ofrece siempre que impacte, no solo cuando
      // sería letal, porque el tope no hace nada si el golpe no bajaba a 0 PG.
      for (const token of selectedTokens) {
        if (!attackHitsPokemonTarget(attackResult, token.actor)) continue;
        const spare = await confirmHeldItemReaction("Golpes disciplinados (Coleccionista Pokémon 9)", `<p>¿Dejar a ${escapeHtml(token.name)} en 1 PG en vez de debilitarlo?</p>`);
        if (spare) await markFalseSwipeTarget(token.actor);
      }
    }
    if (move.attack?.scope === "melee" && attackResult) {
      // Reacciones de contacto (Piel Tosca, Punta Acero, Electricidad
      // Estática, Esporas Efecto, Punto Toxico): el defensor devuelve daño al
      // atacante si su habilidad lo prevé. Una por objetivo alcanzado, igual
      // que el resto de efectos "por golpe" de este bloque.
      for (const token of selectedTokens) {
        if (!attackHitsPokemonTarget(attackResult, token.actor)) continue;
        await applyContactDamageReaction(token.actor, combatActor);
        // Lote 5: reacciones de contacto que aplican un estado (Cuerpo
        // Ardiente, Hedor) o bloquean un movimiento (Cuerpo Maldito) al
        // atacante en vez de dañarlo. pokemon-abilities.mjs solo tira el
        // dado y devuelve el resultado (evita el ciclo de imports con
        // status-effects.mjs); aquí, que ya tiene ambas funciones
        // importadas, se aplica el estado o el bloqueo.
        const statusReaction = await applyContactStatusReaction(token.actor);
        if (statusReaction) await applyPokemonStatus(combatActor, statusReaction.status, { sourceName: token.name, moveName: move.name });
        const cursedBody = await applyCursedBodyReaction(token.actor, combatActor);
        if (cursedBody) await applyMoveLock(combatActor, move.id, { sourceName: token.name, description: `${move.name} no puede repetirse en el próximo turno por Cuerpo Maldito de ${escapeHtml(token.name)}.` });
        // Lote 28: Baba deja la velocidad del atacante a 0 durante una ronda.
        await applyGooeyReaction(token.actor, combatActor);
      }
      // Toque Tóxico/Cadena Tóxica (lote 27): mi propio golpe cuerpo a cuerpo
      // envenena al objetivo, dirección contraria al resto de este bloque.
      const ownMeleeTrigger = ownMeleeHitStatusTrigger(instance.abilities);
      if (ownMeleeTrigger) {
        const hitTokens = selectedTokens.filter(token => attackHitsPokemonTarget(attackResult, token.actor));
        if (hitTokens.length) {
          if (ownMeleeTrigger.mode === "chance") {
            for (const token of hitTokens) {
              const roll = await new Roll(`1d${ownMeleeTrigger.die}`).evaluate();
              await roll.toMessage({ speaker, flavor: `${flavor} — ¿envenena a ${token.name}? (ocurre con un ${ownMeleeTrigger.on})` });
              if (Number(roll.total) === ownMeleeTrigger.on) await applyPokemonStatus(token.actor, ownMeleeTrigger.status, { sourceName: name, moveName: move.name });
            }
          } else if (ownMeleeTrigger.mode === "save") {
            const failed = await rollFailedSaves(hitTokens, ownMeleeTrigger.saveAbility, ownMeleeTrigger.dc, speaker, move.name);
            for (const target of failed) await applyPokemonStatus(target.actor, ownMeleeTrigger.status, { sourceName: name, moveName: move.name });
          }
        }
      }
    }
    if (move.id === "trick" && attackResult) {
      for (const token of selectedTokens) {
        if (!attackHitsPokemonTarget(attackResult, token.actor)) continue;
        if (await stickyHoldProtects(token)) continue;
        await requestHeldItemSwap({ sourcePokemonItem: this.pokemonItem, targetActor: token.actor, sourceName: name, targetName: token.name });
      }
    }
    if (move.id === "thief" && attackResult && !instance.heldItem) {
      const hitTokens = selectedTokens.filter(token => attackHitsPokemonTarget(attackResult, token.actor));
      if (hitTokens.length) {
        const dc = 8 + attackMoveModifier + proficiency + serenegraceBonus;
        const failed = await rollFailedSaves(hitTokens, "dex", dc, speaker, move.name);
        for (const target of failed) {
          if (await stickyHoldProtects(target)) continue;
          await requestHeldItemSwap({ sourcePokemonItem: this.pokemonItem, targetActor: target.actor, sourceName: name, targetName: target.tokenName });
        }
      }
    }
    if (move.id === "incinerate" && attackResult) {
      for (const token of selectedTokens) {
        if (!attackHitsPokemonTarget(attackResult, token.actor)) continue;
        const targetPokemonItem = await pokemonItemForActor(token.actor);
        const targetHeldItem = targetPokemonItem?.getFlag(MODULE_ID, "instance")?.heldItem;
        if (!isBerryHeldItem(targetHeldItem?.sourceId)) continue;
        if (abilityProtectsHeldItem(targetPokemonItem?.getFlag(MODULE_ID, "instance")?.abilities)) {
          await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(token.name)}</strong> protege su objeto equipado con Ventosas.</p></div>` });
          continue;
        }
        await requestHeldItemDestroy({ targetActor: token.actor, sourceName: name, targetName: token.name, restoreAfterCombat: false });
      }
    }
    if (move.id === "knock-off" && attackResult) {
      for (const token of selectedTokens) {
        if (!attackHitsPokemonTarget(attackResult, token.actor)) continue;
        if (await stickyHoldProtects(token)) continue;
        await requestHeldItemDestroy({ targetActor: token.actor, sourceName: name, targetName: token.name, restoreAfterCombat: true });
      }
    }
    if (move.id === "clear-smog" && attackResult) {
      for (const token of selectedTokens) if (attackHitsPokemonTarget(attackResult, token.actor)) await removeAllMoveModifiers(token.actor);
    }
    if (move.id === "wake-up-slap" && targetAsleep && attackResult) {
      for (const token of selectedTokens) {
        if (!attackHitsPokemonTarget(attackResult, token.actor)) continue;
        const targetPokemonItem = await pokemonItemForActor(token.actor);
        if (targetPokemonItem) await removePokemonStatus(targetPokemonItem, "asleep");
      }
    }
    if (move.id === "purify" && selectedTokens.length) {
      let curedAny = false;
      for (const token of selectedTokens) {
        const targetPokemonItem = await pokemonItemForActor(token.actor);
        const conditions = [...(targetPokemonItem?.getFlag(MODULE_ID, "instance")?.conditions ?? [])];
        for (const id of conditions) { await removePokemonStatus(targetPokemonItem, id); curedAny = true; }
      }
      if (curedAny) {
        const heal = 2 * level;
        const hp = combatActor.system.attributes?.hp;
        if (hp) await combatActor.update({ "system.attributes.hp.value": Math.min(Number(hp.max) || Number(hp.value), Number(hp.value) + heal) });
        await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p>${escapeHtml(flavor)} cura estados y recupera ${heal} PG.</p></div>` });
      }
    }
    if (move.id === "refresh") {
      for (const id of ["poisoned", "badly-poisoned", "paralyzed", "burned"]) {
        if ((instance.conditions ?? []).includes(id)) await removePokemonStatus(this.pokemonItem, id);
      }
    }
    if (move.id === "take-heart") {
      for (const id of [...(instance.conditions ?? [])]) await removePokemonStatus(this.pokemonItem, id);
    }
    if (formula && selectedHit && CHAIN_MULTI_HIT_MOVES[move.id]) {
      await rollChainMultiHit(move, level, damageType, flavor, speaker, CHAIN_MULTI_HIT_MOVES[move.id], abilityMinimumChainExtraHits(instance.abilities, move.id));
    }
    if (escalation && !escalation.automatic && attackResult && !selectedHit) await resetConsecutiveStrike(combatActor, move.id);
    let statusMove = move;
    if (RANDOM_STATUS_TABLE_MOVES[move.id]) {
      const table = RANDOM_STATUS_TABLE_MOVES[move.id];
      const tableRoll = await new Roll(`1d${table.faces}`).evaluate();
      await tableRoll.toMessage({ speaker, flavor: `${flavor} — Estado al azar` });
      const chosenStatus = table.resolve(tableRoll.total);
      statusMove = { ...move, statusEffects: [{ id: chosenStatus, trigger: table.trigger, minimum: table.minimum ?? null, margin: table.margin ?? 0, requiresHit: false, target: "selected" }] };
    }
    const statusResolution = sheerForce.suppressSecondaryEffect ? { saveResults: new Map() } : await applyMoveStatuses({ move: statusMove, attack: attackResult, saveDc: 8 + attackMoveModifier + proficiency + serenegraceBonus, sourceActor: this.pokemonItem.parent, sourceCombatActor: combatActor, sourceName: name });
    if (!sheerForce.suppressSecondaryEffect) await applyMoveOngoingEffects({
      move, attack: attackResult, saveDc: 8 + attackMoveModifier + proficiency + serenegraceBonus,
      sourceOwnerActor: this.pokemonItem.parent, sourceCombatActor: combatActor,
      sourcePokemonItem: this.pokemonItem, sourceName: name, level, moveModifier,
      proficiency, sourceTypes: species.type ?? []
    });
    if (!sheerForce.suppressSecondaryEffect) await applyMoveModifierEffects({
      move, attack: attackResult, saveDc: 8 + attackMoveModifier + proficiency + serenegraceBonus,
      saveResults: statusResolution?.saveResults,
      sourceOwnerActor: this.pokemonItem.parent, sourceCombatActor: combatActor, sourceName: name, proficiency
    });
    await consumeCapturedMoveModifiers(combatActor, consumedModifierIds);
    if (formula) await applyPostMoveHeldItemEffects(this.pokemonItem, heldProfile, proficiency);
    if (await lockChoiceHeldItem(this.pokemonItem, move.id)) await syncPokemonHeldItemToDeployment(this.pokemonItem);
    if (DAMAGE_SHIELD_MOVES.has(move.id)) await armDamageShield(combatActor, move.id);
    if (TERRAIN_MOVES[move.id]) await requestFieldEffect(game.combat, "terrain", move.id, TERRAIN_MOVES[move.id].rounds, name);
    if (WEATHER_MOVES[move.id]) await requestFieldEffect(game.combat, "weather", WEATHER_MOVES[move.id].id, WEATHER_MOVES[move.id].rounds, name);
    if (move.id === "chilly-reception") await requestFieldEffect(game.combat, "weather", "snow", 5, name);
    if (FIELD_RULE_MOVES[move.id]) await requestFieldEffect(game.combat, "fieldRule", move.id, FIELD_RULE_MOVES[move.id].rounds, name);
    if (FIELD_PULSE_MOVES[move.id]) await requestFieldEffect(game.combat, "pulse", move.id, FIELD_PULSE_MOVES[move.id].rounds, name);
    if (move.id === "defog") await clearField(game.combat);
    if (move.id === "grassy-glide" && currentField(game.combat).terrain?.id === "grassy-terrain") {
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p>${escapeHtml(flavor)} está sobre Terreno de Hierba: +10 pies de velocidad y sin provocar ataques de oportunidad hasta su siguiente turno (bono descriptivo, ajústalo manualmente en la ficha).</p></div>` });
    }
    if (TARGET_SWITCH_MOVES.has(move.id) && attackResult) {
      for (const token of selectedTokens) if (attackHitsPokemonTarget(attackResult, token.actor)) await requestForcedSwitch(token.actor, name);
    }
    if (SELF_SWITCH_MOVES.has(move.id)) {
      this.render({ force: true });
      await selfForcedSwitch(this.pokemonItem);
      return;
    }
    this.render({ force: true });
  }

  /**
   * Ofrece, tras resolver el daño o la curación de un movimiento, los
   * recursos de Camino de Entrenador que se gastan sobre esa misma tirada:
   * el dado de batalla de Ace Trainer (se suma, del tamaño 1d6/1d8/1d10 que
   * corresponda a su nivel) y, en Tactician, Golpe dirigido (2 Puntos
   * Tácticos, vuelve a tirar el mismo daño y solo publica la diferencia si
   * sale mayor) o el bono de curación (1 Punto Táctico por 1d4 extra,
   * repetible mientras queden puntos, solo si el movimiento cura). Cada uno
   * se publica como su propio mensaje con las flags de dnd5e para que
   * conserve su propio botón de aplicar. No hace nada si el Pokémon no
   * pertenece a un entrenador con esos caminos o no le quedan usos —
   * promptSpendTrainerResource() ya se calla en ese caso. Devuelve el total
   * ya con los bonos aplicados, que #rollMove() usa después para
   * retroceso/drenaje. Hobbyist (dado de habilidad en pruebas o
   * salvaciones) y Grunt (Puntos de Sombra) no tocan esta tirada de
   * daño/curación y se ofrecen en otros puntos del módulo.
   */
  async #offerTrainerRollBoosts({ damageType, dealtDamageTotal, formula, speaker, flavor }) {
    const trainer = this.pokemonItem.parent?.type === "character" ? this.pokemonItem.parent : null;
    if (!trainer || !formula) return dealtDamageTotal;
    const healing = damageType === "healing";
    let total = dealtDamageTotal;
    const DamageRoll = CONFIG.Dice?.DamageRoll;
    const rollType = healing ? "healing" : "damage";

    const aceFormula = trainerResourceState(trainer, "ace-trainer")?.formula ?? "1d6";
    const ace = await promptSpendTrainerResource(trainer, "ace-trainer", {
      prompt: `¿Sumar un dado de batalla (${aceFormula}) a este ${healing ? "curación" : "daño"}?`
    });
    if (ace) {
      const bonus = DamageRoll ? await new DamageRoll(aceFormula, {}, { type: damageType }).evaluate() : await new Roll(aceFormula).evaluate();
      total += Number(bonus.total) || 0;
      await postDamageRoll(bonus, {
        speaker,
        flavor: `${flavor} — Dado de batalla (Entrenador de Élite)`,
        rollType
      });
    }

    if (healing) {
      let more = true;
      while (more) {
        const spent = await promptSpendTrainerResource(trainer, "tactician", { prompt: "¿Gastar 1 Punto Táctico para +1d4 de curación extra?" });
        if (!spent) { more = false; continue; }
        const bonus = DamageRoll ? await new DamageRoll("1d4", {}, { type: "healing" }).evaluate() : await new Roll("1d4").evaluate();
        total += Number(bonus.total) || 0;
        await postDamageRoll(bonus, {
          speaker,
          flavor: `${flavor} — Puntos Tácticos (curación extra)`,
          rollType: "healing"
        });
      }
    } else {
      const directed = await promptSpendTrainerResource(trainer, "tactician", { cost: 2, prompt: "¿Gastar 2 Puntos Tácticos (Golpe dirigido) para volver a tirar este daño y quedarte con el mayor?" });
      if (directed) {
        const reroll = DamageRoll ? await new DamageRoll(formula, {}, { type: damageType }).evaluate() : await new Roll(formula).evaluate();
        const rerollTotal = Number(reroll.total) || 0;
        if (rerollTotal > total) {
          const delta = rerollTotal - total;
          total = rerollTotal;
          const bonus = DamageRoll ? await new DamageRoll(String(delta), {}, { type: damageType }).evaluate() : await new Roll(String(delta)).evaluate();
          await postDamageRoll(bonus, {
            speaker,
            flavor: `${flavor} — Golpe dirigido (Estratega): segunda tirada mayor (${rerollTotal})`
          });
        } else {
          await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p>${escapeHtml(flavor)} — Golpe dirigido (Estratega): la segunda tirada (${rerollTotal}) no mejora el daño ya infligido.</p></div>` });
        }
      }
    }
    return total;
  }

  /**
   * Sabotaje (Grunt 2): gasta un Punto de Sombra del entrenador para armar el
   * mismo escudo de reacción de "anulación total" que usan Protección o
   * Escudo Real (armDamageShield() en damage-shields.mjs, con el id sintético
   * "sabotage" en vez de un movimiento real), preparado para el siguiente
   * golpe que reciba este Pokémon. Coste fijo de 1 punto, simplificado —el
   * texto original deja elegir cuántos gastar según lo que haga falta
   * reducir, igual que el resto de esa familia de escudos ya simplifica su
   * dificultad creciente.
   */
  async #armSabotage() {
    const trainer = this.pokemonItem.parent?.type === "character" ? this.pokemonItem.parent : null;
    const combatActor = this.pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild" ? this.pokemonItem.parent : deployedActorFor(this.pokemonItem);
    if (!trainer || !combatActor) return;
    const spent = await promptSpendTrainerResource(trainer, "grunt", {
      title: "Sabotaje (Recluta 2)",
      prompt: `¿Gastar 1 Punto de Sombra para que el próximo golpe que reciba ${escapeHtml(displayPokemonName(this.pokemonItem))} se convierta en fallo (salvo un 20 natural)?`
    });
    if (!spent) return;
    await armDamageShield(combatActor, "sabotage");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: trainer }),
      content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>Sabotaje</strong>: el próximo golpe que reciba ${escapeHtml(displayPokemonName(this.pokemonItem))} se convertirá en fallo.</p></div>`
    });
    this.render({ force: true });
  }

  /**
   * Esquiva siniestra (Grunt 9): gasta 4 Puntos de Sombra del entrenador para
   * armar el escudo de "reduce a la mitad" (mismo mecanismo de
   * damage-shields.mjs que Pantalla de Luz/Guardia Amplia, con el id
   * sintético "shadow-dodge") sobre el siguiente golpe que reciba este
   * Pokémon. El texto original mejora un grado la resistencia al tipo
   * concreto del golpe; se simplifica a reducirlo a la mitad, igual que el
   * resto de esa familia — ver el comentario de HALF_NEGATION_MOVES.
   */
  async #armShadowDodge() {
    const trainer = this.pokemonItem.parent?.type === "character" ? this.pokemonItem.parent : null;
    const combatActor = this.pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild" ? this.pokemonItem.parent : deployedActorFor(this.pokemonItem);
    if (!trainer || !combatActor) return;
    const spent = await promptSpendTrainerResource(trainer, "grunt", {
      cost: 4,
      title: "Esquiva siniestra (Recluta 9)",
      prompt: `¿Gastar 4 Puntos de Sombra para que el próximo golpe que reciba ${escapeHtml(displayPokemonName(this.pokemonItem))} se reduzca a la mitad?`
    });
    if (!spent) return;
    await armDamageShield(combatActor, "shadow-dodge");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: trainer }),
      content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>Esquiva siniestra</strong>: el próximo golpe que reciba ${escapeHtml(displayPokemonName(this.pokemonItem))} se reducirá a la mitad.</p></div>`
    });
    this.render({ force: true });
  }

  /**
   * Médico de campo (Nurse 9): prueba de Medicina del entrenador (CD 12,
   * calculada a mano desde `system.skills.med.total` en vez de con
   * `Actor5e#rollSkill()` para no depender de una firma de dnd5e que puede
   * cambiar de versión) que cura el estado no volátil del Pokémon si tiene
   * uno —solo puede haber uno a la vez, así que no hace falta elegir cuál—.
   */
  async #fieldMedicine() {
    const trainer = this.pokemonItem.parent?.type === "character" ? this.pokemonItem.parent : null;
    if (!trainer || !hasTrainerPath(trainer, "nurse", 9)) return;
    const instance = this.#instance();
    const statusId = (instance.conditions ?? []).find(id => POKEMON_STATUS_EFFECTS[id]?.nonVolatile);
    const name = displayPokemonName(this.pokemonItem);
    if (!statusId) return ui.notifications.info(game.i18n.format("POKE5E.StatusEffects.NoTarget", { move: "Médico de campo" }));
    const modifier = Number(trainer.system.skills?.med?.total) || 0;
    const roll = await new Roll("1d20 + @modifier", { modifier }).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: trainer }), flavor: `Médico de campo (Enfermero Pokémon 9) — Medicina CD 12 sobre ${name}` });
    if (Number(roll.total) >= 12) {
      await removePokemonStatus(this.pokemonItem, statusId);
      await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>Médico de campo</strong> tiene éxito: ${escapeHtml(name)} se cura de ${escapeHtml(POKEMON_STATUS_EFFECTS[statusId]?.name ?? statusId)}.</p></div>` });
    }
    this.render({ force: true });
  }

  /**
   * Tirada de competencia (skill check) de este Pokémon. No existía ninguna
   * en la ficha —el actor de combate ya tenía `system.skills` con la
   * competencia "de fábrica" de la especie y la de Multitalento, pero nada
   * los tiraba—. Suma, si aplican: Generalista (Hobbyist 9, la mitad de la
   * competencia redondeando hacia abajo cuando no está entrenado) y
   * Compañero (Ranger 9, el modificador de Sabiduría del entrenador si este
   * Pokémon es su compañero).
   */
  async #rollSkillCheck(skillKey) {
    const combatActor = this.pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild" ? this.pokemonItem.parent : deployedActorFor(this.pokemonItem);
    const trainer = this.pokemonItem.parent?.type === "character" ? this.pokemonItem.parent : null;
    const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const instance = this.#instance();
    const effectiveTypes = heldItemEffectiveTypes({
      sourceId: instance.heldItem?.sourceId,
      speciesId: species.id,
      baseTypes: species.type ?? [],
      abilities: instance.abilities ?? []
    });
    const skill = preparePokemonSkills({
      combatActor, trainer, pokemonItem: this.pokemonItem, species, instance,
      effectiveTypes, level: Number(instance.level) || 1
    }).find(entry => entry.key === skillKey);
    if (!skill) return;
    const modifier = skill.modifier;
    const name = displayPokemonName(this.pokemonItem);
    const roll = await new Roll("1d20 + @modifier", { modifier }).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: combatActor ?? trainer, alias: name }), flavor: `${name} — ${skill.label}` });
  }

  /**
   * Onda Choque (Bide) tiene dos fases que no encajan en el flujo normal de
   * #rollMove(): la primera activación solo empieza a acumular el daño que
   * recibe el usuario (registerBideTracking() en bide.mjs se encarga de
   * sumarlo); la segunda lo libera doblado como ataque a distancia con
   * releaseBideDamage(), sin gastar PP en la fase de acumulación.
   */
  async #rollBide(instance, entry, move) {
    const name = displayPokemonName(this.pokemonItem);
    const speaker = ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name });
    if (!instance.bideTracking) {
      if (Number(entry.pp.max) > 0 && Number(entry.pp.value) <= 0) {
        return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.NoPP", { name, move: move.name }));
      }
      instance.bideTracking = true;
      instance.bideDamage = 0;
      if (Number(entry.pp.max) > 0) entry.pp.value = Math.max(0, Number(entry.pp.value) - 1);
      await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card"><header class="card-header"><h3>${escapeHtml(name)} — ${escapeHtml(move.name)}</h3></header><p>Empieza a acumular el daño que reciba hasta su próximo turno.</p></div>` });
      this.render({ force: true });
      return;
    }
    const level = Number(instance.level) || 1;
    const proficiency = 2 + Math.floor((level - 1) / 4);
    const storedSpecies = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const species = { ...storedSpecies, attributes: pokemonAttributesWithNature(storedSpecies, instance) };
    const attackMoveModifier = getMoveModifier(species, move);
    const attack = await new Roll("1d20 + @mod + @prof", { mod: attackMoveModifier, prof: proficiency }).evaluate();
    await attack.toMessage({ speaker, flavor: `${name} — ${move.name} (Ranged)` });
    const damageTotal = releaseBideDamage(instance.bideDamage);
    const DamageRoll = CONFIG.Dice?.DamageRoll;
    const damage = DamageRoll
      ? await new DamageRoll(String(Math.max(1, damageTotal)), {}, { type: "typeless" }).evaluate()
      : await new Roll(String(Math.max(1, damageTotal))).evaluate();
    await postDamageRoll(damage, { speaker, flavor: `${name} — ${move.name} — Típeless (doble del daño recibido)` });
    instance.bideTracking = false;
    instance.bideDamage = 0;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  /**
   * Hablar Dormido solo puede usarse dormido y activa un movimiento propio
   * elegido al azar (con tiempo de activación "1 action", ni él mismo) en su
   * lugar, reutilizando #rollMove() con un evento sintético para no duplicar
   * toda su lógica de ataque, daño y efectos.
   */
  async #rollSleepTalk(instance, entry, data) {
    const name = displayPokemonName(this.pokemonItem);
    if (!(instance.conditions ?? []).includes("asleep")) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.SleepTalkAwake", { name }));
    }
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) <= 0) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.NoPP", { name, move: data.movesById.get(entry.moveId)?.name ?? "Sleep Talk" }));
    }
    const candidates = instance.moves.filter(candidate => {
      if (candidate.id === entry.id) return false;
      const catalogMove = data.movesById.get(candidate.moveId);
      if (catalogMove?.time !== "1 action") return false;
      return Number(candidate.pp?.max) === 0 || Number(candidate.pp?.value) > 0;
    });
    if (!candidates.length) return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.SleepTalkNone", { name }));
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    if (Number(entry.pp.max) > 0) {
      entry.pp.value = Math.max(0, Number(entry.pp.value) - 1);
      await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    }
    await this.#rollMove({ currentTarget: { dataset: { moveEntryId: chosen.id } } });
  }

  /**
   * Golpe Metálico (metal-burst) tiene el mismo problema de dos fases que
   * Onda Choque, así que reutiliza su rastreo (bide.mjs), pero devuelve el
   * golpe de inmediato contra un objetivo elegido en vez de esperar un turno:
   * la primera activación arma el rastreo, la segunda (con un objetivo
   * seleccionado) lo libera como ataque cuerpo a cuerpo con desventaja.
   */
  async #rollMetalBurst(instance, entry, move) {
    const name = displayPokemonName(this.pokemonItem);
    const speaker = ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name });
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) <= 0) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.NoPP", { name, move: move.name }));
    }
    if (!instance.metalBurstTracking) {
      instance.metalBurstTracking = true;
      instance.metalBurstDamage = 0;
      if (Number(entry.pp.max) > 0) entry.pp.value = Math.max(0, Number(entry.pp.value) - 1);
      await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card"><header class="card-header"><h3>${escapeHtml(name)} — ${escapeHtml(move.name)}</h3></header><p>Preparado para devolver el próximo golpe cuerpo a cuerpo que reciba.</p></div>` });
      this.render({ force: true });
      return;
    }
    const selectedTokens = [...(game.user.targets ?? [])];
    if (!selectedTokens.length) return ui.notifications.warn(game.i18n.format("POKE5E.StatusEffects.NoTarget", { move: move.name }));
    const level = Number(instance.level) || 1;
    const proficiency = 2 + Math.floor((level - 1) / 4);
    const storedSpecies = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const species = { ...storedSpecies, attributes: pokemonAttributesWithNature(storedSpecies, instance) };
    const attackMoveModifier = getMoveModifier(species, move);
    const attack = await new Roll("2d20kl + @mod + @prof", { mod: attackMoveModifier, prof: proficiency }).evaluate();
    await attack.toMessage({ speaker, flavor: `${name} — ${move.name} (Melee, con desventaja)` });
    const damageTotal = Math.min(Number(instance.metalBurstDamage) || 0, 5 * level);
    if (damageTotal > 0) {
      const DamageRoll = CONFIG.Dice?.DamageRoll;
      const damage = DamageRoll
        ? await new DamageRoll(String(damageTotal), {}, { type: "steel" }).evaluate()
        : await new Roll(String(damageTotal)).evaluate();
      await postDamageRoll(damage, { speaker, flavor: `${name} — ${move.name} — Acero (igual al daño recibido, tope 5× nivel)` });
    }
    instance.metalBurstTracking = false;
    instance.metalBurstDamage = 0;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  /**
   * Contraataque (counter) y Copión (mirror-coat) son reacciones de dos fases
   * como Golpe Metálico, pero con dados fijos en vez de devolver el daño
   * recibido: la primera activación solo arma la reacción, la segunda —con un
   * objetivo seleccionado— la libera como ataque con los dados y el tipo que
   * indica cada movimiento.
   */
  async #rollRetaliation(instance, entry, move, { dice, damageType, trackingKey, label }) {
    const name = displayPokemonName(this.pokemonItem);
    const speaker = ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name });
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) <= 0) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.NoPP", { name, move: move.name }));
    }
    if (!instance[trackingKey]) {
      instance[trackingKey] = true;
      if (Number(entry.pp.max) > 0) entry.pp.value = Math.max(0, Number(entry.pp.value) - 1);
      await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card"><header class="card-header"><h3>${escapeHtml(name)} — ${escapeHtml(move.name)}</h3></header><p>Preparado para devolver el próximo golpe que reciba.</p></div>` });
      this.render({ force: true });
      return;
    }
    const selectedTokens = [...(game.user.targets ?? [])];
    if (!selectedTokens.length) return ui.notifications.warn(game.i18n.format("POKE5E.StatusEffects.NoTarget", { move: move.name }));
    const level = Number(instance.level) || 1;
    const proficiency = 2 + Math.floor((level - 1) / 4);
    const storedSpecies = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const species = { ...storedSpecies, attributes: pokemonAttributesWithNature(storedSpecies, instance) };
    const attackMoveModifier = getMoveModifier(species, move);
    const attack = await new Roll("1d20 + @mod + @prof", { mod: attackMoveModifier, prof: proficiency }).evaluate();
    await attack.toMessage({ speaker, flavor: `${name} — ${move.name} (${label})` });
    const DamageRoll = CONFIG.Dice?.DamageRoll;
    const formula = appendModifier(dice, attackMoveModifier);
    const damage = DamageRoll
      ? await new DamageRoll(formula, {}, { type: damageType }).evaluate()
      : await new Roll(formula).evaluate();
    await postDamageRoll(damage, { speaker, flavor: `${name} — ${move.name} — ${typeLabel(damageType)}` });
    instance[trackingKey] = false;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  /**
   * Explosión no tiene dados de daño: solo funciona con un 20 natural en 1d20,
   * y en ese caso deja a 0 PG a todos los objetivos seleccionados en el radio
   * (sin tirada de salvación ni de ataque). El fallo automático por diferencia
   * de nivel/SR no se comprueba aquí. Se resuelve directamente en vez de pasar
   * por el flujo normal de #rollMove() porque no encaja ni en attack ni en save.
   */
  async #rollExplosion(instance, entry, move) {
    const name = displayPokemonName(this.pokemonItem);
    const speaker = ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name });
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) <= 0) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.NoPP", { name, move: move.name }));
    }
    const selectedTokens = [...(game.user.targets ?? [])];
    if (Number(entry.pp.max) > 0) entry.pp.value = Math.max(0, Number(entry.pp.value) - 1);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    const roll = await new Roll("1d20").evaluate();
    await roll.toMessage({ speaker, flavor: `${name} — ${move.name}` });
    if (Number(roll.total) === 20) {
      const ignoresAbilities = abilitySuppressesTargetAbilities(instance.abilities);
      const affected = [];
      for (const token of selectedTokens) {
        const targetItem = await pokemonItemForActor(token.actor);
        const targetAbilities = targetItem?.getFlag(MODULE_ID, "instance")?.abilities ?? [];
        if (!ignoresAbilities && abilityBlocksIncomingMove(targetAbilities, { moveId: move.id, moveName: move.name }) === "damp") {
          await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(token.name)}</strong> no queda fuera de combate gracias a Humedad.</p></div>` });
        } else affected.push(token);
      }
      if (affected.length) await requestFaintTargets(affected, name);
    } else {
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p>La explosión no llega a activarse.</p></div>` });
    }
    this.render({ force: true });
  }

  /**
   * Golpes fijos en una sola activación (Bonemerang, Burbuja, Bomba
   * Demográfica, Golpe Rápido...): a diferencia de la cadena de multi-hit.mjs
   * (una sola tirada de ataque, dados extra sin modificador), aquí cada golpe
   * tira su propio ataque Y su propio daño con el modificador MOVE completo,
   * tal como dice el texto original ("on each successful hit, do X + MOVE").
   * Los que se detienen en el primer fallo (Ola Trompa, Triple Patada) pasan
   * `stopOnMiss: true`. No reutiliza heldProfile/pathProfile ni los
   * modificadores de combate por simplicidad, igual que #rollRetaliation.
   */
  async #rollFixedMultiAttack(instance, entry, move, count, { stopOnMiss = false } = {}) {
    const name = displayPokemonName(this.pokemonItem);
    const speaker = ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name });
    const combatActor = this.pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild" ? this.pokemonItem.parent : deployedActorFor(this.pokemonItem);
    if (isMoveRecharging(combatActor, move.id)) return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.Recharging", { name, move: move.name }));
    if (pokemonCombatModifiers(combatActor).moveLockAll) return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.MoveLocked", { name, move: move.name }));
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) <= 0) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.NoPP", { name, move: move.name }));
    }
    const selectedTokens = [...(game.user.targets ?? [])];
    if (!selectedTokens.length) return ui.notifications.warn(game.i18n.format("POKE5E.StatusEffects.NoTarget", { move: move.name }));
    const level = Number(instance.level) || 1;
    const proficiency = 2 + Math.floor((level - 1) / 4);
    const storedSpecies = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const species = { ...storedSpecies, attributes: pokemonAttributesWithNature(storedSpecies, instance) };
    const moveModifier = getMoveModifier(species, move);
    const flavor = `${name} — ${move.name}`;
    const damageType = await chooseDamageType(move);
    if (!damageType) return;
    instance.lastMoveId = move.id;
    if (Number(entry.pp.max) > 0) entry.pp.value = Math.max(0, Number(entry.pp.value) - 1);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) === 0) await tryLeppaBerryReaction(this.pokemonItem, entry.id);
    const baseDice = resolveDamageDice(move, level);
    const DamageRoll = CONFIG.Dice?.DamageRoll;
    let hits = 0;
    for (let i = 0; i < count; i++) {
      const attack = await new Roll("1d20 + @mod + @prof", { mod: moveModifier, prof: proficiency }).evaluate();
      await attack.toMessage({ speaker, flavor: `${flavor} — Golpe ${i + 1}/${count}` });
      const natural = Number(attack.dice?.[0]?.results?.find(result => result.active)?.result ?? attack.dice?.[0]?.total) || 0;
      const attackResult = { natural, total: Number(attack.total) || 0 };
      const hit = selectedTokens.some(token => attackHitsPokemonTarget(attackResult, token.actor));
      if (!hit) {
        if (stopOnMiss) break;
        continue;
      }
      hits += 1;
      if (!baseDice) continue;
      const formula = appendModifier(baseDice, moveModifier);
      const damage = DamageRoll
        ? await new DamageRoll(formula, {}, { type: damageType }).evaluate()
        : await new Roll(formula).evaluate();
      await postDamageRoll(damage, { speaker, flavor: `${flavor} — ${typeLabel(damageType)}` });
    }
    if (!hits) await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p>${escapeHtml(flavor)} no llega a impactar ninguna vez.</p></div>` });
    this.render({ force: true });
  }

  /**
   * Acupresión no ataca ni exige salvación: tira 1d6 en su propia tabla
   * (random-tables.mjs) y aplica un modificador dinámico distinto según el
   * resultado (applyDynamicModifier() en move-modifiers.mjs), salvo los PG
   * temporales, que se escriben directamente porque no encajan en el modelo
   * de ActiveEffect. Cualquier aplicación anterior de Acupresión sobre el
   * mismo actor se sustituye, tal como indica su propio texto.
   */
  async #rollAcupressure(instance, entry, move) {
    const name = displayPokemonName(this.pokemonItem);
    const speaker = ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name });
    const combatActor = this.pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild" ? this.pokemonItem.parent : deployedActorFor(this.pokemonItem);
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) <= 0) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.NoPP", { name, move: move.name }));
    }
    if (Number(entry.pp.max) > 0) entry.pp.value = Math.max(0, Number(entry.pp.value) - 1);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    const roll = await new Roll("1d6").evaluate();
    await roll.toMessage({ speaker, flavor: `${name} — ${move.name}` });
    const effect = acupressureEffect(roll.total);
    if (!combatActor) {
      ui.notifications.warn(game.i18n.format("POKE5E.MoveEffects.MustBeDeployed", { move: move.name }));
    } else if (effect.tempHp) {
      const hp = combatActor.system.attributes?.hp;
      if (hp) await combatActor.update({ "system.attributes.hp.temp": Math.max(Number(hp.temp) || 0, effect.tempHp) });
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p>${escapeHtml(name)} — ${escapeHtml(move.name)}: ${escapeHtml(effect.description)}</p></div>` });
    } else {
      await applyDynamicModifier(combatActor, move.id, { modifiers: effect.modifiers, description: effect.description, durationRounds: 10, sourceName: name });
    }
    this.render({ force: true });
  }

  /** Retira manualmente un efecto mantenido visible en el actor desplegado. */
  async #removeOngoingEffect(event) {
    const actor = this.pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild" ? this.pokemonItem.parent : deployedActorFor(this.pokemonItem);
    await removeOngoingEffect(actor, event.currentTarget.dataset.effectId);
    await removeMoveModifier(actor, event.currentTarget.dataset.effectId);
    this.render({ force: true });
  }

  /**
   * Ejecuta un movimiento en modo Concurso: ofrece los métodos de prueba de
   * contestRollMethods(), pide CD y modo de tirada con promptContestRoll(),
   * puntúa con contestAppealOutcome() según la compatibilidad de categorías y
   * publica el resultado con contestChatCard(). No gasta PP ni causa daño.
   */
  async #rollContestMove(event) {
    const data = await loadPoke5eData();
    const instance = this.#instance();
    const entry = instance.moves.find(candidate => candidate.id === event.currentTarget.dataset.moveEntryId);
    const move = data.movesById.get(entry?.moveId);
    if (!entry || !move) return;
    const storedSpecies = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const species = { ...storedSpecies, attributes: pokemonAttributesWithNature(storedSpecies, instance) };
    const level = Number(instance.level) || 1;
    const proficiency = 2 + Math.floor((level - 1) / 4);
    const methods = contestRollMethods(species, move, proficiency);
    const selection = await promptContestRoll(move, methods, this.contestType);
    if (!selection) return;
    const method = methods.find(candidate => candidate.id === selection.method) ?? methods[0];
    const dice = selection.rollMode === "advantage" ? "2d20kh" : selection.rollMode === "disadvantage" ? "2d20kl" : "1d20";
    const roll = await new Roll(`${dice} + @modifier`, { modifier: method.modifier }).evaluate();
    const natural = roll.dice?.[0]?.results?.find(result => result.active)?.result ?? roll.dice?.[0]?.total ?? 0;
    const details = contestDetailsForMove(move, data.contestEffectsById);
    const compatibility = contestCompatibility(this.contestType, details.contest);
    const outcome = contestAppealOutcome({ compatibility: compatibility.id, appeal: details.appeal, natural, total: roll.total, dc: selection.dc });
    const name = displayPokemonName(this.pokemonItem);
    const speaker = ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name });
    await roll.toMessage({ speaker, flavor: `${name} — ${move.name} · Concurso ${CONTEST_TYPES[this.contestType].label}` });
    await ChatMessage.create({ speaker, content: contestChatCard({ name, move, method, selection, details, compatibility, outcome }) });
  }

  /**
   * Copia editable del flag `instance`. Todos los métodos que modifican el
   * Pokémon parten de aquí y terminan guardándola con setFlag().
   */
  #instance() {
    return foundry.utils.deepClone(this.pokemonItem.getFlag(MODULE_ID, "instance"));
  }
}

/**
 * Métodos con los que se puede afrontar una prueba de concurso: siempre
 * Interpretación (Carisma, con competencia si la especie la tiene) y además las
 * características que admita el campo `power` del movimiento.
 * Alimenta promptContestRoll().
 */
function contestRollMethods(species, move, proficiency) {
  const attributes = species.attributes ?? {};
  const performanceProficient = (species.skills ?? []).includes("performance");
  const methods = [{
    id: "performance",
    label: game.i18n.format("POKE5E.Contest.PerformanceMethod", { proficiency: performanceProficient ? game.i18n.localize("POKE5E.Contest.PlusProficiency") : "" }),
    modifier: abilityModifier(attributes.cha) + (performanceProficient ? proficiency : 0)
  }];
  const configured = Array.isArray(move.power) ? move.power : move.power ? [move.power] : [];
  const allowed = !configured.length || configured.some(value => value === "any" || value === "varies")
    ? ["str", "dex", "con", "int", "wis", "cha"]
    : configured.filter(value => ["str", "dex", "con", "int", "wis", "cha"].includes(value));
  for (const key of [...new Set(allowed)]) {
    methods.push({ id: `ability-${key}`, label: game.i18n.format("POKE5E.Contest.AbilityWithProficiency", { ability: key.toUpperCase() }), modifier: abilityModifier(attributes[key]) + proficiency });
  }
  return methods;
}

/**
 * Diálogo previo a una prueba de concurso: método, CD del juez y modo de tirada.
 * Devuelve null si se cancela. Solo lo usa #rollContestMove().
 */
async function promptContestRoll(move, methods, contestType) {
  const methodOptions = methods.map(method => `<option value="${escapeHtml(method.id)}">${escapeHtml(method.label)} (${signed(method.modifier)})</option>`).join("");
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("POKE5E.Contest.WindowTitle", { move: move.name }) },
      content: `<div class="poke5e-contest-roll-dialog">
        <p>Realiza la prueba de talento para un concurso <strong>${escapeHtml(CONTEST_TYPES[contestType].label)}</strong>.</p>
        <label><span>Método de la prueba</span><select name="method">${methodOptions}</select></label>
        <label><span>CD del juez</span><input type="number" name="dc" min="1" max="40" value="11"></label>
        <label><span>Modo de tirada</span><select name="rollMode"><option value="normal">Normal</option><option value="advantage">Ventaja</option><option value="disadvantage">Desventaja</option></select></label>
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: game.i18n.localize("POKE5E.Contest.PerformMove"),
        icon: "fa-solid fa-star",
        callback: (dialogEvent, button) => ({
          method: button.form.elements.method.value,
          dc: Math.max(1, Number(button.form.elements.dc.value) || 11),
          rollMode: button.form.elements.rollMode.value
        })
      }
    });
  } catch {
    return null;
  }
}

/**
 * HTML del mensaje de chat de una prueba de concurso, con el resultado, los
 * puntos de Appeal y Crowd que devuelve contestAppealOutcome(), el Jam y el
 * efecto del movimiento. Solo lo usa #rollContestMove().
 */
function contestChatCard({ move, method, selection, details, compatibility, outcome }) {
  const points = outcome.points > 0 ? `+${outcome.points}` : String(outcome.points);
  const crowd = outcome.crowd > 0 ? `+${outcome.crowd}` : String(outcome.crowd);
  const result = outcome.critical ? "¡Éxito crítico!" : outcome.fumble ? "Pifia" : outcome.success ? "Éxito" : "Fallo";
  return `<div class="dnd5e chat-card poke5e-contest-chat contest-${details.contest}">
    <header class="card-header"><h3>${escapeHtml(move.name)} · ${escapeHtml(details.label)}</h3></header>
    <p><strong>${escapeHtml(result)}</strong> · ${escapeHtml(compatibility.label)} · CD ${selection.dc}</p>
    <p><strong>Prueba:</strong> ${escapeHtml(method.label)} (${signed(method.modifier)})</p>
    <div class="poke5e-contest-chat-score"><span>Appeal <strong>${points}</strong></span><span>Crowd <strong>${crowd}</strong></span><span>Jam <strong>${details.jam}</strong></span></div>
    <h4>${escapeHtml(details.effect.name)}</h4><p>${escapeHtml(details.effect.effect)}</p>
  </div>`;
}

/**
 * Texto legible del campo `power` de un movimiento ("Cualquier característica",
 * "Variable", "Interpretación" o la lista de siglas), para la tarjeta de
 * concurso que arma prepareMove().
 */
function contestPowerLabel(move) {
  const configured = Array.isArray(move.power) ? move.power : move.power ? [move.power] : [];
  if (!configured.length || configured.includes("any")) return "Cualquier característica";
  if (configured.includes("varies")) return "Variable";
  if (configured.includes("none")) return "Interpretación";
  return configured.map(value => value.toUpperCase()).join(" / ");
}

/**
 * Resuelve el tipo de daño de una tirada: lo deduce solo cuando
 * normalizeMoveDamageTypes() devuelve uno único y, si hay varios, lo pregunta.
 * Devuelve "typeless" si el movimiento no declara ninguno y null si se cancela,
 * en cuyo caso #rollMove() aborta sin gastar PP.
 */
async function chooseDamageType(move) {
  const types = normalizeMoveDamageTypes(move.damage?.type);
  if (!types.length) return "typeless";
  if (types.length === 1) return types[0];
  const options = types.map(type => `<option value="${escapeHtml(type)}" ${type === move.type ? "selected" : ""}>${escapeHtml(typeLabel(type))}</option>`).join("");
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("POKE5E.PokemonDialogs.DamageTypeTitle", { move: move.name }) },
      content: `<div class="poke5e-damage-type-dialog"><p>Este movimiento puede causar varios tipos de daño. Elige el que se aplica en esta tirada.</p><label><span>Tipo de daño</span><select name="damageType">${options}</select></label></div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: game.i18n.localize("POKE5E.Common.Continue"),
        icon: "fa-solid fa-burst",
        callback: (event, button) => button.form.elements.damageType.value
      }
    });
  } catch {
    return null;
  }
}

/** Convierte un tipo en {id, etiqueta} para las listas de afinidades. */
function prepareType(type) {
  return { id: type, label: typeLabel(type) };
}

/**
 * Describe los objetivos seleccionados en el formato que espera D&D 5e para
 * aplicar el daño automáticamente desde el mensaje de chat, omitiendo la CA de
 * quien tenga cobertura total. Auxiliar de #rollMove().
 */
function targetDescriptors() {
  const targets = new Map();
  for (const token of game.user.targets ?? []) {
    const actor = token.actor;
    if (!actor?.uuid) continue;
    targets.set(actor.uuid, {
      actor: actor.uuid,
      token: token.document?.uuid ?? null,
      name: token.name,
      img: actor.img,
      uuid: actor.uuid,
      ac: actor.statuses?.has("coverTotal") ? null : actor.system.attributes?.ac?.value ?? null
    });
  }
  return [...targets.values()];
}

/**
 * Devuelve la versión principal del sistema D&D5e que está ejecutando
 * Foundry. Se usa para adaptar la publicación del mensaje de daño.
 */
function dnd5eSystemMajor() {
  return Number.parseInt(String(game.system?.version ?? "0").split(".")[0], 10);
}

/**
 * Configura una DamageRoll con la API disponible desde D&D5e 5.3, la versión
 * mínima compatible con el módulo. `critical` está reservado para un objeto de
 * configuración; el estado booleano del crítico siempre va en `isCritical`.
 */
function damageRollOptions(type, critical = false) {
  return { type, isCritical: Boolean(critical) };
}

/**
 * Configura un mensaje de DamageRoll para las dos APIs compatibles del sistema:
 * D&D5e 5.x lee flags.dnd5e y D&D5e 6.x usa el tipo de mensaje `damage` junto
 * con system.targets. Conservar ambos formatos evita perder los botones de
 * aplicación y, con ellos, resistencias, vulnerabilidades e inmunidades.
 */
function damageRollMessageData({ speaker, flavor, rollType = "damage" }) {
  const targets = targetDescriptors();
  const data = {
    speaker,
    flavor,
    flags: { dnd5e: { messageType: "roll", roll: { type: rollType }, targets } }
  };
  const systemMajor = dnd5eSystemMajor();
  if (systemMajor >= 6) {
    data.type = "damage";
    data.system = { targets };
  }
  return data;
}

/**
 * Publica una tirada ya evaluada usando la firma nativa de cada versión.
 * Desde D&D5e 6.x DamageRoll.toMessage() es estático y recibe una lista de
 * tiradas; llamar al método heredado de Roll crea un mensaje inválido y corta
 * el flujo justo después de la tirada de impacto.
 */
async function postDamageRoll(roll, message) {
  const data = damageRollMessageData(message);
  const systemMajor = dnd5eSystemMajor();
  if (systemMajor >= 6 && typeof roll?.constructor?.toMessage === "function") {
    return roll.constructor.toMessage([roll], data);
  }
  return roll.toMessage(data);
}

/**
 * Presenta el sexo del Pokémon con su icono y la probabilidad de la especie,
 * calculada desde la proporción "F:M" que usa randomGenderForRatio() (model.mjs).
 * Auxiliar de _prepareContext().
 */
function prepareGender(gender, ratio) {
  const labels = {
    female: { label: game.i18n.localize("POKE5E.Gender.Female"), icon: "fa-venus" },
    male: { label: game.i18n.localize("POKE5E.Gender.Male"), icon: "fa-mars" },
    none: { label: game.i18n.localize("POKE5E.Gender.None"), icon: "fa-genderless" },
    other: { label: game.i18n.localize("POKE5E.Gender.Other"), icon: "fa-transgender" }
  };
  const value = labels[gender] ? gender : "none";
  const [female, male] = String(ratio ?? "0:0").split(":").map(entry => Number(entry) || 0);
  const total = female + male;
  const probability = total ? `${Math.round((female / total) * 100)}% hembra · ${Math.round((male / total) * 100)}% macho` : "Especie sin sexo";
  return { value, ...labels[value], probability };
}

/**
 * Prepara las evoluciones posibles: traduce sus condiciones con
 * evolutionConditionLabel() y consulta evolutionReadiness() para saber si el
 * botón debe estar activo y si requiere confirmación de la mesa.
 * Auxiliar de _prepareContext(); quien evoluciona es #evolve().
 */
function prepareEvolutions(evolutions, data, instance) {
  return evolutions.map(evolution => {
    const readiness = evolutionReadiness(evolution, {
      level: instance.level,
      gender: instance.gender,
      knownMoveIds: (instance.moves ?? []).map(entry => entry.moveId),
      movesById: data.movesById
    });
    return {
    id: evolution.id,
    toId: evolution.to,
    toName: data.pokemonById.get(evolution.to)?.name ?? evolution.to,
    level: evolution.conditions.find(condition => condition.type === "level")?.value ?? null,
    conditions: evolution.conditions.map(condition => evolutionConditionLabel(condition, data)),
    available: readiness.available,
    manualConfirmation: readiness.manual.length > 0
  };
  });
}

/**
 * Traduce una condición de evolución a texto, resolviendo nombres de objetos y
 * movimientos contra el catálogo. Versión extendida de la conditionShortLabel()
 * de model.mjs; la usan prepareEvolutions() y promptEvolution().
 */
function evolutionConditionLabel(condition, data) {
  if (condition.type === "level") return `Nivel ${condition.value}`;
  if (condition.type === "item") return `Usar ${data.itemsById.get(condition.value)?.name ?? evolutionRequirementLabel(condition.value, "item")}`;
  if (condition.type === "loyalty") return `Vínculo +${condition.value}`;
  if (condition.type === "move") return `Conocer ${data.movesById.get(condition.value)?.name ?? evolutionRequirementLabel(condition.value, "move")}`;
  if (condition.type === "move-type") return `Conocer un movimiento de tipo ${typeLabel(condition.value)}`;
  if (condition.type === "gender") return condition.value === "female" ? "Solo hembras" : "Solo machos";
  if (condition.type === "time") return `Durante: ${evolutionTimeLabel(condition.value)}`;
  return String(condition.value ?? "Condición especial");
}

function evolutionTimeLabel(value) {
  return { morning: "la mañana", day: "el día", afternoon: "la tarde", night: "la noche" }[value] ?? String(value ?? "un momento especial");
}

function attackScopeLabel(scope) {
  return { melee: "cuerpo a cuerpo", ranged: "a distancia" }[String(scope ?? "").toLowerCase()] ?? String(scope ?? "ataque");
}

/** Validates every selected target before PP or any special move effect is spent. */
function validateMoveTargetRanges(combatActor, targets, move) {
  const maximum = moveMaximumRange(move);
  if (maximum == null || !targets.length) return true;
  const sourceToken = canvas.tokens?.placeables?.find(token => token.actor?.id === combatActor?.id);
  if (!sourceToken?.center) {
    ui.notifications.warn(game.i18n.localize("POKE5E.Notifications.MoveRangeNeedsToken"));
    return false;
  }
  for (const target of targets) {
    if (!target?.center) continue;
    const distance = Number(canvas.grid.measurePath([sourceToken.center, target.center]).distance);
    if (!isMoveTargetInRange(move, distance)) {
      ui.notifications.warn(game.i18n.format("POKE5E.Notifications.MoveOutOfRange", {
        target: target.name,
        distance: Math.round(distance * 10) / 10,
        range: maximum
      }));
      return false;
    }
  }
  return true;
}

/**
 * Prepara un movimiento aprendido para la plantilla: PP, bonificador de ataque o
 * CD de salvación calculados con getMoveModifier() y la competencia por nivel,
 * fórmula de daño de damageFormula(), modificaciones del objeto equipado,
 * datos de concurso y un aviso si dejó de ser compatible con la especie.
 * Auxiliar de _prepareContext(); su gemela para el catálogo es prepareCatalogMove().
 */
function prepareMove(entry, move, species, level, effectsById, contestType, heldItem = null, trainer = null, abilities = []) {
  const proficiency = 2 + Math.floor((level - 1) / 4);
  const heldMove = heldItemEffectiveMove(move, { sourceId: heldItem?.sourceId, speciesId: species.id });
  const effectiveMove = { ...heldMove, time: abilityMoveActivationTime(abilities, { moveId: heldMove.id, time: heldMove.time, healing: moveIsHealing(heldMove) }) };
  const profile = heldItemMoveModifiers({
    sourceId: heldItem?.sourceId, speciesId: species.id, speciesTypes: species.type ?? [],
    move: effectiveMove, proficiency, hasDamage: moveHasImmediateDamage(effectiveMove)
  });
  const pathProfile = pokemonPathMoveBonuses(trainer, species.type ?? [], effectiveMove.type, { healing: moveIsHealing(effectiveMove) });
  const modifier = getMoveModifier(species, effectiveMove) + profile.moveModifierBonus;
  const attackModifier = modifier * profile.attackMoveMultiplier;
  const damageModifier = modifier * profile.damageMoveMultiplier;
  const eligibility = moveEligibility(species, effectiveMove, level);
  return {
    entryId: entry.id,
    name: effectiveMove.name,
    type: effectiveMove.type ?? "normal",
    time: effectiveMove.time ?? "—",
    range: effectiveMove.range ?? "—",
    description: moveDescription(effectiveMove),
    pp: entry.pp,
    hasPp: Number(entry.pp?.max) > 0,
    attackBonus: effectiveMove.attack?.scope ? signed(attackModifier + proficiency + profile.attack + pathProfile.attack) : null,
    saveDc: effectiveMove.save ? 8 + attackModifier + proficiency : null,
    damage: damageFormula(effectiveMove, level, damageModifier, species, profile.damage + pathProfile.damage, profile.stab + pathProfile.stab, 1, false, typeMasteryForcesStab(trainer, species.type ?? [])) ?? "—",
    contest: prepareContestDisplay(effectiveMove, effectsById, contestType),
    learningMethods: eligibility.methods,
    learningWarning: learningWarning(eligibility)
  };
}

/**
 * Explica por qué un movimiento compatible no está disponible todavía: nivel
 * pendiente, MT/MO no poseída o —caso de los movimientos huevo, que
 * moveEligibility() nunca marca como disponibles al subir de nivel— que solo
 * se obtienen al generar el Pokémon. Auxiliar de prepareMove() y
 * prepareCatalogMove().
 */
function learningWarning(eligibility) {
  if (!eligibility.compatible) return "No figura en los movimientos de esta especie";
  if (eligibility.availableNow) return "";
  if (eligibility.requiredLevel != null) return `Requiere nivel ${eligibility.requiredLevel}`;
  if (eligibility.requiresMachine) return `Requiere ${eligibility.machine.label} ${eligibility.machine.id}`;
  if (eligibility.methods.some(method => method.id === "egg")) return "Solo se aprende al generar el Pokémon (huevo)";
  return "";
}

/**
 * Enriquece una entrada del gestor de movimientos con los mismos datos
 * calculados que prepareMove(), partiendo de lo que devuelve filterMoveCatalog()
 * y sin los PP, que solo existen una vez aprendido.
 */
function prepareCatalogMove(entry, move, species, level, effectsById, contestType, trainer = null) {
  if (!move) return entry;
  const modifier = getMoveModifier(species, move);
  const proficiency = 2 + Math.floor((level - 1) / 4);
  const pathProfile = pokemonPathMoveBonuses(trainer, species.type ?? [], move.type, { healing: moveIsHealing(move) });
  return {
    ...entry,
    time: move.time ?? "—",
    range: move.range ?? "—",
    duration: move.duration ?? "—",
    description: moveDescription(move),
    attackBonus: move.attack?.scope ? signed(modifier + proficiency + pathProfile.attack) : null,
    saveDc: move.save ? 8 + modifier + proficiency : null,
    damage: damageFormula(move, level, modifier, species, pathProfile.damage, pathProfile.stab, 1, false, typeMasteryForcesStab(trainer, species.type ?? [])) ?? "—",
    contest: prepareContestDisplay(move, effectsById, contestType)
  };
}

/**
 * Reúne los datos de concurso de un movimiento (contestDetailsForMove()), su
 * compatibilidad con la categoría elegida y la característica que usa.
 * La comparten prepareMove() y prepareCatalogMove().
 */
function prepareContestDisplay(move, effectsById, contestType) {
  const details = contestDetailsForMove(move, effectsById);
  return {
    ...details,
    compatibility: contestCompatibility(contestType, details.contest),
    power: contestPowerLabel(move)
  };
}

/**
 * Pregunta qué movimiento olvidar cuando ya se conocen cuatro y devuelve el id
 * de la entrada elegida, o null si se cancela. Solo la usa #addMove(), que pasa
 * ese id a applyLearnedMove().
 */
async function chooseMoveToForget(knownMoves, newMove, movesById) {
  const options = knownMoves.map(entry => {
    const move = movesById.get(entry.moveId);
    const name = move?.name ?? entry.moveId;
    return `<option value="${escapeHtml(entry.id)}">${escapeHtml(name)}</option>`;
  }).join("");
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("POKE5E.PokemonDialogs.LearnMoveTitle", { move: newMove.name }) },
      content: `<div class="poke5e-forget-dialog">
        <p>Un Pokémon solo puede conocer cuatro movimientos. Para aprender <strong>${escapeHtml(newMove.name)}</strong>, elige cuál debe olvidar.</p>
        <label><span>Movimiento que olvidar</span><select name="forgottenMove">${options}</select></label>
        <div class="poke5e-description">${moveDescription(newMove)}</div>
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: game.i18n.localize("POKE5E.PokemonDialogs.ForgetAndLearn"),
        icon: "fa-solid fa-arrows-rotate",
        callback: (event, button) => button.form.elements.forgottenMove.value
      }
    });
  } catch {
    return null;
  }
}

/**
 * Crea la entrada de un movimiento recién aprendido, con id propio y los PP a
 * tope. Auxiliar de #addMove().
 */
function moveEntry(move) {
  const pp = Math.max(Number(move?.pp) || 0, 0);
  return { id: foundry.utils.randomID(), moveId: move.id, pp: { value: pp, max: pp } };
}

/**
 * Explica por qué no puede aprenderse un movimiento: si es cuestión de nivel
 * indica cuál hace falta, y si no, que la especie no lo admite.
 * La usan #learnMove() y #onDrop() con el resultado de moveEligibility().
 */
function notifyMoveUnavailable(move, eligibility) {
  if (eligibility.requiresMachine) return ui.notifications.warn(game.i18n.format("POKE5E.PokemonNotifications.RequiresMachine", { move: move.name, machine: eligibility.machine.label, id: eligibility.machine.id }));
  if (eligibility.future) return ui.notifications.warn(game.i18n.format("POKE5E.PokemonNotifications.FutureMove", { move: move.name, level: eligibility.requiredLevel }));
  return ui.notifications.warn(game.i18n.format("POKE5E.PokemonNotifications.CannotLearn", { move: move.name }));
}

/** Recoge las MT/MO con cantidad disponible en el inventario del entrenador. */
function trainerMoveMachineIds(actor) {
  const result = new Set();
  if (actor?.type !== "character") return result;
  for (const item of actor.items ?? []) {
    if (Number(item.system?.quantity ?? 1) <= 0) continue;
    if (item.getFlag?.(MODULE_ID, "kind") !== "move-machine") continue;
    const machine = item.getFlag?.(MODULE_ID, "machine");
    const kind = String(machine?.kind ?? "").toLocaleLowerCase();
    if (["tm", "hm"].includes(kind) && machine.id != null && machine.moveId) result.add(`${kind}:${machine.id}`);
  }
  return result;
}

/** Consume una MT al enseñar; las MO no se gastan y Poké Mentor duplica usos. */
async function consumeMoveMachine(actor, machine) {
  const item = [...(actor?.items ?? [])].find(candidate => {
    if (candidate.getFlag?.(MODULE_ID, "kind") !== "move-machine") return false;
    const stored = candidate.getFlag?.(MODULE_ID, "machine");
    return String(stored?.kind) === String(machine?.kind) && String(stored?.id) === String(machine?.id) && Number(candidate.system?.quantity ?? 1) > 0;
  });
  if (!item) return;
  const used = Number(item.getFlag(MODULE_ID, "machine")?.used) || 0;
  const result = machineConsumption({
    kind: machine.kind,
    quantity: item.system?.quantity ?? 1,
    used,
    pokeMentor: hasTrainerPath(actor, "poke-mentor", 2)
  });
  if (result.delete) await item.delete();
  else await item.update({ "system.quantity": result.quantity, [`flags.${MODULE_ID}.machine.used`]: result.used });
  const key = machine.kind === "hm"
    ? "POKE5E.PokemonNotifications.HmReusable"
    : result.consumed ? "POKE5E.PokemonNotifications.TmConsumed" : "POKE5E.PokemonNotifications.TmUseRemaining";
  ui.notifications.info(game.i18n.format(key, { machine: `${machine.label} ${machine.id}` }));
}

/**
 * Calcula MOVE, el modificador de un movimiento: el mayor de las características
 * que admite su campo `power`, o 0 si no usa ninguna. Base del bonificador de
 * ataque, de la CD de salvación y del daño en todo el archivo.
 */
function getMoveModifier(species, move) {
  const configured = Array.isArray(move.power) ? move.power : move.power ? [move.power] : [];
  if (configured.includes("none")) return 0;
  const allowed = !configured.length || configured.some(value => value === "any" || value === "varies")
    ? ["str", "dex", "con", "int", "wis", "cha"] : configured;
  return Math.max(...allowed.map(key => Math.floor(((Number(species.attributes?.[key]) || 10) - 10) / 2)));
}

/**
 * Compone la fórmula de daño: elige los dados del tramo de nivel alcanzado y le
 * suma el modificador que indique el movimiento (MOVE, LEVEL, un número fijo,
 * "MOVE + n" o "MOVE + STAB", que añade 2 si el tipo coincide con el del
 * Pokémon, o siempre que `forceStab` sea true —Liberar poder, Type Master
 * 15—). `effectDamage` incorpora bonos una vez por movimiento y
 * `heldItemStab` amplía el STAB de objetos compatibles. Devuelve null si el
 * movimiento no causa daño.
 * La usan prepareMove(), prepareCatalogMove() y #rollMove().
 */
function moveIsHealing(move) {
  const types = Array.isArray(move?.damage?.type) ? move.damage.type : [move?.damage?.type].filter(Boolean);
  return types.includes("healing");
}

function damageFormula(move, level, moveModifier, species, effectDamage = 0, heldItemStab = 0, diceMultiplier = 1, extraDie = false, forceStab = false) {
  const baseDice = resolveDamageDice(move, level);
  if (!baseDice) return null;
  let dice = diceMultiplier !== 1 ? scaleDiceCount(baseDice, diceMultiplier) : baseDice;
  if (extraDie) dice = addExtraDie(dice);
  const modifier = move.damage.modifier;
  let formula = String(dice);
  if (modifier === "MOVE") formula = appendModifier(dice, moveModifier);
  else if (modifier === "LEVEL") formula = appendModifier(dice, level);
  else if (typeof modifier === "number") formula = appendModifier(dice, modifier);
  else if (typeof modifier === "string" && modifier.startsWith("MOVE +")) formula = appendModifier(dice, moveModifier + (Number(modifier.split("+")[1]) || 0));
  // Liberar poder (Type Master 15): forceStab deja sumar el STAB aunque el
  // movimiento no comparta tipo con el Pokémon, para quien coincida con una
  // especialización del entrenador.
  else if (modifier === "MOVE + STAB") formula = appendModifier(dice, moveModifier + ((species.type ?? []).includes(move.type) || forceStab ? 2 + heldItemStab : 0));
  return appendModifier(formula, effectDamage);
}

/** Dados de daño del nivel actual, sin modificador. Auxiliar de damageFormula() y de la cadena de golpes múltiples. */
function resolveDamageDice(move, level) {
  const diceByLevel = move.damage?.dice;
  if (!diceByLevel) return null;
  const tiers = Object.keys(diceByLevel).map(Number).filter(tier => tier <= level).sort((a, b) => b - a);
  return diceByLevel[String(tiers[0] ?? 1)] ?? null;
}

/**
 * Tira la cadena de golpes múltiples tras un impacto inicial: hasta 4 tiradas
 * de 1d4, continuando mientras salga 3 o 4 (resolveChainHits()), y publica un
 * único mensaje con el daño de los golpes adicionales confirmados —solo los
 * dados del movimiento, sin repetir el modificador MOVE, tal como describe el
 * texto original. Auxiliar de #rollMove().
 */
async function rollChainMultiHit(move, level, damageType, flavor, speaker, maxExtra = 4, minimumExtra = 0) {
  const chainRolls = [];
  for (let i = 0; i < maxExtra; i++) {
    const roll = await new Roll("1d4").evaluate();
    chainRolls.push(Number(roll.total));
    if (Number(roll.total) < 3) break;
  }
  const extraHits = Math.max(Number(minimumExtra) || 0, resolveChainHits(chainRolls, maxExtra));
  if (!extraHits) return;
  const baseDice = resolveDamageDice(move, level);
  if (!baseDice) return;
  const extraFormula = Array(extraHits).fill(baseDice).join(" + ");
  const DamageRoll = CONFIG.Dice?.DamageRoll;
  const extraDamage = DamageRoll
    ? await new DamageRoll(extraFormula, {}, { type: damageType }).evaluate()
    : await new Roll(extraFormula).evaluate();
  await postDamageRoll(extraDamage, {
    speaker,
    flavor: `${flavor} — ${extraHits} golpe${extraHits === 1 ? "" : "s"} adicional${extraHits === 1 ? "" : "es"} (${typeLabel(damageType)})`
  });
}

/**
 * Localiza el Item Pokémon que respalda a un actor de combate: por el UUID que
 * guarda un desplegado o, si no lo hay, entre los Items embebidos de un
 * salvaje. Mismo patrón duplicado ya presente en status-effects.mjs,
 * held-items.mjs y ongoing-effects.mjs. Auxiliar de #rollMove() para los
 * movimientos que curan o consultan el estado de un objetivo ajeno
 * (Purificación, Bofetón Despertador...).
 */
async function pokemonItemForActor(actor) {
  const uuid = actor?.getFlag(MODULE_ID, "pokemonItemUuid");
  if (uuid) return fromUuid(uuid);
  return actor?.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? null;
}

/**
 * Ventosas (sticky-hold, lote 14): avisa en el chat y devuelve true si el
 * objetivo la conoce, para que Cambiazo/Ladrón/Robo no le roben ni destruyan
 * el objeto equipado. Acepta tanto una entrada de `selectedTokens` (`.name`)
 * como una de rollFailedSaves() (`.tokenName`). Auxiliar de #rollMove().
 */
async function stickyHoldProtects(target) {
  const targetPokemonItem = await pokemonItemForActor(target.actor);
  if (!abilityProtectsHeldItem(targetPokemonItem?.getFlag(MODULE_ID, "instance")?.abilities)) return false;
  await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(target.name ?? target.tokenName ?? "")}</strong> protege su objeto equipado con Ventosas.</p></div>` });
  return true;
}

/**
 * Descuenta el retroceso proporcional (Head Charge, Head Smash...) de los PG
 * del propio usuario y lo anuncia en el chat. El actor de combate siempre
 * pertenece a quien tira el movimiento, así que no necesita el delegado de
 * socket que sí usan los efectos sobre objetivos ajenos. Auxiliar de
 * #rollMove().
 */
async function applySelfRecoil(ownerActor, combatActor, amount, speaker, flavor) {
  if (!combatActor || amount <= 0) return;
  const hp = combatActor.system.attributes?.hp;
  if (!hp) return;
  await combatActor.update({ "system.attributes.hp.value": Math.max(0, Number(hp.value) - amount) });
  await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p>${escapeHtml(flavor)} — retroceso: <strong>${amount}</strong> PG típeless.</p></div>` });
}

/**
 * Cura al propio usuario una fracción del daño infligido (Absorber, Golpe
 * Drenaje, Drenadoras, Drenadoras, Chupavidas...). Mismo motivo que
 * applySelfRecoil(): el actor de combate siempre pertenece a quien tira el
 * movimiento, así que se escribe directamente sin delegar en el director.
 */
async function applySelfDrain(combatActor, amount, speaker, flavor) {
  if (!combatActor || amount <= 0) return;
  const hp = combatActor.system.attributes?.hp;
  if (!hp) return;
  const healed = Math.min(Number(hp.max) - Number(hp.value), amount);
  if (healed <= 0) return;
  await combatActor.update({ "system.attributes.hp.value": Number(hp.value) + healed });
  await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card poke5e-status-card"><p>${escapeHtml(flavor)} — drena: <strong>${healed}</strong> PG.</p></div>` });
}

/** Añade el modificador a la expresión de dados con su signo. Auxiliar de damageFormula(). */
function appendModifier(dice, modifier) {
  if (!modifier) return String(dice);
  return `${dice} ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}`;
}

/**
 * Descripción HTML de un movimiento, con sus bloques (descriptionBlock()) y el
 * apartado de niveles superiores. La usan la ficha, los diálogos y los mensajes
 * de chat de este archivo.
 */
function moveDescription(move) {
  const blocks = Array.isArray(move.description) ? move.description : move.description ? [move.description] : [];
  const body = blocks.map(descriptionBlock).join("");
  return `${body}${move.higherLevels ? `<h3>A niveles superiores</h3><p>${escapeHtml(move.higherLevels)}</p>` : ""}`;
}

/**
 * Convierte un bloque de descripción en HTML: párrafo si es texto y tabla si el
 * JSON declara una. Auxiliar de moveDescription().
 */
function descriptionBlock(block) {
  if (typeof block === "string") return `<p>${escapeHtml(block)}</p>`;
  if (block?.type !== "table") return "";
  const headers = (block.headers ?? []).map(value => `<th>${escapeHtml(value)}</th>`).join("");
  const rows = (block.rows ?? []).map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Traduce las velocidades de la especie a etiqueta e icono para la ficha.
 * Auxiliar de _prepareContext(); wild-deployment.mjs hace la conversión
 * equivalente hacia el bloque `movement` de D&D 5e.
 */
function prepareSpeeds(speeds = []) {
  const display = {
    walking: { label: game.i18n.localize("POKE5E.Movement.Walking"), icon: "fa-person-walking" },
    flying: { label: game.i18n.localize("POKE5E.Movement.Flying"), icon: "fa-dove" },
    swimming: { label: game.i18n.localize("POKE5E.Movement.Swimming"), icon: "fa-person-swimming" },
    burrowing: { label: game.i18n.localize("POKE5E.Movement.Burrowing"), icon: "fa-trowel" },
    climbing: { label: game.i18n.localize("POKE5E.Movement.Climbing"), icon: "fa-mountain" },
    hover: { label: game.i18n.localize("POKE5E.Movement.Hover"), icon: "fa-wind" }
  };
  return speeds.map(speed => ({
    type: speed.type,
    value: Number(speed.value) || 0,
    label: display[speed.type]?.label ?? titleCase(speed.type),
    icon: display[speed.type]?.icon ?? "fa-shoe-prints"
  }));
}

/**
 * Pide los PX que se van a sumar y devuelve 0 si se cancela.
 * Solo la usa #addExperience().
 */
async function promptExperienceAmount() {
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("POKE5E.PokemonDialogs.AddExperience") },
      content: `<div class="poke5e-experience-dialog">
        <p>Introduce los PX obtenidos. Si se alcanza el siguiente umbral, el nivel aumentará automáticamente.</p>
        <label><span>Experiencia obtenida</span><input type="number" name="amount" min="1" step="1" value="100" autofocus></label>
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: game.i18n.localize("POKE5E.PokemonDialogs.AddXP"),
        icon: "fa-solid fa-plus",
        callback: (event, button) => Math.max(0, Math.trunc(Number(button.form.elements.amount.value) || 0))
      }
    });
  } catch {
    return 0;
  }
}

/**
 * Diálogo de evolución: resume lo que conserva y lo que gana el Pokémon, exige
 * marcar las condiciones que solo puede confirmar la mesa y, si la evolución
 * concede puntos de característica, ofrece repartirlos —o, con Experto en
 * evolución (Researcher 9), gastar 2 en una dote en vez de característica,
 * dejando el resto para el contador de siempre—. Devuelve ese reparto (más
 * `__researcherFeat` si se eligió dote), que #evolve() valida con
 * applyAbilityAllocation(), o null si se cancela.
 */
async function promptEvolution({ evolution, target, data, instance, species, asiPoints, manual, trainer }) {
  const attributes = instance.attributes ?? species.attributes ?? {};
  const researcherEligible = asiPoints >= 2 && hasTrainerPath(trainer, "researcher", 9);
  const featOptions = researcherEligible ? await pokemonFeatOptions() : [];
  const featGroups = new Map();
  for (const entry of featOptions) featGroups.set(entry.group, [...(featGroups.get(entry.group) ?? []), entry]);
  const researcherFeatField = researcherEligible ? `<fieldset>
    <legend>Experto en evolución (Investigador 9)</legend>
    <label><span>Gastar 2 puntos en una dote en vez de característica</span>
      <select name="researcherFeat" class="poke5e-feat-select" data-action="researcher-feat" size="8">
        <option value="">Ninguna (repartir todo en características)</option>
        ${[...featGroups.entries()].map(([group, entries]) => `<optgroup label="${escapeHtml(group)}">${entries.map(entry => `<option value="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</option>`).join("")}</optgroup>`).join("")}
      </select>
    </label>
  </fieldset>` : "";
  const allocation = asiPoints ? `<fieldset class="poke5e-asi-allocation">
    <legend>Distribuye ${asiPoints} puntos de característica</legend>
    <p>Máximo 4 puntos por característica; ninguna puede superar 20. Puntos restantes: <strong data-remaining>${asiPoints}</strong></p>
    ${stepperGrid(ABILITIES, attributes)}
  </fieldset>` : "";
  const manualConfirmation = manual.length ? `<label class="poke5e-manual-confirmation">
    <input type="checkbox" name="manualConfirmed">
    <span>Confirmo que se cumplen: ${manual.map(condition => escapeHtml(evolutionConditionLabel(condition, data))).join(" · ")}</span>
  </label>` : "";
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("POKE5E.PokemonDialogs.EvolveTitle", { pokemon: target.name }) },
      content: `<div class="poke5e-evolution-dialog">
        <p><strong>${escapeHtml(displayPokemonName({ getFlag: () => instance, name: species.name }))}</strong> evolucionará a <strong>${escapeHtml(target.name)}</strong>. Mantendrá su nivel, experiencia, sexo, movimientos y daño recibido.</p>
        <p>Obtendrá la CA y defensas de su nueva forma, además de ${2 * (Number(instance.level) || 1)} PG máximos.</p>
        ${manualConfirmation}${researcherFeatField}${allocation}
      </div>`,
      modal: true,
      rejectClose: false,
      render: asiPoints ? (event, dialog) => {
        const bindStepper = () => {
          const featCost = researcherEligible && dialog.element.querySelector("select[name='researcherFeat']")?.value ? 2 : 0;
          attachStepperGroup(dialog.element, Object.keys(ABILITIES), asiPoints - featCost, {
            maxFor: key => Math.min(4, Math.max(0, 20 - (Number(attributes[key]) || 10)))
          });
        };
        dialog.element.querySelector("[data-action='researcher-feat']")?.addEventListener("change", bindStepper);
        bindStepper();
      } : undefined,
      ok: {
        label: game.i18n.localize("POKE5E.PokemonDialogs.Evolve"),
        icon: "fa-solid fa-dna",
        callback: (dialogEvent, button) => {
          const form = button.form;
          if (manual.length && !form.elements.manualConfirmed.checked) return null;
          const result = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(key => [key, Math.trunc(Number(form.elements[`asi-${key}`]?.value) || 0)]));
          const feat = String(form.elements.researcherFeat?.value ?? "").trim();
          if (feat) result.__researcherFeat = feat;
          return result;
        }
      }
    });
  } catch {
    return null;
  }
}

/**
 * Valida y aplica el reparto de puntos de una evolución: exige gastarlos todos,
 * un máximo de 4 por característica y no superar 20. Solo modifica `attributes`
 * si el reparto entero es válido; devuelve false en caso contrario.
 * La usa #evolve().
 */
function applyAbilityAllocation(attributes, allocation, expectedPoints) {
  if (!allocation || Object.values(allocation).some(value => value < 0 || value > 4)) return false;
  if (Object.values(allocation).reduce((total, value) => total + value, 0) !== expectedPoints) return false;
  for (const [key, increase] of Object.entries(allocation)) {
    const current = Number(attributes[key]) || 10;
    if (current + increase > 20) return false;
  }
  for (const [key, increase] of Object.entries(allocation)) attributes[key] = (Number(attributes[key]) || 10) + increase;
  return true;
}

/**
 * Determina las habilidades tras evolucionar: conserva las que la nueva especie
 * también tenga y, si no queda ninguna, le asigna la primera no oculta.
 * Auxiliar de #evolve().
 */
function evolvedAbilities(current = [], target) {
  const available = (target.abilities ?? []).filter(entry => !entry.hidden).map(entry => entry.id);
  const retained = current.filter(id => available.includes(id));
  return retained.length ? retained : available.slice(0, 1);
}

/**
 * Descuenta una unidad del inventario del entrenador, borrando el Item si era la
 * última. La usa #equipHeldItem(); su inversa es returnHeldItem().
 */
async function decrementInventoryItem(item) {
  const quantity = Math.max(1, Number(item.system.quantity) || 1);
  if (quantity <= 1) await item.delete();
  else await item.update({ "system.quantity": quantity - 1 });
}

/**
 * Devuelve al inventario el objeto que llevaba el Pokémon: suma uno a la pila
 * existente o crea el Item con gearItemSource() (model.mjs).
 * Inversa de decrementInventoryItem(); la usa #equipHeldItem().
 */
async function returnHeldItem(trainer, heldItem, data) {
  const existing = trainer.items.find(item => item.getFlag(MODULE_ID, "kind") === "gear" && item.getFlag(MODULE_ID, "sourceId") === heldItem.sourceId);
  if (existing) return existing.update({ "system.quantity": Math.max(0, Number(existing.system.quantity) || 0) + 1 });
  const definition = data.itemsById.get(heldItem.sourceId);
  if (definition) return trainer.createEmbeddedDocuments("Item", [gearItemSource(definition)]);
}
