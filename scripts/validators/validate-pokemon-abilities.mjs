import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AC_STATUS_BONUS_ABILITIES, CONTACT_DAMAGE_ABILITIES, CONTACT_STATUS_ABILITIES, FULL_STATUS_IMMUNITY_ABILITIES, GUTS_IGNORED_STATUSES, IMMUNITY_ABILITIES, LOW_HP_STAB_ABILITIES, RESISTANCE_ABILITIES, SELF_STATUS_DAMAGE_BOOST_ABILITIES, SPEED_STATUS_BONUS_ABILITIES, STATUS_IMMUNITY_ABILITIES, WEATHER_ABILITIES, WEATHER_HEAL_ABILITIES,
  abilityBlocksStatus, abilityDeployWeather, abilityIgnoresStatusPenalty, abilityLowHpStabBonus, abilityMoveProfile, abilitySelfStatusDamageBonus, abilityStatusBonusEffectSource, abilityWeatherHeal, applyAbilityDefenses, contactDamageReaction, contactStatusReaction, pokemonAbilityDefenses
} from "../pokemon/pokemon-abilities.mjs";
import { POKEMON_STATUS_EFFECTS } from "../combat/status-effects.mjs";

const abilities = JSON.parse(fs.readFileSync(new URL("../../data/abilities.json", import.meta.url), "utf8")).items;
const abilityIds = new Set(abilities.map(entry => entry.id));
const MOVE_PROFILE_ABILITY_IDS = ["compound-eyes", "gale-wings", "steelworker", "rivalry", "super-luck"];
const CURSED_BODY_ABILITY_ID = "cursed-body";
const SELF_STATUS_ABILITY_IDS = ["guts", "competitive", "flare-boost"];
const catalogued = [
  ...Object.keys(IMMUNITY_ABILITIES), ...Object.keys(RESISTANCE_ABILITIES), ...Object.keys(WEATHER_ABILITIES),
  ...Object.keys(STATUS_IMMUNITY_ABILITIES), ...FULL_STATUS_IMMUNITY_ABILITIES, ...Object.keys(CONTACT_DAMAGE_ABILITIES), ...LOW_HP_STAB_ABILITIES,
  ...MOVE_PROFILE_ABILITY_IDS, ...Object.keys(CONTACT_STATUS_ABILITIES), CURSED_BODY_ABILITY_ID, ...SELF_STATUS_ABILITY_IDS,
  ...Object.keys(AC_STATUS_BONUS_ABILITIES), ...Object.keys(SPEED_STATUS_BONUS_ABILITIES), ...Object.keys(WEATHER_HEAL_ABILITIES)
];
const unknown = catalogued.filter(id => !abilityIds.has(id));
assert.deepEqual(unknown, [], `Habilidades sin correspondencia en data/abilities.json: ${unknown.join(", ")}`);

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

console.log(`Pokémon abilities validation passed: ${Object.keys(IMMUNITY_ABILITIES).length} immunities, ${Object.keys(RESISTANCE_ABILITIES).length} resistances, ${Object.keys(WEATHER_ABILITIES).length} weather-setters, ${Object.keys(STATUS_IMMUNITY_ABILITIES).length + FULL_STATUS_IMMUNITY_ABILITIES.size} status immunities, ${Object.keys(CONTACT_DAMAGE_ABILITIES).length} contact damage reactions, ${Object.keys(CONTACT_STATUS_ABILITIES).length + 1} contact status reactions, ${LOW_HP_STAB_ABILITIES.size} low-HP STAB doublers, ${MOVE_PROFILE_ABILITY_IDS.length} move-profile bonuses, ${Object.keys(SELF_STATUS_DAMAGE_BOOST_ABILITIES).length} self-status damage boosters + Guts, ${Object.keys(AC_STATUS_BONUS_ABILITIES).length + Object.keys(SPEED_STATUS_BONUS_ABILITIES).length} status AC/speed bonuses, ${Object.keys(WEATHER_HEAL_ABILITIES).length} weather-healing abilities out of ${abilities.length} known abilities.`);
