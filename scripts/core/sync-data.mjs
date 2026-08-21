/**
 * Script de desarrollo, no de ejecución en Foundry. Copia los JSON y los sprites
 * del sitio poke5e.app (`../static`) a las carpetas `data/` y `assets/` de este
 * módulo, que son las que después lee data-service.mjs.
 *
 * Se ejecuta a mano con `node scripts/sync-data.mjs` tras actualizar los datos
 * del sitio, y después conviene pasar `npm run check`. No es un módulo con
 * funciones: todo el trabajo ocurre al importarlo.
 */
import { access, cp, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const moduleRoot = resolve(here, "..");
const websiteData = resolve(moduleRoot, "..", "static", "data");
const moduleData = resolve(moduleRoot, "data");
const websiteAssets = resolve(moduleRoot, "..", "static", "assets");
const moduleAssets = resolve(moduleRoot, "assets");

// Datos en inglés y su traducción al español; el resto de idiomas los resuelve
// data-service.mjs superponiendo las traducciones sobre las entradas inglesas.
await mkdir(resolve(moduleData, "es"), { recursive: true });
for (const file of ["pokemon.json", "moves.json", "abilities.json", "items.json", "evolution.json"]) {
  await cp(resolve(websiteData, file), resolve(moduleData, file));
}
for (const file of ["moves.json", "abilities.json", "items.json"]) {
  await cp(resolve(websiteData, "es", file), resolve(moduleData, "es", file));
}
// Copia local de los sprites. En ejecución las imágenes se sirven desde el host
// del ajuste `assetBaseUrl` (véase remoteAssetUrl() en model.mjs); esta copia es
// solo el respaldo para trabajar sin conexión.
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
    // Algunas formas alternativas no tienen sprite propio.
  }
}
console.log("Pokémon 5e data synchronized.");
