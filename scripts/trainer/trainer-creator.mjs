/**
 * Asistente guiado de creación de Entrenadores jugadores, en cuatro pasos:
 * identidad y origen, competencias y especialización, Pokémon inicial y resumen.
 * Al terminar escribe en el actor sus características, competencias, idiomas,
 * PG, dinero, clase de Entrenador con sus rasgos de nivel 1, equipo inicial y
 * Pokémon inicial.
 *
 * Las reglas y su validación están en trainer-creation-data.mjs; aquí quedan la
 * interfaz y la escritura de documentos. Se abre solo al crear un personaje
 * (hook `createActor` de main.mjs) y también desde el botón de cabecera o la
 * macro `game.poke5e.createTrainer`. Además exporta las dos funciones con las que
 * main.mjs impide especies distintas de Humano. Su equivalente para los NPC es
 * npc-trainer-actor.mjs; la plantilla es `templates/trainer-creator.hbs`.
 */
import { loadPoke5eData } from "../core/data-service.mjs";
import {
  MODULE_ID, MODULE_PATH, gearItemSource, getPack, pokemonItemSourceFromSpecies, portraitUrl,
  speciesItemSource, trainerClassSource, trainerFeatureSources
} from "../core/model.mjs";
import { ABILITIES, CLASS_SKILLS, NATURES, ORIGINS, POINT_BUY_COSTS, SKILLS, SPECIALIZATIONS, STANDARD_ARRAY, resolveBaseAbilities, resolveTrainerCreation } from "./trainer-creation-data.mjs";
import { pokedollarCurrency } from "../world/economy.mjs";
import { withEggMoveChance } from "../world/encounter-generator.mjs";
import { trainerFeatOptions } from "./feat-catalog.mjs";
import { escapeHtml, titleCase } from "../core/utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
/**
 * Prefijo de los flags de los Items que crea el asistente. Permite reconocerlos y
 * reemplazarlos si se vuelve a ejecutar, sin tocar lo que se haya añadido después.
 */
const CREATION_KIND_PREFIX = "trainer-creation-";

/** Ventana del asistente de creación de Entrenador, con sus cuatro pasos. */
export class Poke5eTrainerCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-trainer-creator",
    classes: ["poke5e", "poke5e-trainer-creator"],
    window: { title: "POKE5E.Creator.WindowTitle", icon: "fa-solid fa-user-plus", resizable: true },
    position: { width: 800, height: 760 }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/trainer-creator.hbs`, scrollable: [""] } };

  /**
   * Empieza en el paso 1 y rellena la selección con lo guardado en el flag
   * `trainerCreation`, de modo que reabrir el asistente retome lo ya elegido.
   */
  constructor({ actor, ...options } = {}) {
    super({ ...options, id: `poke5e-trainer-creator-${actor?.id ?? "unknown"}` });
    this.actor = actor;
    const previous = actor?.getFlag(MODULE_ID, "trainerCreation") ?? {};
    this.step = 1;
    this.selection = {
      name: actor?.name === "New Actor" ? "" : actor?.name ?? "",
      gender: previous.gender ?? "",
      age: previous.age ?? "",
      baseAbilityMethod: previous.baseAbilityMethod ?? "standard",
      baseAbilityStr: previous.baseAbilityStr ?? 8,
      baseAbilityDex: previous.baseAbilityDex ?? 12,
      baseAbilityCon: previous.baseAbilityCon ?? 13,
      baseAbilityInt: previous.baseAbilityInt ?? 10,
      baseAbilityWis: previous.baseAbilityWis ?? 14,
      baseAbilityCha: previous.baseAbilityCha ?? 15,
      origin: previous.origin ?? "",
      originAbilityOption: previous.originAbilityOption ?? 0,
      originAbilityPrimary: previous.originAbilityPrimary ?? "cha",
      originAbilitySecondary: previous.originAbilitySecondary ?? "dex",
      environment: previous.environment ?? "",
      chosenFeat: previous.chosenFeat ?? "",
      classSkills: previous.classSkills ?? [],
      extraSkills: previous.extraSkills ?? [],
      specialization: previous.specialization ?? "",
      starter: previous.starter ?? "",
      nature: previous.nature ?? "",
      ability: previous.ability ?? ""
    };
    this.saving = false;
  }

  /**
   * Prepara los cuatro pasos a la vez —la plantilla enseña solo el activo—:
   * métodos de característica con el gasto de puntos, orígenes con sus opciones
   * de bonificación, habilidades de clase ocultando las que ya concede el origen
   * o la especialización, campos propios de Hoenn, Kanto y Teselia, la lista de
   * iniciales (SR ≤ 1/2 sin evolucionar) con sus habilidades y naturalezas, y el
   * resumen final. Llama a resolveTrainerCreation() en cada dibujado para mostrar
   * al momento el resultado o el error, sin bloquear la navegación.
   */
  async _prepareContext() {
    const data = await loadPoke5eData();
    const origin = ORIGINS.find(entry => entry.id === this.selection.origin);
    const specialization = SPECIALIZATIONS.find(entry => entry.type === this.selection.specialization);
    const unavailableClassSkills = new Set([origin?.skill, specialization?.skill].filter(Boolean));
    const evolvedSpecies = new Set(data.evolutions.map(entry => entry.to));
    const starters = data.pokemon
      .filter(species => Number(species.sr) <= 0.5 && !evolvedSpecies.has(species.id))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map(species => option(species.id, `${species.name} (SR ${species.sr})`, this.selection.starter));
    const starter = data.pokemonById.get(this.selection.starter);
    const abilities = (starter?.abilities ?? []).filter(entry => !entry.hidden).map(entry => ({
      value: entry.id,
      label: data.abilitiesById.get(entry.id)?.name ?? titleCase(entry.id),
      selected: entry.id === this.selection.ability
    }));
    let resolved = null;
    let resolutionError = "";
    try { resolved = resolveTrainerCreation(this.selection); } catch (error) { resolutionError = error.message; }
    return {
      actorName: this.actor?.name,
      step: this.step,
      step1: this.step === 1, step2: this.step === 2, step3: this.step === 3, step4: this.step === 4,
      canBack: this.step > 1, isLast: this.step === 4, saving: this.saving,
      selection: this.selection,
      baseAbilityStandard: this.selection.baseAbilityMethod === "standard",
      baseAbilityPointBuy: this.selection.baseAbilityMethod === "point-buy",
      baseAbilityManual: this.selection.baseAbilityMethod === "manual",
      baseAbilityMethods: [
        option("standard", game.i18n.localize("POKE5E.Creator.StandardArray"), this.selection.baseAbilityMethod),
        option("point-buy", game.i18n.localize("POKE5E.Creator.PointBuy"), this.selection.baseAbilityMethod),
        option("manual", game.i18n.localize("POKE5E.Creator.ManualScores"), this.selection.baseAbilityMethod)
      ],
      baseAbilityFields: Object.entries(ABILITIES).map(([key, label]) => {
        const inputName = `baseAbility${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        return { key, label, inputName, value: this.selection[inputName], options: STANDARD_ARRAY.map(value => option(value, value, this.selection[inputName])) };
      }),
      pointBuySpent: pointBuySpent(this.selection),
      pointBuyRemaining: 27 - pointBuySpent(this.selection),
      skills: SKILLS,
      origins: ORIGINS.map(entry => option(entry.id, entry.name, this.selection.origin)),
      origin,
      originFixedAbilities: origin && origin.abilities !== "any-two" && !Array.isArray(origin.abilities[0])
        ? abilityBonusLabel(origin.abilities) : "",
      originAbilityOptions: origin && Array.isArray(origin.abilities[0])
        ? origin.abilities.map((values, index) => option(index, abilityBonusLabel(values), this.selection.originAbilityOption)) : [],
      originAnyTwo: origin?.abilities === "any-two",
      abilityOptionsPrimary: selectEntries(ABILITIES, this.selection.originAbilityPrimary),
      abilityOptionsSecondary: selectEntries(ABILITIES, this.selection.originAbilitySecondary),
      classSkillOptions: CLASS_SKILLS.filter(key => !unavailableClassSkills.has(key)).map(key => ({ value: key, label: SKILLS[key], selected: this.selection.classSkills.includes(key) })),
      selectedClassSkills: this.selection.classSkills.map(key => SKILLS[key]).filter(Boolean),
      selectedClassSkillCount: this.selection.classSkills.length,
      hasSpecialization: Boolean(specialization),
      grantedSkills: [
        { source: game.i18n.localize("POKE5E.Creator.Class"), label: SKILLS.ani },
        origin?.skill ? { source: game.i18n.format("POKE5E.Creator.OriginSource", { origin: origin.name }), label: SKILLS[origin.skill] } : null,
        specialization?.skill ? { source: game.i18n.format("POKE5E.Creator.SpecializationSource", { specialization: specialization.name }), label: SKILLS[specialization.skill] } : null
      ].filter(Boolean),
      specializationAbilityBonus: specialization?.ability ? game.i18n.format("POKE5E.Creator.SpecializationAbilityBonus", { ability: ABILITIES[specialization.ability] }) : "",
      extraSkillOptions: Object.entries(SKILLS).map(([value, label]) => ({ value, label, selected: this.selection.extraSkills.includes(value) })),
      specializations: SPECIALIZATIONS.map(entry => ({
        ...option(entry.type, game.i18n.format("POKE5E.Creator.SpecializationLabel", { name: entry.name, type: titleCase(entry.type) }), this.selection.specialization),
        effect: entry.ability ? `+1 ${ABILITIES[entry.ability]}` : game.i18n.format("POKE5E.Creator.ProficiencyOrExpertise", { skill: SKILLS[entry.skill] })
      })),
      isHoenn: origin?.id === "hoennian", isKanto: origin?.id === "kantoan", isUnova: origin?.id === "unovan",
      chosenFeatOptions: origin?.id === "kantoan"
        ? (await trainerFeatOptions()).map(entry => option(entry.name, entry.name, this.selection.chosenFeat))
        : [],
      environmentOptions: [
        ["coast", game.i18n.localize("POKE5E.Creator.EnvironmentCoast")], ["desert", game.i18n.localize("POKE5E.Creator.EnvironmentDesert")],
        ["forest", game.i18n.localize("POKE5E.Creator.EnvironmentForest")], ["mountain", game.i18n.localize("POKE5E.Creator.EnvironmentMountain")]
      ].map(([value, label]) => option(value, label, this.selection.environment)),
      starters, starter: starter ? { ...starter, img: portraitUrl(starter) } : null, starterAbilities: abilities,
      natures: NATURES.map(value => option(value, value, this.selection.nature)),
      resolved,
      hasConstitutionSave: resolved?.savingThrows.includes("con") ?? false,
      resolutionError,
      abilitySummary: resolved ? Object.entries(resolved.abilities).map(([key, value]) => `${ABILITIES[key]} ${value}`).join(" · ") : "",
      skillSummary: resolved ? Object.entries(resolved.proficiencyRanks).map(([key, rank]) => `${SKILLS[key]}${rank === 2 ? game.i18n.localize("POKE5E.Creator.ExpertiseSuffix") : ""}`).join(", ") : ""
    };
  }

  /** Conecta los campos del formulario y los botones de atrás, siguiente y finalizar. */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll("input, select").forEach(input => input.addEventListener("change", event => this.#capture(event)));
    this.element.querySelector("[data-action='back']")?.addEventListener("click", () => { this.#captureAll(); this.step--; this.render({ force: true }); });
    this.element.querySelector("[data-action='next']")?.addEventListener("click", () => this.#next());
    this.element.querySelector("[data-action='finish']")?.addEventListener("click", () => this.#finish());
  }

  /**
   * Guarda el cambio de un campo y redibuja solo cuando afecta a lo que se
   * muestra. Antes de redibujar vuelca todo el formulario con #captureAll() para
   * no perder lo escrito, y reaplica el valor que acaba de cambiar porque el DOM
   * todavía no lo refleja. Cambiar de inicial borra la habilidad elegida y
   * cambiar de especialización libera las habilidades de clase que ya concede.
   */
  #capture(event) {
    const input = event.currentTarget;
    const changedName = input.name;
    const changedValue = input.value;
    if (input.name === "classSkills" || input.name === "extraSkills") {
      this.selection[input.name] = [...this.element.querySelectorAll(`[name='${input.name}']:checked`)].map(entry => entry.value);
    } else this.selection[input.name] = input.value;
    if (["origin", "starter", "specialization", "baseAbilityMethod"].includes(input.name)) {
      this.#captureAll();
      this.selection[changedName] = changedValue;
      if (changedName === "starter") this.selection.ability = "";
      if (changedName === "specialization") this.#removeGrantedClassSkills();
      this.render({ force: true });
    } else if (input.name === "classSkills" || input.name.startsWith("baseAbility")) {
      this.render({ force: true });
    }
  }

  /**
   * Vuelca a `selection` todos los campos visibles, incluidas las casillas de
   * habilidades. Se llama antes de navegar entre pasos y antes de finalizar.
   */
  #captureAll() {
    for (const input of this.element.querySelectorAll("input:not([type='checkbox']):not([type='radio']), select")) {
      if (input.name) this.selection[input.name] = input.value;
    }
    for (const name of ["classSkills", "extraSkills"]) {
      const fields = [...this.element.querySelectorAll(`[name='${name}']`)];
      if (fields.length) this.selection[name] = fields.filter(entry => entry.checked).map(entry => entry.value);
    }
  }

  /**
   * Descarta de las habilidades de clase las que ya conceden el origen o la
   * especialización, para que resolveTrainerCreation() no las rechace por
   * duplicadas al cambiar de opción.
   */
  #removeGrantedClassSkills() {
    const origin = ORIGINS.find(entry => entry.id === this.selection.origin);
    const specialization = SPECIALIZATIONS.find(entry => entry.type === this.selection.specialization);
    const granted = new Set([origin?.skill, specialization?.skill].filter(Boolean));
    this.selection.classSkills = this.selection.classSkills.filter(skill => !granted.has(skill));
  }

  /**
   * Avanza al paso siguiente si validateStep() no encuentra problemas; si los
   * hay, los explica y se queda donde está.
   */
  #next() {
    this.#captureAll();
    const error = validateStep(this.step, this.selection);
    if (error) return ui.notifications.warn(error);
    this.step++;
    this.render({ force: true });
  }

  /**
   * Cierra el asistente: valida la ficha entera y el inicial, comprueba permisos
   * y aplica todo con applyTrainerCreation(). Si algo falla, lo comunica y deja
   * la ventana abierta para corregirlo.
   */
  async #finish() {
    if (this.saving) return;
    this.#captureAll();
    let rules;
    try {
      rules = resolveTrainerCreation(this.selection);
      validateStarter(this.selection);
    } catch (error) { return ui.notifications.warn(error.message); }
    if (!this.actor?.isOwner) return ui.notifications.error(game.i18n.localize("POKE5E.Creator.NoPermission"));
    this.saving = true;
    this.render({ force: true });
    try {
      await applyTrainerCreation(this.actor, this.selection, rules);
      ui.notifications.info(game.i18n.format("POKE5E.Creator.Created", { name: this.selection.name }));
      await this.close();
      this.actor.sheet?.render(true);
    } catch (error) {
      console.error(`${MODULE_ID} | Trainer creation failed`, error);
      ui.notifications.error(game.i18n.format("POKE5E.Creator.Failed", { error: error.message }));
      this.saving = false;
      this.render({ force: true });
    }
  }
}

/**
 * Escribe en el actor el resultado del asistente: datos personales,
 * características, salvaciones, competencias, idiomas, PG, velocidades del
 * entorno de Hoenn y el dinero inicial (1000 + 100 × 4d4). Después sustituye los
 * Items que creó una ejecución anterior —reconocidos por CREATION_KIND_PREFIX o
 * por el flag `creationManaged`—, borra cualquier especie que no sea Humano y
 * añade especie, origen, dote, especialización, clase con sus rasgos de nivel 1,
 * equipo inicial y el Pokémon inicial con su naturaleza, habilidad y una
 * pequeña probabilidad de movimiento huevo (withEggMoveChance()).
 * La llama #finish().
 */
export async function applyTrainerCreation(actor, selection, rules) {
  const data = await loadPoke5eData();
  const species = data.pokemonById.get(selection.starter);
  if (!species) throw new Error("No se encontró el Pokémon inicial.");
  const selectedAbility = (species.abilities ?? []).find(entry => entry.id === selection.ability && !entry.hidden);
  if (!selectedAbility) throw new Error("La habilidad inicial no es válida.");
  const roll = await new Roll("1000 + 100 * 4d4").evaluate();
  const initialCurrency = pokedollarCurrency(roll.total);
  const updates = {
    name: String(selection.name).trim(),
    "system.details.gender": String(selection.gender ?? ""),
    "system.details.age": String(selection.age ?? ""),
    "system.details.biography.value": `<p><strong>Origen:</strong> ${escapeHtml(rules.origin.name)}. <strong>Especie:</strong> Humano.</p>`,
    "system.attributes.hp.value": rules.hp,
    "system.attributes.hp.max": rules.hp,
    "system.attributes.movement.walk": 30,
    "system.attributes.movement.swim": selection.environment === "coast" ? 30 : 0,
    "system.attributes.movement.climb": selection.environment === "mountain" ? 10 : 0,
    ...Object.fromEntries(Object.entries(initialCurrency).map(([denomination, value]) => [`system.currency.${denomination}`, value])),
    [`flags.${MODULE_ID}.trainerCreation`]: { ...selection, completed: true, version: 1, human: true }
  };
  for (const [ability, value] of Object.entries(rules.abilities)) updates[`system.abilities.${ability}.value`] = value;
  for (const ability of Object.keys(ABILITIES)) updates[`system.abilities.${ability}.proficient`] = rules.savingThrows.includes(ability) ? 1 : 0;
  for (const skill of Object.keys(SKILLS)) updates[`system.skills.${skill}.value`] = rules.proficiencyRanks[skill] ?? 0;
  updates["system.traits.languages.value"] = [];
  updates["system.traits.languages.custom"] = rules.languages.join("; ");

  const oldIds = actor.items.filter(item => item.getFlag(MODULE_ID, "creationManaged") || String(item.getFlag(MODULE_ID, "kind") ?? "").startsWith(CREATION_KIND_PREFIX)).map(item => item.id);
  if (oldIds.length) await actor.deleteEmbeddedDocuments("Item", oldIds);
  const nonHumanRaceIds = actor.items.filter(item => item.type === "race" && !isHumanSpecies(item)).map(item => item.id);
  if (nonHumanRaceIds.length) await actor.deleteEmbeddedDocuments("Item", nonHumanRaceIds);
  // Borrar una clase con avances puede revertir PG y competencias; se reaplica
  // el resultado del asistente después para que una segunda ejecución sea estable.
  await actor.update(updates);

  const sourceSpecies = speciesItemSource(species, data.movesById, data.evolutionsByFrom.get(species.id) ?? []);
  const pokemon = pokemonItemSourceFromSpecies(sourceSpecies);
  pokemon.flags[MODULE_ID].instance.nature = selection.nature;
  pokemon.flags[MODULE_ID].instance.abilities = [selection.ability];
  // Igual que los Pokémon salvajes y los de un equipo NPC (buildWildInstance()),
  // el inicial tiene una pequeña probabilidad de salir con un movimiento huevo:
  // es su única vía posible, ya que no se puede elegir al subir de nivel.
  pokemon.flags[MODULE_ID].instance.moves = withEggMoveChance(pokemon.flags[MODULE_ID].instance.moves, species, data.movesById);
  pokemon.flags[MODULE_ID].kind = "pokemon";
  pokemon.flags[MODULE_ID].creationManaged = true;
  const gear = startingGearSources(data);
  const originFeat = await originFeatSource(rules, selection);
  const trainerClass = await trainerClassCreationSource(selection);
  const sources = [
    humanSpeciesSource(), originSource(rules), originFeat, specializationSource(rules),
    trainerClass, ...levelOneFeatureSources(), ...gear, pokemon
  ];
  await actor.createEmbeddedDocuments("Item", sources, { poke5eTrainerCreation: true });
}

/**
 * Elimina de un actor que se está creando cualquier especie que no sea Humano y
 * lo marca con el flag `humanOnly`. La llama el hook `preCreateActor` de
 * main.mjs; el hook `preCreateItem` hace lo propio con las especies posteriores.
 */
export function enforceHumanActorSource(actor) {
  if (actor.type !== "character") return;
  const items = (actor._source.items ?? []).filter(item => item.type !== "race" || isHumanSpecies(item));
  actor.updateSource({ items, [`flags.${MODULE_ID}.humanOnly`]: true });
}

/**
 * Reconoce la especie Humano por su flag o por su nombre en español o inglés,
 * de modo que valga tanto la que crea el asistente como una traída de fuera.
 * Funciona con documentos y con datos en bruto, porque la usan tanto
 * enforceHumanActorSource() como el hook `preCreateItem` de main.mjs.
 */
export function isHumanSpecies(item) {
  const flag = item.getFlag ? item.getFlag(MODULE_ID, "kind") : item.flags?.[MODULE_ID]?.kind;
  const name = String(item.name ?? "").trim().toLocaleLowerCase();
  return flag === `${CREATION_KIND_PREFIX}human` || name === "human" || name === "humano";
}

/**
 * Item de especie Humano con su velocidad y tipo de criatura. Equivale al
 * humanSource() de npc-trainer-actor.mjs.
 */
function humanSpeciesSource() {
  const source = creationItem("Humano", "race", "human", "<p>En el mundo de Pokémon 5e todos los personajes jugadores son humanos. Los rasgos culturales proceden de su origen regional.</p>", "icons/svg/people.svg");
  source.system.movement = { walk: 30, fly: 0, swim: 0, burrow: 0, climb: 0, units: "ft", hover: false };
  source.system.type = { value: "humanoid", subtype: "human", custom: "" };
  return source;
}

/** Item de trasfondo del origen, con sus bonificaciones, competencia e idiomas. */
function originSource(rules) {
  return creationItem(`Origen: ${rules.origin.name}`, "background", "origin", `<p>Obtienes +2 a ${ABILITIES[rules.originAbilities[0]]} y +1 a ${ABILITIES[rules.originAbilities[1]]}, competencia en ${SKILLS[rules.origin.skill]} y los idiomas ${rules.languages.join(" y ")}.</p>`);
}

/**
 * Item de la dote del origen. En el caso de Kanto, que deja elegir cualquier
 * dote, intenta reutilizar la real del mundo o de un compendio con
 * findFeatSource() —así conserva sus efectos— y solo crea una descriptiva si no
 * la encuentra.
 */
async function originFeatSource(rules, selection) {
  if (rules.origin.id !== "kantoan") return creationItem(rules.origin.featName, "feat", "origin-feat", `<p>${rules.featDetails}</p>`, "icons/svg/book.svg");
  const existing = await findFeatSource(selection.chosenFeat);
  if (!existing) return creationItem(String(selection.chosenFeat).trim(), "feat", "origin-feat", `<p>${rules.featDetails}</p>`, "icons/svg/book.svg");
  existing.flags ??= {};
  existing.flags[MODULE_ID] = { ...(existing.flags[MODULE_ID] ?? {}), kind: `${CREATION_KIND_PREFIX}origin-feat`, sourceId: `${CREATION_KIND_PREFIX}origin-feat`, creationManaged: true };
  return existing;
}

/**
 * Item de la especialización, con su beneficio propio y el +1 a las pruebas de
 * los Pokémon de ese tipo que aplica deployment.mjs al desplegarlos.
 */
function specializationSource(rules) {
  const effect = rules.specialization.ability
    ? `Aumenta ${ABILITIES[rules.specialization.ability]} en 1, hasta un máximo de 20.`
    : `Obtienes competencia en ${SKILLS[rules.specialization.skill]}; si ya la tenías, obtienes Pericia.`;
  const source = trainerClassFeatureSource(creationItem(`Especialización: ${rules.specialization.name}`, "feat", "specialization", `<p>${effect}</p><p>Los Pokémon de tipo ${titleCase(rules.specialization.type)} obtienen +1 a todas sus pruebas de habilidad.</p>`, "icons/svg/upgrade.svg"));
  source.flags[MODULE_ID].specializationType = rules.specialization.type;
  return source;
}

/**
 * Clase Entrenador para el asistente: enlaza los rasgos del compendio y conserva
 * todos los avances nativos futuros. Los PG y competencias de nivel 1 se marcan
 * como ya aplicados, y se omite solo el ItemGrant de nivel 1 porque esos rasgos
 * los entrega levelOneFeatureSources() dentro del mismo asistente.
 */
async function trainerClassCreationSource(selection) {
  const source = trainerClassSource(await trainerFeatureUuids());
  for (const [id, advancement] of Object.entries(source.system.advancement)) {
    if (advancement.type === "ItemGrant" && advancement.level === 1) delete source.system.advancement[id];
    else if (advancement.type === "HitPoints") advancement.value = { 1: "max" };
    else if (advancement.type === "Trait" && advancement.level === 1) {
      advancement.value = { chosen: ["saves:cha", "skills:ani", ...(selection.classSkills ?? []).map(skill => `skills:${skill}`)] };
    }
  }
  source.flags[MODULE_ID].kind = `${CREATION_KIND_PREFIX}class`;
  return source;
}

/** UUID de los rasgos importados que usarán los ItemGrant de niveles futuros. */
async function trainerFeatureUuids() {
  const pack = getPack("progression");
  if (!pack) {
    ui.notifications.warn(game.i18n.localize("POKE5E.Creator.ImportProgression"));
    return new Map();
  }
  const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.sourceId`, `flags.${MODULE_ID}.kind`] });
  const uuids = new Map();
  for (const entry of index.values()) {
    if (foundry.utils.getProperty(entry, `flags.${MODULE_ID}.kind`) !== "trainer-feature") continue;
    const sourceId = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`);
    if (sourceId) uuids.set(sourceId, `Compendium.${pack.collection}.Item.${entry._id}`);
  }
  return uuids;
}

/**
 * Rasgos de nivel 1: los de TRAINER_FEATURES que devuelve trainerFeatureSources()
 * más los propios del asistente (licencia, Pokédex, competencia con Poké Balls y
 * los tres Pokéslots iniciales).
 */
function levelOneFeatureSources() {
  const features = trainerFeatureSources().filter(source => source.flags[MODULE_ID].level === 1);
  for (const source of features) source.flags[MODULE_ID].kind = `${CREATION_KIND_PREFIX}feature`;
  return [
    ...features,
    trainerClassFeatureSource(creationItem("Licencia de Entrenador", "feat", "license", "<p>Autoriza a capturar Pokémon y permite acceder a servicios de Centros Pokémon y Poké Mart.</p>")),
    trainerClassFeatureSource(creationItem("Pokédex", "feat", "pokedex", "<p>Como acción adicional, identifica un Pokémon a 60 pies, registra su especie y revela su SR base y datos breves.</p>")),
    trainerClassFeatureSource(creationItem("Competencia con Poké Balls", "feat", "pokeball-proficiency", "<p>Eres competente con Poké Balls y puedes utilizarlas para realizar intentos de captura.</p>")),
    trainerClassFeatureSource(creationItem("Pokéslots (3)", "feat", "pokeslots", "<p>Puedes llevar a tu Pokémon inicial y otros dos Pokémon en el equipo activo.</p>"))
  ];
}

function trainerClassFeatureSource(source) {
  source.system.type = { value: "class", subtype: "" };
  source.flags[MODULE_ID].featureOrigin = "trainer";
  return source;
}

/**
 * Equipo inicial: cinco Poké Balls y una Poción tomadas del catálogo —las mismas
 * que después reconocerá capture.mjs—, más la licencia y la Pokédex como objetos.
 */
function startingGearSources(data) {
  const sources = [];
  for (const [id, quantity] of [["poke-ball", 5], ["potion", 1]]) {
    const entry = data.itemsById.get(id);
    if (!entry) continue;
    const source = gearItemSource(entry);
    source.system.quantity = quantity;
    source.flags[MODULE_ID].creationManaged = true;
    sources.push(source);
  }
  sources.push(creationItem("Licencia de Entrenador", "loot", "license-item", "<p>Documento oficial que autoriza a su portador a capturar y entrenar Pokémon.</p>", "icons/svg/book.svg"));
  sources.push(creationItem("Pokédex", "loot", "pokedex-item", "<p>Dispositivo de identificación y registro de especies Pokémon.</p>", "icons/svg/eye.svg"));
  return sources;
}

/**
 * Constructor común de los Items del asistente, que les pone el prefijo
 * CREATION_KIND_PREFIX y el flag `creationManaged` para poder sustituirlos si se
 * vuelve a ejecutar.
 */
function creationItem(name, type, id, description, img = "icons/svg/item-bag.svg") {
  return {
    name, type, img,
    system: { description: { value: description, chat: "" }, identifier: `poke5e-${id}` },
    flags: { [MODULE_ID]: { kind: `${CREATION_KIND_PREFIX}${id}`, sourceId: `${CREATION_KIND_PREFIX}${id}`, creationManaged: true } }
  };
}

/**
 * Busca una dote por nombre entre los Items del mundo y, si no aparece, en todos
 * los compendios de Items, y devuelve una copia limpia con cleanEmbeddedSource().
 * Solo la usa originFeatSource() para la dote libre de Kanto.
 */
async function findFeatSource(name) {
  const normalized = String(name ?? "").trim().toLocaleLowerCase();
  const worldItem = game.items.find(item => item.type === "feat" && item.name.trim().toLocaleLowerCase() === normalized);
  if (worldItem) return cleanEmbeddedSource(worldItem.toObject());
  for (const pack of game.packs) {
    if (pack.documentName !== "Item") continue;
    const index = await pack.getIndex({ fields: ["type"] });
    const match = [...index.values()].find(entry => entry.type === "feat" && entry.name.trim().toLocaleLowerCase() === normalized);
    if (!match) continue;
    const document = await pack.getDocument(match._id);
    if (document) return cleanEmbeddedSource(document.toObject());
  }
  return null;
}

/**
 * Quita de un documento copiado los campos propios de su origen (id, estadísticas,
 * carpeta y permisos) para poder embeberlo en otro actor.
 * Auxiliar de findFeatSource().
 */
function cleanEmbeddedSource(source) {
  const clone = foundry.utils.deepClone(source);
  delete clone._id;
  delete clone._stats;
  delete clone.folder;
  delete clone.ownership;
  return clone;
}

/**
 * Valida lo exigible en cada paso y devuelve el mensaje del primer problema, o
 * cadena vacía si todo está bien: nombre, origen y características en el 1;
 * la ficha completa vía resolveTrainerCreation() en el 2; y el inicial en el 3.
 * La usa #next().
 */
function validateStep(step, selection) {
  if (step === 1) {
    if (!String(selection.name).trim()) return "Escribe el nombre del Entrenador.";
    if (!selection.origin) return "Selecciona una región de origen.";
    try { resolveBaseAbilities(selection); } catch (error) { return error.message; }
    const origin = ORIGINS.find(entry => entry.id === selection.origin);
    if (origin?.abilities === "any-two" && selection.originAbilityPrimary === selection.originAbilitySecondary) return "Las dos características del origen deben ser diferentes.";
    if (origin?.id === "hoennian" && !selection.environment) return "Elige el entorno de la dote de Hoenn.";
    if (origin?.id === "kantoan" && !String(selection.chosenFeat).trim()) return "Indica la dote elegida por tu origen de Kanto.";
  }
  if (step === 2) {
    try { resolveTrainerCreation(selection); } catch (error) { return error.message; }
  }
  if (step === 3) {
    try { validateStarter(selection); } catch (error) { return error.message; }
  }
  return "";
}

/**
 * Comprueba que estén elegidos el Pokémon inicial, su naturaleza y una habilidad
 * no oculta; lanza Error si falta alguno. La usan validateStep() y #finish().
 */
function validateStarter(selection) {
  if (!selection.starter) throw new Error("Selecciona un Pokémon inicial.");
  if (!selection.nature) throw new Error("Selecciona la naturaleza del Pokémon inicial.");
  if (!selection.ability) throw new Error("Selecciona una habilidad no oculta para el Pokémon inicial.");
}

/** Crea una opción de desplegable marcando la seleccionada. Base de toda la plantilla. */
function option(value, label, selected) { return { value, label, selected: String(value) === String(selected) }; }
/** Convierte un catálogo clave→etiqueta en opciones con option(). */
function selectEntries(entries, selected) { return Object.entries(entries).map(([value, label]) => option(value, label, selected)); }
/** Texto de la bonificación de un origen ("+2 Carisma, +1 Destreza"). */
function abilityBonusLabel(values) { return `+2 ${ABILITIES[values[0]]}, +1 ${ABILITIES[values[1]]}`; }
/**
 * Puntos gastados en compra de puntos según POINT_BUY_COSTS, para mostrar en
 * vivo cuántos quedan. La misma cuenta la verifica resolveBaseAbilities().
 */
function pointBuySpent(selection) {
  return Object.keys(ABILITIES).reduce((total, key) => {
    const inputName = `baseAbility${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    return total + (POINT_BUY_COSTS[Number(selection[inputName])] ?? 0);
  }, 0);
}
