# Qué falta para compilar `src/core` contra Emerald (generado)

Generado por `python3 tools/emeraldCoreGap.py` (compila `src/core` con `@game/*` → `src/games/emerald`). No editar a mano.
Mide huecos de compilación, no de comportamiento: un núcleo que compila contra Emerald no es un Emerald que funciona.

- Errores de tipos: **834** en 69 archivos del núcleo.
- Módulos del contrato (`tools/checks/layers-contract.json`): 38; Emerald proporciona 5: data, generated/constants, generated/metatileBehavior, generated/structs, save.
- Constantes de FireRed que Emerald no define: 228 nombres, 516 usos.
- Campos de estructuras que Emerald no tiene: 10 campos en 4 estructuras.
- Otros errores: 118.

## Módulos que el núcleo importa de `@game/` y Emerald no tiene

| Módulo | Archivos del núcleo que lo importan |
|---|---:|
| `questLogEvents` | 14 |
| `battle/main_init` | 11 |
| `game` | 8 |
| `battle/ext` | 8 |
| `field/vsSeeker` | 4 |
| `battle/controller_oak_old_man` | 4 |
| `linkState` | 4 |
| `battle/bg` | 3 |
| `trainerTower` | 3 |
| `questLogPlayer` | 3 |
| `generated/eventObjectAnims` | 3 |
| `helpSystem` | 3 |
| `script/specials` | 3 |
| `battleTower` | 2 |
| `renewableHiddenItems` | 2 |
| `unionRoom` | 2 |
| `mapPreviewScreen` | 2 |
| `generated/stringUtil` | 2 |
| `questLogState` | 2 |
| `easyChat` | 2 |
| `generated/cdataTableAccessors` | 2 |
| `pokemonSpecialAnim` | 1 |
| `pokemon/scriptPokemonUtil` | 1 |
| `evolutionScene` | 1 |
| `generated/incbinRowAccessors` | 1 |
| `questLogBattle` | 1 |
| `battle/mugshotTransition` | 1 |
| `wonderNews` | 1 |
| `startMenu` | 1 |
| `questLogPalette` | 1 |
| `loadSave` | 1 |
| `questLogObjects` | 1 |
| `objectEventGraphics` | 1 |

## Constantes de FireRed ausentes en Emerald (más usadas)

| Constante | Usos |
|---|---:|
| `QL_STATE_PLAYBACK` | 23 |
| `BATTLE_TYPE_TRAINER_TOWER` | 16 |
| `BATTLE_TYPE_POKEDUDE` | 16 |
| `BATTLE_TYPE_OLD_MAN_TUTORIAL` | 13 |
| `BATTLE_TYPE_GHOST` | 13 |
| `HITMARKER_PASSIVE_DAMAGE` | 7 |
| `BATTLE_TYPE_GHOST_UNVEILED` | 7 |
| `QL_PLAYBACK_STATE_RUNNING` | 7 |
| `HITMARKER_SKIP_DMG_TRACK` | 6 |
| `ANIM_TAG_SAFARI_BAIT` | 5 |
| `BATTLE_TERRAIN_WATER` | 5 |
| `BATTLE_TERRAIN_POND` | 5 |
| `HITMARKER_SYNCHRONISE_EFFECT` | 5 |
| `PLAYER_AVATAR_FLAG_FORCED` | 5 |
| `BATTLE_TERRAIN_UNDERWATER` | 4 |
| `BATTLE_TERRAIN_PLAIN` | 4 |
| `CONTROLLER_UNKNOWNYESNOBOX` | 4 |
| `CONTROLLER_PLAYFANFARE` | 4 |
| `EXT_CTRL_CODE_SKIP` | 4 |
| `B_TRANSITION_BLUE` | 4 |
| `FLDEFF_POP_OUT_OF_ASH` | 4 |
| `MOVEMENT_ACTION_GLIDE_DOWN` | 4 |
| `AI_ITEM_GUARD_SPECS` | 3 |
| `BALL_GHOST_DODGE` | 3 |
| `BATTLE_TERRAIN_GRASS` | 3 |
| `BATTLE_TERRAIN_LONG_GRASS` | 3 |
| `BATTLE_TERRAIN_SAND` | 3 |
| `BATTLE_TERRAIN_MOUNTAIN` | 3 |
| `BATTLE_TERRAIN_CAVE` | 3 |
| `BATTLE_TERRAIN_BUILDING` | 3 |
| `FLAG_SYS_NOT_SOMEONES_PC` | 3 |
| `B_TEXT_FLAG_NPC_CONTEXT_FONT` | 3 |
| `B_ACTION_SAFARI_BAIT` | 3 |
| `B_MSG_MON_WATCHING` | 3 |
| `B_WIN_OAK_OLD_MAN` | 3 |
| `B_TRANSITION_LORELEI` | 3 |
| `QL_INPUT_UP` | 3 |
| `QL_INPUT_DOWN` | 3 |
| `QL_INPUT_LEFT` | 3 |
| `QL_INPUT_RIGHT` | 3 |

## Campos de estructuras ausentes en Emerald

| Estructura | Campos (usos) |
|---|---|
| `BattlePokemon` | `type1` (22), `type2` (22) |
| `BattleStruct` | `atkCancellerTracker` (19), `safariRockThrowCounter` (9), `safariBaitThrowCounter` (9), `lastAttackerToFaintOpponent` (1), `playerPartyIdx` (1) |
| `SpecialStatus` | `dmg` (14) |
| `SaveData` | `trainerTower` (1), `towerChallengeId` (1) |
