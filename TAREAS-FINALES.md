# Tareas finales del juego de un jugador

Lista única de lo que queda para dar por terminado el port de un jugador
(auditoría del 2026-10-01). Las cifras vivas están en [PENDING.md](PENDING.md);
el estado breve, en [PORTING-STATUS.md](PORTING-STATUS.md). Marca `[x]` al
cerrar una tarea y retira la línea solo cuando esté revisada; no borres entradas
sin resolverlas.

Por nombres, el juego de un jugador está completo: los 354 nombres que faltan
son de enlace/multijugador, hardware GBA sustituido por Canvas/WebAudio o
funciones sin caller en el propio C. Lo pendiente es cerrar los huecos de
abajo, revisar las equivalencias y validar en navegador.

## 1. Código de un jugador por cerrar

- [ ] **Grabación del Quest Log** (`quest_log.c`): `TryRecordActionSequence`,
  `ResetActions`, `RecordHeadAtEndOfEntry`, `RecordHeadAtEndOfEntryOrScriptContext2Enabled`,
  `ClearSavedScene` y `Task_BeginQuestLogPlayback` son lógica activa en C. El TS
  escribe las acciones directamente en `scene.script` y guarda las escenas en un
  array (`push`/`splice`) en lugar del anillo de escenas con buffer de acciones.
  Revisar volcado, límites y rotación de escenas contra C (`questLogEvents.ts`).
- [ ] **Evolución tras intercambio con NPC**: en C, `STATE_TRY_EVOLUTION` llama
  `TradeEvolutionScene` con `gCB2_AfterEvolution = CB2_InGameTrade`; el TS
  (`pokemon/ingameTrade.ts`) usa `evolveWithMessages` tras el fundido y comprueba
  Everstone aparte. Inalcanzable con los datos FireRed (ningún Pokémon recibido
  evoluciona por intercambio), pero diverge. Portar la familia `TradeEvolutionScene`
  de `evolution_scene.c` (6 nombres) también desbloquea el intercambio por enlace.
- [ ] **Renombrar equivalencias existentes** al nombre C: `oac_poke_ally_`
  (hoy `SpriteCB_AllyMonSlide`, `battle/main_init.ts`) y `TradeAnimInit_LoadGfx`
  (detrás de `LoadTradeAnimGfx`, `trade_scene.c`).
- [ ] **Easy Chat**: escribir cartas (`easy_chat*.c`); hoy quedan en blanco.
- [ ] **Clima**: conectar `field/weather.ts` al render Canvas2D.
- [ ] **Créditos**: las escenas de mapa no ejecutan NPCs, clima ni animación de tilesets.
- [ ] **Audio M4A**: chorus/ADSR, arbitraje de cuatro voces, reverb/duty/sweep/keysplit
  (cries con WAV). Los 47 nombres restantes de `m4a.c` son driver interno.
- [ ] **Checks headless rotos**: `check:questlog-objects` y `check:movement-actions`
  fallan antes de sus aserciones porque `rom.charmap` no está definido en Node.
- [ ] **Whiteout**: `Overworld_SetWhiteoutRespawnPoint` (`field/overworld.ts`) descarta
  la información de curandero/casa que calcula el C; confirmar contra `DoWhiteOut`
  y actualizar el comentario.
- [ ] **Módulos sin caller** (sección 3c de PENDING.md): decidir conectar o borrar
  `game/slots.ts` (duplicado de `menus/slotMachine.ts`), `field/fieldEffectHelpers.ts`
  (los efectos reales están en `field/fieldEffects.ts`), `paletteUtil.ts`,
  `monMarkings.ts`, `cableCarUtil.ts`, `hw/tilemapUtil.ts`, `hw/bgRegs.ts`,
  `imageProcessingEffects.ts` y `keyItemScreens.openTeachyTv`.
- [ ] **Huecos conocidos posiblemente obsoletos**: comprobar y actualizar en
  `KNOWN_GAPS` (`tools/portPending.py`) las notas de `item_use.c` ("faltan 12/73")
  y de mugshots de Alto Mando/Campeón en transiciones de combate.

## 2. Revisión de equivalencias y wrappers contra el cuerpo C

Funciones con nombre C que delegan en lógica genérica o adaptada. Revisar cada una
contra el C y retirar la línea al confirmarla.

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
- [ ] `metatile_behavior.c`: fachada de predicados en `fieldmap.ts`.

## 3. Validación en navegador

Todo lo siguiente solo se ha comparado de forma estática o con checks headless.

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

- [ ] Recorrido zona por zona de Kanto y Sevii según [PLAN-RECORRIDO.md](PLAN-RECORRIDO.md)
  (desde Ruta 3; incluye Monte Moon), con partidas de regresión por tramo.
- [ ] Checks headless por sistema en `tools/checks/` donde falten.
- [ ] Decisión de diseño postgame (tickets de Mew/Deoxys).

## 5. Fuera de la meta principal (después)

Enlace e inalámbrico (tabla `LINK` de `tools/portInventory.py`): combate e
intercambio por cable/RFU, Union Room, Mystery Gift/Wonder Card (bloquea
`GetSavedRamScriptIfValid`), e-Reader, minijuegos multijugador, actualización de
Battle Records por Cable Club y la parte de enlace de `trade.c`.
