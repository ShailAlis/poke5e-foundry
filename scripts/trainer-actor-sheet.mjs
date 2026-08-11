import { MODULE_ID, MODULE_PATH, displayPokemonName, getPokemonItems } from "./model.mjs";
import { Poke5ePokemonSheet } from "./pokemon-sheet.mjs";
import { Poke5eSpeciesBrowser } from "./species-browser.mjs";
import { Poke5eTrainerTeam } from "./trainer-team.mjs";
import { deployPokemon, deployedActorFor, recallPokemon } from "./deployment.mjs";

const CharacterActorSheet = dnd5e.applications.actor.CharacterActorSheet;

export class Poke5eTrainerActorSheet extends CharacterActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["poke5e-trainer-sheet"],
    position: { width: 900, height: 1000 },
    actions: {
      browsePokemon: Poke5eTrainerActorSheet.#browsePokemon,
      deployPokemon: Poke5eTrainerActorSheet.#deployPokemon,
      openPokemon: Poke5eTrainerActorSheet.#openPokemon,
      openTeamManager: Poke5eTrainerActorSheet.#openTeamManager,
      recallPokemon: Poke5eTrainerActorSheet.#recallPokemon,
      toggleDarkMode: Poke5eTrainerActorSheet.#toggleDarkMode,
      togglePokemonTeam: Poke5eTrainerActorSheet.#togglePokemonTeam
    }
  };

  static PARTS = {
    ...super.PARTS,
    pokemonTeam: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: `${MODULE_PATH}/templates/trainer-sheet-team.hbs`,
      scrollable: [""]
    }
  };

  static TABS = [
    ...super.TABS.slice(0, 1),
    { tab: "pokemonTeam", label: "Equipo Pokémon", icon: "fa-solid fa-circle-dot" },
    ...super.TABS.slice(1)
  ];

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId !== "pokemonTeam") return context;
    const all = getPokemonItems(this.actor).map(item => preparePokemon(item));
    const team = all.filter(entry => entry.instance.inTeam).slice(0, 6);
    return {
      ...context,
      pokemon: {
        allCount: all.length,
        canEdit: this.actor.isOwner,
        darkMode: game.settings.get(MODULE_ID, "darkMode"),
        reserve: all.filter(entry => !entry.instance.inTeam),
        slots: Array.from({ length: 6 }, (_, index) => team[index]
          ? { ...team[index], position: index + 1 }
          : { empty: true, position: index + 1 }),
        teamCount: team.length
      }
    };
  }

  static #item(sheet, target) {
    return sheet.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  static #browsePokemon(event, target) {
    const sheet = this;
    new Poke5eSpeciesBrowser({ actor: sheet.actor }).render(true);
  }

  static #openPokemon(event, target) {
    const item = Poke5eTrainerActorSheet.#item(this, target);
    if (item) new Poke5ePokemonSheet({ pokemonItem: item }).render(true);
  }

  static #openTeamManager(event, target) {
    const sheet = this;
    new Poke5eTrainerTeam({ actor: sheet.actor }).render(true);
  }

  static async #toggleDarkMode(event, target) {
    const enabled = !game.settings.get(MODULE_ID, "darkMode");
    await game.settings.set(MODULE_ID, "darkMode", enabled);
    this.render({ force: true });
  }

  static async #togglePokemonTeam(event, target) {
    const sheet = this;
    const item = Poke5eTrainerActorSheet.#item(sheet, target);
    if (!item || !sheet.actor.isOwner) return;
    const instance = foundry.utils.deepClone(item.getFlag(MODULE_ID, "instance"));
    const teamCount = getPokemonItems(sheet.actor).filter(entry => entry.getFlag(MODULE_ID, "instance")?.inTeam).length;
    if (!instance.inTeam && teamCount >= 6) return ui.notifications.warn("El equipo activo ya tiene seis Pokémon.");
    instance.inTeam = !instance.inTeam;
    await item.setFlag(MODULE_ID, "instance", instance);
    sheet.render({ force: true });
  }

  static async #deployPokemon(event, target) {
    const sheet = this;
    const item = Poke5eTrainerActorSheet.#item(sheet, target);
    if (!item) return;
    await deployPokemon(item);
    sheet.render({ force: true });
  }

  static async #recallPokemon(event, target) {
    const sheet = this;
    const item = Poke5eTrainerActorSheet.#item(sheet, target);
    if (!item) return;
    await recallPokemon(item);
    sheet.render({ force: true });
  }
}

export function registerTrainerActorSheet() {
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, Poke5eTrainerActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "Pokémon 5e — Ficha de Entrenador"
  });
}

function preparePokemon(item) {
  const instance = item.getFlag(MODULE_ID, "instance") ?? {};
  const hpValue = Math.max(0, Number(instance.hp?.value) || 0);
  const hpMax = Math.max(1, Number(instance.hp?.max) || 1);
  return {
    itemId: item.id,
    name: displayPokemonName(item),
    speciesName: item.name,
    img: item.img,
    instance,
    deployed: Boolean(deployedActorFor(item)),
    hpValue,
    hpMax,
    hpPercent: Math.max(0, Math.min(100, Math.round((hpValue / hpMax) * 100)))
  };
}
