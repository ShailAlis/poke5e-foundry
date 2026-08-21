import assert from "node:assert/strict";
import fs from "node:fs";
import { IMMUNITY_ABILITIES, RESISTANCE_ABILITIES, WEATHER_ABILITIES, abilityDeployWeather, applyAbilityDefenses, pokemonAbilityDefenses } from "../pokemon/pokemon-abilities.mjs";

const abilities = JSON.parse(fs.readFileSync(new URL("../../data/abilities.json", import.meta.url), "utf8")).items;
const abilityIds = new Set(abilities.map(entry => entry.id));
const catalogued = [...Object.keys(IMMUNITY_ABILITIES), ...Object.keys(RESISTANCE_ABILITIES), ...Object.keys(WEATHER_ABILITIES)];
const unknown = catalogued.filter(id => !abilityIds.has(id));
assert.deepEqual(unknown, [], `Habilidades sin correspondencia en data/abilities.json: ${unknown.join(", ")}`);

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

console.log(`Pokémon abilities validation passed: ${Object.keys(IMMUNITY_ABILITIES).length} immunities, ${Object.keys(RESISTANCE_ABILITIES).length} resistances, ${Object.keys(WEATHER_ABILITIES).length} weather-setters out of ${abilities.length} known abilities.`);
