/**
 * Contenido del compendio `poke5e-conditions`: los 8 estados alterados del
 * módulo y un catálogo de subidas/bajadas de característica al estilo Pokémon
 * (ataque, precisión, defensa, defensa especial y velocidad), listos para que
 * el director los arrastre directamente sobre cualquier Pokémon del mapa.
 *
 * Reutiliza pokemonStatusEffectSource() (status-effects.mjs) y
 * modifierEffectSource() (move-modifiers.mjs) —las mismas fábricas que ya usan
 * los movimientos— en vez de duplicar la forma del ActiveEffect. Solo
 * importer.mjs consume este archivo.
 */
import { MODULE_ID } from "./model.mjs";
import { POKEMON_STATUS_EFFECTS, pokemonStatusEffectSource } from "./status-effects.mjs";
import { modifierEffectSource } from "./move-modifiers.mjs";

/**
 * Un ActiveEffect por estado alterado. A diferencia de la aplicación en vivo
 * (que fija `startRound`/`startTurn` en el combate actual), aquí se omiten para
 * que Foundry los calcule él solo en el momento real de arrastrarlo sobre un
 * token —si no, cargarían la ronda en la que se generó el compendio.
 */
export function statusConditionSources() {
  return Object.keys(POKEMON_STATUS_EFFECTS).map(id => {
    const source = pokemonStatusEffectSource(id);
    const rounds = source.duration?.rounds;
    return {
      ...source,
      duration: rounds ? { rounds } : {},
      flags: { [MODULE_ID]: { ...source.flags[MODULE_ID], sourceId: id } }
    };
  });
}

/** Una subida o bajada de característica Pokémon y a qué modificador equivale en este puerto. */
function stage(id, name, description, modifiers, category) {
  const rule = { modifiers, category, stackMax: 1, durationRounds: null, consume: null, sourceOnly: false, concentration: false, repeatSave: null, description };
  const payload = { moveId: id, moveName: name, sourceCombatActorUuid: null, sourceName: "Director", linkId: null, saveDc: null, proficiency: 2 };
  const source = modifierEffectSource(rule, payload, 1);
  return { ...source, name, flags: { [MODULE_ID]: { ...source.flags[MODULE_ID], sourceId: id } } };
}

/**
 * Cinco características Pokémon en dos magnitudes (±1 y ±2), mapeadas a los
 * modificadores que ya lee pokemonCombatModifiers(): Ataque → daño, Precisión →
 * tirada de ataque, Defensa → CA, Defensa especial → todas las salvaciones y
 * Velocidad → pies de movimiento.
 */
export function statModifierSources() {
  const stats = [
    { id: "attack", name: "Ataque", build: value => ({ damage: value }) },
    { id: "accuracy", name: "Precisión", build: value => ({ attack: value }) },
    { id: "defense", name: "Defensa", build: value => ({ ac: value }) },
    { id: "special-defense", name: "Defensa especial", build: value => ({ saves: Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(key => [key, value])) }) },
    { id: "speed", name: "Velocidad", build: value => ({ speed: value * 5 }) }
  ];
  const stages = [-2, -1, 1, 2];
  return stats.flatMap(stat => stages.map(value => {
    const sign = value > 0 ? "+" : "−";
    const magnitude = Math.abs(value);
    const name = `${stat.name} ${sign}${magnitude}`;
    const description = `Etapa de característica Pokémon: ${stat.name} ${sign}${magnitude}. Se retira a mano cuando corresponda (no caduca sola).`;
    return stage(`${stat.id}-${value}`, name, description, stat.build(value), value > 0 ? "buffs" : "debuffs");
  }));
}
