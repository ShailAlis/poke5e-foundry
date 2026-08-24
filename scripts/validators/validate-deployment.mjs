/**
 * Validador de deployment.mjs, ejecutado por `npm run check`. Sustituye el
 * lienzo y la colección de actores de Foundry por dobles de prueba con una
 * rejilla de 100 px equivalente a 5 pies, y después importa el módulo con
 * `import()` dinámico para que encuentre esos globales ya preparados.
 *
 * Comprueba las reglas de posición (dentro de alcance, fuera de alcance y
 * casilla ocupada) y, sobre todo, que el borrado sea idempotente: dos
 * removeDeployment() simultáneos más una limpieza posterior deben producir un
 * único borrado de token y de actor.
 */
const actors = new Map();
actors.find = predicate => [...actors.values()].find(predicate);
const scene = {
  tokens: [],
  tokenDeletionCalls: 0,
  async deleteEmbeddedDocuments(type, ids) {
    if (type !== "Token") throw new Error("Unexpected embedded document type.");
    this.tokenDeletionCalls++;
    this.tokens = this.tokens.filter(token => !ids.includes(token.id));
  }
};

const settings = new Map([["core.permissions", { ACTOR_CREATE: [3, 4], TOKEN_CREATE: [3, 4] }], ["poke5e-foundry.grantedDeploymentPermissions", false]]);
globalThis.game = {
  actors, scenes: [scene], combats: { contents: [] },
  settings: {
    get: (scope, key) => settings.get(`${scope}.${key}`),
    set: async (scope, key, value) => { settings.set(`${scope}.${key}`, value); }
  }
};
globalThis.CONST = { USER_ROLES: { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 } };
globalThis.foundry = {
  utils: {
    deepClone: value => structuredClone(value),
    escapeHTML: value => String(value)
  }
};
const notifications = [];
globalThis.ui = { notifications: { info: message => notifications.push(message), warn: message => notifications.push(message) } };
const sceneRect = { contains: (x, y) => x >= 0 && y >= 0 && x < 1000 && y < 1000 };
globalThis.canvas = {
  dimensions: { sceneRect },
  grid: {
    distance: 5,
    isGridless: false,
    sizeX: 100,
    sizeY: 100,
    getTopLeftPoint: point => ({ x: Math.floor(point.x / 100) * 100, y: Math.floor(point.y / 100) * 100 }),
    measurePath: ([origin, destination]) => ({ distance: (Math.hypot(destination.x - origin.x, destination.y - origin.y) / 100) * 5 })
  },
  tokens: { placeables: [] }
};
const { actorReturnsUpright, cleanDeploymentActor, deployPokemon, deploymentActorName, deploymentFootprintPositions, deploymentPosition, ensureDeploymentPermissions, isAllowedDeployment, joinTrainerCombat, pokemonZeroHpOutcome, removeDeployment, syncDeploymentHp, trainerCombatForToken } = await import("../world/deployment.mjs");

if (pokemonZeroHpOutcome("wild") !== "defeated") throw new Error("Wild Pokémon should be defeated at 0 HP.");
if (pokemonZeroHpOutcome("deployed") !== "death-saves") throw new Error("Trainer Pokémon should make death saves at 0 HP.");

const combatTrainerToken = { id: "trainer-token", parent: { id: "scene" } };
const combatPokemonToken = { id: "deployed-token", parent: { id: "scene" }, hidden: false };
const trainerCombatant = { id: "trainer-combatant", tokenId: combatTrainerToken.id, initiative: 14 };
const combatPokemonCombatants = [];
const trainerCombat = {
  scene: { id: "scene" },
  combatants: [trainerCombatant],
  async createEmbeddedDocuments(type, sources) {
    if (type !== "Combatant") throw new Error("Unexpected embedded combat document type.");
    const created = sources.map((source, index) => ({ id: `pokemon-combatant-${index}`, ...source, initiative: null }));
    this.combatants.push(...created);
    combatPokemonCombatants.push(...created);
    return created;
  },
  async rollInitiative(ids) {
    for (const combatant of this.combatants) if (ids.includes(combatant.id)) combatant.initiative = 12;
  }
};
game.combat = trainerCombat;
game.combats.contents = [trainerCombat];
if (trainerCombatForToken(combatTrainerToken) !== trainerCombat) throw new Error("The Trainer's encounter was not detected.");
const joinedCombatant = await joinTrainerCombat(combatTrainerToken, combatPokemonToken, { id: "deployed-pokemon" });
if (!joinedCombatant || joinedCombatant.initiative !== 12 || combatPokemonCombatants.length !== 1) throw new Error("The deployed Pokémon did not join combat and roll initiative.");
await joinTrainerCombat(combatTrainerToken, combatPokemonToken, { id: "deployed-pokemon" });
if (combatPokemonCombatants.length !== 1) throw new Error("The deployed Pokémon was added to combat more than once.");
game.combat = null;
game.combats.contents = [];

await ensureDeploymentPermissions();
const grantedPermissions = settings.get("core.permissions");
for (const key of ["ACTOR_CREATE", "TOKEN_CREATE", "TOKEN_DELETE"]) {
  for (const role of [CONST.USER_ROLES.PLAYER, CONST.USER_ROLES.TRUSTED]) {
    if (!grantedPermissions[key]?.includes(role)) throw new Error(`${key} should include role ${role} after ensureDeploymentPermissions().`);
  }
}
if (!grantedPermissions.ACTOR_CREATE.includes(CONST.USER_ROLES.ASSISTANT)) throw new Error("ensureDeploymentPermissions() should not remove pre-existing roles.");
if (!settings.get("poke5e-foundry.grantedDeploymentPermissions")) throw new Error("ensureDeploymentPermissions() should mark itself as already run.");
notifications.length = 0;
await ensureDeploymentPermissions();
if (notifications.length) throw new Error("ensureDeploymentPermissions() should not re-notify once already granted.");

const actorKind = (type, kind = null) => ({ type, getFlag: () => kind });
if (!actorReturnsUpright(actorKind("character"))) throw new Error("Player Trainers should return upright after movement.");
if (!actorReturnsUpright(actorKind("npc", "npc-trainer"))) throw new Error("NPC Trainers should return upright after movement.");
if (!actorReturnsUpright(actorKind("npc", "deployed"))) throw new Error("Deployed Pokémon should return upright after movement.");
if (actorReturnsUpright(actorKind("npc"))) throw new Error("Unrelated NPCs should retain their movement rotation.");

const trainerToken = { center: { x: 50, y: 50 }, document: { x: 0, y: 0 }, w: 100, h: 100 };
canvas.tokens.placeables = [trainerToken];
const tokenData = { width: 1, height: 1 };
const largeFootprint = deploymentFootprintPositions({ x: 100, y: 200 }, { width: 2, height: 2 });
if (JSON.stringify(largeFootprint) !== JSON.stringify([
  { x: 100, y: 200 }, { x: 100, y: 300 }, { x: 200, y: 200 }, { x: 200, y: 300 }
])) throw new Error("The deployment highlight does not cover the full token footprint.");
const validPosition = deploymentPosition({ x: 250, y: 50 }, tokenData);
const distantPosition = deploymentPosition({ x: 350, y: 50 }, tokenData);
if (!isAllowedDeployment(validPosition, trainerToken, tokenData)) throw new Error("A free position at 10 feet should be allowed.");
if (isAllowedDeployment(distantPosition, trainerToken, tokenData)) throw new Error("A position beyond 10 feet should be rejected.");
canvas.tokens.placeables.push({ document: { x: validPosition.x, y: validPosition.y }, w: 100, h: 100 });
if (isAllowedDeployment(validPosition, trainerToken, tokenData)) throw new Error("An occupied deployment position should be rejected.");
canvas.tokens.placeables.pop();

let actorDeletionCalls = 0;
const actor = {
  id: "deployed-pokemon",
  getFlag: (scope, key) => key === "kind" ? "deployed" : null,
  async delete() {
    actorDeletionCalls++;
    actors.delete(this.id);
  }
};
actors.set(actor.id, actor);
scene.tokens = [{ id: "pokemon-token", actorId: actor.id }];

await Promise.all([
  removeDeployment(actor, { deleteTokens: true }),
  removeDeployment(actor, { deleteTokens: true })
]);
await cleanDeploymentActor({ actorId: actor.id });

if (scene.tokenDeletionCalls !== 1) throw new Error(`Expected one token deletion, got ${scene.tokenDeletionCalls}.`);
if (actorDeletionCalls !== 1) throw new Error(`Expected one actor deletion, got ${actorDeletionCalls}.`);
if (actors.has(actor.id)) throw new Error("The deployed actor still exists after recall.");

const trainer = { isOwner: true, name: "Ash" };
const faintedInstance = { hp: { value: 4, max: 12 } };
const pokemonItem = {
  name: "Pikachu",
  uuid: "Actor.trainer.Item.pokemon",
  parent: trainer,
  getFlag: (scope, key) => key === "instance" ? faintedInstance : key === "species" ? { name: "Pikachu" } : key === "kind" ? "pokemon" : null,
  async setFlag(scope, key, value) {
    Object.assign(faintedInstance, value);
  }
};
if (deploymentActorName(pokemonItem) !== "Pikachu [Ash]") throw new Error("The deployed actor name does not include its Trainer.");
const faintedActor = {
  id: "fainted-pokemon",
  name: "Pikachu [Ash]",
  system: { attributes: { hp: { value: 0, max: 12 }, death: { success: 0, failure: 0 } }, traits: { important: false } },
  zeroHpOutcome: null,
  getFlag(scope, key) {
    return key === "kind" ? "deployed" : key === "pokemonItemUuid" ? pokemonItem.uuid : key === "zeroHpOutcome" ? this.zeroHpOutcome : null;
  },
  async update(changes) {
    if (changes["system.traits.important"] != null) this.system.traits.important = changes["system.traits.important"];
    if (changes["flags.poke5e-foundry.zeroHpOutcome"]) this.zeroHpOutcome = changes["flags.poke5e-foundry.zeroHpOutcome"];
    if (changes["flags.poke5e-foundry.-=zeroHpOutcome"] === null) this.zeroHpOutcome = null;
    if (changes["system.attributes.death.success"] != null) this.system.attributes.death.success = changes["system.attributes.death.success"];
    if (changes["system.attributes.death.failure"] != null) this.system.attributes.death.failure = changes["system.attributes.death.failure"];
  },
  async delete() {
    actors.delete(this.id);
  }
};
globalThis.fromUuid = async uuid => uuid === pokemonItem.uuid ? pokemonItem : null;
actors.set(faintedActor.id, faintedActor);
scene.tokens = [{ id: "fainted-token", actorId: faintedActor.id }];
await syncDeploymentHp(faintedActor);
if (faintedInstance.hp.value !== 0) throw new Error("Fainted HP was not saved on the trainer's Pokémon.");
if (!actors.has(faintedActor.id) || !scene.tokens.some(token => token.actorId === faintedActor.id)) throw new Error("A Trainer Pokémon at 0 HP should remain deployed for death saves.");
if (!faintedActor.system.traits.important || faintedActor.zeroHpOutcome !== "death-saves") throw new Error("Death saves were not enabled for the Trainer Pokémon.");
if (!notifications.some(message => message.includes("salvaciones"))) throw new Error("The death-save notification was not shown.");

canvas.ready = true;
canvas.scene = scene;
await deployPokemon(pokemonItem);
if (!notifications.some(message => message.includes("no puede salir"))) throw new Error("A fainted Pokémon was allowed to deploy.");

faintedActor.system.attributes.hp.value = 4;
faintedActor.system.attributes.death = { success: 2, failure: 1 };
await syncDeploymentHp(faintedActor);
if (faintedActor.zeroHpOutcome || faintedActor.system.attributes.death.success || faintedActor.system.attributes.death.failure) {
  throw new Error("Healing a Trainer Pokémon should reset its death saves and zero-HP outcome.");
}

const wildInstance = { hp: { value: 5, max: 10 }, abilities: [] };
const wildPokemonItem = {
  getFlag: (scope, key) => key === "kind" ? "pokemon" : key === "instance" ? wildInstance : key === "species" ? { name: "Rattata" } : null,
  async setFlag(scope, key, value) { Object.assign(wildInstance, value); }
};
const defeatedWildActor = {
  id: "zero-hp-wild",
  name: "Rattata [Salvaje]",
  items: [wildPokemonItem],
  system: { attributes: { hp: { value: 0, max: 10 } }, traits: {} },
  zeroHpOutcome: null,
  getFlag(scope, key) { return key === "kind" ? "wild" : key === "zeroHpOutcome" ? this.zeroHpOutcome : null; },
  async update(changes) {
    if (changes["flags.poke5e-foundry.zeroHpOutcome"]) this.zeroHpOutcome = changes["flags.poke5e-foundry.zeroHpOutcome"];
  }
};
const wildCombatant = { id: "wild-combatant", actor: defeatedWildActor, actorId: defeatedWildActor.id, defeated: false };
game.combats.contents = [{
  combatants: [wildCombatant],
  async updateEmbeddedDocuments(type, updates) {
    if (type !== "Combatant") throw new Error("Unexpected combat document type.");
    for (const update of updates) if (update._id === wildCombatant.id) wildCombatant.defeated = update.defeated;
  }
}];
await syncDeploymentHp(defeatedWildActor);
if (!wildCombatant.defeated || defeatedWildActor.zeroHpOutcome !== "defeated") throw new Error("A wild Pokémon at 0 HP was not marked defeated.");

let wildDeletionCalls = 0;
const wildActor = {
  id: "wild-pokemon",
  getFlag: (scope, key) => key === "kind" ? "wild" : null,
  canUserModify: user => user.id === "gm",
  async delete() {
    wildDeletionCalls++;
    actors.delete(this.id);
  }
};
actors.set(wildActor.id, wildActor);
scene.tokens = [];
game.user = { id: "player" };
await cleanDeploymentActor({ actorId: wildActor.id });
if (wildDeletionCalls !== 0 || !actors.has(wildActor.id)) throw new Error("A player tried to delete a wild actor after its token disappeared.");
game.user = { id: "gm" };
await cleanDeploymentActor({ actorId: wildActor.id });
if (wildDeletionCalls !== 1 || actors.has(wildActor.id)) throw new Error("The wild actor was not removed after deleting its final token.");

console.log("Validated idempotent Pokémon deployment cleanup and one-time permission grant.");
