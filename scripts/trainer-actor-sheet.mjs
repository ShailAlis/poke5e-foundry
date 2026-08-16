/**
 * Ficha de personaje del Entrenador. Extiende la ficha de personaje de D&D 5e
 * añadiéndole una pestaña "Equipo Pokémon" entre la portada y el resto, sin
 * alterar nada de lo que el sistema ya presenta.
 *
 * Es la ficha predeterminada de los personajes (la registra main.mjs mediante
 * registerTrainerActorSheet()) y ofrece las mismas acciones que la ventana de
 * trainer-team.mjs. Su plantilla es `templates/trainer-sheet-team.hbs`.
 */
import { MODULE_ID, MODULE_PATH, displayAssetUrl, displayPokemonName, getPack, getPokemonItems, trainerClassSource, trainerPokeslotLimit } from "./model.mjs";
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
    { tab: "pokemonTeam", label: "POKE5E.Team.WindowTitle", icon: "fa-solid fa-circle-dot" },
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

  /** Añade una sección nativa para los Pokémon antes de «Otros rasgos». */
  async _prepareFeaturesContext(context, options) {
    context = await super._prepareFeaturesContext(context, options);
    if (context.sections?.some(section => section.id === "pokemon")) return context;
    const otherIndex = context.sections?.findIndex(section => section.id === "other") ?? -1;
    const reference = context.sections?.[otherIndex] ?? context.sections?.[0];
    if (!reference) return context;
    const section = {
      columns: reference.columns,
      dataset: { "group-origin": "pokemon" },
      groups: { origin: "pokemon" },
      id: "pokemon",
      items: [],
      label: "POKE5E.Features.Pokemon",
      order: 2500
    };
    context.sections.splice(otherIndex < 0 ? context.sections.length : otherIndex, 0, section);
    return context;
  }

  /** Asigna cada Item Pokémon o rasgo del Entrenador a su sección correcta. */
  async _prepareItemFeature(item, context) {
    await super._prepareItemFeature(item, context);
    const kind = item.getFlag(MODULE_ID, "kind");
    if (kind === "pokemon") {
      context.groups.origin = "pokemon";
      return;
    }
    if (!isTrainerClassFeature(item)) return;
    const trainerClass = this.actor.itemTypes.class.find(entry => entry.system.identifier === "trainer" || entry.getFlag(MODULE_ID, "kind")?.includes("trainer-class"));
    context.groups.origin = trainerClass?.system.identifier ?? "trainer";
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
      return ui.notifications.warn(game.i18n.format("POKE5E.Team.MaximumActive", { max: maxTeamSize }));
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
    label: "POKE5E.Sheets.Trainer"
  });
}

/**
 * Corrige los rasgos creados antes de que el módulo guardase explícitamente su
 * origen de clase. La agrupación visual también funciona antes de migrarlos.
 */
export async function migrateTrainerFeatureGroups() {
  if (!game.user.isGM) return;
  for (const actor of game.actors.filter(entry => entry.type === "character")) {
    const updates = actor.items.filter(item => isTrainerClassFeature(item)
      && (item.getFlag(MODULE_ID, "featureOrigin") !== "trainer" || item.system.type?.value !== "class")).map(item => ({
      _id: item.id,
      "system.type.value": "class",
      "system.type.subtype": "",
      [`flags.${MODULE_ID}.featureOrigin`]: "trainer"
    }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}

/**
 * Sincroniza la progresiÃ³n canÃ³nica con las clases Entrenador antiguas. Actualiza
 * primero la copia maestra del compendio y despuÃ©s las clases ya embebidas en PJ,
 * que Foundry mantiene como copias independientes y no actualiza por sÃ­ solo.
 * Conserva los avances existentes, sus elecciones y cualquier avance
 * personalizado; solo incorpora las entradas canÃ³nicas que falten.
 */
export async function migrateTrainerClassAdvancements() {
  if (!game.user.isGM) return;
  const pack = getPack("progression");
  if (!pack) return;
  const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.sourceId`, `flags.${MODULE_ID}.kind`] });
  const featureUuids = new Map();
  let trainerClassId = null;
  for (const entry of index.values()) {
    const kind = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.kind`);
    const sourceId = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`);
    if (kind === "trainer-feature" && sourceId) featureUuids.set(sourceId, `Compendium.${pack.collection}.Item.${entry._id}`);
    if (kind === "trainer-class" && sourceId === "trainer-class") trainerClassId = entry._id;
  }
  const expected = trainerClassSource(featureUuids);
  if (trainerClassId && !pack.locked) {
    const document = await pack.getDocument(trainerClassId);
    await updateTrainerClassAdvancements(document, expected.system.advancement, expected.img);
  }
  for (const actor of game.actors.filter(entry => entry.type === "character")) {
    for (const item of actor.itemTypes.class ?? []) {
      const kind = String(item.getFlag(MODULE_ID, "kind") ?? "");
      if (kind === "npc-trainer-class" || (item.system.identifier !== "trainer" && !kind.includes("trainer-class"))) continue;
      const omitLevelOneGrant = kind === "trainer-creation-class";
      const advancements = omitLevelOneGrant
        ? Object.fromEntries(Object.entries(expected.system.advancement).filter(([, entry]) => !(entry.type === "ItemGrant" && entry.level === 1)))
        : expected.system.advancement;
      await updateTrainerClassAdvancements(item, advancements, expected.img);
    }
  }
}

/** Mezcla la plantilla corregida con el historial y los avances personalizados. */
async function updateTrainerClassAdvancements(item, expected, icon) {
  if (!item) return;
  const stored = item._source?.system?.advancement ?? item.system?.advancement ?? [];
  const current = Array.isArray(stored) ? stored : Object.values(stored ?? {});
  const expectedEntries = Array.isArray(expected) ? expected : Object.values(expected ?? {});
  const byId = new Map(current.filter(entry => entry?._id).map(entry => [entry._id, entry]));
  const expectedIds = new Set(expectedEntries.map(entry => entry._id));
  const mergedEntries = expectedEntries.map(entry => {
    const existing = byId.get(entry._id);
    return foundry.utils.deepClone(existing ?? entry);
  });
  mergedEntries.push(...current.filter(entry => entry?._id && !expectedIds.has(entry._id)).map(entry => foundry.utils.deepClone(entry)));
  const merged = Object.fromEntries(mergedEntries.map(entry => [entry._id, entry]));
  const currentMapping = Object.fromEntries(current.filter(entry => entry?._id).map(entry => [entry._id, entry]));
  const update = {};
  if (JSON.stringify(currentMapping) !== JSON.stringify(merged)) update["system.advancement"] = merged;
  if (item._source?.system?.hd?.denomination !== "d6") update["system.hd.denomination"] = "d6";
  if (item.img !== icon) update.img = icon;
  if (Object.keys(update).length) await item.update(update);
}

function isTrainerClassFeature(item) {
  if (item.type !== "feat") return false;
  if (item.getFlag(MODULE_ID, "featureOrigin") === "trainer") return true;
  const kind = String(item.getFlag(MODULE_ID, "kind") ?? "");
  const sourceId = String(item.getFlag(MODULE_ID, "sourceId") ?? "");
  return kind === "trainer-feature"
    || kind === "trainer-creation-feature"
    || /^(trainer-creation-(license|pokedex|pokeball-proficiency|pokeslots|specialization)|npc-(specialization|path)-)/.test(sourceId);
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
