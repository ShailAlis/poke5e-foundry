import { MODULE_ID, MODULE_PATH, getPack, getPokemonItems, pokemonItemSourceFromSpecies } from "./model.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Poke5eSpeciesBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-species-browser",
    classes: ["poke5e", "poke5e-species-browser"],
    window: { title: "Añadir Pokémon", icon: "fa-solid fa-magnifying-glass", resizable: true },
    position: { width: 680, height: 720 }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/species-browser.hbs` } };

  constructor({ actor, ...options } = {}) {
    super({ ...options, id: `poke5e-species-browser-${actor?.id ?? "unknown"}` });
    this.actor = actor;
    this.filters = defaultFilters();
    this.refocusSearch = false;
  }

  get title() {
    return `Añadir Pokémon a ${this.actor.name}`;
  }

  async _prepareContext() {
    const pack = getPack("species");
    if (!pack) return { missingPack: true, entries: [], total: 0, filters: this.filters };
    const speciesPath = `flags.${MODULE_ID}.species`;
    const index = await pack.getIndex({ fields: [
      "img", `flags.${MODULE_ID}.sourceId`, `${speciesPath}.number`, `${speciesPath}.type`,
      `${speciesPath}.sr`, `${speciesPath}.minLevel`
    ] });
    const query = this.filters.query.trim().toLocaleLowerCase();
    const number = entry => Number(foundry.utils.getProperty(entry, `${speciesPath}.number`)) || 0;
    const sr = entry => Number(foundry.utils.getProperty(entry, `${speciesPath}.sr`)) || 0;
    const minLevel = entry => Number(foundry.utils.getProperty(entry, `${speciesPath}.minLevel`)) || 1;
    const types = entry => foundry.utils.getProperty(entry, `${speciesPath}.type`) ?? [];
    const all = [...index.values()].filter(entry => {
      const sourceId = String(foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`) ?? "").toLocaleLowerCase();
      if (query && !entry.name.toLocaleLowerCase().includes(query) && !sourceId.includes(query) && !String(number(entry)).includes(query)) return false;
      if (this.filters.type && !types(entry).includes(this.filters.type)) return false;
      if (this.filters.srMin !== "" && sr(entry) < Number(this.filters.srMin)) return false;
      if (this.filters.srMax !== "" && sr(entry) > Number(this.filters.srMax)) return false;
      if (this.filters.levelMin !== "" && minLevel(entry) < Number(this.filters.levelMin)) return false;
      if (this.filters.levelMax !== "" && minLevel(entry) > Number(this.filters.levelMax)) return false;
      return true;
    });
    all.sort(sortSpecies(this.filters.sort, { number, sr, minLevel }));
    const typeOptions = [...new Set([...index.values()].flatMap(types))]
      .sort((a, b) => a.localeCompare(b))
      .reduce((options, type) => ({ ...options, [type]: capitalize(type) }), {});
    return {
      missingPack: false,
      filters: this.filters,
      typeOptions,
      sortOptions: {
        number: "Número Pokédex",
        name: "Nombre",
        "sr-asc": "SR: menor primero",
        "sr-desc": "SR: mayor primero",
        level: "Nivel mínimo"
      },
      total: all.length,
      truncated: all.length > 80,
      entries: all.slice(0, 80).map(entry => ({
        id: entry._id,
        name: entry.name,
        img: entry.img,
        number: number(entry),
        types: types(entry),
        sr: sr(entry),
        minLevel: minLevel(entry)
      }))
    };
  }

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

  async #add(event) {
    if (!this.actor.isOwner) return ui.notifications.warn("No tienes permiso para modificar este entrenador.");
    const pack = getPack("species");
    const speciesDocument = await pack?.getDocument(event.currentTarget.dataset.documentId);
    if (!speciesDocument) return ui.notifications.error("No se encontró la especie en el compendio.");
    const source = pokemonItemSourceFromSpecies(speciesDocument);
    if (getPokemonItems(this.actor).filter(item => item.getFlag(MODULE_ID, "instance")?.inTeam).length >= 6) {
      source.flags[MODULE_ID].instance.inTeam = false;
    }
    await this.actor.createEmbeddedDocuments("Item", [source]);
    ui.notifications.info(`${speciesDocument.name} se ha añadido a ${this.actor.name}.`);
    this.render({ force: true });
  }
}

function defaultFilters() {
  return { query: "", type: "", srMin: "", srMax: "", levelMin: "", levelMax: "", sort: "number" };
}

function sortSpecies(sort, accessors) {
  switch (sort) {
    case "name": return (a, b) => a.name.localeCompare(b.name, game.i18n.lang);
    case "sr-asc": return (a, b) => accessors.sr(a) - accessors.sr(b) || accessors.number(a) - accessors.number(b);
    case "sr-desc": return (a, b) => accessors.sr(b) - accessors.sr(a) || accessors.number(a) - accessors.number(b);
    case "level": return (a, b) => accessors.minLevel(a) - accessors.minLevel(b) || accessors.number(a) - accessors.number(b);
    default: return (a, b) => accessors.number(a) - accessors.number(b);
  }
}

function capitalize(value) {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
