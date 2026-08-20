import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONTEXTUAL_MODIFIER_COVERAGE, MOVE_MODIFIER_EFFECTS, modifierTriggerMatches, nextModifierStacks, scaledMoveModifiers } from "./move-modifier-rules.mjs";

const moves = JSON.parse(readFileSync(new URL("../data/moves.json", import.meta.url), "utf8")).moves;
const movesById = new Map(moves.map(move => [move.id, move]));

for (const [id, rule] of Object.entries(MOVE_MODIFIER_EFFECTS)) {
  assert.ok(movesById.has(id), `La regla de modificador ${id} no corresponde a ningún movimiento`);
  assert.ok(["buffs", "debuffs"].includes(rule.category));
  assert.ok(rule.description);
  assert.ok(Object.keys(rule.modifiers).length);
}

const growl = MOVE_MODIFIER_EFFECTS.growl;
assert.equal(growl.trigger, "failed-save");
assert.equal(growl.stackMax, 5);
assert.equal(growl.modifiers.attack, -1);
assert.equal(nextModifierStacks(4, growl.stackMax), 5);
assert.equal(nextModifierStacks(5, growl.stackMax), 5);
assert.deepEqual(scaledMoveModifiers(growl.modifiers, 5), { attack: -5 });
assert.equal(modifierTriggerMatches(growl, { save: { success: false } }), true);
assert.equal(modifierTriggerMatches(growl, { save: { success: true } }), false);

const crunch = MOVE_MODIFIER_EFFECTS.crunch;
assert.equal(modifierTriggerMatches(crunch, { attack: { hit: true, natural: 18 } }), true);
assert.equal(modifierTriggerMatches(crunch, { attack: { hit: false, natural: 20 } }), false);

// Auditoría de agosto 2026: muestra representativa de las 75 entradas nuevas.
assert.deepEqual(MOVE_MODIFIER_EFFECTS["body-slam"].modifiers.statuses, ["prone"]);
assert.equal(MOVE_MODIFIER_EFFECTS["body-slam"].trigger, "failed-save");
assert.equal(MOVE_MODIFIER_EFFECTS.stockpile.stackMax, 3);
assert.equal(modifierTriggerMatches(MOVE_MODIFIER_EFFECTS["steel-wing"], { attack: { hit: true, natural: 19 } }), true);
assert.equal(modifierTriggerMatches(MOVE_MODIFIER_EFFECTS["steel-wing"], { attack: { hit: true, natural: 18 } }), false);
assert.equal(MOVE_MODIFIER_EFFECTS.reflect.modifiers.meleeDamageResistance, true);

const { pokemonCombatModifiers } = await import("./move-modifiers.mjs");
const flaggedEffect = state => ({ getFlag: (moduleId, key) => moduleId === "poke5e-foundry" ? (key === "kind" ? "move-modifier" : state) : null });
const mockActor = { effects: [flaggedEffect({ modifiers: { attack: -5, saves: { wis: -2 }, attackDisadvantage: true } })] };
assert.deepEqual(pokemonCombatModifiers(mockActor).saves, { wis: -2 });
assert.equal(pokemonCombatModifiers(mockActor).attack, -5);
assert.equal(pokemonCombatModifiers(mockActor).attackDisadvantage, true);

const auditCandidates = moves.filter(isTargetModifierCandidate);
const uncovered = auditCandidates.filter(move => !MOVE_MODIFIER_EFFECTS[move.id] && !CONTEXTUAL_MODIFIER_COVERAGE[move.id]);
assert.deepEqual(uncovered.map(move => move.id), [], `Movimientos modificadores sin cobertura: ${uncovered.map(move => move.id).join(", ")}`);
console.log(`Audited ${moves.length} moves: ${Object.keys(MOVE_MODIFIER_EFFECTS).length} automated modifiers and ${Object.keys(CONTEXTUAL_MODIFIER_COVERAGE).length} delegated effects.`);

function isTargetModifierCandidate(move) {
  const text = [...(move.description ?? []), move.higherLevels ?? ""].filter(value => typeof value === "string").join(" ");
  const subject = /\b(target|creature|opponent|enemy|ally|allies)\b/i.test(text);
  const statistic = /\b(attack rolls?|saving throws?|armor class|AC|speed|movement|STR|DEX|CON|INT|WIS|CHA|ability scores?|damage rolls?)\b/i.test(text);
  const change = /\b(increase|decrease|reduce|lower|raise|boost|penalty|bonus|advantage|disadvantage|halve|double|stack|adds?)\b|[+-]\d/i.test(text);
  const lasting = move.duration !== "instantaneous" || /until|before the (?:end|beginning|start)|next (?:attack|move|turn|saving throw)|for the duration|remainder of (?:the )?(?:combat|encounter)|while .*battle|stack/i.test(text);
  return subject && statistic && change && lasting;
}
