import { MODULE_ID } from "./model.mjs";
import { Poke5ePokemonSheet } from "./pokemon-sheet.mjs";

const NPCActorSheet = dnd5e.applications.actor.NPCActorSheet;

export class Poke5eCombatPokemonActorSheet extends NPCActorSheet {
  render(options = {}) {
    this.#openPokemonSheet(options);
    return this;
  }

  async #openPokemonSheet(options) {
    const sourceUuid = this.actor.getFlag(MODULE_ID, "pokemonItemUuid");
    const original = sourceUuid ? await fromUuid(sourceUuid) : null;
    const pokemonItem = original ?? this.actor.items.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon");
    if (!pokemonItem) return ui.notifications.error("Este actor no contiene una ficha Pokémon válida.");
    new Poke5ePokemonSheet({ pokemonItem }).render({ force: options.force ?? true });
  }
}

export function registerPokemonActorSheet() {
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, Poke5eCombatPokemonActorSheet, {
    types: ["npc"],
    makeDefault: false,
    label: "Pokémon 5e — Ficha Pokémon de combate"
  });
}

export async function migratePokemonActorSheets() {
  const sheetClass = `${MODULE_ID}.Poke5eCombatPokemonActorSheet`;
  const actors = game.actors.filter(actor => ["wild", "deployed"].includes(actor.getFlag(MODULE_ID, "kind")) && actor.getFlag("core", "sheetClass") !== sheetClass);
  for (const actor of actors) await actor.update({ "flags.core.sheetClass": sheetClass });
}
