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
 */
import { MODULE_ID } from "../core/model.mjs";

/**
 * Movimientos que anulan por completo el siguiente golpe recibido. Incluye
 * Protección/Detectar/Guardia Rápida/Búnker Dañino simplificados: el texto
 * original exige tirar más de 15 en 1d20 a partir del segundo uso en el mismo
 * combate (y Guardia Rápida solo protege en el primer turno de la primera
 * ronda) — esta dificultad creciente y esa restricción de turno no se
 * rastrean, igual que este proyecto ya no comprueba si Escudo Real es
 * exclusivamente contra daño físico. Se resuelve como anulación total cada vez.
 */
export const FULL_NEGATION_MOVES = new Set(["kings-shield", "obstruct", "spiky-shield", "silk-trap", "mat-block", "protect", "detect", "baneful-bunker", "quick-guard"]);
/** Movimientos que reducen a la mitad el siguiente golpe recibido. */
export const HALF_NEGATION_MOVES = new Set(["light-screen", "wide-guard"]);
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

/** Registra el recorte de daño mientras un escudo esté preparado. Lo arranca main.mjs. */
export function registerDamageShields() {
  Hooks.on("preUpdateActor", (actor, changes) => {
    const pendingHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
    const shield = actor.getFlag(MODULE_ID, SHIELD_FLAG);
    if (pendingHp == null || !shield) return;
    const currentHp = Number(actor.system.attributes?.hp?.value);
    if (!Number.isFinite(currentHp) || Number(pendingHp) >= currentHp) return;
    const clamped = shieldedDamage(pendingHp, currentHp, shield.mode);
    foundry.utils.setProperty(changes, "system.attributes.hp.value", clamped);
    foundry.utils.setProperty(changes, `flags.${MODULE_ID}.-=${SHIELD_FLAG}`, null);
  });
}
