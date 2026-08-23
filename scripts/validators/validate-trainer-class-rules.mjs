import assert from "node:assert/strict";

globalThis.game = { settings: { get: () => "" }, i18n: { format: (key, data) => `${key}:${JSON.stringify(data)}`, localize: key => key } };
globalThis.foundry = { utils: { escapeHTML: String, getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object) } };

const { MODULE_ID, trainerFeatureSources } = await import("../core/model.mjs");
const {
  availableTrainerSpecializations,
  chooseTrainerSpecialization,
  masterTrainerState,
  pendingTrainerSpecializations,
  pokemonTrackerState,
  trainerHitPointOverrideUpdate,
  trainerSpecializationCapacity
} = await import("../trainer/trainer-class-rules.mjs");

const item = (type, system, flags = {}) => ({
  type,
  system,
  getFlag: (module, key) => module === MODULE_ID ? flags[key] : undefined
});
const trainer = (level, specializationTypes = [], features = []) => {
  const trainerClass = item("class", { identifier: "trainer", levels: level }, { kind: "trainer-class" });
  const specializationItems = specializationTypes.map(type => item("feat", {}, { specializationType: type }));
  const items = [trainerClass, ...specializationItems, ...features];
  return { type: "character", items, itemTypes: { class: [trainerClass], subclass: [] }, getFlag: () => null };
};

assert.equal(trainerSpecializationCapacity(1), 1);
assert.equal(trainerSpecializationCapacity(7), 2);
assert.equal(trainerSpecializationCapacity(18), 3);
assert.equal(pendingTrainerSpecializations(trainer(7, ["fire"])), 1);
assert.equal(pendingTrainerSpecializations(trainer(18, ["fire", "water", "grass"])), 0);
assert.ok(!availableTrainerSpecializations(trainer(7, ["fire"])).some(entry => entry.type === "fire"));

const placeholder = item("feat", {}, { sourceId: "trainer-feature-specialization-2", level: 7 });
let featureUpdate = null;
placeholder.update = async update => { featureUpdate = update; };
const choosingActor = trainer(7, ["fire"], [placeholder]);
choosingActor.isOwner = true;
choosingActor.system = { abilities: { dex: { value: 12 } }, skills: {} };
let actorUpdate = null;
choosingActor.update = async update => { actorUpdate = update; };
assert.equal(await chooseTrainerSpecialization(choosingActor, "water"), true);
assert.equal(actorUpdate["system.abilities.dex.value"], 13);
assert.equal(featureUpdate[`flags.${MODULE_ID}.specializationType`], "water");

const sources = trainerFeatureSources();
assert.deepEqual(sources.map(source => source.flags[MODULE_ID].sourceId).sort(), [
  "trainer-feature-master-trainer",
  "trainer-feature-pokemon-tracker",
  "trainer-feature-specialization-1",
  "trainer-feature-specialization-2",
  "trainer-feature-specialization-3"
]);
const trackerSource = sources.find(source => source.flags[MODULE_ID].sourceId === "trainer-feature-pokemon-tracker");
const masterSource = sources.find(source => source.flags[MODULE_ID].sourceId === "trainer-feature-master-trainer");
assert.equal(trackerSource.system.uses.max, "1");
assert.equal(trackerSource.system.uses.recovery[0].period, "lr");
assert.equal(masterSource.system.uses.max, "2");
assert.equal(masterSource.system.uses.recovery[0].period, "lr");

const trackerItem = item("feat", { uses: { spent: 0, max: "1" } }, { sourceId: "trainer-feature-pokemon-tracker" });
assert.equal(pokemonTrackerState(trainer(13, [], [trackerItem])).remaining, 1);
const masterItem = item("feat", { uses: { spent: 1, max: "2" } }, { sourceId: "trainer-feature-master-trainer" });
assert.equal(masterTrainerState(trainer(20, [], [masterItem])).remaining, 1);

const legacyHpActor = trainer(4);
legacyHpActor._source = { system: { attributes: { hp: { max: 8 } } } };
legacyHpActor.getFlag = (module, key) => module === MODULE_ID && key === "trainerCreation" ? { completed: true } : null;
assert.deepEqual(trainerHitPointOverrideUpdate(legacyHpActor), {
  [`flags.${MODULE_ID}.trainerHpOverrideMigrated`]: true,
  "system.attributes.hp.max": null
});
legacyHpActor.getFlag = (module, key) => module === MODULE_ID && key === "trainerHpOverrideMigrated" ? true : key === "trainerCreation" ? { completed: true } : null;
assert.equal(trainerHitPointOverrideUpdate(legacyHpActor), null, "A later manual override must not be cleared again");

console.log("Trainer class mechanical progression validation passed.");
