/**
 * Datos y reglas de la creación de Entrenadores: catálogos de características,
 * habilidades, naturalezas, orígenes regionales y especializaciones, más la
 * validación completa de una ficha en construcción.
 *
 * Módulo puro y sin dependencias —ni siquiera de los globales de Foundry: su
 * único import es utils.mjs, cuyo escapeHtml() funciona igual fuera de Foundry—,
 * lo que permite a validate-trainer-creation.mjs probar sus reglas en Node. Lo
 * usan el asistente de jugador (trainer-creator.mjs) y el generador de NPC
 * (npc-trainer-actor.mjs y npc-trainer-generator.mjs), que comparten así los
 * mismos orígenes y especializaciones.
 */
import { escapeHtml } from "../core/utils.mjs";

/** Las seis características de D&D 5e con su nombre en español. */
export const ABILITIES = {
  str: "Fuerza", dex: "Destreza", con: "Constitución",
  int: "Inteligencia", wis: "Sabiduría", cha: "Carisma"
};

/** Habilidades de D&D 5e por su clave, con el nombre que se muestra. */
export const SKILLS = {
  acr: "Acrobacias", ani: "Trato con Animales", arc: "Conocimiento Arcano",
  ath: "Atletismo", dec: "Engaño", his: "Historia", ins: "Perspicacia",
  itm: "Intimidación", inv: "Investigación", med: "Medicina",
  nat: "Naturaleza", prc: "Percepción", prf: "Interpretación",
  per: "Persuasión", rel: "Religión", slt: "Juego de Manos",
  ste: "Sigilo", sur: "Supervivencia"
};

/**
 * Nombre completo en inglés (como aparece en `pokemon.json`/`skills`) → clave
 * de tres letras de SKILLS. Incluye "persuaion", la errata de escritura que
 * trae una parte de los datos de origen para "persuasion".
 */
const SPECIES_SKILL_NAMES = Object.freeze({
  acrobatics: "acr", "animal handling": "ani", arcana: "arc", athletics: "ath",
  deception: "dec", history: "his", insight: "ins", intimidation: "itm",
  investigation: "inv", medicine: "med", nature: "nat", perception: "prc",
  performance: "prf", persuasion: "per", persuaion: "per", religion: "rel",
  "sleight of hand": "slt", stealth: "ste", survival: "sur"
});

/**
 * Traduce un nombre de competencia tal como lo escribe `pokemon.json`
 * (`species.skills`, en inglés y en minúsculas) a su clave de tres letras, o
 * null si no se reconoce. La usan deployment.mjs y wild-deployment.mjs para
 * aplicar las competencias "de fábrica" de la especie al actor de combate.
 */
export function speciesSkillKey(name) {
  return SPECIES_SKILL_NAMES[String(name ?? "").trim().toLocaleLowerCase()] ?? null;
}

/**
 * Habilidades entre las que la clase Entrenador deja elegir dos, además de Trato
 * con Animales, que concede siempre. resolveTrainerCreation() lo comprueba.
 */
export const CLASS_SKILLS = ["acr", "ath", "ins", "itm", "inv", "med", "nat", "prc", "prf", "per", "slt", "ste", "sur"];

export { NATURES, natureLabel } from "../pokemon/natures.mjs";

/** Conjunto estándar de puntuaciones; resolveBaseAbilities() exige usarlo entero. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
/** Coste en puntos de cada puntuación en compra de puntos (27 puntos en total). */
export const POINT_BUY_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

/**
 * Orígenes regionales construidos con origin(). Cada uno concede +2/+1 a dos
 * características —Kanto deja elegirlas ("any-two") y Galar ofrece dos
 * combinaciones—, una competencia, un idioma y una dote propia.
 * Los resuelve resolveOriginAbilities().
 */
export const ORIGINS = [
  origin("alolan", "Alola", ["int", "cha"], "nat", "Alolano", "Un vínculo diferente", "Una vez por descanso largo, puedes lanzar Hablar con los Pokémon."),
  origin("galarian", "Galar", [["str", "dex"], ["dex", "str"]], "itm", "Galariano", "Mi madre pega más fuerte", "Cuando recibes daño, puedes usar tu reacción para tirar 1d12, sumar tu modificador de Constitución y reducir el daño en ese total. Recuperas el uso tras un descanso corto o largo."),
  origin("hoennian", "Hoenn", ["wis", "int"], "sur", "Hoenniano", "No hay lugar como el hogar", "Elige un entorno: Costa concede velocidad de nado igual a la terrestre; Desierto evita salvaciones por clima caluroso; Bosque permite esconderse con obscurecimiento ligero natural; Montaña concede 10 pies de escalada."),
  origin("johtoan", "Johto", ["int", "str"], "his", "Johtés", "Golpes practicados", "Cuando consigues un impacto crítico con un ataque de arma, tira una vez más uno de los dados de daño del arma y añádelo al daño adicional del crítico."),
  origin("kalosian", "Kalos", ["cha", "int"], "per", "Kalosiano", "Bonne chance", "Cuando obtienes un 1 en el d20 de un ataque, prueba de característica o salvación del Entrenador, puedes repetirlo y debes usar el nuevo resultado."),
  origin("kantoan", "Kanto", "any-two", "inv", "Kantonés", "Mi momento de brillar", "Elige una dote para la que cumplas los requisitos."),
  origin("sinnoan", "Sinnoh", ["con", "str"], "ath", "Sinnohano", "Cuerpo y mente", "Obtienes competencia en las tiradas de salvación de Constitución."),
  origin("unovan", "Teselia", ["dex", "wis"], "ins", "Unovano", "Muchos talentos", "Obtienes competencia en dos habilidades de tu elección.")
];

/**
 * Especializaciones de tipo construidas con specialization(). Cada una da +1 a
 * una característica o competencia en una habilidad, y sus Pokémon de ese tipo
 * reciben un bono que aplica deployment.mjs al desplegarlos.
 */
export const SPECIALIZATIONS = [
  specialization("normal", "Fan Pokémon", "cha"), specialization("fighting", "Cinturón Negro", null, "ath"),
  specialization("flying", "Ornitólogo", null, "prc"), specialization("poison", "Punk", null, "slt"),
  specialization("ground", "Campista", null, "sur"), specialization("rock", "Montañero", "con"),
  specialization("bug", "Entomólogo", null, "nat"), specialization("ghost", "Místico", null, "rel"),
  specialization("steel", "Trabajador", "str"), specialization("fire", "Fogonero", null, "itm"),
  specialization("water", "Nadador", "dex"), specialization("grass", "Jardinero", null, "med"),
  specialization("electric", "Ingeniero", "int"), specialization("psychic", "Psíquico", null, "arc"),
  specialization("ice", "Esquiador", null, "acr"), specialization("dragon", "Domadragones", "wis"),
  specialization("dark", "Delincuente", null, "ste"), specialization("fairy", "Actor", null, "prf")
];

/**
 * Valida y resuelve una ficha de Entrenador completa. Comprueba origen y
 * especialización, que las dos habilidades de clase sean válidas y no dupliquen
 * competencias ya concedidas, las dos adicionales de Teselia, el entorno de
 * Hoenn y la dote de Kanto; después suma a las características base de
 * resolveBaseAbilities() los ajustes de origen y especialización y devuelve
 * competencias, salvaciones, idiomas, PG iniciales y el texto de la dote.
 * Lanza un Error con un mensaje para el usuario ante cualquier fallo.
 * Punto de entrada del módulo: lo usan trainer-creator.mjs y
 * validate-trainer-creation.mjs.
 */
export function resolveTrainerCreation(selection) {
  const originEntry = ORIGINS.find(entry => entry.id === selection.origin);
  const specializationEntry = SPECIALIZATIONS.find(entry => entry.type === selection.specialization);
  if (!originEntry) throw new Error("Selecciona un origen.");
  if (!specializationEntry) throw new Error("Selecciona una especialización.");
  const originAbilities = resolveOriginAbilities(originEntry, selection);
  const classSkills = unique(selection.classSkills ?? []);
  if (classSkills.length !== 2 || classSkills.some(skill => !CLASS_SKILLS.includes(skill))) throw new Error("Elige dos habilidades de Entrenador distintas.");
  if (classSkills.includes(originEntry.skill)) throw new Error("Una habilidad de clase coincide con la de tu origen; elige otra para no perder una competencia.");
  if (specializationEntry.skill && classSkills.includes(specializationEntry.skill)) throw new Error("Una habilidad de clase ya la concede tu especialización; elige otra.");

  const abilities = resolveBaseAbilities(selection);
  abilities[originAbilities[0]] += 2;
  abilities[originAbilities[1]] += 1;
  if (specializationEntry.ability) abilities[specializationEntry.ability] = Math.min(20, abilities[specializationEntry.ability] + 1);

  const proficiencyRanks = { ani: 1, [originEntry.skill]: 1 };
  for (const skill of classSkills) proficiencyRanks[skill] = 1;
  if (specializationEntry.skill) proficiencyRanks[specializationEntry.skill] = Math.min(2, (proficiencyRanks[specializationEntry.skill] ?? 0) + 1);

  const extraSkills = originEntry.id === "unovan" ? unique(selection.extraSkills ?? []) : [];
  if (originEntry.id === "unovan" && (extraSkills.length !== 2 || extraSkills.some(skill => !SKILLS[skill]))) throw new Error("El origen de Teselia exige dos habilidades adicionales distintas.");
  if (extraSkills.some(skill => proficiencyRanks[skill])) throw new Error("Las habilidades adicionales de Teselia deben ser competencias nuevas.");
  for (const skill of extraSkills) proficiencyRanks[skill] = Math.max(1, proficiencyRanks[skill] ?? 0);
  if (originEntry.id === "hoennian" && !["coast", "desert", "forest", "mountain"].includes(selection.environment)) throw new Error("Elige el entorno de tu dote de Hoenn.");
  if (originEntry.id === "kantoan" && !String(selection.chosenFeat ?? "").trim()) throw new Error("Indica la dote elegida por tu origen de Kanto.");

  const conModifier = Math.floor((abilities.con - 10) / 2);
  return {
    origin: originEntry,
    originAbilities,
    specialization: specializationEntry,
    abilities,
    proficiencyRanks,
    savingThrows: unique(["cha", ...(originEntry.id === "sinnoan" ? ["con"] : [])]),
    languages: ["Común", originEntry.language],
    hp: Math.max(1, 6 + conModifier),
    featDetails: originFeatDetails(originEntry, selection)
  };
}

/**
 * Lee y valida las características base según el método elegido: conjunto
 * estándar (cada valor una vez), compra de puntos (27 exactos con los costes de
 * POINT_BUY_COSTS) o manual (enteros de 3 a 18). Sin método devuelve 10 en todas,
 * para la vista previa del asistente. La usan resolveTrainerCreation() y
 * trainer-creator.mjs.
 */
export function resolveBaseAbilities(selection) {
  const method = selection.baseAbilityMethod;
  if (!method) return Object.fromEntries(Object.keys(ABILITIES).map(key => [key, 10]));
  const abilities = Object.fromEntries(Object.keys(ABILITIES).map(key => [key, Number(selection[`baseAbility${titleKey(key)}`])]));
  if (method === "standard") {
    const values = Object.values(abilities).sort((a, b) => b - a);
    if (values.some((value, index) => value !== STANDARD_ARRAY[index])) throw new Error("Asigna una vez cada valor del conjunto estándar: 15, 14, 13, 12, 10 y 8.");
  } else if (method === "point-buy") {
    if (Object.values(abilities).some(value => !POINT_BUY_COSTS.hasOwnProperty(value))) throw new Error("En compra de puntos, cada característica debe estar entre 8 y 15.");
    const spent = Object.values(abilities).reduce((total, value) => total + POINT_BUY_COSTS[value], 0);
    if (spent !== 27) throw new Error(`Debes gastar exactamente 27 puntos; actualmente has gastado ${spent}.`);
  } else if (method === "manual") {
    if (Object.values(abilities).some(value => !Number.isInteger(value) || value < 3 || value > 18)) throw new Error("Las características manuales deben ser números enteros entre 3 y 18.");
  } else throw new Error("Selecciona un método válido para las características base.");
  return abilities;
}

/**
 * Determina qué dos características mejora el origen: las suyas fijas, las dos
 * elegidas si admite cualquiera (Kanto) o la combinación seleccionada si ofrece
 * varias (Galar). Auxiliar de resolveTrainerCreation().
 */
function resolveOriginAbilities(originEntry, selection) {
  if (originEntry.abilities === "any-two") {
    const values = [selection.originAbilityPrimary, selection.originAbilitySecondary];
    if (values.some(value => !ABILITIES[value]) || unique(values).length !== 2) throw new Error("Elige dos características diferentes para el origen de Kanto.");
    return values;
  }
  if (Array.isArray(originEntry.abilities[0])) {
    const option = originEntry.abilities[Math.max(0, Number(selection.originAbilityOption) || 0)];
    if (!option) throw new Error("Elige una opción de características de origen.");
    return option;
  }
  return originEntry.abilities;
}

/**
 * Compone el texto de la dote del origen añadiendo lo que se haya elegido: el
 * entorno en Hoenn y la dote concreta en Kanto. Auxiliar de resolveTrainerCreation().
 */
function originFeatDetails(originEntry, selection) {
  if (originEntry.id === "hoennian") return `${originEntry.featEffect}<br><strong>Entorno elegido:</strong> ${{ coast: "Costa", desert: "Desierto", forest: "Bosque", mountain: "Montaña" }[selection.environment]}.`;
  if (originEntry.id === "kantoan") return `${originEntry.featEffect}<br><strong>Dote elegida:</strong> ${escapeHtml(String(selection.chosenFeat).trim())}.`;
  return originEntry.featEffect;
}

/** Constructor abreviado de las entradas de ORIGINS. */
function origin(id, name, abilities, skill, language, featName, featEffect) {
  return { id, name, abilities, skill, language, featName, featEffect };
}

/**
 * Constructor abreviado de las entradas de SPECIALIZATIONS; cada una concede una
 * característica o una habilidad, nunca ambas.
 */
function specialization(type, name, ability = null, skill = null) {
  return { type, name, ability, skill };
}

/** Elimina repetidos y valores vacíos; base de las comprobaciones de duplicados. */
function unique(values) { return [...new Set(values.filter(Boolean))]; }
/** Pasa "str" a "Str" para componer los nombres de campo del formulario. */
function titleKey(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
