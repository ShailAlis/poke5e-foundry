/**
 * Recuperación fuera de combate de un Pokémon debilitado. Devuelve una copia
 * para que la ficha pueda guardarla como un único cambio de `instance`.
 */
export function fullyHealedPokemonInstance(instance = {}) {
  const healed = structuredClone(instance ?? {});
  const maximumHp = Math.max(1, Number(healed.hp?.max) || 1);
  healed.hp = { ...(healed.hp ?? {}), value: maximumHp, max: maximumHp };
  healed.conditions = [];
  healed.moves = (healed.moves ?? []).map(entry => {
    if (!entry?.pp) return entry;
    const maximumPp = Math.max(0, Number(entry.pp.max) || 0);
    return { ...entry, pp: { ...entry.pp, value: maximumPp, max: maximumPp } };
  });
  return healed;
}
