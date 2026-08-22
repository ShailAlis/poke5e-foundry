/**
 * Escudos de reacción (Escudo Real, Pantalla de Luz, Trampa Sedosa...): el
 * jugador los activa como movimiento normal cuando espera un golpe (misma
 * convención que el resto de "reacciones" de esta ficha, que el jugador
 * dispara manualmente en el momento adecuado en vez de que el sistema
 * interrumpa la tirada de otro actor). El escudo queda preparado como una
 * bandera temporal; como el daño se aplica más tarde por el botón de D&D 5e
 * (no por este módulo), se intercepta con el mismo patrón `preUpdateActor`
 * que usa hp-effects.mjs para Falso Tortazo: recorta o anula el golpe antes
 * de guardarlo y consume la bandera de un solo uso.
 *
 * Lote 9 (agosto de 2026): además de los escudos armados a mano, este mismo
 * hook recorta el golpe cuando el defensor conoce Multiescama/Escudo Sombra
 * o Robustez (FULL_HP_HALF_DAMAGE_ABILITIES/STURDY_HALF_DAMAGE_ABILITIES,
 * catalogadas en pokemon-abilities.mjs, que no depende de este archivo, así
 * que importarlas aquí no crea un ciclo). Se resuelve en el mismo hook en
 * vez de registrar uno nuevo para que solo un `preUpdateActor` toque
 * `system.attributes.hp.value` a la vez — ver la cabecera de
 * pokemon-abilities.mjs para el motivo completo. Las habilidades se leen del
 * flag `pokemonAbilities` (deployment.mjs / wild-deployment.mjs) porque el
 * hook es síncrono y no puede esperar a resolver el Item Pokémon.
 */
import { MODULE_ID } from "../core/model.mjs";
import { FULL_HP_HALF_DAMAGE_ABILITIES, STURDY_HALF_DAMAGE_ABILITIES } from "../pokemon/pokemon-abilities.mjs";

/**
 * Movimientos que anulan por completo el siguiente golpe recibido. Incluye
 * Protección/Detectar/Guardia Rápida/Búnker Dañino simplificados: el texto
 * original exige tirar más de 15 en 1d20 a partir del segundo uso en el mismo
 * combate (y Guardia Rápida solo protege en el primer turno de la primera
 * ronda) — esta dificultad creciente y esa restricción de turno no se
 * rastrean, igual que este proyecto ya no comprueba si Escudo Real es
 * exclusivamente contra daño físico. Se resuelve como anulación total cada vez.
 */
// "sabotage" no es un movimiento: es Sabotaje (Grunt 2), la reacción de
// Camino de Entrenador que arma #armSabotage() en pokemon-sheet.mjs al gastar
// un Punto de Sombra. El texto original deja elegir cuántos puntos gastar
// según lo que haga falta reducir; aquí se simplifica a un coste fijo de 1
// punto por anulación completa, igual que el resto de esta lista ya
// simplifica su dificultad creciente.
export const FULL_NEGATION_MOVES = new Set(["kings-shield", "obstruct", "spiky-shield", "silk-trap", "mat-block", "protect", "detect", "baneful-bunker", "quick-guard", "sabotage"]);
/**
 * Movimientos que reducen a la mitad el siguiente golpe recibido. "shadow-dodge"
 * tampoco es un movimiento: es Esquiva siniestra (Grunt 9), armada desde
 * #armSabotage()-style en pokemon-sheet.mjs al gastar 4 Puntos de Sombra. El
 * texto original mejora un grado la resistencia al tipo del golpe concreto
 * (vulnerable→normal, normal→resistente...); sin rastrear qué tipo trae cada
 * golpe entrante en el momento de aplicar el escudo, se simplifica a reducir
 * a la mitad cualquier golpe, igual que Pantalla de Luz/Guardia Amplia.
 */
export const HALF_NEGATION_MOVES = new Set(["light-screen", "wide-guard", "shadow-dodge"]);
/** Aguante: nunca reduce a 0 PG el siguiente golpe recibido, lo deja en 1. */
export const SURVIVE_MOVES = new Set(["endure"]);

const SHIELD_FLAG = "damageShield";

/** Resultado recortado por el escudo: total si lo anula, mitad (redondeo hacia arriba) si lo reduce, o 1 PG si sobrevive. */
export function shieldedDamage(pendingHp, currentHp, mode) {
  const drop = Math.max(0, Number(currentHp) - Number(pendingHp));
  if (!drop) return Number(pendingHp);
  if (mode === "survive") return Number(pendingHp) <= 0 && Number(currentHp) > 0 ? 1 : Number(pendingHp);
  const reduced = mode === "half" ? Math.ceil(drop / 2) : 0;
  return Number(currentHp) - reduced;
}

/** Prepara el escudo de un movimiento antes de que llegue el golpe que va a recortar. */
export async function armDamageShield(actor, moveId) {
  const mode = FULL_NEGATION_MOVES.has(moveId) ? "full" : HALF_NEGATION_MOVES.has(moveId) ? "half" : SURVIVE_MOVES.has(moveId) ? "survive" : null;
  if (!mode || !actor) return;
  await actor.setFlag(MODULE_ID, SHIELD_FLAG, { mode, moveId });
}

/**
 * Decide si una habilidad automática (sin escudo armado a mano) reduce un
 * golpe a la mitad. Extraída como función pura, sin tocar `changes` ni tirar
 * dados por su cuenta, para poder testearla en validate-damage-shields.mjs
 * sin montar un hook de Foundry falso: `sturdyRoll` es el resultado de 1d4
 * ya resuelto (quien llame decide cómo tirarlo), no algo que esta función
 * calcule. `pendingHp`/`currentHp` son los PG antes y después del golpe (sin
 * recortar todavía); `maxHp` son los PG máximos del Pokémon.
 */
export function abilityAutoHalvesDamage(abilities, { pendingHp, currentHp, maxHp, sturdyRoll } = {}) {
  const known = abilities ?? [];
  const hp = Number(currentHp);
  const drop = Math.max(0, hp - Number(pendingHp));
  if (!drop || !Number.isFinite(hp) || hp <= 0) return false;
  if (known.some(id => FULL_HP_HALF_DAMAGE_ABILITIES.has(id)) && Number.isFinite(Number(maxHp)) && hp === Number(maxHp)) {
    return true;
  }
  if (known.includes("tera-shell") && Number.isFinite(Number(maxHp)) && hp === Number(maxHp)) return true;
  if (known.some(id => STURDY_HALF_DAMAGE_ABILITIES.has(id)) && drop >= hp / 2) {
    return Number(sturdyRoll) === 3 || Number(sturdyRoll) === 4;
  }
  return false;
}

/**
 * Registra el recorte de daño mientras un escudo esté preparado, y el de las
 * habilidades automáticas de Multiescama/Escudo Sombra/Robustez (lote 9).
 * Orden: primero el escudo armado a mano (si lo hay) sobre el golpe
 * original —es una acción deliberada del jugador que consume un recurso, así
 * que se resuelve siempre igual que antes— y, si tras eso sigue habiendo
 * daño real, la reducción automática de habilidad sobre lo que quede. Así un
 * Multiescama con Protección activo primero anula el golpe entero (el
 * escudo) y la habilidad no tiene ya nada que recortar, en vez de que el
 * orden inverso deje una reducción de habilidad "consumida" sin que el golpe
 * llegara a doler.
 *
 * Las habilidades se leen de `actor.getFlag(MODULE_ID, "pokemonAbilities")`
 * (deployment.mjs / wild-deployment.mjs) en vez del Item Pokémon: este hook
 * es síncrono (Foundry no espera una promesa de `preUpdateActor`) y el Item
 * solo se puede leer con `fromUuid()`, que es asíncrono.
 *
 * La tirada de Robustez usa `Math.random()` en vez de `new Roll("1d4")`:
 * dentro de un hook síncrono no se puede `await` una Roll de Foundry de forma
 * fiable, y este archivo no publica mensajes de chat en ningún otro punto
 * (los escudos armados a mano tampoco lo hacen), así que la tirada de
 * Robustez queda igual de silenciosa y sin registro en el chat.
 */
export function registerDamageShields() {
  Hooks.on("preUpdateActor", (actor, changes) => {
    let pendingHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
    if (pendingHp == null) return;
    const currentHp = Number(actor.system.attributes?.hp?.value);
    if (!Number.isFinite(currentHp) || Number(pendingHp) >= currentHp) return;

    const shield = actor.getFlag(MODULE_ID, SHIELD_FLAG);
    if (shield) {
      pendingHp = shieldedDamage(pendingHp, currentHp, shield.mode);
      foundry.utils.setProperty(changes, `flags.${MODULE_ID}.-=${SHIELD_FLAG}`, null);
    }

    if (Number(pendingHp) < currentHp) {
      const abilities = actor.getFlag(MODULE_ID, "pokemonAbilities") ?? [];
      const maxHp = actor.system.attributes?.hp?.max;
      const sturdyRoll = Math.floor(Math.random() * 4) + 1;
      if (abilityAutoHalvesDamage(abilities, { pendingHp, currentHp, maxHp, sturdyRoll })) {
        pendingHp = shieldedDamage(pendingHp, currentHp, "half");
      }
    }

    foundry.utils.setProperty(changes, "system.attributes.hp.value", pendingHp);
  });
}
