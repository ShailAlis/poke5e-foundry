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
import { MODULE_ID, MODULE_PATH, displayPokemonName, gearItemSource, portraitUrl } from "../core/model.mjs";
import { pokedollars, updatePokedollars } from "../world/economy.mjs";
import { MAX_KNOWN_MOVES, applyLearnedMove, filterMoveCatalog, moveEligibility } from "./move-learning.mjs";
import { normalizeMoveDamageTypes, pokemonDefenses, typeLabel } from "../combat/combat.mjs";
import { deployedActorFor, recallPokemon, syncPokemonHeldItemToDeployment, syncPokemonIdentityToDeployment } from "../world/deployment.mjs";
import { CONTEST_TYPES, contestAppealOutcome, contestCompatibility, contestDetailsForMove, contestTypeOptions } from "../world/contests.mjs";
import { applyMoveStatuses, pokemonStatusEntries, pokemonStatusId, removePokemonStatus } from "../combat/status-effects.mjs";
import { applyMoveOngoingEffects, moveHasImmediateDamage, ongoingEffectEntries, removeOngoingEffect } from "../combat/ongoing-effects.mjs";
import { applyDynamicModifier, applyMoveLock, applyMoveModifierEffects, attackHitsPokemonTarget, consecutiveStrikeStacks, consumeCapturedMoveModifiers, isMoveRecharging, moveModifierEntries, moveModifierIdsToConsume, pokemonCombatModifiers, removeAllMoveModifiers, removeMoveModifier, resetConsecutiveStrike, targetedPokemonModifiers } from "../combat/move-modifiers.mjs";
import { CHAIN_MULTI_HIT_MOVES, CONSECUTIVE_ESCALATION_MOVES, FIXED_MULTI_ATTACK_MOVES, STOP_ON_MISS_MOVES, addExtraDie, diceMultiplierForStacks, resolveChainHits, scaleDiceCount, swiftProjectileCount } from "../combat/multi-hit.mjs";
import { DRAIN_FRACTION_MOVES, RECOIL_FRACTION_MOVES, recoilAmount } from "../combat/recoil.mjs";
import { markFalseSwipeTarget, requestFaintTargets, requestHpEffect, rollFailedSaves } from "../combat/hp-effects.mjs";
import { releaseBideDamage } from "../combat/bide.mjs";
import { isBerryHeldItem, requestHeldItemDestroy, requestHeldItemSwap } from "../combat/item-swap.mjs";
import { acupressureEffect, hiddenPowerType, magnitudeDice } from "../combat/random-tables.mjs";
import { requestForcedSwitch, selfForcedSwitch } from "../combat/forced-switch.mjs";
import { FULL_NEGATION_MOVES, HALF_NEGATION_MOVES, SURVIVE_MOVES, armDamageShield } from "../combat/damage-shields.mjs";
import { FIELD_PULSE_MOVES, FIELD_RULE_MOVES, TERRAIN_MOVES, WEATHER_BALL_TYPES, WEATHER_MOVES, clearField, currentField, requestFieldEffect } from "../combat/terrain-effects.mjs";

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
import { hasTrainerPath, machineConsumption, pokemonPathMoveBonuses } from "../trainer/trainer-path-rules.mjs";
import {
  activateHeldItem,
  applyPostMoveHeldItemEffects,
  choiceHeldItemAllowsMove,
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
import { applyPendingPokemonAdvancements, hasPendingPokemonAdvancements, initializePokemonAdvancement } from "./pokemon-advancement.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
    const heldItem = instance.heldItem ?? null;
    const effectiveTypes = heldItemEffectiveTypes({
      sourceId: heldItem?.sourceId,
      speciesId: species.id,
      baseTypes: species.type ?? [],
      abilities: instance.abilities ?? []
    });
    const combatSpecies = { ...species, type: effectiveTypes, attributes: instance.attributes ?? species.attributes ?? {} };
    const level = Number(instance.level) || 1;
    const moves = (instance.moves ?? []).map(entry => {
      const move = data.movesById.get(entry.moveId);
      return move ? prepareMove(entry, move, combatSpecies, level, data.contestEffectsById, this.contestType, heldItem, this.pokemonItem.parent) : null;
    }).filter(Boolean);
    const knownMoveIds = new Set((instance.moves ?? []).map(entry => entry.moveId));
    const machineIds = trainerMoveMachineIds(this.pokemonItem.parent);
    const catalog = this.moveManagerOpen
      ? filterMoveCatalog(data.moves, species, level, knownMoveIds, { ...this.moveFilters, machineIds })
      : [];
    const abilities = (instance.abilities ?? []).map(id => data.abilitiesById.get(id)).filter(Boolean).map(ability => ({
      id: ability.id,
      name: ability.name,
      description: `<p>${foundry.utils.escapeHTML(ability.description ?? "")}</p>`
    }));
    const abilityScores = Object.entries(combatSpecies.attributes).map(([key, score]) => ({
      key: key.toUpperCase(), score, modifier: signed(Math.floor((Number(score) - 10) / 2))
    }));
    const defenses = pokemonDefenses(effectiveTypes);
    const experience = experienceProgress(instance.experience, level);
    const pendingAdvancements = hasPendingPokemonAdvancements(instance);
    const heldActor = heldItemActorAdjustments({ sourceId: heldItem?.sourceId, speciesId: species.id, charges: heldItem?.charges, state: heldItem?.state });
    const combatActor = this.pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild" ? this.pokemonItem.parent : deployedActorFor(this.pokemonItem);
    const activeConditions = Object.keys({ burned: 1, frozen: 1, paralyzed: 1, poisoned: 1, "badly-poisoned": 1, asleep: 1, confused: 1, flinched: 1 })
      .filter(id => combatActor?.statuses?.has(pokemonStatusId(id)));
    const inventoryItems = this.pokemonItem.parent?.type === "character"
      ? this.pokemonItem.parent.items
        .filter(item => item.getFlag(MODULE_ID, "kind") === "gear" && Number(item.system.quantity ?? 1) > 0)
        .map(item => ({ id: item.id, sourceId: item.getFlag(MODULE_ID, "sourceId"), name: item.name, quantity: Number(item.system.quantity ?? 1) }))
      : [];
    return {
      item: this.pokemonItem,
      trainer: this.pokemonItem.parent,
      hasTrainer: this.pokemonItem.parent?.type === "character",
      name: displayPokemonName(this.pokemonItem),
      img: portraitUrl(species, instance.shiny),
      species,
      instance,
      level,
      experience: {
        ...experience,
        totalLabel: formatNumber(experience.total),
        remainingLabel: formatNumber(experience.remaining),
        nextLabel: formatNumber(experience.ceiling),
        nextLevel: Math.min(level + 1, 20),
        progressMax: Math.max(experience.span, 1),
        progressValue: experience.maximumLevel ? 1 : experience.gained,
        award: experienceAward(level, species.sr),
        awardLabel: formatNumber(experienceAward(level, species.sr))
      },
      pendingAdvancements,
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
        entries: catalog.slice(0, 120).map(entry => prepareCatalogMove(entry, data.movesById.get(entry.id), combatSpecies, level, data.contestEffectsById, this.contestType, this.pokemonItem.parent))
      },
      abilities,
      abilityScores,
      types: effectiveTypes.map(type => ({ id: type, label: titleCase(type) })),
      hp: instance.hp,
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
    this.element.querySelectorAll("[data-action='roll-move']").forEach(button => button.addEventListener("click", event => this.#rollMove(event)));
    this.element.querySelectorAll("[data-action='roll-contest-move']").forEach(button => button.addEventListener("click", event => this.#rollContestMove(event)));
    this.element.querySelectorAll("[data-action='sheet-mode']").forEach(button => button.addEventListener("click", event => {
      this.sheetMode = event.currentTarget.dataset.mode === "contest" ? "contest" : "combat";
      this.render({ force: true });
    }));
    this.element.querySelector("[data-action='contest-type']")?.addEventListener("change", event => {
      this.contestType = CONTEST_TYPES[event.currentTarget.value] ? event.currentTarget.value : "cool";
      this.render({ force: true });
    });
    this.element.querySelectorAll("[data-action='restore-pp']").forEach(button => button.addEventListener("click", event => this.#restorePp(event)));
    this.element.querySelectorAll("[data-action='remove-move']").forEach(button => button.addEventListener("click", event => this.#removeMove(event)));
    this.element.querySelectorAll("[data-action='remove-ability']").forEach(button => button.addEventListener("click", event => this.#removeAbility(event)));
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
    this.element.querySelector("[data-action='change-nickname']")?.addEventListener("change", event => this.#changeNickname(event));
    this.element.querySelector("[data-action='equip-held-item']")?.addEventListener("change", event => this.#equipHeldItem(event));
    this.element.querySelector("[data-action='use-held-item']")?.addEventListener("click", () => this.#useHeldItem());
    this.element.querySelector("[data-action='restore-held-item']")?.addEventListener("click", () => this.#restoreHeldItem());
    this.element.querySelectorAll("[data-action='remove-status']").forEach(button => button.addEventListener("click", event => this.#removeStatus(event)));
    this.element.querySelector("[data-action='open-trainer-sheet']")?.addEventListener("click", () => this.pokemonItem.parent?.sheet.render(true));
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
    const allocation = await promptEvolution({ evolution, target, data, instance, species, asiPoints, manual: readiness.manual });
    if (!allocation) return;
    const currentAttributes = foundry.utils.deepClone(instance.attributes ?? species.attributes ?? {});
    if (!applyAbilityAllocation(currentAttributes, allocation, asiPoints)) {
      return ui.notifications.warn(game.i18n.format("POKE5E.PokemonNotifications.InvalidAbilityIncrease", { points: asiPoints }));
    }
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
    const species = { ...storedSpecies, type: effectiveTypes, attributes: instance.attributes ?? storedSpecies.attributes ?? {} };
    const move = heldItemEffectiveMove(catalogMove, { sourceId: instance.heldItem?.sourceId, speciesId: storedSpecies.id });
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
    const name = displayPokemonName(this.pokemonItem);
    const flavor = `${name} — ${move.name}`;
    const speaker = ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name });
    const combatActor = this.pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild" ? this.pokemonItem.parent : deployedActorFor(this.pokemonItem);
    if (isMoveRecharging(combatActor, move.id)) return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.Recharging", { name, move: move.name }));
    if (pokemonCombatModifiers(combatActor).moveLockAll) return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.MoveLocked", { name, move: move.name }));
    const selectedTokens = [...(game.user.targets ?? [])];
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
    const damageMoveModifier = moveModifier * (targetAsleep ? 2 : 1) * weatherModifierMultiplier * targetStatusModifierMultiplier * targetHpModifierMultiplier * targetLastMoveNotAttackMultiplier * heldProfile.damageMoveMultiplier * combatModifiers.moveModifierMultiplier;
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
    const finalGambitFormula = move.id === "final-gambit" ? appendModifier(String(Math.max(0, Number(combatActor?.system?.attributes?.hp?.value) || 0)), (species.type ?? []).includes(move.type) ? 2 + heldProfile.stab : 0) : null;
    const trumpCardBonus = move.id === "trump-card" ? moveModifier * Math.max(0, Number(entry.pp.max) - Number(entry.pp.value)) : 0;
    let magnitudeFormula = null;
    if (move.id === "magnitude") {
      const magnitudeRoll = await new Roll("1d100").evaluate();
      await magnitudeRoll.toMessage({ speaker, flavor: `${flavor} — Magnitud` });
      magnitudeFormula = appendModifier(magnitudeDice(magnitudeRoll.total), damageMoveModifier);
    }
    const formula = finalGambitFormula ?? magnitudeFormula ?? (moveHasImmediateDamage(move) ? damageFormula(move, level, damageMoveModifier, species, combatModifiers.damage + heldProfile.damage + pathProfile.damage + trumpCardBonus, heldProfile.stab + pathProfile.stab, escalationMultiplier * weatherDiceMultiplier * targetStatusDiceMultiplier * selfHpDiceMultiplier * ownDamagedDiceMultiplier * ownMissedDiceMultiplier * targetDamagedThisRoundMultiplier, ownMissedExtraDie) : null);
    let hiddenPowerRoll = null;
    if (formula && move.id === "hidden-power") {
      hiddenPowerRoll = await new Roll("1d20").evaluate();
      await hiddenPowerRoll.toMessage({ speaker, flavor: `${flavor} — Tipo` });
    }
    let damageType = formula ? (hiddenPowerRoll ? hiddenPowerType(hiddenPowerRoll.total) ?? await chooseDamageType(move) : await chooseDamageType(move)) : null;
    if (formula && !damageType) return;
    if (damageType === "normal" && move.type === "normal" && currentField(game.combat).pulse?.id === "ion-deluge") damageType = "electric";
    if (move.id === "weather-ball" && activeWeather && WEATHER_BALL_TYPES[activeWeather]) damageType = WEATHER_BALL_TYPES[activeWeather];
    if (move.id === "final-gambit") damageType = "fighting";

    instance.lastMoveId = move.id;
    if (Number(entry.pp.max) > 0) entry.pp.value = Math.max(0, Number(entry.pp.value) - 1);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) === 0) await tryLeppaBerryReaction(this.pokemonItem, entry.id);

    let attackResult = null;
    if (move.attack?.scope) {
      const statusDisadvantage = ["poisoned", "badly-poisoned", "flinched"].some(id => (instance.conditions ?? []).includes(id) || combatActor?.statuses?.has(pokemonStatusId(id)));
      const powerAbilities = Array.isArray(move.power) ? move.power : [move.power].filter(Boolean);
      const abilityAdvantage = combatModifiers.attackAdvantageAbilities.some(key => powerAbilities.includes(key));
      const meleeAdvantage = combatModifiers.meleeAttackAdvantage && move.attack.scope === "melee";
      const terrainAdvantage = move.id === "psyblade" && currentField(game.combat).terrain?.id === "electric-terrain";
      const weatherAdvantage = move.id === "hydro-steam" && activeWeather === "sun";
      const advantage = combatModifiers.attackAdvantage || abilityAdvantage || meleeAdvantage || targetedModifiers.incomingAttackAdvantage || terrainAdvantage || weatherAdvantage;
      const disadvantage = statusDisadvantage || combatModifiers.attackDisadvantage;
      const die = advantage === disadvantage ? "1d20" : advantage ? "2d20kh" : "2d20kl";
      const effectDice = combatModifiers.attackDice.map(formula => ` + ${formula}`).join("");
      const effectProficiency = combatModifiers.suppressAttackProficiency ? 0 : proficiency;
      const attack = await new Roll(`${die} + @mod + @prof + @effect${effectDice}`, { mod: attackMoveModifier, prof: effectProficiency, effect: combatModifiers.attack + heldProfile.attack + pathProfile.attack }).evaluate();
      await attack.toMessage({ speaker, flavor: `${flavor} (${titleCase(move.attack.scope)})` });
      const rolledNatural = Number(attack.dice?.[0]?.results?.find(result => result.active)?.result ?? attack.dice?.[0]?.total) || 0;
      const guaranteed = combatModifiers.guaranteedHit || combatModifiers.guaranteedCritical;
      const natural = guaranteed ? 20 : rolledNatural;
      attackResult = {
        natural,
        total: guaranteed ? Number.MAX_SAFE_INTEGER : Number(attack.total) || 0,
        critical: combatModifiers.guaranteedCritical || natural >= Math.max(1, 20 - heldProfile.criticalRange - combatModifiers.criticalRangeBonus)
      };
      if (selectedTokens.length) {
        const missed = !selectedTokens.some(token => attackHitsPokemonTarget(attackResult, token.actor));
        if (instance.lastAttackMissed !== missed) {
          instance.lastAttackMissed = missed;
          await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
        }
      }
    } else if (move.save) {
      const dc = 8 + attackMoveModifier + proficiency;
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
    if (formula) {
      const DamageRoll = CONFIG.Dice?.DamageRoll;
      if (DamageRoll) {
        const burned = damageType !== "healing" && (instance.conditions ?? []).includes("burned");
        const damageOptions = { type: damageType, critical: Boolean(attackResult?.critical) };
        const damageRolls = [await new DamageRoll(formula, {}, damageOptions).evaluate()];
        if (burned) damageRolls.push(await new DamageRoll(formula, {}, damageOptions).evaluate());
        const damage = damageRolls.reduce((lowest, candidate) => Number(candidate.total) < Number(lowest.total) ? candidate : lowest);
        dealtDamageTotal = Number(damage.total) || 0;
        const rollType = damageType === "healing" ? "healing" : "damage";
        await damage.toMessage({
          speaker,
          flavor: `${flavor} — ${typeLabel(damageType)}${burned ? ` · Quemado: menor de ${damageRolls.map(roll => roll.total).join("/")}` : ""}`,
          flags: { dnd5e: { messageType: "roll", roll: { type: rollType }, targets: targetDescriptors() } }
        });
      } else {
        const burned = damageType !== "healing" && (instance.conditions ?? []).includes("burned");
        const damageRolls = [await new Roll(formula).evaluate()];
        if (burned) damageRolls.push(await new Roll(formula).evaluate());
        const damage = damageRolls.reduce((lowest, candidate) => Number(candidate.total) < Number(lowest.total) ? candidate : lowest);
        dealtDamageTotal = Number(damage.total) || 0;
        await damage.toMessage({ speaker, flavor: `${flavor} — ${typeLabel(damageType)}${burned ? ` · Quemado: menor de ${damageRolls.map(roll => roll.total).join("/")}` : ""}` });
      }
    }
    const selectedHit = Boolean(attackResult) && selectedTokens.some(token => attackHitsPokemonTarget(attackResult, token.actor));
    const recoilFraction = RECOIL_FRACTION_MOVES[move.id];
    if (recoilFraction && selectedHit && dealtDamageTotal != null) await applySelfRecoil(this.pokemonItem.parent, combatActor, recoilAmount(dealtDamageTotal, recoilFraction), speaker, flavor);
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
    if (move.id === "trick" && attackResult) {
      for (const token of selectedTokens) {
        if (!attackHitsPokemonTarget(attackResult, token.actor)) continue;
        await requestHeldItemSwap({ sourcePokemonItem: this.pokemonItem, targetActor: token.actor, sourceName: name, targetName: token.name });
      }
    }
    if (move.id === "thief" && attackResult && !instance.heldItem) {
      const hitTokens = selectedTokens.filter(token => attackHitsPokemonTarget(attackResult, token.actor));
      if (hitTokens.length) {
        const dc = 8 + attackMoveModifier + proficiency;
        const failed = await rollFailedSaves(hitTokens, "dex", dc, speaker, move.name);
        for (const target of failed) await requestHeldItemSwap({ sourcePokemonItem: this.pokemonItem, targetActor: target.actor, sourceName: name, targetName: target.tokenName });
      }
    }
    if (move.id === "incinerate" && attackResult) {
      for (const token of selectedTokens) {
        if (!attackHitsPokemonTarget(attackResult, token.actor)) continue;
        const targetPokemonItem = await pokemonItemForActor(token.actor);
        const targetHeldItem = targetPokemonItem?.getFlag(MODULE_ID, "instance")?.heldItem;
        if (!isBerryHeldItem(targetHeldItem?.sourceId)) continue;
        await requestHeldItemDestroy({ targetActor: token.actor, sourceName: name, targetName: token.name, restoreAfterCombat: false });
      }
    }
    if (move.id === "knock-off" && attackResult) {
      for (const token of selectedTokens) {
        if (!attackHitsPokemonTarget(attackResult, token.actor)) continue;
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
    if (formula && selectedHit && CHAIN_MULTI_HIT_MOVES[move.id]) await rollChainMultiHit(move, level, damageType, flavor, speaker, CHAIN_MULTI_HIT_MOVES[move.id]);
    if (escalation && !escalation.automatic && attackResult && !selectedHit) await resetConsecutiveStrike(combatActor, move.id);
    let statusMove = move;
    if (RANDOM_STATUS_TABLE_MOVES[move.id]) {
      const table = RANDOM_STATUS_TABLE_MOVES[move.id];
      const tableRoll = await new Roll(`1d${table.faces}`).evaluate();
      await tableRoll.toMessage({ speaker, flavor: `${flavor} — Estado al azar` });
      const chosenStatus = table.resolve(tableRoll.total);
      statusMove = { ...move, statusEffects: [{ id: chosenStatus, trigger: table.trigger, minimum: table.minimum ?? null, margin: table.margin ?? 0, requiresHit: false, target: "selected" }] };
    }
    const statusResolution = await applyMoveStatuses({ move: statusMove, attack: attackResult, saveDc: 8 + attackMoveModifier + proficiency, sourceActor: this.pokemonItem.parent, sourceCombatActor: combatActor, sourceName: name });
    await applyMoveOngoingEffects({
      move, attack: attackResult, saveDc: 8 + attackMoveModifier + proficiency,
      sourceOwnerActor: this.pokemonItem.parent, sourceCombatActor: combatActor,
      sourcePokemonItem: this.pokemonItem, sourceName: name, level, moveModifier,
      proficiency, sourceTypes: species.type ?? []
    });
    await applyMoveModifierEffects({
      move, attack: attackResult, saveDc: 8 + attackMoveModifier + proficiency,
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
    const species = { ...storedSpecies, attributes: instance.attributes ?? storedSpecies.attributes ?? {} };
    const attackMoveModifier = getMoveModifier(species, move);
    const attack = await new Roll("1d20 + @mod + @prof", { mod: attackMoveModifier, prof: proficiency }).evaluate();
    await attack.toMessage({ speaker, flavor: `${name} — ${move.name} (Ranged)` });
    const damageTotal = releaseBideDamage(instance.bideDamage);
    const DamageRoll = CONFIG.Dice?.DamageRoll;
    const damage = DamageRoll
      ? await new DamageRoll(String(Math.max(1, damageTotal)), {}, { type: "typeless" }).evaluate()
      : await new Roll(String(Math.max(1, damageTotal))).evaluate();
    await damage.toMessage({ speaker, flavor: `${name} — ${move.name} — Típeless (doble del daño recibido)`, flags: { dnd5e: { messageType: "roll", roll: { type: "damage" }, targets: targetDescriptors() } } });
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
    const species = { ...storedSpecies, attributes: instance.attributes ?? storedSpecies.attributes ?? {} };
    const attackMoveModifier = getMoveModifier(species, move);
    const attack = await new Roll("2d20kl + @mod + @prof", { mod: attackMoveModifier, prof: proficiency }).evaluate();
    await attack.toMessage({ speaker, flavor: `${name} — ${move.name} (Melee, con desventaja)` });
    const damageTotal = Math.min(Number(instance.metalBurstDamage) || 0, 5 * level);
    if (damageTotal > 0) {
      const DamageRoll = CONFIG.Dice?.DamageRoll;
      const damage = DamageRoll
        ? await new DamageRoll(String(damageTotal), {}, { type: "steel" }).evaluate()
        : await new Roll(String(damageTotal)).evaluate();
      await damage.toMessage({ speaker, flavor: `${name} — ${move.name} — Acero (igual al daño recibido, tope 5× nivel)`, flags: { dnd5e: { messageType: "roll", roll: { type: "damage" }, targets: targetDescriptors() } } });
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
    const species = { ...storedSpecies, attributes: instance.attributes ?? storedSpecies.attributes ?? {} };
    const attackMoveModifier = getMoveModifier(species, move);
    const attack = await new Roll("1d20 + @mod + @prof", { mod: attackMoveModifier, prof: proficiency }).evaluate();
    await attack.toMessage({ speaker, flavor: `${name} — ${move.name} (${label})` });
    const DamageRoll = CONFIG.Dice?.DamageRoll;
    const formula = appendModifier(dice, attackMoveModifier);
    const damage = DamageRoll
      ? await new DamageRoll(formula, {}, { type: damageType }).evaluate()
      : await new Roll(formula).evaluate();
    await damage.toMessage({ speaker, flavor: `${name} — ${move.name} — ${typeLabel(damageType)}`, flags: { dnd5e: { messageType: "roll", roll: { type: "damage" }, targets: targetDescriptors() } } });
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
      await requestFaintTargets(selectedTokens, name);
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
    const species = { ...storedSpecies, attributes: instance.attributes ?? storedSpecies.attributes ?? {} };
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
      await damage.toMessage({ speaker, flavor: `${flavor} — ${typeLabel(damageType)}`, flags: { dnd5e: { messageType: "roll", roll: { type: "damage" }, targets: targetDescriptors() } } });
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
    const species = { ...storedSpecies, attributes: instance.attributes ?? storedSpecies.attributes ?? {} };
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

/** Modificador de una puntuación de característica. Auxiliar de todo el archivo. */
function abilityModifier(score) { return Math.floor(((Number(score) || 10) - 10) / 2); }

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
      name: token.name,
      img: actor.img,
      uuid: actor.uuid,
      ac: actor.statuses?.has("coverTotal") ? null : actor.system.attributes?.ac?.value ?? null
    });
  }
  return [...targets.values()];
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
  if (condition.type === "item") return `Usar ${data.itemsById.get(condition.value)?.name ?? condition.value}`;
  if (condition.type === "loyalty") return `Vínculo +${condition.value}`;
  if (condition.type === "move") return `Conocer ${data.movesById.get(condition.value)?.name ?? condition.value}`;
  if (condition.type === "move-type") return `Conocer un movimiento de tipo ${typeLabel(condition.value)}`;
  if (condition.type === "gender") return condition.value === "female" ? "Solo hembras" : "Solo machos";
  if (condition.type === "time") return `Durante: ${titleCase(condition.value)}`;
  return String(condition.value ?? "Condición especial");
}

/**
 * Prepara un movimiento aprendido para la plantilla: PP, bonificador de ataque o
 * CD de salvación calculados con getMoveModifier() y la competencia por nivel,
 * fórmula de daño de damageFormula(), modificaciones del objeto equipado,
 * datos de concurso y un aviso si dejó de ser compatible con la especie.
 * Auxiliar de _prepareContext(); su gemela para el catálogo es prepareCatalogMove().
 */
function prepareMove(entry, move, species, level, effectsById, contestType, heldItem = null, trainer = null) {
  const proficiency = 2 + Math.floor((level - 1) / 4);
  const effectiveMove = heldItemEffectiveMove(move, { sourceId: heldItem?.sourceId, speciesId: species.id });
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
    damage: damageFormula(effectiveMove, level, damageModifier, species, profile.damage + pathProfile.damage, profile.stab + pathProfile.stab) ?? "—",
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
    damage: damageFormula(move, level, modifier, species, pathProfile.damage, pathProfile.stab) ?? "—",
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
 * Pokémon). `effectDamage` incorpora bonos una vez por movimiento y
 * `heldItemStab` amplía el STAB de objetos compatibles. Devuelve null si el
 * movimiento no causa daño.
 * La usan prepareMove(), prepareCatalogMove() y #rollMove().
 */
function moveIsHealing(move) {
  const types = Array.isArray(move?.damage?.type) ? move.damage.type : [move?.damage?.type].filter(Boolean);
  return types.includes("healing");
}

function damageFormula(move, level, moveModifier, species, effectDamage = 0, heldItemStab = 0, diceMultiplier = 1, extraDie = false) {
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
  else if (modifier === "MOVE + STAB") formula = appendModifier(dice, moveModifier + ((species.type ?? []).includes(move.type) ? 2 + heldItemStab : 0));
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
async function rollChainMultiHit(move, level, damageType, flavor, speaker, maxExtra = 4) {
  const chainRolls = [];
  for (let i = 0; i < maxExtra; i++) {
    const roll = await new Roll("1d4").evaluate();
    chainRolls.push(Number(roll.total));
    if (Number(roll.total) < 3) break;
  }
  const extraHits = resolveChainHits(chainRolls, maxExtra);
  if (!extraHits) return;
  const baseDice = resolveDamageDice(move, level);
  if (!baseDice) return;
  const extraFormula = Array(extraHits).fill(baseDice).join(" + ");
  const DamageRoll = CONFIG.Dice?.DamageRoll;
  const extraDamage = DamageRoll
    ? await new DamageRoll(extraFormula, {}, { type: damageType }).evaluate()
    : await new Roll(extraFormula).evaluate();
  await extraDamage.toMessage({
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
 * concede puntos de característica, ofrece repartirlos. Devuelve ese reparto,
 * que #evolve() valida con applyAbilityAllocation(), o null si se cancela.
 */
async function promptEvolution({ evolution, target, data, instance, species, asiPoints, manual }) {
  const attributes = instance.attributes ?? species.attributes ?? {};
  const allocation = asiPoints ? `<fieldset class="poke5e-asi-allocation">
    <legend>Distribuye ${asiPoints} puntos de característica</legend>
    <p>Máximo 4 puntos por característica; ninguna puede superar 20.</p>
    <div>${["str", "dex", "con", "int", "wis", "cha"].map(key => `<label><span>${key.toUpperCase()} (${Number(attributes[key]) || 10})</span><input type="number" name="asi-${key}" min="0" max="4" step="1" value="0"></label>`).join("")}</div>
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
        ${manualConfirmation}${allocation}
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: game.i18n.localize("POKE5E.PokemonDialogs.Evolve"),
        icon: "fa-solid fa-dna",
        callback: (dialogEvent, button) => {
          const form = button.form;
          if (manual.length && !form.elements.manualConfirmed.checked) return null;
          return Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(key => [key, Math.trunc(Number(form.elements[`asi-${key}`]?.value) || 0)]));
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

/** Formatea las cifras de experiencia según el idioma de la interfaz. */
function formatNumber(value) {
  return new Intl.NumberFormat(game.i18n.lang || "es").format(Number(value) || 0);
}

/** Antepone el signo a un modificador ("+3", "-1"). */
function signed(value) { return Number(value) >= 0 ? `+${value}` : String(value); }
/** Capitaliza un identificador con guiones; copia local de la de model.mjs. */
function titleCase(value) { return String(value).split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
/** Escapa el texto de los datos antes de insertarlo en HTML. */
function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
