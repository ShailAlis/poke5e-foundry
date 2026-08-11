const MODULE_ID = "poke5e-foundry";
const MODULE_PATH = `modules/${MODULE_ID}`;
const cache = new Map();

export async function loadPoke5eData(language = game.settings.get(MODULE_ID, "dataLanguage")) {
  if (cache.has(language)) return cache.get(language);
  const promise = load(language);
  cache.set(language, promise);
  return promise;
}

async function load(language) {
  const [pokemon, movesEn, abilitiesEn, itemsEn] = await Promise.all([
    fetchJson("pokemon.json"),
    fetchJson("moves.json"),
    fetchJson("abilities.json"),
    fetchJson("items.json")
  ]);
  let moves = movesEn.moves;
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
  return {
    pokemon: pokemon.items,
    moves,
    abilities,
    items,
    pokemonById: new Map(pokemon.items.map(value => [value.id, value])),
    movesById: new Map(moves.map(value => [value.id, value])),
    abilitiesById: new Map(abilities.map(value => [value.id, value])),
    itemsById: new Map(items.map(value => [value.id, value]))
  };
}

async function fetchJson(file) {
  const response = await fetch(`${MODULE_PATH}/data/${file}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${file} (${response.status}).`);
  return response.json();
}

function mergeTranslation(base, translated) {
  const translations = new Map(translated.map(value => [value.id, value]));
  return base.map(value => ({ ...value, ...(translations.get(value.id) ?? {}) }));
}
