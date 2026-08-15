/**
 * Reglas del generador de Entrenadores NPC: arquetipos, dificultades, caminos,
 * filtrado de especies y sorteo del equipo Pokémon.
 *
 * Módulo casi puro —recibe el generador aleatorio por parámetro para que
 * validate-npc-trainers.mjs pueda fijarlo— cuya única dependencia es
 * trainerPokeslotsForLevel() de model.mjs. La interfaz está en
 * npc-trainer-generator.mjs y la creación de documentos en npc-trainer-actor.mjs.
 */

/**
 * Arquetipos de NPC. Cada uno ordena las características de mayor a menor —ese
 * orden lo aplica npcTrainerAbilities()— y fija sus competencias.
 */
export const NPC_ARCHETYPES = {
  balanced: { name: "Equilibrado", abilities: ["cha", "dex", "wis", "con", "int", "str"], skills: ["ani", "prc", "ins"] },
  ace: { name: "Entrenador experto", abilities: ["cha", "wis", "dex", "con", "int", "str"], skills: ["ani", "ins", "per"] },
  rival: { name: "Rival", abilities: ["dex", "cha", "con", "wis", "str", "int"], skills: ["acr", "itm", "ins"] },
  gymLeader: { name: "Líder de Gimnasio", abilities: ["cha", "wis", "con", "int", "dex", "str"], skills: ["ani", "itm", "per", "prc"] },
  tactical: { name: "Estratega", abilities: ["int", "wis", "cha", "dex", "con", "str"], skills: ["inv", "ins", "nat"] },
  athletic: { name: "Atleta", abilities: ["str", "con", "dex", "cha", "wis", "int"], skills: ["ath", "acr", "sur"] },
  agile: { name: "Especialista ágil", abilities: ["dex", "cha", "wis", "con", "int", "str"], skills: ["acr", "slt", "ste"] },
  ranger: { name: "Explorador", abilities: ["wis", "dex", "con", "int", "cha", "str"], skills: ["sur", "prc", "nat"] },
  mountaineer: { name: "Montañero", abilities: ["con", "str", "wis", "dex", "cha", "int"], skills: ["ath", "sur", "prc"] },
  sailor: { name: "Marinero", abilities: ["dex", "con", "str", "wis", "cha", "int"], skills: ["ath", "acr", "sur"] },
  researcher: { name: "Investigador", abilities: ["int", "wis", "cha", "con", "dex", "str"], skills: ["inv", "nat", "med"] },
  engineer: { name: "Ingeniero", abilities: ["int", "dex", "con", "wis", "cha", "str"], skills: ["inv", "arc", "slt"] },
  detective: { name: "Detective", abilities: ["int", "wis", "cha", "dex", "con", "str"], skills: ["inv", "ins", "prc"] },
  medic: { name: "Sanador", abilities: ["wis", "cha", "con", "int", "dex", "str"], skills: ["med", "ins", "ani"] },
  breeder: { name: "Criador Pokémon", abilities: ["wis", "con", "cha", "int", "dex", "str"], skills: ["ani", "med", "nat"] },
  collector: { name: "Coleccionista", abilities: ["int", "cha", "wis", "dex", "con", "str"], skills: ["inv", "nat", "per"] },
  mystic: { name: "Místico", abilities: ["wis", "cha", "int", "con", "dex", "str"], skills: ["rel", "arc", "ins"] },
  performer: { name: "Artista", abilities: ["cha", "dex", "wis", "int", "con", "str"], skills: ["prf", "per", "slt"] },
  villain: { name: "Agente criminal", abilities: ["cha", "dex", "int", "con", "wis", "str"], skills: ["itm", "dec", "ste"] },
  boss: { name: "Jefe / Campeón", abilities: ["cha", "con", "wis", "dex", "int", "str"], skills: ["ani", "itm", "ins", "prc"] }
};

/**
 * Grados de dificultad, que ajustan características, PG y el nivel de los
 * Pokémon del equipo. Los aplican npcTrainerAbilities(), npcTrainerHitPoints() y
 * generateNpcTrainerTeam().
 */
export const NPC_DIFFICULTIES = {
  easy: { name: "Fácil", abilityBonus: -1, hpMultiplier: 0.8, pokemonLevel: -2 },
  standard: { name: "Estándar", abilityBonus: 0, hpMultiplier: 1, pokemonLevel: 0 },
  hard: { name: "Difícil", abilityBonus: 1, hpMultiplier: 1.2, pokemonLevel: 1 },
  elite: { name: "Élite", abilityBonus: 2, hpMultiplier: 1.5, pokemonLevel: 2 },
  boss: { name: "Jefe", abilityBonus: 3, hpMultiplier: 2, pokemonLevel: 3 }
};

/**
 * Caminos de Entrenador disponibles para los NPC, con su descripción. Solo el
 * Guru altera el cálculo (en trainerControlSr()); el resto es descriptivo y lo
 * muestran npc-trainer-generator.mjs y la biografía del actor.
 */
export const NPC_TRAINER_PATHS = {
  none: { name: "Sin camino", description: "No aplica rasgos de camino." },
  ace: { name: "Ace Trainer", description: "Especialista en potenciar ataques, daño y decisiones tácticas en combate." },
  hobbyist: { name: "Hobbyist", description: "Entrenador versátil con más especializaciones y competencias." },
  mentor: { name: "Poké Mentor", description: "Maestro de movimientos, MT y desarrollo de sus Pokémon." },
  researcher: { name: "Researcher", description: "Analiza capacidades, movimientos y evoluciones Pokémon." },
  collector: { name: "Pokémon Collector", description: "Experto en rastreo, control del daño y capturas." },
  nurse: { name: "Nurse", description: "Especialista en curación, cocina y tratamiento de estados." },
  typeMaster: { name: "Type Master", description: "Potencia a los Pokémon que coinciden con sus especializaciones de tipo." },
  commander: { name: "Commander", description: "Obtiene ventajas mediante el vínculo y las órdenes de equipo." },
  grunt: { name: "Grunt", description: "Usa tácticas criminales y Puntos de Sombra para sabotear al rival." },
  tactician: { name: "Tactician", description: "Gasta Puntos Tácticos para curar, defender y dirigir ataques." },
  ranger: { name: "Ranger", description: "Explorador, rastreador y especialista en capturas en campo abierto." },
  guru: { name: "Guru", description: "Aumenta su límite de control y fortalece mente, cuerpo y espíritu." },
  breeder: { name: "Pokémon Breeder", description: "Especialista en crianza, herencia y diversidad Pokémon." }
};

/**
 * SR máximo que un Entrenador puede controlar según su nivel, con +1 para el
 * camino Guru a partir del nivel 2 y un tope de 15. La usan
 * filterNpcTrainerSpecies() como límite automático y npc-trainer-generator.mjs
 * para mostrarlo.
 */
export function trainerControlSr(trainerLevel, path = "none") {
  const lvl = level(trainerLevel, 1);
  const base = lvl >= 17 ? 15 : lvl >= 14 ? 14 : lvl >= 11 ? 12 : lvl >= 8 ? 10 : lvl >= 6 ? 8 : lvl >= 3 ? 5 : 2;
  return Math.min(15, base + (path === "guru" && lvl >= 2 ? 1 : 0));
}

/** Nombres de pila para los NPC sin nombre propio. Los usa randomNpcTrainerName(). */
const FIRST_NAMES = ["Aina", "Alex", "Bruno", "Celia", "Dani", "Elena", "Gael", "Hana", "Iris", "Joel", "Kai", "Lara", "Leo", "Mara", "Nico", "Noa", "Omar", "Rina", "Saúl", "Vera", "Yuri", "Zoe"];

/**
 * Filtra el catálogo para el generador de NPC: listas de inclusión y exclusión,
 * texto, uno o dos tipos (exigiendo ambos o cualquiera), región, bioma, rango de
 * SR, nivel máximo y etapa evolutiva. Si se pide respetar el límite de control,
 * acota el SR con trainerControlSr(). Da el conjunto del que sortea
 * generateNpcTrainerTeam().
 */
export function filterNpcTrainerSpecies(species, filters = {}, evolutions = []) {
  const query = normalized(filters.query);
  const includes = idSet(filters.includeIds);
  const excludes = idSet(filters.excludeIds);
  const evolved = new Set(evolutions.map(entry => entry.to));
  const evolves = new Set(evolutions.map(entry => entry.from));
  const automaticSrMax = filters.respectControlLimit === true ? trainerControlSr(filters.trainerLevel, filters.path) : Infinity;
  const effectiveSrMax = hasNumber(filters.srMax) ? Math.min(Number(filters.srMax), automaticSrMax) : automaticSrMax;
  return species.filter(entry => {
    const types = entry.type ?? [];
    const regions = [...(entry.habitat?.regions ?? []), entry.habitat?.nativeRegion].filter(Boolean);
    const biomes = entry.habitat?.biomes ?? [];
    if (includes.size && !includes.has(normalized(entry.id)) && !includes.has(String(entry.number))) return false;
    if (excludes.has(normalized(entry.id)) || excludes.has(String(entry.number))) return false;
    if (query && !normalized(entry.name).includes(query) && !normalized(entry.id).includes(query) && !String(entry.number).includes(query)) return false;
    if (filters.typePrimary && filters.typeSecondary) {
      const matches = filters.typeMode === "any"
        ? types.some(type => [filters.typePrimary, filters.typeSecondary].includes(type))
        : types.includes(filters.typePrimary) && types.includes(filters.typeSecondary);
      if (!matches) return false;
    } else if (filters.typePrimary && !types.includes(filters.typePrimary)) return false;
    else if (filters.typeSecondary && !types.includes(filters.typeSecondary)) return false;
    if (filters.region && !regions.includes(filters.region)) return false;
    if (filters.biome && !biomes.includes(filters.biome)) return false;
    if (hasNumber(filters.srMin) && Number(entry.sr) < Number(filters.srMin)) return false;
    if (Number(entry.sr) > effectiveSrMax) return false;
    if (Number(entry.minLevel) > level(filters.levelMax, 20)) return false;
    if (filters.stage === "base" && evolved.has(entry.id)) return false;
    if (filters.stage === "evolved" && !evolved.has(entry.id)) return false;
    if (filters.stage === "final" && evolves.has(entry.id)) return false;
    if (filters.stage === "nonfinal" && !evolves.has(entry.id)) return false;
    return true;
  });
}

/**
 * Sortea el equipo Pokémon de un NPC sin pasar de los Pokéslots de su nivel.
 * Admite composición variada (busca tipos nuevos), especializada (prioriza un
 * tipo) o con el más fuerte al final; niveles fijos, ascendentes o al azar
 * dentro del rango, ajustados por la dificultad; sesgo de poder alto o bajo
 * mediante weightedChoice(), y probabilidad de shiny.
 */
export function generateNpcTrainerTeam(pool, options = {}, random = Math.random) {
  const size = Math.max(1, Math.min(trainerPokeslotsForLevel(options.trainerLevel), Math.trunc(Number(options.teamSize) || 1)));
  const uniqueSpecies = options.uniqueSpecies !== false;
  const difficulty = NPC_DIFFICULTIES[options.difficulty] ?? NPC_DIFFICULTIES.standard;
  const minimum = level(options.levelMin, Math.max(1, Number(options.trainerLevel) - 2));
  const maximum = Math.max(minimum, level(options.levelMax, Number(options.trainerLevel) || 1));
  const available = pool.filter(species => Number(species.minLevel) <= maximum);
  if (!available.length) return [];
  const selected = [];
  const used = new Set();
  for (let index = 0; index < size; index++) {
    let candidates = uniqueSpecies ? available.filter(species => !used.has(species.id)) : available;
    if (!candidates.length) break;
    if (options.composition === "varied" && selected.length) {
      const usedTypes = new Set(selected.flatMap(entry => entry.species.type ?? []));
      const varied = candidates.filter(species => (species.type ?? []).some(type => !usedTypes.has(type)));
      if (varied.length) candidates = varied;
    }
    if (options.composition === "specialized" && options.specialization) {
      const themed = candidates.filter(species => (species.type ?? []).includes(options.specialization));
      if (themed.length) candidates = themed;
    }
    const species = weightedChoice(candidates, options, random);
    used.add(species.id);
    const baseLevel = options.levelStrategy === "fixed"
      ? level(options.trainerLevel, 1)
      : options.levelStrategy === "ascending"
        ? Math.round(minimum + ((maximum - minimum) * (index / Math.max(1, size - 1))))
        : minimum + Math.floor(random() * (maximum - minimum + 1));
    const pokemonLevel = Math.max(Number(species.minLevel) || 1, Math.min(20, baseLevel + difficulty.pokemonLevel));
    selected.push({ speciesId: species.id, species, level: pokemonLevel, shiny: random() * 100 < Math.max(0, Number(options.shinyChance) || 0) });
  }
  if (options.composition === "ace-last") selected.sort((a, b) => Number(a.species.sr) - Number(b.species.sr));
  return selected.map(({ species, ...entry }) => entry);
}

/**
 * Reparte las características según el arquetipo: aplica el array estándar (uno
 * mejorado para el jefe) en el orden de prioridad del arquetipo y le suma el
 * ajuste de la dificultad, acotando el resultado entre 3 y 20.
 * La usa npc-trainer-actor.mjs al crear el actor.
 */
export function npcTrainerAbilities(archetypeId, difficultyId) {
  const archetype = NPC_ARCHETYPES[archetypeId] ?? NPC_ARCHETYPES.balanced;
  const difficulty = NPC_DIFFICULTIES[difficultyId] ?? NPC_DIFFICULTIES.standard;
  const array = archetypeId === "boss" ? [17, 15, 14, 13, 12, 10] : [15, 14, 13, 12, 10, 8];
  const result = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  archetype.abilities.forEach((ability, index) => { result[ability] = Math.max(3, Math.min(20, array[index] + difficulty.abilityBonus)); });
  return result;
}

/**
 * PG del NPC con el dado de golpe d6 de la clase Entrenador: máximo al nivel 1 y
 * media en los siguientes, más Constitución, todo multiplicado por el factor de
 * la dificultad. La usa npc-trainer-actor.mjs.
 */
export function npcTrainerHitPoints(trainerLevel, constitution, difficultyId) {
  const lvl = level(trainerLevel, 1);
  const modifier = Math.floor((Number(constitution) - 10) / 2);
  const base = 6 + modifier + ((lvl - 1) * Math.max(1, 4 + modifier));
  return Math.max(1, Math.round(base * (NPC_DIFFICULTIES[difficultyId]?.hpMultiplier ?? 1)));
}

/**
 * Nombre del NPC: respeta el indicado a mano —numerándolo si se generan
 * varios— y, si no lo hay, combina el título del arquetipo con un nombre de
 * FIRST_NAMES. La usa npc-trainer-actor.mjs.
 */
export function randomNpcTrainerName(options = {}, random = Math.random, index = 0) {
  const custom = String(options.name ?? "").trim();
  if (custom) return Number(options.quantity) > 1 ? `${custom} ${index + 1}` : custom;
  const title = options.useTitle === false ? "" : `${NPC_ARCHETYPES[options.archetype]?.name ?? "Entrenador"} `;
  return `${title}${pick(FIRST_NAMES, random)}`;
}

/**
 * Elige una especie aplicando el sesgo de poder: al azar entre las ocho de mayor
 * o menor SR, o entre todas si no hay sesgo. Auxiliar de generateNpcTrainerTeam().
 */
function weightedChoice(candidates, options, random) {
  if (options.powerBias === "high") return [...candidates].sort((a, b) => Number(b.sr) - Number(a.sr))[Math.floor(random() * Math.min(8, candidates.length))];
  if (options.powerBias === "low") return [...candidates].sort((a, b) => Number(a.sr) - Number(b.sr))[Math.floor(random() * Math.min(8, candidates.length))];
  return candidates[Math.floor(random() * candidates.length)];
}

/** Elemento al azar de una lista. Auxiliar de randomNpcTrainerName(). */
function pick(values, random) { return values[Math.floor(random() * values.length)]; }
/** Normaliza texto para comparar sin distinguir mayúsculas ni espacios sobrantes. */
function normalized(value) { return String(value ?? "").trim().toLocaleLowerCase(); }
/**
 * Convierte en conjunto una lista de ids escrita a mano, admitiendo espacios,
 * comas o puntos y coma. La usa filterNpcTrainerSpecies() con las listas de
 * inclusión y exclusión.
 */
function idSet(value) { return new Set(normalized(value).split(/[\s,;]+/).filter(Boolean)); }
/** Indica si un campo del formulario trae un número utilizable (no vacío). */
function hasNumber(value) { return value !== "" && value != null && Number.isFinite(Number(value)); }
/** Acota un nivel al rango 1-20 con valor de reserva. Auxiliar de todo el archivo. */
function level(value, fallback) { return Math.max(1, Math.min(20, Math.trunc(Number(value) || fallback || 1))); }
import { trainerPokeslotsForLevel } from "./model.mjs";
