# Faltantes del port (generado)

Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.
Las listas de "pruebas" y "huecos conocidos" salen del script.

## Avance

- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **6897/10115 (68.2 %)**.
- Archivos C con funciones aún sin homólogo: **61**; quedan **3218 nombres**.
- Fuera de la meta principal, enlace e inalámbrico: 101/1711 en 42 archivos (sección aparte en PORT-INVENTORY.md).
- Estos archivos contienen 131.457 líneas C en total; la estimación de líneas sin cubrir se muestra por archivo abajo.
- Estimación ponderada del C sin homólogo: **~72.790 líneas** (aproximación por proporción de funciones).
- Es un indicador de nombres, no de fidelidad: las funciones stub no cuentan (sección 3b) y **no incluye la fase de pruebas en navegador** (sección 5).

## 1. Archivos con huecos de implementación, de menos a más C sin cubrir

Orden sugerido por la estimación de líneas C aún no cubiertas; no mide fidelidad ni dificultad real.

| # | Archivo C | Estado | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---:|---|---|---:|---:|---:|---|
| 1 | `sound.c` | casi completo | 649 | 47/48 | ~13 |  |
| 2 | `sprite.c` | casi completo | 1745 | 100/103 | ~50 |  |
| 3 | `scrcmd.c` | casi completo | 2264 | 216/224 | ~80 |  |
| 4 | `main.c` | casi completo | 494 | 23/28 | ~88 |  |
| 5 | `quest_log_player.c` | parcial | 197 | 3/15 | ~157 |  |
| 6 | `battle_bg.c` | casi completo | 1111 | 14/17 | ~196 |  |
| 7 | `battle_interface.c` | casi completo | 2240 | 46/52 | ~258 |  |
| 8 | `battle_controller_player.c` | casi completo | 2966 | 111/123 | ~289 |  |
| 9 | `region_map.c` | casi completo | 4036 | 128/140 | ~345 |  |
| 10 | `item_use.c` | parcial | 925 | 38/73 | ~443 |  |
| 11 | `berry.c` | parcial | 1028 | 5/9 | ~456 |  |
| 12 | `item_menu.c` | casi completo | 2397 | 93/116 | ~475 |  |
| 13 | `trainer_card.c` | parcial | 1959 | 55/73 | ~483 |  |
| 14 | `battle_records.c` | parcial | 568 | 4/31 | ~494 |  |
| 15 | `battle_controller_safari.c` | parcial | 669 | 14/72 | ~538 |  |
| 16 | `battle_controller_opponent.c` | parcial | 1777 | 56/87 | ~633 |  |
| 17 | `battle_setup.c` | parcial | 1070 | 26/66 | ~648 |  |
| 18 | `mail.c` | parcial | 734 | 1/10 | ~660 |  |
| 19 | `evolution_scene.c` | parcial | 1704 | 14/23 | ~666 |  |
| 20 | `field_control_avatar.c` | parcial | 1182 | 21/49 | ~675 |  |
| 21 | `field_fadetransition.c` | parcial | 965 | 16/59 | ~703 |  |
| 22 | `easy_chat.c` | parcial | 730 | 1/39 | ~711 |  |
| 23 | `teachy_tv.c` | adaptador | 1400 | 28/58 | ~724 | menus/keyItemScreens.ts: lista de texto; teachyTv.ts no está conectado |
| 24 | `battle_controller_oak_old_man.c` | parcial | 2293 | 73/107 | ~728 |  |
| 25 | `help_system_util.c` | parcial | 848 | 1/41 | ~827 |  |
| 26 | `fieldmap.c` | parcial | 951 | 5/54 | ~862 |  |
| 27 | `battle_main.c` | parcial | 4477 | 84/106 | ~929 |  |
| 28 | `field_specials.c` | parcial | 2555 | 75/118 | ~931 |  |
| 29 | `vs_seeker.c` | parcial | 1326 | 12/41 | ~937 |  |
| 30 | `start_menu.c` | parcial | 1016 | 3/65 | ~969 |  |
| 31 | `trade_scene.c` | parcial | 2916 | 35/53 | ~990 |  |
| 32 | `pokemon_summary_screen.c` | casi completo | 5224 | 111/137 | ~991 |  |
| 33 | `trainer_tower.c` | parcial | 1095 | 1/43 | ~1069 |  |
| 34 | `script_menu.c` | parcial | 1341 | 5/29 | ~1109 |  |
| 35 | `field_effect_helpers.c` | parcial | 1421 | 16/76 | ~1121 |  |
| 36 | `battle_tower.c` | parcial | 1425 | 7/45 | ~1203 |  |
| 37 | `title_screen.c` | parcial | 1315 | 2/39 | ~1247 |  |
| 38 | `fame_checker.c` | parcial | 1739 | 16/64 | ~1304 |  |
| 39 | `easy_chat_2.c` | parcial | 1363 | 1/73 | ~1344 |  |
| 40 | `party_menu.c` | parcial | 6342 | 281/357 | ~1350 |  |
| 41 | `text.c` | parcial | 1695 | 7/37 | ~1374 |  |
| 42 | `field_player_avatar.c` | parcial | 2168 | 62/176 | ~1404 |  |
| 43 | `pokemon_storage_system_misc.c` | sin empezar | 1430 | 0/70 | ~1430 |  |
| 44 | `battle_ai_script_commands.c` | parcial | 1970 | 25/105 | ~1500 |  |
| 45 | `daycare.c` | parcial | 2155 | 28/93 | ~1506 |  |
| 46 | `pokemon_storage_system_graphics.c` | parcial | 1546 | 1/65 | ~1522 |  |
| 47 | `quest_log.c` | parcial | 1767 | 11/88 | ~1546 |  |
| 48 | `naming_screen.c` | parcial | 2509 | 38/109 | ~1634 |  |
| 49 | `m4a.c` | parcial | 1781 | 1/72 | ~1756 |  |
| 50 | `help_system.c` | parcial | 2480 | 10/41 | ~1875 |  |
| 51 | `battle_controller_pokedude.c` | parcial | 2698 | 31/108 | ~1923 |  |
| 52 | `quest_log_events.c` | parcial | 2247 | 15/118 | ~1961 |  |
| 53 | `pokemon_storage_system_data.c` | parcial | 2165 | 3/83 | ~2086 |  |
| 54 | `easy_chat_3.c` | parcial | 2316 | 1/92 | ~2290 |  |
| 55 | `pokemon_storage_system_tasks.c` | parcial | 2770 | 2/82 | ~2702 |  |
| 56 | `intro.c` | parcial | 2805 | 2/79 | ~2733 |  |
| 57 | `event_object_movement.c` | parcial | 9412 | 525/759 | ~2901 |  |
| 58 | `overworld.c` | parcial | 3563 | 42/242 | ~2944 |  |
| 59 | `battle_transition.c` | parcial | 3037 | 1/134 | ~3014 |  |
| 60 | `pokemon.c` | parcial | 6453 | 71/140 | ~3180 |  |
| 61 | `field_effect.c` | parcial | 4033 | 13/239 | ~3813 |  |

Total: 61 archivos con huecos: 1 sin empezar, 1 adaptador, 10 casi completos y 49 parciales.

## 3b. Funciones stub (nombre del C con cuerpo vacío o `return 0;`)

No cuentan como portadas. Hay que escribir su cuerpo desde el C o borrarlas.

| Archivo C | Líneas | Portadas | Stubs |
|---|---:|---:|---:|
| `field_effect_helpers.c` | 1421 | 16/76 | 56 |
| `teachy_tv.c` | 1400 | 28/58 | 30 |
| `trade.c` | 2958 | 0/66 | 15 |
| `fame_checker.c` | 1739 | 16/64 | 7 |
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
