# Plan de recorrido para la fase de revisión

Este plan se activa al pasar a revisión funcional o cuando el usuario pide un
recorrido. No impone pruebas de navegador durante la fase de portado por tandas.
Las reglas operativas vigentes están en [AGENTS.md](AGENTS.md).

Fecha: 2026-09-25. Punto de partida: `main` (82eda72), jugado en navegador
hasta la Ruta 3 (Brock vencido). Método del driver:
[guía técnica §6](docs/PORTING-GUIDE.md#6-cómo-se-prueba-y-valida).

## Idea

Este documento organiza el recorrido y su validación. Para acelerar la traducción
del decomp, usar [AGENTS.md](AGENTS.md):
también se portan bloques fuera de la ruta cuando sus dependencias están listas.
Las restricciones de alcance de este plan se aplican a las sesiones de recorrido.

Durante el recorrido, el juego decide qué se porta. Se juega la historia principal tramo a tramo; solo
se arregla o se porta lo que **bloquea** (cuelgue, excepción, guion que no
avanza, regla de juego mal) en ese tramo. Lo visual que no bloquea se anota en
una línea y se sigue. Cada tramo acaba con un punto de control guardado en el
repo, así cualquier agente puede empezar desde ahí.

## Proceso mínimo por tramo (repetir)

1. `H.restore(<tramo anterior>)`, `await H.init()`.
2. Jugar el tramo con el driver (`goto`/`exit`/`enter`/`talk`/`battle`/`heal`).
3. Si algo bloquea: función C → arreglo → `H.restore` → repetir el mismo punto.
4. Al terminar el tramo: `H.checkpoint(<tramo>)` y exportar la partida a
   `tools/playtest/saves/<tramo>.json` (ver "Primer paso").
5. Un commit por tramo: arreglos + actualizar la tabla de progreso de este plan
   (tramo, qué se jugó, fallos y commits, ayudas usadas) y el resumen operativo
   de PORTING-STATUS. `check:port`,
   `check:honesty`, `build`. El push lo decide el usuario, como indica AGENTS.md.

Prioridad de lo que se arregla en el momento: **bloqueo > regla de juego mal >
texto ilegible > visual**. Lo visual va a PENDING.md §4 y no para el tramo.

## Ayudas de depuración permitidas (para no perder horas subiendo niveles)

- Hasta Monte Moon: sin ayudas (ya casi hecho).
- Desde Ciudad Celeste: se permite **un equipo preparado** si hace falta para
  seguir (p. ej. niveles acordes al gimnasio siguiente), siempre con
  `frDebug` en un paso aparte, **dicho en la fila del tramo** y sin tocar
  flags de historia, medallas ni objetos clave. El objetivo es probar guiones,
  mapas y sistemas, no el equilibrio.
- Nunca: poner flags de historia, dar MO/objetos clave o saltar guiones.

## Primer paso (una vez, antes del tramo 1) — hecho 2026-09-25

- `H.exportSave(nombre)` / `H.importSave(nombre)` en el driver: guardar la
  partida del punto de control en `tools/playtest/saves/*.json` para que los
  puntos de control no vivan solo en el localStorage de una máquina.
- Arreglar la Poké Ball que desaparece tras "Gotcha!" (se ve en cada captura).

## Tramos, en orden de historia, con el sistema de riesgo de cada uno

| # | Tramo | Qué se pone a prueba (riesgo) |
|---|---|---|
| 1 | Ruta 3 → Monte Moon → Ruta 4 | cueva, transición CLOCKWISE_WIPE, Team Rocket, fósiles (elección con guion), PC (depositar/retirar), GUARDAR + `?fr=continue` |
| 2 | Ciudad Celeste → Ruta 24/25 (rival, Puente Pepita, Bill) | combate de rival, guion de Bill (separador), Misty (medalla 2), casa robada/ruta 5 |
| 3 | Rutas 5/6 → Ciudad Carmín → S.S. Anne | billete, barco, rival, **MO01 Corte** (efecto de campo), Lt. Surge (cubos de basura) |
| 4 | Cueva Diglett / Ruta 11 → Rutas 9/10 → Túnel Roca → Pueblo Lavanda | **Destello** (cueva oscura), Centro de Lavanda |
| 5 | Rutas 8/7 → Ciudad Azulona | centro comercial, casino (tragaperras, sin probar), escondite Rocket (**baldosas giratorias**, ascensor), Silph Scope, Erika (medalla 4), té para los guardias |
| 6 | Torre Pokémon → Mr. Fuji → Poké Flauta → Snorlax | fantasma Marowak, despertar Snorlax, **bicicleta** (Ruta 16/17) |
| 7 | Ciudad Azafrán → Silph S.A. → Sabrina | teletransportes, Tarjeta Llave, rival, Giovanni, Sabrina (medalla 5/6) |
| 8 | Ciudad Fucsia → Zona Safari → Koga | pasos de Safari, **Surf y Fuerza** (MO03/MO04), Koga |
| 9 | Surf → Isla Canela → Mansión → Blaine | rocas de Fuerza, llave de la Mansión, Blaine (medalla 7), laboratorio (fósil) |
| 10 | Islas Sevii 1-3 (viaje con Bill) | ferry Seagallop (ya portado), guion de Celio, Mt. Ember |
| 11 | Gimnasio de Verde → Ruta 22/23 → Calle Victoria | Giovanni (medalla 8), rival, rocas de Fuerza, guardias de medallas |
| 12 | Alto Mando → Campeón → Salón de la Fama → créditos | transiciones de **mugshot** (portadas en `battle/mugshotTransition.ts`, sin probar en navegador), Salón de la Fama y créditos (portados, sin probar) |

Riesgos a comprobar pronto con un check headless barato (antes de llegar):
efectos de campo de MO (`field_effect.c` 39/239), bicicleta y baldosas
(`field_player_avatar.c` 33/176), movimiento de NPC (`event_object_movement.c`
42/752). Si alguno falla, se porta **la función concreta** que usa ese tramo,
no el archivo entero.

## Qué NO se hace mientras tanto

- Portar archivos grandes completos que la ruta todavía no pide (Easy Chat,
  cajas del PC con interfaz real, Quest Log, postgame).
- Pulir lo visual que no bloquea.
- Varios agentes a la vez sobre la misma rama. Si se reparte trabajo, a Gemini
  o Codex se les dan tareas pequeñas y comprobables con `check:honesty`
  (p. ej. "rellena los stubs de `field_weather.c` y conéctalo"), nunca tramos
  de juego sin probar.

## Medida de avance

La medida de este recorrido es **el tramo más lejano jugado en navegador**;
el avance del port se registra por separado según AGENTS.md.
Estado registrado: tramo 0 completo y tramo 1 a medias (dentro del
Monte Moon). Objetivo: tramo 12.

## Registro de tramos

| Tramo | Estado | Fallos arreglados | Ayudas |
|---|---|---|---|
| 0 (intro → Plateada, PC, tienda, guardar) | jugado | ver historial en Git: `git show 3355d2e:docs/archive/PORTING-STATUS-2026-09-27.md` | ninguna |
| 1 (Ruta 3 → Monte Moon → Ruta 4) | a medias: Ruta 3 y Monte Moon 1F/B1F/B2F; falta la salida | ninguno del juego (solo driver) | ninguna |

## Pendiente al cortar la sesión (2026-09-25)

- **Terminar el tramo 1**: desde el punto de control `mtmoon-1f`, `H.explore`
  hacia la escalera de B1F que da a la Ruta 4 (`(map, w) => map === "MAP_MT_MOON_B1F" && w.dest === "MAP_ROUTE4"`,
  evitando la entrada de 1F). El explorador ya retrocede por la escalera menos
  usada, pero no se llegó a comprobar tras ese cambio. Ver en el camino: guion
  de Miguel y el fósil (B2F, coord event en 14,11), Team Rocket.
- ~~Exportar al repo los puntos de control nuevos~~: hecho el 2026-10-01; los 24
  puntos de control están en `tools/playtest/saves/` (actualizar el registro del
  tramo 1: tarea 4.1 de `TAREAS-FINALES.md`).
- Driver sin probar a fondo: `H.explore` con retroceso y el modo `"switch"`
  cuando el segundo Pokémon también cae.
- `tools/playtest/driver.js` `H.battle` registra `outcome: 0` en combates de
  entrenador ganados (lee `frGame.battleOutcome` después de que se reinicia);
  usar la experiencia/flags para saber si se ganó.
