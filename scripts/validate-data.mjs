/**
 * Validador de los JSON de `data/`, ejecutado por `npm run check`. No importa
 * código del módulo: comprueba los datos en bruto antes de que nadie los use.
 *
 * Verifica volumen mínimo e ids únicos de cada catálogo, que los tipos y la
 * proporción de sexos de cada especie sean válidos, que sus movimientos
 * iniciales y habilidades existan, que las velocidades usen tipos conocidos, que
 * las evoluciones apunten a especies reales con condiciones reconocidas y que
 * los tipos de daño de los movimientos estén dentro de los admitidos.
 * Falla con un throw a la primera incoherencia.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isAvailablePokemon } from "./data-service.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = async file => JSON.parse(await readFile(resolve(root, file), "utf8"));
const [pokemon, moves, abilities, items, evolutions] = await Promise.all([
  read("pokemon.json"), read("moves.json"), read("abilities.json"), read("items.json"), read("evolution.json")
]);

if (isAvailablePokemon({ number: 0 })) throw new Error("Pokémon numbered 0 must not be available.");
if (!isAvailablePokemon({ number: 1 })) throw new Error("Numbered Pokémon must remain available.");

const checks = [
  ["Pokémon", pokemon.items, 1000],
  ["moves", moves.moves, 700],
  ["abilities", abilities.items, 250],
  ["items", items.items, 300]
];
for (const [label, values, minimum] of checks) {
  if (!Array.isArray(values) || values.length < minimum) throw new Error(`${label}: expected at least ${minimum} entries.`);
  const ids = new Set(values.map(value => value.id));
  if (ids.size !== values.length) throw new Error(`${label}: duplicate ids found.`);
}
if (!Array.isArray(evolutions.items) || evolutions.items.length < 500) throw new Error("Expected at least 500 evolutions.");
const moveIds = new Set(moves.moves.map(move => move.id));
const abilityIds = new Set(abilities.items.map(ability => ability.id));
const missingStartMoves = new Set();
const missingAbilities = new Set();
const speedTypes = new Set(["walking", "flying", "swimming", "burrowing", "climbing", "hover"]);
const pokemonTypes = new Set(["bug", "dark", "dragon", "electric", "fairy", "fighting", "fire", "flying", "ghost", "grass", "ground", "ice", "normal", "poison", "psychic", "rock", "steel", "water"]);
for (const species of pokemon.items) {
  if (!species.type?.length || species.type.some(type => !pokemonTypes.has(type))) throw new Error(`${species.id}: invalid Pokémon type.`);
  if (!/^\d+:\d+$/.test(species.gender ?? "")) throw new Error(`${species.id}: invalid gender ratio ${species.gender}.`);
  for (const id of species.moves?.start ?? []) if (!moveIds.has(id)) missingStartMoves.add(id);
  for (const ability of species.abilities ?? []) if (!abilityIds.has(ability.id)) missingAbilities.add(ability.id);
  if (!species.speed?.length) throw new Error(`${species.id}: missing movement speed.`);
  for (const speed of species.speed) {
    if (!speedTypes.has(speed.type)) throw new Error(`${species.id}: unknown movement type ${speed.type}.`);
    if (!Number.isFinite(Number(speed.value)) || Number(speed.value) < 0) throw new Error(`${species.id}: invalid ${speed.type} speed.`);
  }
}
const pokemonIds = new Set(pokemon.items.map(species => species.id));
const evolutionConditionTypes = new Set(["level", "item", "loyalty", "move", "move-type", "gender", "time", "special"]);
for (const evolution of evolutions.items) {
  if (!pokemonIds.has(evolution.from) || !pokemonIds.has(evolution.to)) throw new Error(`${evolution.id}: unknown evolution species.`);
  if (!evolution.conditions?.length) throw new Error(`${evolution.id}: evolution has no conditions.`);
  for (const condition of evolution.conditions) {
    if (!evolutionConditionTypes.has(condition.type)) throw new Error(`${evolution.id}: unknown condition ${condition.type}.`);
  }
}
const moveDamageTypes = new Set([...pokemonTypes, "healing", "stellar", "typeless"]);
for (const move of moves.moves) {
  const damageTypes = Array.isArray(move.damage?.type) ? move.damage.type : move.damage?.type ? [move.damage.type] : [];
  for (const type of damageTypes) if (!moveDamageTypes.has(type)) throw new Error(`${move.id}: unknown damage type ${type}.`);
}
if (missingStartMoves.size) throw new Error(`Missing starting moves: ${[...missingStartMoves].join(", ")}`);
if (missingAbilities.size) throw new Error(`Missing abilities: ${[...missingAbilities].join(", ")}`);
console.log(`Validated ${pokemon.items.length} Pokémon, ${moves.moves.length} moves, ${abilities.items.length} abilities, and ${items.items.length} items.`);
