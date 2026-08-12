import assert from "node:assert/strict";
import fs from "node:fs";
import { filterNpcTrainerSpecies, generateNpcTrainerTeam, npcTrainerAbilities, npcTrainerHitPoints, randomNpcTrainerName, trainerControlSr } from "./npc-trainer-rules.mjs";

const pokemon = JSON.parse(fs.readFileSync(new URL("../data/pokemon.json", import.meta.url))).items;
const evolutions = JSON.parse(fs.readFileSync(new URL("../data/evolution.json", import.meta.url))).items;

const grassPoison = filterNpcTrainerSpecies(pokemon, { typePrimary: "grass", typeSecondary: "poison", typeMode: "all", levelMax: 20 }, evolutions);
assert.ok(grassPoison.length > 0);
assert.ok(grassPoison.every(species => species.type.includes("grass") && species.type.includes("poison")));

const fireOrWater = filterNpcTrainerSpecies(pokemon, { typePrimary: "fire", typeSecondary: "water", typeMode: "any", levelMax: 20 }, evolutions);
assert.ok(fireOrWater.every(species => species.type.includes("fire") || species.type.includes("water")));
assert.equal(trainerControlSr(1), 2);
assert.equal(trainerControlSr(8), 10);
assert.equal(trainerControlSr(14, "guru"), 15);
const controlled = filterNpcTrainerSpecies(pokemon, { trainerLevel: 3, levelMax: 20, respectControlLimit: true }, evolutions);
assert.ok(controlled.every(species => Number(species.sr) <= 5));

const baseForms = filterNpcTrainerSpecies(pokemon, { stage: "base", levelMax: 20 }, evolutions);
const evolvedIds = new Set(evolutions.map(entry => entry.to));
assert.ok(baseForms.every(species => !evolvedIds.has(species.id)));

const waterPool = filterNpcTrainerSpecies(pokemon, { typePrimary: "water", levelMax: 12, srMax: 8 }, evolutions);
const team = generateNpcTrainerTeam(waterPool, {
  teamSize: 6, trainerLevel: 8, levelMin: 5, levelMax: 10, levelStrategy: "range",
  uniqueSpecies: true, difficulty: "standard", composition: "specialized", specialization: "water"
}, () => 0.42);
assert.equal(team.length, 6);
assert.equal(new Set(team.map(entry => entry.speciesId)).size, 6);
assert.ok(team.every(entry => entry.level >= 5 && entry.level <= 10));
assert.ok(team.every(entry => pokemon.find(species => species.id === entry.speciesId).type.includes("water")));

const abilities = npcTrainerAbilities("tactical", "elite");
assert.ok(abilities.int > abilities.str);
assert.ok(npcTrainerHitPoints(10, 14, "boss") > npcTrainerHitPoints(10, 14, "standard"));
assert.equal(randomNpcTrainerName({ name: "Recluta", quantity: 3 }, () => 0, 1), "Recluta 2");

console.log("NPC Trainer generation validation passed.");
