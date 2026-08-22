/**
 * Auras de habilidad Pokémon: bonos que un Pokémon aporta a sí mismo y a sus
 * aliados cercanos (Batería, Punto de Poder, Espíritu Metálico, Estrella
 * Victoria, Costar, Regalo Flor, Velo Dulce, Velo Flor, Más/Menos —lote 41,
 * plusMinusAttackDamageBonus()—, Garra Trampa/Duotenaz/Imán —lote 43,
 * opponentBlocksVoluntarySwitch()—). A diferencia del
 * resto del motor de habilidades (pokemon-abilities.mjs), esta familia
 * necesita medir distancia entre tokens del lienzo, así que vive en su
 * propio archivo apoyado en `canvas.tokens.placeables` — nada de esto es
 * comprobable desde Node, igual que el resto del código que ya toca el
 * lienzo en este proyecto (chooseWildPosition() en wild-deployment.mjs).
 * "Aliado" se aproxima a "mismo bando" (misma disposición de token) en vez de
 * "mismo entrenador", porque dos Pokémon de distintos entrenadores en el
 * mismo bando de un combate igual también deberían beneficiarse entre sí.
 */
import { MODULE_ID } from "../core/model.mjs";

/** Token en el lienzo de un actor desplegado o salvaje, o null si no está colocado en la escena actual. */
function actorToken(actor) {
  return actor?.getActiveTokens?.(true)?.[0] ?? null;
}

/** Otros tokens del mismo bando que `originToken` dentro de `rangeFeet`, sin contar al propio origen. */
function alliesWithinFeet(originToken, rangeFeet) {
  if (!originToken || !canvas?.tokens?.placeables || !canvas.grid?.size) return [];
  const unitFeet = Number(canvas.grid.distance) || 5;
  return canvas.tokens.placeables.filter(token => {
    if (token === originToken || !token.actor || !token.actor.getFlag) return false;
    if (token.document.disposition !== originToken.document.disposition) return false;
    const dx = token.center.x - originToken.center.x;
    const dy = token.center.y - originToken.center.y;
    const feet = (Math.hypot(dx, dy) / canvas.grid.size) * unitFeet;
    return feet <= rangeFeet;
  });
}

/**
 * Actores aliados (mismo bando) desplegados o salvajes a `rangeFeet` del
 * actor dado, o `[]` si no está colocado en la escena actual. Punto de
 * entrada de esta familia: el resto de funciones parten de la lista de
 * actores que devuelve, no vuelven a tocar el lienzo.
 */
export function nearbyAllyActors(actor, rangeFeet) {
  const origin = actorToken(actor);
  if (!origin) return [];
  return alliesWithinFeet(origin, rangeFeet).map(token => token.actor).filter(Boolean);
}

/** Cualquier otro Pokémon de la escena dentro del alcance, sin filtrar bando. */
export function nearbyPokemonActors(actor, rangeFeet) {
  const origin = actorToken(actor);
  if (!origin || !canvas?.tokens?.placeables || !canvas.grid?.size) return [];
  const unitFeet = Number(canvas.grid.distance) || 5;
  return canvas.tokens.placeables.filter(token => {
    if (token === origin || !token.actor?.getFlag) return false;
    const dx = token.center.x - origin.center.x;
    const dy = token.center.y - origin.center.y;
    return (Math.hypot(dx, dy) / canvas.grid.size) * unitFeet <= rangeFeet;
  }).map(token => token.actor);
}

/** Habilidades conocidas (flag síncrono `pokemonAbilities`, lote 9) de un actor. */
function actorAbilities(actor) {
  return actor?.getFlag?.(MODULE_ID, "pokemonAbilities") ?? [];
}

/** Batería: duplica los dados de daño de movimientos eléctricos de los aliados a 20 pies. */
export function batteryDiceMultiplier(nearbyAllies, moveType) {
  if (moveType !== "electric") return 1;
  return nearbyAllies.some(actor => actorAbilities(actor).includes("battery")) ? 2 : 1;
}

/** Punto de Poder: aliados a 15 pies suman 1d6 (1d8 a partir de nivel 10) de daño extra por movimiento. */
export function powerSpotExtraDie(nearbyAllies, level) {
  if (!nearbyAllies.some(actor => actorAbilities(actor).includes("power-spot"))) return null;
  return Number(level) >= 10 ? "1d8" : "1d6";
}

/** Estrella Victoria: +1 a los ataques de los aliados a la vista mientras esté en combate. */
export function victoryStarAttackBonus(nearbyAllies) {
  return nearbyAllies.some(actor => actorAbilities(actor).includes("victory-star")) ? 1 : 0;
}

/**
 * Espíritu Metálico: suma el modificador de CAR de quien la conoce (uno
 * mismo o cada aliado a 30 pies) al daño de movimientos de Acero, hasta 2
 * contribuciones (el texto original limita el apilado a 2, no a un número de
 * fuentes; se aproxima cortando a las dos primeras que aporten algo).
 */
export function steelySpiritDamageBonus({ selfAbilities = [], selfChaMod = 0, nearbyAllies = [], moveType = null } = {}) {
  if (moveType !== "steel") return 0;
  const contributions = [];
  if ((selfAbilities ?? []).includes("steely-spirit")) contributions.push(Number(selfChaMod) || 0);
  for (const actor of nearbyAllies) {
    if (actorAbilities(actor).includes("steely-spirit")) contributions.push(Number(actor.system?.abilities?.cha?.mod) || 0);
  }
  return contributions.slice(0, 2).reduce((sum, mod) => sum + mod, 0);
}

/** Costar: ventaja en los propios ataques si hay CUALQUIER aliado a 5 pies (no exige una habilidad concreta en el aliado). */
export function costarAdvantage(selfAbilities, nearbyAllies) {
  return (selfAbilities ?? []).includes("costar") && nearbyAllies.length > 0;
}

/** Regalo Flor: con sol activo, aliados a 30 pies suman su competencia al daño. */
export function flowerGiftDamageBonus(nearbyAllies, weatherId, proficiency) {
  if (weatherId !== "sun") return 0;
  return nearbyAllies.some(actor => actorAbilities(actor).includes("flower-gift")) ? Number(proficiency) || 0 : 0;
}

/** Velo Dulce: inmune a Dormido si el propio Pokémon o un aliado a 15 pies la conoce. */
export function sweetVeilBlocksSleep(selfAbilities, nearbyAllies) {
  if ((selfAbilities ?? []).includes("sweet-veil")) return true;
  return nearbyAllies.some(actor => actorAbilities(actor).includes("sweet-veil"));
}

/**
 * Velo Flor: inmune a cualquier estado nuevo si el propio Pokémon ES de tipo
 * Planta y él mismo o un aliado a 15 pies conoce Velo Flor. El tipo del
 * protegido se pasa aparte porque esta familia no toca `instance.types`.
 */
export function flowerVeilBlocksStatus(selfAbilities, selfTypes, nearbyAllies) {
  if (!(selfTypes ?? []).includes("grass")) return false;
  if ((selfAbilities ?? []).includes("flower-veil")) return true;
  return nearbyAllies.some(actor => actorAbilities(actor).includes("flower-veil"));
}

/**
 * Más/Menos (lote 41): +2 a los propios ataques y daño si este Pokémon
 * conoce Más o Menos Y un aliado en la misma escena (sin límite de
 * distancia, igual que Estrella Victoria) también conoce Más o Menos.
 */
export function plusMinusAttackDamageBonus(selfAbilities, nearbyAllies) {
  const known = selfAbilities ?? [];
  if (!known.includes("plus") && !known.includes("minus")) return 0;
  const allyPaired = (nearbyAllies ?? []).some(actor => {
    const allyAbilities = actorAbilities(actor);
    return allyAbilities.includes("plus") || allyAbilities.includes("minus");
  });
  return allyPaired ? 2 : 0;
}

/**
 * Aura Oscura/Aura Feérica duplican los dados del tipo correspondiente a
 * 100 pies. Rompeaura invierte el bono y los reduce a la mitad. Las fuentes
 * no se apilan: basta con que exista una aura coincidente.
 */
export function typeAuraDiceMultiplier({ selfAbilities = [], nearbyActors = [], moveType = null } = {}) {
  const all = [selfAbilities, ...(nearbyActors ?? []).map(actorAbilities)];
  const auraId = moveType === "dark" ? "dark-aura" : moveType === "fairy" ? "fairy-aura" : null;
  if (!auraId || !all.some(abilities => abilities.includes(auraId))) return 1;
  return all.some(abilities => abilities.includes("aura-break")) ? 0.5 : 2;
}

/** Néctar Dulce: cualquier tirada de daño a 30 pies recibe un d4, sin acumular. */
export function supersweetSyrupExtraDie(selfAbilities = [], nearbyActors = []) {
  const sources = [selfAbilities, ...(nearbyActors ?? []).map(actorAbilities)];
  return sources.some(abilities => abilities.includes("supersweet-syrup")) ? "1d4" : null;
}

/** Bucle Aire/Aclimatación anulan habilidades dependientes del clima en escena. */
export function weatherAbilitiesSuppressed(selfAbilities = [], nearbyActors = []) {
  return [selfAbilities, ...(nearbyActors ?? []).map(actorAbilities)]
    .some(abilities => abilities.includes("air-lock") || abilities.includes("cloud-nine"));
}

/**
 * Prepotencia/Compañero del Alma (lote 39): true si hay algún oponente (bando
 * distinto, sin límite de distancia) en la escena actual que impida comer
 * bayas. A diferencia del resto de esta familia no es una lista de aliados
 * cercanos sino "cualquier hostil en el combate", así que recorre el lienzo
 * por sí misma en vez de partir de nearbyAllyActors().
 */
export function opponentBlocksBerryEating(actor) {
  const origin = actorToken(actor);
  if (!origin || !canvas?.tokens?.placeables) return false;
  return canvas.tokens.placeables.some(token => {
    if (token === origin || !token.actor) return false;
    if (token.document.disposition === origin.document.disposition) return false;
    const abilities = actorAbilities(token.actor);
    return abilities.includes("unnerve") || abilities.includes("as-one");
  });
}

/** Tokens de bando distinto a `originToken` dentro de `rangeFeet`, o cualquier distancia si `rangeFeet` es null. */
function enemiesWithinFeet(originToken, rangeFeet) {
  if (!originToken || !canvas?.tokens?.placeables) return [];
  return canvas.tokens.placeables.filter(token => {
    if (token === originToken || !token.actor) return false;
    if (token.document.disposition === originToken.document.disposition) return false;
    if (rangeFeet == null) return true;
    if (!canvas.grid?.size) return false;
    const unitFeet = Number(canvas.grid.distance) || 5;
    const dx = token.center.x - originToken.center.x;
    const dy = token.center.y - originToken.center.y;
    const feet = (Math.hypot(dx, dy) / canvas.grid.size) * unitFeet;
    return feet <= rangeFeet;
  });
}

/**
 * Garra Trampa/Duotenaz/Imán (lote 43): true si algún oponente cercano
 * impide a `actor` retirarse voluntariamente del combate. Duotenaz atrapa a
 * cualquiera a 50 pies; Garra Trampa solo a criaturas "a ras de suelo" (se
 * aproxima a "sin Levitar y sin ser de tipo Volador", los únicos dos casos de
 * inmunidad a tierra que ya rastrea este proyecto) a 50 pies; Imán solo
 * atrapa a oponentes de tipo Acero, sin límite de distancia en su texto
 * (mismo "toda la escena" que ya usa opponentBlocksBerryEating() arriba).
 * Los tipos propios se leen del flag síncrono `pokemonTypes`
 * (deployedActorSource()/wildActorSource()), no de `instance`, por la misma
 * razón que el resto de esta familia lee `pokemonAbilities` en vez del Item.
 */
export function opponentBlocksVoluntarySwitch(actor) {
  const origin = actorToken(actor);
  if (!origin) return false;
  const selfAbilities = actorAbilities(actor);
  const selfTypes = actor?.getFlag?.(MODULE_ID, "pokemonTypes") ?? [];
  const groundImmune = selfAbilities.includes("levitate") || selfTypes.includes("flying");
  const trappedNearby = enemiesWithinFeet(origin, 50).some(token => {
    const enemyAbilities = actorAbilities(token.actor);
    return enemyAbilities.includes("shadow-tag") || (enemyAbilities.includes("arena-trap") && !groundImmune);
  });
  if (trappedNearby) return true;
  if (!selfTypes.includes("steel")) return false;
  return enemiesWithinFeet(origin, null).some(token => actorAbilities(token.actor).includes("magnet-pull"));
}
