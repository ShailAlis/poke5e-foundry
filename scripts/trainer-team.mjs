import { MODULE_ID, MODULE_PATH, displayAssetUrl, displayPokemonName, getPokemonItems, portraitUrl, trainerPokeslotLimit } from "./model.mjs";
import { experienceProgress } from "./progression.mjs";
import { Poke5eSpeciesBrowser } from "./species-browser.mjs";
import { Poke5ePokemonSheet } from "./pokemon-sheet.mjs";
import { deployPokemon, recallPokemon, deployedActorFor, syncPokemonIdentityToDeployment } from "./deployment.mjs";
import { attemptCapture } from "./capture.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class Poke5eTrainerTeam extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-trainer-team",
    classes: ["poke5e", "poke5e-trainer-team"],
    window: { title: "Equipo Pokémon", icon: "fa-solid fa-circle-dot", resizable: true },
    position: { width: 900, height: 760 }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/trainer-team.hbs` } };

  constructor({ actor, ...options } = {}) {
    super({ ...options, id: `poke5e-trainer-team-${actor?.id ?? "unknown"}` });
    this.actor = actor;
  }

  get title() {
    return `Equipo Pokémon — ${this.actor.name}`;
  }

  async _prepareContext() {
    const all = getPokemonItems(this.actor).map(item => preparePokemon(item));
    const maxTeamSize = trainerPokeslotLimit(this.actor);
    const active = all.filter(entry => entry.instance.inTeam);
    const team = active.slice(0, maxTeamSize);
    const reserve = [...all.filter(entry => !entry.instance.inTeam), ...active.slice(maxTeamSize).map(entry => ({ ...entry, overflow: true }))];
    const gear = this.actor.items.filter(item => item.getFlag(MODULE_ID, "kind") === "gear").map(item => ({
      id: item.id, name: item.name, img: displayAssetUrl(item.img, "icons/svg/item-bag.svg"), quantity: item.system.quantity ?? 1
    }));
    return {
      actor: this.actor,
      canEdit: this.actor.isOwner,
      team,
      reserve,
      gear,
      teamCount: team.length,
      maxTeamSize,
      totalCount: all.length
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[data-action='browse-species']")?.addEventListener("click", () => new Poke5eSpeciesBrowser({ actor: this.actor }).render(true));
    this.element.querySelector("[data-action='capture-target']")?.addEventListener("click", () => attemptCapture(this.actor).then(() => this.render({ force: true })));
    this.element.querySelectorAll("[data-action='open-pokemon']").forEach(button => button.addEventListener("click", event => this.#open(event)));
    this.element.querySelectorAll("[data-action='toggle-team']").forEach(button => button.addEventListener("click", event => this.#toggleTeam(event)));
    this.element.querySelectorAll("[data-action='deploy']").forEach(button => button.addEventListener("click", event => this.#deploy(event)));
    this.element.querySelectorAll("[data-action='recall']").forEach(button => button.addEventListener("click", event => this.#recall(event)));
    this.element.querySelectorAll("[data-action='remove']").forEach(button => button.addEventListener("click", event => this.#remove(event)));
    this.element.querySelectorAll("[data-field]").forEach(input => input.addEventListener("change", event => this.#updateField(event)));
  }

  #item(event) {
    return this.actor.items.get(event.currentTarget.closest("[data-item-id]")?.dataset.itemId);
  }

  #open(event) {
    const item = this.#item(event);
    if (item) new Poke5ePokemonSheet({ pokemonItem: item }).render(true);
  }

  async #toggleTeam(event) {
    const item = this.#item(event);
    if (!item || !this.actor.isOwner) return;
    const instance = foundry.utils.deepClone(item.getFlag(MODULE_ID, "instance"));
    const limit = trainerPokeslotLimit(this.actor);
    if (!instance.inTeam && getPokemonItems(this.actor).filter(entry => entry.getFlag(MODULE_ID, "instance")?.inTeam).length >= limit) {
      return ui.notifications.warn(`El equipo activo ya ha alcanzado sus ${limit} Pokéslots.`);
    }
    instance.inTeam = !instance.inTeam;
    await item.setFlag(MODULE_ID, "instance", instance);
    this.render({ force: true });
  }

  async #deploy(event) {
    const item = this.#item(event);
    if (!item) return;
    await deployPokemon(item);
    this.render({ force: true });
  }

  async #recall(event) {
    const item = this.#item(event);
    if (!item) return;
    await recallPokemon(item);
    this.render({ force: true });
  }

  async #remove(event) {
    const item = this.#item(event);
    if (!item || !this.actor.isOwner) return;
    const confirmed = await DialogV2.confirm({
      window: { title: "Retirar Pokémon" },
      content: `<p>¿Retirar a <strong>${foundry.utils.escapeHTML(displayPokemonName(item))}</strong> de ${foundry.utils.escapeHTML(this.actor.name)}?</p>`,
      yes: { default: true }, no: {}
    });
    if (!confirmed) return;
    await recallPokemon(item);
    await item.delete();
    this.render({ force: true });
  }

  async #updateField(event) {
    const item = this.#item(event);
    if (!item || !this.actor.isOwner) return;
    const field = event.currentTarget.dataset.field;
    let value = event.currentTarget.type === "number" ? Number(event.currentTarget.value) : event.currentTarget.value;
    const instance = foundry.utils.deepClone(item.getFlag(MODULE_ID, "instance"));
    foundry.utils.setProperty(instance, field, value);
    if (field === "hp.value") instance.hp.value = Math.max(0, Math.min(Number(instance.hp.max) || 1, value));
    if (field === "level") instance.level = Math.max(1, Math.min(20, value));
    const update = { [`flags.${MODULE_ID}.instance`]: instance };
    if (field === "nickname") update.name = value.trim() || item.getFlag(MODULE_ID, "species").name;
    await item.update(update);
    if (field === "nickname") await syncPokemonIdentityToDeployment(item);
    this.render({ force: true });
  }
}

function preparePokemon(item) {
  const species = item.getFlag(MODULE_ID, "species") ?? {};
  const instance = item.getFlag(MODULE_ID, "instance") ?? {};
  const deployed = deployedActorFor(item);
  const experience = experienceProgress(instance.experience, instance.level);
  return {
    id: item.id,
    name: displayPokemonName(item),
    speciesName: species.name,
    img: portraitUrl(species, instance.shiny),
    types: species.type ?? [],
    instance,
    deployed: Boolean(deployed),
    deployedActorId: deployed?.id,
    number: species.number,
    experience: {
      total: experience.total,
      remaining: experience.remaining,
      nextLevel: Math.min((Number(instance.level) || 1) + 1, 20),
      maximumLevel: experience.maximumLevel,
      percent: experience.maximumLevel ? 100 : Math.max(0, Math.min(100, Math.round((experience.gained / Math.max(experience.span, 1)) * 100)))
    }
  };
}
