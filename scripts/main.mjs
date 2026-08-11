import { Poke5eImporter } from "./importer.mjs";
import { Poke5ePokemonSheet } from "./pokemon-sheet.mjs";
import { Poke5eReference } from "./reference.mjs";
import { Poke5eTrainerTeam } from "./trainer-team.mjs";
import { Poke5eSpeciesBrowser } from "./species-browser.mjs";
import { MODULE_ID, getPokemonItems, normalizeDroppedSpecies } from "./model.mjs";
import { cleanDeploymentActor, recallPokemon, syncDeploymentHp, syncPokemonHpToDeployment } from "./deployment.mjs";

Hooks.once("init", () => {
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
  game.poke5e = {
    openImporter: () => new Poke5eImporter().render(true),
    openReference: () => new Poke5eReference().render(true),
    openTeam: actor => openTeam(actor ?? canvas?.tokens?.controlled?.[0]?.actor),
    openPokemon: document => openPokemon(document)
  };
});

Hooks.on("preCreateItem", item => {
  if (!normalizeDroppedSpecies(item)) return;
  const currentTeam = getPokemonItems(item.parent).filter(entry => entry.getFlag(MODULE_ID, "instance")?.inTeam);
  if (currentTeam.length >= 6) item.updateSource({ [`flags.${MODULE_ID}.instance.inTeam`]: false });
});

Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => addLegacyHeaderControl(sheet, buttons));
Hooks.on("getApplicationV1HeaderButtons", (application, buttons) => addLegacyHeaderControl(application, buttons));
Hooks.on("renderActorSheet", (application, element) => addTrainerTeamDock(application, element));
Hooks.on("renderApplicationV2", (application, element) => addTrainerTeamDock(application, element));
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

function addTrainerTeamDock(application, renderedElement) {
  if (application instanceof Poke5ePokemonSheet || application instanceof Poke5eTrainerTeam || application instanceof Poke5eSpeciesBrowser) return;
  const actor = application.document ?? application.object;
  if (actor?.documentName !== "Actor" || actor.type !== "character") return;
  const root = renderedElement instanceof HTMLElement ? renderedElement : renderedElement?.[0] ?? application.element;
  if (!root) return;
  const content = root.matches?.(".window-content") ? root : root.querySelector?.(".window-content") ?? root;
  if (content.querySelector?.(".poke5e-team-dock")) return;

  const team = getPokemonItems(actor).filter(item => item.getFlag(MODULE_ID, "instance")?.inTeam).slice(0, 6);
  const slots = Array.from({ length: 6 }, (_, index) => team[index] ? pokemonSlot(team[index]) : emptyPokemonSlot(index));
  const dock = document.createElement("section");
  dock.className = "poke5e poke5e-team-dock";
  dock.setAttribute("aria-label", "Equipo Pokémon");
  dock.innerHTML = `
    <button type="button" class="poke5e-team-dock-heading" data-action="poke5e-open-team" title="Abrir el equipo Pokémon completo">
      <i class="fa-solid fa-circle-dot"></i>
      <span><strong>Equipo Pokémon</strong><small>${team.length}/6 activos</small></span>
    </button>
    <div class="poke5e-team-dock-slots">${slots.join("")}</div>
    <button type="button" class="poke5e-team-dock-manage" data-action="poke5e-open-team">
      <i class="fa-solid fa-paw"></i><span>Gestionar</span>
    </button>`;
  dock.querySelectorAll("[data-action='poke5e-open-team']").forEach(button => button.addEventListener("click", () => openTeam(actor)));
  dock.querySelectorAll("[data-pokemon-id]").forEach(button => button.addEventListener("click", () => openPokemon(actor.items.get(button.dataset.pokemonId))));
  dock.querySelectorAll("[data-action='poke5e-add-pokemon']").forEach(button => button.addEventListener("click", () => new Poke5eSpeciesBrowser({ actor }).render(true)));

  const header = content.querySelector?.(".sheet-header, header.character-header, header.sheet-header");
  if (header) header.insertAdjacentElement("afterend", dock);
  else content.prepend(dock);
}

function pokemonSlot(item) {
  const instance = item.getFlag(MODULE_ID, "instance") ?? {};
  const name = foundry.utils.escapeHTML(instance.nickname?.trim() || item.name);
  const species = foundry.utils.escapeHTML(item.name);
  const img = foundry.utils.escapeHTML(item.img ?? "icons/svg/mystery-man.svg");
  const hp = instance.hp ? ` · PG ${Number(instance.hp.value) || 0}/${Number(instance.hp.max) || 0}` : "";
  return `<button type="button" class="poke5e-team-dock-slot occupied" data-pokemon-id="${item.id}" title="Abrir ${name} (${species})${hp}"><img src="${img}" alt=""><span>${name}</span></button>`;
}

function emptyPokemonSlot(index) {
  return `<button type="button" class="poke5e-team-dock-slot empty" data-action="poke5e-add-pokemon" title="Añadir Pokémon al hueco ${index + 1}"><i class="fa-solid fa-plus"></i><span>Vacío</span></button>`;
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

function teamLabel(actor) {
  const count = getPokemonItems(actor).filter(item => item.getFlag(MODULE_ID, "instance")?.inTeam).length;
  return `Equipo Pokémon (${count}/6)`;
}

console.info(`${MODULE_ID} | Pokémon 5e module loaded`);
