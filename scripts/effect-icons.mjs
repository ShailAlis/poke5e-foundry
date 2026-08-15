/**
 * Iconos personalizados para estados, mejoras y debilitaciones. Al arrancar
 * prueba si existe cada archivo WEBP documentado bajo assets/icons/effects y
 * conserva el icono de Foundry como respaldo cuando todavía no se ha añadido.
 */
import { MODULE_PATH } from "./model.mjs";

export const EFFECT_ICON_SLOTS = Object.freeze({
  statuses: Object.freeze([
    "burned", "frozen", "paralyzed", "poisoned", "badly-poisoned", "asleep", "confused", "flinched"
  ]),
  buffs: Object.freeze(["aqua-ring", "ingrain", "curse-buff", "concentration"]),
  debuffs: Object.freeze([
    "anchor-shot", "bind", "clamp", "constrict", "curse", "fire-spin", "glare", "infestation",
    "leech-seed", "roar", "rock-tomb", "salt-cure", "sand-tomb", "scary-face", "submission",
    "telekinesis", "thunder-cage", "whirlpool", "wrap"
  ])
});

const loadedIcons = new Map();

/** Busca en paralelo los WEBP disponibles. Se vuelve a ejecutar al recargar el mundo. */
export async function loadPokemonEffectIcons() {
  loadedIcons.clear();
  await Promise.all(Object.entries(EFFECT_ICON_SLOTS).flatMap(([category, ids]) => ids.map(async id => {
    const path = customEffectIconPath(category, id);
    try {
      const response = await fetch(path, { method: "HEAD", cache: "no-store" });
      if (response.ok) loadedIcons.set(`${category}.${id}`, path);
    } catch {
      // El archivo es opcional; el consumidor usará su icono de respaldo.
    }
  })));
  return loadedIcons.size;
}

/** Devuelve el icono personalizado detectado o el respaldo recibido. */
export function pokemonEffectIcon(category, id, fallback = "icons/svg/aura.svg") {
  return loadedIcons.get(`${category}.${id}`) ?? fallback;
}

/** Ruta convencional que el usuario debe respetar al copiar cada imagen. */
export function customEffectIconPath(category, id) {
  return `${MODULE_PATH}/assets/icons/effects/${category}/${id}.webp`;
}
