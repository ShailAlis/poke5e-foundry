import { pokemonDefenses, typeLabel } from "./combat.mjs";
import { experienceAtLevel } from "./progression.mjs";

export const MODULE_ID = "poke5e-foundry";
export const MODULE_PATH = `modules/${MODULE_ID}`;

export const PACKS = {
  species: { name: "poke5e-species", label: "Pokémon 5e — Especies" },
  moves: { name: "poke5e-moves", label: "Pokémon 5e — Movimientos" },
  abilities: { name: "poke5e-abilities", label: "Pokémon 5e — Habilidades" },
  gear: { name: "poke5e-gear", label: "Pokémon 5e — Objetos" },
  progression: { name: "poke5e-progression", label: "Pokémon 5e — Clases y progresión" }
};

export const TRAINER_FEATURES = [
  feature(1, "starter-pokemon", "Pokémon inicial", "Elige un Pokémon sin evolucionar de SR 1/2 o inferior. Empieza con sus estadísticas base; puedes elegir su naturaleza y una habilidad que no sea oculta."),
  feature(1, "specialization-1", "Especialización de Entrenador", "Elige tu primera especialización de Entrenador. Sus beneficios representan el ámbito en el que has centrado tu formación."),
  feature(2, "trainer-path-1", "Camino de Entrenador", "Elige un Camino de Entrenador. Este camino concede rasgos adicionales a los niveles 2, 5, 9 y 15."),
  feature(3, "control-upgrade-5", "Mejora de control (SR 5)", "Puedes dar órdenes con normalidad a Pokémon de hasta SR 5. Los Pokémon que superen tu límite de control pueden negarse a obedecer."),
  feature(4, "ability-score-improvement-4", "Mejora de característica", "Aumenta tus puntuaciones de característica o elige una dote para la que cumplas los requisitos, según las reglas de D&D 5e.", false),
  feature(5, "trainer-path-5", "Rasgo del Camino de Entrenador", "Obtienes el rasgo de nivel 5 de tu Camino de Entrenador."),
  feature(5, "pokeslot-4", "Pokéslot adicional (4)", "Tu capacidad aumenta a cuatro Pokéslots. Los Pokémon que no estén en el equipo activo permanecen en tu reserva."),
  feature(6, "control-upgrade-8", "Mejora de control (SR 8)", "Tu límite de control aumenta a SR 8."),
  feature(7, "specialization-2", "Especialización de Entrenador adicional", "Obtienes una segunda especialización de Entrenador."),
  feature(8, "control-upgrade-10", "Mejora de control (SR 10)", "Tu límite de control aumenta a SR 10."),
  feature(8, "ability-score-improvement-8", "Mejora de característica", "Aumenta tus puntuaciones de característica o elige una dote para la que cumplas los requisitos, según las reglas de D&D 5e.", false),
  feature(9, "trainer-path-9", "Rasgo del Camino de Entrenador", "Obtienes el rasgo de nivel 9 de tu Camino de Entrenador."),
  feature(10, "trainers-resolve", "Determinación del Entrenador", "Eres inmune a la condición Asustado y obtienes competencia en una segunda tirada de salvación a tu elección."),
  feature(10, "pokeslot-5", "Pokéslot adicional (5)", "Tu capacidad aumenta a cinco Pokéslots."),
  feature(11, "control-upgrade-12", "Mejora de control (SR 12)", "Tu límite de control aumenta a SR 12."),
  feature(12, "ability-score-improvement-12", "Mejora de característica", "Aumenta tus puntuaciones de característica o elige una dote para la que cumplas los requisitos, según las reglas de D&D 5e.", false),
  feature(13, "pokemon-tracker", "Rastreador Pokémon", "Una vez por descanso largo puedes buscar Pokémon cercanos y conocer qué especies pueden encontrarse en la zona. Además, obtienes Pericia en Trato con Animales."),
  feature(14, "control-upgrade-14", "Mejora de control (SR 14)", "Tu límite de control aumenta a SR 14."),
  feature(15, "trainer-path-15", "Rasgo del Camino de Entrenador", "Obtienes el rasgo de nivel 15 de tu Camino de Entrenador."),
  feature(15, "pokeslot-6", "Pokéslot adicional (6)", "Tu capacidad aumenta a seis Pokéslots, el tamaño máximo de tu equipo activo."),
  feature(16, "ability-score-improvement-16", "Mejora de característica", "Aumenta tus puntuaciones de característica o elige una dote para la que cumplas los requisitos, según las reglas de D&D 5e.", false),
  feature(17, "control-upgrade-15", "Mejora de control (SR 15)", "Tu límite de control aumenta a SR 15."),
  feature(18, "specialization-3", "Especialización de Entrenador adicional", "Obtienes una tercera especialización de Entrenador."),
  feature(19, "epic-boon", "Don épico", "Obtienes un Don Épico u otra dote para la que cumplas los requisitos. El Don del Destino es una opción recomendada.", false),
  feature(20, "master-trainer", "Maestro Entrenador", "Cuando tú o uno de tus Pokémon falléis una salvación, puedes convertir el fallo en éxito. Puedes hacerlo dos veces y recuperas todos los usos con un descanso largo.")
];

export function getPack(key) {
  return game.packs.get(`world.${PACKS[key].name}`);
}

export function speciesItemSource(species, movesById = new Map(), evolutions = []) {
  const startingMoves = (species.moves?.start ?? []).map(id => ({ id, pp: Math.max(Number(movesById.get(id)?.pp) || 0, 0) }));
  return {
    name: species.name,
    type: "feat",
    img: remoteAssetUrl(species.media?.sprite) || "icons/svg/mystery-man.svg",
    system: { description: { value: speciesDescription(species, evolutions), chat: "" } },
    flags: { [MODULE_ID]: { kind: "species", sourceId: species.id, species, startingMoves } }
  };
}

export function moveItemSource(move) {
  return {
    name: move.name,
    type: "feat",
    img: "icons/svg/sword.svg",
    system: { description: { value: moveDescription(move), chat: "" } },
    flags: { [MODULE_ID]: { kind: "move", sourceId: move.id, move } }
  };
}

export function abilityItemSource(ability) {
  return {
    name: ability.name,
    type: "feat",
    img: "icons/svg/aura.svg",
    system: { description: { value: paragraphs([ability.description]), chat: "" } },
    flags: { [MODULE_ID]: { kind: "ability", sourceId: ability.id } }
  };
}

export function gearItemSource(item) {
  return {
    name: item.name,
    type: "loot",
    img: remoteAssetUrl(item.media?.sprite) || "icons/svg/item-bag.svg",
    system: {
      description: { value: paragraphs(item.description), chat: "" },
      quantity: 1,
      price: { value: Number(item.cost) || 0, denomination: "gp" }
    },
    flags: { [MODULE_ID]: { kind: "gear", sourceId: item.id, category: item.type ?? item.category ?? "" } }
  };
}

export function trainerFeatureSources() {
  return TRAINER_FEATURES.filter(entry => entry.grant).map(entry => ({
    name: entry.name,
    type: "feat",
    img: "icons/svg/upgrade.svg",
    system: {
      description: { value: `<p>${escapeHtml(entry.description)}</p>`, chat: "" },
      identifier: `trainer-${entry.id}`,
      requirements: `Entrenador ${entry.level}`,
      type: { value: "class", subtype: "" }
    },
    flags: { [MODULE_ID]: { kind: "trainer-feature", sourceId: `trainer-feature-${entry.id}`, level: entry.level } }
  }));
}

export function trainerClassSource(featureUuids = new Map()) {
  const advancement = {
    P5eHitPoints0001: {
      _id: "P5eHitPoints0001",
      type: "HitPoints",
      configuration: {},
      value: {}
    },
    P5eTraits0000001: {
      _id: "P5eTraits0000001",
      type: "Trait",
      level: 1,
      title: "Competencias de Entrenador",
      configuration: {
        allowReplacements: false,
        grants: ["saves:cha", "skills:ani"],
        choices: [{
          count: 2,
          pool: ["skills:acr", "skills:ath", "skills:ins", "skills:itm", "skills:inv", "skills:med", "skills:nat", "skills:prc", "skills:prf", "skills:per", "skills:slt", "skills:ste", "skills:sur"]
        }],
        mode: "default"
      },
      value: {}
    }
  };
  const byLevel = groupFeaturesByLevel();
  for (const [level, entries] of byLevel) {
    const items = entries
      .map(entry => featureUuids.get(`trainer-feature-${entry.id}`))
      .filter(Boolean)
      .map(uuid => ({ uuid, optional: false }));
    if (!items.length) continue;
    const id = `P5eGrant${String(level).padStart(2, "0")}000000`;
    advancement[id] = {
      _id: id,
      type: "ItemGrant",
      level,
      title: `Rasgos de Entrenador — nivel ${level}`,
      configuration: { items, optional: false, spell: null },
      value: {}
    };
  }
  for (const level of [4, 8, 12, 16, 19]) {
    const id = `P5eASI${String(level).padStart(2, "0")}00000000`;
    advancement[id] = {
      _id: id,
      type: "AbilityScoreImprovement",
      level,
      title: level === 19 ? "Don épico" : "Mejora de característica",
      configuration: { cap: 2, fixed: {}, locked: [], points: 2 },
      value: {}
    };
  }
  return {
    name: "Entrenador",
    type: "class",
    img: "icons/svg/people.svg",
    system: {
      description: { value: trainerClassDescription(), chat: "" },
      identifier: "trainer",
      hd: { denomination: "d6", spent: 0, additional: "" },
      levels: 1,
      primaryAbility: { value: ["cha"], all: true },
      properties: [],
      spellcasting: { progression: "none", ability: "" },
      advancement
    },
    flags: { [MODULE_ID]: { kind: "trainer-class", sourceId: "trainer-class" } }
  };
}

export function pokemonItemSourceFromSpecies(speciesDocument) {
  const source = speciesDocument.toObject ? speciesDocument.toObject() : foundry.utils.deepClone(speciesDocument);
  const species = source.flags?.[MODULE_ID]?.species;
  if (!species) throw new Error("La entrada no contiene datos de especie Pokémon.");
  const ppByMove = new Map((source.flags?.[MODULE_ID]?.startingMoves ?? []).map(entry => [entry.id, entry.pp]));
  const moves = (species.moves?.start ?? []).slice(0, 4).map(id => {
    const pp = Math.max(Number(ppByMove.get(id)) || 0, 0);
    return { id: foundry.utils.randomID(), moveId: id, pp: { value: pp, max: pp } };
  });
  const abilities = (species.abilities ?? []).filter(entry => !entry.hidden).map(entry => entry.id);
  delete source._id;
  delete source.folder;
  return {
    ...source,
    name: species.name,
    flags: {
      ...(source.flags ?? {}),
      [MODULE_ID]: {
        kind: "pokemon",
        sourceId: species.id,
        species,
        instance: {
          nickname: "",
          level: Math.max(1, Number(species.minLevel) || 1),
          experience: experienceAtLevel(Math.max(1, Number(species.minLevel) || 1)),
          hp: { value: Number(species.hp) || 1, max: Number(species.hp) || 1 },
          ac: Number(species.ac) || 10,
          attributes: foundry.utils.deepClone(species.attributes ?? {}),
          nature: "",
          gender: randomGenderForRatio(species.gender),
          shiny: false,
          inTeam: true,
          status: "",
          notes: "",
          abilities,
          moves
        }
      }
    }
  };
}

export function normalizeDroppedSpecies(item) {
  const flags = item.flags?.[MODULE_ID];
  if (flags?.kind !== "species" || !item.parent || item.parent.documentName !== "Actor") return false;
  const source = pokemonItemSourceFromSpecies(item.toObject());
  item.updateSource(source);
  return true;
}

export function getPokemonItems(actor) {
  return actor?.items?.filter(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? [];
}

export function randomGenderForRatio(ratio, random = Math.random) {
  const [female, male] = String(ratio ?? "0:0").split(":").map(value => Math.max(0, Number(value) || 0));
  const total = female + male;
  if (!total) return "none";
  return random() < female / total ? "female" : "male";
}

export function displayPokemonName(item) {
  const instance = item.getFlag(MODULE_ID, "instance") ?? {};
  return instance.nickname?.trim() || item.name;
}

export function remoteAssetUrl(path) {
  const baseUrl = String(game.settings.get(MODULE_ID, "assetBaseUrl") ?? "").replace(/\/$/, "");
  return assetUrl(baseUrl, path);
}

export function displayAssetUrl(path, fallback = "") {
  const original = String(path ?? "").trim();
  if (!original) return fallback;
  if (/^https?:\/\//i.test(original)) return original;
  const normalized = original.replace(/^\/+/, "");
  const modulePrefix = `${MODULE_PATH}/`;
  const relative = normalized.startsWith(modulePrefix) ? normalized.slice(modulePrefix.length) : normalized;
  if (relative.startsWith("assets/")) return remoteAssetUrl(relative) || original;
  return original;
}

export function portraitUrl(species, shiny = false) {
  if (shiny) return remoteAssetUrl(species.media?.mainShiny) || remoteAssetUrl(species.media?.spriteShiny) || remoteAssetUrl(species.media?.main) || remoteAssetUrl(species.media?.sprite) || "icons/svg/mystery-man.svg";
  return remoteAssetUrl(species.media?.main) || remoteAssetUrl(species.media?.sprite) || "icons/svg/mystery-man.svg";
}

export function assetUrl(baseUrl, path) {
  if (!baseUrl || !path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
}

function speciesDescription(species, evolutions = []) {
  const types = (species.type ?? []).map(titleCase).join(" / ");
  const defenses = pokemonDefenses(species.type);
  const evolutionText = evolutions.length
    ? evolutions.map(evolution => `${escapeHtml(titleCase(evolution.to))} (${evolution.conditions.map(conditionShortLabel).join(", ")})`).join(" · ")
    : "No evoluciona";
  return `<p><strong>#${String(species.number).padStart(4, "0")} · ${escapeHtml(types)}</strong></p>${paragraphs([species.description])}
    <p><strong>CA:</strong> ${species.ac} · <strong>PG:</strong> ${species.hp} · <strong>SR:</strong> ${species.sr} · <strong>Sexo F:M:</strong> ${escapeHtml(species.gender ?? "0:0")}</p>
    <p><strong>Vulnerable:</strong> ${typeList(defenses.vulnerabilities)}<br><strong>Resiste:</strong> ${typeList(defenses.resistances)}<br><strong>Inmune:</strong> ${typeList(defenses.immunities)}</p>
    <p><strong>Evolución:</strong> ${evolutionText}</p>`;
}

function typeList(types) {
  return types.length ? types.map(type => escapeHtml(typeLabel(type))).join(", ") : "—";
}

function conditionShortLabel(condition) {
  if (condition.type === "level") return `nivel ${condition.value}`;
  if (condition.type === "item") return `objeto: ${escapeHtml(condition.value)}`;
  if (condition.type === "loyalty") return `vínculo +${condition.value}`;
  if (condition.type === "move") return `movimiento: ${escapeHtml(condition.value)}`;
  if (condition.type === "move-type") return `movimiento ${escapeHtml(typeLabel(condition.value))}`;
  if (condition.type === "gender") return condition.value === "female" ? "hembra" : "macho";
  if (condition.type === "time") return `momento: ${escapeHtml(condition.value)}`;
  return escapeHtml(condition.value);
}

function moveDescription(move) {
  const details = [
    `<strong>Tipo:</strong> ${escapeHtml(move.type ?? "—")}`,
    `<strong>Tiempo:</strong> ${escapeHtml(move.time ?? "—")}`,
    `<strong>Rango:</strong> ${escapeHtml(move.range ?? "—")}`,
    `<strong>Duración:</strong> ${escapeHtml(move.duration ?? "—")}`,
    `<strong>PP:</strong> ${Number(move.pp) || 0}`
  ].join(" · ");
  return `<p class="poke5e-move-meta">${details}</p>${paragraphs(move.description)}${move.higherLevels ? `<h3>A niveles superiores</h3>${paragraphs([move.higherLevels])}` : ""}`;
}

function paragraphs(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return list.map(value => `<p>${escapeHtml(value).replace(/\n/g, "<br>")}</p>`).join("");
}

function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function titleCase(value) {
  return String(value).split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function feature(level, id, name, description, grant = true) {
  return { level, id, name, description, grant };
}

function trainerClassDescription() {
  const rows = [...groupFeaturesByLevel()].map(([level, entries]) => {
    const slots = level < 5 ? 3 : level < 10 ? 4 : level < 15 ? 5 : 6;
    const maxSr = level < 3 ? 2 : level < 6 ? 5 : level < 8 ? 8 : level < 11 ? 10 : level < 14 ? 12 : level < 17 ? 14 : 15;
    return `<tr><td>${level}</td><td>${entries.map(entry => escapeHtml(entry.name)).join(", ")}</td><td>${slots}</td><td>${maxSr}</td></tr>`;
  }).join("");
  return `<h2>Entrenador Pokémon</h2>
    <p>Los Entrenadores forman equipos con sus Pokémon y los dirigen dentro y fuera del combate.</p>
    <h3>Rasgos principales</h3>
    <p><strong>Característica principal:</strong> Carisma · <strong>Dado de golpe:</strong> d6 · <strong>Salvaciones:</strong> Carisma</p>
    <p><strong>Habilidades:</strong> Trato con Animales y otras dos a elegir entre Acrobacias, Atletismo, Perspicacia, Intimidación, Investigación, Medicina, Naturaleza, Percepción, Interpretación, Persuasión, Juego de Manos, Sigilo y Supervivencia.</p>
    <p><strong>Equipo inicial:</strong> 5 Poké Balls, una Poción, Licencia de Entrenador, Pokédex y un Pokémon inicial.</p>
    <h3>Progresión</h3>
    <table><thead><tr><th>Nivel</th><th>Rasgos</th><th>Pokéslots</th><th>SR máximo</th></tr></thead><tbody>${rows}</tbody></table>
    <p><a href="https://poke5e.app/es/reference/trainer-class" target="_blank" rel="noopener">Consultar las reglas completas de la clase</a></p>`;
}

function groupFeaturesByLevel() {
  const grouped = new Map();
  for (const entry of TRAINER_FEATURES) {
    const entries = grouped.get(entry.level) ?? [];
    entries.push(entry);
    grouped.set(entry.level, entries);
  }
  return grouped;
}
