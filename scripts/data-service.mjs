/**
 * Servicio de acceso a los JSON de `data/`. Carga el catálogo completo una sola
 * vez por idioma, lo enriquece (traducciones, efectos de estado, datos de
 * concurso, cadenas evolutivas) y lo expone ya indexado por id.
 *
 * Toda la interfaz que necesita datos pasa por aquí: pokemon-sheet.mjs,
 * species-browser.mjs, importer.mjs, capture.mjs, deployment.mjs,
 * wild-deployment.mjs, trainer-creator.mjs y los dos generadores.
 */
import { inferMoveStatusEffects } from "./status-effects.mjs";

const MODULE_ID = "poke5e-foundry";
const MODULE_PATH = `modules/${MODULE_ID}`;
const cache = new Map();

/**
 * Punto de entrada único al catálogo. Cachea la promesa de load() por idioma,
 * de modo que las llamadas simultáneas comparten una sola carga y las
 * posteriores son inmediatas.
 */
export async function loadPoke5eData(language = game.settings.get(MODULE_ID, "dataLanguage")) {
  if (cache.has(language)) return cache.get(language);
  const promise = load(language);
  cache.set(language, promise);
  return promise;
}

/**
 * Carga y ensambla el catálogo: lee los JSON en paralelo con fetchJson(), deduce
 * los efectos de estado de cada movimiento con inferMoveStatusEffects()
 * (status-effects.mjs), superpone la traducción con mergeTranslation(), adjunta
 * los datos de concurso que consume contests.mjs y agrupa las evoluciones por
 * especie de origen. Devuelve también los índices por id que usan las fichas.
 * Solo la llama loadPoke5eData().
 */
async function load(language) {
  const [pokemon, movesEn, abilitiesEn, itemsEn, evolutions, contests, contestEffects] = await Promise.all([
    fetchJson("pokemon.json"),
    fetchJson("moves.json"),
    fetchJson("abilities.json"),
    fetchJson("items.json"),
    fetchJson("evolution.json"),
    fetchJson("contest.json"),
    fetchJson("contest-effects.json")
  ]);
  let moves = movesEn.moves.map(move => ({ ...move, statusEffects: inferMoveStatusEffects(move) }));
  let abilities = abilitiesEn.items;
  let items = itemsEn.items;
  if (language !== "en") {
    const [movesLocal, abilitiesLocal, itemsLocal] = await Promise.all([
      fetchJson(`${language}/moves.json`),
      fetchJson(`${language}/abilities.json`),
      fetchJson(`${language}/items.json`)
    ]);
    moves = mergeTranslation(moves, movesLocal.moves);
    abilities = mergeTranslation(abilities, abilitiesLocal.items);
    items = mergeTranslation(items, itemsLocal.items);
  }
  const contestById = new Map(contests.items.map(value => [value.id, value]));
  const contestEffectsById = new Map(contestEffects.items.map(value => [String(value.id), value]));
  moves = moves.map(move => {
    const contest = contestById.get(move.id);
    if (!contest) return move;
    return { ...move, contest: { ...contest, effect: contestEffectsById.get(String(contest.effect)) ?? contest.effect } };
  });
  const evolutionsByFrom = new Map();
  for (const evolution of evolutions.items) {
    const entries = evolutionsByFrom.get(evolution.from) ?? [];
    entries.push(evolution);
    evolutionsByFrom.set(evolution.from, entries);
  }
  return {
    pokemon: pokemon.items,
    moves,
    abilities,
    items,
    contestEffects: contestEffects.items,
    evolutions: evolutions.items,
    evolutionsByFrom,
    pokemonById: new Map(pokemon.items.map(value => [value.id, value])),
    movesById: new Map(moves.map(value => [value.id, value])),
    abilitiesById: new Map(abilities.map(value => [value.id, value])),
    itemsById: new Map(items.map(value => [value.id, value])),
    contestEffectsById
  };
}

/**
 * Lee un JSON de la carpeta `data/` del módulo y lanza un error descriptivo si
 * la respuesta falla. Auxiliar exclusivo de load().
 */
async function fetchJson(file) {
  const response = await fetch(`${MODULE_PATH}/data/${file}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${file} (${response.status}).`);
  return response.json();
}

/**
 * Superpone las entradas traducidas sobre las inglesas emparejándolas por id, de
 * forma que los campos ausentes en la traducción conservan el valor original.
 * Auxiliar exclusivo de load().
 */
function mergeTranslation(base, translated) {
  const translations = new Map(translated.map(value => [value.id, value]));
  return base.map(value => ({ ...value, ...(translations.get(value.id) ?? {}) }));
}
