# Faltantes del port (generado)

Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.
Las listas de "pruebas" y "huecos conocidos" salen del script.

## Avance

- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **5442/9825 (55 %)**.
- Archivos C pendientes: **118** (132109 líneas de C).
- Es un indicador de nombres, no de fidelidad: las funciones stub no cuentan (sección 3b) y **no incluye la fase de pruebas en navegador** (sección 5).

## 1. Sin empezar (0 funciones portadas)

| Archivo C | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---|---:|---:|---:|---|

## 2. Adaptadores (UI simplificada; hay que portar la pantalla real)

| Archivo C | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---|---:|---:|---:|---|
| `teachy_tv.c` | 1400 | 28/58 | ~724 | menus/keyItemScreens.ts: lista de texto; teachyTv.ts no está conectado |

## 3. Parciales con más C sin cubrir (top 40)

| Archivo C | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---|---:|---:|---:|---|
| `event_object_movement.c` | 9412 | 42/752 | ~8886 |  |
| `field_effect.c` | 4033 | 39/239 | ~3374 |  |
| `pokemon.c` | 6453 | 73/135 | ~2963 |  |
| `trade.c` | 2958 | 0/66 | ~2958 |  |
| `pokemon_storage_system_tasks.c` | 2770 | 5/82 | ~2601 |  |
| `overworld.c` | 3563 | 70/238 | ~2515 |  |
| `battle_transition.c` | 3037 | 26/134 | ~2447 |  |
| `naming_screen.c` | 2509 | 4/109 | ~2416 |  |
| `easy_chat_3.c` | 2316 | 1/92 | ~2290 |  |
| `scrcmd.c` | 2264 | 3/224 | ~2233 |  |
| `intro.c` | 2805 | 17/79 | ~2201 |  |
| `pokemon_storage_system_data.c` | 2165 | 5/83 | ~2034 |  |
| `battle_controller_pokedude.c` | 2698 | 31/107 | ~1916 |  |
| `field_player_avatar.c` | 2168 | 33/176 | ~1761 |  |
| `m4a.c` | 1781 | 5/72 | ~1657 |  |
| `pokemon_storage_system_graphics.c` | 1546 | 1/65 | ~1522 |  |
| `battle_ai_script_commands.c` | 1970 | 25/103 | ~1491 |  |
| `pokemon_storage_system_misc.c` | 1430 | 2/67 | ~1387 |  |
| `party_menu.c` | 6342 | 280/357 | ~1367 |  |
| `easy_chat_2.c` | 1363 | 1/72 | ~1344 |  |
| `fame_checker.c` | 1739 | 15/64 | ~1331 |  |
| `text.c` | 1695 | 10/37 | ~1236 |  |
| `daycare.c` | 2155 | 41/93 | ~1204 |  |
| `field_effect_helpers.c` | 1421 | 14/76 | ~1159 |  |
| `trainer_tower.c` | 1095 | 1/43 | ~1069 |  |
| `battle_main.c` | 4477 | 82/106 | ~1013 |  |
| `script_menu.c` | 1341 | 8/29 | ~971 |  |
| `trade_scene.c` | 2916 | 36/53 | ~935 |  |
| `berry.c` | 1028 | 1/8 | ~899 |  |
| `battle_tower.c` | 1425 | 17/45 | ~886 |  |
| `vs_seeker.c` | 1326 | 15/40 | ~828 |  |
| `fieldmap.c` | 951 | 9/51 | ~783 |  |
| `title_screen.c` | 1315 | 17/39 | ~741 |  |
| `start_menu.c` | 1016 | 18/65 | ~734 |  |
| `battle_controller_oak_old_man.c` | 2293 | 73/107 | ~728 |  |
| `field_specials.c` | 2555 | 85/118 | ~714 |  |
| `evolution_scene.c` | 1704 | 13/22 | ~697 |  |
| `field_fadetransition.c` | 965 | 18/57 | ~660 |  |
| `mail.c` | 734 | 1/10 | ~660 |  |
| `field_control_avatar.c` | 1182 | 17/37 | ~638 |  |

Hay 117 archivos parciales en total; la lista completa está en [PORT-INVENTORY.md](PORT-INVENTORY.md).

## 3b. Funciones stub (nombre del C con cuerpo vacío o `return 0;`)

No cuentan como portadas. Hay que escribir su cuerpo desde el C o borrarlas.

| Archivo C | Líneas | Portadas | Stubs |
|---|---:|---:|---:|
| `field_effect_helpers.c` | 1421 | 14/76 | 62 |
| `teachy_tv.c` | 1400 | 28/58 | 30 |
| `field_weather.c` | 1147 | 29/50 | 21 |
| `trade.c` | 2958 | 0/66 | 15 |
| `fame_checker.c` | 1739 | 15/64 | 7 |
| `field_weather_effects.c` | 2346 | 87/93 | 6 |
| `trade_scene.c` | 2916 | 36/53 | 3 |
| `menu_helpers.c` | 243 | 12/17 | 3 |
| `save_failed_screen.c` | 228 | 11/14 | 3 |
| `learn_move.c` | 932 | 20/23 | 3 |
| `battle_anim_mons.c` | 2360 | 124/128 | 2 |
| `player_pc.c` | 740 | 45/47 | 2 |
| `sound.c` | 649 | 23/48 | 1 |
| `slot_machine.c` | 2527 | 76/77 | 1 |
| `bg.c` | 1215 | 43/50 | 1 |
| `shop.c` | 1145 | 55/60 | 1 |
| `quest_log_events.c` | 2247 | 2/79 | 1 |

## 3c. Portado pero sin conectar al juego

| Archivo C | TS | Motivo |
|---|---|---|
| `teachy_tv.c` | `teachyTv.ts` | el juego abre la lista de texto de `menus/keyItemScreens.ts` |
| `field_effect_helpers.c` | `field/fieldEffectHelpers.ts` | los efectos reales siguen en `field/fieldEffects.ts` |
| `save_failed_screen.c` | `saveFailedScreen.ts` | ningún fallo de guardado la abre |
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
- Pantalla de nombres: solo 4/109 funciones (`naming_screen.c`).
- Efectos de campo: `field_effect_helpers.c` son stubs (ver tabla de stubs); `field_effect.c` parcial.
- Clima: `field/weather.ts` porta tablas, aplicación/mezcla gamma y los fundidos de lluvia/sequía de 16 pasos sobre buffers de paleta; el dispatcher general, el fundido horizontal de niebla y la máquina de estados de sequía siguen pendientes. La ruta Canvas2D del overworld mantiene su aproximación visual.
- `scrcmd.c` y `event_object_movement.c`: el intérprete de scripts y el movimiento de objetos usan la capa de campo antigua (nombres propios).
- Créditos: las escenas de mapa no ejecutan NPCs, clima ni animación de tilesets.
- Audio fino (`m4a*.c`): reverb, ADSR exacto, duty/sweep, keysplit, paneo.
- Quest Log, sistema de ayuda y todo el hardware de enlace están fuera de alcance por decisión.

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
