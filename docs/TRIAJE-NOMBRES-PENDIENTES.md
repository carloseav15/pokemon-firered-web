# Triaje de los nombres pendientes del inventario (2026-10-12)

**Conclusión:** `PENDING.md` cuenta nombres C sin homólogo del mismo nombre en `src/games/firered`. De los 345
nombres que quedan (PENDING.md da 343: este script usa una comprobación de nombre más simple que el inventario) en los 22 archivos en alcance, **no se identificó ninguna tanda de código de un jugador claramente por portar**
(la categoría «equivalencia por revisar» no está verificada función a función): son enlace/cable, el motor de audio m4a sustituido por WebAudio, código sin ningún caller en el C, o
funciones cuyo comportamiento vive en TS con otra estructura. No hace falta repetir este análisis; vuelve a
generarlo solo si cambia el inventario.

Método: `tools/portInventory.py` (`c_functions`, `load_ts`) sobre los archivos de la tabla 1 de `PENDING.md`;
categoría = patrón de nombre (enlace), archivo (`m4a.c`), nombre citado en algún `.ts` de `src/games/firered`
(citado), número de usos en `../pokefirered/src/*.c` (muerto: una sola aparición, o `Unref_`/`Unused`/`UnkUtil`)
o el resto (equivalencia por revisar). Es heurística: la lista "equivalencia" requiere confirmar cada función
contra el TS en la fase de revisión (§2 de `TAREAS-FINALES.md`).

| Categoría | Nombres | Qué hacer |
|---|---:|---|
| Enlace / cable / unión / comercio / minijuegos / teclas de jugador remoto | 173 | Fuera de la meta principal (tabla `LINK`). Nada que hacer ahora. |
| `m4a.c` (motor de sonido GBA) | 47 | Sustituido por el motor WebAudio (`tools/playtest/m4aAudio.job.mjs`); sustitución de hardware, no portar. |
| Sin caller en el C (código muerto) | 40 | No portar; `QuestLogResetFlagsOrVars` es "Unused", así que `QuestLogGetFlagOrVarPtr`/`QuestLogSetFlagOrVar` son inertes en FireRed. |
| Citados en TS (existen con otra forma) | 15 | Equivalencia ya reconocida. |
| Equivalencia por revisar (con callers) | 70 | Revisar contra el TS en §2; ver notas abajo. |

## Notas sobre «equivalencia por revisar»

- `field_effect.c`: intérprete de scripts de efecto (`FieldEffectCmd_*`, `FieldEffectScript_*`,
  `FieldEffectFree*`); el TS carga recursos por datos. Comprobar liberación de paletas/tiles.
- `event_object_movement.c`: objeto cámara (`AddCameraObject`, `CameraObject*`) y reflejos; el seguimiento de
  cámara vive en `field/overworld.ts`. Comprobar `CameraObjectSetFollowedObjectId` en `trainer_see`/`field_specials`.
- `overworld.c`: preparación de fondos/VBlank y bucle de carga de mapa (`InitOverworldBgs`, `DoMapLoadLoop`,
  `ResetScreenForMapLoad`, `VBlankCB_Field`) sustituidos por el motor de render; las teclas/estados de jugadores
  remotos son enlace.
- `battle_main.c` / `battle_transition.c` / `party_menu.c`: callbacks de intro, destellos, letras VS y salida del menú
  de equipo; comprobar `TryCorrectShedinjaLanguage` y `BattleIntroSwitchInPlayerMons`.
- `quest_log.c`: `TryRecordActionSequence`, `ResetActions`, `Task_BeginQuestLogPlayback`, `ClearSavedScene`
  existen como lógica de `questLogEvents.ts` con buffers de TS (sin punteros GBA).

## Listas

### Enlace
- `battle_controller_player.c` (1): `SetLinkBattleEndCallbacks`
- `field_control_avatar.c` (2): `GetInteractedLinkPlayerScript`, `SetCableClubWarp`
- `intro.c` (1): `SerialCB_CopyrightScreen`
- `main.c` (2): `SerialIntr`, `RestoreSerialTimer3IntrHandlers`
- `start_menu.c` (6): `StartMenuLinkPlayerCallback`, `VBlankCB_WhileSavingAfterLinkBattle`, `DoSetUpSaveAfterLinkBattle`, `CB2_SetUpSaveAfterLinkBattle`, `CB2_WhileSavingAfterLinkBattle`, `task50_after_link_battle_save`
- `quest_log.c` (1): `QL_AddASLROffset`
- `battle_bg.c` (3): `DrawLinkBattleParticipantPokeballs`, `DrawLinkBattleVsScreenOutcomeText`, `InitLinkBattleVsScreen`
- `pokemon_summary_screen.c` (4): `IsMultiBattlePartner`, `SeekToMonInMultiParty_SeekForward`, `SeekToMonInMultiParty_SeekBack`, `SeekToNextMonInMultiParty`
- `pokemon.c` (4): `GetLinkTrainerFlankId`, `GetBattlerMultiplayerId`, `GetUnionRoomTrainerPic`, `GetUnionRoomTrainerClass`
- `field_effect.c` (1): `MultiplyPaletteRGBComponents`
- `quest_log_events.c` (19): `TryDeferLinkEvent`, `ResetDeferredLinkEvent`, `RecordEvent_LinkTraded`, `LoadEvent_LinkTraded`, `RecordEvent_LinkBattledSingle`, `LoadEvent_LinkBattledSingle`, `RecordEvent_LinkBattledDouble`, `LoadEvent_LinkBattledDouble`, `RecordEvent_LinkBattledMulti`, `LoadEvent_LinkBattledMulti`, `RecordEvent_UsedUnionRoom`, `LoadEvent_UsedUnionRoom`, `RecordEvent_UsedUnionRoomChat`, `LoadEvent_UsedUnionRoomChat`, `RecordEvent_LinkTradedUnionRoom`, `LoadEvent_LinkTradedUnionRoom`, `RecordEvent_LinkBattledUnionRoom`, `LoadEvent_LinkBattledUnionRoom`, `TranslateLinkPartnersName`
- `event_object_movement.c` (2): `MoveUnionRoomObjectUp`, `MoveUnionRoomObjectDown`
- `party_menu.c` (22): `DisplayPartyPokemonDataForWirelessMinigame`, `DisplayPartyPokemonDataForMultiBattle`, `Task_WaitForLinkAndReturnToChooseMon`, `SetPartyMonsAllowedInMinigame`, `IsMonAllowedInPokemonJump`, `IsMonAllowedInDodrioBerryPicking`, `IsMonAllowedInMinigame`, `TryEnterMonForMinigame`, `CancelParticipationPrompt`, `Task_CancelParticipationYesNo`, `Task_HandleCancelParticipationYesNoInput`, `DrawHeldItemIconsForTrade`, `CreateHeldItemSpriteForTrade`, `CursorCB_Trade1`, `CursorCB_Trade2`, `SwitchPartyOrderLinkMulti`, `ShowPartyMenuToShowcaseMultiBattleParty`, `Task_InitMultiPartnerPartySlideIn`, `Task_MultiPartnerPartySlideIn`, `Task_WaitAfterMultiPartnerPartySlideIn`, `MoveMultiPartyMenuBoxSprite`, `SlideMultiPartyMenuBoxSpritesOneStep`
- `battle_main.c` (7): `LinkBattleComputeBattleTypeFlags`, `PrepareOwnMultiPartnerBuffer`, `CB2_PreInitMultiBattle`, `CB2_HandleStartMultiBattle`, `CB2_InitEndLinkBattle`, `CB2_EndLinkBattle`, `EndLinkBattleInSteps`
- `overworld.c` (77): `CB2_ReturnToFieldCableClub`, `CB2_LoadMapOnReturnToFieldCableClub`, `CB2_ReturnToFieldLink`, `CB2_ReturnToFieldFromMultiplayer`, `LoadMapInStepsLink`, `ReturnToFieldLink`, `InitObjectEventsLink`, `SetCameraToTrackGuestPlayer`, `SetCameraToTrackGuestPlayer_2`, `OffsetCameraFocusByLinkPlayerId`, `SpawnLinkPlayers`, `CreateLinkPlayerSprites`, `CB1_UpdateLinkState`, `ResetAllMultiplayerState`, `CheckRfuKeepAliveTimer`, `ResetAllLinkStates`, `AreAllPlayersInLinkState`, `IsAnyPlayerInLinkState`, `HandleLinkPlayerKeyInput`, `UpdateAllLinkPlayers`, `KeyInterCB_ReadButtons`, `KeyInterCB_SelfIdle`, `KeyInterCB_Idle`, `KeyInterCB_DeferToEventScript`, `KeyInterCB_DeferToRecvQueue`, `KeyInterCB_DeferToSendQueue`, `KeyInterCB_DoNothingAndKeepAlive`, `KeyInterCB_Ready`, `KeyInterCB_SetReady`, `KeyInterCB_WaitForPlayersToExit`, `KeyInterCB_SendExitRoomKey`, `GetCableClubPartnersReady`, `IsAnyPlayerExitingCableClub`, `SetInCableClubSeat`, `SetLinkWaitingForScript`, `QueueExitLinkRoomKey`, `SetStartedCableClubActivity`, `LoadCableClubPlayer`, `IsCableClubPlayerUnfrozen`, `CanCableClubPlayerPressStart`, `TryGetTileEventScript`, `PlayerIsAtSouthExit`, `TryInteractWithPlayer`, `GetDirectionForEventScript`, `InitLinkPlayerQueueScript`, `InitLinkRoomStartMenuScript`, `RunInteractLocalPlayerScript`, `CreateConfirmLeaveTradeRoomPrompt`, `InitMenuBasedScript`, `RunTerminateLinkScript`, `Overworld_RecvKeysFromLinkIsRunning`, `Overworld_SendKeysToLinkIsRunning`, `IsSendingKeysOverCable`, `GetLinkSendQueueLength`, `ZeroLinkPlayerObjectEvent`, `ClearLinkPlayerObjectEvents`, `SpawnLinkPlayerObjectEvent`, `InitLinkPlayerObjectEventPos`, `SetLinkPlayerObjectRange`, `DestroyLinkPlayerObject`, `GetSpriteForLinkedPlayer`, `GetLinkPlayerCoords`, `GetLinkPlayerFacingDirection`, `GetLinkPlayerElevation`, `GetLinkPlayerObjectStepTimer`, `GetLinkPlayerIdAt`, `MovementEventModeCB_Normal`, `MovementEventModeCB_Ignored`, `MovementEventModeCB_Normal_2`, `FacingHandler_DoNothing`, `FacingHandler_DpadMovement`, `FacingHandler_ForcedFacingChange`, `MovementStatusHandler_EnterFreeMode`, `MovementStatusHandler_TryAdvanceScript`, `LinkPlayerDetectCollision`, `CreateLinkPlayerSprite`, `SpriteCB_LinkPlayer`
- `trade_scene.c` (12): `ClearLinkTimeoutTimer`, `CheckLinkTimeout`, `TradeGetMultiplayerId`, `TryEnableNationalDexFromLinkPartner`, `HandleLinkDataSend`, `CB2_TryLinkTradeEvolution`, `HandleLinkDataReceive`, `CB2_UpdateLinkTrade`, `CB2_WaitTradeComplete`, `CB2_SaveAndEndTrade`, `CB2_FreeTradeAnim`, `Task_AnimateWirelessSignal`
- `field_fadetransition.c` (9): `Task_ContinueScriptUnionRoom`, `FieldCB_ContinueScriptUnionRoom`, `Task_ReturnToFieldCableLink`, `FieldCB_ReturnToFieldCableLink`, `Task_ReturnToFieldRecordMixing`, `FieldCB_ReturnToFieldWirelessLink`, `DoUnionRoomWarp`, `Task_CableClubWarp`, `Task_ReturnFromLinkRoomWarp`

### m4a
- `m4a.c` (47): `MidiKeyToFreq`, `UnusedDummyFunc`, `MPlayContinue`, `MPlayFadeOut`, `m4aMPlayAllContinue`, `m4aMPlayImmInit`, `MPlayExtender`, `MusicPlayerJumpTableCopy`, `ClearChain`, `Clear64byte`, `SoundInit`, `SampleFreqSet`, `m4aSoundMode`, `SoundClear`, `m4aSoundVSyncOff`, `m4aSoundVSyncOn`, `MPlayOpen`, `MPlayStart`, `m4aMPlayStop`, `FadeOutBody`, `TrkVolPitSet`, `MidiKeyToCgbFreq`, `CgbOscOff`, `CgbPan`, `CgbModVol`, `CgbSound`, `m4aMPlayTempoControl`, `m4aMPlayPitchControl`, `ClearModM`, `m4aMPlayModDepthSet`, `m4aMPlayLFOSpeedSet`, `ply_memacc`, `ply_xcmd`, `ply_xxx`, `ply_xwave`, `ply_xtype`, `ply_xatta`, `ply_xdeca`, `ply_xsust`, `ply_xrele`, `ply_xiecv`, `ply_xiecl`, `ply_xleng`, `ply_xswee`, `ply_xwait`, `ply_xcmd_0D`, `DummyFunc`

### Sin caller en el C
- `battle_controller_pokedude.c` (1): `CompleteOnFinishedStatusAnimation2`
- `sprite.c` (2): `CopyFromSprites`, `CopyToSprites`
- `pokemon_storage_system_misc.c` (4): `UnkUtil_CpuAdd`, `UnkUtil_CpuRun`, `UnkUtil_DmaAdd`, `UnkUtil_DmaRun`
- `main.c` (1): `AgbMain`
- `start_menu.c` (1): `SetHasPokedexAndPokemon`
- `battle_transition.c` (1): `BattleTransition_Start`
- `quest_log.c` (1): `QuestLogResetFlagsOrVars`
- `pokemon_summary_screen.c` (1): `ShowPokemonSummaryScreen_NullParty`
- `field_effect.c` (2): `LoadTrainerGfx_TrainerCard`, `AddNewGameBirchObject`
- `quest_log_events.c` (1): `QuestLog_StartRecordingInputsAfterDeferredEvent`
- `event_object_movement.c` (19): `Unref_TryInitLocalObjectEvent`, `Unref_RemoveAllObjectEventsExceptPlayer`, `SetObjectPositionByLocalIdAndMap`, `LoadObjectEventPaletteSet`, `GetReflectionEffectPaletteSlot`, `CameraObjectGetFollowedObjectId`, `GetObjectTrainerTypeByLocalIdAndMap`, `GetObjectTrainerTypeByObjectEventId`, `GetObjectEventBerryTreeIdByLocalIdAndMap`, `GetObjectEventBerryTreeId`, `GetAcroBunnyHopFrontWheelDirectionAnimNum`, `IsBerryTreeSparkling`, `SetBerryTreeJustPicked`, `MoveCoordsInMapCoordIncrement`, `MovementAction_UnusedAcroActionDown_Step0`, `MovementAction_UnusedAcroActionUp_Step0`, `MovementAction_UnusedAcroActionLeft_Step0`, `MovementAction_UnusedAcroActionRight_Step0`, `DestroyVirtualObjects`
- `party_menu.c` (2): `SpriteCB_BounceConfirmCancelButton`, `SwitchAliveMonIntoLeadSlot`
- `battle_main.c` (4): `HBlankCB_Battle`, `SpriteCB_InitFlicker`, `Unused_AutoProgressToIntro`, `BattleIntroSwitchInPlayerMons`

### Citados en TS
- `intro.c` (1): `CB2_InitCopyrightScreenAfterBootup`
- `quest_log.c` (2): `Task_BeginQuestLogPlayback`, `ResetActions`
- `field_effect.c` (3): `FieldEffectFreeGraphicsResources`, `FieldEffectFreeTilesIfUnused`, `FieldEffectFreePaletteIfUnused`
- `event_object_movement.c` (3): `CreateReflectionEffectSprites`, `CameraObjectReset1`, `CameraObjectReset2`
- `overworld.c` (6): `InitOverworldBgs_NoResetHeap`, `CleanupOverworldWindowsAndTilemaps`, `FieldClearVBlankHBlankCallbacks`, `SetFieldVBlankCallback`, `InitOverworldGraphicsRegisters`, `SetKeyInterceptCallback`

### Equivalencia por revisar
- `main.c` (2): `InitFlashTimer`, `IntrDummy`
- `battle_transition.c` (4): `InitTransitionData`, `VBlankCB_BattleTransition`, `GetBg0TilemapDst`, `GetBg0TilesDst`
- `quest_log.c` (4): `ClearSavedScene`, `TryRecordActionSequence`, `QuestLogGetFlagOrVarPtr`, `QuestLogSetFlagOrVar`
- `pokemon_summary_screen.c` (1): `PokeSum_CanSeekToMon`
- `pokemon.c` (1): `GetTrainerPartnerName`
- `field_effect.c` (13): `FieldEffectCmd_loadtiles`, `FieldEffectCmd_loadfadedpal`, `FieldEffectCmd_loadpal`, `FieldEffectCmd_callnative`, `FieldEffectCmd_end`, `FieldEffectCmd_loadgfx_callnative`, `FieldEffectCmd_loadtiles_callnative`, `FieldEffectCmd_loadfadedpal_callnative`, `FieldEffectScript_ReadWord`, `FieldEffectScript_LoadTiles`, `FieldEffectScript_LoadFadedPal`, `FieldEffectScript_LoadPal`, `FieldEffectScript_CallNative`
- `event_object_movement.c` (20): `CopyObjectGraphicsInfoToSpriteTemplate_WithMovementType`, `MakeObjectTemplateFromObjectEventTemplate`, `LoadPlayerObjectReflectionPalette`, `UpdateObjectEventCoordsForCameraUpdate`, `UpdateObjectEventsForCameraUpdate`, `AddCameraObject`, `ObjectCB_CameraObject`, `CameraObject_0`, `CameraObject_1`, `CameraObject_2`, `FindCameraObject`, `CameraObjectSetFollowedObjectId`, `CreateCopySpriteAt`, `GetObjectPaletteTag`, `GetAcroUnusedActionDirectionAnimNum`, `GetMapCoordsFromSpritePos`, `SetSpritePosToMapCoords`, `GetObjectEventMovingCameraOffset`, `GetPlayerDirectionForCopy`, `GetVirtualObjectSpriteId`
- `party_menu.c` (7): `ExitPartyMenu`, `Task_ExitPartyMenu`, `SpriteCB_HeldItem`, `CursorCB_Register`, `HasPartySlotAlreadyBeenSelected`, `ChooseMonForTradingBoard`, `BufferBattlePartyOrderBySide`
- `battle_main.c` (8): `BufferPartyVsScreenHealth_AtStart`, `SetPlayerBerryDataInBattleStruct`, `SpriteCB_VsLetterDummy`, `SpriteCB_VsLetter`, `SpriteCB_VsLetterInit`, `BufferPartyVsScreenHealth_AtEnd`, `TryCorrectShedinjaLanguage`, `SpriteCB_Flicker`
- `overworld.c` (10): `InitOverworldBgs`, `VBlankCB_Field`, `DoMapLoadLoop`, `MoveSaveBlocks_ResetHeap_`, `ResetScreenForMapLoad`, `ClearAllPlayerKeys`, `UpdateHeldKeyCode`, `ResetPlayerHeldKeys`, `ZeroObjectEvent`, `SetPlayerFacingDirection`

## Revisadas contra el TS (2026-10-12)

Confirmadas sin trabajo pendiente (comprobado en el C y en el TS):

- `TryCorrectShedinjaLanguage`: solo la llaman las rutas de batalla de enlace (`battle_main.c` 1046–1051, 1403+).
- `GetObjectTrainerTypeBy*`, `GetObjectEventBerryTreeId*`, `IsBerryTreeSparkling`, `SetBerryTreeJustPicked`,
  `BattleIntroSwitchInPlayerMons`: definidas en el C sin ningún caller.
- Objeto cámara (`AddCameraObject`, `CameraObject*`, `CameraObjectReset1/2`, `CameraObjectSetFollowedObjectId`):
  equivalencia deliberada. `field/overworld.ts` sigue al jugador directamente y `SpawnCameraObject` /
  `RemoveCameraObject` están en `script/specials.ts`; los comentarios `CameraObjectReset*` lo documentan.
- `FieldEffectFree*Resources/IfUnused`: el `Sprite` del port no usa un pool de tiles/paletas de VRAM
  (`field/fieldEffects.ts`, `FieldEffectStop`).

- `ExitPartyMenu`/`Task_ExitPartyMenu`: solo se llaman si falla `Alloc` en `AllocPartyMenuBg` (sin equivalente en TS).
- `BattleTransition_Start`/`InitTransitionData`/`VBlankCB_BattleTransition`: la transición vive en
  `battle/transition.ts` (`BattleTransition_StartOnField`, escena de canvas) con otra estructura.

Sin revisar todavía: intérprete `FieldEffectCmd_*`/`FieldEffectScript_*`, `overworld.c` (bgs/VBlank/carga de mapa),
`party_menu.c` (`BufferBattlePartyOrderBySide`: comprobar el cuerpo dentro de `BufferBattlePartyCurrentOrderBySide`),
`quest_log.c`.
