# Faltantes del port (generado)

Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.
Las listas de "pruebas" y "huecos conocidos" salen del script.

## Avance

- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **6078/9834 (61 %)**.
- Archivos C pendientes: **51** (108138 líneas de C).
- Es un indicador de nombres, no de fidelidad: las funciones stub no cuentan (sección 3b) y **no incluye la fase de pruebas en navegador** (sección 5).

## 1. Archivos pendientes, de menos a más C sin cubrir

Orden sugerido por la estimación de líneas C aún no cubiertas; no mide fidelidad ni dificultad real.

| # | Archivo C | Estado | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---:|---|---|---:|---:|---:|---|
| 1 | `item_use.c` | parcial | 925 | 41/73 | ~405 |  |
| 2 | `trainer_card.c` | parcial | 1959 | 55/73 | ~483 |  |
| 3 | `battle_setup.c` | parcial | 1070 | 36/66 | ~486 |  |
| 4 | `field_door.c` | parcial | 524 | 1/21 | ~499 |  |
| 5 | `battle_controller_safari.c` | parcial | 669 | 14/72 | ~538 |  |
| 6 | `itemfinder.c` | parcial | 658 | 2/24 | ~603 |  |
| 7 | `wild_encounter.c` | parcial | 784 | 8/36 | ~609 |  |
| 8 | `easy_chat.c` | parcial | 730 | 6/39 | ~617 |  |
| 9 | `string_util.c` | parcial | 726 | 6/40 | ~617 |  |
| 10 | `battle_controller_opponent.c` | parcial | 1777 | 56/87 | ~633 |  |
| 11 | `mail.c` | parcial | 734 | 1/10 | ~660 |  |
| 12 | `evolution_scene.c` | parcial | 1704 | 14/23 | ~666 |  |
| 13 | `field_fadetransition.c` | parcial | 965 | 18/59 | ~670 |  |
| 14 | `field_control_avatar.c` | parcial | 1182 | 21/49 | ~675 |  |
| 15 | `teachy_tv.c` | adaptador | 1400 | 28/58 | ~724 | menus/keyItemScreens.ts: lista de texto; teachyTv.ts no está conectado |
| 16 | `battle_controller_oak_old_man.c` | parcial | 2293 | 73/107 | ~728 |  |
| 17 | `start_menu.c` | parcial | 1016 | 18/65 | ~734 |  |
| 18 | `field_specials.c` | parcial | 2555 | 84/118 | ~736 |  |
| 19 | `title_screen.c` | parcial | 1315 | 17/39 | ~741 |  |
| 20 | `fieldmap.c` | parcial | 951 | 11/54 | ~757 |  |
| 21 | `vs_seeker.c` | parcial | 1326 | 16/41 | ~808 |  |
| 22 | `battle_tower.c` | parcial | 1425 | 17/45 | ~886 |  |
| 23 | `berry.c` | parcial | 1028 | 1/9 | ~913 |  |
| 24 | `battle_main.c` | parcial | 4477 | 84/106 | ~929 |  |
| 25 | `trade_scene.c` | parcial | 2916 | 36/53 | ~935 |  |
| 26 | `script_menu.c` | parcial | 1341 | 8/29 | ~971 |  |
| 27 | `trainer_tower.c` | parcial | 1095 | 1/43 | ~1069 |  |
| 28 | `field_effect_helpers.c` | parcial | 1421 | 17/76 | ~1103 |  |
| 29 | `daycare.c` | parcial | 2155 | 42/93 | ~1181 |  |
| 30 | `text.c` | parcial | 1695 | 10/37 | ~1236 |  |
| 31 | `party_menu.c` | parcial | 6342 | 284/357 | ~1296 |  |
| 32 | `fame_checker.c` | parcial | 1739 | 15/64 | ~1331 |  |
| 33 | `easy_chat_2.c` | parcial | 1363 | 1/73 | ~1344 |  |
| 34 | `pokemon_storage_system_misc.c` | parcial | 1430 | 2/70 | ~1389 |  |
| 35 | `battle_ai_script_commands.c` | parcial | 1970 | 25/105 | ~1500 |  |
| 36 | `pokemon_storage_system_graphics.c` | parcial | 1546 | 1/65 | ~1522 |  |
| 37 | `m4a.c` | parcial | 1781 | 5/72 | ~1657 |  |
| 38 | `naming_screen.c` | parcial | 2509 | 35/109 | ~1703 |  |
| 39 | `field_player_avatar.c` | parcial | 2168 | 34/176 | ~1749 |  |
| 40 | `battle_controller_pokedude.c` | parcial | 2698 | 31/108 | ~1923 |  |
| 41 | `pokemon_storage_system_data.c` | parcial | 2165 | 5/83 | ~2034 |  |
| 42 | `intro.c` | parcial | 2805 | 17/79 | ~2201 |  |
| 43 | `scrcmd.c` | parcial | 2264 | 5/224 | ~2213 |  |
| 44 | `easy_chat_3.c` | parcial | 2316 | 1/92 | ~2290 |  |
| 45 | `battle_transition.c` | parcial | 3037 | 26/134 | ~2447 |  |
| 46 | `overworld.c` | parcial | 3563 | 73/242 | ~2488 |  |
| 47 | `pokemon_storage_system_tasks.c` | parcial | 2770 | 5/82 | ~2601 |  |
| 48 | `pokemon.c` | parcial | 6453 | 77/140 | ~2903 |  |
| 49 | `trade.c` | parcial | 2958 | 0/66 | ~2958 |  |
| 50 | `field_effect.c` | parcial | 4033 | 42/239 | ~3324 |  |
| 51 | `event_object_movement.c` | parcial | 9412 | 49/759 | ~8804 |  |

Total: 0 sin empezar, 1 adaptadores y 50 parciales.

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
| `field_weather.c` | 1147 | 47/50 | 3 |
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
