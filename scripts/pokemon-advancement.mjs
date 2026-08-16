/**
 * Flujo guiado de avances de nivel para los Pokémon embebidos. D&D 5e solo
 * admite el avance nativo de PG en Items de clase, mientras que un Pokémon del
 * módulo es un Item de rasgo; por eso este archivo aplica las mismas decisiones
 * sobre su bloque `instance` y conserva un historial que evita duplicarlas.
 */
import { loadPoke5eData } from "./data-service.mjs";
import { MODULE_ID, displayPokemonName } from "./model.mjs";
import {
  applyPokemonAbilityAdvancement,
  evolutionStageCount,
  pokemonAdvancementsBetween
} from "./progression.mjs";
import { trainerPathFeatCost } from "./trainer-path-rules.mjs";

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
  if (decision.feat) decision.featPoints = trainerPathFeatCost(pokemonItem.parent, decision.feat, decision.featPoints);

  const currentAttributes = foundry.utils.deepClone(instance.attributes ?? species.attributes ?? {});
  const abilityResult = applyPokemonAbilityAdvancement(currentAttributes, decision.allocation, advancement, decision.featPoints);
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

async function promptPokemonAdvancement(item, instance, species, advancement, stageCount) {
  const attributes = instance.attributes ?? species.attributes ?? {};
  const asi = advancement.abilityPoints ? `<fieldset class="poke5e-asi-allocation">
    <legend>Mejoras de característica · ${advancement.abilityPoints} puntos</legend>
    <p>Esta línea tiene ${stageCount} etapa${stageCount === 1 ? "" : "s"}. Puedes reservar hasta ${advancement.featPointLimit} puntos para una dote.${advancement.peakPower ? ` Poder Máximo permite superar 20 hasta ${Math.max(...advancement.asi.map(entry => entry.cap))}.` : ""}</p>
    <div>${Object.entries(ABILITIES).map(([key, label]) => `<label><span>${label} (${Number(attributes[key]) || 10})</span><input type="number" name="asi-${key}" min="0" max="${advancement.abilityPoints}" step="1" value="0"></label>`).join("")}</div>
    <label><span>Puntos para dote</span><input type="number" name="featPoints" min="0" max="${advancement.featPointLimit}" step="1" value="0"></label>
    <label><span>Dote o nota (opcional)</span><input type="text" name="feat" maxlength="120" placeholder="Nombre de la dote"></label>
    <p>Poké Mentor reduce Movimiento adicional a 1 punto; Guru reduce Incansable a 1 punto cuando se cumplen sus niveles.</p>
  </fieldset>` : "";
  const features = [
    `${advancement.hitPointLevels} tirada${advancement.hitPointLevels === 1 ? "" : "s"} de ${species.hitDice ?? "d8"} + CON para PG`,
    `${advancement.moveReplacements} sustitución${advancement.moveReplacements === 1 ? "" : "es"} de movimiento disponible${advancement.moveReplacements === 1 ? "" : "s"}`,
    advancement.moveLevels.length ? `Nuevos movimientos: niveles ${advancement.moveLevels.join(", ")}` : "",
    advancement.damageLevels.length ? `Aumento de daño: niveles ${advancement.damageLevels.join(", ")}` : "",
    advancement.peakPower ? "Poder Máximo" : ""
  ].filter(Boolean);
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("POKE5E.Advancement.WindowTitle", { pokemon: displayPokemonName(item), level: advancement.to }) },
      content: `<div class="poke5e-advancement-dialog">
        <p>Aplica los beneficios pendientes de los niveles ${advancement.from + 1}–${advancement.to}.</p>
        <ul>${features.map(feature => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>
        <label><span>Puntos de golpe</span><select name="hitPointMethod"><option value="average">Usar la media</option><option value="roll">Tirar los dados</option></select></label>
        ${asi}
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: game.i18n.localize("POKE5E.Advancement.Apply"),
        icon: "fa-solid fa-arrow-up",
        callback: (event, button) => ({
          hitPointMethod: button.form.elements.hitPointMethod.value === "roll" ? "roll" : "average",
          allocation: Object.fromEntries(Object.keys(ABILITIES).map(key => [key, Number(button.form.elements[`asi-${key}`]?.value) || 0])),
          featPoints: Number(button.form.elements.featPoints?.value) || 0,
          feat: String(button.form.elements.feat?.value ?? "").trim()
        })
      }
    });
  } catch {
    return null;
  }
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
