/**
 * Utilidades compartidas por todo el módulo. Deliberadamente sin imports: es la
 * base del grafo de dependencias, de modo que hasta combat.mjs —que model.mjs
 * importa— puede usarla sin crear ciclos.
 *
 * Reúne las funciones que antes estaban duplicadas literalmente en una veintena
 * de archivos (escapado de HTML, capitalización, formato de cifras, elección del
 * director responsable) para que exista una única definición que mantener.
 */

/** Cachea los formateadores de Intl, cuya construcción es cara, por idioma. */
const numberFormatters = new Map();

/**
 * Escapa texto procedente de los JSON de datos antes de insertarlo en HTML.
 * Envuelve la utilidad de Foundry y cae en una implementación equivalente
 * cuando no hay entorno Foundry (los validadores que corren en Node).
 */
export function escapeHtml(value) {
  const text = String(value ?? "");
  const escape = globalThis.foundry?.utils?.escapeHTML;
  if (escape) return escape(text);
  return text.replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };

/**
 * Pasa un identificador con guiones a texto capitalizado ("water-gun" → "Water Gun").
 * Auxiliar de presentación de tipos, biomas y nombres de especie.
 */
export function titleCase(value) {
  return String(value ?? "").split("-").map(part => part.charAt(0).toLocaleUpperCase() + part.slice(1)).join(" ");
}

/** Formatea cifras (experiencia, dinero) según el idioma de la interfaz. */
export function formatNumber(value) {
  const language = globalThis.game?.i18n?.lang || "es";
  let formatter = numberFormatters.get(language);
  if (!formatter) {
    formatter = new Intl.NumberFormat(language);
    numberFormatters.set(language, formatter);
  }
  return formatter.format(Number(value) || 0);
}

/** Antepone el signo a un modificador ("+3", "-1"). */
export function signed(value) {
  return Number(value) >= 0 ? `+${value}` : String(value);
}

/** Modificador de característica de D&D 5e a partir de la puntuación. */
export function abilityModifier(score) {
  return Math.floor(((Number(score) || 10) - 10) / 2);
}

/**
 * Designa un único director para las automatizaciones que deben ejecutarse una
 * sola vez: el director activo con el id más bajo. Evita que cada cliente con
 * permisos de director duplique daños, mensajes de chat o migraciones.
 */
export function isResponsibleGm() {
  const active = game.users.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return active[0]?.id === game.user.id;
}
