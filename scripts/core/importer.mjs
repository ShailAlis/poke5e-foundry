/**
 * Importador de contenido: crea o actualiza los compendios de mundo con
 * especies, movimientos, habilidades, objetos, la clase de Entrenador y un
 * compendio de estados/modificadores (tipo ActiveEffect, para arrastrar
 * directamente sobre cualquier Pokémon), además de un diario de referencia.
 *
 * Convierte lo que devuelve data-service.mjs con las funciones *ItemSource() de
 * model.mjs. Es idempotente: identifica lo ya importado por su `sourceId` y lo
 * actualiza en lugar de duplicarlo, de modo que puede ejecutarse tras cada
 * actualización del módulo. Lo abren el menú de ajustes, la ventana de
 * referencia y la macro `game.poke5e.openImporter`. Su plantilla es
 * `templates/importer.hbs`.
 */
import { loadPoke5eData } from "./data-service.mjs";
import {
  MODULE_ID,
  MODULE_PATH,
  PACKS,
  GEAR_CATEGORIES,
  gearCategory,
  speciesItemSource,
  moveItemSource,
  abilityItemSource,
  gearItemSource,
  moveMachineItemSource,
  trainerFeatureSources,
  trainerPathFeatureSources,
  trainerPathSources,
  trainerClassSource
} from "./model.mjs";
import { migrateTrainerClassAdvancements } from "../trainer/trainer-actor-sheet.mjs";
import { statModifierSources, statusConditionSources } from "./condition-catalog.mjs";
import { pokemonFeatSources } from "../trainer/feat-catalog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const CompendiumCollection = foundry.documents.collections.CompendiumCollection;

/** Ventana del importador de compendios, exclusiva del director. */
export class Poke5eImporter extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-importer",
    classes: ["poke5e", "poke5e-importer"],
    tag: "form",
    window: { title: "POKE5E.Menu.Importer.Name", icon: "fa-solid fa-box-archive" },
    position: { width: 620, height: "auto" }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/importer.hbs` } };

  /** Título traducido de la ventana. */
  get title() {
    return game.i18n.localize("POKE5E.Menu.Importer.Name");
  }

  /**
   * Datos del formulario: si quien mira es director, el idioma configurado, el
   * comodín "*" que importa la Pokédex entera y el enlace a la referencia.
   */
  async _prepareContext() {
    return {
      isGM: game.user.isGM,
      language: game.settings.get(MODULE_ID, "dataLanguage"),
      defaultPokemon: "*",
      referenceUrl: localizedReferenceUrl("/")
    };
  }

  /** Engancha el botón de importar a #import(). */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[data-action='import']")?.addEventListener("click", event => this.#import(event));
  }

  /**
   * Ejecuta la importación de los compendios marcados, en este orden: especies
   * (según lo que seleccione selectPokemon()), movimientos, habilidades, objetos,
   * progresión y estados/modificadores. La de progresión va en dos pasos, porque
   * la clase necesita los UUID de sus rasgos, ya creados, que recoge
   * progressionFeatureUuids(). Cada tramo tiene asignado un porcentaje de la
   * barra que actualiza setStatus(), y el botón queda deshabilitado hasta
   * terminar.
   */
  async #import(event) {
    event.preventDefault();
    if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("POKE5E.Notifications.GMOnly"));
    const form = this.element;
    const button = form.querySelector("[data-action='import']");
    const status = form.querySelector("[data-import-status]");
    button.disabled = true;
    try {
      const options = {
        species: form.querySelector("[name='species']").checked,
        moves: form.querySelector("[name='moves']").checked,
        abilities: form.querySelector("[name='abilities']").checked,
        gear: form.querySelector("[name='gear']").checked,
        progression: form.querySelector("[name='progression']").checked,
        feats: form.querySelector("[name='feats']").checked,
        conditions: form.querySelector("[name='conditions']").checked,
        reference: form.querySelector("[name='reference']").checked,
        pokemonIds: form.querySelector("[name='pokemonIds']").value
      };
      setStatus(status, "Cargando datos…", 5);
      const data = await loadPoke5eData();
      let itemCount = 0;

      if (options.species) {
        setStatus(status, "Actualizando compendio de especies…", 15);
        const selected = selectPokemon(data.pokemon, options.pokemonIds);
        const pack = await ensurePack("species");
        await removeUnavailableSpecies(pack);
        itemCount += await upsertPackItems(pack, selected.map(species => speciesItemSource(
          species,
          data.movesById,
          data.evolutionsByFrom.get(species.id) ?? []
        )), status, 15, 45);
      }
      if (options.moves) {
        setStatus(status, "Actualizando compendio de movimientos…", 48);
        itemCount += await upsertPackItems(await ensurePack("moves"), data.moves.map(moveItemSource), status, 48, 66);
      }
      if (options.abilities) {
        setStatus(status, "Actualizando compendio de habilidades…", 68);
        itemCount += await upsertPackItems(await ensurePack("abilities"), data.abilities.map(abilityItemSource), status, 68, 78);
      }
      if (options.gear) {
        setStatus(status, "Actualizando compendio de objetos…", 80);
        const pack = await ensurePack("gear");
        const folders = await ensureGearCategoryFolders(pack);
        const gear = [
          ...data.items.map(gearItemSource),
          ...data.moves.filter(move => move.tm?.id != null || move.hm?.id != null).map(moveMachineItemSource)
        ].map(source => ({ ...source, folder: folders.get(source.flags[MODULE_ID].category) }));
        itemCount += await upsertPackItems(pack, gear, status, 80, 88);
      }
      if (options.progression) {
        setStatus(status, "Creando la clase de Entrenador…", 90);
        const pack = await ensurePack("progression");
        await removeLegacyTrainerPathMarkers(pack);
        const features = [...trainerFeatureSources(), ...trainerPathFeatureSources()];
        itemCount += await upsertPackItems(pack, features, status, 90, 95);
        const featureUuids = await progressionFeatureUuids(pack);
        itemCount += await upsertPackItems(pack, trainerPathSources(featureUuids), status, 95, 97);
        itemCount += await upsertPackItems(pack, [trainerClassSource(featureUuids)], status, 97, 98);
        await migrateTrainerClassAdvancements();
      }
      if (options.feats) {
        setStatus(status, "Actualizando compendio de dotes…", 98);
        itemCount += await upsertPackItems(await ensurePack("feats"), pokemonFeatSources(), status, 98, 99);
      }
      if (options.conditions) {
        setStatus(status, "Actualizando compendio de estados y modificadores…", 99);
        const pack = await ensurePack("conditions");
        const sources = [...statusConditionSources(), ...statModifierSources()];
        itemCount += await upsertPackItems(pack, sources, status, 99, 100, ActiveEffect.implementation);
      }
      if (options.reference) await upsertReferenceJournal();

      setStatus(status, "Compendios preparados.", 100);
      ui.notifications.info(game.i18n.format("POKE5E.Importer.EntriesAvailable", { count: itemCount }));
    } catch (error) {
      console.error(`${MODULE_ID} | Compendium import failed`, error);
      setStatus(status, error.message, 0);
      ui.notifications.error(game.i18n.localize("POKE5E.Notifications.ImportFailed"));
    } finally {
      button.disabled = false;
    }
  }
}

/**
 * Devuelve el compendio de mundo de una clave de PACKS, creándolo si no existe y
 * desbloqueándolo para poder escribir. Los compendios quedan editables a
 * propósito, para que el director pueda ampliarlos.
 */
async function ensurePack(key) {
  const config = PACKS[key];
  const collection = `world.${config.name}`;
  let pack = game.packs.get(collection);
  if (!pack) {
    pack = await CompendiumCollection.createCompendium({
      type: config.type ?? "Item",
      label: config.label,
      name: config.name,
      package: "world",
      system: game.system.id
    });
  }
  if (pack.locked) await pack.configure({ locked: false });
  return pack;
}

/**
 * Crea y mantiene las cinco carpetas administradas del compendio de objetos.
 * Se identifican por flag, no por nombre, para que un cambio de idioma no las
 * duplique. Devuelve categoryId -> folderId para asignar cada documento.
 */
async function ensureGearCategoryFolders(pack) {
  if (pack.locked) await pack.configure({ locked: false });
  const folders = new Map();
  for (const folder of pack.folders) {
    const category = folder.getFlag(MODULE_ID, "gearCategory");
    if (category) folders.set(category, folder);
  }
  const missing = GEAR_CATEGORIES.filter(category => !folders.has(category.id));
  if (missing.length) {
    const created = await Folder.implementation.createDocuments(missing.map(category => ({
      name: game.i18n.localize(category.label),
      type: "Item",
      folder: null,
      color: category.color,
      sorting: "m",
      sort: (GEAR_CATEGORIES.indexOf(category) + 1) * 100000,
      flags: { [MODULE_ID]: { gearCategory: category.id } }
    })), { pack: pack.collection });
    for (const folder of created) folders.set(folder.getFlag(MODULE_ID, "gearCategory"), folder);
  }
  const updates = GEAR_CATEGORIES.map((category, index) => {
    const folder = folders.get(category.id);
    const name = game.i18n.localize(category.label);
    const sort = (index + 1) * 100000;
    if (!folder || (folder.name === name && folder.color === category.color && folder.sort === sort)) return null;
    return { _id: folder.id, name, color: category.color, sort };
  }).filter(Boolean);
  if (updates.length) await Folder.implementation.updateDocuments(updates, { pack: pack.collection });
  return new Map([...folders].map(([category, folder]) => [category, folder.id]));
}

/**
 * Migra el compendio existente sin exigir una reimportación: normaliza el
 * subtipo mostrado por D&D 5e, el flag de categoría y la carpeta de cada objeto.
 */
export async function migrateGearCompendiumCategories() {
  const pack = game.packs.get(`world.${PACKS.gear.name}`);
  if (!pack) return 0;
  const folders = await ensureGearCategoryFolders(pack);
  const index = await pack.getIndex({ fields: [
    `flags.${MODULE_ID}.kind`, `flags.${MODULE_ID}.sourceId`, `flags.${MODULE_ID}.category`, "system.type.value", "folder"
  ] });
  const updates = [];
  for (const entry of index.values()) {
    const kind = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.kind`);
    if (!["gear", "move-machine"].includes(kind)) continue;
    const sourceId = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`);
    const previousCategory = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.category`);
    const category = gearCategory({ kind, sourceId, category: previousCategory });
    const folder = folders.get(category);
    const currentFolder = entry.folder?.id ?? entry.folder?._id ?? entry.folder ?? null;
    const currentType = foundry.utils.getProperty(entry, "system.type.value");
    if (previousCategory === category && currentType === category && currentFolder === folder) continue;
    updates.push({
      _id: entry._id,
      folder,
      "system.type.value": category,
      "system.type.subtype": "",
      [`flags.${MODULE_ID}.category`]: category
    });
  }
  await inBatches(updates, batch => Item.implementation.updateDocuments(batch, { pack: pack.collection }));
  return updates.length;
}

/** Elimina del compendio las antiguas especies del módulo cuyo número de Pokédex sea 0. */
async function removeUnavailableSpecies(pack) {
  const speciesPath = `flags.${MODULE_ID}.species`;
  const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.kind`, `${speciesPath}.number`] });
  const ids = [...index.values()]
    .filter(entry => foundry.utils.getProperty(entry, `flags.${MODULE_ID}.kind`) === "species")
    .filter(entry => Number(foundry.utils.getProperty(entry, `${speciesPath}.number`)) === 0)
    .map(entry => entry._id);
  if (ids.length) await Item.implementation.deleteDocuments(ids, { pack: pack.collection });
}

/** Retira las antiguas dotes descriptivas sustituidas por subclases reales. */
async function removeLegacyTrainerPathMarkers(pack) {
  const obsolete = new Set([1, 5, 9, 15].map(level => `trainer-feature-trainer-path-${level}`));
  const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.sourceId`] });
  const ids = [...index.values()]
    .filter(entry => obsolete.has(foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`)))
    .map(entry => entry._id);
  if (ids.length) await Item.implementation.deleteDocuments(ids, { pack: pack.collection });
}

/**
 * Vuelca una lista de fuentes en un compendio sin duplicar nada: indexa lo ya
 * presente por "kind:sourceId", actualiza lo que coincide y crea el resto, todo
 * en tandas de 100 con inBatches() para no bloquear la interfaz. Es lo que hace
 * idempotente al importador. La usan todos los tramos de #import().
 */
async function upsertPackItems(pack, sources, status, startProgress, endProgress, docClass = Item.implementation) {
  const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.sourceId`, `flags.${MODULE_ID}.kind`] });
  const existing = new Map();
  for (const entry of index.values()) {
    const sourceId = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`);
    const kind = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.kind`);
    if (sourceId && kind) existing.set(`${kind}:${sourceId}`, entry._id);
  }
  const creates = [];
  const updates = [];
  for (const source of sources) {
    const flags = source.flags[MODULE_ID];
    const id = existing.get(`${flags.kind}:${flags.sourceId}`);
    if (id) updates.push({ ...source, _id: id });
    else creates.push(source);
  }
  let completed = 0;
  const total = Math.max(sources.length, 1);
  const progress = () => setStatus(status, `${pack.title}: ${completed}/${sources.length}`, startProgress + Math.round((completed / total) * (endProgress - startProgress)));
  await inBatches(updates, async batch => {
    await docClass.updateDocuments(batch, { pack: pack.collection });
    completed += batch.length;
    progress();
  });
  await inBatches(creates, async batch => {
    await docClass.createDocuments(batch, { pack: pack.collection });
    completed += batch.length;
    progress();
  });
  return sources.length;
}

/**
 * Recoge los UUID de los rasgos de Entrenador ya presentes en el compendio de
 * progresión, indexados por su `sourceId`. trainerClassSource() (model.mjs) los
 * necesita para enlazarlos en los avances por nivel de la clase.
 */
async function progressionFeatureUuids(pack) {
  const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.sourceId`, `flags.${MODULE_ID}.kind`] });
  const entries = new Map();
  for (const entry of index.values()) {
    if (!["trainer-feature", "trainer-path-feature"].includes(foundry.utils.getProperty(entry, `flags.${MODULE_ID}.kind`))) continue;
    const sourceId = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`);
    if (sourceId) entries.set(sourceId, `Compendium.${pack.collection}.Item.${entry._id}`);
  }
  return entries;
}

/**
 * Interpreta el campo de especies: "*" importa toda la Pokédex y, si no, filtra
 * por la lista de ids separada por espacios, comas o puntos y coma, avisando de
 * los que no existan. Auxiliar de #import().
 */
function selectPokemon(allPokemon, selection) {
  const normalized = selection.trim().toLocaleLowerCase();
  if (normalized === "*") return allPokemon;
  const ids = new Set(normalized.split(/[\s,;]+/).filter(Boolean));
  if (!ids.size) throw new Error("Indica al menos un Pokémon o usa * para importar toda la Pokédex.");
  const selected = allPokemon.filter(pokemon => ids.has(pokemon.id.toLocaleLowerCase()));
  const found = new Set(selected.map(pokemon => pokemon.id.toLocaleLowerCase()));
  const missing = [...ids].filter(id => !found.has(id));
  if (missing.length) ui.notifications.warn(game.i18n.format("POKE5E.Importer.NotFound", { entries: missing.join(", ") }));
  return selected;
}

/**
 * Crea o actualiza el diario de referencia, localizándolo por su flag para no
 * duplicarlo aunque se le haya cambiado el nombre. Su contenido lo arma
 * referenceJournalHtml().
 */
async function upsertReferenceJournal() {
  const name = "Pokémon 5e — Referencia";
  const existing = game.journal.find(journal => journal.getFlag(MODULE_ID, "kind") === "reference");
  const content = referenceJournalHtml();
  if (existing) {
    await existing.update({ name });
    const page = existing.pages.contents[0];
    if (page) await page.update({ name: "Índice", "text.content": content });
    else await existing.createEmbeddedDocuments("JournalEntryPage", [{ name: "Índice", type: "text", text: { format: 1, content } }]);
  } else {
    await JournalEntry.create({
      name,
      pages: [{ name: "Índice", type: "text", text: { format: 1, content } }],
      flags: { [MODULE_ID]: { kind: "reference" } }
    });
  }
}

/**
 * HTML del índice del diario, con los enlaces a poke5e.app que localiza
 * localizedReferenceUrl(). Equivale a lo que muestra reference.mjs, pero dentro
 * del mundo.
 */
function referenceJournalHtml() {
  const links = [
    ["Reglas básicas", "/reference/core-rules"], ["Clase de Entrenador", "/reference/trainer-class"],
    ["Caminos de Entrenador", "/reference/trainer-paths"], ["Especializaciones", "/reference/specializations"],
    ["Combate", "/reference/combat"], ["Tipos de daño", "/reference/damage-types"], ["Capturar Pokémon", "/reference/catching-pokemon"],
    ["Subir de nivel", "/reference/pokemon-leveling"], ["Concursos Pokémon", "/reference/contests"], ["Estados", "/reference/status-conditions"]
  ];
  return `<h1>Pokémon 5e</h1><p>Referencia de reglas del proyecto Poke5e.</p><ul>${links.map(([label, path]) => `<li><a href="${localizedReferenceUrl(path)}" target="_blank" rel="noopener">${label}</a></li>`).join("")}</ul>`;
}

/**
 * Antepone a una ruta de poke5e.app el prefijo del idioma configurado (el inglés
 * no lleva ninguno). La usan _prepareContext() y referenceJournalHtml().
 */
function localizedReferenceUrl(path) {
  const language = game.settings.get(MODULE_ID, "dataLanguage");
  return `https://poke5e.app${language === "en" ? "" : `/${language}`}${path}`;
}

/**
 * Recorre una lista en tandas del tamaño indicado y aplica la operación a cada
 * una. Evita que crear un millar de documentos de golpe bloquee el navegador.
 * Auxiliar de upsertPackItems().
 */
async function inBatches(sources, operation, size = 100) {
  for (let index = 0; index < sources.length; index += size) await operation(sources.slice(index, index + size));
}

/**
 * Actualiza el mensaje y la barra de progreso de la ventana. La llaman #import()
 * en cada tramo y upsertPackItems() en cada tanda.
 */
function setStatus(element, message, progress) {
  if (!element) return;
  element.querySelector("span").textContent = message;
  element.querySelector("progress").value = progress;
}
