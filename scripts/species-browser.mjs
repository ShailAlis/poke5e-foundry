/**
 * Buscador de especies con el que añadir Pokémon a un entrenador. Combina el
 * índice del compendio de especies con el catálogo de data-service.mjs, de modo
 * que funcione aunque el mundo aún no tenga compendios y muestre también las
 * especies que el director haya creado a mano.
 *
 * Lo abren trainer-team.mjs y trainer-actor-sheet.mjs; su plantilla es
 * `templates/species-browser.hbs`.
 */
import { loadPoke5eData } from "./data-service.mjs";
import { MODULE_ID, MODULE_PATH, displayAssetUrl, getPack, getPokemonItems, pokemonItemSourceFromSpecies, speciesItemSource, trainerPokeslotLimit } from "./model.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Ventana de búsqueda de especies con filtros por texto, tipo, SR y nivel
 * mínimo, ordenaciones varias y añadido directo al entrenador.
 */
export class Poke5eSpeciesBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-species-browser",
    classes: ["poke5e", "poke5e-species-browser"],
    window: { title: "POKE5E.SpeciesBrowser.Add", icon: "fa-solid fa-magnifying-glass", resizable: true },
    position: { width: 680, height: 720 }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/species-browser.hbs` } };

  /**
   * Guarda el entrenador destino y arranca con los filtros de defaultFilters().
   * El id incluye el del actor para que cada entrenador tenga su propia ventana.
   */
  constructor({ actor, ...options } = {}) {
    super({ ...options, id: `poke5e-species-browser-${actor?.id ?? "unknown"}` });
    this.actor = actor;
    this.filters = defaultFilters();
    this.refocusSearch = false;
  }

  /** Título con el nombre del entrenador que recibirá la especie. */
  get title() {
    return game.i18n.format("POKE5E.SpeciesBrowser.AddTo", { name: this.actor.name });
  }

  /**
   * Arma la lista de resultados: cruza el índice del compendio con el catálogo
   * de loadPoke5eData() mediante catalogEntry(), añade las especies propias del
   * mundo que no vengan en los datos, aplica los filtros, ordena con
   * sortSpecies() y recorta a 80 entradas avisando de que hay más.
   */
  async _prepareContext() {
    const pack = getPack("species");
    if (!pack) return { missingPack: true, entries: [], total: 0, filters: this.filters };
    const data = await loadPoke5eData();
    const speciesPath = `flags.${MODULE_ID}.species`;
    const index = await pack.getIndex({ fields: [
      "img", `flags.${MODULE_ID}.sourceId`, `${speciesPath}.number`, `${speciesPath}.type`,
      `${speciesPath}.sr`, `${speciesPath}.minLevel`
    ] });
    const indexed = [...index.values()];
    const bySourceId = new Map(indexed.map(entry => [sourceId(entry), entry]).filter(([id]) => id));
    const bundledIds = new Set(data.pokemon.map(species => species.id));
    const catalog = data.pokemon.map(species => catalogEntry(bySourceId.get(species.id), species));
    for (const entry of indexed) {
      const id = sourceId(entry);
      const customEntry = catalogEntry(entry);
      if (id && !bundledIds.has(id) && customEntry.number > 0) catalog.push(customEntry);
    }

    const query = this.filters.query.trim().toLocaleLowerCase();
    const all = catalog.filter(entry => {
      if (query && !entry.name.toLocaleLowerCase().includes(query) && !entry.sourceId.includes(query) && !String(entry.number).includes(query)) return false;
      if (this.filters.type && !entry.types.includes(this.filters.type)) return false;
      if (this.filters.srMin !== "" && entry.sr < Number(this.filters.srMin)) return false;
      if (this.filters.srMax !== "" && entry.sr > Number(this.filters.srMax)) return false;
      if (this.filters.levelMin !== "" && entry.minLevel < Number(this.filters.levelMin)) return false;
      if (this.filters.levelMax !== "" && entry.minLevel > Number(this.filters.levelMax)) return false;
      return true;
    });
    all.sort(sortSpecies(this.filters.sort));
    const typeOptions = [...new Set(catalog.flatMap(entry => entry.types))]
      .sort((a, b) => a.localeCompare(b))
      .reduce((options, type) => ({ ...options, [type]: capitalize(type) }), {});
    return {
      missingPack: false,
      filters: this.filters,
      typeOptions,
      sortOptions: {
        number: game.i18n.localize("POKE5E.SpeciesBrowser.SortNumber"),
        name: game.i18n.localize("POKE5E.Common.Name"),
        "sr-asc": game.i18n.localize("POKE5E.SpeciesBrowser.SortSrAsc"),
        "sr-desc": game.i18n.localize("POKE5E.SpeciesBrowser.SortSrDesc"),
        level: game.i18n.localize("POKE5E.Common.MinimumLevelLabel")
      },
      total: all.length,
      truncated: all.length > 80,
      entries: all.slice(0, 80)
    };
  }

  /**
   * Conecta la caja de búsqueda (con retardo), los filtros, el botón de limpiar
   * y los de añadir. Como cada cambio redibuja la ventana, `refocusSearch`
   * devuelve el cursor al final del texto para no interrumpir la escritura.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    const search = this.element.querySelector("[data-action='search']");
    search?.addEventListener("input", foundry.utils.debounce(event => {
      this.filters.query = event.target.value;
      this.refocusSearch = true;
      this.render({ force: true });
    }, 200));
    for (const input of this.element.querySelectorAll("[data-filter]")) {
      input.addEventListener("change", event => {
        this.filters[event.currentTarget.dataset.filter] = event.currentTarget.value;
        this.render({ force: true });
      });
    }
    this.element.querySelector("[data-action='clear-filters']")?.addEventListener("click", () => {
      this.filters = defaultFilters();
      this.render({ force: true });
    });
    if (this.refocusSearch && search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      this.refocusSearch = false;
    }
    this.element.querySelectorAll("[data-action='add-species']").forEach(button => button.addEventListener("click", event => this.#add(event)));
  }

  /**
   * Añade la especie elegida al entrenador: toma el documento del compendio o,
   * si no existe, lo genera al vuelo con speciesItemSource(); lo convierte en
   * Pokémon individual con pokemonItemSourceFromSpecies() y lo manda a la
   * reserva si el equipo activo ya está lleno según trainerPokeslotLimit().
   */
  async #add(event) {
    if (!this.actor.isOwner) return ui.notifications.warn(game.i18n.localize("POKE5E.Notifications.NoTrainerPermission"));
    const pack = getPack("species");
    const documentId = event.currentTarget.dataset.documentId;
    const speciesDocument = documentId ? await pack?.getDocument(documentId) : null;
    let catalogSource = speciesDocument;
    if (!catalogSource) {
      const data = await loadPoke5eData();
      const species = data.pokemonById.get(event.currentTarget.dataset.sourceId);
      if (!species) return ui.notifications.error(game.i18n.localize("POKE5E.Notifications.SpeciesNotFound"));
      catalogSource = speciesItemSource(species, data.movesById, data.evolutionsByFrom.get(species.id) ?? []);
    }
    const source = pokemonItemSourceFromSpecies(catalogSource);
    if (getPokemonItems(this.actor).filter(item => item.getFlag(MODULE_ID, "instance")?.inTeam).length >= trainerPokeslotLimit(this.actor)) {
      source.flags[MODULE_ID].instance.inTeam = false;
    }
    await this.actor.createEmbeddedDocuments("Item", [source]);
    ui.notifications.info(game.i18n.format("POKE5E.Notifications.PokemonAdded", { pokemon: source.name, trainer: this.actor.name }));
    this.render({ force: true });
  }
}

/**
 * Estado inicial de los filtros. Lo usan el constructor y el botón de limpiar.
 */
function defaultFilters() {
  return { query: "", type: "", srMin: "", srMax: "", levelMin: "", levelMax: "", sort: "number" };
}

/**
 * Devuelve el comparador correspondiente a la ordenación elegida, con el número
 * de Pokédex como desempate. Auxiliar de _prepareContext().
 */
function sortSpecies(sort) {
  switch (sort) {
    case "name": return (a, b) => a.name.localeCompare(b.name, game.i18n.lang);
    case "sr-asc": return (a, b) => a.sr - b.sr || a.number - b.number;
    case "sr-desc": return (a, b) => b.sr - a.sr || a.number - b.number;
    case "level": return (a, b) => a.minLevel - b.minLevel || a.number - b.number;
    default: return (a, b) => a.number - b.number;
  }
}

/**
 * Normaliza una fila de la lista tomando los datos del índice del compendio y
 * recurriendo al catálogo JSON cuando falten, de modo que la plantilla reciba
 * siempre la misma forma. Auxiliar de _prepareContext().
 */
function catalogEntry(entry, fallback = {}) {
  const speciesPath = `flags.${MODULE_ID}.species`;
  const value = key => foundry.utils.getProperty(entry, `${speciesPath}.${key}`);
  const types = value("type");
  return {
    id: entry?._id ?? "",
    sourceId: String(sourceId(entry) || fallback.id || "").toLocaleLowerCase(),
    name: entry?.name || fallback.name || "Pokémon",
    img: displayAssetUrl(entry?.img || fallback.media?.sprite, "icons/svg/mystery-man.svg"),
    number: Number(value("number") ?? fallback.number) || 0,
    types: Array.isArray(types) ? types : fallback.type ?? [],
    sr: Number(value("sr") ?? fallback.sr) || 0,
    minLevel: Number(value("minLevel") ?? fallback.minLevel) || 1
  };
}

/**
 * Identificador de especie de una entrada del índice, en minúsculas. Es la clave
 * con la que _prepareContext() empareja compendio y catálogo.
 */
function sourceId(entry) {
  return String(foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`) ?? "").toLocaleLowerCase();
}

/** Capitaliza un tipo para el desplegable de filtros. */
function capitalize(value) {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
