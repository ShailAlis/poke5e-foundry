/**
 * Punto de entrada del módulo declarado en `module.json`. No contiene reglas:
 * registra ajustes, fichas, efectos y controles, engancha los hooks de Foundry
 * que conectan cada subsistema.
 *
 * Es la cúspide del grafo de dependencias: importa de casi todos los archivos y
 * ninguno lo importa a él.
 */
import { Poke5eImporter } from "./importer.mjs";
import { Poke5ePokemonSheet } from "./pokemon-sheet.mjs";
import { Poke5eReference } from "./reference.mjs";
import { Poke5eTrainerTeam } from "./trainer-team.mjs";
import { MODULE_ID, displayAssetUrl, getPokemonItems, normalizeDroppedSpecies, randomGenderForRatio, trainerPokeslotLimit } from "./model.mjs";
import { cleanDeploymentActor, recallPokemon, registerPokemonTokenMovement, syncDeploymentHp, syncPokemonHpToDeployment } from "./deployment.mjs";
import { registerTrainerActorSheet } from "./trainer-actor-sheet.mjs";
import { migratePokemonActorSheets, registerPokemonActorSheet } from "./pokemon-actor-sheet.mjs";
import { damageTraitsForPokemonTypes, registerPokemonDamageTypes } from "./combat.mjs";
import { Poke5eEncounterBuilder } from "./encounter-builder.mjs";
import { attemptCapture, registerCaptureSocket } from "./capture.mjs";
import { Poke5eTrainerCreator, enforceHumanActorSource, isHumanSpecies } from "./trainer-creator.mjs";
import { Poke5eNpcTrainerGenerator } from "./npc-trainer-generator.mjs";
import { registerPokemonStatusEffects, registerPokemonStatusSocket } from "./status-effects.mjs";

/**
 * Arranque temprano: delega el registro de tipos de daño (combat.mjs), fichas
 * (trainer-actor-sheet.mjs, pokemon-actor-sheet.mjs), movimiento de tokens
 * (deployment.mjs) y estados alterados (status-effects.mjs); después declara los
 * ajustes del mundo y los menús que abren importer, referencia y los dos
 * generadores exclusivos del director.
 */
Hooks.once("init", () => {
  registerPokemonDamageTypes();
  registerTrainerActorSheet();
  registerPokemonActorSheet();
  registerPokemonTokenMovement();
  registerPokemonStatusEffects();
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
  game.settings.registerMenu(MODULE_ID, "npcTrainerGenerator", {
    name: "Generador de Entrenadores NPC",
    label: "Abrir generador de Entrenadores",
    hint: "Crea Entrenadores NPC completos con equipos Pokémon configurables.",
    icon: "fa-solid fa-users-gear",
    type: Poke5eNpcTrainerGenerator,
    restricted: true
  });
});

/**
 * Mundo ya cargado: aplica el modo oscuro, abre los sockets de captura y estados
 * (capture.mjs y status-effects.mjs), publica la API de macros `game.poke5e` y,
 * solo para el director, lanza las tres migraciones de datos antiguos.
 */
Hooks.once("ready", () => {
  applyDarkMode(game.settings.get(MODULE_ID, "darkMode"));
  registerCaptureSocket();
  registerPokemonStatusSocket();
  game.poke5e = {
    openImporter: () => new Poke5eImporter().render(true),
    openReference: () => new Poke5eReference().render(true),
    openEncounterBuilder: () => game.user.isGM ? new Poke5eEncounterBuilder().render(true) : ui.notifications.warn("Solo el director de juego puede abrir esta herramienta."),
    openNpcTrainerGenerator: () => game.user.isGM ? new Poke5eNpcTrainerGenerator().render(true) : ui.notifications.warn("Solo el director de juego puede abrir esta herramienta."),
    captureTarget: actor => attemptCapture(actor ?? canvas?.tokens?.controlled?.[0]?.actor),
    createTrainer: actor => openTrainerCreator(actor ?? canvas?.tokens?.controlled?.[0]?.actor),
    openTeam: actor => openTeam(actor ?? canvas?.tokens?.controlled?.[0]?.actor),
    openPokemon: document => openPokemon(document)
  };
  if (game.user.isGM) {
    migratePokemonActorSheets().catch(error => console.error(`${MODULE_ID} | Pokémon sheet migration failed`, error));
    migrateEmbeddedAssetUrls().catch(error => console.error(`${MODULE_ID} | Asset migration failed`, error));
    migratePokemonCombatData().catch(error => console.error(`${MODULE_ID} | Combat data migration failed`, error));
  }
});

/**
 * Activa o desactiva la clase CSS del modo oscuro en el documento. La llaman el
 * `onChange` del ajuste `darkMode` y el arranque del hook `ready`.
 */
function applyDarkMode(enabled) {
  document.body.classList.toggle("poke5e-dark-mode", Boolean(enabled));
}

/**
 * Filtra los Items que se crean sobre un actor: rechaza especies de jugador que
 * no sean Humano (isHumanSpecies() de trainer-creator.mjs) y convierte las
 * especies Pokémon arrastradas con normalizeDroppedSpecies() (model.mjs),
 * mandándolas a la reserva si el equipo activo ya está lleno.
 */
Hooks.on("preCreateItem", item => {
  if (item.parent?.documentName === "Actor" && item.parent.type === "character" && item.type === "race" && !isHumanSpecies(item)) {
    ui.notifications.warn("En Pokémon 5e los personajes jugadores solo pueden ser humanos.");
    return false;
  }
  if (!normalizeDroppedSpecies(item)) return;
  const currentTeam = getPokemonItems(item.parent).filter(entry => entry.getFlag(MODULE_ID, "instance")?.inTeam);
  if (currentTeam.length >= trainerPokeslotLimit(item.parent)) item.updateSource({ [`flags.${MODULE_ID}.instance.inTeam`]: false });
});

/** Fuerza la especie Humano en los personajes nuevos (trainer-creator.mjs). */
Hooks.on("preCreateActor", actor => enforceHumanActorSource(actor));
/** Abre el asistente de creación de Entrenador tras crear un personaje sin completar. */
Hooks.on("createActor", (actor, options, userId) => {
  if (userId !== game.user.id || actor.type !== "character" || actor.getFlag(MODULE_ID, "trainerCreation")?.completed) return;
  setTimeout(() => new Poke5eTrainerCreator({ actor }).render(true), 250);
});

/** Botones de cabecera en las fichas antiguas (ApplicationV1), vía addLegacyHeaderControl(). */
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => addLegacyHeaderControl(sheet, buttons));
Hooks.on("getApplicationV1HeaderButtons", (application, buttons) => addLegacyHeaderControl(application, buttons));
/** Añade a la barra de herramientas de tokens los accesos del director. */
Hooks.on("getSceneControlButtons", controls => {
  addEncounterSceneControl(controls);
  addNpcTrainerSceneControl(controls);
});
/**
 * Equivalente de addLegacyHeaderControl() para las fichas ApplicationV2: inserta
 * los botones de equipo Pokémon, de completar Entrenador y de Pokédex, evitando
 * duplicarlos y excluyendo las ventanas propias del módulo.
 */
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
  if (needsTrainerCreation(actor) && !controls.some(control => control.action === "poke5e-create-trainer")) {
    controls.unshift({
      label: "Completar Entrenador", icon: "fa-solid fa-user-plus", action: "poke5e-create-trainer", visible: true,
      onClick: () => new Poke5eTrainerCreator({ actor }).render(true)
    });
  }
  if (["deployed", "wild"].includes(actor.getFlag(MODULE_ID, "kind")) && !controls.some(control => control.action === "poke5e-open-pokemon")) {
    controls.unshift({
      label: "Pokédex", icon: "fa-solid fa-address-card", action: "poke5e-open-pokemon", visible: true,
      onClick: () => openPokemon(actor)
    });
  }
});

/**
 * Propaga a la ficha del entrenador los PG que cambian en un actor desplegado o
 * salvaje, mediante syncDeploymentHp() (deployment.mjs). El sentido inverso lo
 * cubre el hook `updateItem`.
 */
Hooks.on("updateActor", (actor, changes) => {
  if (!["deployed", "wild"].includes(actor.getFlag(MODULE_ID, "kind"))) return;
  if (foundry.utils.hasProperty(changes, "system.attributes.hp") || foundry.utils.hasProperty(changes, "system.attributes.hp.value") || foundry.utils.hasProperty(changes, "system.attributes.hp.max")) {
    syncDeploymentHp(actor).catch(error => console.error(`${MODULE_ID} | HP sync failed`, error));
  }
});

/**
 * Contrapartida del hook `updateActor`: lleva los PG editados en la ficha del
 * Pokémon a su actor desplegado con syncPokemonHpToDeployment() (deployment.mjs).
 */
Hooks.on("updateItem", (item, changes) => {
  if (item.getFlag(MODULE_ID, "kind") !== "pokemon") return;
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.instance.hp`) || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.instance`)) {
    syncPokemonHpToDeployment(item).catch(error => console.error(`${MODULE_ID} | Pokémon HP sync failed`, error));
  }
});

/** Retira del mapa el token de un Pokémon cuyo Item se ha borrado (deployment.mjs). */
Hooks.on("deleteItem", item => {
  if (item.getFlag(MODULE_ID, "kind") === "pokemon") recallPokemon(item).catch(error => console.error(`${MODULE_ID} | Recall after item deletion failed`, error));
});

/**
 * Elimina el actor temporal que queda huérfano al borrar su último token
 * (cleanDeploymentActor() de deployment.mjs), aplazado un tick para que Foundry
 * termine de actualizar la escena.
 */
Hooks.on("deleteToken", token => {
  setTimeout(() => cleanDeploymentActor(token).catch(error => console.error(`${MODULE_ID} | Deployment cleanup failed`, error)), 0);
});

/**
 * Inserta los botones de cabecera del módulo en las aplicaciones ApplicationV1
 * (equipo Pokémon, completar Entrenador y Pokédex). Comparte criterios con el
 * hook `getHeaderControlsApplicationV2` y se apoya en needsTrainerCreation(),
 * teamLabel() y openPokemon().
 */
function addLegacyHeaderControl(application, buttons) {
  const actor = application.actor ?? application.document;
  if (actor?.documentName !== "Actor") return;
  if (needsTrainerCreation(actor) && !buttons.some(button => button.class === "poke5e-create-trainer")) {
    buttons.unshift({ label: "Completar Entrenador", class: "poke5e-create-trainer", icon: "fa-solid fa-user-plus", onclick: () => new Poke5eTrainerCreator({ actor }).render(true) });
  }
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

/**
 * Abre el gestor de equipo (trainer-team.mjs) validando que el actor sea un
 * personaje. Respaldo de la macro `game.poke5e.openTeam`.
 */
function openTeam(actor) {
  if (!actor || actor.type !== "character") return ui.notifications.warn("Selecciona un actor de entrenador.");
  return new Poke5eTrainerTeam({ actor }).render(true);
}

/**
 * Abre el asistente de creación de Entrenador (trainer-creator.mjs) comprobando
 * tipo de actor y permisos. Respaldo de la macro `game.poke5e.createTrainer`.
 */
function openTrainerCreator(actor) {
  if (!actor || actor.type !== "character") return ui.notifications.warn("Selecciona un personaje Entrenador.");
  if (!actor.isOwner) return ui.notifications.warn("No tienes permiso para configurar este personaje.");
  return new Poke5eTrainerCreator({ actor }).render(true);
}

/**
 * Indica si un personaje aún no ha pasado por el asistente, según el flag
 * `trainerCreation.completed` que escribe trainer-creator.mjs. La consultan
 * ambos registradores de botones de cabecera.
 */
function needsTrainerCreation(actor) {
  return actor?.documentName === "Actor" && actor.type === "character" && !actor.getFlag(MODULE_ID, "trainerCreation")?.completed;
}

/**
 * Abre la ficha Pokédex de un Pokémon aceptando tanto su Item como el actor
 * desplegado o salvaje, en cuyo caso resuelve el Item original por su UUID.
 * La usan los botones de cabecera y la macro `game.poke5e.openPokemon`.
 */
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

/**
 * Migración: reescribe con displayAssetUrl() (model.mjs) las imágenes de Items
 * que aún apuntan a rutas locales del módulo. Se ejecuta una vez por sesión de
 * director desde el hook `ready`.
 */
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

/**
 * Migración a la versión 1.0: asigna sexo con randomGenderForRatio() a los
 * Pokémon guardados que no lo tengan y actualiza resistencias, vulnerabilidades
 * e inmunidades de los actores desplegados con damageTraitsForPokemonTypes()
 * (combat.mjs). Se ejecuta una vez por sesión de director desde el hook `ready`.
 */
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

/**
 * Añade el botón del generador de encuentros (encounter-builder.mjs) a los
 * controles de token del director, admitiendo tanto la forma de array como la de
 * objeto que han tenido los controles en distintas versiones de Foundry.
 * Gemela de addNpcTrainerSceneControl().
 */
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

/**
 * Añade el botón del generador de Entrenadores NPC (npc-trainer-generator.mjs) a
 * los controles de token del director, con la misma lógica de compatibilidad que
 * addEncounterSceneControl().
 */
function addNpcTrainerSceneControl(controls) {
  if (!game.user.isGM) return;
  const open = () => new Poke5eNpcTrainerGenerator().render(true);
  const tool = {
    name: "poke5e-npc-trainer-generator",
    title: "Generador de Entrenadores NPC",
    icon: "fa-solid fa-users-gear",
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
  } else if (!tokenControls.tools[tool.name]) tokenControls.tools[tool.name] = tool;
}

/**
 * Rótulo del botón de equipo con la ocupación actual ("Equipo Pokémon (3/6)"),
 * a partir de getPokemonItems() y trainerPokeslotLimit() (model.mjs).
 */
function teamLabel(actor) {
  const count = getPokemonItems(actor).filter(item => item.getFlag(MODULE_ID, "instance")?.inTeam).length;
  return `Equipo Pokémon (${count}/${trainerPokeslotLimit(actor)})`;
}

console.info(`${MODULE_ID} | Pokémon 5e module loaded`);
