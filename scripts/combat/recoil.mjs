/**
 * Retroceso proporcional al daño infligido en el propio golpe (a diferencia
 * del retroceso de dosis fija que ya gestiona ongoing-effects.mjs para
 * Maldición). pokemon-sheet.mjs consulta esta tabla tras resolver el daño de
 * un ataque cuerpo a cuerpo con impacto confirmado y descuenta el resultado
 * de los PG del propio usuario.
 */
export const RECOIL_FRACTION_MOVES = Object.freeze({
  "head-charge": 0.25,
  "head-smash": 0.5
});

/**
 * Familia de drenaje: cura al usuario una fracción del daño infligido, la
 * misma matemática que el retroceso (recoilAmount) pero aplicada como
 * curación en vez de daño propio. Parabólica limita además la curación a 5×
 * nivel, igual que Golpe Metálico; ese tope se aplica aparte en pokemon-sheet.mjs.
 */
export const DRAIN_FRACTION_MOVES = Object.freeze({
  absorb: 0.5,
  "bitter-blade": 0.5,
  "drain-punch": 0.5,
  "draining-kiss": 0.5,
  "giga-drain": 0.5,
  "horn-leech": 0.5,
  "leech-life": 0.5,
  "mega-drain": 0.5,
  "oblivion-wing": 1,
  "parabolic-charge": 0.5
});

/** Retroceso o drenaje típeless redondeado hacia abajo, como especifica el texto original. */
export function recoilAmount(damageTotal, fraction) {
  return Math.max(0, Math.floor((Number(damageTotal) || 0) * (Number(fraction) || 0)));
}
