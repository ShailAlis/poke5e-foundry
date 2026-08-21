/**
 * Movimientos de golpes múltiples: dos variantes distintas del mismo tema.
 *
 * "Cadena" (Taladradora, Puas de Hielo, Bomba Semilla...): una sola tirada de
 * ataque decide impacto o fallo; si impacta, se tira 1d4 y se continúa
 * golpeando mientras salga 3 o 4, hasta 4 golpes adicionales. Cada golpe extra
 * usa solo los dados de daño del movimiento (sin repetir el modificador
 * MOVE), tal como describe el texto original.
 *
 * "Escalada consecutiva" (Bola de Hielo, Rodada, Enfado): cada uso consecutivo
 * que impacta dobla los dados de daño respecto al primero, hasta un tope, y se
 * reinicia al fallar o quedar incapacitado. pokemon-sheet.mjs reutiliza el
 * motor de pilas de move-modifiers.mjs (una entrada de acumulación sin
 * modificadores numéricos, solo un contador) para llevar la cuenta entre
 * turnos y aquí solo se calcula el multiplicador de dados que corresponde.
 */

/** Movimientos de golpes en cadena: una tirada de ataque, extensión por 1d4, con su tope de golpes extra. */
export const CHAIN_MULTI_HIT_MOVES = Object.freeze({
  "arm-thrust": 4, "bone-rush": 4, "bullet-seed": 4, "comet-punch": 4, "double-slap": 4,
  "fury-attack": 4, "fury-swipes": 4, "icicle-spear": 4, "pin-missile": 4, "rock-blast": 4,
  "spike-cannon": 4, "tail-slap": 4, "water-shuriken": 4,
  thrash: 2
});

/** Movimientos de escalada consecutiva y su tope de duplicaciones. */
export const CONSECUTIVE_ESCALATION_MOVES = Object.freeze({
  "ice-ball": { maxStacks: 3 },
  rollout: { maxStacks: 4 },
  outrage: { maxStacks: 2, automatic: true }
});

/**
 * Golpes fijos (Bonemerang, Burbuja, Bomba Demográfica...): a diferencia de
 * la cadena de arriba, cada golpe tira su propio ataque Y su propio daño con
 * el modificador MOVE completo (el texto dice "on each successful hit, do
 * X + MOVE", no solo dados extra). #rollFixedMultiAttack() en
 * pokemon-sheet.mjs resuelve el bucle.
 */
export const FIXED_MULTI_ATTACK_MOVES = Object.freeze({
  bonemerang: 2,
  bubble: 3,
  "gear-grind": 2,
  "origin-pulse": 3,
  "population-bomb": 10,
  "precipice-blades": 3
});

/** Golpes fijos que se detienen en cuanto uno falla (Ola Trompa, Triple Patada). */
export const STOP_ON_MISS_MOVES = Object.freeze(new Set(["triple-axel", "triple-kick"]));

/** Golpe Rápido: el número de proyectiles depende del nivel, no de la tabla de dados. */
export function swiftProjectileCount(level) {
  const lvl = Number(level) || 1;
  if (lvl >= 17) return 6;
  if (lvl >= 10) return 5;
  if (lvl >= 5) return 4;
  return 2;
}

/** Un resultado de 1d4 de 3 o 4 permite continuar la cadena de golpes. */
export function continuesChain(value) {
  return Number(value) === 3 || Number(value) === 4;
}

/**
 * Cuenta los golpes adicionales confirmados de una cadena ya tirada: recorre
 * los resultados de 1d4 en orden y se detiene en el primero que no siga la
 * cadena, con el tope de golpes extra que corresponda al movimiento (4 por
 * defecto; Enfado limita a 2, ver CHAIN_MULTI_HIT_MOVES).
 */
export function resolveChainHits(rolls = [], maxExtra = 4) {
  let extra = 0;
  for (const value of rolls) {
    if (!continuesChain(value)) break;
    extra += 1;
    if (extra >= maxExtra) break;
  }
  return extra;
}

/** Multiplicador de dados para N duplicaciones consecutivas (1, 2, 4, 8...). */
export function diceMultiplierForStacks(stacks) {
  return 2 ** Math.max(0, Number(stacks) || 0);
}

/**
 * Multiplica el número de dados de una expresión simple "NdM" (p. ej. "2d6"
 * ×2 → "4d6"). Admite multiplicadores fraccionarios (p. ej. ×0.5 para Chorro
 * de Agua por debajo de la mitad de PG) redondeando al entero más cercano,
 * sin bajar nunca de 1 dado.
 */
export function scaleDiceCount(expression, multiplier) {
  const match = String(expression).match(/^(\d+)d(\d+)$/);
  if (!match) return expression;
  const [, count, sides] = match;
  return `${Math.max(1, Math.round(Number(count) * (Number(multiplier) || 1)))}d${sides}`;
}

/** Añade un dado más (no lo duplica) a una expresión simple "NdM" (Bengala Cansada tras fallar su último ataque). */
export function addExtraDie(expression) {
  const match = String(expression).match(/^(\d+)d(\d+)$/);
  if (!match) return expression;
  const [, count, sides] = match;
  return `${Number(count) + 1}d${sides}`;
}
