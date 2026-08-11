export const POKEBALL_IDS = Object.freeze([
  "poke-ball", "great-ball", "ultra-ball", "master-ball", "safari-ball", "fast-ball",
  "level-ball", "lure-ball", "heavy-ball", "love-ball", "friend-ball", "moon-ball",
  "sport-ball", "net-ball", "dive-ball", "nest-ball", "repeat-ball", "timer-ball",
  "luxury-ball", "premier-ball", "dusk-ball", "heal-ball", "quick-ball", "dream-ball"
]);

const ADVANTAGE_STATUSES = new Set([
  "poisoned", "poison", "restrained", "asleep", "sleep", "sleeping", "burning", "burned",
  "confused", "paralyzed", "paralysed", "frozen"
]);

const SIZE_RANK = { tiny: 0, small: 1, medium: 2, med: 2, large: 3, lg: 3, huge: 4, gargantuan: 5, grg: 5 };

export function baseCaptureDifficulty(speciesRating, level) {
  return 10 + Math.floor(Math.max(0, Number(speciesRating) || 0)) + normalizedLevel(level);
}

export function healthCaptureReduction(currentHp, maximumHp) {
  const current = Math.max(0, Number(currentHp) || 0);
  const maximum = Math.max(1, Number(maximumHp) || 1);
  let reduction = 0;
  if (current < maximum / 2) reduction += 5;
  if (current < maximum * 0.1) reduction += 5;
  return reduction;
}

export function captureHasAdvantage(statuses = []) {
  return statuses.some(status => ADVANTAGE_STATUSES.has(String(status).trim().toLocaleLowerCase()));
}

export function pokeballAdjustment(ballId, context = {}) {
  let reduction = 0;
  const reasons = [];
  const add = (value, label) => {
    const amount = Math.max(0, Math.trunc(Number(value) || 0));
    if (!amount) return;
    reduction += amount;
    reasons.push({ label, value: amount });
  };
  switch (ballId) {
    case "great-ball": add(5, "Súper Ball"); break;
    case "ultra-ball": add(10, "Ultra Ball"); break;
    case "master-ball": return { reduction: 0, reasons: [{ label: "Master Ball", value: "Éxito automático" }], automaticSuccess: true };
    case "safari-ball": add(context.natureModifier, "Modificador de Naturaleza"); break;
    case "level-ball": if (Number(context.trainerLevel) > Number(context.targetLevel)) add(5, "Nivel del entrenador superior"); break;
    case "lure-ball": if (context.fishing) add(10, "Pokémon encontrado pescando"); break;
    case "heavy-ball": if ((SIZE_RANK[context.size] ?? -1) >= SIZE_RANK.medium) add(10, "Tamaño Mediano o superior"); break;
    case "love-ball": add(Math.max(0, Number(context.activePokemonCharismaModifier) || 0) * 2, "Carisma del Pokémon activo"); break;
    case "friend-ball": add(context.persuasionModifier, "Modificador de Persuasión"); break;
    case "moon-ball": if (context.evolvesWithMoonStone) add(10, "Evoluciona con Piedra Lunar"); break;
    case "sport-ball": add(context.athleticsModifier, "Modificador de Atletismo"); break;
    case "net-ball": if ((context.types ?? []).some(type => ["water", "bug"].includes(type))) add(10, "Tipo Agua o Bicho"); break;
    case "dive-ball": if (context.underwater) add(10, "Bajo el agua"); break;
    case "nest-ball": if (Number(context.targetLevel) <= 5) add(5, "Nivel 5 o inferior"); break;
    case "repeat-ball": if (context.alreadyCaught) add(10, "Especie capturada anteriormente"); break;
    case "timer-ball": add(Math.min(10, Math.max(0, Number(context.timerTurns) || 0)), "Turnos de concentración"); break;
    case "dusk-ball": if (context.darkness) add(10, "Noche u oscuridad"); break;
    case "quick-ball": if (Number(context.combatRound) <= 1 && Number(context.combatRound) > 0) add(15, "Primera ronda de combate"); break;
    case "dream-ball": if (captureHasAdvantage(context.statuses?.filter(status => ["asleep", "sleep", "sleeping"].includes(String(status).toLocaleLowerCase())) ?? [])) add(5, "Objetivo dormido"); break;
  }
  add(context.manualReduction, "Ajuste del director");
  return { reduction, reasons, automaticSuccess: false };
}

export function captureDifficulty({ speciesRating, level, currentHp, maximumHp, ballId, context = {} }) {
  const base = baseCaptureDifficulty(speciesRating, level);
  const healthReduction = healthCaptureReduction(currentHp, maximumHp);
  const ball = pokeballAdjustment(ballId, context);
  return {
    base,
    healthReduction,
    ballReduction: ball.reduction,
    dc: Math.max(0, base - healthReduction - ball.reduction),
    reasons: ball.reasons,
    automaticSuccess: ball.automaticSuccess
  };
}

function normalizedLevel(value) {
  return Math.max(1, Math.min(20, Math.trunc(Number(value) || 1)));
}
