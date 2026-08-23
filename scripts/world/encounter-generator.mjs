/**
 * Reglas del generador de encuentros salvajes: filtrado del catálogo, sorteo de
 * la composición del encuentro y creación de la instancia de cada Pokémon
 * salvaje (nivel, PG, habilidad y movimientos).
 *
 * Módulo casi puro —recibe el generador aleatorio por parámetro para que
 * validate-encounters.mjs pueda fijarlo— sin más dependencia que progression.mjs.
 * La interfaz está en encounter-builder.mjs y el despliegue en
 * wild-deployment.mjs, que también usa buildWildInstance().
 */
import { experienceAtLevel, experienceAward } from "../pokemon/progression.mjs";
import { randomNature } from "../pokemon/natures.mjs";

/**
 * Nivel mínimo y clave del JSON de especie de cada tramo de movimientos. Solo la
 * recorre naturalMovesAtLevel(); move-learning.mjs mantiene su propia copia para
 * los Pokémon de los entrenadores.
 */
const LEVEL_MOVE_GROUPS = [
  [1, "start"], [2, "level2"], [6, "level6"], [10, "level10"], [14, "level14"], [18, "level18"]
];

/** Tope de Pokémon por encuentro; lo respetan generateEncounter() y la interfaz. */
export const MAX_ENCOUNTER_POKEMON = 20;

/**
 * Filtra el catálogo por texto, tipo, bioma, región, rango de SR y nivel máximo,
 * descartando las especies que aún no podrían aparecer a ese nivel. Da tanto la
 * lista de candidatas que muestra encounter-builder.mjs como el conjunto del que
 * sortea generateEncounter().
 */
export function filterEncounterSpecies(species, filters = {}) {
  const query = String(filters.query ?? "").trim().toLocaleLowerCase();
  const excludedLegendaryNumbers = new Set(filters.excludedLegendaryNumbers ?? []);
  return species.filter(entry => {
    if (Number(entry.number) <= 0) return false;
    if (excludedLegendaryNumbers.has(Number(entry.number))) return false;
    const types = entry.type ?? [];
    const biomes = entry.habitat?.biomes ?? [];
    const regions = [...(entry.habitat?.regions ?? []), entry.habitat?.nativeRegion].filter(Boolean);
    if (query && !entry.name.toLocaleLowerCase().includes(query) && !entry.id.toLocaleLowerCase().includes(query) && !String(entry.number).includes(query)) return false;
    if (filters.type && !types.includes(filters.type)) return false;
    if (filters.biome && !biomes.includes(filters.biome)) return false;
    if (filters.region && !regions.includes(filters.region)) return false;
    if (filters.srMin !== "" && filters.srMin != null && Number(entry.sr) < Number(filters.srMin)) return false;
    if (filters.srMax !== "" && filters.srMax != null && Number(entry.sr) > Number(filters.srMax)) return false;
    if (Number(entry.minLevel) > normalizedLevel(filters.levelMax, 20)) return false;
    return true;
  });
}

/**
 * Sortea la composición del encuentro. Sin objetivo de PX elige al azar; con él
 * reparte la experiencia restante entre los Pokémon que faltan y escoge entre
 * las cinco especies que más se acerquen, de modo que el total se aproxime sin
 * volverse predecible. Cada nivel lo decide randomLevel().
 */
export function generateEncounter(pool, options = {}, random = Math.random) {
  const count = Math.max(1, Math.min(MAX_ENCOUNTER_POKEMON, Math.trunc(Number(options.count) || 1)));
  const minimum = normalizedLevel(options.levelMin, 1);
  const maximum = Math.max(minimum, normalizedLevel(options.levelMax, 20));
  const targetExperience = Math.max(0, Math.trunc(Number(options.targetExperience) || 0));
  const usable = pool.filter(species => Number(species.minLevel) <= maximum);
  const encounter = [];
  for (let index = 0; index < count && usable.length; index++) {
    const choices = usable.map(species => {
      const level = randomLevel(species, minimum, maximum, random);
      return { species, level, experience: experienceAward(level, species.sr) };
    });
    let chosen;
    if (targetExperience) {
      const spent = encounter.reduce((total, entry) => total + entry.experience, 0);
      const desired = Math.max(0, targetExperience - spent) / Math.max(1, count - index);
      choices.sort((a, b) => Math.abs(a.experience - desired) - Math.abs(b.experience - desired));
      chosen = choices[Math.floor(random() * Math.min(5, choices.length))];
    } else {
      chosen = choices[Math.floor(random() * choices.length)];
    }
    encounter.push({ speciesId: chosen.species.id, level: chosen.level, experience: chosen.experience });
  }
  return encounter;
}

/**
 * Crea la instancia de un Pokémon salvaje: nivel y experiencia, PG ajustados con
 * adjustedHitPoints(), sexo, una habilidad no oculta al azar y hasta cuatro
 * movimientos de los que conoce a su nivel (naturalMovesAtLevel()), con una
 * probabilidad EGG_MOVE_CHANCE de incluir además un movimiento huevo
 * (movePoolWithEggChance()) —su única vía de aparición, ya que no se pueden
 * elegir al subir de nivel—, todos con sus PP. La usan wild-deployment.mjs y
 * npc-trainer-actor.mjs para los equipos de los NPC.
 */
export function buildWildInstance(species, movesById, options = {}) {
  const random = options.random ?? Math.random;
  const idFactory = options.idFactory ?? (() => Math.random().toString(36).slice(2, 18));
  const level = Math.max(Number(species.minLevel) || 1, normalizedLevel(options.level, species.minLevel));
  const hp = adjustedHitPoints(species, level);
  const availableAbilities = (species.abilities ?? []).filter(entry => !entry.hidden).map(entry => entry.id);
  const ability = availableAbilities.length ? availableAbilities[Math.floor(random() * availableAbilities.length)] : null;
  const selectedMoves = shuffled(movePoolWithEggChance(species, level, random), random).slice(0, 4);
  return {
    nickname: "",
    level,
    experience: experienceAtLevel(level),
    advancement: { appliedLevel: level, history: [] },
    hp: { value: hp, max: hp },
    ac: Number(species.ac) || 10,
    attributes: structuredCloneSafe(species.attributes ?? {}),
    nature: randomNature(random),
    gender: randomGender(species.gender, random),
    shiny: false,
    inTeam: false,
    status: "",
    notes: "Pokémon salvaje",
    abilities: ability ? [ability] : [],
    moves: selectedMoves.map(moveId => {
      const pp = Math.max(Number(movesById.get(moveId)?.pp) || 0, 0);
      return { id: idFactory(), moveId, pp: { value: pp, max: pp } };
    })
  };
}

/**
 * PG de una especie a un nivel dado: parte de sus PG base y suma por cada nivel
 * de más la media de su dado de golpe más el modificador de Constitución.
 * La usa buildWildInstance(); validate-encounters.mjs la comprueba.
 */
export function adjustedHitPoints(species, level) {
  const baseLevel = Math.max(1, Number(species.minLevel) || 1);
  const delta = normalizedLevel(level, baseLevel) - baseLevel;
  const sides = Math.max(4, Number(String(species.hitDice ?? "d8").replace(/^d/, "")) || 8);
  const average = Math.ceil(0.5 + (sides / 2));
  const constitution = Number(species.attributes?.con) || 10;
  const modifier = Math.floor((constitution - 10) / 2);
  return Math.max(8, (Number(species.hp) || 1) + (delta * (average + modifier)));
}

/**
 * Movimientos que una especie conoce por nivel, sin MT ni huevo, reuniendo todos
 * los tramos ya alcanzados de LEVEL_MOVE_GROUPS. De ellos escoge cuatro
 * buildWildInstance().
 */
export function naturalMovesAtLevel(species, level) {
  return [...new Set(LEVEL_MOVE_GROUPS
    .filter(([required]) => required <= Number(level))
    .flatMap(([, key]) => species.moves?.[key] ?? []))];
}

/**
 * Probabilidad de que un Pokémon generado al azar salga con un movimiento
 * huevo entre los suyos. Los movimientos huevo no se pueden elegir al subir de
 * nivel (moveEligibility() en move-learning.mjs los deja fuera de
 * `availableNow`); esta es la única vía por la que aparecen, imitando lo
 * poco frecuentes que son en los Pokémon salvajes o de entrenadores NPC.
 */
const EGG_MOVE_CHANCE = 0.2;

/**
 * Añade como mucho un movimiento huevo al azar al conjunto de movimientos por
 * nivel, con una probabilidad de EGG_MOVE_CHANCE y solo si la especie tiene
 * alguno que no conozca ya de forma natural a ese nivel. Auxiliar de
 * buildWildInstance().
 */
function movePoolWithEggChance(species, level, random) {
  const pool = naturalMovesAtLevel(species, level);
  const eggMoves = (species.moves?.egg ?? []).filter(id => !pool.includes(id));
  if (eggMoves.length && random() < EGG_MOVE_CHANCE) pool.push(eggMoves[Math.floor(random() * eggMoves.length)]);
  return pool;
}

/**
 * Misma probabilidad EGG_MOVE_CHANCE, pero para una lista ya cerrada de
 * entradas de movimiento (con PP) en vez de una bolsa de la que elegir cuatro:
 * la usa trainer-creator.mjs para el Pokémon inicial del asistente, cuyos
 * movimientos de partida no salen de naturalMovesAtLevel() sino directamente
 * de `species.moves.start`. Añade el movimiento huevo si queda hueco (menos de
 * cuatro conocidos) o sustituye uno al azar si ya está completo.
 */
export function withEggMoveChance(moveEntries, species, movesById, { random = Math.random, idFactory = () => Math.random().toString(36).slice(2, 18) } = {}) {
  const known = new Set(moveEntries.map(entry => entry.moveId));
  const eggMoves = (species.moves?.egg ?? []).filter(id => !known.has(id));
  if (!eggMoves.length || random() >= EGG_MOVE_CHANCE) return moveEntries;
  const moveId = eggMoves[Math.floor(random() * eggMoves.length)];
  const pp = Math.max(Number(movesById.get(moveId)?.pp) || 0, 0);
  const eggEntry = { id: idFactory(), moveId, pp: { value: pp, max: pp } };
  const entries = [...moveEntries];
  if (entries.length < 4) entries.push(eggEntry);
  else entries[Math.floor(random() * entries.length)] = eggEntry;
  return entries;
}

/**
 * Nivel al azar dentro del rango pedido, sin bajar del mínimo de la especie.
 * Auxiliar de generateEncounter().
 */
function randomLevel(species, minimum, maximum, random) {
  const floor = Math.max(minimum, Number(species.minLevel) || 1);
  return floor + Math.floor(random() * (maximum - floor + 1));
}

/**
 * Sortea el sexo según la proporción "F:M". Copia local de randomGenderForRatio()
 * (model.mjs) para que este archivo no dependa de los globales de Foundry.
 */
function randomGender(ratio, random) {
  const [female, male] = String(ratio ?? "0:0").split(":").map(value => Math.max(0, Number(value) || 0));
  const total = female + male;
  if (!total) return "none";
  return random() < female / total ? "female" : "male";
}

/**
 * Baraja una copia de la lista (Fisher-Yates). Auxiliar de buildWildInstance()
 * para elegir movimientos sin repetir.
 */
function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/** Acota un nivel al rango 1-20 con valor de reserva. Auxiliar de todo el archivo. */
function normalizedLevel(value, fallback) {
  return Math.max(1, Math.min(20, Math.trunc(Number(value) || fallback || 1)));
}

/**
 * Copia profunda vía JSON, sin recurrir a las utilidades de Foundry, para que
 * buildWildInstance() siga funcionando en las pruebas de Node.
 */
function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
