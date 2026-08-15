import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDataLanguage } from "./data-service.mjs";

const [english, spanish] = await Promise.all([
  readJson("lang/en.json"),
  readJson("lang/es.json")
]);

assert.deepEqual(Object.keys(english).sort(), Object.keys(spanish).sort(), "English and Spanish must expose the same localization keys");
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
