/**
 * Motor de habilidades Pokémon — fase 1 (agosto de 2026). Del catálogo de 330
 * habilidades (`data/abilities.json`) esta primera ronda automatiza la parte
 * que encaja sin obra nueva: inmunidades/resistencias de tipo fijas y el
 * clima que se activa solo al entrar en combate. Se aplican una sola vez, al
 * calcular el actor de combate, con el mismo patrón que ya usan los objetos
 * equipados (`heldItemActorAdjustments()` en held-items.mjs) y Almacenar
 * poder (`applyTypeMasteryDefense()` en trainer-path-rules.mjs).
 *
 * No hay concepto de "habilidad activa" distinto de "habilidad conocida": el
 * proyecto ya trataba `instance.abilities` como el conjunto que cuenta a
 * todos los efectos (`requiredAbilities` en move-modifier-rules.mjs consulta
 * ese mismo array sin distinguir una "activa"), así que estas funciones
 * siguen la misma convención en vez de inventar una restricción nueva. Esto
 * también es la razón por la que Guru 9 ("dos habilidades activas a la vez")
 * no necesita código: nunca hubo un límite de una sola que levantar.
 *
 * Fase 2 (segmentada igual que los 830 movimientos, un lote de mecánica
 * homogénea a la vez):
 * - Lote 1: inmunidades a un estado alterado completo (Inmunidad, Insomnio,
 *   Espíritu Vital, Postura Firme, Velo Acuático, Burbuja de Agua, Armadura
 *   Ígnea, Cuerpo Dorado...), porque encajan en el mismo punto de
 *   applyPokemonStatus() (status-effects.mjs) que ya usan las inmunidades
 *   por tipo de daño — solo cambia de qué depende la inmunidad, no dónde se
 *   comprueba.
 * - Lote 2: reacciones de daño por contacto (Piel Tosca, Punta Acero,
 *   Electricidad Estática, Esporas Efecto, Punto Toxico): "si un golpe
 *   cuerpo a cuerpo te alcanza, tira 1d4 y en un 4 devuelve daño igual a tu
 *   competencia al atacante". Se resuelve en #rollMove() (pokemon-sheet.mjs),
 *   el mismo sitio donde ya se resuelven Falso Tortazo, Ladrón o el resto de
 *   efectos por objetivo alcanzado — es el primer lote que necesita conocer
 *   al atacante además del defensor, así que introduce
 *   applyContactDamageReaction() con su propia copia de pokemonItemForActor()
 *   (mismo patrón anticírculos que ya usa trainer-resources.mjs).
 * - Lote 3: STAB×2 con poca vida (Blaze/Overgrow/Swarm/Torrent, mismo texto
 *   exacto en las cuatro). `ownHpFraction` ya se calculaba en #rollMove()
 *   para otros movimientos condicionados a la vida propia, así que
 *   abilityLowHpStabBonus() solo añade +2 al mismo parámetro `heldItemStab`
 *   de damageFormula() que ya usa el STAB de un objeto equipado — ese
 *   parámetro solo se aplica cuando el movimiento ya tiene STAB, así que no
 *   hace falta repetir la condición de tipo aquí.
 * - Lote 4: bonos fijos de ataque/daño/crítico por movimiento (Ojo Compuesto,
 *   Alas Danza, Metaltrabajador, Rivalidad, Suertudo). abilityMoveProfile()
 *   es el mismo hueco que ya rellenan heldProfile (objeto equipado) y
 *   pathProfile (Camino de Entrenador) en #rollMove(): un +1/+competencia/
 *   +1 rango de crítico sumado en la misma tirada, sin estado de combate que
 *   rastrear más allá del tipo del movimiento y, para Rivalidad, el tipo del
 *   objetivo (ya disponible por el flag `pokemonTypes` que llevan los actores
 *   desplegados y salvajes).
 * - Lote 5: reacciones de contacto que aplican un estado al atacante en vez
 *   de dañarlo (Cuerpo Ardiente quema con un 10 en 1d10, Hedor amedrenta con
 *   un 10 en 1d10; Cuerpo Maldito es distinto, bloquea el último movimiento
 *   del atacante con un 4 en 1d4 en vez de un estado del catálogo). Mismo
 *   punto que el lote 2 (#rollMove(), tras resolver un ataque cuerpo a
 *   cuerpo), pero como este archivo no importa applyPokemonStatus() ni
 *   applyMoveLock() (evitar el ciclo de imports con status-effects.mjs, que
 *   ya importa abilityBlocksStatus() de aquí) las tres funciones de este
 *   lote solo tiran el dado y devuelven el resultado; quien llama desde
 *   pokemon-sheet.mjs aplica el estado o el bloqueo con las funciones que sí
 *   tiene importadas.
 * - Lote 6: bonos/inmunidades condicionados al propio estado alterado del
 *   Pokémon, no al del rival. Vigor (`guts`) anula la desventaja en ataque
 *   por Envenenado/Gravemente envenenado y la tirada doble-quedarse-con-la-
 *   menor por Quemado en #rollMove() (pokemon-sheet.mjs), sin tocar el daño
 *   periódico de fin de turno que ya aplica applyEndTurnStatusDamage()
 *   (status-effects.mjs) — el texto de Vigor solo exime la desventaja/
 *   reducción, no ese daño. Competitivo (`competitive`) e Impulso Ígneo
 *   (`flare-boost`) suman la competencia al daño mientras el propio Pokémon
 *   sufre ciertos estados, vía abilitySelfStatusDamageBonus(), en el mismo
 *   hueco de damageFormula() que ya usa abilityProfile.damage del lote 4.
 * - Lote 7: Escama Prodigio y Pies Rápidos, CA/velocidad extra mientras el
 *   Pokémon sufre CUALQUIER estado alterado negativo. A diferencia de los
 *   lotes anteriores esto no se calcula una vez al desplegar el actor, porque
 *   el bono depende de un hecho que cambia durante el combate (entrar y salir
 *   de sufrir un estado), y un Pokémon puede tener varios estados compatibles
 *   a la vez (un no-volátil más Confuso/Amedrentado, ver status-effects.mjs).
 *   abilityStatusBonusEffectSource() solo construye el ActiveEffect; es
 *   status-effects.mjs quien decide cuándo crearlo y borrarlo, atado al
 *   PRIMER estado que sufre el Pokémon y al momento en que se queda sin
 *   NINGUNO — no al ciclo de vida de un estado concreto — para no duplicar el
 *   bono ni perderlo al quitar solo uno de los estados activos.
 *
 * El resto del catálogo queda para lotes posteriores porque exige más que un
 * ajuste al desplegar o una comprobación puntual: absorber un tipo de daño
 * como PG en vez de inmunidad pura, reacciones por contacto que aplican
 * estado en vez de daño (requieren la misma infraestructura de
 * applyPokemonStatus() que un movimiento normal), bonos condicionados al
 * propio estado alterado o a la vida restante, mejoras de golpes
 * múltiples/potencia por categoría de movimiento, robo de objeto al
 * impactar, auras que alcanzan a los aliados cercanos, etc. — cada una
 * necesitaría interceptar una tirada de daño ya resuelta contra un tercero o
 * el turno de otro actor, la misma limitación estructural que ya excluye
 * varias familias de movimientos (ver CONTEXTUAL_MODIFIER_COVERAGE en
 * move-modifier-rules.mjs).
 *
 * Lote 8: curación de fin de turno condicionada al clima activo del combate
 * — Cuenco Lluvia (rain-dish) con lluvia y Cuerpo Hielo (ice-body) con
 * granizo o nieve. Se engancha en el mismo punto que ya resuelve el daño
 * periódico de estado (`applyEndTurnStatusDamage()` en status-effects.mjs,
 * llamada desde ongoing-effects.mjs en el cambio de turno), con una función
 * hermana nueva, `applyEndTurnAbilityHealing()`, que consulta el clima del
 * combate con `currentField()` (terrain-effects.mjs) y las habilidades
 * conocidas del Pokémon (reutilizando `pokemonAbilities()`, la misma función
 * local que ya usa applyPokemonStatus() para las inmunidades a estado por
 * habilidad). La parte de Cuerpo Hielo sobre "no recibe daño de granizo" no
 * necesita código propio: este proyecto no automatiza ningún daño de
 * granizo por ronda (move-modifier-rules.mjs lo deja como resolución manual
 * explícitamente), así que no hay nada que anular.
 *
 * Lote 9 (agosto de 2026): reducción de daño automática que depende de una
 * habilidad conocida (y, en Robustez, del propio golpe) en vez de un
 * movimiento armado a mano. Multiescama/Escudo Sombra ("si este Pokémon está
 * a PG máximos, el primer golpe que reciba se reduce a la mitad") y Robustez
 * ("al recibir daño igual o superior a la mitad de tus PG actuales, tira 1d4
 * y en 3 o 4 se reduce a la mitad") solo exponen aquí su catálogo
 * (FULL_HP_HALF_DAMAGE_ABILITIES, STURDY_HALF_DAMAGE_ABILITIES): la decisión
 * de cuándo se activan y el recorte del golpe se resuelven extendiendo el
 * mismo hook `preUpdateActor` que ya usa damage-shields.mjs para los escudos
 * de reacción, en vez de registrar un segundo hook independiente. Dos hooks
 * de `preUpdateActor` recortando por separado el mismo campo
 * `system.attributes.hp.value` competirían entre sí — el segundo en
 * ejecutar solo vería el resultado ya recortado por el primero (o al revés,
 * según el orden de registro de Foundry, que este proyecto no controla), lo
 * que puede sobre-recortar un golpe o enmascarar uno de los dos efectos sin
 * previsibilidad — así que toda la lógica de recorte de PG vive en un único
 * hook en damage-shields.mjs, y este archivo solo aporta el catálogo de
 * habilidades y la función pura que decide si aplican.
 *
 * Lote 10: absorción con curación (Absorbe Agua, Absorbe Electricidad, Come
 * Tierra) — el catálogo real de estas tres no es solo "inmune al tipo X"
 * (ya cubierto desde la fase 1 vía IMMUNITY_ABILITIES): además absorben la
 * mitad del daño que habrían recibido y lo convierten en curación. La
 * inmunidad de tipo sigue viniendo de damageTraitsForPokemonTypes()/
 * applyAbilityDefenses() al desplegar, sin tocar; la curación se resuelve
 * aparte, en #rollMove() (pokemon-sheet.mjs), reutilizando recoilAmount()
 * (recoil.mjs, la misma fracción 0.5 de la familia de drenaje) sobre el
 * daño en bruto ya tirado (`dealtDamageTotal`), antes de que la inmunidad
 * del objetivo lo reduzca a cero al aplicarlo.
 *
 * Lote 11: sin extra de daño por golpe crítico (Armadura Bélica, Armadura
 * Concha, Roca Sólida). Se resuelve apagando `critical` en las opciones de
 * DamageRoll, solo cuando hay un único objetivo seleccionado —el daño se
 * tira una sola vez para todos los alcanzados, así que no hay forma de
 * tratar distinto a dos objetivos con habilidades distintas en la misma
 * tirada, la misma limitación que ya reconoce Alza tus defensas (Tactician
 * 9) en #rollMove().
 *
 * Lote 12: dos añadidos al lote 1 (Foco Interior inmune a Amedrentado, Velo
 * Pastel inmune a Envenenado en su parte propia —la de sus aliados es una
 * aura fuera de alcance—) y una familia nueva, inmunidad a TODO estado
 * condicionada al clima activo (Manto Hoja con sol, Hidratación con lluvia):
 * abilityWeatherBlocksStatus() se consulta en applyPokemonStatus()
 * (status-effects.mjs) junto a abilityBlocksStatus(), reutilizando
 * currentField() (terrain-effects.mjs) igual que ya hace
 * applyEndTurnAbilityHealing() del lote 8.
 *
 * Lote 13: tirar el daño dos veces y quedarse con el MAYOR cuando el
 * movimiento cumple una condición de tipo o de PP (Adaptabilidad, Fauces de
 * Dragón, Carga Rocosa, Transistor, Técnico) — lo opuesto de Quemado (que ya
 * tira dos veces y se queda con el menor). Se resuelve en el mismo bloque de
 * #rollMove() (pokemon-sheet.mjs) que Quemado, con la misma pareja de
 * tiradas reutilizada para ambos casos; si el Pokémon está quemado, Quemado
 * gana y esta familia no se activa esa vez (combinar las dos exigiría una
 * tercera tirada y un criterio de desempate que el texto original no da).
 * Se sumaron después Puño Férreo (movimientos de puño, detectados por el
 * nombre en inglés como Filo) y Mandíbula Firme (movimientos de mordisco,
 * sin patrón de nombre común: se listan explícitamente en
 * STRONG_JAW_MOVE_IDS, el mismo puñado que reconoce el juego original).
 *
 * Lote 14: protección del objeto equipado. Ventosas bloquea Cambiazo/Ladrón/
 * Robo (las tres llamadas a requestHeldItemSwap()/requestHeldItemDestroy()
 * en #rollMove(), pokemon-sheet.mjs) contra el Pokémon que la conoce; Torpeza
 * bloquea el propio flujo de equipar un objeto (#equipHeldItem()) para que
 * nunca llegue a tener uno. Ninguna de las dos necesita tocar held-items.mjs:
 * ambas son una comprobación previa a una llamada que ya existía.
 *
 * Lote 15: inmunidad a cambio forzado (Ventosas, Guardián — el resto del
 * texto de Guardián, "Intimidación contra él con desventaja e inmune a la
 * habilidad Intimidate", queda fuera porque Intimidate no tiene ningún
 * mecanismo automatizado del que eximirse). abilityBlocksForcedSwitch() se
 * consulta al principio de requestForcedSwitch() (forced-switch.mjs), antes
 * de cualquier otra cosa, con su propia copia de pokemonItemForActor().
 *
 * Lote 16: inmunidad a debuffs (Cuerpo Puro, Cuerpo de Metal Pleno, Humo
 * Blanco) reutilizando el flag `debuffImmune` que `pokemonCombatModifiers()`
 * (move-modifiers.mjs) ya calculaba a partir de ActiveEffects de movimiento;
 * ahora también lo activa conocer una de estas tres habilidades. No cubre
 * Pico Grande/Cortador Grande (versión de un solo stat: CA o ataque/daño),
 * porque el flag existente es "todo o nada" por categoría, no por
 * característica concreta.
 *
 * Lote 17: bonos condicionados al clima activo del combate en la propia
 * tirada, sin estado adicional que guardar (Poder Solar +2 al daño con sol,
 * Fuerza de Arena duplica el STAB con tormenta de arena) — mismos huecos que
 * abilitySelfStatusDamageBonus() y abilityLowHpStabBonus() en #rollMove(),
 * leyendo `currentField(game.combat).weather` igual que el lote 8.
 *
 * Lote 18: velocidad duplicada y bono de CA por clima o terreno ACTIVOS
 * (Clorofila/Nado Rápido/Paso Arena/Aguanieve duplican la velocidad; Onda
 * Voltaica lo mismo pero por terreno; Velo Arena/Manto Nieve suman CA por
 * clima; Pelaje Herboso por terreno). A diferencia de todos los lotes
 * anteriores, esto SÍ afecta al Pokémon mientras está desplegado sin que él
 * mismo haga nada (el clima/terreno lo puso otro, o simplemente sigue
 * activo), así que no puede resolverse en el momento de una tirada como el
 * lote 17: terrain-effects.mjs recalcula el ActiveEffect de
 * abilityFieldBonusEffectSource() para todos los actores desplegados y
 * salvajes cada vez que el campo cambia (refreshFieldAbilityBonuses()).
 *
 * Lote 19: cambio del tipo de daño (Galvanismo/Pixelado/Refrigerar cambian
 * los movimientos de tipo Normal; Normalizar cambia CUALQUIER movimiento a
 * Normal). abilityMoveTypeOverride() se consulta en #rollMove() justo
 * después de elegir el tipo de daño del movimiento, mismo punto donde ya
 * vive el cambio de tipo de Diluvio Iónico.
 *
 * Lote 20: ventaja en el próximo ataque al recibir un tipo de daño concreto
 * (Firmeza, Nervios, Impulso Tóxico, Intercambio Térmico —que de paso se
 * suma al lote 1/12 como inmune a Quemado—). Reutiliza applyDynamicModifier()
 * (move-modifiers.mjs) en vez de un ActiveEffect propio, en el mismo bucle
 * por objetivo alcanzado del lote 10 (absorción con curación), porque
 * comparte el mismo criterio de "tipo de daño recibido".
 *
 * Lote 21: tres habilidades sueltas que no encajan en ninguna familia
 * anterior. Gracia Sereno (+1 a la CD de salvación de sus movimientos) suma
 * al mismo `8 + attackMoveModifier + proficiency` que ya se repetía cinco
 * veces en #rollMove(). Cabeza Roca (sin daño de retroceso propio) apaga
 * `recoilFraction` antes de restar PG. Filo dobla el modificador MOVE de un
 * movimiento si su nombre en inglés contiene "Cut/Blade/Slash/Edge/Cleave/
 * Razor/Sword/Axe" — el único dato disponible para detectarlo, ya que el
 * catálogo no etiqueta "movimiento cortante" de ningún otro modo.
 *
 * Lote 22: Impasible (+10 pies de velocidad mientras no lleva objeto
 * equipado). Se recalcula en deployment.mjs/wild-deployment.mjs junto al
 * resto de ajustes de velocidad del objeto equipado, porque ya se
 * recomputan cada vez que el objeto cambia (equipar, consumir, romper,
 * restaurar) — un salvaje, que nunca lleva objeto en este proyecto, lo
 * cumple siempre.
 *
 * Lote 23: Madurez y Buche corrigen la cantidad que curan Baya Zanahoria y
 * Baya Saludable, las dos únicas bayas de curación automática del catálogo
 * de objetos (held-items.mjs). abilityBerryHealBonus() se llama en los dos
 * sitios donde ya se resolvía esa curación: syncDeploymentHp() (deployment.mjs,
 * bajada de PG en combate) y resolvePokemonHpBerryReaction() (held-items.mjs,
 * edición manual de PG en la ficha Pokédex).
 *
 * Lote 24: Desertor/Descontrol, ataques con desventaja al 25% o menos de PG
 * máximos —Descontrol además dobla los dados de daño y da ventaja a la
 * salvación del objetivo—. La desventaja propia y la ventaja del objetivo se
 * calculan dentro de pokemonCombatModifiers() (move-modifiers.mjs, mismo
 * hueco síncrono que el lote 16), porque esa función ya tiene el actor y por
 * tanto sus PG actuales/máximos sin necesitar ningún dato adicional; el
 * doblado de dados se resuelve aparte en #rollMove(), junto al resto de
 * multiplicadores de dados de la tirada.
 *
 * Lote 26: Antibalas, inmunidad total (no un tipo de daño) a movimientos con
 * "Bullet/Ball/Bomb" en el nombre. Se resuelve anulando `formula` antes de
 * tirar daño en #rollMove(), solo con un único objetivo seleccionado.
 *
 * Lote 27: envenenar con el propio golpe cuerpo a cuerpo (dirección
 * contraria a los lotes de contacto anteriores, que reaccionan al golpe
 * RECIBIDO): Toque Tóxico (1d10, envenena con un 10) y Cadena Tóxica
 * (salvación de CON CD 16, gravemente envenenado si falla, reutilizando
 * rollFailedSaves() de hp-effects.mjs). Se resuelve en el mismo bucle de
 * objetivos alcanzados que ya usan Falso Tortazo/Ladrón en #rollMove().
 *
 * Lote 28: Baba, reacción de contacto que dobla la familia de daño/estado de
 * los lotes 2/5 con un efecto de velocidad: reduce la del atacante a 0
 * durante una ronda mediante un ActiveEffect propio, el mismo patrón OVERRIDE
 * que ya usa Parálisis pero con caducidad automática en vez de ligado a un
 * estado no volátil.
 *
 * Lote 29: Analítico, ventaja en el próximo ataque tras fallar el anterior.
 * Reutiliza `instance.lastAttackMissed`, ya calculado en #rollMove() para
 * otros efectos condicionados a fallar, y applyDynamicModifier() para la
 * ventaja de una ronda — sin ActiveEffect propio ni cálculo nuevo.
 *
 * Lote 30: Constancia, no puede repetir el mismo movimiento en rondas
 * consecutivas. Reutiliza `instance.lastMoveId` (ya se guarda tras cada
 * tirada) para comparar contra el movimiento elegido esta vez, en el mismo
 * punto donde #rollMove() ya bloquea un movimiento en recarga
 * (isMoveRecharging()).
 *
 * Lotes 31-37: siete habilidades sueltas más. Escamas de Hielo (resistencia
 * a movimientos con potencia INT/SAB/CAR) usa `diceMultiplier` 0.5, mismo
 * hueco que otros multiplicadores de dados, solo con un único objetivo
 * seleccionado. Cura Tóxica (poison-heal) se suma a IMMUNITY_ABILITIES/
 * ABSORB_HEAL_ABILITIES del lote 1/10 (inmune a daño de tipo Veneno y cura la
 * mitad), más una corrección aparte en applyEndTurnStatusDamage()
 * (status-effects.mjs) para que el daño periódico de Envenenado cure en vez
 * de dañar. Despiadado dobla los dados de daño contra un objetivo
 * envenenado (extiende el lote 13/25 con el estado del objetivo). Espada
 * Justiciera y Sin Reparos dan ventaja a los propios ataques (cuerpo a
 * cuerpo la primera, cualquiera la segunda). Sin Reparos y Escudo Intrépido
 * también actúan sobre el ATACANTE cuando el objetivo los conoce
 * (abilityTargetAttackRollModifier()), con el mismo único-objetivo que el
 * resto de comprobaciones "por objetivo" de #rollMove(). Salida de
 * Emergencia/Rendirse ofrecen o fuerzan la retirada al cruzar el 50% de PG
 * máximos hacia abajo, resuelto en syncDeploymentHp() (deployment.mjs) junto
 * al resto de reacciones por bajada de PG.
 *
 * Lotes 38-39: la primera familia que mide distancia entre tokens del
 * lienzo. Vive en `combat/aura-abilities.mjs`, no aquí, porque necesita
 * `canvas`/`game` (nada comprobable desde Node) y sirve a varios archivos
 * consumidores (pokemon-sheet.mjs, status-effects.mjs, deployment.mjs) igual
 * que el resto de motores de combate. El lote 38 son las auras de aliado
 * cercano (Batería, Punto de Poder, Espíritu Metálico, Costar, Regalo Flor,
 * Estrella Victoria —esta última sin límite de distancia en su texto—,
 * Velo Dulce, Velo Flor). El lote 39 es Prepotencia/Compañero del Alma:
 * ningún oponente en la escena puede comer bayas, ni siquiera como reacción
 * de curación en syncDeploymentHp().
 *
 * Lote 40: cuatro habilidades sueltas más. Cura Natural/Regenerador se
 * resuelven en recallPokemon() (deployment.mjs) al volver a la Poké Ball —
 * Regenerador simplifica el límite "una vez por descanso largo" porque este
 * proyecto no lleva un contador de usos por Pokémon, solo por objeto
 * equipado—. Alocado dobla el STAB con movimientos que ya tienen retroceso
 * (RECOIL_FRACTION_MOVES, recoil.mjs), mismo hueco que el resto de bonos de
 * STAB. Fuerza Neuronal extiende el mecanismo "tirar dos veces y quedarse
 * con el mayor" del lote 13, condicionado a que el golpe sea supereficaz
 * (pokemonDefenses(), combat.mjs) contra el único objetivo seleccionado.
 *
 * Lote 41: cinco habilidades sueltas más. Motor de Vapor/Vigor son
 * "reacciones propias" (no de contacto: cualquier golpe alcanzado, del
 * atacante que sea) que crean un ActiveEffect de una ronda sobre el propio
 * defensor -velocidad de andar x2 o CA +2-, mismo patrón de duración
 * simplificada que la Baba del lote 28 pero SOBRE quien lo sufre en vez de
 * sobre el atacante; DAMAGE_TYPE_SELF_REACTION_ABILITIES/
 * damageTypeSelfReactionTrigger()/applyDamageTypeSelfReaction() borran y
 * recrean el efecto en vez de apilarlo, igual que abilityFieldBonusEffectSource()
 * en terrain-effects.mjs. Compactación Acuática se descarta a propósito:
 * "reduce a la mitad cualquier otro daño" no es una resistencia de tipo
 * fijo, y el daño real lo aplica el botón de Aplicar Daño de D&D 5e a partir
 * de `system.traits` -el mismo límite ya documentado para Filtro/Lente
 * Teñida, no se puede recortar un tipo de daño arbitrario después de
 * tirarlo-. Más/Menos vive en aura-abilities.mjs (plusMinusAttackDamageBonus):
 * +2 a ataque y daño propios si un aliado en la misma escena (sin límite de
 * distancia, igual que Estrella Victoria) también conoce Más o Menos.
 * Desafiante suma +2 a los propios ataques mientras el Pokémon sufra
 * cualquier estado alterado activo (STATUS_KIND en pokemonCombatModifiers(),
 * move-modifiers.mjs); el texto original también cubre una reducción de
 * característica impuesta por el rival, pero este proyecto no lleva un
 * registro de "quién causó" cada cambio de característica, así que se
 * simplifica al caso de estado alterado.
 *
 * Lote 42: motor de recursos "una vez por descanso corto/largo"
 * (ABILITY_REST_RESOURCES/abilityRestUseAvailable()/markAbilityRestUseSpent()/
 * abilityUsesAfterRest()/resetAbilityRestResourcesAfterRest()). Hasta ahora
 * este proyecto solo llevaba un contador de usos por OBJETO EQUIPADO
 * (`instance.heldItem.charges`, held-items.mjs); este lote introduce el
 * equivalente por HABILIDAD (`instance.abilityUses`, un mapa habilidad→usada
 * desde el último descanso que le toque), enganchado al mismo hook
 * `dnd5e.restCompleted` que ya restaura las cargas de objetos equipados
 * (main.mjs) mediante una función hermana en vez de tocar
 * restoreHeldItemChargesAfterRest() —evita mezclar el vocabulario de "objeto
 * equipado" con el de "habilidad" en el mismo archivo—. Un descanso largo
 * también limpia los recursos de descanso corto (incluye uno), igual que la
 * convención habitual de D&D 5e. Primer uso: Fuerza Bruta/Energía Pura
 * (duplican los dados de daño de un único golpe) y Simple (duplica el
 * modificador MOVE del daño de un único golpe; el texto original también
 * permite aplicarlo al ataque en vez de al daño, pero se simplifica siempre
 * al daño para no bifurcar el diálogo de confirmación en #rollMove()),
 * resueltas con un diálogo confirmHeldItemReaction() antes de construir la
 * fórmula de daño, mismo patrón que ya usa Golpes disciplinados
 * (pokemon-sheet.mjs) para preguntar antes de actuar.
 *
 * Lote 43: Garra Trampa/Duotenaz/Imán viven en aura-abilities.mjs
 * (opponentBlocksVoluntarySwitch()), no aquí, porque necesitan recorrer el
 * lienzo igual que el resto de esa familia; se enganchan en recallPokemon()
 * (deployment.mjs) con el mismo guardián `!fainted && !forced` que ya usa
 * actorHasRecallLock() para los efectos de inmovilización propios.
 *
 * Lotes 44-50: familias que antes figuraban como límites del catálogo. Se
 * etiquetan explícitamente los movimientos sonoros y climáticos para
 * Insonorizar/Funda/Punk Rock/Voz Fluida; Humedad bloquea Explosión y
 * Autodestrucción; Rompemoldes/Teravolt/Turbollama suprimen defensas de
 * habilidad; Megadisparador, Garra Dura, Lente Teñida, Filtro, Peluche y
 * Armadura Prisma comparten el flujo de fórmula/segunda tirada; Presión y
 * Encadenado reutilizan PP y multigolpe; Aura Oscura/Aura Feérica/Rompeaura
 * miden 100 pies; Superguarda y Papel Fino se aplican al actor temporal;
 * Corrosión/Sincronía/Piel Milagro se resuelven en el motor de estados;
 * Pies Enredados/Cortador Grande/Inicio Lento en modificadores; Gula en la
 * reacción de bayas; Señor Supremo cuenta aliados debilitados del entrenador;
 * y Protean/Libero/Cambio Color cambian solo el actor desplegado para no
 * alterar permanentemente la ficha Pokédex.
 */
import { MODULE_ID, getPokemonItems } from "../core/model.mjs";
import { damageTraitsForPokemonTypes, typeLabel } from "../combat/combat.mjs";
import { requestFieldEffect } from "../combat/terrain-effects.mjs";
import { escapeHtml } from "../core/utils.mjs";

const POKEMON_DAMAGE_TYPES = Object.freeze(["bug", "dark", "dragon", "electric", "fairy", "fighting", "fire", "flying", "ghost", "grass", "ground", "ice", "normal", "poison", "psychic", "rock", "steel", "water"]);

/** Habilidad → tipo de daño al que da inmunidad total. */
export const IMMUNITY_ABILITIES = Object.freeze({
  levitate: "ground",
  "water-absorb": "water",
  "volt-absorb": "electric",
  "motor-drive": "electric",
  "lightning-rod": "electric",
  "storm-drain": "water",
  "sap-sipper": "grass",
  "flash-fire": "fire",
  "dry-skin": "water",
  "well-baked-body": "fire",
  "earth-eater": "ground",
  "wind-rider": "flying",
  "poison-heal": "poison"
  // Soundproof/Bulletproof no encajan aquí: dan inmunidad a movimientos
  // "de sonido" o "balísticos", una propiedad del movimiento que el catálogo
  // de datos no etiqueta, no un tipo de daño — necesitarían su propia pasada
  // de revisión del texto de los 830 movimientos, como el resto del catálogo.
});

/** Habilidad → lista de tipos de daño a los que da resistencia. */
export const RESISTANCE_ABILITIES = Object.freeze({
  "thick-fat": ["fire", "ice"],
  heatproof: ["fire"],
  "purifying-salt": ["ghost"],
  "water-bubble": ["fire"]
  // Fluffy (resiste contacto, vulnerable a Fuego) no se puede expresar solo
  // con dr/dv/di —"contacto" no es un tipo de daño— y queda para más adelante.
});

/**
 * Habilidad → lista de estados de POKEMON_STATUS_EFFECTS (status-effects.mjs)
 * a los que da inmunidad total, sin importar el tipo del Pokémon que los
 * causa. Primer lote de la fase 2: solo las inmunidades "yo nunca sufro X",
 * que encajan en el mismo punto de applyPokemonStatus() que ya usan las
 * inmunidades por tipo de daño. Comatose se simplifica a "nunca se duerme
 * de verdad"; el matiz de videojuego de "cuenta como dormido para activar
 * Somnífero/Última Cena/etc." queda fuera porque este proyecto no distingue
 * ese caso de un Dormido real.
 */
export const STATUS_IMMUNITY_ABILITIES = Object.freeze({
  immunity: ["poisoned", "badly-poisoned"],
  insomnia: ["asleep"],
  "vital-spirit": ["asleep"],
  comatose: ["asleep"],
  limber: ["paralyzed"],
  "own-tempo": ["confused"],
  "water-veil": ["burned"],
  "water-bubble": ["burned"],
  "thermal-exchange": ["burned"],
  "magma-armor": ["frozen"],
  "inner-focus": ["flinched"],
  // Velo Pastel protege también a los aliados cercanos ("y sus aliados"),
  // pero eso es una aura (fuera de alcance, ver cabecera del archivo); aquí
  // solo se cubre la parte propia, ya presente en el texto sin condición.
  "pastel-veil": ["poisoned", "badly-poisoned"]
});

/** Habilidades que dan inmunidad a todos los estados del catálogo. */
export const FULL_STATUS_IMMUNITY_ABILITIES = Object.freeze(new Set(["good-as-gold"]));

/** Habilidad → clima que activa nada más entrar en combate. */
export const WEATHER_ABILITIES = Object.freeze({
  drizzle: "rain",
  drought: "sun",
  "sand-stream": "sandstorm",
  "snow-warning": "snow",
  "primordial-sea": "rain",
  "desolate-land": "sun"
});

/**
 * Inmunidades y resistencias que aportan las habilidades conocidas de un
 * Pokémon (todas cuentan por igual, ver cabecera del archivo), listas para
 * fusionarlas con las de damageTraitsForPokemonTypes(). No quita nada que ya
 * tuviera el Pokémon por sus propios tipos ni convierte inmunidad en
 * resistencia o viceversa.
 */
export function pokemonAbilityDefenses(abilities = []) {
  const immunities = new Set();
  const resistances = new Set();
  for (const id of abilities ?? []) {
    if (IMMUNITY_ABILITIES[id]) immunities.add(IMMUNITY_ABILITIES[id]);
    for (const type of RESISTANCE_ABILITIES[id] ?? []) resistances.add(type);
  }
  return { immunities: [...immunities], resistances: [...resistances] };
}

/** Devuelve la habilidad que hace inmune al tipo de daño indicado. */
export function abilityDamageImmunity(abilities = [], damageType = null) {
  if (!damageType) return null;
  return (abilities ?? []).find(id => IMMUNITY_ABILITIES[id] === damageType) ?? null;
}

/**
 * Aplica pokemonAbilityDefenses() a los rasgos dr/dv/di que ya construye
 * damageTraitsForPokemonTypes(), mutando `traits` en el sitio igual que el
 * resto de ajustes de deployment.mjs. Una resistencia de habilidad no
 * sustituye una inmunidad ya existente por tipo; una inmunidad de habilidad
 * si convierte una resistencia o vulnerabilidad previas.
 */
export function applyAbilityDefenses(traits, abilities) {
  const { immunities, resistances } = pokemonAbilityDefenses(abilities);
  for (const type of immunities) {
    traits.dv.value = traits.dv.value.filter(entry => entry !== type);
    traits.dr.value = traits.dr.value.filter(entry => entry !== type);
    if (!traits.di.value.includes(type)) traits.di.value.push(type);
  }
  for (const type of resistances) {
    if (traits.di.value.includes(type) || traits.dr.value.includes(type)) continue;
    traits.dv.value = traits.dv.value.filter(entry => entry !== type);
    traits.dr.value.push(type);
  }
  // Superguarda: solo los tipos que ya figuran como vulnerabilidades pueden
  // dañar a Shedinja. Se calcula sobre las afinidades finales de sus tipos.
  if ((abilities ?? []).includes("wonder-guard")) {
    for (const type of POKEMON_DAMAGE_TYPES) {
      if (traits.dv.value.includes(type) || traits.di.value.includes(type)) continue;
      traits.dr.value = traits.dr.value.filter(entry => entry !== type);
      traits.di.value.push(type);
    }
  }
  // Peluche combina vulnerabilidad fija a Fuego con reducción condicional a
  // cuerpo a cuerpo, resuelta esta última en abilityTargetDamageDiceMultiplier().
  if ((abilities ?? []).includes("fluffy")) {
    traits.di.value = traits.di.value.filter(entry => entry !== "fire");
    traits.dr.value = traits.dr.value.filter(entry => entry !== "fire");
    if (!traits.dv.value.includes("fire")) traits.dv.value.push("fire");
  }
}

/**
 * Estado que las habilidades conocidas bloquean de plano, o null si ninguna
 * lo hace. La consulta applyPokemonStatus() (status-effects.mjs) en el mismo
 * punto que ya comprueba las inmunidades por tipo de daño.
 */
export function abilityBlocksStatus(abilities, id) {
  const known = abilities ?? [];
  if (known.some(entry => FULL_STATUS_IMMUNITY_ABILITIES.has(entry))) return true;
  return known.some(entry => (STATUS_IMMUNITY_ABILITIES[entry] ?? []).includes(id));
}

/**
 * Clima que activa entrar en combate con esta habilidad, o null si ninguna
 * de las conocidas lo hace. Si el Pokémon conoce varias habilidades de
 * clima a la vez (no debería, pero por si acaso) se queda con la primera.
 */
export function abilityDeployWeather(abilities = []) {
  for (const id of abilities ?? []) if (WEATHER_ABILITIES[id]) return WEATHER_ABILITIES[id];
  return null;
}

/**
 * Activa el clima de la habilidad (Trío Tiempo y compañía) al desplegar un
 * Pokémon, si el combate ya está en marcha. Usa el mismo requestFieldEffect()
 * que ya disparan los movimientos de clima, con una duración larga (100
 * rondas) en vez de las 5 habituales: en el juego el clima de habilidad dura
 * mientras el Pokémon siga en combate, algo que este proyecto no rastrea, así
 * que se aproxima a "indefinido" en vez de a "5 rondas como un movimiento".
 * Primordial Sea/Desolate Land se simplifican al mismo lluvia/sol normal —sin
 * la parte de "no se puede cambiar mientras estén en juego"—. Se calla sin
 * más si no hay combate activo o la habilidad no pone clima. La llama
 * deployPokemon() (deployment.mjs) tras crear el actor.
 */
export async function applyAbilityDeployWeather(abilities, { sourceName } = {}) {
  const weather = abilityDeployWeather(abilities);
  if (!weather || !game.combat) return;
  await requestFieldEffect(game.combat, "weather", weather, 100, sourceName ?? "");
}

/**
 * Habilidad → reacción de contacto: "si un golpe cuerpo a cuerpo te alcanza,
 * tira `die` y en el resultado `on` devuelve al atacante daño de `type`
 * igual a tu competencia". Las cinco comparten la misma tirada (1d4, ocurre
 * con un 4) y solo cambian de tipo de daño, así que se listan como datos en
 * vez de repetir la lógica cinco veces.
 */
export const CONTACT_DAMAGE_ABILITIES = Object.freeze({
  "rough-skin": { type: "typeless", die: 4, on: 4 },
  "iron-barbs": { type: "steel", die: 4, on: 4 },
  static: { type: "electric", die: 4, on: 4 },
  "effect-spore": { type: "grass", die: 4, on: 4 },
  "poison-point": { type: "poison", die: 4, on: 4 }
});

/**
 * Primera reacción de contacto que aporta un conjunto de habilidades
 * conocidas, o null si ninguna tiene una. Si un Pokémon tuviera varias a la
 * vez (no debería, el catálogo no las combina en ninguna especie) se queda
 * con la primera, igual que abilityDeployWeather().
 */
export function contactDamageReaction(abilities = []) {
  for (const id of abilities ?? []) if (CONTACT_DAMAGE_ABILITIES[id]) return { ability: id, ...CONTACT_DAMAGE_ABILITIES[id] };
  return null;
}

/**
 * Resuelve la reacción de contacto de un defensor tras recibir un golpe
 * cuerpo a cuerpo: tira el dado de la habilidad y, si acierta, resta PG al
 * atacante igual a la competencia del defensor (misma escala que
 * applyEndTurnStatusDamage() en status-effects.mjs) y lo publica en el chat.
 * No hace nada si el defensor no conoce ninguna de CONTACT_DAMAGE_ABILITIES.
 * La llama #rollMove() (pokemon-sheet.mjs) tras resolver el ataque, una vez
 * por objetivo alcanzado, solo cuando el movimiento es cuerpo a cuerpo
 * (move.attack.scope === "melee").
 */
export async function applyContactDamageReaction(defenderActor, attackerActor) {
  if (!defenderActor || !attackerActor || defenderActor === attackerActor) return;
  const pokemonItem = await pokemonItemForActor(defenderActor);
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  const reaction = contactDamageReaction(instance?.abilities);
  if (!reaction) return;
  const label = pokemonItem.name ?? defenderActor.name;
  const roll = await new Roll(`1d${reaction.die}`).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: defenderActor }), flavor: `${defenderActor.name} — ${label} (contacto): ¿daña al atacante? (ocurre con un ${reaction.on})` });
  if (Number(roll.total) !== reaction.on) return;
  const level = Number(instance?.level) || 1;
  const damage = 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
  const hp = attackerActor.system.attributes?.hp;
  if (!hp) return;
  await attackerActor.update({ "system.attributes.hp.value": Math.max(0, Number(hp.value) - damage) });
  await ChatMessage.create({
    content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(attackerActor.name)}</strong> recibe <strong>${damage} de daño ${escapeHtml(typeLabel(reaction.type))}</strong> por el contacto con ${escapeHtml(defenderActor.name)}.</p></div>`
  });
}

/**
 * Habilidades que duplican el bono de STAB (que ya vale +2, ver
 * damageFormula() en pokemon-sheet.mjs) cuando su Pokémon está al 25% o
 * menos de sus PG máximos. Las cuatro comparten texto exacto, solo cambian
 * de tipo asociado, así que no hace falta guardar el tipo aquí: el bono se
 * suma igual que el de un objeto equipado (heldItemStab) y ya depende de que
 * el propio movimiento comparta tipo con el Pokémon para aplicarse.
 */
export const LOW_HP_STAB_ABILITIES = Object.freeze(new Set(["blaze", "overgrow", "swarm", "torrent"]));

/**
 * Bono de STAB adicional (+2, para que el +2 base se convierta en +4) si el
 * Pokémon conoce una de LOW_HP_STAB_ABILITIES y está al 25% o menos de sus
 * PG máximos, o 0 en caso contrario. Se suma al mismo parámetro
 * `heldItemStab` de damageFormula() (pokemon-sheet.mjs), que ya solo lo
 * aplica cuando el movimiento comparte tipo con el Pokémon (o `forceStab`
 * está activo), así que no duplica el bono cuando no habría STAB de por medio.
 */
export function abilityLowHpStabBonus(abilities, hpFraction) {
  if (!(Number(hpFraction) <= 0.25)) return 0;
  return (abilities ?? []).some(id => LOW_HP_STAB_ABILITIES.has(id)) ? 2 : 0;
}

/**
 * Bono de ataque, daño y rango de crítico que aportan las habilidades
 * conocidas a un movimiento concreto: mismo hueco que ya rellenan heldProfile
 * (objeto equipado, held-items.mjs) y pathProfile (Camino de Entrenador,
 * trainer-path-rules.mjs) en #rollMove(), sumado en los mismos tres puntos
 * (tirada de ataque, daño y umbral de crítico). Ojo Compuesto es el único
 * incondicional; el resto exige que el movimiento sea del tipo correcto
 * (Alas Danza, Metaltrabajador) o que el objetivo comparta tipo con el
 * Pokémon (Rivalidad, con `targetTypes` de todos los objetivos seleccionados
 * a la vez para no repetir la llamada por cada uno).
 */
export function abilityMoveProfile(abilities = [], { moveType = null, hasDamage = false, proficiency = 2, sourceTypes = [], targetTypes = [] } = {}) {
  const known = new Set(abilities ?? []);
  let attack = 0;
  let damage = 0;
  let criticalRange = 0;
  if (known.has("compound-eyes")) attack += 1;
  if (known.has("gale-wings") && moveType === "flying") attack += 1;
  if (known.has("steelworker") && hasDamage && moveType === "steel") damage += proficiency;
  if (known.has("rivalry") && hasDamage && sourceTypes.some(type => targetTypes.includes(type))) damage += proficiency;
  if (known.has("super-luck")) criticalRange += 1;
  return { attack, damage, criticalRange };
}

/**
 * Localiza el Item Pokémon que respalda a un actor: por el UUID que guarda un
 * desplegado o, si no lo hay, entre los Items embebidos de un salvaje. Copia
 * local de la misma función de status-effects.mjs (y trainer-resources.mjs)
 * para no crear un ciclo de imports entre los tres archivos.
 */
async function pokemonItemForActor(actor) {
  const uuid = actor.getFlag(MODULE_ID, "pokemonItemUuid");
  if (uuid) return fromUuid(uuid);
  return actor.items?.find(item => item.getFlag(MODULE_ID, "kind") === "pokemon") ?? null;
}

/** Habilidad → climas que activan curación de fin de turno con ese clima. */
export const WEATHER_HEAL_ABILITIES = Object.freeze({
  "rain-dish": ["rain"],
  "ice-body": ["hail", "snow"]
});

/**
 * Indica si alguna de las habilidades conocidas cura al final del turno con
 * el clima actualmente activo (`weatherId`, el `id` que devuelve
 * currentField().weather, o null/undefined si no hay clima activo). La usa
 * applyEndTurnAbilityHealing() en status-effects.mjs.
 */
export function abilityWeatherHeal(abilities = [], weatherId = null) {
  if (!weatherId) return false;
  return (abilities ?? []).some(id => WEATHER_HEAL_ABILITIES[id]?.includes(weatherId));
}

/**
 * Habilidad → reacción de contacto que aplica un estado del catálogo
 * (POKEMON_STATUS_EFFECTS, status-effects.mjs) al atacante en vez de daño:
 * "si un golpe cuerpo a cuerpo te alcanza, tira `die` y en el resultado `on`
 * el atacante sufre `status`". Cuerpo Maldito no vive aquí porque no aplica
 * un estado del catálogo, ver applyCursedBodyReaction() más abajo.
 */
export const CONTACT_STATUS_ABILITIES = Object.freeze({
  "flame-body": { status: "burned", die: 10, on: 10 },
  stench: { status: "flinched", die: 10, on: 10 }
});

/**
 * Primera reacción de contacto-a-estado que aporta un conjunto de
 * habilidades conocidas, o null si ninguna tiene una. Mismo criterio de
 * "primera coincidencia" que contactDamageReaction() y abilityDeployWeather().
 */
export function contactStatusReaction(abilities = []) {
  for (const id of abilities ?? []) if (CONTACT_STATUS_ABILITIES[id]) return { ability: id, ...CONTACT_STATUS_ABILITIES[id] };
  return null;
}

/**
 * Resuelve la reacción de contacto de un defensor tras recibir un golpe
 * cuerpo a cuerpo cuando esa reacción aplica un estado (Cuerpo Ardiente,
 * Hedor) en vez de daño: tira el dado de la habilidad y publica la tirada
 * pública en el chat, igual que applyContactDamageReaction(). Si acierta
 * devuelve `{ ability, status }` para que quien llame aplique el estado al
 * atacante con applyPokemonStatus() (status-effects.mjs); si no, devuelve
 * null. Esta función nunca aplica el estado ella misma: pokemon-abilities.mjs
 * no importa status-effects.mjs para no crear un ciclo de imports (ese
 * archivo ya importa abilityBlocksStatus() de aquí). La llama #rollMove()
 * (pokemon-sheet.mjs) tras resolver el ataque, una vez por objetivo
 * alcanzado, solo cuando el movimiento es cuerpo a cuerpo.
 */
export async function applyContactStatusReaction(defenderActor) {
  if (!defenderActor) return null;
  const pokemonItem = await pokemonItemForActor(defenderActor);
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  const reaction = contactStatusReaction(instance?.abilities);
  if (!reaction) return null;
  const label = pokemonItem.name ?? defenderActor.name;
  const roll = await new Roll(`1d${reaction.die}`).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: defenderActor }), flavor: `${defenderActor.name} — ${label} (contacto): ¿inflige un estado al atacante? (ocurre con un ${reaction.on})` });
  if (Number(roll.total) !== reaction.on) return null;
  return { ability: reaction.ability, status: reaction.status };
}

/**
 * Resuelve Cuerpo Maldito tras recibir un golpe cuerpo a cuerpo: tira 1d4 y,
 * en un 4, publica la tirada y un aviso corto en el chat y devuelve true para
 * que quien llame bloquee el último movimiento del atacante con
 * applyMoveLock() (move-modifiers.mjs); si no, devuelve false sin publicar el
 * aviso adicional. No aplica el bloqueo ella misma por el mismo motivo que
 * applyContactStatusReaction(): esta función no conoce moveId, solo la llamada
 * desde #rollMove() (pokemon-sheet.mjs) lo tiene a mano.
 */
export async function applyCursedBodyReaction(defenderActor, attackerActor) {
  if (!defenderActor || !attackerActor || defenderActor === attackerActor) return false;
  const pokemonItem = await pokemonItemForActor(defenderActor);
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  if (!(instance?.abilities ?? []).includes("cursed-body")) return false;
  const label = pokemonItem.name ?? defenderActor.name;
  const roll = await new Roll("1d4").evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: defenderActor }), flavor: `${defenderActor.name} — ${label} (contacto): ¿bloquea el movimiento del atacante? (ocurre con un 4)` });
  if (Number(roll.total) !== 4) return false;
  await ChatMessage.create({
    content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${escapeHtml(attackerActor.name)}</strong> no podrá repetir ese movimiento en su próximo turno por Cuerpo Maldito de ${escapeHtml(defenderActor.name)}.</p></div>`
  });
  return true;
}

/**
 * Habilidades cuyo texto es "si este Pokémon está a PG máximos, el primer
 * golpe que reciba se reduce a la mitad" (Multiescama, Escudo Sombra: mismo
 * texto exacto). No hace falta rastrear "ya se usó una vez": en cuanto el
 * golpe conecta el Pokémon deja de estar a PG máximos, así que la propia
 * condición de PG máximos impide que se repita hasta que vuelva a curarse
 * del todo, sin estado adicional que guardar.
 */
export const FULL_HP_HALF_DAMAGE_ABILITIES = new Set(["multiscale", "shadow-shield"]);

/**
 * Habilidades cuyo texto es "al recibir daño igual o superior a la mitad de
 * tus PG actuales, tira 1d4 y en 3 o 4 se reduce a la mitad" (Robustez). Solo
 * tiene un miembro hoy, pero sigue el mismo patrón de conjunto que
 * FULL_HP_HALF_DAMAGE_ABILITIES por si el catálogo suma alguna más adelante.
 */
export const STURDY_HALF_DAMAGE_ABILITIES = new Set(["sturdy"]);

/**
 * Habilidad → lista de estados propios (mismos ids que POKEMON_STATUS_EFFECTS
 * en status-effects.mjs) que activan un bono de daño igual a la competencia
 * mientras el Pokémon los sufre.
 */
export const SELF_STATUS_DAMAGE_BOOST_ABILITIES = Object.freeze({
  competitive: ["poisoned", "badly-poisoned", "burned", "confused", "paralyzed"],
  "flare-boost": ["burned"]
});

/**
 * Bono de daño (competencia, o 0) que aportan las habilidades conocidas de
 * un Pokémon según su propio estado alterado actual (`activeConditions`,
 * p.ej. `instance.conditions`). No es acumulable: si por lo que sea el
 * Pokémon conociera dos habilidades de la tabla a la vez y ambas coincidieran
 * con un estado activo, el bono se suma una sola vez — de ahí el `some` en
 * vez de un `reduce` que las sumara todas.
 */
export function abilitySelfStatusDamageBonus(abilities = [], activeConditions = [], proficiency = 0) {
  const known = abilities ?? [];
  const conditions = activeConditions ?? [];
  const applies = known.some(id => (SELF_STATUS_DAMAGE_BOOST_ABILITIES[id] ?? []).some(status => conditions.includes(status)));
  return applies ? proficiency : 0;
}

/** Estados propios cuya desventaja/reducción anula Vigor (`guts`). */
export const GUTS_IGNORED_STATUSES = new Set(["poisoned", "badly-poisoned", "burned"]);

/**
 * True si el Pokémon conoce Vigor (`guts`): sigue sufriendo el daño
 * periódico de fin de turno de Envenenado/Quemado, pero no la desventaja en
 * ataque ni la tirada doble-quedarse-con-la-menor de daño que normalmente
 * acompañan a esos estados. Lo consulta #rollMove() (pokemon-sheet.mjs).
 */
export function abilityIgnoresStatusPenalty(abilities = []) {
  return (abilities ?? []).includes("guts");
}

/** Habilidad → bono de CA mientras el Pokémon sufre cualquier estado alterado negativo. */
export const AC_STATUS_BONUS_ABILITIES = Object.freeze({
  "marvel-scale": 2
});

/**
 * Habilidad → pies de más de velocidad mientras el Pokémon sufre cualquier
 * estado alterado negativo. Se aplica a las cinco formas de movimiento, igual
 * que la reducción de velocidad de Parálisis en pokemonStatusEffectSource()
 * (status-effects.mjs): un Pokémon con desplazamiento de vuelo o natación
 * también gana los mismos 15 pies ahí, no solo caminando.
 */
export const SPEED_STATUS_BONUS_ABILITIES = Object.freeze({
  "quick-feet": 15
});

/**
 * ActiveEffect con el bono de CA y/o velocidad de las habilidades de estado
 * alterado (Escama Prodigio, Pies Rápidos), o null si el Pokémon no conoce
 * ninguna de las dos. Mismo formato que devuelve pokemonStatusEffectSource()
 * en status-effects.mjs, para que ese archivo pueda crearlo y borrarlo con
 * las mismas llamadas createEmbeddedDocuments/deleteEmbeddedDocuments que ya
 * usa con los estados. No se llama desde este archivo: lo consume
 * status-effects.mjs en applyPokemonStatus()/removePokemonStatus(), ver
 * cabecera del archivo (Lote 7) para el porqué del diseño.
 */
export function abilityStatusBonusEffectSource(abilities = []) {
  const changes = [];
  for (const id of abilities ?? []) {
    if (AC_STATUS_BONUS_ABILITIES[id] != null) {
      changes.push({
        key: "system.attributes.ac.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: AC_STATUS_BONUS_ABILITIES[id]
      });
    }
    if (SPEED_STATUS_BONUS_ABILITIES[id] != null) {
      for (const type of ["walk", "fly", "swim", "burrow", "climb"]) {
        changes.push({
          key: `system.attributes.movement.${type}`,
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: SPEED_STATUS_BONUS_ABILITIES[id]
        });
      }
    }
  }
  if (!changes.length) return null;
  return {
    name: "Bono de estado alterado",
    icon: "icons/svg/upgrade.svg",
    img: "icons/svg/upgrade.svg",
    description: "Bono de CA y/o velocidad mientras el Pokémon sufre algún estado alterado.",
    statuses: [],
    changes,
    duration: {},
    flags: { [MODULE_ID]: { kind: "ability-status-bonus" } }
  };
}

/**
 * Habilidad → tipo de daño que absorbe como curación en vez de solo
 * bloquearlo (Absorbe Agua, Absorbe Electricidad, Come Tierra; ver el Lote
 * 10 en la cabecera del archivo). Comparte ids con IMMUNITY_ABILITIES: la
 * inmunidad de tipo no cambia, esto solo añade la mitad del daño en bruto
 * como curación.
 */
export const ABSORB_HEAL_ABILITIES = Object.freeze({
  "water-absorb": "water",
  "volt-absorb": "electric",
  "earth-eater": "ground",
  "poison-heal": "poison"
});

/**
 * Tipo de daño que las habilidades conocidas absorben como curación, o null
 * si ninguna coincide. La consulta #rollMove() (pokemon-sheet.mjs) para
 * decidir si un objetivo alcanzado por ese tipo de daño se cura la mitad de
 * lo tirado en vez de solo evitarlo.
 */
export function absorbHealType(abilities = []) {
  for (const id of abilities ?? []) if (ABSORB_HEAL_ABILITIES[id]) return ABSORB_HEAL_ABILITIES[id];
  return null;
}

/**
 * Habilidades sin extra de daño por golpe crítico (Armadura Bélica, Armadura
 * Concha, Roca Sólida: mismo efecto exacto con distinto nombre). Se resuelve
 * en #rollMove() (pokemon-sheet.mjs) apagando el flag `critical` de las
 * opciones de DamageRoll cuando el único objetivo seleccionado la conoce.
 */
export const CRITICAL_IMMUNITY_ABILITIES = Object.freeze(new Set(["battle-armor", "shell-armor", "solid-rock"]));

/** True si el Pokémon conoce alguna habilidad de CRITICAL_IMMUNITY_ABILITIES. */
export function abilityIgnoresCriticalDamage(abilities = []) {
  return (abilities ?? []).some(id => CRITICAL_IMMUNITY_ABILITIES.has(id));
}

/**
 * Habilidad → climas que dan inmunidad a CUALQUIER estado del catálogo
 * mientras estén activos (Manto Hoja con sol, Hidratación con lluvia — el
 * texto de Hidratación también cubre "en el agua", un terreno que este
 * proyecto no rastrea, así que se simplifica al clima de lluvia).
 */
export const WEATHER_STATUS_IMMUNITY_ABILITIES = Object.freeze({
  "leaf-guard": ["sun"],
  hydration: ["rain"]
});

/** True si alguna habilidad conocida da inmunidad a estado con el clima activo dado. */
export function abilityWeatherBlocksStatus(abilities = [], weatherId = null) {
  if (!weatherId) return false;
  return (abilities ?? []).some(id => WEATHER_STATUS_IMMUNITY_ABILITIES[id]?.includes(weatherId));
}

/**
 * Habilidades que tiran el daño dos veces y se quedan con el resultado
 * mayor cuando el movimiento cumple su condición: Adaptabilidad (el
 * movimiento comparte tipo con el Pokémon, STAB o no), Fauces de Dragón
 * (tipo Dragón), Carga Rocosa (tipo Roca), Transistor (tipo Eléctrico) y
 * Técnico (el movimiento tiene 15 PP máximos o más). Cada una solo mira su
 * propia condición, listadas como datos porque la lógica que las consulta
 * (abilityRollsDamageTwiceHigher()) es idéntica para las cinco.
 */
export function abilityRollsDamageTwiceHigher(abilities = [], { moveType = null, speciesTypes = [], movePp = 0, moveId = null, moveName = "" } = {}) {
  const known = new Set(abilities ?? []);
  if (known.has("adaptability") && speciesTypes.includes(moveType)) return true;
  if (known.has("dragons-maw") && moveType === "dragon") return true;
  if (known.has("rocky-payload") && moveType === "rock") return true;
  if (known.has("transistor") && moveType === "electric") return true;
  if (known.has("technician") && Number(movePp) >= 15) return true;
  // Puño Férreo (punch): el catálogo no etiqueta "movimiento de puño", igual
  // que Filo (lote 21) se detecta por el nombre en inglés.
  if (known.has("iron-fist") && /punch/i.test(moveName ?? "")) return true;
  // Mandíbula Firme (bite): sin patrón de nombre fiable (Crunch/Bite Fang no
  // comparten texto), así que se lista el mismo puñado de movimientos de
  // mordisco que ya reconoce el juego original.
  if (known.has("strong-jaw") && STRONG_JAW_MOVE_IDS.has(moveId)) return true;
  return false;
}

/** Movimientos de mordisco que activan Mandíbula Firme (sin patrón de nombre común, se listan explícitamente). */
export const STRONG_JAW_MOVE_IDS = Object.freeze(new Set([
  "bite", "bug-bite", "crunch", "fire-fang", "hyper-fang", "ice-fang", "jaw-lock", "poison-fang", "psychic-fangs", "super-fang", "thunder-fang"
]));

/**
 * Antibalas (bulletproof): inmune a movimientos con "Bullet", "Ball" o
 * "Bomb" en su nombre en inglés — el mismo patrón de nombre que ya usan
 * Filo/Puño Férreo, porque el catálogo tampoco etiqueta "movimiento
 * balístico" de ningún otro modo. A diferencia de esas dos, aquí la
 * inmunidad es total (no un tipo de daño real que D&D 5e pueda resolver por
 * sí solo vía traits), así que se resuelve anulando la fórmula de daño ANTES
 * de tirarla en #rollMove(), solo con un único objetivo seleccionado —misma
 * limitación que Armadura Bélica (lote 11) y Alza tus defensas—.
 */
const BULLETPROOF_NAME_PATTERN = /\b(bullet|ball|bomb)/i;

/** True si el Pokémon conoce Antibalas y el nombre del movimiento coincide con BULLETPROOF_NAME_PATTERN. */
export function abilityBlocksBulletproofMove(abilities = [], moveName = "") {
  return (abilities ?? []).includes("bulletproof") && BULLETPROOF_NAME_PATTERN.test(moveName ?? "");
}

/**
 * Habilidad → cómo envenena el propio golpe cuerpo a cuerpo de este Pokémon
 * (dirección contraria a los lotes 2/5/20, que reaccionan al golpe RECIBIDO):
 * Toque Tóxico tira 1d10 y envenena con un 10; Cadena Tóxica exige que el
 * objetivo falle una salvación de CON CD 16 para quedar gravemente
 * envenenado. Se resuelve en el mismo bucle de `selectedTokens` alcanzados
 * que ya usan Falso Tortazo/Ladrón en #rollMove(), reutilizando
 * `rollFailedSaves()` (hp-effects.mjs) para el caso de salvación.
 */
export const OWN_MELEE_HIT_STATUS_ABILITIES = Object.freeze({
  "poison-touch": { mode: "chance", die: 10, on: 10, status: "poisoned" },
  "toxic-chain": { mode: "save", dc: 16, saveAbility: "con", status: "badly-poisoned" }
});

/** Primera habilidad de OWN_MELEE_HIT_STATUS_ABILITIES que conoce el Pokémon, o null. */
export function ownMeleeHitStatusTrigger(abilities = []) {
  for (const id of abilities ?? []) if (OWN_MELEE_HIT_STATUS_ABILITIES[id]) return { ability: id, ...OWN_MELEE_HIT_STATUS_ABILITIES[id] };
  return null;
}

/**
 * Resuelve Baba tras recibir un golpe cuerpo a cuerpo: tira 1d4 y, en 3 o 4,
 * deja la velocidad del atacante a 0 mediante un ActiveEffect de una ronda de
 * duración (mismo patrón OVERRIDE que ya usa Parálisis para reducirla a la
 * mitad, pero a 0 y con caducidad propia en vez de ligado a un estado). La
 * llama #rollMove() (pokemon-sheet.mjs) junto al resto de reacciones de
 * contacto, con su propia copia de pokemonItemForActor().
 */
export async function applyGooeyReaction(defenderActor, attackerActor) {
  if (!defenderActor || !attackerActor || defenderActor === attackerActor) return false;
  const pokemonItem = await pokemonItemForActor(defenderActor);
  const instance = pokemonItem?.getFlag(MODULE_ID, "instance");
  if (!(instance?.abilities ?? []).includes("gooey")) return false;
  const label = pokemonItem.name ?? defenderActor.name;
  const roll = await new Roll("1d4").evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: defenderActor }), flavor: `${defenderActor.name} — ${label} (contacto): ¿reduce la velocidad del atacante a 0? (ocurre con un 3 o 4)` });
  if (Number(roll.total) < 3) return false;
  await attackerActor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Baba",
    icon: "icons/svg/downgrade.svg",
    img: "icons/svg/downgrade.svg",
    description: `Velocidad reducida a 0 por Baba de ${defenderActor.name} hasta el final de su próximo turno.`,
    changes: ["walk", "fly", "swim", "burrow", "climb"].map(type => ({
      key: `system.attributes.movement.${type}`, mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: 0, priority: 25
    })),
    duration: { rounds: 1, startRound: game.combat?.round ?? 0, startTurn: game.combat?.turn ?? 0 },
    flags: { [MODULE_ID]: { kind: "ability-contact-debuff" } }
  }]);
  return true;
}

/** True si el Pokémon conoce Analítico: ventaja en el próximo ataque tras fallar el anterior. */
export function abilityGrantsAnalyticAdvantage(abilities = []) {
  return (abilities ?? []).includes("analytic");
}

/** True si el Pokémon conoce Constancia: no puede repetir el mismo movimiento en rondas consecutivas. */
export function abilityBlocksRepeatingMove(abilities = []) {
  return (abilities ?? []).includes("truant");
}

/**
 * Escamas de Hielo: resistencia (mitad de dados de daño) a movimientos cuya
 * característica de potencia sea INT, SAB o CAR. No es un tipo de daño fijo
 * —depende del movimiento del atacante, no del Pokémon defensor—, así que se
 * resuelve como `diceMultiplier` 0.5 (el mismo valor que ya usan otros
 * multiplicadores de dados de #rollMove()) solo con un único objetivo
 * seleccionado, igual que Armadura Bélica/Antibalas/Roca Sólida.
 */
export function abilityIceScalesDiceMultiplier(abilities = [], movePower = []) {
  const known = abilities ?? [];
  const powers = Array.isArray(movePower) ? movePower : [movePower].filter(Boolean);
  if (known.includes("ice-scales") && powers.some(power => ["int", "wis", "cha"].includes(power))) return 0.5;
  return 1;
}

/** True si el Pokémon conoce Merciless o Vigor... — no, solo Merciless: dobla los dados de daño contra un objetivo envenenado. */
export function abilityDoublesDiceAgainstPoisoned(abilities = [], targetConditions = []) {
  return (abilities ?? []).includes("merciless") && (targetConditions ?? []).some(id => id === "poisoned" || id === "badly-poisoned");
}

/** True si el Pokémon conoce Espada Justiciera: sus ataques cuerpo a cuerpo se tiran con ventaja. */
export function abilityGrantsMeleeAttackAdvantage(abilities = []) {
  return (abilities ?? []).includes("intrepid-sword");
}

/** True si el Pokémon conoce Sin Reparos: sus propios ataques (a cualquier movimiento) se tiran con ventaja. */
export function abilityGrantsSelfAttackAdvantage(abilities = []) {
  return (abilities ?? []).includes("no-guard");
}

/**
 * Ventaja/desventaja que el objetivo de un ataque impone al ATACANTE por sus
 * propias habilidades: Sin Reparos da ventaja a cualquier ataque que reciba,
 * Escudo Intrépido da desventaja a los que reciba cuerpo a cuerpo. Se
 * consulta con un único objetivo seleccionado, igual que el resto de
 * comprobaciones "por objetivo" de #rollMove().
 */
export function abilityTargetAttackRollModifier(targetAbilities = [], isMelee = false, targetConditions = []) {
  const known = targetAbilities ?? [];
  return {
    advantage: known.includes("no-guard"),
    disadvantage: (isMelee && known.includes("dauntless-shield")) || (known.includes("tangled-feet") && (targetConditions ?? []).includes("confused"))
  };
}

/** Cortador Grande impide que los bonos de ataque o daño queden bajo cero. */
export function abilityProtectsAttackDamageBonuses(abilities = []) {
  return (abilities ?? []).includes("hyper-cutter");
}

/** True si el Pokémon conoce Cura Tóxica: el daño periódico de Envenenado/Gravemente envenenado cura en vez de dañar. */
export function abilityHealsFromPoisonTick(abilities = []) {
  return (abilities ?? []).includes("poison-heal");
}

/**
 * Habilidad → umbral de PG máximos (fracción) y si el cambio es forzado u
 * ofrecido: Salida de Emergencia deja elegir al entrenador, Rendirse lo
 * obliga. Ambas al cruzar el 50% de PG máximos hacia abajo por una bajada de
 * PG (no simplemente estar por debajo ya de antes).
 */
export const HP_THRESHOLD_SWITCH_ABILITIES = Object.freeze({
  "emergency-exit": { threshold: 0.5, forced: false },
  "wimp-out": { threshold: 0.5, forced: true }
});

/** Habilidad que acaba de cruzar su umbral de PG hacia abajo en esta bajada concreta, o null. */
export function hpThresholdSwitchTrigger(abilities = [], previousHpFraction = 1, nextHpFraction = 1) {
  const known = abilities ?? [];
  for (const [id, rule] of Object.entries(HP_THRESHOLD_SWITCH_ABILITIES)) {
    if (known.includes(id) && Number(previousHpFraction) > rule.threshold && Number(nextHpFraction) <= rule.threshold) {
      return { ability: id, forced: rule.forced };
    }
  }
  return null;
}

/**
 * Cura Natural/Regenerador (lote 40): qué corregir en la instancia de un
 * Pokémon al volver a la Poké Ball —cura todos los estados alterados y/o
 * recupera PG igual a su nivel—, o null si no conoce ninguna de las dos.
 * Regenerador se simplifica sin el límite "una vez por descanso largo" del
 * texto original: este proyecto no lleva un contador de usos por Pokémon
 * (solo por objeto equipado), así que se aplica en cada retirada.
 */
export function recallAbilityAdjustment(abilities = [], conditions = [], hp = null, level = 1) {
  const known = abilities ?? [];
  const result = {};
  if (known.includes("natural-cure") && (conditions ?? []).length) result.clearConditions = true;
  if (known.includes("regenerator") && hp && Number(hp.value) < Number(hp.max)) {
    result.healedHp = Math.min(Number(hp.max) || 0, Number(hp.value) + (Number(level) || 1));
  }
  return Object.keys(result).length ? result : null;
}

/** True si el Pokémon conoce Alocado (reckless): dobla el STAB al usar un movimiento con retroceso. */
export function abilityDoublesRecoilStab(abilities = []) {
  return (abilities ?? []).includes("reckless");
}

/** True si el Pokémon conoce Fuerza Neuronal: tira el daño dos veces y se queda con el mayor si el golpe fue supereficaz. */
export function abilityRollsSuperEffectiveTwice(abilities = [], effectivenessMultiplier = 1) {
  return (abilities ?? []).includes("neuroforce") && Number(effectivenessMultiplier) > 1;
}

/** True si el Pokémon conoce Ventosas (sticky-hold): su objeto no puede robarse ni tirarse. */
export function abilityProtectsHeldItem(abilities = []) {
  return (abilities ?? []).includes("sticky-hold");
}

/** True si el Pokémon conoce Torpeza (klutz): no puede llevar ningún objeto equipado. */
export function abilityPreventsHoldingItem(abilities = []) {
  return (abilities ?? []).includes("klutz");
}

/** Habilidades que impiden ser expulsado del combate por un movimiento ajeno (Ventosas, Guardián). */
export const FORCED_SWITCH_IMMUNE_ABILITIES = Object.freeze(new Set(["suction-cups", "guard-dog"]));

/** True si el Pokémon conoce alguna habilidad de FORCED_SWITCH_IMMUNE_ABILITIES. */
export function abilityBlocksForcedSwitch(abilities = []) {
  return (abilities ?? []).some(id => FORCED_SWITCH_IMMUNE_ABILITIES.has(id));
}

/**
 * Habilidades cuyo texto es "las habilidades o movimientos de otros Pokémon
 * no pueden bajar las características de este" (Cuerpo Puro, Cuerpo de Metal
 * Pleno, Humo Blanco: mismo efecto exacto). `pokemonCombatModifiers()`
 * (move-modifiers.mjs) ya tenía un flag `debuffImmune` para esto —lo ponía un
 * ActiveEffect de movimiento (categoría "debuffs")—, así que este lote solo
 * añade que también lo active conocer una de estas tres habilidades, leídas
 * del flag `pokemonAbilities` que ya llevan los actores desplegados y
 * salvajes (lote 9) para poder consultarse sin `await` en esa función síncrona.
 */
export const DEBUFF_IMMUNITY_ABILITIES = Object.freeze(new Set(["clear-body", "full-metal-body", "white-smoke"]));

/** True si el Pokémon conoce alguna habilidad de DEBUFF_IMMUNITY_ABILITIES. */
export function abilityGrantsDebuffImmunity(abilities = []) {
  return (abilities ?? []).some(id => DEBUFF_IMMUNITY_ABILITIES.has(id));
}

/**
 * Bono fijo de daño según el clima activo del combate (Poder Solar: +2 con
 * sol). Se suma al mismo hueco de `effectDamage` que ya usa
 * abilitySelfStatusDamageBonus() (lote 6) en #rollMove().
 */
export const WEATHER_DAMAGE_BONUS_ABILITIES = Object.freeze({ "solar-power": { weather: "sun", bonus: 2 } });

/** Bono de daño de WEATHER_DAMAGE_BONUS_ABILITIES si el clima activo coincide, o 0. */
export function abilityWeatherDamageBonus(abilities = [], weatherId = null) {
  if (!weatherId) return 0;
  const match = (abilities ?? []).find(id => WEATHER_DAMAGE_BONUS_ABILITIES[id]?.weather === weatherId);
  return match ? WEATHER_DAMAGE_BONUS_ABILITIES[match].bonus : 0;
}

/**
 * Duplicación de STAB según el clima activo (Fuerza de Arena: ×2 con
 * tormenta de arena). Mismo hueco que abilityLowHpStabBonus() (lote 3) en
 * damageFormula(): +2 para que el +2 base se convierta en +4.
 */
export const WEATHER_STAB_DOUBLE_ABILITIES = Object.freeze({ "sand-force": "sandstorm" });

/** +2 de STAB si el clima activo coincide con alguna de WEATHER_STAB_DOUBLE_ABILITIES, o 0. */
export function abilityWeatherStabBonus(abilities = [], weatherId = null) {
  if (!weatherId) return 0;
  return (abilities ?? []).some(id => WEATHER_STAB_DOUBLE_ABILITIES[id] === weatherId) ? 2 : 0;
}

/**
 * Habilidad → tipo de daño al que cambian los movimientos de tipo Normal
 * (Galvanismo, Pixelado, Refrigerar). Normalizar es la habilidad contraria
 * ("todos sus movimientos son de tipo Normal") y por eso no vive en este
 * mapa: abilityMoveTypeOverride() la comprueba aparte, primero, porque
 * sustituye cualquier tipo de origen, no solo Normal.
 */
export const NORMAL_MOVE_TYPE_OVERRIDE_ABILITIES = Object.freeze({
  galvanize: "electric",
  pixilate: "fairy",
  refrigerate: "ice"
});

/**
 * Tipo de daño final de un movimiento tras Galvanismo/Pixelado/Refrigerar/
 * Normalizar, o null si ninguna de las cuatro aplica. Solo cambia el tipo de
 * daño (resistencias/inmunidades/vulnerabilidades del objetivo): el STAB
 * sigue comprobando el tipo ORIGINAL del movimiento contra los tipos del
 * Pokémon, la misma simplificación que ya usa el cambio de tipo de Diluvio
 * Iónico en #rollMove() (pokemon-sheet.mjs), porque `damageFormula()` no
 * recibe el tipo ya sustituido.
 */
export function abilityMoveTypeOverride(abilities = [], moveType = null, { moveId = null, moveName = "" } = {}) {
  const known = abilities ?? [];
  if (known.includes("normalize")) return "normal";
  if (known.includes("liquid-voice") && isSoundMove(moveId, moveName)) return "water";
  if (moveType !== "normal") return null;
  const match = known.find(id => NORMAL_MOVE_TYPE_OVERRIDE_ABILITIES[id]);
  return match ? NORMAL_MOVE_TYPE_OVERRIDE_ABILITIES[match] : null;
}

/**
 * Habilidad → tipos de daño que, al recibirlos, dan ventaja en el próximo
 * ataque (Firmeza con Siniestro; Nervios con Siniestro/Bicho/Fantasma;
 * Impulso Tóxico con Veneno; Intercambio Térmico con Fuego, que además ya es
 * inmune a Quemado por STATUS_IMMUNITY_ABILITIES). Se resuelve con
 * applyDynamicModifier() (move-modifiers.mjs, `{ attackAdvantage: true }`,
 * una ronda de duración) en el mismo bucle por objetivo alcanzado que ya usa
 * absorbHealType() (lote 10), porque comparte el mismo criterio "el tipo de
 * daño recibido coincide".
 */
export const TYPE_TRIGGERED_ADVANTAGE_ABILITIES = Object.freeze({
  justified: ["dark"],
  rattled: ["dark", "bug", "ghost"],
  "toxic-boost": ["poison"],
  "thermal-exchange": ["fire"]
});

/** True si alguna habilidad conocida da ventaja en el próximo ataque al recibir ese tipo de daño. */
export function abilityTypeTriggeredAdvantage(abilities = [], damageType = null) {
  if (!damageType) return false;
  return (abilities ?? []).some(id => TYPE_TRIGGERED_ADVANTAGE_ABILITIES[id]?.includes(damageType));
}

/** +1 a la CD de salvación de todos los movimientos si el Pokémon conoce Gracia Sereno. */
export function abilitySaveDcBonus(abilities = []) {
  return (abilities ?? []).includes("serene-grace") ? 1 : 0;
}

/** True si el Pokémon conoce Cabeza Roca: no sufre daño de retroceso propio. */
export function abilityIgnoresRecoil(abilities = []) {
  return (abilities ?? []).includes("rock-head");
}

/** True si el Pokémon conoce Impasible (unburden): +10 pies de velocidad sin objeto equipado. */
export function abilityGrantsUnburdenSpeed(abilities = []) {
  return (abilities ?? []).includes("unburden");
}

/**
 * Corrige la curación de una baya (Baya Zanahoria/Baya Saludable, las dos
 * únicas de curación automática de este proyecto) según Madurez (duplica el
 * efecto de la baya) y Buche (suma un 10% adicional de los PG máximos,
 * redondeado hacia arriba, sin depender de si también duplicó). El orden es
 * el mismo que en los videojuegos: Madurez dobla primero, Buche se suma
 * después y no se ve afectado por la duplicación.
 */
export function abilityBerryHealBonus(abilities = [], amount = 0, maximumHp = 0) {
  const known = abilities ?? [];
  let total = Number(amount) || 0;
  if (known.includes("ripen")) total *= 2;
  if (known.includes("cheek-pouch")) total += Math.ceil((Number(maximumHp) || 0) * 0.1);
  return total;
}

/** Habilidades cuyos ataques se tiran con desventaja al 25% o menos de PG máximos (Desertor, Descontrol). */
export const LOW_HP_ATTACK_DISADVANTAGE_ABILITIES = Object.freeze(new Set(["defeatist", "berserk"]));
/** Habilidades que dan ventaja a la salvación del objetivo al 25% o menos de PG máximos (Descontrol). */
export const LOW_HP_SAVE_ADVANTAGE_ABILITIES = Object.freeze(new Set(["berserk"]));
/** Habilidades que duplican los dados de daño al 25% o menos de PG máximos (Descontrol). */
export const LOW_HP_DAMAGE_DOUBLE_ABILITIES = Object.freeze(new Set(["berserk"]));

/**
 * Desventaja de ataque propia y ventaja de salvación del objetivo que
 * aportan Desertor/Descontrol al 25% o menos de PG máximos, listas para
 * fusionarlas en el `total` de pokemonCombatModifiers() (move-modifiers.mjs)
 * — mismo hueco síncrono que ya usa abilityGrantsDebuffImmunity() (lote 16),
 * con la fracción de PG calculada ahí mismo a partir del propio actor.
 */
export function abilityLowHpCombatModifiers(abilities, hpFraction) {
  const known = abilities ?? [];
  const lowHp = Number(hpFraction) <= 0.25;
  return {
    attackDisadvantage: lowHp && known.some(id => LOW_HP_ATTACK_DISADVANTAGE_ABILITIES.has(id)),
    saveTargetsAdvantage: lowHp && known.some(id => LOW_HP_SAVE_ADVANTAGE_ABILITIES.has(id))
  };
}

/** Multiplicador de dados de daño (2 con Descontrol al 25% o menos de PG, si no 1). Mismo hueco que el resto de multiplicadores de dados en #rollMove(). */
export function abilityLowHpDamageDiceMultiplier(abilities = [], hpFraction = 1) {
  if (!(Number(hpFraction) <= 0.25)) return 1;
  return (abilities ?? []).some(id => LOW_HP_DAMAGE_DOUBLE_ABILITIES.has(id)) ? 2 : 1;
}

/**
 * Palabras que activan Filo (sharpness): el movimiento dobla su modificador
 * MOVE si su nombre en inglés (el que trae el catálogo de datos) contiene
 * alguna de ellas. `move.name` es el único dato disponible para esto —el
 * catálogo no etiqueta "movimiento cortante" de ningún otro modo—, así que
 * se compara en inglés aunque el resto de la ficha esté en español.
 */
const SHARPNESS_NAME_PATTERN = /\b(cut|blade|slash|edge|cleave|razor|sword|axe)/i;

/** True si el Pokémon conoce Filo y el nombre del movimiento coincide con SHARPNESS_NAME_PATTERN. */
export function abilitySharpnessDoublesModifier(abilities = [], moveName = "") {
  return (abilities ?? []).includes("sharpness") && SHARPNESS_NAME_PATTERN.test(moveName ?? "");
}

// La familia de velocidad/CA por clima o terreno activos (Clorofila, Nado
// Rápido, Paso Arena, Aguanieve, Onda Voltaica, Velo Arena, Manto Nieve,
// Pelaje Herboso) vive en terrain-effects.mjs, no aquí: ese archivo es quien
// necesita recorrer todos los actores desplegados/salvajes al cambiar el
// campo, y este archivo ya importa requestFieldEffect() de terrain-effects.mjs
// para el clima de despliegue (fase 1) — importar en la otra dirección
// crearía un ciclo entre los dos módulos. Ver WEATHER_SPEED_DOUBLE_ABILITIES
// y abilityFieldBonusEffectSource() en terrain-effects.mjs (lote 18).

/**
 * Habilidad → qué tipo(s) de daño recibido la activa (`null` = cualquiera) y
 * qué efecto propio crea (lote 41). A diferencia de OWN_MELEE_HIT_STATUS_ABILITIES
 * (que reacciona al PROPIO golpe) o applyGooeyReaction() (que crea el
 * ActiveEffect en el ATACANTE), esta familia reacciona a un golpe RECIBIDO
 * de cualquier tipo de ataque (no solo cuerpo a cuerpo) y el ActiveEffect
 * resultante queda en el propio defensor.
 */
export const DAMAGE_TYPE_SELF_REACTION_ABILITIES = Object.freeze({
  "steam-engine": { types: ["fire", "water"], effect: "steam-engine" },
  stamina: { types: null, effect: "stamina" }
});

/** Primer efecto de DAMAGE_TYPE_SELF_REACTION_ABILITIES que activa `damageType` (o cualquiera si `types` es null), o null. */
export function damageTypeSelfReactionTrigger(abilities = [], damageType = null) {
  for (const id of abilities ?? []) {
    const entry = DAMAGE_TYPE_SELF_REACTION_ABILITIES[id];
    if (!entry) continue;
    if (entry.types && !entry.types.includes(damageType)) continue;
    return entry.effect;
  }
  return null;
}

/**
 * Crea (borrando cualquier copia anterior, sin apilar) el ActiveEffect de
 * una ronda que corresponde a `effect` sobre `defenderActor`: Motor de Vapor
 * duplica su velocidad de andar, Vigor suma +2 a su CA. La llama #rollMove()
 * (pokemon-sheet.mjs) por cada objetivo alcanzado con `dealtDamageTotal` no
 * nulo, igual que ya hace con absorbHealType()/el descongelado por Fuego.
 */
export async function applyDamageTypeSelfReaction(defenderActor, effect) {
  if (!defenderActor || !effect) return false;
  const kind = `ability-self-reaction-${effect}`;
  const existing = defenderActor.effects.filter(entry => entry.getFlag(MODULE_ID, "kind") === kind);
  if (existing.length) await defenderActor.deleteEmbeddedDocuments("ActiveEffect", existing.map(entry => entry.id));
  const changes = effect === "steam-engine"
    ? [{ key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: 2, priority: 20 }]
    : [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 2 }];
  const name = effect === "steam-engine" ? "Motor de Vapor" : "Vigor";
  await defenderActor.createEmbeddedDocuments("ActiveEffect", [{
    name,
    icon: "icons/svg/upgrade.svg",
    img: "icons/svg/upgrade.svg",
    description: effect === "steam-engine"
      ? "Velocidad de andar duplicada hasta el final del próximo turno por Motor de Vapor."
      : "+2 a la CA hasta el inicio del próximo turno por Vigor.",
    changes,
    duration: { rounds: 1, startRound: game.combat?.round ?? 0, startTurn: game.combat?.turn ?? 0 },
    flags: { [MODULE_ID]: { kind } }
  }]);
  return true;
}

/**
 * Habilidad → {rest, name} de las abilidades "una vez por descanso corto/largo"
 * (lote 42). `name` es la etiqueta en español que usa el diálogo de
 * confirmación en #rollMove() (pokemon-sheet.mjs).
 */
export const ABILITY_REST_RESOURCES = Object.freeze({
  "huge-power": { rest: "short", name: "Fuerza Bruta" },
  "pure-power": { rest: "short", name: "Energía Pura" },
  simple: { rest: "short", name: "Simple" }
});

/** True si `abilityId` es un recurso de ABILITY_REST_RESOURCES y el Pokémon aún no lo ha gastado desde el último descanso que le corresponda. */
export function abilityRestUseAvailable(instance, abilityId) {
  if (!ABILITY_REST_RESOURCES[abilityId]) return false;
  return !(instance?.abilityUses ?? {})[abilityId];
}

/**
 * Instancia clonada con el uso de `abilityId` marcado como gastado, o la
 * misma instancia si `abilityId` no es un recurso de descanso conocido.
 * Función pura (no toca el Item Pokémon): quien llame decide cómo y cuándo
 * persistir el resultado con setFlag(), igual que el resto del motor.
 */
export function markAbilityRestUseSpent(instance, abilityId) {
  if (!ABILITY_REST_RESOURCES[abilityId]) return instance;
  // Copia superficial, no foundry.utils.deepClone(): esta función debe poder
  // probarse desde Node (validate-pokemon-abilities.mjs) sin `foundry`
  // definido, y `instance.abilityUses` es un mapa plano de booleanos, así que
  // no hace falta clonar en profundidad para no compartir referencia con el
  // original.
  return { ...(instance ?? {}), abilityUses: { ...(instance?.abilityUses ?? {}), [abilityId]: true } };
}

/**
 * `abilityUses` tras un descanso: limpia los recursos de descanso corto
 * siempre, y también los de descanso largo si `restType` es "long" (un
 * descanso largo incluye uno corto). Función pura para poder testearla sin
 * un Item real.
 */
export function abilityUsesAfterRest(abilityUses, restType) {
  const next = { ...(abilityUses ?? {}) };
  for (const [id, resource] of Object.entries(ABILITY_REST_RESOURCES)) {
    if (resource.rest === "short" || restType === "long") delete next[id];
  }
  return next;
}

/**
 * Restaura `instance.abilityUses` de todos los Pokémon de `actor` tras un
 * descanso (dnd5e.restCompleted, main.mjs). Hermana de
 * restoreHeldItemChargesAfterRest() (held-items.mjs) en vez de una
 * modificación de esa función, para no mezclar el vocabulario de "objeto
 * equipado" con el de "habilidad" en el mismo archivo.
 */
export async function resetAbilityRestResourcesAfterRest(actor, config = {}) {
  const restType = config.type === "long" ? "long" : config.type === "short" ? "short" : null;
  if (!restType) return 0;
  const pokemonItems = actor?.type === "character" ? getPokemonItems(actor) : [];
  let restored = 0;
  for (const pokemonItem of pokemonItems) {
    const instance = pokemonItem.getFlag(MODULE_ID, "instance") ?? {};
    const before = instance.abilityUses ?? {};
    if (!Object.keys(before).length) continue;
    const abilityUses = abilityUsesAfterRest(before, restType);
    if (Object.keys(abilityUses).length === Object.keys(before).length) continue;
    await pokemonItem.setFlag(MODULE_ID, "instance", { ...instance, abilityUses });
    restored += 1;
  }
  return restored;
}

/**
 * Lotes 44-49: familias de movimientos que el catálogo no etiqueta de forma
 * estructurada. Se mantienen como listas explícitas de ids, igual que
 * STRONG_JAW_MOVE_IDS, para no inferir reglas de palabras accidentales en la
 * descripción. Los nombres solo se usan para familias cuyo texto oficial sí
 * define literalmente Aura/Pulse.
 */
export const SOUND_MOVE_IDS = Object.freeze(new Set([
  "alluring-voice", "boomburst", "bug-buzz", "chatter", "clanging-scales",
  "clangorous-soul", "disarming-voice", "echoed-voice", "grass-whistle", "growl",
  "heal-bell", "howl", "hyper-voice", "metal-sound", "noble-roar", "overdrive",
  "parting-shot", "perish-song", "psychic-noise", "relic-song", "roar", "round",
  "screech", "sing", "snarl", "snore", "sonic-boom", "sparkling-aria",
  "supersonic", "torch-song", "uproar"
]));

export const WEATHER_DAMAGE_MOVE_IDS = Object.freeze(new Set([
  "blizzard", "hail", "sandstorm", "weather-ball"
]));

export const ABILITY_BREAKER_IDS = Object.freeze(new Set(["mold-breaker", "teravolt", "turboblaze"]));

/** True si el movimiento pertenece a la familia sonora compartida. */
export function isSoundMove(moveId, moveName = "") {
  return SOUND_MOVE_IDS.has(String(moveId ?? "").toLocaleLowerCase()) || /\b(sound|voice|song|roar)\b/i.test(moveName ?? "");
}

/** Rompemoldes/Teravolt/Turbollama ignoran habilidades defensivas del objetivo. */
export function abilitySuppressesTargetAbilities(abilities = []) {
  return (abilities ?? []).some(id => ABILITY_BREAKER_IDS.has(id));
}

/**
 * Inmunidades que dependen del movimiento completo y no de un tipo de daño:
 * Insonorizar, Humedad y Funda. Devuelve el id que bloquea para poder anunciarlo.
 */
export function abilityBlocksIncomingMove(abilities = [], { moveId = null, moveName = "" } = {}) {
  const known = abilities ?? [];
  const id = String(moveId ?? "").toLocaleLowerCase();
  if (known.includes("soundproof") && isSoundMove(id, moveName)) return "soundproof";
  if (known.includes("damp") && (id === "explosion" || id === "self-destruct")) return "damp";
  if (known.includes("overcoat") && WEATHER_DAMAGE_MOVE_IDS.has(id)) return "overcoat";
  return null;
}

/** Megadisparador: Aura/Pulse suma la competencia al daño. */
export function abilityMoveDamageBonus(abilities = [], { moveName = "", proficiency = 0 } = {}) {
  if (!(abilities ?? []).includes("mega-launcher")) return 0;
  return /\b(aura|pulse)\b/i.test(moveName ?? "") ? Number(proficiency) || 0 : 0;
}

/** Garra Dura concede STAB a cualquier ataque cuerpo a cuerpo. */
export function abilityForcesMoveStab(abilities = [], isMelee = false) {
  return Boolean(isMelee && (abilities ?? []).includes("tough-claws"));
}

/**
 * Bonos adicionales de STAB: Garra Dura lo duplica si ya era natural y Punk
 * Rock concede STAB a movimientos sonoros.
 */
export function abilityMoveStabBonus(abilities = [], { moveId = null, moveName = "", moveType = null, speciesTypes = [], isMelee = false } = {}) {
  const known = abilities ?? [];
  let bonus = 0;
  if (known.includes("tough-claws") && isMelee && (speciesTypes ?? []).includes(moveType)) bonus += 2;
  if (known.includes("punk-rock") && isSoundMove(moveId, moveName) && !(speciesTypes ?? []).includes(moveType)) bonus += 2;
  return bonus;
}

/**
 * Multiplicador previo a resistencias del objetivo. Lente Teñida compensa la
 * resistencia (x2 antes del x0.5 de D&D); Peluche y Punk Rock reducen a la
 * mitad las familias que describen.
 */
export function abilityTargetDamageDiceMultiplier(sourceAbilities = [], targetAbilities = [], {
  moveId = null, moveName = "", moveType = null, isMelee = false, targetResists = false
} = {}) {
  const source = sourceAbilities ?? [];
  const target = targetAbilities ?? [];
  let multiplier = 1;
  if (source.includes("tinted-lens") && targetResists) multiplier *= 2;
  if (target.includes("fluffy") && isMelee && moveType !== "fire") multiplier *= 0.5;
  if (target.includes("punk-rock") && isSoundMove(moveId, moveName)) multiplier *= 0.5;
  return multiplier;
}

/** Armadura Prisma tira dos veces y usa el menor al sufrir daño vulnerable. */
export function abilityRollsVulnerableDamageTwiceLower(abilities = [], vulnerable = false) {
  return Boolean(vulnerable && (abilities ?? []).includes("prism-armor"));
}

/** Presión hace gastar 2 PP a un movimiento dirigido directamente contra ella. */
export function abilityMovePpCost(targetAbilities = [], directlyTargeted = false) {
  return directlyTargeted && (targetAbilities ?? []).includes("pressure") ? 2 : 1;
}

/** Encadenado garantiza al menos un golpe adicional en las cadenas compatibles. */
export function abilityMinimumChainExtraHits(abilities = [], moveId = null) {
  return (abilities ?? []).includes("skill-link") && moveId ? 1 : 0;
}

/** Papel Fino fija los PG máximos y actuales a 1 (regla exclusiva de Shedinja). */
export function abilityMaximumHp(abilities = [], normalMaximum = 1) {
  return (abilities ?? []).includes("paper-thin") ? 1 : Math.max(1, Number(normalMaximum) || 1);
}

/** Corrosión ignora la inmunidad por tipo Veneno/Acero al envenenar. */
export function abilityIgnoresPoisonStatusTypeImmunity(abilities = [], statusId = null) {
  return (abilities ?? []).includes("corrosion") && ["poisoned", "badly-poisoned"].includes(statusId);
}

/** Piel Milagro da ventaja contra las cuatro familias de estado indicadas. */
export function abilityGrantsStatusSaveAdvantage(abilities = [], statusIds = []) {
  const known = abilities ?? [];
  const ids = statusIds ?? [];
  if (!known.includes("wonder-skin")) return false;
  return ids.some(id => ["burned", "frozen", "poisoned", "badly-poisoned", "paralyzed"].includes(id));
}

/** Gula obliga a consumir la baya curativa al cruzar la mitad de PG. */
export function abilityAutoConsumesHealingBerry(abilities = []) {
  return (abilities ?? []).includes("gluttony");
}

/** Filtro puede neutralizar el multiplicador de una vulnerabilidad con 4 en 1d4. */
export function abilityVulnerabilityFilter(abilities = [], vulnerable = false) {
  return vulnerable && (abilities ?? []).includes("filter") ? { die: 4, on: 4, multiplier: 0.5 } : null;
}

/** Intrépido/Mente aguda permiten que Normal y Lucha atraviesen inmunidad. */
export function abilityIgnoresNormalFightingImmunity(abilities = [], moveType = null) {
  return ["normal", "fighting"].includes(moveType) && (abilities ?? []).some(id => id === "scrappy" || id === "minds-eye");
}

/** Rompemoldes y equivalentes atraviesan una inmunidad aportada por habilidad. */
export function abilityIgnoresAbilityDamageImmunity(sourceAbilities = [], targetAbilities = [], moveType = null) {
  if (!abilitySuppressesTargetAbilities(sourceAbilities)) return false;
  return Boolean(abilityDamageImmunity(targetAbilities, moveType));
}

/** Señor Supremo: +1 a impactar por aliado debilitado, hasta +5. */
export function abilityFaintedAllyAttackBonus(abilities = [], faintedAllies = 0) {
  return (abilities ?? []).includes("supreme-overlord") ? Math.min(5, Math.max(0, Number(faintedAllies) || 0)) : 0;
}

/** Inicio Lento permanece activo durante las dos primeras rondas desde despliegue. */
export function abilitySlowStartActive(abilities = [], deployedRound = 0, currentRound = 0) {
  return (abilities ?? []).includes("slow-start") && Math.max(0, Number(currentRound) - Number(deployedRound)) < 2;
}

/** Tipo temporal que adopta el usuario al ejecutar un movimiento. */
export function abilityMoveUserTypeChange(abilities = [], moveType = null) {
  return moveType && (abilities ?? []).some(id => id === "protean" || id === "libero") ? moveType : null;
}

/** Tipo temporal que adopta el defensor tras recibir daño (Cambio Color). */
export function abilityReceivedDamageTypeChange(abilities = [], damageType = null) {
  return damageType && damageType !== "typeless" && (abilities ?? []).includes("color-change") ? damageType : null;
}

/**
 * Respondón invierte cambios numéricos de estadísticas y Sacapecho impide
 * que una reducción alcance la CA. Se aplica al objeto de modificadores antes
 * de construir el ActiveEffect, por lo que cubre todo el catálogo presente y
 * cualquier movimiento futuro que use el mismo motor.
 */
export function abilityAdjustedMoveModifiers(abilities = [], modifiers = {}) {
  const known = abilities ?? [];
  const adjusted = globalThis.foundry?.utils?.deepClone
    ? foundry.utils.deepClone(modifiers ?? {})
    : structuredClone(modifiers ?? {});
  if (known.includes("contrary")) {
    for (const key of ["ac", "attack", "damage", "speed"]) {
      if (typeof adjusted[key] === "number") adjusted[key] *= -1;
    }
    for (const group of ["abilities", "saves"]) {
      if (!adjusted[group]) continue;
      adjusted[group] = Object.fromEntries(Object.entries(adjusted[group]).map(([key, value]) => [key, -Number(value)]));
    }
  }
  if (known.includes("big-pecks") && Number(adjusted.ac) < 0) adjusted.ac = 0;
  return adjusted;
}

/** Potencia Bruta dobla MOVE y suprime el efecto secundario del golpe. */
export function abilitySheerForceProfile(abilities = [], { damaging = false, hasSecondaryEffect = false } = {}) {
  const active = Boolean(damaging && hasSecondaryEffect && (abilities ?? []).includes("sheer-force"));
  return { moveModifierMultiplier: active ? 2 : 1, suppressSecondaryEffect: active };
}

/** Francotirador convierte cada término de dados del crítico en tres veces sus dados. */
export function abilityCriticalDamageProfile(abilities = [], formula = "", critical = false, systemHandlesCritical = true) {
  if (!critical) return { formula, systemCritical: false, multiplier: 1 };
  const multiplier = (abilities ?? []).includes("sniper") ? 3 : 2;
  if (systemHandlesCritical && multiplier === 2) return { formula, systemCritical: true, multiplier };
  const multiplied = String(formula).replace(/\b(\d*)d(\d+)\b/gi, (_match, count, faces) => `${(Number(count) || 1) * multiplier}d${faces}`);
  return { formula: multiplied, systemCritical: false, multiplier };
}

const SURGE_BONUS_ACTION_MOVES = Object.freeze({
  "electric-surge": "electric-terrain", "grassy-surge": "grassy-terrain",
  "misty-surge": "misty-terrain", "psychic-surge": "psychic-terrain"
});

/** Cambia el tiempo mostrado/empleado por habilidades que aceleran movimientos. */
export function abilityMoveActivationTime(abilities = [], { moveId = null, time = null, healing = false } = {}) {
  const known = abilities ?? [];
  if (known.includes("triage") && healing) return "1 bonus action";
  if (known.some(id => SURGE_BONUS_ACTION_MOVES[id] === moveId)) return "1 bonus action";
  return time;
}

/** Dinamo duplica el modificador MOVE de la siguiente fuente Eléctrica cargada. */
export function abilityTriggeredMoveModifierMultiplier(abilities = [], triggers = {}, moveType = null) {
  return moveType === "electric" && (abilities ?? []).includes("electromorphosis") && triggers?.electromorphosis ? 2 : 1;
}

/**
 * Cambia solo el actor temporal de combate: tipos, afinidades y rótulo. El
 * Item Pokémon no se modifica, por lo que retirar al Pokémon revierte el cambio.
 */
export async function applyCombatAbilityTypeChange(actor, abilities = [], type = null, sourceName = "") {
  if (!actor || !POKEMON_DAMAGE_TYPES.includes(type)) return false;
  const traits = damageTraitsForPokemonTypes([type]);
  applyAbilityDefenses(traits, abilities);
  await actor.update({
    "system.traits.dr": traits.dr,
    "system.traits.dv": traits.dv,
    "system.traits.di": traits.di,
    "system.details.type.custom": `Pokémon (${typeLabel(type)})`,
    [`flags.${MODULE_ID}.pokemonTypes`]: [type]
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dnd5e chat-card poke5e-status-card"><p><strong>${actor.name}</strong> cambia temporalmente a tipo <strong>${typeLabel(type)}</strong>${sourceName ? ` por ${sourceName}` : ""}.</p></div>`
  });
  return true;
}
