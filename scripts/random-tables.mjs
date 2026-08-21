/**
 * Movimientos cuyo propio texto exige tirar en una tabla aleatoria para
 * resolver una parte del efecto (no un modificador temporal ni una cadena de
 * golpes): Poder Oculto (tipo de daño por 1d20), Terremoto Furioso (dados de
 * daño por d100, sin relación con el nivel) y Acupresión (mejora aleatoria por
 * 1d6, gestionada como modificador dinámico en pokemon-sheet.mjs con
 * applyDynamicModifier() de move-modifiers.mjs).
 */

/** Poder Oculto: tabla de 1d20 → tipo de daño. 20 deja elegir a quien tira. */
export const HIDDEN_POWER_TYPES = Object.freeze({
  1: "normal", 2: "fire", 3: "water", 4: "electric", 5: "grass", 6: "ice", 7: "fighting",
  8: "poison", 9: "ground", 10: "flying", 11: "psychic", 12: "bug", 13: "rock", 14: "ghost",
  15: "dragon", 16: "dark", 17: "steel", 18: "fairy", 19: "typeless"
});

/** Devuelve el tipo fijo de la tabla, o null en el 20 (el jugador elige). */
export function hiddenPowerType(roll) {
  return HIDDEN_POWER_TYPES[Number(roll)] ?? null;
}

/** Terremoto Furioso: tabla de d100 → dados de daño, independiente del nivel. */
export const MAGNITUDE_TABLE = Object.freeze([
  { max: 5, dice: "1d4" },
  { max: 15, dice: "1d8" },
  { max: 35, dice: "1d10" },
  { max: 65, dice: "1d12" },
  { max: 85, dice: "2d6" },
  { max: 95, dice: "2d8" },
  { max: 100, dice: "2d12" }
]);

/** Dados de daño de Terremoto Furioso para un resultado de d100 (1-100). */
export function magnitudeDice(roll) {
  const value = Math.min(100, Math.max(1, Number(roll) || 1));
  return MAGNITUDE_TABLE.find(tier => value <= tier.max)?.dice ?? "1d4";
}

/** Acupresión: tabla de 1d6 → modificadores dinámicos (o PG temporales, aparte). */
export const ACUPRESSURE_TABLE = Object.freeze({
  1: { modifiers: { attack: 1 }, description: "+1 a los ataques mientras dure." },
  2: { modifiers: { damage: 2 }, description: "+2 a las tiradas de daño mientras dure." },
  3: { tempHp: 10, description: "+10 PG temporales." },
  4: { modifiers: { saves: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } }, description: "+1 a todas las salvaciones mientras dure." },
  5: { modifiers: { criticalRangeBonus: 1 }, description: "+1 al rango de golpe crítico mientras dure." },
  6: { modifiers: { ac: 1 }, description: "+1 a la CA mientras dure." }
});

/** Entrada de la tabla de Acupresión para un resultado de 1d6 (1-6). */
export function acupressureEffect(roll) {
  return ACUPRESSURE_TABLE[Number(roll)] ?? ACUPRESSURE_TABLE[1];
}
