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

globalThis.game = { actors, scenes: [scene] };
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
const { actorReturnsUpright, cleanDeploymentActor, deployPokemon, deploymentActorName, deploymentPosition, isAllowedDeployment, removeDeployment, syncDeploymentHp } = await import("./deployment.mjs");

const actorKind = (type, kind = null) => ({ type, getFlag: () => kind });
if (!actorReturnsUpright(actorKind("character"))) throw new Error("Player Trainers should return upright after movement.");
if (!actorReturnsUpright(actorKind("npc", "npc-trainer"))) throw new Error("NPC Trainers should return upright after movement.");
if (!actorReturnsUpright(actorKind("npc", "deployed"))) throw new Error("Deployed Pokémon should return upright after movement.");
if (actorReturnsUpright(actorKind("npc"))) throw new Error("Unrelated NPCs should retain their movement rotation.");

const trainerToken = { center: { x: 50, y: 50 }, document: { x: 0, y: 0 }, w: 100, h: 100 };
canvas.tokens.placeables = [trainerToken];
const tokenData = { width: 1, height: 1 };
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
  system: { attributes: { hp: { value: 0, max: 12 } } },
  getFlag: (scope, key) => key === "kind" ? "deployed" : key === "pokemonItemUuid" ? pokemonItem.uuid : null,
  async delete() {
    actors.delete(this.id);
  }
};
globalThis.fromUuid = async uuid => uuid === pokemonItem.uuid ? pokemonItem : null;
actors.set(faintedActor.id, faintedActor);
scene.tokens = [{ id: "fainted-token", actorId: faintedActor.id }];
await syncDeploymentHp(faintedActor);
if (faintedInstance.hp.value !== 0) throw new Error("Fainted HP was not saved on the trainer's Pokémon.");
if (actors.has(faintedActor.id) || scene.tokens.some(token => token.actorId === faintedActor.id)) throw new Error("A fainted deployed Pokémon was not recalled.");
if (!notifications.some(message => message.includes("debilitado"))) throw new Error("The fainted recall notification was not shown.");

canvas.ready = true;
canvas.scene = scene;
await deployPokemon(pokemonItem);
if (!notifications.some(message => message.includes("no puede salir"))) throw new Error("A fainted Pokémon was allowed to deploy.");

let wildDeletionCalls = 0;
const wildActor = {
  id: "wild-pokemon",
  getFlag: (scope, key) => key === "kind" ? "wild" : null,
  async delete() {
    wildDeletionCalls++;
    actors.delete(this.id);
  }
};
actors.set(wildActor.id, wildActor);
scene.tokens = [];
await cleanDeploymentActor({ actorId: wildActor.id });
if (wildDeletionCalls !== 1 || actors.has(wildActor.id)) throw new Error("The wild actor was not removed after deleting its final token.");

console.log("Validated idempotent Pokémon deployment cleanup.");
