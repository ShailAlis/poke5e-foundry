import fs from "node:fs";
import { MAX_KNOWN_MOVES, applyLearnedMove, moveEligibility } from "./move-learning.mjs";

const pokemon = JSON.parse(fs.readFileSync(new URL("../data/pokemon.json", import.meta.url))).items;
const moves = JSON.parse(fs.readFileSync(new URL("../data/moves.json", import.meta.url))).moves;
const movesById = new Map(moves.map(move => [move.id, move]));

if (MAX_KNOWN_MOVES !== 4) throw new Error("Un Pokémon debe conocer como máximo cuatro movimientos.");
const known = [1, 2, 3, 4].map(number => ({ id: `entry-${number}`, moveId: `move-${number}` }));
const replacement = { id: "entry-5", moveId: "move-5" };
const replaced = applyLearnedMove(known, replacement, "entry-2");
if (replaced.length !== 4 || replaced[1] !== replacement || replaced.some(entry => entry.moveId === "move-2")) {
  throw new Error("El quinto movimiento no reemplaza correctamente al movimiento olvidado.");
}
if (known.length !== 4 || known[1].moveId !== "move-2") throw new Error("La sustitución muta la lista de movimientos original.");

for (const species of pokemon) {
  for (const moveId of species.moves?.start ?? []) {
    const move = movesById.get(moveId);
    if (!move) throw new Error(`${species.id}: movimiento inicial desconocido ${moveId}`);
    const eligibility = moveEligibility(species, move, 1);
    if (!eligibility.availableNow) throw new Error(`${species.id}: ${moveId} debería estar disponible al nivel 1`);
  }
  for (const [key, requiredLevel] of [["level2", 2], ["level6", 6], ["level10", 10], ["level14", 14], ["level18", 18]]) {
    for (const moveId of species.moves?.[key] ?? []) {
      const move = movesById.get(moveId);
      if (!move) throw new Error(`${species.id}: movimiento desconocido ${moveId}`);
      const atLevel = moveEligibility(species, move, requiredLevel);
      if (!atLevel.availableNow || !atLevel.compatible) {
        throw new Error(`${species.id}: nivel de aprendizaje incorrecto para ${moveId}`);
      }
    }
  }
}

console.log(`Validated move learning for ${pokemon.length} Pokémon and ${moves.length} moves.`);
