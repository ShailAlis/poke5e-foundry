import assert from "node:assert/strict";
import { POKEDOLLAR_DENOMINATION, POKEDOLLAR_SYMBOL, UNUSED_DND_DENOMINATIONS, pokedollarCurrency, pokedollars } from "../world/economy.mjs";

assert.equal(POKEDOLLAR_DENOMINATION, "gp", "The D&D-compatible storage denomination changed unexpectedly.");
assert.equal(POKEDOLLAR_SYMBOL, "₽");
assert.deepEqual(pokedollarCurrency(1250.9), { pp: 0, gp: 1250, ep: 0, sp: 0, cp: 0 });
assert.deepEqual(UNUSED_DND_DENOMINATIONS, ["pp", "ep", "sp", "cp"]);
assert.equal(pokedollars({ system: { currency: { gp: 875 } } }), 875);
assert.equal(pokedollars({ system: { currency: { gp: -20 } } }), 0);

console.log("Pokédollar economy validation passed.");
