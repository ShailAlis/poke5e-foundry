/**
 * Ficha Pokédex de un Pokémon individual, el archivo más extenso del módulo.
 * Reúne en una sola ventana los datos de la especie y de la instancia, las
 * tiradas de ataque y daño, el modo Concurso, el gestor de movimientos, la
 * experiencia y la evolución, los objetos equipados y los estados alterados.
 *
 * Casi no contiene reglas propias: las toma de move-learning.mjs, combat.mjs,
 * contests.mjs, progression.mjs y status-effects.mjs, y aquí solo las presenta y
 * guarda el resultado en el flag `instance` del Item. La abren trainer-team.mjs,
 * trainer-actor-sheet.mjs, pokemon-actor-sheet.mjs y main.mjs. Su plantilla es
 * `templates/pokemon-sheet.hbs`.
 */
import { loadPoke5eData } from "./data-service.mjs";
import { MODULE_ID, MODULE_PATH, displayPokemonName, gearItemSource, portraitUrl } from "./model.mjs";
import { MAX_KNOWN_MOVES, applyLearnedMove, filterMoveCatalog, moveEligibility } from "./move-learning.mjs";
import { normalizeMoveDamageTypes, pokemonDefenses, typeLabel } from "./combat.mjs";
import { deployedActorFor, recallPokemon, syncPokemonIdentityToDeployment } from "./deployment.mjs";
import { CONTEST_TYPES, contestAppealOutcome, contestCompatibility, contestDetailsForMove, contestTypeOptions } from "./contests.mjs";
import { applyMoveStatuses, pokemonStatusEntries, pokemonStatusId, removePokemonStatus } from "./status-effects.mjs";
import {
  evolutionReadiness,
  experienceAtLevel,
  experienceAward,
  experienceProgress,
  levelForExperience,
  normalizedExperience
} from "./progression.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
   * tiene, para reflejar las mejoras ganadas al evolucionar.
   */
  async _prepareContext() {
    const data = await loadPoke5eData();
    const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const instance = this.pokemonItem.getFlag(MODULE_ID, "instance") ?? {};
    const combatSpecies = { ...species, attributes: instance.attributes ?? species.attributes ?? {} };
    const level = Number(instance.level) || 1;
    const moves = (instance.moves ?? []).map(entry => {
      const move = data.movesById.get(entry.moveId);
      return move ? prepareMove(entry, move, combatSpecies, level, data.contestEffectsById, this.contestType) : null;
    }).filter(Boolean);
    const knownMoveIds = new Set((instance.moves ?? []).map(entry => entry.moveId));
    const catalog = this.moveManagerOpen
      ? filterMoveCatalog(data.moves, species, level, knownMoveIds, this.moveFilters)
      : [];
    const abilities = (instance.abilities ?? []).map(id => data.abilitiesById.get(id)).filter(Boolean).map(ability => ({
      id: ability.id,
      name: ability.name,
      description: `<p>${foundry.utils.escapeHTML(ability.description ?? "")}</p>`
    }));
    const abilityScores = Object.entries(combatSpecies.attributes).map(([key, score]) => ({
      key: key.toUpperCase(), score, modifier: signed(Math.floor((Number(score) - 10) / 2))
    }));
    const defenses = pokemonDefenses(species.type);
    const experience = experienceProgress(instance.experience, level);
    const heldItem = instance.heldItem ?? null;
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
      heldItem: heldItem ? { ...heldItem, hasCharges: heldItem.charges != null } : null,
      statuses: pokemonStatusEntries({ conditions: [...new Set([...(instance.conditions ?? []), ...activeConditions])] }),
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
        entries: catalog.slice(0, 120).map(entry => prepareCatalogMove(entry, data.movesById.get(entry.id), combatSpecies, level, data.contestEffectsById, this.contestType))
      },
      abilities,
      abilityScores,
      types: (species.type ?? []).map(type => ({ id: type, label: titleCase(type) })),
      hp: instance.hp,
      ac: instance.ac ?? species.ac,
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
  }

  /**
   * Fija el nivel a mano (1-20) y reajusta la experiencia al umbral de ese
   * nivel con experienceAtLevel(). Su contraparte es #changeExperience().
   */
  async #changeLevel(event) {
    const instance = this.#instance();
    instance.level = Math.max(1, Math.min(20, Number(event.currentTarget.value) || 1));
    instance.experience = experienceAtLevel(instance.level);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
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
    instance.experience = normalizedExperience(event.currentTarget.value, oldLevel);
    instance.level = Math.max(oldLevel, levelForExperience(instance.experience));
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    notifyLevelGain(this.pokemonItem, oldLevel, instance.level);
    this.render({ force: true });
  }

  /**
   * Suma experiencia preguntando la cantidad con promptExperienceAmount(); por
   * lo demás se comporta igual que #changeExperience().
   */
  async #addExperience() {
    const instance = this.#instance();
    const oldLevel = Math.max(1, Math.min(20, Number(instance.level) || 1));
    const amount = await promptExperienceAmount();
    if (!amount) return;
    instance.experience = normalizedExperience(instance.experience, oldLevel) + amount;
    instance.level = Math.max(oldLevel, levelForExperience(instance.experience));
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    notifyLevelGain(this.pokemonItem, oldLevel, instance.level);
    this.render({ force: true });
  }

  /**
   * Evolución guiada. Comprueba las condiciones automáticas con
   * evolutionReadiness(), pide confirmación y el reparto de puntos de
   * característica con promptEvolution(), lo valida con applyAbilityAllocation(),
   * retira al Pokémon del mapa y reescribe el Item con la nueva especie:
   * conserva el daño recibido al ampliar los PG máximos, actualiza CA,
   * características, habilidades (evolvedAbilities()), nombre e imagen.
   */
  async #evolve(event) {
    const evolutionId = event.currentTarget.dataset.evolutionId;
    const data = await loadPoke5eData();
    const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const evolution = (data.evolutionsByFrom.get(species.id) ?? []).find(entry => entry.id === evolutionId);
    const target = data.pokemonById.get(evolution?.to);
    if (!evolution || !target) return ui.notifications.error("No se encontraron los datos de esta evolución.");
    const instance = this.#instance();
    const readiness = evolutionReadiness(evolution, {
      level: instance.level,
      gender: instance.gender,
      knownMoveIds: (instance.moves ?? []).map(entry => entry.moveId),
      movesById: data.movesById
    });
    if (!readiness.available) return ui.notifications.warn("Este Pokémon aún no cumple las condiciones verificables para evolucionar.");
    const asiPoints = Number(evolution.effects?.find(effect => effect.type === "asi")?.value) || 0;
    const allocation = await promptEvolution({ evolution, target, data, instance, species, asiPoints, manual: readiness.manual });
    if (!allocation) return;
    const currentAttributes = foundry.utils.deepClone(instance.attributes ?? species.attributes ?? {});
    if (!applyAbilityAllocation(currentAttributes, allocation, asiPoints)) {
      return ui.notifications.warn(`Debes distribuir exactamente ${asiPoints} puntos; máximo 4 por característica y ninguna puede superar 20.`);
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
    ui.notifications.info(`${displayPokemonName(this.pokemonItem)} ha evolucionado a ${target.name}.`);
    this.render({ force: true });
  }

  /**
   * Edita los PG acotándolos entre 0 y el máximo. El hook `updateItem` de
   * main.mjs propaga el cambio al mapa mediante syncPokemonHpToDeployment().
   */
  async #changeHp(event) {
    const instance = this.#instance();
    instance.hp.value = Math.max(0, Math.min(Number(instance.hp.max) || 1, Number(event.currentTarget.value) || 0));
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
   * returnHeldItem(), descuenta el nuevo con decrementInventoryItem() y le fija
   * sus cargas con initialHeldItemCharges().
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
        charges: initialHeldItemCharges(sourceId, definition)
      };
      await decrementInventoryItem(selected);
    } else delete instance.heldItem;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  /**
   * Usa el objeto equipado: publica su efecto en el chat, gasta una carga y, si
   * es una baya, la consume por completo. Su contraparte es #restoreHeldItem().
   */
  async #useHeldItem() {
    const instance = this.#instance();
    const held = instance.heldItem;
    if (!held) return;
    const berry = String(held.sourceId).endsWith("-berry");
    if (held.charges != null && Number(held.charges) <= 0) return ui.notifications.warn(`${held.name} no tiene cargas.`);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: displayPokemonName(this.pokemonItem) }),
      content: `<div class="dnd5e chat-card"><header class="card-header"><h3>${escapeHtml(displayPokemonName(this.pokemonItem))} usa ${escapeHtml(held.name)}</h3></header><p>${escapeHtml(held.description || "Aplica el efecto descrito por el objeto.")}</p></div>`
    });
    if (berry) delete instance.heldItem;
    else if (held.charges != null) held.charges = Math.max(0, Number(held.charges) - 1);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  /**
   * Devuelve al objeto equipado sus cargas iniciales, típicamente tras un
   * descanso. Contraparte de #useHeldItem().
   */
  async #restoreHeldItem() {
    const instance = this.#instance();
    if (!instance.heldItem) return;
    const data = await loadPoke5eData();
    instance.heldItem.charges = initialHeldItemCharges(instance.heldItem.sourceId, data.itemsById.get(instance.heldItem.sourceId));
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
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
    if (!move) return ui.notifications.error("No se encontró el movimiento.");
    const instance = this.#instance();
    const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const eligibility = moveEligibility(species, move, Number(instance.level) || 1);
    if (!eligibility.availableNow) return notifyMoveUnavailable(move, eligibility);
    if (instance.moves.some(entry => entry.moveId === move.id)) return ui.notifications.warn("Este Pokémon ya conoce ese movimiento.");
    if (!await this.#addMove(instance, move, data.movesById)) return;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
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
      if (instance.moves.some(entry => entry.moveId === sourceId)) return ui.notifications.warn("Este Pokémon ya conoce ese movimiento.");
      const move = document.getFlag(MODULE_ID, "move");
      if (!move?.id) return ui.notifications.error("El movimiento no contiene datos válidos.");
      const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
      const eligibility = moveEligibility(species, move, Number(instance.level) || 1);
      if (!eligibility.availableNow) return notifyMoveUnavailable(move, eligibility);
      const data = await loadPoke5eData();
      if (!await this.#addMove(instance, move, data.movesById)) return;
    } else if (kind === "ability") {
      if (instance.abilities.includes(sourceId)) return ui.notifications.warn("Este Pokémon ya tiene esa habilidad.");
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
      ui.notifications.warn(`Este Pokémon conoce ${instance.moves.length} movimientos de una versión anterior. Debe olvidar movimientos hasta quedarse con cuatro antes de aprender otro.`);
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
   * Ejecuta un movimiento en modo Combate. Comprueba los PP y los descuenta;
   * calcula MOVE con getMoveModifier() y la competencia por nivel; según el
   * movimiento tira ataque (con desventaja si está envenenado o amedrentado),
   * anuncia una CD de salvación o solo publica su descripción; tira el daño con
   * el DamageRoll de D&D 5e —pidiendo el tipo con chooseDamageType() cuando hay
   * varios y quedándose con la menor de dos tiradas si está quemado— y termina
   * repartiendo los estados con applyMoveStatuses(). Su gemela para concursos es
   * #rollContestMove().
   */
  async #rollMove(event) {
    const data = await loadPoke5eData();
    const instance = this.#instance();
    const entry = instance.moves.find(candidate => candidate.id === event.currentTarget.dataset.moveEntryId);
    const move = data.movesById.get(entry?.moveId);
    if (!entry || !move) return;
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) <= 0) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.NoPP", { name: displayPokemonName(this.pokemonItem), move: move.name }));
    }
    const storedSpecies = this.pokemonItem.getFlag(MODULE_ID, "species");
    const species = { ...storedSpecies, attributes: instance.attributes ?? storedSpecies.attributes ?? {} };
    const level = Number(instance.level) || 1;
    const moveModifier = getMoveModifier(species, move);
    const proficiency = 2 + Math.floor((level - 1) / 4);
    const name = displayPokemonName(this.pokemonItem);
    const flavor = `${name} — ${move.name}`;
    const speaker = ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name });
    const formula = damageFormula(move, level, moveModifier, species);
    const damageType = formula ? await chooseDamageType(move) : null;
    if (formula && !damageType) return;

    if (Number(entry.pp.max) > 0) {
      entry.pp.value = Math.max(0, Number(entry.pp.value) - 1);
      await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    }

    let attackResult = null;
    if (move.attack?.scope) {
      const combatActor = this.pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild" ? this.pokemonItem.parent : deployedActorFor(this.pokemonItem);
      const disadvantage = ["poisoned", "badly-poisoned", "flinched"].some(id => (instance.conditions ?? []).includes(id) || combatActor?.statuses?.has(pokemonStatusId(id)));
      const attack = await new Roll(`${disadvantage ? "2d20kl" : "1d20"} + @mod + @prof`, { mod: moveModifier, prof: proficiency }).evaluate();
      await attack.toMessage({ speaker, flavor: `${flavor} (${titleCase(move.attack.scope)})` });
      attackResult = {
        natural: Number(attack.dice?.[0]?.results?.find(result => result.active)?.result ?? attack.dice?.[0]?.total) || 0,
        total: Number(attack.total) || 0
      };
    } else if (move.save) {
      const dc = 8 + moveModifier + proficiency;
      const attributes = (move.save.attribute ?? []).map(key => key.toUpperCase()).join("/");
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card"><header class="card-header"><h3>${escapeHtml(flavor)}</h3></header><p><strong>Salvación ${escapeHtml(attributes)} CD ${dc}</strong></p>${moveDescription(move)}</div>` });
    } else {
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card"><header class="card-header"><h3>${escapeHtml(flavor)}</h3></header>${moveDescription(move)}</div>` });
    }
    if (formula) {
      const DamageRoll = CONFIG.Dice?.DamageRoll;
      if (DamageRoll) {
        const burned = damageType !== "healing" && (instance.conditions ?? []).includes("burned");
        const damageRolls = [await new DamageRoll(formula, {}, { type: damageType }).evaluate()];
        if (burned) damageRolls.push(await new DamageRoll(formula, {}, { type: damageType }).evaluate());
        const damage = damageRolls.reduce((lowest, candidate) => Number(candidate.total) < Number(lowest.total) ? candidate : lowest);
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
        await damage.toMessage({ speaker, flavor: `${flavor} — ${typeLabel(damageType)}${burned ? ` · Quemado: menor de ${damageRolls.map(roll => roll.total).join("/")}` : ""}` });
      }
    }
    await applyMoveStatuses({ move, attack: attackResult, saveDc: 8 + moveModifier + proficiency, sourceActor: this.pokemonItem.parent, sourceName: name });
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
    label: `Interpretación (CAR${performanceProficient ? " + competencia" : ""})`,
    modifier: abilityModifier(attributes.cha) + (performanceProficient ? proficiency : 0)
  }];
  const configured = Array.isArray(move.power) ? move.power : move.power ? [move.power] : [];
  const allowed = !configured.length || configured.some(value => value === "any" || value === "varies")
    ? ["str", "dex", "con", "int", "wis", "cha"]
    : configured.filter(value => ["str", "dex", "con", "int", "wis", "cha"].includes(value));
  for (const key of [...new Set(allowed)]) {
    methods.push({ id: `ability-${key}`, label: `${key.toUpperCase()} + competencia`, modifier: abilityModifier(attributes[key]) + proficiency });
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
      window: { title: `Concurso · ${move.name}` },
      content: `<div class="poke5e-contest-roll-dialog">
        <p>Realiza la prueba de talento para un concurso <strong>${escapeHtml(CONTEST_TYPES[contestType].label)}</strong>.</p>
        <label><span>Método de la prueba</span><select name="method">${methodOptions}</select></label>
        <label><span>CD del juez</span><input type="number" name="dc" min="1" max="40" value="11"></label>
        <label><span>Modo de tirada</span><select name="rollMode"><option value="normal">Normal</option><option value="advantage">Ventaja</option><option value="disadvantage">Desventaja</option></select></label>
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: "Realizar movimiento",
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
      window: { title: `Tipo de daño de ${move.name}` },
      content: `<div class="poke5e-damage-type-dialog"><p>Este movimiento puede causar varios tipos de daño. Elige el que se aplica en esta tirada.</p><label><span>Tipo de daño</span><select name="damageType">${options}</select></label></div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: "Continuar",
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
    female: { label: "Hembra", icon: "fa-venus" },
    male: { label: "Macho", icon: "fa-mars" },
    none: { label: "Sin sexo", icon: "fa-genderless" },
    other: { label: "Otro", icon: "fa-transgender" }
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
 * fórmula de daño de damageFormula(), datos de concurso y un aviso si dejó de
 * ser compatible con la especie (por ejemplo tras evolucionar).
 * Auxiliar de _prepareContext(); su gemela para el catálogo es prepareCatalogMove().
 */
function prepareMove(entry, move, species, level, effectsById, contestType) {
  const modifier = getMoveModifier(species, move);
  const proficiency = 2 + Math.floor((level - 1) / 4);
  const eligibility = moveEligibility(species, move, level);
  return {
    entryId: entry.id,
    name: move.name,
    type: move.type ?? "normal",
    time: move.time ?? "—",
    range: move.range ?? "—",
    description: moveDescription(move),
    pp: entry.pp,
    hasPp: Number(entry.pp?.max) > 0,
    attackBonus: move.attack?.scope ? signed(modifier + proficiency) : null,
    saveDc: move.save ? 8 + modifier + proficiency : null,
    damage: damageFormula(move, level, modifier, species) ?? "—",
    contest: prepareContestDisplay(move, effectsById, contestType),
    learningMethods: eligibility.methods,
    learningWarning: eligibility.compatible && !eligibility.availableNow
      ? `Requiere nivel ${eligibility.requiredLevel}`
      : eligibility.compatible ? "" : "No figura en los movimientos de esta especie"
  };
}

/**
 * Enriquece una entrada del gestor de movimientos con los mismos datos
 * calculados que prepareMove(), partiendo de lo que devuelve filterMoveCatalog()
 * y sin los PP, que solo existen una vez aprendido.
 */
function prepareCatalogMove(entry, move, species, level, effectsById, contestType) {
  if (!move) return entry;
  const modifier = getMoveModifier(species, move);
  const proficiency = 2 + Math.floor((level - 1) / 4);
  return {
    ...entry,
    time: move.time ?? "—",
    range: move.range ?? "—",
    duration: move.duration ?? "—",
    description: moveDescription(move),
    attackBonus: move.attack?.scope ? signed(modifier + proficiency) : null,
    saveDc: move.save ? 8 + modifier + proficiency : null,
    damage: damageFormula(move, level, modifier, species) ?? "—",
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
      window: { title: `Aprender ${newMove.name}` },
      content: `<div class="poke5e-forget-dialog">
        <p>Un Pokémon solo puede conocer cuatro movimientos. Para aprender <strong>${escapeHtml(newMove.name)}</strong>, elige cuál debe olvidar.</p>
        <label><span>Movimiento que olvidar</span><select name="forgottenMove">${options}</select></label>
        <div class="poke5e-description">${moveDescription(newMove)}</div>
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: "Olvidar y aprender",
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
  if (eligibility.future) return ui.notifications.warn(`${move.name} se aprende a nivel ${eligibility.requiredLevel}.`);
  return ui.notifications.warn(`${move.name} no puede ser aprendido por esta especie Pokémon.`);
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
 * Pokémon). Devuelve null si el movimiento no causa daño.
 * La usan prepareMove(), prepareCatalogMove() y #rollMove().
 */
function damageFormula(move, level, moveModifier, species) {
  const diceByLevel = move.damage?.dice;
  if (!diceByLevel) return null;
  const tiers = Object.keys(diceByLevel).map(Number).filter(tier => tier <= level).sort((a, b) => b - a);
  const dice = diceByLevel[String(tiers[0] ?? 1)];
  if (!dice) return null;
  const modifier = move.damage.modifier;
  if (modifier === "MOVE") return appendModifier(dice, moveModifier);
  if (modifier === "LEVEL") return appendModifier(dice, level);
  if (typeof modifier === "number") return appendModifier(dice, modifier);
  if (typeof modifier === "string" && modifier.startsWith("MOVE +")) return appendModifier(dice, moveModifier + (Number(modifier.split("+")[1]) || 0));
  if (modifier === "MOVE + STAB") return appendModifier(dice, moveModifier + ((species.type ?? []).includes(move.type) ? 2 : 0));
  return String(dice);
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
    walking: { label: "Caminar", icon: "fa-person-walking" },
    flying: { label: "Volar", icon: "fa-dove" },
    swimming: { label: "Nadar", icon: "fa-person-swimming" },
    burrowing: { label: "Excavar", icon: "fa-trowel" },
    climbing: { label: "Trepar", icon: "fa-mountain" },
    hover: { label: "Flotar", icon: "fa-wind" }
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
      window: { title: "Añadir experiencia" },
      content: `<div class="poke5e-experience-dialog">
        <p>Introduce los PX obtenidos. Si se alcanza el siguiente umbral, el nivel aumentará automáticamente.</p>
        <label><span>Experiencia obtenida</span><input type="number" name="amount" min="1" step="1" value="100" autofocus></label>
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: "Añadir PX",
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
      window: { title: `Evolucionar a ${target.name}` },
      content: `<div class="poke5e-evolution-dialog">
        <p><strong>${escapeHtml(displayPokemonName({ getFlag: () => instance, name: species.name }))}</strong> evolucionará a <strong>${escapeHtml(target.name)}</strong>. Mantendrá su nivel, experiencia, sexo, movimientos y daño recibido.</p>
        <p>Obtendrá la CA y defensas de su nueva forma, además de ${2 * (Number(instance.level) || 1)} PG máximos.</p>
        ${manualConfirmation}${allocation}
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: "Evolucionar",
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
 * Avisa de la subida de nivel indicando cuántos se han ganado de golpe.
 * La usan #changeExperience() y #addExperience().
 */
function notifyLevelGain(item, previousLevel, currentLevel) {
  if (currentLevel <= previousLevel) return;
  const levels = currentLevel - previousLevel;
  ui.notifications.info(`${displayPokemonName(item)} ha alcanzado el nivel ${currentLevel}${levels > 1 ? ` (sube ${levels} niveles)` : ""}. Recuerda aplicar sus PG y beneficios de subida de nivel.`);
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

/**
 * Cargas iniciales de un objeto equipado: 1 para la Banda Focus (que
 * syncDeploymentHp() consume en deployment.mjs) y, si no, las que mencione su
 * descripción; null si el objeto no las usa. La usan #equipHeldItem() y
 * #restoreHeldItem().
 */
function initialHeldItemCharges(sourceId, definition) {
  if (sourceId === "focus-sash") return 1;
  const text = (definition?.description ?? []).join(" ");
  const match = text.match(/(?:has|tiene)\s+(\d+)\s+(?:charges?|cargas?)/i);
  return match ? Number(match[1]) : null;
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
