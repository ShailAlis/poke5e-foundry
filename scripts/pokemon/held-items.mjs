/**
 * Reglas de objetos equipados y bayas. Las reglas de este archivo proceden del
 * catálogo publicado en poke5e.app; los objetos sin descripción oficial no
 * reciben automatización inferida desde los videojuegos.
 *
 * Mantiene separadas las decisiones puras (modificadores, disparadores y
 * cargas) de las operaciones de Foundry (diálogos, tiradas y actualizaciones),
 * para que validate-held-items.mjs pueda comprobar el catálogo en Node.
 */
import { MODULE_ID, displayPokemonName, getPokemonItems } from "../core/model.mjs";
import { abilityBerryHealBonus } from "./pokemon-abilities.mjs";

/** Bayas que consumen una reacción para curar el estado indicado; `*` acepta cualquiera. */
export const STATUS_BERRIES = Object.freeze({
  "cheri-berry": ["paralyzed"],
  "chesto-berry": ["asleep"],
  "pecha-berry": ["poisoned", "badly-poisoned"],
  "rawst-berry": ["burned"],
  "aspear-berry": ["frozen"],
  "persim-berry": ["confused"],
  "lum-berry": ["*"]
});

/** Bayas curativas y su umbral de reacción, expresado como fracción de los PG máximos. */
export const HEALING_BERRIES = Object.freeze({
  "oran-berry": { formula: "2d4 + 2", threshold: 0.5 },
  "sitrus-berry": { healing: 30, threshold: 0.5 }
});

/** Tipo de daño que exige cada baya reductora; no se usa con daño genérico sin tipo. */
export const RESISTANCE_BERRY_TYPES = Object.freeze({
  "occa-berry": "fire", "passho-berry": "water", "wacan-berry": "electric",
  "rindo-berry": "grass", "yache-berry": "ice", "chople-berry": "fighting",
  "kebia-berry": "poison", "shuca-berry": "ground", "coba-berry": "flying",
  "payapa-berry": "psychic", "tanga-berry": "bug", "charti-berry": "rock",
  "kasib-berry": "ghost", "haban-berry": "dragon", "colbur-berry": "dark",
  "babiri-berry": "steel", "chilan-berry": "normal", "roseli-berry": "fairy"
});

/** Objetos que suman la competencia una vez al daño del tipo asociado. */
const TYPE_DAMAGE_ITEMS = Object.freeze({
  "black-belt": "fighting", "black-glasses": "dark", charcoal: "fire",
  "dragon-fang": "dragon", "fairy-feather": "fairy", "hard-stone": "rock",
  magnet: "electric", "miracle-seed": "grass", "mystic-water": "water",
  "never-melt-ice": "ice", "poison-barb": "poison", "sharp-beak": "flying",
  "silk-scarf": "normal", "silver-powder": "bug", "soft-sand": "ground",
  "spell-tag": "ghost", "twisted-spoon": "psychic"
});

/** Tipo que una Tabla concede a Arceus y a su movimiento Sentencia. */
const PLATE_TYPES = Object.freeze({
  "draco-plate": "dragon", "dread-plate": "dark", "earth-plate": "ground",
  "fist-plate": "fighting", "flame-plate": "fire", "icicle-plate": "ice",
  "insect-plate": "bug", "iron-plate": "steel", "meadow-plate": "grass",
  "mind-plate": "psychic", "pixie-plate": "fairy", "sky-plate": "flying",
  "splash-plate": "water", "spooky-plate": "ghost", "stone-plate": "rock",
  "toxic-plate": "poison", "zap-plate": "electric"
});

/** Tipo que cada Disco Memoria concede a un portador con Sistema RKS. */
const MEMORY_TYPES = Object.freeze({
  "bug-memory-disc": "bug", "dark-memory-disc": "dark", "dragon-memory-disc": "dragon",
  "electric-memory-disc": "electric", "fairy-memory-disc": "fairy", "fighting-memory-disc": "fighting",
  "fire-memory-disc": "fire", "flying-memory-disc": "flying", "ghost-memory-disc": "ghost",
  "grass-memory-disc": "grass", "ground-memory-disc": "ground", "ice-memory-disc": "ice",
  "poison-memory-disc": "poison", "psychic-memory-disc": "psychic", "rock-memory-disc": "rock",
  "steel-memory-disc": "steel", "water-memory-disc": "water"
});

/** Tipo que cada ROM aplica a Tecno Shock cuando lo utiliza Genesect. */
const DRIVE_TYPES = Object.freeze({
  "burn-drive": "fire", "chill-drive": "ice", "douse-drive": "water", "shock-drive": "electric"
});

/** Cristales Z con una carga diaria aunque sus movimientos todavía se resuelvan manualmente. */
const Z_CRYSTALS = new Set([
  "normalium-z", "fightinium-z", "flyinium-z", "poisonium-z", "groundium-z", "rockium-z",
  "buginium-z", "ghostium-z", "steelium-z", "firium-z", "waterium-z", "grassium-z",
  "electrium-z", "psychium-z", "icium-z", "dragonium-z", "darkinium-z", "fairium-z"
]);
/** Objetos Elegidos que comparten el bloqueo temporal de movimiento. */
const CHOICE_ITEMS = new Set(["choice-band", "choice-scarf", "choice-specs"]);

/** Especies compatibles con objetos cuya regla depende del portador. */
const SPECIES = Object.freeze({
  leek: new Set(["farfetchd", "galarian-farfetchd", "sirfetchd"]),
  thickClub: new Set(["cubone", "marowak", "alolan-marowak", "marowak-alola"])
});

/** Normaliza ids históricos que llegaron al catálogo con mayúsculas. */
export function heldItemId(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

/**
 * Cargas iniciales escritas en la regla oficial. El Globo Helio usa una carga
 * interna para representar si está intacto; se repara en descanso corto.
 */
export function heldItemInitialCharges(sourceId, definition = null) {
  const id = heldItemId(sourceId);
  if (id === "air-balloon" || id === "focus-sash" || id === "eject-button" || id === "megalite-stone" || Z_CRYSTALS.has(id)) return 1;
  if (id === "leftovers" || id === "black-sludge") return 10;
  const text = (definition?.description ?? []).join(" ");
  const match = text.match(/(?:has|tiene)\s+(\d+)\s+(?:charges?|cargas?)/i);
  return match ? Number(match[1]) : null;
}

/** Indica si la baya dada puede curar el estado; Baya Ziuela acepta cualquiera. */
export function statusBerryMatches(sourceId, statusId) {
  const statuses = STATUS_BERRIES[heldItemId(sourceId)];
  return Boolean(statuses?.includes("*") || statuses?.includes(heldItemId(statusId)));
}

/**
 * Detecta la reacción de una baya curativa solo al cruzar desde la mitad o más
 * hasta quedar por debajo de la mitad. Las bayas de resistencia quedan fuera:
 * una actualización genérica de PG de Foundry no conserva el tipo de daño.
 */
export function healingBerryReaction({ sourceId, previousHp, nextHp, maximumHp }) {
  const rule = HEALING_BERRIES[heldItemId(sourceId)];
  if (!rule || Number(maximumHp) <= 0) return null;
  const threshold = Number(maximumHp) * rule.threshold;
  if (Number(previousHp) < threshold || Number(nextHp) >= threshold || Number(nextHp) >= Number(previousHp)) return null;
  return { ...rule, sourceId: heldItemId(sourceId) };
}

/**
 * Resuelve mitigaciones, cambios de carga y disparadores ante una bajada de PG.
 * Devuelve datos sin modificar documentos para que deployment.mjs decida los
 * diálogos y escrituras. Mineral Evolutivo se aplica antes de Banda Focus.
 */
export function heldItemHpResolution({ sourceId, charges, previousHp, nextHp, maximumHp, hasEvolution = false }) {
  const id = heldItemId(sourceId);
  const previous = Math.max(0, Number(previousHp) || 0);
  const incoming = Math.max(0, Number(nextHp) || 0);
  const maximum = Math.max(1, Number(maximumHp) || 1);
  const damage = Math.max(0, previous - incoming);
  let hp = incoming;
  const events = [];
  let nextCharges = charges;
  if (damage > 0 && id === "eviolite" && hasEvolution) {
    const prevented = Math.min(3, damage);
    hp = Math.min(previous, hp + prevented);
    events.push({ type: "damage-reduction", amount: prevented });
  }
  if (damage > 0 && id === "air-balloon" && Number(charges) > 0) {
    nextCharges = 0;
    events.push({ type: "air-balloon-popped" });
  }
  if (hp < 1 && previous > 0 && id === "focus-sash" && Number(charges) > 0) {
    hp = 1;
    nextCharges = 0;
    events.push({ type: "focus-sash" });
  }
  return {
    hp: Math.max(0, Math.min(maximum, hp)),
    charges: nextCharges,
    damage: Math.max(0, previous - hp),
    events,
    reaction: healingBerryReaction({ sourceId: id, previousHp: previous, nextHp: hp, maximumHp: maximum })
  };
}

/** Tipo efectivo del portador para Tablas y Discos Memoria oficiales. */
export function heldItemEffectiveTypes({ sourceId, speciesId, baseTypes = [], abilities = [] }) {
  const id = heldItemId(sourceId);
  const species = heldItemId(speciesId);
  if (species === "arceus" && PLATE_TYPES[id]) return [PLATE_TYPES[id]];
  if (abilities.map(heldItemId).includes("rks-system") && MEMORY_TYPES[id]) return [MEMORY_TYPES[id]];
  return [...baseTypes];
}

/** Cambia únicamente los movimientos que la regla oficial menciona. */
export function heldItemEffectiveMove(move, { sourceId, speciesId }) {
  const id = heldItemId(sourceId);
  const species = heldItemId(speciesId);
  let type = move?.type;
  if (species === "genesect" && heldItemId(move?.id) === "techno-blast" && DRIVE_TYPES[id]) type = DRIVE_TYPES[id];
  if (species === "arceus" && heldItemId(move?.id) === "judgment" && PLATE_TYPES[id]) type = PLATE_TYPES[id];
  if (type === move?.type) return move;
  const damageTypes = Array.isArray(move?.damage?.type) ? move.damage.type : [move?.damage?.type].filter(Boolean);
  const damage = move?.damage ? { ...move.damage, type: damageTypes.map(value => value === move.type ? type : value) } : move?.damage;
  return { ...move, type, damage };
}

/**
 * Lee del texto oficial la ampliación propia del rango crítico del movimiento.
 * Permite que Periscopio, Puerro y Puño Suerte se acumulen con Cuchillada y
 * movimientos equivalentes tal como indican sus descripciones.
 */
export function moveCriticalRangeExtension(move) {
  const text = Array.isArray(move?.description) ? move.description.join(" ") : String(move?.description ?? "");
  const criticalSentences = text.split(/(?<=[.!?])\s+/).filter(sentence => /crit(?:ical|ico|ica)/i.test(sentence));
  const thresholds = criticalSentences.flatMap(sentence => [...sentence.matchAll(/\b(1[6-9]|20)s?\b/g)].map(match => Number(match[1])));
  return thresholds.length ? Math.max(0, 20 - Math.min(...thresholds)) : 0;
}

/**
 * Ajustes persistentes que deben reflejarse también en el actor desplegado:
 * CA, iniciativa, inmunidad a Tierra y velocidad temporal de Choice Scarf.
 * deployment.mjs consume este resultado tanto al crear como al sincronizar.
 */
export function heldItemActorAdjustments({ sourceId, speciesId, charges, state = {} }) {
  const id = heldItemId(sourceId);
  const species = heldItemId(speciesId);
  return {
    ac: (id === "assault-vest" || (id === "metal-powder" && species === "ditto")) ? (id === "metal-powder" ? 3 : 1) : 0,
    initiative: id === "quick-claw" ? 3 : 0,
    groundImmunity: id === "air-balloon" && Number(charges) > 0,
    speed: id === "choice-scarf" && Number(state.choiceTurns) > 0 ? 10 : 0
  };
}

/** Comprueba el bloqueo de Cinta, Pañuelo o Gafas Elegidas antes de tirar el movimiento. */
export function choiceHeldItemAllowsMove(heldItem, moveId) {
  const id = heldItemId(heldItem?.sourceId);
  if (!CHOICE_ITEMS.has(id)) return true;
  const locked = heldItem?.state?.choiceMoveId;
  return !locked || heldItemId(locked) === heldItemId(moveId);
}

/** Inicia o renueva el bloqueo hasta el final del siguiente turno del portador. */
export async function lockChoiceHeldItem(pokemonItem, moveId) {
  const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  const held = instance.heldItem;
  if (!CHOICE_ITEMS.has(heldItemId(held?.sourceId))) return false;
  held.state = { ...(held.state ?? {}), choiceMoveId: moveId, choiceTurns: 2 };
  await pokemonItem.setFlag(MODULE_ID, "instance", instance);
  return true;
}

/**
 * Reduce la duración del bloqueo Elegido al terminar el turno del portador.
 * Al escribir la instancia, el hook `updateItem` retira también la velocidad
 * temporal de Choice Scarf cuando expira el segundo turno.
 */
export async function advanceHeldItemTurn(actor) {
  const pokemonItem = await pokemonItemForActor(actor);
  if (!pokemonItem) return false;
  const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  const held = instance.heldItem;
  if (!CHOICE_ITEMS.has(heldItemId(held?.sourceId)) || Number(held.state?.choiceTurns) <= 0) return false;
  held.state.choiceTurns = Math.max(0, Number(held.state.choiceTurns) - 1);
  if (!held.state.choiceTurns) delete held.state;
  await pokemonItem.setFlag(MODULE_ID, "instance", instance);
  return true;
}

/**
 * Modificadores de una activación de movimiento: permiso del Chaleco Asalto,
 * MOVE, ataque, daño, STAB, rango crítico y consecuencias posteriores de
 * Campana Concha/Vidaesfera. `hasDamage` procede del catálogo del módulo.
 */
export function heldItemMoveModifiers({ sourceId, speciesId, speciesTypes = [], move = {}, proficiency = 2, hasDamage = false }) {
  const id = heldItemId(sourceId);
  const species = heldItemId(speciesId);
  const scope = heldItemId(move.attack?.scope);
  const type = heldItemId(move.type);
  let damage = 0;
  let stab = 0;
  if (id === "muscle-band" && scope === "melee") damage += Number(proficiency) || 0;
  if (id === "wise-glasses" && scope === "ranged") damage += Number(proficiency) || 0;
  if (TYPE_DAMAGE_ITEMS[id] === type) damage += Number(proficiency) || 0;
  if (id === "life-orb") damage += Number(proficiency) || 0;
  if (id === "griseous-orb" && species.startsWith("giratina-") && ["dragon", "ghost"].includes(type)) stab += 2;
  if (id === "thick-club" && SPECIES.thickClub.has(species) && speciesTypes.includes(type)) stab += 2;
  let criticalRange = moveCriticalRangeExtension(move);
  if (id === "scope-lens") criticalRange += 1;
  if (id === "leek" && SPECIES.leek.has(species)) criticalRange += 2;
  if (id === "lucky-punch" && species === "chansey") criticalRange += 1;
  return {
    allowed: !(id === "assault-vest" && !hasDamage),
    moveModifierBonus: id === "light-ball" && species === "pikachu" ? 1 : 0,
    attackMoveMultiplier: id === "choice-specs" ? 2 : 1,
    damageMoveMultiplier: id === "choice-band" ? 2 : 1,
    attack: id === "wide-lens" ? 1 : 0,
    damage,
    stab,
    criticalRange,
    shellBell: id === "shell-bell" && hasDamage,
    lifeOrb: id === "life-orb" && hasDamage
  };
}

/** Devuelve el daño o estado de Lodo Negro, Llamaesfera y Toxiesfera al final del turno. */
export function heldItemEndTurnEffect({ sourceId, pokemonTypes = [] }) {
  const id = heldItemId(sourceId);
  if (id === "black-sludge" && !pokemonTypes.includes("poison")) return { damageFormula: "1d6", damageType: "poison" };
  if (id === "flame-orb") return { status: "burned" };
  if (id === "toxic-orb") return { status: "badly-poisoned" };
  return null;
}

/** Confirmación común para todas las reacciones opcionales. */
export async function confirmHeldItemReaction(title, content) {
  try {
    return await foundry.applications.api.DialogV2.confirm({
      window: { title }, content: `<div class="poke5e-held-item-reaction">${content}</div>`,
      modal: true, rejectClose: false
    });
  } catch {
    return false;
  }
}

/** Publica una resolución mecánica de objeto en el chat. */
export async function postHeldItemMessage(pokemonItem, heldItem, text) {
  const name = displayPokemonName(pokemonItem);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: pokemonItem.parent, alias: name }),
    content: `<div class="dnd5e chat-card poke5e-held-item-card"><header class="card-header"><h3>${escapeHtml(name)} · ${escapeHtml(heldItem?.name ?? "Objeto")}</h3></header><p>${escapeHtml(text)}</p></div>`
  });
}

/** Consume definitivamente el objeto que lleva el Pokémon. */
export async function consumeHeldItem(pokemonItem, expectedSourceId = null) {
  const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  if (!instance.heldItem) return false;
  if (expectedSourceId && heldItemId(instance.heldItem.sourceId) !== heldItemId(expectedSourceId)) return false;
  delete instance.heldItem;
  await pokemonItem.setFlag(MODULE_ID, "instance", instance);
  return true;
}

/** Cura PG en la instancia; el hook updateItem sincroniza el actor desplegado. */
export async function healPokemonWithHeldItem(pokemonItem, amount) {
  const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  const maximum = Math.max(1, Number(instance.hp?.max) || 1);
  const previous = Math.max(0, Number(instance.hp?.value) || 0);
  const next = Math.min(maximum, previous + Math.max(0, Number(amount) || 0));
  instance.hp = { value: next, max: maximum };
  await pokemonItem.setFlag(MODULE_ID, "instance", instance);
  return next - previous;
}

/** Tira una fórmula de objeto y la anuncia con el hablante del Pokémon. */
export async function rollHeldItemFormula(pokemonItem, formula, flavor) {
  const roll = await new Roll(formula).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: pokemonItem.parent, alias: displayPokemonName(pokemonItem) }), flavor });
  return Math.max(0, Number(roll.total) || 0);
}

/**
 * Resuelve una baya curativa cuando los PG se editan en la ficha Pokédex y no
 * a través del actor desplegado. Devuelve la cifra final y guarda consumo y
 * curación en una sola actualización para que el hook no duplique la reacción.
 */
export async function resolvePokemonHpBerryReaction(pokemonItem, previousHp, nextHp) {
  let instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  const held = instance.heldItem;
  const maximum = Math.max(1, Number(instance.hp?.max) || 1);
  const reaction = healingBerryReaction({ sourceId: held?.sourceId, previousHp, nextHp, maximumHp: maximum });
  if (!reaction) return { handled: false, hp: nextHp };
  const confirmed = await confirmHeldItemReaction(held.name, `<p>${escapeHtml(displayPokemonName(pokemonItem))} ha bajado de la mitad de sus PG. ¿Consumir ${escapeHtml(held.name)} para curarse?</p>`);
  if (!confirmed) return { handled: false, hp: nextHp };
  const rolled = reaction.formula
    ? await rollHeldItemFormula(pokemonItem, reaction.formula, `${held.name} · Reacción de curación`)
    : reaction.healing;
  const amount = abilityBerryHealBonus(instance.abilities, rolled, maximum);
  instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  if (heldItemId(instance.heldItem?.sourceId) !== reaction.sourceId) return { handled: false, hp: nextHp };
  const finalHp = Math.min(maximum, Math.max(0, Number(nextHp) || 0) + amount);
  instance.hp = { value: finalHp, max: maximum };
  delete instance.heldItem;
  await pokemonItem.setFlag(MODULE_ID, "instance", instance);
  await postHeldItemMessage(pokemonItem, held, `Se consume como reacción y recupera ${finalHp - nextHp} PG.`);
  return { handled: true, hp: finalHp };
}

/**
 * Aplica Campana Concha y Vidaesfera después de tirar un movimiento con daño.
 * Escribe los PG en la instancia; main.mjs los propaga al actor desplegado.
 */
export async function applyPostMoveHeldItemEffects(pokemonItem, profile, proficiency) {
  if (profile?.shellBell) {
    const held = pokemonItem.getFlag(MODULE_ID, "instance")?.heldItem;
    if (heldItemId(held?.sourceId) === "shell-bell") {
      const healed = await healPokemonWithHeldItem(pokemonItem, proficiency);
      await postHeldItemMessage(pokemonItem, held, `Recupera ${healed} PG después de causar daño.`);
    }
  }
  if (profile?.lifeOrb) {
    const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
    const held = instance.heldItem;
    if (heldItemId(held?.sourceId) === "life-orb") {
      const previous = Math.max(0, Number(instance.hp?.value) || 0);
      const damage = Math.min(previous, Math.max(0, Number(proficiency) || 0));
      instance.hp.value = previous - damage;
      await pokemonItem.setFlag(MODULE_ID, "instance", instance);
      await postHeldItemMessage(pokemonItem, held, `Potencia el daño y el portador recibe ${damage} de daño sin tipo.`);
    }
  }
}

/** Gasta una carga sin consumir el objeto. */
export async function spendHeldItemCharge(pokemonItem, expectedSourceId) {
  const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  const held = instance.heldItem;
  if (!held || heldItemId(held.sourceId) !== heldItemId(expectedSourceId) || Number(held.charges) <= 0) return false;
  held.charges = Math.max(0, Number(held.charges) - 1);
  await pokemonItem.setFlag(MODULE_ID, "instance", instance);
  return true;
}

/**
 * Ofrece la reacción de Baya Zanama cuando #rollMove deja una entrada en 0 PP;
 * si se confirma, restaura hasta 10 PP y consume la baya en una sola escritura.
 */
export async function tryLeppaBerryReaction(pokemonItem, moveEntryId) {
  let instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  if (heldItemId(instance.heldItem?.sourceId) !== "leppa-berry") return false;
  let entry = (instance.moves ?? []).find(candidate => candidate.id === moveEntryId);
  if (!entry || Number(entry.pp?.value) > 0 || Number(entry.pp?.max) <= 0) return false;
  const confirmed = await confirmHeldItemReaction(instance.heldItem.name, `<p>${escapeHtml(displayPokemonName(pokemonItem))} se ha quedado sin PP. ¿Consumir ${escapeHtml(instance.heldItem.name)} para recuperar 10 PP?</p>`);
  if (!confirmed) return false;
  instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  entry = (instance.moves ?? []).find(candidate => candidate.id === moveEntryId);
  if (!entry || heldItemId(instance.heldItem?.sourceId) !== "leppa-berry") return false;
  const restored = Math.min(10, Math.max(0, Number(entry.pp.max) - Number(entry.pp.value)));
  entry.pp.value = Math.min(Number(entry.pp.max), Number(entry.pp.value) + 10);
  const held = instance.heldItem;
  delete instance.heldItem;
  await pokemonItem.setFlag(MODULE_ID, "instance", instance);
  await postHeldItemMessage(pokemonItem, held, `Se consume y restaura ${restored} PP.`);
  return true;
}

/**
 * Uso voluntario desde la ficha. Automatiza las reglas con resolución directa;
 * los demás objetos conservan su tarjeta descriptiva sin gastar recursos.
 */
export async function activateHeldItem(pokemonItem, { removeStatus } = {}) {
  let instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  const held = instance.heldItem;
  if (!held) return false;
  const id = heldItemId(held.sourceId);
  const level = Math.max(1, Math.min(20, Number(instance.level) || 1));
  const proficiency = 2 + Math.floor((level - 1) / 4);
  if (["leftovers", "black-sludge"].includes(id)) {
    const types = pokemonItem.getFlag(MODULE_ID, "species")?.type ?? [];
    if (id === "black-sludge" && !types.includes("poison")) return ui.notifications.warn(game.i18n.format("POKE5E.HeldItems.PoisonOnly", { item: held.name }));
    if (Number(held.charges) <= 0) return ui.notifications.warn(game.i18n.format("POKE5E.HeldItems.NoCharges", { item: held.name }));
    const healed = await healPokemonWithHeldItem(pokemonItem, proficiency);
    await spendHeldItemCharge(pokemonItem, id);
    await postHeldItemMessage(pokemonItem, held, `Gasta 1 carga y recupera ${healed} PG.`);
    return true;
  }
  if (HEALING_BERRIES[id]) {
    const rule = HEALING_BERRIES[id];
    const amount = rule.formula ? await rollHeldItemFormula(pokemonItem, rule.formula, `${held.name} · Curación`) : rule.healing;
    const healed = await healPokemonWithHeldItem(pokemonItem, amount);
    await consumeHeldItem(pokemonItem, id);
    await postHeldItemMessage(pokemonItem, held, `Se consume y recupera ${healed} PG.`);
    return true;
  }
  if (STATUS_BERRIES[id]) {
    const actor = combatActorForPokemon(pokemonItem);
    const activeStatuses = actor?.effects?.map(effect => effect.getFlag(MODULE_ID, "status")).filter(Boolean) ?? [];
    const status = [...(instance.conditions ?? []), ...activeStatuses].find(condition => statusBerryMatches(id, condition));
    if (!status) return ui.notifications.warn(game.i18n.format("POKE5E.HeldItems.NoStatus", { item: held.name }));
    if (removeStatus) await removeStatus(status);
    await consumeHeldItem(pokemonItem, id);
    await postHeldItemMessage(pokemonItem, held, `Se consume y cura el estado ${status}.`);
    return true;
  }
  if (id === "leppa-berry") {
    const candidates = (instance.moves ?? []).filter(entry => Number(entry.pp?.value) < Number(entry.pp?.max));
    if (!candidates.length) return ui.notifications.warn(game.i18n.format("POKE5E.HeldItems.NoSpentPP", { item: held.name }));
    const target = candidates.sort((a, b) => Number(a.pp.value) - Number(b.pp.value))[0];
    const restored = Math.min(10, Number(target.pp.max) - Number(target.pp.value));
    target.pp.value = Math.min(Number(target.pp.max), Number(target.pp.value) + 10);
    delete instance.heldItem;
    await pokemonItem.setFlag(MODULE_ID, "instance", instance);
    await postHeldItemMessage(pokemonItem, held, `Se consume y restaura ${restored} PP.`);
    return true;
  }
  if (RESISTANCE_BERRY_TYPES[id]) {
    ui.notifications.info(game.i18n.format("POKE5E.HeldItems.RequiresDamageType", { item: held.name, type: RESISTANCE_BERRY_TYPES[id] }));
    return false;
  }
  await postHeldItemMessage(pokemonItem, held, held.description || "Este objeto no tiene una resolución automática disponible.");
  return false;
}

/**
 * Traduce `dnd5e.restCompleted` a los reinicios de las reglas: el descanso largo
 * representa el amanecer para todos los objetos con cargas y el corto solo
 * repara el Globo Helio. Recorre los Pokémon embebidos del entrenador.
 */
export async function restoreHeldItemChargesAfterRest(actor, config = {}) {
  const longRest = config.type === "long";
  const shortRest = config.type === "short";
  if (!longRest && !shortRest) return 0;
  const pokemonItems = actor?.type === "character" ? getPokemonItems(actor) : [];
  let restored = 0;
  for (const pokemonItem of pokemonItems) {
    const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
    const held = instance.heldItem;
    if (!held) continue;
    const id = heldItemId(held.sourceId);
    if (shortRest && id !== "air-balloon") continue;
    const maximum = heldItemInitialCharges(id);
    if (maximum == null || Number(held.charges) === maximum) continue;
    held.charges = maximum;
    await pokemonItem.setFlag(MODULE_ID, "instance", instance);
    restored += 1;
  }
  if (restored) ui.notifications.info(game.i18n.format("POKE5E.HeldItems.ChargesRestored", { count: restored }));
  return restored;
}

/** Resuelve el Item Pokémon que respalda a un actor salvaje o desplegado. */
async function pokemonItemForActor(actor) {
  const uuid = actor?.getFlag?.(MODULE_ID, "pokemonItemUuid");
  if (uuid) return fromUuid(uuid);
  return actor?.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? null;
}

/** Localiza el actor temporal de la instancia, incluidos los salvajes. */
function combatActorForPokemon(pokemonItem) {
  if (pokemonItem.parent?.getFlag?.(MODULE_ID, "kind") === "wild") return pokemonItem.parent;
  return game.actors?.find(actor => actor.getFlag(MODULE_ID, "pokemonItemUuid") === pokemonItem.uuid) ?? null;
}

/** Escapa valores del catálogo antes de insertarlos en diálogos o tarjetas. */
function escapeHtml(value) {
  return globalThis.foundry?.utils?.escapeHTML ? foundry.utils.escapeHTML(String(value ?? "")) : String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
