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

/** Movimientos de golpes en cadena: una tirada de ataque, extensión por 1d4. */
export const CHAIN_MULTI_HIT_MOVES = Object.freeze(new Set([
  "arm-thrust", "bone-rush", "bullet-seed", "comet-punch", "double-slap",
  "fury-attack", "fury-swipes", "icicle-spear", "pin-missile", "rock-blast",
  "spike-cannon", "tail-slap", "water-shuriken"
]));

/** Movimientos de escalada consecutiva y su tope de duplicaciones. */
export const CONSECUTIVE_ESCALATION_MOVES = Object.freeze({
  "ice-ball": { maxStacks: 3 },
  rollout: { maxStacks: 4 },
  outrage: { maxStacks: 2, automatic: true }
});

/** Un resultado de 1d4 de 3 o 4 permite continuar la cadena de golpes. */
export function continuesChain(value) {
  return Number(value) === 3 || Number(value) === 4;
}

/**
 * Cuenta los golpes adicionales confirmados de una cadena ya tirada: recorre
 * los resultados de 1d4 en orden y se detiene en el primero que no siga la
 * cadena, con un máximo de 4 golpes extra (aunque sobren tiradas en la lista).
 */
export function resolveChainHits(rolls = []) {
  let extra = 0;
  for (const value of rolls) {
    if (!continuesChain(value)) break;
    extra += 1;
    if (extra >= 4) break;
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
