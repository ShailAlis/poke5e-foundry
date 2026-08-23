/**
 * Naturalezas de Pokémon 5e. Cada naturaleza no neutra aumenta una
 * característica en 1 y reduce otra en 1; los valores de la instancia se
 * conservan como puntuaciones base y estos modificadores se aplican al vuelo.
 */
export const NATURES = [
  "Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile", "Relaxed",
  "Impish", "Lax", "Timid", "Hasty", "Serious", "Jolly", "Naive", "Modest",
  "Mild", "Quiet", "Bashful", "Rash", "Calm", "Gentle", "Sassy", "Careful", "Quirky"
];

const DEFINITIONS = Object.freeze({
  Hardy: [null, null, "Fuerte"], Lonely: ["str", "con", "Huraña"], Brave: ["str", "dex", "Audaz"],
  Adamant: ["str", "wis", "Firme"], Naughty: ["str", "cha", "Pícara"], Bold: ["con", "str", "Osada"],
  Docile: [null, null, "Dócil"], Relaxed: ["con", "dex", "Plácida"], Impish: ["con", "wis", "Agitada"],
  Lax: ["con", "cha", "Floja"], Timid: ["dex", "str", "Miedosa"], Hasty: ["dex", "con", "Activa"],
  Serious: [null, null, "Seria"], Jolly: ["dex", "wis", "Alegre"], Naive: ["dex", "cha", "Ingenua"],
  Modest: ["wis", "str", "Modesta"], Mild: ["wis", "con", "Afable"], Quiet: ["wis", "dex", "Mansa"],
  Bashful: [null, null, "Tímida"], Rash: ["wis", "cha", "Alocada"], Calm: ["cha", "str", "Serena"],
  Gentle: ["cha", "con", "Amable"], Sassy: ["cha", "dex", "Grosera"], Careful: ["cha", "wis", "Cauta"],
  Quirky: [null, null, "Rara"]
});

/** Información mecánica y etiqueta de una naturaleza. */
export function natureDefinition(nature) {
  const [increase, decrease, label] = DEFINITIONS[nature] ?? [null, null, String(nature ?? "")];
  return { id: String(nature ?? ""), label, increase, decrease, neutral: !increase && !decrease };
}

export function natureLabel(nature, language = globalThis.game?.i18n?.lang ?? "es") {
  const definition = natureDefinition(nature);
  return String(language).toLocaleLowerCase().startsWith("es") ? definition.label : definition.id;
}

/** Sortea uniformemente una de las 25 naturalezas. */
export function randomNature(random = Math.random) {
  return NATURES[Math.floor(random() * NATURES.length)] ?? NATURES[0];
}

/** Aplica la naturaleza a una copia de las puntuaciones base. */
export function applyNatureEffects(attributes = {}, nature) {
  const result = { ...attributes };
  const effect = natureDefinition(nature);
  if (effect.increase) result[effect.increase] = (Number(result[effect.increase]) || 10) + 1;
  if (effect.decrease) result[effect.decrease] = Math.max(1, (Number(result[effect.decrease]) || 10) - 1);
  return result;
}

/** Puntuaciones efectivas de una instancia, incluida su naturaleza. */
export function pokemonAttributesWithNature(species = {}, instance = {}) {
  return applyNatureEffects(instance.attributes ?? species.attributes ?? {}, instance.nature);
}

/** Completa las instancias antiguas que todavía no tenían naturaleza. */
export async function migratePokemonNatures(actors = globalThis.game?.actors?.contents ?? globalThis.game?.actors ?? []) {
  let migrated = 0;
  const actorList = Array.isArray(actors) ? actors : actors?.contents ?? [...actors];
  for (const actor of actorList) {
    for (const item of actor.items ?? []) {
      if (item.getFlag?.("poke5e-foundry", "kind") !== "pokemon") continue;
      const instance = item.getFlag("poke5e-foundry", "instance") ?? {};
      if (NATURES.includes(instance.nature)) continue;
      await item.update({ "flags.poke5e-foundry.instance.nature": randomNature() });
      migrated++;
    }
  }
  return migrated;
}
