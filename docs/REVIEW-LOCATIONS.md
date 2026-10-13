# Dónde está cada función de la sección 2 (generado)

Generado por `npm run review:where` a partir de `TAREAS-FINALES.md` §2; no editar a mano.
Las líneas cambian con el código: regenera antes de revisar. C: `../pokefirered/src/`.

## event_object_movement.c

| Nombre | C | TS |
|---|---|---|
| `MovementAction_*` | 285 funciones | 282 funciones |
| `MovementType_*` | 148 funciones | 142 funciones |
| `movementActionStep` | — | `src/games/firered/field/objectEvents.ts:3015` |
| `UpdateObjectEventCurrentMovement` | `event_object_movement.c:5110` | `src/games/firered/field/objectEvents.ts:1969` |
| `ObjectEventSetSingleMovement` | `event_object_movement.c:5267` | `src/games/firered/field/objectEvents.ts:2086` |
| `ObjectEventExecSingleMovementAction` | `event_object_movement.c:5256` | `src/games/firered/field/objectEvents.ts:2095` |
| `ClearObjectEventMovement` | `event_object_movement.c:4647` | `src/games/firered/field/objectEvents.ts:2605` |
| `GetTrainerFacingDirectionMovementType` | `event_object_movement.c:4815` | `src/games/firered/field/objectEvents.ts:28` |
| `GetVectorDirection` | `event_object_movement.c:2801` | `src/games/firered/field/objectEvents.ts:131` |
| `GetLimitedVectorDirection_*` | 10 funciones | 10 funciones |
| `TryGetTrainerEncounterDirection` | `event_object_movement.c:2992` | `src/games/firered/field/objectEvents.ts:2149` |
| `MoveCoords` | `event_object_movement.c:4940` | `src/games/firered/field/objectEvents.ts:53` |
| `MoveCoordsInDirection` | `event_object_movement.c:4953` | `src/games/firered/field/objectEvents.ts:60` |
| `SetObjectEventCoords` | `event_object_movement.c:2257` | `src/games/firered/field/objectEvents.ts:1232` |
| `GetAvailableObjectEventId` | `event_object_movement.c:1489` | `src/games/firered/field/objectEvents.ts:989` |
| `TrySetupObjectEventSprite` | `event_object_movement.c:1549` | `src/games/firered/field/objectEvents.ts:1220` |
| `TrySpawnObjectEventTemplate` | `event_object_movement.c:1599` | `src/games/firered/field/objectEvents.ts:1053` (comentario) |
| `TrySpawnObjectEvents` | `event_object_movement.c:1792` | `src/games/firered/field/objectEvents.ts:1404` |
| `RemoveObjectEventsOutsideView` | `event_object_movement.c:1819` | `src/games/firered/field/objectEvents.ts:1465` |
| `GroundEffect_*` | 20 funciones | 20 funciones |
| `DoTracksGroundEffect_*` | 3 funciones | 3 funciones |
| `ObjectEventSetHeldMovement` | `event_object_movement.c:5049` | `src/games/firered/field/objectEvents.ts:1805` |
| `ObjectEventForceSetHeldMovement` | `event_object_movement.c:5064` | `src/games/firered/field/objectEvents.ts:1814` |
| `ObjectEventFaceOppositeDirection` | `event_object_movement.c:5193` | `src/games/firered/field/objectEvents.ts:1831` |
| `InitNpcForWalk*` | 3 funciones | 3 funciones |
| `InitWalk*` | 3 funciones | 4 funciones |
| `UpdateWalk*` | 6 funciones | 7 funciones |
| `InitRunSlow` | `event_object_movement.c:6529` | `src/games/firered/field/objectEvents.ts:2850` |
| `UpdateRunSlow` | `event_object_movement.c:6535` | `src/games/firered/field/objectEvents.ts:2861` |
| `Step1` | `event_object_movement.c:8827` | `src/games/firered/field/objectEvents.ts:76` |
| `NpcTakeStep` | `event_object_movement.c:8933` | `src/games/firered/field/objectEvents.ts:2702` (comentario) |
| `UpdateSlowStyleAnim` | — | `src/games/firered/field/objectEvents.ts:2787` |
| `StartFieldEffectForObjectEvent` | `event_object_movement.c:9389` | `src/games/firered/field/fieldEffects.ts:432` |
| `DoRippleFieldEffect` | `event_object_movement.c:9404` | `src/games/firered/field/fieldEffects.ts:1413` |
| `UpdateObjectEventVisibility` | `event_object_movement.c:7966` | `src/games/firered/field/objectEvents.ts:2040` |
| `ObjectEventUpdateSubpriority` | `event_object_movement.c:8424` | `src/games/firered/field/objectEvents.ts:1717` |
| `ObjectEventSetGraphicsId*` | 2 funciones | 2 funciones |
| `ObjectEventTurn*` | 2 funciones | 2 funciones |
| `PlayerObjectTurn` | `event_object_movement.c:2035` | `src/games/firered/field/objectEvents.ts:1778` |
| `SetObjectEventDirection` | `event_object_movement.c:2497` | `src/games/firered/field/objectEvents.ts:1652` |
| `RemoveObjectEvent` | `event_object_movement.c:1514` | `src/games/firered/field/objectEvents.ts:1377` |
| `RemoveObjectEventInternal` | `event_object_movement.c:1530` | `src/games/firered/field/objectEvents.ts:1371` |
| `RemoveObjectEventIfOutsideView` | `event_object_movement.c:1841` | `src/games/firered/field/objectEvents.ts:1472` |
| `InitJumpRegular` | `event_object_movement.c:5741` | `src/games/firered/field/objectEvents.ts:2880` |
| `UpdateJumpAnim` | `event_object_movement.c:5748` | `src/games/firered/field/objectEvents.ts:2927` |
| `DoJumpAnim` | `event_object_movement.c:5786` | `src/games/firered/field/objectEvents.ts:2962` |
| `DoJumpSpecialAnim` | `event_object_movement.c:5794` | `src/games/firered/field/objectEvents.ts:2967` |
| `DoJumpInPlaceAnim` | `event_object_movement.c:5802` | `src/games/firered/field/objectEvents.ts:2972` |
| `InitJumpSpecial` | `event_object_movement.c:6634` | `src/games/firered/field/objectEvents.ts:2887` |
| `InitAcroWheelieJump` | `event_object_movement.c:7365` | `src/games/firered/field/objectEvents.ts:2676` |
| `InitAcroPopWheelie` | `event_object_movement.c:7600` | `src/games/firered/field/objectEvents.ts:2683` |
| `InitAcroWheelieMove` | `event_object_movement.c:7671` | `src/games/firered/field/objectEvents.ts:2690` |
| `InitSpin` | `event_object_movement.c:7741` | `src/games/firered/field/objectEvents.ts:2696` |
| `AcroWheelieFaceDirection` | `event_object_movement.c:7260` | `src/games/firered/field/objectEvents.ts:2667` |
| `ObjectEventIsTrainerAndCloseToPlayer` | `event_object_movement.c:2772` | `src/games/firered/field/objectEvents.ts:2113` |
| `MoveNextDirectionInSequence` | `event_object_movement.c:3909` | `src/games/firered/field/objectEvents.ts:2127` |
| `GetLedgeJumpDirection` | `event_object_movement.c:8303` | `src/games/firered/field/playerAvatar.ts:1234` |
| `CopyablePlayerMovement_*` | 8 funciones | 9 funciones |
| `cph_IM_DIFFERENT` | `event_object_movement.c:4380` | `src/games/firered/field/objectEvents.ts:2579` |
| `SpawnObjectEventsOnReturnToField` | `event_object_movement.c:1857` | `src/games/firered/field/objectEvents.ts:1263`, `src/games/firered/field/overworld.ts:1215` |

## overworld.c

| Nombre | C | TS |
|---|---|---|
| `Overworld_ResetStateAfterFly` | `overworld.c:289` | `src/games/firered/field/overworld.ts:541` |
| `CB2_WhiteOut` | `overworld.c:1545` | `src/games/firered/game.ts:1088` |
| `WarpIntoMap` | `overworld.c:583` | `src/games/firered/field/overworld.ts:673` |
| `TryFadeOutOldMapMusic` | `overworld.c:1112` | `src/games/firered/field/overworld.ts:2343` |
| `GetMapTypeByGroupAndId` | `overworld.c:1203` | `src/games/firered/field/overworld.ts:340` |
| `GetLastUsedWarpMapType` | `overworld.c:1218` | `src/games/firered/field/overworld.ts:350` |
| `GetSavedWarpRegionMapSectionId` | `overworld.c:1260` | `src/games/firered/field/overworld.ts:360` |
| `GetCurrentRegionMapSectionId` | `overworld.c:1265` | `src/games/firered/field/overworld.ts:365` |
| `GetCurrentMapBattleScene` | `overworld.c:1270` | `src/games/firered/field/overworld.ts:370` |
| `SetDiveWarpEmerge` | `overworld.c:740` | `src/games/firered/field/overworld.ts:468` |
| `SetDiveWarpDive` | `overworld.c:745` | `src/games/firered/field/overworld.ts:473` |
| `cb1` | — | `src/games/firered/field/overworld.ts:2624` |
| `cb2` | — | `src/games/firered/field/overworld.ts:2632` |
| `CB2_ContinueSavedGame` | `overworld.c:1691` | `src/games/firered/game.ts:362` |
| `SetWarpDestination` | `overworld.c:590` | `src/games/firered/field/overworld.ts:384` |
| `DoCB1_Overworld_QuestLogPlayback` | `overworld.c:1420` | `src/games/firered/field/fieldControl.ts:162` |
| `LoadMap_QLPlayback` | `overworld.c:2246` | `src/games/firered/field/overworld.ts:822` |
| `CB2_SetUpOverworldForQLPlayback*` | 2 funciones | 2 funciones |
| `QL_UpdateObject` | `quest_log.c:1340` | `src/games/firered/field/objectEvents.ts:1936` |
| `QL_UpdateObjectEventCurrentMovement` | `event_object_movement.c:5127` | `src/games/firered/field/objectEvents.ts:1941` |

## quest_log.c

| Nombre | C | TS |
|---|---|---|
| `RunQuestLogCB` | `quest_log.c:223` | `src/games/firered/questLogEvents.ts:847` |
| `QLogCB_Playback` | `quest_log.c:270` | `src/games/firered/questLogEvents.ts:825` |
| `QuestLog_PlayCurrentEvent` | `quest_log.c:916` | `src/games/firered/questLogEvents.ts:852` |
| `HandleShowQuestLogMessage` | `quest_log.c:945` | `src/games/firered/questLogEvents.ts:890` |
| `QL_TryRunActions` | `quest_log.c:1594` | `src/games/firered/questLogEvents.ts:1169` |
| `QL_StartRecordingAction` | `quest_log.c:301` | `src/games/firered/questLogEvents.ts:263` |
| `ClearSavedScene` | `quest_log.c:212` | — |
| `Task_BeginQuestLogPlayback` | `quest_log.c:473` | — |

## battle_transition.c

| Nombre | C | TS |
|---|---|---|
| `SetSinWave` | `battle_transition.c:2895` | `src/games/firered/battle/transition.ts:1020` |
| `SetCircularMask` | `battle_transition.c:2903` | `src/games/firered/battle/transition.ts:1026` |
| `Task_Swirl` | `battle_transition.c:773` | `src/games/firered/battle/transition.ts:1254` |
| `Swirl_*` | 2 funciones | 2 funciones |
| `VBlankCB_Swirl` | `battle_transition.c:803` | `src/games/firered/battle/transition.ts:1284` |
| `Task_Ripple` | `battle_transition.c:1412` | `src/games/firered/battle/transition.ts:1175` |
| `Ripple_*` | 2 funciones | 2 funciones |
| `VBlankCB_Ripple` | `battle_transition.c:1461` | `src/games/firered/battle/transition.ts:1212` |
| `HBlankCB_Ripple` | `battle_transition.c:1468` | `src/games/firered/battle/transition.ts:1218` |
| `Task_BigPokeball` | `battle_transition.c:906` | `src/games/firered/battle/transition.ts:1051` |
| `Task_ClockwiseWipe` | `battle_transition.c:1207` | `src/games/firered/battle/transition.ts:426` |
| `Task_Slice` | `battle_transition.c:2293` | `src/games/firered/battle/transition.ts:518` |
| `Slice_*` | 3 funciones | 3 funciones |
| `Task_WhiteBarsFade` | `battle_transition.c:2402` | `src/games/firered/battle/transition.ts:688` |

## intro.c

| Nombre | C | TS |
|---|---|---|
| `Scene3_*` | 26 funciones | 26 funciones |
| `SpriteCB_*` | 205 funciones | 178 funciones |
| `SetUpCopyrightScreen` | `intro.c:916` | `src/games/firered/introCopyright.ts:40` |
| `CB2_WaitFadeBeforeSetUpIntro` | `intro.c:898` | `src/games/firered/introCopyright.ts:36` |

## field_effect.c

| Nombre | C | TS |
|---|---|---|
| `popOutOfAsh` | — | `src/games/firered/field/fieldEffects.ts:1987` |
| `startLavaridgeGymWarpEffect` | — | `src/games/firered/field/fieldEffects.ts:2008` |
| `SpriteCB_*` | 205 funciones | 178 funciones |

## party_menu.c

| Nombre | C | TS |
|---|---|---|
| `PartyMenuStartSpriteAnim` | `party_menu.c:2870` | `src/games/firered/partyMenu.ts:490` |
| `CB2_SetUpExitToBattleScreen` | `party_menu.c:6236` | `src/games/firered/partyMenu.ts:3293` |

## pokemon.c

| Nombre | C | TS |
|---|---|---|
| `GetMonSpritePalStruct` | `pokemon.c:5918` | `src/games/firered/trainerPokemonSprites.ts:74` |

## pokemon_summary_screen.c

| Nombre | C | TS |
|---|---|---|
| `SwapBoxMonMoveSlots` | `pokemon_summary_screen.c:3715` | `src/games/firered/pokemonSummaryScreen.ts:3051` |
| `UpdateCurrentMonBufferFromPartyOrBox` | `pokemon_summary_screen.c:3750` | `src/games/firered/pokemonSummaryScreen.ts:3096` |
| `SpriteCB_MonPicDummy` | `pokemon_summary_screen.c:4003` | `src/games/firered/pokemonSummaryScreen.ts:1622` |

## text.c

| Nombre | C | TS |
|---|---|---|
| `DecompressGlyph_NormalCopy2` | `text.c:1503` | `src/core/gba/textPrinter.ts:779` |
| `TextPrinter*` | 6 funciones | 6 funciones |
| `TextPrinterDrawDownArrow` | `text.c:471` | `src/core/gba/textPrinter.ts:272` |
| `TextPrinterClearDownArrow` | `text.c:522` | `src/core/gba/textPrinter.ts:287` |
| `RenderText` | `text.c:629` | `src/core/gba/textPrinter.ts:339` |

## m4a.c

| Nombre | C | TS |
|---|---|---|
| `m4aSongNumStart*` | 3 funciones | 3 funciones |
| `m4aSongNumStop` | `m4a.c:153` | `src/core/audio/sound.ts:193` |
| `SetPokemonCryTone` | `m4a.c:1660` | `src/core/audio/sound.ts:520` |
| `SetPokemonCryStereo` | `m4a.c:1758` | `src/core/audio/sound.ts:141` |
| `IsPokemonCryPlaying` | `m4a.c:1735` | `src/core/audio/sound.ts:540` |
| `m4aMPlayPanpotControl` | `m4a.c:1314` | `src/core/audio/sound.ts:680` |

## otros

| Nombre | C | TS |
|---|---|---|
| `ShowStartMenu` | `start_menu.c:396` | `src/games/firered/startMenu.ts:141` |
| `SetUpReturnToStartMenu` | `start_menu.c:371` | `src/games/firered/startMenu.ts:144` |
| `CloseStartMenu` | `start_menu.c:1003` | `src/games/firered/startMenu.ts:176` |
| `CloseSaveStatsWindow_` | `start_menu.c:661` | `src/games/firered/startMenu.ts:340` |
| `FieldCB_ReturnToFieldOpenStartMenu` | `field_fadetransition.c:498` | `src/games/firered/startMenu.ts:170` |
| `VsSeekerFreezeObjectsAfterChargeComplete` | `vs_seeker.c:598` | `src/games/firered/field/vsSeeker.ts:314` |
| `VsSeekerResetObjectMovementAfterChargeComplete` | `vs_seeker.c:636` | `src/games/firered/field/vsSeeker.ts:332` |
| `Unref_InitTrainerCard` | `trainer_card.c:1939` | `src/games/firered/menus/trainerCard.ts:1463` |
| `SetBattledTrainerFlag2` | `battle_setup.c:876` | `src/games/firered/battle/battleSetup.ts:246` |
| `TT_ConvertEasyChatMessageToString` | `trainer_tower.c:631` | `src/games/firered/trainerTower.ts:102` |
| `GetTrainerTowerTrainerFrontSpriteId` | `trainer_tower.c:455` | `src/games/firered/trainerTower.ts:347` |
| `CB2_EndTrainerTowerBattle` | `trainer_tower.c:717` | `src/games/firered/trainerTower.ts:219` |
| `Task_DoTrainerTowerBattle` | `trainer_tower.c:722` | `src/games/firered/trainerTower.ts:224` |
| `Task_WaitBT` | `battle_tower.c:883` | `src/games/firered/battleTower.ts:292` |
| `LoadTradeAnimGfx` | `trade_scene.c:2803` | `src/games/firered/pokemon/ingameTrade.ts:369` |
| `GetInGameTradeMail` | `trade_scene.c:2500` | `src/games/firered/pokemon/mail.ts:279` |
| `attachTradeMail` | — | `src/games/firered/pokemon/mail.ts:263` |
| `TradeAnimInit_LoadGfx` | `trade_scene.c:927` | `src/games/firered/pokemon/ingameTrade.ts:356` |
| `ChangeBgX` | `bg.c:590` | `src/core/hw/bg.ts:379` |

## No encontrados (buscar a mano)

- event_object_movement.c: `false`
- event_object_movement.c: `gCopyPlayerMovementFuncs`
- overworld.c: `Teleport`
- overworld.c: `DigEscRope`
- overworld.c: `WhitingOut`
- pokemon.c: `MON_DATA_SPECIES_OR_EGG`
- text.c: `c4282dab`
- m4a.c: `Continue`
- otros: `FieldControl`
- otros: `gBattleInterface_Textbox_*`
