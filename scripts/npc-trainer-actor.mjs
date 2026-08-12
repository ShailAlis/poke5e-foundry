import { buildWildInstance } from "./encounter-generator.mjs";
import { deployPokemon } from "./deployment.mjs";
import { MODULE_ID, gearItemSource, pokemonItemSourceFromSpecies, portraitUrl, speciesItemSource, trainerClassSource } from "./model.mjs";
import { NATURES, ORIGINS, SKILLS, SPECIALIZATIONS } from "./trainer-creation-data.mjs";
import { NPC_ARCHETYPES, NPC_TRAINER_PATHS, npcTrainerAbilities, npcTrainerHitPoints, randomNpcTrainerName } from "./npc-trainer-rules.mjs";
import { chooseTokenPosition } from "./wild-deployment.mjs";

const ARCHETYPE_ICONS = {
  balanced: "icons/svg/people.svg", ace: "icons/svg/crown.svg", tactical: "icons/svg/eye.svg",
  athletic: "icons/svg/fist.svg", agile: "icons/svg/wing.svg", researcher: "icons/svg/book.svg",
  medic: "icons/svg/heal.svg", performer: "icons/svg/sound.svg", villain: "icons/svg/hazard.svg", boss: "icons/svg/crown.svg"
};

export async function createNpcTrainerActor(config, team, data, index = 0) {
  if (!game.user.isGM) throw new Error("Solo el director de juego puede crear Entrenadores NPC.");
  const level = clamp(config.trainerLevel, 1, 20);
  const origin = selectOrigin(config.origin, index);
  const specialization = selectSpecialization(config.specialization, index);
  const path = selectPath(config.path, level);
  const abilities = applyOriginAndSpecialization(npcTrainerAbilities(config.archetype, config.difficulty), origin, specialization, config.archetype);
  const skillRanks = npcSkillRanks(config.archetype, origin, specialization);
  const hp = npcTrainerHitPoints(level, abilities.con, config.difficulty);
  const name = randomNpcTrainerName(config, Math.random, index);
  const icon = String(config.image ?? "").trim() || ARCHETYPE_ICONS[config.archetype] || "icons/svg/mystery-man.svg";
  const classItem = trainerClassSource();
  classItem.system.levels = level;
  classItem.system.advancement = {};
  classItem.flags[MODULE_ID].kind = "npc-trainer-class";
  const pokemonItems = team.map((entry, teamIndex) => npcPokemonSource(entry, teamIndex, data, config));
  const items = [
    humanSource(), originSource(origin), specializationSource(specialization), ...(path ? [pathSource(path)] : []), classItem,
    ...inventorySources(config, data), ...pokemonItems
  ];
  const systemAbilities = Object.fromEntries(Object.entries(abilities).map(([key, value]) => [key, { value, proficient: key === "cha" || (origin.id === "sinnoan" && key === "con") ? 1 : 0 }]));
  const systemSkills = Object.fromEntries(Object.entries(skillRanks).map(([key, value]) => [key, { value }]));
  const source = {
    name,
    type: "character",
    img: icon,
    folder: config.folderId || null,
    ownership: { default: Number(config.ownership) || 0 },
    prototypeToken: {
      name, actorLink: true, disposition: Number(config.disposition) || 0,
      displayName: finiteNumber(config.displayName, 20), displayBars: finiteNumber(config.displayBars, 20),
      bar1: { attribute: "attributes.hp" }, texture: { src: icon }, width: 1, height: 1,
      sight: { enabled: Boolean(config.tokenVision), range: Number(config.visionRange) || 0 }
    },
    system: {
      abilities: systemAbilities,
      skills: systemSkills,
      attributes: {
        hp: { value: hp, max: hp },
        movement: { walk: 30, fly: 0, swim: origin.id === "hoennian" && config.hoennEnvironment === "coast" ? 30 : 0, burrow: 0, climb: origin.id === "hoennian" && config.hoennEnvironment === "mountain" ? 10 : 0, units: "ft", hover: false }
      },
      details: {
        gender: config.gender === "random" ? randomGender() : config.gender,
        age: String(config.age || ""),
        biography: { value: biographyHtml(config, origin, specialization, path, team, data) }
      },
      currency: { gp: Math.max(0, Number(config.money) || 0) },
      traits: { languages: { value: [], custom: `Común; ${origin.language}` } }
    },
    items,
    flags: {
      [MODULE_ID]: {
        kind: "npc-trainer",
        humanOnly: true,
        trainerCreation: {
          completed: true, human: true, npc: true, version: 1,
          origin: origin.id, specialization: specialization.type, path: path?.id ?? "none", archetype: config.archetype
        },
        npcTrainer: {
          difficulty: config.difficulty, archetype: config.archetype, path: path?.id ?? "none", teamSize: team.length,
          generatedAt: new Date().toISOString()
        }
      }
    }
  };
  return Actor.create(source, { renderSheet: false, poke5eNpcTrainer: true });
}

export async function placeNpcTrainer(actor, { deployCount = 0 } = {}) {
  if (!canvas?.ready || !canvas.scene) throw new Error("Abre una escena para colocar al Entrenador NPC.");
  const position = await chooseTokenPosition(actor.prototypeToken, actor.name);
  if (!position) return null;
  const token = await actor.getTokenDocument(position);
  const [created] = await canvas.scene.createEmbeddedDocuments("Token", [token.toObject()]);
  created?.object?.control({ releaseOthers: true });
  const team = actor.items.filter(item => item.getFlag(MODULE_ID, "kind") === "pokemon" && item.getFlag(MODULE_ID, "instance")?.inTeam);
  const amount = deployCount === "all" ? team.length : Math.max(0, Math.min(team.length, Number(deployCount) || 0));
  for (const pokemon of team.slice(0, amount)) await deployPokemon(pokemon);
  return created;
}

export async function ensureNpcTrainerFolder(name) {
  const clean = String(name ?? "").trim();
  if (!clean) return null;
  let folder = game.folders.find(entry => entry.type === "Actor" && entry.name === clean);
  folder ??= await Folder.create({ name: clean, type: "Actor", sorting: "a" });
  return folder;
}

function npcPokemonSource(entry, teamIndex, data, config) {
  const species = data.pokemonById.get(entry.speciesId);
  if (!species) throw new Error(`No se encontró la especie ${entry.speciesId}.`);
  const base = speciesItemSource(species, data.movesById, data.evolutionsByFrom.get(species.id) ?? []);
  const source = pokemonItemSourceFromSpecies(base);
  const instance = buildWildInstance(species, data.movesById, { level: entry.level, idFactory: () => foundry.utils.randomID() });
  instance.inTeam = teamIndex < 6;
  instance.shiny = Boolean(entry.shiny);
  instance.nature = config.randomNature === false ? String(config.nature ?? "Hardy") : NATURES[Math.floor(Math.random() * NATURES.length)];
  instance.notes = `Pokémon del Entrenador NPC · puesto ${teamIndex + 1}`;
  source.flags[MODULE_ID].kind = "pokemon";
  source.flags[MODULE_ID].instance = instance;
  source.flags[MODULE_ID].npcGenerated = true;
  source.img = portraitUrl(species, instance.shiny);
  return source;
}

function inventorySources(config, data) {
  const result = [];
  for (const [id, quantity] of [[config.ballType || "poke-ball", config.ballCount], ["potion", config.potionCount]]) {
    if (Number(quantity) <= 0) continue;
    const entry = data.itemsById.get(id);
    if (!entry) continue;
    const source = gearItemSource(entry);
    source.system.quantity = Number(quantity);
    result.push(source);
  }
  return result;
}

function humanSource() {
  return simpleItem("Humano", "race", "npc-human", "Todos los personajes de esta ambientación son humanos.", "icons/svg/people.svg", {
    movement: { walk: 30, fly: 0, swim: 0, burrow: 0, climb: 0, units: "ft", hover: false },
    type: { value: "humanoid", subtype: "human", custom: "" }
  });
}

function originSource(origin) {
  return simpleItem(`Origen: ${origin.name}`, "background", `npc-origin-${origin.id}`, `Procede de ${origin.name}. Obtiene competencia en ${SKILLS[origin.skill]} y habla ${origin.language}.`);
}

function specializationSource(specialization) {
  const effect = specialization.skill ? `Competencia o Pericia en ${SKILLS[specialization.skill]}.` : `+1 a ${specialization.ability.toUpperCase()}.`;
  return simpleItem(`Especialización: ${specialization.name}`, "feat", `npc-specialization-${specialization.type}`, `${effect} Sus Pokémon de tipo ${specialization.type} obtienen +1 a sus pruebas de habilidad.`, "icons/svg/upgrade.svg");
}

function pathSource(path) {
  return simpleItem(`Camino: ${path.name}`, "feat", `npc-path-${path.id}`, path.description, "icons/svg/book.svg");
}

function simpleItem(name, type, sourceId, description, img = "icons/svg/book.svg", extraSystem = {}) {
  return {
    name, type, img,
    system: { description: { value: `<p>${escapeHtml(description)}</p>`, chat: "" }, identifier: sourceId, ...extraSystem },
    flags: { [MODULE_ID]: { kind: sourceId, sourceId } }
  };
}

function selectOrigin(id, index) {
  if (id && id !== "random") return ORIGINS.find(entry => entry.id === id) ?? ORIGINS[0];
  return ORIGINS[Math.floor(Math.random() * ORIGINS.length)] ?? ORIGINS[index % ORIGINS.length] ?? ORIGINS[0];
}

function selectSpecialization(type, index) {
  if (type && type !== "random") return SPECIALIZATIONS.find(entry => entry.type === type) ?? SPECIALIZATIONS[0];
  return SPECIALIZATIONS[Math.floor(Math.random() * SPECIALIZATIONS.length)] ?? SPECIALIZATIONS[index % SPECIALIZATIONS.length];
}

function selectPath(id, level) {
  if (level < 2 || id === "none") return null;
  const available = Object.entries(NPC_TRAINER_PATHS).filter(([key]) => key !== "none");
  const [pathId, path] = id && id !== "random"
    ? available.find(([key]) => key === id) ?? available[0]
    : available[Math.floor(Math.random() * available.length)];
  return { id: pathId, ...path };
}

function applyOriginAndSpecialization(base, origin, specialization, archetypeId) {
  const result = { ...base };
  let pair = origin.abilities;
  if (pair === "any-two") pair = (NPC_ARCHETYPES[archetypeId] ?? NPC_ARCHETYPES.balanced).abilities.slice(0, 2);
  if (Array.isArray(pair[0])) pair = pair[0];
  result[pair[0]] = Math.min(20, result[pair[0]] + 2);
  result[pair[1]] = Math.min(20, result[pair[1]] + 1);
  if (specialization.ability) result[specialization.ability] = Math.min(20, result[specialization.ability] + 1);
  return result;
}

function npcSkillRanks(archetypeId, origin, specialization) {
  const result = { ani: 1, [origin.skill]: 1 };
  for (const skill of NPC_ARCHETYPES[archetypeId]?.skills ?? []) result[skill] = Math.max(1, result[skill] ?? 0);
  if (specialization.skill) result[specialization.skill] = Math.min(2, (result[specialization.skill] ?? 0) + 1);
  return result;
}

function biographyHtml(config, origin, specialization, path, team, data) {
  const roster = team.map(entry => `${data.pokemonById.get(entry.speciesId)?.name ?? entry.speciesId} (nivel ${entry.level})`).join(", ");
  return `<h2>Entrenador NPC</h2><p><strong>Arquetipo:</strong> ${escapeHtml(NPC_ARCHETYPES[config.archetype]?.name ?? config.archetype)} · <strong>Origen:</strong> ${escapeHtml(origin.name)} · <strong>Especialización:</strong> ${escapeHtml(specialization.name)} · <strong>Camino:</strong> ${escapeHtml(path?.name ?? "Ninguno")}</p><p><strong>Equipo:</strong> ${escapeHtml(roster)}</p><p>${escapeHtml(config.notes ?? "")}</p>`;
}

function randomGender() { return ["Masculino", "Femenino", "No binario"][Math.floor(Math.random() * 3)]; }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, Math.trunc(Number(value) || minimum))); }
function finiteNumber(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
