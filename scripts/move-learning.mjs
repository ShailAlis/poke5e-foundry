const LEVEL_GROUPS = [
  [1, "start"],
  [2, "level2"],
  [6, "level6"],
  [10, "level10"],
  [14, "level14"],
  [18, "level18"]
];

export const MAX_KNOWN_MOVES = 4;

export function applyLearnedMove(knownMoves, newEntry, replacedEntryId = null) {
  const entries = Array.isArray(knownMoves) ? [...knownMoves] : [];
  if (entries.length < MAX_KNOWN_MOVES) return [...entries, newEntry];
  if (entries.length > MAX_KNOWN_MOVES) throw new RangeError("legacy-overflow");
  const index = entries.findIndex(entry => entry.id === replacedEntryId);
  if (index < 0) throw new RangeError("replacement-required");
  entries[index] = newEntry;
  return entries;
}

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
