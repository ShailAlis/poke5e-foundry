/**
 * Reglas de tipos Pokémon: tabla de efectividad, etiquetas, colores y su
 * integración como tipos de daño de D&D 5e. Módulo de reglas puro y sin estado,
 * cuya única dependencia es utils.mjs —que a su vez no importa nada—, lo que
 * permite a validate-combat.mjs probarlo en Node.
 *
 * Lo consumen model.mjs (afinidades en las descripciones), deployment.mjs y
 * wild-deployment.mjs (rasgos de los actores), pokemon-sheet.mjs (tiradas de
 * daño) y main.mjs (registro y migración).
 */
import { titleCase } from "../core/utils.mjs";

/** Los 18 tipos Pokémon canónicos, en el orden en que se muestran. */
export const POKEMON_TYPES = [
  "bug", "dark", "dragon", "electric", "fairy", "fighting", "fire", "flying", "ghost",
  "grass", "ground", "ice", "normal", "poison", "psychic", "rock", "steel", "water"
];

/** Tipos de daño adicionales sin entrada en la tabla de efectividad. */
export const EXTRA_DAMAGE_TYPES = ["stellar", "typeless"];

const TYPE_LABELS = {
  bug: "Bicho", dark: "Siniestro", dragon: "Dragón", electric: "Eléctrico", fairy: "Hada",
  fighting: "Lucha", fire: "Fuego", flying: "Volador", ghost: "Fantasma", grass: "Planta",
  ground: "Tierra", ice: "Hielo", normal: "Normal", poison: "Veneno", psychic: "Psíquico",
  rock: "Roca", steel: "Acero", water: "Agua", stellar: "Astral", typeless: "Sin tipo"
};

const TYPE_COLORS = {
  bug: 0x91A119, dark: 0x50413F, dragon: 0x5060E1, electric: 0xFAC000, fairy: 0xEF70EF,
  fighting: 0xFF8000, fire: 0xE62829, flying: 0x81B9EF, ghost: 0x704170, grass: 0x3FA129,
  ground: 0x915121, ice: 0x3DCEF3, normal: 0x9FA19F, poison: 0x9141CB, psychic: 0xEF4179,
  rock: 0xAFA981, steel: 0x60A1B8, water: 0x2980EF, stellar: 0x7A8CFF, typeless: 0x777777
};

/**
 * Tabla ofensiva: TYPE_CHART[atacante][defensor] da el multiplicador de daño.
 * Las combinaciones ausentes valen 1. Solo la lee pokemonDefenses().
 */
const TYPE_CHART = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
};

/**
 * Nombre en español de un tipo, con titleCase() como reserva para los valores no
 * catalogados. Lo usan registerPokemonDamageTypes(), model.mjs y las fichas.
 */
export function typeLabel(type) {
  return TYPE_LABELS[type] ?? titleCase(type);
}

/**
 * Inyecta los tipos Pokémon en `CONFIG.DND5E.damageTypes` sin tocar los tipos
 * propios de D&D 5e, para que el sistema aplique por sí solo resistencias e
 * inmunidades. La llama el hook `init` de main.mjs; sale sin hacer nada si el
 * sistema no está cargado, lo que permite probarla desde validate-combat.mjs.
 */
export function registerPokemonDamageTypes() {
  const damageTypes = globalThis.CONFIG?.DND5E?.damageTypes;
  if (!damageTypes) return;
  for (const type of [...POKEMON_TYPES, ...EXTRA_DAMAGE_TYPES]) {
    if (damageTypes[type]) continue;
    damageTypes[type] = {
      label: typeLabel(type),
      icon: "icons/svg/explosion.svg",
      color: globalThis.Color ? new Color(TYPE_COLORS[type]) : `#${TYPE_COLORS[type].toString(16).padStart(6, "0")}`
    };
  }
}

/**
 * Calcula las afinidades de una especie multiplicando en TYPE_CHART los
 * multiplicadores de cada uno de sus tipos, y las reparte en vulnerabilidades,
 * resistencias e inmunidades. Base de damageTraitsForPokemonTypes() y de la
 * descripción de especie en model.mjs.
 */
export function pokemonDefenses(defendingTypes) {
  const types = [...new Set((defendingTypes ?? []).filter(type => POKEMON_TYPES.includes(type)))];
  const vulnerabilities = [];
  const resistances = [];
  const immunities = [];
  for (const attackingType of POKEMON_TYPES) {
    const multiplier = types.reduce((value, defendingType) => value * (TYPE_CHART[attackingType]?.[defendingType] ?? 1), 1);
    if (multiplier === 0) immunities.push(attackingType);
    else if (multiplier > 1) vulnerabilities.push(attackingType);
    else if (multiplier < 1) resistances.push(attackingType);
  }
  return { vulnerabilities, resistances, immunities };
}

/**
 * Traduce el resultado de pokemonDefenses() a los rasgos `dr`/`dv`/`di` que
 * espera un actor de D&D 5e. La usan deployment.mjs y wild-deployment.mjs al
 * crear tokens, y la migración de main.mjs sobre los ya existentes.
 */
export function damageTraitsForPokemonTypes(types) {
  const defenses = pokemonDefenses(types);
  const trait = value => ({ value, custom: "", bypasses: [] });
  return {
    dr: trait(defenses.resistances),
    dv: trait(defenses.vulnerabilities),
    di: trait(defenses.immunities)
  };
}

/**
 * Depura los tipos de daño declarados en un movimiento del JSON: acepta valor
 * suelto o lista, descarta los desconocidos y admite además "healing".
 * La usa pokemon-sheet.mjs antes de lanzar una tirada de daño.
 */
export function normalizeMoveDamageTypes(value) {
  const types = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(types.filter(type => [...POKEMON_TYPES, ...EXTRA_DAMAGE_TYPES, "healing"].includes(type)))];
}
