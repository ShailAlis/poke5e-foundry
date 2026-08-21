/**
 * Flujo guiado de avances de nivel para los Pokémon embebidos. D&D 5e solo
 * admite el avance nativo de PG en Items de clase, mientras que un Pokémon del
 * módulo es un Item de rasgo; por eso este archivo aplica las mismas decisiones
 * sobre su bloque `instance` y conserva un historial que evita duplicarlas.
 */
import { loadPoke5eData } from "../core/data-service.mjs";
import { MODULE_ID, displayPokemonName } from "../core/model.mjs";
import {
  applyPokemonAbilityAdvancement,
  evolutionStageCount,
  pokemonAdvancementsBetween
} from "./progression.mjs";
import { trainerPathFeatDiscount } from "../trainer/trainer-path-rules.mjs";
import { pokemonFeatOptions } from "../trainer/feat-catalog.mjs";

const ABILITIES = { str: "FUE", dex: "DES", con: "CON", int: "INT", wis: "SAB", cha: "CAR" };

/** Nivel hasta el que ya se aplicaron avances; las fichas antiguas parten del actual. */
export function pokemonAppliedAdvancementLevel(instance) {
  const current = normalizedLevel(instance?.level);
  const stored = Number(instance?.advancement?.appliedLevel);
  return Number.isFinite(stored) ? Math.max(1, Math.min(20, Math.trunc(stored))) : current;
}

/** Indica si el Pokémon tiene subidas guardadas cuyos beneficios siguen pendientes. */
export function hasPendingPokemonAdvancements(instance) {
  return pokemonAppliedAdvancementLevel(instance) < normalizedLevel(instance?.level);
}

/**
 * Abre el avance pendiente, valida sus decisiones y actualiza PG,
 * características e historial en una sola escritura. Devuelve false si se
 * cancela, dejando el nivel y los PX intactos para poder retomarlo desde la ficha.
 */
export async function applyPendingPokemonAdvancements(pokemonItem, data = null) {
  if (!pokemonItem?.isOwner) return false;
  const instance = foundry.utils.deepClone(pokemonItem.getFlag(MODULE_ID, "instance") ?? {});
  const from = pokemonAppliedAdvancementLevel(instance);
  const to = normalizedLevel(instance.level);
  if (to <= from) return true;
  data ??= await loadPoke5eData();
  const species = pokemonItem.getFlag(MODULE_ID, "species") ?? {};
  const stageCount = evolutionStageCount(species.id, data.evolutions);
  const advancement = pokemonAdvancementsBetween(from, to, { stageCount, speciesRating: species.sr });
  const decision = await promptPokemonAdvancement(pokemonItem, instance, species, advancement, stageCount);
  if (!decision) return false;
  // Recalculado en el servidor con featCostForAdvancement() en vez de fiarse del
  // featPoints que mandó el diálogo: la fuente de verdad es advancement, no lo
  // que haya podido manipularse en el formulario.
  const { discounted: discountApplies, cost: featPoints } = decision.feat
    ? featCostForAdvancement(pokemonItem.parent, decision.feat, advancement)
    : { discounted: false, cost: 0 };
  decision.featPoints = featPoints;

  const currentAttributes = foundry.utils.deepClone(instance.attributes ?? species.attributes ?? {});
  const abilityResult = applyPokemonAbilityAdvancement(currentAttributes, decision.allocation, advancement, decision.featPoints, { allowOddFeatCost: discountApplies });
  if (!abilityResult) {
    ui.notifications.warn(game.i18n.format("POKE5E.Advancement.DistributePoints", { points: advancement.abilityPoints }));
    return false;
  }

  const oldConstitutionModifier = abilityModifier(currentAttributes.con);
  const newConstitutionModifier = abilityModifier(abilityResult.attributes.con);
  const hitPointGain = await resolveHitPointGain({
    method: decision.hitPointMethod,
    levels: advancement.hitPointLevels,
    hitDice: species.hitDice,
    constitutionModifier: oldConstitutionModifier,
    name: displayPokemonName(pokemonItem)
  });
  if (hitPointGain == null) return false;
  // Los cambios de CON son retroactivos para todos los niveles alcanzados.
  const retroactiveConstitution = (newConstitutionModifier - oldConstitutionModifier) * to;
  const totalHitPointGain = Math.max(advancement.hitPointLevels, hitPointGain + retroactiveConstitution);
  const oldMaximum = Math.max(1, Number(instance.hp?.max) || Number(species.hp) || 1);
  const oldValue = Math.max(0, Number(instance.hp?.value) || 0);
  instance.hp = { value: oldValue + totalHitPointGain, max: oldMaximum + totalHitPointGain };
  instance.attributes = abilityResult.attributes;
  instance.advancement = {
    ...(instance.advancement ?? {}),
    appliedLevel: to,
    history: [
      ...(instance.advancement?.history ?? []),
      {
        from,
        to,
        hp: totalHitPointGain,
        hpMethod: decision.hitPointMethod,
        abilities: abilityResult.increases,
        featPoints: abilityResult.featPoints,
        feat: decision.feat,
        moveReplacements: advancement.moveReplacements,
        moveLevels: advancement.moveLevels,
        damageLevels: advancement.damageLevels,
        peakPower: advancement.peakPower
      }
    ]
  };
  await pokemonItem.setFlag(MODULE_ID, "instance", instance);
  const benefits = [`+${totalHitPointGain} PG`];
  if (advancement.abilityPoints) benefits.push(`${advancement.abilityPoints} puntos de característica/dote`);
  if (advancement.moveReplacements) benefits.push(`${advancement.moveReplacements} cambio${advancement.moveReplacements === 1 ? "" : "s"} de movimiento`);
  if (advancement.moveLevels.length) benefits.push(`movimientos de nivel ${advancement.moveLevels.join(", ")}`);
  if (advancement.damageLevels.length) benefits.push(`aumento de daño de nivel ${advancement.damageLevels.join(", ")}`);
  if (advancement.peakPower) benefits.push("Poder Máximo");
  ui.notifications.info(game.i18n.format("POKE5E.Advancement.Completed", { pokemon: displayPokemonName(pokemonItem), level: to, benefits: benefits.join(" · ") }));
  return true;
}

/**
 * Inicializa el marcador de avances de una instancia nueva o antigua. No aplica
 * beneficios retroactivos: los PG y atributos que ya tenga se consideran base.
 */
export function initializePokemonAdvancement(instance) {
  if (instance?.advancement && Number.isFinite(Number(instance.advancement.appliedLevel))) return instance;
  instance.advancement = { appliedLevel: normalizedLevel(instance?.level), history: [] };
  return instance;
}

/**
 * Orquesta el avance en dos pantallas cuando hay puntos de mejora: primero
 * promptAdvancementChoice() pregunta PG y, si toca elegir, características o
 * dote; después, según lo elegido, promptAbilityChoice() (solo características)
 * o promptFeatChoice() (dote, con un resto de puntos si hay descuento de
 * Camino de Entrenador). Cualquier "cancelar" en cualquier pantalla aborta
 * todo el avance, igual que antes.
 */
async function promptPokemonAdvancement(item, instance, species, advancement, stageCount) {
  const features = [
    `${advancement.hitPointLevels} tirada${advancement.hitPointLevels === 1 ? "" : "s"} de ${species.hitDice ?? "d8"} + CON para PG`,
    `${advancement.moveReplacements} sustitución${advancement.moveReplacements === 1 ? "" : "es"} de movimiento disponible${advancement.moveReplacements === 1 ? "" : "s"}`,
    advancement.moveLevels.length ? `Nuevos movimientos: niveles ${advancement.moveLevels.join(", ")}` : "",
    advancement.damageLevels.length ? `Aumento de daño: niveles ${advancement.damageLevels.join(", ")}` : "",
    advancement.peakPower ? "Poder Máximo" : ""
  ].filter(Boolean);
  const choice = await promptAdvancementChoice(item, advancement, features);
  if (!choice) return null;
  if (!advancement.abilityPoints) return { hitPointMethod: choice.hitPointMethod, allocation: {}, featPoints: 0, feat: "" };
  const rest = choice.path === "feat"
    ? await promptFeatChoice(item, instance, species, advancement)
    : await promptAbilityChoice(item, instance, species, advancement, stageCount);
  return rest ? { hitPointMethod: choice.hitPointMethod, ...rest } : null;
}

/** Primera pantalla: método de PG y, si hay puntos de mejora, entre características o dote. */
async function promptAdvancementChoice(item, advancement, features) {
  const choiceFieldset = advancement.abilityPoints ? `<fieldset class="poke5e-asi-choice">
    <legend>Mejora de nivel · ${advancement.abilityPoints} puntos</legend>
    <label class="poke5e-radio"><input type="radio" name="path" value="asi" checked> <span>Aumentar características</span></label>
    <label class="poke5e-radio"><input type="radio" name="path" value="feat"> <span>Elegir una dote</span></label>
  </fieldset>` : "";
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("POKE5E.Advancement.WindowTitle", { pokemon: displayPokemonName(item), level: advancement.to }) },
      content: `<div class="poke5e-advancement-dialog">
        <p>Aplica los beneficios pendientes de los niveles ${advancement.from + 1}–${advancement.to}.</p>
        <ul>${features.map(feature => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>
        <label><span>Puntos de golpe</span><select name="hitPointMethod"><option value="average">Usar la media</option><option value="roll">Tirar los dados</option></select></label>
        ${choiceFieldset}
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: game.i18n.localize(advancement.abilityPoints ? "POKE5E.Advancement.Continue" : "POKE5E.Advancement.Apply"),
        icon: `fa-solid fa-arrow-${advancement.abilityPoints ? "right" : "up"}`,
        callback: (event, button) => ({
          hitPointMethod: button.form.elements.hitPointMethod.value === "roll" ? "roll" : "average",
          path: button.form.elements.path?.value === "feat" ? "feat" : "asi"
        })
      }
    });
  } catch {
    return null;
  }
}

/** Segunda pantalla (características): un contador de +/- por característica que reparte exactamente advancement.abilityPoints. */
async function promptAbilityChoice(item, instance, species, advancement, stageCount) {
  const attributes = instance.attributes ?? species.attributes ?? {};
  const cap = advancement.peakPower ? Math.max(...advancement.asi.map(entry => entry.cap)) : 20;
  const content = `<div class="poke5e-advancement-dialog">
    <fieldset class="poke5e-asi-allocation">
      <legend>Mejoras de característica · ${advancement.abilityPoints} puntos</legend>
      <p>Esta línea tiene ${stageCount} etapa${stageCount === 1 ? "" : "s"}.${advancement.peakPower ? ` Poder Máximo permite superar 20 hasta ${cap}.` : ""}</p>
      <p>Puntos restantes: <strong data-remaining>${advancement.abilityPoints}</strong></p>
      ${stepperGrid(ABILITIES, attributes)}
    </fieldset>
  </div>`;
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("POKE5E.Advancement.WindowTitle", { pokemon: displayPokemonName(item), level: advancement.to }) },
      content,
      modal: true,
      rejectClose: false,
      render: (event, dialog) => attachStepperGroup(dialog.element, Object.keys(ABILITIES), advancement.abilityPoints, {
        maxFor: key => Math.max(0, cap - (Number(attributes[key]) || 10))
      }),
      ok: {
        label: game.i18n.localize("POKE5E.Advancement.Apply"),
        icon: "fa-solid fa-arrow-up",
        callback: (event, button) => ({
          allocation: Object.fromEntries(Object.keys(ABILITIES).map(key => [key, Number(button.form.elements[`asi-${key}`]?.value) || 0])),
          featPoints: 0,
          feat: ""
        })
      }
    });
  } catch {
    return null;
  }
}

/**
 * Segunda pantalla (dote): desplegable con las dotes detectadas
 * (pokemonFeatOptions()) y, solo si la dote elegida tiene descuento de Camino
 * de Entrenador (Poké Mentor 5 / Guru 9, ver trainerPathFeatDiscount()), un
 * resto de puntos con el mismo contador de +/- que promptAbilityChoice().
 */
async function promptFeatChoice(item, instance, species, advancement) {
  const attributes = instance.attributes ?? species.attributes ?? {};
  const options = await pokemonFeatOptions();
  const groups = new Map();
  for (const entry of options) groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  const optionsHtml = options.length
    ? [...groups.entries()].map(([group, entries]) => `<optgroup label="${escapeHtml(group)}">${entries.map(entry => `<option value="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</option>`).join("")}</optgroup>`).join("")
    : "";
  const content = `<div class="poke5e-advancement-dialog">
    <fieldset>
      <legend>Dote</legend>
      <label><span>Elige una dote</span>
        <select name="feat">
          <option value="">${game.i18n.localize("POKE5E.Common.Choose")}</option>
          ${optionsHtml}
        </select>
      </label>
      ${options.length ? "" : `<p>${game.i18n.localize("POKE5E.Creator.ChosenFeatEmpty")}</p>`}
      <input type="hidden" name="featPoints" value="0">
      <p data-feat-cost></p>
    </fieldset>
    <fieldset class="poke5e-asi-allocation" data-feat-leftover hidden>
      <legend>Puntos restantes</legend>
      <p>Puntos restantes: <strong data-remaining>0</strong></p>
      ${stepperGrid(ABILITIES, attributes)}
    </fieldset>
  </div>`;
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("POKE5E.Advancement.WindowTitle", { pokemon: displayPokemonName(item), level: advancement.to }) },
      content,
      modal: true,
      rejectClose: false,
      render: (event, dialog) => attachFeatDialog(dialog.element, item.parent, advancement),
      ok: {
        label: game.i18n.localize("POKE5E.Advancement.Apply"),
        icon: "fa-solid fa-arrow-up",
        callback: (event, button) => ({
          feat: String(button.form.elements.feat?.value ?? "").trim(),
          featPoints: Number(button.form.elements.featPoints?.value) || 0,
          allocation: Object.fromEntries(Object.keys(ABILITIES).map(key => [key, Number(button.form.elements[`asi-${key}`]?.value) || 0]))
        })
      }
    });
  } catch {
    return null;
  }
}

/** HTML de una fila de característica con contador +/-; lo consumen ambas pantallas de asignación. */
function stepperGrid(abilities, attributes) {
  return `<div class="poke5e-stepper-grid">${Object.entries(abilities).map(([key, label]) => `
    <div class="poke5e-stepper-row">
      <span>${label}${attributes[key] != null ? ` (${Number(attributes[key]) || 10})` : ""}</span>
      <div class="poke5e-stepper">
        <button type="button" data-stepper-dec="${key}" aria-label="Restar">−</button>
        <output data-stepper-value="${key}">0</output>
        <button type="button" data-stepper-inc="${key}" aria-label="Sumar">+</button>
      </div>
      <input type="hidden" name="asi-${key}" value="0">
    </div>`).join("")}</div>`;
}

/**
 * Engancha los botones +/- de un grupo de características a un contador que no
 * deja repartir más de `budget` puntos en total ni superar maxFor(key) en una
 * característica concreta; ambos límites deshabilitan el botón «+»
 * correspondiente, y «−» se deshabilita en 0. Un único listener delegado en la
 * raíz evita duplicarlos si se vuelve a llamar (promptFeatChoice() reconfigura
 * el mismo contenedor cada vez que cambia la dote elegida).
 */
function attachStepperGroup(root, keys, budget, { maxFor = () => Infinity } = {}) {
  const state = Object.fromEntries(keys.map(key => [key, 0]));
  const update = () => {
    const spent = Object.values(state).reduce((total, value) => total + value, 0);
    const remaining = root.querySelector("[data-remaining]");
    if (remaining) remaining.textContent = Math.max(0, budget - spent);
    for (const key of keys) {
      const output = root.querySelector(`[data-stepper-value="${key}"]`);
      const input = root.querySelector(`input[name="asi-${key}"]`);
      const dec = root.querySelector(`[data-stepper-dec="${key}"]`);
      const inc = root.querySelector(`[data-stepper-inc="${key}"]`);
      if (output) output.textContent = state[key];
      if (input) input.value = state[key];
      if (dec) dec.disabled = state[key] <= 0;
      if (inc) inc.disabled = spent >= budget || state[key] >= maxFor(key);
    }
  };
  if (!root.dataset.stepperBound) {
    root.dataset.stepperBound = "true";
    root.addEventListener("click", event => {
      const dec = event.target.closest("[data-stepper-dec]");
      const inc = event.target.closest("[data-stepper-inc]");
      if (dec && !dec.disabled) { const key = dec.dataset.stepperDec; if (root.__stepper.state[key] > 0) { root.__stepper.state[key]--; root.__stepper.update(); } }
      else if (inc && !inc.disabled) {
        const key = inc.dataset.stepperInc;
        const spent = Object.values(root.__stepper.state).reduce((total, value) => total + value, 0);
        if (spent < root.__stepper.budget && root.__stepper.state[key] < root.__stepper.maxFor(key)) { root.__stepper.state[key]++; root.__stepper.update(); }
      }
    });
  }
  root.__stepper = { state, budget, maxFor, update };
  update();
  return state;
}

/**
 * Coste en puntos de mejora de una dote y el resto que queda por repartir
 * entre características. Sin descuento de Camino de Entrenador, la dote
 * consume como mucho advancement.featPointLimit —que puede ser menor que
 * advancement.abilityPoints en líneas de una sola etapa evolutiva, con 4
 * puntos por subida en vez de 2 (pokemonAsiPoints() en progression.mjs)—, así
 * que el resto siempre debe repartirse entre características, con o sin
 * descuento. Función pura: la usan attachFeatDialog() (en vivo, con el actor
 * real) y validate-pokemon-advancement.mjs (con un actor simulado).
 */
export function featCostForAdvancement(trainer, featName, advancement) {
  const discounted = Boolean(featName) && trainerPathFeatDiscount(trainer, featName);
  const cost = discounted ? Math.min(1, advancement.featPointLimit) : Math.min(advancement.abilityPoints, advancement.featPointLimit);
  return { discounted, cost, leftover: advancement.abilityPoints - cost };
}

/**
 * Auxiliar de promptFeatChoice(): recalcula el coste al cambiar de dote con
 * featCostForAdvancement() y muestra/oculta el resto de puntos con
 * attachStepperGroup().
 */
function attachFeatDialog(root, trainer, advancement) {
  const select = root.querySelector("select[name='feat']");
  const costLabel = root.querySelector("[data-feat-cost]");
  const leftoverFieldset = root.querySelector("[data-feat-leftover]");
  const featPointsInput = root.querySelector("input[name='featPoints']");
  if (!select) return;
  const recompute = () => {
    const name = select.value;
    if (!name) {
      costLabel.textContent = "";
      leftoverFieldset.hidden = true;
      featPointsInput.value = "0";
      return;
    }
    const { discounted, cost, leftover } = featCostForAdvancement(trainer, name, advancement);
    featPointsInput.value = String(cost);
    costLabel.textContent = discounted
      ? `Coste: ${cost} punto (descuento de Camino de Entrenador).`
      : `Coste: ${cost} punto${cost === 1 ? "" : "s"} de mejora.`;
    leftoverFieldset.hidden = leftover <= 0;
    if (leftover > 0) attachStepperGroup(leftoverFieldset, Object.keys(ABILITIES), leftover);
  };
  select.addEventListener("change", recompute);
  recompute();
}

async function resolveHitPointGain({ method, levels, hitDice, constitutionModifier, name }) {
  const sides = Math.max(4, Number(String(hitDice ?? "d8").replace(/^d/, "")) || 8);
  if (method !== "roll") return levels * (Math.floor(sides / 2) + 1 + constitutionModifier);
  const roll = await new Roll(`${levels}d${sides} + ${levels * constitutionModifier}`).evaluate();
  await roll.toMessage({ flavor: `Avance de PG de ${name}` });
  return Math.max(levels, Number(roll.total) || 0);
}

function normalizedLevel(level) { return Math.max(1, Math.min(20, Math.trunc(Number(level) || 1))); }
function abilityModifier(score) { return Math.floor(((Number(score) || 10) - 10) / 2); }
function escapeHtml(value) { return foundry.utils.escapeHTML(String(value ?? "")); }
