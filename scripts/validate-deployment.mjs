const actors = new Map();
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
const { cleanDeploymentActor, deploymentPosition, isAllowedDeployment, removeDeployment } = await import("./deployment.mjs");

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

console.log("Validated idempotent Pokémon deployment cleanup.");
