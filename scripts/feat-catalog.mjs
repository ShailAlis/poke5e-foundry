/**
 * Dotes seleccionables por desplegable, para el asistente de creación de
 * Entrenador y el avance de nivel de Pokémon. Combina las 14 dotes propias de
 * Pokémon 5e (POKEMON_FEATS, contenido original de la comunidad, empaquetado
 * en el compendio `poke5e-feats` por pokemonFeatSources()) con cualquier dote
 * de tipo "feat" ya indexada en los compendios del mundo —el SRD de dnd5e u
 * otro módulo con contenido de pago— que este módulo no puede reproducir por
 * derechos de autor. Consumido por trainer-creator.mjs y pokemon-advancement.mjs;
 * pokemonFeatSources() la usa además importer.mjs.
 */
import { MODULE_ID, PACKS } from "./model.mjs";

/**
 * Dotes estándar de D&D que, según poke5e.app/reference/feats, un Pokémon
 * puede elegir en vez de su Mejora de característica (los Entrenadores, en
 * cambio, pueden tomar cualquier dote del manual). Solo aparecen en el
 * desplegable si el mundo tiene una dote de tipo "feat" con ese nombre exacto
 * en algún compendio —el propio SRD de dnd5e, por ejemplo—.
 */
export const POKEMON_STANDARD_FEAT_NAMES = Object.freeze([
  "Alert", "Charger", "Durable", "Elemental Adept", "Observant", "Resilient",
  "Savage Attacker", "Sentinel", "Skill Expert", "Skilled", "Skulker", "Speedy", "Tough"
]);

/** Las 14 dotes propias de Pokémon 5e: id, nombre, prerrequisito y descripción literal traducida de poke5e.app/reference/feats. */
export const POKEMON_FEATS = Object.freeze([
  feat("able-bodied", "Cuerpo Resistente", null, "El cuerpo de tu Pokémon está entrenado para aprender de las dolencias y combatirlas durante largos periodos. El «margen de gracia» de los estados se extiende dos rondas para este Pokémon."),
  feat("ac-up", "CA Mejorada", null, "La CA de tu Pokémon aumenta en 2. Este bonificador se mantiene a través de sus evoluciones."),
  feat("ambidextrous", "Ambidiestro", null, "Tu Pokémon puede sostener un objeto equipado adicional. Esta dote solo puede elegirse una vez."),
  feat("combo-master", "Maestro del Combo", null, "Tu Pokémon es experto combinando golpes contra un enemigo. Al elegir esta dote, los movimientos capaces de golpear más de una vez tras la misma tirada de ataque (Arañazo Furia, Doble Bofetón, Shuriken de Agua, etc.) impactan garantizado al menos dos veces."),
  feat("extra-move", "Movimiento Adicional", null, "Tu Pokémon puede conocer un movimiento más (cinco en total en vez de cuatro). Más adelante puedes volver a elegir esta dote para conocer un movimiento más (hasta un máximo de seis en total)."),
  feat("gifted", "Superdotado", "Nivel 10+", "Aumenta una puntuación de característica a tu elección en 1, hasta un máximo de 22. El máximo de esa característica pasa a ser 22."),
  feat("hidden-ability", "Habilidad Oculta", null, "Tu Pokémon rebusca en su interior y descubre una nueva habilidad. Obtiene acceso a la Habilidad Oculta de su ficha de especie, además de su habilidad estándar actual."),
  feat("melee-master", "Maestro Cuerpo a Cuerpo", null, "Tu Pokémon domina el combate cercano. Obtiene ventaja en todos los ataques de oportunidad. Cuando impacta a una criatura con un movimiento cuerpo a cuerpo que use FUE como potencia como parte de la acción de Atacar en su turno, puede causar daño adicional igual a su bonificador de competencia."),
  feat("natural-mount", "Montura Natural", null, "Mientras este Pokémon lleva un jinete, si la criatura que lo monta es atacada, puede forzar que el ataque le afecte a él en su lugar. Además, si este Pokémon o su jinete deben hacer una salvación de Destreza que reduzca el daño a la mitad en caso de éxito, puede desplegar defensas adicionales: elige a sí mismo o a su jinete para no recibir ningún daño si tienen éxito, y solo la mitad si fallan."),
  feat("power-sculpter", "Escultor de Poder", null, "Tu Pokémon es capaz de moldear el poder de sus movimientos en torno a sus aliados. En los movimientos de área que active, elige 1 + el modificador de potencia del movimiento de aliados en el alcance que superen automáticamente su salvación contra el daño o efecto. Si el daño se reduciría a la mitad con éxito, en su lugar no reciben ninguno."),
  feat("ranged-master", "Maestro a Distancia", null, "Tu Pokémon es un tirador experto. Sus ataques a distancia ignoran la cobertura media y las tres cuartas partes. Estar a 5 pies de un enemigo no impone desventaja en sus tiradas de ataque de movimientos a distancia."),
  feat("terrain-adept", "Adepto del Terreno", null, "Tu Pokémon destaca especialmente combatiendo en un terreno concreto. Elige uno de los siguientes terrenos al obtener esta dote: costa, pantano, bosque, ártico, desierto, pradera, colina, montaña, submarino. Tu Pokémon obtiene +3 a las tiradas de ataque mientras esté en ese terreno."),
  feat("tireless", "Incansable", null, "Tu Pokémon soporta horas de entrenamiento riguroso que lo mantienen en combate más tiempo que a un Pokémon medio. Obtiene +1 PP en todos sus movimientos actuales. Si sustituye alguno de esos movimientos, el nuevo también obtiene +1 PP."),
  feat("wrangler", "Domador", null, "Has desarrollado un conjunto de habilidades único que te permite agarrar y sujetar a un oponente con manos firmes y fuertes. Obtienes ventaja en tiradas de ataque contra una criatura agarrada por ti; no gastas movimiento extra al mover una criatura agarrada por ti si es de tu tamaño o menor; y cuando impactas a una criatura con un movimiento cuerpo a cuerpo de un solo objetivo que use FUE como potencia como parte de la acción de Atacar en tu turno, puedes intentar agarrarla simultáneamente (solo una vez por turno).")
]);

function feat(id, name, prerequisite, description) {
  return Object.freeze({ id, name, prerequisite, description });
}

/** Fuentes de Item (compendio `poke5e-feats`) de las 14 dotes propias. Solo la usa importer.mjs. */
export function pokemonFeatSources() {
  return POKEMON_FEATS.map(entry => ({
    name: entry.name,
    type: "feat",
    img: "icons/svg/upgrade.svg",
    system: {
      description: { value: `<p>${entry.description}</p>`, chat: "" },
      requirements: entry.prerequisite ?? ""
    },
    flags: { [MODULE_ID]: { kind: "pokemon-feat", sourceId: entry.id } }
  }));
}

/**
 * Indexa por nombre las dotes de tipo "feat" del mundo (Items sueltos y
 * compendios de Item), descartando las que genera el propio módulo —el
 * compendio `poke5e-feats` y cualquier otro Item con flag `kind` del módulo,
 * como movimientos o habilidades, que también son type "feat"—.
 */
async function indexedWorldFeats() {
  const byName = new Map();
  for (const item of game.items ?? []) {
    if (item.type === "feat" && !item.getFlag(MODULE_ID, "kind") && !byName.has(item.name.trim())) {
      byName.set(item.name.trim(), { name: item.name.trim(), uuid: item.uuid });
    }
  }
  const ownCollection = `world.${PACKS.feats.name}`;
  for (const pack of game.packs) {
    if (pack.documentName !== "Item" || pack.collection === ownCollection) continue;
    const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.kind`] });
    for (const entry of index.values()) {
      if (entry.type !== "feat" || foundry.utils.getProperty(entry, `flags.${MODULE_ID}.kind`)) continue;
      const name = entry.name.trim();
      if (!byName.has(name)) byName.set(name, { name, uuid: `Compendium.${pack.collection}.Item.${entry._id}` });
    }
  }
  return byName;
}

/**
 * Opciones del desplegable de dote de un Pokémon: las 14 propias más, si están
 * instaladas, las estándar de D&D que permite POKEMON_STANDARD_FEAT_NAMES.
 * Cada opción trae `name` (lo que se guarda, igual que el texto libre de
 * antes) y `group` para separarlas visualmente en el <select>.
 */
export async function pokemonFeatOptions() {
  const pack = game.packs.get(`world.${PACKS.feats.name}`);
  const own = pack
    ? [...(await pack.getIndex()).values()].map(entry => ({ name: entry.name, uuid: `Compendium.${pack.collection}.Item.${entry._id}`, group: "Pokémon 5e" }))
    : POKEMON_FEATS.map(entry => ({ name: entry.name, uuid: null, group: "Pokémon 5e" }));
  const world = await indexedWorldFeats();
  const standard = POKEMON_STANDARD_FEAT_NAMES.map(name => world.get(name)).filter(Boolean).map(entry => ({ ...entry, group: "D&D" }));
  return [...own, ...standard];
}

/** Opciones del desplegable de dote de un Entrenador: cualquier dote indexada en el mundo, sin restricción. */
export async function trainerFeatOptions() {
  const world = await indexedWorldFeats();
  return [...world.values()].sort((a, b) => a.name.localeCompare(b.name)).map(entry => ({ ...entry, group: "D&D" }));
}
