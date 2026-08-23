/**
 * Reglas de los concursos Pokémon: categorías, compatibilidad de los
 * movimientos y puntuación de una prueba de Appeal. Módulo puro sin
 * dependencias, verificado por validate-contests.mjs y consumido por el modo
 * Concurso de pokemon-sheet.mjs. Los datos vienen de `contest.json` y
 * `contest-effects.json`, que data-service.mjs adjunta a cada movimiento.
 */

/** Las cinco categorías de concurso, con su icono y sus categorías vecinas. */
export const CONTEST_TYPES = {
  cool: { label: "Carisma", icon: "fa-fire", complementary: ["beauty", "tough"] },
  beauty: { label: "Belleza", icon: "fa-gem", complementary: ["cool", "cute"] },
  cute: { label: "Dulzura", icon: "fa-heart", complementary: ["beauty", "clever"] },
  clever: { label: "Ingenio", icon: "fa-lightbulb", complementary: ["cute", "tough"] },
  tough: { label: "Dureza", icon: "fa-dumbbell", complementary: ["clever", "cool"] }
};

/**
 * Categoría sugerida para cada tipo Pokémon, usada por contestDetailsForMove()
 * cuando un movimiento no tiene datos de concurso en las reglas originales.
 */
const MOVE_TYPE_DEFAULTS = {
  normal: "cool", flying: "cool", rock: "cool", bug: "cool",
  ghost: "beauty", steel: "beauty", electric: "beauty", ice: "beauty",
  water: "cute", grass: "cute", fairy: "cute",
  poison: "clever", fire: "clever", psychic: "clever", dark: "clever",
  fighting: "tough", ground: "tough", dragon: "tough"
};

/**
 * Datos de concurso de un movimiento (categoría, Appeal, Jam y efecto). Si el
 * movimiento no está definido en las reglas, deduce la categoría con
 * MOVE_TYPE_DEFAULTS y lo marca con `fallback: true` para que la ficha lo
 * presente como sugerencia. Entrada de contestCompatibility().
 */
export function contestDetailsForMove(move, effectsById = new Map()) {
  const defined = move?.contest;
  const contest = CONTEST_TYPES[defined?.contest] ? defined.contest : (MOVE_TYPE_DEFAULTS[move?.type] ?? "cute");
  const effectId = String(defined?.effect?.id ?? defined?.effect ?? "23");
  const effect = typeof defined?.effect === "object"
    ? defined.effect
    : effectsById.get(effectId) ?? { id: effectId, name: "Un movimiento bastante vistoso.", effect: "Es uno de los favoritos del público. No tiene efectos adicionales." };
  return {
    contest,
    label: CONTEST_TYPES[contest].label,
    icon: CONTEST_TYPES[contest].icon,
    appeal: Math.max(0, Number(defined?.appeal ?? 4) || 0),
    jam: Math.max(0, Number(defined?.jam ?? 0) || 0),
    effect,
    fallback: !defined
  };
}

/**
 * Compara la categoría del concurso con la del movimiento y devuelve
 * compatible, complementario o incompatible según CONTEST_TYPES.
 * Su resultado decide la puntuación en contestAppealOutcome().
 */
export function contestCompatibility(contestType, moveContestType) {
  if (contestType === moveContestType) return { id: "compatible", label: "Compatible" };
  if (CONTEST_TYPES[contestType]?.complementary.includes(moveContestType)) return { id: "complementary", label: "Complementario" };
  return { id: "incompatible", label: "Incompatible" };
}

/**
 * Resuelve una prueba de Appeal contra la CD del juez: cruza la compatibilidad
 * de contestCompatibility() con el resultado de la tirada (éxito, crítico o
 * pifia) y devuelve los puntos obtenidos y la reacción del público.
 * La llama pokemon-sheet.mjs tras evaluar la tirada.
 */
export function contestAppealOutcome({ compatibility, appeal, natural, total, dc }) {
  const success = Number(total) >= Number(dc);
  const critical = Number(natural) === 20;
  const fumble = Number(natural) === 1;
  let points = 0;
  let crowd = 0;
  if (compatibility === "compatible") {
    if (critical) { points = appeal * 2; crowd = 1; }
    else if (fumble) points = 0;
    else if (success) { points = appeal; crowd = 1; }
    else points = Math.ceil(appeal / 2);
  } else if (compatibility === "complementary") {
    if (fumble) { points = -appeal; crowd = -1; }
    else if (success) points = appeal;
    else crowd = -1;
  } else {
    points = success ? 0 : -appeal;
    crowd = -1;
  }
  return { success, critical, fumble, points, crowd };
}

/**
 * Aplana CONTEST_TYPES en un mapa id → etiqueta para el desplegable de
 * categoría de la ficha Pokémon.
 */
export function contestTypeOptions() {
  return Object.fromEntries(Object.entries(CONTEST_TYPES).map(([id, entry]) => [id, entry.label]));
}
