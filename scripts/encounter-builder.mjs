/**
 * Interfaz del generador de encuentros salvajes, exclusiva del director. Filtra
 * el catálogo, arma la lista del encuentro —generada por objetivo de PX o a
 * mano—, permite ajustar niveles y despliega los Pokémon en la escena.
 *
 * Las reglas están en encounter-generator.mjs y el despliegue en
 * wild-deployment.mjs; aquí solo queda el estado de la ventana. La abren el menú
 * de ajustes, el control de escena y la macro `game.poke5e.openEncounterBuilder`,
 * todos registrados en main.mjs. Su plantilla es `templates/encounter-builder.hbs`.
 */
import { loadPoke5eData } from "./data-service.mjs";
import { filterEncounterSpecies, generateEncounter, MAX_ENCOUNTER_POKEMON } from "./encounter-generator.mjs";
import { MODULE_PATH, portraitUrl } from "./model.mjs";
import { experienceAward } from "./progression.mjs";
import { deployWildPokemon } from "./wild-deployment.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Ventana del generador de encuentros salvajes. */
export class Poke5eEncounterBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-encounter-builder",
    classes: ["poke5e", "poke5e-encounter-builder"],
    window: { title: "Generador de encuentros salvajes", icon: "fa-solid fa-mountain-sun", resizable: true },
    position: { width: 920, height: 760 }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/encounter-builder.hbs`, scrollable: [""] } };

  /**
   * Inicia los filtros y la lista del encuentro, que solo viven en la ventana:
   * nada se guarda en el mundo hasta desplegar. `deploying` bloquea los botones
   * mientras se coloca una tanda.
   */
  constructor(options = {}) {
    super(options);
    this.filters = defaultFilters();
    this.encounter = [];
    this.refocusSearch = false;
    this.deploying = false;
  }

  /**
   * Prepara las dos mitades de la ventana: las especies candidatas que devuelve
   * filterEncounterSpecies() (recortadas a 60) con los desplegables de tipo,
   * bioma y región que arma optionsFrom(), y el encuentro actual con nombre,
   * retrato y PX de cada entrada más el total. Corta con `unauthorized` si quien
   * la abre no es el director.
   */
  async _prepareContext() {
    if (!game.user.isGM) return { unauthorized: true };
    const data = await loadPoke5eData();
    const pool = filterEncounterSpecies(data.pokemon, this.filters).sort((a, b) => Number(a.number) - Number(b.number));
    const typeOptions = optionsFrom(data.pokemon.flatMap(entry => entry.type ?? []), titleCase);
    const biomeOptions = optionsFrom(data.pokemon.flatMap(entry => entry.habitat?.biomes ?? []), value => titleCase(value));
    const regionOptions = optionsFrom(data.pokemon.flatMap(entry => [...(entry.habitat?.regions ?? []), entry.habitat?.nativeRegion].filter(Boolean)), value => value);
    const entries = this.encounter.map(entry => {
      const species = data.pokemonById.get(entry.speciesId);
      return {
        ...entry,
        name: species?.name ?? entry.speciesId,
        img: species ? portraitUrl(species) : "icons/svg/mystery-man.svg",
        number: species?.number ?? "—",
        sr: species?.sr ?? 0,
        types: species?.type ?? [],
        minLevel: species?.minLevel ?? 1,
        experienceLabel: formatNumber(entry.experience)
      };
    });
    const totalExperience = entries.reduce((total, entry) => total + Number(entry.experience), 0);
    return {
      unauthorized: false,
      filters: this.filters,
      typeOptions,
      biomeOptions,
      regionOptions,
      poolTotal: pool.length,
      poolTruncated: pool.length > 60,
      candidates: pool.slice(0, 60).map(species => ({
        id: species.id,
        name: species.name,
        img: portraitUrl(species),
        number: species.number,
        sr: species.sr,
        minLevel: species.minLevel,
        types: species.type ?? [],
        biomes: (species.habitat?.biomes ?? []).map(titleCase).join(" · ")
      })),
      entries,
      encounterCount: entries.length,
      totalExperience,
      totalExperienceLabel: formatNumber(totalExperience),
      canDeploy: entries.some(entry => !entry.deployed) && !this.deploying,
      deploying: this.deploying,
      maxEncounterPokemon: MAX_ENCOUNTER_POKEMON
    };
  }

  /**
   * Conecta los filtros, la búsqueda con retardo (recuperando el foco tras
   * redibujar) y los botones de generar, vaciar, añadir, quitar, cambiar nivel y
   * desplegar.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    if (!game.user.isGM) return;
    const search = this.element.querySelector("[data-action='search']");
    search?.addEventListener("input", foundry.utils.debounce(event => {
      this.filters.query = event.target.value;
      this.refocusSearch = true;
      this.render({ force: true });
    }, 200));
    this.element.querySelectorAll("[data-filter]").forEach(input => input.addEventListener("change", event => {
      this.filters[event.currentTarget.dataset.filter] = event.currentTarget.value;
      this.render({ force: true });
    }));
    this.element.querySelector("[data-action='clear-filters']")?.addEventListener("click", () => {
      this.filters = defaultFilters();
      this.render({ force: true });
    });
    this.element.querySelector("[data-action='generate']")?.addEventListener("click", () => this.#generate());
    this.element.querySelector("[data-action='clear-encounter']")?.addEventListener("click", () => {
      this.encounter = [];
      this.render({ force: true });
    });
    this.element.querySelectorAll("[data-action='add-species']").forEach(button => button.addEventListener("click", event => this.#addSpecies(event)));
    this.element.querySelectorAll("[data-action='remove-entry']").forEach(button => button.addEventListener("click", event => this.#removeEntry(event)));
    this.element.querySelectorAll("[data-action='change-entry-level']").forEach(input => input.addEventListener("change", event => this.#changeEntryLevel(event)));
    this.element.querySelectorAll("[data-action='deploy-entry']").forEach(button => button.addEventListener("click", event => this.#deployEntry(event.currentTarget.dataset.entryId)));
    this.element.querySelector("[data-action='deploy-all']")?.addEventListener("click", () => this.#deployAll());
    if (this.refocusSearch && search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      this.refocusSearch = false;
    }
  }

  /**
   * Sustituye el encuentro por uno nuevo de generateEncounter(), dando a cada
   * entrada un id propio para poder editarla y desplegarla por separado.
   */
  async #generate() {
    const data = await loadPoke5eData();
    const pool = filterEncounterSpecies(data.pokemon, this.filters);
    if (!pool.length) return ui.notifications.warn("No hay especies que coincidan con estos filtros.");
    this.encounter = generateEncounter(pool, {
      count: this.filters.count,
      levelMin: this.filters.levelMin,
      levelMax: this.filters.levelMax,
      targetExperience: this.filters.targetExperience
    }).map(entry => ({ ...entry, id: foundry.utils.randomID(), deployed: false }));
    this.render({ force: true });
  }

  /**
   * Añade a mano una especie de la lista de candidatas, al nivel más bajo que
   * permitan la especie y los filtros, respetando MAX_ENCOUNTER_POKEMON.
   */
  async #addSpecies(event) {
    if (this.encounter.length >= MAX_ENCOUNTER_POKEMON) return ui.notifications.warn(`Un encuentro admite un máximo de ${MAX_ENCOUNTER_POKEMON} Pokémon.`);
    const data = await loadPoke5eData();
    const species = data.pokemonById.get(event.currentTarget.dataset.speciesId);
    if (!species) return;
    const minimum = Math.max(Number(species.minLevel) || 1, Number(this.filters.levelMin) || 1);
    const maximum = Math.max(minimum, Number(this.filters.levelMax) || 20);
    const level = Math.min(minimum, maximum, 20);
    this.encounter.push({ id: foundry.utils.randomID(), speciesId: species.id, level, experience: experienceAward(level, species.sr), deployed: false });
    this.render({ force: true });
  }

  /** Quita una entrada del encuentro; no afecta a lo ya desplegado en el mapa. */
  #removeEntry(event) {
    this.encounter = this.encounter.filter(entry => entry.id !== event.currentTarget.dataset.entryId);
    this.render({ force: true });
  }

  /**
   * Cambia el nivel de una entrada aún no desplegada y recalcula sus PX con
   * experienceAward().
   */
  async #changeEntryLevel(event) {
    const data = await loadPoke5eData();
    const entry = this.encounter.find(candidate => candidate.id === event.currentTarget.dataset.entryId);
    const species = data.pokemonById.get(entry?.speciesId);
    if (!entry || !species || entry.deployed) return;
    entry.level = Math.max(Number(species.minLevel) || 1, Math.min(20, Math.trunc(Number(event.currentTarget.value) || 1)));
    entry.experience = experienceAward(entry.level, species.sr);
    this.render({ force: true });
  }

  /**
   * Despliega una entrada con deployWildPokemon() y la marca como colocada.
   * Devuelve si lo consiguió, para que #deployAll() se detenga al cancelarse.
   * Con `batch` no redibuja ni avisa, porque de eso se encarga la tanda.
   */
  async #deployEntry(entryId, { batch = false } = {}) {
    if (!canvas?.ready || !canvas.scene) {
      if (!batch) ui.notifications.warn("Abre una escena antes de desplegar el encuentro.");
      return false;
    }
    const data = await loadPoke5eData();
    const entry = this.encounter.find(candidate => candidate.id === entryId);
    const species = data.pokemonById.get(entry?.speciesId);
    if (!entry || !species || entry.deployed) return false;
    const actor = await deployWildPokemon(species, entry.level, { encounterId: entry.id });
    if (!actor) return false;
    entry.deployed = true;
    if (!batch) this.render({ force: true });
    return true;
  }

  /**
   * Despliega en secuencia las entradas pendientes, pidiendo una posición por
   * cada una y parando en cuanto se cancela. El indicador `deploying` evita
   * lanzar dos tandas a la vez.
   */
  async #deployAll() {
    if (this.deploying) return;
    if (!canvas?.ready || !canvas.scene) return ui.notifications.warn("Abre una escena antes de desplegar el encuentro.");
    this.deploying = true;
    this.render({ force: true });
    try {
      for (const entry of this.encounter.filter(candidate => !candidate.deployed)) {
        const deployed = await this.#deployEntry(entry.id, { batch: true });
        if (!deployed) break;
      }
    } finally {
      this.deploying = false;
      this.render({ force: true });
    }
  }
}

/**
 * Filtros iniciales de la ventana, que incluyen también los parámetros de
 * generación (cantidad, rango de niveles y objetivo de PX). Los usan el
 * constructor y el botón de limpiar.
 */
function defaultFilters() {
  return { query: "", type: "", biome: "", region: "", srMin: "", srMax: "", levelMin: 1, levelMax: 20, count: 3, targetExperience: "" };
}

/**
 * Construye un desplegable a partir de los valores presentes en el catálogo,
 * sin repetir y ordenados alfabéticamente. Auxiliar de _prepareContext().
 */
function optionsFrom(values, labeler) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b))).reduce((result, value) => ({ ...result, [value]: labeler(value) }), {});
}

/** Capitaliza tipos y biomas para los desplegables. */
function titleCase(value) {
  return String(value).split("-").map(part => part.charAt(0).toLocaleUpperCase() + part.slice(1)).join(" ");
}

/** Formatea las cifras de PX según el idioma de la interfaz. */
function formatNumber(value) {
  return new Intl.NumberFormat(game.i18n.lang || "es").format(Number(value) || 0);
}
