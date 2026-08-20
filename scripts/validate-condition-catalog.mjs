/**
 * Validador de condition-catalog.mjs, ejecutado por `npm run check`. Comprueba
 * que el catálogo del compendio de estados y modificadores tenga exactamente
 * los 8 estados y las 20 etapas de característica esperadas, que cada fuente
 * traiga un `sourceId` único (lo exige upsertPackItems() para no duplicar), y
 * que ninguna traiga `startRound`/`startTurn` fijados de antemano —si los
 * llevara, arrastrarla sobre un token en una partida ya empezada calcularía mal
 * cuánto le queda de duración.
 */
import assert from "node:assert/strict";

globalThis.CONST = { ACTIVE_EFFECT_MODES: { MULTIPLY: 1, ADD: 2 } };
globalThis.game = { combat: null };

const { POKEMON_STATUS_EFFECTS } = await import("./status-effects.mjs");
const { statModifierSources, statusConditionSources } = await import("./condition-catalog.mjs");

const statuses = statusConditionSources();
assert.equal(statuses.length, Object.keys(POKEMON_STATUS_EFFECTS).length);
for (const source of statuses) {
  assert.equal(source.flags["poke5e-foundry"].kind, "pokemon-status");
  assert.ok(source.flags["poke5e-foundry"].sourceId, `${source.name} needs a sourceId for compendium deduplication.`);
  assert.equal(source.duration.startRound, undefined, `${source.name} must not bake in a stale startRound.`);
  assert.equal(source.duration.startTurn, undefined, `${source.name} must not bake in a stale startTurn.`);
}
const sleepSource = statuses.find(source => source.flags["poke5e-foundry"].sourceId === "asleep");
assert.equal(sleepSource.duration.rounds, POKEMON_STATUS_EFFECTS.asleep.rounds);

const stages = statModifierSources();
assert.equal(stages.length, 5 * 4); // 5 características × [-2, -1, 1, 2]
const sourceIds = stages.map(source => source.flags["poke5e-foundry"].sourceId);
assert.equal(new Set(sourceIds).size, sourceIds.length, "Every stage must have a unique sourceId.");
assert.ok(stages.every(source => source.flags["poke5e-foundry"].kind === "move-modifier"));
assert.ok(stages.every(source => !source.duration.rounds), "GM-granted stages must persist until removed by hand.");

const attackPlusOne = stages.find(source => source.flags["poke5e-foundry"].sourceId === "attack-1");
assert.equal(attackPlusOne.flags["poke5e-foundry"].modifier.modifiers.damage, 1);
assert.equal(attackPlusOne.flags["poke5e-foundry"].modifier.category, "buffs");
const defenseMinusTwo = stages.find(source => source.flags["poke5e-foundry"].sourceId === "defense--2");
assert.equal(defenseMinusTwo.flags["poke5e-foundry"].modifier.modifiers.ac, -2);
assert.equal(defenseMinusTwo.flags["poke5e-foundry"].modifier.category, "debuffs");
const speedPlusTwo = stages.find(source => source.flags["poke5e-foundry"].sourceId === "speed-2");
assert.equal(speedPlusTwo.flags["poke5e-foundry"].modifier.modifiers.speed, 10);
const specialDefenseMinusOne = stages.find(source => source.flags["poke5e-foundry"].sourceId === "special-defense--1");
assert.deepEqual(specialDefenseMinusOne.flags["poke5e-foundry"].modifier.modifiers.saves, { str: -1, dex: -1, con: -1, int: -1, wis: -1, cha: -1 });

console.log(`Condition catalog validation passed: ${statuses.length} statuses and ${stages.length} stat stages.`);
