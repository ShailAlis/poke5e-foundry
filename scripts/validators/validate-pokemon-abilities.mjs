import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ABSORB_HEAL_ABILITIES, AC_STATUS_BONUS_ABILITIES, CONTACT_DAMAGE_ABILITIES, CONTACT_STATUS_ABILITIES, CRITICAL_IMMUNITY_ABILITIES, DEBUFF_IMMUNITY_ABILITIES, FORCED_SWITCH_IMMUNE_ABILITIES, FULL_STATUS_IMMUNITY_ABILITIES, GUTS_IGNORED_STATUSES, IMMUNITY_ABILITIES, LOW_HP_STAB_ABILITIES, NORMAL_MOVE_TYPE_OVERRIDE_ABILITIES, RESISTANCE_ABILITIES, SELF_STATUS_DAMAGE_BOOST_ABILITIES, SPEED_STATUS_BONUS_ABILITIES, STATUS_IMMUNITY_ABILITIES, WEATHER_ABILITIES, WEATHER_DAMAGE_BONUS_ABILITIES, WEATHER_HEAL_ABILITIES, WEATHER_STAB_DOUBLE_ABILITIES, WEATHER_STATUS_IMMUNITY_ABILITIES,
  abilityBerryHealBonus, abilityBlocksForcedSwitch, abilityBlocksStatus, abilityDamageImmunity, abilityDeployWeather, abilityGrantsDebuffImmunity, abilityGrantsUnburdenSpeed, abilityIgnoresCriticalDamage, abilityIgnoresRecoil, abilityIgnoresStatusPenalty, abilityLowHpCombatModifiers, abilityLowHpDamageDiceMultiplier, abilityLowHpStabBonus, abilityMoveProfile, abilityMoveTypeOverride, abilityPreventsHoldingItem, abilityProtectsHeldItem, abilityRollsDamageTwiceHigher, abilitySaveDcBonus, abilitySelfStatusDamageBonus, abilitySharpnessDoublesModifier, abilityStatusBonusEffectSource, abilityTypeTriggeredAdvantage, abilityWeatherBlocksStatus, abilityWeatherDamageBonus, abilityWeatherHeal, abilityWeatherStabBonus, absorbHealType, applyAbilityDefenses, contactDamageReaction, contactStatusReaction, pokemonAbilityDefenses,
  STRONG_JAW_MOVE_IDS, TYPE_TRIGGERED_ADVANTAGE_ABILITIES,
  abilityBlocksBulletproofMove, OWN_MELEE_HIT_STATUS_ABILITIES, ownMeleeHitStatusTrigger,
  abilityGrantsAnalyticAdvantage, abilityBlocksRepeatingMove,
  abilityIceScalesDiceMultiplier, abilityDoublesDiceAgainstPoisoned, abilityGrantsMeleeAttackAdvantage,
  abilityGrantsSelfAttackAdvantage, abilityTargetAttackRollModifier, abilityHealsFromPoisonTick,
  HP_THRESHOLD_SWITCH_ABILITIES, hpThresholdSwitchTrigger,
  recallAbilityAdjustment, abilityDoublesRecoilStab, abilityRollsSuperEffectiveTwice,
  DAMAGE_TYPE_SELF_REACTION_ABILITIES, damageTypeSelfReactionTrigger,
  ABILITY_REST_RESOURCES, abilityRestUseAvailable, markAbilityRestUseSpent, abilityUsesAfterRest, resetAbilityRestResourcesAfterRest,
  ABILITY_BREAKER_IDS, SOUND_MOVE_IDS, WEATHER_DAMAGE_MOVE_IDS, abilityBlocksIncomingMove, abilityForcesMoveStab,
  abilityAutoConsumesHealingBerry, abilityFaintedAllyAttackBonus, abilityGrantsStatusSaveAdvantage, abilityIgnoresAbilityDamageImmunity, abilityIgnoresNormalFightingImmunity, abilityIgnoresPoisonStatusTypeImmunity, abilityMaximumHp, abilityMinimumChainExtraHits, abilityMoveDamageBonus, abilityMovePpCost, abilityMoveStabBonus, abilityMoveUserTypeChange, abilityProtectsAttackDamageBonuses, abilityReceivedDamageTypeChange, abilitySlowStartActive, abilityVulnerabilityFilter,
  abilityAdjustedMoveModifiers, abilityCriticalDamageProfile, abilityMoveActivationTime, abilityRollsVulnerableDamageTwiceLower, abilitySheerForceProfile, abilitySuppressesTargetAbilities, abilityTargetDamageDiceMultiplier, abilityTriggeredMoveModifierMultiplier, isSoundMove
} from "../pokemon/pokemon-abilities.mjs";
import { plusMinusAttackDamageBonus } from "../combat/aura-abilities.mjs";
import { badDreamsDamage, END_TURN_ABILITY_IDS, shedSkinStatus } from "../combat/ability-turn-effects.mjs";
import { AUTOMATED_ABILITY_IDS, abilityAutomationMode, visiblePokemonAbilities } from "../pokemon/ability-coverage.mjs";
import { POKEMON_STATUS_EFFECTS } from "../combat/status-effects.mjs";

const abilities = JSON.parse(fs.readFileSync(new URL("../../data/abilities.json", import.meta.url), "utf8")).items;
const abilityIds = new Set(abilities.map(entry => entry.id));
const speciesAbilities = [{ id: "levitate" }, { id: "hidden-power-test", hidden: true }];
assert.deepEqual(visiblePokemonAbilities(speciesAbilities, ["levitate", "hidden-power-test"], { isGM: false }), [{ id: "levitate", hidden: false, known: true }]);
assert.deepEqual(visiblePokemonAbilities(speciesAbilities, ["levitate"], { isGM: true }), [
  { id: "levitate", hidden: false, known: true },
  { id: "hidden-power-test", hidden: true, known: false }
]);
assert.deepEqual(visiblePokemonAbilities(speciesAbilities, ["hidden-power-test"], { isGM: true }), [{ id: "hidden-power-test", hidden: true, known: true }]);
const MOVE_PROFILE_ABILITY_IDS = ["compound-eyes", "gale-wings", "steelworker", "rivalry", "super-luck"];
const CURSED_BODY_ABILITY_ID = "cursed-body";
const SELF_STATUS_ABILITY_IDS = ["guts", "competitive", "flare-boost"];
const ROLL_TWICE_HIGHER_ABILITY_IDS = ["adaptability", "dragons-maw", "rocky-payload", "transistor", "technician"];
const HELD_ITEM_PROTECTION_ABILITY_IDS = ["sticky-hold", "klutz"];
const NORMALIZE_ABILITY_ID = "normalize";
const catalogued = [
  ...Object.keys(IMMUNITY_ABILITIES), ...Object.keys(RESISTANCE_ABILITIES), ...Object.keys(WEATHER_ABILITIES),
  ...Object.keys(STATUS_IMMUNITY_ABILITIES), ...FULL_STATUS_IMMUNITY_ABILITIES, ...Object.keys(CONTACT_DAMAGE_ABILITIES), ...LOW_HP_STAB_ABILITIES,
  ...MOVE_PROFILE_ABILITY_IDS, ...Object.keys(CONTACT_STATUS_ABILITIES), CURSED_BODY_ABILITY_ID, ...SELF_STATUS_ABILITY_IDS,
  ...Object.keys(AC_STATUS_BONUS_ABILITIES), ...Object.keys(SPEED_STATUS_BONUS_ABILITIES), ...Object.keys(WEATHER_HEAL_ABILITIES), ...Object.keys(ABSORB_HEAL_ABILITIES),
  ...CRITICAL_IMMUNITY_ABILITIES, ...Object.keys(WEATHER_STATUS_IMMUNITY_ABILITIES), ...ROLL_TWICE_HIGHER_ABILITY_IDS, ...HELD_ITEM_PROTECTION_ABILITY_IDS,
  ...FORCED_SWITCH_IMMUNE_ABILITIES, ...DEBUFF_IMMUNITY_ABILITIES, ...Object.keys(WEATHER_DAMAGE_BONUS_ABILITIES), ...Object.keys(WEATHER_STAB_DOUBLE_ABILITIES),
  ...Object.keys(NORMAL_MOVE_TYPE_OVERRIDE_ABILITIES), NORMALIZE_ABILITY_ID, ...Object.keys(TYPE_TRIGGERED_ADVANTAGE_ABILITIES),
  "serene-grace", "rock-head", "sharpness", "unburden", "ripen", "cheek-pouch", "defeatist", "berserk", "iron-fist", "strong-jaw", "bulletproof",
  ...Object.keys(OWN_MELEE_HIT_STATUS_ABILITIES), "gooey", "analytic", "truant",
  "ice-scales", "merciless", "intrepid-sword", "no-guard", "dauntless-shield", ...Object.keys(HP_THRESHOLD_SWITCH_ABILITIES),
  "natural-cure", "regenerator", "reckless", "neuroforce",
  ...Object.keys(DAMAGE_TYPE_SELF_REACTION_ABILITIES), "plus", "minus", "defiant",
  "multiscale", "shadow-shield", "sturdy",
  ...Object.keys(ABILITY_REST_RESOURCES),
  "arena-trap", "shadow-tag", "magnet-pull",
  "battery", "power-spot", "victory-star", "steely-spirit", "costar", "flower-gift", "sweet-veil", "flower-veil", "unnerve", "as-one",
  "soundproof", "damp", "overcoat", ...ABILITY_BREAKER_IDS, "mega-launcher", "tough-claws", "punk-rock", "tinted-lens", "fluffy", "prism-armor", "pressure", "skill-link", "liquid-voice", "dark-aura", "fairy-aura", "aura-break", "wonder-guard", "paper-thin", "corrosion", "wonder-skin", "synchronize", "tangled-feet", "hyper-cutter", "gluttony",
  "chlorophyll", "swift-swim", "sand-rush", "slush-rush", "surge-surfer", "sand-veil", "snow-cloak", "grass-pelt",
  "rks-system", "multitype", "form-change-arceus", "filter", "scrappy", "minds-eye", "supreme-overlord", "slow-start", "air-lock", "cloud-nine", "protean", "libero", "color-change",
  ...END_TURN_ABILITY_IDS, "supersweet-syrup", "tera-shell", "contrary", "big-pecks", "sheer-force", "sniper",
  "electric-surge", "grassy-surge", "misty-surge", "psychic-surge", "triage", "electromorphosis"
];

const moves = JSON.parse(fs.readFileSync(new URL("../../data/moves.json", import.meta.url), "utf8")).moves;
const moveIds = new Set(moves.map(move => move.id));
for (const id of STRONG_JAW_MOVE_IDS) assert.ok(moveIds.has(id), `Mandíbula Firme referencia un movimiento inexistente: ${id}`);
for (const id of [...SOUND_MOVE_IDS, ...WEATHER_DAMAGE_MOVE_IDS]) assert.ok(moveIds.has(id), `Familia de habilidad referencia un movimiento inexistente: ${id}`);
const unknown = catalogued.filter(id => !abilityIds.has(id));
assert.deepEqual(unknown, [], `Habilidades sin correspondencia en data/abilities.json: ${unknown.join(", ")}`);
const automatedAbilityIds = new Set(catalogued);
assert.deepEqual([...automatedAbilityIds].sort(), [...AUTOMATED_ABILITY_IDS].sort(), "El inventario visible de automatización debe coincidir con las reglas validadas");
for (const ability of abilities) assert.ok(["automatic", "assisted"].includes(abilityAutomationMode(ability.id)), `Cobertura desconocida: ${ability.id}`);

const statusIds = new Set(Object.keys(POKEMON_STATUS_EFFECTS));
for (const [ability, statuses] of Object.entries(STATUS_IMMUNITY_ABILITIES)) {
  for (const status of statuses) assert.ok(statusIds.has(status), `${ability} apunta a un estado desconocido: ${status}`);
}
for (const [ability, statuses] of Object.entries(SELF_STATUS_DAMAGE_BOOST_ABILITIES)) {
  for (const status of statuses) assert.ok(statusIds.has(status), `${ability} apunta a un estado desconocido: ${status}`);
}
for (const status of GUTS_IGNORED_STATUSES) assert.ok(statusIds.has(status), `Vigor apunta a un estado desconocido: ${status}`);

const DAMAGE_TYPES = new Set(["bug", "dark", "dragon", "electric", "fairy", "fighting", "fire", "flying", "ghost", "grass", "ground", "ice", "normal", "poison", "psychic", "rock", "steel", "water"]);
for (const type of Object.values(IMMUNITY_ABILITIES)) assert.ok(DAMAGE_TYPES.has(type), `Tipo de daño desconocido: ${type}`);
for (const types of Object.values(RESISTANCE_ABILITIES)) for (const type of types) assert.ok(DAMAGE_TYPES.has(type), `Tipo de daño desconocido: ${type}`);

assert.deepEqual(pokemonAbilityDefenses(["levitate"]), { immunities: ["ground"], resistances: [] });
assert.deepEqual(pokemonAbilityDefenses(["thick-fat"]), { immunities: [], resistances: ["fire", "ice"] });
assert.deepEqual(pokemonAbilityDefenses(["overgrow"]), { immunities: [], resistances: [] }, "Una habilidad sin efecto fijo no aporta nada");
assert.deepEqual(pokemonAbilityDefenses([]), { immunities: [], resistances: [] });
assert.deepEqual(pokemonAbilityDefenses(["levitate", "water-absorb"]).immunities.sort(), ["ground", "water"], "Varias habilidades conocidas se suman, no se sustituyen");
assert.equal(abilityDamageImmunity(["levitate"], "ground"), "levitate");
assert.equal(abilityDamageImmunity(["levitate"], "water"), null);
assert.equal(abilityDamageImmunity([], "ground"), null);

const traits = { dr: { value: [] }, dv: { value: ["ground"] }, di: { value: [] } };
applyAbilityDefenses(traits, ["levitate"]);
assert.deepEqual(traits.dv.value, [], "Levitar quita la vulnerabilidad a Tierra");
assert.deepEqual(traits.di.value, ["ground"], "...y la convierte en inmunidad");

const resistTraits = { dr: { value: [] }, dv: { value: [] }, di: { value: ["fire"] } };
applyAbilityDefenses(resistTraits, ["heatproof"]);
assert.deepEqual(resistTraits.dr.value, [], "Una resistencia de habilidad no rebaja una inmunidad de tipo ya existente");

assert.equal(abilityDeployWeather(["drizzle"]), "rain");
assert.equal(abilityDeployWeather(["snow-warning"]), "snow");
assert.equal(abilityDeployWeather(["overgrow"]), null);
assert.equal(abilityDeployWeather([]), null);

assert.equal(abilityBlocksStatus(["immunity"], "poisoned"), true);
assert.equal(abilityBlocksStatus(["immunity"], "badly-poisoned"), true);
assert.equal(abilityBlocksStatus(["immunity"], "burned"), false, "Inmunidad solo bloquea Envenenado, no cualquier estado");
assert.equal(abilityBlocksStatus(["insomnia"], "asleep"), true);
assert.equal(abilityBlocksStatus(["good-as-gold"], "frozen"), true, "Cuerpo Dorado bloquea cualquier estado del catálogo");
assert.equal(abilityBlocksStatus(["good-as-gold"], "confused"), true);
assert.equal(abilityBlocksStatus([], "asleep"), false);
assert.equal(abilityBlocksStatus(["overgrow"], "asleep"), false, "Una habilidad sin inmunidad de estado no bloquea nada");

assert.deepEqual(contactDamageReaction(["rough-skin"]), { ability: "rough-skin", type: "typeless", die: 4, on: 4 });
assert.equal(contactDamageReaction(["overgrow"]), null, "Una habilidad sin reacción de contacto no aporta nada");
assert.equal(contactDamageReaction([]), null);
for (const { type } of Object.values(CONTACT_DAMAGE_ABILITIES)) assert.ok(type === "typeless" || DAMAGE_TYPES.has(type), `Tipo de daño desconocido: ${type}`);

assert.deepEqual(contactStatusReaction(["flame-body"]), { ability: "flame-body", status: "burned", die: 10, on: 10 });
assert.deepEqual(contactStatusReaction(["stench"]), { ability: "stench", status: "flinched", die: 10, on: 10 });
assert.equal(contactStatusReaction(["overgrow"]), null, "Una habilidad sin reacción de contacto-a-estado no aporta nada");
assert.equal(contactStatusReaction([]), null);
for (const { status } of Object.values(CONTACT_STATUS_ABILITIES)) assert.ok(statusIds.has(status), `Estado desconocido: ${status}`);

assert.equal(abilityLowHpStabBonus(["blaze"], 0.25), 2);
assert.equal(abilityLowHpStabBonus(["blaze"], 0.1), 2);
assert.equal(abilityLowHpStabBonus(["blaze"], 0.26), 0, "Por encima del 25% no dobla el STAB");
assert.equal(abilityLowHpStabBonus(["overgrow"], 0), 2, "0 PG también cuenta como 25% o menos");
assert.equal(abilityLowHpStabBonus(["swarm", "torrent"], 0.2), 2);
assert.equal(abilityLowHpStabBonus([], 0.1), 0);
assert.equal(abilityLowHpStabBonus(["run-away"], 0.1), 0, "Una habilidad sin este efecto no aporta nada aunque la vida sea baja");
assert.equal(abilityLowHpStabBonus(["blaze"], undefined), 0, "Sin fracción de PG conocida no se asume vida baja");

assert.deepEqual(abilityMoveProfile(["compound-eyes"]), { attack: 1, damage: 0, criticalRange: 0 });
assert.deepEqual(abilityMoveProfile(["gale-wings"], { moveType: "flying" }), { attack: 1, damage: 0, criticalRange: 0 });
assert.deepEqual(abilityMoveProfile(["gale-wings"], { moveType: "water" }), { attack: 0, damage: 0, criticalRange: 0 }, "Alas Danza solo se aplica a movimientos Voladores");
assert.deepEqual(abilityMoveProfile(["steelworker"], { moveType: "steel", hasDamage: true, proficiency: 3 }), { attack: 0, damage: 3, criticalRange: 0 });
assert.deepEqual(abilityMoveProfile(["steelworker"], { moveType: "steel", hasDamage: false, proficiency: 3 }), { attack: 0, damage: 0, criticalRange: 0 }, "Sin daño no hay nada que sumar");
assert.deepEqual(abilityMoveProfile(["rivalry"], { hasDamage: true, proficiency: 2, sourceTypes: ["fire"], targetTypes: ["fire", "flying"] }), { attack: 0, damage: 2, criticalRange: 0 });
assert.deepEqual(abilityMoveProfile(["rivalry"], { hasDamage: true, proficiency: 2, sourceTypes: ["fire"], targetTypes: ["water"] }), { attack: 0, damage: 0, criticalRange: 0 }, "Sin tipo compartido no hay bono");
assert.deepEqual(abilityMoveProfile(["super-luck"]), { attack: 0, damage: 0, criticalRange: 1 });
assert.deepEqual(abilityMoveProfile([]), { attack: 0, damage: 0, criticalRange: 0 });
assert.deepEqual(abilityMoveProfile(["compound-eyes", "super-luck"]), { attack: 1, damage: 0, criticalRange: 1 }, "Varias habilidades del lote se combinan");

assert.equal(abilitySelfStatusDamageBonus(["competitive"], ["poisoned"], 3), 3, "Competitivo suma competencia estando envenenado");
assert.equal(abilitySelfStatusDamageBonus(["competitive"], ["confused"], 3), 3, "Competitivo también cubre Confuso");
assert.equal(abilitySelfStatusDamageBonus(["competitive"], [], 3), 0, "Sin ningún estado activo no hay bono");
assert.equal(abilitySelfStatusDamageBonus(["flare-boost"], ["burned"], 4), 4, "Impulso Ígneo suma competencia estando quemado");
assert.equal(abilitySelfStatusDamageBonus(["flare-boost"], ["poisoned"], 4), 0, "Impulso Ígneo no cubre Envenenado");
assert.equal(abilitySelfStatusDamageBonus(["competitive", "flare-boost"], ["burned"], 3), 3, "Las dos habilidades a la vez no duplican el bono");
assert.equal(abilitySelfStatusDamageBonus(["overgrow"], ["poisoned"], 3), 0, "Una habilidad sin este efecto no aporta nada aunque el estado coincida");
assert.equal(abilitySelfStatusDamageBonus([], ["poisoned"], 3), 0);
assert.equal(abilitySelfStatusDamageBonus(["competitive"], ["poisoned"], 0), 0, "Con competencia 0 el bono también es 0");

assert.equal(abilityIgnoresStatusPenalty(["guts"]), true);
assert.equal(abilityIgnoresStatusPenalty(["overgrow"]), false, "Una habilidad distinta de Vigor no anula la desventaja de estado");
assert.equal(abilityIgnoresStatusPenalty([]), false);

// abilityStatusBonusEffectSource() (Lote 7) usa CONST.ACTIVE_EFFECT_MODES.ADD,
// global en Foundry pero ausente en Node — se define aquí como ya hace
// validate-status-effects.mjs con MULTIPLY para pokemonStatusEffectSource().
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2 } };
assert.equal(abilityStatusBonusEffectSource([]), null, "Sin Escama Prodigio ni Pies Rápidos no hay ActiveEffect que crear");
assert.equal(abilityStatusBonusEffectSource(["overgrow"]), null, "Una habilidad sin bono de estado no aporta nada");

const marvelScaleSource = abilityStatusBonusEffectSource(["marvel-scale"]);
assert.ok(marvelScaleSource?.changes?.length, "Escama Prodigio debe producir al menos un change");
assert.deepEqual(marvelScaleSource.changes, [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: AC_STATUS_BONUS_ABILITIES["marvel-scale"] }]);
assert.equal(marvelScaleSource.flags["poke5e-foundry"].kind, "ability-status-bonus");

const quickFeetSource = abilityStatusBonusEffectSource(["quick-feet"]);
assert.ok(quickFeetSource?.changes?.length, "Pies Rápidos debe producir al menos un change");
assert.equal(quickFeetSource.changes.length, 5, "Pies Rápidos afecta a las cinco formas de movimiento");
for (const change of quickFeetSource.changes) {
  assert.ok(change.key.startsWith("system.attributes.movement."), `Change inesperado: ${change.key}`);
  assert.equal(change.mode, CONST.ACTIVE_EFFECT_MODES.ADD);
  assert.equal(change.value, SPEED_STATUS_BONUS_ABILITIES["quick-feet"]);
}

const bothSource = abilityStatusBonusEffectSource(["marvel-scale", "quick-feet"]);
assert.equal(bothSource.changes.length, 6, "Ambas habilidades a la vez suman sus changes en vez de sustituirse");

assert.equal(abilityWeatherHeal(["rain-dish"], "rain"), true);
assert.equal(abilityWeatherHeal(["rain-dish"], "sun"), false, "Cuenco Lluvia solo cura con lluvia");
assert.equal(abilityWeatherHeal(["ice-body"], "hail"), true);
assert.equal(abilityWeatherHeal(["ice-body"], "snow"), true);
assert.equal(abilityWeatherHeal(["ice-body"], "sandstorm"), false);
assert.equal(abilityWeatherHeal(["overgrow"], "rain"), false, "Una habilidad sin curación por clima no aporta nada");
assert.equal(abilityWeatherHeal(["rain-dish"], null), false, "Sin clima activo no cura");
assert.equal(abilityWeatherHeal([], "rain"), false);
assert.equal(abilityWeatherHeal(["rain-dish", "ice-body"], "snow"), true, "Varias habilidades del lote se combinan");

assert.equal(absorbHealType(["water-absorb"]), "water");
assert.equal(absorbHealType(["volt-absorb"]), "electric");
assert.equal(absorbHealType(["earth-eater"]), "ground");
assert.equal(absorbHealType(["overgrow"]), null, "Una habilidad sin absorción con curación no aporta nada");
assert.equal(absorbHealType([]), null);
for (const type of Object.values(ABSORB_HEAL_ABILITIES)) assert.ok(DAMAGE_TYPES.has(type), `Tipo de daño desconocido: ${type}`);

assert.equal(abilityIgnoresCriticalDamage(["battle-armor"]), true);
assert.equal(abilityIgnoresCriticalDamage(["shell-armor"]), true);
assert.equal(abilityIgnoresCriticalDamage(["solid-rock"]), true);
assert.equal(abilityIgnoresCriticalDamage(["overgrow"]), false, "Una habilidad sin inmunidad a crítico no aporta nada");
assert.equal(abilityIgnoresCriticalDamage([]), false);

assert.equal(abilityBlocksStatus(["inner-focus"], "flinched"), true);
assert.equal(abilityBlocksStatus(["inner-focus"], "confused"), false, "Foco Interior solo bloquea Amedrentado");
assert.equal(abilityBlocksStatus(["pastel-veil"], "poisoned"), true);
assert.equal(abilityBlocksStatus(["pastel-veil"], "badly-poisoned"), true);

assert.equal(abilityWeatherBlocksStatus(["leaf-guard"], "sun"), true);
assert.equal(abilityWeatherBlocksStatus(["leaf-guard"], "rain"), false, "Manto Hoja solo protege con sol");
assert.equal(abilityWeatherBlocksStatus(["hydration"], "rain"), true);
assert.equal(abilityWeatherBlocksStatus(["hydration"], null), false, "Sin clima activo no protege");
assert.equal(abilityWeatherBlocksStatus(["overgrow"], "rain"), false, "Una habilidad sin esta inmunidad no aporta nada");
assert.equal(abilityWeatherBlocksStatus([], "sun"), false);

assert.equal(abilityRollsDamageTwiceHigher(["adaptability"], { moveType: "fire", speciesTypes: ["fire"] }), true);
assert.equal(abilityRollsDamageTwiceHigher(["adaptability"], { moveType: "fire", speciesTypes: ["water"] }), false, "Adaptabilidad exige que el movimiento comparta tipo");
assert.equal(abilityRollsDamageTwiceHigher(["dragons-maw"], { moveType: "dragon" }), true);
assert.equal(abilityRollsDamageTwiceHigher(["dragons-maw"], { moveType: "fire" }), false);
assert.equal(abilityRollsDamageTwiceHigher(["rocky-payload"], { moveType: "rock" }), true);
assert.equal(abilityRollsDamageTwiceHigher(["transistor"], { moveType: "electric" }), true);
assert.equal(abilityRollsDamageTwiceHigher(["technician"], { movePp: 15 }), true);
assert.equal(abilityRollsDamageTwiceHigher(["technician"], { movePp: 14 }), false, "Técnico exige 15 PP máximos o más");
assert.equal(abilityRollsDamageTwiceHigher([], { moveType: "fire", movePp: 20 }), false);
assert.equal(abilityRollsDamageTwiceHigher(["overgrow"], { moveType: "fire", movePp: 20 }), false, "Una habilidad sin este efecto no aporta nada");

assert.equal(abilityProtectsHeldItem(["sticky-hold"]), true);
assert.equal(abilityProtectsHeldItem(["overgrow"]), false);
assert.equal(abilityProtectsHeldItem([]), false);
assert.equal(abilityPreventsHoldingItem(["klutz"]), true);
assert.equal(abilityPreventsHoldingItem(["overgrow"]), false);
assert.equal(abilityPreventsHoldingItem([]), false);

assert.equal(abilityBlocksForcedSwitch(["suction-cups"]), true);
assert.equal(abilityBlocksForcedSwitch(["guard-dog"]), true);
assert.equal(abilityBlocksForcedSwitch(["overgrow"]), false, "Una habilidad sin este efecto no aporta nada");
assert.equal(abilityBlocksForcedSwitch([]), false);

assert.equal(abilityGrantsDebuffImmunity(["clear-body"]), true);
assert.equal(abilityGrantsDebuffImmunity(["full-metal-body"]), true);
assert.equal(abilityGrantsDebuffImmunity(["white-smoke"]), true);
assert.equal(abilityGrantsDebuffImmunity(["overgrow"]), false, "Una habilidad sin este efecto no aporta nada");
assert.equal(abilityGrantsDebuffImmunity([]), false);

assert.equal(abilityWeatherDamageBonus(["solar-power"], "sun"), 2);
assert.equal(abilityWeatherDamageBonus(["solar-power"], "rain"), 0, "Poder Solar solo con sol");
assert.equal(abilityWeatherDamageBonus([], "sun"), 0);
assert.equal(abilityWeatherStabBonus(["sand-force"], "sandstorm"), 2);
assert.equal(abilityWeatherStabBonus(["sand-force"], "sun"), 0, "Fuerza de Arena solo con tormenta de arena");
assert.equal(abilityWeatherStabBonus([], "sandstorm"), 0);

assert.equal(abilityMoveTypeOverride(["galvanize"], "normal"), "electric");
assert.equal(abilityMoveTypeOverride(["pixilate"], "normal"), "fairy");
assert.equal(abilityMoveTypeOverride(["refrigerate"], "normal"), "ice");
assert.equal(abilityMoveTypeOverride(["galvanize"], "fire"), null, "Solo cambia movimientos de tipo Normal");
assert.equal(abilityMoveTypeOverride(["normalize"], "fire"), "normal", "Normalizar cambia cualquier tipo");
assert.equal(abilityMoveTypeOverride(["normalize"], "normal"), "normal");
assert.equal(abilityMoveTypeOverride([], "normal"), null);
assert.equal(abilityMoveTypeOverride(["overgrow"], "normal"), null, "Una habilidad sin este efecto no aporta nada");

for (const types of Object.values(TYPE_TRIGGERED_ADVANTAGE_ABILITIES)) for (const type of types) assert.ok(DAMAGE_TYPES.has(type), `Tipo de daño desconocido: ${type}`);
assert.equal(abilityTypeTriggeredAdvantage(["justified"], "dark"), true);
assert.equal(abilityTypeTriggeredAdvantage(["justified"], "fire"), false, "Firmeza solo reacciona a Siniestro");
assert.equal(abilityTypeTriggeredAdvantage(["rattled"], "bug"), true);
assert.equal(abilityTypeTriggeredAdvantage(["rattled"], "ghost"), true);
assert.equal(abilityTypeTriggeredAdvantage(["toxic-boost"], "poison"), true);
assert.equal(abilityTypeTriggeredAdvantage(["thermal-exchange"], "fire"), true);
assert.equal(abilityTypeTriggeredAdvantage([], "dark"), false);
assert.equal(abilityTypeTriggeredAdvantage(["justified"], null), false, "Sin tipo de daño conocido no reacciona");
assert.equal(abilityBlocksStatus(["thermal-exchange"], "burned"), true, "Intercambio Térmico también es inmune a Quemado");

assert.equal(abilitySaveDcBonus(["serene-grace"]), 1);
assert.equal(abilitySaveDcBonus([]), 0);
assert.equal(abilityIgnoresRecoil(["rock-head"]), true);
assert.equal(abilityIgnoresRecoil([]), false);
assert.equal(abilitySharpnessDoublesModifier(["sharpness"], "Night Slash"), true);
assert.equal(abilitySharpnessDoublesModifier(["sharpness"], "Sacred Sword"), true);
assert.equal(abilitySharpnessDoublesModifier(["sharpness"], "Aerial Ace"), false, "Sin ninguna de las palabras clave no dobla el modificador");
assert.equal(abilitySharpnessDoublesModifier(["sharpness"], "Wedge Attack"), false, "\"wedge\" no debe confundirse con \"edge\"");
assert.equal(abilitySharpnessDoublesModifier([], "Night Slash"), false);

assert.equal(abilityGrantsUnburdenSpeed(["unburden"]), true);
assert.equal(abilityGrantsUnburdenSpeed([]), false);

assert.equal(abilityBerryHealBonus(["ripen"], 10, 100), 20, "Madurez dobla la curación de la baya");
assert.equal(abilityBerryHealBonus(["cheek-pouch"], 10, 100), 20, "Buche suma el 10% de los PG máximos");
assert.equal(abilityBerryHealBonus(["cheek-pouch"], 10, 25), 13, "El 10% se redondea hacia arriba (2.5 -> 3)");
assert.equal(abilityBerryHealBonus(["ripen", "cheek-pouch"], 10, 100), 30, "Madurez dobla la base y Buche se suma después, no se duplica");
assert.equal(abilityBerryHealBonus([], 10, 100), 10);

assert.deepEqual(abilityLowHpCombatModifiers(["defeatist"], 0.2), { attackDisadvantage: true, saveTargetsAdvantage: false });
assert.deepEqual(abilityLowHpCombatModifiers(["berserk"], 0.2), { attackDisadvantage: true, saveTargetsAdvantage: true });
assert.deepEqual(abilityLowHpCombatModifiers(["defeatist"], 0.3), { attackDisadvantage: false, saveTargetsAdvantage: false }, "Por encima del 25% no aplica");
assert.deepEqual(abilityLowHpCombatModifiers([], 0.1), { attackDisadvantage: false, saveTargetsAdvantage: false });
assert.equal(abilityLowHpDamageDiceMultiplier(["berserk"], 0.2), 2);
assert.equal(abilityLowHpDamageDiceMultiplier(["berserk"], 0.3), 1, "Por encima del 25% no dobla los dados");
assert.equal(abilityLowHpDamageDiceMultiplier(["defeatist"], 0.2), 1, "Desertor no dobla dados, solo da desventaja");
assert.equal(abilityLowHpDamageDiceMultiplier([], 0.1), 1);

assert.equal(abilityRollsDamageTwiceHigher(["iron-fist"], { moveName: "Mega Punch" }), true);
assert.equal(abilityRollsDamageTwiceHigher(["iron-fist"], { moveName: "Tackle" }), false, "Sin \"punch\" en el nombre no aplica Puño Férreo");
assert.equal(abilityRollsDamageTwiceHigher(["strong-jaw"], { moveId: "crunch" }), true);
assert.equal(abilityRollsDamageTwiceHigher(["strong-jaw"], { moveId: "tackle" }), false, "Mandíbula Firme solo con movimientos de la lista");

assert.equal(abilityBlocksBulletproofMove(["bulletproof"], "Shadow Ball"), true);
assert.equal(abilityBlocksBulletproofMove(["bulletproof"], "Bullet Seed"), true);
assert.equal(abilityBlocksBulletproofMove(["bulletproof"], "Egg Bomb"), true);
assert.equal(abilityBlocksBulletproofMove(["bulletproof"], "Tackle"), false, "Sin Bullet/Ball/Bomb en el nombre no aplica");
assert.equal(abilityBlocksBulletproofMove([], "Shadow Ball"), false);

for (const { status } of Object.values(OWN_MELEE_HIT_STATUS_ABILITIES)) assert.ok(statusIds.has(status), `Estado desconocido: ${status}`);
assert.deepEqual(ownMeleeHitStatusTrigger(["poison-touch"]), { ability: "poison-touch", mode: "chance", die: 10, on: 10, status: "poisoned" });
assert.deepEqual(ownMeleeHitStatusTrigger(["toxic-chain"]), { ability: "toxic-chain", mode: "save", dc: 16, saveAbility: "con", status: "badly-poisoned" });
assert.equal(ownMeleeHitStatusTrigger(["overgrow"]), null, "Una habilidad sin este efecto no aporta nada");
assert.equal(ownMeleeHitStatusTrigger([]), null);

assert.equal(abilityGrantsAnalyticAdvantage(["analytic"]), true);
assert.equal(abilityGrantsAnalyticAdvantage([]), false);
assert.equal(abilityBlocksRepeatingMove(["truant"]), true);
assert.equal(abilityBlocksRepeatingMove([]), false);

assert.equal(abilityIceScalesDiceMultiplier(["ice-scales"], ["int"]), 0.5);
assert.equal(abilityIceScalesDiceMultiplier(["ice-scales"], ["wis", "cha"]), 0.5);
assert.equal(abilityIceScalesDiceMultiplier(["ice-scales"], ["str"]), 1, "Escamas de Hielo no resiste movimientos con potencia física");
assert.equal(abilityIceScalesDiceMultiplier([], ["int"]), 1);
assert.equal(abilityDoublesDiceAgainstPoisoned(["merciless"], ["poisoned"]), true);
assert.equal(abilityDoublesDiceAgainstPoisoned(["merciless"], ["badly-poisoned"]), true);
assert.equal(abilityDoublesDiceAgainstPoisoned(["merciless"], ["burned"]), false, "Despiadado solo contra Envenenado");
assert.equal(abilityDoublesDiceAgainstPoisoned([], ["poisoned"]), false);
assert.equal(abilityGrantsMeleeAttackAdvantage(["intrepid-sword"]), true);
assert.equal(abilityGrantsMeleeAttackAdvantage([]), false);
assert.equal(abilityGrantsSelfAttackAdvantage(["no-guard"]), true);
assert.equal(abilityGrantsSelfAttackAdvantage([]), false);
assert.deepEqual(abilityTargetAttackRollModifier(["no-guard"], false), { advantage: true, disadvantage: false });
assert.deepEqual(abilityTargetAttackRollModifier(["dauntless-shield"], true), { advantage: false, disadvantage: true });
assert.deepEqual(abilityTargetAttackRollModifier(["dauntless-shield"], false), { advantage: false, disadvantage: false }, "Escudo Intrépido solo cuerpo a cuerpo");
assert.deepEqual(abilityTargetAttackRollModifier(["tangled-feet"], false, ["confused"]), { advantage: false, disadvantage: true });
assert.deepEqual(abilityTargetAttackRollModifier([], true), { advantage: false, disadvantage: false });
assert.equal(abilityHealsFromPoisonTick(["poison-heal"]), true);
assert.equal(abilityHealsFromPoisonTick([]), false);
assert.deepEqual(hpThresholdSwitchTrigger(["emergency-exit"], 0.6, 0.4), { ability: "emergency-exit", forced: false });
assert.deepEqual(hpThresholdSwitchTrigger(["wimp-out"], 0.6, 0.4), { ability: "wimp-out", forced: true });
assert.equal(hpThresholdSwitchTrigger(["emergency-exit"], 0.4, 0.3), null, "Ya estaba por debajo del umbral, no cruza esta vez");
assert.equal(hpThresholdSwitchTrigger([], 0.6, 0.4), null);

assert.deepEqual(recallAbilityAdjustment(["natural-cure"], ["poisoned"], null, 1), { clearConditions: true });
assert.equal(recallAbilityAdjustment(["natural-cure"], [], null, 1), null, "Sin estados que curar no hay nada que ajustar");
assert.deepEqual(recallAbilityAdjustment(["regenerator"], [], { value: 10, max: 50 }, 5), { healedHp: 15 });
assert.equal(recallAbilityAdjustment(["regenerator"], [], { value: 50, max: 50 }, 5), null, "Ya a PG máximos no cura nada");
assert.deepEqual(
  recallAbilityAdjustment(["natural-cure", "regenerator"], ["poisoned"], { value: 10, max: 50 }, 5),
  { clearConditions: true, healedHp: 15 }
);
assert.equal(recallAbilityAdjustment([], ["poisoned"], { value: 10, max: 50 }, 5), null);
assert.equal(abilityDoublesRecoilStab(["reckless"]), true);
assert.equal(abilityDoublesRecoilStab([]), false);
assert.equal(abilityRollsSuperEffectiveTwice(["neuroforce"], 2), true);
assert.equal(abilityRollsSuperEffectiveTwice(["neuroforce"], 1), false, "Sin ser supereficaz no se activa");
assert.equal(abilityRollsSuperEffectiveTwice([], 2), false);

// Lote 41: Motor de Vapor/Vigor (reacción propia, no de contacto), Más/Menos
// (aura, aura-abilities.mjs) y Desafiante (lote 41 también, pero se resuelve
// en pokemonCombatModifiers()/move-modifiers.mjs — probado ahí, no aquí).
// Multiescama/Escudo Sombra/Robustez ya existían (lote 9, damage-shields.mjs)
// pero no estaban en `catalogued`; se suman aquí para que la cuenta total
// de habilidades automatizadas los refleje.
assert.equal(damageTypeSelfReactionTrigger(["steam-engine"], "fire"), "steam-engine");
assert.equal(damageTypeSelfReactionTrigger(["steam-engine"], "water"), "steam-engine");
assert.equal(damageTypeSelfReactionTrigger(["steam-engine"], "electric"), null, "Motor de Vapor solo reacciona a Fuego o Agua");
assert.equal(damageTypeSelfReactionTrigger(["stamina"], "electric"), "stamina", "Vigor reacciona a cualquier tipo de daño");
assert.equal(damageTypeSelfReactionTrigger([], "fire"), null);
assert.equal(plusMinusAttackDamageBonus(["plus"], [{ getFlag: () => ["minus"] }]), 2);
assert.equal(plusMinusAttackDamageBonus(["plus"], [{ getFlag: () => ["overgrow"] }]), 0, "Sin un aliado con Más o Menos no hay bono");
assert.equal(plusMinusAttackDamageBonus(["overgrow"], [{ getFlag: () => ["plus"] }]), 0, "Hace falta conocer Más o Menos uno mismo");
assert.equal(plusMinusAttackDamageBonus(["minus"], []), 0);

// Lote 42: motor de recursos "una vez por descanso corto/largo"
// (Fuerza Bruta/Energía Pura/Simple, primer uso). resetAbilityRestResourcesAfterRest()
// toca Item/actor reales, así que solo se prueban aquí sus piezas puras
// (abilityRestUseAvailable/markAbilityRestUseSpent/abilityUsesAfterRest); el
// enganche a dnd5e.restCompleted vive en main.mjs y no tiene validador propio,
// igual que restoreHeldItemChargesAfterRest() (held-items.mjs).
assert.equal(abilityRestUseAvailable({}, "huge-power"), true, "Sin usos registrados el recurso está disponible");
assert.equal(abilityRestUseAvailable({ abilityUses: { "huge-power": true } }, "huge-power"), false);
assert.equal(abilityRestUseAvailable({}, "overgrow"), false, "Una habilidad que no es un recurso de descanso nunca está \"disponible\"");
assert.deepEqual(markAbilityRestUseSpent({ level: 5 }, "simple"), { level: 5, abilityUses: { simple: true } });
assert.deepEqual(markAbilityRestUseSpent({ abilityUses: { simple: true } }, "pure-power"), { abilityUses: { simple: true, "pure-power": true } });
assert.deepEqual(markAbilityRestUseSpent({ level: 5 }, "overgrow"), { level: 5 }, "Una habilidad que no es un recurso de descanso no modifica la instancia");
assert.deepEqual(abilityUsesAfterRest({ "huge-power": true, simple: true }, "short"), {}, "Un descanso corto limpia todos los recursos de descanso corto conocidos");
assert.deepEqual(abilityUsesAfterRest({ "huge-power": true }, "long"), {}, "Un descanso largo también limpia los de descanso corto");
assert.equal(typeof resetAbilityRestResourcesAfterRest, "function");

// Lotes 44-49: familias sonoras/climáticas, Rompemoldes, STAB, mitigación,
// Presión y Encadenado.
assert.equal(isSoundMove("hyper-voice", "Hyper Voice"), true);
assert.equal(isSoundMove("tackle", "Tackle"), false);
assert.equal(abilityBlocksIncomingMove(["soundproof"], { moveId: "hyper-voice", moveName: "Hyper Voice" }), "soundproof");
assert.equal(abilityBlocksIncomingMove(["damp"], { moveId: "explosion" }), "damp");
assert.equal(abilityBlocksIncomingMove(["overcoat"], { moveId: "weather-ball" }), "overcoat");
assert.equal(abilityBlocksIncomingMove(["overcoat"], { moveId: "tackle" }), null);
assert.equal(abilitySuppressesTargetAbilities(["mold-breaker"]), true);
assert.equal(abilitySuppressesTargetAbilities(["overgrow"]), false);
assert.equal(abilityMoveDamageBonus(["mega-launcher"], { moveName: "Dragon Pulse", proficiency: 4 }), 4);
assert.equal(abilityMoveDamageBonus(["mega-launcher"], { moveName: "Tackle", proficiency: 4 }), 0);
assert.equal(abilityForcesMoveStab(["tough-claws"], true), true);
assert.equal(abilityForcesMoveStab(["tough-claws"], false), false);
assert.equal(abilityMoveStabBonus(["tough-claws"], { moveType: "normal", speciesTypes: ["normal"], isMelee: true }), 2);
assert.equal(abilityMoveStabBonus(["punk-rock"], { moveId: "hyper-voice", moveType: "normal", speciesTypes: ["electric"] }), 2);
assert.equal(abilityTargetDamageDiceMultiplier(["tinted-lens"], [], { targetResists: true }), 2);
assert.equal(abilityTargetDamageDiceMultiplier([], ["fluffy"], { isMelee: true, moveType: "normal" }), 0.5);
assert.equal(abilityTargetDamageDiceMultiplier([], ["fluffy"], { isMelee: true, moveType: "fire" }), 1);
assert.equal(abilityTargetDamageDiceMultiplier([], ["punk-rock"], { moveId: "hyper-voice" }), 0.5);
assert.equal(abilityRollsVulnerableDamageTwiceLower(["prism-armor"], true), true);
assert.equal(abilityRollsVulnerableDamageTwiceLower(["prism-armor"], false), false);
assert.equal(abilityMovePpCost(["pressure"], true), 2);
assert.equal(abilityMovePpCost(["pressure"], false), 1);
assert.equal(abilityMinimumChainExtraHits(["skill-link"], "fury-swipes"), 1);
assert.equal(abilityMinimumChainExtraHits([], "fury-swipes"), 0);
assert.equal(abilityMoveTypeOverride(["liquid-voice"], "normal", { moveId: "hyper-voice", moveName: "Hyper Voice" }), "water");
assert.equal(abilityMaximumHp(["paper-thin"], 50), 1);
assert.equal(abilityMaximumHp([], 50), 50);
assert.equal(abilityIgnoresPoisonStatusTypeImmunity(["corrosion"], "poisoned"), true);
assert.equal(abilityIgnoresPoisonStatusTypeImmunity(["corrosion"], "burned"), false);
assert.equal(abilityGrantsStatusSaveAdvantage(["wonder-skin"], ["paralyzed"]), true);
assert.equal(abilityGrantsStatusSaveAdvantage(["wonder-skin"], ["confused"]), false);
assert.equal(abilityProtectsAttackDamageBonuses(["hyper-cutter"]), true);
assert.equal(abilityAutoConsumesHealingBerry(["gluttony"]), true);
assert.deepEqual(abilityVulnerabilityFilter(["filter"], true), { die: 4, on: 4, multiplier: 0.5 });
assert.equal(abilityIgnoresNormalFightingImmunity(["scrappy"], "normal"), true);
assert.equal(abilityIgnoresNormalFightingImmunity(["minds-eye"], "fighting"), true);
assert.equal(abilityIgnoresAbilityDamageImmunity(["mold-breaker"], ["water-absorb"], "water"), true);
assert.equal(abilityIgnoresAbilityDamageImmunity([], ["water-absorb"], "water"), false);
assert.equal(abilityFaintedAllyAttackBonus(["supreme-overlord"], 8), 5);
assert.equal(abilitySlowStartActive(["slow-start"], 3, 4), true);
assert.equal(abilitySlowStartActive(["slow-start"], 3, 5), false);
assert.equal(abilityMoveUserTypeChange(["protean"], "fire"), "fire");
assert.equal(abilityMoveUserTypeChange(["libero"], "water"), "water");
assert.equal(abilityMoveUserTypeChange([], "fire"), null);
assert.equal(abilityReceivedDamageTypeChange(["color-change"], "ghost"), "ghost");
assert.equal(abilityReceivedDamageTypeChange(["color-change"], "typeless"), null);
const wonderTraits = { dr: { value: [] }, dv: { value: ["fire"] }, di: { value: [] } };
applyAbilityDefenses(wonderTraits, ["wonder-guard"]);
assert.ok(wonderTraits.di.value.includes("water") && !wonderTraits.di.value.includes("fire"), "Superguarda inmuniza todo salvo vulnerabilidades");
const fluffyTraits = { dr: { value: ["fire"] }, dv: { value: [] }, di: { value: [] } };
applyAbilityDefenses(fluffyTraits, ["fluffy"]);
assert.ok(fluffyTraits.dv.value.includes("fire") && !fluffyTraits.dr.value.includes("fire"), "Peluche fuerza vulnerabilidad a Fuego");

assert.equal(badDreamsDamage(true, [
  { abilities: ["bad-dreams"], proficiency: 3 },
  { abilities: ["bad-dreams"], proficiency: 5 }
]), 5, "Mal Sueño usa la competencia mayor y no acumula varias fuentes");
assert.equal(badDreamsDamage(false, [{ abilities: ["bad-dreams"], proficiency: 5 }]), 0);
assert.equal(shedSkinStatus(["shed-skin"], ["poisoned", "burned"], 4), "poisoned");
assert.equal(shedSkinStatus(["shed-skin"], ["poisoned"], 3), null);
globalThis.foundry ??= { utils: { deepClone: value => structuredClone(value) } };
assert.deepEqual(abilityAdjustedMoveModifiers(["contrary"], { ac: 2, attack: -1, abilities: { str: 4 } }), { ac: -2, attack: 1, abilities: { str: -4 } });
assert.deepEqual(abilityAdjustedMoveModifiers(["big-pecks"], { ac: -3, speed: -10 }), { ac: 0, speed: -10 });
assert.deepEqual(abilityAdjustedMoveModifiers(["contrary", "big-pecks"], { ac: 2 }), { ac: 0 }, "Sacapecho también bloquea una reducción invertida por Respondón");
assert.deepEqual(abilitySheerForceProfile(["sheer-force"], { damaging: true, hasSecondaryEffect: true }), { moveModifierMultiplier: 2, suppressSecondaryEffect: true });
assert.deepEqual(abilitySheerForceProfile(["sheer-force"], { damaging: false, hasSecondaryEffect: true }), { moveModifierMultiplier: 1, suppressSecondaryEffect: false });
assert.deepEqual(abilityCriticalDamageProfile(["sniper"], "2d6 + 1d4 + 3", true, true), { formula: "6d6 + 3d4 + 3", systemCritical: false, multiplier: 3 });
assert.deepEqual(abilityCriticalDamageProfile([], "2d6 + 3", true, true), { formula: "2d6 + 3", systemCritical: true, multiplier: 2 });
assert.deepEqual(abilityCriticalDamageProfile([], "2d6 + 3", true, false), { formula: "4d6 + 3", systemCritical: false, multiplier: 2 });
assert.equal(abilityMoveActivationTime(["electric-surge"], { moveId: "electric-terrain", time: "1 action" }), "1 bonus action");
assert.equal(abilityMoveActivationTime(["triage"], { moveId: "recover", time: "1 action", healing: true }), "1 bonus action");
assert.equal(abilityMoveActivationTime(["triage"], { moveId: "tackle", time: "1 action", healing: false }), "1 action");
assert.equal(abilityTriggeredMoveModifierMultiplier(["electromorphosis"], { electromorphosis: true }, "electric"), 2);
assert.equal(abilityTriggeredMoveModifierMultiplier(["electromorphosis"], { electromorphosis: true }, "fire"), 1);

console.log(`Pokémon abilities validation passed: ${automatedAbilityIds.size}/${abilities.length} catalogued as automated; all referenced abilities and move families are valid.`);
