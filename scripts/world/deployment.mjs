/**
 * Despliegue de los Pokémon del equipo en el mapa. Traduce un Item Pokémon a un
 * actor NPC temporal con su token, controla dónde puede aparecer, mantiene
 * sincronizados PG, nombre y efectos del objeto equipado en ambos sentidos, y
 * borra el actor al retirarlo.
 *
 * Sus funciones de sincronización las disparan los hooks de main.mjs; las de
 * desplegar y retirar, los botones de trainer-team.mjs, trainer-actor-sheet.mjs
 * y pokemon-sheet.mjs. wild-deployment.mjs hace lo propio con los salvajes, que
 * no proceden de ningún entrenador.
 */
import { MODULE_ID, POKEMON_TOKEN_SCALE, displayPokemonName, portraitUrl, remoteAssetUrl } from "../core/model.mjs";
import { loadPoke5eData } from "../core/data-service.mjs";
import { damageTraitsForPokemonTypes } from "../combat/combat.mjs";
import { aceTrainerAbilityBonus, applyTypeMasteryDefense, hasTrainerPath } from "../trainer/trainer-path-rules.mjs";
import { speciesSkillKey } from "../trainer/trainer-creation-data.mjs";
import { applyAbilityDefenses, applyAbilityDeployWeather } from "../pokemon/pokemon-abilities.mjs";
import { pokemonStatusEffectSource } from "../combat/status-effects.mjs";
import { actorHasRecallLock } from "../combat/ongoing-effects.mjs";
import {
  confirmHeldItemReaction,
  heldItemActorAdjustments,
  heldItemEffectiveTypes,
  heldItemHpResolution,
  postHeldItemMessage,
  rollHeldItemFormula
} from "../pokemon/held-items.mjs";

/** Distancia máxima, en pies, entre el entrenador y la casilla de salida. */
const DEPLOY_RANGE = 10;
/** Borrados en curso por id de actor; evita que removeDeployment() se solape consigo mismo. */
const deploymentCleanup = new Map();
/** Último movimiento registrado por token; permite descartar los enderezados obsoletos. */
const uprightMovements = new Map();

/**
 * Devuelve a la vertical los tokens Pokémon y Entrenadores que Foundry rota al moverlos,
 * esperando a que termine la animación y descartando el ajuste si entretanto ha
 * empezado otro movimiento (marcador en uprightMovements).
 * La llama el hook `init` de main.mjs.
 */
export function registerPokemonTokenMovement() {
  Hooks.on("moveToken", (token, movement, operation, user) => {
    if (user?.id !== game.user.id || !actorReturnsUpright(token.actor)) return;
    const marker = foundry.utils.randomID();
    uprightMovements.set(token.uuid, marker);
    Promise.resolve().then(async () => {
      try {
        await token.object?.movementAnimationPromise;
      } catch {
        // Un movimiento interrumpido queda anulado por el marcador del siguiente.
      }
      if (uprightMovements.get(token.uuid) !== marker) return;
      uprightMovements.delete(token.uuid);
      if (Number(token.rotation) !== 0) await token.update({ rotation: 0 }, { animate: true, poke5eReturnUpright: true });
    });
  });
}

/**
 * Concede a Jugador y Jugador de confianza el permiso de mundo para crear actores
 * y crear/destruir tokens: deployPokemon()/recallPokemon() los crean y borran
 * directamente desde el cliente del jugador (sin pasar por el director), así que
 * sin este permiso el despliegue falla en un mundo con los permisos por defecto de
 * Foundry (Auxiliar de director en adelante). Solo actúa una vez por mundo —guardado
 * en el ajuste `grantedDeploymentPermissions`— para no deshacer un cambio manual
 * posterior del director. La llama el hook `ready` de main.mjs, solo para el director.
 */
export async function ensureDeploymentPermissions() {
  if (game.settings.get(MODULE_ID, "grantedDeploymentPermissions")) return;
  const permissions = foundry.utils.deepClone(game.settings.get("core", "permissions") ?? {});
  const requiredRoles = [CONST.USER_ROLES.PLAYER, CONST.USER_ROLES.TRUSTED];
  let changed = false;
  for (const key of ["ACTOR_CREATE", "TOKEN_CREATE", "TOKEN_DELETE"]) {
    const roles = new Set(permissions[key] ?? []);
    for (const role of requiredRoles) {
      if (roles.has(role)) continue;
      roles.add(role);
      changed = true;
    }
    permissions[key] = [...roles].sort((a, b) => a - b);
  }
  if (changed) {
    await game.settings.set("core", "permissions", permissions);
    ui.notifications.info(localize("POKE5E.Deployment.PermissionsGranted", "Poke5e: se han concedido a Jugador y Jugador de confianza los permisos para sacar y regresar Pokémon (crear actores, crear y destruir tokens). Puedes ajustarlos en Configuración > Configurar permisos."));
  }
  await game.settings.set(MODULE_ID, "grantedDeploymentPermissions", true);
}

/** Incluye Pokémon desplegados/salvajes y Entrenadores jugadores o NPC del módulo. */
export function actorReturnsUpright(actor) {
  if (!actor) return false;
  const kind = actor.getFlag?.(MODULE_ID, "kind");
  return actor.type === "character" || ["deployed", "wild", "npc-trainer"].includes(kind);
}

function localize(key, fallback) { return globalThis.game?.i18n?.localize?.(key) ?? fallback; }
function localizeFormat(key, data, fallback) { return globalThis.game?.i18n?.format?.(key, data) ?? fallback; }

/**
 * Busca el actor temporal de un Pokémon desplegado por el UUID de su Item.
 * Vínculo entre ficha y mapa: lo usan casi todas las funciones del archivo,
 * además de pokemon-sheet.mjs, trainer-team.mjs y trainer-actor-sheet.mjs para
 * saber si ya está en el mapa.
 */
export function deployedActorFor(pokemonItem) {
  return game.actors.find(actor => actor.getFlag(MODULE_ID, "kind") === "deployed" && actor.getFlag(MODULE_ID, "pokemonItemUuid") === pokemonItem.uuid);
}

/** Nombre del actor temporal: identifica al Pokémon y al Entrenador al que pertenece. */
export function deploymentActorName(pokemonItem) {
  const pokemonName = displayPokemonName(pokemonItem);
  const trainerName = String(pokemonItem?.parent?.name ?? "").trim();
  return trainerName ? `${pokemonName} [${trainerName}]` : pokemonName;
}

/**
 * Saca un Pokémon al mapa. Exige escena abierta, permisos, que conserve PG y
 * que el token del entrenador esté presente; si ya estaba desplegado se limita a seleccionarlo y centrar la vista.
 * Si no, crea el actor con deployedActorSource(), pide la casilla con
 * chooseDeploymentPosition() y coloca el token, deshaciendo el actor recién
 * creado ante cualquier error. Su inversa es recallPokemon().
 */
export async function deployPokemon(pokemonItem) {
  if (!canvas?.ready || !canvas.scene) return ui.notifications.warn(localize("POKE5E.Deployment.OpenScene", "Abre una escena antes de desplegar un Pokémon."));
  const trainer = pokemonItem.parent;
  if (!trainer?.isOwner) return ui.notifications.warn(localize("POKE5E.Deployment.NoPermission", "No tienes permiso para desplegar este Pokémon."));
  const instance = pokemonItem.getFlag(MODULE_ID, "instance");
  if (Number(instance?.hp?.value) <= 0) return ui.notifications.warn(localizeFormat("POKE5E.Deployment.Fainted", { pokemon: displayPokemonName(pokemonItem) }, `${displayPokemonName(pokemonItem)} está debilitado y no puede salir al combate.`));
  const trainerToken = trainerTokenFor(trainer);
  if (!trainerToken) return ui.notifications.warn(localize("POKE5E.Deployment.PlaceTrainer", "Coloca el token del entrenador en la escena antes de sacar un Pokémon."));
  let actor = deployedActorFor(pokemonItem);
  if (actor) await syncPokemonIdentityToDeployment(pokemonItem);
  const deployedToken = actor ? deployedTokenFor(actor) : null;
  if (deployedToken) {
    if (deployedToken.parent?.id !== canvas.scene.id) return ui.notifications.warn(localizeFormat("POKE5E.Deployment.OtherScene", { pokemon: displayPokemonName(pokemonItem) }, `${displayPokemonName(pokemonItem)} ya está desplegado en otra escena.`));
    deployedToken.object?.control({ releaseOthers: true });
    if (deployedToken.object) canvas.pan({ x: deployedToken.object.center.x, y: deployedToken.object.center.y });
    return actor;
  }
  const source = actor ? null : await deployedActorSource(pokemonItem);
  const tokenData = actor?.prototypeToken ?? source.prototypeToken;
  const position = await chooseDeploymentPosition(trainerToken, tokenData, displayPokemonName(pokemonItem));
  if (!position) return null;
  const createdActor = !actor;
  actor ??= await Actor.create(source);
  try {
    const token = await actor.getTokenDocument(position);
    const [createdToken] = await canvas.scene.createEmbeddedDocuments("Token", [token.toObject()]);
    createdToken?.object?.control({ releaseOthers: true });
    ui.notifications.info(localizeFormat("POKE5E.Deployment.Deployed", { pokemon: displayPokemonName(pokemonItem) }, `${displayPokemonName(pokemonItem)} ha salido al combate.`));
    await applyAbilityDeployWeather(instance.abilities, { sourceName: displayPokemonName(pokemonItem) });
    return actor;
  } catch (error) {
    if (createdActor && game.actors.has(actor.id)) await actor.delete();
    throw error;
  }
}

/**
 * Retira del mapa a un Pokémon: borra sus tokens y su actor temporal mediante
 * removeDeployment(). Inversa de deployPokemon(); la llaman las fichas y el hook
 * `deleteItem` de main.mjs.
 */
export async function recallPokemon(pokemonItem, { fainted = false, forced = false } = {}) {
  const actor = deployedActorFor(pokemonItem);
  if (!actor) return;
  if (!fainted && !forced && actorHasRecallLock(actor)) {
    ui.notifications.warn(localizeFormat("POKE5E.Deployment.Immobilized", { pokemon: displayPokemonName(pokemonItem) }, `${displayPokemonName(pokemonItem)} está inmovilizado por un efecto mantenido y no puede ser retirado voluntariamente.`));
    return false;
  }
  await removeDeployment(actor, { deleteTokens: true });
  const pokemon = displayPokemonName(pokemonItem);
  const fallback = fainted ? `${pokemon} ha caído debilitado y ha vuelto con su entrenador.` : `${pokemon} ha vuelto con su entrenador.`;
  ui.notifications.info(localizeFormat(fainted ? "POKE5E.Deployment.RecalledFainted" : "POKE5E.Deployment.Recalled", { pokemon }, fallback));
  return true;
}

/**
 * Copia los PG del actor desplegado o salvaje al Item del Pokémon y pasa la
 * bajada por heldItemHpResolution(): reduce daño con Mineral Evolutivo, rompe
 * Globo Helio, aplica Banda Focus y ofrece las reacciones de bayas curativas y
 * Botón Escape. Después sincroniza la corrección al actor o retira al Pokémon
 * debilitado. La dispara `updateActor` de main.mjs; el sentido contrario lo
 * cubre syncPokemonHpToDeployment().
 */
export async function syncDeploymentHp(actor) {
  const kind = actor.getFlag(MODULE_ID, "kind");
  if (!["deployed", "wild"].includes(kind)) return;
  const uuid = actor.getFlag(MODULE_ID, "pokemonItemUuid");
  const item = uuid ? await fromUuid(uuid) : actor.items.find(entry => entry.getFlag(MODULE_ID, "kind") === "pokemon");
  if (!item) return;
  const instance = foundry.utils.deepClone(item.getFlag(MODULE_ID, "instance"));
  const actorHp = Number(actor.system.attributes.hp.value) || 0;
  const maximumHp = Number(actor.system.attributes.hp.max) || instance.hp.max;
  const species = item.getFlag(MODULE_ID, "species") ?? {};
  const held = instance.heldItem;
  let hasEvolution = false;
  if (String(held?.sourceId ?? "").toLocaleLowerCase() === "eviolite") {
    const data = await loadPoke5eData();
    hasEvolution = Boolean(data.evolutionsByFrom.get(species.id)?.length);
  }
  const resolution = heldItemHpResolution({
    sourceId: held?.sourceId,
    charges: held?.charges,
    previousHp: instance.hp?.value,
    nextHp: actorHp,
    maximumHp,
    hasEvolution
  });
  let resolvedHp = resolution.hp;
  let ejectButtonActivated = false;
  if (held && resolution.charges !== held.charges) held.charges = resolution.charges;
  if (kind === "deployed" && String(held?.sourceId ?? "").toLocaleLowerCase() === "eject-button" && Number(held.charges) > 0 && resolution.damage > 0) {
    ejectButtonActivated = await confirmHeldItemReaction(held.name, `<p>${foundry.utils.escapeHTML(displayPokemonName(item))} ha recibido daño. Si procede de un ataque, ¿consumir una carga para retirarlo como acción gratuita?</p>`);
    if (ejectButtonActivated) held.charges = 0;
  }
  if (held && resolution.reaction) {
    const confirmed = await confirmHeldItemReaction(held.name, `<p>${foundry.utils.escapeHTML(displayPokemonName(item))} ha bajado de la mitad de sus PG. ¿Consumir ${foundry.utils.escapeHTML(held.name)}?</p>`);
    if (confirmed) {
      const amount = resolution.reaction.formula
        ? await rollHeldItemFormula(item, resolution.reaction.formula, `${held.name} · Reacción de curación`)
        : resolution.reaction.healing;
      const healed = Math.min(Math.max(0, Number(amount) || 0), Math.max(0, maximumHp - resolvedHp));
      resolvedHp += healed;
      delete instance.heldItem;
      await postHeldItemMessage(item, held, `Se consume como reacción y recupera ${healed} PG.`);
    }
  }
  instance.hp = {
    value: resolvedHp,
    max: maximumHp
  };
  await item.setFlag(MODULE_ID, "instance", instance);
  if (resolvedHp !== actorHp) await actor.update({ "system.attributes.hp.value": resolvedHp });
  for (const event of resolution.events) {
    if (event.type === "damage-reduction") await postHeldItemMessage(item, held, `Reduce el daño recibido en ${event.amount}.`);
    if (event.type === "air-balloon-popped") await postHeldItemMessage(item, held, "El Globo Helio se rompe al recibir daño y pierde su inmunidad a Tierra.");
    if (event.type === "focus-sash") await postHeldItemMessage(item, held, "La Banda Focus consume su carga y permite resistir con 1 PG.");
  }
  if (ejectButtonActivated) {
    await postHeldItemMessage(item, held, "Consume su carga y devuelve al portador con su entrenador.");
    await recallPokemon(item, { forced: true });
    return;
  }
  if (resolution.events.some(event => event.type === "air-balloon-popped")) await syncPokemonHeldItemToDeployment(item);
  if (kind === "deployed" && resolvedHp <= 0) await recallPokemon(item, { fainted: true });
}

/**
 * Lleva al actor desplegado (o al propio salvaje que contiene el Item) los PG y
 * características editados en la ficha, incluidos los obtenidos mediante un
 * avance de nivel. Sale pronto si ya coinciden para no reactivar el hook
 * contrario. La dispara el hook `updateItem` de main.mjs.
 */
export async function syncPokemonHpToDeployment(item) {
  const actor = item.parent?.documentName === "Actor" && item.parent.getFlag(MODULE_ID, "kind") === "wild"
    ? item.parent : deployedActorFor(item);
  if (!actor) return;
  const instance = item.getFlag(MODULE_ID, "instance") ?? {};
  const hp = instance.hp;
  if (!hp) return;
  const updates = {};
  const current = actor.system.attributes.hp;
  if (Number(current.value) !== Number(hp.value)) updates["system.attributes.hp.value"] = Number(hp.value) || 0;
  if (Number(current.max) !== Number(hp.max)) updates["system.attributes.hp.max"] = Number(hp.max) || 1;
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    const value = Number(instance.attributes?.[key]);
    if (Number.isFinite(value) && Number(actor.system.abilities?.[key]?.value) !== value) updates[`system.abilities.${key}.value`] = value;
  }
  if (Object.keys(updates).length) await actor.update(updates);
}

/**
 * Recalcula en el actor temporal los efectos persistentes del objeto equipado:
 * CA, iniciativa, movimiento, tipos/afinidades y la ficha descriptiva del
 * propio objeto. Se usa al equipar, consumir, romper, restaurar o expirar un
 * objeto sin retirar al Pokémon del mapa.
 */
export async function syncPokemonHeldItemToDeployment(item) {
  const actor = item.parent?.documentName === "Actor" && item.parent.getFlag(MODULE_ID, "kind") === "wild"
    ? item.parent : deployedActorFor(item);
  if (!actor) return;
  const species = item.getFlag(MODULE_ID, "species") ?? {};
  const instance = item.getFlag(MODULE_ID, "instance") ?? {};
  const held = instance.heldItem;
  const types = heldItemEffectiveTypes({
    sourceId: held?.sourceId, speciesId: species.id,
    baseTypes: species.type ?? [], abilities: instance.abilities ?? []
  });
  const adjustments = heldItemActorAdjustments({ sourceId: held?.sourceId, speciesId: species.id, charges: held?.charges, state: held?.state });
  const traits = damageTraitsForPokemonTypes(types);
  if (adjustments.groundImmunity && !traits.di.value.includes("ground")) traits.di.value.push("ground");
  applyAbilityDefenses(traits, instance.abilities);
  if (item.parent?.type === "character") applyTypeMasteryDefense(traits, item.parent, types);
  const movement = { walk: 0, fly: 0, swim: 0, burrow: 0, climb: 0, units: "ft", hover: false };
  for (const speed of species.speed ?? []) {
    const key = { walking: "walk", flying: "fly", swimming: "swim", burrowing: "burrow", climbing: "climb" }[speed.type];
    if (key) movement[key] = Math.max(movement[key], Number(speed.value) || 0);
    if (speed.type === "hover") { movement.hover = true; movement.fly = Math.max(movement.fly, Number(speed.value) || 0); }
  }
  if (adjustments.speed) {
    for (const key of ["walk", "fly", "swim", "burrow", "climb"]) if (movement[key] > 0) movement[key] += adjustments.speed;
  }
  await actor.update({
    "system.attributes.ac.calc": "flat",
    "system.attributes.ac.flat": (Number(instance.ac ?? species.ac) || 10) + adjustments.ac,
    "system.attributes.init.bonus": String(adjustments.initiative || ""),
    "system.attributes.movement": movement,
    "system.traits.dr": traits.dr,
    "system.traits.dv": traits.dv,
    "system.traits.di": traits.di,
    "system.details.type.custom": `Pokémon (${types.join(" / ")})`,
    [`flags.${MODULE_ID}.pokemonTypes`]: types,
    // Copia de instance.abilities para que el hook síncrono de damage-shields.mjs
    // (Multiescama/Escudo Sombra/Robustez, lote 9) pueda leerlas sin await; se
    // refresca aquí porque #removeAbility()/#onDrop() (pokemon-sheet.mjs) sí
    // pueden cambiar las habilidades conocidas después del despliegue, y
    // syncPokemonHeldItemToDeployment() ya se dispara en cualquier cambio de
    // `instance`, no solo en el objeto equipado.
    [`flags.${MODULE_ID}.pokemonAbilities`]: instance.abilities ?? []
  });
  const embedded = actor.items.filter(entry => entry.getFlag(MODULE_ID, "kind") === "held-item");
  if (embedded.length) await actor.deleteEmbeddedDocuments("Item", embedded.map(entry => entry.id));
  if (held) {
    await actor.createEmbeddedDocuments("Item", [{
      name: held.name,
      type: "feat",
      img: held.img || "icons/svg/item-bag.svg",
      system: { description: { value: `<p>${foundry.utils.escapeHTML(held.description ?? "")}</p>`, chat: "" } },
      flags: { [MODULE_ID]: { kind: "held-item", sourceId: held.sourceId } }
    }]);
  }
}

/**
 * Propaga el apodo al actor desplegado, a su token prototipo y a los tokens ya
 * colocados en cualquier escena. La llaman pokemon-sheet.mjs y trainer-team.mjs
 * al renombrar un Pokémon.
 */
export async function syncPokemonIdentityToDeployment(item) {
  const actor = deployedActorFor(item);
  if (!actor) return;
  const name = displayPokemonName(item);
  const actorName = deploymentActorName(item);
  const updates = {};
  if (actor.name !== actorName) updates.name = actorName;
  if (actor.prototypeToken.name !== name) updates["prototypeToken.name"] = name;
  if (Object.keys(updates).length) await actor.update(updates);
  for (const scene of game.scenes) {
    const tokenUpdates = scene.tokens
      .filter(token => token.actorId === actor.id && token.name !== name)
      .map(token => ({ _id: token.id, name }));
    if (tokenUpdates.length) await scene.updateEmbeddedDocuments("Token", tokenUpdates);
  }
}

/**
 * Borra el actor temporal que queda sin uso al eliminar un token, comprobando
 * antes que no le quede ninguno en ninguna escena. La dispara el hook
 * `deleteToken` de main.mjs.
 */
export async function cleanDeploymentActor(token) {
  const actor = game.actors.get(token.actorId);
  if (!actor || !["deployed", "wild"].includes(actor.getFlag(MODULE_ID, "kind"))) return;
  if (deploymentCleanup.has(actor.id)) return deploymentCleanup.get(actor.id);
  const stillUsed = game.scenes.some(scene => scene.tokens.some(sceneToken => sceneToken.actorId === actor.id));
  if (!stillUsed) await removeDeployment(actor, { deleteTokens: false });
}

/**
 * Elimina un actor temporal y, si se pide, sus tokens. Guarda la promesa en
 * deploymentCleanup para que las llamadas simultáneas —retirar, borrar el token
 * y capturar pueden coincidir— compartan un único borrado. La usan
 * recallPokemon(), cleanDeploymentActor() y capture.mjs.
 */
export async function removeDeployment(actor, { deleteTokens }) {
  const current = deploymentCleanup.get(actor.id);
  if (current) return current;
  const cleanup = Promise.resolve().then(async () => {
    if (deleteTokens) {
      for (const scene of game.scenes) {
        const tokenIds = scene.tokens.filter(token => token.actorId === actor.id).map(token => token.id);
        if (tokenIds.length) await scene.deleteEmbeddedDocuments("Token", tokenIds);
      }
    }
    if (game.actors.has(actor.id)) await actor.delete();
  });
  deploymentCleanup.set(actor.id, cleanup);
  try {
    await cleanup;
  } finally {
    deploymentCleanup.delete(actor.id);
  }
}

/**
 * Token del entrenador en la escena activa, dando preferencia al seleccionado.
 * Es el origen desde el que deployPokemon() mide el alcance de despliegue.
 */
function trainerTokenFor(trainer) {
  const tokens = canvas.tokens?.placeables?.filter(token => token.actor?.id === trainer.id) ?? [];
  return tokens.find(token => token.controlled) ?? tokens[0] ?? null;
}

/**
 * Primer token de un actor temporal en cualquier escena. deployPokemon() lo usa
 * para detectar que el Pokémon ya está en el mapa, aunque sea en otra escena.
 */
function deployedTokenFor(actor) {
  for (const scene of game.scenes) {
    const token = scene.tokens.find(candidate => candidate.actorId === actor.id);
    if (token) return token;
  }
  return null;
}

/**
 * Pide al usuario la casilla de salida: resalta el área válida con
 * highlightDeploymentArea() y devuelve una promesa que se resuelve con la
 * posición elegida, o con null si cancela (Escape, clic derecho o cambio de
 * escena). Limpia siempre resaltado y escuchas. Solo la usa deployPokemon().
 */
function chooseDeploymentPosition(trainerToken, tokenData, pokemonName) {
  const highlightName = `${MODULE_ID}-deploy-${foundry.utils.randomID()}`;
  const gridLayer = canvas.interface?.grid;
  gridLayer?.addHighlightLayer?.(highlightName);
  highlightDeploymentArea(highlightName, trainerToken, tokenData);
  ui.notifications.info(localizeFormat("POKE5E.Deployment.ChoosePosition", { pokemon: pokemonName, range: DEPLOY_RANGE }, `Elige en el mapa dónde aparece ${pokemonName}.`));
  return new Promise(resolve => {
    let settled = false;
    let canvasTearDownHook;
    const finish = position => {
      if (settled) return;
      settled = true;
      canvas.stage.off("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      if (canvasTearDownHook) Hooks.off("canvasTearDown", canvasTearDownHook);
      gridLayer?.destroyHighlightLayer?.(highlightName);
      resolve(position);
    };
    const onKeyDown = event => {
      if (event.key === "Escape") finish(null);
    };
    const onPointerDown = event => {
      const button = event.button ?? event.nativeEvent?.button ?? 0;
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      if (button === 2) {
        return finish(null);
      }
      if (button !== 0) return;
      const point = canvas.stage.toLocal(event.global);
      const position = deploymentPosition(point, tokenData);
      if (!isAllowedDeployment(position, trainerToken, tokenData)) {
        ui.notifications.warn(localizeFormat("POKE5E.Deployment.InvalidPosition", { range: DEPLOY_RANGE }, `Elige una casilla libre a no más de ${DEPLOY_RANGE} pies del entrenador.`));
        return;
      }
      finish({ x: position.x, y: position.y });
    };
    document.addEventListener("keydown", onKeyDown);
    canvas.stage.on("pointerdown", onPointerDown);
    canvasTearDownHook = Hooks.once("canvasTearDown", () => finish(null));
  });
}

/**
 * Pinta en la rejilla las casillas donde cabe el Pokémon, recorriendo el entorno
 * del entrenador y filtrando con isAllowedDeployment().
 * Auxiliar visual de chooseDeploymentPosition().
 */
function highlightDeploymentArea(name, trainerToken, tokenData) {
  const gridLayer = canvas.interface?.grid;
  if (!gridLayer?.highlightPosition) return;
  const steps = Math.ceil(DEPLOY_RANGE / Math.max(Number(canvas.grid.distance) || 5, 1)) + 2;
  const seen = new Set();
  for (let dx = -steps; dx <= steps; dx++) {
    for (let dy = -steps; dy <= steps; dy++) {
      const point = { x: trainerToken.center.x + (dx * canvas.grid.sizeX), y: trainerToken.center.y + (dy * canvas.grid.sizeY) };
      const position = deploymentPosition(point, tokenData);
      const key = `${position.x}:${position.y}`;
      if (seen.has(key) || !isAllowedDeployment(position, trainerToken, tokenData)) continue;
      seen.add(key);
      gridLayer.highlightPosition(name, { x: position.x, y: position.y, color: 0x2e6fbb, alpha: 0.38 });
    }
  }
}

/**
 * Convierte un punto del lienzo en la esquina superior izquierda del token,
 * ajustándolo a la rejilla o centrándolo si la escena no tiene.
 * La usan chooseDeploymentPosition(), highlightDeploymentArea() y
 * validate-deployment.mjs.
 */
export function deploymentPosition(point, tokenData) {
  if (canvas.grid.isGridless) {
    const width = Number(tokenData.width ?? 1) * canvas.grid.sizeX;
    const height = Number(tokenData.height ?? 1) * canvas.grid.sizeY;
    return { x: Math.round(point.x - (width / 2)), y: Math.round(point.y - (height / 2)) };
  }
  const topLeft = canvas.grid.getTopLeftPoint(point);
  return { x: Math.round(topLeft.x), y: Math.round(topLeft.y) };
}

/**
 * Comprueba las tres condiciones de una casilla de salida: estar dentro de
 * DEPLOY_RANGE, caber entera en la escena y no solaparse con otro token
 * (rectanglesOverlap()). La comparten el resaltado y la validación del clic.
 */
export function isAllowedDeployment(position, trainerToken, tokenData) {
  const width = Number(tokenData.width ?? 1) * canvas.grid.sizeX;
  const height = Number(tokenData.height ?? 1) * canvas.grid.sizeY;
  const center = { x: position.x + (width / 2), y: position.y + (height / 2) };
  const distance = canvas.grid.measurePath([trainerToken.center, center]).distance;
  if (distance > DEPLOY_RANGE) return false;
  const sceneRect = canvas.dimensions?.sceneRect;
  if (sceneRect && (!sceneRect.contains(position.x, position.y) || !sceneRect.contains(position.x + width - 1, position.y + height - 1))) return false;
  return !canvas.tokens.placeables.some(token => rectanglesOverlap(
    { x: position.x, y: position.y, width, height },
    { x: token.document.x, y: token.document.y, width: token.w, height: token.h }
  ));
}

/** Intersección de dos rectángulos. Auxiliar geométrico de isAllowedDeployment(). */
function rectanglesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Traduce un Item Pokémon al actor NPC de D&D 5e que se usará en combate:
 * características y salvaciones, velocidades y sentidos, CA y PG de la
 * instancia, tamaño y escala del token, afinidades de
 * damageTraitsForPokemonTypes(), sprite (shiny incluido), movimientos y objeto
 * equipado como Items, estados activos vía pokemonStatusEffectSource(), permisos
 * heredados del entrenador y el bono por especialización de tipo. Antes de
 * construirlo aplica tipos, CA, iniciativa, inmunidad y movimiento derivados
 * del objeto mediante held-items.mjs. Deja en los flags el enlace de vuelta al
 * Item y al entrenador. Solo la usa deployPokemon(); wild-deployment.mjs tiene
 * su equivalente para los salvajes.
 */
async function deployedActorSource(pokemonItem) {
  const data = await loadPoke5eData();
  const trainer = pokemonItem.parent;
  const species = pokemonItem.getFlag(MODULE_ID, "species");
  const instance = pokemonItem.getFlag(MODULE_ID, "instance");
  const effectiveTypes = heldItemEffectiveTypes({
    sourceId: instance.heldItem?.sourceId, speciesId: species.id,
    baseTypes: species.type ?? [], abilities: instance.abilities ?? []
  });
  const heldAdjustments = heldItemActorAdjustments({
    sourceId: instance.heldItem?.sourceId, speciesId: species.id, charges: instance.heldItem?.charges, state: instance.heldItem?.state
  });
  const pokemonAttributes = instance.attributes ?? species.attributes ?? {};
  const abilities = {};
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    abilities[key] = {
      value: (Number(pokemonAttributes[key]) || 10) + aceTrainerAbilityBonus(trainer, key),
      proficient: species.savingThrows?.includes(key) || (key === "wis" && hasTrainerPath(trainer, "guru", 5)) ? 1 : 0
    };
  }
  // Competencias "de fábrica" de la especie (species.skills, en inglés en los
  // datos de origen) más, si aplica, Multitalento (Hobbyist 15): competencia
  // adicional elegida para este Pokémon en concreto (instance.multitalentSkill,
  // un desplegable en su propia ficha) — puede ser distinta para cada uno, tal
  // como pide el texto, porque se guarda por Pokémon y no por entrenador.
  const skills = {};
  for (const name of species.skills ?? []) {
    const key = speciesSkillKey(name);
    if (key) skills[key] = { value: 1 };
  }
  if (hasTrainerPath(trainer, "hobbyist", 15) && instance.multitalentSkill) skills[instance.multitalentSkill] = { value: 1 };
  const movement = { walk: 0, fly: 0, swim: 0, burrow: 0, climb: 0, units: "ft", hover: false };
  for (const speed of species.speed ?? []) {
    const key = { walking: "walk", flying: "fly", swimming: "swim", burrowing: "burrow", climbing: "climb" }[speed.type];
    if (key) movement[key] = Math.max(movement[key], Number(speed.value) || 0);
    if (speed.type === "hover") { movement.hover = true; movement.fly = Math.max(movement.fly, Number(speed.value) || 0); }
  }
  if (heldAdjustments.speed) {
    for (const key of ["walk", "fly", "swim", "burrow", "climb"]) if (movement[key] > 0) movement[key] += heldAdjustments.speed;
  }
  const senseRanges = { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 };
  for (const sense of species.senses ?? []) {
    const key = sense.type === "tremmorsense" ? "tremorsense" : sense.type;
    if (key in senseRanges) senseRanges[key] = Math.max(Number(senseRanges[key]) || 0, Number(sense.value) || 0);
  }
  const tokenSize = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 }[species.size] ?? 1;
  const size = { tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" }[species.size] ?? "med";
  const damageTraits = damageTraitsForPokemonTypes(effectiveTypes);
  if (heldAdjustments.groundImmunity && !damageTraits.di.value.includes("ground")) damageTraits.di.value.push("ground");
  applyAbilityDefenses(damageTraits, instance.abilities);
  if (trainer?.type === "character") applyTypeMasteryDefense(damageTraits, trainer, effectiveTypes);
  const trainerSpecialization = trainer.getFlag(MODULE_ID, "trainerCreation")?.specialization;
  const specializationBonus = effectiveTypes.includes(trainerSpecialization) ? 1 : 0;
  const moveItems = (instance.moves ?? []).map(entry => data.movesById.get(entry.moveId)).filter(Boolean).map(move => ({
    name: move.name,
    type: "feat",
    img: "icons/svg/sword.svg",
    system: { description: { value: (move.description ?? []).map(text => `<p>${foundry.utils.escapeHTML(text)}</p>`).join(""), chat: "" } },
    flags: { [MODULE_ID]: { kind: "move", sourceId: move.id, move } }
  }));
  const heldItem = instance.heldItem ? {
    name: instance.heldItem.name,
    type: "feat",
    img: instance.heldItem.img || "icons/svg/item-bag.svg",
    system: { description: { value: `<p>${foundry.utils.escapeHTML(instance.heldItem.description ?? "")}</p>`, chat: "" } },
    flags: { [MODULE_ID]: { kind: "held-item", sourceId: instance.heldItem.sourceId } }
  } : null;
  const statusEffects = (instance.conditions ?? []).map(id => pokemonStatusEffectSource(id)).filter(Boolean);
  return {
    name: deploymentActorName(pokemonItem),
    type: "npc",
    img: portraitUrl(species, instance.shiny),
    ownership: foundry.utils.deepClone(trainer.ownership),
    prototypeToken: {
      name: displayPokemonName(pokemonItem), actorLink: true, disposition: Number.isFinite(Number(trainer.prototypeToken?.disposition)) ? Number(trainer.prototypeToken.disposition) : 1, displayName: 20,
      rotation: 0,
      width: tokenSize, height: tokenSize,
      texture: {
        src: remoteAssetUrl(instance.shiny ? species.media?.spriteShiny : species.media?.sprite) || portraitUrl(species, instance.shiny),
        scaleX: POKEMON_TOKEN_SCALE,
        scaleY: POKEMON_TOKEN_SCALE
      }
    },
    system: {
      abilities,
      skills,
      bonuses: { abilities: { check: "", save: "", skill: specializationBonus ? String(specializationBonus) : "" } },
      attributes: {
        ac: { calc: "flat", flat: (Number(instance.ac) || Number(species.ac) || 10) + heldAdjustments.ac },
        init: { bonus: String(heldAdjustments.initiative || "") },
        hp: { value: Number(instance.hp?.value) || 0, max: Number(instance.hp?.max) || Number(species.hp) || 1 },
        movement,
        senses: { ranges: senseRanges, units: "ft", special: "" }
      },
      details: {
        cr: Math.min(Number(species.sr) || 0, 30),
        type: { value: "custom", custom: `Pokémon (${effectiveTypes.join(" / ")})` },
        biography: { value: `<p>${foundry.utils.escapeHTML(species.description ?? "")}</p>` }
      },
      traits: { size, ...damageTraits }
    },
    items: heldItem ? [...moveItems, heldItem] : moveItems,
    effects: statusEffects,
    flags: {
      core: { sheetClass: `${MODULE_ID}.Poke5eCombatPokemonActorSheet` },
      [MODULE_ID]: {
        kind: "deployed",
        pokemonItemUuid: pokemonItem.uuid,
        trainerUuid: trainer.uuid,
        speciesId: species.id,
        pokemonTypes: effectiveTypes,
        // Ver el comentario junto a `pokemonAbilities` en syncPokemonHeldItemToDeployment().
        pokemonAbilities: instance.abilities ?? []
      }
    }
  };
}
