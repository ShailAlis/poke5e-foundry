/**
 * Validador de pokemon-advancement.mjs, ejecutado por `npm run check`. Cubre
 * featCostForAdvancement(), la única lógica pura de este archivo (el resto son
 * diálogos de Foundry sin equivalente en Node): el coste de una dote sin
 * descuento nunca debe superar advancement.featPointLimit, aunque
 * advancement.abilityPoints sea mayor —caso real de las líneas de una sola
 * etapa evolutiva, que dan 4 puntos por subida en vez de 2— y el descuento de
 * Poké Mentor/Guru siempre debe dejar el resto exacto para repartir.
 */
import assert from "node:assert/strict";
import { featCostForAdvancement } from "./pokemon-advancement.mjs";

const mockItem = (type, system, flags = {}) => ({ type, system, getFlag: (module, key) => module === "poke5e-foundry" ? flags[key] : undefined });
const trainer = pathId => {
  const trainerClass = mockItem("class", { identifier: "trainer", levels: 9 }, { kind: "trainer-class" });
  const path = mockItem("subclass", { identifier: pathId, classIdentifier: "trainer" }, { kind: "trainer-path", pathId });
  const items = [trainerClass, path];
  return { items, itemTypes: { class: [trainerClass], subclass: [path] }, getFlag: () => null };
};

// Línea normal (dos etapas o más): abilityPoints === featPointLimit, sin descuento.
const normal = { abilityPoints: 2, featPointLimit: 2 };
assert.deepEqual(featCostForAdvancement(trainer("hobbyist"), "Alert", normal), { discounted: false, cost: 2, leftover: 0 });

// Línea de una sola etapa evolutiva: 4 puntos por subida, pero un evento de ASI (featPointLimit 2).
// La dote no puede "gastar" más de featPointLimit; el resto tiene que ir a características.
const singleStage = { abilityPoints: 4, featPointLimit: 2 };
assert.deepEqual(featCostForAdvancement(trainer("hobbyist"), "Alert", singleStage), { discounted: false, cost: 2, leftover: 2 });

// Poké Mentor 5 rebaja "Movimiento adicional" a 1 punto exacto, deje lo que deje libre abilityPoints.
const pokeMentor = trainer("poke-mentor");
assert.deepEqual(featCostForAdvancement(pokeMentor, "Movimiento adicional", normal), { discounted: true, cost: 1, leftover: 1 });
assert.deepEqual(featCostForAdvancement(pokeMentor, "Movimiento adicional", singleStage), { discounted: true, cost: 1, leftover: 3 });
// El descuento es específico de esa dote; cualquier otra sigue sin descuento.
assert.equal(featCostForAdvancement(pokeMentor, "Alert", normal).discounted, false);
// Sin dote elegida (cadena vacía) no debe reventar ni marcarse como descontada.
assert.deepEqual(featCostForAdvancement(pokeMentor, "", normal), { discounted: false, cost: 2, leftover: 0 });

console.log("Pokémon advancement validation passed.");
