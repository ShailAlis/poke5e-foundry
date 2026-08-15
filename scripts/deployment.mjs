/**
 * Despliegue de los Pokémon del equipo en el mapa. Traduce un Item Pokémon a un
 * actor NPC temporal con su token, controla dónde puede aparecer, mantiene
 * sincronizados PG y nombre en ambos sentidos y borra el actor al retirarlo.
 *
 * Sus funciones de sincronización las disparan los hooks de main.mjs; las de
 * desplegar y retirar, los botones de trainer-team.mjs, trainer-actor-sheet.mjs
 * y pokemon-sheet.mjs. wild-deployment.mjs hace lo propio con los salvajes, que
 * no proceden de ningún entrenador.
 */
import { MODULE_ID, POKEMON_TOKEN_SCALE, displayPokemonName, portraitUrl, remoteAssetUrl } from "./model.mjs";
import { loadPoke5eData } from "./data-service.mjs";
import { damageTraitsForPokemonTypes } from "./combat.mjs";
import { pokemonStatusEffectSource } from "./status-effects.mjs";

/** Distancia máxima, en pies, entre el entrenador y la casilla de salida. */
const DEPLOY_RANGE = 10;
/** Borrados en curso por id de actor; evita que removeDeployment() se solape consigo mismo. */
const deploymentCleanup = new Map();
/** Último movimiento registrado por token; permite descartar los enderezados obsoletos. */
const uprightMovements = new Map();

/**
 * Devuelve a la vertical los tokens Pokémon que Foundry rota al moverlos,
 * esperando a que termine la animación y descartando el ajuste si entretanto ha
 * empezado otro movimiento (marcador en uprightMovements).
 * La llama el hook `init` de main.mjs.
 */
export function registerPokemonTokenMovement() {
  Hooks.on("moveToken", (token, movement, operation, user) => {
    if (user?.id !== game.user.id || !["deployed", "wild"].includes(token.actor?.getFlag(MODULE_ID, "kind"))) return;
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
 * Busca el actor temporal de un Pokémon desplegado por el UUID de su Item.
 * Vínculo entre ficha y mapa: lo usan casi todas las funciones del archivo,
 * además de pokemon-sheet.mjs, trainer-team.mjs y trainer-actor-sheet.mjs para
 * saber si ya está en el mapa.
 */
export function deployedActorFor(pokemonItem) {
  return game.actors.find(actor => actor.getFlag(MODULE_ID, "kind") === "deployed" && actor.getFlag(MODULE_ID, "pokemonItemUuid") === pokemonItem.uuid);
}

/**
 * Saca un Pokémon al mapa. Exige escena abierta, permisos, que conserve PG y
 * que el token del entrenador esté presente; si ya estaba desplegado se limita a seleccionarlo y centrar la vista.
 * Si no, crea el actor con deployedActorSource(), pide la casilla con
 * chooseDeploymentPosition() y coloca el token, deshaciendo el actor recién
 * creado ante cualquier error. Su inversa es recallPokemon().
 */
export async function deployPokemon(pokemonItem) {
  if (!canvas?.ready || !canvas.scene) return ui.notifications.warn("Abre una escena antes de desplegar un Pokémon.");
  const trainer = pokemonItem.parent;
  if (!trainer?.isOwner) return ui.notifications.warn("No tienes permiso para desplegar este Pokémon.");
  const instance = pokemonItem.getFlag(MODULE_ID, "instance");
  if (Number(instance?.hp?.value) <= 0) return ui.notifications.warn(`${displayPokemonName(pokemonItem)} está debilitado y no puede salir al combate.`);
  const trainerToken = trainerTokenFor(trainer);
  if (!trainerToken) return ui.notifications.warn("Coloca el token del entrenador en la escena antes de sacar un Pokémon.");
  let actor = deployedActorFor(pokemonItem);
  const deployedToken = actor ? deployedTokenFor(actor) : null;
  if (deployedToken) {
    if (deployedToken.parent?.id !== canvas.scene.id) return ui.notifications.warn(`${displayPokemonName(pokemonItem)} ya está desplegado en otra escena.`);
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
    ui.notifications.info(`${displayPokemonName(pokemonItem)} ha salido al combate.`);
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
export async function recallPokemon(pokemonItem, { fainted = false } = {}) {
  const actor = deployedActorFor(pokemonItem);
  if (!actor) return;
  await removeDeployment(actor, { deleteTokens: true });
  ui.notifications.info(fainted
    ? `${displayPokemonName(pokemonItem)} ha caído debilitado y ha vuelto con su entrenador.`
    : `${displayPokemonName(pokemonItem)} ha vuelto con su entrenador.`);
}

/**
 * Copia los PG del actor desplegado o salvaje al Item del Pokémon. Antes aplica
 * la Banda Focus: si el golpe lo dejaría a 0 PG y le queda carga, lo deja en 1 y
 * gasta el objeto. Si un Pokémon desplegado queda a 0 PG, guarda ese estado y lo
 * devuelve a su entrenador. La dispara el hook `updateActor` de main.mjs; el
 * sentido contrario lo cubre syncPokemonHpToDeployment().
 */
export async function syncDeploymentHp(actor) {
  const kind = actor.getFlag(MODULE_ID, "kind");
  if (!["deployed", "wild"].includes(kind)) return;
  const uuid = actor.getFlag(MODULE_ID, "pokemonItemUuid");
  const item = uuid ? await fromUuid(uuid) : actor.items.find(entry => entry.getFlag(MODULE_ID, "kind") === "pokemon");
  if (!item) return;
  const instance = foundry.utils.deepClone(item.getFlag(MODULE_ID, "instance"));
  const actorHp = Number(actor.system.attributes.hp.value) || 0;
  if (actorHp <= 0 && Number(instance.hp?.value) > 0 && instance.heldItem?.sourceId === "focus-sash" && Number(instance.heldItem.charges) > 0) {
    instance.heldItem.charges = 0;
    instance.hp = { value: 1, max: Number(actor.system.attributes.hp.max) || instance.hp.max };
    await item.setFlag(MODULE_ID, "instance", instance);
    await actor.update({ "system.attributes.hp.value": 1 });
    await ChatMessage.create({ content: `<div class="dnd5e chat-card"><p><strong>${foundry.utils.escapeHTML(displayPokemonName(item))}</strong> resiste con 1 PG gracias a su Banda Focus. Su carga se ha consumido.</p></div>` });
    return;
  }
  instance.hp = {
    value: actorHp,
    max: Number(actor.system.attributes.hp.max) || instance.hp.max
  };
  await item.setFlag(MODULE_ID, "instance", instance);
  if (kind === "deployed" && actorHp <= 0) await recallPokemon(item, { fainted: true });
}

/**
 * Lleva al actor desplegado (o al propio salvaje que contiene el Item) los PG
 * editados en la ficha, saliendo pronto si ya coinciden para no reactivar el
 * hook contrario. La dispara el hook `updateItem` de main.mjs.
 */
export async function syncPokemonHpToDeployment(item) {
  const actor = item.parent?.documentName === "Actor" && item.parent.getFlag(MODULE_ID, "kind") === "wild"
    ? item.parent : deployedActorFor(item);
  if (!actor) return;
  const hp = item.getFlag(MODULE_ID, "instance")?.hp;
  if (!hp) return;
  const current = actor.system.attributes.hp;
  if (Number(current.value) === Number(hp.value) && Number(current.max) === Number(hp.max)) return;
  await actor.update({ "system.attributes.hp.value": Number(hp.value) || 0, "system.attributes.hp.max": Number(hp.max) || 1 });
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
  const actorName = `${name} [En combate]`;
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
  ui.notifications.info(`Elige en el mapa dónde aparece ${pokemonName}. Debe estar a un máximo de ${DEPLOY_RANGE} pies del entrenador. Pulsa Escape o haz clic derecho para cancelar.`);
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
        ui.notifications.warn(`Elige una casilla libre a no más de ${DEPLOY_RANGE} pies del entrenador.`);
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
 * heredados del entrenador y el bono por especialización de tipo. Deja en los
 * flags el enlace de vuelta al Item y al entrenador. Solo la usa deployPokemon();
 * wild-deployment.mjs tiene su equivalente para los salvajes.
 */
async function deployedActorSource(pokemonItem) {
  const data = await loadPoke5eData();
  const trainer = pokemonItem.parent;
  const species = pokemonItem.getFlag(MODULE_ID, "species");
  const instance = pokemonItem.getFlag(MODULE_ID, "instance");
  const pokemonAttributes = instance.attributes ?? species.attributes ?? {};
  const abilities = {};
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    abilities[key] = { value: Number(pokemonAttributes[key]) || 10, proficient: species.savingThrows?.includes(key) ? 1 : 0 };
  }
  const movement = { walk: 0, fly: 0, swim: 0, burrow: 0, climb: 0, units: "ft", hover: false };
  for (const speed of species.speed ?? []) {
    const key = { walking: "walk", flying: "fly", swimming: "swim", burrowing: "burrow", climbing: "climb" }[speed.type];
    if (key) movement[key] = Math.max(movement[key], Number(speed.value) || 0);
    if (speed.type === "hover") { movement.hover = true; movement.fly = Math.max(movement.fly, Number(speed.value) || 0); }
  }
  const senseRanges = { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 };
  for (const sense of species.senses ?? []) {
    const key = sense.type === "tremmorsense" ? "tremorsense" : sense.type;
    if (key in senseRanges) senseRanges[key] = Math.max(Number(senseRanges[key]) || 0, Number(sense.value) || 0);
  }
  const tokenSize = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 }[species.size] ?? 1;
  const size = { tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" }[species.size] ?? "med";
  const damageTraits = damageTraitsForPokemonTypes(species.type);
  const trainerSpecialization = trainer.getFlag(MODULE_ID, "trainerCreation")?.specialization;
  const specializationBonus = (species.type ?? []).includes(trainerSpecialization) ? 1 : 0;
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
    name: `${displayPokemonName(pokemonItem)} [En combate]`,
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
      bonuses: { abilities: { check: "", save: "", skill: specializationBonus ? String(specializationBonus) : "" } },
      attributes: {
        ac: { calc: "flat", flat: Number(instance.ac) || Number(species.ac) || 10 },
        hp: { value: Number(instance.hp?.value) || 0, max: Number(instance.hp?.max) || Number(species.hp) || 1 },
        movement,
        senses: { ranges: senseRanges, units: "ft", special: "" }
      },
      details: {
        cr: Math.min(Number(species.sr) || 0, 30),
        type: { value: "custom", custom: `Pokémon (${(species.type ?? []).join(" / ")})` },
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
        pokemonTypes: species.type ?? []
      }
    }
  };
}
