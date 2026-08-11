import { MODULE_ID, displayPokemonName, portraitUrl, remoteAssetUrl } from "./model.mjs";
import { loadPoke5eData } from "./data-service.mjs";

export function deployedActorFor(pokemonItem) {
  return game.actors.find(actor => actor.getFlag(MODULE_ID, "kind") === "deployed" && actor.getFlag(MODULE_ID, "pokemonItemUuid") === pokemonItem.uuid);
}

export async function deployPokemon(pokemonItem) {
  if (!canvas?.ready || !canvas.scene) return ui.notifications.warn("Abre una escena antes de desplegar un Pokémon.");
  const existing = deployedActorFor(pokemonItem);
  if (existing) {
    existing.sheet.render(true);
    return existing;
  }
  const trainer = pokemonItem.parent;
  if (!trainer?.isOwner) return ui.notifications.warn("No tienes permiso para desplegar este Pokémon.");
  const source = await deployedActorSource(pokemonItem);
  const actor = await Actor.create(source);
  try {
    const x = Math.round((canvas.stage?.pivot?.x ?? 0) / canvas.grid.size) * canvas.grid.size;
    const y = Math.round((canvas.stage?.pivot?.y ?? 0) / canvas.grid.size) * canvas.grid.size;
    const token = await actor.getTokenDocument({ x, y });
    await canvas.scene.createEmbeddedDocuments("Token", [token.toObject()]);
    ui.notifications.info(`${displayPokemonName(pokemonItem)} ha salido al combate.`);
    return actor;
  } catch (error) {
    await actor.delete();
    throw error;
  }
}

export async function recallPokemon(pokemonItem) {
  const actor = deployedActorFor(pokemonItem);
  if (!actor) return;
  for (const scene of game.scenes) {
    const tokens = scene.tokens.filter(token => token.actorId === actor.id);
    if (tokens.length) await scene.deleteEmbeddedDocuments("Token", tokens.map(token => token.id));
  }
  if (game.actors.has(actor.id)) await actor.delete();
  ui.notifications.info(`${displayPokemonName(pokemonItem)} ha vuelto con su entrenador.`);
}

export async function syncDeploymentHp(actor) {
  if (actor.getFlag(MODULE_ID, "kind") !== "deployed") return;
  const uuid = actor.getFlag(MODULE_ID, "pokemonItemUuid");
  const item = await fromUuid(uuid);
  if (!item) return;
  const instance = foundry.utils.deepClone(item.getFlag(MODULE_ID, "instance"));
  instance.hp = {
    value: Number(actor.system.attributes.hp.value) || 0,
    max: Number(actor.system.attributes.hp.max) || instance.hp.max
  };
  await item.setFlag(MODULE_ID, "instance", instance);
}

export async function syncPokemonHpToDeployment(item) {
  const actor = deployedActorFor(item);
  if (!actor) return;
  const hp = item.getFlag(MODULE_ID, "instance")?.hp;
  if (!hp) return;
  const current = actor.system.attributes.hp;
  if (Number(current.value) === Number(hp.value) && Number(current.max) === Number(hp.max)) return;
  await actor.update({ "system.attributes.hp.value": Number(hp.value) || 0, "system.attributes.hp.max": Number(hp.max) || 1 });
}

export async function cleanDeploymentActor(token) {
  const actor = game.actors.get(token.actorId);
  if (!actor || actor.getFlag(MODULE_ID, "kind") !== "deployed") return;
  const stillUsed = game.scenes.some(scene => scene.tokens.some(sceneToken => sceneToken.actorId === actor.id));
  if (!stillUsed) await actor.delete();
}

async function deployedActorSource(pokemonItem) {
  const data = await loadPoke5eData();
  const trainer = pokemonItem.parent;
  const species = pokemonItem.getFlag(MODULE_ID, "species");
  const instance = pokemonItem.getFlag(MODULE_ID, "instance");
  const abilities = {};
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    abilities[key] = { value: Number(species.attributes?.[key]) || 10, proficient: species.savingThrows?.includes(key) ? 1 : 0 };
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
  const moveItems = (instance.moves ?? []).map(entry => data.movesById.get(entry.moveId)).filter(Boolean).map(move => ({
    name: move.name,
    type: "feat",
    img: "icons/svg/sword.svg",
    system: { description: { value: (move.description ?? []).map(text => `<p>${foundry.utils.escapeHTML(text)}</p>`).join(""), chat: "" } },
    flags: { [MODULE_ID]: { kind: "move", sourceId: move.id, move } }
  }));
  return {
    name: `${displayPokemonName(pokemonItem)} [En combate]`,
    type: "npc",
    img: portraitUrl(species),
    ownership: foundry.utils.deepClone(trainer.ownership),
    prototypeToken: {
      name: displayPokemonName(pokemonItem), actorLink: true, disposition: 1, displayName: 20,
      width: tokenSize, height: tokenSize,
      texture: { src: remoteAssetUrl(species.media?.sprite) || portraitUrl(species) }
    },
    system: {
      abilities,
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
      traits: { size }
    },
    items: moveItems,
    flags: {
      [MODULE_ID]: {
        kind: "deployed",
        pokemonItemUuid: pokemonItem.uuid,
        trainerUuid: trainer.uuid,
        speciesId: species.id
      }
    }
  };
}
