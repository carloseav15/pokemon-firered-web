# Inventario del port (generado)

Generado por `tools/portInventory.py` (`npm run inventory`); no editar a mano.
Mide cuántas funciones de cada `.c` existen con el mismo nombre en `src/fr`.
La comparación ignora mayúsculas y `_` (la capa de campo antigua usa camelCase).
Un nombre presente no prueba paridad: es un indicador de avance, no de fidelidad.
Las categorías fuera/cubierto/adaptador salen de las tablas del script.

| Estado | Archivos | Líneas C | Funciones con nombre en TS |
|---|---:|---:|---:|
| Falta (sin funciones portadas) | 21 | 23562 | 0/627 |
| Parcial (menos del 80 % de funciones) | 133 | 152867 | 1858/6793 |
| Adaptador (UI simplificada) | 9 | 13277 | 35/489 |
| Portado (≥ 80 % de funciones con el mismo nombre) | 46 | 59237 | 1731/1916 |
| Solo datos (exportados a cdata) | 1 | 53 | 0/0 |
| Cubierto por hw/navegador/exportador | 22 | 16278 | 9/118 |
| Fuera de alcance | 51 | 55183 | 91/1950 |
| **Pendiente de portar** | **163** | **189706** | |
| **Total en alcance** | **210** | **248996** | **3624/9825** |

## Falta (sin funciones portadas)

| Archivo C | Líneas | Funciones | TS que lo citan | Nota |
|---|---:|---:|---|---|
| `battle_anim_effects_1.c` | 5677 | 0/154 |  |  |
| `image_processing_effects.c` | 4436 | 0/38 |  |  |
| `battle_transition.c` | 3037 | 0/134 |  |  |
| `battle_anim_ghost.c` | 1484 | 0/41 |  |  |
| `battle_anim_flying.c` | 1289 | 0/33 |  |  |
| `battle_anim_fire.c` | 1286 | 0/35 |  |  |
| `battle_anim_electric.c` | 1280 | 0/37 |  |  |
| `battle_anim_psychic.c` | 1090 | 0/26 |  |  |
| `battle_anim_fight.c` | 969 | 0/31 |  |  |
| `palette_util.c` | 474 | 0/17 |  |  |
| `battle_anim_bug.c` | 462 | 0/13 |  |  |
| `battle_anim_dragon.c` | 434 | 0/11 |  |  |
| `battle_anim_poison.c` | 298 | 0/9 |  |  |
| `tilemap_util.c` | 238 | 0/11 |  |  |
| `save_failed_screen.c` | 228 | 0/14 |  |  |
| `braille_text.c` | 212 | 0/3 |  |  |
| `buy_menu_helpers.c` | 205 | 0/7 |  |  |
| `battle_anim_smokescreen.c` | 197 | 0/3 |  |  |
| `pc_screen_effect.c` | 179 | 0/7 |  |  |
| `coord_event_weather.c` | 49 | 0/1 |  |  |
| `cable_car_util.c` | 38 | 0/2 |  |  |

## Parcial (menos del 80 % de funciones)

| Archivo C | Líneas | Funciones | TS que lo citan | Nota |
|---|---:|---:|---|---|
| `event_object_movement.c` | 9412 | 36/752 | `field/fieldEffects.ts`, `field/objectEvents.ts` |  |
| `pokemon.c` | 6453 | 72/135 | `battle/ai.ts`, `battle/anim.ts`, `battle/battleSetup.ts` … |  |
| `party_menu.c` | 6342 | 279/357 | `battle/ext.ts`, `menus/fieldMenus.ts`, `menus/fieldMoveMenu.ts` … |  |
| `battle_anim_effects_3.c` | 5430 | 5/140 |  |  |
| `battle_main.c` | 4477 | 82/106 | `battle/globals.ts`, `battle/main.ts`, `battle/main_init.ts` … |  |
| `field_effect.c` | 4033 | 39/239 | `field/fieldMoves.ts` |  |
| `battle_anim_effects_2.c` | 3865 | 2/121 |  |  |
| `overworld.c` | 3563 | 55/238 | `battle/host.ts`, `field/fieldMoves.ts`, `field/overworld.ts` … |  |
| `trade_scene.c` | 2916 | 7/53 | `pokemon/ingameTrade.ts`, `pokemon/mail.ts` |  |
| `intro.c` | 2805 | 16/79 | `introCopyright.ts`, `introGameFreak.ts`, `introScene1.ts` … |  |
| `pokemon_storage_system_tasks.c` | 2770 | 4/82 |  |  |
| `battle_controller_pokedude.c` | 2698 | 31/107 |  |  |
| `field_specials.c` | 2555 | 85/118 | `field/fieldMoves.ts`, `game.ts`, `menus/scriptMenu.ts` … |  |
| `naming_screen.c` | 2509 | 4/109 | `gba/input.ts`, `menus/namingModel.ts`, `namingScreen.ts` … |  |
| `field_weather_effects.c` | 2346 | 1/93 | `field/weather.ts`, `script/specials.ts` |  |
| `easy_chat_3.c` | 2316 | 1/92 |  |  |
| `battle_anim_special.c` | 2304 | 18/81 | `battle/gfx_sfx_util.ts`, `battle/interface.ts`, `battle/pokeball.ts` |  |
| `battle_controller_oak_old_man.c` | 2293 | 73/107 | `battle/controller_oak_old_man.ts` |  |
| `scrcmd.c` | 2264 | 2/224 | `script/commands.ts` |  |
| `field_player_avatar.c` | 2168 | 32/176 | `field/fishing.ts`, `field/playerAvatar.ts` |  |
| `pokemon_storage_system_data.c` | 2165 | 5/83 | `menus/storageMenu.ts`, `pokemon/storage.ts` |  |
| `daycare.c` | 2155 | 41/93 | `game.ts`, `pokemon/daycare.ts`, `script/specials.ts` |  |
| `battle_ai_script_commands.c` | 1970 | 25/103 | `battle/ai.ts`, `battle/util.ts` |  |
| `trainer_card.c` | 1959 | 55/73 | `menus/trainerCard.ts` |  |
| `m4a.c` | 1781 | 4/72 | `audio/m4a.ts` |  |
| `battle_controller_opponent.c` | 1777 | 56/87 | `battle/controller_opponent.ts` |  |
| `battle_anim.c` | 1725 | 24/77 | `battle/anim.ts`, `battle/animScript.ts` |  |
| `evolution_scene.c` | 1704 | 13/22 | `battle/evoScene.ts`, `battle/ext.ts`, `evolutionScene.ts` … |  |
| `text.c` | 1695 | 10/37 | `battle/interface.ts`, `gba/font.ts`, `gba/textPrinter.ts` … |  |
| `battle_anim_water.c` | 1591 | 1/48 | `battle/animTasks.ts` |  |
| `pokemon_storage_system_graphics.c` | 1546 | 1/65 |  |  |
| `battle_anim_ice.c` | 1474 | 1/32 |  |  |
| `credits.c` | 1446 | 3/16 | `hallOfFame.ts` |  |
| `pokemon_storage_system_misc.c` | 1430 | 2/67 |  |  |
| `battle_tower.c` | 1425 | 17/45 | `script/specials.ts` |  |
| `field_effect_helpers.c` | 1421 | 0/76 | `field/fieldEffects.ts` |  |
| `easy_chat_2.c` | 1363 | 1/72 |  |  |
| `script_menu.c` | 1341 | 8/29 | `menus/scriptMenu.ts`, `script/specialsExtra.ts`, `seagallop.ts` |  |
| `vs_seeker.c` | 1326 | 15/40 | `battle/ext.ts`, `field/vsSeeker.ts` |  |
| `title_screen.c` | 1315 | 17/39 | `introTitle.ts` |  |
| `hall_of_fame.c` | 1286 | 6/42 | `hallOfFame.ts` |  |
| `battle_controllers.c` | 1214 | 46/67 | `battle/controllers.ts` |  |
| `field_control_avatar.c` | 1182 | 17/37 | `field/fieldControl.ts` |  |
| `field_weather.c` | 1147 | 5/50 | `field/weather.ts`, `gba/fade.ts` |  |
| `battle_bg.c` | 1111 | 12/17 | `battle/bg.ts` |  |
| `trainer_tower.c` | 1095 | 1/43 | `script/specials.ts` |  |
| `battle_setup.c` | 1070 | 29/57 | `battle/battleSetup.ts`, `battle/ext.ts`, `battle/host.ts` … |  |
| `berry.c` | 1028 | 1/8 | `script/specials.ts` |  |
| `start_menu.c` | 1016 | 6/65 | `game.ts` |  |
| `battle_anim_normal.c` | 997 | 3/36 | `battle/animTasks.ts` |  |
| `palette.c` | 994 | 29/41 | `hw/palette.ts` |  |
| `battle_anim_utility_funcs.c` | 970 | 14/42 | `battle/animTasks.ts` |  |
| `field_fadetransition.c` | 965 | 18/57 | `field/overworld.ts` |  |
| `fieldmap.c` | 951 | 7/51 | `field/fieldmap.ts` |  |
| `battle_anim_mon_movement.c` | 941 | 9/34 | `battle/animTasks.ts` |  |
| `learn_move.c` | 932 | 5/23 | `game.ts`, `menus/hardwareChoice.ts`, `menus/moveRelearner.ts` |  |
| `item_use.c` | 925 | 33/73 | `battle/ext.ts`, `menus/fieldMenus.ts` |  |
| `battle_anim_dark.c` | 923 | 2/25 | `battle/animTasks.ts` |  |
| `menu.c` | 872 | 25/49 | `gba/window.ts`, `hw/menu.ts`, `hw/menuHelpers.ts` … |  |
| `battle_anim_rock.c` | 822 | 1/22 |  |  |
| `main_menu.c` | 788 | 23/29 | `mainMenu.ts` |  |
| `wild_encounter.c` | 784 | 6/36 | `field/wildEncounter.ts` |  |
| `new_menu_helpers.c` | 761 | 25/53 | `gba/font.ts`, `hw/menu.ts`, `hw/menuHelpers.ts` … |  |
| `list_menu.c` | 758 | 24/31 | `hw/listMenu.ts`, `menus/fieldListMenu.ts`, `menus/hardwareChoice.ts` |  |
| `battle_anim_ground.c` | 752 | 1/25 |  |  |
| `trainer_see.c` | 750 | 7/37 | `field/fieldEffects.ts`, `field/trainerSee.ts` |  |
| `player_pc.c` | 740 | 3/47 | `menus/playerPc.ts` |  |
| `mail.c` | 734 | 1/10 | `menus/mailView.ts`, `pokemon/mail.ts`, `pokemon/pokemon.ts` |  |
| `easy_chat.c` | 730 | 5/37 | `script/specials.ts` |  |
| `string_util.c` | 726 | 5/39 | `gba/charmap.ts` |  |
| `pokemon_special_anim.c` | 709 | 5/31 | `partyMenu.ts`, `pokemonSpecialAnim.ts` |  |
| `item.c` | 680 | 22/47 | `hw/menuHelpers.ts`, `partyMenu.ts`, `pokemon/items.ts` … |  |
| `menu2.c` | 671 | 4/10 |  |  |
| `battle_controller_safari.c` | 669 | 14/72 | `battle/controller_safari.ts` |  |
| `itemfinder.c` | 658 | 2/24 | `menus/fieldMenus.ts` |  |
| `menu_indicators.c` | 656 | 12/20 | `hw/listMenu.ts`, `menus/fieldListMenu.ts`, `menus/hardwareChoice.ts` |  |
| `sound.c` | 649 | 18/48 | `audio/m4a.ts`, `audio/sound.ts`, `battle/gfx_sfx_util.ts` … |  |
| `map_preview_screen.c` | 616 | 6/13 | `mapPreviewScreen.ts` |  |
| `script.c` | 583 | 12/53 | `field/fieldControl.ts`, `script/context.ts` |  |
| `option_menu.c` | 575 | 15/19 | `optionMenu.ts` |  |
| `field_camera.c` | 572 | 2/28 | `field/overworld.ts` |  |
| `battle_anim_status_effects.c` | 535 | 2/12 | `battle/anim.ts` |  |
| `field_door.c` | 524 | 1/19 | `field/doors.ts` |  |
| `seagallop.c` | 504 | 8/22 | `seagallop.ts` |  |
| `main.c` | 494 | 7/28 | `game.ts`, `gba/input.ts`, `hw/runtime.ts` … |  |
| `fldeff_flash.c` | 479 | 2/22 | `mapPreviewScreen.ts` |  |
| `field_screen_effect.c` | 462 | 5/19 | `field/fieldEffects.ts` |  |
| `bike.c` | 418 | 8/24 | `field/playerAvatar.ts` |  |
| `decompress.c` | 352 | 8/18 | `pokemon/pics.ts` |  |
| `field_tasks.c` | 351 | 4/12 | `field/fieldTasks.ts`, `script/specialsExtra.ts` |  |
| `trainer_fan_club.c` | 347 | 10/23 | `script/specialsExtra.ts` |  |
| `special_field_anim.c` | 341 | 2/10 | `script/specialsExtra.ts` |  |
| `event_data.c` | 336 | 8/26 | `save.ts` |  |
| `battle_anim_sound_tasks.c` | 332 | 9/15 | `battle/animTasks.ts` |  |
| `tileset_anims.c` | 332 | 8/28 | `field/tileRenderer.ts` |  |
| `text_printer.c` | 326 | 7/15 | `gba/textPrinter.ts`, `hw/text.ts` |  |
| `fldeff_cut.c` | 295 | 3/13 | `field/fieldMoves.ts` |  |
| `util.c` | 276 | 1/10 |  |  |
| `diploma.c` | 275 | 1/10 | `diploma.ts` |  |
| `roamer.c` | 264 | 9/13 | `pokemon/roamer.ts` |  |
| `scanline_effect.c` | 261 | 6/9 | `hw/scanline.ts` |  |
| `menu_helpers.c` | 243 | 13/17 | `hw/menuHelpers.ts` |  |
| `map_name_popup.c` | 231 | 0/7 | `field/mapNamePopup.ts` |  |
| `script_movement.c` | 226 | 2/18 | `script/movement.ts` |  |
| `pokemon_size_record.c` | 217 | 6/13 | `script/specialsExtra.ts` |  |
| `script_pokemon_util.c` | 215 | 9/13 | `script/specials.ts` |  |
| `ss_anne.c` | 200 | 1/8 | `script/specialsExtra.ts` |  |
| `mail_data.c` | 187 | 6/12 | `partyMenu.ts` |  |
| `text_window.c` | 177 | 12/18 | `battle/bg.ts`, `hw/menu.ts`, `hw/menuHelpers.ts` |  |
| `pokemon_storage_system.c` | 171 | 4/21 |  |  |
| `new_game.c` | 160 | 3/11 | `game.ts`, `random.ts`, `save.ts` |  |
| `pokedex.c` | 148 | 4/8 | `battle/ext.ts`, `pokemon/pokemon.ts` |  |
| `field_message_box.c` | 142 | 3/14 | `field/messageBox.ts` |  |
| `fldeff_rocksmash.c` | 137 | 2/10 | `field/fieldMoves.ts` |  |
| `money.c` | 136 | 9/13 | `hw/menuHelpers.ts`, `pokemon/items.ts` |  |
| `berry_powder.c` | 133 | 6/14 | `script/specialsExtra.ts` |  |
| `window_8bpp.c` | 127 | 5/7 | `hw/window.ts` |  |
| `heal_location.c` | 122 | 1/3 | `field/overworld.ts` |  |
| `field_poison.c` | 119 | 2/7 | `field/poison.ts` |  |
| `event_object_lock.c` | 114 | 3/11 |  |  |
| `save_location.c` | 112 | 2/10 |  |  |
| `battle_util2.c` | 108 | 1/3 | `battle/anim.ts`, `pokemon/mon_extra.ts` |  |
| `fldeff_softboiled.c` | 108 | 6/8 | `partyMenu.ts` |  |
| `party_menu_specials.c` | 108 | 7/9 | `game.ts`, `script/specialsExtra.ts` |  |
| `field_weather_util.c` | 105 | 6/10 | `field/weather.ts` |  |
| `fldeff_sweetscent.c` | 100 | 1/7 | `field/fieldMoves.ts` |  |
| `coins.c` | 98 | 2/9 | `pokemon/items.ts` |  |
| `safari_zone.c` | 79 | 4/8 | `battle/battleSetup.ts` |  |
| `hof_pc.c` | 50 | 1/5 |  |  |
| `fldeff_dig.c` | 46 | 1/4 | `field/fieldMoves.ts` |  |
| `fldeff_strength.c` | 46 | 1/4 | `field/fieldMoves.ts` |  |
| `fldeff_teleport.c` | 41 | 1/4 | `field/fieldMoves.ts` |  |
| `field_special_scene.c` | 27 | 1/6 | `script/specials.ts` |  |

## Adaptador (UI simplificada)

| Archivo C | Líneas | Funciones | TS que lo citan | Nota |
|---|---:|---:|---|---|
| `trade.c` | 2958 | 0/66 |  | pokemon/ingameTrade.ts: sin escena |
| `slot_machine.c` | 2527 | 13/77 | `game/slots.ts`, `menus/slotMachine.ts` | menus/slotMachine.ts: reglas sin gráficos |
| `fame_checker.c` | 1739 | 4/64 | `menus/keyItemScreens.ts` | menus/keyItemScreens.ts |
| `pokemon_special_anim_scene.c` | 1563 | 7/67 | `battle/anim.ts` | partyMenu.ts salta StartUseItemAnim |
| `teachy_tv.c` | 1400 | 0/58 | `menus/keyItemScreens.ts` | menus/keyItemScreens.ts |
| `item_pc.c` | 1145 | 0/59 | `menus/hardwareChoice.ts`, `menus/playerPc.ts` | menus/playerPc.ts: listas simplificadas |
| `shop.c` | 1145 | 5/60 | `menus/shopMenu.ts`, `menus/shopModel.ts` | menus/shopMenu.ts |
| `pokemon_storage_system_menu.c` | 660 | 4/29 | `pokemon/storage.ts` | menus/storageMenu.ts: reglas con listas |
| `mailbox_pc.c` | 140 | 2/9 | `menus/playerPc.ts`, `pokemon/mail.ts` | menus/playerPc.ts: listas simplificadas |

## Portado (≥ 80 % de funciones con el mismo nombre)

| Archivo C | Líneas | Funciones | TS que lo citan | Nota |
|---|---:|---:|---|---|
| `battle_script_commands.c` | 9886 | 280/283 | `battle/cmds/helpers.ts`, `battle/cmds/index.ts`, `battle/cmds/part1.ts` … |  |
| `pokemon_summary_screen.c` | 5224 | 111/137 | `pokemonSummaryScreen.ts`, `summaryScreen.ts` |  |
| `region_map.c` | 4036 | 127/138 | `regionMap.ts` |  |
| `pokedex_screen.c` | 3452 | 66/66 | `pokedexScreen.ts`, `pokemon/mon_extra.ts` |  |
| `battle_util.c` | 3252 | 34/36 | `battle/util.ts` |  |
| `battle_controller_player.c` | 2966 | 114/123 | `battle/controller_player.ts` |  |
| `battle_message.c` | 2855 | 9/9 | `battle/message.ts` |  |
| `item_menu.c` | 2397 | 99/116 | `bagMenu.ts`, `battle/ext.ts`, `menus/hardwareChoice.ts` … |  |
| `battle_anim_mons.c` | 2360 | 105/128 | `battle/anim.ts`, `battle/animTasks.ts` |  |
| `battle_interface.c` | 2240 | 45/51 | `battle/interface.ts`, `battle/util.ts` |  |
| `oak_speech.c` | 2186 | 64/64 | `oakSpeech.ts`, `startup.ts` |  |
| `sprite.c` | 1745 | 86/103 | `gba/sprite.ts`, `hw/sprite.ts` |  |
| `tm_case.c` | 1737 | 67/73 | `menus/fieldMenus.ts`, `tmCase.ts` |  |
| `berry_pouch.c` | 1529 | 66/77 | `berryPouch.ts`, `menus/fieldMenus.ts` |  |
| `pokeball.c` | 1334 | 34/37 | `battle/pokeball.ts` |  |
| `pokemon_icon.c` | 1283 | 19/20 | `battle/ext.ts`, `pokemonIcon.ts` |  |
| `bg.c` | 1215 | 44/50 | `hw/bg.ts` |  |
| `battle_gfx_sfx_util.c` | 1061 | 40/48 | `battle/bg.ts`, `battle/gfx_sfx_util.ts` |  |
| `metatile_behavior.c` | 1039 | 97/115 |  |  |
| `battle_ai_switch_items.c` | 674 | 12/12 | `battle/ai.ts` |  |
| `evolution_graphics.c` | 637 | 30/37 | `evolutionScene.ts` |  |
| `renewable_hidden_items.c` | 608 | 4/4 | `renewableHiddenItems.ts` |  |
| `mon_markings.c` | 605 | 14/15 | `monMarkings.ts` |  |
| `trig.c` | 542 | 4/4 | `hw/trig.ts` |  |
| `window.c` | 513 | 19/21 | `gba/window.ts`, `hw/window.ts` |  |
| `battle_intro.c` | 492 | 9/10 | `battle/intro.ts` |  |
| `item_menu_icons.c` | 439 | 13/16 | `bagMenu.ts` |  |
| `wild_pokemon_area.c` | 317 | 7/7 | `pokedexArea.ts` |  |
| `reshow_battle_screen.c` | 314 | 7/7 | `battle/bg.ts`, `battle/reshow.ts` |  |
| `bag.c` | 312 | 13/13 | `bagMenu.ts` |  |
| `trainer_pokemon_sprites.c` | 286 | 22/22 | `trainerPokemonSprites.ts` |  |
| `pokedex_area_markers.c` | 274 | 5/5 | `pokedexArea.ts` |  |
| `blit.c` | 212 | 5/5 | `hw/window.ts` |  |
| `task.c` | 211 | 12/14 | `gba/tasks.ts`, `hw/menuHelpers.ts` |  |
| `clear_save_data_screen.c` | 208 | 7/8 | `clearSaveScreen.ts` |  |
| `gpu_regs.c` | 158 | 10/11 | `hw/gpu.ts` |  |
| `dynamic_placeholder_text_util.c` | 137 | 4/4 | `dynamicPlaceholderTextUtil.ts` |  |
| `prof_pc.c` | 109 | 2/2 | `game.ts` |  |
| `math_util.c` | 87 | 9/9 | `mathUtil.ts` |  |
| `post_battle_event_funcs.c` | 74 | 2/2 | `hallOfFame.ts` |  |
| `play_time.c` | 65 | 5/5 | `save.ts` |  |
| `save_menu_util.c` | 56 | 1/1 | `game.ts`, `saveMenuUtil.ts` |  |
| `blend_palette.c` | 46 | 2/2 | `hw/palette.ts` |  |
| `fldeff_poison.c` | 42 | 3/3 | `field/fieldEffects.ts` |  |
| `random.c` | 18 | 2/2 | `random.ts` |  |
| `fldeff_berrytree.c` | 4 | 1/1 | `script/specials.ts` |  |

## Solo datos (exportados a cdata)

| Archivo C | Líneas | Funciones | TS que lo citan | Nota |
|---|---:|---:|---|---|
| `bg_regs.c` | 53 | — | `hw/bgRegs.ts` |  |

## Cubierto por hw/navegador/exportador

| Archivo C | Líneas | Funciones | TS que lo citan | Nota |
|---|---:|---:|---|---|
| `trainer_tower_sets.c` | 8997 | — |  | exportador (cdata) |
| `graphics.c` | 1380 | — |  | exportador (incbin) |
| `strings.c` | 1335 | — | `oakSpeech.ts` | exportador (textos) |
| `save.c` | 963 | 1/33 |  | save.ts (formato propio) |
| `move_descriptions.c` | 714 | — |  | exportador (textos) |
| `mini_printf.c` | 355 | 0/8 |  | depuración de GBA |
| `m4a_tables.c` | 308 | — |  | exportador (audio) |
| `data.c` | 305 | — |  | exportador (data) |
| `load_save.c` | 298 | 5/21 | `script/specials.ts` | save.ts (formato propio) |
| `agb_flash.c` | 297 | 0/15 |  | save.ts (localStorage) |
| `isagbprn.c` | 265 | 0/16 |  | depuración de GBA |
| `malloc.c` | 224 | 3/12 |  | memoria de JS |
| `agb_flash_mx.c` | 197 | 0/5 |  | save.ts (localStorage) |
| `dma3_manager.c` | 182 | 0/5 |  | hw/ (copias directas) |
| `rom_header_gf.c` | 171 | — |  | cabecera de ROM |
| `agb_flash_1m.c` | 86 | 0/2 |  | save.ts (localStorage) |
| `text_window_graphics.c` | 65 | — |  | exportador (incbin) |
| `keyboard_text.c` | 64 | — |  | exportador (textos) |
| `agb_flash_le.c` | 31 | — |  | save.ts (localStorage) |
| `reset_save_heap.c` | 27 | 0/1 |  | save.ts |
| `decoration.c` | 7 | — |  | exportador |
| `tilesets.c` | 7 | — |  | exportador (tilesets) |

## Fuera de alcance

| Archivo C | Líneas | Funciones | TS que lo citan | Nota |
|---|---:|---:|---|---|
| `dodrio_berry_picking.c` | 4954 | 6/147 |  |  |
| `union_room.c` | 4761 | 6/110 | `script/specials.ts` |  |
| `pokemon_jump.c` | 4582 | 3/186 |  |  |
| `berry_crush.c` | 3488 | 4/73 |  |  |
| `link_rfu_2.c` | 3163 | 0/151 |  |  |
| `help_system.c` | 2480 | 7/41 |  |  |
| `librfu_rfu.c` | 2342 | 0/86 |  |  |
| `quest_log_events.c` | 2247 | 1/79 |  |  |
| `link.c` | 2202 | 2/114 |  |  |
| `quest_log.c` | 1767 | 2/88 |  |  |
| `battle_controller_link_opponent.c` | 1713 | 22/86 |  |  |
| `battle_controller_link_partner.c` | 1647 | 17/85 |  |  |
| `mystery_gift_menu.c` | 1609 | 0/32 |  |  |
| `union_room_chat.c` | 1571 | 0/51 |  |  |
| `AgbRfu_LinkManager.c` | 1480 | 0/33 |  |  |
| `union_room_chat_display.c` | 1339 | 0/57 |  |  |
| `link_rfu_3.c` | 1192 | 0/30 |  |  |
| `cable_club.c` | 1036 | 11/54 | `script/specials.ts`, `script/specialsExtra.ts` |  |
| `help_system_util.c` | 848 | 1/41 |  |  |
| `librfu_stwi.c` | 650 | 0/47 |  |  |
| `mystery_gift.c` | 634 | 1/45 |  |  |
| `union_room_player_avatar.c` | 624 | 1/38 |  |  |
| `union_room_message.c` | 576 | — |  |  |
| `battle_records.c` | 568 | 3/31 |  |  |
| `wireless_communication_status_screen.c` | 522 | 1/12 |  |  |
| `ereader_screen.c` | 520 | 0/11 |  |  |
| `mystery_gift_show_card.c` | 518 | 0/8 |  |  |
| `digit_obj_util.c` | 451 | 0/14 |  |  |
| `librfu_intr.c` | 417 | 0/9 |  |  |
| `multiboot.c` | 416 | 0/9 |  |  |
| `ereader_helpers.c` | 406 | 0/17 |  |  |
| `mystery_gift_show_news.c` | 404 | 0/10 |  |  |
| `union_room_chat_objects.c` | 346 | 0/13 |  |  |
| `minigame_countdown.c` | 332 | 0/10 |  |  |
| `mystery_event_script.c` | 322 | 0/25 |  |  |
| `mystery_gift_server.c` | 302 | 0/13 |  |  |
| `mystery_gift_client.c` | 300 | 0/18 |  |  |
| `sloopsvc.c` | 293 | — |  |  |
| `dodrio_berry_picking_comm.c` | 274 | 0/8 |  |  |
| `union_room_battle.c` | 238 | 0/5 |  |  |
| `mystery_gift_link.c` | 215 | 0/10 |  |  |
| `berry_fix_program.c` | 203 | 0/4 |  |  |
| `mystery_gift_scripts.c` | 198 | — |  |  |
| `quest_log_player.c` | 197 | 0/15 |  |  |
| `librfu_sio32id.c` | 170 | 0/4 |  |  |
| `wonder_news.c` | 154 | 1/9 |  |  |
| `quest_log_battle.c` | 150 | 0/3 |  |  |
| `quest_log_objects.c` | 146 | 0/3 |  |  |
| `help_message.c` | 106 | 1/7 | `partyMenu.ts` |  |
| `cereader_tool.c` | 97 | 1/8 | `script/specials.ts` |  |
| `mystery_event_msg.c` | 13 | — |  |  |
