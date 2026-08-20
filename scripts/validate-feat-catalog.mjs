/**
 * Validador de feat-catalog.mjs, ejecutado por `npm run check`. Comprueba las
 * 14 dotes propias (sourceId único, texto no vacío) y, con un `game.items`/
 * `game.packs` simulados, que pokemonFeatOptions()/trainerFeatOptions() filtren
 * bien lo que no deberían ofrecer: las dotes que ya genera el propio módulo
 * (movimientos, habilidades) y las estándar de D&D no incluidas en
 * POKEMON_STANDARD_FEAT_NAMES.
 */
import assert from "node:assert/strict";
import { POKEMON_FEATS, POKEMON_STANDARD_FEAT_NAMES, pokemonFeatSources } from "./feat-catalog.mjs";

assert.equal(POKEMON_FEATS.length, 14);
const ids = POKEMON_FEATS.map(entry => entry.id);
assert.equal(new Set(ids).size, ids.length, "Every Pokémon feat needs a unique id.");
assert.ok(POKEMON_FEATS.every(entry => entry.name && entry.description));
assert.ok(POKEMON_FEATS.find(entry => entry.id === "gifted").prerequisite, "Gifted must keep its level 10+ prerequisite.");
assert.ok(POKEMON_FEATS.filter(entry => entry.prerequisite).length === 1, "Gifted is the only Pokémon feat with a prerequisite.");
// Coinciden en texto exacto con los nombres que trainer-path-rules.mjs compara
// para el descuento de Poké Mentor / Guru (case-insensitive, pero deben existir).
assert.ok(POKEMON_FEATS.some(entry => entry.name.toLocaleLowerCase() === "movimiento adicional"));
assert.ok(POKEMON_FEATS.some(entry => entry.name.toLocaleLowerCase() === "incansable"));

const sources = pokemonFeatSources();
assert.equal(sources.length, 14);
assert.ok(sources.every(source => source.type === "feat"));
assert.ok(sources.every(source => source.flags["poke5e-foundry"].kind === "pokemon-feat"));
const sourceIds = sources.map(source => source.flags["poke5e-foundry"].sourceId);
assert.equal(new Set(sourceIds).size, sourceIds.length);

// pokemonFeatOptions()/trainerFeatOptions() dependen de `game`/`foundry`: se
// simulan con un Item de mundo, un Item propio del módulo (que debe
// descartarse) y dos compendios, uno con una dote estándar permitida
// ("Alert") y otro con una no permitida ("Actor") para comprobar el filtro.
globalThis.foundry = { utils: { getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object) } };
const ownPack = {
  documentName: "Item", collection: "world.poke5e-feats",
  async getIndex() { return new Map([["f1", { _id: "f1", name: "Movimiento Adicional", type: "feat" }]]); }
};
const dndPack = {
  documentName: "Item", collection: "world.dnd5e-srd-feats",
  async getIndex() {
    return new Map([
      ["alert", { _id: "alert", name: "Alert", type: "feat" }],
      ["actor", { _id: "actor", name: "Actor", type: "feat" }]
    ]);
  }
};
// game.packs es una foundry.utils.Collection: un Map cuyo iterador por
// defecto recorre los valores (los packs), no las entradas [clave, valor].
const packsByCollection = new Map([[ownPack.collection, ownPack], [dndPack.collection, dndPack]]);
globalThis.game = {
  items: [{ type: "feat", name: "Dote casera del GM", getFlag: () => null, uuid: "Actor.gm.Item.homebrew" }],
  packs: { get: key => packsByCollection.get(key), [Symbol.iterator]: () => packsByCollection.values() }
};

const { pokemonFeatOptions, trainerFeatOptions } = await import("./feat-catalog.mjs");
const pokemonOptions = await pokemonFeatOptions();
assert.ok(pokemonOptions.some(option => option.name === "Movimiento Adicional" && option.group === "Pokémon 5e"));
assert.ok(pokemonOptions.some(option => option.name === "Alert" && option.group === "D&D"), "Alert is in POKEMON_STANDARD_FEAT_NAMES and must appear once installed.");
assert.ok(!pokemonOptions.some(option => option.name === "Actor"), "Actor is not in POKEMON_STANDARD_FEAT_NAMES and must not appear for Pokémon.");

const trainerOptions = await trainerFeatOptions();
assert.ok(trainerOptions.some(option => option.name === "Alert"));
assert.ok(trainerOptions.some(option => option.name === "Actor"), "Trainers may take any D&D feat, unrestricted.");
assert.ok(trainerOptions.some(option => option.name === "Dote casera del GM"), "World items must be indexed too, not only compendiums.");
assert.ok(!trainerOptions.some(option => option.name === "Movimiento Adicional"), "The module's own feats compendium must not be re-offered as a generic D&D feat.");

console.log(`Feat catalog validation passed: ${POKEMON_FEATS.length} Pokémon feats, ${POKEMON_STANDARD_FEAT_NAMES.length} whitelisted D&D names.`);
