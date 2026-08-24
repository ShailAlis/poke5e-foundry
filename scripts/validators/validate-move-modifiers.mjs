import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONTEXTUAL_MODIFIER_COVERAGE, MOVE_MODIFIER_EFFECTS, modifierTriggerMatches, nextModifierStacks, scaledMoveModifiers } from "../combat/move-modifier-rules.mjs";

const moves = JSON.parse(readFileSync(new URL("../../data/moves.json", import.meta.url), "utf8")).moves;
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

const { attackHitsPokemonTarget, modifierEffectSource, pokemonCombatModifiers, shouldRollPokemonDamage } = await import("../combat/move-modifiers.mjs");
const modifierEngineSource = readFileSync(new URL("../combat/move-modifiers.mjs", import.meta.url), "utf8");
for (const expected of ["moveModifiersResult", "requestModifierApplication", "MODIFIER_RETRY_DELAY", "MODIFIER_RESPONSE_TIMEOUT", "ModifierApplied", "ModifierFailed"]) {
  assert.ok(modifierEngineSource.includes(expected), `The confirmed modifier socket flow is missing ${expected}.`);
}
assert.ok(modifierEngineSource.includes("modifierCompletions.get(requestId)"), "Repeated modifier socket messages are not deduplicated by request id.");

globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1, OVERRIDE: 5 } };
globalThis.game = { combat: null };
const growlEffect = modifierEffectSource(growl, { moveId: "growl", moveName: "Growl", targetAbilities: [] }, 1);
assert.equal(growlEffect.img, "modules/poke5e-foundry/assets/icons/effects/debuffs/growl.png");
assert.equal(growlEffect.icon, growlEffect.img, "El icono visible del token debe coincidir con la imagen del ActiveEffect.");
const stockpileEffect = modifierEffectSource(MOVE_MODIFIER_EFFECTS.stockpile, { moveId: "stockpile", moveName: "Stockpile", targetAbilities: [] }, 1);
assert.equal(stockpileEffect.img, "modules/poke5e-foundry/assets/icons/effects/buffs/stockpile.png");

// Una fórmula de daño no debe ejecutarse si la tirada no alcanza la CA de
// ninguno de los objetivos. Los críticos naturales conservan las reglas de
// impacto y fallo automáticos, y sin objetivo se mantiene el flujo manual.
const armorClass = value => ({ system: { attributes: { ac: { value } } } });
const ac15 = armorClass(15);
assert.equal(attackHitsPokemonTarget({ natural: 10, total: 14 }, ac15), false);
assert.equal(attackHitsPokemonTarget({ natural: 10, total: 15 }, ac15), true);
assert.equal(attackHitsPokemonTarget({ natural: 1, total: 30 }, ac15), false);
assert.equal(attackHitsPokemonTarget({ natural: 20, total: 10 }, ac15), true);
assert.equal(shouldRollPokemonDamage({ natural: 10, total: 14 }, [ac15]), false);
assert.equal(shouldRollPokemonDamage({ natural: 10, total: 15 }, [ac15]), true);
assert.equal(shouldRollPokemonDamage({ natural: 10, total: 14 }, []), true);
assert.equal(shouldRollPokemonDamage(null, [ac15]), true);
const flaggedEffect = state => ({ getFlag: (moduleId, key) => moduleId === "poke5e-foundry" ? (key === "kind" ? "move-modifier" : state) : null });
const mockActor = { effects: [flaggedEffect({ modifiers: { attack: -5, saves: { wis: -2 }, attackDisadvantage: true } })] };
assert.deepEqual(pokemonCombatModifiers(mockActor).saves, { wis: -2 });
assert.equal(pokemonCombatModifiers(mockActor).attack, -5);
assert.equal(pokemonCombatModifiers(mockActor).attackDisadvantage, true);

// Los estados alterados también aportan modificadores mecánicos (agosto de
// 2026): Paralizado da desventaja en salvaciones de FUE/DES, Envenenado y
// Amedrentado en ataques.
const statusEffect = status => ({ getFlag: (moduleId, key) => moduleId === "poke5e-foundry" ? (key === "kind" ? "pokemon-status" : key === "status" ? status : null) : null });
const paralyzedActor = { effects: [statusEffect("paralyzed")] };
assert.deepEqual(pokemonCombatModifiers(paralyzedActor).saveDisadvantageAbilities, ["str", "dex"]);
const poisonedActor = { effects: [statusEffect("poisoned")] };
assert.equal(pokemonCombatModifiers(poisonedActor).attackDisadvantage, true);
const healthyActor = { effects: [statusEffect("burned")] };
assert.equal(pokemonCombatModifiers(healthyActor).attackDisadvantage, false);

// Cuerpo Puro/Cuerpo de Metal Pleno/Humo Blanco (lote 16 de habilidades
// Pokémon): debuffImmune también se activa por el flag síncrono
// `pokemonAbilities`, sin necesitar ningún ActiveEffect de movimiento.
const clearBodyActor = { effects: [], getFlag: (moduleId, key) => moduleId === "poke5e-foundry" && key === "pokemonAbilities" ? ["clear-body"] : null };
assert.equal(pokemonCombatModifiers(clearBodyActor).debuffImmune, true);
const noAbilityActor = { effects: [], getFlag: (moduleId, key) => moduleId === "poke5e-foundry" && key === "pokemonAbilities" ? ["overgrow"] : null };
assert.equal(pokemonCombatModifiers(noAbilityActor).debuffImmune, false, "Una habilidad sin este efecto no aporta nada");

// Desertor/Descontrol (lote 24): desventaja/ventaja según la fracción de PG
// actuales/máximos del propio actor, ya disponibles en pokemonCombatModifiers().
const berserkActor = { effects: [], system: { attributes: { hp: { value: 5, max: 100 } } }, getFlag: (moduleId, key) => moduleId === "poke5e-foundry" && key === "pokemonAbilities" ? ["berserk"] : null };
assert.equal(pokemonCombatModifiers(berserkActor).attackDisadvantage, true);
assert.equal(pokemonCombatModifiers(berserkActor).saveTargetsAdvantage, true);
const healthyBerserkActor = { effects: [], system: { attributes: { hp: { value: 90, max: 100 } } }, getFlag: (moduleId, key) => moduleId === "poke5e-foundry" && key === "pokemonAbilities" ? ["berserk"] : null };
assert.equal(pokemonCombatModifiers(healthyBerserkActor).attackDisadvantage, false, "Por encima del 25% de PG no aplica Descontrol");

// Espada Justiciera/Sin Reparos (lotes 34/35): ventaja propia vía el mismo flag síncrono.
const intrepidSwordActor = { effects: [], getFlag: (moduleId, key) => moduleId === "poke5e-foundry" && key === "pokemonAbilities" ? ["intrepid-sword"] : null };
assert.equal(pokemonCombatModifiers(intrepidSwordActor).meleeAttackAdvantage, true);
assert.equal(pokemonCombatModifiers(intrepidSwordActor).attackAdvantage, false, "Espada Justiciera solo da ventaja cuerpo a cuerpo");
const noGuardActor = { effects: [], getFlag: (moduleId, key) => moduleId === "poke5e-foundry" && key === "pokemonAbilities" ? ["no-guard"] : null };
assert.equal(pokemonCombatModifiers(noGuardActor).attackAdvantage, true);

// Desafiante (lote 41): +2 a los propios ataques mientras haya un
// ActiveEffect de estado (kind "pokemon-status") activo en el actor.
const defiantPoisonedActor = { effects: [statusEffect("poisoned")], getFlag: (moduleId, key) => moduleId === "poke5e-foundry" && key === "pokemonAbilities" ? ["defiant"] : null };
assert.equal(pokemonCombatModifiers(defiantPoisonedActor).attack, 2);
const defiantHealthyActor = { effects: [], getFlag: (moduleId, key) => moduleId === "poke5e-foundry" && key === "pokemonAbilities" ? ["defiant"] : null };
assert.equal(pokemonCombatModifiers(defiantHealthyActor).attack, 0, "Sin estado alterado activo, Desafiante no aporta nada");

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
