/**
 * Validador de model.mjs, ejecutado por `npm run check`. Simula los globales de
 * Foundry (`game` y `foundry.utils`) antes de importar el módulo con `import()`
 * dinámico —de ahí que no use un import normal— y comprueba, sobre las 1000 y
 * pico especies reales, la progresión de Pokéslots, el sorteo de sexo con
 * generador fijo, la migración de URLs de recursos, la conversión de especie a
 * Pokémon individual (movimientos, PP, PG y sexo) y que la clase Entrenador
 * enlace todos sus rasgos y mejoras de característica.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

globalThis.game = { settings: { get: () => "https://poke5e.app" }, packs: new Map() };
globalThis.foundry = {
  utils: {
    deepClone: structuredClone,
    escapeHTML: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"),
    randomID: (() => { let id = 0; return () => `test${++id}`; })()
  }
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data");
const pokemon = JSON.parse(await readFile(resolve(root, "pokemon.json"), "utf8")).items;
const moves = JSON.parse(await readFile(resolve(root, "moves.json"), "utf8")).moves;
const movesById = new Map(moves.map(move => [move.id, move]));
const {
  MODULE_ID,
  TRAINER_FEATURES,
  displayAssetUrl,
  randomGenderForRatio,
  speciesItemSource,
  pokemonItemSourceFromSpecies,
  moveMachineItemSource,
  trainerFeatureSources,
  trainerClassSource,
  trainerPokeslotLimit
} = await import("./model.mjs");

const machineSources = moves.filter(move => move.tm?.id != null || move.hm?.id != null).map(moveMachineItemSource);
if (machineSources.length !== 256) throw new Error(`Expected 256 move machines, found ${machineSources.length}.`);
if (new Set(machineSources.map(source => source.flags[MODULE_ID].sourceId)).size !== machineSources.length) throw new Error("Move-machine source IDs must be unique.");
if (machineSources.some(source => source.flags[MODULE_ID].kind !== "move-machine" || !source.flags[MODULE_ID].machine?.moveId)) throw new Error("Invalid move-machine item source.");

const trainerAt = level => ({ system: { details: { level } }, items: [] });
if (trainerPokeslotLimit(trainerAt(1)) !== 3 || trainerPokeslotLimit(trainerAt(5)) !== 4 || trainerPokeslotLimit(trainerAt(10)) !== 5 || trainerPokeslotLimit(trainerAt(15)) !== 6) {
  throw new Error("Trainer Pokéslot progression is invalid.");
}

if (randomGenderForRatio("0:0", () => 0.5) !== "none") throw new Error("Genderless species must produce no gender.");
if (randomGenderForRatio("1:7", () => 0) !== "female") throw new Error("Female gender roll is invalid.");
if (randomGenderForRatio("1:7", () => 0.99) !== "male") throw new Error("Male gender roll is invalid.");

if (displayAssetUrl("modules/poke5e-foundry/assets/pokemon/0001/sprite.png") !== "https://poke5e.app/assets/pokemon/0001/sprite.png") {
  throw new Error("Legacy module asset URLs are not migrated to the configured asset host.");
}
if (displayAssetUrl("icons/svg/sword.svg") !== "icons/svg/sword.svg") throw new Error("Foundry icon URLs must remain unchanged.");

for (const species of pokemon) {
  const catalog = speciesItemSource(species, movesById);
  if (catalog.type !== "feat" || catalog.flags[MODULE_ID].kind !== "species") throw new Error(`${species.id}: invalid catalog source.`);
  if (species.media?.sprite && !catalog.img.startsWith("https://poke5e.app/assets/")) throw new Error(`${species.id}: catalog image is not remote.`);
  const individual = pokemonItemSourceFromSpecies(catalog);
  const flags = individual.flags[MODULE_ID];
  if (flags.kind !== "pokemon" || flags.sourceId !== species.id) throw new Error(`${species.id}: invalid individual source.`);
  if (flags.instance.moves.length > 4) throw new Error(`${species.id}: more than four starting moves.`);
  if (flags.instance.hp.value !== species.hp || flags.instance.hp.max !== species.hp) throw new Error(`${species.id}: invalid HP.`);
  if (!["female", "male", "none"].includes(flags.instance.gender)) throw new Error(`${species.id}: invalid generated gender.`);
  for (const entry of flags.instance.moves) {
    const move = movesById.get(entry.moveId);
    if (!move || entry.pp.max !== Number(move.pp)) throw new Error(`${species.id}: invalid move PP for ${entry.moveId}.`);
  }
}
const trainerFeatures = trainerFeatureSources();
if (trainerFeatures.length !== TRAINER_FEATURES.filter(entry => entry.grant).length) throw new Error("Invalid Trainer feature count.");
if (trainerFeatures.some(source => source.system.type?.value !== "class" || source.flags[MODULE_ID].featureOrigin !== "trainer")) throw new Error("Trainer features must retain their class origin.");
const featureUuids = new Map(trainerFeatures.map((source, index) => [source.flags[MODULE_ID].sourceId, `Compendium.world.poke5e-progression.Item.feature${index}`]));
const trainerClass = trainerClassSource(featureUuids);
if (trainerClass.type !== "class" || trainerClass.system.identifier !== "trainer") throw new Error("Invalid Trainer class source.");
if (!trainerClass.img.includes("transparent_poke_ball")) throw new Error("Trainer class has no custom icon.");
if (trainerClass.system.hd.denomination !== "d6") throw new Error("Invalid Trainer hit die.");
if (Array.isArray(trainerClass.system.advancement)) throw new Error("Trainer advancements must use the D&D 5e 5.3 mapping schema.");
if (Object.entries(trainerClass.system.advancement).some(([id, entry]) => id !== entry._id || entry._id.length !== 16)) throw new Error("Trainer advancement IDs must be valid mapping keys.");
if (!Object.values(trainerClass.system.advancement).some(entry => entry.type === "HitPoints")) throw new Error("Trainer class has no Hit Points advancement.");
if (!Object.values(trainerClass.system.advancement).some(entry => entry.type === "Trait" && entry.configuration.grants.includes("saves:cha"))) throw new Error("Trainer class has no proficiency advancement.");
if (!Object.values(trainerClass.system.advancement).some(entry => entry.type === "Trait" && entry.level === 10 && entry.configuration.grants.includes("conditionImmunities:frightened"))) throw new Error("Trainer class has no Resolve advancement.");
if (!Object.values(trainerClass.system.advancement).some(entry => entry.type === "Trait" && entry.level === 13 && entry.configuration.mode === "expertise" && entry.configuration.grants.includes("skills:ani"))) throw new Error("Trainer class has no Pokémon Tracker expertise advancement.");
for (const feature of TRAINER_FEATURES) {
  if (!feature.grant) {
    if (!Object.values(trainerClass.system.advancement).some(entry => entry.type === "AbilityScoreImprovement" && entry.level === feature.level)) throw new Error(`Trainer ASI not configured at level ${feature.level}.`);
    continue;
  }
  const grant = Object.values(trainerClass.system.advancement).find(entry => entry.type === "ItemGrant" && entry.level === feature.level);
  const uuid = featureUuids.get(`trainer-feature-${feature.id}`);
  if (!grant?.configuration.items.some(entry => entry.uuid === uuid)) throw new Error(`Trainer feature not granted: ${feature.id}.`);
}
console.log(`Validated compendium and trainer-item conversion for ${pokemon.length} Pokémon.`);
console.log(`Validated Trainer class, ${trainerFeatures.length} granted features, and 5 ability-score advancements.`);
