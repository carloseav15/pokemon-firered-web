# Faltantes del port (generado)

Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.
Las listas de "pruebas" y "huecos conocidos" salen del script.

## Avance

- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **5769/9834 (58.7 %)**.
- Archivos C con funciones aún sin homólogo: **94**; quedan **4065 nombres**.
- Estos archivos contienen 169.060 líneas C en total; la estimación de líneas sin cubrir se muestra por archivo abajo.
- Estimación ponderada del C sin homólogo: **~84.865 líneas** (aproximación por proporción de funciones).
- Es un indicador de nombres, no de fidelidad: las funciones stub no cuentan (sección 3b) y **no incluye la fase de pruebas en navegador** (sección 5).

## 1. Archivos con huecos de implementación, de menos a más C sin cubrir

Orden sugerido por la estimación de líneas C aún no cubiertas; no mide fidelidad ni dificultad real.

| # | Archivo C | Estado | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---:|---|---|---:|---:|---:|---|
| 1 | `mail_data.c` | casi completo | 187 | 11/12 | ~15 |  |
| 2 | `item_pc.c` | casi completo | 1145 | 57/59 | ~38 |  |
| 3 | `mon_markings.c` | casi completo | 605 | 14/15 | ~40 |  |
| 4 | `event_object_lock.c` | parcial | 114 | 7/11 | ~41 |  |
| 5 | `menu_helpers.c` | casi completo | 243 | 14/17 | ~42 |  |
| 6 | `field_weather_util.c` | parcial | 105 | 6/10 | ~42 |  |
| 7 | `fldeff_poison.c` | parcial | 42 | 0/3 | ~42 |  |
| 8 | `window.c` | casi completo | 513 | 19/21 | ~48 |  |
| 9 | `battle_intro.c` | casi completo | 492 | 9/10 | ~49 |  |
| 10 | `field_weather_effects.c` | casi completo | 2346 | 91/93 | ~50 |  |
| 11 | `battle_anim_mons.c` | casi completo | 2360 | 125/128 | ~55 |  |
| 12 | `pokemon_icon.c` | casi completo | 1283 | 22/23 | ~55 |  |
| 13 | `field_tasks.c` | casi completo | 351 | 10/12 | ~58 |  |
| 14 | `menu_indicators.c` | casi completo | 656 | 18/20 | ~65 |  |
| 15 | `fldeff_flash.c` | casi completo | 479 | 19/22 | ~65 |  |
| 16 | `menu2.c` | casi completo | 671 | 9/10 | ~67 |  |
| 17 | `script.c` | casi completo | 583 | 48/55 | ~74 |  |
| 18 | `shop.c` | casi completo | 1145 | 55/60 | ~95 |  |
| 19 | `item.c` | casi completo | 680 | 42/49 | ~97 |  |
| 20 | `trainer_see.c` | casi completo | 750 | 32/37 | ~101 |  |
| 21 | `battle_script_commands.c` | casi completo | 9886 | 281/284 | ~104 |  |
| 22 | `pokeball.c` | casi completo | 1334 | 34/37 | ~108 |  |
| 23 | `evolution_graphics.c` | casi completo | 637 | 30/37 | ~120 |  |
| 24 | `battle_controllers.c` | casi completo | 1214 | 61/68 | ~124 |  |
| 25 | `item_menu_icons.c` | parcial | 439 | 12/17 | ~129 |  |
| 26 | `sound.c` | parcial | 649 | 38/48 | ~135 |  |
| 27 | `main.c` | parcial | 494 | 20/28 | ~141 |  |
| 28 | `braille_text.c` | parcial | 212 | 1/3 | ~141 |  |
| 29 | `metatile_behavior.c` | casi completo | 1039 | 97/115 | ~162 |  |
| 30 | `tm_case.c` | casi completo | 1737 | 66/73 | ~166 |  |
| 31 | `palette.c` | casi completo | 994 | 34/41 | ~169 |  |
| 32 | `bg.c` | casi completo | 1215 | 43/50 | ~170 |  |
| 33 | `battle_util.c` | casi completo | 3252 | 35/37 | ~175 |  |
| 34 | `battle_gfx_sfx_util.c` | casi completo | 1061 | 40/48 | ~176 |  |
| 35 | `new_menu_helpers.c` | parcial | 761 | 41/54 | ~183 |  |
| 36 | `battle_bg.c` | casi completo | 1111 | 14/17 | ~196 |  |
| 37 | `berry_pouch.c` | casi completo | 1529 | 65/77 | ~238 |  |
| 38 | `sprite.c` | casi completo | 1745 | 86/103 | ~288 |  |
| 39 | `battle_controller_player.c` | casi completo | 2966 | 111/123 | ~289 |  |
| 40 | `battle_interface.c` | casi completo | 2240 | 45/52 | ~301 |  |
| 41 | `region_map.c` | casi completo | 4036 | 128/140 | ~345 |  |
| 42 | `item_use.c` | parcial | 925 | 38/73 | ~443 |  |
| 43 | `item_menu.c` | casi completo | 2397 | 93/116 | ~475 |  |
| 44 | `trainer_card.c` | parcial | 1959 | 55/73 | ~483 |  |
| 45 | `field_door.c` | parcial | 524 | 0/21 | ~524 |  |
| 46 | `battle_controller_safari.c` | parcial | 669 | 14/72 | ~538 |  |
| 47 | `battle_setup.c` | parcial | 1070 | 28/66 | ~616 |  |
| 48 | `wild_encounter.c` | parcial | 784 | 7/36 | ~631 |  |
| 49 | `battle_controller_opponent.c` | parcial | 1777 | 56/87 | ~633 |  |
| 50 | `itemfinder.c` | parcial | 658 | 0/24 | ~658 |  |
| 51 | `mail.c` | parcial | 734 | 1/10 | ~660 |  |
| 52 | `field_fadetransition.c` | parcial | 965 | 16/59 | ~703 |  |
| 53 | `string_util.c` | parcial | 726 | 1/40 | ~707 |  |
| 54 | `easy_chat.c` | parcial | 730 | 1/39 | ~711 |  |
| 55 | `teachy_tv.c` | adaptador | 1400 | 28/58 | ~724 | menus/keyItemScreens.ts: lista de texto; teachyTv.ts no está conectado |
| 56 | `battle_controller_oak_old_man.c` | parcial | 2293 | 73/107 | ~728 |  |
| 57 | `evolution_scene.c` | parcial | 1704 | 13/23 | ~740 |  |
| 58 | `field_control_avatar.c` | parcial | 1182 | 17/49 | ~771 |  |
| 59 | `fieldmap.c` | parcial | 951 | 4/54 | ~880 |  |
| 60 | `berry.c` | parcial | 1028 | 1/9 | ~913 |  |
| 61 | `battle_main.c` | parcial | 4477 | 84/106 | ~929 |  |
| 62 | `vs_seeker.c` | parcial | 1326 | 12/41 | ~937 |  |
| 63 | `start_menu.c` | parcial | 1016 | 3/65 | ~969 |  |
| 64 | `trade_scene.c` | parcial | 2916 | 35/53 | ~990 |  |
| 65 | `pokemon_summary_screen.c` | casi completo | 5224 | 111/137 | ~991 |  |
| 66 | `field_specials.c` | parcial | 2555 | 72/118 | ~996 |  |
| 67 | `trainer_tower.c` | parcial | 1095 | 1/43 | ~1069 |  |
| 68 | `field_effect_helpers.c` | parcial | 1421 | 17/76 | ~1103 |  |
| 69 | `script_menu.c` | parcial | 1341 | 5/29 | ~1109 |  |
| 70 | `battle_tower.c` | parcial | 1425 | 7/45 | ~1203 |  |
| 71 | `title_screen.c` | parcial | 1315 | 2/39 | ~1247 |  |
| 72 | `fame_checker.c` | parcial | 1739 | 15/64 | ~1331 |  |
| 73 | `easy_chat_2.c` | parcial | 1363 | 1/73 | ~1344 |  |
| 74 | `party_menu.c` | parcial | 6342 | 281/357 | ~1350 |  |
| 75 | `text.c` | parcial | 1695 | 7/37 | ~1374 |  |
| 76 | `pokemon_storage_system_misc.c` | sin empezar | 1430 | 0/70 | ~1430 |  |
| 77 | `battle_ai_script_commands.c` | parcial | 1970 | 25/105 | ~1500 |  |
| 78 | `daycare.c` | parcial | 2155 | 28/93 | ~1506 |  |
| 79 | `pokemon_storage_system_graphics.c` | parcial | 1546 | 1/65 | ~1522 |  |
| 80 | `naming_screen.c` | parcial | 2509 | 33/109 | ~1749 |  |
| 81 | `m4a.c` | parcial | 1781 | 1/72 | ~1756 |  |
| 82 | `battle_controller_pokedude.c` | parcial | 2698 | 31/108 | ~1923 |  |
| 83 | `field_player_avatar.c` | parcial | 2168 | 12/176 | ~2020 |  |
| 84 | `pokemon_storage_system_data.c` | parcial | 2165 | 3/83 | ~2086 |  |
| 85 | `scrcmd.c` | parcial | 2264 | 1/224 | ~2253 |  |
| 86 | `easy_chat_3.c` | parcial | 2316 | 1/92 | ~2290 |  |
| 87 | `pokemon_storage_system_tasks.c` | parcial | 2770 | 2/82 | ~2702 |  |
| 88 | `intro.c` | parcial | 2805 | 2/79 | ~2733 |  |
| 89 | `overworld.c` | parcial | 3563 | 44/242 | ~2915 |  |
| 90 | `trade.c` | parcial | 2958 | 0/66 | ~2958 |  |
| 91 | `battle_transition.c` | parcial | 3037 | 1/134 | ~3014 |  |
| 92 | `pokemon.c` | parcial | 6453 | 70/140 | ~3226 |  |
| 93 | `field_effect.c` | parcial | 4033 | 13/239 | ~3813 |  |
| 94 | `event_object_movement.c` | parcial | 9412 | 34/759 | ~8990 |  |

Total: 94 archivos con huecos: 1 sin empezar, 1 adaptador, 35 casi completos y 57 parciales.

## 3b. Funciones stub (nombre del C con cuerpo vacío o `return 0;`)

No cuentan como portadas. Hay que escribir su cuerpo desde el C o borrarlas.

| Archivo C | Líneas | Portadas | Stubs |
|---|---:|---:|---:|
| `field_effect_helpers.c` | 1421 | 17/76 | 59 |
| `teachy_tv.c` | 1400 | 28/58 | 30 |
| `trade.c` | 2958 | 0/66 | 15 |
| `fame_checker.c` | 1739 | 15/64 | 7 |
| `help_system.c` | 2480 | 0/41 | 6 |
| `trade_scene.c` | 2916 | 35/53 | 3 |
| `field_weather_effects.c` | 2346 | 91/93 | 2 |
| `cable_club.c` | 1036 | 9/54 | 2 |
| `bg.c` | 1215 | 43/50 | 1 |
| `shop.c` | 1145 | 55/60 | 1 |
| `menu_helpers.c` | 243 | 14/17 | 1 |
| `union_room.c` | 4761 | 5/110 | 1 |
| `link.c` | 2202 | 1/114 | 1 |
| `quest_log.c` | 1767 | 2/88 | 1 |

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
