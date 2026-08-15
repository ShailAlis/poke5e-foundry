/**
 * Ficha de los actores Pokémon que están en el mapa. En vez de mostrar la ficha
 * de NPC de D&D 5e, redirige a la Pokédex de pokemon-sheet.mjs, de modo que
 * exista una sola ficha por Pokémon aunque tenga un actor temporal detrás.
 * La registra main.mjs, y crean esos actores deployment.mjs y wild-deployment.mjs.
 */
import { MODULE_ID, POKEMON_TOKEN_SCALE } from "./model.mjs";
import { Poke5ePokemonSheet } from "./pokemon-sheet.mjs";

const NPCActorSheet = dnd5e.applications.actor.NPCActorSheet;

/**
 * Ficha sustituta de los actores desplegados y salvajes. Hereda de la ficha de
 * NPC para encajar en el sistema, pero nunca se dibuja: cualquier intento de
 * abrirla desemboca en la ficha Pokémon.
 */
export class Poke5eCombatPokemonActorSheet extends NPCActorSheet {
  /** Intercepta el renderizado y abre en su lugar #openPokemonSheet(). */
  render(options = {}) {
    this.#openPokemonSheet(options);
    return this;
  }

  /**
   * Resuelve el Item Pokémon del actor —por el UUID de un desplegado o entre los
   * Items de un salvaje— y abre con él Poke5ePokemonSheet.
   */
  async #openPokemonSheet(options) {
    const sourceUuid = this.actor.getFlag(MODULE_ID, "pokemonItemUuid");
    const original = sourceUuid ? await fromUuid(sourceUuid) : null;
    const pokemonItem = original ?? this.actor.items.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon");
    if (!pokemonItem) return ui.notifications.error("Este actor no contiene una ficha Pokémon válida.");
    new Poke5ePokemonSheet({ pokemonItem }).render({ force: options.force ?? true });
  }
}

/**
 * Da de alta la ficha para los actores de tipo NPC sin imponerla por defecto:
 * solo la usan los actores a los que deployment.mjs y wild-deployment.mjs les
 * fijan `flags.core.sheetClass`. La llama el hook `init` de main.mjs.
 */
export function registerPokemonActorSheet() {
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, Poke5eCombatPokemonActorSheet, {
    types: ["npc"],
    makeDefault: false,
    label: "Pokémon 5e — Ficha Pokémon de combate"
  });
}

/**
 * Migración: asigna esta ficha y corrige escala y rotación de los tokens de los
 * actores Pokémon creados por versiones anteriores, tanto en el prototipo como
 * en los ya colocados en las escenas. La lanza el hook `ready` de main.mjs para
 * el director.
 */
export async function migratePokemonActorSheets() {
  const sheetClass = `${MODULE_ID}.Poke5eCombatPokemonActorSheet`;
  const actors = game.actors.filter(actor => ["wild", "deployed"].includes(actor.getFlag(MODULE_ID, "kind")));
  for (const actor of actors) {
    const updates = {};
    if (actor.getFlag("core", "sheetClass") !== sheetClass) updates["flags.core.sheetClass"] = sheetClass;
    if (Number(actor.prototypeToken.texture.scaleX) !== POKEMON_TOKEN_SCALE) updates["prototypeToken.texture.scaleX"] = POKEMON_TOKEN_SCALE;
    if (Number(actor.prototypeToken.texture.scaleY) !== POKEMON_TOKEN_SCALE) updates["prototypeToken.texture.scaleY"] = POKEMON_TOKEN_SCALE;
    if (Number(actor.prototypeToken.rotation) !== 0) updates["prototypeToken.rotation"] = 0;
    if (Object.keys(updates).length) await actor.update(updates);
  }
  const actorIds = new Set(actors.map(actor => actor.id));
  for (const scene of game.scenes) {
    const updates = scene.tokens
      .filter(token => actorIds.has(token.actorId) && (Number(token.texture.scaleX) !== POKEMON_TOKEN_SCALE || Number(token.texture.scaleY) !== POKEMON_TOKEN_SCALE || Number(token.rotation) !== 0))
      .map(token => ({ _id: token.id, "texture.scaleX": POKEMON_TOKEN_SCALE, "texture.scaleY": POKEMON_TOKEN_SCALE, rotation: 0 }));
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
  }
}
