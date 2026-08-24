import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [model, importer, main, es, en] = await Promise.all([
  readFile(new URL("scripts/core/model.mjs", root), "utf8"),
  readFile(new URL("scripts/core/importer.mjs", root), "utf8"),
  readFile(new URL("scripts/core/main.mjs", root), "utf8"),
  readFile(new URL("lang/es.json", root), "utf8").then(JSON.parse),
  readFile(new URL("lang/en.json", root), "utf8").then(JSON.parse)
]);

const ids = ["key-items", "common-items", "pokeballs", "berries", "machines"];
for (const id of ids) {
  assert.match(model, new RegExp(`id: "${id}"`), `Missing gear category ${id}`);
}
for (const key of ["KeyItems", "CommonItems", "PokeBalls", "Berries", "Machines"]) {
  assert.ok(es[`POKE5E.GearCategories.${key}`], `Missing Spanish label ${key}`);
  assert.ok(en[`POKE5E.GearCategories.${key}`], `Missing English label ${key}`);
}
assert.match(importer, /Folder\.implementation\.createDocuments\([^;]+gearCategory:[^;]+\{ pack: pack\.collection \}\)/s,
  "The gear importer must create managed compendium folders");
assert.match(importer, /export async function migrateGearCompendiumCategories\(\)[\s\S]+folder,[\s\S]+"system\.type\.value": category,/,
  "Existing gear must migrate both its subtype and folder");
assert.match(main, /Hooks\.once\("init", \(\) => \{\s*registerGearCategories\(\);/,
  "Gear subtypes must register during init");
assert.match(main, /migrateGearCompendiumCategories\(\)\.catch/,
  "The GM ready hook must migrate an existing gear compendium automatically");

console.log("Gear category validation passed: 5 localized subtypes with managed compendium folders.");
