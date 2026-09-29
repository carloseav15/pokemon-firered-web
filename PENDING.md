# Faltantes del port (generado)

Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.
Las listas de "pruebas" y "huecos conocidos" salen del script.

## Avance

- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **8132/10115 (80.4 %)**.
- Archivos C con funciones aún sin homólogo: **39**; quedan **1983 nombres**.
- Fuera de la meta principal, enlace e inalámbrico: 102/1711 en 42 archivos (sección aparte en PORT-INVENTORY.md).
- Estos archivos contienen 96.207 líneas C en total; la estimación de líneas sin cubrir se muestra por archivo abajo.
- Estimación ponderada del C sin homólogo: **~48.102 líneas** (aproximación por proporción de funciones).
- Es un indicador de nombres, no de fidelidad: las funciones stub no cuentan (sección 3b) y **no incluye la fase de pruebas en navegador** (sección 5).

## 1. Archivos con huecos de implementación, de menos a más C sin cubrir

Orden sugerido por la estimación de líneas C aún no cubiertas; no mide fidelidad ni dificultad real.

| # | Archivo C | Estado | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |
|---:|---|---|---:|---:|---:|---|
| 1 | `battle_controller_player.c` | casi completo | 2966 | 122/123 | ~24 |  |
| 2 | `sprite.c` | casi completo | 1745 | 101/103 | ~33 |  |
| 3 | `field_control_avatar.c` | casi completo | 1182 | 47/49 | ~48 |  |
| 4 | `main.c` | casi completo | 494 | 23/28 | ~88 |  |
| 5 | `start_menu.c` | casi completo | 1016 | 56/65 | ~140 |  |
| 6 | `field_fadetransition.c` | casi completo | 965 | 48/59 | ~179 |  |
| 7 | `trainer_card.c` | casi completo | 1959 | 66/73 | ~187 |  |
| 8 | `battle_bg.c` | casi completo | 1111 | 14/17 | ~196 |  |
| 9 | `evolution_scene.c` | parcial | 1704 | 17/23 | ~444 |  |
| 10 | `battle_records.c` | parcial | 568 | 4/31 | ~494 |  |
| 11 | `daycare.c` | parcial | 2155 | 71/93 | ~509 |  |
| 12 | `teachy_tv.c` | adaptador | 1400 | 28/58 | ~724 | menus/keyItemScreens.ts: lista de texto; teachyTv.ts no está conectado |
| 13 | `pokemon_summary_screen.c` | casi completo | 5224 | 117/137 | ~762 |  |
| 14 | `battle_main.c` | casi completo | 4477 | 86/106 | ~844 |  |
| 15 | `help_system_util.c` | sin empezar | 848 | 0/41 | ~848 |  |
| 16 | `trade_scene.c` | parcial | 2916 | 35/53 | ~990 |  |
| 17 | `trainer_tower.c` | parcial | 1095 | 1/43 | ~1069 |  |
| 18 | `party_menu.c` | casi completo | 6342 | 292/357 | ~1154 |  |
| 19 | `battle_tower.c` | parcial | 1425 | 7/45 | ~1203 |  |
| 20 | `title_screen.c` | parcial | 1315 | 2/39 | ~1247 |  |
| 21 | `fame_checker.c` | parcial | 1739 | 16/64 | ~1304 |  |
| 22 | `easy_chat_2.c` | parcial | 1363 | 1/73 | ~1344 |  |
| 23 | `text.c` | parcial | 1695 | 7/37 | ~1374 |  |
| 24 | `battle_transition.c` | parcial | 3037 | 72/134 | ~1405 |  |
| 25 | `pokemon_storage_system_misc.c` | sin empezar | 1430 | 0/70 | ~1430 |  |
| 26 | `quest_log.c` | parcial | 1767 | 16/88 | ~1445 |  |
| 27 | `pokemon_storage_system_graphics.c` | parcial | 1546 | 1/65 | ~1522 |  |
| 28 | `overworld.c` | parcial | 3563 | 123/242 | ~1752 |  |
| 29 | `m4a.c` | parcial | 1781 | 1/72 | ~1756 |  |
| 30 | `help_system.c` | parcial | 2480 | 10/41 | ~1875 |  |
| 31 | `battle_controller_pokedude.c` | parcial | 2698 | 32/108 | ~1898 |  |
| 32 | `quest_log_events.c` | parcial | 2247 | 15/118 | ~1961 |  |
| 33 | `pokemon_storage_system_data.c` | parcial | 2165 | 3/83 | ~2086 |  |
| 34 | `easy_chat_3.c` | parcial | 2316 | 1/92 | ~2290 |  |
| 35 | `field_effect.c` | parcial | 4033 | 95/239 | ~2429 |  |
| 36 | `pokemon_storage_system_tasks.c` | parcial | 2770 | 2/82 | ~2702 |  |
| 37 | `intro.c` | parcial | 2805 | 2/79 | ~2733 |  |
| 38 | `event_object_movement.c` | parcial | 9412 | 533/759 | ~2802 |  |
| 39 | `pokemon.c` | parcial | 6453 | 79/140 | ~2811 |  |

Total: 39 archivos con huecos: 2 sin empezar, 1 adaptador, 11 casi completos y 25 parciales.

## 3b. Funciones stub (nombre del C con cuerpo vacío o `return 0;`)

No cuentan como portadas. Hay que escribir su cuerpo desde el C o borrarlas.

| Archivo C | Líneas | Portadas | Stubs |
|---|---:|---:|---:|
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
- Pantalla de nombres: 104/109 funciones (`naming_screen.c`); estados, sprites, iconos, renderizado, teclado y callbacks conectados. Quedan cinco `Debug_NamingScreen*` estáticos sin callers en el C; pantalla e historia sin validar en navegador.
- Efectos de campo: `field_effect_helpers.c` 76/76 pero sin conectar (ver tabla 3c, los efectos reales siguen en `field/fieldEffects.ts`); `field_effect.c` parcial.
- Clima: `field/weather.ts` porta tablas, aplicación/mezcla gamma, hooks BG/OBJ, dispatcher, fundidos, oscurecimiento de paletas de quest log y la máquina de gamma de sequía; en FRLG `LoadDroughtWeatherPalette` es no-op y `Drought_Main` se atasca en el paso 2. La conexión a Canvas2D sigue pendiente.
- Créditos: las escenas de mapa no ejecutan NPCs, clima ni animación de tilesets.
- Audio fino (`m4a*.c`): reverb, ADSR exacto, duty/sweep, keysplit, paneo.
- Quest Log: el inventario incluye quest_log*.c; los eventos de tienda ya persisten en SaveData, pero faltan el buffer/serialización original, escenas, acciones y reproducción.
- Trainer Tower: `trainer_tower.c` y sus llamadas `InitTrainerTowerBattleStruct`/`FreeTrainerTowerBattleStruct` aún no están portadas; `battle_util2.c` tiene recursos normales cubiertos, pero ese branch queda pendiente.
- Uso de objetos (`item_use.c`): dispatch Enigma, rechazo de Oak, consumo/mensaje común de Repel, Escape Rope y Poké Doll, flautas, cañas, Item Finder, TM Case, Berry Pouch, Mail, Bike y la secuencia de potenciadores de combate están conectados. El helper registra payloads de uso en las rutas activas; faltan 12/73 nombres y la reproducción/serialización original de Quest Log.
- Barrido de candidatos (2026-09-28): `item_menu.c` conserva Teachy TV Catching/Status sin ruta conectada y `Task_UnusedReturnToBag` no tiene caller; `main.c` conserva solo inicialización/interrupciones de GBA ya adaptadas o sin equivalente de navegador; `sprite.c` CopyFrom/ToSprites copia el layout crudo de Sprite y no tiene callers; `battle_setup.c` PokéDude no tiene caller y Battle Tower sigue sin portar; los huecos de `battle_bg.c`, `evolution_scene.c` y `battle_records.c` son de enlace/intercambio; `help_system_util.c` requiere la UI GBA de ayuda aún no conectada.
- Bloqueo de tanda (2026-09-28): los cinco `Debug_NamingScreen*` restantes son funciones estáticas sin callers en `naming_screen.c`; los últimos huecos de `field_control_avatar.c` son interacciones de jugadores de enlace y `SetCableClubWarp` es solo Cable Club, fuera de la meta principal.
- Menú de guardado (`start_menu.c`): el commit de Quest Log necesita el buffer/serialización original de escenas (`SaveQuestLogData` en `quest_log.c`); la escena y reproducción de Quest Log siguen pendientes.
- Summary Pokémon: el cambio de mon usa una lista TS compacta; el C distingue `monList.boxMons`, huecos, huevos y party multi. La selección de caja/party requiere adaptar esos datos antes de portar `PokeSum_SeekToNextMon` y `Task_PokeSum_SwitchDisplayedPokemon`.

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
