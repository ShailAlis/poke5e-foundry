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

/**
 * Índices por especie de las listas de aprendizaje, construidos la primera vez
 * que se consulta una especie. El gestor de movimientos evalúa las ~900 entradas
 * del catálogo en cada redibujado (y en cada tecla del buscador), así que las
 * búsquedas lineales sobre los arrays del JSON se sustituyen por Sets. La clave
 * es el propio objeto `species.moves` del catálogo, inmutable y compartido, de
 * modo que el índice sobrevive a las copias de especie que hace la ficha.
 */
const poolIndexes = new WeakMap();

/** Construye —o recupera— el índice de listas de una especie. Auxiliar de moveEligibility(). */
function poolIndex(pool) {
  let index = poolIndexes.get(pool);
  if (index) return index;
  index = {
    levels: LEVEL_GROUPS.map(([required, key]) => [required, new Set(pool[key] ?? [])]),
    egg: new Set(pool.egg ?? []),
    tm: new Set((pool.tm ?? []).map(String)),
    hm: new Set((pool.hm ?? pool.tm ?? []).map(String))
  };
  poolIndexes.set(pool, index);
  return index;
}

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
export function moveEligibility(species, move, level = 1, { machineIds = new Set() } = {}) {
  const index = poolIndex(species.moves ?? {});
  // LEVEL_GROUPS está ordenado de menor a mayor, así que el primer tramo que
  // contiene el movimiento ya es el nivel mínimo que lo concede.
  let requiredLevel = null;
  for (const [required, ids] of index.levels) {
    if (ids.has(move.id)) { requiredLevel = required; break; }
  }
  const machine = moveMachine(move);
  const machinePool = machine?.kind === "hm" ? index.hm : index.tm;
  const viaMachine = machine != null && machinePool.has(String(machine.id));
  const machineOwned = viaMachine && machineIds.has(machine.key);
  const viaEgg = index.egg.has(move.id);
  const methods = [];
  if (requiredLevel != null) methods.push({ id: "level", label: requiredLevel <= 1 ? "Inicial" : `Nivel ${requiredLevel}` });
  if (viaMachine) methods.push({ id: machine.kind, label: `${machine.label} ${machine.id}${machineOwned ? "" : " · no disponible"}`, available: machineOwned });
  // Un movimiento huevo solo se asigna al generar el Pokémon al azar (ver
  // deployment.mjs/npc-trainer-actor.mjs); se muestra aquí solo a título
  // informativo y nunca cuenta como vía para aprenderlo al subir de nivel.
  if (viaEgg) methods.push({ id: "egg", label: "Huevo (solo al generar el Pokémon)" });
  const compatible = methods.length > 0;
  const availableByLevel = requiredLevel != null && Number(level) >= requiredLevel;
  const availableNow = availableByLevel || machineOwned;
  const usesMachine = machineOwned && !availableByLevel;
  return {
    availableNow,
    compatible,
    future: !availableNow && requiredLevel != null && Number(level) < requiredLevel,
    methods,
    requiredLevel,
    requiresMachine: !availableNow && viaMachine && !machineOwned,
    usesMachine,
    machine
  };
}

/** Devuelve la identidad estable de la MT/MO asociada a un movimiento. */
export function moveMachine(move) {
  const definition = move?.hm?.id != null
    ? { kind: "hm", label: "MO", ...move.hm }
    : move?.tm?.id != null ? { kind: "tm", label: "MT", ...move.tm } : null;
  return definition ? { ...definition, key: `${definition.kind}:${definition.id}` } : null;
}

/**
 * Prepara el catálogo del gestor de movimientos: anota cada movimiento con
 * moveEligibility(), lo filtra por texto y categoría (disponibles, futuros o
 * incompatibles) y lo ordena poniendo delante los ya conocidos y los
 * disponibles. Solo la usa pokemon-sheet.mjs.
 *
 * El filtro de texto se aplica antes de calcular la elegibilidad —el resultado
 * es el mismo, porque solo mira nombre e id— para no evaluar las reglas de
 * aprendizaje de todo el catálogo en cada tecla del buscador.
 */
export function filterMoveCatalog(moves, species, level, knownIds, filters = {}) {
  const query = String(filters.query ?? "").trim().toLocaleLowerCase();
  const category = filters.category ?? "available";
  const entries = [];
  for (const move of moves) {
    if (query && !String(move.name).toLocaleLowerCase().includes(query) && !String(move.id).toLocaleLowerCase().includes(query)) continue;
    const eligibility = moveEligibility(species, move, level, { machineIds: filters.machineIds });
    if (category === "available" && !eligibility.availableNow) continue;
    if (category === "future" && !eligibility.future) continue;
    if (category === "incompatible" && eligibility.compatible) continue;
    entries.push({
      id: move.id,
      name: move.name,
      type: move.type ?? "normal",
      pp: Math.max(Number(move.pp) || 0, 0),
      known: knownIds.has(move.id),
      ...eligibility
    });
  }
  return entries.sort((a, b) => {
    if (a.known !== b.known) return a.known ? -1 : 1;
    if (a.availableNow !== b.availableNow) return a.availableNow ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
