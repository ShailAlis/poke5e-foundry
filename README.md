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

- Ficha de Entrenador Pokémon personalizada, registrada automáticamente como ficha predeterminada para los personajes.
- Pestaña **Equipo Pokémon** dentro de la ficha: muestra los seis huecos, abre cada Pokémon con un clic y permite añadir, desplegar, retirar o gestionar el equipo sin tapar las características.
- Modo oscuro inspirado en poke5e.app, configurable por cada usuario desde los ajustes o la propia pestaña de equipo.
- Buscador de especies con filtros por tipo, rango de SR/CR y nivel mínimo, además de distintas ordenaciones.
- Ficha Pokédex para cada Pokémon individual.
- Gestor de movimientos por especie: distingue ataques disponibles, futuros, aprendibles mediante MT o huevo e incompatibles, y bloquea aprendizajes no válidos.
- Tiradas de ataque y daño, cálculo de MOVE, CD y consumo/restauración de PP.
- Los 18 tipos de daño Pokémon se integran en D&D 5e sin eliminar sus tipos habituales. Las tiradas Pokémon usan el flujo de daño de D&D y aplican automáticamente resistencias, vulnerabilidades e inmunidades a los actores desplegados.
- Cada Pokémon conserva un sexo generado según la proporción F:M de su especie y muestra sus posibles evoluciones con sus niveles y demás condiciones.
- Contador de experiencia acumulada, subida automática de nivel, recompensa por derrota y evolución guiada desde la ficha Pokémon.
- Generador de encuentros exclusivo del director con filtros por bioma, región, tipo, SR y nivel, generación por objetivo de PX y despliegue de salvajes temporales.
- Sistema de captura con alcance, límite de nivel, CD por SR/nivel/PG, ventaja por estados y efectos de las distintas Poké Balls. Al capturarlo, el salvaje conserva sus datos y pasa al equipo o a la reserva.
- Interfaz en español e inglés.
- Acceso directo a todas las secciones de reglas de poke5e.app.

## Instalación manual o para desarrollo

1. Copia toda esta carpeta dentro de `Data/modules/poke5e-foundry`.
2. Activa **Pokémon 5e for Foundry VTT** en un mundo que use D&D 5e.
3. Abre **Ajustes del juego → Configurar ajustes → Pokémon 5e → Importar contenido** y crea los compendios.
4. Abre **Pokémon 5e — Clases y progresión** y arrastra **Entrenador** a una ficha de personaje.
5. Abre la pestaña **Equipo Pokémon** de esa ficha.
6. Añade especies con el buscador o arrastrándolas desde **Pokémon 5e — Especies**.

Los sprites y retratos se cargan desde `poke5e.app` para que la instalación y las actualizaciones sean rápidas; su URL base puede cambiarse en los ajustes del mundo. Al actualizar desde una versión anterior, las imágenes guardadas en las fichas se migran automáticamente y los compendios se actualizan al volver a ejecutar el importador.

## API para macros

```js
game.poke5e.openTeam(canvas.tokens.controlled[0]?.actor)
game.poke5e.openImporter()
game.poke5e.openReference()
game.poke5e.openEncounterBuilder()
game.poke5e.captureTarget(canvas.tokens.controlled[0]?.actor)
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

## Desarrollo

Los JSON de `data/` se generan a partir de `../static/data`. Ejecuta `node scripts/sync-data.mjs` desde esta carpeta después de actualizar los datos del sitio. Después ejecuta `npm run check`.

Este proyecto es contenido fan no oficial. Pokémon pertenece a Nintendo, Game Freak y The Pokémon Company; Dungeons & Dragons pertenece a Wizards of the Coast.
