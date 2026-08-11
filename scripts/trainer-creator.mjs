import { loadPoke5eData } from "./data-service.mjs";
import {
  MODULE_ID, MODULE_PATH, gearItemSource, pokemonItemSourceFromSpecies, portraitUrl,
  speciesItemSource, trainerClassSource, trainerFeatureSources
} from "./model.mjs";
import { ABILITIES, CLASS_SKILLS, NATURES, ORIGINS, SKILLS, SPECIALIZATIONS, resolveTrainerCreation } from "./trainer-creation-data.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const CREATION_KIND_PREFIX = "trainer-creation-";

export class Poke5eTrainerCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-trainer-creator",
    classes: ["poke5e", "poke5e-trainer-creator"],
    window: { title: "Crear Entrenador Pokémon", icon: "fa-solid fa-user-plus", resizable: true },
    position: { width: 800, height: 760 }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/trainer-creator.hbs`, scrollable: [""] } };

  constructor({ actor, ...options } = {}) {
    super({ ...options, id: `poke5e-trainer-creator-${actor?.id ?? "unknown"}` });
    this.actor = actor;
    const previous = actor?.getFlag(MODULE_ID, "trainerCreation") ?? {};
    this.step = 1;
    this.selection = {
      name: actor?.name === "New Actor" ? "" : actor?.name ?? "",
      gender: previous.gender ?? "",
      age: previous.age ?? "",
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

  async _prepareContext() {
    const data = await loadPoke5eData();
    const origin = ORIGINS.find(entry => entry.id === this.selection.origin);
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
      classSkillOptions: CLASS_SKILLS.map(key => ({ value: key, label: SKILLS[key], selected: this.selection.classSkills.includes(key) })),
      extraSkillOptions: Object.entries(SKILLS).map(([value, label]) => ({ value, label, selected: this.selection.extraSkills.includes(value) })),
      specializations: SPECIALIZATIONS.map(entry => ({
        ...option(entry.type, `${entry.name} · tipo ${titleCase(entry.type)}`, this.selection.specialization),
        effect: entry.ability ? `+1 ${ABILITIES[entry.ability]}` : `Competencia o Pericia: ${SKILLS[entry.skill]}`
      })),
      isHoenn: origin?.id === "hoennian", isKanto: origin?.id === "kantoan", isUnova: origin?.id === "unovan",
      environmentOptions: [
        ["coast", "Costa · velocidad de nado"], ["desert", "Desierto · resistencia al calor"],
        ["forest", "Bosque · ocultarse entre follaje"], ["mountain", "Montaña · escalada 10 pies"]
      ].map(([value, label]) => option(value, label, this.selection.environment)),
      starters, starter: starter ? { ...starter, img: portraitUrl(starter) } : null, starterAbilities: abilities,
      natures: NATURES.map(value => option(value, value, this.selection.nature)),
      resolved,
      hasConstitutionSave: resolved?.savingThrows.includes("con") ?? false,
      resolutionError,
      abilitySummary: resolved ? Object.entries(resolved.abilities).map(([key, value]) => `${ABILITIES[key]} ${value}`).join(" · ") : "",
      skillSummary: resolved ? Object.entries(resolved.proficiencyRanks).map(([key, rank]) => `${SKILLS[key]}${rank === 2 ? " (Pericia)" : ""}`).join(", ") : ""
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll("input, select").forEach(input => input.addEventListener("change", event => this.#capture(event)));
    this.element.querySelector("[data-action='back']")?.addEventListener("click", () => { this.#captureAll(); this.step--; this.render({ force: true }); });
    this.element.querySelector("[data-action='next']")?.addEventListener("click", () => this.#next());
    this.element.querySelector("[data-action='finish']")?.addEventListener("click", () => this.#finish());
  }

  #capture(event) {
    const input = event.currentTarget;
    if (input.name === "classSkills" || input.name === "extraSkills") {
      this.selection[input.name] = [...this.element.querySelectorAll(`[name='${input.name}']:checked`)].map(entry => entry.value);
    } else this.selection[input.name] = input.value;
    if (["origin", "starter", "specialization"].includes(input.name)) {
      if (input.name === "starter") this.selection.ability = "";
      this.render({ force: true });
    }
  }

  #captureAll() {
    for (const input of this.element.querySelectorAll("input:not([type='checkbox']):not([type='radio']), select")) {
      if (input.name) this.selection[input.name] = input.value;
    }
    for (const name of ["classSkills", "extraSkills"]) {
      this.selection[name] = [...this.element.querySelectorAll(`[name='${name}']:checked`)].map(entry => entry.value);
    }
  }

  #next() {
    this.#captureAll();
    const error = validateStep(this.step, this.selection);
    if (error) return ui.notifications.warn(error);
    this.step++;
    this.render({ force: true });
  }

  async #finish() {
    if (this.saving) return;
    this.#captureAll();
    let rules;
    try {
      rules = resolveTrainerCreation(this.selection);
      validateStarter(this.selection);
    } catch (error) { return ui.notifications.warn(error.message); }
    if (!this.actor?.isOwner) return ui.notifications.error("No tienes permiso para configurar este Entrenador.");
    this.saving = true;
    this.render({ force: true });
    try {
      await applyTrainerCreation(this.actor, this.selection, rules);
      ui.notifications.info(`${this.selection.name} ha sido creado como Entrenador humano de nivel 1.`);
      await this.close();
      this.actor.sheet?.render(true);
    } catch (error) {
      console.error(`${MODULE_ID} | Trainer creation failed`, error);
      ui.notifications.error(`No se pudo completar el Entrenador: ${error.message}`);
      this.saving = false;
      this.render({ force: true });
    }
  }
}

export async function applyTrainerCreation(actor, selection, rules) {
  const data = await loadPoke5eData();
  const species = data.pokemonById.get(selection.starter);
  if (!species) throw new Error("No se encontró el Pokémon inicial.");
  const selectedAbility = (species.abilities ?? []).find(entry => entry.id === selection.ability && !entry.hidden);
  if (!selectedAbility) throw new Error("La habilidad inicial no es válida.");
  const roll = await new Roll("1000 + 100 * 4d4").evaluate();
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
    "system.currency.gp": Number(roll.total) || 0,
    [`flags.${MODULE_ID}.trainerCreation`]: { ...selection, completed: true, version: 1, human: true }
  };
  for (const [ability, value] of Object.entries(rules.abilities)) updates[`system.abilities.${ability}.value`] = value;
  for (const ability of Object.keys(ABILITIES)) updates[`system.abilities.${ability}.proficient`] = rules.savingThrows.includes(ability) ? 1 : 0;
  for (const skill of Object.keys(SKILLS)) updates[`system.skills.${skill}.value`] = rules.proficiencyRanks[skill] ?? 0;
  updates["system.traits.languages.value"] = [];
  updates["system.traits.languages.custom"] = rules.languages.join("; ");
  await actor.update(updates);

  const oldIds = actor.items.filter(item => item.getFlag(MODULE_ID, "creationManaged") || String(item.getFlag(MODULE_ID, "kind") ?? "").startsWith(CREATION_KIND_PREFIX)).map(item => item.id);
  if (oldIds.length) await actor.deleteEmbeddedDocuments("Item", oldIds);
  const nonHumanRaceIds = actor.items.filter(item => item.type === "race" && !isHumanSpecies(item)).map(item => item.id);
  if (nonHumanRaceIds.length) await actor.deleteEmbeddedDocuments("Item", nonHumanRaceIds);

  const sourceSpecies = speciesItemSource(species, data.movesById, data.evolutionsByFrom.get(species.id) ?? []);
  const pokemon = pokemonItemSourceFromSpecies(sourceSpecies);
  pokemon.flags[MODULE_ID].instance.nature = selection.nature;
  pokemon.flags[MODULE_ID].instance.abilities = [selection.ability];
  pokemon.flags[MODULE_ID].kind = "pokemon";
  pokemon.flags[MODULE_ID].creationManaged = true;
  const gear = startingGearSources(data);
  const originFeat = await originFeatSource(rules, selection);
  const sources = [
    humanSpeciesSource(), originSource(rules), originFeat, specializationSource(rules),
    trainerClassCreationSource(), ...levelOneFeatureSources(), ...gear, pokemon
  ];
  await actor.createEmbeddedDocuments("Item", sources, { poke5eTrainerCreation: true });
}

export function enforceHumanActorSource(actor) {
  if (actor.type !== "character") return;
  const items = (actor._source.items ?? []).filter(item => item.type !== "race" || isHumanSpecies(item));
  actor.updateSource({ items, [`flags.${MODULE_ID}.humanOnly`]: true });
}

export function isHumanSpecies(item) {
  const flag = item.getFlag ? item.getFlag(MODULE_ID, "kind") : item.flags?.[MODULE_ID]?.kind;
  const name = String(item.name ?? "").trim().toLocaleLowerCase();
  return flag === `${CREATION_KIND_PREFIX}human` || name === "human" || name === "humano";
}

function humanSpeciesSource() {
  const source = creationItem("Humano", "race", "human", "<p>En el mundo de Pokémon 5e todos los personajes jugadores son humanos. Los rasgos culturales proceden de su origen regional.</p>", "icons/svg/people.svg");
  source.system.movement = { walk: 30, fly: 0, swim: 0, burrow: 0, climb: 0, units: "ft", hover: false };
  source.system.type = { value: "humanoid", subtype: "human", custom: "" };
  return source;
}

function originSource(rules) {
  return creationItem(`Origen: ${rules.origin.name}`, "background", "origin", `<p>Obtienes +2 a ${ABILITIES[rules.originAbilities[0]]} y +1 a ${ABILITIES[rules.originAbilities[1]]}, competencia en ${SKILLS[rules.origin.skill]} y los idiomas ${rules.languages.join(" y ")}.</p>`);
}

async function originFeatSource(rules, selection) {
  if (rules.origin.id !== "kantoan") return creationItem(rules.origin.featName, "feat", "origin-feat", `<p>${rules.featDetails}</p>`, "icons/svg/book.svg");
  const existing = await findFeatSource(selection.chosenFeat);
  if (!existing) return creationItem(String(selection.chosenFeat).trim(), "feat", "origin-feat", `<p>${rules.featDetails}</p>`, "icons/svg/book.svg");
  existing.flags ??= {};
  existing.flags[MODULE_ID] = { ...(existing.flags[MODULE_ID] ?? {}), kind: `${CREATION_KIND_PREFIX}origin-feat`, sourceId: `${CREATION_KIND_PREFIX}origin-feat`, creationManaged: true };
  return existing;
}

function specializationSource(rules) {
  const effect = rules.specialization.ability
    ? `Aumenta ${ABILITIES[rules.specialization.ability]} en 1, hasta un máximo de 20.`
    : `Obtienes competencia en ${SKILLS[rules.specialization.skill]}; si ya la tenías, obtienes Pericia.`;
  return creationItem(`Especialización: ${rules.specialization.name}`, "feat", "specialization", `<p>${effect}</p><p>Los Pokémon de tipo ${titleCase(rules.specialization.type)} obtienen +1 a todas sus pruebas de habilidad.</p>`, "icons/svg/upgrade.svg");
}

function trainerClassCreationSource() {
  const source = trainerClassSource();
  source.system.advancement = {};
  source.flags[MODULE_ID].kind = `${CREATION_KIND_PREFIX}class`;
  return source;
}

function levelOneFeatureSources() {
  const features = trainerFeatureSources().filter(source => source.flags[MODULE_ID].level === 1);
  for (const source of features) source.flags[MODULE_ID].kind = `${CREATION_KIND_PREFIX}feature`;
  return [
    ...features,
    creationItem("Licencia de Entrenador", "feat", "license", "<p>Autoriza a capturar Pokémon y permite acceder a servicios de Centros Pokémon y Poké Mart.</p>"),
    creationItem("Pokédex", "feat", "pokedex", "<p>Como acción adicional, identifica un Pokémon a 60 pies, registra su especie y revela su SR base y datos breves.</p>"),
    creationItem("Competencia con Poké Balls", "feat", "pokeball-proficiency", "<p>Eres competente con Poké Balls y puedes utilizarlas para realizar intentos de captura.</p>"),
    creationItem("Pokéslots (3)", "feat", "pokeslots", "<p>Puedes llevar a tu Pokémon inicial y otros dos Pokémon en el equipo activo.</p>")
  ];
}

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

function creationItem(name, type, id, description, img = "icons/svg/item-bag.svg") {
  return {
    name, type, img,
    system: { description: { value: description, chat: "" }, identifier: `poke5e-${id}` },
    flags: { [MODULE_ID]: { kind: `${CREATION_KIND_PREFIX}${id}`, sourceId: `${CREATION_KIND_PREFIX}${id}`, creationManaged: true } }
  };
}

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

function cleanEmbeddedSource(source) {
  const clone = foundry.utils.deepClone(source);
  delete clone._id;
  delete clone._stats;
  delete clone.folder;
  delete clone.ownership;
  return clone;
}

function validateStep(step, selection) {
  if (step === 1) {
    if (!String(selection.name).trim()) return "Escribe el nombre del Entrenador.";
    if (!selection.origin) return "Selecciona una región de origen.";
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

function validateStarter(selection) {
  if (!selection.starter) throw new Error("Selecciona un Pokémon inicial.");
  if (!selection.nature) throw new Error("Selecciona la naturaleza del Pokémon inicial.");
  if (!selection.ability) throw new Error("Selecciona una habilidad no oculta para el Pokémon inicial.");
}

function option(value, label, selected) { return { value, label, selected: String(value) === String(selected) }; }
function selectEntries(entries, selected) { return Object.entries(entries).map(([value, label]) => option(value, label, selected)); }
function abilityBonusLabel(values) { return `+2 ${ABILITIES[values[0]]}, +1 ${ABILITIES[values[1]]}`; }
function titleCase(value) { return String(value).split("-").map(part => part.charAt(0).toLocaleUpperCase() + part.slice(1)).join(" "); }
function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
