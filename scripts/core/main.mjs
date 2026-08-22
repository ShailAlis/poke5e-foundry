/**
 * Punto de entrada del módulo declarado en `module.json`. No contiene reglas:
 * registra ajustes, fichas, efectos y controles, engancha los hooks de Foundry
 * que conectan cada subsistema.
 *
 * Es la cúspide del grafo de dependencias: importa de casi todos los archivos y
 * ninguno lo importa a él.
 */
import { Poke5eImporter } from "./importer.mjs";
import { Poke5ePokemonSheet } from "../pokemon/pokemon-sheet.mjs";
import { Poke5eReference } from "../ui/reference.mjs";
import { Poke5eTrainerTeam } from "../trainer/trainer-team.mjs";
import { MODULE_ID, displayAssetUrl, getPokemonItems, normalizeDroppedSpecies, randomGenderForRatio, trainerPokeslotLimit } from "./model.mjs";
import { cleanDeploymentActor, ensureDeploymentPermissions, recallPokemon, registerPokemonTokenMovement, syncDeploymentHp, syncPokemonHeldItemToDeployment, syncPokemonHpToDeployment } from "../world/deployment.mjs";
import { migrateTrainerClassAdvancements, migrateTrainerFeatureGroups, registerTrainerActorSheet } from "../trainer/trainer-actor-sheet.mjs";
import { migratePokemonActorSheets, registerPokemonActorSheet } from "../pokemon/pokemon-actor-sheet.mjs";
import { damageTraitsForPokemonTypes, registerPokemonDamageTypes } from "../combat/combat.mjs";
import { Poke5eEncounterBuilder } from "../world/encounter-builder.mjs";
import { attemptCapture, registerCaptureSocket } from "../pokemon/capture.mjs";
import { Poke5eTrainerCreator, enforceHumanActorSource, isHumanSpecies } from "../trainer/trainer-creator.mjs";
import { Poke5eNpcTrainerGenerator } from "../trainer/npc-trainer-generator.mjs";
import { migratedNpcSpritePath } from "../trainer/npc-trainer-rules.mjs";
import { registerPokemonStatusEffects, registerPokemonStatusSocket } from "../combat/status-effects.mjs";
import { registerOngoingMoveEffects } from "../combat/ongoing-effects.mjs";
import { loadPokemonEffectIcons } from "./effect-icons.mjs";
import { registerMoveModifierEffects } from "../combat/move-modifiers.mjs";
import { registerHpEffects } from "../combat/hp-effects.mjs";
import { registerBideTracking } from "../combat/bide.mjs";
import { registerItemSwap } from "../combat/item-swap.mjs";
import { registerForcedSwitch } from "../combat/forced-switch.mjs";
import { registerDamageShields } from "../combat/damage-shields.mjs";
import { registerFieldEffects } from "../combat/terrain-effects.mjs";
import { registerCombatHistory } from "../combat/combat-history.mjs";
import { restoreHeldItemChargesAfterRest } from "../pokemon/held-items.mjs";
import { resetAbilityRestResourcesAfterRest } from "../pokemon/pokemon-abilities.mjs";
import { clearPoke5eDataCache, loadPoke5eData } from "./data-service.mjs";
import { configurePokedollarEconomy } from "../world/economy.mjs";
import { synchronizePrimaryParty } from "../trainer/primary-party.mjs";
import { migrateMoveMachineIcons } from "../pokemon/move-machines.mjs";
import { registerTrainerExperienceAutomation } from "../trainer/trainer-progression.mjs";

/**
 * Arranque temprano: delega el registro de tipos de daño (combat.mjs), fichas
 * (trainer-actor-sheet.mjs, pokemon-actor-sheet.mjs) y movimiento de tokens
 * (deployment.mjs); después declara los
 * ajustes del mundo y los menús que abren importer, referencia y los dos
 * generadores exclusivos del director.
 */
Hooks.once("init", () => {
  configurePokedollarEconomy();
  registerPokemonDamageTypes();
  registerTrainerActorSheet();
  registerPokemonActorSheet();
  registerPokemonTokenMovement();
  registerTrainerExperienceAutomation();
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
    choices: { es: "POKE5E.Language.Spanish", en: "POKE5E.Language.English" },
    default: game.i18n.lang === "es" ? "es" : "en",
    onChange: changeDataLanguage
  });
  game.settings.register(MODULE_ID, "assetBaseUrl", {
    name: "POKE5E.Settings.Assets.Name",
    hint: "POKE5E.Settings.Assets.Hint",
    scope: "world", config: true, type: String,
    default: "https://poke5e.app"
  });
  // No aparece en el formulario de ajustes: solo marca si ensureDeploymentPermissions()
  // ya concedió los permisos de despliegue una vez en este mundo.
  game.settings.register(MODULE_ID, "grantedDeploymentPermissions", {
    scope: "world", config: false, type: Boolean, default: false
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
    name: "POKE5E.Menu.Encounter.Name",
    label: "POKE5E.Menu.Encounter.Label",
    hint: "POKE5E.Menu.Encounter.Hint",
    icon: "fa-solid fa-mountain-sun",
    type: Poke5eEncounterBuilder,
    restricted: true
  });
  game.settings.registerMenu(MODULE_ID, "npcTrainerGenerator", {
    name: "POKE5E.Menu.NpcTrainer.Name",
    label: "POKE5E.Menu.NpcTrainer.Label",
    hint: "POKE5E.Menu.NpcTrainer.Hint",
    icon: "fa-solid fa-users-gear",
    type: Poke5eNpcTrainerGenerator,
    restricted: true
  });
});

/**
 * D&D 5e reconstruye CONFIG.statusEffects durante i18nInit. Registramos los
 * estados Pokémon después del sistema para que no sean sustituidos por sus
 * condiciones (por ejemplo, Bloodied).
 */
Hooks.once("i18nInit", () => {
  configurePokedollarEconomy();
  registerPokemonStatusEffects();
});

/**
 * Mundo ya cargado: aplica el modo oscuro, abre los sockets de captura y estados
 * (capture.mjs y status-effects.mjs), publica la API de macros `game.poke5e` y,
 * solo para el director, lanza las tres migraciones de datos antiguos.
 */
Hooks.once("ready", async () => {
  await loadPokemonEffectIcons();
  registerPokemonStatusEffects();
  applyDarkMode(game.settings.get(MODULE_ID, "darkMode"));
  registerCaptureSocket();
  registerPokemonStatusSocket();
  registerOngoingMoveEffects();
  registerMoveModifierEffects();
  registerHpEffects();
  registerBideTracking();
  registerItemSwap();
  registerForcedSwitch();
  registerDamageShields();
  registerFieldEffects();
  registerCombatHistory();
  game.poke5e = {
    openImporter: () => new Poke5eImporter().render(true),
    openReference: () => new Poke5eReference().render(true),
    openEncounterBuilder: () => game.user.isGM ? new Poke5eEncounterBuilder().render(true) : ui.notifications.warn(game.i18n.localize("POKE5E.Notifications.GMOnly")),
    openNpcTrainerGenerator: () => game.user.isGM ? new Poke5eNpcTrainerGenerator().render(true) : ui.notifications.warn(game.i18n.localize("POKE5E.Notifications.GMOnly")),
    captureTarget: actor => attemptCapture(actor ?? canvas?.tokens?.controlled?.[0]?.actor),
    createTrainer: actor => openTrainerCreator(actor ?? canvas?.tokens?.controlled?.[0]?.actor),
    openTeam: actor => openTeam(actor ?? canvas?.tokens?.controlled?.[0]?.actor),
    openPokemon: document => openPokemon(document)
  };
  if (game.user.isGM) {
    ensureDeploymentPermissions().catch(error => console.error(`${MODULE_ID} | Deployment permission grant failed`, error));
    migratePokemonActorSheets().catch(error => console.error(`${MODULE_ID} | Pokémon sheet migration failed`, error));
    migrateEmbeddedAssetUrls().catch(error => console.error(`${MODULE_ID} | Asset migration failed`, error));
    migratePokemonCombatData().catch(error => console.error(`${MODULE_ID} | Combat data migration failed`, error));
    migrateTrainerFeatureGroups().catch(error => console.error(`${MODULE_ID} | Trainer feature grouping migration failed`, error));
    migrateTrainerClassAdvancements().catch(error => console.error(`${MODULE_ID} | Trainer advancement migration failed`, error));
    synchronizePrimaryParty().catch(error => console.error(`${MODULE_ID} | Primary Party synchronization failed`, error));
    migrateMoveMachineIcons().catch(error => console.error(`${MODULE_ID} | Move-machine icon migration failed`, error));
    migrateNpcTrainerSprites().catch(error => console.error(`${MODULE_ID} | NPC Trainer sprite migration failed`, error));
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
 * Descarta el catálogo anterior y recarga el cliente. Foundry no reconstruye
 * automáticamente menús, controles de escena ni aplicaciones ya abiertas, por
 * lo que la recarga garantiza que todo el módulo use el mismo idioma.
 */
async function changeDataLanguage(language) {
  clearPoke5eDataCache();
  try {
    await loadPoke5eData(language);
  } catch (error) {
    console.error(`${MODULE_ID} | Language data could not be loaded`, error);
    ui.notifications.error(game.i18n.localize("POKE5E.Notifications.LanguageFailed"));
    return;
  }
  ui.notifications.info(game.i18n.localize("POKE5E.Notifications.LanguageChanged"));
  setTimeout(() => window.location.reload(), 500);
}

/**
 * Filtra los Items que se crean sobre un actor: rechaza especies de jugador que
 * no sean Humano (isHumanSpecies() de trainer-creator.mjs) y convierte las
 * especies Pokémon arrastradas con normalizeDroppedSpecies() (model.mjs),
 * mandándolas a la reserva si el equipo activo ya está lleno.
 */
Hooks.on("preCreateItem", item => {
  if (item.parent?.documentName === "Actor" && item.parent.type === "character" && item.type === "race" && !isHumanSpecies(item)) {
    ui.notifications.warn(game.i18n.localize("POKE5E.Notifications.HumanPlayersOnly"));
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
  if (game.user.isGM && actor.type === "character") synchronizePrimaryParty().catch(error => console.error(`${MODULE_ID} | Primary Party synchronization failed`, error));
  if (userId !== game.user.id || actor.type !== "character" || actor.getFlag(MODULE_ID, "trainerCreation")?.completed) return;
  setTimeout(() => new Poke5eTrainerCreator({ actor }).render(true), 250);
});

/** Mantiene la Primary Party al cambiar permisos, asignaciones o borrar PJ. */
Hooks.on("updateActor", (actor, changes, options) => {
  if (!game.user.isGM) return;
  const characterChanged = actor.type === "character" && (
    foundry.utils.hasProperty(changes, "ownership") || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.trainerCreation`)
  );
  const groupChanged = actor.type === "group" && foundry.utils.hasProperty(changes, "system.members") && !options?.poke5ePrimaryParty;
  if (characterChanged || groupChanged) {
    synchronizePrimaryParty().catch(error => console.error(`${MODULE_ID} | Primary Party synchronization failed`, error));
  }
});
Hooks.on("deleteActor", actor => {
  if (game.user.isGM && ["character", "group"].includes(actor.type)) synchronizePrimaryParty().catch(error => console.error(`${MODULE_ID} | Primary Party synchronization failed`, error));
});
Hooks.on("updateUser", (_user, changes) => {
  if (game.user.isGM && (foundry.utils.hasProperty(changes, "character") || foundry.utils.hasProperty(changes, "role"))) {
    synchronizePrimaryParty().catch(error => console.error(`${MODULE_ID} | Primary Party synchronization failed`, error));
  }
});

/** Botones de cabecera en las fichas antiguas (ApplicationV1), vía addLegacyHeaderControl(). */
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => addLegacyHeaderControl(sheet, buttons));
Hooks.on("getApplicationV1HeaderButtons", (application, buttons) => addLegacyHeaderControl(application, buttons));
/** Añade a la barra de herramientas de tokens los accesos del director. */
Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  for (const tool of GM_SCENE_TOOLS) addTokenSceneControl(controls, tool);
});
/**
 * Equivalente de addLegacyHeaderControl() para las fichas ApplicationV2: inserta
 * los botones de equipo Pokémon, de completar Entrenador y de Pokédex, evitando
 * duplicarlos y excluyendo las ventanas propias del módulo.
 */
Hooks.on("getHeaderControlsApplicationV2", (application, controls) => {
  if (application instanceof Poke5ePokemonSheet || application instanceof Poke5eTrainerTeam) return;
  for (const entry of poke5eHeaderControls(application, ["team", "createTrainer", "pokedex"])) {
    if (controls.some(control => control.action === entry.id)) continue;
    controls.unshift({ label: entry.label, icon: entry.icon, action: entry.id, visible: true, onClick: entry.open });
  }
});

/**
 * Propaga a la ficha del entrenador los PG que cambian en un actor desplegado o
 * salvaje mediante syncDeploymentHp() (deployment.mjs), que también resuelve
 * los objetos activados por una bajada de PG. Solo el cliente que originó la
 * actualización abre reacciones, evitando diálogos duplicados. El sentido
 * inverso lo cubre el hook `updateItem`.
 */
Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (!["deployed", "wild"].includes(actor.getFlag(MODULE_ID, "kind"))) return;
  if (userId && userId !== game.user.id) return;
  if (foundry.utils.hasProperty(changes, "system.attributes.hp") || foundry.utils.hasProperty(changes, "system.attributes.hp.value") || foundry.utils.hasProperty(changes, "system.attributes.hp.max")) {
    syncDeploymentHp(actor).catch(error => console.error(`${MODULE_ID} | HP sync failed`, error));
  }
});

/**
 * Contrapartida del hook `updateActor`: lleva al actor desplegado los PG
 * editados en la ficha y vuelve a calcular los efectos del objeto cuando cambia
 * la instancia, mediante las dos sincronizaciones de deployment.mjs.
 */
Hooks.on("updateItem", (item, changes) => {
  if (item.getFlag(MODULE_ID, "kind") !== "pokemon") return;
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.instance.hp`) || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.instance`)) {
    syncPokemonHpToDeployment(item).catch(error => console.error(`${MODULE_ID} | Pokémon HP sync failed`, error));
  }
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.instance.heldItem`) || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.instance`)) {
    syncPokemonHeldItemToDeployment(item).catch(error => console.error(`${MODULE_ID} | Held item sync failed`, error));
  }
});

/**
 * Delega `dnd5e.restCompleted` en held-items.mjs: el descanso largo actúa como
 * amanecer para las cargas y el corto permite reparar el Globo Helio. También
 * restaura los recursos "una vez por descanso" de habilidad (lote 42,
 * pokemon-abilities.mjs) — función hermana en vez de fusionarla con la de
 * objetos equipados, para no mezclar sus vocabularios.
 */
Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
  restoreHeldItemChargesAfterRest(actor, config).catch(error => console.error(`${MODULE_ID} | Held item rest reset failed`, error));
  resetAbilityRestResourcesAfterRest(actor, config).catch(error => console.error(`${MODULE_ID} | Ability rest resource reset failed`, error));
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
 * Botones de cabecera que el módulo ofrece para un actor: equipo Pokémon,
 * completar Entrenador y Pokédex, cada uno con su condición de aparición.
 * Devuelve solo los aplicables, en el orden pedido, para que los dos hooks de
 * cabecera —ApplicationV1 y V2— compartan criterios y etiquetas y solo tengan
 * que traducirlos a la forma que espera cada API.
 */
function poke5eHeaderControls(application, order) {
  const actor = application.actor ?? application.document;
  if (actor?.documentName !== "Actor") return [];
  const available = {
    team: actor.type === "character"
      ? { id: "poke5e-open-team", label: teamLabel(actor), icon: "fa-solid fa-circle-dot", open: () => new Poke5eTrainerTeam({ actor }).render(true) }
      : null,
    createTrainer: needsTrainerCreation(actor)
      ? { id: "poke5e-create-trainer", label: game.i18n.localize("POKE5E.Actions.CompleteTrainer"), icon: "fa-solid fa-user-plus", open: () => new Poke5eTrainerCreator({ actor }).render(true) }
      : null,
    pokedex: ["deployed", "wild"].includes(actor.getFlag(MODULE_ID, "kind"))
      ? { id: "poke5e-open-pokemon", label: game.i18n.localize("POKE5E.Actions.Pokedex"), icon: "fa-solid fa-address-card", open: () => openPokemon(actor) }
      : null
  };
  return order.map(key => available[key]).filter(Boolean);
}

/**
 * Traduce poke5eHeaderControls() a la forma de las aplicaciones ApplicationV1
 * (`class` y `onclick` en vez de `action` y `onClick`). El orden de inserción se
 * mantiene como estaba antes de compartir el cálculo con el hook V2.
 */
function addLegacyHeaderControl(application, buttons) {
  for (const entry of poke5eHeaderControls(application, ["createTrainer", "team", "pokedex"])) {
    if (buttons.some(button => button.class === entry.id)) continue;
    buttons.unshift({ label: entry.label, class: entry.id, icon: entry.icon, onclick: entry.open });
  }
}

/**
 * Abre el gestor de equipo (trainer-team.mjs) validando que el actor sea un
 * personaje. Respaldo de la macro `game.poke5e.openTeam`.
 */
function openTeam(actor) {
  if (!actor || actor.type !== "character") return ui.notifications.warn(game.i18n.localize("POKE5E.Notifications.SelectTrainerActor"));
  return new Poke5eTrainerTeam({ actor }).render(true);
}

/**
 * Abre el asistente de creación de Entrenador (trainer-creator.mjs) comprobando
 * tipo de actor y permisos. Respaldo de la macro `game.poke5e.createTrainer`.
 */
function openTrainerCreator(actor) {
  if (!actor || actor.type !== "character") return ui.notifications.warn(game.i18n.localize("POKE5E.Notifications.SelectTrainerCharacter"));
  if (!actor.isOwner) return ui.notifications.warn(game.i18n.localize("POKE5E.Notifications.NoCharacterPermission"));
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
    // La migración corre en cada sesión del director: sin esta comparación
    // reescribiría las afinidades de todos los desplegados aunque ya fueran las
    // correctas, con una actualización de base de datos por actor.
    if (["dr", "dv", "di"].every(key => sameTraitValues(actor.system.traits?.[key]?.value, traits[key].value))) continue;
    await actor.update({
      "system.traits.dr": traits.dr,
      "system.traits.dv": traits.dv,
      "system.traits.di": traits.di
    });
  }
}

/**
 * Compara las afinidades guardadas —que D&D 5e expone como Set— con las que
 * calcula damageTraitsForPokemonTypes(), sin importar el orden. Auxiliar
 * exclusivo de migratePokemonCombatData().
 */
function sameTraitValues(current, expected) {
  const stored = current instanceof Set ? [...current] : Array.isArray(current) ? current : [];
  return stored.length === expected.length && expected.every(value => stored.includes(value));
}

/**
 * Migración: los sprites de Entrenador NPC pasaron de PNG a
 * WebP (de 100 MB a 14 MB), así que los actores generados antes apuntan a
 * archivos que ya no existen. Reescribe con migratedNpcSpritePath()
 * (npc-trainer-rules.mjs) el retrato, la textura del prototipo de token y la de
 * los tokens ya colocados en las escenas. Se ejecuta una vez por sesión de
 * director desde el hook `ready` y no escribe nada cuando no queda ninguna ruta
 * antigua, que es el caso habitual.
 */
async function migrateNpcTrainerSprites() {
  for (const actor of game.actors) {
    const updates = {};
    const img = migratedNpcSpritePath(actor.img);
    if (img) updates.img = img;
    const tokenSrc = migratedNpcSpritePath(actor.prototypeToken?.texture?.src);
    if (tokenSrc) updates["prototypeToken.texture.src"] = tokenSrc;
    if (Object.keys(updates).length) await actor.update(updates);
  }
  for (const scene of game.scenes) {
    const updates = [];
    for (const token of scene.tokens) {
      const src = migratedNpcSpritePath(token.texture?.src);
      if (src) updates.push({ _id: token.id, "texture.src": src });
    }
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
  }
}

/**
 * Los dos accesos que el módulo añade a la barra de tokens del director: el
 * generador de encuentros (encounter-builder.mjs) y el de Entrenadores NPC
 * (npc-trainer-generator.mjs). Los inserta addTokenSceneControl().
 */
const GM_SCENE_TOOLS = [
  { name: "poke5e-encounter-builder", title: "POKE5E.Menu.Encounter.Name", icon: "fa-solid fa-mountain-sun", open: () => new Poke5eEncounterBuilder().render(true) },
  { name: "poke5e-npc-trainer-generator", title: "POKE5E.Menu.NpcTrainer.Name", icon: "fa-solid fa-users-gear", open: () => new Poke5eNpcTrainerGenerator().render(true) }
];

/**
 * Inserta una entrada de GM_SCENE_TOOLS en los controles de token, admitiendo
 * las tres formas que han tenido los controles en distintas versiones de
 * Foundry: array de grupos, objeto de grupos con `tools` en array y objeto de
 * grupos con `tools` indexadas por nombre. Nunca duplica una herramienta ya
 * presente, porque el hook se dispara en cada redibujado de la barra.
 */
function addTokenSceneControl(controls, { name, title, icon, open }) {
  const tool = {
    name,
    title: game.i18n.localize(title),
    icon,
    button: true,
    visible: true,
    onChange: (event, active) => { if (active !== false) open(); }
  };
  const tokenControls = Array.isArray(controls)
    ? controls.find(control => control.name === "token" || control.name === "tokens")
    : controls.tokens ?? controls.token;
  const tools = tokenControls?.tools;
  if (!tools) return;
  if (Array.isArray(tools)) {
    if (!tools.some(entry => entry.name === name)) tools.push(tool);
  } else if (!tools[name]) {
    tools[name] = tool;
  }
}

/**
 * Rótulo del botón de equipo con la ocupación actual ("Equipo Pokémon (3/6)"),
 * a partir de getPokemonItems() y trainerPokeslotLimit() (model.mjs).
 */
function teamLabel(actor) {
  const count = getPokemonItems(actor).filter(item => item.getFlag(MODULE_ID, "instance")?.inTeam).length;
  return game.i18n.format("POKE5E.Team.HeaderLabel", { count, max: trainerPokeslotLimit(actor) });
}

console.info(`${MODULE_ID} | Pokémon 5e module loaded`);
