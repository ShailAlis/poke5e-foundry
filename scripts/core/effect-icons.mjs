/**
 * Iconos personalizados para estados, mejoras y debilitaciones. Al arrancar
 * prueba si existe cada archivo PNG documentado bajo assets/icons/effects y
 * conserva el icono de Foundry como respaldo cuando todavía no se ha añadido.
 */
import { MODULE_PATH } from "./model.mjs";
import { modifierIconSlots } from "../combat/move-modifier-rules.mjs";

const slots = (...ids) => Object.freeze([...new Set(ids.flat())].sort());

export const EFFECT_ICON_SLOTS = Object.freeze({
  statuses: Object.freeze([
    "burned", "frozen", "paralyzed", "poisoned", "badly-poisoned", "asleep", "confused", "flinched"
  ]),
  buffs: slots(["aqua-ring", "ingrain", "curse-buff", "concentration"], modifierIconSlots("buffs")),
  debuffs: slots([
    "anchor-shot", "bind", "clamp", "constrict", "curse", "fire-spin", "glare", "infestation",
    "leech-seed", "roar", "rock-tomb", "salt-cure", "sand-tomb", "scary-face", "submission",
    "telekinesis", "thunder-cage", "whirlpool", "wrap"
  ], modifierIconSlots("debuffs"))
});

const loadedIcons = new Map();

/**
 * Busca los PNG disponibles. Se vuelve a ejecutar al recargar el mundo.
 *
 * Primero intenta listar cada carpeta de una sola vez con el explorador de
 * archivos de Foundry: son tres peticiones en vez de una por hueco (más de
 * doscientos), y no llena la consola de 404 por los iconos que el usuario aún no
 * ha copiado. Si el explorador no está disponible —por ejemplo, si el rol del
 * usuario no tiene permiso para navegar archivos— cae en el sondeo individual
 * con HEAD, que solo necesita permiso de lectura.
 */
export async function loadPokemonEffectIcons() {
  loadedIcons.clear();
  await Promise.all(Object.entries(EFFECT_ICON_SLOTS).map(async ([category, ids]) => {
    const listed = await listCategoryFiles(category);
    if (listed) {
      for (const id of ids) {
        const path = customEffectIconPath(category, id);
        if (listed.has(path)) loadedIcons.set(`${category}.${id}`, path);
      }
      return;
    }
    await Promise.all(ids.map(id => probeIcon(category, id)));
  }));
  return loadedIcons.size;
}

/**
 * Lista los archivos de una carpeta de iconos con el explorador de Foundry, o
 * devuelve null si no se puede usar. Auxiliar de loadPokemonEffectIcons().
 */
async function listCategoryFiles(category) {
  const picker = globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  if (!picker?.browse) return null;
  try {
    const result = await picker.browse("data", `${MODULE_PATH}/assets/icons/effects/${category}`);
    return new Set((result?.files ?? []).map(file => decodeURIComponent(file)));
  } catch {
    return null;
  }
}

/** Sondeo individual de respaldo: el archivo es opcional y su ausencia no es un error. */
async function probeIcon(category, id) {
  const path = customEffectIconPath(category, id);
  try {
    const response = await fetch(path, { method: "HEAD", cache: "no-store" });
    if (response.ok) loadedIcons.set(`${category}.${id}`, path);
  } catch {
    // El consumidor usará su icono de respaldo.
  }
}

/**
 * Devuelve directamente el PNG incluido para cualquier hueco conocido. Así el
 * ActiveEffect guarda siempre la imagen que Foundry dibuja sobre el token,
 * incluso si el explorador de archivos no puede listar la carpeta. El mapa de
 * detección se conserva para extensiones opcionales y rutas descubiertas.
 */
export function pokemonEffectIcon(category, id, fallback = "icons/svg/aura.svg") {
  if (EFFECT_ICON_SLOTS[category]?.includes(id)) return customEffectIconPath(category, id);
  return loadedIcons.get(`${category}.${id}`) ?? fallback;
}

/** Ruta convencional que el usuario debe respetar al copiar cada imagen. */
export function customEffectIconPath(category, id) {
  return `${MODULE_PATH}/assets/icons/effects/${category}/${id}.png`;
}
