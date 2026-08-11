import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = async file => JSON.parse(await readFile(resolve(root, file), "utf8"));
const [pokemon, moves, abilities, items] = await Promise.all([
  read("pokemon.json"), read("moves.json"), read("abilities.json"), read("items.json")
]);

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
const moveIds = new Set(moves.moves.map(move => move.id));
const abilityIds = new Set(abilities.items.map(ability => ability.id));
const missingStartMoves = new Set();
const missingAbilities = new Set();
for (const species of pokemon.items) {
  for (const id of species.moves?.start ?? []) if (!moveIds.has(id)) missingStartMoves.add(id);
  for (const ability of species.abilities ?? []) if (!abilityIds.has(ability.id)) missingAbilities.add(ability.id);
}
if (missingStartMoves.size) throw new Error(`Missing starting moves: ${[...missingStartMoves].join(", ")}`);
if (missingAbilities.size) throw new Error(`Missing abilities: ${[...missingAbilities].join(", ")}`);
console.log(`Validated ${pokemon.items.length} Pokémon, ${moves.moves.length} moves, ${abilities.items.length} abilities, and ${items.items.length} items.`);
