/**
 * Interfaz del generador de Entrenadores NPC, exclusiva del director. Reúne en
 * un formulario todas las opciones del NPC (identidad, nivel, origen,
 * arquetipo, dificultad, inventario, token y permisos) y del
 * equipo, permite ajustarlo Pokémon a Pokémon y lanza la creación.
 *
 * Las reglas están en npc-trainer-rules.mjs y la creación de documentos en
 * npc-trainer-actor.mjs; aquí solo vive el estado del formulario. La abren el
 * menú de ajustes, el control de escena y la macro
 * `game.poke5e.openNpcTrainerGenerator`, registrados en main.mjs. Su plantilla es
 * `templates/npc-trainer-generator.hbs`.
 */
import { loadPoke5eData } from "../core/data-service.mjs";
import { MODULE_PATH, portraitUrl, trainerPokeslotsForLevel } from "../core/model.mjs";
import { NATURES, ORIGINS } from "./trainer-creation-data.mjs";
import { createNpcTrainerActor, ensureNpcTrainerFolder, placeNpcTrainer } from "./npc-trainer-actor.mjs";
import { NPC_ARCHETYPES, NPC_DEFAULT_ARCHETYPE, NPC_DIFFICULTIES, filterNpcTrainerSpecies, generateNpcTrainerTeam, trainerControlSr } from "./npc-trainer-rules.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Ventana del generador de Entrenadores NPC. */
export class Poke5eNpcTrainerGenerator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-npc-trainer-generator",
    classes: ["poke5e", "poke5e-npc-trainer-generator"],
    window: { title: "POKE5E.NpcGenerator.WindowTitle", icon: "fa-solid fa-users-gear", resizable: true },
    position: { width: 1120, height: 820 }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/npc-trainer-generator.hbs`, scrollable: [""] } };

  /**
   * Arranca con la configuración de defaultConfig() y el equipo vacío; nada se
   * guarda en el mundo hasta pulsar crear. `creating` bloquea el botón mientras
   * se generan los actores.
   */
  constructor(options = {}) {
    super(options);
    this.config = defaultConfig();
    this.team = [];
    this.creating = false;
    this.refocusSearch = false;
  }

  /**
   * Prepara el formulario entero: las especies candidatas que devuelve
   * filterNpcTrainerSpecies() (recortadas a 80), el equipo actual con su retrato
   * y datos, el límite de Pokéslots del nivel elegido, el SR máximo que permite
   * trainerControlSr() y todos los desplegables, unos fijos y otros deducidos del
   * catálogo con uniqueOptions(). Corta con `unauthorized` si no es el director.
   */
  async _prepareContext() {
    if (!game.user.isGM) return { unauthorized: true };
    const data = await loadPoke5eData();
    const pool = filterNpcTrainerSpecies(data.pokemon, this.config, data.evolutions).sort((a, b) => Number(a.number) - Number(b.number));
    const entries = this.team.map((entry, index) => {
      const species = data.pokemonById.get(entry.speciesId);
      return {
        ...entry, index, name: species?.name ?? entry.speciesId, img: species ? portraitUrl(species) : "icons/svg/mystery-man.svg",
        number: species?.number ?? "—", sr: species?.sr ?? 0, minLevel: species?.minLevel ?? 1, types: species?.type ?? []
      };
    });
    const maxTeamSize = trainerPokeslotsForLevel(this.config.trainerLevel);
    return {
      unauthorized: false,
      config: this.config,
      creating: this.creating,
      poolCount: pool.length,
      poolTruncated: pool.length > 80,
      team: entries,
      teamCount: entries.length,
      teamFull: entries.length >= maxTeamSize,
      maxTeamSize,
      canCreate: entries.length > 0 && !this.creating,
      archetypeOptions: optionMap(NPC_ARCHETYPES),
      difficultyOptions: optionMap(NPC_DIFFICULTIES),
      originOptions: { random: game.i18n.localize("POKE5E.Options.Random"), ...Object.fromEntries(ORIGINS.map(entry => [entry.id, entry.name])) },
      genderOptions: { random: game.i18n.localize("POKE5E.Options.Random"), male: game.i18n.localize("POKE5E.Options.Male"), female: game.i18n.localize("POKE5E.Options.Female") },
      natureOptions: Object.fromEntries(NATURES.map(nature => [nature, nature])),
      environmentOptions: localizeOptionMap({ coast: "CoastWater", mountain: "Mountain", other: "OtherEnvironment" }),
      compositionOptions: localizeOptionMap({ random: "FullyRandom", varied: "VariedTypes", specialized: "ByThemeType", "ace-last": "AceLast" }),
      powerBiasOptions: localizeOptionMap({ balanced: "Balanced", low: "PreferLowCR", high: "PreferHighCR" }),
      levelStrategyOptions: localizeOptionMap({ range: "RandomInRange", fixed: "SameAsTrainer", ascending: "Staggered" }),
      typeModeOptions: localizeOptionMap({ all: "MustHaveBoth", any: "MayHaveEither" }),
      stageOptions: localizeOptionMap({ any: "Any", base: "BaseOnly", evolved: "EvolvedOnly", final: "FinalOnly", nonfinal: "CanStillEvolve" }),
      ownershipOptions: localizeOptionMap({ 0: "None", 1: "Limited", 2: "Observer", 3: "Owner" }),
      dispositionOptions: localizeOptionMap({ "-1": "Hostile", 0: "Neutral", 1: "Friendly" }),
      displayNameOptions: localizeOptionMap({ 0: "Never", 10: "OnHover", 20: "Always", 30: "OwnerHover", 40: "OwnerOnly" }),
      displayBarsOptions: localizeOptionMap({ 0: "Never", 10: "OnHover", 20: "Always", 40: "OwnerOnly" }),
      deployCountOptions: localizeOptionMap({ 0: "None", 1: "First", 2: "FirstTwo", all: "WholeTeam" }),
      quantityPlural: Number(this.config.quantity) !== 1,
      controlSr: trainerControlSr(this.config.trainerLevel),
      typeOptions: uniqueOptions(data.pokemon.flatMap(entry => entry.type ?? []), titleCase),
      biomeOptions: uniqueOptions(data.pokemon.flatMap(entry => entry.habitat?.biomes ?? []), titleCase),
      regionOptions: uniqueOptions(data.pokemon.flatMap(entry => [...(entry.habitat?.regions ?? []), entry.habitat?.nativeRegion].filter(Boolean))),
      ballOptions: Object.fromEntries(data.items.filter(entry => entry.type === "pokeball").map(entry => [entry.id, entry.name])),
      candidates: pool.slice(0, 80).map(species => ({
        id: species.id, name: species.name, img: portraitUrl(species), number: species.number, sr: species.sr,
        minLevel: species.minLevel, types: species.type ?? [], region: species.habitat?.nativeRegion ?? ""
      }))
    };
  }

  /**
   * Conecta los campos del formulario con #changeConfig(), la búsqueda con
   * retardo y los botones de generar equipo, vaciar, restablecer, añadir o quitar
   * especies, resortear, ajustar nivel y shiny, y crear los Entrenadores.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    if (!game.user.isGM) return;
    this.element.querySelectorAll("[data-config]").forEach(input => input.addEventListener("change", event => this.#changeConfig(event)));
    const search = this.element.querySelector("[data-action='search']");
    search?.addEventListener("input", foundry.utils.debounce(event => {
      this.config.query = event.target.value;
      this.refocusSearch = true;
      this.render({ force: true });
    }, 200));
    this.element.querySelector("[data-action='generate-team']")?.addEventListener("click", () => this.#generateTeam());
    this.element.querySelector("[data-action='clear-team']")?.addEventListener("click", () => { this.team = []; this.render({ force: true }); });
    this.element.querySelector("[data-action='reset']")?.addEventListener("click", () => { this.config = defaultConfig(); this.team = []; this.render({ force: true }); });
    this.element.querySelectorAll("[data-action='add-species']").forEach(button => button.addEventListener("click", event => this.#addSpecies(event.currentTarget.dataset.speciesId)));
    this.element.querySelectorAll("[data-action='remove-pokemon']").forEach(button => button.addEventListener("click", event => this.#removePokemon(event.currentTarget.dataset.index)));
    this.element.querySelectorAll("[data-action='reroll-pokemon']").forEach(button => button.addEventListener("click", event => this.#rerollPokemon(event.currentTarget.dataset.index)));
    this.element.querySelectorAll("[data-action='pokemon-level']").forEach(input => input.addEventListener("change", event => this.#changePokemonLevel(event)));
    this.element.querySelectorAll("[data-action='pokemon-shiny']").forEach(input => input.addEventListener("change", event => this.#changePokemonShiny(event)));
    this.element.querySelector("[data-action='create-trainers']")?.addEventListener("click", () => this.#createTrainers());
    if (this.refocusSearch && search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      this.refocusSearch = false;
    }
  }

  /**
   * Guarda el valor de un campo y solo redibuja cuando el cambio afecta a lo que
   * se muestra (filtros, nivel o camino), para no interrumpir la escritura en los
   * demás. Al bajar el nivel recorta el equipo a los Pokéslots disponibles.
   */
  #changeConfig(event) {
    const input = event.currentTarget;
    this.config[input.dataset.config] = input.type === "checkbox" ? input.checked : input.value;
    if (input.dataset.config === "trainerLevel") this.team = this.team.slice(0, trainerPokeslotsForLevel(this.config.trainerLevel));
    if (["quantity", "trainerLevel", "respectControlLimit", "typePrimary", "typeSecondary", "typeMode", "region", "biome", "srMin", "srMax", "levelMax", "stage", "includeIds", "excludeIds"].includes(input.dataset.config)) this.render({ force: true });
  }

  /**
   * Vuelca a `config` el contenido de todos los campos. Se llama antes de
   * generar o crear para recoger los que #changeConfig() no provoca redibujado.
   */
  #captureAll() {
    for (const input of this.element.querySelectorAll("[data-config]")) this.config[input.dataset.config] = input.type === "checkbox" ? input.checked : input.value;
  }

  /**
   * Sortea el equipo con generateNpcTrainerTeam() sobre las especies filtradas.
   * Si se pidió composición temática sin fijar un tipo, elige uno al azar.
   */
  async #generateTeam() {
    this.#captureAll();
    if (this.config.composition === "specialized" && !this.config.teamType) {
      const types = [...new Set((await loadPoke5eData()).pokemon.flatMap(entry => entry.type ?? []))];
      this.config.teamType = types[Math.floor(Math.random() * types.length)] ?? "";
      ui.notifications.info(game.i18n.localize("POKE5E.NpcGenerator.RandomThemeTypeChosen"));
    }
    const data = await loadPoke5eData();
    const pool = filterNpcTrainerSpecies(data.pokemon, this.config, data.evolutions);
    this.team = generateNpcTrainerTeam(pool, this.config);
    if (!this.team.length) ui.notifications.warn(game.i18n.localize("POKE5E.NpcGenerator.NoTeamSpecies"));
    this.render({ force: true });
  }

  /**
   * Añade a mano una especie al equipo respetando los Pokéslots y, si está
   * activa, la opción de no repetir especie.
   */
  async #addSpecies(speciesId) {
    const maxTeamSize = trainerPokeslotsForLevel(this.config.trainerLevel);
    if (this.team.length >= maxTeamSize) return ui.notifications.warn(game.i18n.format("POKE5E.NpcGenerator.MaximumSlots", { max: maxTeamSize }));
    const data = await loadPoke5eData();
    const species = data.pokemonById.get(speciesId);
    if (!species) return;
    if (this.config.uniqueSpecies && this.team.some(entry => entry.speciesId === speciesId)) return ui.notifications.warn(game.i18n.localize("POKE5E.NpcGenerator.UniqueActive"));
    const chosenLevel = Math.max(Number(species.minLevel) || 1, Math.min(20, Number(this.config.trainerLevel) || 1));
    this.team.push({ speciesId, level: chosenLevel, shiny: false });
    this.render({ force: true });
  }

  /** Quita un Pokémon del equipo previsto. */
  #removePokemon(index) {
    this.team.splice(Number(index), 1);
    this.render({ force: true });
  }

  /**
   * Sustituye un Pokémon por otro sorteado con los mismos filtros, excluyendo
   * las especies que ya ocupan los demás puestos si se exigen únicas.
   */
  async #rerollPokemon(index) {
    this.#captureAll();
    const data = await loadPoke5eData();
    let pool = filterNpcTrainerSpecies(data.pokemon, this.config, data.evolutions);
    if (this.config.uniqueSpecies) {
      const used = new Set(this.team.filter((entry, entryIndex) => entryIndex !== Number(index)).map(entry => entry.speciesId));
      pool = pool.filter(species => !used.has(species.id));
    }
    const [replacement] = generateNpcTrainerTeam(pool, { ...this.config, teamSize: 1 });
    if (!replacement) return ui.notifications.warn(game.i18n.localize("POKE5E.NpcGenerator.NoReplacement"));
    this.team[Number(index)] = replacement;
    this.render({ force: true });
  }

  /** Ajusta a mano el nivel de un Pokémon, sin bajar del mínimo de su especie. */
  #changePokemonLevel(event) {
    const entry = this.team[Number(event.currentTarget.dataset.index)];
    if (!entry) return;
    entry.level = Math.max(Number(event.currentTarget.min) || 1, Math.min(20, Math.trunc(Number(event.currentTarget.value) || 1)));
    this.render({ force: true });
  }

  /**
   * Marca o desmarca a un Pokémon como shiny. No redibuja, para no perder el
   * foco al recorrer las casillas.
   */
  #changePokemonShiny(event) {
    const entry = this.team[Number(event.currentTarget.dataset.index)];
    if (entry) entry.shiny = event.currentTarget.checked;
  }

  /**
   * Crea los Entrenadores con createNpcTrainerActor(): el primero lleva el
   * equipo preparado en pantalla y los demás uno sorteado de nuevo, todos en la
   * carpeta que asegura ensureNpcTrainerFolder(). Si se pidió, los coloca en la
   * escena con placeNpcTrainer() y abre la ficha del primero. Máximo 12 por tanda.
   */
  async #createTrainers() {
    if (this.creating) return;
    this.#captureAll();
    if (!this.team.length) return ui.notifications.warn(game.i18n.localize("POKE5E.NpcGenerator.PreparePokemon"));
    if (this.config.placeOnScene && (!canvas?.ready || !canvas.scene)) return ui.notifications.warn(game.i18n.localize("POKE5E.NpcGenerator.OpenSceneOrDisable"));
    this.creating = true;
    this.render({ force: true });
    const created = [];
    try {
      const data = await loadPoke5eData();
      const pool = filterNpcTrainerSpecies(data.pokemon, this.config, data.evolutions);
      const folder = await ensureNpcTrainerFolder(this.config.folderName);
      const quantity = Math.max(1, Math.min(12, Math.trunc(Number(this.config.quantity) || 1)));
      for (let index = 0; index < quantity; index++) {
        const team = index === 0 ? this.team : generateNpcTrainerTeam(pool, this.config);
        if (!team.length) throw new Error(game.i18n.localize("POKE5E.NpcGenerator.TeamGenerationFailed"));
        const actor = await createNpcTrainerActor({ ...this.config, folderId: folder?.id ?? null, quantity }, team, data, index);
        created.push(actor);
        if (this.config.placeOnScene) await placeNpcTrainer(actor, { deployCount: this.config.deployCount });
      }
      ui.notifications.info(game.i18n.format("POKE5E.NpcGenerator.Created", { count: created.length }));
      if (this.config.openSheet && created[0]) created[0].sheet?.render(true);
    } catch (error) {
      console.error("poke5e-foundry | NPC Trainer generation failed", error);
      ui.notifications.error(game.i18n.format("POKE5E.NpcGenerator.GenerationFailed", { error: error.message }));
    } finally {
      this.creating = false;
      this.render({ force: true });
    }
  }
}

/**
 * Configuración inicial del formulario, con todas las opciones del NPC, del
 * equipo, de los filtros de especie, del inventario y del token.
 * La usan el constructor y el botón de restablecer.
 */
function defaultConfig() {
  return {
    quantity: 1, name: "", image: "", useTitle: true, gender: "random", age: "", trainerLevel: 5,
    origin: "random", archetype: NPC_DEFAULT_ARCHETYPE, difficulty: "standard", notes: "",
    teamSize: 3, composition: "varied", teamType: "", powerBias: "balanced", levelStrategy: "range", levelMin: 3, levelMax: 6,
    uniqueSpecies: true, shinyChance: 0, randomNature: true, nature: "Hardy",
    query: "", typePrimary: "", typeSecondary: "", typeMode: "all", region: "", biome: "", srMin: "", srMax: "",
    stage: "any", includeIds: "", excludeIds: "", respectControlLimit: true,
    ballType: "poke-ball", ballCount: 5, potionCount: 2, money: 1500,
    folderName: game.i18n.localize("POKE5E.NpcGenerator.DefaultFolder"), ownership: 0, disposition: -1, displayName: 20, displayBars: 20,
    tokenVision: true, visionRange: 0, placeOnScene: false, deployCount: 0, openSheet: true, hoennEnvironment: "coast"
  };
}

/**
 * Convierte en desplegable un catálogo con entradas {name}, como NPC_ARCHETYPES
 * o NPC_DIFFICULTIES.
 */
function optionMap(entries) { return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value.name])); }
function localizeOptionMap(entries) { return Object.fromEntries(Object.entries(entries).map(([value, key]) => [value, game.i18n.localize(`POKE5E.Options.${key}`)])); }
/** Desplegable de los valores presentes en el catálogo, sin repetir y ordenados. */
function uniqueOptions(values, labeler = value => value) { return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b))).reduce((result, value) => ({ ...result, [value]: labeler(value) }), {}); }
/** Capitaliza tipos y biomas para los desplegables. */
function titleCase(value) { return String(value).split("-").map(part => part.charAt(0).toLocaleUpperCase() + part.slice(1)).join(" "); }
