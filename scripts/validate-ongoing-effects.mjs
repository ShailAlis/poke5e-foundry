import assert from "node:assert/strict";
import { ONGOING_MOVE_EFFECTS, moveHasImmediateDamage, resolveOngoingMoveEffect } from "./ongoing-effects.mjs";

const move = (id, dice = { 1: "1d4", 5: "2d4", 10: "2d6", 17: "2d8" }) => ({ id, damage: { dice } });

assert.deepEqual(Object.keys(ONGOING_MOVE_EFFECTS).sort(), [
  "anchor-shot", "aqua-ring", "bind", "clamp", "constrict", "curse", "fire-spin", "glare",
  "infestation", "ingrain", "leech-seed", "roar", "rock-tomb", "salt-cure", "sand-tomb",
  "scary-face", "submission", "telekinesis", "thunder-cage", "whirlpool", "wrap"
]);
assert.equal(moveHasImmediateDamage(move("leech-seed")), false);
assert.equal(moveHasImmediateDamage(move("curse")), false);
assert.equal(moveHasImmediateDamage(move("fire-spin")), true);

assert.equal(resolveOngoingMoveEffect(move("leech-seed"), { level: 10 }).formula, "2d6");
assert.equal(resolveOngoingMoveEffect(move("fire-spin"), { level: 5 }).remaining, 3);
assert.equal(resolveOngoingMoveEffect({ id: "aqua-ring" }, { proficiency: 4 }).formula, "4");
assert.equal(resolveOngoingMoveEffect({ id: "ingrain" }, { level: 10, moveModifier: 3 }).formula, "2d8 + 3");
assert.equal(resolveOngoingMoveEffect(move("salt-cure"), { level: 17 }).formula, "1d4");

const ghostCurse = resolveOngoingMoveEffect(move("curse"), { level: 17, sourceTypes: ["ghost"] });
assert.equal(ghostCurse.formula, "2d8");
assert.equal(ghostCurse.recoil, "1d6");
assert.equal(ghostCurse.target, "conditional");

const otherCurse = resolveOngoingMoveEffect(move("curse"), { sourceTypes: ["dark"] });
assert.equal(otherCurse.target, "self");
assert.equal(otherCurse.timing, null);
assert.deepEqual(otherCurse.changes.map(change => change.value), [2, 2, -4]);

const restraint = resolveOngoingMoveEffect({ id: "thunder-cage" }, {});
assert.equal(restraint.repeatSave, "dex");
assert.deepEqual(restraint.statuses, ["restrained"]);
assert.equal(resolveOngoingMoveEffect({ id: "telekinesis" }, {}).remaining, 3);

console.log("Ongoing move effect validation passed.");
