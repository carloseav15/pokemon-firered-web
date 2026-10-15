# Consumidores de la categoría y de Hada (generado)

Generado por `unified-world/extract_split_consumers.py`; no editar a mano. Un *sitio* es una línea que decide la
categoría a partir del tipo del movimiento (`IS_TYPE_*` o una comparación con `TYPE_MYSTERY`) o a partir de la
categoría propia del movimiento (`IS_MOVE_*`). La función contenedora es una búsqueda heurística hacia atrás.

| Fuente | Usos de `IS_TYPE_*` | Usos de `IS_MOVE_*` | Comparaciones `<`/`>` con `TYPE_MYSTERY` (categoría) | Archivos | Líneas con `TYPE_FAIRY` (archivos) | Líneas con `optionStyle` |
|---|--:|--:|--:|--:|---|--:|
| firered | 6 | 0 | 0 | 2 | 0 (0) | 0 |
| emerald | 8 | 0 | 0 | 3 | 0 (0) | 0 |
| hns | 8 | 10 | 0 | 4 | 94 (14) | 65 |
| ts | 3 | 0 | 3 | 2 | 0 (0) | 0 |

## firered

| Archivo:línea | Función | Código |
|---|---|---|
| `include/battle.h:475` | ? (definición) | `#define IS_TYPE_PHYSICAL(moveType)(moveType < TYPE_MYSTERY)` |
| `include/battle.h:476` | ? (definición) | `#define IS_TYPE_SPECIAL(moveType)(moveType > TYPE_MYSTERY)` |
| `src/battle_script_commands.c:1073` | Cmd_accuracycheck | `if (gBattleMons[gBattlerAttacker].ability == ABILITY_HUSTLE && IS_TYPE_PHYSICAL(type))` |
| `src/battle_script_commands.c:1825` | Cmd_datahpupdate | `if (IS_TYPE_PHYSICAL(moveType) && !(gHitMarker & HITMARKER_PASSIVE_DAMAGE) && gCurrentMove != MOVE_PAIN_SPLIT)` |
| `src/battle_script_commands.c:1840` | Cmd_datahpupdate | `else if (!IS_TYPE_PHYSICAL(moveType) && !(gHitMarker & HITMARKER_PASSIVE_DAMAGE))` |
| `src/battle_script_commands.c:7021` | Cmd_tryconversiontypechange (no decide categoría) | `if (moveType == TYPE_MYSTERY)` |
| `src/battle_script_commands.c:7047` | Cmd_tryconversiontypechange (no decide categoría) | `if (moveType == TYPE_MYSTERY)` |
| `src/battle_script_commands.c:8525` | Cmd_hiddenpowercalc (no decide categoría) | `if (gBattleStruct->dynamicMoveType >= TYPE_MYSTERY)` |
| `src/pokemon.c:2455` | CalculateBaseDamage | `if (IS_TYPE_PHYSICAL(type))` |
| `src/pokemon.c:2509` | CalculateBaseDamage | `if (IS_TYPE_PHYSICAL(type))` |
| `src/pokemon.c:2561` | CalculateBaseDamage (no decide categoría) | `if (type == TYPE_MYSTERY)` |
| `src/pokemon.c:2564` | CalculateBaseDamage | `if (IS_TYPE_SPECIAL(type))` |

## ts

| Archivo:línea | Función | Código |
|---|---|---|
| `src/core/battle/cmds/part1.ts:255` | Cmd_accuracycheck | `if (gBattleMons[G.gBattlerAttacker].ability === C.ABILITY_HUSTLE && IS_TYPE_PHYSICAL(type)) calc = div(calc * 80, 100) & 0xffff;` |
| `src/core/battle/cmds/part1.ts:696` | Cmd_datahpupdate | `if (IS_TYPE_PHYSICAL(moveType) && !(G.gHitMarker & C.HITMARKER_PASSIVE_DAMAGE) && G.gCurrentMove !== C.MOVE_PAIN_SPLIT) {` |
| `src/core/battle/cmds/part1.ts:702` | Cmd_datahpupdate | `} else if (!IS_TYPE_PHYSICAL(moveType) && !(G.gHitMarker & C.HITMARKER_PASSIVE_DAMAGE)) {` |
| `src/core/battle/cmds/part3.ts:1127` | Cmd_tryconversiontypechange (no decide categoría) | `if (t === C.TYPE_MYSTERY) t = IS_BATTLER_OF_TYPE(a, C.TYPE_GHOST) ? C.TYPE_GHOST : C.TYPE_NORMAL;` |
| `src/core/battle/cmds/part4.ts:433` | Cmd_hiddenpowercalc (no decide categoría) | `if (type >= C.TYPE_MYSTERY) type++;` |
| `src/core/battle/damage.ts:59` | CalculateBaseDamage | `if (type < C.TYPE_MYSTERY) attack = u16(div(attack * (attackerHoldEffectParam + 100), 100));` |
| `src/core/battle/damage.ts:98` | CalculateBaseDamage | `if (type < C.TYPE_MYSTERY) {` |
| `src/core/battle/damage.ts:113` | CalculateBaseDamage (no decide categoría) | `if (type === C.TYPE_MYSTERY) damage = 0;` |
| `src/core/battle/damage.ts:115` | CalculateBaseDamage | `if (type > C.TYPE_MYSTERY) {` |

## hns

| Archivo:línea | Función | Código |
|---|---|---|
| `include/battle.h:467` | ? (definición) | `#define IS_MOVE_PHYSICAL(move)(gBattleMoves[move].category == MOVE_CATEGORY_PHYSICAL)` |
| `include/battle.h:468` | ? (definición) | `#define IS_MOVE_SPECIAL(move)(gBattleMoves[move].category == MOVE_CATEGORY_SPECIAL)` |
| `include/battle.h:469` | ? (definición) | `#define IS_MOVE_STATUS(move)(gBattleMoves[move].category == MOVE_CATEGORY_STATUS)` |
| `include/battle.h:476` | ? (definición) | `#define IS_TYPE_PHYSICAL(t) ( ((t) < TYPE_MYSTERY && (t) != TYPE_GHOST) // (t) == TYPE_DARK )` |
| `include/battle.h:477` | ? (definición) | `#define IS_TYPE_SPECIAL(t) ( ((t) > TYPE_MYSTERY && (t) != TYPE_DARK)  // (t) == TYPE_GHOST )` |
| `src/battle_controller_player.c:1734` | TypeEffectiveness | `if (IS_MOVE_STATUS(move) == TRUE && gBattleMoves[move].type != (TYPE_ELECTRIC / TYPE_GROUND))` |
| `src/battle_controller_player.c:1738` | TypeEffectiveness | `else if (IS_MOVE_STATUS(move) == TRUE && gBattleMoves[move].type == TYPE_ELECTRIC)` |
| `src/battle_controller_player.c:1749` | TypeEffectiveness | `else if (IS_MOVE_STATUS(move) == TRUE && gBattleMoves[move].type == TYPE_GROUND)` |
| `src/battle_controller_player.c:1801` | MoveSelectionDisplayMoveTypeDoubles (no decide categoría) | `if (type == TYPE_MYSTERY)` |
| `src/battle_controller_player.c:1837` | MoveSelectionDisplayMoveType (no decide categoría) | `if (type == TYPE_MYSTERY)` |
| `src/battle_script_commands.c:1201` | Cmd_accuracycheck | `if (gBattleMons[gBattlerAttacker].ability == ABILITY_HUSTLE && IS_TYPE_PHYSICAL(type))` |
| `src/battle_script_commands.c:1204` | Cmd_accuracycheck | `if (gBattleMons[gBattlerAttacker].ability == ABILITY_HUSTLE && IS_MOVE_PHYSICAL(move))` |
| `src/battle_script_commands.c:1583` | getHiddenPowerType (no decide categoría) | `if (type == TYPE_MYSTERY)` |
| `src/battle_script_commands.c:1600` | getHiddenPowerType2 (no decide categoría) | `if (type == TYPE_MYSTERY)` |
| `src/battle_script_commands.c:2420` | Cmd_datahpupdate | `if (IS_MOVE_PHYSICAL(gCurrentMove) && !(gHitMarker & HITMARKER_PASSIVE_DAMAGE) && gCurrentMove != MOVE_PAIN_SPLIT)` |
| `src/battle_script_commands.c:2435` | Cmd_datahpupdate | `else if (IS_MOVE_SPECIAL(gCurrentMove) && !(gHitMarker & HITMARKER_PASSIVE_DAMAGE))` |
| `src/battle_script_commands.c:2451` | Cmd_datahpupdate | `if (IS_TYPE_PHYSICAL(moveType) && !(gHitMarker & HITMARKER_PASSIVE_DAMAGE) && gCurrentMove != MOVE_PAIN_SPLIT)` |
| `src/battle_script_commands.c:2466` | Cmd_datahpupdate | `else if (!IS_TYPE_PHYSICAL(moveType) && !(gHitMarker & HITMARKER_PASSIVE_DAMAGE))` |
| `src/battle_script_commands.c:8191` | Cmd_tryconversiontypechange (no decide categoría) | `if (moveType == TYPE_MYSTERY)` |
| `src/battle_script_commands.c:8217` | Cmd_tryconversiontypechange (no decide categoría) | `if (moveType == TYPE_MYSTERY)` |
| `src/battle_script_commands.c:9729` | Cmd_hiddenpowercalc (no decide categoría) | `if (gBattleStruct->dynamicMoveType == TYPE_MYSTERY)` |
| `src/battle_tv.c:1251` | AddMovePoints | `if (IS_MOVE_PHYSICAL(gCurrentMove) && power != 0 && tvPtr->side[defSide].reflectMonId != 0)` |
| `src/battle_tv.c:1258` | AddMovePoints | `if (IS_TYPE_PHYSICAL(type) && power != 0 && tvPtr->side[defSide].reflectMonId != 0)` |
| `src/battle_tv.c:1267` | AddMovePoints | `if (IS_MOVE_SPECIAL(gCurrentMove) && power != 0 && tvPtr->side[defSide].lightScreenMonId != 0)` |
| `src/battle_tv.c:1274` | AddMovePoints | `if (!IS_TYPE_PHYSICAL(type) && power != 0 && tvPtr->side[defSide].lightScreenMonId != 0)` |
| `src/pokemon.c:6360` | CalculateBaseDamage | `if (IS_TYPE_PHYSICAL(type))` |
| `src/pokemon.c:6705` | CalculateBaseDamage | `if (IS_MOVE_PHYSICAL(gCurrentMove))` |
| `src/pokemon.c:6757` | CalculateBaseDamage | `if (IS_TYPE_PHYSICAL(type))` |
| `src/pokemon.c:6809` | CalculateBaseDamage (no decide categoría) | `if (type == TYPE_MYSTERY)` |
| `src/pokemon.c:6813` | CalculateBaseDamage | `if (IS_MOVE_SPECIAL(gCurrentMove))` |
| `src/pokemon.c:6858` | CalculateBaseDamage | `if (IS_TYPE_SPECIAL(type))` |
| `src/pokemon.c:11806` | RandomizeTypeEffectivenessListEWRAM (no decide categoría) | `if (i != TYPE_MYSTERY)` |
| `src/pokemon_summary_screen.c:4358` | SetMoveTypeIcons (no decide categoría) | `if (type == TYPE_MYSTERY)` |
| `src/pokemon_summary_screen.c:4405` | SetNewMoveTypeIcon (no decide categoría) | `if (type == TYPE_MYSTERY)` |
| `src/tx_rac_menu.c:1994` | SaveData_TxRandomizerAndChallenges (no decide categoría) | `else if (sOptions->sel_challenges[MENUITEM_CHALLENGES_ONE_TYPE_CHALLENGE] >= TYPE_MYSTERY)` |
| `src/tx_rac_menu.c:2631` | DrawChoices_Challenges_OneTypeChallenge (no decide categoría) | `else if (n >= TYPE_MYSTERY)` |

## Hada en HnS: líneas por archivo

| Archivo | Líneas con `TYPE_FAIRY` |
|---|--:|
| `src/battle_main.c` | 36 |
| `src/data/pokemon/species_info.h` | 26 |
| `src/battle_script_commands.c` | 6 |
| `src/data/battle_moves.h` | 5 |
| `src/pokemon_summary_screen.c` | 4 |
| `src/pokedex_plus_hgss.c` | 3 |
| `src/pokemon.c` | 3 |
| `src/scrcmd.c` | 3 |
| `src/battle_controller_player.c` | 2 |
| `src/pokedex.c` | 2 |
| `src/data/union_room.h` | 1 |
| `src/menu.c` | 1 |
| `src/script_pokemon_util.c` | 1 |
| `include/constants/pokemon.h` | 1 |

## `optionStyle` en HnS (conmutador entre reglas originales y modernas)

| Archivo | Líneas |
|---|--:|
| `src/battle_factory.c` | 18 |
| `src/battle_tower.c` | 10 |
| `src/pokemon.c` | 9 |
| `src/battle_factory_screen.c` | 4 |
| `src/battle_script_commands.c` | 4 |
| `src/battle_tent.c` | 4 |
| `src/battle_tv.c` | 4 |
| `src/options_plus_menu.c` | 4 |
| `src/battle_controller_player.c` | 2 |
| `src/battle_dome.c` | 2 |
| `src/new_game.c` | 1 |
| `src/pokedex_plus_hgss.c` | 1 |
| `src/pokemon_summary_screen.c` | 1 |
| `include/global.h` | 1 |

## Lectura (interpretación, no medida)

- **FireRed** decide la categoría en 6 sitios de 2 archivos (`src/battle_script_commands.c`, `src/pokemon.c`).
- **Nuestro TypeScript** replica ese mismo reparto: 3 usos de la macro más 3 comparaciones en línea con `TYPE_MYSTERY`, en 2 archivos (`src/core/battle/cmds/part1.ts`, `src/core/battle/damage.ts`).
- **HnS** añadió un campo `category` por movimiento y 10 usos de `IS_MOVE_*` en 4 archivos, y conservó la rama original bajo `optionStyle` (un ajuste del jugador que alterna las reglas).
- **Hada** tocó 14 archivos en HnS: constantes, tabla de efectividad de tipos, datos de especies y movimientos, y las pantallas que dibujan tipos (resumen, Pokédex, menús).
- `optionStyle` también aparece en `battle_factory`, `battle_tower`, `battle_tent` y `battle_dome` (instalaciones del Frente de Batalla de Emerald, que no está en FireRed); no se ha verificado para qué lo usan allí.
- Esto mide **dónde** hay que tocar, no cuánto cuesta ni si el resultado es correcto.
