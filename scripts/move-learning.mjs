/**
 * Reglas de aprendizaje de movimientos: qué puede aprender una especie, por qué
 * vía y con qué nivel, y cómo sustituir uno cuando ya conoce cuatro. Módulo puro
 * sin dependencias, verificado por validate-move-learning.mjs y consumido en su
 * totalidad por el gestor de movimientos de pokemon-sheet.mjs.
 */

/**
 * Correspondencia entre el nivel mínimo y la clave del JSON de especie que lista
 * los movimientos de ese tramo. Solo la recorre moveEligibility().
 */
const LEVEL_GROUPS = [
  [1, "start"],
  [2, "level2"],
  [6, "level6"],
  [10, "level10"],
  [14, "level14"],
  [18, "level18"]
];

/** Movimientos que un Pokémon puede tener aprendidos a la vez. */
export const MAX_KNOWN_MOVES = 4;

/**
 * Devuelve la lista de movimientos resultante de aprender uno nuevo: lo añade si
 * queda hueco y, si no, exige indicar cuál se sustituye. Señala con RangeError
 * los dos casos que la ficha debe resolver: "replacement-required" (falta elegir
 * a quién reemplazar) y "legacy-overflow" (datos antiguos con más de
 * MAX_KNOWN_MOVES). Función pura: quien la llama guarda el resultado.
 */
export function applyLearnedMove(knownMoves, newEntry, replacedEntryId = null) {
  const entries = Array.isArray(knownMoves) ? [...knownMoves] : [];
  if (entries.length < MAX_KNOWN_MOVES) return [...entries, newEntry];
  if (entries.length > MAX_KNOWN_MOVES) throw new RangeError("legacy-overflow");
  const index = entries.findIndex(entry => entry.id === replacedEntryId);
  if (index < 0) throw new RangeError("replacement-required");
  entries[index] = newEntry;
  return entries;
}

/**
 * Determina la relación de una especie con un movimiento: si puede aprenderlo
 * ya, si podrá más adelante o si es incompatible, junto con las vías que lo
 * permiten (nivel, MT o huevo). Núcleo de filterMoveCatalog() y de la validación
 * que hace pokemon-sheet.mjs antes de aprender.
 */
export function moveEligibility(species, move, level = 1) {
  const pool = species.moves ?? {};
  const levelRequirements = LEVEL_GROUPS
    .filter(([, key]) => (pool[key] ?? []).includes(move.id))
    .map(([required]) => required);
  const requiredLevel = levelRequirements.length ? Math.min(...levelRequirements) : null;
  const viaTm = move.tm?.id != null && (pool.tm ?? []).includes(move.tm.id);
  const viaEgg = (pool.egg ?? []).includes(move.id);
  const methods = [];
  if (requiredLevel != null) methods.push({ id: "level", label: requiredLevel <= 1 ? "Inicial" : `Nivel ${requiredLevel}` });
  if (viaTm) methods.push({ id: "tm", label: `MT ${move.tm.id}` });
  if (viaEgg) methods.push({ id: "egg", label: "Huevo" });
  const compatible = methods.length > 0;
  const availableNow = viaTm || viaEgg || (requiredLevel != null && Number(level) >= requiredLevel);
  return {
    availableNow,
    compatible,
    future: compatible && !availableNow,
    methods,
    requiredLevel
  };
}

/**
 * Prepara el catálogo del gestor de movimientos: anota cada movimiento con
 * moveEligibility(), lo filtra por texto y categoría (disponibles, futuros o
 * incompatibles) y lo ordena poniendo delante los ya conocidos y los
 * disponibles. Solo la usa pokemon-sheet.mjs.
 */
export function filterMoveCatalog(moves, species, level, knownIds, filters = {}) {
  const query = String(filters.query ?? "").trim().toLocaleLowerCase();
  const category = filters.category ?? "available";
  const entries = moves.map(move => {
    const eligibility = moveEligibility(species, move, level);
    return {
      id: move.id,
      name: move.name,
      type: move.type ?? "normal",
      pp: Math.max(Number(move.pp) || 0, 0),
      known: knownIds.has(move.id),
      ...eligibility
    };
  }).filter(entry => {
    if (query && !entry.name.toLocaleLowerCase().includes(query) && !entry.id.toLocaleLowerCase().includes(query)) return false;
    if (category === "available") return entry.availableNow;
    if (category === "future") return entry.future;
    if (category === "incompatible") return !entry.compatible;
    return true;
  });
  return entries.sort((a, b) => {
    if (a.known !== b.known) return a.known ? -1 : 1;
    if (a.availableNow !== b.availableNow) return a.availableNow ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
