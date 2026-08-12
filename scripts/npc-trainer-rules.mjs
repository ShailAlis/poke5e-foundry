export const NPC_ARCHETYPES = {
  balanced: { name: "Equilibrado", abilities: ["cha", "dex", "wis", "con", "int", "str"], skills: ["ani", "prc", "ins"] },
  ace: { name: "Entrenador experto", abilities: ["cha", "wis", "dex", "con", "int", "str"], skills: ["ani", "ins", "per"] },
  tactical: { name: "Estratega", abilities: ["int", "wis", "cha", "dex", "con", "str"], skills: ["inv", "ins", "nat"] },
  athletic: { name: "Atleta", abilities: ["str", "con", "dex", "cha", "wis", "int"], skills: ["ath", "acr", "sur"] },
  agile: { name: "Especialista ágil", abilities: ["dex", "cha", "wis", "con", "int", "str"], skills: ["acr", "slt", "ste"] },
  researcher: { name: "Investigador", abilities: ["int", "wis", "cha", "con", "dex", "str"], skills: ["inv", "nat", "med"] },
  medic: { name: "Sanador", abilities: ["wis", "cha", "con", "int", "dex", "str"], skills: ["med", "ins", "ani"] },
  performer: { name: "Artista", abilities: ["cha", "dex", "wis", "int", "con", "str"], skills: ["prf", "per", "slt"] },
  villain: { name: "Agente criminal", abilities: ["cha", "dex", "int", "con", "wis", "str"], skills: ["itm", "dec", "ste"] },
  boss: { name: "Jefe / Campeón", abilities: ["cha", "con", "wis", "dex", "int", "str"], skills: ["ani", "itm", "ins", "prc"] }
};

export const NPC_DIFFICULTIES = {
  easy: { name: "Fácil", abilityBonus: -1, hpMultiplier: 0.8, pokemonLevel: -2 },
  standard: { name: "Estándar", abilityBonus: 0, hpMultiplier: 1, pokemonLevel: 0 },
  hard: { name: "Difícil", abilityBonus: 1, hpMultiplier: 1.2, pokemonLevel: 1 },
  elite: { name: "Élite", abilityBonus: 2, hpMultiplier: 1.5, pokemonLevel: 2 },
  boss: { name: "Jefe", abilityBonus: 3, hpMultiplier: 2, pokemonLevel: 3 }
};

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

export function trainerControlSr(trainerLevel, path = "none") {
  const lvl = level(trainerLevel, 1);
  const base = lvl >= 17 ? 15 : lvl >= 14 ? 14 : lvl >= 11 ? 12 : lvl >= 8 ? 10 : lvl >= 6 ? 8 : lvl >= 3 ? 5 : 2;
  return Math.min(15, base + (path === "guru" && lvl >= 2 ? 1 : 0));
}

const FIRST_NAMES = ["Aina", "Alex", "Bruno", "Celia", "Dani", "Elena", "Gael", "Hana", "Iris", "Joel", "Kai", "Lara", "Leo", "Mara", "Nico", "Noa", "Omar", "Rina", "Saúl", "Vera", "Yuri", "Zoe"];

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

export function npcTrainerAbilities(archetypeId, difficultyId) {
  const archetype = NPC_ARCHETYPES[archetypeId] ?? NPC_ARCHETYPES.balanced;
  const difficulty = NPC_DIFFICULTIES[difficultyId] ?? NPC_DIFFICULTIES.standard;
  const array = archetypeId === "boss" ? [17, 15, 14, 13, 12, 10] : [15, 14, 13, 12, 10, 8];
  const result = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  archetype.abilities.forEach((ability, index) => { result[ability] = Math.max(3, Math.min(20, array[index] + difficulty.abilityBonus)); });
  return result;
}

export function npcTrainerHitPoints(trainerLevel, constitution, difficultyId) {
  const lvl = level(trainerLevel, 1);
  const modifier = Math.floor((Number(constitution) - 10) / 2);
  const base = 6 + modifier + ((lvl - 1) * Math.max(1, 4 + modifier));
  return Math.max(1, Math.round(base * (NPC_DIFFICULTIES[difficultyId]?.hpMultiplier ?? 1)));
}

export function randomNpcTrainerName(options = {}, random = Math.random, index = 0) {
  const custom = String(options.name ?? "").trim();
  if (custom) return Number(options.quantity) > 1 ? `${custom} ${index + 1}` : custom;
  const title = options.useTitle === false ? "" : `${NPC_ARCHETYPES[options.archetype]?.name ?? "Entrenador"} `;
  return `${title}${pick(FIRST_NAMES, random)}`;
}

function weightedChoice(candidates, options, random) {
  if (options.powerBias === "high") return [...candidates].sort((a, b) => Number(b.sr) - Number(a.sr))[Math.floor(random() * Math.min(8, candidates.length))];
  if (options.powerBias === "low") return [...candidates].sort((a, b) => Number(a.sr) - Number(b.sr))[Math.floor(random() * Math.min(8, candidates.length))];
  return candidates[Math.floor(random() * candidates.length)];
}

function pick(values, random) { return values[Math.floor(random() * values.length)]; }
function normalized(value) { return String(value ?? "").trim().toLocaleLowerCase(); }
function idSet(value) { return new Set(normalized(value).split(/[\s,;]+/).filter(Boolean)); }
function hasNumber(value) { return value !== "" && value != null && Number.isFinite(Number(value)); }
function level(value, fallback) { return Math.max(1, Math.min(20, Math.trunc(Number(value) || fallback || 1))); }
import { trainerPokeslotsForLevel } from "./model.mjs";
