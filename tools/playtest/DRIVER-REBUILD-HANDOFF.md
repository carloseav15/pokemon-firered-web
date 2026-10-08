# Reconstrucción del driver de pruebas: traspaso (2026-10-08)

Trabajo hecho por Claude Sonnet 5.5 sobre el encargo "reconstruir el driver" (fases 0–5). Se detuvo a petición
del usuario en la **Fase 4** por un atasco que se repite y que no se ha podido clasificar (sección 3). Se deja para
Opus. Este documento no sustituye a `PORTING-STATUS.md` / `TAREAS-FINALES.md`, que no se han tocado.

## 1. Qué hay (commits en `main`, locales, sin push)

| Commit | Fase | Contenido |
| --- | --- | --- |
| `22ce04c7` | 0 | Diagnóstico "stuck" de `driver-train.job.mjs`. Los dos checkpoints de ronda sin commitear están en `/tmp/pw/keep/` (`cerulean-training-20261008020349-r1` sirve para reanudar la Fase 5). |
| `e7ee2158` | 1 | `driver/screens.js`: `recognize()` + catálogo. `observe()` añade `screen`/`screenDetails`; `trackScreens()`. Job `screen-catalog`. |
| `cbb11a1e` | 2 | `driver/policy.js` (objeto único de política) + `policy.check.mjs` + job `driver-no-items` (con controles). `noItems` se aplica en todo el driver, incluida la reserva herida de `recoverReplacement`. |
| `d1990f00` | 3 | `driver/loop.js` + `driver/handlers/*`: bucle único `recognize → manejador → entrada verificada`. `battle`, `idle`, `useItem`, `buyItem`, `answerYesNo`, `heal`, `saveGame`, `handleEvolution` migradas. `driver.check.mjs` falla si vuelve un "A genérico" (tiene autoprueba). |

Aceptación comprobada: Fase 1 (`screen-catalog` PASS, 35 pantallas reconocidas de 38, sin frames `unknown`,
`field-free` coincide con el `fieldFree()` antiguo), Fase 2 (`policy.check`, `driver-no-items`), Fase 3 (gate 17/17,
`mtmoon-checkpoints` PASS, `route2.job.mjs` con `ROUTE2_DRYRUN=1` PASS). El gate corre con:

```bash
PW_BASE='http://[::1]:5197/' node tools/playtest/gate.mjs
```

(`[::1]` porque en esta máquina hay otro vite en `127.0.0.1:5197` con HMR, que no es `play:server`.)

### Sin commitear al escribir esto (Fase 4, sin pasar el gate)
`driver.js` (`tourMenu`, `idleDefaults`), `driver/handlers/field.js` (trainer-card, pokedex, tour de menú,
fallback del multichoice), `driver/policy.js` (`unansweredYesNo`), `driver/screens.js` (`trainer-card`, `pokedex`) y el
job nuevo `smoke/random-walk.job.mjs`. Los checks estáticos pasan (`driver.check`, `policy.check`, `check:port`); **el gate
sobre estos cambios dio 16/17**: falló `driver-navigation` (caso opcional: "active never attacked after declining switch"). Esa prueba pasó en
las dos corridas del gate de la Fase 3 y en 2 ejecuciones sueltas; sospecha de azar de combate (misma familia que DRV-10) pero
**no se comprobó** si los cambios de la Fase 4 influyen. Revisarlo primero: repetir `driver-navigation` 3–4 veces y, si falla
siempre, comparar con `d1990f00`.

## 2. Decisiones y hallazgos del portado que conviene conocer

- La política responde **NO** por defecto al "¿Cambiar de Pokémon?" (`Cmd_yesnobox`). El caso opcional de
  `driver-navigation` ahora declara `Cmd_yesnobox: true` en su preparación para seguir probando el menú de equipo
  opcional; las aserciones no cambiaron.
- Estados del impresor de texto que esperan botón: `WAIT`(1), `CLEAR`(2) y `SCROLL_START`(3). El texto de combate, los de
  equipo/tienda y el fin de la animación de objeto (`Task_UseItem_Normal`, estado 12) esperan A. `recognize()` los
  nombra (`text-wait`, `item-use-animation.waitingButton`).
- Al cerrar la mochila el juego **reabre el menú START**; un `field-free` solo cuenta si se mantiene ≥45 fotogramas
  (`useItem`).
- Cursores que el juego no expone (menú START, Sí/No del guardado, resumen de olvidar movimiento, Sí/No de la
  evolución): se mueven con `ctx.unobserved()` (solo direcciones, con la razón escrita) y el efecto se verifica con la
  pantalla a la que lleva la A o con el dato del juego (`GetMoveSlotToReplace`, mochila, movimientos del equipo).
- Pantallas no alcanzables en el juego de un jugador sin capturar: `naming-screen`, `battle-target`,
  `battle-nickname-yesno` (el job las lista como `NOT_REACHED`).
- Pokédex y tarjeta de entrenador salieron como `unknown` en el job de la Fase 1; ya tienen pantalla y manejador de salida.
- `driver-recovery` falló una vez por azar del combate (el rival cayó antes del escape diagnóstico) y pasó al repetir;
  es la misma clase de dependencia del azar que DRV-10 (`TAREAS-FINALES.md`).

## 3. Atasco abierto (el motivo de la parada)

**Síntoma.** `random-walk.job.mjs` desde `mtmoon-b2f-20261006233746` (semilla 1, 10 min) se para siempre en el mismo sitio:
`MAP_ROUTE4_POKEMON_CENTER_1F`, jugador en (7,4) (el mostrador de la enfermera), `script:false`, `locked:true`,
`tasks:[""]` (una tarea con función anónima), `cb1:""`, `cb2:""`, sin diálogo, pantalla `field-busy`. Se queda 4800
fotogramas sin ningún cambio y el bucle devuelve `stuck`. Ocurrió **3 de 3 veces** (con y sin el fallback del multichoice).
`cerulean-arrival` pasó los 10 min sin `unknown` ni atascos.

**Dónde cae.** Es la rama "no está libre el campo" del job (`action: "settle"`), es decir, la acción anterior
(probablemente `talk` a la enfermera y su `idle`) terminó con el campo ya bloqueado sin script. La acción exacta no quedó
registrada en las 3 corridas; el job ya está instrumentado ahora con `history` (últimas 20 acciones con mapa y posición)
y la imprime con el hallazgo.

**Qué se descartó.**
- Repro aislado en el Centro de Pewter (`pewter-pc`): hablar con la enfermera y declinar la oferta termina bien
  (`field-free`). La oferta Sí/No del script **ignora B** (con B solo hay `no-effect`); el fallback actual baja el cursor
  hasta la última entrada (NO) y pulsa A, y eso funciona ahí.
- No es el catálogo: no hay pantalla `unknown`; la tarea anónima no tiene nombre.

**Hipótesis (sin comprobar).**
1. Juego: tras declinar (o terminar) la oferta de la enfermera en el Centro de la Ruta 4 queda una tarea anónima viva y
   `ScriptContext` detenido con los controles bloqueados (`locked`). Mirar qué crea tareas anónimas en el flujo de la
   enfermera (animación de las Poké Balls de curación, `special HealPlayerParty`, `Task_...` de `scrcmd`) y por qué no
   termina o no llama a `ReleaseEvent/UnfreezeObjectEvents`.
2. Driver: una pulsación (B del fallback, o `idle` con `exitMenus`) llegó en mitad de la secuencia de curación y la
   interrumpió. Con el B ignorado por el Sí/No no parece, pero no se descartó el momento exacto.

**Cómo reproducirlo.**

```bash
npm run play:server   # puerto 5197 (ver nota de [::1] arriba)
RW_SAVES=mtmoon-b2f-20261006233746 RW_MINUTES=10 RW_SEED=1 PW_TIMEOUT_MS=1000000 \
  PW_BASE='http://[::1]:5197/' node tools/playtest/pw.mjs tools/playtest/smoke/random-walk.job.mjs /tmp/pw/rw
```

La ejecución no es determinista en fotogramas (depende del tiempo real), pero cayó siempre en este Centro. Siguiente paso
útil: con la salida de `history`, reproducir la secuencia exacta (probablemente guardar el estado justo antes con un
checkpoint) y mirar `H.T.tasks.tasks` y `game.overworld.script` en ese momento. Si es del juego: lo corrige Claude (regla
del encargo: parar y entregar la reproducción).

## 4. Pendiente del encargo

- **Fase 4:** terminar los 3 checkpoints (`cerulean-arrival` ✓ 10 min; `mtmoon-b2f-…` atasco de arriba; `pewter` sin correr)
  y cada `unknown` que salga → pantalla + manejador + caso en `screen-catalog`. Informar la cobertura final.
- **Fase 5:** entrenamiento (`TRAIN_ENTRY=cerulean-training-20261008020349-r1`, copiar de `/tmp/pw/keep/` a
  `tools/playtest/saves/`, máx. 2 ejecuciones) y tramo 2 (`scan-interactions.mjs …`, una ejecución de `route2.job.mjs` desde
  `cerulean-trained`, luego `route2-checkpoints.job.mjs`). **No se ha empezado.**
- Cosas menores: `driver.check.mjs` y los checks estáticos ya están en `gate.mjs`; `random-walk.job.mjs` no está en el gate
  (dura 30 min).
