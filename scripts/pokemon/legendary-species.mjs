/**
 * Pokémon únicos del mundo. Se usa el número de la Pokédex Nacional en
 * vez del id para que las formas regionales, primigenias o alternativas de una
 * misma especie compartan la misma unicidad.
 *
 * La lista incluye Pokémon legendarios y singulares, pero no Ultraentes ni
 * Pokémon Paradoja ordinarios: el canon no limita estos últimos a un ejemplar.
 */
export const UNIQUE_LEGENDARY_NUMBERS = new Set([
  144, 145, 146, 150, 151,
  243, 244, 245, 249, 250, 251,
  377, 378, 379, 380, 381, 382, 383, 384, 385, 386,
  480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493,
  494, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649,
  716, 717, 718, 719, 720, 721,
  772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 800, 801, 802, 807, 808, 809,
  888, 889, 890, 891, 892, 893, 894, 895, 896, 897, 898, 905,
  1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1017, 1024, 1025
]);

const MODULE_ID = "poke5e-foundry";

/** Devuelve el número único de una especie legendaria o null. */
export function uniqueLegendaryNumber(species) {
  const number = Number(species?.number);
  return UNIQUE_LEGENDARY_NUMBERS.has(number) ? number : null;
}

/**
 * Reúne los legendarios que ya existen en el mundo: capturados por cualquier
 * entrenador (PJ o NPC) y actores salvajes o desplegados presentes en campo.
 * `excludeActorId` permite revalidar una captura sin contar al propio objetivo.
 */
export function capturedLegendaryNumbers(
  actors = globalThis.game?.actors?.contents ?? globalThis.game?.actors ?? [],
  _users = globalThis.game?.users?.contents ?? globalThis.game?.users ?? [],
  { excludeActorId = null } = {}
) {
  const actorList = collectionValues(actors);
  const captured = new Set();
  for (const actor of actorList) {
    if (actor.id === excludeActorId) continue;
    const actorKind = actor.getFlag?.(MODULE_ID, "kind");
    if (actor.type !== "character" && !["wild", "deployed"].includes(actorKind)) continue;
    for (const item of collectionValues(actor.items)) {
      if (item.getFlag?.(MODULE_ID, "kind") !== "pokemon") continue;
      const number = uniqueLegendaryNumber(item.getFlag(MODULE_ID, "species"));
      if (number) captured.add(number);
    }
  }
  return captured;
}

/** Indica si esa especie legendaria ya existe en un entrenador o en el campo. */
export function isCapturedLegendary(species, actors, users, options) {
  const number = uniqueLegendaryNumber(species);
  return Boolean(number && capturedLegendaryNumbers(actors, users, options).has(number));
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  return typeof collection[Symbol.iterator] === "function" ? [...collection] : [];
}
