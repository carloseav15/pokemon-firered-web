# Faltantes del port (generado)

Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.
Las listas de "pruebas" y "huecos conocidos" salen del script.

## Avance

- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **6082/9834 (61.8 %)**.
- Archivos C con funciones aún sin homólogo: **97**; quedan **3752 nombres**.
- Estos archivos contienen 169.659 líneas C en total; la estimación de líneas sin cubrir se muestra por archivo abajo.
- Estimación ponderada del C sin homólogo: **~78.013 líneas** (aproximación por proporción de funciones).
- Es un indicador de nombres, no de fidelidad: las funciones stub no cuentan (sección 3b) y **no incluye la fase de pruebas en navegador** (sección 5).

## 1. Archivos con huecos de implementación, de menos a más C sin cubrir

Orden sugerido por la estimación de líneas C aún no cubiertas; no mide fidelidad ni dificultad real.

| # | Archivo C | Estado | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---:|---|---|---:|---:|---:|---|
| 1 | `party_menu_specials.c` | casi completo | 108 | 8/9 | ~12 |  |
| 2 | `gpu_regs.c` | casi completo | 158 | 10/11 | ~14 |  |
| 3 | `mail_data.c` | casi completo | 187 | 11/12 | ~15 |  |
| 4 | `money.c` | casi completo | 136 | 11/13 | ~20 |  |
| 5 | `event_object_lock.c` | casi completo | 114 | 9/11 | ~20 |  |
| 6 | `clear_save_data_screen.c` | casi completo | 208 | 7/8 | ~26 |  |
| 7 | `dynamic_placeholder_text_util.c` | casi completo | 137 | 4/5 | ~27 |  |
| 8 | `menu_helpers.c` | casi completo | 243 | 15/17 | ~28 |  |
| 9 | `task.c` | casi completo | 211 | 12/14 | ~30 |  |
| 10 | `battle_anim_mons.c` | casi completo | 2360 | 126/128 | ~36 |  |
| 11 | `item_pc.c` | casi completo | 1145 | 57/59 | ~38 |  |
| 12 | `mon_markings.c` | casi completo | 605 | 14/15 | ~40 |  |
| 13 | `item.c` | casi completo | 680 | 46/49 | ~41 |  |
| 14 | `window.c` | casi completo | 513 | 19/21 | ~48 |  |
| 15 | `battle_intro.c` | casi completo | 492 | 9/10 | ~49 |  |
| 16 | `pokemon_icon.c` | casi completo | 1283 | 22/23 | ~55 |  |
| 17 | `new_menu_helpers.c` | casi completo | 761 | 50/54 | ~56 |  |
| 18 | `field_tasks.c` | casi completo | 351 | 10/12 | ~58 |  |
| 19 | `menu_indicators.c` | casi completo | 656 | 18/20 | ~65 |  |
| 20 | `fldeff_flash.c` | casi completo | 479 | 19/22 | ~65 |  |
| 21 | `menu2.c` | casi completo | 671 | 9/10 | ~67 |  |
| 22 | `script.c` | casi completo | 583 | 48/55 | ~74 |  |
| 23 | `item_menu_icons.c` | casi completo | 439 | 14/17 | ~77 |  |
| 24 | `main.c` | casi completo | 494 | 23/28 | ~88 |  |
| 25 | `shop.c` | casi completo | 1145 | 55/60 | ~95 |  |
| 26 | `trainer_see.c` | casi completo | 750 | 32/37 | ~101 |  |
| 27 | `battle_script_commands.c` | casi completo | 9886 | 281/284 | ~104 |  |
| 28 | `pokeball.c` | casi completo | 1334 | 34/37 | ~108 |  |
| 29 | `sound.c` | casi completo | 649 | 40/48 | ~108 |  |
| 30 | `evolution_graphics.c` | casi completo | 637 | 30/37 | ~120 |  |
| 31 | `battle_controllers.c` | casi completo | 1214 | 61/68 | ~124 |  |
| 32 | `battle_bg.c` | casi completo | 1111 | 15/17 | ~130 |  |
| 33 | `tm_case.c` | casi completo | 1737 | 67/73 | ~142 |  |
| 34 | `field_weather_effects.c` | casi completo | 2346 | 87/93 | ~151 |  |
| 35 | `metatile_behavior.c` | casi completo | 1039 | 97/115 | ~162 |  |
| 36 | `palette.c` | casi completo | 994 | 34/41 | ~169 |  |
| 37 | `bg.c` | casi completo | 1215 | 43/50 | ~170 |  |
| 38 | `battle_util.c` | casi completo | 3252 | 35/37 | ~175 |  |
| 39 | `battle_gfx_sfx_util.c` | casi completo | 1061 | 40/48 | ~176 |  |
| 40 | `battle_controller_player.c` | casi completo | 2966 | 114/123 | ~217 |  |
| 41 | `berry_pouch.c` | casi completo | 1529 | 66/77 | ~218 |  |
| 42 | `battle_interface.c` | casi completo | 2240 | 46/52 | ~258 |  |
| 43 | `sprite.c` | casi completo | 1745 | 86/103 | ~288 |  |
| 44 | `region_map.c` | casi completo | 4036 | 129/140 | ~317 |  |
| 45 | `item_menu.c` | casi completo | 2397 | 99/116 | ~351 |  |
| 46 | `item_use.c` | parcial | 925 | 41/73 | ~405 |  |
| 47 | `trainer_card.c` | parcial | 1959 | 55/73 | ~483 |  |
| 48 | `battle_setup.c` | parcial | 1070 | 36/66 | ~486 |  |
| 49 | `field_door.c` | parcial | 524 | 1/21 | ~499 |  |
| 50 | `battle_controller_safari.c` | parcial | 669 | 14/72 | ~538 |  |
| 51 | `itemfinder.c` | parcial | 658 | 2/24 | ~603 |  |
| 52 | `wild_encounter.c` | parcial | 784 | 8/36 | ~609 |  |
| 53 | `easy_chat.c` | parcial | 730 | 6/39 | ~617 |  |
| 54 | `string_util.c` | parcial | 726 | 6/40 | ~617 |  |
| 55 | `battle_controller_opponent.c` | parcial | 1777 | 56/87 | ~633 |  |
| 56 | `mail.c` | parcial | 734 | 1/10 | ~660 |  |
| 57 | `evolution_scene.c` | parcial | 1704 | 14/23 | ~666 |  |
| 58 | `field_fadetransition.c` | parcial | 965 | 18/59 | ~670 |  |
| 59 | `field_control_avatar.c` | parcial | 1182 | 21/49 | ~675 |  |
| 60 | `teachy_tv.c` | adaptador | 1400 | 28/58 | ~724 | menus/keyItemScreens.ts: lista de texto; teachyTv.ts no está conectado |
| 61 | `battle_controller_oak_old_man.c` | parcial | 2293 | 73/107 | ~728 |  |
| 62 | `start_menu.c` | parcial | 1016 | 18/65 | ~734 |  |
| 63 | `field_specials.c` | parcial | 2555 | 84/118 | ~736 |  |
| 64 | `title_screen.c` | parcial | 1315 | 17/39 | ~741 |  |
| 65 | `fieldmap.c` | parcial | 951 | 11/54 | ~757 |  |
| 66 | `vs_seeker.c` | parcial | 1326 | 16/41 | ~808 |  |
| 67 | `battle_tower.c` | parcial | 1425 | 17/45 | ~886 |  |
| 68 | `berry.c` | parcial | 1028 | 1/9 | ~913 |  |
| 69 | `battle_main.c` | parcial | 4477 | 84/106 | ~929 |  |
| 70 | `trade_scene.c` | parcial | 2916 | 36/53 | ~935 |  |
| 71 | `script_menu.c` | parcial | 1341 | 8/29 | ~971 |  |
| 72 | `pokemon_summary_screen.c` | casi completo | 5224 | 111/137 | ~991 |  |
| 73 | `trainer_tower.c` | parcial | 1095 | 1/43 | ~1069 |  |
| 74 | `field_effect_helpers.c` | parcial | 1421 | 17/76 | ~1103 |  |
| 75 | `daycare.c` | parcial | 2155 | 42/93 | ~1181 |  |
| 76 | `text.c` | parcial | 1695 | 10/37 | ~1236 |  |
| 77 | `party_menu.c` | parcial | 6342 | 284/357 | ~1296 |  |
| 78 | `fame_checker.c` | parcial | 1739 | 15/64 | ~1331 |  |
| 79 | `easy_chat_2.c` | parcial | 1363 | 1/73 | ~1344 |  |
| 80 | `pokemon_storage_system_misc.c` | parcial | 1430 | 2/70 | ~1389 |  |
| 81 | `battle_ai_script_commands.c` | parcial | 1970 | 25/105 | ~1500 |  |
| 82 | `pokemon_storage_system_graphics.c` | parcial | 1546 | 1/65 | ~1522 |  |
| 83 | `m4a.c` | parcial | 1781 | 5/72 | ~1657 |  |
| 84 | `naming_screen.c` | parcial | 2509 | 35/109 | ~1703 |  |
| 85 | `field_player_avatar.c` | parcial | 2168 | 34/176 | ~1749 |  |
| 86 | `battle_controller_pokedude.c` | parcial | 2698 | 31/108 | ~1923 |  |
| 87 | `pokemon_storage_system_data.c` | parcial | 2165 | 5/83 | ~2034 |  |
| 88 | `intro.c` | parcial | 2805 | 17/79 | ~2201 |  |
| 89 | `scrcmd.c` | parcial | 2264 | 5/224 | ~2213 |  |
| 90 | `easy_chat_3.c` | parcial | 2316 | 1/92 | ~2290 |  |
| 91 | `battle_transition.c` | parcial | 3037 | 26/134 | ~2447 |  |
| 92 | `overworld.c` | parcial | 3563 | 73/242 | ~2488 |  |
| 93 | `pokemon_storage_system_tasks.c` | parcial | 2770 | 5/82 | ~2601 |  |
| 94 | `pokemon.c` | parcial | 6453 | 77/140 | ~2903 |  |
| 95 | `trade.c` | parcial | 2958 | 0/66 | ~2958 |  |
| 96 | `field_effect.c` | parcial | 4033 | 42/239 | ~3324 |  |
| 97 | `event_object_movement.c` | parcial | 9412 | 49/759 | ~8804 |  |

Total: 97 archivos con huecos: 0 sin empezar, 1 adaptador, 46 casi completos y 50 parciales.

## 3b. Funciones stub (nombre del C con cuerpo vacío o `return 0;`)

No cuentan como portadas. Hay que escribir su cuerpo desde el C o borrarlas.

| Archivo C | Líneas | Portadas | Stubs |
|---|---:|---:|---:|
| `field_effect_helpers.c` | 1421 | 17/76 | 59 |
| `teachy_tv.c` | 1400 | 28/58 | 30 |
| `trade.c` | 2958 | 0/66 | 15 |
| `fame_checker.c` | 1739 | 15/64 | 7 |
| `field_weather_effects.c` | 2346 | 87/93 | 6 |
| `trade_scene.c` | 2916 | 36/53 | 3 |
| `bg.c` | 1215 | 43/50 | 1 |
| `shop.c` | 1145 | 55/60 | 1 |
| `sound.c` | 649 | 40/48 | 1 |
| `menu_helpers.c` | 243 | 15/17 | 1 |
| `quest_log_events.c` | 2247 | 2/118 | 1 |

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
- Almacenamiento de cajas con listas en vez de la interfaz real (`pokemon_storage_system_tasks.c`, `_graphics.c`, `_misc.c`, `_data.c`).
- Teachy TV: sigue siendo el adaptador de texto de `menus/keyItemScreens.ts`; `teachyTv.ts` tiene 30 stubs y no está conectado.
- Fame Checker: `fameChecker.ts` está conectado pero sus funciones de gráficos (ventanas, flechas, info box) son stubs.
- Transiciones de combate: 12 efectos de las tablas salvaje/entrenador dibujados sobre una instantánea del canvas; faltan las mugshots (Alto Mando/Campeón) y el resto de `battle_transition.c`.
- Visión de entrenadores: `trainer_see.c` porta la vista direccional, el chequeo de ruta, la compuerta QL_IsTrainerSightDisabled, los cinco iconos/emote y el callback SpriteCB_TrainerIcons. La ruta buried conecta detección, AshPuff, salto y continuación de acercamiento; sigue sin prueba de runtime. El playback de Quest Log no está modelado por completo en Game (los campos se leen si el runtime los proporciona); la revelación de disfraces y otros callbacks en ceniza siguen pendientes.
- Pantalla de nombres: 35/109 funciones (`naming_screen.c`); reglas de entrada y buffer con nombres C, cuatro iconos de destino, transición de página y destellos de botones/cursor; quedan otras funciones de la pantalla.
- Efectos de campo: `field_effect_helpers.c` son stubs (ver tabla de stubs); `field_effect.c` parcial.
- Clima: `field/weather.ts` porta tablas, aplicación/mezcla gamma, hooks BG/OBJ, dispatcher, fundidos, oscurecimiento de paletas de quest log y la máquina de gamma de sequía; en FRLG `LoadDroughtWeatherPalette` es no-op y `Drought_Main` se atasca en el paso 2. La conexión a Canvas2D sigue pendiente.
- `scrcmd.c` y `event_object_movement.c`: el intérprete de scripts y el movimiento de objetos usan la capa de campo antigua (nombres propios).
- Créditos: las escenas de mapa no ejecutan NPCs, clima ni animación de tilesets.
- Audio fino (`m4a*.c`): reverb, ADSR exacto, duty/sweep, keysplit, paneo.
- Quest Log, sistema de ayuda y todo el hardware de enlace están fuera de alcance por decisión.
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

## 6. Fase final (después de portar)

1. Probar en navegador cada pantalla de la sección 5 y las portadas antes (`window.frDebug`, `?fr=new`/`?fr=continue`).
2. Recorrido zona por zona de Kanto y Sevii contra el C/emulador (eventos, specials con valores fijos, entrenadores, capturas, Safari).
3. Guardados de regresión por zona y checks headless por sistema en `tools/checks/`.
4. Decisión de diseño postgame (tickets de Mew/Deoxys).
