/**
 * Inventario único de cobertura de las 330 habilidades. Una habilidad es
 * `automatic` cuando existe una regla mecánica conectada al motor; las demás
 * son `assisted`: la ficha permite publicarlas al chat para resolver decisiones
 * narrativas, formas sin bloque alternativo o reacciones que Foundry no puede
 * interceptar de forma fiable. El validador cruza este inventario con los datos.
 */
import {
  ABILITY_BREAKER_IDS, ABILITY_REST_RESOURCES, ABSORB_HEAL_ABILITIES,
  AC_STATUS_BONUS_ABILITIES, CONTACT_DAMAGE_ABILITIES, CONTACT_STATUS_ABILITIES,
  CRITICAL_IMMUNITY_ABILITIES, DAMAGE_TYPE_SELF_REACTION_ABILITIES,
  DEBUFF_IMMUNITY_ABILITIES, FORCED_SWITCH_IMMUNE_ABILITIES,
  FULL_STATUS_IMMUNITY_ABILITIES, HP_THRESHOLD_SWITCH_ABILITIES,
  IMMUNITY_ABILITIES, LOW_HP_STAB_ABILITIES, NORMAL_MOVE_TYPE_OVERRIDE_ABILITIES,
  OWN_MELEE_HIT_STATUS_ABILITIES, RESISTANCE_ABILITIES,
  SELF_STATUS_DAMAGE_BOOST_ABILITIES, SPEED_STATUS_BONUS_ABILITIES,
  STATUS_IMMUNITY_ABILITIES, TYPE_TRIGGERED_ADVANTAGE_ABILITIES,
  WEATHER_ABILITIES, WEATHER_DAMAGE_BONUS_ABILITIES, WEATHER_HEAL_ABILITIES,
  WEATHER_STAB_DOUBLE_ABILITIES, WEATHER_STATUS_IMMUNITY_ABILITIES
} from "./pokemon-abilities.mjs";

export const AUTOMATED_ABILITY_IDS = Object.freeze(new Set([
  ...Object.keys(IMMUNITY_ABILITIES), ...Object.keys(RESISTANCE_ABILITIES), ...Object.keys(WEATHER_ABILITIES),
  ...Object.keys(STATUS_IMMUNITY_ABILITIES), ...FULL_STATUS_IMMUNITY_ABILITIES,
  ...Object.keys(CONTACT_DAMAGE_ABILITIES), ...LOW_HP_STAB_ABILITIES,
  "compound-eyes", "gale-wings", "steelworker", "rivalry", "super-luck",
  ...Object.keys(CONTACT_STATUS_ABILITIES), "cursed-body", "guts", "competitive", "flare-boost",
  ...Object.keys(AC_STATUS_BONUS_ABILITIES), ...Object.keys(SPEED_STATUS_BONUS_ABILITIES),
  ...Object.keys(WEATHER_HEAL_ABILITIES), ...Object.keys(ABSORB_HEAL_ABILITIES),
  ...CRITICAL_IMMUNITY_ABILITIES, ...Object.keys(WEATHER_STATUS_IMMUNITY_ABILITIES),
  "adaptability", "dragons-maw", "rocky-payload", "transistor", "technician", "sticky-hold", "klutz",
  ...FORCED_SWITCH_IMMUNE_ABILITIES, ...DEBUFF_IMMUNITY_ABILITIES,
  ...Object.keys(WEATHER_DAMAGE_BONUS_ABILITIES), ...Object.keys(WEATHER_STAB_DOUBLE_ABILITIES),
  ...Object.keys(NORMAL_MOVE_TYPE_OVERRIDE_ABILITIES), "normalize", ...Object.keys(TYPE_TRIGGERED_ADVANTAGE_ABILITIES),
  "serene-grace", "rock-head", "sharpness", "unburden", "ripen", "cheek-pouch", "defeatist", "berserk", "iron-fist", "strong-jaw", "bulletproof",
  ...Object.keys(OWN_MELEE_HIT_STATUS_ABILITIES), "gooey", "analytic", "truant", "ice-scales", "merciless", "intrepid-sword", "no-guard", "dauntless-shield",
  ...Object.keys(HP_THRESHOLD_SWITCH_ABILITIES), "natural-cure", "regenerator", "reckless", "neuroforce",
  ...Object.keys(DAMAGE_TYPE_SELF_REACTION_ABILITIES), "plus", "minus", "defiant", "multiscale", "shadow-shield", "sturdy",
  ...Object.keys(ABILITY_REST_RESOURCES), "arena-trap", "shadow-tag", "magnet-pull",
  "battery", "power-spot", "victory-star", "steely-spirit", "costar", "flower-gift", "sweet-veil", "flower-veil", "unnerve", "as-one",
  "soundproof", "damp", "overcoat", ...ABILITY_BREAKER_IDS, "mega-launcher", "tough-claws", "punk-rock", "tinted-lens", "fluffy", "prism-armor", "pressure", "skill-link", "liquid-voice", "dark-aura", "fairy-aura", "aura-break",
  "wonder-guard", "paper-thin", "corrosion", "wonder-skin", "synchronize", "tangled-feet", "hyper-cutter", "gluttony",
  "chlorophyll", "swift-swim", "sand-rush", "slush-rush", "surge-surfer", "sand-veil", "snow-cloak", "grass-pelt",
  "rks-system", "multitype", "form-change-arceus", "filter", "scrappy", "minds-eye", "supreme-overlord", "slow-start", "air-lock", "cloud-nine",
  "protean", "libero", "color-change",
  "bad-dreams", "hospitality", "shed-skin", "supersweet-syrup", "tera-shell", "contrary", "big-pecks", "sheer-force", "sniper",
  "electric-surge", "grassy-surge", "misty-surge", "psychic-surge", "triage", "electromorphosis"
]));

export function abilityAutomationMode(abilityId) {
  return AUTOMATED_ABILITY_IDS.has(String(abilityId ?? "")) ? "automatic" : "assisted";
}
