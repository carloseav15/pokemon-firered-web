# Plan: llegar lo más lejos posible en el juego con el mínimo proceso

Fecha: 2026-09-25. Punto de partida: `main` (82eda72), jugado en navegador
hasta la Ruta 3 (Brock vencido). Reglas y método: [AGENTS.md](AGENTS.md) §6.5 y
[ESTADO-Y-REGLAS.md](ESTADO-Y-REGLAS.md).

## Idea

El juego decide qué se porta. Se juega la historia principal tramo a tramo; solo
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
5. Un commit por tramo: arreglos + una fila en la tabla de PORTING-STATUS
   (tramo, qué se jugó, fallos y commits, ayudas usadas). `check:port`,
   `check:honesty`, `build`. Push a `main`.

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
| 12 | Alto Mando → Campeón → Salón de la Fama → créditos | transiciones de **mugshot** (no portadas: hoy caen en BLUE; es visual, no bloquea), Salón de la Fama y créditos (portados, sin probar) |

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

La cifra que importa ahora es **el tramo más lejano jugado en navegador**, no el
porcentaje de funciones. Hoy: tramo 0 (hasta Ruta 3) más PC, tienda y
guardar/continuar verificados en Plateada. Objetivo: tramo 12.

## Registro de tramos

| Tramo | Estado | Fallos arreglados | Ayudas |
|---|---|---|---|
| 0 (intro → Plateada, PC, tienda, guardar) | jugado | ver PORTING-STATUS 1-11 | ninguna |
