# Pokémon 5e para Foundry VTT

Módulo de contenido y automatización para jugar Pokémon 5e en **Foundry VTT 13 o 14** con **D&D 5e 5.3 o posterior**. Incluye especies, movimientos, habilidades, objetos, Entrenadores, encuentros, captura, concursos y herramientas de combate.

## Requisitos

- Foundry VTT 13 o 14.
- Sistema D&D 5e 5.3 o posterior.
- Un mundo configurado con D&D 5e.
- Permisos de director para importar contenido y utilizar los generadores.
- Conexión a Internet si se usa `poke5e.app` para sprites y retratos.

## Instalación

En la configuración de Foundry abre **Módulos adicionales → Instalar módulo**, introduce esta dirección en **URL del manifiesto** y pulsa **Instalar**:

```text
https://github.com/ShailAlis/poke5e-foundry/releases/latest/download/module.json
```

Activa después **Pokémon 5e for Foundry VTT** en un mundo de D&D 5e.

Para una instalación local, copia el repositorio en:

```text
Data/modules/poke5e-foundry
```

## Configuración inicial

1. Entra al mundo como director.
2. Abre **Ajustes del juego → Configurar ajustes → Pokémon 5e → Importar contenido**.
3. Selecciona los compendios que quieras crear o actualizar y ejecuta la importación.
4. Comprueba que estén disponibles los compendios de especies, movimientos, habilidades, objetos, dotes, estados y clase de Entrenador.
5. Configura el idioma de datos y la URL base de recursos si no quieres utilizar los valores predeterminados.

Volver a ejecutar el importador actualiza el contenido administrado por el módulo. Los compendios son documentos de mundo y pueden editarse después de importarlos.

## Ajustes del módulo

- **Idioma de datos:** utiliza los catálogos en español o inglés. Al cambiarlo, el cliente se recarga para que todas las ventanas usen la misma selección.
- **Modo oscuro:** ajuste individual para las fichas e interfaces del módulo.
- **URL base de recursos:** origen de sprites, retratos y otros recursos remotos. El valor predeterminado es `https://poke5e.app`.

## Crear un Entrenador jugador

1. Crea un actor de tipo **Personaje**.
2. Completa el asistente de Entrenador que se abre automáticamente.
3. Elige origen regional, bonificaciones, dote, idiomas, competencias, especialización, equipo y Pokémon inicial.
4. Abre la pestaña **Equipo Pokémon** para administrar el equipo.

Los personajes jugadores utilizan la especie Humano. La clase **Entrenador** es una clase nativa de D&D 5e y concede sus rasgos mediante advancements. En nivel 2, el avance de clase permite escoger un Camino de Entrenador.

La ficha de Entrenador utiliza una interfaz de Pokédex de dos paneles. Conserva las pestañas y acciones nativas de D&D 5e —tiradas, descansos, inventario, rasgos, conjuros, efectos y biografía— e incorpora **Equipo Pokémon** en el mismo dispositivo.

Todos los personajes controlados por jugadores se sincronizan automáticamente con la **Primary Party**. No es necesario crear ni mantener manualmente un actor de grupo.

### Experiencia y avance

La pestaña **Equipo Pokémon** muestra la experiencia, el nivel y el siguiente umbral del Entrenador.

- **Añadir XP** concede experiencia al personaje.
- **Avanzar Entrenador** aplica el siguiente nivel cuando se alcanza el umbral.
- Las elecciones de clase, características, dotes y Camino se presentan mediante el panel de advancements de D&D 5e.

La experiencia puede automatizarse a partir de las recompensas del grupo principal. El nivel no se aplica silenciosamente: el botón de avance permite resolver antes las elecciones reglamentarias.

## Administrar Pokémon

Cada Pokémon de un Entrenador es un Item embebido en su actor. Conserva de forma independiente:

- especie, apodo, sexo y variante shiny;
- nivel, experiencia, PG y características;
- movimientos, PP y habilidades;
- naturaleza, estados y objeto equipado;
- pertenencia al equipo activo o a la reserva.

El equipo activo admite hasta seis Pokémon. Para añadir uno puedes pulsar **Añadir Pokémon**, arrastrar una especie desde el compendio sobre el Entrenador o capturar un Pokémon salvaje.

Desde la pestaña de equipo puedes abrir su Pokédex, moverlo entre equipo y reserva, desplegarlo, retirarlo o eliminarlo del Entrenador.

### Experiencia, nivel y evolución

La ficha Pokédex permite conceder experiencia y muestra los avances pendientes. Al alcanzar un nuevo nivel, **Aplicar avances** resuelve los PG, mejoras de característica o dotes y los demás beneficios correspondientes.

Las evoluciones disponibles aparecen con sus condiciones. Las condiciones comprobables se validan automáticamente; las narrativas o dependientes del mundo requieren confirmación del usuario.

### Movimientos, MT y MO

El gestor de movimientos separa los movimientos conocidos, disponibles, futuros, de huevo e incompatibles.

- Un Pokémon puede conocer normalmente hasta cuatro movimientos.
- Un movimiento de MT o MO solo puede aprenderse si el Entrenador posee la máquina correspondiente en su inventario.
- Aprender mediante una máquina consume uno de sus usos cuando sus reglas así lo indiquen.
- Los PP se gastan al utilizar movimientos y pueden restaurarse desde la ficha o mediante objetos y descansos compatibles.

## Despliegue y combate

Al desplegar un Pokémon se crea un actor temporal enlazado con su Item. Su nombre combina el nombre del Pokémon y el del Entrenador. Los PG, estados y objetos relevantes se sincronizan entre el actor de combate y la ficha persistente.

Al retirarlo se conserva su información persistente, se limpian los efectos temporales y se elimina el actor cuando deja de tener tokens. Los actores Pokémon regresan a posición vertical al terminar su movimiento de token.

### Usar un movimiento

1. Despliega el Pokémon.
2. Selecciona los tokens objetivo con las herramientas normales de Foundry.
3. Abre su ficha Pokédex.
4. Pulsa **Usar movimiento**.
5. Aplica el daño desde la tarjeta de chat de D&D 5e cuando corresponda.

El módulo calcula ataque, CD, MOVE, STAB, daño, críticos, tipos, PP y modificadores aplicables. Los 18 tipos Pokémon están registrados como tipos de daño de D&D 5e y respetan resistencias, vulnerabilidades e inmunidades.

Cuando la regla dispone de automatización compatible también se gestionan:

- estados alterados y sus inmunidades;
- mejoras, reducciones y acumulaciones de características;
- efectos mantenidos, concentración y salvaciones repetidas;
- daño y curación de inicio o final de turno;
- retroceso, drenaje, multigolpe, recarga y movimientos de PG directo;
- escudos, cambios forzados e intercambio o destrucción de objetos;
- clima, terreno y otras reglas compartidas del campo;
- objetos equipados, bayas, cargas y reacciones;
- habilidades propias y auras de Pokémon.

La sección de habilidades indica si cada una es **Automática** o de **Resolución asistida**. Las asistidas incluyen un botón para publicar su texto en el chat. Actualmente 198 de las 330 habilidades del catálogo tienen una regla automática conectada al motor.

## Estados y modificadores manuales

El compendio **Estados y modificadores** contiene Active Effects listos para usar. El director puede arrastrar un estado o una etapa de característica directamente sobre un token Pokémon.

Los efectos activos aparecen sobre el token y en la Pokédex. Desde la ficha se pueden curar estados o terminar efectos mantenidos si el usuario tiene permisos suficientes.

## Objetos y economía

La economía utiliza exclusivamente **Pokédólares (₽)**. Los objetos se importan con sus precios Pokémon y se guardan en el inventario normal del Entrenador.

Para equipar un objeto, añádelo al inventario del Entrenador, abre la Pokédex y selecciónalo en **Equipar desde inventario**. Los objetos compatibles aplican sus bonificaciones, cargas, consumo, curación o reacciones automáticamente. El resto conserva su descripción para resolución manual.

## Captura

1. Añade Poké Balls al inventario del Entrenador.
2. Selecciona como objetivo un token salvaje.
3. Pulsa **Capturar objetivo** desde la pestaña de equipo.
4. Escoge la Poké Ball y resuelve la tirada.

La captura tiene en cuenta alcance, SR, nivel, PG actuales, estados, límites de control y efectos de la Poké Ball. Una captura correcta conserva los datos del salvaje y lo envía al equipo o a la reserva según el espacio disponible.

## Concursos

La Pokédex dispone de un selector **Combate / Concurso**. En modo Concurso puedes elegir la categoría actual, consultar Appeal, Jam, compatibilidad y efectos, y realizar la tirada del movimiento contra la CD del juez.

## Herramientas del director

### Importador

Crea y actualiza los compendios utilizados por el módulo. Se abre desde los ajustes o mediante `game.poke5e.openImporter()`.

### Referencia de reglas

Proporciona accesos a las secciones de reglas y a las herramientas principales del módulo.

### Generador de encuentros

Permite filtrar especies por bioma, región, tipo, SR y nivel, generar un encuentro para un objetivo de experiencia y desplegar sus Pokémon salvajes en la escena.

### Generador de Entrenadores NPC

Crea Entrenadores rivales o aliados con nivel, origen, arquetipo, dificultad, inventario, retrato, token, permisos y equipo Pokémon. Los NPC no utilizan especialización ni Camino de Entrenador: sus capacidades proceden del arquetipo elegido. El sprite se selecciona según el arquetipo y el género generado.

### Edición libre

El director puede editar un Pokémon sin las restricciones normales de aprendizaje: cambiar imagen, tipos, características, movimientos, habilidades, estados, efectos y objetos, incluidos movimientos que la especie no podría aprender normalmente.

## API para macros

```js
game.poke5e.openImporter()
game.poke5e.openReference()
game.poke5e.openEncounterBuilder()
game.poke5e.openNpcTrainerGenerator()
game.poke5e.openTeam(actor)
game.poke5e.openPokemon(document)
game.poke5e.captureTarget(actor)
game.poke5e.createTrainer(actor)
```

Ejemplo con el token controlado:

```js
const actor = canvas.tokens.controlled[0]?.actor;
game.poke5e.openTeam(actor);
```

## Recursos visuales

Los sprites y retratos se obtienen desde la URL base configurada. Los iconos personalizados de efectos son opcionales y se buscan dentro de:

```text
assets/icons/effects/statuses
assets/icons/effects/buffs
assets/icons/effects/debuffs
```

Si no existe un icono personalizado, se utiliza el icono de respaldo de Foundry.

## Desarrollo y validación

Instala Node.js y ejecuta desde la raíz del repositorio:

```bash
npm run check
```

La comprobación valida sintaxis, datos, localización, progresiones, movimientos, habilidades, objetos, encuentros, captura y combate.

```text
data/         Catálogos en inglés y español
lang/         Textos de interfaz de Foundry
scripts/      Reglas, fichas, generadores y validadores
styles/       Estilos del módulo
templates/    Plantillas Handlebars
assets/       Recursos gráficos locales
module.json   Manifiesto de Foundry
```

Los cambios en reglas deben acompañarse de una prueba o aserción en `scripts/validators/` y superar `npm run check` antes de publicarse.

## Resolución de problemas

- **No aparecen los compendios:** vuelve a ejecutar **Importar contenido** como director.
- **Las imágenes no cargan:** revisa la URL base de recursos y la conexión del servidor.
- **Un movimiento de MT/MO no aparece disponible:** comprueba que el Entrenador posea la máquina exacta y que le queden usos.
- **No aparece el botón de avance:** comprueba que la experiencia alcance el siguiente umbral y que el actor tenga la clase Entrenador importada.
- **Una habilidad no aplica efectos por sí sola:** revisa su indicador; si figura como resolución asistida, publícala en el chat y resuélvela con el director.
- **El idioma está mezclado:** cambia el idioma de datos desde los ajustes y deja que el cliente se recargue.
