/** Pure helpers for validating the distance of targeted attack moves. */

/** Returns the maximum range in feet, or null when a move has no target range. */
export function moveMaximumRange(move) {
  const scope = String(move?.attack?.scope ?? "").toLowerCase();
  const range = String(move?.range ?? "").toLowerCase();
  if (scope === "melee" || range === "melee") return 5;
  if (scope !== "ranged") return null;
  const match = range.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|pies|pie)/i) ?? range.match(/\d+(?:\.\d+)?/);
  return match ? Math.max(0, Number(match[1] ?? match[0])) : null;
}

/** Indicates whether a measured target distance is valid for this move. */
export function isMoveTargetInRange(move, distance) {
  const maximum = moveMaximumRange(move);
  return maximum == null || (Number.isFinite(Number(distance)) && Number(distance) <= maximum);
}
