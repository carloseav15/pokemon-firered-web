# Tareas finales del juego de un jugador

Lista única de lo que queda para dar por terminado el port de un jugador
(auditoría del 2026-10-01). Las cifras vivas están en [PENDING.md](PENDING.md);
el estado breve, en [PORTING-STATUS.md](PORTING-STATUS.md).

Por nombres, el juego de un jugador está completo: los 354 nombres que faltan
son de enlace/multijugador, hardware GBA sustituido por Canvas/WebAudio o
funciones sin caller en el propio C. Lo pendiente es cerrar los huecos de la
sección 1, revisar las equivalencias (2), validar en navegador (3) y recorrer
la historia (4).

## 0. Cómo trabajar (léelo entero antes de empezar)

Este archivo está pensado para que cualquier agente lo siga paso a paso. Si una
instrucción de aquí choca con [AGENTS.md](AGENTS.md), manda AGENTS.md.

### Orden

1. Sección 1, en el orden en que aparecen (de fácil a difícil). Las marcadas
   **[avanzado]** déjalas a un agente de mayor capacidad si no entiendes el C.
2. Sección 2, un bloque de archivo por sesión.
3. Sección 3, un bloque por sesión.
4. Sección 4.

### Al empezar cada sesión

```bash
git switch main
git pull --ff-only
git status --short
```

`git status` debe salir vacío. Si no, para y pregunta al usuario: no son tus cambios.
Elige **una** tarea sin marcar y trabaja solo en ella.

### Dónde está cada cosa

- C original: `../pokefirered/src/<archivo>.c` (resuelto por `tools/decomp/common.py`).
  Buscar una función: `grep -n "Nombre(" ../pokefirered/src/archivo.c`.
- Port TS: `src/fr/`. Buscar: `grep -rn "Nombre" src/fr --exclude-dir=generated`.
- Datos generados: `src/fr/generated/` y `public/fr/`. **No se editan a mano.**
- Checks headless: `tools/checks/*.ts`, se lanzan con `npm run check:<nombre>`
  (lista en `package.json`).

### Reglas que no se rompen

- Lee el cuerpo C completo antes de cambiar código. No inventes comportamiento.
- Conserva los nombres C, el orden de estados y callbacks, y la aritmética
  (u8 → `& 0xFF`, s16 → `(x << 16) >> 16`, división entera → `Math.trunc`).
- No cambies `tools/portInventory.py`, las baselines de `check:honesty` ni las
  aserciones de un check para que pase.
- No borres una tarea sin hacerla. Si no puedes terminarla, escribe debajo una
  línea `BLOQUEADO: <motivo concreto>` y pasa a la siguiente.
- Si llevas dos intentos fallidos con el mismo error, para y anótalo como bloqueado.
- Nada de `git push` ni de borrar ramas sin permiso del usuario.
- **Las pistas y cifras "esperadas" de una tarea son ayudas, no la verdad.** Si tu
  resultado coincide con la pista, comprueba también por qué: revisa una muestra de
  casos a mano. Si no coincide, o la pista mezcla cosas distintas, investiga y
  escribe `PISTA INCORRECTA: <qué dice> / <qué muestran los datos>` bajo la tarea;
  no ajustes tu resultado para que encaje. (Caso real 2026-10-01: la pista de R2
  contaba 53 cambios de Gen 4 y solo unos 18 eran reales.)
- **Si escribes o editas una tarea**, cada cifra o ejemplo de la pista debe salir de
  un comando que hayas ejecutado sobre los datos, y la pista debe decir qué cuenta
  exactamente (p. ej. "cambios reales" frente a "diferencias de formato").

### Comprobaciones al terminar una tarea de código

```bash
npm run check:port
npm run check:honesty
npm run build
git diff --check
```

Además, el check focalizado que indique la tarea. Todo debe salir sin errores.
Si una tarea solo toca documentos, basta con `npm run check:honesty` y `git diff --check`.

### Commit de la tarea (solo código)

No incluyas en este commit `TAREAS-FINALES.md`, `PORTING-STATUS.md`, `PENDING.md`,
`PORT-INVENTORY.md` ni `tools/portPending.py`.

```bash
git add <archivos de código>
git commit -m "<Verbo en inglés> <qué> (<archivo>.c)" -m "Co-Authored-By: <tu agente> <correo>"
```

Ejemplo: `Rename ally mon slide callback to its C name (battle_main.c)`.

### Cierre de sesión (un único commit de estado)

```bash
npm run inventory
npm run pending
```

Después marca `[x]` en las tareas hechas aquí y actualiza en `PORTING-STATUS.md`
solo las líneas "Última revisión" y "Contador" (además del acumulado si sumaste
funciones nuevas o equivalencias). Luego commit:
`git commit -m "Update final task status"`.

## 1. Código de un jugador por cerrar

- [x] **1.1 Checks headless rotos** [básico]. `npm run check:movement-actions` y
  `npm run check:questlog-objects` fallan con
  `Cannot read properties of undefined (reading 'chars')` porque no cargan
  `rom.charmap`.
  - Pasos: copia en `tools/checks/movementActions.ts` y
    `tools/checks/questLogObjects.ts` la carga que ya hace
    `tools/checks/tradeScene.ts` (línea `(rom as any).charmap = JSON.parse(readFileSync(root + 'charmap.json', 'utf8'));`),
    con su `import { readFileSync } from "node:fs"` y su ruta `root`, si faltan.
  - Terminada cuando: los dos checks llegan al final sin excepción. Si ahora falla
    una aserción, no la toques: anota la aserción y el valor obtenido como
    `BLOQUEADO` (es un fallo real del port).
  - Hecha 2026-10-01: la copia de `rom.charmap` no bastaba (`sText_100` se
    codificaba en ámbito de módulo en `battleTower.ts` antes de que el cuerpo del
    check corriera); hizo falta hacerlo perezoso y, en el harness, registrar el
    objeto del check y el `DoPlayerAvatarTransition` del mock. Los dos checks
    pasan sin tocar aserciones; los 12 checks que siguen rotos están en §1.11.
- [x] **1.2 Renombrar dos equivalencias al nombre C** [básico].
  - `src/fr/battle/main_init.ts:371` y `:374`: `SpriteCB_AllyMonSlide` → `oac_poke_ally_`
    (C: `battle_main.c`, `static void oac_poke_ally_`). Añade el comentario
    `/** oac_poke_ally_ (battle_main.c). */`.
  - `src/fr/pokemon/ingameTrade.ts:355`: mueve el cuerpo de `LoadTradeAnimGfx` a una
    función nueva `TradeAnimInit_LoadGfx()` y deja `LoadTradeAnimGfx` llamándola,
    igual que el C (`trade_scene.c`, `void LoadTradeAnimGfx(void) { TradeAnimInit_LoadGfx(); }`).
  - Check focalizado: `npm run check:trade`. Terminada cuando: `npm run inventory`
    muestra `battle_main.c` 87/106 y `trade_scene.c` 39/53 (+2 equivalencias).
  - Hecha 2026-10-01 (commit `5b304853`): renombrado en `main_init.ts` y
    `TradeAnimInit_LoadGfx` en `ingameTrade.ts`; inventario 87/106 y 39/53.
- [x] **1.3 Huecos conocidos obsoletos** [básico, solo documentos]. En `KNOWN_GAPS`
  de `tools/portPending.py` hay frases que ya no son ciertas. Comprueba cada una con
  `grep` y corrige o borra la frase; después `npm run pending`.
  - `item_use.c` "faltan 12/73 nombres": el inventario ya marca 73/73.
  - Transiciones "faltan las mugshots": existen en `battle/mugshotTransition.ts`
    (llamadas desde `battle/transition.ts`).
  - Easy Chat "las cartas quedan en blanco": `partyMenu.ts` expone `writeMail` →
    `DoEasyChatScreen`. Confirma que GIVE de una carta abre el editor; si es así,
    corrige también el comentario de cabecera de `src/fr/pokemon/mail.ts`.
  - `PLAN-RECORRIDO.md` tramo 12 dice que las mugshots no están portadas: corrígelo.
  - Hecha 2026-10-01 (commit `bc7e3e9f`): corregidas las líneas 65/72/87 de
    `KNOWN_GAPS`, `PLAN-RECORRIDO.md:71` y la cabecera de `mail.ts`; `PENDING.md`
    regenerado.
- [x] **1.4 Whiteout** [básico]. `Overworld_SetWhiteoutRespawnPoint`
  (`src/fr/field/overworld.ts`, ~línea 612) dice que descarta `healerLocalId`/`atHome`.
  - Pasos: lee `Overworld_SetWhiteoutRespawnPoint` y `SetWhiteoutRespawnWarpAndHealerNpc`
    en `../pokefirered/src/overworld.c` y busca dónde usa el C ese dato del curandero
    (`grep -rn "VAR_RESPAWN\|healer" ../pokefirered/src/*.c`). Compara con
    `DoWhiteOut` en `src/fr/game.ts` (~línea 1092).
  - Si el TS ya usa el dato por otro camino: corrige solo el comentario. Si no, porta
    la parte que falta siguiendo el C.
  - Hecha 2026-10-01 (commit `b41615cd`): el TS ya usa el dato (curandero →
    `SV.LAST_TALKED` → `applymovement VAR_LAST_TALKED`; casa/centro en
    `Task_RushInjuredPokemonToCenter`), así que se reescribió el comentario;
    además `DoWhiteOut` ahora llama a `Overworld_SetWhiteoutRespawnPoint()` en vez
    de saltárselo (el wrapper no tenía callers) y fija el avatar inicial a
    `DIR_NORTH`, como `CB2_WhiteOut`. Divergencias sin portar de `CB2_WhiteOut`:
    `StopMapMusic()` y `UnlockPlayerFieldControls()` — el fade del script previo y
    el `releaseall` final los cubren en la práctica; revisar en la fase de revisión.
    Tampoco está `ResetSafariZoneFlag_()` de `CB2_WhiteOut` (revisión 2026-10-01).
- [x] **1.5 Módulos sin caller** [medio]. Para cada módulo, busca su caller en C
  (`grep -rnw <Función> ../pokefirered/src`) y en TS (`grep -rn "from \".*<módulo>\"" src/fr`).
  - Duplicados sin uso (`game/slots.ts`, la función `openTeachyTv` de `keyItemScreens`):
    si nada los importa, bórralos.
  - Los demás (`field/fieldEffectHelpers.ts`, `paletteUtil.ts`, `monMarkings.ts`,
    `cableCarUtil.ts`, `hw/tilemapUtil.ts`, `hw/bgRegs.ts`, `imageProcessingEffects.ts`):
    no los borres (cuentan en el inventario). Si el C los llama desde una ruta de un
    jugador que el TS hace de otra forma, anota aquí la ruta para conectarlos
    [avanzado]. Si el C tampoco los llama, anota "sin caller en C" y marca la tarea.
  - Hecha 2026-10-01 (commit `f6680d05`): borrados `game/slots.ts` (duplicado de
    `menus/slotMachine.ts`, que sí tiene los nombres C; `slot_machine.c` sigue 77/77)
    y `keyItemScreens.openTeachyTv` (sustituido por `teachyTv.ts` vía
    `Game.openTeachyTv`; `teachy_tv.c` 58/58), con sus imports muertos y la
    cabecera del archivo. El inventario solo cambia en las columnas de procedencia.
  - `paletteUtil.ts`, `cableCarUtil.ts`, `imageProcessingEffects.ts`: **sin caller en C**
    (`RouletteFlash_*`/`PulseBlend`/`FillTilemapRect`, `CableCarUtil_*` (ambas `static`),
    `ApplyImageProcessing*`/`ConvertImageProcessingToGBA` no se usan fuera de su `.c/.h`).
  - `hw/bgRegs.ts`: en C solo se lee `gOverworldBackgroundLayerFlags` en
    `InitOverworldGraphicsRegisters` (`overworld.c:2071`, registros GBA que el TS
    sustituye por Canvas; `overworldCredits.ts:288` lo comenta y `fieldEffects.ts`
    maneja `BLDCNT` por su cuenta) y `gBGControlRegOffsets` en `link.c` (enlace).
    Ruta anotada [avanzado]: decidir en revisión si se declara hardware sustituido
    o se conecta `InitOverworldGraphicsRegisters`.
  - `field/fieldEffectHelpers.ts`: cableado por `field/playerAvatar.ts` (flechas de
    warp; mismos callers C: `field_player_avatar.c`, `event_object_movement.c`).
    Reflexiones: en C siguen vivas vía `GroundEffect_WaterReflection`/
    `GroundEffect_IceReflection` → `SetUpReflection`, pero el TS las resuelve en
    `fieldEffects.ts` (`updateObjectReflection`), así que los helpers de reflexión
    de este archivo quedan sin caller TS. `FldEff_UnusedGrass`/`UnusedGrass2`/
    `UnusedSand`/`UnusedWaterSurfacing`/`Sparkle`/`BerryTreeGrowthSparkle`: **sin
    caller en C** (ningún `FieldEffectStart(id)` ni script `dofieldeffect`; el cuerpo
    de `FldEff_BerryTreeGrowthSparkle` está comentado en el C).
  - `monMarkings.ts`: cableado por `storageSystemTasks.ts` (misma ruta que el C,
    `pokemon_storage_system_tasks.c`); `CreateMonMarkingAllCombosSprite` (C:
    `pokemon_summary_screen.c`) está resuelto inline en `pokemonSummaryScreen.ts`
    (`PokeSum_CreateMonMarkingsSprite`).
  - `hw/tilemapUtil.ts`: cableado por `storageSystemTasks.ts` (misma ruta C);
    `TilemapUtil_UpdateAll` y `TilemapUtil_SetSavedMap` **sin caller en C**.
  - Checks: `check:port`, `check:honesty` y `build` sin errores. Preexistentes y sin
    tocar aserciones: `check:slots` (`cdata text not loaded` en `SlotsTask_GraphicsInit`)
    y `check:transitions` (línea 54, `helpers.FldEff_TallGrass` indefinido: los FldEff
    conectados viven en `fieldEffects.ts`). Ver con §1.11.
- [ ] **1.6 Clima en pantalla** [verificar primero]. `field/weather.ts` solo dibuja
  la niebla (`renderFog`, llamada desde `field/fieldEffects.ts`). Comprueba en
  navegador (sección 3) si lluvia, nieve, sol y tormenta de arena se ven en un mapa
  con ese clima. Si no se ven, la tarea pasa a ser [avanzado]: conectar los sprites
  del clima al render.
  - **Sesión 2026-10-01: verificación de navegador no completada** (agente
    `mimo-v2.6-flash`; sin cambios de código). No hay automatización de navegador
    en el entorno y la ruta asistida por consola no llegó a ejecutarse: los
    snippets iniciales fallaron en la consola del usuario (`SyntaxError` con
    top-level `await`, `ReferenceError` por no ejecutar la base) y el
    teletransporte a Viridian Forest (`SetWarpDestination(1,0,0,29,62); DoWarp()`)
    no se pudo confirmar — la captura mostraba Pewter City tras los intentos, sin
    la línea `wst` de consola. Tarea pendiente de rehacer con la receta §3.
  - Hallazgos de código (lectura, sin validar en pantalla; reutilizar en la próxima
    sesión, `npm run dev` y driver `window.H` con `importSave("pewter")`+`ready()`):
    * `renderFog` (`weather.ts:1041`, llamado por `fieldEffects.renderOverlays` ←
      `overworld.ts:2731`) pinta niebla (`gWeatherFogHorizontalTiles`), lluvia
      (líneas), tormenta de arena (puntos) y ceniza (puntos); **no pinta nieve,
      nubes ni burbujas**.
    * `weatherEffects.ts` (93/93 nombres) construye `WeatherSpriteRecord` en
      `weatherSprites.*` que nadie dibuja: `LoadSpriteSheet` de lluvia/ceniza se
      llama pero no hay `CreateSprite`/draw. Es el candidato a [avanzado]
      "conectar los sprites del clima al render" (`renderOverlays` es el punto).
    * Tormenta eléctrica: `Thunderstorm_Main` TS solo llama `Rain_Main` +
      `UpdateThunderSound` (trueno sonoro); el C además hace flash de gamma
      (`WeatherShiftGammaIfPalStateIdle(19)` en su máquina de estados, `field_weather_effects.c:1047`).
    * Mapas FRLG por cabecera: `WEATHER_SUNNY`(2) ×66, `WEATHER_FOG_H`(6) ×19
      (Pokémon Tower 3F–7F, Lost Cave), `WEATHER_SHADE`(11) ×7 (Viridian Forest,
      Pokémon Mansion, Navel Rock). **Ninguno declara lluvia/nieve/arena/ceniza**:
      hay que forzarlos con `frGame.weather.setWeather(N); DoCurrentWeather();`.
    * `SUNNY` es vacío por diseño (`Sunny_Main` C vacío, `GAMMA_TARGETS[2]=0`);
      `SHADE`/`RAIN` usan gamma 3 (`renderer.tint` + `spriteFilter` con
      `SPRITE_BRIGHTNESS`). Destinos útiles: Viridian Forest (grupo 1, num 0, warp
      (29,62)), Pokémon Tower 3F (grupo 1, num 90 = 346, warp (4,10)).
    * `specials.ts` `StartDroughtWeatherBlend` sigue vacío, pero ningún script lo
      llama (sin caller) y `check:weather` (roto, §1.11) cubre su lógica.
  - **2026-10-01 (OpenCode): OMITIDA PARA OPENCODE — sin conexión propia a
    navegador; queda como verificación manual del usuario con la receta §3
    (snippets IIFE con `importSave("pewter")`+`ready()`). No reintentar con
    agentes sin navegador; el posible [avanzado] (sprites del clima al render)
    se decidirá con esa evidencia manual.**
- [ ] **1.7 Evolución tras intercambio con NPC** [avanzado]. En C, `STATE_TRY_EVOLUTION`
  (`trade_scene.c`) llama `TradeEvolutionScene` con `gCB2_AfterEvolution = CB2_InGameTrade`.
  El TS (`pokemon/ingameTrade.ts`, ~línea 1054) usa `evolveWithMessages` después del
  fundido y comprueba la Everstone aparte. Con los datos de FireRed no ocurre nunca,
  porque ningún Pokémon recibido evoluciona por intercambio, pero diverge.
  - Pasos: portar a `evolutionScene.ts` la familia `TradeEvolutionScene` de
    `evolution_scene.c` (`CB2_TradeEvolutionSceneLoadGraphics`, `TradeEvolutionScene`,
    `CB2_TradeEvolutionSceneUpdate`, `Task_TradeEvolutionScene`, `EvoDummyFunc`,
    `VBlankCB_TradeEvolutionScene`), tomando como modelo la `EvolutionScene` ya portada.
    Después cambiar `STATE_TRY_EVOLUTION` para que siga el C.
  - Checks: `npm run check:evolution`, `npm run check:trade`.
- [ ] **1.8 Grabación del Quest Log** [avanzado]. `TryRecordActionSequence`,
  `ResetActions`, `RecordHeadAtEndOfEntry`, `RecordHeadAtEndOfEntryOrScriptContext2Enabled`,
  `ClearSavedScene` y `Task_BeginQuestLogPlayback` (`quest_log.c`) son lógica activa en C.
  El TS (`questLogEvents.ts`, `QL_StartRecordingAction` ~línea 263) escribe las acciones
  directamente en `scene.script` y guarda las escenas en un array (`push`/`splice`) en
  lugar del anillo de escenas con buffer de acciones.
  - Revisar contra el C: el volcado del buffer, los límites y la rotación de escenas.
    Si cambia el formato del save, debe seguir cargando partidas viejas.
  - Check: `npm run check:questlog-objects` y `npm run check:questlog-battle`.
- [ ] **1.9 Créditos** [avanzado]. Las escenas de mapa de `overworldCredits.ts` no
  ejecutan NPCs, clima ni animación de tilesets.
- [ ] **1.10 Audio M4A** [avanzado]. Faltan chorus/ADSR, el arbitraje de cuatro voces
  y reverb/duty/sweep/keysplit (los cries usan WAV). Los 47 nombres restantes de
  `m4a.c` son el driver interno: no hace falta portarlos uno a uno.
- [ ] **1.11 Checks headless con fallos propios** [básico/medio]. El 2026-10-01 se
  hizo perezoso `sText_100` (`battle_tower.c`), que se codificaba en ámbito de módulo
  y rompía la carga de 26 checks; 18 pasan ya. Estos 12 fallan por causas ajenas.
  No toques aserciones ni baselines: si el fallo es del port, anota `BLOQUEADO`.
  - Datos que el check no registra antes de usarlos: `check:anims`
    (`cdata … not loaded`), `check:slots` (`cdata text not loaded` en
    `SlotsTask_GraphicsInit`), `check:weather` (`incbin index not loaded` en
    `LoadRainSpriteSheet`), `check:earlybattles` y `check:brock-action`
    (`cdata berry not loaded` en `GetBerryInfo`). Registra cdata/incbin en el
    escenario del check como hace `tradeScene.ts`.
  - Import sin export: `check:evolution` (`trySpawnShedinja` no está en
    `menus/monProgress.ts`), `check:famechecker` (`sFameCheckerData` en
    `fameChecker.ts`), `check:questlog-battle` (`getQuestLogEvents` en
    `questLogEvents.ts`). Busca el nombre en el C y en el TS antes de decidir.
  - Lógica/registro: `check:card` (`Fresh cart has 0 stars (Blue card)`),
    `check:transitions` (línea 54, `helpers.FldEff_TallGrass` indefinido: los FldEff
    conectados viven en `fieldEffects.ts`, no en `fieldEffectHelpers.ts`),
    `check:teachytv` (`TTVcmd_ClearBg2TeachyTvGraphic` sin definir),
    `check:trainer-see` (`objects.GetCollisionFlagsAtCoords` no existe).

## 2. Revisión de equivalencias y wrappers contra el cuerpo C

Funciones con nombre C que delegan en lógica genérica o adaptada. Trabaja un
bloque de archivo por sesión.

Receta para cada línea:
1. Abre el cuerpo C (`grep -n "Nombre(" ../pokefirered/src/<archivo>.c`) y el TS
   (`grep -rn "Nombre" src/fr --exclude-dir=generated`).
2. Compara punto por punto: mismas ramas y condiciones, mismo orden de llamadas,
   mismas constantes (`C.NOMBRE`), mismos anchos de entero y divisiones, mismos
   callbacks/tareas asignados y en el mismo frame.
3. Si es igual, marca `[x]`. Si la diferencia es pequeña y hay un check que la
   cubre, corrígela (commit de código). Si no, escribe debajo
   `DIFERENCIA: <qué hace el C> / <qué hace el TS>` y deja la casilla sin marcar.
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
  - DIFERENCIA: el C (`UpdateWalkSlowerAnim`) solo mueve el sprite (`Step1`);
    el TS (`UpdateSlowStyleAnim`) además resuelve el objeto desde el sprite
    (`objectForMovementSprite`) y devuelve `false` si no está en
    `ObjectEvents.objects`. En juego siempre lo está; `check:movement-actions`
    registra el objeto para ese motivo.
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

**`overworld.c`** (`field/overworld.ts`, `fieldControl.ts`)
- [ ] `Overworld_ResetStateAfterFly/Teleport/DigEscRope/WhitingOut` (delegan en `resetStateAfterWarpOut`).
- [ ] `WarpIntoMap`/`TryFadeOutOldMapMusic` (alias de `warpIntoMapAndLoad`/`tryFadeOutOldMapMusic`).
- [ ] `GetMapTypeByGroupAndId`, `GetLastUsedWarpMapType`, `GetSavedWarpRegionMapSectionId`,
  `GetCurrentRegionMapSectionId`, `GetCurrentMapBattleScene`.
- [ ] `SetDiveWarpEmerge`/`SetDiveWarpDive`; `cb1`/`cb2`;
  `CB2_ReturnToFieldContinueScript(PlayMapMusic)`/`CB2_ContinueSavedGame`.
- [ ] `DoCB1_Overworld_QuestLogPlayback`, `LoadMap_QLPlayback`,
  `CB2_SetUpOverworldForQLPlayback*`, `QL_UpdateObject`/`QL_UpdateObjectEventCurrentMovement`.

**`quest_log.c`**
- [ ] Callbacks de entrada/fin de playback, `RunQuestLogCB`, `QLogCB_Playback`,
  `QuestLog_PlayCurrentEvent`, `HandleShowQuestLogMessage`, callback de grabación en `QL_TryRunActions`.

**`battle_transition.c`** (`battle/transition.ts`)
- [ ] Driver de intro y transición; helpers de scanline y HBlank/VBlank; `SetSinWave`/`SetCircularMask`.
- [ ] `Task_Swirl`/`Swirl_*`/`VBlankCB_Swirl`; `Task_Ripple`/`Ripple_*`/`VBlankCB_Ripple`/`HBlankCB_Ripple`.
- [ ] `Task_BigPokeball` y sus callbacks/buffers; `Task_ClockwiseWipe` y fases;
  familia `Task_Slice`/`Slice_*`; `Task_WhiteBarsFade` y callbacks Sprite/VBlank/HBlank.

**`intro.c`** (`introCopyright.ts`, `introGameFreak.ts`, `introScene*.ts`)
- [ ] Callbacks Game Freak, tareas/etapas de escenas 1–3, `Scene3_*`/`SpriteCB_*`;
  `SetUpCopyrightScreen` y `CB2_WaitFadeBeforeSetUpIntro` (etapa de arranque web).

**`field_effect.c`**
- [ ] `popOutOfAsh`/`startLavaridgeGymWarpEffect` y callbacks `SpriteCB_*` conectados a sus tareas.

**`party_menu.c`**
- [ ] `CreatePartyMon*SpriteParameterized` (especie, prioridad, estado, objeto);
  `PartyMenuStartSpriteAnim`, los tres `CB2_ReturnTo*Menu`, `CB2_SetUpExitToBattleScreen`.

**`pokemon.c`**
- [ ] `GetLevelFromBoxMonExp`, `GetBoxMonGender`, `GetBoxMonData3`, `SetBoxMonData`,
  `GetMonAbility`, `GetMonSpritePalStruct` (delegan en sus equivalentes de Mon).

**`pokemon_summary_screen.c`**
- [ ] `SwapBoxMonMoveSlots`, `UpdateCurrentMonBufferFromPartyOrBox`, transición de
  páginas, setup y `SpriteCB_MonPicDummy`.

**`text.c`** (`gba/textPrinter.ts`, `gba/font.ts`)
- [ ] `DecompressGlyph_NormalCopy2`, `TextPrinter*` ×6 y `RenderText`.

**`m4a.c`** (`audio/sound.ts`, `audio/m4a.ts`)
- [ ] `m4aSongNumStart*`, `m4aSongNumStop/Continue`, `m4aMPlayContinue/FadeOut/
  FadeOutTemporarily/FadeIn/VolumeControl`, `m4aSoundInit`/`m4aSoundMain`,
  `SetPokemonCryTone`, `SetPokemonCryStereo`, `IsPokemonCryPlaying`, `m4aMPlayPanpotControl`.

**Otros archivos**
- [ ] `field_player_avatar.c`: renombres.
- [ ] `field_control_avatar.c`: getters de posición y helpers con `FieldControl` como contexto.
- [ ] `start_menu.c`: `ShowStartMenu`, `SetUpReturnToStartMenu`, `CloseStartMenu`,
  `CloseSaveStatsWindow_`, `FieldCB_ReturnToFieldOpenStartMenu`.
- [ ] `vs_seeker.c`: `VsSeekerFreezeObjectsAfterChargeComplete`, `VsSeekerResetObjectMovementAfterChargeComplete`.
- [ ] `trainer_card.c`: `Unref_InitTrainerCard`; `battle_setup.c`: `SetBattledTrainerFlag2`.
- [ ] `trainer_tower.c`: `TT_ConvertEasyChatMessageToString`, `GetTrainerTowerTrainerFrontSpriteId`,
  `CB2_EndTrainerTowerBattle`, `Task_DoTrainerTowerBattle`.
- [ ] `battle_tower.c`: `Task_WaitBT` (adapta el scheduler a `game.startBattle`).
- [ ] `trade_scene.c`: `LoadTradeAnimGfx`; `mail.c`: `GetInGameTradeMail` (`attachTradeMail`).
- [ ] `trade_scene.c`: `TradeAnimInit_LoadGfx` (renombrado en 1.2) no sigue el cuerpo C:
  el C hace `ChangeBgX/Y(0, 0, 0)`, carga dos veces gráficos, tilemap y paleta del
  textbox de combate (`gBattleInterface_Textbox_*`) y no asigna buffer a BG2; el TS
  asigna BG2 y no carga el textbox. Comprobar si esa carga ocurre en otro sitio.
- [ ] `metatile_behavior.c`: fachada de predicados en `fieldmap.ts`.

## 3. Validación en navegador

Todo lo siguiente solo se ha comparado de forma estática o con checks headless.

Receta (métodos detallados en la [guía técnica §6](docs/PORTING-GUIDE.md#6-cómo-se-prueba-y-valida)):
1. Arranca el servidor: `preview_start` con el nombre `vite` (o `npm run dev`) y
   abre `http://localhost:5173/?fr=continue` (o `?fr=new` para partida nueva).
2. En la consola de la página: `const { H } = await import("/tools/playtest/driver.js"); await H.init();`
   Las partidas guardadas del repo están en `tools/playtest/saves/` (`H.importSave(nombre)`).
3. Lleva el juego hasta la pantalla o mecánica (driver: `H.goto`, `H.talk`,
   `H.battle`, `frDebug.press("A")`…) y lee el estado (`frDebug.state()`, `H.st()`)
   en vez de adivinar.
4. Revisa la consola (sin errores) y haz una captura en el momento clave.
5. Terminada cuando: se ve y se comporta como el juego original y no hay errores
   en consola. Marca `[x]` y apunta en el informe qué partida usaste.
6. Si algo falla, no lo arregles en la misma sesión salvo que sea trivial: añádelo
   como tarea nueva en la sección 1 con los pasos para reproducirlo.

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
- [ ] Entrenadores: tabla de facing y recorrido de batalla; IA de entrenadores;
  sprites de combate; derrota/whiteout.

**Pantallas y menús**
- [ ] Título, Copyright, Game Freak y escenas 1–3 de la intro.
- [ ] Retorno del party menu al campo (fade/controles); naming/subsprites.
- [ ] Cajas del PC y resumen (incluida la regla HM del resumen); guardería; Teachy TV; Fame Checker.
- [ ] Guardado desde script: confirmación, cancelar, escritura y retorno al script.
- [ ] Battle Records y Trainer Tower; Battle Tower y flujo e-Reader.
- [ ] Quest Log: reproducción/UI, paridad normal/warp y retorno al mapa guardado.
- [ ] Pantallas de la sección 5 de [PENDING.md](PENDING.md) (Pokédex, tienda, PC,
  Hall of Fame, créditos, tragaperras, Item Finder, intercambio NPC, etc.).

## 4. Recorrido de historia

Sigue [PLAN-RECORRIDO.md](PLAN-RECORRIDO.md): un tramo por sesión, punto de control
antes de cada tramo y partida exportada a `tools/playtest/saves/` al terminarlo. Lo
primero es terminar el tramo 1 (salida de Monte Moon a la Ruta 4).

- [ ] Recorrido zona por zona de Kanto y Sevii según [PLAN-RECORRIDO.md](PLAN-RECORRIDO.md)
  (desde Ruta 3; incluye Monte Moon), con partidas de regresión por tramo.
- [ ] Checks headless por sistema en `tools/checks/` donde falten.
- [ ] Decisión de diseño postgame (tickets de Mew/Deoxys).

## 5. Fuera de la meta principal (después)

Enlace e inalámbrico (tabla `LINK` de `tools/portInventory.py`): combate e
intercambio por cable/RFU, Union Room, Mystery Gift/Wonder Card (bloquea
`GetSavedRamScriptIfValid`), e-Reader, minijuegos multijugador, actualización de
Battle Records por Cable Club y la parte de enlace de `trade.c`.
