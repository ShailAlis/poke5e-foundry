import { MODULE_ID, MODULE_PATH, getPack, getPokemonItems, pokemonItemSourceFromSpecies } from "./model.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Poke5eSpeciesBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-species-browser",
    classes: ["poke5e", "poke5e-species-browser"],
    window: { title: "Añadir Pokémon", icon: "fa-solid fa-magnifying-glass", resizable: true },
    position: { width: 680, height: 720 }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/species-browser.hbs` } };

  constructor({ actor, ...options } = {}) {
    super({ ...options, id: `poke5e-species-browser-${actor?.id ?? "unknown"}` });
    this.actor = actor;
    this.query = "";
  }

  get title() {
    return `Añadir Pokémon a ${this.actor.name}`;
  }

  async _prepareContext() {
    const pack = getPack("species");
    if (!pack) return { missingPack: true, entries: [], total: 0, query: this.query };
    const index = await pack.getIndex({ fields: ["img", `flags.${MODULE_ID}.sourceId`, `flags.${MODULE_ID}.species.number`, `flags.${MODULE_ID}.species.type`] });
    const query = this.query.trim().toLocaleLowerCase();
    const all = [...index.values()]
      .filter(entry => !query || entry.name.toLocaleLowerCase().includes(query) || String(foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`) ?? "").includes(query))
      .sort((a, b) => Number(foundry.utils.getProperty(a, `flags.${MODULE_ID}.species.number`)) - Number(foundry.utils.getProperty(b, `flags.${MODULE_ID}.species.number`)));
    return {
      missingPack: false,
      query: this.query,
      total: all.length,
      truncated: all.length > 80,
      entries: all.slice(0, 80).map(entry => ({
        id: entry._id,
        name: entry.name,
        img: entry.img,
        number: foundry.utils.getProperty(entry, `flags.${MODULE_ID}.species.number`),
        types: foundry.utils.getProperty(entry, `flags.${MODULE_ID}.species.type`) ?? []
      }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const search = this.element.querySelector("[data-action='search']");
    search?.addEventListener("input", foundry.utils.debounce(event => {
      this.query = event.target.value;
      this.render({ force: true });
    }, 200));
    search?.focus();
    this.element.querySelectorAll("[data-action='add-species']").forEach(button => button.addEventListener("click", event => this.#add(event)));
  }

  async #add(event) {
    if (!this.actor.isOwner) return ui.notifications.warn("No tienes permiso para modificar este entrenador.");
    const pack = getPack("species");
    const speciesDocument = await pack?.getDocument(event.currentTarget.dataset.documentId);
    if (!speciesDocument) return ui.notifications.error("No se encontró la especie en el compendio.");
    const source = pokemonItemSourceFromSpecies(speciesDocument);
    if (getPokemonItems(this.actor).filter(item => item.getFlag(MODULE_ID, "instance")?.inTeam).length >= 6) {
      source.flags[MODULE_ID].instance.inTeam = false;
    }
    await this.actor.createEmbeddedDocuments("Item", [source]);
    ui.notifications.info(`${speciesDocument.name} se ha añadido a ${this.actor.name}.`);
    this.render({ force: true });
  }
}
