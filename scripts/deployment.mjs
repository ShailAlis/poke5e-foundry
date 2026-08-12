import { MODULE_ID, POKEMON_TOKEN_SCALE, displayPokemonName, portraitUrl, remoteAssetUrl } from "./model.mjs";
import { loadPoke5eData } from "./data-service.mjs";
import { damageTraitsForPokemonTypes } from "./combat.mjs";

const DEPLOY_RANGE = 10;
const deploymentCleanup = new Map();

export function deployedActorFor(pokemonItem) {
  return game.actors.find(actor => actor.getFlag(MODULE_ID, "kind") === "deployed" && actor.getFlag(MODULE_ID, "pokemonItemUuid") === pokemonItem.uuid);
}

export async function deployPokemon(pokemonItem) {
  if (!canvas?.ready || !canvas.scene) return ui.notifications.warn("Abre una escena antes de desplegar un Pokémon.");
  const trainer = pokemonItem.parent;
  if (!trainer?.isOwner) return ui.notifications.warn("No tienes permiso para desplegar este Pokémon.");
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

export async function recallPokemon(pokemonItem) {
  const actor = deployedActorFor(pokemonItem);
  if (!actor) return;
  await removeDeployment(actor, { deleteTokens: true });
  ui.notifications.info(`${displayPokemonName(pokemonItem)} ha vuelto con su entrenador.`);
}

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
}

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

export async function cleanDeploymentActor(token) {
  const actor = game.actors.get(token.actorId);
  if (!actor || !["deployed", "wild"].includes(actor.getFlag(MODULE_ID, "kind"))) return;
  if (deploymentCleanup.has(actor.id)) return deploymentCleanup.get(actor.id);
  const stillUsed = game.scenes.some(scene => scene.tokens.some(sceneToken => sceneToken.actorId === actor.id));
  if (!stillUsed) await removeDeployment(actor, { deleteTokens: false });
}

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

function trainerTokenFor(trainer) {
  const tokens = canvas.tokens?.placeables?.filter(token => token.actor?.id === trainer.id) ?? [];
  return tokens.find(token => token.controlled) ?? tokens[0] ?? null;
}

function deployedTokenFor(actor) {
  for (const scene of game.scenes) {
    const token = scene.tokens.find(candidate => candidate.actorId === actor.id);
    if (token) return token;
  }
  return null;
}

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

export function deploymentPosition(point, tokenData) {
  if (canvas.grid.isGridless) {
    const width = Number(tokenData.width ?? 1) * canvas.grid.sizeX;
    const height = Number(tokenData.height ?? 1) * canvas.grid.sizeY;
    return { x: Math.round(point.x - (width / 2)), y: Math.round(point.y - (height / 2)) };
  }
  const topLeft = canvas.grid.getTopLeftPoint(point);
  return { x: Math.round(topLeft.x), y: Math.round(topLeft.y) };
}

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

function rectanglesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

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
  return {
    name: `${displayPokemonName(pokemonItem)} [En combate]`,
    type: "npc",
    img: portraitUrl(species, instance.shiny),
    ownership: foundry.utils.deepClone(trainer.ownership),
    prototypeToken: {
      name: displayPokemonName(pokemonItem), actorLink: true, disposition: Number.isFinite(Number(trainer.prototypeToken?.disposition)) ? Number(trainer.prototypeToken.disposition) : 1, displayName: 20,
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
