/**
 * Habilidades que se resuelven en los límites de turno. Mantenerlas aquí
 * evita que ongoing-effects.mjs tenga que conocer reglas que no pertenecen a
 * movimientos y permite probar por separado las decisiones puras.
 */
import { MODULE_ID } from "../core/model.mjs";
import { nearbyAllyActors } from "./aura-abilities.mjs";
import { POKEMON_STATUS_EFFECTS, removePokemonStatus } from "./status-effects.mjs";

export const END_TURN_ABILITY_IDS = Object.freeze(new Set(["bad-dreams", "hospitality", "shed-skin"]));

/** Mal Sueño no se acumula: usa la competencia más alta de los rivales presentes. */
export function badDreamsDamage(sleeping, opposingSources = []) {
  if (!sleeping) return 0;
  return Math.max(0, ...(opposingSources ?? [])
    .filter(source => (source.abilities ?? []).includes("bad-dreams"))
    .map(source => Number(source.proficiency) || 0));
}

/** Mudar se activa solo con un 4 y cura exactamente un estado Pokémon. */
export function shedSkinStatus(abilities = [], statusIds = [], roll = 0) {
  if (!(abilities ?? []).includes("shed-skin") || Number(roll) !== 4) return null;
  return (statusIds ?? []).find(id => POKEMON_STATUS_EFFECTS[id]) ?? null;
}

/** Ejecuta los pulsos de fin de turno de habilidad para el actor indicado. */
export async function applyEndTurnAbilityEffects(actor, combat = game.combat) {
  if (!actor || Number(actor.system.attributes?.hp?.value) <= 0) return;
  const abilities = actor.getFlag(MODULE_ID, "pokemonAbilities") ?? [];

  await applyBadDreams(actor, combat);

  if (abilities.includes("hospitality")) {
    const roll = await new Roll("1d4").evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} · Hospitalidad` });
    for (const ally of nearbyAllyActors(actor, 20)) {
      if (Number(ally.system.attributes?.hp?.value) <= 0) continue;
      const current = Number(ally.system.attributes?.hp?.temp) || 0;
      if (Number(roll.total) > current) await ally.update({ "system.attributes.hp.temp": Number(roll.total) });
    }
  }

  const statuses = actor.effects
    .filter(effect => effect.getFlag(MODULE_ID, "kind") === "pokemon-status")
    .map(effect => effect.getFlag(MODULE_ID, "status"))
    .filter(Boolean);
  if (abilities.includes("shed-skin") && statuses.length) {
    const roll = await new Roll("1d4").evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} · Mudar` });
    const status = shedSkinStatus(abilities, statuses, roll.total);
    const item = status ? await pokemonItemForActor(actor) : null;
    if (item) await removePokemonStatus(item, status);
  }
}

async function applyBadDreams(actor, combat) {
  const sleeping = actor.effects.some(effect => effect.getFlag(MODULE_ID, "status") === "asleep");
  if (!sleeping || !combat) return;
  const ownCombatant = combat.combatants.find(combatant => combatant.actor?.uuid === actor.uuid);
  const sources = combat.combatants.filter(combatant => {
    if (!combatant.actor || combatant.actor.uuid === actor.uuid) return false;
    return ownCombatant ? combatant.token?.disposition !== ownCombatant.token?.disposition : true;
  }).map(combatant => ({
    abilities: combatant.actor.getFlag(MODULE_ID, "pokemonAbilities") ?? [],
    proficiency: combatant.actor.system.attributes?.prof
  }));
  const damage = badDreamsDamage(true, sources);
  if (!damage) return;
  const hp = actor.system.attributes.hp;
  await actor.update({ "system.attributes.hp.value": Math.max(0, Number(hp.value) - damage) });
  await ChatMessage.create({ content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(actor.name)}</strong> recibe <strong>${damage} de daño</strong> por Mal Sueño.</p></div>` });
}

async function pokemonItemForActor(actor) {
  const uuid = actor?.getFlag?.(MODULE_ID, "pokemonItemUuid");
  if (uuid) return fromUuid(uuid);
  return actor?.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? null;
}

function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
