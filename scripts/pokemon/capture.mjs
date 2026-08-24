/**
 * Flujo completo de captura dentro de la partida: valida objetivo, alcance,
 * nivel e inventario, reúne el contexto que exigen las reglas, pide la tirada y
 * traslada al Pokémon salvaje a su nuevo entrenador.
 *
 * Las reglas numéricas viven en capture-rules.mjs; aquí queda la interacción.
 * Como el jugador no puede borrar el actor salvaje ni escribir en otro actor, la
 * segunda mitad (completeCapture()) la ejecuta siempre el director, en local o a
 * través del socket. Lo arrancan main.mjs y los botones de captura de
 * trainer-team.mjs y trainer-actor-sheet.mjs.
 */
import { captureDifficulty, captureExperienceReward, captureHasAdvantage, capturedHitPoints, POKEBALL_IDS } from "./capture-rules.mjs";
import { hasTrainerPath, rangerCaptureAdvantage } from "../trainer/trainer-path-rules.mjs";
import { loadPoke5eData } from "../core/data-service.mjs";
import { removeDeployment } from "../world/deployment.mjs";
import { MODULE_ID, displayPokemonName, getPokemonItems, trainerLevel, trainerPokeslotLimit } from "../core/model.mjs";
import { experienceAtLevel, experienceAward } from "./progression.mjs";
import { escapeHtml, formatNumber, isResponsibleGm } from "../core/utils.mjs";
import { isCapturedLegendary } from "./legendary-species.mjs";

/** Canal de socket del módulo, compartido con status-effects.mjs. */
const SOCKET = `module.${MODULE_ID}`;
const COMPLETE_CAPTURE_ACTION = "completeCapture";
const CAPTURE_RESULT_ACTION = "captureResult";
const CAPTURE_RETRY_DELAY = 2500;
const CAPTURE_RESPONSE_TIMEOUT = 15000;
const captureRequests = new Map();
const captureCompletions = new Map();

/**
 * Deja al director escuchando las capturas conseguidas por los jugadores y las
 * remata con completeCapture(). isResponsibleGm() garantiza que solo uno las
 * atienda. La llama el hook `ready` de main.mjs.
 */
export function registerCaptureSocket() {
  game.socket.on(SOCKET, async payload => {
    if (payload?.action === CAPTURE_RESULT_ACTION) return receiveCaptureResult(payload);
    if (payload?.action !== COMPLETE_CAPTURE_ACTION || !isResponsibleGm()) return;
    const requestId = String(payload.requestId ?? "");
    let completion = captureCompletions.get(requestId);
    if (!completion) {
      completion = completeCapture(payload)
        .then(() => ({ ok: true }))
        .catch(error => {
          console.error(`${MODULE_ID} | Capture completion failed`, error);
          return { ok: false, error: error.message };
        });
      if (requestId) captureCompletions.set(requestId, completion);
    }
    const result = await completion;
    game.socket.emit(SOCKET, {
      action: CAPTURE_RESULT_ACTION,
      requestId,
      userId: payload.userId,
      ...result
    });
  });
}

/**
 * Envía al director una captura conseguida y espera confirmación real. Repite
 * la misma petición mientras no haya respuesta; el requestId hace que el DJ la
 * procese una sola vez aunque una pestaña en segundo plano retrase el socket.
 */
async function requestCaptureCompletion(payload) {
  if (!game.users.some(user => user.active && user.isGM)) {
    throw new Error(game.i18n.localize("POKE5E.Capture.NoActiveGM"));
  }
  payload.requestId = foundry.utils.randomID();
  const response = new Promise(resolve => captureRequests.set(payload.requestId, resolve));
  game.socket.emit(SOCKET, payload);
  const retry = setInterval(() => game.socket.emit(SOCKET, payload), CAPTURE_RETRY_DELAY);
  const timeout = setTimeout(() => receiveCaptureResult({
    action: CAPTURE_RESULT_ACTION,
    requestId: payload.requestId,
    userId: game.user.id,
    ok: false,
    error: game.i18n.localize("POKE5E.Capture.GMTimeout")
  }), CAPTURE_RESPONSE_TIMEOUT);
  try {
    const result = await response;
    if (!result.ok) throw new Error(result.error || game.i18n.localize("POKE5E.Capture.GMTimeout"));
  } finally {
    clearInterval(retry);
    clearTimeout(timeout);
    captureRequests.delete(payload.requestId);
  }
}

/** Resuelve únicamente la petición que pertenece a este jugador. */
function receiveCaptureResult(payload) {
  if (payload?.userId !== game.user.id) return;
  captureRequests.get(payload.requestId)?.(payload);
}

/**
 * Primera mitad de la captura, del lado de quien juega. Comprueba permisos,
 * objetivo único (selectedPokemonTarget()), PG, nivel frente a trainerLevel(),
 * alcance de 60 pies y Poké Balls disponibles; pregunta las condiciones con
 * promptCaptureOptions(); gasta la ball; calcula la CD con captureDifficulty();
 * tira Trato con Animales, con ventaja si el objetivo está bajo un estado que la
 * concede, y publica el resultado. Si acierta, remata con completeCapture() o
 * pide al director que lo haga por socket. Los Pokémon de otro entrenador fallan
 * siempre, pero consumen la ball.
 * Es la macro `game.poke5e.captureTarget` y el botón "Capturar objetivo".
 */
export async function attemptCapture(trainer) {
  if (!trainer?.isOwner) return ui.notifications.warn(game.i18n.localize("POKE5E.Capture.NoTrainerPermission"));
  const targetToken = selectedPokemonTarget();
  if (!targetToken) return ui.notifications.warn(game.i18n.localize("POKE5E.Capture.SelectTarget"));
  const wildActor = targetToken.actor;
  const capturable = wildActor.getFlag(MODULE_ID, "kind") === "wild" && wildActor.getFlag(MODULE_ID, "capturable") === true;
  const pokemonItem = await pokemonItemForActor(wildActor);
  const species = pokemonItem?.getFlag(MODULE_ID, "species");
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  if (!pokemonItem || !species || !instance) return ui.notifications.error(game.i18n.localize("POKE5E.Capture.InvalidTarget"));
  const hp = wildActor.system.attributes?.hp ?? {};
  if (capturable && Number(hp.value) <= 0) return ui.notifications.warn(game.i18n.localize("POKE5E.Capture.Fainted"));
  const currentTrainerLevel = trainerLevel(trainer);
  const targetLevel = Math.max(1, Number(instance.level) || 1);
  if (capturable && targetLevel > currentTrainerLevel) return ui.notifications.warn(game.i18n.format("POKE5E.Capture.LevelTooHigh", { target: targetLevel, trainer: currentTrainerLevel }));
  const distance = distanceFromTrainer(trainer, targetToken);
  if (distance == null) return ui.notifications.warn(game.i18n.localize("POKE5E.Capture.PlaceTrainer"));
  if (distance > 60) return ui.notifications.warn(game.i18n.format("POKE5E.Capture.OutOfRange", { distance: Math.round(distance) }));
  const balls = availablePokeballs(trainer);
  if (!balls.length) return ui.notifications.warn(game.i18n.localize("POKE5E.Capture.NoBalls"));
  if (!game.user.isGM && !game.users.some(user => user.active && user.isGM)) {
    return ui.notifications.warn(game.i18n.localize("POKE5E.Capture.NoActiveGM"));
  }
  const choices = await promptCaptureOptions({ species, instance, hp, balls, trainerLevel: currentTrainerLevel, trainer });
  if (!choices) return;
  const ball = balls.find(entry => entry.item.id === choices.ballItemId);
  if (!ball) return ui.notifications.warn(game.i18n.localize("POKE5E.Capture.BallUnavailable"));
  const ballName = ball.item.name;
  await consumePokeball(ball.item);
  if (!capturable) {
    await postTrainedPokemonFailure({ trainer, species, ballName });
    return ui.notifications.warn(game.i18n.format("POKE5E.Capture.OwnedPokemon", { pokemon: species.name }));
  }
  const data = await loadPoke5eData();
  const statuses = targetStatuses(wildActor, instance);
  const context = {
    trainerLevel: currentTrainerLevel,
    targetLevel,
    size: species.size,
    types: species.type ?? [],
    natureModifier: skillModifier(trainer, "nat"),
    persuasionModifier: skillModifier(trainer, "per"),
    athleticsModifier: skillModifier(trainer, "ath"),
    activePokemonCharismaModifier: activePokemonCharismaModifier(trainer),
    evolvesWithMoonStone: (data.evolutionsByFrom.get(species.id) ?? []).some(evolution => evolution.conditions?.some(condition => condition.type === "item" && String(condition.value).toLocaleLowerCase() === "moon stone")),
    alreadyCaught: getPokemonItems(trainer).some(item => item.getFlag(MODULE_ID, "species")?.id === species.id),
    combatRound: game.combat?.round ?? 0,
    statuses,
    fishing: choices.fishing,
    underwater: choices.underwater,
    darkness: choices.darkness,
    timerTurns: choices.timerTurns,
    manualReduction: choices.manualReduction,
    rangerCircled: choices.rangerCircled
  };
  const difficulty = captureDifficulty({
    speciesRating: species.sr,
    level: targetLevel,
    currentHp: hp.value,
    maximumHp: hp.max,
    ballId: ball.sourceId,
    context
  });
  let advantage = captureHasAdvantage(statuses);
  let collectorAdvantage = false;
  let assistAdvantage = false;
  if (!advantage && hasTrainerPath(trainer, "pokemon-collector", 5)) {
    collectorAdvantage = await useCollectorCaptureAdvantage(trainer, species.name);
    advantage = collectorAdvantage;
  }
  if (!advantage && rangerCaptureAdvantage(trainer, species.type)) {
    assistAdvantage = true;
    advantage = true;
  }
  let total = Infinity;
  if (!difficulty.automaticSuccess) {
    const modifier = skillModifier(trainer, "ani");
    const roll = await new Roll(advantage ? "2d20kh + @mod" : "1d20 + @mod", { mod: modifier }).evaluate();
    total = Number(roll.total) || 0;
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: trainer }),
      flavor: `Captura de ${species.name} con ${ballName}${advantage ? ` · ${collectorAdvantage ? "¡Hazte con todos!" : assistAdvantage ? "Poké Assist" : "Ventaja por estado"}` : ""} · CD ${difficulty.dc}`
    });
  }
  const success = difficulty.automaticSuccess || total >= difficulty.dc;
  await postCaptureResult({ trainer, species, ballName, difficulty, total, success, advantage });
  if (!success) return ui.notifications.warn(game.i18n.format("POKE5E.Capture.Escaped", { pokemon: species.name, ball: ballName }));
  const payload = {
    action: COMPLETE_CAPTURE_ACTION,
    userId: game.user.id,
    trainerUuid: trainer.uuid,
    wildActorUuid: wildActor.uuid,
    ballId: ball.sourceId,
    ballName,
    dc: difficulty.dc,
    total: difficulty.automaticSuccess ? null : total,
    automaticSuccess: difficulty.automaticSuccess
  };
  if (game.user.isGM) await completeCapture(payload);
  else {
    ui.notifications.info(game.i18n.localize("POKE5E.Capture.WaitingForGM"));
    try {
      await requestCaptureCompletion(payload);
      ui.notifications.info(game.i18n.format("POKE5E.Capture.Added", { pokemon: species.name, trainer: trainer.name }));
    } catch (error) {
      ui.notifications.error(game.i18n.format("POKE5E.Capture.Failed", { error: error.message }));
    }
  }
}

async function useCollectorCaptureAdvantage(trainer, pokemonName) {
  const feature = [...(trainer.items ?? [])].find(item => item.getFlag?.(MODULE_ID, "pathId") === "pokemon-collector" && Number(item.getFlag?.(MODULE_ID, "level")) === 5);
  if (!feature) return false;
  const maximum = feature.system?.uses?.max != null ? Math.max(0, Number(feature.system.uses.max) || 0) : 1;
  const spent = Number(feature.system?.uses?.spent) || 0;
  if (maximum <= 0 || spent >= maximum) return false;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("POKE5E.TrainerPaths.CollectorCaptureTitle") },
    content: `<p>${game.i18n.format("POKE5E.TrainerPaths.CollectorCapturePrompt", { pokemon: foundry.utils.escapeHTML(pokemonName) })}</p>`,
    modal: true,
    rejectClose: false
  });
  if (!confirmed) return false;
  await feature.update({ "system.uses.spent": spent + 1 });
  return true;
}

/**
 * Segunda mitad, siempre en el cliente del director: revalida por su cuenta la
 * petición (solicitante conectado y dueño del entrenador, objetivo salvaje y
 * capturable, PG, nivel y tirada) sin fiarse de lo que envía el cliente, copia
 * el Item Pokémon al entrenador conservando sus datos, decide equipo o reserva
 * según trainerPokeslotLimit(), retira al salvaje del combate y del mapa y
 * anuncia la captura con los PX correspondientes. El flag `capturePending`
 * impide capturar dos veces el mismo objetivo.
 */
export async function completeCapture(payload) {
  if (!game.user.isGM) return;
  const requester = game.users.get(payload.userId);
  const trainer = await fromUuid(payload.trainerUuid);
  const wildActor = await fromUuid(payload.wildActorUuid);
  if (!requester?.active || trainer?.documentName !== "Actor" || wildActor?.documentName !== "Actor") throw new Error("La solicitud ya no es válida.");
  if (!trainer.testUserPermission(requester, "OWNER")) throw new Error("El jugador no controla al entrenador indicado.");
  if (wildActor.getFlag(MODULE_ID, "kind") !== "wild" || !wildActor.getFlag(MODULE_ID, "capturable")) throw new Error("El objetivo no es un Pokémon salvaje capturable.");
  if (wildActor.getFlag(MODULE_ID, "capturePending")) return;
  const pokemonItem = wildPokemonItem(wildActor);
  const species = pokemonItem?.getFlag(MODULE_ID, "species");
  const originalInstance = pokemonItem?.getFlag(MODULE_ID, "instance");
  if (!pokemonItem || !species || !originalInstance) throw new Error("La ficha salvaje está incompleta.");
  if (isCapturedLegendary(species, undefined, undefined, { excludeActorId: wildActor.id })) throw new Error(game.i18n.format("POKE5E.Legendary.AlreadyCaptured", { pokemon: species.name }));
  const level = Math.max(1, Number(originalInstance.level) || 1);
  if (level > trainerLevel(trainer)) throw new Error("El nivel del Pokémon supera el del entrenador.");
  if (Number(wildActor.system.attributes?.hp?.value) <= 0) throw new Error("Un Pokémon debilitado no puede ser capturado.");
  if (!payload.automaticSuccess && Number(payload.total) < Number(payload.dc)) throw new Error("La tirada no supera la CD de captura.");
  await wildActor.setFlag(MODULE_ID, "capturePending", true);
  try {
    const instance = foundry.utils.deepClone(originalInstance);
    instance.level = level;
    instance.experience = experienceAtLevel(level);
    const capturedMaximumHp = Math.max(1, Number(wildActor.system.attributes.hp.max) || Number(instance.hp?.max) || 1);
    instance.hp = capturedHitPoints(payload.ballId, wildActor.system.attributes.hp.value, capturedMaximumHp);
    instance.status = instance.status || targetStatuses(wildActor, instance)[0] || "";
    instance.inTeam = getPokemonItems(trainer).filter(item => item.getFlag(MODULE_ID, "instance")?.inTeam).length < trainerPokeslotLimit(trainer);
    instance.caughtWith = payload.ballId;
    instance.notes = [instance.notes, `Capturado con ${payload.ballName}.`].filter(Boolean).join("\n");
    const source = pokemonItem.toObject();
    delete source._id;
    delete source._stats;
    delete source.folder;
    source.name = species.name;
    source.flags[MODULE_ID] = {
      ...source.flags[MODULE_ID],
      kind: "pokemon",
      sourceId: species.id,
      species: foundry.utils.deepClone(species),
      instance
    };
    const [capturedItem] = await trainer.createEmbeddedDocuments("Item", [source]);
    if (!capturedItem) throw new Error("No se pudo añadir el Pokémon al entrenador.");
    await removeWildCombatants(wildActor);
    await removeDeployment(wildActor, { deleteTokens: true });
    const captureExperience = captureExperienceReward(experienceAward(level, species.sr));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: trainer }),
      content: `<div class="dnd5e chat-card poke5e-capture-card success"><header class="card-header"><h3><i class="fa-solid fa-circle-dot"></i> ${game.i18n.format("POKE5E.Capture.ChatCapturedTitle", { pokemon: escapeHtml(species.name) })}</h3></header><p>${game.i18n.format("POKE5E.Capture.ChatCaptured", { trainer: `<strong>${escapeHtml(trainer.name)}</strong>`, pokemon: escapeHtml(species.name), ball: escapeHtml(payload.ballName) })}</p><p>${game.i18n.format("POKE5E.Capture.ChatPokemonSummary", { level, hp: instance.hp.value, max: instance.hp.max, destination: game.i18n.localize(instance.inTeam ? "POKE5E.Capture.ActiveTeam" : "POKE5E.Capture.Reserve") })}</p><p>${game.i18n.format("POKE5E.Capture.ChatXP", { xp: formatNumber(captureExperience) })}</p></div>`
    });
    ui.notifications.info(game.i18n.format("POKE5E.Capture.Added", { pokemon: species.name, trainer: trainer.name }));
  } catch (error) {
    if (game.actors.has(wildActor.id)) await wildActor.unsetFlag(MODULE_ID, "capturePending");
    throw error;
  }
}

/**
 * Devuelve el token objetivo si hay exactamente uno seleccionado y es un Pokémon
 * salvaje o desplegado; si no, null. Primer filtro de attemptCapture().
 */
function selectedPokemonTarget() {
  const targets = [...(game.user.targets ?? [])].filter(token => ["wild", "deployed"].includes(token.actor?.getFlag(MODULE_ID, "kind")));
  return targets.length === 1 ? targets[0] : null;
}

/**
 * Item Pokémon embebido en un actor salvaje. Versión síncrona que usa
 * completeCapture(), donde el actor ya está resuelto.
 */
function wildPokemonItem(actor) {
  return actor?.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon");
}

/**
 * Localiza el Item Pokémon de cualquier objetivo: embebido si es salvaje o, si
 * es un desplegado, resolviendo el UUID que guarda su flag.
 * La usa attemptCapture(), que admite ambos casos.
 */
async function pokemonItemForActor(actor) {
  const embedded = wildPokemonItem(actor);
  if (embedded) return embedded;
  const uuid = actor?.getFlag(MODULE_ID, "pokemonItemUuid");
  return uuid ? fromUuid(uuid) : null;
}

/**
 * Poké Balls con existencias en el inventario del entrenador, reconocidas por su
 * `sourceId` contra POKEBALL_IDS. Alimenta el desplegable de
 * promptCaptureOptions().
 */
function availablePokeballs(trainer) {
  return trainer.items.map(item => ({ item, sourceId: item.getFlag(MODULE_ID, "sourceId") }))
    .filter(entry => POKEBALL_IDS.includes(entry.sourceId) && Number(entry.item.system.quantity ?? 1) > 0);
}

/**
 * Diálogo de captura: elige Poké Ball y declara las condiciones que algunas
 * aprovechan (pesca, bajo el agua, oscuridad, turnos de concentración y, solo
 * para el director, una reducción manual de CD). Devuelve null si se cancela.
 * Sus respuestas forman el contexto que attemptCapture() pasa a
 * pokeballAdjustment() (capture-rules.mjs).
 */
async function promptCaptureOptions({ species, instance, hp, balls, trainerLevel, trainer }) {
  const options = balls.map(({ item }) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} ×${Number(item.system.quantity ?? 1)}</option>`).join("");
  // Capturador (Ranger 5): casilla de confianza, no verificación real de
  // movimiento — ver el comentario de pokeballAdjustment() en capture-rules.mjs.
  const rangerField = hasTrainerPath(trainer, "ranger", 5)
    ? `<label><input type="checkbox" name="rangerCircled"> Completé la vuelta completa con el Capturador (Guardabosques 5: +10)</label>`
    : "";
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("POKE5E.Capture.WindowTitle", { pokemon: species.name }) },
      content: `<div class="poke5e-capture-dialog">
        <p><strong>${escapeHtml(species.name)}</strong> · ${game.i18n.format("POKE5E.Capture.TargetSummary", { level: Number(instance.level) || 1, cr: Number(species.sr) || 0, hp: Number(hp.value) || 0, max: Number(hp.max) || 1 })}</p>
        <p>${game.i18n.format("POKE5E.Capture.TrainerSummary", { level: trainerLevel })}</p>
        <label><span>${game.i18n.localize("POKE5E.Capture.PokeBall")}</span><select name="ballItemId">${options}</select></label>
        <fieldset><legend>${game.i18n.localize("POKE5E.Capture.EnvironmentConditions")}</legend>
          <label><input type="checkbox" name="fishing"> ${game.i18n.localize("POKE5E.Capture.Fishing")}</label>
          <label><input type="checkbox" name="underwater"> ${game.i18n.localize("POKE5E.Capture.Underwater")}</label>
          <label><input type="checkbox" name="darkness"> ${game.i18n.localize("POKE5E.Capture.Darkness")}</label>
          ${rangerField}
        </fieldset>
        <div class="poke5e-capture-numbers">
          <label><span>${game.i18n.localize("POKE5E.Capture.TimerTurns")}</span><input type="number" name="timerTurns" min="0" max="10" value="0"></label>
          ${game.user.isGM ? `<label><span>${game.i18n.localize("POKE5E.Capture.ManualReduction")}</span><input type="number" name="manualReduction" min="0" value="0"></label>` : ""}
        </div>
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: game.i18n.localize("POKE5E.Capture.ThrowBall"),
        icon: "fa-solid fa-circle-dot",
        callback: (event, button) => ({
          ballItemId: button.form.elements.ballItemId.value,
          fishing: button.form.elements.fishing.checked,
          underwater: button.form.elements.underwater.checked,
          darkness: button.form.elements.darkness.checked,
          timerTurns: Math.max(0, Math.min(10, Number(button.form.elements.timerTurns.value) || 0)),
          manualReduction: Math.max(0, Number(button.form.elements.manualReduction?.value) || 0),
          rangerCircled: Boolean(button.form.elements.rangerCircled?.checked)
        })
      }
    });
  } catch {
    return null;
  }
}

/**
 * Modificador de una habilidad del entrenador, tolerante con las variantes de
 * D&D 5e. Da los valores de Trato con Animales (la tirada) y de Naturaleza,
 * Persuasión y Atletismo (efectos de ciertas Poké Balls).
 */
function skillModifier(actor, key) {
  const skill = actor.system.skills?.[key] ?? {};
  return Number(skill.total ?? skill.mod ?? skill.value) || 0;
}

/**
 * Modificador de Carisma del Pokémon que el entrenador tenga desplegado, dato
 * que necesita la Love Ball. Auxiliar del contexto de attemptCapture().
 */
function activePokemonCharismaModifier(trainer) {
  const actor = game.actors.find(candidate => candidate.getFlag(MODULE_ID, "kind") === "deployed" && candidate.getFlag(MODULE_ID, "trainerUuid") === trainer.uuid);
  const score = Number(actor?.system.abilities?.cha?.value) || 10;
  return Math.floor((score - 10) / 2);
}

/**
 * Estados del objetivo, uniendo los efectos activos del actor con el guardado en
 * su instancia y normalizándolos. Los consumen captureHasAdvantage() y las Poké
 * Balls que dependen de un estado.
 */
function targetStatuses(actor, instance) {
  return [...new Set([...(actor.statuses ?? []), instance.status].filter(Boolean).map(value => String(value).toLocaleLowerCase()))];
}

/**
 * Distancia en pies del token más cercano del entrenador al objetivo, o null si
 * no tiene ninguno en la escena. attemptCapture() la contrasta con el alcance de
 * 60 pies.
 */
function distanceFromTrainer(trainer, targetToken) {
  const trainerTokens = canvas.tokens?.placeables?.filter(token => token.actor?.id === trainer.id) ?? [];
  if (!trainerTokens.length || !targetToken?.center) return null;
  return Math.min(...trainerTokens.map(token => Number(canvas.grid.measurePath([token.center, targetToken.center]).distance)));
}

/**
 * Descuenta una Poké Ball del inventario y borra el Item si era la última.
 * attemptCapture() la llama antes de tirar, de modo que la ball se gasta tanto
 * si la captura sale bien como si falla.
 */
async function consumePokeball(item) {
  const quantity = Math.max(1, Number(item.system.quantity) || 1);
  if (quantity <= 1) await item.delete();
  else await item.update({ "system.quantity": quantity - 1 });
}

/**
 * Publica en el chat el resultado del intento con el desglose completo de la CD
 * (base, reducción por PG y motivos devueltos por pokeballAdjustment()).
 * La llama attemptCapture() tanto en éxito como en fallo.
 */
async function postCaptureResult({ trainer, species, ballName, difficulty, total, success, advantage }) {
  const details = [
    game.i18n.format("POKE5E.Capture.BaseDC", { dc: difficulty.base }),
    difficulty.healthReduction ? game.i18n.format("POKE5E.Capture.HealthReduction", { reduction: difficulty.healthReduction }) : null,
    difficulty.ballReduction ? game.i18n.format("POKE5E.Capture.BallReduction", { reduction: difficulty.ballReduction }) : null
  ].filter(Boolean).join(" · ");
  const ballDetails = difficulty.reasons.length
    ? `<p><small>${difficulty.reasons.map(reason => `${escapeHtml(reason.label)}: ${typeof reason.value === "number" ? `−${reason.value} CD` : escapeHtml(reason.value)}`).join(" · ")}</small></p>`
    : "";
  const result = difficulty.automaticSuccess ? game.i18n.localize("POKE5E.Capture.AutomaticSuccess") : game.i18n.format("POKE5E.Capture.RollAgainstDC", { total, dc: difficulty.dc });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: trainer }),
    content: `<div class="dnd5e chat-card poke5e-capture-card ${success ? "success" : "failure"}"><header class="card-header"><h3>${game.i18n.localize(success ? "POKE5E.Capture.SuccessTitle" : "POKE5E.Capture.EscapedTitle")}</h3></header><p>${game.i18n.format("POKE5E.Capture.ThrowDescription", { trainer: escapeHtml(trainer.name), ball: `<strong>${escapeHtml(ballName)}</strong>`, pokemon: escapeHtml(species.name) })}</p><p>${escapeHtml(details)}</p>${ballDetails}<p><strong>${escapeHtml(result)}</strong>${advantage ? ` · ${game.i18n.localize("POKE5E.Capture.StatusAdvantage")}` : ""}</p></div>`
  });
}

/**
 * Mensaje de chat del fallo automático al lanzar una ball a un Pokémon que ya
 * tiene entrenador. Sustituye a postCaptureResult() en ese caso, en el que ni
 * siquiera se tira.
 */
async function postTrainedPokemonFailure({ trainer, species, ballName }) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: trainer }),
    content: `<div class="dnd5e chat-card poke5e-capture-card failure"><header class="card-header"><h3>${game.i18n.localize("POKE5E.Capture.ImpossibleTitle")}</h3></header><p>${game.i18n.format("POKE5E.Capture.TrainedFailure", { trainer: escapeHtml(trainer.name), ball: `<strong>${escapeHtml(ballName)}</strong>`, pokemon: escapeHtml(species.name) })}</p><p>${game.i18n.localize("POKE5E.Capture.AutomaticFailure")}</p></div>`
  });
}

/**
 * Saca al salvaje capturado de cualquier combate en curso antes de borrar su
 * actor, para no dejar combatientes huérfanos. Auxiliar de completeCapture().
 */
async function removeWildCombatants(actor) {
  for (const combat of game.combats ?? []) {
    const ids = combat.combatants.filter(combatant => combatant.actorId === actor.id).map(combatant => combatant.id);
    if (ids.length) await combat.deleteEmbeddedDocuments("Combatant", ids);
  }
}
