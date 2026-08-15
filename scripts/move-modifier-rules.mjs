/**
 * Catálogo explícito de movimientos que dejan modificadores numéricos o modos
 * de tirada sobre otro Pokémon. Es deliberadamente independiente de Foundry
 * para poder auditarlo y validarlo en Node contra los 830 movimientos.
 */

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
  swagger: buff({ trigger: "failed-save", durationRounds: 3, modifiers: { attack: 2 }, description: "+2 a los ataques mientras permanezca Confuso." })
});

/** Candidatos auditados que pertenecen a otro motor y no deben duplicarse aquí. */
export const CONTEXTUAL_MODIFIER_COVERAGE = Object.freeze({
  clamp: "Efecto de agarre y repetición gestionado por ongoing-effects.mjs.",
  curse: "Las dos variantes de Maldición se gestionan por ongoing-effects.mjs.",
  "fell-stinger": "El bono depende de que el flujo de daño de D&D reduzca al objetivo a 0 PG; se confirma manualmente."
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
