/**
 * Validador de trainer-creation-data.mjs, ejecutado por `npm run check`.
 * Comprueba los tres métodos de característica y sus rechazos, las
 * bonificaciones de varios orígenes (incluidas las opciones de Galar y la
 * salvación extra de Sinnoh), la Pericia cuando la especialización repite una
 * competencia, y que se rechacen las dos características iguales de Kanto, las
 * habilidades ya conocidas de Teselia y las de clase que duplican la
 * especialización.
 */
import assert from "node:assert/strict";
import { resolveTrainerCreation, speciesSkillKey } from "../trainer/trainer-creation-data.mjs";

const standardBase = {
  baseAbilityMethod: "standard", baseAbilityStr: 15, baseAbilityDex: 14, baseAbilityCon: 13,
  baseAbilityInt: 12, baseAbilityWis: 10, baseAbilityCha: 8
};
const standardTrainer = resolveTrainerCreation({ ...standardBase, origin: "alolan", classSkills: ["ath", "prc"], specialization: "grass" });
assert.equal(standardTrainer.abilities.str, 15);
assert.equal(standardTrainer.abilities.int, 14);
assert.equal(standardTrainer.abilities.cha, 9);
assert.throws(() => resolveTrainerCreation({
  ...standardBase, baseAbilityCha: 10, origin: "alolan", classSkills: ["ath", "prc"], specialization: "grass"
}), /conjunto estándar/);
assert.throws(() => resolveTrainerCreation({
  baseAbilityMethod: "point-buy", baseAbilityStr: 15, baseAbilityDex: 15, baseAbilityCon: 15,
  baseAbilityInt: 15, baseAbilityWis: 15, baseAbilityCha: 15,
  origin: "alolan", classSkills: ["ath", "prc"], specialization: "grass"
}), /27 puntos/);

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

assert.throws(() => resolveTrainerCreation({
  origin: "alolan", classSkills: ["ath", "prc"], specialization: "fighting"
}), /especialización/);

assert.equal(speciesSkillKey("athletics"), "ath");
assert.equal(speciesSkillKey("Animal Handling"), "ani");
assert.equal(speciesSkillKey("persuaion"), "per", "Errata real de una parte de pokemon.json ('persuaion')");
assert.equal(speciesSkillKey("persuasion"), "per");
assert.equal(speciesSkillKey("not-a-skill"), null);
assert.equal(speciesSkillKey(undefined), null);

console.log("Trainer creation validation passed.");
