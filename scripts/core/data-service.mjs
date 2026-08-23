/**
 * Servicio de acceso a los JSON de `data/`. Carga el catálogo completo una sola
 * vez por idioma, lo enriquece (traducciones, efectos de estado, datos de
 * concurso, cadenas evolutivas) y lo expone ya indexado por id.
 *
 * Toda la interfaz que necesita datos pasa por aquí: pokemon-sheet.mjs,
 * species-browser.mjs, importer.mjs, capture.mjs, deployment.mjs,
 * wild-deployment.mjs, trainer-creator.mjs y los dos generadores.
 */
import { inferMoveStatusEffects } from "../combat/status-effects.mjs";
import { typeLabel } from "../combat/combat.mjs";

const MODULE_ID = "poke5e-foundry";
const MODULE_PATH = `modules/${MODULE_ID}`;
const cache = new Map();
const SUPPORTED_LANGUAGES = new Set(["en", "es"]);

/** Convenciones usadas por los ids del catálogo para las formas regionales. */
const REGIONAL_FORM_PATTERNS = [
  ["alola", /(?:^alolan-|[-]alola(?:-|$))/],
  ["galar", /(?:^galarian-|[-]galar(?:-|$))/],
  ["hisui", /(?:^hisuian-|[-]hisui(?:-|$))/],
  ["paldea", /(?:^paldean-|[-]paldea(?:-|$))/]
];

/** Devuelve la región codificada en el id de una forma, o null para la normal. */
export function pokemonRegionalForm(speciesId) {
  const id = String(speciesId ?? "").toLocaleLowerCase();
  return REGIONAL_FORM_PATTERNS.find(([, pattern]) => pattern.test(id))?.[0] ?? null;
}

/**
 * Impide que una especie normal ofrezca como evolución una forma regional de
 * su evolución. Los resultados sin marcador regional siguen siendo válidos
 * para líneas regionales que terminan en una especie nueva (Perrserker,
 * Cursola, Clodsire, etc.).
 */
export function evolutionMatchesRegionalForm(evolution) {
  const targetForm = pokemonRegionalForm(evolution?.to);
  return !targetForm || pokemonRegionalForm(evolution?.from) === targetForm;
}

/**
 * Punto de entrada único al catálogo. Cachea la promesa de load() por idioma,
 * de modo que las llamadas simultáneas comparten una sola carga y las
 * posteriores son inmediatas.
 */
export async function loadPoke5eData(language = game.settings.get(MODULE_ID, "dataLanguage")) {
  language = normalizeDataLanguage(language);
  if (cache.has(language)) return cache.get(language);
  const promise = load(language);
  cache.set(language, promise);
  promise.catch(() => cache.delete(language));
  return promise;
}

/** Invalida los catálogos cargados cuando cambia el idioma del mundo. */
export function clearPoke5eDataCache() {
  cache.clear();
}

/** Evita solicitar rutas inexistentes si un mundo conserva un valor antiguo. */
export function normalizeDataLanguage(language) {
  const normalized = String(language ?? "").toLowerCase();
  return SUPPORTED_LANGUAGES.has(normalized) ? normalized : "es";
}

/** Nombre localizado de un bioma conservando su identificador para los filtros. */
export function biomeLabel(biome) {
  const key = `POKE5E.Biomes.${String(biome ?? "").toLowerCase()}`;
  const translated = globalThis.game?.i18n?.localize?.(key);
  return translated && translated !== key ? translated : String(biome ?? "");
}

/**
 * Carga y ensambla el catálogo: lee los JSON en paralelo con fetchJson(), deduce
 * los efectos de estado de cada movimiento con inferMoveStatusEffects()
 * (status-effects.mjs), superpone la traducción —con mergeTranslation() para
 * habilidades y objetos, y en la misma pasada de ensamblado para movimientos—,
 * adjunta los datos de concurso que consume contests.mjs y agrupa las
 * evoluciones por especie de origen. Devuelve también los índices por id que
 * usan las fichas. Solo la llama loadPoke5eData().
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
  let abilities = abilitiesEn.items;
  let items = itemsEn.items;
  let localizedContestEffects = contestEffects.items;
  let moveTranslations = null;
  if (language !== "en") {
    const [movesLocal, abilitiesLocal, itemsLocal, contestEffectsLocal] = await Promise.all([
      fetchJson(`${language}/moves.json`),
      fetchJson(`${language}/abilities.json`),
      fetchJson(`${language}/items.json`),
      fetchJson(`${language}/contest-effects.json`)
    ]);
    moveTranslations = new Map(movesLocal.moves.map(value => [value.id, value]));
    abilities = mergeTranslation(abilities, abilitiesLocal.items);
    items = mergeTranslation(items, itemsLocal.items);
    localizedContestEffects = mergeTranslation(localizedContestEffects, contestEffectsLocal.items);
  }
  const availablePokemon = pokemon.items.filter(isAvailablePokemon).map(species => language === "es"
    ? { ...species, name: spanishSpeciesName(species.name), description: spanishSpeciesDescription(species) }
    : species);
  const availablePokemonIds = new Set(availablePokemon.map(value => value.id));
  const availableEvolutions = evolutions.items.filter(evolution =>
    availablePokemonIds.has(evolution.from)
    && availablePokemonIds.has(evolution.to)
    && evolutionMatchesRegionalForm(evolution)
  );
  const contestById = new Map(contests.items.map(value => [value.id, value]));
  const contestEffectsById = new Map(localizedContestEffects.map(value => [String(value.id), value]));
  // Efectos de estado, traducción y datos de concurso se aplican en una sola
  // pasada: el catálogo tiene más de ochocientos movimientos y encadenar tres
  // `map()` construía dos copias intermedias completas de todos ellos.
  const moves = movesEn.moves.map(move => {
    const localized = moveTranslations?.get(move.id) ?? {};
    const assembled = { ...move, ...localized, statusEffects: inferMoveStatusEffects(move) };
    if (language === "es") Object.assign(assembled, spanishMoveMetadata(assembled));
    const contest = contestById.get(move.id);
    if (contest) assembled.contest = { ...contest, effect: contestEffectsById.get(String(contest.effect)) ?? contest.effect };
    return assembled;
  });
  const evolutionsByFrom = new Map();
  for (const evolution of availableEvolutions) {
    const entries = evolutionsByFrom.get(evolution.from) ?? [];
    entries.push(evolution);
    evolutionsByFrom.set(evolution.from, entries);
  }
  return {
    pokemon: availablePokemon,
    moves,
    abilities,
    items,
    contestEffects: localizedContestEffects,
    evolutions: availableEvolutions,
    evolutionsByFrom,
    pokemonById: new Map(availablePokemon.map(value => [value.id, value])),
    movesById: new Map(moves.map(value => [value.id, value])),
    abilitiesById: new Map(abilities.map(value => [value.id, value])),
    itemsById: new Map(items.map(value => [value.id, value])),
    contestEffectsById
  };
}

/** Traduce únicamente los campos descriptivos; los ids mecánicos no cambian. */
export function spanishMoveMetadata(move) {
  const time = {
    "1 action": "1 acción", "1 action, charge": "1 acción, carga", "1 action, recharge": "1 acción, recarga",
    "1 bonus action": "1 acción adicional", "1 reaction": "1 reacción"
  }[move.time] ?? move.time;
  const range = String(move.range ?? "")
    .replace(/self/gi, "personal").replace(/melee/gi, "cuerpo a cuerpo").replace(/varies/gi, "variable")
    .replace(/radius/gi, "radio").replace(/reach/gi, "alcance").replace(/line/gi, "línea").replace(/cone/gi, "cono")
    .replace(/\bft\b/gi, "pies").replace(/(\d)ft\b/gi, "$1 pies").replace(/(\d)f\b/gi, "$1 pies")
    .replace(/(\d+) pies (radio|cono|línea|alcance)/gi, "$2 de $1 pies");
  const duration = String(move.duration ?? "")
    .replace(/instantaneous/gi, "instantánea").replace(/while in battle/gi, "mientras permanezca en combate").replace(/varies/gi, "variable")
    .replace(/minutes?/gi, match => match.toLowerCase().endsWith("s") ? "minutos" : "minuto")
    .replace(/rounds?/gi, match => match.toLowerCase().endsWith("s") ? "asaltos" : "asalto")
    .replace(/turns?/gi, match => match.toLowerCase().endsWith("s") ? "turnos" : "turno")
    .replace(/concentration/gi, "concentración").replace(/charge/gi, "carga");
  return { time, range, duration };
}

/** Sustituye la prosa inglesa de origen por un resumen reglamentario en español. */
export function spanishSpeciesDescription(species) {
  const types = (species.type ?? []).map(typeLabel);
  const typeText = types.length > 1 ? `${types.slice(0, -1).join(", ")} y ${types.at(-1)}` : types[0] ?? "desconocido";
  const region = species.habitat?.nativeRegion ? ` Es originario de ${species.habitat.nativeRegion}.` : "";
  return `Pokémon de tipo ${typeText}. Su nivel mínimo es ${Number(species.minLevel) || 1}.${region}`;
}

/** Adapta al uso español los adjetivos ingleses de las formas regionales. */
export function spanishSpeciesName(name) {
  return String(name ?? "")
    .replace(/^Alolan (.+)$/i, "$1 de Alola")
    .replace(/^Galarian (.+)$/i, "$1 de Galar")
    .replace(/^Hisuian (.+)$/i, "$1 de Hisui")
    .replace(/^Paldean (.+)$/i, "$1 de Paldea");
}

/** Las entradas sin número oficial de Pokédex no se ofrecen como especies jugables. */
export function isAvailablePokemon(species) {
  return Number(species?.number) > 0;
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
