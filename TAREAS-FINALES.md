# Tareas finales del juego de un jugador

> Orden vigente: [hoja de ruta del mundo unificado](docs/HOJA-DE-RUTA.md).
> Esta lista conserva pendientes técnicos y validaciones; su orden histórico
> queda subordinado a esa hoja. Recorrido completo FireRed diferido por el usuario
> (2026-10-21). Las adaptaciones Johto/Hoenn no acreditan fidelidad original.


Lista única de lo que queda del port de un jugador. Cifras vivas en
[PENDING.md](PENDING.md); estado breve en [PORTING-STATUS.md](PORTING-STATUS.md).
Por nombres el juego está completo (lo que falta es enlace, hardware sustituido o
código sin caller en el C); lo pendiente es cerrar la sección 1, revisar contra el C
(2), validar en navegador (3) y recorrer la historia (4).

Meta de producto acordada: el visor en modo navegación debe evolucionar hasta ser
la interfaz del juego completo, incorporando NPC, scripts, historia, combates,
menús y guardado sobre la navegación existente.

## Ahora (actualizado 2026-10-22)

- [x] Accesos web y navegación principal en inglés — `38eda5b3`: Home con Play/Continue,
  World Map/Pokédex y Tools; nueve enlaces de herramientas, móvil 390 px y smoke de
  entradas en Vite/build servido PASS. Resumen de guardado comprobado con checkpoint
  PREPARED sin modificarlo; no valida campaña ni continuidad entre regiones.
  Traducción de pantallas internas entregada en `fd61199e` (línea siguiente).

- [x] UI e inspectores en inglés — `fd61199e`: diálogos adaptados, paneles, menús,
  etiquetas accesibles y expectativas de smoke; capítulos/sprites desde sus
  generadores. Kanto/Hoenn, controles táctiles/390 px y ocho inspectores comprobados
  en Vite/build servido; nombres/IDs, geometría y datos de escenas conservados.
  Johto en ejecución no aprobado por el bloqueo de recursos descrito abajo.
- [ ] **Hoenn antes de elegir Johto**: puente mínimo Emerald en curso; ver auditoría en `docs/HOJA-DE-RUTA.md`. Hoenn ya usa `EngineInteraction` para el circuito mínimo (`76a49c81`); conservar pendientes de cobertura y fidelidad. Sus cinemáticas siguen adaptadas y conservan títulos residuales en español.
  Contrato regional de guardado hecho — `6e2d62a9`: save mundial v2, banco Hoenn por IDs Emerald, migración v1 y `check:region-save` PASS (PREPARED, almacenamiento).
  Save y entrada de mapa Emerald hechos — `67d14da8`: `src/games/emerald/save.ts` (event_data.c + estadísticas de overworld.c; brecha del núcleo 903→834) y `src/viewer/hoennMapEntry.ts` (ClearTempFieldEventData Emerald, ON_TRANSITION y ON_LOAD por la VM del núcleo sobre `/emerald/scripts.bin`, efectos en el banco Hoenn). `check:hoenn-map-entry` PASS (Littleroot, PREPARED).
  Circuito mínimo hecho — `76a49c81`: NPC/cartel Oldale, tienda original con condiciones, enfermera, ON_FRAME de Ruta 101, encuentro Emerald y combate sobre motor FireRed, guardar/continuar; `check:hoenn-circuit` PASS (PREPARED, sin render).
  Ferry y revisión focalizada hechos — `8aba7d5d`: guarda salida/llegada, Home Continue abre región activa; objetos Hoenn y marineros fuente visibles. Chromium PASS: ida/vuelta con equipo/bolsa/dinero y aislamiento, rechazo al fallar almacenamiento, Continue/recarga; circuito NPC/compra/curación/pasos en hierba/combate con experiencia/guardar/Continue. Entrenador y posiciones de cada parada PREPARED; no prueba caminata continua ni campaña. Evidencia local: `output/playwright/regional-travel/` y `output/playwright/hoenn-circuit/`.
  Recorrido continuo hecho — `299ece60`: Chromium PASS desde ferry Kanto por Slateport/Centro/tienda/Ruta 110, victoria con experiencia, derrota natural y regreso a Kanto; guardar/Home Continue conserva posición y resultados. Solo entrenador inicial junto al ferry PREPARED, sin escrituras de posición/HP/dinero/progreso entre paradas; sin comandos/specials sin implementar en ese recorrido. Emerald pierde la mitad del dinero y reaparece en el warp exterior del Centro visitado; Kanto conserva su recuperación (regresión Chromium PASS). `check:hoenn-circuit` comprueba 120 frames, división impar, flags/clima fuente y una sola recolocación. Tres cuerpos C Emerald nuevos fuera del inventario FireRed: `DoWhiteOut`, `Overworld_ResetStateAfterWhiteOut`, `UpdateCyclingRoadState`; delta FireRed 0 nuevos/0 equivalencias. Evidencia: `output/playwright/hoenn-continuous/`.
  **Sin validar:** otros recorridos/regiones, fidelidad audiovisual (incluidos sprites/recursos de combate frente a la fuente), móvil real y producción; un save v1 ya contaminado con flags Emerald conserva esos bits en Kanto si tenía inicio Kanto (no separables; se anota en `world.migration`). Johto: guardar se rechaza hasta tener banco propio. Entrada de mapa Hoenn sin navegador: twin de Littleroot reubicado y presencia por flags no vistos en pantalla; ON_LOAD `setmetatile` puede chocar con los puzzles adaptados de `hoennMechanics.ts` (gimnasios de Petalburg/Mauville).
  Pendientes del puente (circuito mínimo cubierto; resto sin cerrar):
  - ON_WARP_INTO_MAP_TABLE y ON_FRAME_TABLE conectados en `76a49c81`; ON_FRAME de Ruta 101 comprobado. Falta revisar el resto de eventos/mapas; las ventanas y combate conservan recursos de respaldo FireRed (`gMenuMessageWindow_Gfx` entre ellos). Resto de `LoadMapFromWarp` omitido: cabecera de `hoennMapEntry.ts`.
  - Tabla de comandos (P1, 2026-10-22; `24ea031f`): quedaban 6 `ScrCmd_*` de Emerald (los otros cuatro ya estaban conectados); portados `warpwhitefade`, `messageinstant`, `selectapproachingtrainer` y `lockfortrainer` con `DoWhiteFadeWarp`, `FreezeForApproachingTrainers` y los accesores de trainer_see.c (solo un entrenador que se acerca; el doble acercamiento de Emerald sigue abierto). **`fadescreenswapbuffers` hecho (P1b, `c93e4b29`)**: copia `gPlttBufferUnfaded`↔`gPaletteDecompressionBuffer` (hw/palette.ts) y espera `IsPaletteNotActive`; ADAPTATION: `FadeScreen` es el fade overlay de `ScrCmd_fadescreen` porque el renderer de campo no dibuja desde los buffers de paleta (la paleta aparcada no tiene efecto visible); `check:hoenn-circuit` ejecuta el comando. **Bloqueado `pokenavcall`**: su cuerpo C es `ShowPokenavFieldMessage` → `StartMatchCallFromScript` → tarea `ExecuteMatchCall` (match_call.c, 8 estados que mueven BG0 con `ChangeBgY`, ventana de tiles 0x270 e icono `Task_SpinPokenavIcon`); los gráficos ya están exportados (`sMatchCallWindow_*`, `sPokenavIcon_*`), pero el campo dibuja el cuadro de mensaje con la clase canvas `Window` y no compone BG0/tilemap ni ese sprite giratorio, así que portarlo exige un adaptador visual propio (7 scripts/10 usos: Route104/119, Lab de Birch, Space Center, Gym Rustboro, Mauville). Un comando sin cuerpo ya no desalinea bytecode: `context.ts` lanza `UnsupportedScriptCommandError` (`01ea98b6`).
  - Specials Emerald (P1; `14947a7a`): 23 de `field_specials.c` portados (`src/games/emerald/specials.ts`: banderas, estadísticas del líder, IV rater, `ShakeCamera`…). Con contenido Emerald solo se ejecutan 18 homónimos FireRed de cuerpo idéntico según `refs/emerald/functions.json` (`FIRERED_SPECIALS_SHARED_WITH_EMERALD`); cualquier otro nombre lanza `UnsupportedScriptSpecialError` en vez de devolver 0, y la tabla se vacía al cargar Kanto. Faltan ~437 de los 527 specials de `scripts.json` que usan scripts: familias por archivo C (field_specials restante, lilycove_lady, tv, secret_base, contest_util, mauville_old_man, battle_setup `ShouldTryRematchBattle` (77 usos), cable_club, party_menu, daycare, berry…). Bloqueados por falta de estado: reloj (`gLocalTime`: Pacifidlog TM, `GetWeekCount`, time_events), save de Emerald sin frontier/fan club/dewford trends, retos Cycling Road (`gBikeCollisions` + `DetermineCyclingRoadResults`) y `ResetHealLocationFromDewford` (tabla de heal locations Emerald).
  - [x] Special var 0x8015 — `8116c5c5`: `VAR_TRAINER_BATTLE_OPPONENT_A` alias de `gTrainerBattleOpponent_A` (`specialVarAliases`); `setorcopyvar` de PetalburgCity_Gym comprobado en `check:hoenn-circuit`. Las 21 special vars restantes siguen de la VM FireRed.
  - [x] Bayas Emerald (P3.3, commit de bayas): `src/games/emerald/berry.ts` porta `berry.c` (estado `save.berryTrees` en el banco regional, `PlantBerryTree`, `BerryTreeGrow`/`BerryTreeTimeUpdate`, rendimiento con `Random()`, Enigma válida, los `ObjectEventInteraction*` de pick/plant/water/get-data, `PlayerHasBerries`, `IncrementDailyPicked/PlantedBerries`) y `ScrCmd_setberrytree` real (también para scripts FireRed; antes era un no-op). `runEmeraldMapEntry` crea el banco de árboles y ejecuta `EventScript_ResetAllBerries` por la VM en la primera entrada de un banco sin `berryTrees`; `initializeHoennSessionFlags` sigue siendo ADAPTATION solo de la lista de `setflag` de `EventScript_ResetAllMapFlags` (el visor lee presencia de objetos antes de cualquier entrada). Crecimiento: `src/games/emerald/clock.ts` (`DoTimeBasedEvents` = solo `UpdatePerMinute`, reloj de pared como RTC [ADAPTATION], gated por `FLAG_SYS_CLOCK_SET`, que solo pone `StartWallClock`). `check:emerald-berry` compara los cuerpos C compilados (600 escenarios/3.286 instantáneas con RNG, Enigma, `CalcTimeDifference`); `check:hoenn-circuit` ejecuta `BerryTreeScript` en Ruta 102; Chromium `emerald-berry-tree.job.mjs` PASS (recoger, Guardar, Home Continue). **Sin portar:** `Bag_ChooseBerry` (modo de bolsa para elegir baya: plantar), `DoWateringBerryTreeAnim` (fotogramas de riego del avatar), el movimiento `BerryTreeGrowth` de `event_object_movement.c` (sprites por baya/etapa, destello `BERRY_FLAG_SPARKLING`, `SetBerryTreesSeen`), `UpdatePerDay` de `clock.c` y `StartWallClock`/`InitTimeBasedEvents` (UI del reloj); los scripts de plantar/regar se detienen en esos specials. Sin validar: sprites de árboles en pantalla.
  - Movimiento (P1; `51e65529`): el contrato `emerald_movement_contract.py` compara ahora los helpers alcanzables (lista revisada `REVIEWED_HELPER_DIFFERENCES`); `WALK_SLOW_*` de Emerald (mueve cada dos fotogramas) pasa a `WALK_SLOWER_*` de FireRed y `FACE_PLAYER/FACE_AWAY_PLAYER` se aceptan (solo llaves). Tipos 68–75 coinciden en comportamiento con FireRed por número (JOG/RUN ↔ WALK_IN_PLACE_FAST/JOG) y el límite superior de `MovementType_WalkInPlace` ya incluye `RUN_IN_PLACE_RIGHT`; 77–80 son `MovementType_WalkSlowlyInPlace` con su dirección inicial fuente. **Acciones regionales (P1b, `4a5aabe1`)**: de las 37 sin cuerpo, 12 pasan a compartidas con FireRed tras comparar cuerpos con `MOVE_SPEED_*`/`DISPLAY_HEIGHT` resueltos de ambos decomps, renombres WalkSlow→WalkSlower y macros de sprite acotadas (acro pop/wheelie moves, `FLY_UP/DOWN`, `WALK_DOWN_(START_)AFFINE`) y 21 se portan en `games/emerald/regionalMovement.ts` (diagonales normal/lenta, acro end-wheelie moves, afines izq./der., figura 8, levitar ×3, reflejo ×2, `RESTORE_ANIMATION`; Lock/Unlock ya existían). `check:emerald-regional-movement` compara contra trazas del C original compilado (UpdateWalkSlowAnim, AnimateSpriteInFigure8, ApplyLevitateMovement) y recuentos/vectores leídos de la fuente; PREPARED objeto desnudo, sin mapa/colisión/render. **Siguen rechazadas 2**: `EMOTE_HEART` (FLDEFF_HEART_ICON; el export de fieldfx Emerald tiene `emoticons` nulo, lo que además deja sin gráfico las emotes `!`/`?` compartidas en Hoenn) y `REVEAL_TRAINER` (cuerpos Emerald de trainer_see.c: disfraz de árbol/montaña y entrenador enterrado). Por validar en pantalla: ninguna de las 21.
  - Specials que bloquean P3 (scripts fuente; tras P3.1–P3.3, 2026-10-22): **Mossdeep** (14 mapas): `GetWeekCount` (reloj: `gLocalTime` ya existe en `emerald/clock.ts`, falta `GetWeekCount`/VAR_DAYS), `ChooseHalfPartyForBattle`, `ReducePlayerPartyToSelectedMons`, `SavePlayerParty`, `LoadPlayerParty`, `DoSpecialTrainerBattle`, `CheckPlayerHasSecretBase`, `GetSecretBaseNearbyMapName`, `GetPokeblockNameByMonNature`. **Trick House 6/Fortree**: `RotatingGate_InitPuzzle`, `RotatingGate_InitPuzzleAndGraphics` (`rotating_gate.c`; hoy detienen `Route110_TrickHousePuzzle6_OnTransition` y `FortreeCity_Gym_OnTransition`). **Bayas**: `Bag_ChooseBerry`, `DoWateringBerryTreeAnim`. Hechos: Cycling Road, `ShouldTryRematchBattle`, `PlayerFaceTrainerAfterBattle`, `GetPlayerAvatarBike`, `DrawWholeMapView`, `IsPokerusInParty`, `BufferUnionRoomPlayerName`, `ObjectEventInteraction*` de bayas. `npm run check:emerald-map-entries -- --all` lista cada mapa Hoenn cuya entrada se detiene por un special/comando ausente (volcado 2026-10-22 en la carpeta de notas de la sesión: 87 de 518 mapas se detienen (431 entran); Mauville y Lilycove Centros, Rutas 111/118/119/120/123/130, Gimnasio de Sootopolis, Shoal Cave, Trainer Hill/Frontier, etc.).
  - [x] Respawn inicial y reparación del banco Hoenn — `627fafc9`: `session.ts` usa el warp fuente de Slateport para el viajero del ferry adaptado, con datos cargados antes de entrada/Continue. Procedencia: Emerald `InsideOfTruck` asigna la casa inicial; `SSTidalCorridor_EventScript_ExitSlateport` asigna Slateport al desembarcar. La elección para Kanto es ADAPTATION, sin historia inventada; solo sustituye el warp vacío FireRed y conserva respawns registrados. Chromium PASS desde ferry hasta Ruta 110 sin entrar en Centros: derrota natural, respawn exterior (19,20), curación, mitad del dinero, guardar/Home Continue antes y después, regreso Kanto con flags/vars/respawn aislados. PREPARED solo checkpoint `lab-done` (equipo original nivel 5 con salud completa) colocado junto al ferry; ninguna escritura de estado entre paradas. `check:region-save` PASS de banco nuevo, reparación antigua, preservación de respawn registrado y aislamiento Kanto. Evidencia: `output/playwright/hoenn-first-respawn/`; delta inventario 0 nuevos/0 equivalencias, adaptación sin cuerpos C nuevos.
  - [x] Puzzle giratorio fuente — `9201e625`: `rotatingTilePuzzle.ts` porta las seis funciones de `rotating_tile_puzzle.c`; cuatro `ScrCmd_*` conectados. `rotatingTileMovement.ts` porta LockAnim/UnlockAnim/FindLockedObjectEventIndex de `event_object_movement.c` y traduce explícitamente los IDs usados; acciones internas fuera del rango byte en el dispatcher FireRed, con regresión de scripts/acciones PASS. Retirado contador/sonidos de interruptores adaptados del visor; adaptación de teletransportes conservada. `check:emerald-rotating-tiles` PASS: 1.447 casos de puzzle y 41 operaciones de bloqueo contra cuerpos C originales; nueve scripts de coordenadas exportados (cinco Mossdeep/cuatro Trick House), 35 desplazamientos de plantillas y esperas/desbloqueo. PREPARED mapas/entrada/objetos retenidos para el harness, sin render; no acredita recorrido visual ni campaña. RedButton de Trick House está marcado Unused y no tiene caller de coordenadas: no son diez interruptores alcanzables. **Pendiente:** recorrido visual completo/colisiones y teletransportes fuente (`warpmossdeepgym`), traducción general de movimientos y resto de comandos. Delta inventario FireRed 0 nuevos/0 equivalencias; 13 cuerpos C Emerald nuevos fuera de él (6 puzzle, 4 comandos, 3 bloqueo).
  - [x] Buffers de texto Emerald — `f8321b31`: tres comandos ausentes (clase/nombre de entrenador y concurso), cuerpo regional de decoración y cinco helpers C conectados; exportación fuente por IDs de textos estándar/decoración/concurso/bayas. Correcciones de plural Emerald y expansión inmediata de `vbuffermessage` compartido; FireRed conserva su comando decoración vacío fuente.
    `check:emerald-script-text` PASS: 4.112 casos contra cuerpos C originales, cuatro prefijos de scripts fuente (Match Call, concurso, silla/mesa de taller) y buffers virtuales con desplazamiento; PREPARED entradas/tablas, sin render ni validación de esos sistemas completos. Exportación determinista y rechazo de expresiones/tablas incompletas comprobados; tipos/honestidad/build/script PASS.
    Delta inventario FireRed 0 nuevos/0 equivalencias; nueve cuerpos C Emerald nuevos fuera de él (tres comandos antes ausentes, decoración y cinco helpers), dos correcciones sin delta. Quedan diez comandos ausentes; Mossdeep necesita conservar plantillas mediante `SetObjectEventLoadFlag` y conectar el warp fuente al puente del visor antes de retirar su adaptación; resto de pendientes conservado.
  - [x] Persistencia del puzzle Emerald — `b62faba9`: Continue restaura las plantillas guardadas y sus scripts fuente, conserva TEMP y omite ON_TRANSITION/warp-in; la primera actualización del visor ya reconoce el mapa restaurado. Poses activas y `movementType` de plantillas se conservan por separado; entrar normalmente repone plantillas fuente, como Emerald.
    `check:emerald-rotating-tiles` PASS con los nueve scripts fuente: guardar/Continue, guardar Kanto con Hoenn aparcado y volver a continuar Hoenn, posiciones/orientaciones de objetos retenidos y plantillas, equipo/bolsa/dinero/progreso, siguiente pulsación cotejada con C y reinicio por entrada normal. Se mantienen los 1.447+41 casos C y 35 desplazamientos iniciales; PREPARED entrenador, almacenamiento y entrada/objetos del harness, sin preparar resultados.
    Chromium PASS: pulsación real del interruptor amarillo en Mossdeep y Trick House 7, Save/Home Continue/segundo Save/Load saved game en el mismo mapa/recarga; posiciones y orientaciones fijas conservadas, LOOK_AROUND puede volver a girar con el tiempo. Solo entrenador `lab-done` y casilla inicial contigua PREPARED; sin escrituras de resultado tras entrar. Regresión del ferry ida/vuelta, fallo de almacenamiento y Home Continue PASS. Evidencia local: `output/playwright/emerald-puzzle-continue/` y `output/playwright/emerald-puzzle-travel-regression/`.
    Delta FireRed 0 nuevos/0 equivalencias; 0 cuerpos C Emerald nuevos, corrección del adaptador. El aislamiento del puzzle entre bancos se comprueba en almacenamiento; no acredita caminar del puzzle al ferry, completar ambos puzzles ni paridad audiovisual. Siguen pendientes teletransportes fuente/`SetObjectEventLoadFlag` para el warp de Mossdeep y demás movimientos/comandos.
  - `UpdateCyclingRoadState` fuente conectado en `299ece60` como dependencia crítica de ON_RESUME de Ruta 110; guardia y estados 0–4 probados con precondiciones PREPARED. El reto Cycling Road completo sigue sin cerrar: anterior warp del visor, música guardada, reloj/colisiones de bici y restantes specials necesitan integración/revisión; no se simulan para ampliar el circuito.
  - [x] Cycling Road completo (P3.1, `b4284d2c`): `src/games/emerald/cyclingRoad.ts` porta `Special_BeginCyclingRoadChallenge`, `FinishCyclingRoadChallenge`, `GetRecordedCyclingRoadResults`, `DetermineCyclingRoadResults`, `RecordCyclingRoadResults`, `ResetCyclingRoadChallengeData`, `GetPlayerAvatarBike`, `Bike_TryAdvanceCyclingRoadCollisions` (+ `UpdateCyclingRoadState` movido aquí) y `string_util.c` `ConvertIntToDecimalStringN` de Emerald (relleno `CHAR_SPACER` 0x77, distinto del de FireRed); `battle_setup.c` `ShouldTryRematchBattle` (`gRematchTable` por cdata `em:battle_setup`, el cdata `battle_setup` normal es el de FireRed) y `trainer_see.c` `PlayerFaceTrainerAfterBattle` (solo acercamiento de un entrenador; `gTrainerApproachedPlayer` nuevo en `core/field/trainerSee.ts`, `SetMovingNpcId` exportado). La entrada de mapa Hoenn (`hoennMapEntry.ts`) ahora fija `gLastUsedWarp` con la ubicación que se deja (Continue: vacío), ejecuta `ResetCyclingRoadChallengeData`, `Overworld_ClearSavedMusic` antes de ON_TRANSITION (restaura `savedMusic` en Continue y lo guarda en el banco) y ON_RESUME (`CableClub_OnResume` se omite: su único cuerpo es `special InitUnionRoom`, wireless, ADAPTATION de alcance). El visor suma una colisión por golpe de bici en Hoenn, reproduce `savedMusic` y no deja bajar de la bici con `FLAG_SYS_CYCLING_ROAD` (también `FieldUseFunc_Bike`). ADAPTATION: `gMain.vblankCounter1` = `viewerClock.tick` (se detiene con el visor suspendido/menús del motor). `check:emerald-cycling-road` compara los cuerpos C compilados (312 + 7 + 240 + 628 casos con vars/flags/contadores PREPARED; mutación `CHAR_SPACER` detectada) y `check:hoenn-circuit` recorre entrada Ruta 110 (restart/música/ON_FRAME/ON_RESUME). **Sin validar en navegador:** carrera completa en bici por Ruta 110, colisiones reales y reloj. Specials del recorrido de Ruta 110 sin portar: ninguno restante.
  - [x] Mossdeep/Trick House (P3.2, `a1bba9e9`): `GetInteractedMetatileScript` de Emerald (`fieldControlAvatar.ts`; las ramas de mobiliario de base secreta paran con error) conectado a las pulsaciones A del visor Hoenn (TV, PC, estanterías, puerta de Trick House…); `check:emerald-metatile-scripts` lo compara con el despachador C (2.560 casos). Corregido: `hoennMapEntry` dejaba `FieldMap.onChange` vacío tras ON_LOAD, así que los `setmetatile` posteriores (puerta del puzzle) no llegaban al visor, y `generated/metatileBehavior.ts` no declaraba `CONNECTION_NORTH` (`step_codegen.py` emite ahora `CONNECTION_*`; `IsPlayerFacingWirelessBoxResults` lanzaba ReferenceError al primer A). Specials `IsPokerusInParty`/`BufferUnionRoomPlayerName` (los scripts de las enfermeras Hoenn terminaban con error) y `DrawWholeMapView` (equivalencia). Chromium `emerald-trickhouse-exit.job.mjs` PASS: puerta de salida del puzzle 7 (A), sala End, recompensa de la Trick Master (nivel 6→7), Corredor, Entrada y Ruta 110, Guardar/Home Continue; PREPARED entrenador, `VAR_TRICK_HOUSE_LEVEL`=6, `VAR_TRICK_HOUSE_PUZZLE_7_STATE`=1 (pergamino) y la casilla bajo la puerta. **No cubierto:** resolver el puzzle 7 (seis entrenadores) y el paseo hasta el ferry: al sur de la Casa Truco la Ruta 110 está bloqueada por los Team Aqua (flag 900, que apaga el evento del Museo Oceánico) y por sus entrenadores; Mossdeep hasta el ferry (la Isla del ferry es Slateport) no se intentó; `hoenn-circuit-browser.job.mjs` falla desde antes (su `position()` deja `location` desfasada y Continue lo rechaza). `check:emerald-map-entries` barre la entrada de los mapas del circuito.
  - Tanda 4 (P3.4): lo que 1–3 exigían del resto de `LoadMapFromWarp` ya está (`gLastUsedWarp`, `ResetCyclingRoadChallengeData`, `Overworld_ClearSavedMusic`, ON_RESUME, `DoTimeBasedEvents` parcial); siguen sin ejecutarse `CheckLeftFriendsSecretBase`, `TrySetMapSaveWarpStatus`, `TryUpdateRandomTrainerRematches`, `SetSavedWeatherFromCurrMapHeader`, `ChooseAmbientCrySpecies`, `SetDefaultFlashLevel` y el movimiento de roamers.
- [ ] **Recurso de exploración Johto**: `world.html?region=johto#modo=explore`
  solicita `/hns/fieldfx.json`, ausente del exportador actual de mapas HnS. Vite
  devuelve HTML y falla la lectura JSON; cargador no modificado en `fd61199e`.
  Resolver manifiesto y frames desde la fuente correspondiente y repetir
  `web-english.job.mjs` antes de ampliar la integración; no sustituir por gráficos
  de otra fuente sin justificar la adaptación.

Puntos 1–8 cerrados y probados con smoke jobs (`tools/playtest/smoke/viewer-game-*`):
Centros, tiendas (Kanto, Sete, Isla Dos por etapas, Casino), combates salvajes y de
entrenador, captura, menús (equipo, mochila, Pokédex, tarjeta, Opciones, guardar),
los ocho gimnasios, MO de campo, veneno, huevos, merodeador, fantasmas de la Torre,
cuevas (Golpe Roca, Fuerza, Islas Espuma) y controles táctiles. Detalle en Git
(commits del 2026-10-16 al 2026-10-18).

### Decisiones que esperan al usuario
1. **Quest Log en el visor.** El C graba escenas al cambiar de mapa y la entrada del
   jugador por frame, y la reproduce con el mapa del motor; el visor mueve al jugador
   sin el motor. Opciones: grabar desde el visor y reproducir con el motor a pantalla
   completa, o dejar el Quest Log solo en el juego independiente (allí funciona,
   `questlog-continue` PASS).
2. [x] **Estado de vídeo del mapa.** Portados `InitOverworldBgs` / `InitOverworldGraphicsRegisters` (`c271686c`).
3. [x] **Historia (punto 9) e inicio definitivo (11)**: integrados en visor (`7a46461a`, `93927c7b`). Revisión general (10) en curso.
4. [x] **Visor exploración (audio, atmósfera y pulido visual)**: Bici/surf y gritos ambientales (`afa7efab`), clima (lluvia, tormenta, niebla), cueva oscura (Flash), banner deslizante MapNamePopup y corte parpadeante de batalla (`bc8a4a59`).
5. [x] **Vida del mapa y técnicas de campo**: Movimiento autónomo de NPCs (`83779086`, deambular fiel según `movementType` sin atravesar paredes) y scripts canónicos de campo (Corte, Golpe Roca y Snorlax vía `EventScript_*` oficiales).
6. [x] **Sistemas GBA en el visor**: Proyección a pantalla completa de la escena de evolución (`evolution_scene.c`) y máquinas tragaperras (`slot_machine.c`) con aspect ratio nativo 3:2; contador de bolas y pasos de la Zona Safari en el HUD superior (`safari_zone.c`, commit `002d5454`).
7. [x] **Progresión lineal de historia en el visor**: Triggers por pasos y eventos de coordenada (`tryStartStepBasedScript`), escenas inmediatas de entrada (`OnFrame` en laboratorios, tiendas y eventos) y soporte multiobjeto en cinemáticas (`067c7d6a` engineInteraction.ts, main.ts, session.ts).
8. [x] **Mecánicas parciales de puzzle Hoenn, cinemáticas adaptadas e interiores (sin campaña Emerald integrada)**: Pendientes de lodo resbaladizas (`ForcedMovement_MuddySlope` en Ruta 115 y Desfiladero), aceleración de Mach Bike a velocidad 4 (`sMachBikeSpeeds`), suelos agrietados (`CrackedFloorPerStepCallback` en Pilar Celeste y Torre Espejismo con colapso y caídas por hoyo a pisos inferiores), cinemáticas con temblores de pantalla, destellos y gritos (Rayquaza en Sky Pillar Top, Kyogre vs Groudon en Sootopolis, retumbos en Cueva Origen) y entrada/salida completa a casas y edificios de Hoenn (commit `1e92d673`).
9. [x] **Interacciones adaptadas de Johto en el visor (entrega histórica; fidelidad original y ejecución actual pendientes)**: Iniciales de Johto en el laboratorio de Elm (Chikorita, Cyndaquil, Totodile), objetos del suelo de tabla manual e inspección de interiores (NES, PC, máquina curativa), combates salvajes en hierba/agua (`JOHTO_WILD_MONS`), curación con Enfermera Joy y fanfarria `MUS_HEAL`, tiendas Poké Marts con catálogo por categorías y regalo de Honor Ball por 10 Poké Balls, y combates de entrenadores en rutas con campo de visión (Joven Joey, Mikey, Don, Wade) y recompensa económica (commits `71b1e7bd`, `b492c226`, `5b60112e`, `7d75b090`).

### Pendientes concretos (de fácil a difícil)
- [ ] Ganar a Brock con el inicial sin preparar el nivel (hay que entrenar; el inicial
  temporal es aleatorio).
- [ ] Probar los controles táctiles en un móvil real.
- [ ] Colores con la ROM: índices 4–7 de la ventana de guardado en la `Window` del TS;
  rótulos y orden de pantallas del motor a pantalla completa (necesita el arnés mGBA
  con la pantalla desbloqueada). Sin intentar (2026-10-22): el arnés mGBA requiere computer-use y la pantalla desbloqueada; no disponible en esta sesión.
- [x] `check:anims` paquete espurio pokeball: eliminado de `preloadPacks` (commit `b1e424eb`).
- [ ] Fondos de animaciones de combate (Atracción, Cara Susto) tras `03b95346`. 2026-10-22, headless sin render: el tilemap de BG1 en VRAM (bloque 28) iguala `gBattleAnimBg_AttractTilemap` y `gBattleAnimBgTilemap_ScaryFacePlayer/Opponent` (lado según el objetivo, como el C), los tiles quedan en el char block 1 que lee BGCNT y `check:anims` pasa tras reparar su mock de `fetch` (`7264a013`). Falta la comparación visual; además `GetBgAttribute(1, CHARBASEINDEX)` da 0 durante la animación frente a `charBaseIndex = 1` de la plantilla (los tiles quedan en 0x4000, no en 0x8000 como sugiere `LoadBgTiles` del C): revisar `SetAnimBgAttribute`/config de BG1.
- [x] Icono con colores erróneos en la página de zona/tamaño de la Pokédex (soporte de `ref.index` y 32 bytes en `symBytes`/`symPalette`, commit `e2deeb58`).
- [x] Recolocación tras whiteout: serialización con `relocateChain`/`changeWorldChain`, protección con `warpBusy` y restauración de `TrySetMapSaveWarpStatus` (commit `5bf0a20e`).
- [ ] Objetos que el motor oculta o mueve al final de un script: puente y guardado hechos
  (`f5e80a9c`..`d5986c54`); falta recorrerlo con los scripts de la historia.
- [x] Scripts de transición de mapa fuera de los Centros (p. ej. `Route20_OnTransition`):
  integrados en visor en `7a46461a` (punto 9).
- [ ] Al probar con Playwright, reiniciar el servidor de desarrollo tras editar `src/`
  (la recarga en caliente duplica módulos y da fallos falsos).


## 0. Cómo trabajar

Lee esta sección entera y después **solo la tarea que vayas a hacer**. Si algo choca
con [AGENTS.md](AGENTS.md), manda AGENTS.md.

### Orden
La sección «Máxima prioridad vigente: puntos 1 a 8» manda sobre el orden histórico
de abajo. Los puntos 9–11 requieren una nueva petición expresa del usuario.

Orden histórico para cuando el usuario autorice retomarlo:
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
- C: `../pokefirered/src/<archivo>.c`. Port TS: `src/games/firered/`.
- Datos generados (`src/games/firered/generated/`, `public/fr/`): **no se editan a mano**.
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
- [x] 1.6 Clima: niebla (Torre Pokémon 3F) y sombra (Bosque Verde) validadas en mapas (commits `98725298`)
- [x] 1.7 Evolución tras intercambio con NPC (`TradeEvolutionScene`) — `a061b06e`.
- [x] 1.8 Grabación del Quest Log: buffer de 32 acciones — `1431d1cc`. Diferencia estructural en §2.
- [x] 1.9 Créditos: tiles animados, cámara en espera, duraciones — `f926b597`, (commits `91b2e504`, `061b9206`, `ab6dbcd9`, `63bfecc8`)
- [x] 1.10 Audio M4A: ADSR, duty, sweep, keysplit, reverb, coros — `98725298`. Falta escucha humana (C13).
- [x] 1.12 Flores y agua animadas (`Math.trunc` en `tileRenderer.ts`) — `0bf58c37`.

Abiertas:
- [x] 1.11 `check:questlog-battle` comprueba eventos de un jugador en escenas guardadas (`87675830`). Los eventos de enlace se excluyen por alcance.
- [x] 1.13 Animaciones de tiles compartidas entre campo y créditos; agua verificada en ambos (`10c5c535`).
- [x] 1.14 Falsa alarma: el juego sí abre el PC; la prueba pulsaba A una sola vez. C8 ahora (commits `fbb30c01`)
- [x] 1.15 Registros BG del campo (`hw/bgRegs.ts`): declarados sustituidos por Canvas, por
- [x] 1.16 **Poké Ball desde la mochila en combate** [medio]. Era fallo del driver, (commits `927c206c`)
- [x] 1.17 **Brock inicia el combate con `H.talk`** [medio]. Era fallo del juego: (commits `3b709ab5`, `caa6885d`)
- [x] 1.18 **MOVE ITEMS con caja vacía rompe el PC** — `1a767524`. El C escribe por un puntero NULL (región BIOS, escritura

- [x] 1.19 **Marcas de bicicleta del motor** — `7af1dae9`. La tabla se indexaba `[previous][facing - 5]` (índice

- [x] 1.20 **C8 persistencia y salida del PC**: Flash 0d982c02 integrada en
- [x] 1.21 **Continue con escenas Quest Log**: 4ce0ab7f restaura índice de objetos,
- [x] 1.22 **Persistencia de NPC y objetos dinámicos** — `bab7d84a`: SaveObjectEvents/LoadObjectEvents copian los 16 slots y campos C; SAVE normal conserva el mapa sin activar el warp especial; continue y retorno de Quest Log restauran registros antes de recrear sprites. Dos cuerpos C nuevos en `load_save.c` (archivo ya cubierto por navegador; delta del indicador 0), cero equivalencias. Check `tools/checks/objectEventSave.ts`: 53 campos C, slots inactivos, copias independientes, s16 y rechazo de registros incompletos. Job `object-event-save.job.mjs` con/sin `OBJECT_SAVE_PLAYBACK=1`: NPC movido por held movement, invisibilidad/dirección bloqueada y objeto runtime ausente de templates persisten; playback2→3→0 y movimiento posterior PASS. Entradas PREPARED declaradas; guardados antiguos sin snapshot usan templates y no recuperan posiciones históricas perdidas. Revisión manual del usuario y paridad audiovisual completa pendientes.
- [x] 1.23 **H.heal reporta menú ausente tras curar**: 6fc39013 observa el
- [x] 1.24 **Driver conserva reserva curable al agotarse ataques del activo**:
- [x] 1.25 **Menú de cambio del driver**: c8ccc36f reproduce activo vivo y
- [x] 1.26 **Ruta4 sin path en el driver**: c8ccc36f corrige planificación

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
- [x] **DRV-03 — Entradas y ejecución acotada.** 6d693641/51cd5646: pasos de
- [ ] **DRV-04 — Navegación y recursos por capacidades.**
  Revisar cobertura a pie, NPC/obstáculos, ledges, puertas/conexiones y recuperación
  con HP/PP/medicinas/reemplazos. Corregir fallos necesarios para Celeste y declarar
  límites posteriores (Surf/bici/empujes/movimientos forzados); no asumir que están
  ausentes del motor. Terminada con casos acotados y parada diagnosticada ante
  estado no soportado, sin bucles de curación ni repetir la historia completa.
- [x] **DRV-05 — Checkpoints y exportación segura.** 2e78b7df: SAVE por UI, (commits `bab7d84a`)
- [ ] **DRV-06 — Gate de regresión del driver.** Con contratos
  aceptados, integrar checks/jobs focalizados existentes y los casos faltantes
  aprobados en un comando acotado. Terminada con exit no exitoso ante fallo,
  MANUAL/NOT RUN separados, trazas de estado/acción/recurso y cobertura enlazada
  a DRV-01. No ejecutar toda la suite del juego por cada cambio.
- [x] **DRV-07 — Continuación de historia.** `30ac65b9`/`78e781ad`: el job guarda un (commits `77005743`)

- [x] **DRV-08 — Aprendizaje, evolución, fuerza y entrenamiento** (`40140bf1`, `7ade4328`):
- [x] **DRV-09 — Entrenamiento largo contra el rival de Celeste.** `98dc7ab1`: entrenamiento natural hasta favorable (Pidgeotto20/Ivysaur19), checkpoints por ronda conservados y reanudación por archivo; rival vencido después por UI. No acredita origen del guardado importado ni repetibilidad de toda la historia.
- [ ] **DRV-10 — `driver-navigation` depende del azar.** Su caso de debilitamiento forzado
  espera que el rival derribe a un líder con 1 PS; falló 1 de 4 ejecuciones (liveHp 1).
  Fijar una entrada que garantice el debilitamiento o aceptar ambos desenlaces.

- [x] **DRV-11 — Reconstrucción del driver, fases 0–4** (Sonnet, `22ce04c7`…`6b30760e`): catálogo de
- [ ] **DRV-12 — Pantalla "mensaje de derrota" sin manejador.** Tras un whiteout, la tarea de
  `Task_RushInjuredPokemonToCenter` (overworld.ts) imprime gText_PlayerScurriedToCenter, que termina en
  `\p`: la impresora queda en estado 2 (CLEAR) esperando A y `recognize()` la llama `field-busy`, así que el
  bucle no avanza (atasco del Centro de Ruta 4 en `random-walk`). Reproducido: `frGame.whiteOut()` y una A
  llevan al diálogo de la enfermera. Falta pantalla + manejador + caso en `screen-catalog`; C7 no está en el gate.
- [ ] **DRV-13 — Tests de combate dependientes del azar.** `driver-navigation` (caso opcional),
  `driver-switch` y `driver-recovery` fallan de vez en cuando y pasan al repetir; hacerlos deterministas
  sin perder lo que comprueban.
- [x] **DRV-14 — Modo manual y replay, fase 1**: `5de398c3`, 10×10.000 fotogramas con observación idéntica, sin rAF espontáneo; entrada/semilla alteradas detectadas, lotes y waits exactos, teclado aislado y arranque normal comprobados.
- [ ] **DRV-15 — Ampliar determinismo**: cargas/continuaciones, audio lógico, intro/título, observación de combate y savestates; contrastar el consumo RNG por VBlank con C. DRV-10/13 siguen abiertos; investigar por separado `Quest Log palette backup is not initialized` al continuar `cerulean-arrival` (diagnóstico 2026-10-08).
- [ ] **DRV-16 — Extender recorrido y cobertura de opciones.** `98dc7ab1` deja Ruta5 comprobada; `aa681ccd` (Ruta5→Carmín, checkpoint `vermilion-arrival-*`) y `0a9432ac` (S.S.Anne, HM01, `ssanne-hm01-*`) verificados con SAVE/continue/movimiento desde entradas importadas; `61610652` añade `H.teachMove`. Pendiente: Surge (`surge-progress.job.mjs`, comprometido sin validar: «no path» a la puerta del gimnasio), luego Liga/Sevii. Encadenar entradas/salidas verificadas y casos alternativos de §3; revisión independiente del tramo2 pendiente. No cerrar por flags importados ni por checks estáticos.
- [x] **Gritos en fotogramas y por id de grito** — `7dd38034`: la lógica ya no espera al audio del

- [x] **SON-PREP**: b765818f integrada en a8fc2c6a; guardado por UI con procedencia,
- [x] **LUNA-02 regresión focalizada del driver**: base66baef56, cinco casos PASS
- [x] **Driver detiene navegación tras derrota/atasco**: 65e631f9 propaga

- [x] **SOL-DRV01 decisiones/recursos/curación del driver**: 66baef56, política auto

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

**`field_specials.c`** (`field/elevatorAnimation.ts`, `script/specialsExtra.ts`)
- [ ] `0b1c6ac0`: `AnimateElevator` del motor delega las cuatro funciones de animación en `ElevatorAnimation`; nombres ya contados, delta cero. Comparación focal `field_specials.c:1049–1092,1119–1161` / `elevatorAnimation.ts:23–71`: oracle C 121 casos/15.475 frames PASS. 5ec96850 conecta el host del visor y su menú DOM; Azulona Rojo/Hoja, Silph, Rocket (llave PREPARED y rechazo sin ella) y Trainer Tower PASS. Presentación adaptada, sin VM general ni comparación ROM de ascensores.

**`field_player_avatar.c`** (`field/playerAvatar.ts`, `field/teleportAnimation.ts`)
- [ ] `97a3122d`: `playerAvatar.ts` delega en `ForcedMovement` (`field/forcedMovement.ts`): `TryUpdatePlayerSpinDirection`, `TryDoMetatileBehaviorForcedMovement`, `DoForcedMovement`, `DoForcedMovementInCurrentDirection`, `ForcedMovement_*` y `sForcedMovementFuncs`; revisar callers del motor contra el C. Oracle C: 49152 casos PASS; sin recorrido del motor principal.
- [ ] `eebdadff`: `escalatorWarp.ts` y `specialFieldAnim.ts` delegan en `field/escalatorAnimation.ts` (`StartEscalatorWarp`, `Task_EscalatorWarp*`, `EscalatorWarp(In)Effect_*`, `StartEscalator`, `StopEscalator`, `IsEscalatorMoving`). Nombres ya contados (`59df1eb5` restituye los nombres C); delta cero. Oracle C: 3488 frames/64 casos PASS; el visor omite la grabación del Quest Log.
- [ ] `4aab2061`: cinco APIs existentes delegan en `TeleportAnimation`: `SavePlayerFacingDirectionForTeleport`, `StartTeleportWarpOutPlayerAnim`, `WaitTeleportWarpOutPlayerAnim`, `StartTeleportInPlayerAnim`, `WaitTeleportInPlayerAnim`. Nombres ya contados, delta cero; comparar también los callers del motor durante la revisión. Oracle C: 3700 frames/24 casos PASS; navegación real focal Rojo/Hoja PASS, sin acreditar el recorrido del motor principal.

**`event_object_movement.c`** (`field/objectEvents.ts`, `fieldEffects.ts`)
- [~] `MovementAction_*` (delegan en `movementActionStep`): comparadas las 105 familias de `Step0/Step1` extraídas del C
  (init, argumentos y condición de fin) con los brazos del TS. Iguales: Face*, Walk (slowest/slower/slow/normal/fast/faster),
  RideWaterCurrent, PlayerRun, RunSlow, Jump/Jump2/JumpInPlace*/JumpSpecial*, Delay*, WalkInPlace*, Spin, Fly, Emote*,
  RockSmash/CutTree, Acro (init y tipo de salto). Corregido: `Slide*` (el C usa `MOVE_SPEED_FASTEST`; el TS FAST_1 con anim
  de cara), `ShakeHeadOrWalkInPlace` (termina con `animEnded`, el TS con 32 fotogramas), `Glide*` (faltaba
  `AnimateSprite` por fotograma), saltos acro (faltaba `hasShadow = FALSE`; el sonido SE_BIKE_HOP/SE_WALL_HIT sonaba dos
  veces: ya lo emite `field_player_avatar.c`). Cubierto en `check:movement-actions`.
  Sin revisar: `InitSpin`, `RaiseHandAndJump` S1 y `RevealTrainer`.
- [ ] `UpdateObjectEventCurrentMovement` (secuencia por objeto/ground effects) y
  driver por objeto; `ObjectEventSetSingleMovement`, `ObjectEventExecSingleMovementAction`,
  `ClearObjectEventMovement` (registro QL y `sprite.data[2]`).
- [x] `GetTrainerFacingDirectionMovementType` (9 entradas idénticas a `sTrainerFacingDirectionMovementTypes`);
- [x] `MoveCoords`/`MoveCoordsInDirection` (envoltura s16; `(u16)delta` equivale módulo 2^16; vectores iguales a
  - Encontrado y corregido (`1f6608ff`): `MovementType_FaceDownAndUp`/`FaceLeftAndRight` usan
    `gMovementDelaysMedium`; el TS usaba `Short` para todos salvo LookAround. Cubierto en `check:movement-types`.
  - `movementTypeBranch` (máquina fusionada de los `MovementType_*`) revisada contra el C: LookAround, Face*, FaceDirection,
    Wander*, Rotate*, WalkBackAndForth, las 24 `WalkSequence*` (ruta, índice, eje y valor de las 24 coinciden),
    `MoveNextDirectionInSequence`, Invisible, RaiseHand*, Buried, Disguise, WalkInPlace/JogInPlace y
    `gInitialMovementTypeFacingDirections` (81 entradas). Corregido (commit siguiente a `1f6608ff`):
    `FACE_UP/DOWN/LEFT/RIGHT` y `WALK/JOG_IN_PLACE` usaban la dirección inicial del tipo en vez de
    `facingDirection` en `Step0` y `WALK/JOG_IN_PLACE` devolvía FALSE donde el C devuelve TRUE (un fotograma).
  - Sin revisar aún: `MovementType_CopyPlayer*` y `CopyablePlayerMovement_*` (el TS usa `runCopyablePlayerMovement`),
    `ObjectEventIsTrainerAndCloseToPlayer`, `PlayerGetDestCoords`, y la capa `MovementAction_*`.
- [ ] `GetAvailableObjectEventId`, `TrySetupObjectEventSprite`, `TrySpawnObjectEventTemplate`,
  `TrySpawnObjectEvents`, `RemoveObjectEventsOutsideView`, getters/overrides de plantillas;
  `GroundEffect_*`/`DoTracksGroundEffect_*`.
- [x] `ObjectEventSetHeldMovement`, `ObjectEventForceSetHeldMovement`, `ClearHeldMovement*`, `CheckHeldMovementStatus`,
- [x] `InitNpcForWalk*`/`InitWalk*`/`UpdateWalk*`, `InitRunSlow`/`UpdateRunSlow`; (commits `194eaef3`)
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
- [x] `CopyablePlayerMovement_*` y `cph_IM_DIFFERENT` frente a `gCopyPlayerMovementFuncs` y `MovementType_CopyPlayer*`:
- [ ] Clones/obstáculos y ciclo `SpawnObjectEventsOnReturnToField`.

**`event_object_movement.c`, bloque 2026-10-22** (`field/objectEvents.ts`, `field/playerAvatar.ts`)
- [x] `ObjectEventIsTrainerAndCloseToPlayer` (`objectEvents.ts:2100`; `isDashing` = `TestPlayerAvatarFlags(DASH)`, límites s16), `InitSpin` (`:2689`), `GetLedgeJumpDirection` (`playerAvatar.ts:999`), `PlayerGetDestCoords` (`playerAvatar.ts:49`; el guard 0,0 sin avatar no existe en el C), `GetAvailableObjectEventId` (devuelve el slot o `OBJECT_EVENTS_COUNT` por el TRUE del C), `SetObjectEventDirection`, `ObjectEventTurn*`/`PlayerObjectTurn`, `ObjectEventUpdateSubpriority` + `SetObjectSubpriorityByElevation` y `UpdateObjectEventVisibility`/`CalcWhetherObjectIsOffscreen`/`UpdateObjEventSpriteVisibility` (offsets de cámara pasados por parámetro en vez de `gSpriteCoordOffset*`).
- [ ] DIFERENCIA `MoveNextDirectionInSequence` (`objectEvents.ts:2114`): tras `directionSequenceIndex++` el C lee `route[index]` con índice 4 (fuera del array de 4); el TS usa `route[index & 3]` pero deja el índice en 4, y la siguiente llamada lee `route[4]` = undefined (dirección 0). Alcanzable solo con `COLLISION_OUTSIDE_RANGE` en el último tramo.
- [ ] DIFERENCIA `RemoveObjectEvent`/`RemoveObjectEventInternal` (`:1398-1414`): el C solo pone `active = FALSE` y destruye el sprite; el TS además reemplaza la ranura por un `ObjectEvent` nuevo y marca `fieldEffectSprite` como destruido.
- [ ] DIFERENCIA `ObjectEventSetGraphicsId` (`:1345`) y `placeSprite` (`:1243`): sin `PatchObjectPalette`/`LoadSpecialObjectReflectionPalette`/tiles (los gestiona el renderer) y posición en coordenadas de mundo en vez de `SetSpritePosToMapCoords`.
- [ ] DIFERENCIA `MovementAction_RevealTrainer_Step0/1` (`:3180`): en el caso BURIED el C no toca `sprite->data[2]` y crea una tarea cada fotograma; el TS deduplica por entrenador, pone `data[2] = 1` y completa con `finishStep` al terminar la tarea (`trainerSee.ts:239`). Pendiente comprobar con un entrenador enterrado real.

**`overworld.c`** (`field/overworld.ts`, `fieldControl.ts`, `game.ts`)
- [x] `Overworld_ResetStateAfterFly/Teleport/DigEscRope/WhitingOut`: cuerpos C idénticos
- [x] `CB2_WhiteOut` (`overworld.c:1545`): secuencia comprobada contra el C (`StopMapMusic`, `DoWhiteOut`,
- [ ] `WarpIntoMap`/`TryFadeOutOldMapMusic`.
  - DIFERENCIA: el C carga el mapa de forma síncrona (`overworld.c:583-588`); el TS lo
    hace por etapas asíncronas (`overworld.ts:641-673`). `TryFadeOutOldMapMusic`
    coincide (`overworld.c:1112-1118`, `overworld.ts:2342-2349`).
- [x] `GetMapTypeByGroupAndId`, `GetLastUsedWarpMapType`, `GetSavedWarpRegionMapSectionId`,
  - Revisado: en mapas válidos coinciden; el TS devuelve `undefined` en mapas inválidos donde el C lee basura.
    También `IsMapTypeOutdoors`/`Indoors`/`AllowsTeleportAndFly` y el estado `UpdateAmbientCry`/`ChooseAmbientCrySpecies`
    (retardos 1200–3599 y 1200–2399). Corregido `PlayAmbientCry`: comprobaba la casilla de enfrente en vez de la propia
    (`PlayerGetDestCoords`) para mons de agua.
- [~] `SetWarpData`/`SetWarpDestination`/`SetDynamicWarp*`/`SetWarpDestinationTo*`: coinciden (parámetros `s8` truncados
  en `SetWarpData`). `LoadMapFromWarp`/`LoadMapFromCameraTransition`/`QL_LoadMapNormal`: mismas llamadas (la elección del
  grito ambiental va dentro de `stepCallback.reset()`); orden distinto sin dependencia de datos
  (`TrySetMapSaveWarpStatus` después de `onMapLoad`). Sin revisar: `SetDiveWarp*`, `cb1`/`cb2`,
  `CB2_ReturnToFieldContinueScript`, `CB2_ContinueSavedGame` (comparten dispatch con carga asíncrona).
- [ ] `DoCB1_Overworld_QuestLogPlayback`, `LoadMap_QLPlayback`,
  `CB2_SetUpOverworldForQLPlayback*`, `QL_UpdateObject`/`QL_UpdateObjectEventCurrentMovement`.
  - DIFERENCIA: el C consume la máquina de estados en un callback
    (`overworld.c:2210-2250`); el TS la reparte entre frames (`overworld.ts:792-840`).
    `QL_UpdateObject` aplica movimiento y gfx antes de actualizar (`quest_log.c:1340-1365`);
    el TS aplica comandos en `fieldControl.ts:204-214` antes del driver.

**`quest_log.c`** (`questLogEvents.ts`)
- [~] Callbacks de entrada/fin de playback, `RunQuestLogCB`, `QLogCB_Playback`,
  `QuestLog_PlayCurrentEvent`, `HandleShowQuestLogMessage`, `QL_TryRunActions` (bucle de acciones y
  retardos iguales al C; el TS además espera a `scriptContextIdle` y no pasa a STOPPED con `idx >= max` mientras los
  controles están bloqueados; la entrada reproduce los bytes 0 y 2 de `FieldInput`, sin `pressedRButton`).
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
- [~] Revisión 2026-10-13 (`partyMenu.ts`): comparados con el C `ItemUseCB_Medicine/Step`, `ItemUseCB_RareCandy`,
  `TryUsePPItemInBattle`, `ItemUseCB_RestorePP`, `ItemUseCB_TMHM`, `Task_ReplaceMoveWithTMHM`,
  `GetPartyMenuActionsType(InBattle)`, `CanLearnTutorMove`, `UpdatePartyTo{Battle,Field}Order`,
  `GetPartyIdFromBattle{PartyId,Slot}`, `SwitchPartyMon`, `Display{Gave,Took}HeldItemMessage`: lógica igual salvo que el TS
  **no registraba ninguno de los 8 `ItemUse_SetQuestLogEvent` del C** (usar objeto sobre un mon, dar/quitar objeto,
  MT/MO, PP, reemplazar movimiento). Añadidos. Sin comprobar en juego: el Quest Log ignora estos eventos fuera de una
  escena ya abierta (`ShouldRegisterEvent_HandlePartyActions`), así que el smoke C10 no los ve. Sin revisar:
  `CreatePartyMon*SpriteParameterized`, `PartyMenuStartSpriteAnim`, `CB2_ReturnTo*Menu`, evolución por objeto.
- [ ] `CreatePartyMon*SpriteParameterized` (especie, prioridad, estado, objeto);
  `PartyMenuStartSpriteAnim`, los tres `CB2_ReturnTo*Menu`, `CB2_SetUpExitToBattleScreen`.

**`pokemon.c`**
- [x] Los 6 wrappers BoxMon/Mon revisados con líneas citadas; `GetMonSpritePalStruct` (commits `3bea3c6d`, `3d63e11a`)
- [x] `CalculateBaseDamage` (`pokemon.c`, `battle/damage.ts`): comparada línea a línea con el C (objetos, habilidades, (commits `475b8118`)

**`pokemon_summary_screen.c`**
- [~] `SwapMonMoveSlots`/`SwapBoxMonMoveSlots` (`SwapMoveSlotsInMon`: movimientos, PP y bonos de PP idénticos),
  `GetMonPpByMoveSlot`/`GetMonMoveBySlotId`, `SeekToNextMonInSingleParty`, mapeo de dirección de
  `PokeSum_SeekToNextMon` en caja y `PokeSum_BufferOtName_IsEqualToCurrentOwner` (rama sin enlace): iguales.
  Corregido `PokeSum_PrintTrainerMemo_Egg`: el TS siempre mostraba el texto 0 («guardería»); ahora elige entre los 7
  de `sEggOriginTexts` según lugar/versión de encuentro, OT y `isBadEgg`. Sin comprobar con un huevo real.
  Detector `tools/reviewSizeCompare.py` (funciones del C cuyo port del mismo nombre es mucho más corto): sin más señales
  en lógica; el resto son sprites/visual (`CreateHpBarObjs`, `PokeSum_*BeforePageFlip`). Pendiente:
  `UpdateCurrentMonBufferFromPartyOrBox`, transición de páginas, setup y `SpriteCB_MonPicDummy`.
- Detector aplicado a `battle_transition.c`, `field_effect.c` e `intro.c`: **no informativo**. Esos tres están reescritos
  como escenas sobre Canvas (intro: un cuerpo de 1 sentencia por escena; transiciones: `Spiral_UpdateFrame` etc. con
  un 1/N de sentencias; field_effect: 70 funciones del C sin homónimo exacto en el TS), así que la comparación por
  tamaño no identifica omisiones; requieren revisión visual/comparación por fotogramas.

**`text.c`** (`gba/textPrinter.ts`)
- [x] `DecompressGlyph_NormalCopy2` y 4 `TextPrinter*` (espera, flecha, modo auto) — `c4282dab`.
- [x] `TextPrinterDrawDownArrow`, `TextPrinterClearDownArrow`, `TextPrinterInitDownArrowCounters`,

**`m4a.c`** (`audio/sound.ts`, `audio/m4a.ts`)
- [ ] `m4aSongNumStart*`, `m4aSongNumStop/Continue`, `m4aMPlayContinue/FadeOut/
  FadeOutTemporarily/FadeIn/VolumeControl`, `m4aSoundInit`/`m4aSoundMain`,
  `SetPokemonCryTone`, `SetPokemonCryStereo`, `IsPokemonCryPlaying`, `m4aMPlayPanpotControl`.

**Otros archivos**
- [ ] `field_player_avatar.c`: renombres.
- [x] `field_control_avatar.c`: getters de posición y helpers con `FieldControl` como contexto.
- [x] `start_menu.c` — `d15dc8f8`: barra de ayuda solo en modo HELP, `SE_SELECT` en (commits `baf7f8f4`)
- [x] `vs_seeker.c` — `e07840ac`: `Task_ResetObjectsRematchWantedState` llama a
- [x] `trainer_card.c`: `Unref_InitTrainerCard` — `baf7f8f4` repite `SetMainCallback2(CB2_InitTrainerCard)` como el C; `battle_setup.c`: `SetBattledTrainerFlag2` igual (mismo cuerpo que `SetBattledTrainerFlag`, `battle_setup.c:876-879` frente a `battleSetup.ts:246`). `ShowPlayerTrainerCard` fija `isLink=false` porque el Union Room es de enlace.
- [x] `trainer_tower.c` revisado el 2026-10-18: `TT_ConvertEasyChatMessageToString` (`convertTowerSpeech`, mismo 3×2→2×3 y `\n`→`\l`, guardas de límite inocuas), `GetTrainerTowerTrainerFrontSpriteId` (igual; `?? 0` defensivo), `CB2_EndTrainerTowerBattle` (`returnToFieldContinueScript(true)` = `CB2_ReturnToFieldContinueScriptPlayMapMusic`) y `Task_DoTrainerTowerBattle` (adaptado al host de combate, que espera la transición y fija el callback).
- [ ] `battle_tower.c`: `Task_WaitBT` (adapta el scheduler a `game.startBattle`).
- [x] `trade_scene.c`: `LoadTradeAnimGfx`; `mail.c`: `GetInGameTradeMail` (`attachTradeMail`).
- [x] `trade_scene.c`: `TradeAnimInit_LoadGfx` — `596a16e7` sigue el cuerpo C (offsets BG0, textbox cargado dos veces, buffers de `BG_SCREEN_SIZE` bytes); el buffer BG2 se mantiene como sustituto del DMA directo a `BG_SCREEN_ADDR(18)`.
- [x] `metatile_behavior.c`: fachada de predicados en `fieldmap.ts` (`fieldmap.ts:132-139`,

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
- [x] **C5 Combate salvaje**: luchar, huir y capturar con pulsaciones reales (commits `d59b5003`, `d2743aa7`, `bcd841b5`)
- [ ] **C6 Combate de entrenador**: partida `pewter` → gimnasio → Brock; medalla y dinero.
  PARCIAL: `gym-camper` → Brock, victoria, medalla y 3150→4550 comprobados
  con el job `caa6885d` sobre integración. Falta la ruta previa desde `pewter` al gimnasio.
- [x] **C7 Derrota (whiteout)**: reaparece en el Centro Pokémon **mirando al norte**, (commits `fea0682e`)
- [ ] **C8 Centro Pokémon y PC**: depósito/retiro automatizado con pulsaciones reales
  (`54895bba`, devuelve MANUAL honesto); curación de la enfermera pendiente.
- [x] **C9 Tienda** (partida `mart`): el dependiente aparece, comprar y vender; el (commits `fea0682e`, `06b08838`)
- [x] **C10 Menús**: Pokédex, Pokémon (resumen, mover, objeto), Mochila (Poción), (commits `fea0682e`)
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

- [x] **4.1 Revisar checkpoint `route4` y actualizar registro** — revisión 2026-10-06: (commits `967a496e`)
- [ ] Recorrido zona por zona de Kanto y Sevii (tramos 2–13, incluido postgame de un jugador), con partidas por tramo.
- [ ] Checks headless por sistema en `tools/checks/` donde falten.
- [ ] **4.2 Comparación con el juego original en emulador** [avanzado]. Compilar la ROM
  del decomp (`make` en `../pokefirered`), ejecutarla en un emulador con scripting
  (mGBA), reproducir las mismas pulsaciones con la misma semilla y comparar flags,
  variables, equipo, dinero, posición y mapa. Primer objetivo: hasta el final del
  laboratorio de Oak. Entregar antes un informe de viabilidad.
  PARCIAL: informe y fases 1–3 en [docs/ROM-COMPARACION-VIABILIDAD.md](docs/ROM-COMPARACION-VIABILIDAD.md)
  (`e7a57cf3`…`3cee1e9d`, herramientas en `tools/rom-compare/`). ROM oficial 1.0 verificada por SHA1
  (`assets/gba-reference/`, ignorada). Hecho: scripting mGBA determinista, direcciones de `gRngValue`/`gMain`/save
  blocks, RNG por fotograma corregido en el port (`0767f563`), cadena de RNG idéntica del título a Oak (2.417
  fotogramas), partida nueva hasta el cuarto del jugador con mapa/posición/nombre/género idénticos y una
  divergencia real corregida (resiembra al salir de la pantalla de nombres, `ad3eb30a`), cuarto→pueblo→laboratorio→inicial con
  flags/vars idénticos y dos fallos reales corregidos (`applymovement` sin hueco de movimiento y ventana de spawn por coordenadas
  de cabecera, `620303ab`; informe §13). Los fotogramas entre eventos
  difieren por lag de CPU de la ROM (~10 fotogramas al montar páginas de texto; informe §12), no modelable en general:
  comparar por eventos y con `gRngValue` inyectado. Fase 6 (batalla del rival, informe §14): flags/vars/posición/equipo/rival idénticos hasta el inicio de batalla
  tras corregir `EnableNationalPokedex_RSE` en `NewGameInitData`; el resultado de la batalla depende del RNG
  (ROM: tres `RV_RNG`, tres derrotas con flags/vars idénticos al port; el port ganó en una corrida y cambia
  `VAR_QUEST_LOG_MON_COUNTS`/`VAR_QLBAK_MAP_LAYOUT`, consistente con `quest_log.c` pero sin verificar en la ROM).
  Fase 7 (Ruta 1 → Verde → Tienda → Paquete de Oak, informe §15): flags/vars/posición idénticos en cada
  cambio de mapa y al recibir el paquete (solo difieren las variables del Quest Log por haber ganado el port la
  batalla). Tramo «devolver el paquete → Pokédex» (informe §15.1): ROM y port coinciden en flags,
  vars y bolsa en los 9 cambios de mapa y al terminar la escena (`FLAG_SYS_POKEDEX_GET`, Poké Ball ×5, sin
  paquete; dinero distinto solo por la batalla del rival). El control de la ROM usa `sGlobalScriptContext.mode`
  (`0x03000EB1`, localizado por firma con `scanctx.lua`). Automatizado (`7252d79a`, `fa2ad30d`): `run-rom.sh` reinicia
  mGBA y carga el Lua por System Events (mGBA 0.10.5 no tiene `--script`; exige pantalla desbloqueada y permiso de
  Accesibilidad); `run-milestone.sh` encadena recorrido del port, replay y `compare-route.py`. Port hasta Pewter
  (`FOREST=1`, `ae1935cd`): 0 errores, sin whiteout. Replay en la ROM con compuertas de escena (`PARCEL_GATES`; sin ellas
  la ROM salía del laboratorio antes de terminar el Pokédex): flags, vars y bolsa idénticos en cada mapa hasta la entrada
  del Bosque Verde. **Divergencia abierta:** en el bosque la ROM pierde una batalla (whiteout a la casa del jugador, mapa 4,0)
  que el port gana con el mismo RNG fijado y el mismo inicial nivel 6. Falta registrar cada batalla en la ROM (especie,
  nivel, HP, resultado) y compararla con el port; candidatos: orden/velocidad, daño, precisión o el RNG de batalla.
- [x] **Revalidar escenas con movimiento por script** (detectado en 4.2, `620303ab`; revalidado con `e03bdc7a`, (commits `526e9004`)
- [ ] Fidelidad de arranque (detectada en 4.2): falta modelar la latencia de `LoadGameSave` entre el copyright y la
  intro (ROM ~15 fotogramas; la de tras sembrar en el título, +17, ya está: `b21dd0df`). El lag de CPU disperso de la
  ROM (informe §12) no se modela. Resolver en la revisión.
- [ ] Decisión de diseño postgame (tickets de Mew/Deoxys).

## 5–7. Fuera de la meta principal

Enlace, Emerald y herramientas de diseño: [docs/FUTURO.md](docs/FUTURO.md).
