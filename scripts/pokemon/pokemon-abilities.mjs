/**
 * Motor de habilidades Pokémon — fase 1 (agosto de 2026). Del catálogo de 330
 * habilidades (`data/abilities.json`) esta primera ronda automatiza la parte
 * que encaja sin obra nueva: inmunidades/resistencias de tipo fijas y el
 * clima que se activa solo al entrar en combate. Se aplican una sola vez, al
 * calcular el actor de combate, con el mismo patrón que ya usan los objetos
 * equipados (`heldItemActorAdjustments()` en held-items.mjs) y Almacenar
 * poder (`applyTypeMasteryDefense()` en trainer-path-rules.mjs).
 *
 * No hay concepto de "habilidad activa" distinto de "habilidad conocida": el
 * proyecto ya trataba `instance.abilities` como el conjunto que cuenta a
 * todos los efectos (`requiredAbilities` en move-modifier-rules.mjs consulta
 * ese mismo array sin distinguir una "activa"), así que estas funciones
 * siguen la misma convención en vez de inventar una restricción nueva. Esto
 * también es la razón por la que Guru 9 ("dos habilidades activas a la vez")
 * no necesita código: nunca hubo un límite de una sola que levantar.
 *
 * El resto del catálogo queda para una fase posterior porque exige más que
 * un ajuste al desplegar: absorber un tipo de daño como PG en vez de
 * inmunidad pura, reaccionar al ser tocado en combate cuerpo a cuerpo,
 * bonos condicionados al propio estado alterado, mejoras de golpes
 * múltiples/potencia por categoría de movimiento, robo de objeto al
 * impactar, etc. — cada una necesitaría interceptar una tirada de daño ya
 * resuelta contra un tercero o el turno de otro actor, la misma limitación
 * estructural que ya excluye varias familias de movimientos (ver
 * CONTEXTUAL_MODIFIER_COVERAGE en move-modifier-rules.mjs).
 */
import { requestFieldEffect } from "../combat/terrain-effects.mjs";

/** Habilidad → tipo de daño al que da inmunidad total. */
export const IMMUNITY_ABILITIES = Object.freeze({
  levitate: "ground",
  "water-absorb": "water",
  "volt-absorb": "electric",
  "motor-drive": "electric",
  "lightning-rod": "electric",
  "storm-drain": "water",
  "sap-sipper": "grass",
  "flash-fire": "fire",
  "dry-skin": "water",
  "well-baked-body": "fire",
  "earth-eater": "ground",
  "wind-rider": "flying"
  // Soundproof/Bulletproof no encajan aquí: dan inmunidad a movimientos
  // "de sonido" o "balísticos", una propiedad del movimiento que el catálogo
  // de datos no etiqueta, no un tipo de daño — necesitarían su propia pasada
  // de revisión del texto de los 830 movimientos, como el resto del catálogo.
});

/** Habilidad → lista de tipos de daño a los que da resistencia. */
export const RESISTANCE_ABILITIES = Object.freeze({
  "thick-fat": ["fire", "ice"],
  heatproof: ["fire"],
  "purifying-salt": ["ghost"]
  // Fluffy (resiste contacto, vulnerable a Fuego) no se puede expresar solo
  // con dr/dv/di —"contacto" no es un tipo de daño— y queda para la fase 2.
});

/** Habilidad → clima que activa nada más entrar en combate. */
export const WEATHER_ABILITIES = Object.freeze({
  drizzle: "rain",
  drought: "sun",
  "sand-stream": "sandstorm",
  "snow-warning": "snow",
  "primordial-sea": "rain",
  "desolate-land": "sun"
});

/**
 * Inmunidades y resistencias que aportan las habilidades conocidas de un
 * Pokémon (todas cuentan por igual, ver cabecera del archivo), listas para
 * fusionarlas con las de damageTraitsForPokemonTypes(). No quita nada que ya
 * tuviera el Pokémon por sus propios tipos ni convierte inmunidad en
 * resistencia o viceversa.
 */
export function pokemonAbilityDefenses(abilities = []) {
  const immunities = new Set();
  const resistances = new Set();
  for (const id of abilities ?? []) {
    if (IMMUNITY_ABILITIES[id]) immunities.add(IMMUNITY_ABILITIES[id]);
    for (const type of RESISTANCE_ABILITIES[id] ?? []) resistances.add(type);
  }
  return { immunities: [...immunities], resistances: [...resistances] };
}

/**
 * Aplica pokemonAbilityDefenses() a los rasgos dr/dv/di que ya construye
 * damageTraitsForPokemonTypes(), mutando `traits` en el sitio igual que el
 * resto de ajustes de deployment.mjs. Una resistencia de habilidad no
 * sustituye una inmunidad ya existente por tipo; una inmunidad de habilidad
 * si convierte una resistencia o vulnerabilidad previas.
 */
export function applyAbilityDefenses(traits, abilities) {
  const { immunities, resistances } = pokemonAbilityDefenses(abilities);
  for (const type of immunities) {
    traits.dv.value = traits.dv.value.filter(entry => entry !== type);
    traits.dr.value = traits.dr.value.filter(entry => entry !== type);
    if (!traits.di.value.includes(type)) traits.di.value.push(type);
  }
  for (const type of resistances) {
    if (traits.di.value.includes(type) || traits.dr.value.includes(type)) continue;
    traits.dv.value = traits.dv.value.filter(entry => entry !== type);
    traits.dr.value.push(type);
  }
}

/**
 * Clima que activa entrar en combate con esta habilidad, o null si ninguna
 * de las conocidas lo hace. Si el Pokémon conoce varias habilidades de
 * clima a la vez (no debería, pero por si acaso) se queda con la primera.
 */
export function abilityDeployWeather(abilities = []) {
  for (const id of abilities ?? []) if (WEATHER_ABILITIES[id]) return WEATHER_ABILITIES[id];
  return null;
}

/**
 * Activa el clima de la habilidad (Trío Tiempo y compañía) al desplegar un
 * Pokémon, si el combate ya está en marcha. Usa el mismo requestFieldEffect()
 * que ya disparan los movimientos de clima, con una duración larga (100
 * rondas) en vez de las 5 habituales: en el juego el clima de habilidad dura
 * mientras el Pokémon siga en combate, algo que este proyecto no rastrea, así
 * que se aproxima a "indefinido" en vez de a "5 rondas como un movimiento".
 * Primordial Sea/Desolate Land se simplifican al mismo lluvia/sol normal —sin
 * la parte de "no se puede cambiar mientras estén en juego"—. Se calla sin
 * más si no hay combate activo o la habilidad no pone clima. La llama
 * deployPokemon() (deployment.mjs) tras crear el actor.
 */
export async function applyAbilityDeployWeather(abilities, { sourceName } = {}) {
  const weather = abilityDeployWeather(abilities);
  if (!weather || !game.combat) return;
  await requestFieldEffect(game.combat, "weather", weather, 100, sourceName ?? "");
}
