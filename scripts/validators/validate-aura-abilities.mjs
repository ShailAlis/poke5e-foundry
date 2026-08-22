/**
 * Validador de aura-abilities.mjs, ejecutado por `npm run check`. Solo prueba
 * las funciones puras que reciben ya la lista de aliados cercanos —
 * nearbyAllyActors()/opponentBlocksBerryEating()/opponentBlocksVoluntarySwitch()
 * (lote 43) tocan `canvas`/`game`, ausentes en Node, así que no se comprueban
 * aquí, igual que el resto del código de este proyecto que toca el lienzo
 * (wild-deployment.mjs). plusMinusAttackDamageBonus() (lote 41) se prueba en
 * validate-pokemon-abilities.mjs, junto al resto del lote que la introdujo.
 */
import assert from "node:assert/strict";
import { MODULE_ID } from "../core/model.mjs";
import {
  batteryDiceMultiplier, costarAdvantage, flowerGiftDamageBonus, flowerVeilBlocksStatus,
  powerSpotExtraDie, steelySpiritDamageBonus, sweetVeilBlocksSleep, victoryStarAttackBonus
} from "../combat/aura-abilities.mjs";

function ally(abilities, extra = {}) {
  return { getFlag: (moduleId, key) => moduleId === MODULE_ID && key === "pokemonAbilities" ? abilities : null, ...extra };
}

assert.equal(batteryDiceMultiplier([ally(["battery"])], "electric"), 2);
assert.equal(batteryDiceMultiplier([ally(["battery"])], "fire"), 1, "Batería solo duplica movimientos eléctricos");
assert.equal(batteryDiceMultiplier([ally(["overgrow"])], "electric"), 1, "Un aliado sin Batería no aporta nada");
assert.equal(batteryDiceMultiplier([], "electric"), 1);

assert.equal(powerSpotExtraDie([ally(["power-spot"])], 5), "1d6");
assert.equal(powerSpotExtraDie([ally(["power-spot"])], 10), "1d8", "A partir de nivel 10 el dado sube a 1d8");
assert.equal(powerSpotExtraDie([ally(["overgrow"])], 5), null);
assert.equal(powerSpotExtraDie([], 5), null);

assert.equal(victoryStarAttackBonus([ally(["victory-star"])]), 1);
assert.equal(victoryStarAttackBonus([ally(["overgrow"])]), 0);
assert.equal(victoryStarAttackBonus([]), 0);

const steelySpiritAlly = ally(["steely-spirit"], { system: { abilities: { cha: { mod: 3 } } } });
assert.equal(steelySpiritDamageBonus({ selfAbilities: [], nearbyAllies: [steelySpiritAlly], moveType: "steel" }), 3);
assert.equal(steelySpiritDamageBonus({ selfAbilities: ["steely-spirit"], selfChaMod: 2, nearbyAllies: [], moveType: "steel" }), 2, "También cuenta la propia habilidad");
assert.equal(steelySpiritDamageBonus({ selfAbilities: ["steely-spirit"], selfChaMod: 2, nearbyAllies: [steelySpiritAlly], moveType: "steel" }), 5, "Se apilan hasta 2 contribuciones");
const secondSteelySpiritAlly = ally(["steely-spirit"], { system: { abilities: { cha: { mod: 1 } } } });
assert.equal(
  steelySpiritDamageBonus({ selfAbilities: ["steely-spirit"], selfChaMod: 2, nearbyAllies: [steelySpiritAlly, secondSteelySpiritAlly], moveType: "steel" }),
  5,
  "No se apila una tercera contribución"
);
assert.equal(steelySpiritDamageBonus({ selfAbilities: ["steely-spirit"], selfChaMod: 2, nearbyAllies: [], moveType: "fire" }), 0, "Espíritu Metálico solo con movimientos de Acero");

assert.equal(costarAdvantage(["costar"], [ally([])]), true, "Basta con cualquier aliado cerca, no exige una habilidad concreta");
assert.equal(costarAdvantage(["costar"], []), false, "Sin ningún aliado cerca no hay ventaja");
assert.equal(costarAdvantage([], [ally([])]), false, "Sin Costar no aporta nada aunque haya un aliado cerca");

assert.equal(flowerGiftDamageBonus([ally(["flower-gift"])], "sun", 3), 3);
assert.equal(flowerGiftDamageBonus([ally(["flower-gift"])], "rain", 3), 0, "Regalo Flor exige sol");
assert.equal(flowerGiftDamageBonus([], "sun", 3), 0);

assert.equal(sweetVeilBlocksSleep(["sweet-veil"], []), true, "También protege a quien la conoce, no solo a sus aliados");
assert.equal(sweetVeilBlocksSleep([], [ally(["sweet-veil"])]), true);
assert.equal(sweetVeilBlocksSleep([], []), false);

assert.equal(flowerVeilBlocksStatus(["flower-veil"], ["grass"], []), true);
assert.equal(flowerVeilBlocksStatus([], ["grass"], [ally(["flower-veil"])]), true);
assert.equal(flowerVeilBlocksStatus([], ["fire"], [ally(["flower-veil"])]), false, "Solo protege a un protegido de tipo Planta");
assert.equal(flowerVeilBlocksStatus([], ["grass"], []), false);

console.log("Aura abilities validation passed.");
