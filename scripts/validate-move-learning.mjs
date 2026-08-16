/**
 * Validador de move-learning.mjs, ejecutado por `npm run check`. Comprueba que
 * la sustitución de movimientos respete el límite de cuatro y no modifique la
 * lista original, y recorre todas las especies verificando que sus movimientos
 * iniciales estén disponibles al nivel 1 y los de cada tramo, en su nivel.
 */
import fs from "node:fs";
import { MAX_KNOWN_MOVES, applyLearnedMove, filterMoveCatalog, moveEligibility, moveMachine } from "./move-learning.mjs";

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

const machineCase = pokemon.flatMap(species => (species.moves?.tm ?? []).map(machineId => ({ species, machineId })))
  .map(entry => ({ ...entry, move: moves.find(move => String(move.tm?.id) === String(entry.machineId)) }))
  .find(({ species, move }) => move && !Object.entries(species.moves ?? {}).some(([key, ids]) => key !== "tm" && (ids ?? []).includes(move.id)));
if (!machineCase) throw new Error("No se encontró un caso de aprendizaje exclusivo mediante MT para validar.");
const machine = moveMachine(machineCase.move);
const withoutMachine = moveEligibility(machineCase.species, machineCase.move, 20);
if (withoutMachine.availableNow || !withoutMachine.requiresMachine) throw new Error(`${machineCase.move.id}: una MT ausente no debe aparecer como disponible.`);
const withMachine = moveEligibility(machineCase.species, machineCase.move, 20, { machineIds: new Set([machine.key]) });
if (!withMachine.availableNow || withMachine.requiresMachine) throw new Error(`${machineCase.move.id}: la MT del inventario no habilita el movimiento.`);

const machineAndEggCase = pokemon.flatMap(species => (species.moves?.tm ?? []).map(machineId => ({ species, machineId })))
  .map(entry => ({ ...entry, move: moves.find(move => String(move.tm?.id) === String(entry.machineId)) }))
  .find(({ species, move }) => move
    && (species.moves?.egg ?? []).includes(move.id)
    && !Object.entries(species.moves ?? {}).some(([key, ids]) => !["tm", "hm", "egg"].includes(key) && (ids ?? []).includes(move.id)));
if (!machineAndEggCase) throw new Error("No se encontró un caso compartido entre MT y movimiento de huevo para validar.");
const sharedMachine = moveMachine(machineAndEggCase.move);
const sharedWithoutMachine = moveEligibility(machineAndEggCase.species, machineAndEggCase.move, 20);
if (sharedWithoutMachine.availableNow || !sharedWithoutMachine.requiresMachine) {
  throw new Error(`${machineAndEggCase.move.id}: la vía de huevo no debe eludir la MT ausente.`);
}
if (filterMoveCatalog([machineAndEggCase.move], machineAndEggCase.species, 20, new Set(), { category: "available" }).length) {
  throw new Error(`${machineAndEggCase.move.id}: una MT ausente no debe aparecer en la lista de disponibles.`);
}
const sharedWithMachine = moveEligibility(machineAndEggCase.species, machineAndEggCase.move, 20, { machineIds: new Set([sharedMachine.key]) });
if (!sharedWithMachine.availableNow || sharedWithMachine.requiresMachine) {
  throw new Error(`${machineAndEggCase.move.id}: la MT poseída no habilita el movimiento compartido con huevo.`);
}
if (filterMoveCatalog([machineAndEggCase.move], machineAndEggCase.species, 20, new Set(), { category: "available", machineIds: new Set([sharedMachine.key]) }).length !== 1) {
  throw new Error(`${machineAndEggCase.move.id}: una MT poseída debe aparecer en la lista de disponibles.`);
}

console.log(`Validated move learning for ${pokemon.length} Pokémon and ${moves.length} moves.`);
