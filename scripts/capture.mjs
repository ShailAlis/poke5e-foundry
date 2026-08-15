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
import { captureDifficulty, captureHasAdvantage, POKEBALL_IDS } from "./capture-rules.mjs";
import { loadPoke5eData } from "./data-service.mjs";
import { removeDeployment } from "./deployment.mjs";
import { MODULE_ID, displayPokemonName, getPokemonItems, trainerLevel, trainerPokeslotLimit } from "./model.mjs";
import { experienceAtLevel, experienceAward } from "./progression.mjs";

/** Canal de socket del módulo, compartido con status-effects.mjs. */
const SOCKET = `module.${MODULE_ID}`;

/**
 * Deja al director escuchando las capturas conseguidas por los jugadores y las
 * remata con completeCapture(). isResponsibleGm() garantiza que solo uno las
 * atienda. La llama el hook `ready` de main.mjs.
 */
export function registerCaptureSocket() {
  game.socket.on(SOCKET, payload => {
    if (payload?.action !== "completeCapture" || !isResponsibleGm()) return;
    completeCapture(payload).catch(error => {
      console.error(`${MODULE_ID} | Capture completion failed`, error);
      ui.notifications.error(`No se pudo completar la captura: ${error.message}`);
    });
  });
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
  if (!trainer?.isOwner) return ui.notifications.warn("No tienes permiso para usar este entrenador.");
  const targetToken = selectedPokemonTarget();
  if (!targetToken) return ui.notifications.warn("Selecciona como objetivo exactamente un Pokémon salvaje o perteneciente a un entrenador.");
  const wildActor = targetToken.actor;
  const capturable = wildActor.getFlag(MODULE_ID, "kind") === "wild" && wildActor.getFlag(MODULE_ID, "capturable") === true;
  const pokemonItem = await pokemonItemForActor(wildActor);
  const species = pokemonItem?.getFlag(MODULE_ID, "species");
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  if (!pokemonItem || !species || !instance) return ui.notifications.error("El objetivo no contiene una ficha Pokémon válida.");
  const hp = wildActor.system.attributes?.hp ?? {};
  if (capturable && Number(hp.value) <= 0) return ui.notifications.warn("Un Pokémon debilitado no puede ser capturado.");
  const currentTrainerLevel = trainerLevel(trainer);
  const targetLevel = Math.max(1, Number(instance.level) || 1);
  if (capturable && targetLevel > currentTrainerLevel) return ui.notifications.warn(`No puedes capturar un Pokémon de nivel ${targetLevel} con un entrenador de nivel ${currentTrainerLevel}.`);
  const distance = distanceFromTrainer(trainer, targetToken);
  if (distance == null) return ui.notifications.warn("Coloca un token de este entrenador en la escena para lanzar una Poké Ball.");
  if (distance > 60) return ui.notifications.warn(`El objetivo está a ${Math.round(distance)} pies. El alcance máximo es de 60 pies.`);
  const balls = availablePokeballs(trainer);
  if (!balls.length) return ui.notifications.warn("Este entrenador no tiene Poké Balls disponibles en su inventario.");
  const choices = await promptCaptureOptions({ species, instance, hp, balls, trainerLevel: currentTrainerLevel });
  if (!choices) return;
  const ball = balls.find(entry => entry.item.id === choices.ballItemId);
  if (!ball) return ui.notifications.warn("La Poké Ball seleccionada ya no está disponible.");
  const ballName = ball.item.name;
  await consumePokeball(ball.item);
  if (!capturable) {
    await postTrainedPokemonFailure({ trainer, species, ballName });
    return ui.notifications.warn(`${species.name} pertenece a un entrenador: la captura falla automáticamente y la Poké Ball se ha perdido.`);
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
    manualReduction: choices.manualReduction
  };
  const difficulty = captureDifficulty({
    speciesRating: species.sr,
    level: targetLevel,
    currentHp: hp.value,
    maximumHp: hp.max,
    ballId: ball.sourceId,
    context
  });
  const advantage = captureHasAdvantage(statuses);
  let total = Infinity;
  if (!difficulty.automaticSuccess) {
    const modifier = skillModifier(trainer, "ani");
    const roll = await new Roll(advantage ? "2d20kh + @mod" : "1d20 + @mod", { mod: modifier }).evaluate();
    total = Number(roll.total) || 0;
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: trainer }),
      flavor: `Captura de ${species.name} con ${ballName}${advantage ? " · Ventaja por estado" : ""} · CD ${difficulty.dc}`
    });
  }
  const success = difficulty.automaticSuccess || total >= difficulty.dc;
  await postCaptureResult({ trainer, species, ballName, difficulty, total, success, advantage });
  if (!success) return ui.notifications.warn(`${species.name} ha escapado de la ${ballName}.`);
  const payload = {
    action: "completeCapture",
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
    game.socket.emit(SOCKET, payload);
    ui.notifications.info("Captura conseguida. Esperando a que el director complete la transferencia.");
  }
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
  const level = Math.max(1, Number(originalInstance.level) || 1);
  if (level > trainerLevel(trainer)) throw new Error("El nivel del Pokémon supera el del entrenador.");
  if (Number(wildActor.system.attributes?.hp?.value) <= 0) throw new Error("Un Pokémon debilitado no puede ser capturado.");
  if (!payload.automaticSuccess && Number(payload.total) < Number(payload.dc)) throw new Error("La tirada no supera la CD de captura.");
  await wildActor.setFlag(MODULE_ID, "capturePending", true);
  try {
    const instance = foundry.utils.deepClone(originalInstance);
    instance.level = level;
    instance.experience = experienceAtLevel(level);
    instance.hp = {
      value: Math.max(1, Number(wildActor.system.attributes.hp.value) || 1),
      max: Math.max(1, Number(wildActor.system.attributes.hp.max) || Number(instance.hp?.max) || 1)
    };
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
    const captureExperience = Math.floor(experienceAward(level, species.sr) / 5);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: trainer }),
      content: `<div class="dnd5e chat-card poke5e-capture-card success"><header class="card-header"><h3><i class="fa-solid fa-circle-dot"></i> ¡${escapeHtml(species.name)} capturado!</h3></header><p><strong>${escapeHtml(trainer.name)}</strong> ha capturado a ${escapeHtml(species.name)} con ${escapeHtml(payload.ballName)}.</p><p>Nivel ${level} · PG ${instance.hp.value}/${instance.hp.max} · ${instance.inTeam ? "Añadido al equipo activo" : "Enviado a la reserva"}</p><p><strong>PX por captura:</strong> ${formatNumber(captureExperience)} para distribuir.</p></div>`
    });
    ui.notifications.info(`${species.name} se ha añadido a ${trainer.name}.`);
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
async function promptCaptureOptions({ species, instance, hp, balls, trainerLevel }) {
  const options = balls.map(({ item }) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} ×${Number(item.system.quantity ?? 1)}</option>`).join("");
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: `Capturar a ${species.name}` },
      content: `<div class="poke5e-capture-dialog">
        <p><strong>${escapeHtml(species.name)}</strong> · Nivel ${Number(instance.level) || 1} · SR ${Number(species.sr) || 0} · PG ${Number(hp.value) || 0}/${Number(hp.max) || 1}</p>
        <p>Entrenador de nivel ${trainerLevel}. La Poké Ball se consumirá al realizar el intento.</p>
        <label><span>Poké Ball</span><select name="ballItemId">${options}</select></label>
        <fieldset><legend>Condiciones del entorno</legend>
          <label><input type="checkbox" name="fishing"> Encontrado mediante pesca</label>
          <label><input type="checkbox" name="underwater"> Objetivo bajo el agua</label>
          <label><input type="checkbox" name="darkness"> Noche u oscuridad</label>
        </fieldset>
        <div class="poke5e-capture-numbers">
          <label><span>Turnos concentrando la Turno Ball</span><input type="number" name="timerTurns" min="0" max="10" value="0"></label>
          ${game.user.isGM ? `<label><span>Reducción adicional de CD (DJ)</span><input type="number" name="manualReduction" min="0" value="0"></label>` : ""}
        </div>
      </div>`,
      modal: true,
      rejectClose: false,
      ok: {
        label: "Lanzar Poké Ball",
        icon: "fa-solid fa-circle-dot",
        callback: (event, button) => ({
          ballItemId: button.form.elements.ballItemId.value,
          fishing: button.form.elements.fishing.checked,
          underwater: button.form.elements.underwater.checked,
          darkness: button.form.elements.darkness.checked,
          timerTurns: Math.max(0, Math.min(10, Number(button.form.elements.timerTurns.value) || 0)),
          manualReduction: Math.max(0, Number(button.form.elements.manualReduction?.value) || 0)
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
    `CD base ${difficulty.base}`,
    difficulty.healthReduction ? `−${difficulty.healthReduction} por PG` : null,
    difficulty.ballReduction ? `−${difficulty.ballReduction} por Poké Ball y condiciones` : null
  ].filter(Boolean).join(" · ");
  const ballDetails = difficulty.reasons.length
    ? `<p><small>${difficulty.reasons.map(reason => `${escapeHtml(reason.label)}: ${typeof reason.value === "number" ? `−${reason.value} CD` : escapeHtml(reason.value)}`).join(" · ")}</small></p>`
    : "";
  const result = difficulty.automaticSuccess ? "Éxito automático" : `${total} contra CD ${difficulty.dc}`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: trainer }),
    content: `<div class="dnd5e chat-card poke5e-capture-card ${success ? "success" : "failure"}"><header class="card-header"><h3>${success ? "¡Captura conseguida!" : "El Pokémon ha escapado"}</h3></header><p>${escapeHtml(trainer.name)} lanza una <strong>${escapeHtml(ballName)}</strong> a ${escapeHtml(species.name)}.</p><p>${escapeHtml(details)}</p>${ballDetails}<p><strong>${escapeHtml(result)}</strong>${advantage ? " · Ventaja por estado" : ""}</p></div>`
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
    content: `<div class="dnd5e chat-card poke5e-capture-card failure"><header class="card-header"><h3>Captura imposible</h3></header><p>${escapeHtml(trainer.name)} lanza una <strong>${escapeHtml(ballName)}</strong> a ${escapeHtml(species.name)}, pero el Pokémon ya pertenece a otro entrenador.</p><p><strong>Fallo automático.</strong> La Poké Ball se consume.</p></div>`
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

/**
 * Elige un único director responsable (el de id menor entre los conectados) para
 * que una captura no se complete varias veces si hay más de uno.
 * Copia local de la homónima de status-effects.mjs.
 */
function isResponsibleGm() {
  const active = game.users.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return active[0]?.id === game.user.id;
}

/** Formatea los PX según el idioma de la interfaz. Auxiliar de completeCapture(). */
function formatNumber(value) {
  return new Intl.NumberFormat(game.i18n.lang || "es").format(Number(value) || 0);
}

/** Escapa el texto de los mensajes de chat y del diálogo de captura. */
function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}
