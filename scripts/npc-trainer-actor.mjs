/**
 * Creación de los documentos de un Entrenador NPC: convierte la configuración
 * del generador en un actor de personaje completo —características, PG,
 * competencias, origen, especialización, camino, inventario, token, biografía y
 * equipo Pokémon— y lo coloca en la escena.
 *
 * Es el puente entre las reglas de npc-trainer-rules.mjs y los documentos de
 * Foundry, con la misma estructura que produce el asistente de creación de
 * jugador (trainer-creator.mjs) para que ambos usen la misma ficha. Solo lo
 * llama npc-trainer-generator.mjs.
 */
import { buildWildInstance } from "./encounter-generator.mjs";
import { deployPokemon } from "./deployment.mjs";
import { MODULE_ID, gearItemSource, pokemonItemSourceFromSpecies, portraitUrl, speciesItemSource, trainerClassSource } from "./model.mjs";
import { NATURES, ORIGINS, SKILLS, SPECIALIZATIONS } from "./trainer-creation-data.mjs";
import { NPC_ARCHETYPES, NPC_TRAINER_PATHS, npcTrainerAbilities, npcTrainerHitPoints, randomNpcTrainerName } from "./npc-trainer-rules.mjs";
import { chooseTokenPosition } from "./wild-deployment.mjs";
import { pokedollarCurrency } from "./economy.mjs";

/**
 * Icono por defecto de cada arquetipo, usado como retrato e imagen de token
 * cuando no se indica uno propio.
 */
const ARCHETYPE_ICONS = {
  balanced: "icons/svg/people.svg", ace: "icons/svg/crown.svg", rival: "icons/svg/fist.svg",
  gymLeader: "icons/svg/crown.svg", tactical: "icons/svg/eye.svg", athletic: "icons/svg/fist.svg",
  agile: "icons/svg/wing.svg", ranger: "icons/svg/eye.svg", mountaineer: "icons/svg/fist.svg",
  sailor: "icons/svg/wing.svg", researcher: "icons/svg/book.svg", engineer: "icons/svg/book.svg",
  detective: "icons/svg/eye.svg", medic: "icons/svg/heal.svg", breeder: "icons/svg/heal.svg",
  collector: "icons/svg/book.svg", mystic: "icons/svg/eye.svg", performer: "icons/svg/sound.svg",
  villain: "icons/svg/hazard.svg", boss: "icons/svg/crown.svg"
};

/**
 * Crea el actor de un Entrenador NPC (solo director). Resuelve origen,
 * especialización y camino —fijos o al azar—, calcula características con
 * npcTrainerAbilities() más los ajustes de applyOriginAndSpecialization(), los PG
 * con npcTrainerHitPoints() y las competencias con npcSkillRanks(); monta los
 * Items (especie humana, origen, especialización, camino, clase de Entrenador al
 * nivel pedido, inventario y equipo Pokémon con npcPokemonSource()) y configura
 * token, permisos y biografía. El parámetro `index` numera las tandas de varios
 * NPC. Su interfaz es npc-trainer-generator.mjs.
 */
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
      currency: pokedollarCurrency(config.money),
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

/**
 * Coloca al NPC en la escena con chooseTokenPosition() (wild-deployment.mjs) y,
 * si se pide, saca al mapa parte de su equipo activo o todo él mediante
 * deployPokemon(). Devuelve null si se cancela la colocación.
 */
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

/**
 * Devuelve la carpeta de actores con ese nombre, creándola si no existe, para
 * agrupar los NPC generados. La usa npc-trainer-generator.mjs antes de crearlos.
 */
export async function ensureNpcTrainerFolder(name) {
  const clean = String(name ?? "").trim();
  if (!clean) return null;
  let folder = game.folders.find(entry => entry.type === "Actor" && entry.name === clean);
  folder ??= await Folder.create({ name: clean, type: "Actor", sorting: "a" });
  return folder;
}

/**
 * Crea el Item de un Pokémon del equipo: parte de speciesItemSource() y
 * pokemonItemSourceFromSpecies() (model.mjs) y sustituye la instancia por una de
 * buildWildInstance() al nivel sorteado, con su naturaleza y su condición de
 * shiny. Los seis primeros van al equipo activo y el resto a la reserva.
 * Auxiliar de createNpcTrainerActor().
 */
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

/**
 * Genera el inventario del NPC (Poké Balls y pociones en las cantidades
 * configuradas) con gearItemSource(). Esas Poké Balls son las que capture.mjs
 * encontraría si el NPC intentara capturar. Auxiliar de createNpcTrainerActor().
 */
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

/**
 * Item de especie Humano, obligatorio en esta ambientación. Coincide con el que
 * exige enforceHumanActorSource() (trainer-creator.mjs) para los jugadores.
 */
function humanSource() {
  return simpleItem("Humano", "race", "npc-human", "Todos los personajes de esta ambientación son humanos.", "icons/svg/people.svg", {
    movement: { walk: 30, fly: 0, swim: 0, burrow: 0, climb: 0, units: "ft", hover: false },
    type: { value: "humanoid", subtype: "human", custom: "" }
  });
}

/** Item de trasfondo con la región de origen, su competencia y su idioma. */
function originSource(origin) {
  return simpleItem(`Origen: ${origin.name}`, "background", `npc-origin-${origin.id}`, `Procede de ${origin.name}. Obtiene competencia en ${SKILLS[origin.skill]} y habla ${origin.language}.`);
}

/**
 * Item de la especialización de tipo, con su beneficio propio y el +1 a las
 * pruebas de los Pokémon de ese tipo que aplica deployment.mjs al desplegarlos.
 */
function specializationSource(specialization) {
  const effect = specialization.skill ? `Competencia o Pericia en ${SKILLS[specialization.skill]}.` : `+1 a ${specialization.ability.toUpperCase()}.`;
  return simpleItem(`Especialización: ${specialization.name}`, "feat", `npc-specialization-${specialization.type}`, `${effect} Sus Pokémon de tipo ${specialization.type} obtienen +1 a sus pruebas de habilidad.`, "icons/svg/upgrade.svg");
}

/** Item descriptivo del Camino de Entrenador, tomado de NPC_TRAINER_PATHS. */
function pathSource(path) {
  return simpleItem(`Camino: ${path.name}`, "feat", `npc-path-${path.id}`, path.description, "icons/svg/book.svg");
}

/**
 * Constructor común de los Items descriptivos del NPC (humano, origen,
 * especialización y camino), con su descripción escapada y sus flags.
 */
function simpleItem(name, type, sourceId, description, img = "icons/svg/book.svg", extraSystem = {}) {
  return {
    name, type, img,
    system: { description: { value: `<p>${escapeHtml(description)}</p>`, chat: "" }, identifier: sourceId, ...extraSystem },
    flags: { [MODULE_ID]: { kind: sourceId, sourceId } }
  };
}

/**
 * Resuelve el origen regional: el indicado o uno al azar de ORIGINS
 * (trainer-creation-data.mjs). Gemela de selectSpecialization() y selectPath().
 */
function selectOrigin(id, index) {
  if (id && id !== "random") return ORIGINS.find(entry => entry.id === id) ?? ORIGINS[0];
  return ORIGINS[Math.floor(Math.random() * ORIGINS.length)] ?? ORIGINS[index % ORIGINS.length] ?? ORIGINS[0];
}

/** Resuelve la especialización de tipo: la indicada o una al azar de SPECIALIZATIONS. */
function selectSpecialization(type, index) {
  if (type && type !== "random") return SPECIALIZATIONS.find(entry => entry.type === type) ?? SPECIALIZATIONS[0];
  return SPECIALIZATIONS[Math.floor(Math.random() * SPECIALIZATIONS.length)] ?? SPECIALIZATIONS[index % SPECIALIZATIONS.length];
}

/**
 * Resuelve el Camino de Entrenador: ninguno por debajo del nivel 2, y a partir
 * de ahí el indicado o uno al azar de NPC_TRAINER_PATHS.
 */
function selectPath(id, level) {
  if (level < 2 || id === "none") return null;
  const available = Object.entries(NPC_TRAINER_PATHS).filter(([key]) => key !== "none");
  const [pathId, path] = id && id !== "random"
    ? available.find(([key]) => key === id) ?? available[0]
    : available[Math.floor(Math.random() * available.length)];
  return { id: pathId, ...path };
}

/**
 * Suma a las características de npcTrainerAbilities() el +2/+1 del origen —si
 * este deja elegir, sobre las dos prioritarias del arquetipo— y el +1 de la
 * especialización, sin pasar de 20. Auxiliar de createNpcTrainerActor().
 */
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

/**
 * Reparte las competencias: Trato con Animales y la del origen siempre, más las
 * del arquetipo, y Pericia (rango 2) si la especialización repite una de ellas.
 * Auxiliar de createNpcTrainerActor().
 */
function npcSkillRanks(archetypeId, origin, specialization) {
  const result = { ani: 1, [origin.skill]: 1 };
  for (const skill of NPC_ARCHETYPES[archetypeId]?.skills ?? []) result[skill] = Math.max(1, result[skill] ?? 0);
  if (specialization.skill) result[specialization.skill] = Math.min(2, (result[specialization.skill] ?? 0) + 1);
  return result;
}

/**
 * Compone la biografía del NPC con su arquetipo, origen, especialización,
 * camino, la lista de su equipo y las notas del director.
 */
function biographyHtml(config, origin, specialization, path, team, data) {
  const roster = team.map(entry => `${data.pokemonById.get(entry.speciesId)?.name ?? entry.speciesId} (nivel ${entry.level})`).join(", ");
  return `<h2>Entrenador NPC</h2><p><strong>Arquetipo:</strong> ${escapeHtml(NPC_ARCHETYPES[config.archetype]?.name ?? config.archetype)} · <strong>Origen:</strong> ${escapeHtml(origin.name)} · <strong>Especialización:</strong> ${escapeHtml(specialization.name)} · <strong>Camino:</strong> ${escapeHtml(path?.name ?? "Ninguno")}</p><p><strong>Equipo:</strong> ${escapeHtml(roster)}</p><p>${escapeHtml(config.notes ?? "")}</p>`;
}

/** Género al azar del NPC cuando se configura como aleatorio. */
function randomGender() { return ["Masculino", "Femenino", "No binario"][Math.floor(Math.random() * 3)]; }
/** Acota un valor numérico a un rango. Lo usa el nivel de Entrenador. */
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, Math.trunc(Number(value) || minimum))); }
/** Devuelve el número si es válido y, si no, la reserva. Auxiliar de los ajustes de token. */
function finiteNumber(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
/** Escapa el texto de descripciones y biografía. */
function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
