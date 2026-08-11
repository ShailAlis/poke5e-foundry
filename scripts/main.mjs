import { Poke5eImporter } from "./importer.mjs";
import { Poke5ePokemonSheet } from "./pokemon-sheet.mjs";
import { Poke5eReference } from "./reference.mjs";
import { Poke5eTrainerTeam } from "./trainer-team.mjs";
import { MODULE_ID, displayAssetUrl, getPokemonItems, normalizeDroppedSpecies } from "./model.mjs";
import { cleanDeploymentActor, recallPokemon, syncDeploymentHp, syncPokemonHpToDeployment } from "./deployment.mjs";
import { registerTrainerActorSheet } from "./trainer-actor-sheet.mjs";

Hooks.once("init", () => {
  registerTrainerActorSheet();
  game.settings.register(MODULE_ID, "darkMode", {
    name: "POKE5E.Settings.DarkMode.Name",
    hint: "POKE5E.Settings.DarkMode.Hint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: applyDarkMode
  });
  game.settings.register(MODULE_ID, "dataLanguage", {
    name: "POKE5E.Settings.Language.Name",
    hint: "POKE5E.Settings.Language.Hint",
    scope: "world", config: true, type: String,
    choices: { es: "Español", en: "English" },
    default: game.i18n.lang === "es" ? "es" : "en"
  });
  game.settings.register(MODULE_ID, "assetBaseUrl", {
    name: "POKE5E.Settings.Assets.Name",
    hint: "POKE5E.Settings.Assets.Hint",
    scope: "world", config: true, type: String,
    default: "https://poke5e.app"
  });
  game.settings.registerMenu(MODULE_ID, "importer", {
    name: "POKE5E.Menu.Importer.Name", label: "POKE5E.Menu.Importer.Label", hint: "POKE5E.Menu.Importer.Hint",
    icon: "fa-solid fa-box-archive", type: Poke5eImporter, restricted: true
  });
  game.settings.registerMenu(MODULE_ID, "reference", {
    name: "POKE5E.Menu.Reference.Name", label: "POKE5E.Menu.Reference.Label", hint: "POKE5E.Menu.Reference.Hint",
    icon: "fa-solid fa-book-open", type: Poke5eReference, restricted: false
  });
});

Hooks.once("ready", () => {
  applyDarkMode(game.settings.get(MODULE_ID, "darkMode"));
  game.poke5e = {
    openImporter: () => new Poke5eImporter().render(true),
    openReference: () => new Poke5eReference().render(true),
    openTeam: actor => openTeam(actor ?? canvas?.tokens?.controlled?.[0]?.actor),
    openPokemon: document => openPokemon(document)
  };
  if (game.user.isGM) migrateEmbeddedAssetUrls().catch(error => console.error(`${MODULE_ID} | Asset migration failed`, error));
});

function applyDarkMode(enabled) {
  document.body.classList.toggle("poke5e-dark-mode", Boolean(enabled));
}

Hooks.on("preCreateItem", item => {
  if (!normalizeDroppedSpecies(item)) return;
  const currentTeam = getPokemonItems(item.parent).filter(entry => entry.getFlag(MODULE_ID, "instance")?.inTeam);
  if (currentTeam.length >= 6) item.updateSource({ [`flags.${MODULE_ID}.instance.inTeam`]: false });
});

Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => addLegacyHeaderControl(sheet, buttons));
Hooks.on("getApplicationV1HeaderButtons", (application, buttons) => addLegacyHeaderControl(application, buttons));
Hooks.on("getHeaderControlsApplicationV2", (application, controls) => {
  if (application instanceof Poke5ePokemonSheet || application instanceof Poke5eTrainerTeam) return;
  const actor = application.actor ?? application.document;
  if (actor?.documentName !== "Actor") return;
  if (actor.type === "character" && !controls.some(control => control.action === "poke5e-open-team")) {
    controls.unshift({
      label: teamLabel(actor), icon: "fa-solid fa-circle-dot", action: "poke5e-open-team", visible: true,
      onClick: () => new Poke5eTrainerTeam({ actor }).render(true)
    });
  }
  if (actor.getFlag(MODULE_ID, "kind") === "deployed" && !controls.some(control => control.action === "poke5e-open-pokemon")) {
    controls.unshift({
      label: "Pokédex", icon: "fa-solid fa-address-card", action: "poke5e-open-pokemon", visible: true,
      onClick: () => openPokemon(actor)
    });
  }
});

Hooks.on("updateActor", (actor, changes) => {
  if (actor.getFlag(MODULE_ID, "kind") !== "deployed") return;
  if (foundry.utils.hasProperty(changes, "system.attributes.hp") || foundry.utils.hasProperty(changes, "system.attributes.hp.value") || foundry.utils.hasProperty(changes, "system.attributes.hp.max")) {
    syncDeploymentHp(actor).catch(error => console.error(`${MODULE_ID} | HP sync failed`, error));
  }
});

Hooks.on("updateItem", (item, changes) => {
  if (item.getFlag(MODULE_ID, "kind") !== "pokemon") return;
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.instance.hp`) || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.instance`)) {
    syncPokemonHpToDeployment(item).catch(error => console.error(`${MODULE_ID} | Pokémon HP sync failed`, error));
  }
});

Hooks.on("deleteItem", item => {
  if (item.getFlag(MODULE_ID, "kind") === "pokemon") recallPokemon(item).catch(error => console.error(`${MODULE_ID} | Recall after item deletion failed`, error));
});

Hooks.on("deleteToken", token => {
  setTimeout(() => cleanDeploymentActor(token).catch(error => console.error(`${MODULE_ID} | Deployment cleanup failed`, error)), 0);
});

function addLegacyHeaderControl(application, buttons) {
  const actor = application.actor ?? application.document;
  if (actor?.documentName !== "Actor") return;
  if (actor.type === "character" && !buttons.some(button => button.class === "poke5e-open-team")) {
    buttons.unshift({
      label: teamLabel(actor), class: "poke5e-open-team", icon: "fa-solid fa-circle-dot",
      onclick: () => new Poke5eTrainerTeam({ actor }).render(true)
    });
  }
  if (actor.getFlag(MODULE_ID, "kind") === "deployed" && !buttons.some(button => button.class === "poke5e-open-pokemon")) {
    buttons.unshift({ label: "Pokédex", class: "poke5e-open-pokemon", icon: "fa-solid fa-address-card", onclick: () => openPokemon(actor) });
  }
}

function openTeam(actor) {
  if (!actor || actor.type !== "character") return ui.notifications.warn("Selecciona un actor de entrenador.");
  return new Poke5eTrainerTeam({ actor }).render(true);
}

async function openPokemon(document) {
  let item = document;
  if (document?.documentName === "Actor" && document.getFlag(MODULE_ID, "kind") === "deployed") {
    item = await fromUuid(document.getFlag(MODULE_ID, "pokemonItemUuid"));
  }
  if (item?.documentName !== "Item" || item.getFlag(MODULE_ID, "kind") !== "pokemon") {
    return ui.notifications.warn(game.i18n.localize("POKE5E.Notifications.NoActor"));
  }
  return new Poke5ePokemonSheet({ pokemonItem: item }).render(true);
}

async function migrateEmbeddedAssetUrls() {
  for (const actor of game.actors) {
    const updates = actor.items.reduce((entries, item) => {
      const img = displayAssetUrl(item.img);
      if (img && img !== item.img) entries.push({ _id: item.id, img });
      return entries;
    }, []);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}

function teamLabel(actor) {
  const count = getPokemonItems(actor).filter(item => item.getFlag(MODULE_ID, "instance")?.inTeam).length;
  return `Equipo Pokémon (${count}/6)`;
}

console.info(`${MODULE_ID} | Pokémon 5e module loaded`);
