import assert from "node:assert/strict";
import { resolveTrainerCreation } from "./trainer-creation-data.mjs";

const alola = resolveTrainerCreation({
  origin: "alolan", classSkills: ["ath", "prc"], specialization: "grass"
});
assert.equal(alola.abilities.int, 12);
assert.equal(alola.abilities.cha, 11);
assert.equal(alola.proficiencyRanks.ani, 1);
assert.equal(alola.proficiencyRanks.nat, 1);
assert.equal(alola.proficiencyRanks.med, 1);
assert.equal(alola.hp, 6);

const galar = resolveTrainerCreation({
  origin: "galarian", originAbilityOption: 1, classSkills: ["ins", "prc"], specialization: "fighting"
});
assert.equal(galar.abilities.dex, 12);
assert.equal(galar.abilities.str, 11);
assert.equal(galar.proficiencyRanks.ath, 1);

const sinnoh = resolveTrainerCreation({
  origin: "sinnoan", classSkills: ["ins", "prc"], specialization: "rock"
});
assert.deepEqual(sinnoh.savingThrows, ["cha", "con"]);
assert.equal(sinnoh.abilities.con, 13);
assert.equal(sinnoh.hp, 7);

const expertise = resolveTrainerCreation({
  origin: "alolan", classSkills: ["ath", "prc"], specialization: "bug"
});
assert.equal(expertise.proficiencyRanks.nat, 2);

assert.throws(() => resolveTrainerCreation({
  origin: "kantoan", originAbilityPrimary: "cha", originAbilitySecondary: "cha",
  chosenFeat: "Lucky", classSkills: ["ath", "prc"], specialization: "normal"
}), /diferentes/);

assert.throws(() => resolveTrainerCreation({
  origin: "unovan", classSkills: ["ath", "prc"], extraSkills: ["ath", "med"], specialization: "normal"
}), /competencias nuevas/);

console.log("Trainer creation validation passed.");
