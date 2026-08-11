export const EXPERIENCE_BY_LEVEL = Object.freeze([
  0, 200, 800, 2000, 6000, 12000, 20000, 30000, 44000, 62000,
  82000, 104000, 128000, 158000, 194000, 234000, 278000, 326000, 382000, 450000
]);

export function experienceAtLevel(level) {
  const normalized = Math.max(1, Math.min(20, Math.trunc(Number(level) || 1)));
  return EXPERIENCE_BY_LEVEL[normalized - 1];
}

export function normalizedExperience(experience, level) {
  return Math.max(Math.trunc(Number(experience) || 0), experienceAtLevel(level));
}

export function levelForExperience(experience) {
  const value = Math.max(0, Math.trunc(Number(experience) || 0));
  let level = 1;
  for (let index = 1; index < EXPERIENCE_BY_LEVEL.length; index++) {
    if (value < EXPERIENCE_BY_LEVEL[index]) break;
    level = index + 1;
  }
  return level;
}

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

export function experienceAward(level, speciesRating) {
  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(Number(level) || 1)));
  const rating = Math.max(0, Number(speciesRating) || 0);
  return Math.round(200 * normalizedLevel * rating);
}

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
