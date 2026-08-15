import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { normalizeDataLanguage } from "./data-service.mjs";

const [english, spanish] = await Promise.all([
  readJson("lang/en.json"),
  readJson("lang/es.json")
]);

assert.deepEqual(Object.keys(english).sort(), Object.keys(spanish).sort(), "English and Spanish must expose the same localization keys");
await assertNoDuplicateKeys("lang/en.json");
await assertNoDuplicateKeys("lang/es.json");

const referencedKeys = new Set();
for (const directory of ["scripts", "templates"]) {
  for (const path of await sourceFiles(directory)) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/["'](POKE5E\.[A-Za-z0-9_.-]+)["']/g)) referencedKeys.add(match[1]);
  }
}
const missingKeys = [...referencedKeys].filter(key => !(key in english));
assert.deepEqual(missingKeys, [], `Missing localization keys: ${missingKeys.join(", ")}`);

const hardcodedNotifications = [];
for (const path of await sourceFiles("scripts")) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  if (/ui\.notifications\.(?:info|warn|error|success)\(\s*["`]/.test(source)) hardcodedNotifications.push(path);
}
assert.deepEqual(hardcodedNotifications, [], `Hardcoded notification text found in: ${hardcodedNotifications.join(", ")}`);
assert.equal(normalizeDataLanguage("es"), "es");
assert.equal(normalizeDataLanguage("EN"), "en");
assert.equal(normalizeDataLanguage("unsupported"), "en");

for (const file of ["moves.json", "abilities.json", "items.json"]) {
  await readJson(`data/es/${file}`);
}

console.log("Localization validation passed.");

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}

async function assertNoDuplicateKeys(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const keys = [...source.matchAll(/^\s*"([^"]+)"\s*:/gm)].map(match => match[1]);
  const duplicates = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
  assert.deepEqual(duplicates, [], `${path} contains duplicate localization keys: ${duplicates.join(", ")}`);
}

async function sourceFiles(directory) {
  const root = new URL(`../${directory}/`, import.meta.url);
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && /\.(?:mjs|hbs)$/.test(entry.name))
    .map(entry => `${directory}/${entry.name}`);
}
