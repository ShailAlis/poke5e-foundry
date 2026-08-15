/**
 * Ficha de personaje del Entrenador. Extiende la ficha de personaje de D&D 5e
 * añadiéndole una pestaña "Equipo Pokémon" entre la portada y el resto, sin
 * alterar nada de lo que el sistema ya presenta.
 *
 * Es la ficha predeterminada de los personajes (la registra main.mjs mediante
 * registerTrainerActorSheet()) y ofrece las mismas acciones que la ventana de
 * trainer-team.mjs. Su plantilla es `templates/trainer-sheet-team.hbs`.
 */
import { MODULE_ID, MODULE_PATH, displayAssetUrl, displayPokemonName, getPokemonItems, trainerPokeslotLimit } from "./model.mjs";
import { Poke5ePokemonSheet } from "./pokemon-sheet.mjs";
import { Poke5eSpeciesBrowser } from "./species-browser.mjs";
import { deployPokemon, deployedActorFor, recallPokemon } from "./deployment.mjs";
import { attemptCapture } from "./capture.mjs";
import { experienceProgress } from "./progression.mjs";
import { adaptTrainerCurrencyFields, pokedollars, updatePokedollars } from "./economy.mjs";

const CharacterActorSheet = dnd5e.applications.actor.CharacterActorSheet;

/**
 * Ficha de personaje con pestaña de equipo Pokémon. Declara sus acciones en
 * DEFAULT_OPTIONS.actions —métodos estáticos privados que reciben `this` ligado
 * a la ficha— e inserta su parte y su pestaña entre las heredadas.
 */
export class Poke5eTrainerActorSheet extends CharacterActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["poke5e-trainer-sheet"],
    position: { width: 900, height: 1000 },
    actions: {
      browsePokemon: Poke5eTrainerActorSheet.#browsePokemon,
      capturePokemon: Poke5eTrainerActorSheet.#capturePokemon,
      deployPokemon: Poke5eTrainerActorSheet.#deployPokemon,
      openPokemon: Poke5eTrainerActorSheet.#openPokemon,
      recallPokemon: Poke5eTrainerActorSheet.#recallPokemon,
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

  /**
   * Añade los datos de la pestaña de equipo y deja el resto de partes tal como
   * las prepara D&D 5e. Construye tantos huecos como Pokéslots dé
   * trainerPokeslotLimit() —vacíos incluidos, para dibujar la rejilla— y manda a
   * la reserva los que sobren. Cada entrada la prepara preparePokemon().
   */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId !== "pokemonTeam") return context;
    const all = getPokemonItems(this.actor).map(item => preparePokemon(item));
    const maxTeamSize = trainerPokeslotLimit(this.actor);
    const active = all.filter(entry => entry.instance.inTeam);
    const team = active.slice(0, maxTeamSize);
    return {
      ...context,
      pokemon: {
        allCount: all.length,
        canEdit: this.actor.isOwner,
        pokedollars: pokedollars(this.actor),
        maxTeamSize,
        reserve: [...all.filter(entry => !entry.instance.inTeam), ...active.slice(maxTeamSize).map(entry => ({ ...entry, overflow: true }))],
        slots: Array.from({ length: maxTeamSize }, (_, index) => team[index]
          ? { ...team[index], position: index + 1 }
          : { empty: true, position: index + 1 }),
        teamCount: team.length
      }
    };
  }

  /** Adapta los campos monetarios nativos y conecta el saldo de la pestaña. */
  _onRender(context, options) {
    super._onRender(context, options);
    adaptTrainerCurrencyFields(this.element);
    this.element.querySelector("[data-poke5e-pokedollars]")?.addEventListener("change", async event => {
      await updatePokedollars(this.actor, event.currentTarget.value);
      this.render({ force: true });
    });
  }

  /** Item Pokémon de la fila pulsada; base de las acciones de la pestaña. */
  static #item(sheet, target) {
    return sheet.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  /** Acción "Añadir Pokémon": abre el buscador de species-browser.mjs. */
  static #browsePokemon(event, target) {
    const sheet = this;
    new Poke5eSpeciesBrowser({ actor: sheet.actor }).render(true);
  }

  /** Acción "Capturar objetivo": lanza attemptCapture() (capture.mjs). */
  static async #capturePokemon(event, target) {
    const sheet = this;
    await attemptCapture(sheet.actor);
    sheet.render({ force: true });
  }

  /** Acción de abrir la ficha Pokédex del Pokémon de la fila. */
  static #openPokemon(event, target) {
    const item = Poke5eTrainerActorSheet.#item(this, target);
    if (item) new Poke5ePokemonSheet({ pokemonItem: item }).render(true);
  }

  /**
   * Acción de mover un Pokémon entre equipo y reserva, con el mismo control de
   * Pokéslots que la ventana de trainer-team.mjs.
   */
  static async #togglePokemonTeam(event, target) {
    const sheet = this;
    const item = Poke5eTrainerActorSheet.#item(sheet, target);
    if (!item || !sheet.actor.isOwner) return;
    const instance = foundry.utils.deepClone(item.getFlag(MODULE_ID, "instance"));
    const teamCount = getPokemonItems(sheet.actor).filter(entry => entry.getFlag(MODULE_ID, "instance")?.inTeam).length;
    const maxTeamSize = trainerPokeslotLimit(sheet.actor);
    if (!instance.inTeam && teamCount >= maxTeamSize) {
      return ui.notifications.warn(`Los Pokéslots de este entrenador permiten un máximo de ${maxTeamSize} Pokémon activos.`);
    }
    instance.inTeam = !instance.inTeam;
    await item.setFlag(MODULE_ID, "instance", instance);
    sheet.render({ force: true });
  }

  /** Acción de sacar al Pokémon al mapa con deployPokemon(). */
  static async #deployPokemon(event, target) {
    const sheet = this;
    const item = Poke5eTrainerActorSheet.#item(sheet, target);
    if (!item) return;
    await deployPokemon(item);
    sheet.render({ force: true });
  }

  /** Acción de retirar al Pokémon del mapa con recallPokemon(). */
  static async #recallPokemon(event, target) {
    const sheet = this;
    const item = Poke5eTrainerActorSheet.#item(sheet, target);
    if (!item) return;
    await recallPokemon(item);
    sheet.render({ force: true });
  }
}

/**
 * Registra esta ficha como predeterminada para los actores de tipo personaje.
 * La llama el hook `init` de main.mjs.
 */
export function registerTrainerActorSheet() {
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, Poke5eTrainerActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "Pokémon 5e — Ficha de Entrenador"
  });
}

/**
 * Aplana un Item Pokémon para la pestaña: nombre visible, imagen, PG con su
 * porcentaje para la barra, si está desplegado y el progreso de
 * experienceProgress(). Homóloga de la de trainer-team.mjs, ajustada a esta
 * plantilla. Auxiliar de _preparePartContext().
 */
function preparePokemon(item) {
  const instance = item.getFlag(MODULE_ID, "instance") ?? {};
  const hpValue = Math.max(0, Number(instance.hp?.value) || 0);
  const hpMax = Math.max(1, Number(instance.hp?.max) || 1);
  const experience = experienceProgress(instance.experience, instance.level);
  return {
    itemId: item.id,
    name: displayPokemonName(item),
    speciesName: item.name,
    img: displayAssetUrl(item.img, "icons/svg/mystery-man.svg"),
    instance,
    deployed: Boolean(deployedActorFor(item)),
    hpValue,
    hpMax,
    hpPercent: Math.max(0, Math.min(100, Math.round((hpValue / hpMax) * 100))),
    experience
  };
}
