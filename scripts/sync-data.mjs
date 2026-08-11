import { access, cp, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const moduleRoot = resolve(here, "..");
const websiteData = resolve(moduleRoot, "..", "static", "data");
const moduleData = resolve(moduleRoot, "data");
const websiteAssets = resolve(moduleRoot, "..", "static", "assets");
const moduleAssets = resolve(moduleRoot, "assets");

await mkdir(resolve(moduleData, "es"), { recursive: true });
for (const file of ["pokemon.json", "moves.json", "abilities.json", "items.json", "evolution.json"]) {
  await cp(resolve(websiteData, file), resolve(moduleData, file));
}
for (const file of ["moves.json", "abilities.json", "items.json"]) {
  await cp(resolve(websiteData, "es", file), resolve(moduleData, "es", file));
}
await cp(resolve(websiteAssets, "items"), resolve(moduleAssets, "items"), { recursive: true });
for (const directory of await readdir(resolve(websiteAssets, "pokemon"), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const source = resolve(websiteAssets, "pokemon", directory.name, "sprite.png");
  try {
    await access(source);
    const targetDirectory = resolve(moduleAssets, "pokemon", directory.name);
    await mkdir(targetDirectory, { recursive: true });
    await cp(source, resolve(targetDirectory, "sprite.png"));
  } catch {
    // Some alternate forms have no dedicated sprite.
  }
}
console.log("Pokémon 5e data synchronized.");
