/** Actualiza los iconos de MT/MO ya creadas en mundo, actores y compendio. */
import { loadPoke5eData } from "./data-service.mjs";
import { MODULE_ID, getPack, moveMachineIcon } from "./model.mjs";

export async function migrateMoveMachineIcons() {
  if (!game.user.isGM) return;
  const primaryGM = (game.users.contents ?? [...game.users]).find(user => user.active && user.isGM);
  if (primaryGM && primaryGM.id !== game.user.id) return;
  const { movesById } = await loadPoke5eData();

  for (const item of game.items ?? []) await updateMachineItem(item, movesById);
  for (const actor of game.actors ?? []) {
    const updates = actor.items.map(item => machineIconUpdate(item, movesById)).filter(Boolean);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }

  const pack = getPack("gear");
  if (!pack || pack.locked) return;
  for (const item of await pack.getDocuments()) await updateMachineItem(item, movesById);
}

function machineIconUpdate(item, movesById) {
  if (item.getFlag(MODULE_ID, "kind") !== "move-machine") return null;
  const machine = item.getFlag(MODULE_ID, "machine") ?? {};
  const move = movesById.get(machine.moveId);
  if (!move) return null;
  const img = moveMachineIcon(move, machine.kind);
  if (item.img === img && machine.type === move.type) return null;
  return {
    _id: item.id,
    img,
    [`flags.${MODULE_ID}.machine.type`]: move.type
  };
}

async function updateMachineItem(item, movesById) {
  const update = machineIconUpdate(item, movesById);
  if (update) {
    const { _id, ...changes } = update;
    await item.update(changes);
  }
}
