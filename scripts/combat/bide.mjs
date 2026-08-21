/**
 * Onda Choque (Bide): el único movimiento que exige rastrear el daño recibido
 * durante un turno para devolverlo doblado en el siguiente. pokemon-sheet.mjs
 * resuelve las dos fases (empezar a acumular / liberar el golpe) directamente
 * en #rollMove(); este archivo aporta solo la parte pura y el enganche que
 * detecta la pérdida de PG del usuario mientras acumula.
 */
import { MODULE_ID } from "../core/model.mjs";

/** Suma un nuevo golpe recibido al total acumulado mientras se mantiene Bide. */
export function accumulateBideDamage(current, amount) {
  return Math.max(0, Number(current) || 0) + Math.max(0, Number(amount) || 0);
}

/** El golpe de liberación inflige el doble típeless de lo acumulado. */
export function releaseBideDamage(tracked) {
  return Math.max(0, Number(tracked) || 0) * 2;
}

/**
 * Detecta la pérdida de PG del usuario mientras mantiene Bide activo y la
 * acumula en el Item del Pokémon (instance.bideDamage). Se registra una sola
 * vez desde main.mjs, junto al resto de motores de movimiento.
 */
/**
 * Registra la pérdida de PG mientras Onda Choque o Golpe Metálico (metal-burst)
 * estén acumulando: ambos guardan su total en un campo propio de `instance`
 * (bideDamage / metalBurstDamage) con la misma fórmula de acumulación.
 */
export function registerBideTracking() {
  Hooks.on("preUpdateActor", (actor, changes) => {
    const pendingHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
    const currentHp = Number(actor.system.attributes?.hp?.value);
    if (pendingHp == null || !Number.isFinite(currentHp) || Number(pendingHp) >= currentHp) return;
    const lost = currentHp - Number(pendingHp);
    setTimeout(() => recordTrackedDamage(actor, lost).catch(error => console.error(`${MODULE_ID} | Reactive damage tracking failed`, error)), 0);
  });
}

async function recordTrackedDamage(actor, lost) {
  const pokemonItem = await pokemonItemForActor(actor);
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  if (!instance?.bideTracking && !instance?.metalBurstTracking) return;
  const next = foundry.utils.deepClone(instance);
  if (next.bideTracking) next.bideDamage = accumulateBideDamage(instance.bideDamage, lost);
  if (next.metalBurstTracking) next.metalBurstDamage = accumulateBideDamage(instance.metalBurstDamage, lost);
  await pokemonItem.setFlag(MODULE_ID, "instance", next);
}

async function pokemonItemForActor(actor) {
  const uuid = actor?.getFlag(MODULE_ID, "pokemonItemUuid");
  if (uuid) return fromUuid(uuid);
  return actor?.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? null;
}
