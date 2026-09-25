# Faltantes del port (generado)

Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.
Las listas de "pruebas" y "huecos conocidos" salen del script.

## Avance

- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **5082/9825 (51 %)**.
- Archivos C pendientes: **122** (143279 líneas de C).
- Es un indicador de nombres, no de fidelidad, y **no incluye la fase de pruebas en navegador** (ninguna pantalla nueva se ha ejecutado aún).

## 1. Sin empezar (0 funciones portadas)

| Archivo C | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---|---:|---:|---:|---|
| `image_processing_effects.c` | 4436 | 0/38 | ~4436 |  |

## 2. Adaptadores (UI simplificada; hay que portar la pantalla real)

| Archivo C | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---|---:|---:|---:|---|
| `trade.c` | 2958 | 0/66 | ~2958 | pokemon/ingameTrade.ts: sin escena |
| `slot_machine.c` | 2527 | 13/77 | ~2100 | menus/slotMachine.ts: reglas sin gráficos |
| `fame_checker.c` | 1739 | 4/64 | ~1630 | menus/keyItemScreens.ts |
| `teachy_tv.c` | 1400 | 0/58 | ~1400 | menus/keyItemScreens.ts |
| `pokemon_storage_system_menu.c` | 660 | 4/29 | ~568 | menus/storageMenu.ts: reglas con listas |
| `player_pc.c` | 740 | 33/47 | ~220 | menus/playerPc.ts: menú superior sobre el campo canvas |

## 3. Parciales con más C sin cubrir (top 40)

| Archivo C | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---|---:|---:|---:|---|
| `event_object_movement.c` | 9412 | 42/752 | ~8886 |  |
| `field_effect.c` | 4033 | 39/239 | ~3374 |  |
| `pokemon.c` | 6453 | 73/135 | ~2963 |  |
| `battle_transition.c` | 3037 | 10/134 | ~2810 |  |
| `pokemon_storage_system_tasks.c` | 2770 | 4/82 | ~2634 |  |
| `trade_scene.c` | 2916 | 7/53 | ~2530 |  |
| `overworld.c` | 3563 | 70/238 | ~2515 |  |
| `naming_screen.c` | 2509 | 4/109 | ~2416 |  |
| `field_weather_effects.c` | 2346 | 1/93 | ~2320 |  |
| `easy_chat_3.c` | 2316 | 1/92 | ~2290 |  |
| `scrcmd.c` | 2264 | 3/224 | ~2233 |  |
| `intro.c` | 2805 | 17/79 | ~2201 |  |
| `pokemon_storage_system_data.c` | 2165 | 5/83 | ~2034 |  |
| `battle_controller_pokedude.c` | 2698 | 31/107 | ~1916 |  |
| `field_player_avatar.c` | 2168 | 33/176 | ~1761 |  |
| `m4a.c` | 1781 | 5/72 | ~1657 |  |
| `pokemon_storage_system_graphics.c` | 1546 | 1/65 | ~1522 |  |
| `battle_ai_script_commands.c` | 1970 | 25/103 | ~1491 |  |
| `field_effect_helpers.c` | 1421 | 0/76 | ~1421 |  |
| `pokemon_storage_system_misc.c` | 1430 | 2/67 | ~1387 |  |
| `party_menu.c` | 6342 | 280/357 | ~1367 |  |
| `easy_chat_2.c` | 1363 | 1/72 | ~1344 |  |
| `text.c` | 1695 | 10/37 | ~1236 |  |
| `daycare.c` | 2155 | 41/93 | ~1204 |  |
| `trainer_tower.c` | 1095 | 1/43 | ~1069 |  |
| `battle_main.c` | 4477 | 82/106 | ~1013 |  |
| `field_weather.c` | 1147 | 7/50 | ~986 |  |
| `script_menu.c` | 1341 | 8/29 | ~971 |  |
| `berry.c` | 1028 | 1/8 | ~899 |  |
| `battle_tower.c` | 1425 | 17/45 | ~886 |  |
| `start_menu.c` | 1016 | 11/65 | ~844 |  |
| `vs_seeker.c` | 1326 | 15/40 | ~828 |  |
| `fieldmap.c` | 951 | 9/51 | ~783 |  |
| `title_screen.c` | 1315 | 17/39 | ~741 |  |
| `learn_move.c` | 932 | 5/23 | ~729 |  |
| `battle_controller_oak_old_man.c` | 2293 | 73/107 | ~728 |  |
| `field_specials.c` | 2555 | 85/118 | ~714 |  |
| `evolution_scene.c` | 1704 | 13/22 | ~697 |  |
| `field_fadetransition.c` | 965 | 18/57 | ~660 |  |
| `mail.c` | 734 | 1/10 | ~660 |  |

Hay 115 archivos parciales en total; la lista completa está en [PORT-INVENTORY.md](PORT-INVENTORY.md).

## 4. Huecos conocidos que el conteo no muestra

- Easy Chat: escribir cartas (`easy_chat*.c`); hoy las cartas quedan en blanco.
- Intercambios en juego sin escena (`trade.c`, `trade_scene.c`).
- Almacenamiento de cajas con listas en vez de la interfaz real (`pokemon_storage_system_*.c`).
- Fame Checker y Teachy TV son adaptadores de texto (`fame_checker.c`, `teachy_tv.c`, `battle_controller_pokedude.c`).
- Tragaperras sin gráficos (`slot_machine.c`).
- Sin transiciones de combate (`battle_transition.c`) ni `image_processing_effects.c`.
- Pantalla de nombres: solo 4/109 funciones (`naming_screen.c`).
- Clima y efectos de campo parciales (`field_weather*.c`, `field_effect*.c`, `field_effect_helpers.c`).
- `scrcmd.c` y `event_object_movement.c`: el intérprete de scripts y el movimiento de objetos usan la capa de campo antigua (nombres propios).
- Créditos: las escenas de mapa no ejecutan NPCs, clima ni animación de tilesets.
- Audio fino (`m4a*.c`): reverb, ADSR exacto, duty/sweep, keysplit, paneo.
- Quest Log, sistema de ayuda y todo el hardware de enlace están fuera de alcance por decisión.

## 5. Portado pero sin probar en navegador

Verificado solo con `check:port`, `build` y paridad de cdata/incbin/textos:

- pokedex_screen.c + pokedex_area_markers.c + wild_pokemon_area.c + trainer_pokemon_sprites.c → `pokedexScreen.ts`
- pokemon_special_anim.c + pokemon_special_anim_scene.c (usar objeto) → `pokemonSpecialAnim.ts`
- item_pc.c + mailbox_pc.c + pc_screen_effect.c + player_pc.c (buzón) → `itemPc.ts, mailboxPc.ts, playerPcMailbox.ts, pcScreenEffect.ts`
- shop.c + buy_menu_helpers.c (+ event_object_movement.c parcial) → `shop.ts, buyMenuHelpers.ts, objectEventGraphics.ts`
- hall_of_fame.c + credits.c (+ overworld.c créditos) → `hallOfFame.ts, credits.ts, overworldCredits.ts`

## 6. Fase final (después de portar)

1. Probar en navegador cada pantalla de la sección 5 y las portadas antes (`window.frDebug`, `?fr=new`/`?fr=continue`).
2. Recorrido zona por zona de Kanto y Sevii contra el C/emulador (eventos, specials con valores fijos, entrenadores, capturas, Safari).
3. Guardados de regresión por zona y checks headless por sistema en `tools/checks/`.
4. Decisión de diseño postgame (tickets de Mew/Deoxys).
