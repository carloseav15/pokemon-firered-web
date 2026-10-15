# Espacios de flags y variables (generado)

Generado por `unified-world/extract_flag_spaces.py`; no editar a mano. «Viva» = el ID lo usan scripts de **ambos**
juegos con nombres distintos, es decir, compartir un solo espacio los corrompería.

## Tamaño de cada espacio

| Fuente | Flags | Usadas en scripts | Máx. ID flag | Vars | Usadas en scripts | Máx. ID var |
|---|--:|--:|--:|--:|--:|--:|
| firered | 1476 | 349 | 16385 | 274 | 85 | 32788 |
| emerald | 1551 | 710 | 16388 | 285 | 166 | 32789 |
| hns | 1545 | 886 | 16389 | 285 | 210 | 32789 |

## Flags: colisiones entre pares

| Par | IDs comunes | Mismo nombre | Nombre distinto | **Colisiones vivas** | Mismo nombre, otro ID | …de ellas vivas |
|---|--:|--:|--:|--:|--:|--:|
| firered ↔ emerald | 1393 | 42 | 1351 | **147** | 73 | 29 |
| firered ↔ hns | 1391 | 31 | 1360 | **212** | 80 | 36 |
| emerald ↔ hns | 1538 | 764 | 774 | **243** | 3 | 2 |

## Variables: colisiones entre pares

| Par | IDs comunes | Mismo nombre | Nombre distinto | **Colisiones vivas** | Mismo nombre, otro ID | …de ellas vivas |
|---|--:|--:|--:|--:|--:|--:|
| firered ↔ emerald | 274 | 58 | 216 | **28** | 15 | 4 |
| firered ↔ hns | 274 | 58 | 216 | **60** | 15 | 4 |
| emerald ↔ hns | 278 | 196 | 82 | **32** | 1 | 1 |

Ejemplos de colisión viva (flags):

- firered ↔ emerald, ID 80: `FLAG_HIDE_PEWTER_MUSEUM_GUIDE` frente a `FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA_STILL`
- firered ↔ emerald, ID 82: `FLAG_HIDE_MOLTRES` frente a `FLAG_RESCUED_BIRCH`
- firered ↔ emerald, ID 88: `FLAG_HIDE_VICTORY_ROAD_2F_BOULDER` frente a `FLAG_BIRCH_AIDE_MET`
- firered ↔ hns, ID 43: `FLAG_HIDE_OAK_IN_HIS_LAB` frente a `FLAG_SYS_SET_BATTLE_BGM`
- firered ↔ hns, ID 44: `FLAG_HIDE_OAK_IN_PALLET_TOWN` frente a `FLAG_WONDERTRADE_FIRSTIME`
- firered ↔ hns, ID 46: `FLAG_HIDE_PEWTER_CITY_GYM_GUIDE` frente a `FLAG_GLACIA_REMATCH`
- emerald ↔ hns, ID 80: `FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA_STILL` frente a `FLAG_GARBAGEFLAG_STILL`
- emerald ↔ hns, ID 83: `FLAG_LEGENDARIES_IN_SOOTOPOLIS` frente a `FLAG_GARBAGEFLAG`
- emerald ↔ hns, ID 113: `FLAG_UNUSED_RS_LEGENDARY_BATTLE_DONE` frente a `FLAG_FINITE_TMS`

## Candidatos a la capa global (mismo nombre en las tres fuentes): 14

Coinciden por **nombre** con un patrón de medalla, sistema o MO; el significado debe confirmarse a mano.

`FLAG_BADGE01_GET`, `FLAG_BADGE02_GET`, `FLAG_BADGE03_GET`, `FLAG_BADGE04_GET`, `FLAG_BADGE05_GET`, `FLAG_BADGE06_GET`, `FLAG_BADGE07_GET`, `FLAG_BADGE08_GET`, `FLAG_SYS_B_DASH`, `FLAG_SYS_GAME_CLEAR`, `FLAG_SYS_NATIONAL_DEX`, `FLAG_SYS_POKEDEX_GET`, `FLAG_SYS_POKEMON_GET`, `FLAG_SYS_RIBBON_GET`

## Notas

- Igualdad de nombre no garantiza igualdad de significado (por ejemplo `FLAG_TEMP_*`).
- HnS parte de Modern Emerald: comparte gran parte de la numeración con Emerald, así que su colisión con FireRed es la que cuenta para unir Kanto y Johto.
- Los scripts se leen de `data/maps/*/scripts.inc` y `data/scripts/*.inc`; flags generadas por código no se ven.
