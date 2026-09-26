# Inventario del port (generado)

Generado por `tools/portInventory.py` (`npm run inventory`); no editar a mano.
Mide cuántas funciones de cada `.c` existen con el mismo nombre en `src/fr`.
La comparación ignora mayúsculas y `_` (la capa de campo antigua usa camelCase).
La coincidencia de nombres no demuestra paridad funcional ni fidelidad.
Una `function` TS con cuerpo trivial (vacío, `return 0;`…) cuando el C tiene
código real cuenta como **stub** (columna Stubs) y no suma como portada.
Las categorías fuera/cubierto/adaptador salen de las tablas del script.

| Estado | Archivos | Líneas C | Funciones con nombre en TS |
|---|---:|---:|---:|
| Falta (sin funciones portadas) | 0 | 0 | 0/0 |
| Parcial (< 80 % de funciones) | 50 | 106738 | 1447/4926 |
| Adaptador (UI simplificada) | 1 | 1400 | 28/58 |
| Casi completo (≥ 80 % y < 100 %) | 41 | 60671 | 2129/2365 |
| Sin huecos de nombre (100 %; fidelidad no medida) | 109 | 78997 | 2485/2485 |
| Solo datos (exportados a cdata) | 1 | 53 | 0/0 |
| Cubierto por hw/navegador/exportador | 30 | 17415 | 40/192 |
| Fuera de alcance | 51 | 55183 | 103/1992 |
| **Pendiente de portar** | **92** | **168809** | |
| **Total en alcance** | **202** | **247859** | **6089/9834** |

## Parcial (< 80 % de funciones)

| Archivo C | Líneas | Funciones | TS que lo citan | Nota | Stubs |
|---|---:|---:|---|---|---:|
| `event_object_movement.c` | 9412 | 49/759 | `field/fieldEffects.ts`, `field/objectEvents.ts`, `menus/fieldMoveMenu.ts` … |  |  |
| `pokemon.c` | 6453 | 77/140 | `battle/ai.ts`, `battle/anim.ts`, `battle/battleSetup.ts` … |  |  |
| `party_menu.c` | 6342 | 284/357 | `battle/ext.ts`, `menus/fieldMenus.ts`, `menus/fieldMoveMenu.ts` … |  |  |
| `battle_main.c` | 4477 | 84/106 | `battle/globals.ts`, `battle/main.ts`, `battle/main_init.ts` … |  |  |
| `field_effect.c` | 4033 | 42/239 | `field/fieldControl.ts`, `field/fieldMoves.ts`, `namingScreen.ts` |  |  |
| `overworld.c` | 3563 | 73/242 | `battle/host.ts`, `field/fieldMoves.ts`, `field/overworld.ts` … |  |  |
| `battle_transition.c` | 3037 | 26/134 | `battle/transition.ts` |  |  |
| `trade.c` | 2958 | 0/66 | `pokemon/ingameTrade.ts` |  | 15 |
| `trade_scene.c` | 2916 | 36/53 | `pokemon/ingameTrade.ts`, `pokemon/mail.ts` |  | 3 |
| `intro.c` | 2805 | 17/79 | `introCopyright.ts`, `introGameFreak.ts`, `introScene1.ts` … |  |  |
| `pokemon_storage_system_tasks.c` | 2770 | 5/82 |  |  |  |
| `battle_controller_pokedude.c` | 2698 | 31/108 |  |  |  |
| `field_specials.c` | 2555 | 84/118 | `field/fieldMoves.ts`, `game.ts`, `menus/scriptMenu.ts` … |  |  |
| `naming_screen.c` | 2509 | 35/109 | `gba/input.ts`, `menus/namingModel.ts`, `namingScreen.ts` … |  |  |
| `easy_chat_3.c` | 2316 | 1/92 |  |  |  |
| `battle_controller_oak_old_man.c` | 2293 | 73/107 | `battle/controller_oak_old_man.ts` |  |  |
| `scrcmd.c` | 2264 | 5/224 | `field/messageBox.ts`, `script/commands.ts`, `script/eventObjectLock.ts` |  |  |
| `field_player_avatar.c` | 2168 | 34/176 | `field/fishing.ts`, `field/playerAvatar.ts`, `field/specialFieldAnim.ts` |  |  |
| `pokemon_storage_system_data.c` | 2165 | 5/83 | `pokemon/storage.ts` |  |  |
| `daycare.c` | 2155 | 42/93 | `game.ts`, `pokemon/daycare.ts`, `script/specials.ts` |  |  |
| `battle_ai_script_commands.c` | 1970 | 25/105 | `battle/ai.ts`, `battle/util.ts` |  |  |
| `trainer_card.c` | 1959 | 55/73 | `menus/trainerCard.ts` |  |  |
| `m4a.c` | 1781 | 5/72 | `audio/m4a.ts` |  |  |
| `battle_controller_opponent.c` | 1777 | 56/87 | `battle/controller_opponent.ts` |  |  |
| `fame_checker.c` | 1739 | 15/64 | `fameChecker.ts`, `menus/keyItemScreens.ts` |  | 7 |
| `evolution_scene.c` | 1704 | 14/23 | `battle/evoScene.ts`, `battle/ext.ts`, `evolutionScene.ts` … |  |  |
| `text.c` | 1695 | 10/37 | `battle/interface.ts`, `gba/font.ts`, `gba/textPrinter.ts` … |  |  |
| `pokemon_storage_system_graphics.c` | 1546 | 1/65 |  |  |  |
| `pokemon_storage_system_misc.c` | 1430 | 2/70 |  |  |  |
| `battle_tower.c` | 1425 | 17/45 | `script/specials.ts` |  |  |
| `field_effect_helpers.c` | 1421 | 17/76 | `field/fieldEffectHelpers.ts`, `field/fieldEffects.ts` |  | 59 |
| `easy_chat_2.c` | 1363 | 1/73 |  |  |  |
| `script_menu.c` | 1341 | 8/29 | `menus/scriptMenu.ts`, `script/specialsExtra.ts`, `seagallop.ts` |  |  |
| `vs_seeker.c` | 1326 | 16/41 | `battle/ext.ts`, `field/vsSeeker.ts` |  |  |
| `title_screen.c` | 1315 | 17/39 | `introTitle.ts` |  |  |
| `field_control_avatar.c` | 1182 | 21/49 | `field/fieldControl.ts` |  |  |
| `trainer_tower.c` | 1095 | 1/43 | `script/specials.ts` |  |  |
| `battle_setup.c` | 1070 | 36/66 | `battle/battleSetup.ts`, `battle/ext.ts`, `battle/host.ts` … |  |  |
| `berry.c` | 1028 | 1/9 | `script/specials.ts` |  |  |
| `start_menu.c` | 1016 | 18/65 | `game.ts` |  |  |
| `field_fadetransition.c` | 965 | 18/59 | `field/overworld.ts` |  |  |
| `fieldmap.c` | 951 | 11/54 | `field/fieldmap.ts` |  |  |
| `item_use.c` | 925 | 41/73 | `battle/ext.ts`, `menus/fieldMenus.ts`, `menus/fieldMoveMenu.ts` … |  |  |
| `wild_encounter.c` | 784 | 8/36 | `field/wildEncounter.ts`, `menu2.ts` |  |  |
| `mail.c` | 734 | 1/10 | `menus/mailView.ts`, `pokemon/mail.ts`, `pokemon/pokemon.ts` |  |  |
| `easy_chat.c` | 730 | 6/39 | `script/specials.ts` |  |  |
| `string_util.c` | 726 | 6/40 | `gba/charmap.ts` |  |  |
| `battle_controller_safari.c` | 669 | 14/72 | `battle/controller_safari.ts` |  |  |
| `itemfinder.c` | 658 | 2/24 | `menus/fieldMenus.ts` |  |  |
| `field_door.c` | 524 | 1/21 | `field/doors.ts` |  |  |

## Adaptador (UI simplificada)

| Archivo C | Líneas | Funciones | TS que lo citan | Nota | Stubs |
|---|---:|---:|---|---|---:|
| `teachy_tv.c` | 1400 | 28/58 | `menus/keyItemScreens.ts`, `teachyTv.ts` | menus/keyItemScreens.ts: lista de texto; teachyTv.ts no está conectado | 30 |

## Casi completo (≥ 80 % y < 100 %)

| Archivo C | Líneas | Funciones | TS que lo citan | Nota | Stubs |
|---|---:|---:|---|---|---:|
| `battle_script_commands.c` | 9886 | 281/284 | `battle/cmds/helpers.ts`, `battle/cmds/index.ts`, `battle/cmds/part1.ts` … |  |  |
| `pokemon_summary_screen.c` | 5224 | 111/137 | `pokemonSummaryScreen.ts`, `summaryScreen.ts` |  |  |
| `region_map.c` | 4036 | 129/140 | `regionMap.ts` |  |  |
| `battle_util.c` | 3252 | 35/37 | `battle/util.ts` |  |  |
| `battle_controller_player.c` | 2966 | 114/123 | `battle/controller_player.ts` |  |  |
| `item_menu.c` | 2397 | 99/116 | `bagMenu.ts`, `battle/ext.ts`, `menus/hardwareChoice.ts` |  |  |
| `battle_anim_mons.c` | 2360 | 126/128 | `battle/anim.ts`, `battle/anims/fight.ts`, `battle/anims/mons.ts` |  |  |
| `field_weather_effects.c` | 2346 | 87/93 | `field/weather.ts`, `field/weatherEffects.ts`, `script/specials.ts` |  | 6 |
| `battle_interface.c` | 2240 | 46/52 | `battle/interface.ts`, `battle/util.ts` |  |  |
| `sprite.c` | 1745 | 86/103 | `gba/sprite.ts`, `hw/sprite.ts` |  |  |
| `tm_case.c` | 1737 | 67/73 | `menus/fieldMenus.ts`, `tmCase.ts` |  |  |
| `berry_pouch.c` | 1529 | 66/77 | `berryPouch.ts`, `menus/fieldMenus.ts` |  |  |
| `pokeball.c` | 1334 | 34/37 | `battle/pokeball.ts` |  |  |
| `pokemon_icon.c` | 1283 | 22/23 | `battle/ext.ts`, `pokemonIcon.ts` |  |  |
| `bg.c` | 1215 | 43/50 | `hw/bg.ts` |  | 1 |
| `battle_controllers.c` | 1214 | 61/68 | `battle/controllers.ts` |  |  |
| `item_pc.c` | 1145 | 57/59 | `itemPc.ts`, `menus/hardwareChoice.ts`, `menus/playerPc.ts` |  |  |
| `shop.c` | 1145 | 55/60 | `buyMenuHelpers.ts`, `shop.ts` |  | 1 |
| `battle_bg.c` | 1111 | 15/17 | `battle/bg.ts` |  |  |
| `battle_gfx_sfx_util.c` | 1061 | 40/48 | `battle/bg.ts`, `battle/gfx_sfx_util.ts` |  |  |
| `metatile_behavior.c` | 1039 | 97/115 |  |  |  |
| `palette.c` | 994 | 34/41 | `hw/palette.ts` |  |  |
| `new_menu_helpers.c` | 761 | 50/54 | `gba/font.ts`, `hw/menu.ts`, `hw/menuHelpers.ts` … |  |  |
| `trainer_see.c` | 750 | 32/37 | `field/fieldEffects.ts`, `field/trainerSee.ts` |  |  |
| `item.c` | 680 | 46/49 | `hw/menuHelpers.ts`, `pokemon/items.ts`, `script/specials.ts` … |  |  |
| `menu2.c` | 671 | 9/10 | `hw/menu.ts`, `menu2.ts` |  |  |
| `menu_indicators.c` | 656 | 18/20 | `hw/listMenu.ts`, `menus/fieldListMenu.ts`, `menus/hardwareChoice.ts` |  |  |
| `sound.c` | 649 | 40/48 | `audio/m4a.ts`, `audio/sound.ts`, `battle/animScript.ts` … |  | 1 |
| `evolution_graphics.c` | 637 | 30/37 | `evolutionScene.ts` |  |  |
| `mon_markings.c` | 605 | 14/15 | `monMarkings.ts` |  |  |
| `script.c` | 583 | 48/55 | `field/fieldControl.ts`, `script/context.ts` |  |  |
| `window.c` | 513 | 19/21 | `gba/window.ts`, `hw/window.ts` |  |  |
| `main.c` | 494 | 23/28 | `audio/sound.ts`, `game.ts`, `gba/input.ts` … |  |  |
| `battle_intro.c` | 492 | 9/10 | `battle/intro.ts` |  |  |
| `fldeff_flash.c` | 479 | 19/22 | `field/overworld.ts`, `mapPreviewScreen.ts`, `menus/fieldMoveMenu.ts` |  |  |
| `item_menu_icons.c` | 439 | 14/17 | `bagMenu.ts` |  |  |
| `field_tasks.c` | 351 | 10/12 | `field/fieldTasks.ts`, `script/specialsExtra.ts` |  |  |
| `menu_helpers.c` | 243 | 15/17 | `hw/menuHelpers.ts` |  | 1 |
| `mail_data.c` | 187 | 11/12 | `pokemon/mail.ts` |  |  |
| `event_object_lock.c` | 114 | 9/11 | `script/eventObjectLock.ts` |  |  |
| `party_menu_specials.c` | 108 | 8/9 | `game.ts`, `script/specialsExtra.ts` |  |  |

## Sin huecos de nombre (100 %; fidelidad no medida)

| Archivo C | Líneas | Funciones | TS que lo citan | Nota | Stubs |
|---|---:|---:|---|---|---:|
| `battle_anim_effects_1.c` | 5677 | 154/154 | `battle/anims/effects1.ts` |  |  |
| `battle_anim_effects_3.c` | 5430 | 140/140 | `battle/anims/effects3.ts` |  |  |
| `image_processing_effects.c` | 4436 | 38/38 | `imageProcessingEffects.ts` |  |  |
| `battle_anim_effects_2.c` | 3865 | 121/121 | `battle/anims/effects2.ts` |  |  |
| `pokedex_screen.c` | 3452 | 66/66 | `pokedexScreen.ts`, `pokemon/mon_extra.ts` |  |  |
| `battle_message.c` | 2855 | 10/10 | `battle/message.ts` |  |  |
| `slot_machine.c` | 2527 | 77/77 | `game/slots.ts`, `menus/slotMachine.ts` |  |  |
| `battle_anim_special.c` | 2304 | 81/81 | `battle/anims/special.ts`, `battle/gfx_sfx_util.ts`, `battle/interface.ts` … |  |  |
| `oak_speech.c` | 2186 | 64/64 | `oakSpeech.ts`, `startup.ts` |  |  |
| `battle_anim.c` | 1725 | 77/77 | `battle/anim.ts`, `battle/animArgs.ts`, `battle/animScript.ts` … |  |  |
| `battle_anim_water.c` | 1591 | 48/48 | `battle/anims/water.ts` |  |  |
| `pokemon_special_anim_scene.c` | 1563 | 67/67 | `battle/anim.ts`, `menu2.ts`, `pokemonSpecialAnim.ts` |  |  |
| `battle_anim_ghost.c` | 1484 | 41/41 | `battle/anims/ghost.ts` |  |  |
| `battle_anim_ice.c` | 1474 | 32/32 | `battle/anims/ice.ts` |  |  |
| `credits.c` | 1446 | 16/16 | `credits.ts` |  |  |
| `battle_anim_flying.c` | 1289 | 33/33 | `battle/anims/flying.ts` |  |  |
| `battle_anim_fire.c` | 1286 | 35/35 | `battle/anims/fire.ts` |  |  |
| `hall_of_fame.c` | 1286 | 42/42 | `hallOfFame.ts`, `postBattleEventFuncs.ts` |  |  |
| `battle_anim_electric.c` | 1280 | 37/37 | `battle/anims/electric.ts` |  |  |
| `field_weather.c` | 1147 | 50/50 | `field/weather.ts`, `gba/fade.ts` |  |  |
| `battle_anim_psychic.c` | 1090 | 26/26 | `battle/anims/psychic.ts` |  |  |
| `battle_anim_normal.c` | 997 | 36/36 | `battle/anims/normal.ts` |  |  |
| `battle_anim_utility_funcs.c` | 970 | 42/42 | `battle/anims/utilityFuncs.ts` |  |  |
| `battle_anim_fight.c` | 969 | 31/31 | `battle/anims/fight.ts` |  |  |
| `battle_anim_mon_movement.c` | 941 | 34/34 | `battle/anims/monMovement.ts` |  |  |
| `learn_move.c` | 932 | 23/23 | `game.ts`, `menus/hardwareChoice.ts`, `menus/moveRelearner.ts` |  |  |
| `battle_anim_dark.c` | 923 | 25/25 | `battle/anims/dark.ts` |  |  |
| `menu.c` | 872 | 49/49 | `gba/window.ts`, `hw/menu.ts`, `hw/menuHelpers.ts` … |  |  |
| `battle_anim_rock.c` | 822 | 22/22 | `battle/anims/rock.ts` |  |  |
| `main_menu.c` | 788 | 29/29 | `mainMenu.ts` |  |  |
| `list_menu.c` | 758 | 31/31 | `hw/listMenu.ts`, `menus/fieldListMenu.ts`, `menus/hardwareChoice.ts` |  |  |
| `battle_anim_ground.c` | 752 | 25/25 | `battle/anims/ground.ts` |  |  |
| `player_pc.c` | 740 | 47/47 | `menus/playerPc.ts`, `playerPcMailbox.ts`, `pokemon/mail.ts` |  |  |
| `pokemon_special_anim.c` | 709 | 31/31 | `partyMenu.ts`, `pokemonSpecialAnim.ts` |  |  |
| `battle_ai_switch_items.c` | 674 | 13/13 | `battle/ai.ts` |  |  |
| `pokemon_storage_system_menu.c` | 660 | 29/29 | `menus/storageMenu.ts`, `pokemon/storage.ts` |  |  |
| `map_preview_screen.c` | 616 | 14/14 | `mapPreviewScreen.ts` |  |  |
| `renewable_hidden_items.c` | 608 | 4/4 | `renewableHiddenItems.ts` |  |  |
| `option_menu.c` | 575 | 19/19 | `optionMenu.ts` |  |  |
| `trig.c` | 542 | 4/4 | `hw/trig.ts` |  |  |
| `battle_anim_status_effects.c` | 535 | 12/12 | `battle/anim.ts`, `battle/anims/statusEffects.ts` |  |  |
| `seagallop.c` | 504 | 22/22 | `seagallop.ts` |  |  |
| `palette_util.c` | 474 | 17/17 | `paletteUtil.ts` |  |  |
| `battle_anim_bug.c` | 462 | 13/13 | `battle/anims/bug.ts` |  |  |
| `field_screen_effect.c` | 462 | 19/19 | `field/fieldEffects.ts`, `field/overworld.ts`, `script/specials.ts` |  |  |
| `battle_anim_dragon.c` | 434 | 11/11 | `battle/anims/dragon.ts` |  |  |
| `bike.c` | 418 | 24/24 | `field/playerAvatar.ts` |  |  |
| `decompress.c` | 352 | 18/18 | `decompress.ts`, `pokemon/pics.ts` |  |  |
| `trainer_fan_club.c` | 347 | 23/23 | `script/specialsExtra.ts` |  |  |
| `special_field_anim.c` | 341 | 10/10 | `field/fieldControl.ts`, `field/specialFieldAnim.ts`, `script/specialsExtra.ts` |  |  |
| `event_data.c` | 336 | 26/26 | `save.ts` |  |  |
| `battle_anim_sound_tasks.c` | 332 | 15/15 | `battle/anims/soundTasks.ts` |  |  |
| `tileset_anims.c` | 332 | 28/28 | `field/tileRenderer.ts` |  |  |
| `text_printer.c` | 326 | 15/15 | `boot.ts`, `gba/font.ts`, `gba/textPrinter.ts` … |  |  |
| `wild_pokemon_area.c` | 317 | 7/7 | `pokedexArea.ts` |  |  |
| `reshow_battle_screen.c` | 314 | 7/7 | `battle/bg.ts`, `battle/reshow.ts` |  |  |
| `bag.c` | 312 | 13/13 | `bagMenu.ts` |  |  |
| `battle_anim_poison.c` | 298 | 9/9 | `battle/anims/poison.ts` |  |  |
| `fldeff_cut.c` | 295 | 13/13 | `field/fieldMoves.ts` |  |  |
| `trainer_pokemon_sprites.c` | 286 | 22/22 | `trainerPokemonSprites.ts` |  |  |
| `util.c` | 276 | 10/10 | `util.ts` |  |  |
| `diploma.c` | 275 | 10/10 | `diploma.ts` |  |  |
| `pokedex_area_markers.c` | 274 | 5/5 | `pokedexArea.ts` |  |  |
| `roamer.c` | 264 | 13/13 | `pokemon/roamer.ts` |  |  |
| `scanline_effect.c` | 261 | 9/9 | `hw/scanline.ts` |  |  |
| `tilemap_util.c` | 238 | 11/11 | `hw/tilemapUtil.ts` |  |  |
| `map_name_popup.c` | 231 | 7/7 | `field/mapNamePopup.ts` |  |  |
| `script_movement.c` | 226 | 19/19 | `script/movement.ts` |  |  |
| `pokemon_size_record.c` | 217 | 13/13 | `game.ts`, `script/specialsExtra.ts` |  |  |
| `script_pokemon_util.c` | 215 | 13/13 | `game.ts`, `pokemon/daycare.ts`, `pokemon/scriptPokemonUtil.ts` … |  |  |
| `blit.c` | 212 | 5/5 | `hw/window.ts` |  |  |
| `braille_text.c` | 212 | 3/3 | `boot.ts`, `gba/font.ts`, `gba/textPrinter.ts` |  |  |
| `task.c` | 211 | 14/14 | `gba/tasks.ts`, `hw/menuHelpers.ts` |  |  |
| `clear_save_data_screen.c` | 208 | 8/8 | `clearSaveScreen.ts` |  |  |
| `buy_menu_helpers.c` | 205 | 7/7 | `buyMenuHelpers.ts` |  |  |
| `ss_anne.c` | 200 | 8/8 | `script/specialsExtra.ts` |  |  |
| `battle_anim_smokescreen.c` | 197 | 3/3 | `battle/anims/smokescreen.ts` |  |  |
| `pc_screen_effect.c` | 179 | 7/7 | `pcScreenEffect.ts` |  |  |
| `text_window.c` | 177 | 19/19 | `battle/bg.ts`, `hw/menu.ts`, `hw/menuHelpers.ts` |  |  |
| `pokemon_storage_system.c` | 171 | 21/21 | `pokemon/storage.ts` |  |  |
| `new_game.c` | 160 | 11/11 | `game.ts`, `random.ts`, `save.ts` |  |  |
| `gpu_regs.c` | 158 | 11/11 | `hw/gpu.ts` |  |  |
| `pokedex.c` | 148 | 8/8 | `battle/ext.ts`, `pokemon/pokemon.ts` |  |  |
| `field_message_box.c` | 142 | 14/14 | `field/messageBox.ts` |  |  |
| `mailbox_pc.c` | 140 | 9/9 | `mailboxPc.ts`, `menus/playerPc.ts`, `playerPcMailbox.ts` … |  |  |
| `dynamic_placeholder_text_util.c` | 137 | 5/5 | `dynamicPlaceholderTextUtil.ts` |  |  |
| `fldeff_rocksmash.c` | 137 | 10/10 | `field/fieldMoves.ts`, `menus/fieldMoveMenu.ts` |  |  |
| `money.c` | 136 | 13/13 | `hw/menuHelpers.ts`, `pokemon/items.ts` |  |  |
| `berry_powder.c` | 133 | 14/14 | `script/specialsExtra.ts` |  |  |
| `heal_location.c` | 122 | 5/5 | `field/overworld.ts` |  |  |
| `field_poison.c` | 119 | 7/7 | `field/poison.ts` |  |  |
| `save_location.c` | 112 | 10/10 | `pokemon/saveLocation.ts` |  |  |
| `prof_pc.c` | 109 | 3/3 | `game.ts` |  |  |
| `battle_util2.c` | 108 | 3/3 | `battle/anim.ts`, `battle/globals.ts`, `pokemon/mon_extra.ts` |  |  |
| `fldeff_softboiled.c` | 108 | 8/8 | `menus/fieldMoveMenu.ts`, `partyMenu.ts` |  |  |
| `field_weather_util.c` | 105 | 10/10 | `field/weather.ts` |  |  |
| `fldeff_sweetscent.c` | 100 | 7/7 | `field/fieldMoves.ts`, `menus/fieldMoveMenu.ts` |  |  |
| `coins.c` | 98 | 9/9 | `hw/menuHelpers.ts`, `pokemon/items.ts` |  |  |
| `math_util.c` | 87 | 9/9 | `mathUtil.ts` |  |  |
| `safari_zone.c` | 79 | 8/8 | `battle/battleSetup.ts`, `field/safariZone.ts` |  |  |
| `post_battle_event_funcs.c` | 74 | 2/2 | `hallOfFame.ts`, `postBattleEventFuncs.ts` |  |  |
| `play_time.c` | 65 | 5/5 | `save.ts` |  |  |
| `save_menu_util.c` | 56 | 1/1 | `game.ts`, `saveMenuUtil.ts` |  |  |
| `coord_event_weather.c` | 49 | 1/1 | `field/coordEventWeather.ts` |  |  |
| `blend_palette.c` | 46 | 2/2 | `hw/palette.ts` |  |  |
| `fldeff_poison.c` | 42 | 3/3 | `field/fieldEffects.ts` |  |  |
| `cable_car_util.c` | 38 | 2/2 | `cableCarUtil.ts` |  |  |
| `random.c` | 18 | 2/2 | `random.ts` |  |  |
| `fldeff_berrytree.c` | 4 | 1/1 | `script/specials.ts` |  |  |

## Solo datos (exportados a cdata)

| Archivo C | Líneas | Funciones | TS que lo citan | Nota | Stubs |
|---|---:|---:|---|---|---:|
| `bg_regs.c` | 53 | — | `hw/bgRegs.ts` |  |  |

## Cubierto por hw/navegador/exportador

| Archivo C | Líneas | Funciones | TS que lo citan | Nota | Stubs |
|---|---:|---:|---|---|---:|
| `trainer_tower_sets.c` | 8997 | — |  | exportador (cdata) |  |
| `graphics.c` | 1380 | — |  | exportador (incbin) |  |
| `strings.c` | 1335 | — | `oakSpeech.ts` | exportador (textos) |  |
| `save.c` | 963 | 3/33 |  | save.ts (formato propio) |  |
| `move_descriptions.c` | 714 | — |  | exportador (textos) |  |
| `field_camera.c` | 572 | 12/29 | `field/overworld.ts`, `overworldCredits.ts` | field/overworld.ts + fieldmap.ts + tileRenderer.ts + doors.ts + battle/transition.ts: el seguimiento/paneo del jugador está conectado; el viewport Canvas recompone los metatiles desde FieldMap y omite el ring buffer BG/VRAM, doors.ts dibuja el overlay y las transiciones usan una captura de pantalla. Cámara de créditos en overworldCredits.ts; MoveCameraAndRedrawMap está unused en C |  |
| `mini_printf.c` | 355 | 0/8 |  | depuración de GBA |  |
| `m4a_tables.c` | 308 | — |  | exportador (audio) |  |
| `data.c` | 305 | — |  | exportador (data) |  |
| `load_save.c` | 298 | 5/21 | `script/specials.ts` | save.ts (formato propio) |  |
| `agb_flash.c` | 297 | 0/15 |  | save.ts (localStorage) |  |
| `isagbprn.c` | 265 | 0/16 |  | depuración de GBA |  |
| `save_failed_screen.c` | 228 | 0/14 |  | game.ts/save.ts: el error de localStorage ya muestra el texto de guardado fallido; reparación física de sectores Flash no aplica al navegador |  |
| `malloc.c` | 224 | 3/12 |  | memoria de JS |  |
| `agb_flash_mx.c` | 197 | 0/5 |  | save.ts (localStorage) |  |
| `dma3_manager.c` | 182 | 1/5 |  | hw/ (copias directas) |  |
| `rom_header_gf.c` | 171 | — |  | cabecera de ROM |  |
| `window_8bpp.c` | 127 | 6/7 | `hw/window.ts` | hw/window.ts: API 8bpp implementada; nullsub_9 es un no-op del C reemplazado por UnsetBgTilemapBuffer |  |
| `agb_flash_1m.c` | 86 | 0/2 |  | save.ts (localStorage) |  |
| `text_window_graphics.c` | 65 | 1/1 |  | exportador (incbin) |  |
| `keyboard_text.c` | 64 | — |  | exportador (textos) |  |
| `hof_pc.c` | 50 | 2/5 | `hallOfFame.ts` | hallOfFame.ts: entrada del HOF PC, consulta de equipos y retorno al menú PC |  |
| `fldeff_dig.c` | 46 | 2/4 | `field/fieldMoves.ts`, `menus/fieldMoveMenu.ts` | fieldMoveMenu.ts + field/fieldMoves.ts + field/overworld.ts: CanUseEscapeRopeOnCurrMap, setup, animación ShowMon, transición a pie y escape/warp están conectados |  |
| `fldeff_strength.c` | 46 | 2/4 | `field/fieldMoves.ts`, `menus/fieldMoveMenu.ts` | fieldMoveMenu.ts + field/fieldMoves.ts: requisito de roca/pie, slot de selección, script, nickname, ShowMon y reanudación están conectados |  |
| `fldeff_teleport.c` | 41 | 2/4 | `field/fieldMoves.ts`, `menus/fieldMoveMenu.ts` | fieldMoveMenu.ts + field/fieldMoves.ts + field/overworld.ts: gate, selección/animación, callbacks y warp están conectados; CameraObjectReset2 no aplica al campo web 2D |  |
| `agb_flash_le.c` | 31 | — |  | save.ts (localStorage) |  |
| `field_special_scene.c` | 27 | 1/6 | `script/specials.ts` | field_special_scene.c: las dos escenas públicas y los cuatro callbacks/dummies tienen cuerpo vacío en el decomp; no hay lógica que portar |  |
| `reset_save_heap.c` | 27 | 0/1 |  | save.ts |  |
| `decoration.c` | 7 | — |  | exportador |  |
| `tilesets.c` | 7 | — |  | exportador (tilesets) |  |

## Fuera de alcance

| Archivo C | Líneas | Funciones | TS que lo citan | Nota | Stubs |
|---|---:|---:|---|---|---:|
| `dodrio_berry_picking.c` | 4954 | 7/147 |  |  |  |
| `union_room.c` | 4761 | 7/110 | `script/specials.ts` |  |  |
| `pokemon_jump.c` | 4582 | 4/186 |  |  |  |
| `berry_crush.c` | 3488 | 4/73 |  |  |  |
| `link_rfu_2.c` | 3163 | 0/149 |  |  |  |
| `help_system.c` | 2480 | 7/41 |  |  |  |
| `librfu_rfu.c` | 2342 | 0/86 |  |  |  |
| `quest_log_events.c` | 2247 | 2/118 |  |  | 1 |
| `link.c` | 2202 | 2/114 |  |  |  |
| `quest_log.c` | 1767 | 5/88 | `field/trainerSee.ts` |  |  |
| `battle_controller_link_opponent.c` | 1713 | 22/86 |  |  |  |
| `battle_controller_link_partner.c` | 1647 | 17/85 |  |  |  |
| `mystery_gift_menu.c` | 1609 | 0/34 |  |  |  |
| `union_room_chat.c` | 1571 | 0/51 |  |  |  |
| `AgbRfu_LinkManager.c` | 1480 | 0/33 |  |  |  |
| `union_room_chat_display.c` | 1339 | 0/58 |  |  |  |
| `link_rfu_3.c` | 1192 | 0/30 |  |  |  |
| `cable_club.c` | 1036 | 11/54 | `script/specials.ts`, `script/specialsExtra.ts` |  |  |
| `help_system_util.c` | 848 | 1/41 |  |  |  |
| `librfu_stwi.c` | 650 | 0/48 |  |  |  |
| `mystery_gift.c` | 634 | 1/45 |  |  |  |
| `union_room_player_avatar.c` | 624 | 1/38 |  |  |  |
| `union_room_message.c` | 576 | — |  |  |  |
| `battle_records.c` | 568 | 4/31 |  |  |  |
| `wireless_communication_status_screen.c` | 522 | 1/12 |  |  |  |
| `ereader_screen.c` | 520 | 0/11 |  |  |  |
| `mystery_gift_show_card.c` | 518 | 0/8 |  |  |  |
| `digit_obj_util.c` | 451 | 0/14 |  |  |  |
| `librfu_intr.c` | 417 | 0/9 |  |  |  |
| `multiboot.c` | 416 | 0/9 |  |  |  |
| `ereader_helpers.c` | 406 | 0/17 |  |  |  |
| `mystery_gift_show_news.c` | 404 | 0/10 |  |  |  |
| `union_room_chat_objects.c` | 346 | 0/13 |  |  |  |
| `minigame_countdown.c` | 332 | 0/10 |  |  |  |
| `mystery_event_script.c` | 322 | 1/25 | `script/specialsExtra.ts` |  |  |
| `mystery_gift_server.c` | 302 | 0/14 |  |  |  |
| `mystery_gift_client.c` | 300 | 0/18 |  |  |  |
| `sloopsvc.c` | 293 | — |  |  |  |
| `dodrio_berry_picking_comm.c` | 274 | 0/8 |  |  |  |
| `union_room_battle.c` | 238 | 0/5 |  |  |  |
| `mystery_gift_link.c` | 215 | 0/10 |  |  |  |
| `berry_fix_program.c` | 203 | 0/4 |  |  |  |
| `mystery_gift_scripts.c` | 198 | — |  |  |  |
| `quest_log_player.c` | 197 | 0/15 |  |  |  |
| `librfu_sio32id.c` | 170 | 0/4 |  |  |  |
| `wonder_news.c` | 154 | 1/9 |  |  |  |
| `quest_log_battle.c` | 150 | 0/3 |  |  |  |
| `quest_log_objects.c` | 146 | 0/3 |  |  |  |
| `help_message.c` | 106 | 4/7 | `boot.ts`, `game.ts`, `menus/helpMessage.ts` … |  |  |
| `cereader_tool.c` | 97 | 1/8 | `script/specials.ts` |  |  |
| `mystery_event_msg.c` | 13 | — |  |  |  |
