const MODULE_ID = "poke5e-foundry";
const MODULE_PATH = `modules/${MODULE_ID}`;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Poke5eReference extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-reference",
    classes: ["poke5e", "poke5e-reference"],
    window: { title: "POKE5E.Menu.Reference.Name", icon: "fa-solid fa-book-open" },
    position: { width: 680, height: "auto" }
  };

  static PARTS = {
    main: { template: `${MODULE_PATH}/templates/reference.hbs` }
  };

  get title() {
    return game.i18n.localize("POKE5E.Menu.Reference.Name");
  }

  async _prepareContext() {
    const language = game.settings.get(MODULE_ID, "dataLanguage");
    const base = `https://poke5e.app${language === "en" ? "" : `/${language}`}`;
    return {
      isGM: game.user.isGM,
      links: [
        ["Reglas básicas", `${base}/reference/core-rules`, "fa-solid fa-dice-d20"],
        ["Clase de Entrenador", `${base}/reference/trainer-class`, "fa-solid fa-user"],
        ["Caminos de Entrenador", `${base}/reference/trainer-paths`, "fa-solid fa-road"],
        ["Especializaciones", `${base}/reference/specializations`, "fa-solid fa-star"],
        ["Combate", `${base}/reference/combat`, "fa-solid fa-burst"],
        ["Capturar Pokémon", `${base}/reference/catching-pokemon`, "fa-solid fa-circle-dot"],
        ["Pokédex", `${base}/pokemon`, "fa-solid fa-list"],
        ["Movimientos", `${base}/moves`, "fa-solid fa-wand-magic-sparkles"],
        ["Objetos", `${base}/items`, "fa-solid fa-bag-shopping"],
        ["Generador de encuentros", `${base}/encounter-tool`, "fa-solid fa-mountain-sun"]
      ].map(([label, url, icon]) => ({ label, url, icon }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[data-action='open-importer']")?.addEventListener("click", async () => {
      const { Poke5eImporter } = await import("./importer.mjs");
      new Poke5eImporter().render(true);
    });
  }
}
