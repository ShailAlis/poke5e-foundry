import { experienceAtLevel, experienceAward } from "./progression.mjs";

const LEVEL_MOVE_GROUPS = [
  [1, "start"], [2, "level2"], [6, "level6"], [10, "level10"], [14, "level14"], [18, "level18"]
];

export const MAX_ENCOUNTER_POKEMON = 20;

export function filterEncounterSpecies(species, filters = {}) {
  const query = String(filters.query ?? "").trim().toLocaleLowerCase();
  return species.filter(entry => {
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

export function buildWildInstance(species, movesById, options = {}) {
  const random = options.random ?? Math.random;
  const idFactory = options.idFactory ?? (() => Math.random().toString(36).slice(2, 18));
  const level = Math.max(Number(species.minLevel) || 1, normalizedLevel(options.level, species.minLevel));
  const hp = adjustedHitPoints(species, level);
  const availableAbilities = (species.abilities ?? []).filter(entry => !entry.hidden).map(entry => entry.id);
  const ability = availableAbilities.length ? availableAbilities[Math.floor(random() * availableAbilities.length)] : null;
  const selectedMoves = shuffled(naturalMovesAtLevel(species, level), random).slice(0, 4);
  return {
    nickname: "",
    level,
    experience: experienceAtLevel(level),
    hp: { value: hp, max: hp },
    ac: Number(species.ac) || 10,
    attributes: structuredCloneSafe(species.attributes ?? {}),
    nature: "",
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

export function adjustedHitPoints(species, level) {
  const baseLevel = Math.max(1, Number(species.minLevel) || 1);
  const delta = normalizedLevel(level, baseLevel) - baseLevel;
  const sides = Math.max(4, Number(String(species.hitDice ?? "d8").replace(/^d/, "")) || 8);
  const average = Math.ceil(0.5 + (sides / 2));
  const constitution = Number(species.attributes?.con) || 10;
  const modifier = Math.floor((constitution - 10) / 2);
  return Math.max(8, (Number(species.hp) || 1) + (delta * (average + modifier)));
}

export function naturalMovesAtLevel(species, level) {
  return [...new Set(LEVEL_MOVE_GROUPS
    .filter(([required]) => required <= Number(level))
    .flatMap(([, key]) => species.moves?.[key] ?? []))];
}

function randomLevel(species, minimum, maximum, random) {
  const floor = Math.max(minimum, Number(species.minLevel) || 1);
  return floor + Math.floor(random() * (maximum - floor + 1));
}

function randomGender(ratio, random) {
  const [female, male] = String(ratio ?? "0:0").split(":").map(value => Math.max(0, Number(value) || 0));
  const total = female + male;
  if (!total) return "none";
  return random() < female / total ? "female" : "male";
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function normalizedLevel(value, fallback) {
  return Math.max(1, Math.min(20, Math.trunc(Number(value) || fallback || 1)));
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
