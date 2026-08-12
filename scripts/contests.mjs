export const CONTEST_TYPES = {
  cool: { label: "Cool", icon: "fa-fire", complementary: ["beauty", "tough"] },
  beauty: { label: "Beauty", icon: "fa-gem", complementary: ["cool", "cute"] },
  cute: { label: "Cute", icon: "fa-heart", complementary: ["beauty", "clever"] },
  clever: { label: "Clever", icon: "fa-lightbulb", complementary: ["cute", "tough"] },
  tough: { label: "Tough", icon: "fa-dumbbell", complementary: ["clever", "cool"] }
};

const MOVE_TYPE_DEFAULTS = {
  normal: "cool", flying: "cool", rock: "cool", bug: "cool",
  ghost: "beauty", steel: "beauty", electric: "beauty", ice: "beauty",
  water: "cute", grass: "cute", fairy: "cute",
  poison: "clever", fire: "clever", psychic: "clever", dark: "clever",
  fighting: "tough", ground: "tough", dragon: "tough"
};

export function contestDetailsForMove(move, effectsById = new Map()) {
  const defined = move?.contest;
  const contest = CONTEST_TYPES[defined?.contest] ? defined.contest : (MOVE_TYPE_DEFAULTS[move?.type] ?? "cute");
  const effectId = String(defined?.effect?.id ?? defined?.effect ?? "23");
  const effect = typeof defined?.effect === "object"
    ? defined.effect
    : effectsById.get(effectId) ?? { id: effectId, name: "Quite an appealing move.", effect: "A crowd favorite. No extra effects." };
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

export function contestCompatibility(contestType, moveContestType) {
  if (contestType === moveContestType) return { id: "compatible", label: "Compatible" };
  if (CONTEST_TYPES[contestType]?.complementary.includes(moveContestType)) return { id: "complementary", label: "Complementario" };
  return { id: "incompatible", label: "Incompatible" };
}

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

export function contestTypeOptions() {
  return Object.fromEntries(Object.entries(CONTEST_TYPES).map(([id, entry]) => [id, entry.label]));
}
