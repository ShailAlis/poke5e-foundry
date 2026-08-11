import { loadPoke5eData } from "./data-service.mjs";
import { MODULE_ID, MODULE_PATH, displayPokemonName, portraitUrl } from "./model.mjs";
import { filterMoveCatalog, moveEligibility } from "./move-learning.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Poke5ePokemonSheet extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-pokemon",
    classes: ["poke5e", "poke5e-pokemon-sheet"],
    window: { icon: "fa-solid fa-circle-dot", resizable: true },
    position: { width: 760, height: 720 }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/pokemon-sheet.hbs` } };

  constructor({ pokemonItem, ...options } = {}) {
    super({ ...options, id: `poke5e-pokemon-${pokemonItem?.id ?? "unknown"}` });
    this.pokemonItem = pokemonItem;
    this.moveManagerOpen = false;
    this.moveFilters = { query: "", category: "available" };
    this.refocusMoveSearch = false;
  }

  get title() {
    return game.i18n.format("POKE5E.Sheet.Title", { name: displayPokemonName(this.pokemonItem) });
  }

  async _prepareContext() {
    const data = await loadPoke5eData();
    const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const instance = this.pokemonItem.getFlag(MODULE_ID, "instance") ?? {};
    const level = Number(instance.level) || 1;
    const moves = (instance.moves ?? []).map(entry => {
      const move = data.movesById.get(entry.moveId);
      return move ? prepareMove(entry, move, species, level) : null;
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
    const abilityScores = Object.entries(species.attributes ?? {}).map(([key, score]) => ({
      key: key.toUpperCase(), score, modifier: signed(Math.floor((Number(score) - 10) / 2))
    }));
    return {
      item: this.pokemonItem,
      trainer: this.pokemonItem.parent,
      name: displayPokemonName(this.pokemonItem),
      img: portraitUrl(species),
      species,
      instance,
      level,
      moves,
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
        entries: catalog.slice(0, 120)
      },
      abilities,
      abilityScores,
      types: (species.type ?? []).map(type => ({ id: type, label: titleCase(type) })),
      hp: instance.hp,
      ac: instance.ac ?? species.ac,
      movement: movementText(species.speed),
      canEdit: this.pokemonItem.isOwner
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll("[data-action='roll-move']").forEach(button => button.addEventListener("click", event => this.#rollMove(event)));
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
    this.element.querySelector("[data-action='change-hp']")?.addEventListener("change", event => this.#changeHp(event));
    this.element.querySelector("[data-action='open-trainer-sheet']")?.addEventListener("click", () => this.pokemonItem.parent?.sheet.render(true));
    this.element.addEventListener("dragover", event => event.preventDefault());
    this.element.addEventListener("drop", event => this.#onDrop(event));
  }

  async #changeLevel(event) {
    const instance = this.#instance();
    instance.level = Math.max(1, Math.min(20, Number(event.currentTarget.value) || 1));
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  async #changeHp(event) {
    const instance = this.#instance();
    instance.hp.value = Math.max(0, Math.min(Number(instance.hp.max) || 1, Number(event.currentTarget.value) || 0));
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  async #restorePp(event) {
    const instance = this.#instance();
    const entry = instance.moves.find(move => move.id === event.currentTarget.dataset.moveEntryId);
    if (!entry) return;
    entry.pp.value = Number(entry.pp.max) || 0;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  async #removeMove(event) {
    const instance = this.#instance();
    instance.moves = instance.moves.filter(move => move.id !== event.currentTarget.dataset.moveEntryId);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  async #removeAbility(event) {
    const instance = this.#instance();
    instance.abilities = instance.abilities.filter(id => id !== event.currentTarget.dataset.abilityId);
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  async #learnMove(event) {
    const data = await loadPoke5eData();
    const move = data.movesById.get(event.currentTarget.dataset.moveId);
    if (!move) return ui.notifications.error("No se encontró el movimiento.");
    const instance = this.#instance();
    const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
    const eligibility = moveEligibility(species, move, Number(instance.level) || 1);
    if (!eligibility.availableNow) return notifyMoveUnavailable(move, eligibility);
    if (instance.moves.some(entry => entry.moveId === move.id)) return ui.notifications.warn("Este Pokémon ya conoce ese movimiento.");
    if (instance.moves.length >= 6) return ui.notifications.warn("Este Pokémon ya conoce el máximo de seis movimientos. Olvida uno antes de aprender otro.");
    instance.moves.push(moveEntry(move));
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

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
      if (instance.moves.length >= 6) return ui.notifications.warn("Un Pokémon no puede conocer más de seis movimientos, incluso con las dotes correspondientes.");
      const move = document.getFlag(MODULE_ID, "move");
      if (!move?.id) return ui.notifications.error("El movimiento no contiene datos válidos.");
      const species = this.pokemonItem.getFlag(MODULE_ID, "species") ?? {};
      const eligibility = moveEligibility(species, move, Number(instance.level) || 1);
      if (!eligibility.availableNow) return notifyMoveUnavailable(move, eligibility);
      instance.moves.push(moveEntry(move));
    } else if (kind === "ability") {
      if (instance.abilities.includes(sourceId)) return ui.notifications.warn("Este Pokémon ya tiene esa habilidad.");
      instance.abilities.push(sourceId);
    } else return;
    await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  async #rollMove(event) {
    const data = await loadPoke5eData();
    const instance = this.#instance();
    const entry = instance.moves.find(candidate => candidate.id === event.currentTarget.dataset.moveEntryId);
    const move = data.movesById.get(entry?.moveId);
    if (!entry || !move) return;
    if (Number(entry.pp.max) > 0 && Number(entry.pp.value) <= 0) {
      return ui.notifications.warn(game.i18n.format("POKE5E.Notifications.NoPP", { name: displayPokemonName(this.pokemonItem), move: move.name }));
    }
    if (Number(entry.pp.max) > 0) {
      entry.pp.value = Math.max(0, Number(entry.pp.value) - 1);
      await this.pokemonItem.setFlag(MODULE_ID, "instance", instance);
    }

    const species = this.pokemonItem.getFlag(MODULE_ID, "species");
    const level = Number(instance.level) || 1;
    const moveModifier = getMoveModifier(species, move);
    const proficiency = 2 + Math.floor((level - 1) / 4);
    const name = displayPokemonName(this.pokemonItem);
    const flavor = `${name} — ${move.name}`;
    const speaker = ChatMessage.getSpeaker({ actor: this.pokemonItem.parent, alias: name });

    if (move.attack?.scope) {
      const attack = await new Roll("1d20 + @mod + @prof", { mod: moveModifier, prof: proficiency }).evaluate();
      await attack.toMessage({ speaker, flavor: `${flavor} (${titleCase(move.attack.scope)})` });
    } else if (move.save) {
      const dc = 8 + moveModifier + proficiency;
      const attributes = (move.save.attribute ?? []).map(key => key.toUpperCase()).join("/");
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card"><header class="card-header"><h3>${escapeHtml(flavor)}</h3></header><p><strong>Salvación ${escapeHtml(attributes)} CD ${dc}</strong></p>${moveDescription(move)}</div>` });
    } else {
      await ChatMessage.create({ speaker, content: `<div class="dnd5e chat-card"><header class="card-header"><h3>${escapeHtml(flavor)}</h3></header>${moveDescription(move)}</div>` });
    }
    const formula = damageFormula(move, level, moveModifier, species);
    if (formula) {
      const damage = await new Roll(formula).evaluate();
      const damageType = (move.damage?.type ?? []).map(titleCase).join("/");
      await damage.toMessage({ speaker, flavor: `${flavor} — ${damageType || "Daño"}` });
    }
    this.render({ force: true });
  }

  #instance() {
    return foundry.utils.deepClone(this.pokemonItem.getFlag(MODULE_ID, "instance"));
  }
}

function prepareMove(entry, move, species, level) {
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
    learningMethods: eligibility.methods,
    learningWarning: eligibility.compatible && !eligibility.availableNow
      ? `Requiere nivel ${eligibility.requiredLevel}`
      : eligibility.compatible ? "" : "No figura en los movimientos de esta especie"
  };
}

function moveEntry(move) {
  const pp = Math.max(Number(move?.pp) || 0, 0);
  return { id: foundry.utils.randomID(), moveId: move.id, pp: { value: pp, max: pp } };
}

function notifyMoveUnavailable(move, eligibility) {
  if (eligibility.future) return ui.notifications.warn(`${move.name} se aprende a nivel ${eligibility.requiredLevel}.`);
  return ui.notifications.warn(`${move.name} no puede ser aprendido por esta especie Pokémon.`);
}

function getMoveModifier(species, move) {
  const configured = Array.isArray(move.power) ? move.power : move.power ? [move.power] : [];
  if (configured.includes("none")) return 0;
  const allowed = !configured.length || configured.some(value => value === "any" || value === "varies")
    ? ["str", "dex", "con", "int", "wis", "cha"] : configured;
  return Math.max(...allowed.map(key => Math.floor(((Number(species.attributes?.[key]) || 10) - 10) / 2)));
}

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

function appendModifier(dice, modifier) {
  if (!modifier) return String(dice);
  return `${dice} ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}`;
}

function moveDescription(move) {
  const body = (move.description ?? []).map(text => `<p>${escapeHtml(text)}</p>`).join("");
  return `${body}${move.higherLevels ? `<h3>A niveles superiores</h3><p>${escapeHtml(move.higherLevels)}</p>` : ""}`;
}

function movementText(speeds = []) {
  const labels = { walking: "Caminar", flying: "Volar", swimming: "Nadar", burrowing: "Excavar", climbing: "Trepar", hover: "Flotar" };
  return speeds.map(speed => `${labels[speed.type] ?? titleCase(speed.type)} ${speed.value} ft`).join(" · ");
}

function signed(value) { return Number(value) >= 0 ? `+${value}` : String(value); }
function titleCase(value) { return String(value).split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
