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

/** Niveles en los que un Pokémon obtiene una mejora de característica. */
export const POKEMON_ASI_LEVELS = Object.freeze([4, 8, 12, 16, 20]);
/** Niveles que abren un nuevo tramo de movimientos naturales. */
export const POKEMON_MOVE_LEVELS = Object.freeze([2, 6, 10, 14, 18]);
/** Niveles en los que las fórmulas de los movimientos aumentan su daño. */
export const POKEMON_DAMAGE_LEVELS = Object.freeze([5, 10, 17]);

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
 * Número de etapas de la línea evolutiva a la que pertenece una especie.
 * Recorre el grafo completo desde todas sus raíces y devuelve la ruta dirigida
 * más larga que contenga la especie. Las bifurcaciones (por ejemplo Eevee) no
 * suman entre sí. El resultado siempre está entre una y tres etapas, que son
 * las tres categorías que usan las reglas de mejora de característica.
 */
export function evolutionStageCount(speciesId, evolutions = []) {
  const edges = new Map();
  const reverse = new Map();
  for (const evolution of evolutions) {
    if (!evolution?.from || !evolution?.to) continue;
    const targets = edges.get(evolution.from) ?? [];
    targets.push(evolution.to);
    edges.set(evolution.from, targets);
    const sources = reverse.get(evolution.to) ?? [];
    sources.push(evolution.from);
    reverse.set(evolution.to, sources);
  }
  const component = new Set([speciesId]);
  const queue = [speciesId];
  while (queue.length) {
    const current = queue.shift();
    for (const adjacent of [...(edges.get(current) ?? []), ...(reverse.get(current) ?? [])]) {
      if (component.has(adjacent)) continue;
      component.add(adjacent);
      queue.push(adjacent);
    }
  }
  const roots = [...component].filter(id => !(reverse.get(id) ?? []).some(source => component.has(source)));
  const longest = (id, visited = new Set()) => {
    if (visited.has(id)) return 0;
    const nextVisited = new Set(visited).add(id);
    const children = (edges.get(id) ?? []).filter(target => component.has(target));
    return 1 + Math.max(0, ...children.map(target => longest(target, nextVisited)));
  };
  return Math.max(1, Math.min(3, ...((roots.length ? roots : [speciesId]).map(root => longest(root)))));
}

/** Puntos que concede cada mejora Pokémon según las etapas de su línea. */
export function pokemonAsiPoints(stageCount) {
  const stages = Math.max(1, Math.min(3, Math.trunc(Number(stageCount) || 1)));
  return stages === 1 ? 4 : stages === 2 ? 3 : 2;
}

/**
 * Resume todos los avances pendientes entre dos niveles. Esta función pura es
 * la fuente de verdad del diálogo de subida: PG en cada nivel, mejoras de
 * característica, nuevos tramos de movimientos, aumentos de daño y Poder Máximo.
 */
export function pokemonAdvancementsBetween(previousLevel, currentLevel, { stageCount = 1, speciesRating = 0 } = {}) {
  const from = Math.max(1, Math.min(20, Math.trunc(Number(previousLevel) || 1)));
  const to = Math.max(from, Math.min(20, Math.trunc(Number(currentLevel) || from)));
  const levels = Array.from({ length: to - from }, (_, index) => from + index + 1);
  const asi = levels.filter(level => POKEMON_ASI_LEVELS.includes(level)).map(level => ({
    level,
    points: pokemonAsiPoints(stageCount),
    cap: level === 20 ? (Number(speciesRating) >= 15 ? 30 : 22) : 20,
    peakPower: level === 20
  }));
  return {
    from,
    to,
    levels,
    hitPointLevels: levels.length,
    asi,
    abilityPoints: asi.reduce((total, entry) => total + entry.points, 0),
    featPointLimit: asi.length * 2,
    moveReplacements: levels.length,
    moveLevels: levels.filter(level => POKEMON_MOVE_LEVELS.includes(level)),
    damageLevels: levels.filter(level => POKEMON_DAMAGE_LEVELS.includes(level)),
    peakPower: levels.includes(20)
  };
}

/**
 * Valida y aplica una asignación de puntos de característica Pokémon sobre
 * una copia del bloque recibido. Los puntos reservados para dotes cuentan como
 * gastados y no pueden superar dos por mejora obtenida.
 */
export function applyPokemonAbilityAdvancement(attributes, allocation, advancement, featPoints = 0) {
  const result = { ...(attributes ?? {}) };
  const awards = advancement?.asi ?? [];
  const expected = awards.reduce((total, entry) => total + Number(entry.points || 0), 0);
  const feat = Math.max(0, Math.trunc(Number(featPoints) || 0));
  if (feat % 2 !== 0 || feat > Number(advancement?.featPointLimit ?? awards.length * 2)) return null;
  const increases = {};
  let allocated = 0;
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    const increase = Math.max(0, Math.trunc(Number(allocation?.[key]) || 0));
    increases[key] = increase;
    allocated += increase;
  }
  if (allocated + feat !== expected) return null;

  const ordinaryPoints = awards.filter(entry => entry.level < 20).reduce((total, entry) => total + entry.points, 0);
  const peakPoints = awards.filter(entry => entry.level === 20).reduce((total, entry) => total + entry.points, 0);
  let pointsAboveTwenty = 0;
  const peakCap = awards.find(entry => entry.level === 20)?.cap ?? 20;
  for (const [key, increase] of Object.entries(increases)) {
    const current = Number(result[key]) || 10;
    const next = current + increase;
    if (increase > 0 && next > peakCap) return null;
    pointsAboveTwenty += Math.max(0, next - Math.max(current, 20));
    result[key] = next;
  }
  if (pointsAboveTwenty > peakPoints || allocated - pointsAboveTwenty > ordinaryPoints + Math.max(0, peakPoints - pointsAboveTwenty)) return null;
  return { attributes: result, increases, featPoints: feat };
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
