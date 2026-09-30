# Faltantes del port (generado)

Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.
Las listas de "pruebas" y "huecos conocidos" salen del script.

## Avance

- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **9443/10115 (93.4 %)**.
- Archivos C con funciones aún sin homólogo: **23**; quedan **672 nombres**.
- Fuera de la meta principal, enlace e inalámbrico: 102/1711 en 42 archivos (sección aparte en PORT-INVENTORY.md).
- Estos archivos contienen 69.368 líneas C en total; la estimación de líneas sin cubrir se muestra por archivo abajo.
- Estimación ponderada del C sin homólogo: **~13.326 líneas** (aproximación por proporción de funciones).
- Es un indicador de nombres, no de fidelidad: las funciones stub no cuentan (sección 3b) y **no incluye la fase de pruebas en navegador** (sección 5).

## 1. Archivos con huecos de implementación, de menos a más C sin cubrir

Orden sugerido por la estimación de líneas C aún no cubiertas; no mide fidelidad ni dificultad real.

| # | Archivo C | Estado | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---:|---|---|---:|---:|---:|---|
| 1 | `battle_controller_player.c` | casi completo | 2966 | 122/123 | ~24 |  |
| 2 | `battle_controller_pokedude.c` | casi completo | 2698 | 107/108 | ~24 |  |
| 3 | `sprite.c` | casi completo | 1745 | 101/103 | ~33 |  |
| 4 | `field_control_avatar.c` | casi completo | 1182 | 47/49 | ~48 |  |
| 5 | `intro.c` | casi completo | 2805 | 77/79 | ~71 |  |
| 6 | `pokemon_storage_system_misc.c` | casi completo | 1430 | 66/70 | ~81 |  |
| 7 | `main.c` | casi completo | 494 | 23/28 | ~88 |  |
| 8 | `start_menu.c` | casi completo | 1016 | 57/65 | ~125 |  |
| 9 | `field_fadetransition.c` | casi completo | 965 | 50/59 | ~147 |  |
| 10 | `battle_bg.c` | casi completo | 1111 | 14/17 | ~196 |  |
| 11 | `pokemon_summary_screen.c` | casi completo | 5224 | 131/137 | ~228 |  |
| 12 | `pokemon.c` | casi completo | 6453 | 135/140 | ~230 |  |
| 13 | `quest_log_events.c` | casi completo | 2247 | 97/118 | ~399 |  |
| 14 | `field_effect.c` | casi completo | 4033 | 214/239 | ~421 |  |
| 15 | `evolution_scene.c` | parcial | 1704 | 17/23 | ~444 |  |
| 16 | `quest_log.c` | parcial | 1767 | 56/88 | ~642 |  |
| 17 | `battle_main.c` | casi completo | 4477 | 86/106 | ~844 |  |
| 18 | `party_menu.c` | casi completo | 6342 | 304/357 | ~941 |  |
| 19 | `trade_scene.c` | parcial | 2916 | 35/53 | ~990 |  |
| 20 | `battle_transition.c` | parcial | 3037 | 72/134 | ~1405 |  |
| 21 | `overworld.c` | parcial | 3563 | 125/242 | ~1722 |  |
| 22 | `m4a.c` | parcial | 1781 | 1/72 | ~1756 |  |
| 23 | `event_object_movement.c` | parcial | 9412 | 560/759 | ~2467 |  |

Total: 23 archivos con huecos: 0 sin empezar, 0 adaptador, 16 casi completos y 7 parciales.

## 3b. Funciones stub (nombre del C con cuerpo vacío o `return 0;`)

No cuentan como portadas. Hay que escribir su cuerpo desde el C o borrarlas.

| Archivo C | Líneas | Portadas | Stubs |
|---|---:|---:|---:|
| `trade.c` | 2958 | 0/66 | 15 |
| `trade_scene.c` | 2916 | 35/53 | 3 |
| `cable_club.c` | 1036 | 9/54 | 2 |
| `union_room.c` | 4761 | 6/110 | 1 |
| `link.c` | 2202 | 4/114 | 1 |

## 3c. Portado pero sin conectar al juego

| Archivo C | TS | Motivo |
|---|---|---|
| `field_effect_helpers.c` | `field/fieldEffectHelpers.ts` | los efectos reales siguen en `field/fieldEffects.ts` |
| `slot_machine.c (reglas)` | `game/slots.ts` | duplicado sin uso; el juego usa `menus/slotMachine.ts` |
| `image_processing_effects.c` | `imageProcessingEffects.ts` | sin llamador en FireRed de un jugador |
| `palette_util.c` | `paletteUtil.ts` | sin llamador todavía |
| `mon_markings.c` | `monMarkings.ts` | el resumen no abre el menú de marcas todavía |
| `cable_car_util.c` | `cableCarUtil.ts` | sin llamador todavía |
| `tilemap_util.c` | `hw/tilemapUtil.ts` | sin llamador todavía |
| `(registros BG)` | `hw/bgRegs.ts` | sin llamador todavía |

## 4. Huecos conocidos que el conteo no muestra

- Easy Chat: escribir cartas (`easy_chat*.c`); hoy las cartas quedan en blanco.
- Intercambios: `pokemon/ingameTrade.ts` porta la escena de `trade_scene.c` (sin probar); de `trade.c` solo hay stubs de la parte de enlace.
- Enlace: `linkState.ts` modela estado, identidad del callback y umbrales de cola de `menu_helpers.c`, `link.c` y `overworld.c`; todavía no hay productor de comandos ni transporte cable/RFU que alimente ese estado.
- Combate de enlace: `battle_controllers.c` 68/68 con la ruta de buffers `LINK_BUFF_*` y las tareas de envío/recepción, pero `SetControllerToLinkOpponent`/`SetControllerToLinkPartner` (parciales en sus archivos) quedan sustituidos por `BattleControllerDummy` y `linkTransport` no envía paquetes; un enlace real no tendría controladores propios ni transporte.
- Almacenamiento de cajas: `pokemon_storage_system_misc.c` conserva cuatro helpers estáticos `UnkUtil_CpuAdd/Run` y `UnkUtil_DmaAdd/Run`; el C los describe como cola funcionalmente sin uso y los Add no tienen callers. La navegación del resumen usa ranuras nullable y filtra especie/huevo según el C; cajas y resumen siguen pendientes de revisión en navegador.
- Teachy TV: `teachyTv.ts` está conectado (`Game.openTeachyTv` → `StartTeachyTv`); `keyItemScreens.openTeachyTv` (lista de texto) queda sin llamadores. Pantalla sin probar en navegador.
- Fame Checker: `fameChecker.ts` está conectado y sus gráficos (ventanas, flechas, info box) tienen cuerpo; sin prueba de navegador.
- Transiciones de combate: 12 efectos de las tablas salvaje/entrenador dibujados sobre una instantánea del canvas; faltan las mugshots (Alto Mando/Campeón) y el resto de `battle_transition.c`.
- Visión de entrenadores: `trainer_see.c` porta la vista direccional, el chequeo de ruta, la compuerta QL_IsTrainerSightDisabled, los cinco iconos/emote, SpriteCB_TrainerIcons y la revelación enterrada con AshPuff, salto y continuación de acercamiento; falta prueba de runtime. El playback de Quest Log no está modelado por completo en Game (los campos se leen si el runtime los proporciona). Dos handlers de disfraz no se usan en FRLG y TrainerSeeFunc_Dummy es vacío en C.
- Save cifrado: `ApplyNewEncryptionKeyToBagItems` y su alias recorren cantidades almacenadas con XOR por la clave del SaveBlock. El save web guarda las cantidades descifradas en JSON y no modela ese layout físico GBA.
- Scripts RAM: `GetSavedRamScriptIfValid` aún depende de `ValidateSavedWonderCard`, cuya tarjeta Wonder no está implementada; el slot RAM y su checksum sí existen en `script/context.ts`.
- Pantalla de nombres: 104/109 funciones (`naming_screen.c`); estados, sprites, iconos, renderizado, teclado y callbacks conectados. Quedan cinco `Debug_NamingScreen*` estáticos sin callers en el C; pantalla e historia sin validar en navegador.
- Efectos de campo: `field_effect_helpers.c` 76/76 pero sin conectar (ver tabla 3c, los efectos reales siguen en `field/fieldEffects.ts`); `field_effect.c` parcial.
- Clima: `field/weather.ts` porta tablas, aplicación/mezcla gamma, hooks BG/OBJ, dispatcher, fundidos, oscurecimiento de paletas de quest log y la máquina de gamma de sequía; en FRLG `LoadDroughtWeatherPalette` es no-op y `Drought_Main` se atasca en el paso 2. La conexión a Canvas2D sigue pendiente.
- Créditos: las escenas de mapa no ejecutan NPCs, clima ni animación de tilesets.
- Audio fino (`m4a*.c`): reverb, ADSR exacto, duty/sweep, keysplit, paneo.
- Quest Log: el playback restaura flags/vars, rematches, party/cajas, objetos y layout; carga acciones y textos, avanza las escenas retenidas, restaura el save y ejecuta la escena final guardada del C. Falta revisar la paridad del ciclo normal/warp y validar reproducción/UI en navegador.
- Trainer Tower: `trainer_tower.c` queda en 43/43 nombres y conectado al dispatcher de scripts y al ciclo de recursos de batalla; gameplay/navegador siguen pendientes de revisión.
- Uso de objetos (`item_use.c`): dispatch Enigma, rechazo de Oak, consumo/mensaje común de Repel, Escape Rope y Poké Doll, flautas, cañas, Item Finder, TM Case, Berry Pouch, Mail, Bike y la secuencia de potenciadores de combate están conectados. El helper registra eventos en el buffer de escena; faltan 12/73 nombres y la carga/reproducción de esos eventos.
- Barrido de candidatos (2026-09-28): `item_menu.c` conserva Teachy TV Catching/Status sin ruta conectada y `Task_UnusedReturnToBag` no tiene caller; `main.c` conserva solo inicialización/interrupciones de GBA ya adaptadas o sin equivalente de navegador; `sprite.c` CopyFrom/ToSprites copia el layout crudo de Sprite y no tiene callers; `battle_setup.c` PokéDude no tiene caller; los huecos de `battle_bg.c` y `evolution_scene.c` son de enlace/intercambio.
- Bloqueo de tanda (2026-09-28): los cinco `Debug_NamingScreen*` restantes son funciones estáticas sin callers en `naming_screen.c`; los últimos huecos de `field_control_avatar.c` son interacciones de jugadores de enlace y `SetCableClubWarp` es solo Cable Club, fuera de la meta principal.
- Menú de guardado (`start_menu.c`): `SaveQuestLogData` cierra y ordena escenas. La restauración y el playback del Quest Log ya están conectados; la pantalla final y la revisión de fidelidad del flujo siguen pendientes.
- Summary Pokémon: la ruta activa preserva ranuras vacías de caja, filtra especie/huevo según la página y porta navegación de party individual, selección/cambio de movimiento, transición de páginas y callback dummy del retrato. Los seek de party multi son de enlace; quedan seis nombres por caller ausente o alcance LINK. El recorrido de caja/resumen aún no se ha validado en navegador.
- pokemon.c (2026-09-29): 135/140; los cinco huecos son de enlace (`GetLinkTrainerFlankId`, `GetBattlerMultiplayerId`, `GetUnionRoomTrainerPic`, `GetUnionRoomTrainerClass`) y `GetTrainerPartnerName`, que necesita `GetMultiplayerId` de `link.c`. Sin caller tampoco en el C: `CreateSecretBaseEnemyParty`, `DrawSpindaSpotsUnused`, `GetMonFlavorRelation`, `EncryptBoxMon`/`DecryptBoxMon`/`CalculateBoxMonChecksum`/`GetSubstruct`; `RandomlyGivePartyPokerus`/`UpdatePartyPokerusTime`/`PartySpreadPokerus` son no-op porque el cuerpo C también lo es (comentario de RS en `pokemon.c:5608`). Sin cablear en la ruta TS: `SetDeoxysStats` (sus dos callers C son de `battle_main.c` en enlace) y `SpeciesToCryId` (su caller C es `PlayCryInternal` en `sound.c:476`, mientras `audio/sound.ts` manda la especie a la tabla WAV `cries.json` sin pasar por ella).
- text.c (2026-09-29): 37/37 con `GetStringWidth`/`GetStringWidthFixedWidthFont`, las familias `FontFunc_*`, `TextPrinter*`, `GetGlyphWidth_*` y `DecompressGlyph_*`, `RenderText` y los iconos de keypad en `gba/font.ts`/`gba/textPrinter.ts`. Las ramas japonesas y el relleno de `glyphId == 0` con los colores del printer están portadas pero no se ejercitan (la ruta TS corre en latín); `FONT_BOLD` (fontId 7) no tiene `fontFunction` en el C y TS lanza si se pinta con él, sin llamadores; con un placeholder dinámico inexistente `GetStringWidth` mide en vez de leer el puntero nulo que el C desreferenciaría. Paridad headless: `DecompressGlyph_*` coincide con los PNG exportados en 6 fuentes x 512 glifos y las anchuras de `text.c` con `fonts.json`; `check:arrow` y `check:braille` pasan (ambos necesitaban `setupNodeGbaMock.ts`); sin prueba en navegador.
- battle_records.c (2026-09-29): 31/31 en `battleRecords.ts` con la pantalla HwScene, el save `SaveBlock2.linkBattleRecords` (`save.ts` con backfill) y `gTrainerCards` (`menus/trainerCard.ts`); el especial `ShowBattleRecords` sustituye al adaptador y `ClearPlayerLinkBattleRecords` corre en `NewGameInitData`. `UpdatePlayerLinkBattleRecords` solo lo llama `cable_club.c` `CB2_ReturnFromCableClubBattle`, sin portar (9/54), así que la actualización de récords no se dispara por ninguna ruta viva; el lado `ShowTrainerCardInLink` de `gTrainerCards` sigue pendiente en `trainer_card.c` (66/73). Check focalizado temporal (backfill, borrado, alta/evicción/orden/prefijo japonés, apertura de pantalla, A y salida) pasó y se borró; sin prueba en navegador.
- battle_tower.c (2026-09-29): 45/45 nombres; los datos C de `sBattleTowerTrainers` y las clases/gráficos de jugador están vacíos en FireRed. La ruta e-Reader de Seven Island usa el save, greeting, nombres, sprites, flags de batalla y resultado, pero depende de un registro externo válido que el flujo web de e-Reader no produce; circuito Tower normal y flujo e-Reader sin validar en navegador.

## 5. Portado pero sin probar en navegador

Verificado solo con `check:port`, `build`, paridad de cdata/incbin/textos o checks headless de estado:

- pokedex_screen.c + pokedex_area_markers.c + wild_pokemon_area.c + trainer_pokemon_sprites.c → `pokedexScreen.ts`
- pokemon_special_anim.c + pokemon_special_anim_scene.c (usar objeto) → `pokemonSpecialAnim.ts`
- item_pc.c + mailbox_pc.c + pc_screen_effect.c + player_pc.c (buzón) → `itemPc.ts, mailboxPc.ts, playerPcMailbox.ts, pcScreenEffect.ts`
- shop.c + buy_menu_helpers.c (+ event_object_movement.c parcial) → `shop.ts, buyMenuHelpers.ts, objectEventGraphics.ts`
- hall_of_fame.c + credits.c (+ overworld.c créditos) → `hallOfFame.ts, credits.ts, overworldCredits.ts`
- battle_transition.c (todas salvo ANGLED_WIPES) → `battle/transition.ts`
- player_pc.c (menú superior del PC del jugador) → `menus/playerPc.ts`
- learn_move.c → `menus/moveRelearner.ts`
- field_weather.c + field_weather_effects.c → `field/weather.ts, field/weatherEffects.ts`
- fame_checker.c → `fameChecker.ts`
- slot_machine.c → `menus/slotMachine.ts`
- trade_scene.c (intercambios en juego) → `pokemon/ingameTrade.ts`
- itemfinder.c → `menus/itemFinder.ts`
- help_message.c (ciclo de vida de la ventana de ayuda) → `menus/helpMessage.ts, game.ts`
- link.c + overworld.c (predicados y cola de recepción; sin transporte) → `linkState.ts, hw/menuHelpers.ts`
- item.c (compactación de PC y bolsillos) → `pokemon/items.ts, itemPc.ts, bagMenu.ts, tmCase.ts`
- trainer_see.c (revelación de entrenador enterrado) → `field/trainerSee.ts, field/objectEvents.ts`
- braille_text.c (callback de impresora Braille) → `gba/textPrinter.ts, gba/font.ts`
- text.c (impresoras, glifos latinos e iconos de keypad) → `gba/textPrinter.ts, gba/font.ts`
- script.c (estado de entrada Quest Log) → `script/context.ts`
- teachy_tv.c (los seis programas y el menú) → `teachyTv.ts`
- oak_speech.c + pokemon.c (naming, manager de sprites de combate, flauta/estimulante) → `oakSpeech.ts, battle/anim.ts, menus/fieldMenus.ts`
- battle_records.c (pantalla de Battle Records/Trainer Tower) → `battleRecords.ts`

## 6. Fase final (después de portar)

1. Probar en navegador cada pantalla de la sección 5 y las portadas antes (`window.frDebug`, `?fr=new`/`?fr=continue`).
2. Recorrido zona por zona de Kanto y Sevii contra el C/emulador (eventos, specials con valores fijos, entrenadores, capturas, Safari).
3. Guardados de regresión por zona y checks headless por sistema en `tools/checks/`.
4. Decisión de diseño postgame (tickets de Mew/Deoxys).
