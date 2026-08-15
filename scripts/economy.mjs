/** Economía Pokémon sobre el campo `gp` de D&D 5e por compatibilidad. */
export const POKEDOLLAR_DENOMINATION = "gp";
export const POKEDOLLAR_SYMBOL = "₽";
export const UNUSED_DND_DENOMINATIONS = ["pp", "ep", "sp", "cp"];

/** Saldo entero y no negativo de un Entrenador. */
export function pokedollars(actor) {
  return Math.max(0, Math.floor(Number(actor?.system?.currency?.[POKEDOLLAR_DENOMINATION]) || 0));
}

/** Bloque monetario inicial sin las monedas ajenas al mundo Pokémon. */
export function pokedollarCurrency(amount = 0) {
  return { pp: 0, gp: Math.max(0, Math.floor(Number(amount) || 0)), ep: 0, sp: 0, cp: 0 };
}

/** Actualiza el único saldo que presenta el módulo. */
export async function updatePokedollars(actor, amount) {
  if (!actor?.isOwner) return false;
  await actor.update({ [`system.currency.${POKEDOLLAR_DENOMINATION}`]: Math.max(0, Math.floor(Number(amount) || 0)) });
  return true;
}

/** Renombra la denominación técnica `gp` para precios y campos nativos. */
export function configurePokedollarEconomy() {
  const currency = globalThis.CONFIG?.DND5E?.currencies?.[POKEDOLLAR_DENOMINATION];
  if (!currency || typeof currency !== "object") return;
  try {
    currency.label = "POKE5E.Currency.Name";
    currency.abbreviation = POKEDOLLAR_SYMBOL;
  } catch (error) {
    console.warn("poke5e-foundry | Could not relabel the D&D currency configuration", error);
  }
}

/** Oculta las cuatro monedas de D&D y marca el campo usado como Pokédólares. */
export function adaptTrainerCurrencyFields(root) {
  if (!root?.querySelectorAll) return;
  for (const input of root.querySelectorAll("input[name^='system.currency.']")) {
    const denomination = input.name.split(".").at(-1);
    const wrapper = singleCurrencyWrapper(input);
    if (UNUSED_DND_DENOMINATIONS.includes(denomination)) {
      (wrapper ?? input).classList.add("poke5e-unused-currency");
      continue;
    }
    if (denomination !== POKEDOLLAR_DENOMINATION) continue;
    input.setAttribute("aria-label", game.i18n.localize("POKE5E.Economy.Pokedollars"));
    input.setAttribute("title", game.i18n.localize("POKE5E.Economy.PokedollarsSymbol"));
    (wrapper ?? input).classList.add("poke5e-pokedollars");
  }
}

function singleCurrencyWrapper(input) {
  const label = input.closest("label");
  if (label) return label;
  const parent = input.parentElement;
  return parent?.querySelectorAll("input[name^='system.currency.']").length === 1 ? parent : null;
}
