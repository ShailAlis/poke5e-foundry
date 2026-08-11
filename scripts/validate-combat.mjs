import { POKEMON_TYPES, damageTraitsForPokemonTypes, normalizeMoveDamageTypes, pokemonDefenses, registerPokemonDamageTypes } from "./combat.mjs";

globalThis.CONFIG = { DND5E: { damageTypes: { fire: { label: "Fire (D&D)" } } } };
globalThis.Color = class Color { constructor(value) { this.value = value; } };
registerPokemonDamageTypes();
if (!CONFIG.DND5E.damageTypes.grass || !CONFIG.DND5E.damageTypes.typeless) throw new Error("Pokémon damage types were not registered.");
if (CONFIG.DND5E.damageTypes.fire.label !== "Fire (D&D)") throw new Error("Native D&D damage types must not be replaced.");

const fire = pokemonDefenses(["fire"]);
if (!fire.resistances.includes("grass")) throw new Error("Fire must resist Grass.");
if (!fire.vulnerabilities.includes("water")) throw new Error("Fire must be vulnerable to Water.");

const fireFlying = pokemonDefenses(["fire", "flying"]);
if (!fireFlying.vulnerabilities.includes("rock")) throw new Error("Fire/Flying must be vulnerable to Rock.");
if (fireFlying.resistances.includes("rock")) throw new Error("A type cannot be both resistant and vulnerable.");
if (!fireFlying.immunities.includes("ground")) throw new Error("Fire/Flying must be immune to Ground.");

const waterGround = pokemonDefenses(["water", "ground"]);
if (!waterGround.immunities.includes("electric")) throw new Error("Water/Ground must be immune to Electric.");
if (!waterGround.vulnerabilities.includes("grass")) throw new Error("Water/Ground must be vulnerable to Grass.");

const traits = damageTraitsForPokemonTypes(["fire"]);
if (!traits.dr.value.includes("grass") || !traits.dv.value.includes("water")) throw new Error("Invalid D&D damage traits.");
if (normalizeMoveDamageTypes("healing")[0] !== "healing") throw new Error("Scalar move damage types must be accepted.");
if (normalizeMoveDamageTypes(["flying", "fighting"]).length !== 2) throw new Error("Variable move types must be preserved.");

for (const primary of POKEMON_TYPES) {
  for (const secondary of POKEMON_TYPES) {
    const defenses = pokemonDefenses(primary === secondary ? [primary] : [primary, secondary]);
    const combined = [...defenses.vulnerabilities, ...defenses.resistances, ...defenses.immunities];
    if (new Set(combined).size !== combined.length) throw new Error(`${primary}/${secondary}: overlapping defenses.`);
    if (combined.some(type => !POKEMON_TYPES.includes(type))) throw new Error(`${primary}/${secondary}: unknown defense type.`);
  }
}

console.log("Validated Pokémon type effectiveness and D&D damage traits.");
