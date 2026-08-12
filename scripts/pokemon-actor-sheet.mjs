import { MODULE_ID, POKEMON_TOKEN_SCALE } from "./model.mjs";
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
  const actors = game.actors.filter(actor => ["wild", "deployed"].includes(actor.getFlag(MODULE_ID, "kind")));
  for (const actor of actors) {
    const updates = {};
    if (actor.getFlag("core", "sheetClass") !== sheetClass) updates["flags.core.sheetClass"] = sheetClass;
    if (Number(actor.prototypeToken.texture.scaleX) !== POKEMON_TOKEN_SCALE) updates["prototypeToken.texture.scaleX"] = POKEMON_TOKEN_SCALE;
    if (Number(actor.prototypeToken.texture.scaleY) !== POKEMON_TOKEN_SCALE) updates["prototypeToken.texture.scaleY"] = POKEMON_TOKEN_SCALE;
    if (Object.keys(updates).length) await actor.update(updates);
  }
  const actorIds = new Set(actors.map(actor => actor.id));
  for (const scene of game.scenes) {
    const updates = scene.tokens
      .filter(token => actorIds.has(token.actorId) && (Number(token.texture.scaleX) !== POKEMON_TOKEN_SCALE || Number(token.texture.scaleY) !== POKEMON_TOKEN_SCALE))
      .map(token => ({ _id: token.id, "texture.scaleX": POKEMON_TOKEN_SCALE, "texture.scaleY": POKEMON_TOKEN_SCALE }));
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
  }
}
