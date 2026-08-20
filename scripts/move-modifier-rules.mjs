/**
 * Catálogo explícito de movimientos que dejan modificadores numéricos o modos
 * de tirada sobre otro Pokémon. Es deliberadamente independiente de Foundry
 * para poder auditarlo y validarlo en Node contra los 830 movimientos.
 */
import { CONSECUTIVE_ESCALATION_MOVES } from "./multi-hit.mjs";

const combat = null;
const nextTurn = 1;
const minute = 10;
const tenMinutes = 100;

const debuff = options => rule("debuffs", options);
const buff = options => rule("buffs", options);

export const MOVE_MODIFIER_EFFECTS = Object.freeze({
  agility: buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { speed: 20 }, description: "+20 pies a todos los modos de movimiento durante 1 minuto." }),
  "ancient-power": buff({ target: "self", trigger: "natural", natural: 19, durationRounds: combat, stackMax: 5, modifiers: { abilities: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } }, description: "+1 a todas las características durante el combate; se acumula hasta +5." }),
  "armor-cannon": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true, saveDisadvantageAbilities: ["con"] }, description: "Los ataques contra el usuario tienen ventaja y sus salvaciones de CON tienen desventaja hasta el final de su siguiente turno." }),
  "aromatic-mist": buff({ target: "source-and-selected", trigger: "automatic", durationRounds: minute, modifiers: { saveDice: "1d4" }, description: "+1d4 a todas las salvaciones durante 1 minuto." }),
  "aura-wheel": buff({ target: "self", trigger: "hit", durationRounds: combat, stackMax: 4, modifiers: { auraWheelMovement: 5 }, description: "+5 pies de desplazamiento al siguiente uso de Rueda Aural; se acumula hasta +20." }),
  "bleakwind-storm": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { areaEffect: true }, description: "Mantiene un área de terreno difícil y viento gélido mientras conserve la concentración." }),
  bounce: buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { invulnerable: true, charging: true }, description: "Invulnerable mientras permanece fuera del campo preparando el impacto del siguiente turno." }),
  "acid-spray": debuff({ trigger: "failed-save", requiresHit: true, durationRounds: minute, stackMax: 3, modifiers: { ac: -1 }, description: "−1 a la CA durante 1 minuto; se acumula hasta −3." }),
  "apple-acid": debuff({ trigger: "failed-save", durationRounds: combat, stackMax: 3, modifiers: { saves: { dex: -2, con: -2 } }, description: "−2 a las salvaciones de DES y CON hasta retirarse; se acumula tres veces." }),
  "aurora-beam": debuff({ trigger: "natural", natural: 15, durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en su siguiente ataque; los objetivos tienen ventaja si exige salvación." }),
  "bitter-malice": debuff({ trigger: "failed-save", requiresHit: true, durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en su siguiente ataque o ventaja para los objetivos de su siguiente salvación." }),
  "breaking-swipe": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { attackDisadvantage: true }, description: "Desventaja en todos los ataques hasta el final de su siguiente turno." }),
  "bubble-beam": debuff({ trigger: "natural", natural: 19, durationRounds: nextTurn, modifiers: { speedMultiplier: 0.5 }, description: "Velocidad reducida a la mitad hasta el final de su siguiente turno." }),
  "bug-buzz": debuff({ trigger: "failed-save-margin", saveMargin: 5, durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en su siguiente ataque si falla la salvación por 5 o más." }),
  "charge-beam": buff({ target: "self", trigger: "natural", natural: 10, durationRounds: nextTurn, consume: "move", modifiers: { moveModifierMultiplier: 2 }, description: "Duplica el modificador MOVE del daño hasta el final de su siguiente turno." }),
  charm: debuff({ trigger: "failed-save", durationRounds: minute, sourceOnly: true, modifiers: { attack: -2 }, description: "−2 a los ataques realizados contra quien usó Encanto durante 1 minuto." }),
  "chilling-water": debuff({ trigger: "failed-save", requiresHit: true, durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en su siguiente ataque o ventaja para los objetivos de su siguiente salvación." }),
  "clanging-scales": debuff({ trigger: "failed-save-margin", saveMargin: 5, durationRounds: combat, stackMax: 5, modifiers: { ac: -1 }, description: "−1 a la CA durante el combate al fallar por 5 o más; se acumula hasta −5." }),
  "corrosive-gas": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { attackDisadvantage: true, abilityCheckDisadvantage: true, disableHeldItem: true }, description: "Desventaja en ataques y pruebas hasta el final del turno; los Pokémon de SR inferior a 15 no se benefician de objetos equipados." }),
  "crush-claw": buff({ target: "self", trigger: "natural", natural: 15, durationRounds: nextTurn, consume: "move", modifiers: { attackAdvantage: true }, description: "Ventaja en el siguiente ataque, que debe dirigirse al mismo objetivo." }),
  crunch: debuff({ trigger: "natural", natural: 18, durationRounds: combat, stackMax: 5, modifiers: { ac: -1 }, description: "−1 a la CA durante el combate; se acumula hasta −5." }),
  "double-team": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { decoy: true }, description: "Una imagen duplicada puede absorber movimientos de área estrecha con 3–4 en 1d4." }),
  dig: buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { invulnerable: true, charging: true }, description: "Invulnerable bajo tierra mientras prepara el ataque del siguiente turno." }),
  dive: buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { invulnerable: true, charging: true }, description: "Invulnerable bajo el agua o en el espacio mágico mientras prepara el ataque del siguiente turno." }),
  "dragon-ascent": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true }, description: "Los ataques contra el usuario tienen ventaja hasta el principio de su siguiente turno." }),
  "draco-meteor": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en el siguiente ataque o ventaja para sus objetivos si exige salvación." }),
  "earth-power": debuff({ trigger: "natural", natural: 19, durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true }, description: "El siguiente ataque contra el objetivo tiene ventaja." }),
  "energy-ball": debuff({ trigger: "natural", natural: 19, durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true }, description: "El siguiente ataque contra el objetivo tiene ventaja." }),
  "electro-shot": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, modifiers: { charging: true }, description: "Cargando electricidad para liberar el rayo en el siguiente turno mientras mantenga la concentración." }),
  "freeze-shock": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, modifiers: { charging: true }, description: "Cargando una bola de hielo electrificado para dispararla en el siguiente turno mientras mantenga la concentración." }),
  "ice-burn": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, modifiers: { charging: true }, description: "Cargando una potencia ultrafría para liberarla en el siguiente turno mientras mantenga la concentración." }),
  "sky-drop": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, modifiers: { charging: true }, description: "Manteniendo agarrado al objetivo en el aire mientras se prepara para soltarlo en el siguiente turno; el agarre y la salvación de FUE del objetivo para escapar no se automatizan." }),
  "cotton-spore": debuff({ trigger: "failed-save", durationRounds: minute, stackMax: 20, modifiers: { speed: -10 }, description: "−10 pies de velocidad durante 1 minuto; puede acumularse hasta dejarla en 0." }),
  "fake-tears": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { ac: -5 }, description: "Los ataques reciben +5 contra el objetivo hasta el final del siguiente turno del usuario." }),
  "feather-dance": debuff({ trigger: "failed-save", durationRounds: minute, concentration: true, modifiers: { suppressAttackProficiency: true }, description: "No puede añadir competencia a sus ataques durante 1 minuto." }),
  "fire-lash": debuff({ trigger: "failed-save", requiresHit: true, durationRounds: minute, stackMax: 5, modifiers: { ac: -1 }, description: "Los aliados obtienen +1 al atacarlo durante 1 minuto; se acumula hasta +5." }),
  "flash-cannon": debuff({ trigger: "natural", natural: 19, durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true }, description: "El siguiente ataque contra el objetivo tiene ventaja." }),
  "fleur-cannon": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en el siguiente ataque o ventaja para sus objetivos si exige salvación." }),
  "focus-blast": debuff({ trigger: "natural", natural: 19, durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true }, description: "El siguiente ataque contra el objetivo tiene ventaja." }),
  fly: buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { invulnerable: true, charging: true }, description: "Invulnerable en las alturas mientras prepara el ataque del siguiente turno." }),
  "flame-charge": buff({ target: "self", trigger: "hit", durationRounds: combat, stackMax: 6, modifiers: { speed: 5 }, description: "+5 pies de velocidad por impacto hasta terminar el combate; se acumula hasta +30." }),
  "flower-shield": buff({ trigger: "automatic", durationRounds: minute, concentration: true, requiredTypes: ["grass"], modifiers: { ac: 2 }, description: "+2 a la CA de los aliados de tipo Planta durante 1 minuto mientras se mantenga la concentración." }),
  glaciate: debuff({ trigger: "hit", durationRounds: combat, stackMax: 20, modifiers: { speed: -5 }, description: "−5 pies de velocidad hasta retirarse; se acumula y congela al llegar a 0." }),
  "grav-apple": debuff({ trigger: "failed-save", requiresHit: true, durationRounds: combat, stackMax: 3, modifiers: { ac: -1 }, description: "−1 a la CA hasta retirarse; se acumula hasta −3." }),
  growl: debuff({ trigger: "failed-save", durationRounds: minute, stackMax: 5, modifiers: { attack: -1 }, description: "−1 a todas las tiradas de ataque durante 1 minuto; se acumula hasta −5." }),
  howl: buff({ target: "source-and-selected", trigger: "automatic", durationRounds: nextTurn, modifiers: { meleeAttackAdvantage: true }, description: "Ventaja en ataques cuerpo a cuerpo contra criaturas próximas al usuario hasta el final de su siguiente turno." }),
  "iron-tail": debuff({ trigger: "natural", natural: 19, durationRounds: combat, stackMax: 5, modifiers: { ac: -1 }, description: "−1 a la CA durante el combate." }),
  "leaf-tornado": debuff({ trigger: "natural", natural: 15, durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en su siguiente ataque o ventaja para los objetivos de su siguiente salvación." }),
  leer: debuff({ trigger: "failed-save", durationRounds: minute, stackMax: 5, modifiers: { ac: -1 }, description: "Los aliados obtienen +1 al atacarlo durante 1 minuto; se acumula hasta +5." }),
  liquidation: debuff({ trigger: "natural", natural: 18, durationRounds: combat, stackMax: 5, modifiers: { ac: -1 }, description: "−1 a la CA durante el combate; se acumula hasta −5." }),
  "lumina-crash": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { saves: { wis: -2 } }, description: "−2 a las salvaciones de SAB hasta el final del siguiente turno del usuario." }),
  lunge: debuff({ trigger: "natural", natural: 15, durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true }, description: "Desventaja en su siguiente ataque." }),
  "luster-purge": debuff({ trigger: "failed-save-margin", saveMargin: 5, durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true }, description: "Los ataques contra el objetivo tienen ventaja hasta el final del siguiente turno del usuario." }),
  "metal-sound": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { ac: -5 }, description: "Los ataques reciben +5 contra el objetivo hasta el final del siguiente turno del usuario." }),
  "metal-claw": buff({ target: "self", trigger: "natural", natural: 19, durationRounds: nextTurn, consume: "move", modifiers: { attack: 1 }, description: "+1 al siguiente ataque." }),
  "meteor-mash": buff({ target: "self", trigger: "natural", natural: 18, durationRounds: nextTurn, consume: "move", modifiers: { attackAdvantage: true }, description: "Ventaja en el siguiente ataque." }),
  "mirror-shot": debuff({ trigger: "failed-save", requiresHit: true, durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true }, description: "Desventaja en su siguiente ataque." }),
  "mist-ball": debuff({ trigger: "natural", natural: 11, durationRounds: nextTurn, modifiers: { attackDisadvantage: true }, description: "Desventaja en los ataques hasta el final de su siguiente turno." }),
  moonblast: debuff({ trigger: "natural", natural: 15, durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true }, description: "Desventaja en su siguiente ataque." }),
  "mud-bomb": debuff({ trigger: "failed-save", requiresHit: true, durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en su siguiente ataque o ventaja para los objetivos de su siguiente salvación." }),
  "mud-shot": debuff({ trigger: "natural", natural: 16, durationRounds: nextTurn, modifiers: { speedOverride: 0 }, description: "Velocidad 0 hasta el final de su siguiente turno." }),
  "mud-slap": debuff({ trigger: "hit", durationRounds: combat, stackMax: 5, modifiers: { attack: -1 }, description: "−1 a los ataques durante el combate; se acumula hasta −5 y puede retirarse limpiando el barro." }),
  "muddy-water": debuff({ trigger: "natural", natural: 15, durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true }, description: "Desventaja en su siguiente ataque." }),
  "mystical-fire": debuff({ trigger: "hit", durationRounds: nextTurn, modifiers: { attackDisadvantage: true }, description: "Desventaja en los ataques hasta el final de su siguiente turno." }),
  meditate: buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { attack: 1, saves: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } }, description: "+1 a los ataques y a todas las salvaciones durante 1 minuto mientras mantenga la concentración." }),
  coil: buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { attack: 1, damage: 1, ac: 1 }, description: "+1 a los ataques, al daño y a la CA durante 1 minuto mientras mantenga la concentración." }),
  "quiver-dance": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { attack: 1, damage: 1, ac: 1 }, description: "+1 a la CA, a los ataques y al daño durante 1 minuto mientras mantenga la concentración." }),
  "victory-dance": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { attack: 1, ac: 1, saves: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } }, description: "+1 a la CA, a los ataques y a todas las salvaciones durante 1 minuto mientras mantenga la concentración." }),
  minimize: buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { ac: 2 }, description: "+2 a la CA durante 1 minuto mientras mantenga la concentración." }),
  "cotton-guard": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { ac: 2 }, description: "+2 a la CA durante 1 minuto mientras mantenga la concentración." }),
  "defend-order": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { ac: 1 }, description: "+1 a la CA durante 1 minuto mientras mantenga la concentración." }),
  "shift-gear": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { attack: 1, damage: 1, speed: 10 }, description: "+1 a los ataques y al daño, y +10 pies de velocidad, durante 1 minuto mientras mantenga la concentración." }),
  sharpen: buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { attackDice: "1d4" }, description: "+1d4 a los ataques durante 1 minuto mientras mantenga la concentración." }),
  safeguard: buff({ target: "source-and-selected", trigger: "automatic", durationRounds: 3, modifiers: { statusImmune: true }, description: "Inmunidad a estados nuevos durante 3 rondas para el usuario y los aliados seleccionados." }),
  "magnetic-flux": buff({ trigger: "automatic", durationRounds: nextTurn, requiredAbilities: ["plus", "minus"], modifiers: { acProficiency: true, saveAdvantage: true }, description: "Los Pokémon con Más o Menos suman la competencia del usuario a la CA y tienen ventaja en salvaciones hasta su siguiente turno." }),
  memento: debuff({ trigger: "automatic", durationRounds: 2, modifiers: { incomingAttackAdvantage: true, speedOverride: 0, saves: { str: -100, dex: -100 }, statuses: ["incapacitated"] }, description: "Incapacitado durante 2 rondas: velocidad 0, no puede atacar y falla automáticamente salvaciones de FUE y DES." }),
  "night-daze": debuff({ trigger: "natural", natural: 13, durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en su siguiente ataque o ventaja para los objetivos de su siguiente salvación." }),
  "nasty-plot": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { attackAdvantageAbilities: ["int", "wis", "cha"], saveTargetsDisadvantageAbilities: ["int", "wis", "cha"] }, description: "Ventaja en ataques de INT, SAB o CAR y desventaja en las salvaciones que exijan durante 1 minuto." }),
  octazooka: debuff({ trigger: "natural", natural: 18, durationRounds: combat, stackMax: 5, modifiers: { attack: -1 }, description: "−1 a los ataques durante el combate." }),
  octolock: debuff({ trigger: "automatic", durationRounds: combat, stackMax: 5, modifiers: { ac: -1, statuses: ["grappled"] }, description: "Agarrado y −1 a la CA; puede reducirse cada turno hasta −5 y termina al romper el agarre." }),
  "odor-sleuth": debuff({ trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { blockAcIncrease: true, bypassTypes: ["ghost", "normal", "fighting"] }, description: "No puede aumentar su CA y pierde inmunidades frente a Fantasma, Normal y Lucha durante 1 minuto." }),
  poltergeist: debuff({ trigger: "failed-save", durationRounds: minute, concentration: true, modifiers: { disableHeldItem: true }, description: "No puede beneficiarse de su objeto equipado mientras permanezca bajo el control de Poltergeist." }),
  "ominous-wind": buff({ target: "self", trigger: "natural", natural: 19, durationRounds: combat, stackMax: 5, modifiers: { abilities: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } }, description: "+1 a todas las características durante el combate; se acumula hasta +5." }),
  overheat: debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en el siguiente ataque o ventaja para sus objetivos si exige salvación." }),
  "power-swap": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { abilitySwap: true }, description: "Intercambia una puntuación de característica con el usuario hasta el final de su siguiente turno; la característica se resuelve manualmente." }),
  "psycho-boost": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en el siguiente ataque o ventaja para sus objetivos si exige salvación." }),
  "play-nice": debuff({ trigger: "failed-save", durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en su siguiente ataque o ventaja para los objetivos de su siguiente salvación." }),
  "play-rough": debuff({ trigger: "natural", natural: 19, durationRounds: combat, stackMax: 5, modifiers: { attack: -1 }, description: "−1 a los ataques durante el combate; se acumula hasta −5." }),
  "razor-shell": debuff({ trigger: "natural", natural: 18, durationRounds: combat, stackMax: 5, modifiers: { ac: -1 }, description: "−1 a la CA durante el combate; se acumula hasta −5." }),
  rage: buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { damage: 1, normalResistance: true, strengthCheckAdvantage: true }, description: "+1 al daño, resistencia a Normal y ventaja en pruebas de FUE mientras mantenga la concentración." }),
  "razor-wind": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, modifiers: { ac: 2 }, description: "+2 a la CA mientras carga el movimiento." }),
  "rock-smash": debuff({ trigger: "natural", natural: 19, durationRounds: combat, stackMax: 5, modifiers: { ac: -1 }, description: "−1 a la CA durante el combate." }),
  "sand-attack": debuff({ trigger: "failed-save", durationRounds: combat, stackMax: 5, modifiers: { attack: -1 }, description: "−1 a todos los ataques durante el combate; se acumula hasta −5." }),
  snarl: debuff({ trigger: "failed-save", durationRounds: nextTurn, consume: "move", sourceOnly: true, modifiers: { attackDisadvantage: true }, description: "Desventaja en el siguiente ataque si se dirige contra quien usó Alarido." }),
  "sandsear-storm": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { areaEffect: true }, description: "Mantiene la tormenta abrasadora mientras conserve la concentración; Quemado se gestiona como estado independiente." }),
  screech: debuff({ trigger: "failed-save", durationRounds: minute, stackMax: 3, modifiers: { ac: -1 }, description: "Los aliados obtienen +1 al atacarlo durante 1 minuto; se acumula hasta +3." }),
  "seed-flare": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true }, description: "Los ataques contra el objetivo tienen ventaja hasta el final del siguiente turno del usuario." }),
  "shadow-ball": debuff({ trigger: "hit", durationRounds: nextTurn, consume: "move", modifiers: { attack: -2 }, description: "−2 a su siguiente ataque." }),
  "shadow-bone": debuff({ trigger: "natural", natural: 18, durationRounds: combat, stackMax: 5, modifiers: { ac: -1 }, description: "−1 a la CA durante el combate; se acumula hasta −5." }),
  "scale-shot": debuff({ target: "self", trigger: "hit", durationRounds: nextTurn, modifiers: { ac: -2, speed: 10 }, description: "+10 pies de velocidad y −2 a la CA hasta el final de su siguiente turno." }),
  "silver-wind": buff({ target: "self", trigger: "natural", natural: 19, durationRounds: combat, stackMax: 5, modifiers: { abilities: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } }, description: "+1 a todas las características durante el combate; se acumula hasta +5." }),
  "skull-bash": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, modifiers: { charging: true }, description: "Preparando el cabezazo del siguiente turno mientras mantenga la concentración." }),
  "solar-beam": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, modifiers: { charging: true }, description: "Absorbiendo luz para liberar el rayo en el siguiente turno mientras mantenga la concentración." }),
  smokescreen: debuff({ trigger: "failed-save", durationRounds: minute, concentration: true, repeatSave: "con", modifiers: { statuses: ["blinded"] }, description: "Cegado dentro del humo durante 1 minuto; repite la salvación de CON al inicio de sus turnos." }),
  "spirit-break": debuff({ trigger: "hit", durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true }, description: "Desventaja en su siguiente ataque." }),
  "springtide-storm": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { attackDisadvantage: true }, description: "Desventaja en todos los ataques hasta el final de su siguiente turno." }),
  "string-shot": debuff({ trigger: "hit", durationRounds: minute, stackMax: 20, modifiers: { speed: -10 }, description: "−10 pies de velocidad durante 1 minuto; se acumula y puede retirarse con una salvación de FUE." }),
  "tail-whip": debuff({ trigger: "failed-save", durationRounds: minute, stackMax: 5, modifiers: { ac: -1 }, description: "Los aliados obtienen +1 al atacarlo durante 1 minuto; se acumula hasta +5." }),
  "swords-dance": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { ac: 1 }, description: "+1 a la CA mientras mantenga la concentración." }),
  "tar-shot": debuff({ trigger: "hit", durationRounds: combat, stackMax: 20, modifiers: { speed: -10, fireVulnerability: true }, description: "−10 pies de velocidad y vulnerabilidad al Fuego hasta limpiarse; se acumula hasta velocidad 0." }),
  "tearful-look": debuff({ trigger: "failed-save", durationRounds: minute, stackMax: 5, modifiers: { attack: -1 }, description: "−1 a los ataques durante 1 minuto; se acumula hasta −5." }),
  "thousand-arrows": debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { speedFlyOverride: 0, grounded: true, statuses: ["prone"] }, description: "Derribado y conectado a tierra: pierde el vuelo y vuelve a ser susceptible al daño de Tierra hasta levantarse." }),
  "toxic-thread": debuff({ trigger: "hit", durationRounds: combat, stackMax: 20, modifiers: { speed: -10 }, description: "−10 pies de velocidad mientras permanezcan los hilos; se acumula hasta velocidad 0." }),
  "triple-arrows": debuff({ trigger: "hit", durationRounds: combat, stackMax: 5, modifiers: { ac: -1 }, description: "−1 a la CA durante el combate por el segundo impacto; se acumula hasta −5." }),
  "trop-kick": debuff({ trigger: "natural", natural: 16, durationRounds: combat, stackMax: 3, modifiers: { attack: -1 }, description: "−1 a los ataques durante el combate; se acumula hasta −3." }),
  "tidy-up": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, consume: "move", modifiers: { attackAdvantage: true }, description: "Ventaja en el siguiente ataque hasta el final de su siguiente turno." }),
  whirlwind: buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { ac: 2 }, description: "+2 a la CA hasta el principio de su siguiente turno." }),
  "wildbolt-storm": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { areaEffect: true }, description: "Mantiene la tormenta eléctrica mientras conserve la concentración; Paralizado se gestiona como estado independiente." }),
  "work-up": buff({ target: "self", trigger: "automatic", durationRounds: minute, modifiers: { attack: 2 }, description: "+2 a todos los ataques mientras continúe combatiendo activamente." }),

  coaching: buff({ trigger: "automatic", durationRounds: tenMinutes, concentration: true, modifiers: { attack: 1, ac: 1 }, description: "+1 a los ataques y a la CA durante 10 minutos mientras se mantenga la concentración." }),
  decorate: buff({ trigger: "automatic", durationRounds: combat, modifiers: { attackAdvantage: true }, description: "Ventaja en los ataques hasta fallar la concentración al recibir daño." }),
  flatter: buff({ trigger: "failed-save", durationRounds: 3, modifiers: { attack: 2 }, description: "+2 a los ataques mientras permanezca Confuso." }),
  "gear-up": buff({ trigger: "automatic", durationRounds: minute, concentration: true, requiredAbilities: ["plus", "minus"], modifiers: { attackAdvantage: true }, description: "Ventaja en los ataques mientras se mantenga la concentración." }),
  growth: buff({ trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { attackDice: "1d4", saveDice: "1d4" }, description: "+1d4 a ataques y salvaciones durante 1 minuto." }),
  "helping-hand": buff({ trigger: "automatic", durationRounds: tenMinutes, consume: "roll", modifiers: { attackDice: "1d6", saveDice: "1d6" }, description: "+1d6 a un ataque, prueba o salvación durante los próximos 10 minutos." }),
  "spicy-extract": debuff({ trigger: "failed-save", durationRounds: minute, modifiers: { attackAdvantage: true, incomingAttackAdvantage: true }, description: "Sus ataques tienen ventaja, pero los ataques contra él también tienen ventaja." }),
  spotlight: debuff({ trigger: "failed-save", durationRounds: minute, modifiers: { incomingAttackAdvantage: true }, description: "Los ataques contra el objetivo tienen ventaja durante 1 minuto." }),
  swagger: buff({ trigger: "failed-save", durationRounds: 3, modifiers: { attack: 2 }, description: "+2 a los ataques mientras permanezca Confuso." }),

  // Auditoría completa de los 830 movimientos (agosto 2026): entradas añadidas
  // tras revisar cada movimiento sin cobertura previa. Cuando el texto original
  // combina el efecto codificado con otro no representable en este esquema
  // (cambio de Pokémon forzado, robo/copia de movimientos, lectura de recursos
  // ajenos, reposicionamiento en el mapa...), la descripción lo deja anotado
  // para resolución manual del director; ver CONTEXTUAL_MODIFIER_COVERAGE y los
  // movimientos deliberadamente ausentes de los tres catálogos (multigolpes,
  // trampas reactivas al cambio de Pokémon, variantes de fórmula de daño/curación
  // condicionadas, bloqueos de recarga del propio movimiento, etc.).
  "acid-armor": buff({ target: "self", trigger: "automatic", durationRounds: combat, modifiers: { ac: 2 }, description: "+2 a la CA durante el combate. Además, cualquier criatura que la golpee cuerpo a cuerpo debe superar una salvación de CON o sufrir 1d6 (2d6 a partir de nivel 10) de daño de veneno: ese contraataque no se automatiza porque no hay disparador de 'daño al atacante al ser golpeado' en este catálogo." }),
  amnesia: buff({ target: "self", trigger: "automatic", durationRounds: combat, modifiers: { saves: { str: 2, dex: 2, con: 2, int: 2, wis: 2, cha: 2 } }, description: "+2 a todas las salvaciones durante el combate. El coste (olvidar un movimiento propio distinto de Amnesia mientras dure) exige elegirlo manualmente entre los movimientos conocidos; no se automatiza." }),
  "aqua-step": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { speed: 10 }, description: "+10 pies de velocidad hasta el final de su siguiente turno, impacte o no." }),
  autotomize: buff({ target: "self", trigger: "automatic", durationRounds: combat, stackMax: 3, modifiers: { speed: 10 }, description: "+10 pies de velocidad durante el combate; se acumula hasta 3 veces (+30 pies)." }),
  "belly-drum": buff({ target: "self", trigger: "automatic", durationRounds: combat, modifiers: { abilities: { str: 10 } }, description: "+10 a Fuerza mientras siga en combate (el coste de la mitad de sus PG actuales lo aplica el daño base del movimiento). El efecto debería retirarse a mano si sus PG suben por encima de la mitad del máximo: el motor no rastrea ese umbral." }),
  "body-slam": debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Derribado (Prono) tras fallar la salvación de FUE, hasta levantarse." }),
  charge: buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { ac: 2, moveModifierMultiplier: 2 }, description: "+2 a la CA hasta su siguiente turno; en su siguiente ataque de su tipo, duplica el modificador MOVE del daño (bono STAB)." }),
  "clangorous-soul": buff({ target: "self", trigger: "automatic", durationRounds: combat, stackMax: 5, modifiers: { attack: 1, ac: 1, damage: 1 }, description: "+1 a los ataques, la CA y el daño durante el resto del combate o hasta cambiar de Pokémon; se acumula hasta cinco veces (+5 cada uno). Los 3d6 de daño típeless que cuesta se resuelven con el daño base del movimiento." }),
  "close-combat": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true }, description: "Los ataques del objetivo contra el usuario tienen ventaja hasta el principio de su siguiente turno." }),
  "collision-course": debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Derribado (Prono) tras fallar la salvación de FUE, hasta levantarse. El daño doble a enterrados/en fase invulnerable de Excavar, el terreno difícil resultante y la inmunidad de los Alzados son detalles del daño base/terreno, no modificadores de este catálogo." }),
  "cosmic-power": buff({ target: "self", trigger: "automatic", durationRounds: combat, modifiers: { saveAdvantage: true }, description: "Ventaja en todas las salvaciones durante el combate." }),
  "defense-curl": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { ac: 4, normalResistance: true }, description: "+4 a la CA y resistencia a los ataques de tipo Normal hasta su siguiente turno." }),
  "drum-beating": debuff({ target: "self", trigger: "automatic", durationRounds: combat, concentration: true, modifiers: { speedOverride: 0, areaEffect: true }, description: "Mientras mantenga la concentración, su velocidad es 0. El área reduce a la mitad la velocidad de las criaturas afectadas y les inflige daño de Planta al entrar o empezar su turno ahí; ese daño por zona se resuelve manualmente porque no hay un objetivo fijo que registrar como en las trampas mantenidas de ongoing-effects.mjs." }),
  earthquake: debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Derribado (Prono) tras fallar la salvación de FUE, hasta levantarse. El daño doble a enterrados/en fase invulnerable de Excavar, el terreno difícil resultante y la inmunidad de los Alzados son detalles del daño base/terreno, no modificadores de este catálogo." }),
  electroweb: debuff({ trigger: "hit", durationRounds: combat, stackMax: 20, modifiers: { speed: -5 }, description: "−5 pies de velocidad por impacto; el objetivo puede retirar la telaraña como acción. Al llegar a velocidad 0 queda apresado. Se acumula hasta velocidad 0." }),
  embargo: debuff({ trigger: "failed-save", durationRounds: minute, concentration: true, modifiers: { disableHeldItem: true }, description: "No puede beneficiarse de ningún objeto equipado ni de objeto de entrenador mientras el usuario mantenga la concentración." }),
  "esper-wing": buff({ target: "self", trigger: "hit", durationRounds: combat, stackMax: 6, modifiers: { speed: 5 }, description: "+5 pies de velocidad por impacto hasta ser incapacitado, cambiado o terminar el combate; se acumula hasta +30." }),
  eternabeam: debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { statuses: ["incapacitated"] }, description: "Incapacitado hasta el final de su siguiente turno." }),
  "fillet-away": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, consume: "move", modifiers: { attackAdvantage: true, speed: 15 }, description: "Ventaja en su siguiente ataque y +15 pies de velocidad hasta el principio de su siguiente turno." }),
  flash: debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { statuses: ["blinded"] }, description: "Cegado hasta el final de su siguiente turno." }),
  "focus-energy": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { critRange: 2 }, description: "Reduce en 2 el umbral de golpe crítico mientras mantenga la concentración; no se acumula." }),
  "focus-punch": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, modifiers: { charging: true }, description: "Concentrado en el golpe que liberará en su siguiente turno mientras mantenga la concentración." }),
  foresight: buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, consume: "move", modifiers: { bypassTypes: ["ghost", "normal", "fighting"] }, description: "Su siguiente movimiento de tipo Fantasma, Normal o Lucha ignora las inmunidades de tipo del objetivo; el tipo secundario se aplica para resistencia o vulnerabilidad." }),
  "gastro-acid": debuff({ trigger: "hit", durationRounds: minute, concentration: true, modifiers: { disableAbility: true }, description: "No puede beneficiarse del efecto de su habilidad mientras el usuario mantenga la concentración." }),
  geomancy: buff({ target: "self", trigger: "automatic", durationRounds: 3, modifiers: { speed: 10, attackAdvantage: true, saveAdvantage: true }, description: "+10 pies de velocidad y ventaja en todos los ataques y salvaciones durante tres rondas." }),
  "glaive-rush": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true }, description: "Los ataques contra el usuario tienen ventaja hasta el principio de su siguiente turno." }),
  "grass-knot": debuff({ trigger: "natural", natural: 19, durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Con un resultado natural de 19 o más, el objetivo cae derribado hasta levantarse." }),
  "guard-swap": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { acSwap: true }, description: "Intercambia su CA con el usuario hasta el final de su siguiente turno; el intercambio se resuelve manualmente." }),
  "hammer-arm": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { saveDisadvantageAbilities: ["dex"], speedMultiplier: 0.5 }, description: "Desventaja en salvaciones de DES y velocidad reducida a la mitad hasta el principio de su siguiente turno." }),
  harden: buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { damageReductionFormula: "1d4+move" }, description: "Reduce el daño recibido en 1d4 + MOVE (según nivel) hasta el principio de su siguiente turno." }),
  headbutt: debuff({ trigger: "natural", natural: 18, durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Con un resultado natural de 18 o más, el objetivo cae derribado hasta levantarse." }),
  "headlong-rush": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true }, description: "El objetivo atacado tiene ventaja en sus ataques contra el usuario hasta el principio de su siguiente turno." }),
  "hone-claws": buff({ target: "self", trigger: "automatic", durationRounds: combat, stackMax: 3, modifiers: { attack: 1, damage: 1 }, description: "+1 a los ataques y al daño; se acumula hasta +3." }),
  "horn-attack": debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Si el usuario se desplazó 20 pies o más en línea recta hacia el objetivo antes de atacar, este cae derribado al fallar una salvación de FUE." }),
  "hyperspace-fury": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { incomingAttackAdvantage: true }, description: "Los ataques contra el usuario tienen ventaja hasta el principio de su siguiente turno. El bloqueo de reacciones tipo Protección/Detectar no tiene campo equivalente y queda sin automatizar." }),
  "ice-hammer": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { saveDisadvantageAbilities: ["dex"], speedMultiplier: 0.5 }, description: "Desventaja en salvaciones de DES y velocidad reducida a la mitad hasta el final de su siguiente turno." }),
  "icy-wind": debuff({ trigger: "natural", natural: 18, durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Con una tirada natural de 18 o más, el objetivo cae derribado." }),
  "iron-defense": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { ac: 6 }, description: "+6 a la CA hasta el final de su siguiente turno. La mecánica de 'si eras vulnerable ahora normal, si eras resistente ahora inmune' a todos los tipos de daño no tiene campo genérico de resistencia en este catálogo y debe gestionarse manualmente." }),
  kinesis: buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { speed: 20 }, description: "+20 pies a caminar, volar o nadar (si ya era mayor que 0) durante 1 minuto; no se acumula. El +2 a la CA solo frente a ataques a distancia no tiene campo equivalente y queda sin automatizar." }),
  "leaf-storm": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, consume: "move", modifiers: { attackDisadvantage: true, saveTargetsAdvantage: true }, description: "Desventaja en el siguiente ataque o ventaja para sus objetivos si exige salvación, tras quedar sin energía." }),
  "low-sweep": debuff({ trigger: "failed-save", requiresHit: true, durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Con un impacto, si falla la salvación de FUE queda derribado." }),
  "meteor-beam": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, modifiers: { charging: true }, description: "Absorbiendo energía cósmica para liberar el rayo en el siguiente turno mientras mantenga la concentración." }),
  "miracle-eye": debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { bypassTypes: ["dark", "ghost"] }, description: "Si el objetivo es de tipo Siniestro o Fantasma, pierde sus inmunidades hasta retirarse (sigue las resistencias/vulnerabilidades de su tipo secundario si corresponde)." }),
  "no-retreat": buff({ target: "self", trigger: "automatic", durationRounds: combat, modifiers: { attackAdvantage: true, saveAdvantage: true }, description: "Ventaja en ataques y salvaciones mientras dure el combate. 'No puede cambiar de Pokémon ni huir' es un bloqueo de flujo de retirada sin campo equivalente y queda sin automatizar." }),
  "phantom-force": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { invulnerable: true, charging: true }, description: "Invisible mientras prepara el golpe fantasmal del siguiente turno; no puede ser objetivo de ataques mientras dura. La ventaja del ataque de reaparición y el bloqueo de Protección/Detectar no se codifican aparte, igual que en el resto de la familia Volar/Cavar/Bucear." }),
  "power-trick": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { abilitySwap: true }, description: "Intercambia su CA con una característica de su elección (excepto Constitución) hasta el final de su siguiente turno; la característica se resuelve manualmente." }),
  "psychic-noise": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { preventHealing: true }, description: "No puede recuperar Puntos de Golpe hasta el final del siguiente turno del usuario." }),
  "psyshield-bash": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { ac: 1 }, description: "+1 a la CA hasta el final de su siguiente turno." }),
  reflect: buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { meleeDamageResistance: true }, description: "Reduce a la mitad el daño de cualquier ataque cuerpo a cuerpo que reciba, incluido el que activó la reacción, hasta el principio de su siguiente turno." }),
  "rock-polish": buff({ target: "self", trigger: "automatic", durationRounds: 3, modifiers: { ac: 2, speed: 20 }, description: "+2 a la CA y +20 pies de velocidad durante tres rondas." }),
  "rock-slide": debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Cae derribado en una salvación de FUE fallida, hasta que pueda levantarse." }),
  "shadow-force": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { invulnerable: true, charging: true, attackAdvantage: true }, description: "Invisible e inalcanzable mientras prepara el golpe; en su siguiente turno ataca con ventaja y las reacciones Protección/Detectar no pueden usarse contra ese ataque." }),
  "shell-smash": buff({ target: "self", trigger: "automatic", durationRounds: combat, modifiers: { ac: -1, damageProficiency: true }, description: "−1 a la CA, pero suma su competencia a todas las tiradas de daño (una vez por movimiento); no se acumula." }),
  shelter: buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { ac: 5 }, description: "+5 a la CA hasta el principio de su siguiente turno, incluso contra el ataque que activó la reacción." }),
  "sky-attack": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, modifiers: { charging: true }, description: "Prepara el picado del siguiente turno mientras mantenga la concentración, ignorando su velocidad de vuelo y los ataques de oportunidad." }),
  "smack-down": debuff({ trigger: "hit", durationRounds: combat, modifiers: { grounded: true, statuses: ["prone"] }, description: "Un objetivo 'Alzado' cae derribado, pierde su velocidad de vuelo y su inmunidad a movimientos de Tierra hasta que pueda moverse de nuevo." }),
  "solar-blade": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, modifiers: { charging: true }, description: "Reúne energía solar para golpear con hojas en el siguiente turno mientras mantenga la concentración; con luz solar intensa actúa sin carga ni concentración y dobla su modificador MOVE." }),
  "spacial-rend": debuff({ trigger: "failed-save-margin", saveMargin: 5, durationRounds: nextTurn, modifiers: { statuses: ["incapacitated"], invulnerable: true }, description: "Si falla la salvación por 5 o más, es arrastrado al Plano Etéreo: incapacitado e inalcanzable hasta el principio del siguiente turno del usuario." }),
  "speed-swap": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { speedSwap: true }, description: "Intercambia su velocidad con la del usuario hasta el final de su siguiente turno; el valor se resuelve manualmente." }),
  "spin-out": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { saveDisadvantageAbilities: ["dex"], speedMultiplier: 0.5 }, description: "Desventaja en las salvaciones de DES y velocidad reducida a la mitad hasta el final de su siguiente turno." }),
  "spirit-shackle": debuff({ trigger: "hit", durationRounds: combat, modifiers: { statuses: ["grappled"] }, description: "El objetivo queda agarrado por su propia sombra: no puede huir ni ser retirado mientras el usuario permanezca en combate." }),
  "steel-wing": buff({ target: "self", trigger: "natural", natural: 19, durationRounds: nextTurn, modifiers: { ac: 1 }, description: "+1 a la CA hasta el final de su siguiente turno tras una tirada natural de 19 o 20." }),
  stockpile: buff({ target: "self", trigger: "automatic", durationRounds: combat, stackMax: 3, modifiers: { ac: 1 }, description: "+1 a la CA por cada carga acumulada, hasta 3 veces, mientras no se use Trago o Tragar (esa consumición concreta la resuelve Trago/Tragar, no esta entrada)." }),
  "stuff-cheeks": buff({ target: "self", trigger: "automatic", durationRounds: tenMinutes, stackMax: 2, modifiers: { ac: 2 }, description: "+2 a la CA durante 10 minutos al consumir un objeto de comida equipado; se acumula hasta +4." }),
  superpower: debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { abilities: { str: -10, dex: -10 } }, description: "FUE y DES se reducen en 10 hasta el final de su siguiente turno por el esfuerzo del movimiento." }),
  surf: debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Cae derribado por la ola además de recibir el daño." }),
  "sweet-scent": buff({ target: "self", trigger: "failed-save", durationRounds: nextTurn, stackMax: 2, consume: "move", modifiers: { attackAdvantage: true }, description: "Ventaja en sus próximos dos ataques contra el objetivo si este falla la salvación de CAR." }),
  "syrup-bomb": debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Cae derribado por el impacto inicial del jarabe. El jarabe persistente en el suelo, que derriba a quien entre en la zona o termine su turno ahí, no tiene objetivo fijo que registrar y debe resolverlo el director a mano." }),
  tailwind: buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { areaEffect: true, speedMultiplier: 2 }, description: "Mantiene una ráfaga en un radio de 30 pies mientras conserve la concentración; duplica la velocidad de quien comience su turno dentro del área." }),
  "thousand-waves": debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { statuses: ["grappled"] }, description: "El objetivo queda agarrado por la onda: no puede huir ni ser retirado mientras el usuario permanezca en combate." }),
  "thunderous-kick": debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Cae derribado por la patada; el director debe desplazarlo manualmente hasta 15 pies como parte del impacto." }),
  trailblaze: buff({ target: "self", trigger: "hit", durationRounds: combat, stackMax: 6, modifiers: { speed: 5 }, description: "+5 pies de velocidad por impacto hasta quedar incapacitado, ser retirado o acabar el combate; se acumula hasta +30." }),
  "v-create": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { ac: -2 }, description: "−2 a la CA hasta el principio de su siguiente turno." }),
  "water-sport": buff({ target: "source-and-selected", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { fireResistance: true }, description: "Resistencia a Fuego durante 1 minuto para el usuario y sus aliados en el momento de activarlo; quien ya fuera resistente se vuelve inmune y quien fuera vulnerable pasa a recibir daño normal." }),
  waterfall: debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "Cae derribado por la cascada además de recibir el daño." }),

  // Segunda pasada de la auditoría (agosto 2026): dos casos que la primera
  // ronda no marcó como candidatos porque su texto no contenía ninguna de las
  // palabras clave buscadas, encontrados al revisar a mano los movimientos con
  // salvación que quedaron sin ningún tipo de cobertura.
  "guard-split": debuff({ trigger: "failed-save", durationRounds: combat, modifiers: { acSwap: true }, description: "Su CA pasa a ser el promedio (redondeado hacia abajo) entre la suya y la del objetivo hasta retirarse; el valor se resuelve manualmente." }),
  "magma-storm": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { areaEffect: true }, description: "Mantiene un maelstrom de fuego en un radio de 40 pies mientras conserve la concentración." }),

  // Escalada consecutiva (multi-hit.mjs): la pila de este mismo motor de
  // modificadores lleva la cuenta de usos consecutivos que impactan; pokemon-
  // sheet.mjs lee el número de pilas antes de tirar daño para duplicar los
  // dados correspondientes y borra la entrada si el ataque falla.
  "ice-ball": buff({ target: "self", trigger: "hit", durationRounds: combat, stackMax: CONSECUTIVE_ESCALATION_MOVES["ice-ball"].maxStacks, modifiers: { consecutiveStrike: true }, description: "Duplica los dados de daño en cada golpe consecutivo, hasta 8 veces el original; se reinicia al fallar o quedar incapacitado." }),
  outrage: buff({ target: "self", trigger: "automatic", durationRounds: 3, stackMax: CONSECUTIVE_ESCALATION_MOVES.outrage.maxStacks, modifiers: { consecutiveStrike: true }, description: "Duplica los dados de daño cada ronda durante tres rondas de arrebato automático; termina en Confuso, que se resuelve manualmente." }),
  rollout: buff({ target: "self", trigger: "hit", durationRounds: combat, stackMax: CONSECUTIVE_ESCALATION_MOVES.rollout.maxStacks, modifiers: { consecutiveStrike: true }, description: "Duplica los dados de daño en cada golpe consecutivo, hasta 16 veces el original; se reinicia al fallar, quedar incapacitado o si su velocidad llega a 0." }),

  // Recarga: tras usar el movimiento no puede volver a activarse hasta el
  // final de su siguiente turno. move-modifiers.mjs expone isMoveRecharging()
  // para que pokemon-sheet.mjs bloquee el intento igual que hace con los PP
  // agotados; el efecto caduca solo gracias a durationRounds, sin necesidad de
  // borrarlo a mano.
  "blast-burn": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { rechargeLock: true }, description: "No puede volver a activarse hasta el final de su siguiente turno." }),
  "frenzy-plant": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { rechargeLock: true }, description: "No puede volver a activarse hasta el final de su siguiente turno." }),
  "giga-impact": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { rechargeLock: true }, description: "No puede volver a activarse hasta el final de su siguiente turno." }),
  "gigaton-hammer": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { rechargeLock: true }, description: "No puede volver a activarse hasta el final de su siguiente turno." }),
  "hydro-cannon": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { rechargeLock: true }, description: "No puede volver a activarse hasta el final de su siguiente turno." }),
  "hyper-beam": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { rechargeLock: true }, description: "No puede volver a activarse hasta el final de su siguiente turno." }),
  "meteor-assault": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { rechargeLock: true }, description: "No puede volver a activarse hasta el final de su siguiente turno." }),
  "prismatic-laser": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { rechargeLock: true }, description: "No puede volver a activarse hasta el final de su siguiente turno." }),
  "rock-wrecker": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { rechargeLock: true }, description: "No puede volver a activarse hasta el final de su siguiente turno." }),
  "roar-of-time": debuff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { rechargeLock: true }, description: "No puede volver a activarse hasta el final de su siguiente turno. El bloqueo total de ataque que sufre el usuario mientras recarga no tiene campo equivalente y queda sin automatizar." }),

  // Impacto y crítico garantizados: pokemon-sheet.mjs lee estas banderas antes
  // de resolver el siguiente ataque y sustituye el resultado de la tirada.
  "lock-on": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, consume: "move", modifiers: { guaranteedHit: true }, description: "Su siguiente ataque no puede fallar (salvo movimientos de un solo golpe como Fisura); la tirada solo decide crítico o efectos por resultado alto." }),
  "mind-reader": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, consume: "move", modifiers: { guaranteedHit: true }, description: "Su siguiente ataque no puede fallar (salvo movimientos de un solo golpe como Fisura); la tirada solo decide crítico o efectos por resultado alto." }),
  "laser-focus": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, concentration: true, consume: "move", modifiers: { guaranteedCritical: true }, description: "Su primer ataque del siguiente turno es un crítico automático si mantiene la concentración." }),

  // Restricción de movimientos: bloquea cualquier movimiento del objetivo
  // hasta el final de su siguiente turno. pokemon-sheet.mjs comprueba la
  // bandera antes de dejar activar cualquier movimiento, no solo este.
  encore: debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { moveLockAll: true }, description: "No puede activar ningún movimiento hasta el final de su siguiente turno." }),

  // Reposicionamiento: el empuje de 10 pies en la dirección contraria al
  // objetivo no es automatizable sin un vector de orientación, así que se deja
  // como nota; el derribo (Prono) sí se aplica con el mismo campo `statuses`
  // que ya usan body-slam y compañía. El daño de caída de 2d6 típeless (si
  // estaba en tierra) o el cálculo de caída (si volaba) también quedan
  // anotados: dependen de saber si el usuario estaba en el aire, un dato que
  // este catálogo no rastrea.
  "steel-beam": debuff({ target: "self", trigger: "automatic", durationRounds: combat, modifiers: { statuses: ["prone"] }, description: "El retroceso lo empuja 10 pies en la dirección opuesta al objetivo (desplazamiento manual) y cae derribado. Si estaba en tierra sufre 2d6 de daño típeless; si volaba, se calcula el daño de caída correspondiente; ninguno de los dos se automatiza." }),

  // Purga y protección de estado (bloque de curas/inmunidades): mist bloquea
  // futuros debuffs sobre el objetivo comprobando debuffImmune en
  // applyMoveModifierEffects(); take-heart cura sus propios estados negativos
  // al usarse (pokemon-sheet.mjs) y de paso se vuelve inmune a nuevos estados
  // durante un turno con statusImmune, comprobado en applyPokemonStatus().
  mist: buff({ trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { debuffImmune: true }, description: "Inmune a nuevas penalizaciones de característica, ataque o CA mientras se mantenga la concentración; los efectos que ya tuviera antes siguen activos." }),
  "core-enforcer": debuff({ trigger: "failed-save", requiresHit: true, durationRounds: combat, modifiers: { disableAbility: true }, description: "No puede beneficiarse del efecto de su Habilidad hasta que sea cambiado." }),
  "mud-sport": buff({ target: "source-and-selected", trigger: "automatic", durationRounds: minute, modifiers: { electricResistance: true }, description: "Resistencia a Eléctrico durante 1 minuto para el usuario y sus aliados en el momento de activarlo; quien ya fuera resistente se vuelve inmune y quien fuera vulnerable pasa a recibir daño normal." }),
  "magnet-rise": buff({ target: "self", trigger: "automatic", durationRounds: minute, concentration: true, modifiers: { groundImmunity: true }, description: "Inmune a movimientos de tipo Tierra mientras mantenga la concentración." }),

  // Bloqueo de retirada: recallLock lo comprueba actorHasRecallLock() en
  // ongoing-effects.mjs (usado por recallPokemon() en deployment.mjs) además
  // del propio rastreo de condiciones mantenidas.
  "mean-look": debuff({ trigger: "failed-save", durationRounds: 3, modifiers: { recallLock: true }, description: "No puede huir ni ser retirado durante tres rondas." }),
  "fairy-lock": debuff({ trigger: "automatic", durationRounds: nextTurn, modifiers: { recallLock: true }, description: "No puede huir ni ser retirado hasta su siguiente turno. Se aproxima con los objetivos que el usuario seleccione manualmente; el radio real de 40 pies no se comprueba automáticamente." }),
  "parting-shot": debuff({ trigger: "failed-save", durationRounds: nextTurn, modifiers: { damageHalved: true }, description: "Su siguiente movimiento de daño hace la mitad; el usuario se retira del combate de inmediato." }),
  "take-heart": buff({ target: "self", trigger: "automatic", durationRounds: nextTurn, modifiers: { statusImmune: true, attackAdvantageAbilities: ["wis", "cha"], saveAdvantageAbilities: ["wis", "cha"] }, description: "Cura el estado negativo o Asustado que lo activó e inmuniza contra nuevos estados hasta el final de su siguiente turno; ventaja en ataques de SAB/CAR y en esas salvaciones durante el mismo tiempo." })
});

/** Candidatos auditados que pertenecen a otro motor y no deben duplicarse aquí. */
export const CONTEXTUAL_MODIFIER_COVERAGE = Object.freeze({
  clamp: "Efecto de agarre y repetición gestionado por ongoing-effects.mjs.",
  curse: "Las dos variantes de Maldición se gestionan por ongoing-effects.mjs.",
  "fell-stinger": "El bono depende de que el flujo de daño de D&D reduzca al objetivo a 0 PG; se confirma manualmente.",
  torment: "El bloqueo recae sobre quien golpea después a quien tiene Torment activo, no sobre un objetivo elegido al usar el movimiento; el motor solo aplica reglas al usar un movimiento, no como vigilante permanente sobre ataques futuros de terceros. Se resuelve manualmente.",
  recycle: "Exige recordar si se consumió un objeto equipado en los últimos 5 turnos; held-items.mjs no lleva ese historial de uso todavía. Se resuelve manualmente.",
  "heart-swap": "Intercambia TODOS los modificadores activos (característica, CA, ataque, daño...) entre dos actores completos, no un valor conocido como guard-swap/power-swap; mover ActiveEffects enteros de un actor a otro de forma fiable, con su duración restante intacta, excede lo que este motor garantiza sin arriesgar efectos corruptos. Se resuelve manualmente.",
  conversion: "Cambiar el propio tipo reemplazando (no sumando) sus resistencias/vulnerabilidades/inmunidades exigiría capturar el estado anterior exacto para poder restaurarlo al expirar, algo que el modelo de ActiveEffect por ADD de este motor no garantiza sin riesgo de dejar rastros. Se resuelve manualmente.",
  "conversion-2": "Mismo motivo que conversion: cambio de tipo reactivo sin mecanismo fiable de restauración al expirar. Se resuelve manualmente.",
  "double-shock": "Pierde su tipo Eléctrico hasta el próximo descanso corto, una duración que no se mide en rondas de combate y que ningún motor de este proyecto rastrea todavía. Se resuelve manualmente.",
  grudge: "Reacción cruzada: se dispara cuando OTRO Pokémon reduce a 0 PG a quien tiene Grudge activo, y penaliza los PP de quien lo golpeó; pertenece a la misma familia que los escudos de reacción (bloque 8) más que a un modificador de uso propio. Se resuelve manualmente.",
  "skill-swap": "Intercambia las Habilidades Pokémon (no las características de D&D) de dos criaturas 'durante la duración': es una mutación temporal de datos permanentes del Pokémon (instance.abilities) sin mecanismo de restauración automática al expirar; el riesgo de dejar una Habilidad cambiada para siempre por error supera el beneficio. Se resuelve manualmente.",
  "worry-seed": "Sustituye la Habilidad del objetivo por Insomnio 'durante la duración': mismo riesgo que skill-swap de mutar permanentemente instance.abilities sin poder revertirlo con seguridad al expirar. Se resuelve manualmente.",
  "me-first": "Copiar el movimiento de otra criatura exige interceptar su tirada antes de que se resuelva, algo que el flujo de turnos de esta ficha (una acción del jugador a la vez) no soporta entre dos actores distintos. Se resuelve manualmente.",
  block: "Reacción pasiva: vigila a cualquier criatura en rango que intente huir o cambiar en cualquier momento futuro, no a un objetivo elegido al activar el movimiento. Pertenece a la misma familia que los escudos de reacción (bloque 8). Se resuelve manualmente.",
  "shed-tail": "Reacción que niega el daño y el efecto de un ataque recibido a cambio de daño propio y de retirarse; pertenece a la familia de escudos de reacción (bloque 8), no a un cambio de Pokémon iniciado por el propio usuario. Se resuelve manualmente.",
  "kings-shield": "Anula el daño del siguiente golpe: gestionado por damage-shields.mjs (recorte vía preUpdateActor), no por este catálogo de modificadores puntuales.",
  obstruct: "Mismo motivo que kings-shield: gestionado por damage-shields.mjs.",
  "spiky-shield": "Mismo motivo que kings-shield: gestionado por damage-shields.mjs.",
  "silk-trap": "Mismo motivo que kings-shield: gestionado por damage-shields.mjs.",
  "mat-block": "Mismo motivo que kings-shield (aproximado a proteger solo al usuario, no a sus aliados): gestionado por damage-shields.mjs.",
  "light-screen": "Reduce a la mitad el siguiente golpe recibido: gestionado por damage-shields.mjs.",
  "metal-burst": "Contraataque de dos fases (rastrear el golpe recibido y devolverlo) resuelto directamente en pokemon-sheet.mjs reutilizando el rastreo de Onda Choque (bide.mjs), no una regla de este catálogo.",
  counter: "Reacción de dos fases (armar/liberar) resuelta directamente en pokemon-sheet.mjs (#rollRetaliation), con dados fijos en vez de devolver el daño recibido; no necesita el rastreo de bide.mjs.",
  "mirror-coat": "Mismo motivo que counter: resuelto en pokemon-sheet.mjs (#rollRetaliation) con dados fijos y tipo psíquico.",
  attract: "La reacción actúa sobre la tirada de daño de OTRA criatura después de resolverse (repetirla y quedarse con la menor); no hay enganche antes de que esa tirada ajena se complete. Se resuelve manualmente.",
  "baby-doll-eyes": "Impone desventaja en la tirada de ataque entrante de otra criatura antes de que se resuelva; el d20 ajeno ya se ha tirado para cuando este movimiento podría reaccionar. Se resuelve manualmente.",
  "noble-roar": "Mismo motivo que baby-doll-eyes: actúa sobre la tirada de ataque de otra criatura antes de resolverse. Se resuelve manualmente.",
  "electric-terrain": "Activa el terreno compartido del combate: gestionado por terrain-effects.mjs (guardado en el propio Combat, no en un actor). El bono de daño eléctrico duplicado y la inmunidad a Dormido en el área quedan como recordatorio para el director; solo se automatiza el propio estado de terreno y su duración.",
  "grassy-terrain": "Mismo motivo que electric-terrain: gestionado por terrain-effects.mjs. La curación de fin de turno a las criaturas conectadas a tierra en el área no se automatiza (exigiría recorrer todos los combatientes cada turno).",
  gravity: "Regla de campo compartida gestionada por terrain-effects.mjs. El bloqueo de Volar/Rebote y la supresión de Levitar sobre cada combatiente quedan como recordatorio para el director.",
  "ion-deluge": "Pulso de campo gestionado por terrain-effects.mjs: convierte a Eléctrico el daño Normal del propio usuario en pokemon-sheet.mjs; no verifica el radio de 50 pies sobre otros Pokémon.",
  psyblade: "Consulta el terreno compartido de terrain-effects.mjs directamente en pokemon-sheet.mjs (ventaja si hay Terreno Eléctrico activo), no una regla de este catálogo.",
  "grassy-glide": "Consulta el terreno compartido de terrain-effects.mjs directamente en pokemon-sheet.mjs; el bono se anuncia en el chat mientras esté sobre Terreno de Hierba pero no aplica el modificador de velocidad automáticamente.",
  "hydro-steam": "Consulta el clima compartido de terrain-effects.mjs directamente en pokemon-sheet.mjs (ventaja de ataque si hay Sol Fuerte activo), no una regla de este catálogo.",
  "misty-terrain": "Mismo motivo que electric-terrain: gestionado por terrain-effects.mjs. La inmunidad a nuevos estados y la resistencia a Dragón sobre las criaturas conectadas a tierra en el área no se automatizan (exigiría recorrer todos los combatientes cada turno).",
  "psychic-terrain": "Mismo motivo que electric-terrain: gestionado por terrain-effects.mjs. El bloqueo de acciones adicionales sobre las criaturas conectadas a tierra en el área no se automatiza.",
  "rain-dance": "Activa el clima compartido del combate: gestionado por terrain-effects.mjs (guardado en el propio Combat, no en un actor).",
  "sunny-day": "Mismo motivo que rain-dance: gestionado por terrain-effects.mjs.",
  sandstorm: "Activa el clima compartido gestionado por terrain-effects.mjs; el daño de tipo Roca por ronda a las criaturas no resistentes en el área de 50 pies no se automatiza (exigiría rastrear posición y radio de cada combatiente cada turno, igual que grassy-terrain). Se resuelve manualmente.",
  hail: "Mismo motivo que sandstorm: el clima se gestiona en terrain-effects.mjs, pero el daño de tipo Hielo por ronda en el área no se automatiza. Se resuelve manualmente.",
  snowscape: "Activa el clima compartido gestionado por terrain-effects.mjs; el bono de +1 a la CA de las criaturas de tipo Hielo en el área no se automatiza. Se resuelve manualmente.",
  "chilly-reception": "Activa el clima Nieve (terrain-effects.mjs) además del cambio forzado propio (forced-switch.mjs); ambos se automatizan.",
  defog: "Despeja terreno, clima, regla de campo y pulso de una vez mediante clearField() en terrain-effects.mjs; no distingue si el efecto pertenece al equipo propio o al rival.",
  "weather-ball": "Consulta el clima compartido de terrain-effects.mjs directamente en pokemon-sheet.mjs (tipo de daño y dados dobles según el clima activo), no una regla de este catálogo.",
  synthesis: "Consulta el clima compartido de terrain-effects.mjs directamente en pokemon-sheet.mjs (dados de curación dobles con Sol Fuerte activo), no una regla de este catálogo.",
  "shore-up": "Consulta el clima compartido de terrain-effects.mjs directamente en pokemon-sheet.mjs (modificador MOVE doblado con Tormenta de Arena activa), no una regla de este catálogo.",
  "solar-beam": "El doble de modificador MOVE con Sol Fuerte se consulta directamente del clima compartido en pokemon-sheet.mjs; el disparo sin carga ni concentración durante Sol Fuerte sigue siendo manual (la propia carga de dos turnos ya es solo un recordatorio, ver el modificador 'charging').",
  "solar-blade": "Mismo motivo que solar-beam.",
  hurricane: "La ventaja/desventaja en la salvación por clima depende de una tirada de salvación de área que este proyecto no automatiza para movimientos de daño en radio (blizzard, hurricane, thunder...): el jugador tira su propia salvación contra la CD publicada en el chat. Se resuelve manualmente.",
  moonlight: "El bono depende de si es de día o de noche; este proyecto no modela un ciclo día/noche. Se resuelve manualmente.",
  "morning-sun": "Mismo motivo que moonlight: no hay ciclo día/noche modelado. Se resuelve manualmente.",
  "final-gambit": "El daño (igual a los PG actuales del usuario, más STAB) y el debilitamiento propio tras el golpe se resuelven directamente en pokemon-sheet.mjs, no con una regla de este catálogo.",
  "self-destruct": "El debilitamiento propio se resuelve directamente en pokemon-sheet.mjs; la reducción de daño a la mitad/un cuarto según los PG actuales del usuario antes de fainting no se automatiza (el resto de movimientos de área con salvación tampoco aplican la mitad de daño automáticamente: se usan los botones de Aplicar daño de dnd5e). Se resuelve manualmente.",
  explosion: "El 20 natural y el debilitamiento de los objetivos se resuelven directamente en pokemon-sheet.mjs (#rollExplosion); el fallo automático por diferencia de nivel o SR del objetivo no se comprueba. Se resuelve manualmente.",
  "perish-song": "Cuenta atrás compartida gestionada por ongoing-effects.mjs (remaining + faintOnExpire), incluyendo al propio usuario entre los objetivos; la posibilidad de escapar del debilitamiento huyendo o cambiando antes de que termine ya la cubre forced-switch.mjs/recallLock, no una regla nueva.",
  substitute: "El escudo consume PG propios, absorbe todo el daño externo salvo el de sonido, bloquea estados nuevos, no puede curarse y desvía el sobrante al romperse: exigiría reescribir la aplicación de daño de todos los movimientos (no solo un tope o una redirección puntual como damage-shields.mjs) para distinguir sonido de cualquier otro tipo, algo que el catálogo de movimientos no etiqueta. Se resuelve manualmente.",
  "destiny-bond": "Redirige la mitad de cualquier daño futuro que reciba el usuario hacia un tercer objetivo elegido al activarse, de forma repetida mientras dure la concentración (no una sola vez como los escudos de reacción); requiere guardar y consultar ese vínculo en cada golpe recibido por un actor arbitrario, un alcance mayor que el resto de mecánicas de daño-espejo de este proyecto. Se resuelve manualmente.",
  "trick-room": "Invierte el orden de iniciativa del combate a partir de la siguiente ronda; este proyecto no reordena el rastreador de combate de Foundry. Se resuelve manualmente (el director reordena los combatientes).",
  "future-sight": "Ataque retrasado hasta 3 rondas después, reutilizable como acción gratuita en cualquier momento de esa ventana: no encaja en el disparador de una sola ronda fija que usa terrain-effects.mjs para clima/terreno. Se resuelve manualmente.",
  "doom-desire": "Mismo motivo que future-sight: daño programado para una ronda concreta más adelante sobre un objetivo que puede cambiar entretanto (redirigido al Pokémon activo del entrenador si el objetivo original se retira). Se resuelve manualmente.",
  "healing-wish": "El usuario se debilita y cura por completo al siguiente Pokémon consciente que su entrenador despliegue: exigiría enganchar el propio flujo de despliegue (deployment.mjs) para consumir una bandera pendiente, algo que ningún otro movimiento de este catálogo hace todavía. Se resuelve manualmente.",
  "lunar-dance": "Mismo motivo que healing-wish, además de curar también todos los PP.",
  absorb: "Cura al usuario la mitad del daño infligido: gestionado por recoil.mjs (DRAIN_FRACTION_MOVES) y aplicado en pokemon-sheet.mjs (applySelfDrain), no una regla de este catálogo.",
  "bitter-blade": "Mismo motivo que absorb: gestionado por recoil.mjs.",
  "drain-punch": "Mismo motivo que absorb: gestionado por recoil.mjs.",
  "draining-kiss": "Mismo motivo que absorb: gestionado por recoil.mjs.",
  "giga-drain": "Mismo motivo que absorb: gestionado por recoil.mjs.",
  "horn-leech": "Mismo motivo que absorb: gestionado por recoil.mjs.",
  "leech-life": "Mismo motivo que absorb: gestionado por recoil.mjs.",
  "mega-drain": "Mismo motivo que absorb: gestionado por recoil.mjs.",
  "oblivion-wing": "Mismo motivo que absorb, pero cura el 100% del daño infligido en vez de la mitad.",
  "parabolic-charge": "Mismo motivo que absorb, con el mismo tope de 5× nivel que Golpe Metálico.",
  "trump-card": "El bono de daño por PP ya gastados se calcula directamente en pokemon-sheet.mjs (antes de descontar el PP de este uso), no con una regla de este catálogo.",
  spite: "Reduce en 1d4 los PP del último movimiento del objetivo (instance.lastMoveId), resuelto directamente en pokemon-sheet.mjs con el mismo rastreo que usa Anular (disable), no una regla de este catálogo.",
  "pain-split": "Iguala los PG actuales del usuario y el objetivo a su media, resuelto directamente en pokemon-sheet.mjs sobre ambos actores tras una salvación de CON fallida.",
  instruct: "Repetir el último movimiento de OTRA criatura sin gastar sus PP exigiría invocar la lógica de tirada de esa criatura desde la ficha del usuario, acoplando ambas fichas; no encaja en el patrón de evento sintético que reutiliza Hablar Dormido (que solo repite un movimiento propio). Se resuelve manualmente.",
  mimic: "Sustituye temporalmente este movimiento por uno copiado del objetivo, conservando los PP restantes de Mimético: mutaría la lista de movimientos conocidos del usuario durante la duración, con el mismo riesgo de reversión insegura que skill-swap/worry-seed. Se resuelve manualmente.",
  "tidy-up": "Combina ventaja propia, terminar Sustituto ajeno a distancia y una reacción condicional contra varios movimientos de trampa distintos (incluso durante un cambio de Pokémon): son varias mecánicas de intercepción de otro actor encadenadas, fuera del alcance de una sola regla. Se resuelve manualmente.",
  "eerie-spell": "Encarece en 1 PP cada movimiento del objetivo durante la duración: este proyecto no modela un coste de PP variable por movimiento, solo el PP fijo del catálogo. Se resuelve manualmente.",
  uproar: "Mantiene un área que impide dormir y causa daño de inicio de turno durante tres rondas sin gastar la acción del usuario en turnos posteriores: la parte de daño por ronda encajaría en ongoing-effects.mjs, pero la prohibición de dormir a todas las criaturas del área (incluidas las que aún no están en combate) y la repetición automática de la acción no tienen mecanismo equivalente. Se resuelve manualmente.",
  hex: "Dobla el modificador MOVE si el objetivo sufre cualquier estado: consultado directamente en pokemon-sheet.mjs (TARGET_STATUS_MODIFIER_DOUBLE_MOVES), no una regla de este catálogo.",
  "infernal-parade": "Mismo motivo que hex.",
  "barb-barrage": "Mismo motivo que hex, pero solo dobla si el objetivo ya está envenenado (incluido en el mismo chequeo genérico de 'cualquier estado').",
  venoshock: "Dobla los dados si el objetivo está envenenado: consultado directamente en pokemon-sheet.mjs (TARGET_STATUS_DICE_DOUBLE_MOVES), no una regla de este catálogo.",
  "smelling-salts": "Mismo motivo que venoshock, pero por Paralizado.",
  flail: "Multiplica los dados de daño según los PG actuales del propio usuario (×2/×3): consultado directamente en pokemon-sheet.mjs (SELF_HP_DICE_MULTIPLIER_MOVES), no una regla de este catálogo.",
  reversal: "Mismo motivo que flail.",
  "water-spout": "Reduce a la mitad los dados de daño si el usuario está por debajo del 50% de sus PG: consultado directamente en pokemon-sheet.mjs (SELF_HP_HALF_DICE_MOVES).",
  "wring-out": "Dobla el modificador MOVE si el objetivo conserva la mitad o más de sus PG máximos: consultado directamente en pokemon-sheet.mjs (TARGET_HP_MODIFIER_DOUBLE_MOVES).",
  "natures-madness": "Quita la mitad de los PG actuales del objetivo (mínimo 1): gestionado por hp-effects.mjs junto a Resignación/Fatalidad, no una regla de este catálogo.",
  eruption: "El texto duplica el bono STAB con PG máximos, pero el campo 'modifier' del movimiento en los datos es 'MOVE' (no 'MOVE + STAB'), así que este proyecto nunca le aplica STAB de base sobre la que doblar; tocar eso exigiría corregir el dato del movimiento, fuera del alcance de este catálogo. Se resuelve manualmente.",
  "dragon-dance": "Duplica específicamente el bono de competencia (no un +N fijo) en los ataques durante la duración: no existe un modificador de 'multiplicador de competencia' en move-modifiers.mjs (solo moveModifierMultiplier, que afecta al modificador MOVE, no a la competencia). Se resuelve manualmente.",
  "mystical-power": "Aplica un bono distinto según el ataque acierte o falle (ventaja de característica vs. +CA), acumulable hasta un tope compartido y con duración 'hasta el próximo cambio de Pokémon': combina una rama condicional post-resultado con un tope compartido entre dos efectos distintos, fuera de la forma que soporta buff()/debuff(). Se resuelve manualmente.",
  protect: "Anula el siguiente golpe: gestionado por damage-shields.mjs, igual que Escudo Real. La dificultad creciente en usos repetidos durante el mismo combate no se rastrea.",
  detect: "Mismo motivo que protect: gestionado por damage-shields.mjs.",
  "baneful-bunker": "Mismo motivo que protect; el envenenamiento del atacante cuerpo a cuerpo cuando el escudo tiene éxito no se automatiza.",
  "quick-guard": "Anula el siguiente golpe: gestionado por damage-shields.mjs, simplificado a cualquier turno (el texto original solo protege en el primer turno de la primera ronda).",
  endure: "Nunca deja el siguiente golpe en 0 PG: gestionado por damage-shields.mjs con un modo 'survive' propio. La dificultad creciente en usos repetidos no se rastrea.",
  "wide-guard": "Reduce a la mitad el siguiente golpe recibido: gestionado por damage-shields.mjs, simplificado a cualquier golpe (el texto original exige que el movimiento dañe a varios aliados a la vez).",
  "crafty-shield": "Anula un estado entrante, no daño: damage-shields.mjs solo recorta PG, no tiene forma de interceptar la aplicación de un estado sobre un tercero antes de que status-effects.mjs la resuelva. Se resuelve manualmente.",
  "burning-bulwark": "Contraataque automático en CADA golpe cuerpo a cuerpo recibido mientras dura (no una vez, como Golpe Metálico/Contraataque): exigiría un enganche recurrente por toda la duración del efecto, no solo un flag de un solo uso. Se resuelve manualmente.",
  "magic-coat": "Refleja de vuelta al atacante cualquier estado negativo que intente causar: exige interceptar la resolución del movimiento ajeno antes de que status-effects.mjs lo aplique, la misma familia de reacciones-antes-de-resolver que attract/baby-doll-eyes. Se resuelve manualmente."
});

/** Devuelve los ids que deben disponer de hueco de icono por categoría. */
export function modifierIconSlots(category) {
  return Object.entries(MOVE_MODIFIER_EFFECTS).filter(([, entry]) => entry.category === category).map(([id]) => id);
}

/** Acumula una nueva aplicación sin superar el máximo declarado por la regla. */
export function nextModifierStacks(current, maximum = 1) {
  return Math.min(Math.max(1, Number(maximum) || 1), Math.max(0, Number(current) || 0) + 1);
}

/** Escala únicamente los modificadores numéricos; dados y booleanos no cambian. */
export function scaledMoveModifiers(modifiers = {}, stacks = 1) {
  const scaled = {};
  for (const [key, value] of Object.entries(modifiers)) {
    if (["saves", "abilities"].includes(key)) scaled[key] = Object.fromEntries(Object.entries(value).map(([ability, amount]) => [ability, Number(amount) * stacks]));
    else scaled[key] = typeof value === "number" && !["speedMultiplier", "speedOverride"].includes(key) ? value * stacks : value;
  }
  return scaled;
}

/** Determina si una regla supera su condición de impacto, natural o salvación. */
export function modifierTriggerMatches(ruleEntry, { attack = null, save = null } = {}) {
  if (ruleEntry.requiresHit && !attack?.hit) return false;
  if (ruleEntry.trigger === "automatic") return true;
  if (ruleEntry.trigger === "hit") return Boolean(attack?.hit);
  if (ruleEntry.trigger === "natural") return Boolean(attack?.hit) && Number(attack.natural) >= Number(ruleEntry.natural);
  if (ruleEntry.trigger === "failed-save") return save?.success === false;
  if (ruleEntry.trigger === "failed-save-margin") return save?.success === false && Number(save.dc) - Number(save.total) >= Number(ruleEntry.saveMargin);
  return false;
}

function rule(category, { target = "selected", trigger, requiresHit = false, natural = null, saveMargin = null, durationRounds = combat, stackMax = 1, consume = null, sourceOnly = false, concentration = false, repeatSave = null, requiredTypes = [], requiredAbilities = [], modifiers = {}, description }) {
  return Object.freeze({ target, category, trigger, requiresHit, natural, saveMargin, durationRounds, stackMax, consume, sourceOnly, concentration, repeatSave, requiredTypes, requiredAbilities, modifiers: Object.freeze(modifiers), description });
}
