# Faltantes del port (generado)

Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.
Las listas de "pruebas" y "huecos conocidos" salen del script.

## Avance

- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **6301/11826 (53.3 %)**.
- Archivos C con funciones aún sin homólogo: **97**; quedan **5525 nombres**.
- Estos archivos contienen 179.109 líneas C en total; la estimación de líneas sin cubrir se muestra por archivo abajo.
- Estimación ponderada del C sin homólogo: **~127.874 líneas** (aproximación por proporción de funciones).
- Es un indicador de nombres, no de fidelidad: las funciones stub no cuentan (sección 3b) y **no incluye la fase de pruebas en navegador** (sección 5).

## 1. Archivos con huecos de implementación, de menos a más C sin cubrir

Orden sugerido por la estimación de líneas C aún no cubiertas; no mide fidelidad ni dificultad real.

| # | Archivo C | Estado | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---:|---|---|---:|---:|---:|---|
| 1 | `sprite.c` | casi completo | 1745 | 100/103 | ~50 |  |
| 2 | `main.c` | casi completo | 494 | 23/28 | ~88 |  |
| 3 | `librfu_sio32id.c` | sin empezar | 170 | 0/4 | ~170 |  |
| 4 | `battle_bg.c` | casi completo | 1111 | 14/17 | ~196 |  |
| 5 | `quest_log_player.c` | sin empezar | 197 | 0/15 | ~197 |  |
| 6 | `berry_fix_program.c` | sin empezar | 203 | 0/4 | ~203 |  |
| 7 | `mystery_gift_link.c` | sin empezar | 215 | 0/10 | ~215 |  |
| 8 | `union_room_battle.c` | sin empezar | 238 | 0/5 | ~238 |  |
| 9 | `battle_interface.c` | casi completo | 2240 | 46/52 | ~258 |  |
| 10 | `dodrio_berry_picking_comm.c` | sin empezar | 274 | 0/8 | ~274 |  |
| 11 | `battle_controller_player.c` | casi completo | 2966 | 111/123 | ~289 |  |
| 12 | `mystery_gift_client.c` | sin empezar | 300 | 0/18 | ~300 |  |
| 13 | `mystery_gift_server.c` | sin empezar | 302 | 0/14 | ~302 |  |
| 14 | `mystery_event_script.c` | parcial | 322 | 0/25 | ~322 |  |
| 15 | `minigame_countdown.c` | sin empezar | 332 | 0/10 | ~332 |  |
| 16 | `region_map.c` | casi completo | 4036 | 128/140 | ~345 |  |
| 17 | `union_room_chat_objects.c` | sin empezar | 346 | 0/13 | ~346 |  |
| 18 | `mystery_gift_show_news.c` | sin empezar | 404 | 0/10 | ~404 |  |
| 19 | `ereader_helpers.c` | sin empezar | 406 | 0/17 | ~406 |  |
| 20 | `multiboot.c` | sin empezar | 416 | 0/9 | ~416 |  |
| 21 | `librfu_intr.c` | sin empezar | 417 | 0/9 | ~417 |  |
| 22 | `item_use.c` | parcial | 925 | 38/73 | ~443 |  |
| 23 | `digit_obj_util.c` | sin empezar | 451 | 0/14 | ~451 |  |
| 24 | `berry.c` | parcial | 1028 | 5/9 | ~456 |  |
| 25 | `item_menu.c` | casi completo | 2397 | 93/116 | ~475 |  |
| 26 | `wireless_communication_status_screen.c` | parcial | 522 | 1/12 | ~478 |  |
| 27 | `trainer_card.c` | parcial | 1959 | 55/73 | ~483 |  |
| 28 | `battle_records.c` | parcial | 568 | 4/31 | ~494 |  |
| 29 | `mystery_gift.c` | parcial | 634 | 9/45 | ~507 |  |
| 30 | `mystery_gift_show_card.c` | sin empezar | 518 | 0/8 | ~518 |  |
| 31 | `ereader_screen.c` | sin empezar | 520 | 0/11 | ~520 |  |
| 32 | `battle_controller_safari.c` | parcial | 669 | 14/72 | ~538 |  |
| 33 | `battle_setup.c` | parcial | 1070 | 28/66 | ~616 |  |
| 34 | `union_room_player_avatar.c` | sin empezar | 624 | 0/38 | ~624 |  |
| 35 | `battle_controller_opponent.c` | parcial | 1777 | 56/87 | ~633 |  |
| 36 | `librfu_stwi.c` | sin empezar | 650 | 0/48 | ~650 |  |
| 37 | `mail.c` | parcial | 734 | 1/10 | ~660 |  |
| 38 | `evolution_scene.c` | parcial | 1704 | 14/23 | ~666 |  |
| 39 | `field_fadetransition.c` | parcial | 965 | 16/59 | ~703 |  |
| 40 | `easy_chat.c` | parcial | 730 | 1/39 | ~711 |  |
| 41 | `teachy_tv.c` | adaptador | 1400 | 28/58 | ~724 | menus/keyItemScreens.ts: lista de texto; teachyTv.ts no está conectado |
| 42 | `battle_controller_oak_old_man.c` | parcial | 2293 | 73/107 | ~728 |  |
| 43 | `field_control_avatar.c` | parcial | 1182 | 17/49 | ~771 |  |
| 44 | `help_system_util.c` | parcial | 848 | 1/41 | ~827 |  |
| 45 | `fieldmap.c` | parcial | 951 | 5/54 | ~862 |  |
| 46 | `cable_club.c` | parcial | 1036 | 9/54 | ~863 |  |
| 47 | `battle_main.c` | parcial | 4477 | 84/106 | ~929 |  |
| 48 | `vs_seeker.c` | parcial | 1326 | 12/41 | ~937 |  |
| 49 | `start_menu.c` | parcial | 1016 | 3/65 | ~969 |  |
| 50 | `trade_scene.c` | parcial | 2916 | 35/53 | ~990 |  |
| 51 | `pokemon_summary_screen.c` | casi completo | 5224 | 111/137 | ~991 |  |
| 52 | `field_specials.c` | parcial | 2555 | 72/118 | ~996 |  |
| 53 | `trainer_tower.c` | parcial | 1095 | 1/43 | ~1069 |  |
| 54 | `script_menu.c` | parcial | 1341 | 5/29 | ~1109 |  |
| 55 | `field_effect_helpers.c` | parcial | 1421 | 16/76 | ~1121 |  |
| 56 | `link_rfu_3.c` | sin empezar | 1192 | 0/30 | ~1192 |  |
| 57 | `battle_tower.c` | parcial | 1425 | 7/45 | ~1203 |  |
| 58 | `title_screen.c` | parcial | 1315 | 2/39 | ~1247 |  |
| 59 | `battle_controller_link_opponent.c` | parcial | 1713 | 22/86 | ~1274 |  |
| 60 | `fame_checker.c` | parcial | 1739 | 16/64 | ~1304 |  |
| 61 | `battle_controller_link_partner.c` | parcial | 1647 | 17/85 | ~1317 |  |
| 62 | `union_room_chat_display.c` | sin empezar | 1339 | 0/58 | ~1339 |  |
| 63 | `easy_chat_2.c` | parcial | 1363 | 1/73 | ~1344 |  |
| 64 | `party_menu.c` | parcial | 6342 | 281/357 | ~1350 |  |
| 65 | `text.c` | parcial | 1695 | 7/37 | ~1374 |  |
| 66 | `pokemon_storage_system_misc.c` | sin empezar | 1430 | 0/70 | ~1430 |  |
| 67 | `AgbRfu_LinkManager.c` | sin empezar | 1480 | 0/33 | ~1480 |  |
| 68 | `battle_ai_script_commands.c` | parcial | 1970 | 25/105 | ~1500 |  |
| 69 | `daycare.c` | parcial | 2155 | 28/93 | ~1506 |  |
| 70 | `pokemon_storage_system_graphics.c` | parcial | 1546 | 1/65 | ~1522 |  |
| 71 | `union_room_chat.c` | sin empezar | 1571 | 0/51 | ~1571 |  |
| 72 | `mystery_gift_menu.c` | sin empezar | 1609 | 0/34 | ~1609 |  |
| 73 | `naming_screen.c` | parcial | 2509 | 38/109 | ~1634 |  |
| 74 | `quest_log.c` | parcial | 1767 | 5/88 | ~1666 |  |
| 75 | `m4a.c` | parcial | 1781 | 1/72 | ~1756 |  |
| 76 | `field_player_avatar.c` | parcial | 2168 | 21/176 | ~1909 |  |
| 77 | `battle_controller_pokedude.c` | parcial | 2698 | 31/108 | ~1923 |  |
| 78 | `pokemon_storage_system_data.c` | parcial | 2165 | 3/83 | ~2086 |  |
| 79 | `quest_log_events.c` | parcial | 2247 | 7/118 | ~2113 |  |
| 80 | `link.c` | parcial | 2202 | 4/114 | ~2124 |  |
| 81 | `scrcmd.c` | parcial | 2264 | 1/224 | ~2253 |  |
| 82 | `easy_chat_3.c` | parcial | 2316 | 1/92 | ~2290 |  |
| 83 | `librfu_rfu.c` | sin empezar | 2342 | 0/86 | ~2342 |  |
| 84 | `help_system.c` | sin empezar | 2480 | 0/41 | ~2480 |  |
| 85 | `pokemon_storage_system_tasks.c` | parcial | 2770 | 2/82 | ~2702 |  |
| 86 | `intro.c` | parcial | 2805 | 2/79 | ~2733 |  |
| 87 | `overworld.c` | parcial | 3563 | 46/242 | ~2885 |  |
| 88 | `trade.c` | parcial | 2958 | 0/66 | ~2958 |  |
| 89 | `battle_transition.c` | parcial | 3037 | 1/134 | ~3014 |  |
| 90 | `link_rfu_2.c` | sin empezar | 3163 | 0/149 | ~3163 |  |
| 91 | `pokemon.c` | parcial | 6453 | 71/140 | ~3180 |  |
| 92 | `berry_crush.c` | parcial | 3488 | 4/73 | ~3296 |  |
| 93 | `field_effect.c` | parcial | 4033 | 13/239 | ~3813 |  |
| 94 | `pokemon_jump.c` | parcial | 4582 | 5/186 | ~4458 |  |
| 95 | `union_room.c` | parcial | 4761 | 6/110 | ~4501 |  |
| 96 | `dodrio_berry_picking.c` | parcial | 4954 | 7/147 | ~4718 |  |
| 97 | `event_object_movement.c` | parcial | 9412 | 111/759 | ~8035 |  |

Total: 97 archivos con huecos: 28 sin empezar, 1 adaptador, 8 casi completos y 60 parciales.

## 3b. Funciones stub (nombre del C con cuerpo vacío o `return 0;`)

No cuentan como portadas. Hay que escribir su cuerpo desde el C o borrarlas.

| Archivo C | Líneas | Portadas | Stubs |
|---|---:|---:|---:|
| `field_effect_helpers.c` | 1421 | 16/76 | 56 |
| `teachy_tv.c` | 1400 | 28/58 | 30 |
| `trade.c` | 2958 | 0/66 | 15 |
| `fame_checker.c` | 1739 | 16/64 | 7 |
| `help_system.c` | 2480 | 0/41 | 6 |
| `trade_scene.c` | 2916 | 35/53 | 3 |
| `cable_club.c` | 1036 | 9/54 | 2 |
| `union_room.c` | 4761 | 6/110 | 1 |
| `link.c` | 2202 | 4/114 | 1 |

## 3c. Portado pero sin conectar al juego

| Archivo C | TS | Motivo |
|---|---|---|
| `teachy_tv.c` | `teachyTv.ts` | el juego abre la lista de texto de `menus/keyItemScreens.ts` |
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
- Almacenamiento de cajas con listas en vez de la interfaz real (`pokemon_storage_system_tasks.c`, `_graphics.c`, `_misc.c`, `_data.c`).
- Teachy TV: sigue siendo el adaptador de texto de `menus/keyItemScreens.ts`; `teachyTv.ts` tiene 30 stubs y no está conectado.
- Fame Checker: `fameChecker.ts` está conectado pero sus funciones de gráficos (ventanas, flechas, info box) son stubs.
- Transiciones de combate: 12 efectos de las tablas salvaje/entrenador dibujados sobre una instantánea del canvas; faltan las mugshots (Alto Mando/Campeón) y el resto de `battle_transition.c`.
- Visión de entrenadores: `trainer_see.c` porta la vista direccional, el chequeo de ruta, la compuerta QL_IsTrainerSightDisabled, los cinco iconos/emote, SpriteCB_TrainerIcons y la revelación enterrada con AshPuff, salto y continuación de acercamiento; falta prueba de runtime. El playback de Quest Log no está modelado por completo en Game (los campos se leen si el runtime los proporciona). Dos handlers de disfraz no se usan en FRLG y TrainerSeeFunc_Dummy es vacío en C.
- Save cifrado: `ApplyNewEncryptionKeyToBagItems` y su alias recorren cantidades almacenadas con XOR por la clave del SaveBlock. El save web guarda las cantidades descifradas en JSON y no modela ese layout físico GBA.
- Scripts RAM: `GetSavedRamScriptIfValid` aún depende de `ValidateSavedWonderCard`, cuya tarjeta Wonder no está implementada; el slot RAM y su checksum sí existen en `script/context.ts`.
- Pantalla de nombres: 34/109 funciones (`naming_screen.c`); reglas de entrada y buffer con nombres C, cuatro iconos de destino, transición de página y destellos de botones/cursor; quedan otras funciones de la pantalla.
- Efectos de campo: `field_effect_helpers.c` son stubs (ver tabla de stubs); `field_effect.c` parcial.
- Clima: `field/weather.ts` porta tablas, aplicación/mezcla gamma, hooks BG/OBJ, dispatcher, fundidos, oscurecimiento de paletas de quest log y la máquina de gamma de sequía; en FRLG `LoadDroughtWeatherPalette` es no-op y `Drought_Main` se atasca en el paso 2. La conexión a Canvas2D sigue pendiente.
- `scrcmd.c` y `event_object_movement.c`: el intérprete de scripts y el movimiento de objetos usan la capa de campo antigua (nombres propios).
- Créditos: las escenas de mapa no ejecutan NPCs, clima ni animación de tilesets.
- Audio fino (`m4a*.c`): reverb, ADSR exacto, duty/sweep, keysplit, paneo.
- Quest Log: el inventario incluye quest_log*.c; los eventos de tienda ya persisten en SaveData, pero faltan el buffer/serialización original, escenas, acciones y reproducción.
- Trainer Tower: `trainer_tower.c` y sus llamadas `InitTrainerTowerBattleStruct`/`FreeTrainerTowerBattleStruct` aún no están portadas; `battle_util2.c` tiene recursos normales cubiertos, pero ese branch queda pendiente.
- Uso de objetos (`item_use.c`): dispatch de baya Enigma de campo/combate, rechazo de Oak, consumo diferido de Repel hasta acabar SE, retardo de ocho frames de las flautas y espera de fanfarria de la Poké Flauta están conectados. Quest Log al usar objetos y el retardo/mensaje/botones de `BattleUseFunc_StatBooster` siguen adaptados; quedan 32/73 funciones sin homólogo.

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
- script.c (estado de entrada Quest Log) → `script/context.ts`

## 6. Fase final (después de portar)

1. Probar en navegador cada pantalla de la sección 5 y las portadas antes (`window.frDebug`, `?fr=new`/`?fr=continue`).
2. Recorrido zona por zona de Kanto y Sevii contra el C/emulador (eventos, specials con valores fijos, entrenadores, capturas, Safari).
3. Guardados de regresión por zona y checks headless por sistema en `tools/checks/`.
4. Decisión de diseño postgame (tickets de Mew/Deoxys).
