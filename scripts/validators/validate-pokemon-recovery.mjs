import assert from "node:assert/strict";
import { fullyHealedPokemonInstance } from "../pokemon/recovery.mjs";

const original = {
  hp: { value: 0, max: 37 },
  conditions: ["burned", "confused"],
  moves: [{ moveId: "ember", pp: { value: 0, max: 12 } }, { moveId: "tackle", pp: { value: 3, max: 20 } }],
  level: 5
};
const healed = fullyHealedPokemonInstance(original);
assert.notEqual(healed, original);
assert.deepEqual(healed.hp, { value: 37, max: 37 });
assert.deepEqual(healed.conditions, []);
assert.deepEqual(healed.moves.map(entry => entry.pp.value), [12, 20]);
assert.equal(original.hp.value, 0, "La recuperación no debe mutar la instancia original.");
assert.deepEqual(fullyHealedPokemonInstance({ hp: { value: 0, max: 0 } }).hp, { value: 1, max: 1 });
console.log("Pokémon full-recovery validation passed.");
