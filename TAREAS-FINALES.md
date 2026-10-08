# Tareas finales del juego de un jugador

Lista única de lo que queda del port de un jugador. Cifras vivas en
[PENDING.md](PENDING.md); estado breve en [PORTING-STATUS.md](PORTING-STATUS.md).
Por nombres el juego está completo (lo que falta es enlace, hardware sustituido o
código sin caller en el C); lo pendiente es cerrar la sección 1, revisar contra el C
(2), validar en navegador (3) y recorrer la historia (4).

## 0. Cómo trabajar

Lee esta sección entera y después **solo la tarea que vayas a hacer**. Si algo choca
con [AGENTS.md](AGENTS.md), manda AGENTS.md.

### Orden
1. Sección 1 de arriba abajo. Las **[avanzado]** déjalas a un agente capaz si no
   entiendes el C.
2. Sección 2, un bloque de archivo por sesión, en el orden recomendado.
3. Sección 3: primero `npm run play:smoke`, luego lo manual.
4. Sección 4.

### Al empezar
```bash
git switch main && git pull --ff-only && git status --short
```
`git status` debe salir vacío. Si hay cambios que no son tuyos, otro agente está
trabajando: no hagas `stash`, `checkout` ni `reset` sobre ellos y avisa al usuario.
Elige **una** tarea sin marcar.

### Un solo agente en `main`
Solo existe la rama `main` (decisión del usuario, 2026-10-06). Trabaja **un agente a
la vez**, directamente en `main`, sin worktrees ni ramas propias. Si `git status` muestra
cambios ajenos, otro agente sigue activo: para y avisa al usuario. Commit local por
tarea; sin `push` salvo indicación del usuario. Claude revisa por defecto las entregas
en `main`; para DRV-14 el usuario acordó revisión de Muse Spark 1.3 (2026-10-08).
El revisor corrige o revierte con un commit nuevo si la entrega no cumple.

### Eficiencia (obligatorio)
- **Lee solo lo necesario:** §0 y tu tarea. En archivos grandes usa `grep -n` y
  lecturas por rango; nunca vuelques JSON ni logs enteros (`| tail -20`).
- **Localiza funciones sin buscar:** `npm run review:where -- <Nombre>` da su línea
  en el C y en el TS (tabla completa en [docs/REVIEW-LOCATIONS.md](docs/REVIEW-LOCATIONS.md)).
- **Prueba de lo barato a lo caro:** check focalizado → `npm run check:all` una vez
  al final → `npm run play:smoke` → navegador manual solo para lo visual. Capturas
  solo si algo falla.
- **Funciones de cálculo puro** (enteros, tablas): compáralas con el oracle
  (`node tools/oracle/run.mjs --fn <Nombre>`, ver `tools/oracle/README.md`), que
  ejecuta el C real y el TS con miles de entradas.
- **Presupuesto:** dos intentos fallidos con el mismo error, o una tarea básica que
  se alarga sin avanzar → `BLOQUEADO: <motivo>` bajo la tarea y pasa a otra.
- **Notas de cierre cortas:** al marcar una tarea, como mucho 3 líneas con el commit.
  El detalle va en el mensaje del commit, no en este archivo.

### Dónde está cada cosa
- C: `../pokefirered/src/<archivo>.c`. Port TS: `src/fr/`.
- Datos generados (`src/fr/generated/`, `public/fr/`): **no se editan a mano**.
- Checks: `tools/checks/*.ts` → `npm run check:<nombre>`. Navegador:
  `tools/playtest/` (driver `driver.js`, ejecutor `pw.mjs`, `smoke/`, partidas `saves/`).

### Reglas
- Lee el cuerpo C completo (y la función C que lo llama) antes de cambiar código.
  "Renombrar" o "mover" también exige comparar el cuerpo con el C.
- Conserva nombres C, orden de estados y callbacks, y aritmética (u8 → `& 0xFF`,
  s16 → `(x << 16) >> 16`, división entera → `Math.trunc`).
- No cambies `tools/portInventory.py` ni las baselines de `check:honesty`.
- **Aserciones:** no se cambian para que un check pase; **sí se corrigen cuando
  contradicen al C**, citando la línea exacta y marcando `PISTA INCORRECTA`.
  No añadas entradas a `tools/checks/known-failing.json` sin permiso del usuario.
- **Pistas y cifras "esperadas":** son ayudas. Compruébalas con una muestra; si no
  cuadran escribe `PISTA INCORRECTA: <dice> / <datos>` y no ajustes tu resultado.
  Quien escribe una tarea pone solo cifras salidas de un comando ejecutado.
- Cita la línea exacta del C y del TS cada vez que escribas "como el C".
- Marca `[x]` solo si se cumple "Terminada cuando"; si no, `PARCIAL: <qué falta>`.
  No borres una tarea sin hacerla.
- No mezcles código y documentos en un commit. Di qué nivel verificaste (tipos,
  check, navegador): "compila" no es "funciona".
- Tareas de navegador sin navegador: `REQUIERE NAVEGADOR` y pasa a otra.
- Nada de `git push` ni de borrar ramas sin permiso del usuario.

### Al terminar una tarea de código
```bash
npm run check:port && npm run build && git diff --check && npm run check:all
```
`check:all` sale con error solo ante una **regresión**; si dice `FIXED`, quita ese
check de `known-failing.json` en el mismo commit. Tareas solo de documentos:
`git diff --check`.

### Commits
- Código: `git add <tus archivos>` y
  `git commit -m "<Verbo> <qué> (<archivo>.c)" -m "Co-Authored-By: <agente> <correo>"`.
  Sin `TAREAS-FINALES.md`, `PORTING-STATUS.md`, `PENDING.md`, `PORT-INVENTORY.md`
  ni `tools/portPending.py`.
- **Todo commit lleva `Co-Authored-By`** con tu entorno real (`OpenAI Codex
  <codex@openai.com>`, `opencode <noreply@opencode.ai>`, `Claude Opus 5.5
  <noreply@anthropic.com>`…). Después ejecuta `npm run check:honesty`: rechaza
  mensajes sin esa línea o con palabras como "faithful", "complete" o "fully";
  corrige con `git commit --amend` antes de subir.
- **Cierre de sesión, un solo commit de estado:** `npm run inventory`,
  `npm run pending`, marca aquí lo hecho (3 líneas máx. por tarea), actualiza en
  `PORTING-STATUS.md` las líneas "Siguiente", "Última entrega", "Contador" y
  "Acumulado" (total y cambio de la sesión), y
  `git commit -m "Update final task status" -m "Co-Authored-By: …"`.

## 1. Código de un jugador por cerrar

Hechas (detalle en cada commit):
- [x] 1.1 Checks rotos por `rom.charmap` (`sText_100` perezoso) — `aeb5ca05`.
- [x] 1.2 `oac_poke_ally_` y `TradeAnimInit_LoadGfx` con nombre C — `5b304853`.
- [x] 1.3 Huecos conocidos obsoletos (correo, mugshots, `item_use.c`) — `bc7e3e9f`.
- [x] 1.4 Whiteout: respawn mirando al norte — `b41615cd`. Divergencias restantes en §2 (`overworld.c`).
- [x] 1.5 Módulos sin caller: borrados `game/slots.ts` y `openTeachyTv` — `f6680d05`.
  `paletteUtil.ts`, `cableCarUtil.ts`, `imageProcessingEffects.ts`: sin caller en C.
- [x] 1.6 Clima: niebla (Torre Pokémon 3F) y sombra (Bosque Verde) validadas en mapas
  reales — `98725298`. Lluvia/nieve/arena/ceniza no se usan en FireRed (`// unused`).
- [x] 1.7 Evolución tras intercambio con NPC (`TradeEvolutionScene`) — `a061b06e`.
- [x] 1.8 Grabación del Quest Log: buffer de 32 acciones — `1431d1cc`. Diferencia estructural en §2.
- [x] 1.9 Créditos: tiles animados, cámara en espera, duraciones — `f926b597`,
  `91b2e504`, `061b9206`, `ab6dbcd9`, `63bfecc8`.
- [x] 1.10 Audio M4A: ADSR, duty, sweep, keysplit, reverb, coros — `98725298`. Falta escucha humana (C13).
- [x] 1.12 Flores y agua animadas (`Math.trunc` en `tileRenderer.ts`) — `0bf58c37`.

Abiertas:
- [x] 1.11 `check:questlog-battle` comprueba eventos de un jugador en escenas guardadas (`87675830`). Los eventos de enlace se excluyen por alcance.
- [x] 1.13 Animaciones de tiles compartidas entre campo y créditos; agua verificada en ambos (`10c5c535`).
- [x] 1.14 Falsa alarma: el juego sí abre el PC; la prueba pulsaba A una sola vez. C8 ahora
  recorre el menú hasta `CB2_PokeStorage` (`fbb30c01`).
- [x] 1.15 Registros BG del campo (`hw/bgRegs.ts`): declarados sustituidos por Canvas, por
  decisión del usuario (2026-10-01); el navegador no tiene `BLDCNT` (`overworld.c:2071-2073`).
- [x] 1.16 **Poké Ball desde la mochila en combate** [medio]. Era fallo del driver,
  no del juego: el borrador navegaba al bolsillo 1 (objetos clave) y pulsaba A sobre
  la Bici, cuyo menú solo-CANCELAR vuelve a la mochila. Con el bolsillo 2 (`OPEN_BAG_POKEBALLS`)
  la bola se lanza (`927c206c`); check integrado C5 captura en equipo con 2 lanzamientos.
- [x] 1.17 **Brock inicia el combate con `H.talk`** [medio]. Era fallo del juego:
  `GetMovementScriptIdFromObjectEventId` devolvía -1 (`findIndex`) frente al
  centinela 16 del C, así que `applymovement` nunca obtenía slot y `waitmovement`
  colgaba el reveal de Brock. Con el centinela como `script_movement.c`, el
  combate arranca, se gana, hay medalla y el dinero sube 3150→4550 (`3b709ab5`).
  Job C6 integrado (`caa6885d`) y repetido: medalla y 3150→4550.
- [ ] 1.18 **MOVE ITEMS con caja vacía rompe el PC** [medio]. Con `pewter-pc`, entrar
  en MOVE ITEMS revienta `InitBoxMonSprites` (`storageSystemGraphics.ts:121`):
  `boxMonsSprites[pos]!.oam` sobre null. El C
  (`pokemon_storage_system_graphics.c:334-338`) también desreferencia NULL.
  Comportamiento original en hardware/emulador pendiente de verificar; no se
  afirma que sea un no-op. Decidir tratamiento fiel del acceso inválido antes de corregir.
  Propuesta revisada y no integrada (opencode `49c88b53`, rama ya eliminada): añadir
  `&& g.boxMonsSprites[boxPosition]` a la condición de la línea 121. Es una guarda web
  defensiva; su comentario atribuía un no-op de BIOS sin evidencia en emulador/hardware.

- [ ] 1.19 **Marcas de bicicleta del motor**: `field/fieldEffects.ts:DoTracksGroundEffect_BikeTireTracks` usa índices JS negativos; revisar direccionamiento contiguo u8 del C (previous * 4 + facing - 5). Detectado en M13, corregido solo en viewer `a29c9ae9`.


- [x] 1.20 **C8 persistencia y salida del PC**: Flash 0d982c02 integrada en
  85e1e082; revisor repitió PC/enfermera, cierre y movimiento, guardados0→1 y
  continue con mapa/coords/bolsa/dinero/contador e identidades/orden coincidentes.
  Curación cubre un Bulbasaur con entrada médica PREPARED; sin paridad audiovisual
  ni prueba de varios miembros. Evidencia en el mensaje del commit.
- [x] 1.21 **Continue con escenas Quest Log**: 4ce0ab7f restaura índice de objetos,
  avatar por MOVEMENT_TYPE_PLAYER, paletas y mapa/posición guardados. Bytes SON-PREP
  sin alterar: playback2→3→0, equipo/HP/PP/bolsa/dinero/respawn/contador intactos,
  movimiento posterior; continue sin escenas y auto/Brock pasan (detalle en el commit).
- [x] 1.22 **Persistencia de NPC y objetos dinámicos** — `bab7d84a`: SaveObjectEvents/LoadObjectEvents copian los 16 slots y campos C; SAVE normal conserva el mapa sin activar el warp especial; continue y retorno de Quest Log restauran registros antes de recrear sprites. Dos cuerpos C nuevos en `load_save.c` (archivo ya cubierto por navegador; delta del indicador 0), cero equivalencias. Check `tools/checks/objectEventSave.ts`: 53 campos C, slots inactivos, copias independientes, s16 y rechazo de registros incompletos. Job `object-event-save.job.mjs` con/sin `OBJECT_SAVE_PLAYBACK=1`: NPC movido por held movement, invisibilidad/dirección bloqueada y objeto runtime ausente de templates persisten; playback2→3→0 y movimiento posterior PASS. Entradas PREPARED declaradas; guardados antiguos sin snapshot usan templates y no recuperan posiciones históricas perdidas. Revisión manual del usuario y paridad audiovisual completa pendientes.
- [x] 1.23 **H.heal reporta menú ausente tras curar**: 6fc39013 observa el
  ofrecimiento frame a frame, libera A y confirma YES; HP/PP/estados e identidades
  verificados con dos miembros y velocidades0/1/2. No acepta menú ausente como éxito.
- [x] 1.24 **Driver conserva reserva curable al agotarse ataques del activo**:
  6fc39013 cura por BAG al miembro identificado, cambia y ataca por UI; prueba
  real PASS y sin medicina conserva la guardia. Recuperación exige que una
  medicina alcance60% HP; no acredita victoria ni recorrido completo.
- [x] 1.25 **Menú de cambio del driver**: c8ccc36f reproduce activo vivo y
  CHOOSE_MON opcional; cancela por B sin reserva atacante y vuelve a atacar.
  Debilitamiento real/SEND_OUT conserva reemplazo obligatorio y ataque. Pruebas
  PREPARED acotadas, sin afirmar victoria ni reconstruir el intento de Sonnet.
- [x] 1.26 **Ruta4 sin path en el driver**: c8ccc36f corrige planificación
  de ledges y behavior/elevación por nodo; cálculo sin mutar jugador/estadísticas.
  Route4(32,6)→(107,10) con dos saltos reales y conexión Celeste(0,20) PASS desde
  posición PREPARED; no acredita fósil, ruta anterior ni guardado. CB2 de gMain
  era antiguo, no prueba de carga activa; fieldFree/exit ahora esperan campo real.

- [x] 1.27 **Recorrido reanudable Celeste→Ruta5** — `98dc7ab1`: `play:cerulean` encadena entrenamiento natural, rival, Puente Pepita, Bill, Misty y Rocket; rondas/hitos SAVE→export→CONTINUAR→movimiento, importación con hash y recursos contrastados, medicina→KO→reemplazo y cálculo de daño corregidos. Ruta5 alcanzada y recargada; repetición desde checkpoint posterior a Misty con Rocket/salida PASS, reanudación de tramo ya completo PASS. Regresión de medicina PREPARED 10/10 y gate focalizado 2/2; tipos/honesty/build PASS. Entrada importada, ejecución con paradas/reanudaciones: no acredita historia anterior, Liga/Sevii, todas las opciones ni paridad ROM. Checkpoint/procedencia en `tools/playtest/saves/route5-arrival.*`; evidencia de sesión en `/tmp/pokemon-cerulean-progress-20261008`, `/tmp/pokemon-cerulean-retest-20261008` y `/tmp/pokemon-medicine-repeat2-20261008`.

### Fiabilidad del driver: alcance inicial hasta Ciudad Celeste

Prioridad vigente para recorridos; detalles y dependencias en
[PLAN-RECORRIDO.md](PLAN-RECORRIDO.md#estado-de-fiabilidad-del-driver).
No equivale a completar el juego ni su fidelidad. Las correcciones1.23–1.27 se
conservan como evidencia focalizada; 1.22 implementada y comprobada en casos acotados;
las validaciones generales anteriores siguen abiertas.

- [ ] **DRV-01 — Matriz de capacidades.** Inventariar funciones públicas de
  driver.js, consumidores y checks/jobs existentes; clasificar implementado,
  comprobado, parcial, no soportado y NOT RUN por caso. Priorizar fallos del
  recorrido hasta Celeste. Terminada con referencias y huecos verificables,
  sin convertir análisis estático en PASS runtime.
- [x] **DRV-02 — Estado y carga.** 6d693641/51cd5646/2e78b7df: observe distingue
  callbacks activos, carga, Quest Log, menús y movimiento terminado; ready espera
  control real. Carga pendiente, continue grabado y navegación focalizada PASS.
- [x] **DRV-03 — Entradas y ejecución acotada.** 6d693641/51cd5646: pasos de
  un frame, resultados compatibles, límites/cancelación y reemplazo de sesión;
  control0/1/2 y Brock PASS. Guardias cooperativas: no cubren llamadas directas a frDebug.
- [ ] **DRV-04 — Navegación y recursos por capacidades.**
  Revisar cobertura a pie, NPC/obstáculos, ledges, puertas/conexiones y recuperación
  con HP/PP/medicinas/reemplazos. Corregir fallos necesarios para Celeste y declarar
  límites posteriores (Surf/bici/empujes/movimientos forzados); no asumir que están
  ausentes del motor. Terminada con casos acotados y parada diagnosticada ante
  estado no soportado, sin bucles de curación ni repetir la historia completa.
- [x] **DRV-05 — Checkpoints y exportación segura.** 2e78b7df: SAVE por UI,
  bytes/hash/procedencia y exportación exclusiva; velocidades0/1/2, NO inicial,
  cancelación, continue/movimiento y C8 PASS. Persistencia de NPC comprobada aparte
  en 1.22 (`bab7d84a`); DRV-05 por sí solo no la demuestra.
- [ ] **DRV-06 — Gate de regresión del driver.** Con contratos
  aceptados, integrar checks/jobs focalizados existentes y los casos faltantes
  aprobados en un comando acotado. Terminada con exit no exitoso ante fallo,
  MANUAL/NOT RUN separados, trazas de estado/acción/recurso y cobertura enlazada
  a DRV-01. No ejecutar toda la suite del juego por cada cambio.
- [x] **DRV-07 — Continuación de historia.** `30ac65b9`/`78e781ad`: el job guarda un
  checkpoint verificado en cada hito (B2F, Miguel, Dome Fossil, salida a Ruta 4) y
  `cerulean-arrival.json` continúa en Celeste con layout 81 y paso real; los cinco pasan
  `mtmoon-checkpoints.job.mjs`. Destapó el layout id perdido al cruzar conexiones
  (`77005743`). Política auto de combate; sin paridad audiovisual.

- [x] **DRV-08 — Aprendizaje, evolución, fuerza y entrenamiento** (`40140bf1`, `7ade4328`):
  aprender/rechazar movimiento y evolución con su aviso, `assessTrainer` con
  diagnóstico de derrota, `train`/`healAtCenter`, `gate.mjs` y `scan-interactions.mjs`.
  Probado con jobs focalizados; gate 14/15 (`driver-navigation` inestable, ver DRV-10).
- [x] **DRV-09 — Entrenamiento largo contra el rival de Celeste.** `98dc7ab1`: entrenamiento natural hasta favorable (Pidgeotto20/Ivysaur19), checkpoints por ronda conservados y reanudación por archivo; rival vencido después por UI. No acredita origen del guardado importado ni repetibilidad de toda la historia.
- [ ] **DRV-10 — `driver-navigation` depende del azar.** Su caso de debilitamiento forzado
  espera que el rival derribe a un líder con 1 PS; falló 1 de 4 ejecuciones (liveHp 1).
  Fijar una entrada que garantice el debilitamiento o aceptar ambos desenlaces.

- [x] **DRV-11 — Reconstrucción del driver, fases 0–4** (Sonnet, `22ce04c7`…`6b30760e`): catálogo de
  pantallas, política única, bucle único sin A genérica, `random-walk`. Revisado; traspaso en
  `tools/playtest/DRIVER-REBUILD-HANDOFF.md`.
- [ ] **DRV-12 — Pantalla "mensaje de derrota" sin manejador.** Tras un whiteout, la tarea de
  `Task_RushInjuredPokemonToCenter` (overworld.ts) imprime gText_PlayerScurriedToCenter, que termina en
  `\p`: la impresora queda en estado 2 (CLEAR) esperando A y `recognize()` la llama `field-busy`, así que el
  bucle no avanza (atasco del Centro de Ruta 4 en `random-walk`). Reproducido: `frGame.whiteOut()` y una A
  llevan al diálogo de la enfermera. Falta pantalla + manejador + caso en `screen-catalog`; C7 no está en el gate.
- [ ] **DRV-13 — Tests de combate dependientes del azar.** `driver-navigation` (caso opcional),
  `driver-switch` y `driver-recovery` fallan de vez en cuando y pasan al repetir; hacerlos deterministas
  sin perder lo que comprueban.
- [x] **DRV-14 — Modo manual y replay, fase 1**: `5de398c3`, 10×10.000 fotogramas con observación idéntica, sin rAF espontáneo; entrada/semilla alteradas detectadas, lotes y waits exactos, teclado aislado y arranque normal comprobados.
  Driver H: OPTION y retorno al campo, 409 fotogramas/409 entradas grabadas. `check:manual-frames`, tipos, honesty y build PASS; revisión independiente de Muse pendiente.
- [ ] **DRV-15 — Ampliar determinismo**: cargas/continuaciones, audio lógico, intro/título, observación de combate y savestates; contrastar el consumo RNG por VBlank con C. DRV-10/13 siguen abiertos; investigar por separado `Quest Log palette backup is not initialized` al continuar `cerulean-arrival` (diagnóstico 2026-10-08).
- [ ] **DRV-16 — Extender recorrido y cobertura de opciones.** `98dc7ab1` deja Ruta5 comprobada; `aa681ccd` (Ruta5→Carmín, checkpoint `vermilion-arrival-*`) y `0a9432ac` (S.S.Anne, HM01, `ssanne-hm01-*`) verificados con SAVE/continue/movimiento desde entradas importadas; `61610652` añade `H.teachMove`. Pendiente: Surge (`surge-progress.job.mjs`, comprometido sin validar: «no path» a la puerta del gimnasio), luego Liga/Sevii. Encadenar entradas/salidas verificadas y casos alternativos de §3; revisión independiente del tramo2 pendiente. No cerrar por flags importados ni por checks estáticos.
- [x] **Gritos en fotogramas y por id de grito** — `7dd38034`: la lógica ya no espera al audio del
  navegador (combate colgado en SoundTask_PlayDoubleCry_Step) y cada especie usa su grito (antes el de la
  siguiente). `check:cry-timing`. Falta escucha humana (C13).

- [x] **SON-PREP**: b765818f integrada en a8fc2c6a; guardado por UI con procedencia,
  SHA25645b315d0… y restauración/movimiento repetidos por Sol. Entrada aceptada
  para SON-MM01-R; todavía no fósil ni llegada a Celeste.
- [x] **LUNA-02 regresión focalizada del driver**: base66baef56, cinco casos PASS
  revisados; entradas PREPARED y segmento500 sin victoria declarados. Ronda4ce0ab7f:
  dos continue PASS; retorno Brock MANUAL válido, cerrado por revisor14238405
  con comprobación explícita y paso real. Sin ruta completa.
- [x] **Driver detiene navegación tras derrota/atasco**: 65e631f9 propaga
  battle lost/battle stuck por goto/explore/grind, permite sustituto sano en slot0
  y evita restauración perdida de battleDefaults. C7 confirma pérdida natural y
  devolución al Centro; runner ok:false devuelve exit1. Estrategia/curación
  automática y reemplazos con más miembros requieren revisión focalizada posterior.

- [x] **SOL-DRV01 decisiones/recursos/curación del driver**: 66baef56, política auto
  con tipos/PP/restricciones y stats, medicinas/objetivo identificado por UI,
  enfermera verificada, reserva/retirada y presupuestos. Casos PREPARED focalizados
  pasan en campo/salvaje/Brock/cambio/medicina tras cambio; C7 explícito conserva
  whiteout. Sin claim de ruta completa/C8, ni todas las interacciones del combate.

## 2. Revisión de equivalencias y wrappers contra el C

Funciones con nombre C que delegan en lógica adaptada. Un bloque de archivo por sesión.
Orden: `pokemon.c` → `text.c` → `quest_log.c` y `overworld.c` → `event_object_movement.c`
→ `party_menu.c` y `pokemon_summary_screen.c` → `battle_transition.c` → `field_effect.c`
→ `intro.c` → `m4a.c` → otros.

Receta:
0. `npm run review:where` para regenerar
   [docs/REVIEW-LOCATIONS.md](docs/REVIEW-LOCATIONS.md) y ver dónde está cada nombre.
1. Lee el cuerpo C y el TS en esas líneas.
2. Compara ramas, orden de llamadas, constantes, anchos de entero, divisiones y
   callbacks. Si es cálculo puro, pásale también el oracle.
3. Igual → `[x]` citando líneas. Diferencia pequeña con check que la cubra →
   corrígela (commit de código). Si no → `DIFERENCIA: <C> / <TS>` y sin marcar.
4. No marques nada que no hayas leído en los dos lados.

**`event_object_movement.c`** (`field/objectEvents.ts`, `fieldEffects.ts`)
- [ ] `MovementAction_*` y `MovementType_*` (delegan en `movementActionStep`).
- [ ] `UpdateObjectEventCurrentMovement` (secuencia por objeto/ground effects) y
  driver por objeto; `ObjectEventSetSingleMovement`, `ObjectEventExecSingleMovementAction`,
  `ClearObjectEventMovement` (registro QL y `sprite.data[2]`).
- [ ] `GetTrainerFacingDirectionMovementType` (tabla C, todas las direcciones);
  `GetVectorDirection`/`GetLimitedVectorDirection_*`/`TryGetTrainerEncounterDirection`.
- [ ] `MoveCoords`/`MoveCoordsInDirection` (overflow s16 y deltas u16); `SetObjectEventCoords`.
- [ ] `GetAvailableObjectEventId`, `TrySetupObjectEventSprite`, `TrySpawnObjectEventTemplate`,
  `TrySpawnObjectEvents`, `RemoveObjectEventsOutsideView`, getters/overrides de plantillas;
  `GroundEffect_*`/`DoTracksGroundEffect_*`.
- [ ] `ObjectEventSetHeldMovement`, `ObjectEventForceSetHeldMovement`,
  `ObjectEventFaceOppositeDirection` y ambos drivers del movimiento retenido.
- [ ] `InitNpcForWalk*`/`InitWalk*`/`UpdateWalk*`, `InitRunSlow`/`UpdateRunSlow`;
  `Step1/2/3/4/8` y tablas de velocidad frente a `NpcTakeStep`; OAM de hierba larga.
  - DIFERENCIA: el C (`UpdateWalkSlowerAnim`) solo mueve el sprite (`Step1`); el TS
    (`UpdateSlowStyleAnim`) además resuelve el objeto desde el sprite y devuelve
    `false` si no está en `ObjectEvents.objects` (en juego siempre lo está).
- [ ] `StartFieldEffectForObjectEvent` y `DoRippleFieldEffect` (dispatch y scripts de efecto).
- [ ] `UpdateObjectEventVisibility` y `ObjectEventUpdateSubpriority` (orden del ciclo de frame).
- [ ] `ObjectEventSetGraphicsId*`, `ObjectEventTurn*`, `PlayerObjectTurn`, `SetObjectEventDirection`.
- [ ] `RemoveObjectEvent`, `RemoveObjectEventInternal`, `RemoveObjectEventIfOutsideView`
  (teardown del renderer frente a destrucción de sprites C).
- [ ] `InitJumpRegular`, `UpdateJumpAnim`, `DoJumpAnim`, `DoJumpSpecialAnim`,
  `DoJumpInPlaceAnim`, `InitJumpSpecial` (frames, aterrizaje y sombras).
- [ ] `InitAcroWheelieJump`, `InitAcroPopWheelie`, `InitAcroWheelieMove`, `InitSpin`,
  `AcroWheelieFaceDirection`.
- [ ] `ObjectEventIsTrainerAndCloseToPlayer`, `MoveNextDirectionInSequence`,
  `GetLedgeJumpDirection` (callers y colisión de ledge).
- [ ] `CopyablePlayerMovement_*` y `cph_IM_DIFFERENT` frente a `gCopyPlayerMovementFuncs`.
- [ ] Clones/obstáculos y ciclo `SpawnObjectEventsOnReturnToField`.

**`overworld.c`** (`field/overworld.ts`, `fieldControl.ts`, `game.ts`)
- [x] `Overworld_ResetStateAfterFly/Teleport/DigEscRope/WhitingOut`: cuerpos C idénticos
  (`overworld.c:289-342`) y secuencia compartida en `overworld.ts:524-542`.
- [ ] `CB2_WhiteOut` (`overworld.c:1545`): faltan en `game.ts` `StopMapMusic()`,
  `UnlockPlayerFieldControls()` y `ResetSafariZoneFlag_()`; los dos primeros quedan
  cubiertos en la práctica por el script; revisar.
- [ ] `WarpIntoMap`/`TryFadeOutOldMapMusic`.
  - DIFERENCIA: el C carga el mapa de forma síncrona (`overworld.c:583-588`); el TS lo
    hace por etapas asíncronas (`overworld.ts:641-673`). `TryFadeOutOldMapMusic`
    coincide (`overworld.c:1112-1118`, `overworld.ts:2342-2349`).
- [ ] `GetMapTypeByGroupAndId`, `GetLastUsedWarpMapType`, `GetSavedWarpRegionMapSectionId`,
  `GetCurrentRegionMapSectionId`, `GetCurrentMapBattleScene`.
  - DIFERENCIA: en mapas válidos coinciden; el TS usa `?.` y admite `undefined` en
    mapas inválidos (`overworld.c:1203-1206,1260-1273`, `overworld.ts:339-371`).
- [ ] `SetDiveWarpEmerge`/`SetDiveWarpDive`; `cb1`/`cb2`;
  `CB2_ReturnToFieldContinueScript(PlayMapMusic)`/`CB2_ContinueSavedGame`.
  - DIFERENCIA: falta cotejar anchos de coordenadas (`u16` a `s8` en
    `SetWarpDestination`, `overworld.c:722-747`); los CB2 comparten dispatch con carga
    asíncrona (`overworld.c:1663-1719`, `game.ts:319-362,1017-1037`).
- [ ] `DoCB1_Overworld_QuestLogPlayback`, `LoadMap_QLPlayback`,
  `CB2_SetUpOverworldForQLPlayback*`, `QL_UpdateObject`/`QL_UpdateObjectEventCurrentMovement`.
  - DIFERENCIA: el C consume la máquina de estados en un callback
    (`overworld.c:2210-2250`); el TS la reparte entre frames (`overworld.ts:792-840`).
    `QL_UpdateObject` aplica movimiento y gfx antes de actualizar (`quest_log.c:1340-1365`);
    el TS aplica comandos en `fieldControl.ts:204-214` antes del driver.

**`quest_log.c`** (`questLogEvents.ts`)
- [ ] Callbacks de entrada/fin de playback, `RunQuestLogCB`, `QLogCB_Playback`,
  `QuestLog_PlayCurrentEvent`, `HandleShowQuestLogMessage`, `QL_TryRunActions`.
  - DIFERENCIA: fin de escena (`quest_log.c:270-289`) frente a `sPlaybackEndMode`
    (`questLogEvents.ts:824-849`); `QL_TryRunActions` escribe estado global en C
    (`quest_log.c:1594-1669`) y devuelve comandos en TS (`questLogEvents.ts:1168-1221`).
- [ ] Escenas como array en TS frente al anillo de escenas del C (`QL_StartRecordingAction`,
  `ClearSavedScene`, `Task_BeginQuestLogPlayback`); formato de save sin cambiar (1.8).

**`battle_transition.c`** (`battle/transition.ts`)
- [ ] Driver de intro y transición; helpers de scanline y HBlank/VBlank; `SetSinWave`/`SetCircularMask`.
- [ ] `Task_Swirl`/`Swirl_*`/`VBlankCB_Swirl`; `Task_Ripple`/`Ripple_*`/`VBlankCB_Ripple`/`HBlankCB_Ripple`.
- [ ] `Task_BigPokeball` y sus callbacks/buffers; `Task_ClockwiseWipe` y fases;
  familia `Task_Slice`/`Slice_*`; `Task_WhiteBarsFade` y callbacks Sprite/VBlank/HBlank.

**`intro.c`** (`introCopyright.ts`, `introGameFreak.ts`, `introScene*.ts`)
- [ ] Callbacks Game Freak, tareas/etapas de escenas 1–3, `Scene3_*`/`SpriteCB_*`;
  `SetUpCopyrightScreen` y `CB2_WaitFadeBeforeSetUpIntro`.

**`field_effect.c`**
- [ ] `popOutOfAsh`/`startLavaridgeGymWarpEffect` y callbacks `SpriteCB_*` conectados a sus tareas.

**`party_menu.c`**
- [ ] `CreatePartyMon*SpriteParameterized` (especie, prioridad, estado, objeto);
  `PartyMenuStartSpriteAnim`, los tres `CB2_ReturnTo*Menu`, `CB2_SetUpExitToBattleScreen`.

**`pokemon.c`**
- [x] Los 6 wrappers BoxMon/Mon revisados con líneas citadas; `GetMonSpritePalStruct`
  corregido a `MON_DATA_SPECIES_OR_EGG` — `3bea3c6d`, `3d63e11a`.

**`pokemon_summary_screen.c`**
- [ ] `SwapBoxMonMoveSlots`, `UpdateCurrentMonBufferFromPartyOrBox`, transición de
  páginas, setup y `SpriteCB_MonPicDummy`.

**`text.c`** (`gba/textPrinter.ts`)
- [x] `DecompressGlyph_NormalCopy2` y 4 `TextPrinter*` (espera, flecha, modo auto) — `c4282dab`.
- [ ] `TextPrinterDrawDownArrow`, `TextPrinterClearDownArrow`.
  - DIFERENCIA: el C llama `CopyWindowToVram(..., 0x2)` tras dibujar o limpiar
    (`text.c:514,531`); el TS escribe directo en el Canvas.
- [ ] `RenderText`.
  - DIFERENCIA: en `RENDER_STATE_SCROLL` el C usa `ScrollWindow` y `CopyWindowToVram`
    por frame; el TS usa `window.scroll` sobre Canvas (velocidades `[1, 2, 4]` iguales).

**`m4a.c`** (`audio/sound.ts`, `audio/m4a.ts`)
- [ ] `m4aSongNumStart*`, `m4aSongNumStop/Continue`, `m4aMPlayContinue/FadeOut/
  FadeOutTemporarily/FadeIn/VolumeControl`, `m4aSoundInit`/`m4aSoundMain`,
  `SetPokemonCryTone`, `SetPokemonCryStereo`, `IsPokemonCryPlaying`, `m4aMPlayPanpotControl`.

**Otros archivos**
- [ ] `field_player_avatar.c`: renombres.
- [x] `field_control_avatar.c`: getters de posición y helpers con `FieldControl` como contexto.
  Iguales: `GetPlayerPosition` (C:345-349 frente a `fieldControl.ts:293-296`),
  `GetInFrontOfPlayerPosition` (C:351-360 frente a `:299-304`),
  `GetPlayerCurMetatileBehavior` (C:362-367 frente a `:217-220`),
  `PlayerGetDestCoords`/`PlayerGetElevation`/`GetPlayerMovementDirection`/`GetPlayerFacingDirection`
  (`field_player_avatar.c:1034-1095` frente a `playerAvatar.ts:47-73`; "dest" es
  `currentCoords` y elevación es `previousElevation` en ambos) y vectores
  S/N/W/E (`objectEvents.ts:17-19`). Wrappers de módulo en `:50-52`; callers vivos
  en `:311,328,331,337`.
- [ ] `start_menu.c`: `ShowStartMenu`, `SetUpReturnToStartMenu`, `CloseStartMenu`,
  `CloseSaveStatsWindow_`, `FieldCB_ReturnToFieldOpenStartMenu`.
- [ ] `vs_seeker.c`: `VsSeekerFreezeObjectsAfterChargeComplete`, `VsSeekerResetObjectMovementAfterChargeComplete`.
  - `Reset...` (`vs_seeker.c:636-661` frente a `vsSeeker.ts:319-334`): igual —mismo
    filtro (STOP/JUMP/SWIM), tabla aleatoria UP/DOWN/LEFT/RIGHT, set solo si el
    objeto existe y `movementType` de plantilla siempre actualizado; `templates`
    es el mapa actual (`overworld.ts:1118`) como el conteo del C.
  - DIFERENCIA en `Task_ResetObjectsRematchWantedState` (`vs_seeker.c:603-633`
    frente a `vsSeeker.ts:290-311`): al detenerse, el C llama a
    `HandleEnforcedLookDirectionOnPlayerStopMoving()` (`field_player_avatar.c`) y
    el TS limpia el movimiento retenido del jugador; al terminar, el C llama a
    `StopPlayerAvatar()` (`field_player_avatar.c:1122`: strange bits, dirección y
    bici) y el TS solo pone `runningState = 0`. Sin check que lo cubra: sin marcar.
- [ ] `trainer_card.c`: `Unref_InitTrainerCard`; `battle_setup.c`: `SetBattledTrainerFlag2`.
- [ ] `trainer_tower.c`: `TT_ConvertEasyChatMessageToString`, `GetTrainerTowerTrainerFrontSpriteId`,
  `CB2_EndTrainerTowerBattle`, `Task_DoTrainerTowerBattle`.
- [ ] `battle_tower.c`: `Task_WaitBT` (adapta el scheduler a `game.startBattle`).
- [x] `trade_scene.c`: `LoadTradeAnimGfx`; `mail.c`: `GetInGameTradeMail` (`attachTradeMail`).
  Iguales: `LoadTradeAnimGfx` delega en una línea (`trade_scene.c:2803` frente a
  `ingameTrade.ts:369`); el correo copia 9 palabras, nombre, 4 bytes de ID con
  máscaras explícitas, especie y objeto (`trade_scene.c:2500-2512` frente a
  `pokemon/mail.ts:259-276`, con guardas benignas ante cdata ausente y firma adaptada a
  anexar al mon). `MAIL_WORDS_COUNT` 9 en ambos.
- [ ] `trade_scene.c`: `TradeAnimInit_LoadGfx` no sigue el cuerpo C: el C hace
  `ChangeBgX/Y(0, 0, 0)`, carga dos veces gráficos, tilemap y paleta del textbox
  (`gBattleInterface_Textbox_*`) y no asigna buffer a BG2; el TS asigna BG2 y no carga
  el textbox. Comprobar si esa carga ocurre en otro sitio.
- [x] `metatile_behavior.c`: fachada de predicados en `fieldmap.ts` (`fieldmap.ts:132-139`,
  delegación 1:1 sin lógica). Cuerpos generados clavan al C (`metatile_behavior.c:253,446,
  454,527,535,648,676,846` frente a `generated/metatileBehavior.ts:365,563,571,644,652,
  778,807,987`); 10 constantes MB_* coinciden con `metatile_behaviors.h`. Solo
  `IsWater` tiene callers vivos (7 archivos); los otros 7 sin caller en TS.

## 3. Validación en navegador

**Primero `npm run play:smoke`** (Playwright sin ventana; necesita un servidor:
`npx vite --port 5174 --strictPort` y `PW_BASE=http://localhost:5174/`). Cada punto
devuelve OK, FALLO o MANUAL en una línea. Amplía los trabajos de
`tools/playtest/smoke/` antes que probar a mano.

### Estrategia de prueba para agentes

Lo que funcionó (C3, C7, C9 y C10 de `fea0682e`) y conviene repetir:
1. **Un trabajo por punto** en `tools/playtest/smoke/C<n>-*.job.mjs`, que parte de
   una partida de `tools/playtest/saves/` y usa los helpers de `smoke/lib.mjs`
   (`openStart`, `tap`, `until`, `bagCount`).
2. **Pulsaciones reales, no llamadas internas.** Pulsa botones y espera estados
   (`H.cb2()`, tareas activas, `H.st()`), como haría un jugador. Si para llegar a la
   situación hay que tocar el estado (p. ej. resetear un cursor), márcalo `PREPARED`.
3. **Comprueba el resultado en el estado guardado** (dinero, bolsa, equipo, mapa,
   orientación) y, si hay fórmula en el C, compárala (en C7 la pérdida de 96 =
   nivel 12 × 8 sin medallas). Las capturas solo sirven para diagnosticar.
4. **Todo bucle lleva tope.** `run.mjs` corta cada trabajo a los 120 s; un `for` sin
   tope deja colgado el diagnóstico (le pasó al borrador de C5).
5. **Si falla, primero decide quién falla: el juego o la prueba.** Reprodúcelo por
   etapas en el navegador integrado (`preview_start` con `vite`, `H.importSave`, y
   cada etapa con `javascript_tool`) y compara con el C. Fallo del juego → tarea en
   §1 con su reproducción. Fallo de la prueba → corrige la prueba.
6. **MANUAL honesto.** Si solo se verifica una parte, el trabajo devuelve `manual`
   diciendo qué falta; nunca OK parcial.
7. **Un agente por punto**, cada uno en su worktree (§0). En la Fase B dos agentes
   hicieron el mismo trabajo en paralelo y una rama quedó sin fusionar.

Reparto por dificultad:
- **Agentes básicos (Sonnet, Codex, opencode):** puntos con partida justo antes de la
  acción y un resultado medible: C8 (curar y depositar/retirar), C13 (música de
  combate, efectos y gritos por estado de `sound`) y ampliar C1.
- **Agente avanzado o revisor:** puntos donde la prueba destapa fallos del juego y hay
  que leer el C: 1.18 (PC vacío), C2 (Oak completo hasta el rival), C4 (Quest
  Log), C11 (evolución) y C12 (ruta con puertas, conexiones y cueva).

Receta manual (si un punto no se puede automatizar):
1. Servidor (`npm run dev` o `preview_start` con `vite`) y `http://localhost:5173/?fr=new`.
2. Carga una partida de `tools/playtest/saves/` en dos pasos (`importSave` recarga la página):
   ```js
   (async () => { const { H } = await import("/tools/playtest/driver.js"); await H.importSave("pewter"); })();
   // cuando recargue:
   (async () => { const { H } = await import("/tools/playtest/driver.js"); window.H = H; console.log(await H.ready()); })();
   ```
   Con `pewter`: `MAP_PEWTER_CITY_POKEMON_CENTER_1F` (7, 4) y `H.party()` = `1:L12:33/33`.
3. Usa el driver (`H.goto`, `H.talk`, `H.battle`, `frDebug.press("A")`) y lee el
   estado (`H.st()`, `frDebug.state()`) en vez de adivinar. Un warp tarda unos 300
   frames; el clima forzado se pierde al cambiar de mapa.
4. Terminada cuando se comporta como el original y la consola no tiene errores.
   Un fallo se añade como tarea en la sección 1 con su reproducción.

### 3.0 Checklist prioritario
- [ ] **C1 Arranque completo** (`/`): copyright → Game Freak → intro → título → menú principal.
  PARCIAL: `play:smoke` OK por estado (logo, escenas, título, menú); falta ver la secuencia.
- [ ] **C2 Partida nueva** (desde `/`, no `?fr=new`): título → NUEVA PARTIDA →
  discurso de Oak y nombres → habitación (`MAP_PALLET_TOWN_PLAYERS_HOUSE_2F` (6, 6)) →
  Oak te detiene en la hierba → laboratorio → inicial → combate con el rival.
  `?fr=new` se salta el discurso de Oak y empieza en la habitación: sirve para la
  segunda mitad del recorrido, no para la primera.
  PARCIAL: el smoke llega del título a Oak (`da01814a`); no alcanza el campo.
- [x] **C3 Guardar y continuar**: misma posición, equipo y dinero — `play:smoke` con `pewter` (`190efec3`).
- [ ] **C4 Quest Log**: tras continuar se reproduce el resumen y devuelve el control.
- [x] **C5 Combate salvaje**: luchar, huir y capturar con pulsaciones reales
  (`d59b5003`), repetido sobre integración: captura en equipo y consumo de 2 balls.
  Job ampliado (`d2743aa7`): cinco casos aislados, equipo lleno → PC incluido; destapó el
  fallo de texto de transferencia al PC, corregido en `bcd841b5`.
- [ ] **C6 Combate de entrenador**: partida `pewter` → gimnasio → Brock; medalla y dinero.
  PARCIAL: `gym-camper` → Brock, victoria, medalla y 3150→4550 comprobados
  con el job `caa6885d` sobre integración. Falta la ruta previa desde `pewter` al gimnasio.
- [x] **C7 Derrota (whiteout)**: reaparece en el Centro Pokémon **mirando al norte**,
  equipo curado y dinero reducido — `play:smoke` pierde un combate real (`fea0682e`).
- [ ] **C8 Centro Pokémon y PC**: depósito/retiro automatizado con pulsaciones reales
  (`54895bba`, devuelve MANUAL honesto); curación de la enfermera pendiente.
- [x] **C9 Tienda** (partida `mart`): el dependiente aparece, comprar y vender; el
  dinero cambia — `play:smoke` compra 200 y vende 150 (`fea0682e`, con el arreglo de `shop.c` `06b08838`).
- [x] **C10 Menús**: Pokédex, Pokémon (resumen, mover, objeto), Mochila (Poción),
  Ficha, Opciones — `play:smoke` con pulsaciones reales (`fea0682e`).
- [ ] **C11 Evolución por nivel** (`H.grind`): ver la escena, cancelar con B y aceptar.
- [ ] **C12 Mapas y transiciones**: puertas, escaleras, mapas conectados, cartel de
  nombre y cueva (`route3` → Monte Moon); flores y agua animadas.
- [ ] **C13 Audio**: música por mapa y combate, efectos y gritos; escucha humana del M4A.
  PARCIAL: el smoke verifica BGM de mapa (303) y de combate salvaje (298), SE y
  grito por estado (`9b95defe`); falta la escucha humana.
- [x] **C14 Clima**: niebla y sombra en mapas reales (1.6).

### 3.1 Lista completa por áreas
**Campo y movimiento**
- [ ] Movimiento normal/carrera, giro rápido, delays, saltos, ledge/Acro, Step*,
  hierba larga y elevación; frames Canvas y virtual objects.
- [ ] Clones/obstáculos de mapas conectados, retorno al campo, reset tras warp,
  carga local escalonada, estado inicial/Dive y popup de mapa.
- [ ] Vuelo, pesca, alfombras y pasos, SS Anne/reflejos, paletas de disfraces, matrices affine.
- [ ] Efectos: Fly, Photo Flash, VS Seeker, Lavaridge, Deoxys, Escape Rope, escalera,
  Ripple/Swirl (animaciones, render y warp).
- [ ] Transición de música; audio general.

**Combate**
- [ ] Transiciones: driver completo, Big Poké Ball, ClockwiseWipe, Slice, WhiteBarsFade,
  scanline/HBlank.
- [ ] Entrenadores: tabla de facing y recorrido de batalla; IA; sprites de combate;
  derrota/whiteout.

**Pantallas y menús**
- [ ] Título, Copyright, Game Freak y escenas 1–3 de la intro.
- [ ] Retorno del party menu al campo (fade/controles); naming/subsprites.
- [ ] Cajas del PC y resumen (incluida la regla HM del resumen); guardería; Teachy TV; Fame Checker.
- [ ] Guardado desde script: confirmación, cancelar, escritura y retorno al script.
- [ ] Battle Records y Trainer Tower; Battle Tower y flujo e-Reader.
- [ ] Quest Log: reproducción/UI, paridad normal/warp y retorno al mapa guardado.
- [ ] Créditos completos (nombres y pantallas tras las escenas de mapa).
- [ ] Pantallas de la sección 5 de [PENDING.md](PENDING.md) (Pokédex, tienda, PC,
  Hall of Fame, tragaperras, Item Finder, intercambio NPC, etc.).

## 4. Recorrido de historia

Sigue [PLAN-RECORRIDO.md](PLAN-RECORRIDO.md): un tramo por sesión, punto de control
antes y partida exportada a `tools/playtest/saves/` al terminarlo.

- [x] **4.1 Revisar checkpoint `route4` y actualizar registro** — revisión 2026-10-06:
  carga en Ruta 4 oeste (8,19), movimiento a (15,19), control libre y sin errores.
  `967a496e` no demuestra salida de Monte Moon: falta fósil/flag 562 en el save.
  El tramo 1 sigue parcial; obtener fósil → salida este → Celeste → guardar/continuar
  sigue abierto en el recorrido siguiente y PLAN-RECORRIDO. Notas B2F preservadas.
- [ ] Recorrido zona por zona de Kanto y Sevii (tramos 2–13, incluido postgame de un jugador), con partidas por tramo.
- [ ] Checks headless por sistema en `tools/checks/` donde falten.
- [ ] **4.2 Comparación con el juego original en emulador** [avanzado]. Compilar la ROM
  del decomp (`make` en `../pokefirered`), ejecutarla en un emulador con scripting
  (mGBA), reproducir las mismas pulsaciones con la misma semilla y comparar flags,
  variables, equipo, dinero, posición y mapa. Primer objetivo: hasta el final del
  laboratorio de Oak. Entregar antes un informe de viabilidad.
- [ ] Decisión de diseño postgame (tickets de Mew/Deoxys).

## 5. Fuera de la meta principal (después)

Enlace e inalámbrico (tabla `LINK` de `tools/portInventory.py`): combate e intercambio
por cable/RFU, Union Room, Mystery Gift/Wonder Card (bloquea `GetSavedRamScriptIfValid`),
e-Reader, minijuegos multijugador, Battle Records por Cable Club y el enlace de `trade.c`.

## 6. Preparación para Emerald (cuando §3.0 esté en verde)

Empiezan cuando `npm run play:smoke` dé OK en todo lo automatizable, que es la red
que avisa si algo se rompe. Ver [docs/VISION.md](docs/VISION.md) fases 2 y 3.

- [x] **6.1 Informe: separación del motor** [avanzado] — [docs/SEPARACION-MOTOR.md](docs/SEPARACION-MOTOR.md)
  (`ec6f0747`, cifras en `tools/engineSplit.py`). Antes de mover código: permiso para tocar la ruta en `portInventory.py`. Proponer qué va a `core/` y qué a
  `games/firered/`, apoyándose en `refs/emerald/functions.json` (3.677 funciones
  idénticas entre Emerald y FireRed) y en los imports reales de `src/fr/`. Entregar
  la lista de módulos, el orden de traslado en pasos pequeños (cada paso con
  `check:all` y `play:smoke` en verde) y los riesgos. Sin mover código todavía.
- [x] **6.2 Informe: exportador para Emerald** [avanzado] — [docs/EXPORTADOR-EMERALD.md](docs/EXPORTADOR-EMERALD.md)
  (Codex, `58cfe2a9`; cifra de constantes corregida en `54b6157f`). Partiendo del informe R8 de
  `refs/README.md`, proponer cómo parametrizar `tools/decomp/` por juego (rutas,
  `CPP_DEFINES`, `.decomp-build/<juego>`, `public/<juego>/`) sin cambiar lo que genera
  para FireRed: la regeneración de FireRed debe dar archivos idénticos. Sin código todavía.
- [x] **6.3 Informe: nombres simbólicos** [avanzado] — [docs/NOMBRES-SIMBOLICOS.md](docs/NOMBRES-SIMBOLICOS.md)
  (Codex, `3a1b4425`). Qué salidas conservan nombres y propuesta de `symbols.json` y
  tabla de operandos tipados para la fase 6; comandos reproducidos por el revisor.

## 7. Herramientas de diseño (fuera del juego)

No tocan `public/fr/`; salvo cambios mínimos de sandbox de 7.3, no tocan `src/fr/`.
Las tareas de módulos del visor pueden hacerse en paralelo con las secciones 1–4.

- [ ] **6.4 Exportador por juego (Emerald)** — [docs/EMERALD-EXPORTADOR-DIAGNOSTICO.md](docs/EMERALD-EXPORTADOR-DIAGNOSTICO.md),
  [docs/EMERALD-FALTANTE.md](docs/EMERALD-FALTANTE.md). `EXPORT_GAME=emerald` exporta setup, constants, scripts, battlescripts,
  maps, tilesets, objects, data, codegen, structs, audio y cdata; FireRed regenera idéntica (0 archivos cambiados, comprobado tras cada
  cambio). Abierto: `tsconst` (causa hallada, sin confirmar), `incbin` (2.467 `INCGFX_*`; falta compilar `gbagfx` y ampliar la descarga),
  `graphics` (decidir qué fuentes necesita el motor). Los datos exportados no están contrastados con la ROM.
- [x] **7.1 Visor del mundo, versión 1 (Kanto exterior)** [medio] — `7feababe` (rama
  `muse/visor`). Pistas §4.1–4.3 cuadran con datos (sin PISTA INCORRECTA); §6 verificado
  en navegador contra partidas reales (Verde) + capturas de mundo y ficha.
- [x] **7.2 Visor: correcciones y fichas para el modo libre** [básico] — opencode,
  `ee5d81ec`. Zoom, hash, flags y leyenda corregidos; `TRAINER_` y dirección de visión en
  los 164 entrenadores; writers con `addvar`/`copyvar`.
- [ ] **7.3 Visor: "Jugar aquí"** [medio] — [docs/VISOR-MUNDO.md](docs/VISOR-MUNDO.md) §8.
  DIFERIDA: sandbox y clave aparte existen en motor (`4bf12ca1`); falta integrar y
  validar juego completo. Usuario prioriza sandbox creativo 7.6 (sin batallas/historia);
  la exploración libre del viewer no necesita cerrar esta tarea.
- [x] **7.4 Visor: mejoras pequeñas** [básico] — `cd675c45` (rama `muse/visor-2`).
  Puertas nombran interior, buscador legible, zoom redondeado, estado inicial NPC con
  cita (`event_scripts.s:1013`); verificado por punto en navegador.
- [x] **7.5 Visor: animaciones de tiles** [básico] — `58fd3472` (rama
  `muse/visor-anim`). `TilesetAnimator` sin tocar `src/fr/`; flores (5 estados) y fuente
  verificadas contra el juego real; interruptor apagado por defecto.
- [ ] **7.6 Viewer: sandbox creativo persistente** — [docs/VISOR-MEJORAS.md](docs/VISOR-MEJORAS.md).
  Inspeccionar, editar tiles/rellenar huecos, guardar/reabrir y explorar mundo editado;
  Codex C1–C7. Sin batallas/historia; audio/editor y animaciones siguen pendientes.
  C3 base `0c890154`: zoom/scroll, selección/modo/posición/panel en URL y cancelación;
  checks y navegador PASS. C3 parcial: extracción/foco/seguimiento y hash sin recarga.
  Entregas integradas: M1–M9/R1–R5 cerradas; M11 aceptada (`ddd899ae`),
  M10 aceptada tras R6 (`3ac164a7`), revisión en VISOR-MEJORAS §4.
  C2/C7 `6743381e`, M12/R7 `3b3acabc` y M13 `a29c9ae9` integrados en main:
  reloj/loader/eventos, huellas/curvas/41–57 ticks y recorrido arena PASS.
  Profundidad/agua/salto reales y modelo editable siguen pendientes.
  Integración `ebe759c4`: viewer, 1.16/1.17, jobs C5/C6/C8/C13 y revisión B1.
  Tipos/build/honesty y checks focalizados PASS; C8/C13 siguen MANUAL parcial.
