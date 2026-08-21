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
 * Fase 2 (segmentada igual que los 830 movimientos, un lote de mecánica
 * homogénea a la vez):
 * - Lote 1: inmunidades a un estado alterado completo (Inmunidad, Insomnio,
 *   Espíritu Vital, Postura Firme, Velo Acuático, Burbuja de Agua, Armadura
 *   Ígnea, Cuerpo Dorado...), porque encajan en el mismo punto de
 *   applyPokemonStatus() (status-effects.mjs) que ya usan las inmunidades
 *   por tipo de daño — solo cambia de qué depende la inmunidad, no dónde se
 *   comprueba.
 * - Lote 2: reacciones de daño por contacto (Piel Tosca, Punta Acero,
 *   Electricidad Estática, Esporas Efecto, Punto Toxico): "si un golpe
 *   cuerpo a cuerpo te alcanza, tira 1d4 y en un 4 devuelve daño igual a tu
 *   competencia al atacante". Se resuelve en #rollMove() (pokemon-sheet.mjs),
 *   el mismo sitio donde ya se resuelven Falso Tortazo, Ladrón o el resto de
 *   efectos por objetivo alcanzado — es el primer lote que necesita conocer
 *   al atacante además del defensor, así que introduce
 *   applyContactDamageReaction() con su propia copia de pokemonItemForActor()
 *   (mismo patrón anticírculos que ya usa trainer-resources.mjs).
 * - Lote 3: STAB×2 con poca vida (Blaze/Overgrow/Swarm/Torrent, mismo texto
 *   exacto en las cuatro). `ownHpFraction` ya se calculaba en #rollMove()
 *   para otros movimientos condicionados a la vida propia, así que
 *   abilityLowHpStabBonus() solo añade +2 al mismo parámetro `heldItemStab`
 *   de damageFormula() que ya usa el STAB de un objeto equipado — ese
 *   parámetro solo se aplica cuando el movimiento ya tiene STAB, así que no
 *   hace falta repetir la condición de tipo aquí.
 * - Lote 4: bonos fijos de ataque/daño/crítico por movimiento (Ojo Compuesto,
 *   Alas Danza, Metaltrabajador, Rivalidad, Suertudo). abilityMoveProfile()
 *   es el mismo hueco que ya rellenan heldProfile (objeto equipado) y
 *   pathProfile (Camino de Entrenador) en #rollMove(): un +1/+competencia/
 *   +1 rango de crítico sumado en la misma tirada, sin estado de combate que
 *   rastrear más allá del tipo del movimiento y, para Rivalidad, el tipo del
 *   objetivo (ya disponible por el flag `pokemonTypes` que llevan los actores
 *   desplegados y salvajes).
 * - Lote 7: Escama Prodigio y Pies Rápidos, CA/velocidad extra mientras el
 *   Pokémon sufre CUALQUIER estado alterado negativo. A diferencia de los
 *   lotes anteriores esto no se calcula una vez al desplegar el actor, porque
 *   el bono depende de un hecho que cambia durante el combate (entrar y salir
 *   de sufrir un estado), y un Pokémon puede tener varios estados compatibles
 *   a la vez (un no-volátil más Confuso/Amedrentado, ver status-effects.mjs).
 *   abilityStatusBonusEffectSource() solo construye el ActiveEffect; es
 *   status-effects.mjs quien decide cuándo crearlo y borrarlo, atado al
 *   PRIMER estado que sufre el Pokémon y al momento en que se queda sin
 *   NINGUNO — no al ciclo de vida de un estado concreto — para no duplicar el
 *   bono ni perderlo al quitar solo uno de los estados activos.
 *
 * El resto del catálogo queda para lotes posteriores porque exige más que un
 * ajuste al desplegar o una comprobación puntual: absorber un tipo de daño
 * como PG en vez de inmunidad pura, reacciones por contacto que aplican
 * estado en vez de daño (requieren la misma infraestructura de
 * applyPokemonStatus() que un movimiento normal), bonos condicionados al
 * propio estado alterado o a la vida restante, mejoras de golpes
 * múltiples/potencia por categoría de movimiento, robo de objeto al
 * impactar, auras que alcanzan a los aliados cercanos, etc. — cada una
 * necesitaría interceptar una tirada de daño ya resuelta contra un tercero o
 * el turno de otro actor, la misma limitación estructural que ya excluye
 * varias familias de movimientos (ver CONTEXTUAL_MODIFIER_COVERAGE en
 * move-modifier-rules.mjs).
 */
import { MODULE_ID } from "../core/model.mjs";
import { typeLabel } from "../combat/combat.mjs";
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
  "purifying-salt": ["ghost"],
  "water-bubble": ["fire"]
  // Fluffy (resiste contacto, vulnerable a Fuego) no se puede expresar solo
  // con dr/dv/di —"contacto" no es un tipo de daño— y queda para más adelante.
});

/**
 * Habilidad → lista de estados de POKEMON_STATUS_EFFECTS (status-effects.mjs)
 * a los que da inmunidad total, sin importar el tipo del Pokémon que los
 * causa. Primer lote de la fase 2: solo las inmunidades "yo nunca sufro X",
 * que encajan en el mismo punto de applyPokemonStatus() que ya usan las
 * inmunidades por tipo de daño. Comatose se simplifica a "nunca se duerme
 * de verdad"; el matiz de videojuego de "cuenta como dormido para activar
 * Somnífero/Última Cena/etc." queda fuera porque este proyecto no distingue
 * ese caso de un Dormido real.
 */
export const STATUS_IMMUNITY_ABILITIES = Object.freeze({
  immunity: ["poisoned", "badly-poisoned"],
  insomnia: ["asleep"],
  "vital-spirit": ["asleep"],
  comatose: ["asleep"],
  limber: ["paralyzed"],
  "own-tempo": ["confused"],
  "water-veil": ["burned"],
  "water-bubble": ["burned"],
  "magma-armor": ["frozen"]
});

/** Habilidades que dan inmunidad a todos los estados del catálogo. */
export const FULL_STATUS_IMMUNITY_ABILITIES = Object.freeze(new Set(["good-as-gold"]));

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
 * Estado que las habilidades conocidas bloquean de plano, o null si ninguna
 * lo hace. La consulta applyPokemonStatus() (status-effects.mjs) en el mismo
 * punto que ya comprueba las inmunidades por tipo de daño.
 */
export function abilityBlocksStatus(abilities, id) {
  const known = abilities ?? [];
  if (known.some(entry => FULL_STATUS_IMMUNITY_ABILITIES.has(entry))) return true;
  return known.some(entry => (STATUS_IMMUNITY_ABILITIES[entry] ?? []).includes(id));
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

/**
 * Habilidad → reacción de contacto: "si un golpe cuerpo a cuerpo te alcanza,
 * tira `die` y en el resultado `on` devuelve al atacante daño de `type`
 * igual a tu competencia". Las cinco comparten la misma tirada (1d4, ocurre
 * con un 4) y solo cambian de tipo de daño, así que se listan como datos en
 * vez de repetir la lógica cinco veces.
 */
export const CONTACT_DAMAGE_ABILITIES = Object.freeze({
  "rough-skin": { type: "typeless", die: 4, on: 4 },
  "iron-barbs": { type: "steel", die: 4, on: 4 },
  static: { type: "electric", die: 4, on: 4 },
  "effect-spore": { type: "grass", die: 4, on: 4 },
  "poison-point": { type: "poison", die: 4, on: 4 }
});

/**
 * Primera reacción de contacto que aporta un conjunto de habilidades
 * conocidas, o null si ninguna tiene una. Si un Pokémon tuviera varias a la
 * vez (no debería, el catálogo no las combina en ninguna especie) se queda
 * con la primera, igual que abilityDeployWeather().
 */
export function contactDamageReaction(abilities = []) {
  for (const id of abilities ?? []) if (CONTACT_DAMAGE_ABILITIES[id]) return { ability: id, ...CONTACT_DAMAGE_ABILITIES[id] };
  return null;
}

/**
 * Resuelve la reacción de contacto de un defensor tras recibir un golpe
 * cuerpo a cuerpo: tira el dado de la habilidad y, si acierta, resta PG al
 * atacante igual a la competencia del defensor (misma escala que
 * applyEndTurnStatusDamage() en status-effects.mjs) y lo publica en el chat.
 * No hace nada si el defensor no conoce ninguna de CONTACT_DAMAGE_ABILITIES.
 * La llama #rollMove() (pokemon-sheet.mjs) tras resolver el ataque, una vez
 * por objetivo alcanzado, solo cuando el movimiento es cuerpo a cuerpo
 * (move.attack.scope === "melee").
 */
export async function applyContactDamageReaction(defenderActor, attackerActor) {
  if (!defenderActor || !attackerActor || defenderActor === attackerActor) return;
  const pokemonItem = await pokemonItemForActor(defenderActor);
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  const reaction = contactDamageReaction(instance?.abilities);
  if (!reaction) return;
  const label = pokemonItem.name ?? defenderActor.name;
  const roll = await new Roll(`1d${reaction.die}`).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: defenderActor }), flavor: `${defenderActor.name} — ${label} (contacto): ¿daña al atacante? (ocurre con un ${reaction.on})` });
  if (Number(roll.total) !== reaction.on) return;
  const level = Number(instance?.level) || 1;
  const damage = 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
  const hp = attackerActor.system.attributes?.hp;
  if (!hp) return;
  await attackerActor.update({ "system.attributes.hp.value": Math.max(0, Number(hp.value) - damage) });
  await ChatMessage.create({
    content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(attackerActor.name)}</strong> recibe <strong>${damage} de daño ${escapeHtml(typeLabel(reaction.type))}</strong> por el contacto con ${escapeHtml(defenderActor.name)}.</p></div>`
  });
}

/**
 * Habilidades que duplican el bono de STAB (que ya vale +2, ver
 * damageFormula() en pokemon-sheet.mjs) cuando su Pokémon está al 25% o
 * menos de sus PG máximos. Las cuatro comparten texto exacto, solo cambian
 * de tipo asociado, así que no hace falta guardar el tipo aquí: el bono se
 * suma igual que el de un objeto equipado (heldItemStab) y ya depende de que
 * el propio movimiento comparta tipo con el Pokémon para aplicarse.
 */
export const LOW_HP_STAB_ABILITIES = Object.freeze(new Set(["blaze", "overgrow", "swarm", "torrent"]));

/**
 * Bono de STAB adicional (+2, para que el +2 base se convierta en +4) si el
 * Pokémon conoce una de LOW_HP_STAB_ABILITIES y está al 25% o menos de sus
 * PG máximos, o 0 en caso contrario. Se suma al mismo parámetro
 * `heldItemStab` de damageFormula() (pokemon-sheet.mjs), que ya solo lo
 * aplica cuando el movimiento comparte tipo con el Pokémon (o `forceStab`
 * está activo), así que no duplica el bono cuando no habría STAB de por medio.
 */
export function abilityLowHpStabBonus(abilities, hpFraction) {
  if (!(Number(hpFraction) <= 0.25)) return 0;
  return (abilities ?? []).some(id => LOW_HP_STAB_ABILITIES.has(id)) ? 2 : 0;
}

/**
 * Bono de ataque, daño y rango de crítico que aportan las habilidades
 * conocidas a un movimiento concreto: mismo hueco que ya rellenan heldProfile
 * (objeto equipado, held-items.mjs) y pathProfile (Camino de Entrenador,
 * trainer-path-rules.mjs) en #rollMove(), sumado en los mismos tres puntos
 * (tirada de ataque, daño y umbral de crítico). Ojo Compuesto es el único
 * incondicional; el resto exige que el movimiento sea del tipo correcto
 * (Alas Danza, Metaltrabajador) o que el objetivo comparta tipo con el
 * Pokémon (Rivalidad, con `targetTypes` de todos los objetivos seleccionados
 * a la vez para no repetir la llamada por cada uno).
 */
export function abilityMoveProfile(abilities = [], { moveType = null, hasDamage = false, proficiency = 2, sourceTypes = [], targetTypes = [] } = {}) {
  const known = new Set(abilities ?? []);
  let attack = 0;
  let damage = 0;
  let criticalRange = 0;
  if (known.has("compound-eyes")) attack += 1;
  if (known.has("gale-wings") && moveType === "flying") attack += 1;
  if (known.has("steelworker") && hasDamage && moveType === "steel") damage += proficiency;
  if (known.has("rivalry") && hasDamage && sourceTypes.some(type => targetTypes.includes(type))) damage += proficiency;
  if (known.has("super-luck")) criticalRange += 1;
  return { attack, damage, criticalRange };
}

/**
 * Localiza el Item Pokémon que respalda a un actor: por el UUID que guarda un
 * desplegado o, si no lo hay, entre los Items embebidos de un salvaje. Copia
 * local de la misma función de status-effects.mjs (y trainer-resources.mjs)
 * para no crear un ciclo de imports entre los tres archivos.
 */
async function pokemonItemForActor(actor) {
  const uuid = actor.getFlag(MODULE_ID, "pokemonItemUuid");
  if (uuid) return fromUuid(uuid);
  return actor.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? null;
}

/** Escapa texto para los mensajes de chat que genera este archivo. */
function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }

/** Habilidad → bono de CA mientras el Pokémon sufre cualquier estado alterado negativo. */
export const AC_STATUS_BONUS_ABILITIES = Object.freeze({
  "marvel-scale": 2
});

/**
 * Habilidad → pies de más de velocidad mientras el Pokémon sufre cualquier
 * estado alterado negativo. Se aplica a las cinco formas de movimiento, igual
 * que la reducción de velocidad de Parálisis en pokemonStatusEffectSource()
 * (status-effects.mjs): un Pokémon con desplazamiento de vuelo o natación
 * también gana los mismos 15 pies ahí, no solo caminando.
 */
export const SPEED_STATUS_BONUS_ABILITIES = Object.freeze({
  "quick-feet": 15
});

/**
 * ActiveEffect con el bono de CA y/o velocidad de las habilidades de estado
 * alterado (Escama Prodigio, Pies Rápidos), o null si el Pokémon no conoce
 * ninguna de las dos. Mismo formato que devuelve pokemonStatusEffectSource()
 * en status-effects.mjs, para que ese archivo pueda crearlo y borrarlo con
 * las mismas llamadas createEmbeddedDocuments/deleteEmbeddedDocuments que ya
 * usa con los estados. No se llama desde este archivo: lo consume
 * status-effects.mjs en applyPokemonStatus()/removePokemonStatus(), ver
 * cabecera del archivo (Lote 7) para el porqué del diseño.
 */
export function abilityStatusBonusEffectSource(abilities = []) {
  const changes = [];
  for (const id of abilities ?? []) {
    if (AC_STATUS_BONUS_ABILITIES[id] != null) {
      changes.push({
        key: "system.attributes.ac.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: AC_STATUS_BONUS_ABILITIES[id]
      });
    }
    if (SPEED_STATUS_BONUS_ABILITIES[id] != null) {
      for (const type of ["walk", "fly", "swim", "burrow", "climb"]) {
        changes.push({
          key: `system.attributes.movement.${type}`,
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: SPEED_STATUS_BONUS_ABILITIES[id]
        });
      }
    }
  }
  if (!changes.length) return null;
  return {
    name: "Bono de estado alterado",
    icon: "icons/svg/upgrade.svg",
    img: "icons/svg/upgrade.svg",
    description: "Bono de CA y/o velocidad mientras el Pokémon sufre algún estado alterado.",
    statuses: [],
    changes,
    duration: {},
    flags: { [MODULE_ID]: { kind: "ability-status-bonus" } }
  };
}
