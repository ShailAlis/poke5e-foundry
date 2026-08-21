/**
 * Despliegue de Pokémon salvajes en el mapa. A diferencia de deployment.mjs, el
 * salvaje no procede de ningún entrenador: su Item Pokémon vive embebido en el
 * propio actor temporal, que nace hostil, sin dueño y marcado como capturable.
 *
 * Lo usan encounter-builder.mjs al desplegar un encuentro y npc-trainer-actor.mjs,
 * que reaprovecha chooseTokenPosition() para colocar al Entrenador NPC.
 * capture.mjs es quien después convierte al salvaje en Pokémon del entrenador.
 */
import { damageTraitsForPokemonTypes } from "../combat/combat.mjs";
import { applyAbilityDefenses } from "../pokemon/pokemon-abilities.mjs";
import { speciesSkillKey } from "../trainer/trainer-creation-data.mjs";
import { loadPoke5eData } from "../core/data-service.mjs";
import { buildWildInstance } from "./encounter-generator.mjs";
import { MODULE_ID, POKEMON_TOKEN_SCALE, portraitUrl, remoteAssetUrl } from "../core/model.mjs";
import { pokemonStatusEffectSource } from "../combat/status-effects.mjs";

/**
 * Crea y coloca un Pokémon salvaje en la escena activa (solo director): genera
 * su instancia con buildWildInstance() (encounter-generator.mjs), arma el actor
 * con wildActorSource(), pide la casilla con chooseWildPosition() y guarda en un
 * flag el UUID del Item interno para que capture.mjs y status-effects.mjs lo
 * localicen. Si algo falla tras crear el actor, lo borra.
 */
export async function deployWildPokemon(species, level, { encounterId = "" } = {}) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("POKE5E.WildDeployment.GMOnly"));
  if (!canvas?.ready || !canvas.scene) return ui.notifications.warn(game.i18n.localize("POKE5E.WildDeployment.OpenScene"));
  const data = await loadPoke5eData();
  const instance = buildWildInstance(species, data.movesById, {
    level,
    idFactory: () => foundry.utils.randomID()
  });
  const source = wildActorSource(species, instance, data.movesById, encounterId);
  const position = await chooseWildPosition(source.prototypeToken, species.name);
  if (!position) return null;
  const actor = await Actor.create(source, { renderSheet: false });
  try {
    const pokemonItem = actor.items.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon");
    if (!pokemonItem) throw new Error("No se pudo crear la ficha interna del Pokémon salvaje.");
    await actor.setFlag(MODULE_ID, "pokemonItemUuid", pokemonItem.uuid);
    const token = await actor.getTokenDocument(position);
    const [createdToken] = await canvas.scene.createEmbeddedDocuments("Token", [token.toObject()]);
    createdToken?.object?.control({ releaseOthers: true });
    ui.notifications.info(game.i18n.format("POKE5E.WildDeployment.Appeared", { pokemon: species.name }));
    return actor;
  } catch (error) {
    if (game.actors.has(actor.id)) await actor.delete();
    throw error;
  }
}

/**
 * Construye el actor NPC de un salvaje: características y salvaciones,
 * velocidades (prepareMovement()) y sentidos (prepareSenses()), CA y PG de la
 * instancia, tamaño y sprite, afinidades de damageTraitsForPokemonTypes(),
 * estados activos y, como Items, su ficha Pokémon y sus movimientos. Nace hostil
 * y sin dueño, con `kind: "wild"` y `capturable: true`. Equivalente de
 * deployedActorSource() (deployment.mjs); validate-deployment.mjs la comprueba.
 */
export function wildActorSource(species, instance, movesById, encounterId = "") {
  const abilities = {};
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    abilities[key] = {
      value: Number(instance.attributes?.[key]) || Number(species.attributes?.[key]) || 10,
      proficient: species.savingThrows?.includes(key) ? 1 : 0
    };
  }
  const skills = {};
  for (const name of species.skills ?? []) {
    const key = speciesSkillKey(name);
    if (key) skills[key] = { value: 1 };
  }
  const movement = prepareMovement(species.speed);
  const senses = prepareSenses(species.senses);
  const damageTraits = damageTraitsForPokemonTypes(species.type);
  applyAbilityDefenses(damageTraits, instance.abilities);
  const tokenSize = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 }[species.size] ?? 1;
  const size = { tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" }[species.size] ?? "med";
  const pokemonItem = {
    name: species.name,
    type: "feat",
    img: portraitUrl(species),
    system: { description: { value: `<p>${escapeHtml(species.description ?? "")}</p>`, chat: "" } },
    flags: { [MODULE_ID]: { kind: "pokemon", sourceId: species.id, species, instance } }
  };
  const moveItems = (instance.moves ?? []).map(entry => movesById.get(entry.moveId)).filter(Boolean).map(move => ({
    name: move.name,
    type: "feat",
    img: "icons/svg/sword.svg",
    system: { description: { value: moveDescription(move), chat: "" } },
    flags: { [MODULE_ID]: { kind: "move", sourceId: move.id, move } }
  }));
  return {
    name: `${species.name} [Salvaje]`,
    type: "npc",
    img: portraitUrl(species),
    ownership: { default: 0 },
    prototypeToken: {
      name: `${species.name} salvaje`,
      actorLink: true,
      rotation: 0,
      disposition: -1,
      displayName: 20,
      displayBars: 20,
      bar1: { attribute: "attributes.hp" },
      width: tokenSize,
      height: tokenSize,
      texture: {
        src: remoteAssetUrl(species.media?.sprite) || portraitUrl(species),
        scaleX: POKEMON_TOKEN_SCALE,
        scaleY: POKEMON_TOKEN_SCALE
      }
    },
    system: {
      abilities,
      skills,
      attributes: {
        ac: { calc: "flat", flat: Number(instance.ac) || Number(species.ac) || 10 },
        hp: { value: Number(instance.hp?.value) || 1, max: Number(instance.hp?.max) || 1 },
        movement,
        senses: { ranges: senses, units: "ft", special: "" }
      },
      details: {
        cr: Math.min(Number(species.sr) || 0, 30),
        type: { value: "custom", custom: `Pokémon salvaje (${(species.type ?? []).join(" / ")})` },
        biography: { value: `<p>${escapeHtml(species.description ?? "")}</p>` }
      },
      traits: { size, ...damageTraits }
    },
    items: [pokemonItem, ...moveItems],
    effects: (instance.conditions ?? []).map(id => pokemonStatusEffectSource(id)).filter(Boolean),
    flags: {
      core: { sheetClass: `${MODULE_ID}.Poke5eCombatPokemonActorSheet` },
      [MODULE_ID]: {
        kind: "wild",
        capturable: true,
        encounterId,
        speciesId: species.id,
        pokemonTypes: species.type ?? [],
        // Copia de instance.abilities para que el hook síncrono de damage-shields.mjs
        // (Multiescama/Escudo Sombra/Robustez, lote 9) pueda leerlas sin await, igual
        // que el mismo flag en deployedActorSource() (deployment.mjs).
        pokemonAbilities: instance.abilities ?? []
      }
    }
  };
}

/**
 * Pide en el mapa la posición de un token y devuelve una promesa con ella, o con
 * null si se cancela (Escape, clic derecho o cambio de escena). A diferencia de
 * chooseDeploymentPosition() (deployment.mjs) no limita el alcance: basta con
 * que la casilla esté libre según isFreePosition().
 */
function chooseWildPosition(tokenData, pokemonName) {
  ui.notifications.info(game.i18n.format("POKE5E.WildDeployment.ChoosePosition", { pokemon: pokemonName }));
  return new Promise(resolve => {
    let settled = false;
    let canvasTearDownHook;
    const finish = position => {
      if (settled) return;
      settled = true;
      canvas.stage.off("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      if (canvasTearDownHook) Hooks.off("canvasTearDown", canvasTearDownHook);
      resolve(position);
    };
    const onKeyDown = event => { if (event.key === "Escape") finish(null); };
    const onPointerDown = event => {
      const button = event.button ?? event.nativeEvent?.button ?? 0;
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      if (button === 2) return finish(null);
      if (button !== 0) return;
      const point = canvas.stage.toLocal(event.global);
      const position = tokenPosition(point, tokenData);
      if (!isFreePosition(position, tokenData)) return ui.notifications.warn(game.i18n.localize("POKE5E.WildDeployment.FreePosition"));
      finish(position);
    };
    document.addEventListener("keydown", onKeyDown);
    canvas.stage.on("pointerdown", onPointerDown);
    canvasTearDownHook = Hooks.once("canvasTearDown", () => finish(null));
  });
}

/**
 * Expone chooseWildPosition() con un rótulo genérico para reutilizar el mismo
 * selector con cualquier token. La usa npc-trainer-actor.mjs.
 */
export function chooseTokenPosition(tokenData, label) {
  return chooseWildPosition(tokenData, label);
}

/**
 * Ajusta un punto del lienzo a la rejilla y devuelve la esquina del token.
 * Equivalente local de deploymentPosition() (deployment.mjs).
 */
function tokenPosition(point, tokenData) {
  const width = Number(tokenData.width ?? 1) * canvas.grid.sizeX;
  const height = Number(tokenData.height ?? 1) * canvas.grid.sizeY;
  if (canvas.grid.isGridless) return { x: Math.round(point.x - width / 2), y: Math.round(point.y - height / 2) };
  const topLeft = canvas.grid.getTopLeftPoint(point);
  return { x: Math.round(topLeft.x), y: Math.round(topLeft.y) };
}

/**
 * Comprueba que el token quepa entero en la escena y no pise a otro
 * (rectanglesOverlap()). Versión sin límite de alcance de isAllowedDeployment().
 */
function isFreePosition(position, tokenData) {
  const width = Number(tokenData.width ?? 1) * canvas.grid.sizeX;
  const height = Number(tokenData.height ?? 1) * canvas.grid.sizeY;
  const sceneRect = canvas.dimensions?.sceneRect;
  if (sceneRect && (!sceneRect.contains(position.x, position.y) || !sceneRect.contains(position.x + width - 1, position.y + height - 1))) return false;
  return !canvas.tokens.placeables.some(token => rectanglesOverlap(
    { x: position.x, y: position.y, width, height },
    { x: token.document.x, y: token.document.y, width: token.w, height: token.h }
  ));
}

/**
 * Traduce las velocidades del JSON de especie al bloque `movement` de D&D 5e,
 * quedándose con el mayor valor de cada tipo y tratando "hover" como vuelo.
 * Auxiliar de wildActorSource().
 */
function prepareMovement(speeds = []) {
  const movement = { walk: 0, fly: 0, swim: 0, burrow: 0, climb: 0, units: "ft", hover: false };
  for (const speed of speeds) {
    const key = { walking: "walk", flying: "fly", swimming: "swim", burrowing: "burrow", climbing: "climb" }[speed.type];
    if (key) movement[key] = Math.max(movement[key], Number(speed.value) || 0);
    if (speed.type === "hover") { movement.hover = true; movement.fly = Math.max(movement.fly, Number(speed.value) || 0); }
  }
  return movement;
}

/**
 * Traduce los sentidos del JSON a los alcances de D&D 5e, corrigiendo la errata
 * "tremmorsense" del origen. Auxiliar de wildActorSource().
 */
function prepareSenses(senses = []) {
  const ranges = { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 };
  for (const sense of senses) {
    const key = sense.type === "tremmorsense" ? "tremorsense" : sense.type;
    if (key in ranges) ranges[key] = Math.max(Number(ranges[key]) || 0, Number(sense.value) || 0);
  }
  return ranges;
}

/**
 * Descripción HTML de un movimiento para los Items del salvaje. Versión reducida
 * de la homónima de model.mjs, sin la cabecera de datos técnicos.
 */
function moveDescription(move) {
  const descriptions = Array.isArray(move.description) ? move.description : move.description ? [move.description] : [];
  return descriptions.map(value => typeof value === "string" ? `<p>${escapeHtml(value)}</p>` : "").join("");
}

/** Intersección de dos rectángulos. Auxiliar geométrico de isFreePosition(). */
function rectanglesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Escapa el texto de los JSON antes de insertarlo en las descripciones. */
function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}
