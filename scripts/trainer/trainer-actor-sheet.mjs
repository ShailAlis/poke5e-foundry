/**
 * Ficha de personaje del Entrenador. Extiende la ficha de personaje de D&D 5e
 * añadiéndole una pestaña "Equipo Pokémon" entre la portada y el resto, sin
 * alterar nada de lo que el sistema ya presenta.
 *
 * Es la ficha predeterminada de los personajes (la registra main.mjs mediante
 * registerTrainerActorSheet()) y ofrece las mismas acciones que la ventana de
 * trainer-team.mjs. Su plantilla es `templates/trainer-sheet-team.hbs`.
 */
import { MODULE_ID, MODULE_PATH, displayAssetUrl, displayPokemonName, getPack, getPokemonItems, trainerClassSource, trainerLevel, trainerPathFeatureSources, trainerPathSources, trainerPokeslotLimit } from "../core/model.mjs";
import { Poke5ePokemonSheet } from "../pokemon/pokemon-sheet.mjs";
import { Poke5eSpeciesBrowser } from "../ui/species-browser.mjs";
import { deployPokemon, deployedActorFor, recallPokemon } from "../world/deployment.mjs";
import { attemptCapture } from "../pokemon/capture.mjs";
import { experienceProgress } from "../pokemon/progression.mjs";
import { adaptTrainerCurrencyFields, pokedollars, updatePokedollars } from "../world/economy.mjs";
import { advanceTrainerClassFromExperience, trainerProgressionForActor } from "./trainer-progression.mjs";
import { hasTrainerPath, trainerControlBonus, trainerSpecializationTypes } from "./trainer-path-rules.mjs";
import { promptSpendTrainerResource, spendTrainerResource, trainerResourceState } from "./trainer-resources.mjs";
import { applyDynamicModifier } from "../combat/move-modifiers.mjs";
import { typeLabel } from "../combat/combat.mjs";
import { trainerControlSr } from "./npc-trainer-rules.mjs";

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
      addTrainerExperience: Poke5eTrainerActorSheet.#addTrainerExperience,
      advanceTrainerClass: Poke5eTrainerActorSheet.#advanceTrainerClass,
      spendPathResource: Poke5eTrainerActorSheet.#spendPathResource,
      restorePathResource: Poke5eTrainerActorSheet.#restorePathResource,
      capturePokemon: Poke5eTrainerActorSheet.#capturePokemon,
      deployPokemon: Poke5eTrainerActorSheet.#deployPokemon,
      openPokemon: Poke5eTrainerActorSheet.#openPokemon,
      recallPokemon: Poke5eTrainerActorSheet.#recallPokemon,
      togglePokemonTeam: Poke5eTrainerActorSheet.#togglePokemonTeam,
      givePokechef: Poke5eTrainerActorSheet.#givePokechef,
      guruSpirit: Poke5eTrainerActorSheet.#guruSpirit
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
    const pathResources = (this.actor.itemTypes.feat ?? []).filter(item => item.getFlag(MODULE_ID, "pathId") && item.system?.uses?.max).map(item => {
      const maximum = Math.max(0, Number(item.system.uses.max) || Number(item.system.uses.value) || 0);
      const spent = Math.max(0, Number(item.system.uses.spent) || 0);
      return { itemId: item.id, name: item.name, maximum, value: Math.max(0, maximum - spent) };
    });
    // SR máximo controlable (tabla oficial por nivel + bonus de camino como Guru 2).
    // Solo es informativo: el módulo no bloquea capturas ni despliegues por superarlo.
    const maxControlSr = trainerControlSr(trainerLevel(this.actor)) + trainerControlBonus(this.actor);
    const overControlSr = active.filter(entry => Number(entry.speciesSr) > maxControlSr).length;
    // Almacenar poder (Type Master 9): elige uno de los tipos especializados
    // del entrenador para que sus Pokémon coincidentes ganen resistencia a
    // ese tipo. Solo aparece con el rasgo desbloqueado y al menos una
    // especialización elegida.
    const specializedTypes = [...trainerSpecializationTypes(this.actor)];
    const typeMasterySelected = this.actor.getFlag(MODULE_ID, "typeMasteryResistance") ?? "";
    const typeMasteryChoice = hasTrainerPath(this.actor, "type-master", 9) && specializedTypes.length
      ? { options: Object.fromEntries(specializedTypes.map(type => [type, typeLabel(type)])), selected: typeMasterySelected, selectedLabel: typeLabel(typeMasterySelected) }
      : null;
    // Compañero (Ranger 9): elige cualquier Pokémon propio, activo o de
    // reserva. El texto dice "tras cada descanso largo"; aquí se simplifica a
    // "se mantiene hasta que lo cambies", igual que el resto de elecciones de
    // camino de esta ficha.
    const rangerCompanionSelected = this.actor.getFlag(MODULE_ID, "rangerCompanion") ?? "";
    const rangerCompanionChoice = hasTrainerPath(this.actor, "ranger", 9) && all.length
      ? { options: Object.fromEntries(all.map(entry => [entry.itemId, entry.name])), selected: rangerCompanionSelected, selectedLabel: all.find(entry => entry.itemId === rangerCompanionSelected)?.name ?? "" }
      : null;
    // Maestría táctica (Ace Trainer 9): característica elegida, +1 para todo
    // el equipo actual y futuro (aceTrainerAbilityBonus() en
    // trainer-path-rules.mjs, aplicado en deployedActorSource()).
    const aceTrainerAbilitySelected = this.actor.getFlag(MODULE_ID, "aceTrainerAbility") ?? "";
    const aceTrainerAbilityChoice = hasTrainerPath(this.actor, "ace-trainer", 9)
      ? { options: { str: "Fuerza", dex: "Destreza", con: "Constitución", int: "Inteligencia", wis: "Sabiduría", cha: "Carisma" }, selected: aceTrainerAbilitySelected }
      : null;
    // Pokéchef (Nurse 5/9/15): botón por Pokémon en la rejilla de equipo.
    const pokechefAvailable = Boolean(trainerResourceState(this.actor, "nurse")?.remaining);
    // Espíritu (Guru 15): botón único, se aplica a todo el equipo desplegado
    // a la vez (ver #guruSpirit()).
    const guruSpiritResource = (state => state?.remaining ? state : null)(trainerResourceState(this.actor, "guru"));
    return {
      ...context,
      pokemon: {
        allCount: all.length,
        canEdit: this.actor.isOwner,
        pokedollars: pokedollars(this.actor),
        trainerProgression: trainerProgressionForActor(this.actor),
        pathResources,
        hasPathResources: pathResources.length > 0,
        typeMasteryChoice,
        rangerCompanionChoice,
        aceTrainerAbilityChoice,
        pokechefAvailable,
        guruSpiritResource,
        maxControlSr,
        overControlSr,
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
    this.element.querySelector("[data-action='selectTypeMastery']")?.addEventListener("change", async event => {
      await this.actor.setFlag(MODULE_ID, "typeMasteryResistance", event.currentTarget.value || null);
      this.render({ force: true });
    });
    this.element.querySelector("[data-action='selectRangerCompanion']")?.addEventListener("change", async event => {
      await this.actor.setFlag(MODULE_ID, "rangerCompanion", event.currentTarget.value || null);
      this.render({ force: true });
    });
    this.element.querySelector("[data-action='selectAceTrainerAbility']")?.addEventListener("change", async event => {
      await this.actor.setFlag(MODULE_ID, "aceTrainerAbility", event.currentTarget.value || null);
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

  /**
   * Pokéchef (Nurse 5/9/15): gasta una golosina preparada para curar PG al
   * Pokémon de la fila pulsada. Fórmula según nivel (2d4+2 / 3d10+6 / 4d12+10,
   * trainerResourceState()). Se restringe a Pokémon propios del entrenador
   * —el texto original permite dársela a cualquier criatura adyacente, pero
   * este proyecto no modela criaturas ajenas de forma utilizable aquí—.
   */
  static async #givePokechef(event, target) {
    const sheet = this;
    const item = Poke5eTrainerActorSheet.#item(sheet, target);
    if (!item) return;
    const state = trainerResourceState(sheet.actor, "nurse");
    if (!state?.remaining) return;
    const name = displayPokemonName(item);
    const spent = await promptSpendTrainerResource(sheet.actor, "nurse", {
      title: `${state.label} (${state.remaining}/${state.max})`,
      prompt: `¿Dar una golosina (${state.formula} PG) a ${foundry.utils.escapeHTML(name)}?`
    });
    if (!spent) return;
    const combatActor = item.getFlag(MODULE_ID, "kind") === "wild" ? item.parent : deployedActorFor(item);
    const instance = foundry.utils.deepClone(item.getFlag(MODULE_ID, "instance") ?? {});
    const roll = await new Roll(state.formula).evaluate();
    const hpMax = Number(combatActor?.system.attributes?.hp?.max) || Number(instance.hp?.max) || 1;
    const hpValue = Number(combatActor?.system.attributes?.hp?.value) ?? Number(instance.hp?.value) ?? 0;
    const healed = Math.min(hpMax - hpValue, Number(roll.total) || 0);
    const newValue = hpValue + Math.max(0, healed);
    if (combatActor) await combatActor.update({ "system.attributes.hp.value": newValue });
    instance.hp = { value: newValue, max: hpMax };
    await item.setFlag(MODULE_ID, "instance", instance);
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), flavor: `Pokéchef — ${name}` });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>Pokéchef</strong>: ${foundry.utils.escapeHTML(name)} recupera ${Math.max(0, healed)} PG.</p></div>` });
    sheet.render({ force: true });
  }

  /**
   * Espíritu (Guru 15): gasta un uso para sumar el modificador de Sabiduría
   * del entrenador a los ataques o al daño (a elegir) de todo su equipo
   * desplegado hasta su próximo turno, vía el mismo applyDynamicModifier()
   * que ya usa Acupresión —un ActiveEffect de move-modifiers.mjs con
   * duración de 1 ronda—, uno por Pokémon desplegado.
   */
  static async #guruSpirit(event, target) {
    const sheet = this;
    const state = trainerResourceState(sheet.actor, "guru");
    if (!state?.remaining) return;
    let choice = null;
    try {
      choice = await foundry.applications.api.DialogV2.prompt({
        window: { title: `${state.label} (${state.remaining}/${state.max})` },
        content: `<p>Suma tu modificador de Sabiduría hasta tu próximo turno a...</p><label><span>Aplicar a</span><select name="target"><option value="attack">Ataques</option><option value="damage">Daño</option></select></label>`,
        modal: true,
        rejectClose: false,
        ok: { label: "Aplicar", icon: "fa-solid fa-hand-sparkles", callback: (dialogEvent, button) => button.form.elements.target.value }
      });
    } catch { choice = null; }
    if (!choice) return;
    if (!await spendTrainerResource(sheet.actor, "guru", 1)) return;
    const wisMod = Math.max(0, Number(sheet.actor.system?.abilities?.wis?.mod) || 0);
    const deployed = getPokemonItems(sheet.actor).map(item => deployedActorFor(item)).filter(Boolean);
    const label = choice === "damage" ? "daño" : "ataques";
    for (const actor of deployed) {
      await applyDynamicModifier(actor, "guru-spirit", {
        modifiers: { [choice]: wisMod },
        durationRounds: 1,
        sourceName: "Espíritu (Guru 15)",
        description: `+${wisMod} a ${label} hasta el próximo turno del entrenador.`
      });
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>Espíritu</strong>: +${wisMod} a ${label} de todo tu equipo desplegado hasta tu próximo turno.</p></div>` });
    sheet.render({ force: true });
  }

  /** Suma PX al actor; el hook de progresión abrirá el avance si alcanza nivel. */
  static async #addTrainerExperience(event, target) {
    const sheet = this;
    if (!sheet.actor.isOwner) return;
    const amount = await promptTrainerExperience();
    if (!amount) return;
    const current = Math.max(0, Math.trunc(Number(sheet.actor.system.details?.xp?.value) || 0));
    await sheet.actor.update({ "system.details.xp.value": current + amount });
    sheet.render({ force: true });
  }

  /** Abre manualmente los avances de clase pendientes según la XP actual. */
  static async #advanceTrainerClass(event, target) {
    await advanceTrainerClassFromExperience(this.actor, { sheet: this });
  }

  static async #spendPathResource(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const maximum = Math.max(0, Number(item.system.uses.max) || Number(item.system.uses.value) || 0);
    const spent = Math.max(0, Number(item.system.uses.spent) || 0);
    if (spent >= maximum) return;
    await item.update({ "system.uses.spent": spent + 1 });
    this.render({ force: true });
  }

  static async #restorePathResource(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const spent = Math.max(0, Number(item.system.uses.spent) || 0);
    if (!spent) return;
    await item.update({ "system.uses.spent": spent - 1 });
    this.render({ force: true });
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
  await ensureTrainerPathDocuments(pack);
  const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.sourceId`, `flags.${MODULE_ID}.kind`] });
  const featureUuids = new Map();
  const pathFeatureUuids = new Map();
  let trainerClassId = null;
  for (const entry of index.values()) {
    const kind = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.kind`);
    const sourceId = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`);
    if (kind === "trainer-feature" && sourceId) featureUuids.set(sourceId, `Compendium.${pack.collection}.Item.${entry._id}`);
    if (kind === "trainer-path-feature" && sourceId) pathFeatureUuids.set(sourceId, `Compendium.${pack.collection}.Item.${entry._id}`);
    if (kind === "trainer-class" && sourceId === "trainer-class") trainerClassId = entry._id;
  }
  const expected = trainerClassSource(featureUuids);
  const expectedPaths = new Map(trainerPathSources(pathFeatureUuids).map(source => [source.system.identifier, source]));
  const expectedPathFeatures = new Map(trainerPathFeatureSources().map(source => [source.flags[MODULE_ID].sourceId, source]));
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
    for (const item of actor.itemTypes.subclass ?? []) {
      if (item.system.classIdentifier !== "trainer") continue;
      const pathId = item.getFlag(MODULE_ID, "pathId") ?? item.system.identifier;
      const path = expectedPaths.get(pathId);
      if (path) await updateTrainerClassAdvancements(item, path.system.advancement, path.img, { updateHitDie: false });
    }
    for (const item of actor.itemTypes.feat ?? []) {
      const sourceId = item.getFlag(MODULE_ID, "sourceId");
      const expectedFeature = expectedPathFeatures.get(sourceId);
      if (!expectedFeature) continue;
      const update = {
        "system.description": expectedFeature.system.description,
        effects: expectedFeature.effects,
        [`flags.${MODULE_ID}.automation`]: expectedFeature.flags[MODULE_ID].automation
      };
      if (expectedFeature.system.uses) {
        const spent = Number(item.system?.uses?.spent) || 0;
        update["system.uses"] = { ...expectedFeature.system.uses, spent };
      }
      await item.update(update);
    }
    const obsoletePathFeatures = actor.items.filter(item => {
      const sourceId = String(item.getFlag(MODULE_ID, "sourceId") ?? "");
      return /^trainer-feature-trainer-path-(?:1|5|9|15)$/.test(sourceId);
    });
    if (obsoletePathFeatures.length) await actor.deleteEmbeddedDocuments("Item", obsoletePathFeatures.map(item => item.id));
  }
}

/** Crea los caminos que falten para que la selección de nivel 2 sea inmediata. */
async function ensureTrainerPathDocuments(pack) {
  if (pack.locked) await pack.configure({ locked: false });
  let index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.sourceId`, `flags.${MODULE_ID}.kind`] });
  const bySourceId = new Map([...index.values()].map(entry => [foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`), entry]));
  const obsolete = new Set([1, 5, 9, 15].map(level => `trainer-feature-trainer-path-${level}`));
  const obsoleteIds = [...bySourceId.entries()].filter(([sourceId]) => obsolete.has(sourceId)).map(([, entry]) => entry._id);
  if (obsoleteIds.length) await Item.implementation.deleteDocuments(obsoleteIds, { pack: pack.collection });

  const pathFeatureSources = trainerPathFeatureSources();
  const missingFeatures = pathFeatureSources.filter(source => !bySourceId.has(source.flags[MODULE_ID].sourceId));
  const existingFeatureUpdates = pathFeatureSources
    .filter(source => bySourceId.has(source.flags[MODULE_ID].sourceId))
    .map(source => ({ ...source, _id: bySourceId.get(source.flags[MODULE_ID].sourceId)._id }));
  if (existingFeatureUpdates.length) await Item.implementation.updateDocuments(existingFeatureUpdates, { pack: pack.collection });
  if (missingFeatures.length) await Item.implementation.createDocuments(missingFeatures, { pack: pack.collection });

  index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.sourceId`, `flags.${MODULE_ID}.kind`] });
  const featureUuids = new Map();
  const existingSources = new Set();
  for (const entry of index.values()) {
    const sourceId = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`);
    const kind = foundry.utils.getProperty(entry, `flags.${MODULE_ID}.kind`);
    if (sourceId) existingSources.add(sourceId);
    if (kind === "trainer-path-feature" && sourceId) featureUuids.set(sourceId, `Compendium.${pack.collection}.Item.${entry._id}`);
  }
  const pathSources = trainerPathSources(featureUuids);
  const refreshedBySourceId = new Map([...index.values()].map(entry => [foundry.utils.getProperty(entry, `flags.${MODULE_ID}.sourceId`), entry]));
  const missingPaths = pathSources.filter(source => !existingSources.has(source.flags[MODULE_ID].sourceId));
  const existingPathUpdates = pathSources
    .filter(source => existingSources.has(source.flags[MODULE_ID].sourceId))
    .map(source => ({ ...source, _id: refreshedBySourceId.get(source.flags[MODULE_ID].sourceId)._id }));
  if (existingPathUpdates.length) await Item.implementation.updateDocuments(existingPathUpdates, { pack: pack.collection });
  if (missingPaths.length) await Item.implementation.createDocuments(missingPaths, { pack: pack.collection });
}

/** Mezcla la plantilla corregida con el historial y los avances personalizados. */
async function updateTrainerClassAdvancements(item, expected, icon, { updateHitDie = true } = {}) {
  if (!item) return;
  const stored = item._source?.system?.advancement ?? item.system?.advancement ?? [];
  const current = Array.isArray(stored) ? stored : Object.values(stored ?? {});
  const expectedEntries = Array.isArray(expected) ? expected : Object.values(expected ?? {});
  const byId = new Map(current.filter(entry => entry?._id).map(entry => [entry._id, entry]));
  const expectedIds = new Set(expectedEntries.map(entry => entry._id));
  // Si ya existe una entrada con ese id se deja completamente intacta (configuración
  // incluida): prioriza no perder ediciones manuales del GM sobre re-sincronizar con
  // la plantilla canónica. Solo se crean entradas nuevas para ids que faltan.
  const mergedEntries = expectedEntries.map(entry => foundry.utils.deepClone(byId.get(entry._id) ?? entry));
  mergedEntries.push(...current
    .filter(entry => entry?._id && !expectedIds.has(entry._id))
    .map(entry => foundry.utils.deepClone(entry)));
  const merged = Object.fromEntries(mergedEntries.map(entry => [entry._id, entry]));
  const currentMapping = Object.fromEntries(current.filter(entry => entry?._id).map(entry => [entry._id, entry]));
  const update = {};
  if (JSON.stringify(currentMapping) !== JSON.stringify(merged)) update["system.advancement"] = merged;
  if (updateHitDie && item._source?.system?.hd?.denomination !== "d6") update["system.hd.denomination"] = "d6";
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
    experience,
    speciesSr: Number(item.getFlag(MODULE_ID, "species")?.sr) || 0
  };
}

/** Pide una cantidad positiva de PX para sumarla al Entrenador. */
async function promptTrainerExperience() {
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("POKE5E.TrainerProgression.AddDialogTitle") },
      content: `<div class="poke5e-experience-dialog">
        <p>${game.i18n.localize("POKE5E.TrainerProgression.AddDialogHint")}</p>
        <label><span>${game.i18n.localize("POKE5E.TrainerProgression.Amount")}</span><input type="number" name="amount" min="1" step="1" value="100" autofocus></label>
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: game.i18n.localize("POKE5E.TrainerProgression.AddXP"),
        icon: "fa-solid fa-plus",
        callback: (event, button) => Math.max(0, Math.trunc(Number(button.form.elements.amount.value) || 0))
      }
    });
  } catch {
    return 0;
  }
}
