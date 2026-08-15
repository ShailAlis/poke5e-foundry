/**
 * Reglas de experiencia y evolución de los Pokémon. Módulo puro y sin
 * dependencias, verificado por validate-progression.mjs.
 *
 * Lo consumen model.mjs (experiencia inicial), pokemon-sheet.mjs (barra de PX y
 * evolución guiada), trainer-team.mjs y trainer-actor-sheet.mjs (progreso),
 * capture.mjs y los generadores de encuentros (recompensa por derrota).
 */

/** Experiencia acumulada necesaria para cada nivel, del 1 al 20. */
export const EXPERIENCE_BY_LEVEL = Object.freeze([
  0, 200, 800, 2000, 6000, 12000, 20000, 30000, 44000, 62000,
  82000, 104000, 128000, 158000, 194000, 234000, 278000, 326000, 382000, 450000
]);

/**
 * Umbral de experiencia de un nivel, acotando la entrada al rango 1-20.
 * Consulta base de EXPERIENCE_BY_LEVEL para el resto del archivo y para la
 * experiencia inicial que fija model.mjs.
 */
export function experienceAtLevel(level) {
  const normalized = Math.max(1, Math.min(20, Math.trunc(Number(level) || 1)));
  return EXPERIENCE_BY_LEVEL[normalized - 1];
}

/**
 * Eleva la experiencia guardada hasta el umbral de su nivel, de modo que un
 * Pokémon subido de nivel a mano nunca muestre un progreso negativo.
 * La usa experienceProgress().
 */
export function normalizedExperience(experience, level) {
  return Math.max(Math.trunc(Number(experience) || 0), experienceAtLevel(level));
}

/**
 * Nivel que corresponde a una cantidad de experiencia. Operación inversa de
 * experienceAtLevel(); pokemon-sheet.mjs la usa para subir de nivel al sumar PX.
 */
export function levelForExperience(experience) {
  const value = Math.max(0, Math.trunc(Number(experience) || 0));
  let level = 1;
  for (let index = 1; index < EXPERIENCE_BY_LEVEL.length; index++) {
    if (value < EXPERIENCE_BY_LEVEL[index]) break;
    level = index + 1;
  }
  return level;
}

/**
 * Resume el avance dentro del nivel actual (total, umbrales, ganado, restante,
 * porcentaje y si ya está al máximo) para pintar la barra de PX.
 * La usan pokemon-sheet.mjs, trainer-team.mjs y trainer-actor-sheet.mjs.
 */
export function experienceProgress(experience, level) {
  const currentLevel = Math.max(1, Math.min(20, Math.trunc(Number(level) || 1)));
  const total = normalizedExperience(experience, currentLevel);
  const floor = experienceAtLevel(currentLevel);
  const ceiling = currentLevel < 20 ? experienceAtLevel(currentLevel + 1) : floor;
  const span = Math.max(ceiling - floor, 0);
  const gained = span ? Math.max(0, Math.min(total - floor, span)) : 0;
  return {
    total,
    floor,
    ceiling,
    gained,
    span,
    remaining: span ? Math.max(ceiling - total, 0) : 0,
    percent: span ? Math.round((gained / span) * 100) : 100,
    maximumLevel: currentLevel >= 20
  };
}

/**
 * Experiencia que otorga derrotar a un Pokémon (200 × nivel × SR).
 * La usan capture.mjs, encounter-generator.mjs y encounter-builder.mjs para
 * mostrar y repartir la recompensa de un encuentro.
 */
export function experienceAward(level, speciesRating) {
  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(Number(level) || 1)));
  const rating = Math.max(0, Number(speciesRating) || 0);
  return Math.round(200 * normalizedLevel * rating);
}

/**
 * Evalúa una cadena evolutiva: separa las condiciones comprobables por el
 * módulo (nivel, sexo, movimiento conocido o de cierto tipo) de las que decide
 * la mesa, y dice si la evolución está disponible. La usa pokemon-sheet.mjs para
 * habilitar el botón de evolucionar y listar lo que falta.
 */
export function evolutionReadiness(evolution, { level, gender, knownMoveIds = [], movesById = new Map() } = {}) {
  const known = new Set(knownMoveIds);
  const automatic = [];
  const manual = [];
  for (const condition of evolution?.conditions ?? []) {
    let met = true;
    if (condition.type === "level") met = Number(level) >= Number(condition.value);
    else if (condition.type === "gender") met = gender === condition.value;
    else if (condition.type === "move") met = known.has(condition.value);
    else if (condition.type === "move-type") {
      met = [...known].some(id => movesById.get(id)?.type === condition.value);
    } else {
      manual.push(condition);
      continue;
    }
    automatic.push({ condition, met });
  }
  return {
    available: automatic.every(entry => entry.met),
    unmet: automatic.filter(entry => !entry.met).map(entry => entry.condition),
    manual
  };
}
