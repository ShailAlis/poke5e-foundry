/**
 * Primary Party automÃ¡tica. D&D 5e representa la party mediante un Actor de
 * tipo `group` guardado en el ajuste mundial `dnd5e.primaryParty`. Este mÃ³dulo
 * crea ese grupo cuando falta y mantiene dentro todos los PJ controlados o
 * asignados a usuarios jugadores, sin eliminar miembros aÃ±adidos manualmente.
 */
import { MODULE_ID } from "./model.mjs";

const PARTY_KIND = "primary-party";
const MANAGED_MEMBERS_FLAG = "primaryPartyMembers";
let synchronization = Promise.resolve();

/** Encola la sincronizaciÃ³n para evitar carreras entre hooks simultÃ¡neos. */
export function synchronizePrimaryParty() {
  synchronization = synchronization.catch(() => undefined).then(performSynchronization);
  return synchronization;
}

/** IDs de PJ reales: personajes con propietario jugador o asignados a uno. */
export function playerCharacterIds(actors, users) {
  const assigned = new Set(users
    .filter(user => !user.isGM && user.character)
    .map(user => typeof user.character === "string" ? user.character : user.character.id));
  return actors.filter(actor => actor.type === "character")
    .filter(actor => actor.getFlag?.(MODULE_ID, "kind") !== "npc-trainer")
    .filter(actor => !actor.getFlag?.(MODULE_ID, "trainerCreation")?.npc)
    .filter(actor => actor.hasPlayerOwner || assigned.has(actor.id))
    .map(actor => actor.id);
}

/**
 * Combina los miembros existentes con los PJ deseados. Solo elimina IDs que
 * fueron gestionados automÃ¡ticamente en una sincronizaciÃ³n anterior.
 */
export function synchronizedMemberIds(currentIds, previousManagedIds, desiredIds) {
  const previous = new Set(previousManagedIds);
  const desired = new Set(desiredIds);
  return [...new Set([
    ...currentIds.filter(id => !previous.has(id)),
    ...desired
  ])];
}

async function performSynchronization() {
  if (!game.user.isGM) return null;
  const primaryGM = (game.users.contents ?? [...game.users]).find(user => user.active && user.isGM);
  if (primaryGM && primaryGM.id !== game.user.id) return null;
  const desiredIds = playerCharacterIds(game.actors.contents ?? [...game.actors], game.users.contents ?? [...game.users]);
  const setting = game.settings.get("dnd5e", "primaryParty");
  const resolvedSettingActor = typeof setting?.actor === "string" ? game.actors.get(setting.actor) : setting?.actor;
  const settingActor = resolvedSettingActor?.type === "group" && game.actors.has(resolvedSettingActor.id) ? resolvedSettingActor : null;
  let party = settingActor?.type === "group" ? settingActor : game.actors.find(actor => (
    actor.type === "group" && actor.getFlag(MODULE_ID, "kind") === PARTY_KIND
  ));

  if (!party) {
    party = await Actor.create({
      name: game.i18n.localize("POKE5E.Party.Name"),
      type: "group",
      img: "icons/svg/actors/group.svg",
      system: { members: desiredIds.map(actor => ({ actor })) },
      flags: { [MODULE_ID]: { kind: PARTY_KIND, [MANAGED_MEMBERS_FLAG]: desiredIds } }
    }, { renderSheet: false, poke5ePrimaryParty: true });
  }
  if (!party) return null;

  if (settingActor?.id !== party.id) await game.settings.set("dnd5e", "primaryParty", { actor: party.id });
  const currentIds = (party._source.system.members ?? []).map(member => member.actor).filter(Boolean);
  const previousManaged = party.getFlag(MODULE_ID, MANAGED_MEMBERS_FLAG) ?? [];
  const memberIds = synchronizedMemberIds(currentIds, previousManaged, desiredIds);
  const membersChanged = JSON.stringify(currentIds) !== JSON.stringify(memberIds);
  const managedChanged = JSON.stringify(previousManaged) !== JSON.stringify(desiredIds);
  const update = {};
  if (membersChanged) update["system.members"] = memberIds.map(actor => ({ actor }));
  if (managedChanged) update[`flags.${MODULE_ID}.${MANAGED_MEMBERS_FLAG}`] = desiredIds;
  if (Object.keys(update).length) await party.update(update, { poke5ePrimaryParty: true });
  return party;
}
