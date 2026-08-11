import { loadPoke5eData } from "./data-service.mjs";
import {
  MODULE_ID,
  MODULE_PATH,
  PACKS,
  speciesItemSource,
  moveItemSource,
  abilityItemSource,
  gearItemSource,
  trainerFeatureSources,
  trainerClassSource
} from "./model.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const CompendiumCollection = foundry.documents.collections.CompendiumCollection;

export class Poke5eImporter extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "poke5e-importer",
    classes: ["poke5e", "poke5e-importer"],
    tag: "form",
    window: { title: "POKE5E.Menu.Importer.Name", icon: "fa-solid fa-box-archive" },
    position: { width: 620, height: "auto" }
  };

  static PARTS = { main: { template: `${MODULE_PATH}/templates/importer.hbs` } };

  get title() {
    return game.i18n.localize("POKE5E.Menu.Importer.Name");
  }

  async _prepareContext() {
    return {
      isGM: game.user.isGM,
      language: game.settings.get(MODULE_ID, "dataLanguage"),
      defaultPokemon: "*",
      referenceUrl: localizedReferenceUrl("/")
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[data-action='import']")?.addEventListener("click", event => this.#import(event));
  }

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
        itemCount += await upsertPackItems(await ensurePack("gear"), data.items.map(gearItemSource), status, 80, 88);
      }
      if (options.progression) {
        setStatus(status, "Creando la clase de Entrenador…", 90);
        const pack = await ensurePack("progression");
        const features = trainerFeatureSources();
        itemCount += await upsertPackItems(pack, features, status, 90, 95);
        const featureUuids = await progressionFeatureUuids(pack);
        itemCount += await upsertPackItems(pack, [trainerClassSource(featureUuids)], status, 96, 98);
      }
      if (options.reference) await upsertReferenceJournal();

      setStatus(status, "Compendios preparados.", 100);
      ui.notifications.info(`Pokémon 5e: ${itemCount} entradas disponibles en compendios.`);
    } catch (error) {
      console.error(`${MODULE_ID} | Compendium import failed`, error);
      setStatus(status, error.message, 0);
      ui.notifications.error(game.i18n.localize("POKE5E.Notifications.ImportFailed"));
    } finally {
      button.disabled = false;
    }
  }
}

async function ensurePack(key) {
  const config = PACKS[key];
  const collection = `world.${config.name}`;
  let pack = game.packs.get(collection);
  if (!pack) {
    pack = await CompendiumCollection.createCompendium({
      type: "Item",
      label: config.label,
      name: config.name,
      package: "world",
      system: game.system.id
    });
  }
  if (pack.locked) await pack.configure({ locked: false });
  return pack;
}

async function upsertPackItems(pack, sources, status, startProgress, endProgress) {
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
    await Item.implementation.updateDocuments(batch, { pack: pack.collection });
    completed += batch.length;
    progress();
  });
  await inBatches(creates, async batch => {
    await Item.implementation.createDocuments(batch, { pack: pack.collection });
    completed += batch.length;
    progress();
  });
  return sources.length;
}

async function progressionFeatureUuids(pack) {
  const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.sourceId`, `flags.${MODULE_ID}.kind`] });
  const entries = new Map();
  for (const entry of index.values()) {
    if (foundry.utils.getProperty(entry, `flags.${MODULE_ID}.kind`) !== "trainer-feature") continue;
    const sourceId = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`);
    if (sourceId) entries.set(sourceId, `Compendium.${pack.collection}.Item.${entry._id}`);
  }
  return entries;
}

function selectPokemon(allPokemon, selection) {
  const normalized = selection.trim().toLocaleLowerCase();
  if (normalized === "*") return allPokemon;
  const ids = new Set(normalized.split(/[\s,;]+/).filter(Boolean));
  if (!ids.size) throw new Error("Indica al menos un Pokémon o usa * para importar toda la Pokédex.");
  const selected = allPokemon.filter(pokemon => ids.has(pokemon.id.toLocaleLowerCase()));
  const found = new Set(selected.map(pokemon => pokemon.id.toLocaleLowerCase()));
  const missing = [...ids].filter(id => !found.has(id));
  if (missing.length) ui.notifications.warn(`No encontrados: ${missing.join(", ")}`);
  return selected;
}

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

function referenceJournalHtml() {
  const links = [
    ["Reglas básicas", "/reference/core-rules"], ["Clase de Entrenador", "/reference/trainer-class"],
    ["Caminos de Entrenador", "/reference/trainer-paths"], ["Especializaciones", "/reference/specializations"],
    ["Combate", "/reference/combat"], ["Tipos de daño", "/reference/damage-types"], ["Capturar Pokémon", "/reference/catching-pokemon"],
    ["Subir de nivel", "/reference/pokemon-leveling"], ["Estados", "/reference/status-conditions"]
  ];
  return `<h1>Pokémon 5e</h1><p>Referencia de reglas del proyecto Poke5e.</p><ul>${links.map(([label, path]) => `<li><a href="${localizedReferenceUrl(path)}" target="_blank" rel="noopener">${label}</a></li>`).join("")}</ul>`;
}

function localizedReferenceUrl(path) {
  const language = game.settings.get(MODULE_ID, "dataLanguage");
  return `https://poke5e.app${language === "en" ? "" : `/${language}`}${path}`;
}

async function inBatches(sources, operation, size = 100) {
  for (let index = 0; index < sources.length; index += size) await operation(sources.slice(index, index + size));
}

function setStatus(element, message, progress) {
  if (!element) return;
  element.querySelector("span").textContent = message;
  element.querySelector("progress").value = progress;
}
