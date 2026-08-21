/**
 * Ventana de enlaces a las reglas de poke5e.app. No consulta datos ni modifica
 * documentos: solo arma las URL en el idioma configurado. La registra main.mjs
 * como menú de ajustes y como macro `game.poke5e.openReference`. Declara sus
 * propias constantes en lugar de importarlas de model.mjs para no arrastrar
 * dependencias en una ventana puramente informativa.
 */
const MODULE_ID = "poke5e-foundry";
const MODULE_PATH = `modules/${MODULE_ID}`;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Ventana con los accesos directos a las secciones de reglas de poke5e.app. */
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

  /** Título traducido de la ventana. */
  get title() {
    return game.i18n.localize("POKE5E.Menu.Reference.Name");
  }

  /**
   * Construye los enlaces de `templates/reference.hbs` con el prefijo de idioma
   * que corresponda al ajuste `dataLanguage`, y marca si quien mira es director
   * para mostrarle el acceso al importador.
   */
  async _prepareContext() {
    const language = game.settings.get(MODULE_ID, "dataLanguage");
    const base = `https://poke5e.app${language === "en" ? "" : `/${language}`}`;
    return {
      isGM: game.user.isGM,
      links: [
        ["POKE5E.Reference.CoreRules", `${base}/reference/core-rules`, "fa-solid fa-dice-d20"],
        ["POKE5E.Importer.TrainerClass", `${base}/reference/trainer-class`, "fa-solid fa-user"],
        ["POKE5E.Reference.TrainerPaths", `${base}/reference/trainer-paths`, "fa-solid fa-road"],
        ["POKE5E.Reference.Specializations", `${base}/reference/specializations`, "fa-solid fa-star"],
        ["POKE5E.Reference.Combat", `${base}/reference/combat`, "fa-solid fa-burst"],
        ["POKE5E.Reference.DamageTypes", `${base}/reference/damage-types`, "fa-solid fa-shield-halved"],
        ["POKE5E.Reference.Catching", `${base}/reference/catching-pokemon`, "fa-solid fa-circle-dot"],
        ["POKE5E.Reference.Pokedex", `${base}/pokemon`, "fa-solid fa-list"],
        ["POKE5E.Common.Moves", `${base}/moves`, "fa-solid fa-wand-magic-sparkles"],
        ["POKE5E.Common.Items", `${base}/items`, "fa-solid fa-bag-shopping"],
        ["POKE5E.Reference.EncounterGenerator", `${base}/encounter-tool`, "fa-solid fa-mountain-sun"]
      ].map(([label, url, icon]) => ({ label: game.i18n.localize(label), url, icon }))
    };
  }

  /**
   * Engancha el botón que abre el importador, cargándolo con `import()`
   * dinámico para que esta ventana no dependa de importer.mjs.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[data-action='open-importer']")?.addEventListener("click", async () => {
      const { Poke5eImporter } = await import("../core/importer.mjs");
      new Poke5eImporter().render(true);
    });
  }
}
