import { Poke5eImporter } from "./importer.mjs";
import { Poke5ePokemonSheet } from "./pokemon-sheet.mjs";
import { Poke5eReference } from "./reference.mjs";
import { Poke5eTrainerTeam } from "./trainer-team.mjs";
import { MODULE_ID, displayAssetUrl, getPokemonItems, normalizeDroppedSpecies, randomGenderForRatio } from "./model.mjs";
import { cleanDeploymentActor, recallPokemon, syncDeploymentHp, syncPokemonHpToDeployment } from "./deployment.mjs";
import { registerTrainerActorSheet } from "./trainer-actor-sheet.mjs";
import { damageTraitsForPokemonTypes, registerPokemonDamageTypes } from "./combat.mjs";
import { Poke5eEncounterBuilder } from "./encounter-builder.mjs";
import { attemptCapture, registerCaptureSocket } from "./capture.mjs";

Hooks.once("init", () => {
  registerPokemonDamageTypes();
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
  game.settings.registerMenu(MODULE_ID, "encounterBuilder", {
    name: "Generador de encuentros salvajes",
    label: "Abrir generador de encuentros",
    hint: "Prepara y despliega Pokémon salvajes en la escena activa.",
    icon: "fa-solid fa-mountain-sun",
    type: Poke5eEncounterBuilder,
    restricted: true
  });
});

Hooks.once("ready", () => {
  applyDarkMode(game.settings.get(MODULE_ID, "darkMode"));
  registerCaptureSocket();
  game.poke5e = {
    openImporter: () => new Poke5eImporter().render(true),
    openReference: () => new Poke5eReference().render(true),
    openEncounterBuilder: () => game.user.isGM ? new Poke5eEncounterBuilder().render(true) : ui.notifications.warn("Solo el director de juego puede abrir esta herramienta."),
    captureTarget: actor => attemptCapture(actor ?? canvas?.tokens?.controlled?.[0]?.actor),
    openTeam: actor => openTeam(actor ?? canvas?.tokens?.controlled?.[0]?.actor),
    openPokemon: document => openPokemon(document)
  };
  if (game.user.isGM) {
    migrateEmbeddedAssetUrls().catch(error => console.error(`${MODULE_ID} | Asset migration failed`, error));
    migratePokemonCombatData().catch(error => console.error(`${MODULE_ID} | Combat data migration failed`, error));
  }
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
Hooks.on("getSceneControlButtons", controls => addEncounterSceneControl(controls));
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
  if (["deployed", "wild"].includes(actor.getFlag(MODULE_ID, "kind")) && !controls.some(control => control.action === "poke5e-open-pokemon")) {
    controls.unshift({
      label: "Pokédex", icon: "fa-solid fa-address-card", action: "poke5e-open-pokemon", visible: true,
      onClick: () => openPokemon(actor)
    });
  }
});

Hooks.on("updateActor", (actor, changes) => {
  if (!["deployed", "wild"].includes(actor.getFlag(MODULE_ID, "kind"))) return;
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
  if (["deployed", "wild"].includes(actor.getFlag(MODULE_ID, "kind")) && !buttons.some(button => button.class === "poke5e-open-pokemon")) {
    buttons.unshift({ label: "Pokédex", class: "poke5e-open-pokemon", icon: "fa-solid fa-address-card", onclick: () => openPokemon(actor) });
  }
}

function openTeam(actor) {
  if (!actor || actor.type !== "character") return ui.notifications.warn("Selecciona un actor de entrenador.");
  return new Poke5eTrainerTeam({ actor }).render(true);
}

async function openPokemon(document) {
  let item = document;
  if (document?.documentName === "Actor" && ["deployed", "wild"].includes(document.getFlag(MODULE_ID, "kind"))) {
    const uuid = document.getFlag(MODULE_ID, "pokemonItemUuid");
    item = uuid ? await fromUuid(uuid) : document.items.find(entry => entry.getFlag(MODULE_ID, "kind") === "pokemon");
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

async function migratePokemonCombatData() {
  for (const actor of game.actors) {
    const updates = [];
    for (const item of getPokemonItems(actor)) {
      const instance = foundry.utils.deepClone(item.getFlag(MODULE_ID, "instance") ?? {});
      if (["female", "male", "none", "other"].includes(instance.gender)) continue;
      const species = item.getFlag(MODULE_ID, "species") ?? {};
      instance.gender = randomGenderForRatio(species.gender);
      updates.push({ _id: item.id, [`flags.${MODULE_ID}.instance`]: instance });
    }
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);

    if (actor.getFlag(MODULE_ID, "kind") !== "deployed") continue;
    const pokemonItem = await fromUuid(actor.getFlag(MODULE_ID, "pokemonItemUuid"));
    const species = pokemonItem?.getFlag(MODULE_ID, "species");
    if (!species) continue;
    const traits = damageTraitsForPokemonTypes(species.type);
    await actor.update({
      "system.traits.dr": traits.dr,
      "system.traits.dv": traits.dv,
      "system.traits.di": traits.di
    });
  }
}

function addEncounterSceneControl(controls) {
  if (!game.user.isGM) return;
  const open = () => new Poke5eEncounterBuilder().render(true);
  const tool = {
    name: "poke5e-encounter-builder",
    title: "Generador de encuentros salvajes",
    icon: "fa-solid fa-mountain-sun",
    button: true,
    visible: true,
    onChange: (event, active) => { if (active !== false) open(); }
  };
  if (Array.isArray(controls)) {
    const tokenControls = controls.find(control => control.name === "token" || control.name === "tokens");
    if (tokenControls && !tokenControls.tools.some(entry => entry.name === tool.name)) tokenControls.tools.push(tool);
    return;
  }
  const tokenControls = controls.tokens ?? controls.token;
  if (!tokenControls?.tools) return;
  if (Array.isArray(tokenControls.tools)) {
    if (!tokenControls.tools.some(entry => entry.name === tool.name)) tokenControls.tools.push(tool);
  } else if (!tokenControls.tools[tool.name]) {
    tokenControls.tools[tool.name] = tool;
  }
}

function teamLabel(actor) {
  const count = getPokemonItems(actor).filter(item => item.getFlag(MODULE_ID, "instance")?.inTeam).length;
  return `Equipo Pokémon (${count}/6)`;
}

console.info(`${MODULE_ID} | Pokémon 5e module loaded`);
