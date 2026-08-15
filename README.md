# Pokémon 5e for Foundry VTT

Módulo de contenido para **Foundry VTT 13/14** y **D&D 5e 5.3 o posterior**. Reutiliza los datos de [poke5e.app](https://poke5e.app) y los convierte en documentos de mundo de Foundry.

## Instalación y actualizaciones automáticas

En la pantalla de configuración de Foundry abre **Módulos adicionales → Instalar módulo**, pega esta URL en **URL del manifiesto** y pulsa **Instalar**:

```text
https://github.com/ShailAlis/poke5e-foundry/releases/latest/download/module.json
```

Las versiones posteriores aparecerán al usar **Comprobar actualización** o **Actualizar todo** desde la interfaz de Foundry.

## Modelo de contenido

- Las especies, movimientos, habilidades, objetos y la progresión de Entrenador se guardan en **compendios de mundo editables**.
- **Entrenador** es una clase nativa de D&D 5e. Al arrastrarla a un personaje, el sistema gestiona sus PG y concede sus rasgos mediante avances por nivel.
- Cada Pokémon capturado es un **Item embebido en su entrenador**. Conserva apodo, nivel, PG, PP, naturaleza, estado, movimientos y habilidades propios.
- El equipo activo admite seis Pokémon; el resto queda en la reserva del mismo entrenador.
- Arrastrar una especie desde el compendio a un actor de personaje la convierte automáticamente en un Pokémon individual.
- Los objetos se arrastran desde su compendio al inventario normal del entrenador.
- Al sacar un Pokémon al mapa se crea un actor de combate temporal. Sus PG se sincronizan con la ficha del entrenador y se elimina al retirarlo.

## Funciones

- Flujo guiado al crear un personaje: fija la especie **Humano** y aplica origen regional, bonificaciones, feat, idiomas, competencias, especialización, equipo inicial y Pokémon inicial con sus elecciones válidas.
- Las fichas de personaje rechazan especies distintas de Humano. Los actores antiguos no se modifican automáticamente.
- Ficha de Entrenador Pokémon personalizada, registrada automáticamente como ficha predeterminada para los personajes.
- Pestaña **Equipo Pokémon** dentro de la ficha: muestra los seis huecos, abre cada Pokémon con un clic y permite añadir, desplegar, retirar o gestionar el equipo sin tapar las características.
- Modo oscuro inspirado en poke5e.app, configurable por cada usuario desde los ajustes o la propia pestaña de equipo.
- Buscador de especies con filtros por tipo, rango de SR/CR y nivel mínimo, además de distintas ordenaciones.
- Ficha Pokédex para cada Pokémon individual.
- Gestor de movimientos por especie: distingue ataques disponibles, futuros, aprendibles mediante MT o huevo e incompatibles, y bloquea aprendizajes no válidos.
- Selector Combate/Concurso en cada ficha Pokémon, con categoría, Appeal, Jam, compatibilidad, efectos y tiradas contra la CD del juez.
- Tiradas de ataque y daño, cálculo de MOVE, CD y consumo/restauración de PP.
- Objetos equipados con reglas automáticas basadas en poke5e.app: curación y estados mediante bayas con confirmación, cargas y descansos, Banda Focus, Globo Helio, Mineral Evolutivo, modificadores de movimiento y efectos de fin de turno. Los objetos sin una resolución automática compatible siguen pudiendo equiparse y usarse como referencia.
- Los 18 tipos de daño Pokémon se integran en D&D 5e sin eliminar sus tipos habituales. Las tiradas Pokémon usan el flujo de daño de D&D y aplican automáticamente resistencias, vulnerabilidades e inmunidades a los actores desplegados.
- Efectos mantenidos de movimientos: daño y curación por turno, agarres y miedo con salvaciones repetidas, duración, concentración, iconos de token y limpieza automática al terminar el combate.
- Iconos personalizados opcionales para estados, mejoras y debilitaciones: basta con copiar los PNG en `assets/icons/effects/`; el módulo los detecta al iniciar y conserva los iconos de Foundry como respaldo.
- Motor de modificadores de movimientos: aplica sobre los tokens bonificadores y penalizadores de ataque, CA, daño, salvaciones, características y velocidad, con duración, concentración y acumulación según cada movimiento.
- Cada Pokémon conserva un sexo generado según la proporción F:M de su especie y muestra sus posibles evoluciones con sus niveles y demás condiciones.
- Contador de experiencia acumulada, subida automática de nivel y avances guiados de Pokémon: PG, mejoras de característica o dotes, nuevos tramos de movimientos, aumentos de daño y Poder Máximo.
- Generador de encuentros exclusivo del director con filtros por bioma, región, tipo, SR y nivel, generación por objetivo de PX y despliegue de salvajes temporales.
- Generador de Entrenadores NPC exclusivo del director: crea rivales o aliados humanos con nivel, origen, especialización, 20 arquetipos, dificultad, inventario, permisos, token y equipos Pokémon totalmente configurables o aleatorios.
- Sistema de captura con alcance, límite de nivel, CD por SR/nivel/PG, ventaja por estados y efectos de las distintas Poké Balls. Al capturarlo, el salvaje conserva sus datos y pasa al equipo o a la reserva.
- Interfaz en español e inglés.
- Acceso directo a todas las secciones de reglas de poke5e.app.

## Instalación manual o para desarrollo

1. Copia toda esta carpeta dentro de `Data/modules/poke5e-foundry`.
2. Activa **Pokémon 5e for Foundry VTT** en un mundo que use D&D 5e.
3. Abre **Ajustes del juego → Configurar ajustes → Pokémon 5e → Importar contenido** y crea los compendios.
4. Crea un actor de tipo **Personaje** y completa el asistente de Entrenador que se abrirá automáticamente.
5. Abre la pestaña **Equipo Pokémon** de esa ficha.
6. Añade especies con el buscador o arrastrándolas desde **Pokémon 5e — Especies**.

Los sprites y retratos se cargan desde `poke5e.app` para que la instalación y las actualizaciones sean rápidas; su URL base puede cambiarse en los ajustes del mundo. Al actualizar desde una versión anterior, las imágenes guardadas en las fichas se migran automáticamente y los compendios se actualizan al volver a ejecutar el importador.

## API para macros

```js
game.poke5e.openTeam(canvas.tokens.controlled[0]?.actor)
game.poke5e.openImporter()
game.poke5e.openReference()
game.poke5e.openEncounterBuilder()
game.poke5e.openNpcTrainerGenerator()
game.poke5e.captureTarget(canvas.tokens.controlled[0]?.actor)
game.poke5e.createTrainer(canvas.tokens.controlled[0]?.actor)
```

## Actualización desde 0.1

La versión 0.2 deja de crear especies como actores permanentes. Los actores generados por la versión 0.1 no se eliminan automáticamente para evitar pérdida de datos; el GM puede borrarlos después de comprobar los nuevos compendios.

## Actualización desde 0.2

La versión 0.3 añade **Entrenador** como clase real de D&D 5e. Después de actualizar el módulo, vuelve a ejecutar **Gestionar compendios** con la opción **Clase de Entrenador** marcada para crear el nuevo compendio de progresión.

La versión 0.4 añade un acceso permanente al equipo dentro de la ficha del personaje. No es necesario volver a importar los compendios para activar esta mejora visual.

La versión 0.5 sustituye esa franja por una ficha personalizada de Entrenador con una pestaña de equipo propia. También deja de crear el personaje de ejemplo al importar: cualquier personaje nuevo usa la ficha adecuada automáticamente. Los personajes de ejemplo existentes no se borran para evitar pérdidas de datos.

La versión 0.6 corrige la visibilidad de la pestaña de equipo para que solo aparezca al seleccionarla, incorpora el modo oscuro y amplía el buscador Pokémon con filtros y ordenación.

La versión 0.6.1 corrige el desplazamiento de la lista de resultados del buscador Pokémon, manteniendo visibles la búsqueda y los filtros.

La versión 0.7 añade a cada ficha Pokémon un gestor de movimientos basado en la especie y el nivel actual. También valida los movimientos arrastrados desde el compendio y conserva cualquier movimiento antiguo para evitar pérdida de datos.

## Actualización a 1.0

La versión 1.0 incorpora el sistema de combate por tipos. Los Pokémon ya guardados que todavía no tengan sexo recibirán uno automáticamente al abrir el mundo. Los actores de combate activos actualizarán sus resistencias, vulnerabilidades e inmunidades; al volver a desplegarlos también se generarán siempre con estos datos. Para actualizar las descripciones de los compendios con evoluciones y afinidades, vuelve a ejecutar **Gestionar compendios** con la opción de especies marcada.

## Actualización a 1.1

La versión 1.1 incorpora experiencia y evolución, el generador de encuentros salvajes y el sistema de captura. Para capturar, añade Poké Balls desde el compendio de objetos al inventario del entrenador, selecciona como objetivo un token salvaje y pulsa **Capturar objetivo** en la pestaña o gestor de equipo. Los actores salvajes se eliminan automáticamente después de una captura o al borrar su último token.

## Actualización a 1.4

La versión 1.4 añade el modo **Concurso** a las fichas Pokémon. El selector Combate/Concurso cambia la presentación de los movimientos y permite elegir la categoría actual, consultar Appeal, Jam, compatibilidad y efectos, y realizar pruebas contra la CD del juez. Los movimientos aún no definidos por las reglas originales muestran una alternativa sugerida basada en su tipo.

## Actualización a 1.7

La versión 1.7 incorpora un motor de efectos mantenidos ligado a los turnos de combate. Automatiza Drenadoras, Giro Fuego, Acoso, Acua Aro, Arraigo, Cura Salina y Maldición, además de los agarres, jaulas y efectos de miedo con salvación repetida. Los efectos aparecen en el token y en la ficha Pokédex; la concentración se comprueba al recibir daño y los efectos se limpian al expirar, retirarse o terminar el combate.

La versión 1.7.1 corrige el registro de Quemado, Congelado, Paralizado, Envenenado y los demás estados Pokémon después de la inicialización de D&D 5e. También repara automáticamente las etiquetas e identificadores de efectos creados por versiones anteriores, sin confundirlos con el indicador independiente Bloodied.

La versión 1.7.2 prepara carpetas separadas para iconos de estados, mejoras y debilitaciones. Los archivos PNG con los nombres documentados se detectan automáticamente al abrir el mundo y actualizan tanto efectos nuevos como efectos activos de versiones anteriores.

## Actualización a 1.8

La versión 1.8 audita los 830 movimientos e incorpora 115 reglas explícitas de modificadores, además de ampliar los casos de estado que no podían deducirse con seguridad desde el texto. Growl, Leer, Tail Whip, Mud-Slap y efectos equivalentes respetan ahora sus acumulaciones; los buffs, debuffs, cargas y áreas persistentes aparecen sobre el token y en la ficha Pokédex. Las carpetas documentan 146 iconos PNG opcionales.

La versión 1.8.1 incorpora avances para Entrenadores y Pokémon, reacciones y efectos de objetos equipados, cambio de idioma con recarga coherente, aprendizaje mediante MT/MO condicionado por el inventario y una economía unificada en Pokédólares.

La versión 1.8.2 añade una sección propia para los Pokémon en la ficha de Entrenador y clasifica correctamente como rasgos de clase las capacidades concedidas por Entrenador, incluyendo la migración de actores existentes.

## Actualización a 1.2

La versión 1.2 incorpora el asistente guiado de creación de Entrenadores. Los personajes nuevos quedan limitados a la especie Humano y reciben automáticamente su origen regional, bonificaciones, competencias, dote, especialización, equipo inicial y Pokémon inicial. Los personajes existentes no se modifican automáticamente.

## Estructura del código

Todo el código vive en `scripts/`, en módulos ES sin paso de build. Cada archivo lleva un comentario de cabecera con su rol y con qué otros archivos se relaciona, y cada función (exportada o privada) tiene su propio comentario JSDoc — abre el archivo y usa el buscador del editor si necesitas más detalle que el de esta tabla.

La arquitectura tiene cuatro capas, de abajo arriba:

1. **Núcleo** (`model.mjs`, `data-service.mjs`) — convierte los JSON de `data/` en documentos de Foundry y los cachea.
2. **Reglas** (`combat.mjs`, `progression.mjs`, `capture-rules.mjs`, `move-learning.mjs`, `contests.mjs`, `status-effects.mjs`, `held-items.mjs`, `encounter-generator.mjs`, `npc-trainer-rules.mjs`, `trainer-creation-data.mjs`) — cálculos puros, casi sin depender de los globales de Foundry; son los que verifican los `validate-*.mjs` en Node.
3. **Documentos y mapa** (`deployment.mjs`, `wild-deployment.mjs`, `capture.mjs`) — traducen Pokémon entre Item embebido, actor temporal y token.
4. **Interfaz** (fichas, generadores, asistente, importador) — presenta las reglas y escribe el resultado en `flags.<módulo>.instance`.

`main.mjs` no está en ninguna capa: es el punto de entrada que engancha los hooks de Foundry y conecta unas con otras.

### Índice por archivo

| Archivo | Qué hace | Funciones/clases clave |
|---|---|---|
| `model.mjs` | Fuentes de Item para el compendio y para un Pokémon individual; clase Entrenador; utilidades de URL de recursos. | `speciesItemSource`, `pokemonItemSourceFromSpecies`, `trainerClassSource`, `getPokemonItems`, `trainerPokeslotLimit`, `displayPokemonName`, `portraitUrl` |
| `data-service.mjs` | Carga y cachea el catálogo JSON por idioma, con traducciones y datos de concurso ya fusionados. | `loadPoke5eData` |
| `main.mjs` | Hooks de Foundry, ajustes del mundo, menús y la API `game.poke5e`. | hooks `init`/`ready`/`preCreateItem`/`updateActor`/`updateItem` |
| `combat.mjs` | Tabla de tipos Pokémon y su integración como tipos de daño de D&D 5e. | `pokemonDefenses`, `damageTraitsForPokemonTypes`, `typeLabel`, `registerPokemonDamageTypes` |
| `progression.mjs` | Experiencia, beneficios por nivel, recompensa por derrota y disponibilidad de evolución. | `experienceAtLevel`, `pokemonAdvancementsBetween`, `evolutionStageCount`, `experienceAward`, `evolutionReadiness` |
| `pokemon-advancement.mjs` | Diálogo y persistencia de los avances pendientes al subir un Pokémon de nivel. | `applyPendingPokemonAdvancements`, `hasPendingPokemonAdvancements` |
| `capture-rules.mjs` | Cálculo de la CD de captura y efecto de cada Poké Ball. | `captureDifficulty`, `pokeballAdjustment`, `captureHasAdvantage` |
| `move-learning.mjs` | Qué movimientos puede aprender una especie, por qué vía y cuándo. | `moveEligibility`, `filterMoveCatalog`, `applyLearnedMove` |
| `contests.mjs` | Categorías de concurso, compatibilidad y puntuación de una prueba de Appeal. | `contestDetailsForMove`, `contestCompatibility`, `contestAppealOutcome` |
| `status-effects.mjs` | Catálogo de estados alterados, deducción desde el texto de un movimiento y su aplicación vía socket. | `POKEMON_STATUS_EFFECTS`, `inferMoveStatusEffects`, `applyMoveStatuses`, `pokemonStatusEffectSource` |
| `held-items.mjs` | Reglas y resolución de objetos equipados: bayas, cargas, descansos, modificadores, reacciones y efectos de turno. | `heldItemHpResolution`, `heldItemMoveModifiers`, `activateHeldItem`, `restoreHeldItemChargesAfterRest` |
| `ongoing-effects.mjs` | Efectos mantenidos ligados a turnos, concentración, salvaciones repetidas, daño y curación periódicos. | `ONGOING_MOVE_EFFECTS`, `applyMoveOngoingEffects`, `registerOngoingMoveEffects` |
| `deployment.mjs` | Saca al mapa un Pokémon del equipo (actor temporal + token) y sincroniza sus PG. | `deployPokemon`, `recallPokemon`, `syncDeploymentHp`, `isAllowedDeployment` |
| `wild-deployment.mjs` | Igual que `deployment.mjs` pero para Pokémon salvajes, sin entrenador detrás. | `deployWildPokemon`, `wildActorSource` |
| `capture.mjs` | Flujo completo de captura: alcance, inventario, tirada y traspaso al entrenador. | `attemptCapture`, `completeCapture` |
| `pokemon-sheet.mjs` | Ficha Pokédex: movimientos, tiradas de ataque/daño, modo Concurso, experiencia, evolución, objeto equipado. Es el archivo más grande del módulo. | `Poke5ePokemonSheet`, `damageFormula`, `getMoveModifier` |
| `pokemon-actor-sheet.mjs` | Redirige la ficha de los actores del mapa a `pokemon-sheet.mjs`. | `Poke5eCombatPokemonActorSheet`, `migratePokemonActorSheets` |
| `trainer-actor-sheet.mjs` | Ficha de personaje con la pestaña "Equipo Pokémon" añadida. | `Poke5eTrainerActorSheet` |
| `trainer-team.mjs` | Ventana independiente de gestión de equipo (misma función que la pestaña, en un diálogo aparte). | `Poke5eTrainerTeam` |
| `species-browser.mjs` | Buscador de especies para añadir Pokémon a un entrenador. | `Poke5eSpeciesBrowser` |
| `reference.mjs` | Ventana de enlaces a las reglas de poke5e.app. | `Poke5eReference` |
| `encounter-generator.mjs` | Filtrado, sorteo y construcción de instancia de un encuentro salvaje. | `generateEncounter`, `buildWildInstance`, `adjustedHitPoints` |
| `encounter-builder.mjs` | Interfaz del generador de encuentros. | `Poke5eEncounterBuilder` |
| `npc-trainer-rules.mjs` | Arquetipos, dificultades, caminos y sorteo del equipo de un NPC. | `NPC_ARCHETYPES`, `NPC_DIFFICULTIES`, `generateNpcTrainerTeam`, `filterNpcTrainerSpecies`, `trainerControlSr` |
| `npc-trainer-actor.mjs` | Convierte la configuración del generador en el actor completo de un NPC. | `createNpcTrainerActor`, `placeNpcTrainer` |
| `npc-trainer-generator.mjs` | Interfaz del generador de Entrenadores NPC. | `Poke5eNpcTrainerGenerator` |
| `trainer-creator.mjs` | Asistente guiado de creación de Entrenador (jugador). | `Poke5eTrainerCreator`, `applyTrainerCreation`, `isHumanSpecies` |
| `trainer-creation-data.mjs` | Catálogos y validación compartidos por el asistente y el generador de NPC: características, orígenes, especializaciones. | `ORIGINS`, `SPECIALIZATIONS`, `resolveTrainerCreation`, `resolveBaseAbilities` |
| `importer.mjs` | Crea/actualiza los compendios de mundo de forma idempotente. | `Poke5eImporter`, `upsertPackItems` |
| `sync-data.mjs` | Script de desarrollo: copia los datos de `../static` a `data/`. No se ejecuta en Foundry. | — |
| `validate-*.mjs` (12 archivos) | Uno por cada módulo de reglas; los ejecuta `npm run check` en Node, sin necesidad de Foundry. | — |

### Cómo encontrar...

| Quiero cambiar... | Empieza en |
|---|---|
| La tabla de efectividad de tipos | `combat.mjs` → `TYPE_CHART`, `pokemonDefenses` |
| Cómo se calcula el daño o el MOVE de un movimiento | `pokemon-sheet.mjs` → `damageFormula`, `getMoveModifier` |
| Los niveles de experiencia o la recompensa por derrota | `progression.mjs` → `EXPERIENCE_BY_LEVEL`, `experienceAward` |
| La dificultad o el efecto de una Poké Ball | `capture-rules.mjs` → `pokeballAdjustment`, `captureDifficulty` |
| Qué estados provoca un movimiento y cómo se detectan | `status-effects.mjs` → `inferMoveStatusEffects`, `MANUAL_STATUS_MOVES` |
| Qué hace un objeto equipado y cuándo se activa | `held-items.mjs` → `heldItemHpResolution`, `heldItemMoveModifiers`, `activateHeldItem` |
| Cuándo puede aprenderse un movimiento | `move-learning.mjs` → `moveEligibility` |
| La puntuación de una prueba de concurso | `contests.mjs` → `contestAppealOutcome` |
| Los Pokéslots por nivel de Entrenador | `model.mjs` → `trainerPokeslotsForLevel` |
| Los rasgos de la clase Entrenador por nivel | `model.mjs` → `TRAINER_FEATURES`, `trainerClassSource` |
| Los arquetipos, dificultades o composición de equipo de un NPC | `npc-trainer-rules.mjs` |
| Los orígenes regionales o especializaciones de Entrenador | `trainer-creation-data.mjs` → `ORIGINS`, `SPECIALIZATIONS` |
| Dónde y cómo puede desplegarse un Pokémon en el mapa | `deployment.mjs` → `isAllowedDeployment`, `chooseDeploymentPosition` |
| Un ajuste nuevo del módulo o un hook de Foundry | `main.mjs` → `Hooks.once("init", …)` |
| Una plantilla Handlebars | `templates/<nombre>.hbs`, referenciada en `static PARTS` de la clase de la ficha correspondiente |

## Desarrollo

Los JSON de `data/` se generan a partir de `../static/data`. Ejecuta `node scripts/sync-data.mjs` desde esta carpeta después de actualizar los datos del sitio. Después ejecuta `npm run check`.

Este proyecto es contenido fan no oficial. Pokémon pertenece a Nintendo, Game Freak y The Pokémon Company; Dungeons & Dragons pertenece a Wizards of the Coast.
