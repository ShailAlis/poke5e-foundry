/**
 * Validador de status-effects.mjs, ejecutado por `npm run check`. Es el que
 * protege la deducción de estados a partir del texto de los movimientos: fija
 * los disparadores esperados de varios casos representativos (natural, impacto,
 * salvación fallida y manual), comprueba que también funcione sobre el texto en
 * español, verifica las inmunidades por tipo y el icono del efecto generado, y
 * exige que al menos 80 movimientos sigan produciendo algún estado.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { POKEMON_STATUS_EFFECTS, applyPokemonStatus, inferMoveStatusEffects, pokemonStatusEffectSource } from "./status-effects.mjs";

const moves = JSON.parse(fs.readFileSync(new URL("../data/moves.json", import.meta.url))).moves;
const translated = JSON.parse(fs.readFileSync(new URL("../data/es/moves.json", import.meta.url))).moves;
const effects = id => inferMoveStatusEffects(moves.find(move => move.id === id));

assert.deepEqual(effects("fire-punch"), [{ id: "burned", trigger: "natural", minimum: 19 }]);
assert.deepEqual(effects("ember"), [{ id: "burned", trigger: "natural", minimum: 19 }]);
assert.deepEqual(effects("will-o-wisp"), [{ id: "burned", trigger: "hit", minimum: null }]);
assert.deepEqual(effects("ice-punch"), [{ id: "frozen", trigger: "natural", minimum: 19 }]);
assert.deepEqual(effects("thunder-punch"), [{ id: "paralyzed", trigger: "natural", minimum: 19 }]);
assert.deepEqual(effects("poison-fang"), [{ id: "badly-poisoned", trigger: "failed-save", minimum: null }]);
assert.deepEqual(effects("alluring-voice"), [{ id: "confused", trigger: "failed-save", minimum: null, target: "selected", requiresHit: true, margin: 0 }]);
assert.equal(effects("blizzard")[0].margin, 5);
assert.equal(effects("rest")[0].target, "self");
assert.deepEqual(effects("facade"), []);
assert.equal(effects("toxic-spikes").every(effect => effect.trigger === "manual"), true);
assert.equal(effects("triple-arrows").every(effect => effect.trigger === "manual"), true);
assert.equal(effects("yawn").every(effect => effect.trigger === "manual"), true);
// Auditoría de agosto 2026: casos que el regex no habría detectado por sí solo,
// verificados con entradas explícitas en EXPLICIT_MOVE_STATUSES.
assert.deepEqual(effects("dark-void"), [{ id: "asleep", trigger: "failed-save", minimum: null, target: "selected", requiresHit: false, margin: 0 }]);
assert.deepEqual(effects("fake-out"), [{ id: "flinched", trigger: "hit", minimum: null, target: "selected", requiresHit: false, margin: 0 }]);
assert.deepEqual(effects("mountain-gale"), [{ id: "flinched", trigger: "failed-save", minimum: null, target: "selected", requiresHit: true, margin: 0 }]);
assert.equal(inferMoveStatusEffects(translated.find(move => move.id === "fire-punch"))[0]?.minimum, 19);
assert.deepEqual(inferMoveStatusEffects(translated.find(move => move.id === "ember")), [{ id: "burned", trigger: "natural", minimum: 19 }]);
assert.equal(POKEMON_STATUS_EFFECTS.burned.immuneTypes.includes("fire"), true);
assert.equal(POKEMON_STATUS_EFFECTS.frozen.immuneTypes.includes("ice"), true);
globalThis.CONST = { ACTIVE_EFFECT_MODES: { MULTIPLY: 1 } };
globalThis.game = { combat: null };
globalThis.CONFIG = { statusEffects: [{ id: "bloodied", name: "Bloodied" }] };
const burnedSource = pokemonStatusEffectSource("burned");
assert.equal(burnedSource.icon, POKEMON_STATUS_EFFECTS.burned.img);
assert.equal(burnedSource.img, POKEMON_STATUS_EFFECTS.burned.img);
assert.deepEqual(burnedSource.statuses, ["poke5e-foundry-burned"]);
const { registerPokemonStatusEffects } = await import("./status-effects.mjs");
registerPokemonStatusEffects();
const registered = CONFIG.statusEffects.find(effect => effect.id === "poke5e-foundry-burned");
assert.equal(registered.name, "Quemado");
assert.equal(registered._id.length, 16);
assert.equal(CONFIG.statusEffects.find(effect => effect.id === "bloodied").name, "Bloodied");
assert.equal(new Set(CONFIG.statusEffects.map(effect => effect._id).filter(Boolean)).size, Object.keys(POKEMON_STATUS_EFFECTS).length);
CONFIG.statusEffects = {};
registerPokemonStatusEffects();
assert.equal(CONFIG.statusEffects["poke5e-foundry-burned"].name, "Quemado");
assert.equal(CONFIG.statusEffects["poke5e-foundry-burned"]._id.length, 16);
assert.ok(moves.filter(move => inferMoveStatusEffects(move).length).length >= 80);

const statusMention = /\b(burn(?:ed|t)|frozen|paraly[sz]ed|poisoned|falls? asleep|put .* to sleep|confused|flinches)\b/i;
const mentionedStatuses = moves.filter(move => [...(move.description ?? []), move.higherLevels ?? ""].filter(value => typeof value === "string").join(" ").match(statusMention));
const contextualOnly = mentionedStatuses.filter(move => !inferMoveStatusEffects(move).length).map(move => move.id).sort();
assert.deepEqual(contextualOnly, ["facade", "flame-wheel", "fusion-flare", "venoshock"]);

// applyPokemonStatus() debe avisar (no callar) cuando el objetivo ya tiene ese
// estado exacto, y el hook deleteActiveEffect debe limpiar el fantasma que deja
// en instance.conditions al expirar por duración o al borrarlo el director a mano.
globalThis.foundry = { utils: { deepClone: value => structuredClone(value), escapeHTML: value => String(value) } };
globalThis.ChatMessage = { create: async () => {} };
const notifications = [];
globalThis.ui = { notifications: { info: message => notifications.push(message) } };
game.i18n = { format: (key, data) => `${key} ${JSON.stringify(data)}`, localize: key => key };

function fakeAsleepActor({ withEffect = false, conditions = [] } = {}) {
  const effects = [];
  const item = { getFlag: (scope, key) => key === "kind" ? "pokemon" : key === "instance" ? { conditions } : null, async setFlag(scope, key, value) { conditions = value.conditions; } };
  item.parent = null; // se enlaza más abajo, una vez existe `actor`.
  const actor = {
    name: "Snorlax", documentName: "Actor",
    getFlag: (scope, key) => key === "kind" ? "wild" : key === "pokemonTypes" ? [] : null,
    effects,
    statuses: new Set(),
    items: [item],
    async createEmbeddedDocuments(type, docs) {
      for (const doc of docs) effects.push({ id: `eff-${effects.length}`, statuses: new Set(doc.statuses), getFlag: (s, k) => k === "status" ? doc.flags["poke5e-foundry"].status : null });
    },
    async deleteEmbeddedDocuments(type, ids) { for (const id of ids) { const index = effects.findIndex(effect => effect.id === id); if (index >= 0) effects.splice(index, 1); } }
  };
  if (withEffect) effects.push({ id: "eff-0", statuses: new Set(["poke5e-foundry-asleep"]), getFlag: (s, k) => k === "status" ? "asleep" : null });
  item.parent = actor;
  return { actor, item, conditionsRef: () => conditions };
}

const fresh = fakeAsleepActor();
await applyPokemonStatus(fresh.actor, "asleep", { sourceName: "Ash's Pikachu", moveName: "Hypnosis" });
assert.equal(fresh.actor.effects.length, 1, "A fresh target should receive the asleep effect.");
assert.deepEqual(fresh.conditionsRef(), ["asleep"]);

const alreadyAsleep = fakeAsleepActor({ withEffect: true, conditions: ["asleep"] });
notifications.length = 0;
await applyPokemonStatus(alreadyAsleep.actor, "asleep", { sourceName: "Ash's Pikachu", moveName: "Hypnosis" });
assert.equal(alreadyAsleep.actor.effects.length, 1, "A duplicate application must not stack a second effect.");
if (!notifications.some(message => message.includes("POKE5E.StatusEffects.AlreadyActive"))) {
  throw new Error("Retrying a status the target already has must notify instead of silently doing nothing.");
}

globalThis.MODULE_ID_TEST = null;
const { registerPokemonStatusSocket } = await import("./status-effects.mjs");
globalThis.Hooks = { on: (event, handler) => { if (event === "deleteActiveEffect") globalThis.__deleteActiveEffectHook = handler; } };
game.socket = { on: () => {} };
game.users = { filter: () => [{ id: "gm1", active: true, isGM: true }] };
game.user = { id: "gm1" };
game.actors = { filter: () => [] };
registerPokemonStatusSocket();
const expired = fakeAsleepActor({ withEffect: true, conditions: ["asleep"] });
const expiredEffect = expired.actor.effects[0];
expiredEffect.getFlag = (scope, key) => key === "kind" ? "pokemon-status" : key === "status" ? "asleep" : null;
expiredEffect.parent = expired.actor;
__deleteActiveEffectHook(expiredEffect);
// El hook, como cualquier Hooks.on, no se espera: da tiempo a que su trabajo
// interno (promesas encadenadas, sin temporizadores reales) se asiente.
await new Promise(resolve => setTimeout(resolve, 10));
assert.deepEqual(expired.conditionsRef(), [], "Deleting the ActiveEffect (expiry or manual removal) must clear the stale condition from the Item.");

console.log(`Pokémon status-effect validation passed after auditing ${mentionedStatuses.length} textual candidates.`);
