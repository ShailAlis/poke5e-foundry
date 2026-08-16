import assert from "node:assert/strict";
import { playerCharacterIds, synchronizedMemberIds } from "./primary-party.mjs";

const actor = (id, { owner = false, npc = false, type = "character" } = {}) => ({
  id, type, hasPlayerOwner: owner,
  getFlag: (_module, key) => key === "kind" && npc ? "npc-trainer" : key === "trainerCreation" ? { npc } : undefined
});
const actors = [actor("owned", { owner: true }), actor("assigned"), actor("npc", { owner: true, npc: true }), actor("group", { type: "group" })];
const users = [{ isGM: false, character: { id: "assigned" } }, { isGM: true, character: { id: "npc" } }];
assert.deepEqual(playerCharacterIds(actors, users), ["owned", "assigned"]);
assert.deepEqual(synchronizedMemberIds(["old-pc", "manual"], ["old-pc"], ["owned", "assigned"]), ["manual", "owned", "assigned"]);
assert.deepEqual(synchronizedMemberIds(["owned", "manual"], ["owned"], ["owned"]), ["manual", "owned"]);
console.log("Primary Party synchronization validation passed.");
