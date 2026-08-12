import { loadPoke5eData } from "./data-service.mjs";
import { MODULE_PATH, portraitUrl, trainerPokeslotsForLevel } from "./model.mjs";
import { NATURES, ORIGINS, SPECIALIZATIONS } from "./trainer-creation-data.mjs";
import { createNpcTrainerActor, ensureNpcTrainerFolder, placeNpcTrainer } from "./npc-trainer-actor.mjs";
import { NPC_ARCHETYPES, NPC_DIFFICULTIES, NPC_TRAINER_PATHS, filterNpcTrainerSpecies, generateNpcTrainerTeam, trainerControlSr } from "./npc-trainer-rules.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Poke5eNpcTrainerGenerator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-npc-trainer-generator",
    classes: ["poke5e", "poke5e-npc-trainer-generator"],
    window: { title: "Generador de Entrenadores NPC", icon: "fa-solid fa-users-gear", resizable: true },
    position: { width: 1120, height: 820 }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/npc-trainer-generator.hbs`, scrollable: [""] } };

  constructor(options = {}) {
    super(options);
    this.config = defaultConfig();
    this.team = [];
    this.creating = false;
    this.refocusSearch = false;
  }

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
      pathOptions: { random: "Aleatorio", ...optionMap(NPC_TRAINER_PATHS) },
      originOptions: { random: "Aleatorio", ...Object.fromEntries(ORIGINS.map(entry => [entry.id, entry.name])) },
      specializationOptions: { random: "Aleatoria", ...Object.fromEntries(SPECIALIZATIONS.map(entry => [entry.type, `${entry.name} · ${titleCase(entry.type)}`])) },
      genderOptions: { random: "Aleatorio", Masculino: "Masculino", Femenino: "Femenino", "No binario": "No binario" },
      natureOptions: Object.fromEntries(NATURES.map(nature => [nature, nature])),
      environmentOptions: { coast: "Costa / agua", mountain: "Montaña", other: "Otro entorno" },
      compositionOptions: { random: "Totalmente aleatoria", varied: "Tipos variados", specialized: "Según especialización", "ace-last": "As en último lugar" },
      powerBiasOptions: { balanced: "Equilibrada", low: "Priorizar SR bajo", high: "Priorizar SR alto" },
      levelStrategyOptions: { range: "Aleatorios en rango", fixed: "Iguales al Entrenador", ascending: "Escalonados" },
      typeModeOptions: { all: "Debe tener ambos", any: "Puede tener cualquiera" },
      stageOptions: { any: "Cualquiera", base: "Solo formas base", evolved: "Solo evolucionados", final: "Solo evoluciones finales", nonfinal: "Con evoluciones pendientes" },
      ownershipOptions: { 0: "Ninguno", 1: "Limitado", 2: "Observador", 3: "Propietario" },
      dispositionOptions: { "-1": "Hostil", 0: "Neutral", 1: "Amistosa" },
      displayNameOptions: { 0: "Nunca", 10: "Al pasar el ratón", 20: "Siempre", 30: "Dueño al pasar", 40: "Solo dueño" },
      displayBarsOptions: { 0: "Nunca", 10: "Al pasar el ratón", 20: "Siempre", 40: "Solo dueño" },
      deployCountOptions: { 0: "Ninguno", 1: "El primero", 2: "Los dos primeros", all: "Todo el equipo" },
      quantityPlural: Number(this.config.quantity) !== 1,
      controlSr: trainerControlSr(this.config.trainerLevel, this.config.path === "random" ? "none" : this.config.path),
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

  #changeConfig(event) {
    const input = event.currentTarget;
    this.config[input.dataset.config] = input.type === "checkbox" ? input.checked : input.value;
    if (input.dataset.config === "trainerLevel") this.team = this.team.slice(0, trainerPokeslotsForLevel(this.config.trainerLevel));
    if (["quantity", "trainerLevel", "path", "respectControlLimit", "typePrimary", "typeSecondary", "typeMode", "region", "biome", "srMin", "srMax", "levelMax", "stage", "includeIds", "excludeIds"].includes(input.dataset.config)) this.render({ force: true });
  }

  #captureAll() {
    for (const input of this.element.querySelectorAll("[data-config]")) this.config[input.dataset.config] = input.type === "checkbox" ? input.checked : input.value;
  }

  async #generateTeam() {
    this.#captureAll();
    if (this.config.composition === "specialized" && this.config.specialization === "random") {
      this.config.specialization = SPECIALIZATIONS[Math.floor(Math.random() * SPECIALIZATIONS.length)].type;
      ui.notifications.info("Se ha elegido una especialización al azar para construir el equipo temático.");
    }
    const data = await loadPoke5eData();
    const pool = filterNpcTrainerSpecies(data.pokemon, this.config, data.evolutions);
    this.team = generateNpcTrainerTeam(pool, this.config);
    if (!this.team.length) ui.notifications.warn("Ninguna especie cumple todos los filtros del equipo.");
    this.render({ force: true });
  }

  async #addSpecies(speciesId) {
    const maxTeamSize = trainerPokeslotsForLevel(this.config.trainerLevel);
    if (this.team.length >= maxTeamSize) return ui.notifications.warn(`Los Pokéslots de este Entrenador permiten un máximo de ${maxTeamSize} Pokémon.`);
    const data = await loadPoke5eData();
    const species = data.pokemonById.get(speciesId);
    if (!species) return;
    if (this.config.uniqueSpecies && this.team.some(entry => entry.speciesId === speciesId)) return ui.notifications.warn("La opción de especies únicas está activa.");
    const chosenLevel = Math.max(Number(species.minLevel) || 1, Math.min(20, Number(this.config.trainerLevel) || 1));
    this.team.push({ speciesId, level: chosenLevel, shiny: false });
    this.render({ force: true });
  }

  #removePokemon(index) {
    this.team.splice(Number(index), 1);
    this.render({ force: true });
  }

  async #rerollPokemon(index) {
    this.#captureAll();
    const data = await loadPoke5eData();
    let pool = filterNpcTrainerSpecies(data.pokemon, this.config, data.evolutions);
    if (this.config.uniqueSpecies) {
      const used = new Set(this.team.filter((entry, entryIndex) => entryIndex !== Number(index)).map(entry => entry.speciesId));
      pool = pool.filter(species => !used.has(species.id));
    }
    const [replacement] = generateNpcTrainerTeam(pool, { ...this.config, teamSize: 1 });
    if (!replacement) return ui.notifications.warn("No queda ninguna especie compatible para sustituirla.");
    this.team[Number(index)] = replacement;
    this.render({ force: true });
  }

  #changePokemonLevel(event) {
    const entry = this.team[Number(event.currentTarget.dataset.index)];
    if (!entry) return;
    entry.level = Math.max(Number(event.currentTarget.min) || 1, Math.min(20, Math.trunc(Number(event.currentTarget.value) || 1)));
    this.render({ force: true });
  }

  #changePokemonShiny(event) {
    const entry = this.team[Number(event.currentTarget.dataset.index)];
    if (entry) entry.shiny = event.currentTarget.checked;
  }

  async #createTrainers() {
    if (this.creating) return;
    this.#captureAll();
    if (!this.team.length) return ui.notifications.warn("Genera o prepara al menos un Pokémon para el equipo.");
    if (this.config.placeOnScene && (!canvas?.ready || !canvas.scene)) return ui.notifications.warn("Abre una escena o desactiva la colocación automática.");
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
        if (!team.length) throw new Error("No se pudo generar uno de los equipos solicitados.");
        const actor = await createNpcTrainerActor({ ...this.config, folderId: folder?.id ?? null, quantity }, team, data, index);
        created.push(actor);
        if (this.config.placeOnScene) await placeNpcTrainer(actor, { deployCount: this.config.deployCount });
      }
      ui.notifications.info(`Creados ${created.length} Entrenador${created.length === 1 ? "" : "es"} NPC con sus equipos.`);
      if (this.config.openSheet && created[0]) created[0].sheet?.render(true);
    } catch (error) {
      console.error("poke5e-foundry | NPC Trainer generation failed", error);
      ui.notifications.error(`No se pudo completar la generación: ${error.message}`);
    } finally {
      this.creating = false;
      this.render({ force: true });
    }
  }
}

function defaultConfig() {
  return {
    quantity: 1, name: "", image: "", useTitle: true, gender: "random", age: "", trainerLevel: 5,
    origin: "random", specialization: "random", path: "random", archetype: "balanced", difficulty: "standard", notes: "",
    teamSize: 3, composition: "varied", powerBias: "balanced", levelStrategy: "range", levelMin: 3, levelMax: 6,
    uniqueSpecies: true, shinyChance: 0, randomNature: true, nature: "Hardy",
    query: "", typePrimary: "", typeSecondary: "", typeMode: "all", region: "", biome: "", srMin: "", srMax: "",
    stage: "any", includeIds: "", excludeIds: "", respectControlLimit: true,
    ballType: "poke-ball", ballCount: 5, potionCount: 2, money: 1500,
    folderName: "Entrenadores NPC", ownership: 0, disposition: -1, displayName: 20, displayBars: 20,
    tokenVision: true, visionRange: 0, placeOnScene: false, deployCount: 0, openSheet: true, hoennEnvironment: "coast"
  };
}

function optionMap(entries) { return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value.name])); }
function uniqueOptions(values, labeler = value => value) { return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b))).reduce((result, value) => ({ ...result, [value]: labeler(value) }), {}); }
function titleCase(value) { return String(value).split("-").map(part => part.charAt(0).toLocaleUpperCase() + part.slice(1)).join(" "); }
