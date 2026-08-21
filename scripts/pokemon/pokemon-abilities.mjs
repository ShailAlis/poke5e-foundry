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
 * - Lote 5: reacciones de contacto que aplican un estado al atacante en vez
 *   de dañarlo (Cuerpo Ardiente quema con un 10 en 1d10, Hedor amedrenta con
 *   un 10 en 1d10; Cuerpo Maldito es distinto, bloquea el último movimiento
 *   del atacante con un 4 en 1d4 en vez de un estado del catálogo). Mismo
 *   punto que el lote 2 (#rollMove(), tras resolver un ataque cuerpo a
 *   cuerpo), pero como este archivo no importa applyPokemonStatus() ni
 *   applyMoveLock() (evitar el ciclo de imports con status-effects.mjs, que
 *   ya importa abilityBlocksStatus() de aquí) las tres funciones de este
 *   lote solo tiran el dado y devuelven el resultado; quien llama desde
 *   pokemon-sheet.mjs aplica el estado o el bloqueo con las funciones que sí
 *   tiene importadas.
 * - Lote 6: bonos/inmunidades condicionados al propio estado alterado del
 *   Pokémon, no al del rival. Vigor (`guts`) anula la desventaja en ataque
 *   por Envenenado/Gravemente envenenado y la tirada doble-quedarse-con-la-
 *   menor por Quemado en #rollMove() (pokemon-sheet.mjs), sin tocar el daño
 *   periódico de fin de turno que ya aplica applyEndTurnStatusDamage()
 *   (status-effects.mjs) — el texto de Vigor solo exime la desventaja/
 *   reducción, no ese daño. Competitivo (`competitive`) e Impulso Ígneo
 *   (`flare-boost`) suman la competencia al daño mientras el propio Pokémon
 *   sufre ciertos estados, vía abilitySelfStatusDamageBonus(), en el mismo
 *   hueco de damageFormula() que ya usa abilityProfile.damage del lote 4.
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
 *
 * Lote 8: curación de fin de turno condicionada al clima activo del combate
 * — Cuenco Lluvia (rain-dish) con lluvia y Cuerpo Hielo (ice-body) con
 * granizo o nieve. Se engancha en el mismo punto que ya resuelve el daño
 * periódico de estado (`applyEndTurnStatusDamage()` en status-effects.mjs,
 * llamada desde ongoing-effects.mjs en el cambio de turno), con una función
 * hermana nueva, `applyEndTurnAbilityHealing()`, que consulta el clima del
 * combate con `currentField()` (terrain-effects.mjs) y las habilidades
 * conocidas del Pokémon (reutilizando `pokemonAbilities()`, la misma función
 * local que ya usa applyPokemonStatus() para las inmunidades a estado por
 * habilidad). La parte de Cuerpo Hielo sobre "no recibe daño de granizo" no
 * necesita código propio: este proyecto no automatiza ningún daño de
 * granizo por ronda (move-modifier-rules.mjs lo deja como resolución manual
 * explícitamente), así que no hay nada que anular.
 *
 * Lote 9 (agosto de 2026): reducción de daño automática que depende de una
 * habilidad conocida (y, en Robustez, del propio golpe) en vez de un
 * movimiento armado a mano. Multiescama/Escudo Sombra ("si este Pokémon está
 * a PG máximos, el primer golpe que reciba se reduce a la mitad") y Robustez
 * ("al recibir daño igual o superior a la mitad de tus PG actuales, tira 1d4
 * y en 3 o 4 se reduce a la mitad") solo exponen aquí su catálogo
 * (FULL_HP_HALF_DAMAGE_ABILITIES, STURDY_HALF_DAMAGE_ABILITIES): la decisión
 * de cuándo se activan y el recorte del golpe se resuelven extendiendo el
 * mismo hook `preUpdateActor` que ya usa damage-shields.mjs para los escudos
 * de reacción, en vez de registrar un segundo hook independiente. Dos hooks
 * de `preUpdateActor` recortando por separado el mismo campo
 * `system.attributes.hp.value` competirían entre sí — el segundo en
 * ejecutar solo vería el resultado ya recortado por el primero (o al revés,
 * según el orden de registro de Foundry, que este proyecto no controla), lo
 * que puede sobre-recortar un golpe o enmascarar uno de los dos efectos sin
 * previsibilidad — así que toda la lógica de recorte de PG vive en un único
 * hook en damage-shields.mjs, y este archivo solo aporta el catálogo de
 * habilidades y la función pura que decide si aplican.
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

/** Habilidad → climas que activan curación de fin de turno con ese clima. */
export const WEATHER_HEAL_ABILITIES = Object.freeze({
  "rain-dish": ["rain"],
  "ice-body": ["hail", "snow"]
});

/**
 * Indica si alguna de las habilidades conocidas cura al final del turno con
 * el clima actualmente activo (`weatherId`, el `id` que devuelve
 * currentField().weather, o null/undefined si no hay clima activo). La usa
 * applyEndTurnAbilityHealing() en status-effects.mjs.
 */
export function abilityWeatherHeal(abilities = [], weatherId = null) {
  if (!weatherId) return false;
  return (abilities ?? []).some(id => WEATHER_HEAL_ABILITIES[id]?.includes(weatherId));
}

/** Escapa texto para los mensajes de chat que genera este archivo. */
function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }

/**
 * Habilidad → reacción de contacto que aplica un estado del catálogo
 * (POKEMON_STATUS_EFFECTS, status-effects.mjs) al atacante en vez de daño:
 * "si un golpe cuerpo a cuerpo te alcanza, tira `die` y en el resultado `on`
 * el atacante sufre `status`". Cuerpo Maldito no vive aquí porque no aplica
 * un estado del catálogo, ver applyCursedBodyReaction() más abajo.
 */
export const CONTACT_STATUS_ABILITIES = Object.freeze({
  "flame-body": { status: "burned", die: 10, on: 10 },
  stench: { status: "flinched", die: 10, on: 10 }
});

/**
 * Primera reacción de contacto-a-estado que aporta un conjunto de
 * habilidades conocidas, o null si ninguna tiene una. Mismo criterio de
 * "primera coincidencia" que contactDamageReaction() y abilityDeployWeather().
 */
export function contactStatusReaction(abilities = []) {
  for (const id of abilities ?? []) if (CONTACT_STATUS_ABILITIES[id]) return { ability: id, ...CONTACT_STATUS_ABILITIES[id] };
  return null;
}

/**
 * Resuelve la reacción de contacto de un defensor tras recibir un golpe
 * cuerpo a cuerpo cuando esa reacción aplica un estado (Cuerpo Ardiente,
 * Hedor) en vez de daño: tira el dado de la habilidad y publica la tirada
 * pública en el chat, igual que applyContactDamageReaction(). Si acierta
 * devuelve `{ ability, status }` para que quien llame aplique el estado al
 * atacante con applyPokemonStatus() (status-effects.mjs); si no, devuelve
 * null. Esta función nunca aplica el estado ella misma: pokemon-abilities.mjs
 * no importa status-effects.mjs para no crear un ciclo de imports (ese
 * archivo ya importa abilityBlocksStatus() de aquí). La llama #rollMove()
 * (pokemon-sheet.mjs) tras resolver el ataque, una vez por objetivo
 * alcanzado, solo cuando el movimiento es cuerpo a cuerpo.
 */
export async function applyContactStatusReaction(defenderActor) {
  if (!defenderActor) return null;
  const pokemonItem = await pokemonItemForActor(defenderActor);
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  const reaction = contactStatusReaction(instance?.abilities);
  if (!reaction) return null;
  const label = pokemonItem.name ?? defenderActor.name;
  const roll = await new Roll(`1d${reaction.die}`).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: defenderActor }), flavor: `${defenderActor.name} — ${label} (contacto): ¿inflige un estado al atacante? (ocurre con un ${reaction.on})` });
  if (Number(roll.total) !== reaction.on) return null;
  return { ability: reaction.ability, status: reaction.status };
}

/**
 * Resuelve Cuerpo Maldito tras recibir un golpe cuerpo a cuerpo: tira 1d4 y,
 * en un 4, publica la tirada y un aviso corto en el chat y devuelve true para
 * que quien llame bloquee el último movimiento del atacante con
 * applyMoveLock() (move-modifiers.mjs); si no, devuelve false sin publicar el
 * aviso adicional. No aplica el bloqueo ella misma por el mismo motivo que
 * applyContactStatusReaction(): esta función no conoce moveId, solo la llamada
 * desde #rollMove() (pokemon-sheet.mjs) lo tiene a mano.
 */
export async function applyCursedBodyReaction(defenderActor, attackerActor) {
  if (!defenderActor || !attackerActor || defenderActor === attackerActor) return false;
  const pokemonItem = await pokemonItemForActor(defenderActor);
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  if (!(instance?.abilities ?? []).includes("cursed-body")) return false;
  const label = pokemonItem.name ?? defenderActor.name;
  const roll = await new Roll("1d4").evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: defenderActor }), flavor: `${defenderActor.name} — ${label} (contacto): ¿bloquea el movimiento del atacante? (ocurre con un 4)` });
  if (Number(roll.total) !== 4) return false;
  await ChatMessage.create({
    content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(attackerActor.name)}</strong> no podrá repetir ese movimiento en su próximo turno por Cuerpo Maldito de ${escapeHtml(defenderActor.name)}.</p></div>`
  });
  return true;
}

/**
 * Habilidades cuyo texto es "si este Pokémon está a PG máximos, el primer
 * golpe que reciba se reduce a la mitad" (Multiescama, Escudo Sombra: mismo
 * texto exacto). No hace falta rastrear "ya se usó una vez": en cuanto el
 * golpe conecta el Pokémon deja de estar a PG máximos, así que la propia
 * condición de PG máximos impide que se repita hasta que vuelva a curarse
 * del todo, sin estado adicional que guardar.
 */
export const FULL_HP_HALF_DAMAGE_ABILITIES = new Set(["multiscale", "shadow-shield"]);

/**
 * Habilidades cuyo texto es "al recibir daño igual o superior a la mitad de
 * tus PG actuales, tira 1d4 y en 3 o 4 se reduce a la mitad" (Robustez). Solo
 * tiene un miembro hoy, pero sigue el mismo patrón de conjunto que
 * FULL_HP_HALF_DAMAGE_ABILITIES por si el catálogo suma alguna más adelante.
 */
export const STURDY_HALF_DAMAGE_ABILITIES = new Set(["sturdy"]);

/**
 * Habilidad → lista de estados propios (mismos ids que POKEMON_STATUS_EFFECTS
 * en status-effects.mjs) que activan un bono de daño igual a la competencia
 * mientras el Pokémon los sufre.
 */
export const SELF_STATUS_DAMAGE_BOOST_ABILITIES = Object.freeze({
  competitive: ["poisoned", "badly-poisoned", "burned", "confused", "paralyzed"],
  "flare-boost": ["burned"]
});

/**
 * Bono de daño (competencia, o 0) que aportan las habilidades conocidas de
 * un Pokémon según su propio estado alterado actual (`activeConditions`,
 * p.ej. `instance.conditions`). No es acumulable: si por lo que sea el
 * Pokémon conociera dos habilidades de la tabla a la vez y ambas coincidieran
 * con un estado activo, el bono se suma una sola vez — de ahí el `some` en
 * vez de un `reduce` que las sumara todas.
 */
export function abilitySelfStatusDamageBonus(abilities = [], activeConditions = [], proficiency = 0) {
  const known = abilities ?? [];
  const conditions = activeConditions ?? [];
  const applies = known.some(id => (SELF_STATUS_DAMAGE_BOOST_ABILITIES[id] ?? []).some(status => conditions.includes(status)));
  return applies ? proficiency : 0;
}

/** Estados propios cuya desventaja/reducción anula Vigor (`guts`). */
export const GUTS_IGNORED_STATUSES = new Set(["poisoned", "badly-poisoned", "burned"]);

/**
 * True si el Pokémon conoce Vigor (`guts`): sigue sufriendo el daño
 * periódico de fin de turno de Envenenado/Quemado, pero no la desventaja en
 * ataque ni la tirada doble-quedarse-con-la-menor de daño que normalmente
 * acompañan a esos estados. Lo consulta #rollMove() (pokemon-sheet.mjs).
 */
export function abilityIgnoresStatusPenalty(abilities = []) {
  return (abilities ?? []).includes("guts");
}

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
