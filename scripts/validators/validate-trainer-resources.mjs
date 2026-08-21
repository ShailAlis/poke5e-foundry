import assert from "node:assert/strict";
import { applyTacticianDcBoost, spendTrainerResource, trainerResourceEntries, trainerResourceState } from "../trainer/trainer-resources.mjs";

// Stub de foundry.applications.api.DialogV2.confirm para que
// confirmHeldItemReaction() (held-items.mjs) no falle fuera de Foundry;
// CONFIRM_RESULT deja simular que el usuario acepta o cancela el diálogo.
let CONFIRM_RESULT = false;
globalThis.foundry = { applications: { api: { DialogV2: { confirm: async () => CONFIRM_RESULT } } } };
globalThis.ChatMessage = { getSpeaker: () => ({}) };

function poolItem(pathId, level, { max = 3, spent = 0 } = {}) {
  const item = {
    id: `${pathId}-${level}`,
    system: { uses: { max, spent } },
    getFlag: (moduleId, key) => moduleId === "poke5e-foundry" ? (key === "pathId" ? pathId : key === "level" ? level : null) : null
  };
  item.update = async changes => { item.system.uses.spent = changes["system.uses.spent"]; };
  return item;
}

function trainer(pathId, { level = 5, uses = {} } = {}) {
  const feature = poolItem(pathId, POOL_LEVEL[pathId], uses);
  const subclass = {
    type: "subclass",
    system: { classIdentifier: "trainer" },
    getFlag: (moduleId, key) => moduleId === "poke5e-foundry" && key === "pathId" ? pathId : null
  };
  return { type: "character", items: [feature, subclass], system: { details: { level } } };
}

const POOL_LEVEL = { "ace-trainer": 5, hobbyist: 5, grunt: 2, tactician: 2 };

assert.equal(trainerResourceState(null, "ace-trainer"), null);
assert.equal(trainerResourceState(trainer("ace-trainer"), "commander"), null, "Los caminos sin recurso definido devuelven null");

const ace = trainer("ace-trainer", { level: 5, uses: { max: 3, spent: 1 } });
const aceState = trainerResourceState(ace, "ace-trainer");
assert.equal(aceState.remaining, 2);
assert.equal(aceState.max, 3);
assert.equal(aceState.formula, "1d6", "Nivel 5-8 usa d6");

const aceHigh = trainer("ace-trainer", { level: 9, uses: { max: 4, spent: 0 } });
assert.equal(trainerResourceState(aceHigh, "ace-trainer").formula, "1d8", "Nivel 9-14 usa d8");
const acePeak = trainer("ace-trainer", { level: 15, uses: { max: 5, spent: 0 } });
assert.equal(trainerResourceState(acePeak, "ace-trainer").formula, "1d10", "Nivel 15+ usa d10");

const grunt = trainer("grunt", { level: 5, uses: { max: 5, spent: 2 } });
const gruntState = trainerResourceState(grunt, "grunt");
assert.equal(gruntState.points, true);
assert.equal(gruntState.formula, null, "Los caminos de puntos no llevan fórmula de dado");
assert.equal(gruntState.remaining, 3);

assert.equal(await spendTrainerResource(ace, "ace-trainer", 1), true);
assert.equal(trainerResourceState(ace, "ace-trainer").remaining, 1);
assert.equal(await spendTrainerResource(ace, "ace-trainer", 5), false, "No se puede gastar más de lo que queda");
assert.equal(trainerResourceState(ace, "ace-trainer").remaining, 1, "Un gasto rechazado no toca el recurso");

assert.equal(trainerResourceEntries(trainer("tactician", { uses: { max: 5, spent: 0 } })).length, 1);
assert.deepEqual(trainerResourceEntries(null), []);

// Esta vez no (Tactician 15): solo sube la CD cuando la salvación ya es un
// éxito, hacen falta 5 puntos o menos, y el jugador confirma el gasto.
const tactician15 = trainer("tactician", { level: 15, uses: { max: 5, spent: 0 } });
assert.equal(await applyTacticianDcBoost(tactician15, "Pikachu", 12, 15), 15, "Ya ha fallado (12 < 15): no hace falta gastar nada");
assert.equal(await applyTacticianDcBoost(tactician15, "Pikachu", 25, 15), 15, "Haría falta más de 5 puntos (25-15+1=11): no se ofrece");
CONFIRM_RESULT = true;
assert.equal(await applyTacticianDcBoost(tactician15, "Pikachu", 17, 15), 18, "17 >= 15 por 2: sube la CD en 3 (17-15+1) al confirmar");
assert.equal(trainerResourceState(tactician15, "tactician").remaining, 2, "Gastó los 3 puntos necesarios");
CONFIRM_RESULT = false;
assert.equal(await applyTacticianDcBoost(trainer("tactician", { level: 2, uses: { max: 5, spent: 0 } }), "Pikachu", 17, 15), 15, "Tactician sin nivel 15 no ofrece nada");
assert.equal(await applyTacticianDcBoost(null, "Pikachu", 17, 15), 15, "Sin entrenador no ofrece nada");

console.log("Trainer resources validation passed.");
