/**
 * Validador de npc-trainer-rules.mjs, ejecutado por `npm run check`. Comprueba
 * el filtrado por uno o dos tipos en sus dos modos, el límite de SR por nivel
 * (con el ajuste del Guru) y el filtro por etapa evolutiva; genera con un
 * aleatorio fijo un equipo temático verificando tamaño, especies únicas, rango
 * de niveles y tipo; y contrasta características por arquetipo, PG por
 * dificultad y los dos modos de nombrar a un NPC.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NPC_ARCHETYPES, filterNpcTrainerSpecies, generateNpcTrainerTeam, npcTrainerAbilities, npcTrainerHitPoints, npcTrainerSprite, randomNpcTrainerName, resolveNpcTrainerGender, trainerControlSr } from "./npc-trainer-rules.mjs";
import { SKILLS } from "./trainer-creation-data.mjs";

const pokemon = JSON.parse(fs.readFileSync(new URL("../data/pokemon.json", import.meta.url))).items;
const evolutions = JSON.parse(fs.readFileSync(new URL("../data/evolution.json", import.meta.url))).items;
const unnumbered = pokemon.find(entry => Number(entry.number) === 0);

assert.ok(!filterNpcTrainerSpecies(pokemon, { levelMax: 20 }, evolutions).includes(unnumbered));

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
assert.equal(team.length, 4);
assert.equal(new Set(team.map(entry => entry.speciesId)).size, 4);
assert.ok(team.every(entry => entry.level >= 5 && entry.level <= 10));
assert.ok(team.every(entry => pokemon.find(species => species.id === entry.speciesId).type.includes("water")));

const abilities = npcTrainerAbilities("scientist", "elite");
assert.ok(abilities.int > abilities.str);
assert.equal(Object.keys(NPC_ARCHETYPES).length, 42);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spriteDirectory = path.resolve(projectRoot, "assets", "NPC trainers");
const spriteArchetypeNames = [...new Set(fs.readdirSync(spriteDirectory).map(file => file.replace(/ [\u2640\u2642]\.png$/u, "")))].sort();
assert.deepEqual(Object.values(NPC_ARCHETYPES).map(entry => entry.name).sort(), spriteArchetypeNames);
for (const [id, archetype] of Object.entries(NPC_ARCHETYPES)) {
  assert.equal(new Set(archetype.abilities).size, 6, `${id} must prioritize all six abilities exactly once.`);
  assert.deepEqual([...archetype.abilities].sort(), ["cha", "con", "dex", "int", "str", "wis"]);
  assert.ok(archetype.skills.length >= 3, `${id} must grant at least three skills.`);
  assert.equal(new Set(archetype.skills).size, archetype.skills.length, `${id} must not repeat skills.`);
  assert.ok(archetype.skills.every(skill => SKILLS[skill]), `${id} contains an unknown skill.`);
  for (const gender of ["female", "male"]) {
    const sprite = npcTrainerSprite(id, gender).replace("modules/poke5e-foundry/", "");
    assert.ok(fs.existsSync(path.resolve(projectRoot, sprite)), `${id} has no ${gender} sprite.`);
  }
}
assert.ok(npcTrainerAbilities("pokemon-ranger", "standard").wis > npcTrainerAbilities("pokemon-ranger", "standard").str);
assert.ok(npcTrainerAbilities("super-nerd", "standard").int > npcTrainerAbilities("super-nerd", "standard").cha);
assert.ok(npcTrainerHitPoints(10, 14, "boss") > npcTrainerHitPoints(10, 14, "standard"));
assert.equal(resolveNpcTrainerGender("Femenino"), "female");
assert.equal(resolveNpcTrainerGender("male"), "male");
assert.equal(resolveNpcTrainerGender("random", () => 0.25), "female");
assert.equal(resolveNpcTrainerGender("random", () => 0.75), "male");
assert.equal(randomNpcTrainerName({ name: "Recluta", quantity: 3 }, () => 0, 1), "Recluta 2");
assert.equal(randomNpcTrainerName({ useTitle: false }, () => 0), "Aina");

console.log("NPC Trainer generation validation passed.");
