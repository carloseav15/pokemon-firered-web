# Bloqueos de progreso (generado)

Generado por `unified-world/extract_gates.py`; no editar a mano. Análisis **estático y heurístico**:
cada fila lista la evidencia y debe confirmarse a mano antes de decidir.

Tipos: `field_move` = el script comprueba un movimiento del equipo (Cortar, Fuerza…);
`forced_move` = el script desplaza al jugador (rebote o escena; **no siempre es un bloqueo**);
`physical_obstacle` = objeto que bloquea por colisión (Snorlax, árbol, roca, bloque);
`badge_check` = comprueba una medalla fuera de un movimiento de campo; `item_check` = comprueba un **objeto clave**.

**No capta:** guardias o NPC que bloquean solo por colisión y se retiran al activar un flag, ni condiciones
dentro de `switch/case` o `special`. Esos casos requieren una lista manual.

## firered

2331 eventos con script, 301 con alguna señal.

| Tipo | Eventos |
|---|---:|
| badge_check | 17 |
| field_move | 200 |
| forced_move | 81 |
| item_check | 3 |
| physical_obstacle | 202 |

Obstáculos de movimiento de campo (decisión A3):

| Movimiento | Eventos |
|---|---:|
| MOVE_ROCK_SMASH | 97 |
| MOVE_STRENGTH | 54 |
| MOVE_CUT | 49 |

Rebotes por variable de escena en eventos de coordenada (77; decisión A4):

| Mapa | Casilla | Variable = valor | Otras condiciones |
|---|---|---|---|
| CinnabarIsland | 20,5 | VAR_TEMP_1 = 0 |  |
| FourIsland_IcefallCave_Back | 11,18 | VAR_MAP_SCENE_ICEFALL_CAVE_BACK = 0 |  |
| FourIsland_IcefallCave_Back | 12,18 | VAR_MAP_SCENE_ICEFALL_CAVE_BACK = 0 |  |
| FourIsland_IcefallCave_Back | 13,18 | VAR_MAP_SCENE_ICEFALL_CAVE_BACK = 0 |  |
| FuchsiaCity_SafariZone_Entrance | 4,3 | VAR_TEMP_1 = 0 |  |
| FuchsiaCity_SafariZone_Entrance | 5,3 | VAR_TEMP_1 = 0 |  |
| FuchsiaCity_SafariZone_Entrance | 3,3 | VAR_TEMP_1 = 0 |  |
| OneIsland_PokemonCenter_1F | 12,6 | VAR_MAP_SCENE_ONE_ISLAND_POKEMON_CENTER_1F = 2 |  |
| OneIsland_PokemonCenter_1F | 12,7 | VAR_MAP_SCENE_ONE_ISLAND_POKEMON_CENTER_1F = 2 |  |
| OneIsland_PokemonCenter_1F | 12,8 | VAR_MAP_SCENE_ONE_ISLAND_POKEMON_CENTER_1F = 2 |  |
| OneIsland_PokemonCenter_1F | 12,9 | VAR_MAP_SCENE_ONE_ISLAND_POKEMON_CENTER_1F = 2 |  |
| PalletTown | 12,1 | VAR_MAP_SCENE_PALLET_TOWN_OAK = 0 |  |
| PalletTown | 13,1 | VAR_MAP_SCENE_PALLET_TOWN_OAK = 0 |  |
| PalletTown_ProfessorOaksLab | 5,8 | VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB = 2 |  |
| PalletTown_ProfessorOaksLab | 6,8 | VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB = 2 |  |
| PalletTown_ProfessorOaksLab | 7,8 | VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB = 2 |  |
| PewterCity | 42,21 | VAR_MAP_SCENE_PEWTER_CITY = 0 |  |
| PewterCity | 42,22 | VAR_MAP_SCENE_PEWTER_CITY = 0 |  |
| PewterCity | 42,23 | VAR_MAP_SCENE_PEWTER_CITY = 0 |  |
| PewterCity | 43,23 | VAR_MAP_SCENE_PEWTER_CITY = 0 |  |
| PewterCity_Museum_1F | 12,5 | VAR_MAP_SCENE_PEWTER_CITY_MUSEUM_1F = 0 |  |
| PewterCity_Museum_1F | 13,5 | VAR_MAP_SCENE_PEWTER_CITY_MUSEUM_1F = 0 |  |
| PewterCity_Museum_1F | 14,5 | VAR_MAP_SCENE_PEWTER_CITY_MUSEUM_1F = 0 |  |
| PokemonTower_6F | 11,15 | VAR_MAP_SCENE_POKEMON_TOWER_6F = 0 |  |
| PokemonTower_6F | 12,16 | VAR_MAP_SCENE_POKEMON_TOWER_6F = 0 |  |
| Route16_NorthEntrance_1F | 6,10 | VAR_TEMP_1 = 0 |  |
| Route16_NorthEntrance_1F | 6,11 | VAR_TEMP_1 = 0 |  |
| Route16_NorthEntrance_1F | 6,12 | VAR_TEMP_1 = 0 |  |
| Route16_NorthEntrance_1F | 6,13 | VAR_TEMP_1 = 0 |  |
| Route16_NorthEntrance_1F | 6,14 | VAR_TEMP_1 = 0 |  |
| Route18_EastEntrance_1F | 6,4 | VAR_TEMP_1 = 0 |  |
| Route18_EastEntrance_1F | 6,5 | VAR_TEMP_1 = 0 |  |
| Route18_EastEntrance_1F | 6,6 | VAR_TEMP_1 = 0 |  |
| Route18_EastEntrance_1F | 6,7 | VAR_TEMP_1 = 0 |  |
| Route18_EastEntrance_1F | 6,8 | VAR_TEMP_1 = 0 |  |
| Route24 | 10,15 | VAR_MAP_SCENE_ROUTE24 = 0 |  |
| Route24 | 11,15 | VAR_MAP_SCENE_ROUTE24 = 0 |  |
| Route5_SouthEntrance | 3,5 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| Route5_SouthEntrance | 4,5 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| Route5_SouthEntrance | 5,5 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| Route6_NorthEntrance | 3,5 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| Route6_NorthEntrance | 4,5 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| Route6_NorthEntrance | 5,5 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| Route7_EastEntrance | 6,4 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| Route7_EastEntrance | 6,5 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| Route7_EastEntrance | 6,6 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| Route8_WestEntrance | 6,4 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| Route8_WestEntrance | 6,5 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| Route8_WestEntrance | 6,6 | VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES = 0 | FLAG_GOT_TEA |
| SeafoamIslands_B4F | 26,19 | VAR_MAP_SCENE_SEAFOAM_ISLANDS_B4F = 0 |  |
| SeafoamIslands_B4F | 27,19 | VAR_MAP_SCENE_SEAFOAM_ISLANDS_B4F = 0 |  |
| SeafoamIslands_B4F | 28,19 | VAR_MAP_SCENE_SEAFOAM_ISLANDS_B4F = 0 |  |
| ThreeIsland | 7,26 | VAR_MAP_SCENE_THREE_ISLAND = 3 |  |
| ThreeIsland | 8,26 | VAR_MAP_SCENE_THREE_ISLAND = 3 |  |
| ThreeIsland | 9,26 | VAR_MAP_SCENE_THREE_ISLAND = 3 |  |
| ThreeIsland | 10,26 | VAR_MAP_SCENE_THREE_ISLAND = 3 |  |
| ThreeIsland | 11,26 | VAR_MAP_SCENE_THREE_ISLAND = 3 |  |
| TrainerTower_1F | 9,12 | VAR_TEMP_F = 0 |  |
| TrainerTower_1F | 9,13 | VAR_TEMP_F = 0 |  |
| TrainerTower_2F | 9,12 | VAR_TEMP_F = 0 |  |
| TrainerTower_2F | 9,13 | VAR_TEMP_F = 0 |  |
| TrainerTower_3F | 9,12 | VAR_TEMP_F = 0 |  |
| TrainerTower_3F | 9,13 | VAR_TEMP_F = 0 |  |
| TrainerTower_4F | 9,12 | VAR_TEMP_F = 0 |  |
| TrainerTower_4F | 9,13 | VAR_TEMP_F = 0 |  |
| TrainerTower_5F | 9,12 | VAR_TEMP_F = 0 |  |
| TrainerTower_5F | 9,13 | VAR_TEMP_F = 0 |  |
| TrainerTower_6F | 9,12 | VAR_TEMP_F = 0 |  |
| TrainerTower_6F | 9,13 | VAR_TEMP_F = 0 |  |
| TrainerTower_7F | 9,12 | VAR_TEMP_F = 0 |  |
| TrainerTower_7F | 9,13 | VAR_TEMP_F = 0 |  |
| TrainerTower_8F | 9,12 | VAR_TEMP_F = 0 |  |
| TrainerTower_8F | 9,13 | VAR_TEMP_F = 0 |  |
| VermilionCity | 22,33 | VAR_VERMILION_CITY_TICKET_CHECK_TRIGGER = 0 | FLAG_ENABLE_SHIP_BIRTH_ISLAND, FLAG_ENABLE_SHIP_NAVEL_ROCK, FLAG_GOT_SS_TICKET, FLAG_SHOWN_AURORA_TICKET |
| VermilionCity | 23,33 | VAR_VERMILION_CITY_TICKET_CHECK_TRIGGER = 0 | FLAG_ENABLE_SHIP_BIRTH_ISLAND, FLAG_ENABLE_SHIP_NAVEL_ROCK, FLAG_GOT_SS_TICKET, FLAG_SHOWN_AURORA_TICKET |
| ViridianCity | 22,11 | VAR_MAP_SCENE_VIRIDIAN_CITY_OLD_MAN = 0 |  |
| ViridianCity | 36,11 | VAR_MAP_SCENE_VIRIDIAN_CITY_GYM_DOOR = 0 |  |

Comprobaciones de medalla u objeto (220):

| Mapa | Evento | Medallas | Objetos |
|---|---|---|---|
| CeladonCity | object 52,22 | FLAG_BADGE02_GET |  |
| CeladonCity | object 40,35 | FLAG_BADGE02_GET |  |
| CeladonCity_Gym | object 6,8 | FLAG_BADGE02_GET |  |
| CeladonCity_Gym | object 3,5 | FLAG_BADGE02_GET |  |
| CeladonCity_Gym | object 9,6 | FLAG_BADGE02_GET |  |
| CeladonCity_Gym | sign 4,16 | FLAG_BADGE04_GET |  |
| CeladonCity_Gym | sign 8,16 | FLAG_BADGE04_GET |  |
| CeruleanCave_1F | object 7,21 | FLAG_BADGE06_GET |  |
| CeruleanCave_1F | object 13,21 | FLAG_BADGE06_GET |  |
| CeruleanCave_1F | object 5,20 | FLAG_BADGE06_GET |  |
| CeruleanCave_1F | object 14,20 | FLAG_BADGE06_GET |  |
| CeruleanCave_1F | object 11,21 | FLAG_BADGE06_GET |  |
| CeruleanCave_1F | object 9,18 | FLAG_BADGE06_GET |  |
| CeruleanCave_2F | object 33,10 | FLAG_BADGE06_GET |  |
| CeruleanCave_2F | object 33,9 | FLAG_BADGE06_GET |  |
| CeruleanCave_2F | object 25,11 | FLAG_BADGE06_GET |  |
| CeruleanCave_2F | object 28,20 | FLAG_BADGE06_GET |  |
| CeruleanCave_2F | object 30,20 | FLAG_BADGE06_GET |  |
| CeruleanCave_2F | object 9,13 | FLAG_BADGE06_GET |  |
| CeruleanCave_2F | object 23,16 | FLAG_BADGE06_GET |  |
| CeruleanCave_2F | object 13,6 | FLAG_BADGE06_GET |  |
| CeruleanCave_2F | object 4,12 | FLAG_BADGE06_GET |  |
| CeruleanCave_2F | object 10,20 | FLAG_BADGE06_GET |  |
| CeruleanCave_B1F | object 37,1 | FLAG_BADGE06_GET |  |
| CeruleanCave_B1F | object 38,2 | FLAG_BADGE06_GET |  |
| CeruleanCave_B1F | object 35,1 | FLAG_BADGE06_GET |  |
| CeruleanCave_B1F | object 37,4 | FLAG_BADGE06_GET |  |
| CeruleanCave_B1F | object 35,5 | FLAG_BADGE06_GET |  |
| CeruleanCave_B1F | object 2,2 | FLAG_BADGE06_GET |  |
| CeruleanCave_B1F | object 4,1 | FLAG_BADGE06_GET |  |
| CeruleanCave_B1F | object 6,1 | FLAG_BADGE06_GET |  |
| CeruleanCave_B1F | object 3,4 | FLAG_BADGE06_GET |  |
| CeruleanCity | object 26,32 | FLAG_BADGE02_GET |  |
| CeruleanCity_Gym | sign 6,17 | FLAG_BADGE02_GET |  |
| CeruleanCity_Gym | sign 10,17 | FLAG_BADGE02_GET |  |
| CinnabarIsland_Gym | sign 23,20 | FLAG_BADGE07_GET |  |
| CinnabarIsland_Gym | sign 27,20 | FLAG_BADGE07_GET |  |
| FiveIsland_Meadow | object 8,9 | FLAG_BADGE02_GET |  |
| FiveIsland_Meadow | object 19,12 | FLAG_BADGE02_GET |  |
| FourIsland | object 5,11 | FLAG_BADGE06_GET |  |
| FuchsiaCity | object 30,10 | FLAG_BADGE02_GET |  |
| FuchsiaCity | object 21,13 | FLAG_BADGE02_GET |  |
| FuchsiaCity | object 32,16 | FLAG_BADGE02_GET |  |
| FuchsiaCity | object 24,22 | FLAG_BADGE02_GET |  |
| FuchsiaCity_Gym | sign 4,19 | FLAG_BADGE05_GET |  |
| FuchsiaCity_Gym | sign 10,19 | FLAG_BADGE05_GET |  |
| FuchsiaCity_WardensHouse | object 11,6 | FLAG_BADGE04_GET |  |
| MtEmber_Exterior | object 29,41 | FLAG_BADGE06_GET |  |
| MtEmber_Exterior | object 30,42 | FLAG_BADGE06_GET |  |
| MtEmber_Exterior | object 22,45 | FLAG_BADGE04_GET |  |
| MtEmber_Exterior | object 17,46 | FLAG_BADGE04_GET |  |
| MtEmber_Exterior | object 36,14 | FLAG_BADGE04_GET |  |
| MtEmber_Exterior | object 34,14 | FLAG_BADGE06_GET |  |
| MtEmber_Exterior | object 36,15 | FLAG_BADGE06_GET |  |
| MtEmber_Exterior | object 35,14 | FLAG_BADGE04_GET |  |
| MtEmber_Exterior | object 35,17 | FLAG_BADGE04_GET |  |
| MtEmber_Exterior | object 18,39 | FLAG_BADGE06_GET |  |
| MtEmber_Exterior | object 19,40 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_1F | object 18,11 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_1F | object 23,16 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_1F | object 20,12 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_1F | object 19,7 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_1F | object 21,15 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B1F | object 1,8 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B1F | object 1,11 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B1F | object 3,12 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B1F | object 5,14 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B1F_Stairs | object 4,2 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B2F | object 9,3 | FLAG_BADGE04_GET |  |
| MtEmber_RubyPath_B2F | object 12,5 | FLAG_BADGE04_GET |  |
| MtEmber_RubyPath_B2F | object 12,2 | FLAG_BADGE04_GET |  |
| MtEmber_RubyPath_B2F | object 4,8 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B2F | object 1,8 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B2F | object 4,5 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B2F | object 5,5 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B2F_Stairs | object 4,3 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B2F_Stairs | object 6,2 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B3F | object 10,4 | FLAG_BADGE04_GET |  |
| MtEmber_RubyPath_B3F | object 26,12 | FLAG_BADGE04_GET |  |
| MtEmber_RubyPath_B3F | object 28,8 | FLAG_BADGE04_GET |  |
| MtEmber_RubyPath_B3F | object 7,2 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B3F | object 4,3 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B3F | object 6,6 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B3F | object 7,6 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B3F | object 4,5 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B3F | object 5,2 | FLAG_BADGE06_GET |  |
| MtEmber_RubyPath_B3F | object 15,13 | FLAG_BADGE04_GET |  |
| MtEmber_Summit | object 10,12 | FLAG_BADGE04_GET |  |
| MtEmber_Summit | object 9,12 | FLAG_BADGE04_GET |  |
| MtEmber_Summit | object 8,11 | FLAG_BADGE04_GET |  |
| MtEmber_Summit | object 8,10 | FLAG_BADGE04_GET |  |
| MtEmber_SummitPath_2F | object 40,7 | FLAG_BADGE06_GET |  |
| MtEmber_SummitPath_2F | object 33,5 | FLAG_BADGE06_GET |  |
| MtEmber_SummitPath_2F | object 15,19 | FLAG_BADGE06_GET |  |
| MtEmber_SummitPath_2F | object 13,23 | FLAG_BADGE06_GET |  |
| MtEmber_SummitPath_2F | object 13,21 | FLAG_BADGE06_GET |  |
| MtEmber_SummitPath_2F | object 7,38 | FLAG_BADGE06_GET |  |
| MtEmber_SummitPath_2F | object 9,35 | FLAG_BADGE06_GET |  |
| MtEmber_SummitPath_2F | object 7,34 | FLAG_BADGE06_GET |  |
| MtEmber_SummitPath_2F | object 15,26 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 8,104 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 11,95 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 12,96 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 10,95 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 9,105 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 15,75 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 9,84 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 15,74 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 15,73 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 18,111 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 10,86 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 9,110 | FLAG_BADGE06_GET |  |
| OneIsland_KindleRoad | object 18,112 | FLAG_BADGE06_GET |  |
| PewterCity | object 30,5 | FLAG_BADGE02_GET |  |
| PewterCity_Gym | sign 4,12 | FLAG_BADGE01_GET |  |
| PewterCity_Gym | sign 8,12 | FLAG_BADGE01_GET |  |
| RockTunnel_B1F | object 1,20 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 1,22 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 4,23 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 2,23 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 39,26 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 42,26 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 43,28 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 45,30 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 45,33 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 25,1 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 27,4 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 23,2 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 26,2 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 24,7 | FLAG_BADGE06_GET |  |
| RockTunnel_B1F | object 27,6 | FLAG_BADGE06_GET |  |
| Route10 | object 10,20 | FLAG_BADGE02_GET |  |
| Route10 | object 10,22 | FLAG_BADGE02_GET |  |
| Route10 | object 10,24 | FLAG_BADGE02_GET |  |
| Route10 | object 10,26 | FLAG_BADGE02_GET |  |
| Route12 | object 11,100 | FLAG_BADGE02_GET |  |
| Route12 | object 12,111 | FLAG_BADGE02_GET |  |
| Route13 | object 44,5 | FLAG_BADGE02_GET |  |
| Route14 | object 7,26 | FLAG_BADGE02_GET |  |
| Route14 | object 12,35 | FLAG_BADGE02_GET |  |
| Route14 | object 1,47 | FLAG_BADGE02_GET |  |
| Route16 | object 41,11 | FLAG_BADGE02_GET |  |
| Route2 | object 16,62 | FLAG_BADGE02_GET |  |
| Route2 | object 15,69 | FLAG_BADGE02_GET |  |
| Route2 | object 11,13 | FLAG_BADGE02_GET |  |
| Route2 | object 18,26 | FLAG_BADGE02_GET |  |
| Route25 | object 30,3 | FLAG_BADGE02_GET |  |
| Route8 | object 33,15 | FLAG_BADGE02_GET |  |
| Route8 | object 47,12 | FLAG_BADGE02_GET |  |
| Route9 | object 2,8 | FLAG_BADGE02_GET |  |
| SaffronCity_Gym | sign 12,20 | FLAG_BADGE06_GET |  |
| SaffronCity_Gym | sign 16,20 | FLAG_BADGE06_GET |  |
| SeafoamIslands_1F | object 22,12 | FLAG_BADGE04_GET |  |
| SeafoamIslands_1F | object 32,9 | FLAG_BADGE04_GET |  |
| SeafoamIslands_B1F | object 22,8 | FLAG_BADGE04_GET |  |
| SeafoamIslands_B1F | object 30,8 | FLAG_BADGE04_GET |  |
| SeafoamIslands_B2F | object 22,8 | FLAG_BADGE04_GET |  |
| SeafoamIslands_B2F | object 30,8 | FLAG_BADGE04_GET |  |
| SeafoamIslands_B3F | object 12,16 | FLAG_BADGE04_GET |  |
| SeafoamIslands_B3F | object 13,16 | FLAG_BADGE04_GET |  |
| SeafoamIslands_B3F | object 9,16 | FLAG_BADGE04_GET |  |
| SeafoamIslands_B3F | object 6,17 | FLAG_BADGE04_GET |  |
| SevenIsland_SevaultCanyon | object 3,41 | FLAG_BADGE06_GET |  |
| SevenIsland_SevaultCanyon | object 13,47 | FLAG_BADGE04_GET |  |
| SevenIsland_SevaultCanyon | object 7,44 | FLAG_BADGE06_GET |  |
| SevenIsland_SevaultCanyon | object 12,47 | FLAG_BADGE06_GET |  |
| SevenIsland_SevaultCanyon | object 15,46 | FLAG_BADGE06_GET |  |
| SevenIsland_SevaultCanyon | object 16,47 | FLAG_BADGE06_GET |  |
| SevenIsland_SevaultCanyon | object 17,47 | FLAG_BADGE04_GET |  |
| SevenIsland_SevaultCanyon | object 11,31 | FLAG_BADGE06_GET |  |
| SevenIsland_SevaultCanyon_TanobyKey | object 7,6 | FLAG_BADGE04_GET |  |
| SevenIsland_SevaultCanyon_TanobyKey | object 8,6 | FLAG_BADGE04_GET |  |
| SevenIsland_SevaultCanyon_TanobyKey | object 8,9 | FLAG_BADGE04_GET |  |
| SevenIsland_SevaultCanyon_TanobyKey | object 6,10 | FLAG_BADGE04_GET |  |
| SevenIsland_SevaultCanyon_TanobyKey | object 8,10 | FLAG_BADGE04_GET |  |
| SevenIsland_SevaultCanyon_TanobyKey | object 6,9 | FLAG_BADGE04_GET |  |
| SevenIsland_SevaultCanyon_TanobyKey | object 6,6 | FLAG_BADGE04_GET |  |
| SixIsland_RuinValley | object 17,10 | FLAG_BADGE04_GET |  |
| SixIsland_RuinValley | object 17,12 | FLAG_BADGE04_GET |  |
| SixIsland_RuinValley | object 18,11 | FLAG_BADGE04_GET |  |
| SixIsland_RuinValley | object 6,33 | FLAG_BADGE04_GET |  |
| SixIsland_RuinValley | object 6,34 | FLAG_BADGE04_GET |  |
| SixIsland_RuinValley | object 41,32 | FLAG_BADGE04_GET |  |
| SixIsland_RuinValley | object 41,33 | FLAG_BADGE04_GET |  |
| SixIsland_RuinValley | object 42,33 | FLAG_BADGE04_GET |  |
| ThreeIsland | object 20,7 | FLAG_BADGE02_GET |  |
| ThreeIsland_BerryForest | object 12,11 | FLAG_BADGE02_GET |  |
| ThreeIsland_BerryForest | object 19,7 | FLAG_BADGE02_GET |  |
| ThreeIsland_BerryForest | object 23,17 | FLAG_BADGE02_GET |  |
| ThreeIsland_BerryForest | object 38,23 | FLAG_BADGE02_GET |  |
| ThreeIsland_BerryForest | object 44,23 | FLAG_BADGE02_GET |  |
| ThreeIsland_BerryForest | object 44,29 | FLAG_BADGE02_GET |  |
| ThreeIsland_BerryForest | object 16,43 | FLAG_BADGE02_GET |  |
| ThreeIsland_BerryForest | object 17,39 | FLAG_BADGE02_GET |  |
| ThreeIsland_BerryForest | object 14,39 | FLAG_BADGE02_GET |  |
| ThreeIsland_BerryForest | object 11,39 | FLAG_BADGE02_GET |  |
| ThreeIsland_BondBridge | object 72,8 | FLAG_BADGE02_GET |  |
| ThreeIsland_BondBridge | object 86,13 | FLAG_BADGE02_GET |  |
| TwoIsland | object 30,16 | FLAG_BADGE02_GET |  |
| VermilionCity | object 24,33 |  | ITEM_AURORA_TICKET, ITEM_MYSTIC_TICKET |
| … | 20 filas más en el JSON | | |

## emerald

2983 eventos con script, 242 con alguna señal.

| Tipo | Eventos |
|---|---:|
| badge_check | 32 |
| field_move | 136 |
| forced_move | 26 |
| item_check | 50 |
| physical_obstacle | 136 |

Obstáculos de movimiento de campo (decisión A3):

| Movimiento | Eventos |
|---|---:|
| MOVE_STRENGTH | 59 |
| MOVE_ROCK_SMASH | 44 |
| MOVE_CUT | 33 |

Rebotes por variable de escena en eventos de coordenada (17; decisión A4):

| Mapa | Casilla | Variable = valor | Otras condiciones |
|---|---|---|---|
| LilycoveCity_CoveLilyMotel_1F | 10,2 | VAR_TEMP_1 = 0 |  |
| LittlerootTown | 10,1 | VAR_LITTLEROOT_TOWN_STATE = 0 |  |
| LittlerootTown | 11,1 | VAR_LITTLEROOT_TOWN_STATE = 0 |  |
| LittlerootTown_BrendansHouse_1F | 8,8 | VAR_LITTLEROOT_INTRO_STATE = 4 |  |
| LittlerootTown_MaysHouse_1F | 2,8 | VAR_LITTLEROOT_INTRO_STATE = 4 |  |
| MeteorFalls_1F_1R | 14,18 | VAR_METEOR_FALLS_STATE = 0 |  |
| MtPyre_Summit | 22,9 | VAR_MT_PYRE_STATE = 2 |  |
| MtPyre_Summit | 23,9 | VAR_MT_PYRE_STATE = 2 |  |
| MtPyre_Summit | 24,9 | VAR_MT_PYRE_STATE = 2 |  |
| OldaleTown | 0,10 | VAR_OLDALE_TOWN_STATE = 0 |  |
| PetalburgCity | 8,10 | VAR_PETALBURG_CITY_STATE = 0 |  |
| PetalburgCity | 8,11 | VAR_PETALBURG_CITY_STATE = 0 |  |
| PetalburgCity | 8,12 | VAR_PETALBURG_CITY_STATE = 0 |  |
| PetalburgCity | 8,13 | VAR_PETALBURG_CITY_STATE = 0 |  |
| Route101 | 10,19 | VAR_ROUTE101_STATE = 1 |  |
| Route101 | 11,19 | VAR_ROUTE101_STATE = 1 |  |
| SlateportCity | 10,13 | VAR_SLATEPORT_OUTSIDE_MUSEUM_STATE = 2 |  |

Comprobaciones de medalla u objeto (217):

| Mapa | Evento | Medallas | Objetos |
|---|---|---|---|
| AbandonedShip_CaptainsOffice | object 3,4 |  | ITEM_SCANNER |
| AbandonedShip_Corridors_B1F | sign 11,4 |  | ITEM_STORAGE_KEY |
| AbandonedShip_HiddenFloorCorridors | sign 3,8 |  | ITEM_ROOM_1_KEY |
| AbandonedShip_HiddenFloorCorridors | sign 6,8 |  | ITEM_ROOM_2_KEY |
| AbandonedShip_HiddenFloorCorridors | sign 3,4 |  | ITEM_ROOM_4_KEY |
| AbandonedShip_HiddenFloorCorridors | sign 9,4 |  | ITEM_ROOM_6_KEY |
| BattleFrontier_OutsideWest | object 19,68 |  | ITEM_SS_TICKET |
| BattleFrontier_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| DewfordTown_Gym | sign 4,23 | FLAG_BADGE02_GET |  |
| DewfordTown_Gym | sign 7,23 | FLAG_BADGE02_GET |  |
| DewfordTown_Gym | sign 4,24 | FLAG_BADGE02_GET |  |
| DewfordTown_Gym | sign 7,24 | FLAG_BADGE02_GET |  |
| DewfordTown_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| EverGrandeCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| EverGrandeCity_PokemonLeague_1F | object 8,2 | FLAG_BADGE06_GET |  |
| EverGrandeCity_PokemonLeague_1F | object 11,2 | FLAG_BADGE06_GET |  |
| EverGrandeCity_PokemonLeague_2F | object 1,2 |  | ITEM_EON_TICKET |
| FallarborTown_CozmosHouse | object 6,4 |  | ITEM_METEORITE |
| FallarborTown_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| FieryPath | object 10,15 | FLAG_BADGE04_GET |  |
| FieryPath | object 17,15 | FLAG_BADGE04_GET |  |
| FieryPath | object 8,11 | FLAG_BADGE04_GET |  |
| FieryPath | object 3,12 | FLAG_BADGE04_GET |  |
| FieryPath | object 6,23 | FLAG_BADGE04_GET |  |
| FieryPath | object 5,24 | FLAG_BADGE04_GET |  |
| FortreeCity | object 25,8 |  | ITEM_DEVON_SCOPE |
| FortreeCity_Gym | sign 14,21 | FLAG_BADGE06_GET |  |
| FortreeCity_Gym | sign 17,21 | FLAG_BADGE06_GET |  |
| FortreeCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| GraniteCave_B2F | object 5,14 | FLAG_BADGE03_GET |  |
| GraniteCave_B2F | object 3,14 | FLAG_BADGE03_GET |  |
| GraniteCave_B2F | object 2,16 | FLAG_BADGE03_GET |  |
| GraniteCave_B2F | object 7,12 | FLAG_BADGE03_GET |  |
| GraniteCave_B2F | object 4,22 | FLAG_BADGE03_GET |  |
| GraniteCave_B2F | object 6,22 | FLAG_BADGE03_GET |  |
| GraniteCave_B2F | object 3,21 | FLAG_BADGE03_GET |  |
| LavaridgeTown_Gym_1F | sign 10,15 | FLAG_BADGE04_GET |  |
| LavaridgeTown_Gym_1F | sign 16,15 | FLAG_BADGE04_GET |  |
| LavaridgeTown_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| LilycoveCity | object 15,18 | FLAG_BADGE07_GET |  |
| LilycoveCity | object 57,17 | FLAG_BADGE07_GET |  |
| LilycoveCity_CoveLilyMotel_1F | object 10,3 | FLAG_BADGE07_GET |  |
| LilycoveCity_Harbor | object 8,10 |  | ITEM_AURORA_TICKET, ITEM_EON_TICKET, ITEM_MYSTIC_TICKET, ITEM_OLD_SEA_MAP |
| LilycoveCity_PokemonCenter_1F | object 11,8 | FLAG_BADGE07_GET |  |
| LilycoveCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| LittlerootTown_BrendansHouse_1F | object 2,6 | FLAG_BADGE05_GET |  |
| LittlerootTown_MaysHouse_1F | object 8,6 | FLAG_BADGE05_GET |  |
| MagmaHideout_1F | object 5,22 | FLAG_BADGE04_GET |  |
| MagmaHideout_1F | object 7,22 | FLAG_BADGE04_GET |  |
| MagmaHideout_1F | object 6,23 | FLAG_BADGE04_GET |  |
| MauvilleCity_BikeShop | object 2,5 |  | ITEM_ACRO_BIKE, ITEM_MACH_BIKE |
| MauvilleCity_Gym | sign 3,18 | FLAG_BADGE03_GET |  |
| MauvilleCity_Gym | sign 6,18 | FLAG_BADGE03_GET |  |
| MauvilleCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| MirageTower_3F | object 3,7 | FLAG_BADGE03_GET |  |
| MirageTower_3F | object 4,8 | FLAG_BADGE03_GET |  |
| MirageTower_4F | object 6,7 | FLAG_BADGE03_GET |  |
| MossdeepCity_Gym | sign 4,34 | FLAG_BADGE07_GET |  |
| MossdeepCity_Gym | sign 8,34 | FLAG_BADGE07_GET |  |
| MossdeepCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| NewMauville_Entrance | trigger 4,2 |  | ITEM_BASEMENT_KEY |
| OldaleTown_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| PacifidlogTown_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| PetalburgCity_Gym | sign 1,110 | FLAG_BADGE05_GET |  |
| PetalburgCity_Gym | sign 7,110 | FLAG_BADGE05_GET |  |
| PetalburgCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| PetalburgWoods | object 19,10 | FLAG_BADGE01_GET |  |
| PetalburgWoods | object 19,11 | FLAG_BADGE01_GET |  |
| Route103 | object 67,7 | FLAG_BADGE01_GET |  |
| Route103 | object 72,8 | FLAG_BADGE01_GET |  |
| Route104 | object 35,22 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle1 | object 11,16 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle1 | object 13,18 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle1 | object 14,14 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle1 | object 11,8 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle1 | object 8,10 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle1 | object 11,12 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle1 | object 2,4 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle1 | object 13,6 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle1 | object 0,6 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle1 | object 4,8 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle1 | object 2,12 | FLAG_BADGE01_GET |  |
| Route110_TrickHousePuzzle3 | object 1,20 | FLAG_BADGE03_GET |  |
| Route110_TrickHousePuzzle3 | object 2,21 | FLAG_BADGE03_GET |  |
| Route110_TrickHousePuzzle4 | object 13,3 | FLAG_BADGE04_GET |  |
| Route110_TrickHousePuzzle4 | object 12,5 | FLAG_BADGE04_GET |  |
| Route110_TrickHousePuzzle4 | object 5,16 | FLAG_BADGE04_GET |  |
| Route110_TrickHousePuzzle4 | object 4,6 | FLAG_BADGE04_GET |  |
| Route110_TrickHousePuzzle4 | object 12,2 | FLAG_BADGE04_GET |  |
| Route110_TrickHousePuzzle4 | object 5,7 | FLAG_BADGE04_GET |  |
| Route110_TrickHousePuzzle4 | object 9,3 | FLAG_BADGE04_GET |  |
| Route110_TrickHousePuzzle4 | object 10,12 | FLAG_BADGE04_GET |  |
| Route110_TrickHousePuzzle4 | object 14,2 | FLAG_BADGE04_GET |  |
| Route110_TrickHousePuzzle4 | object 10,15 | FLAG_BADGE04_GET |  |
| Route111 | object 18,101 | FLAG_BADGE03_GET |  |
| Route111 | object 19,100 | FLAG_BADGE03_GET |  |
| Route111 | object 22,21 | FLAG_BADGE01_GET |  |
| Route111 | trigger 11,61 |  | ITEM_GO_GOGGLES |
| Route111 | trigger 12,61 |  | ITEM_GO_GOGGLES |
| Route111 | trigger 13,61 |  | ITEM_GO_GOGGLES |
| Route111 | trigger 12,44 |  | ITEM_GO_GOGGLES |
| Route111 | trigger 13,43 |  | ITEM_GO_GOGGLES |
| Route111 | trigger 14,42 |  | ITEM_GO_GOGGLES |
| Route111 | trigger 16,40 |  | ITEM_GO_GOGGLES |
| Route111 | trigger 14,61 |  | ITEM_GO_GOGGLES |
| Route111 | trigger 17,39 |  | ITEM_GO_GOGGLES |
| Route111 | trigger 18,38 |  | ITEM_GO_GOGGLES |
| Route113_GlassWorkshop | object 2,3 |  | ITEM_SOOT_SACK |
| Route114 | object 12,43 | FLAG_BADGE03_GET |  |
| Route114 | object 29,53 | FLAG_BADGE03_GET |  |
| Route114 | object 30,54 | FLAG_BADGE03_GET |  |
| Route114 | object 22,69 | FLAG_BADGE03_GET |  |
| Route114 | object 11,64 | FLAG_BADGE03_GET |  |
| Route114_FossilManiacsTunnel | object 5,3 |  | ITEM_CLAW_FOSSIL, ITEM_ROOT_FOSSIL |
| Route115 | object 29,50 | FLAG_BADGE03_GET |  |
| Route116 | object 21,6 | FLAG_BADGE01_GET |  |
| Route116 | object 32,10 | FLAG_BADGE01_GET |  |
| Route116 | object 28,11 | FLAG_BADGE01_GET |  |
| Route116 | object 24,9 | FLAG_BADGE01_GET |  |
| Route116 | object 30,5 | FLAG_BADGE01_GET |  |
| Route117 | object 15,2 | FLAG_BADGE01_GET |  |
| Route118 | object 38,8 | FLAG_BADGE01_GET |  |
| Route119 | object 31,6 |  | ITEM_DEVON_SCOPE |
| Route119 | object 25,15 |  | ITEM_DEVON_SCOPE |
| Route120 | object 35,32 | FLAG_BADGE01_GET |  |
| Route120 | object 20,1 | FLAG_BADGE01_GET |  |
| Route120 | object 15,1 | FLAG_BADGE01_GET |  |
| Route120 | object 20,11 |  | ITEM_DEVON_SCOPE |
| Route120 | object 27,2 |  | ITEM_DEVON_SCOPE |
| Route120 | object 4,77 |  | ITEM_DEVON_SCOPE |
| Route120 | object 7,51 |  | ITEM_DEVON_SCOPE |
| Route120 | object 19,48 |  | ITEM_DEVON_SCOPE |
| Route121 | object 32,5 | FLAG_BADGE01_GET |  |
| Route121 | object 65,4 | FLAG_BADGE01_GET |  |
| Route121 | object 26,12 | FLAG_BADGE01_GET |  |
| Route123 | object 101,13 | FLAG_BADGE01_GET |  |
| Route123 | object 129,14 | FLAG_BADGE01_GET |  |
| Route123 | object 92,9 | FLAG_BADGE01_GET |  |
| RustboroCity | object 26,23 | FLAG_BADGE01_GET |  |
| RustboroCity_DevonCorp_2F | object 14,8 |  | ITEM_CLAW_FOSSIL, ITEM_ROOT_FOSSIL |
| RustboroCity_Gym | sign 2,18 | FLAG_BADGE01_GET |  |
| RustboroCity_Gym | sign 8,18 | FLAG_BADGE01_GET |  |
| RustboroCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| RustboroCity_PokemonSchool | object 0,10 | FLAG_BADGE01_GET |  |
| RusturfTunnel | object 24,5 | FLAG_BADGE03_GET |  |
| RusturfTunnel | object 24,4 | FLAG_BADGE03_GET |  |
| SafariZone_North | object 25,10 | FLAG_BADGE03_GET |  |
| SafariZone_North | object 25,13 | FLAG_BADGE03_GET |  |
| SafariZone_North | object 28,14 | FLAG_BADGE03_GET |  |
| SafariZone_North | object 23,6 | FLAG_BADGE03_GET |  |
| SafariZone_North | object 20,7 | FLAG_BADGE03_GET |  |
| SafariZone_North | object 27,7 | FLAG_BADGE03_GET |  |
| SafariZone_Northeast | object 11,11 | FLAG_BADGE03_GET |  |
| SafariZone_Northeast | object 8,13 | FLAG_BADGE03_GET |  |
| SafariZone_Northeast | object 9,7 | FLAG_BADGE03_GET |  |
| SafariZone_Northeast | object 8,10 | FLAG_BADGE03_GET |  |
| SafariZone_Northeast | object 12,8 | FLAG_BADGE03_GET |  |
| SeafloorCavern_Room1 | object 5,11 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room1 | object 12,11 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room1 | object 5,10 | FLAG_BADGE03_GET |  |
| SeafloorCavern_Room2 | object 13,3 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room2 | object 10,3 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room2 | object 13,5 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room2 | object 4,5 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room2 | object 7,4 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room2 | object 8,7 | FLAG_BADGE03_GET |  |
| SeafloorCavern_Room2 | object 9,3 | FLAG_BADGE03_GET |  |
| SeafloorCavern_Room2 | object 4,8 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room3 | object 13,10 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room3 | object 11,10 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room3 | object 12,9 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room3 | object 12,7 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room3 | object 11,8 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room3 | object 12,11 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room3 | object 13,8 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room5 | object 3,11 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room5 | object 4,11 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room5 | object 11,7 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room5 | object 3,13 | FLAG_BADGE03_GET |  |
| SeafloorCavern_Room5 | object 13,8 | FLAG_BADGE03_GET |  |
| SeafloorCavern_Room5 | object 12,8 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 4,7 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 5,7 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 6,7 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 3,6 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 7,6 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 4,5 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 5,5 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 6,5 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 3,4 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 4,4 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 6,4 | FLAG_BADGE04_GET |  |
| SeafloorCavern_Room8 | object 7,4 | FLAG_BADGE04_GET |  |
| ShoalCave_LowTideLowerRoom | object 25,3 | FLAG_BADGE04_GET |  |
| SlateportCity | sign 23,38 | FLAG_BADGE07_GET |  |
| SlateportCity_Harbor | object 6,13 | FLAG_BADGE07_GET | ITEM_SCANNER |
| SlateportCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| SlateportCity_SternsShipyard_1F | object 5,5 | FLAG_BADGE07_GET |  |
| SootopolisCity_Gym_1F | object 8,2 | FLAG_BADGE06_GET |  |
| SootopolisCity_Gym_1F | sign 6,24 | FLAG_BADGE08_GET |  |
| … | 17 filas más en el JSON | | |

## hns

6231 eventos con script, 725 con alguna señal.

| Tipo | Eventos |
|---|---:|
| badge_check | 115 |
| field_move | 318 |
| forced_move | 278 |
| item_check | 75 |
| physical_obstacle | 317 |

Obstáculos de movimiento de campo (decisión A3):

| Movimiento | Eventos |
|---|---:|
| MOVE_ROCK_SMASH | 155 |
| MOVE_STRENGTH | 92 |
| MOVE_CUT | 70 |
| MOVE_SURF | 1 |

Rebotes por variable de escena en eventos de coordenada (194; decisión A4):

| Mapa | Casilla | Variable = valor | Otras condiciones |
|---|---|---|---|
| AzaleaTown | 11,16 | VAR_AZALEA_TOWN_STATE = 5 |  |
| AzaleaTown | 11,17 | VAR_AZALEA_TOWN_STATE = 5 |  |
| AzaleaTown_Gym | 6,39 | VAR_TEMP_0 = 0 |  |
| AzaleaTown_Gym | 11,39 | VAR_TEMP_0 = 0 |  |
| AzaleaTown_Gym | 16,39 | VAR_TEMP_0 = 0 |  |
| AzaleaTown_Gym | 6,27 | VAR_TEMP_0 = 0 |  |
| AzaleaTown_Gym | 11,27 | VAR_TEMP_0 = 0 |  |
| AzaleaTown_Gym | 16,27 | VAR_TEMP_0 = 0 |  |
| AzaleaTown_Gym | 6,23 | VAR_TEMP_0 = 0 |  |
| AzaleaTown_Gym | 11,23 | VAR_TEMP_0 = 0 |  |
| AzaleaTown_Gym | 16,23 | VAR_TEMP_0 = 0 |  |
| AzaleaTown_Gym | 6,11 | VAR_TEMP_0 = 0 |  |
| AzaleaTown_Gym | 11,11 | VAR_TEMP_0 = 0 |  |
| AzaleaTown_Gym | 16,11 | VAR_TEMP_0 = 0 |  |
| BurnedTower_1F | 15,12 | VAR_ECRUTEAK_CITY_STATE = 2 |  |
| CherrygroveCity | 57,9 | VAR_CHERRYGROVE_CITY_STATE = 0 |  |
| CherrygroveCity | 57,10 | VAR_CHERRYGROVE_CITY_STATE = 0 |  |
| CherrygroveCity | 57,11 | VAR_CHERRYGROVE_CITY_STATE = 0 |  |
| CherrygroveCity | 56,10 | VAR_CHERRYGROVE_CITY_STATE = 3 |  |
| CherrygroveCity | 56,9 | VAR_CHERRYGROVE_CITY_STATE = 3 |  |
| CherrygroveCity | 56,11 | VAR_CHERRYGROVE_CITY_STATE = 3 |  |
| DragonsDen_Cavern | 30,14 | VAR_BLACKTHORN_CITY_STATE = 3 |  |
| EcruteakCity | 39,41 | VAR_ECRUTEAK_CITY_THEATER = 4 |  |
| FuchsiaCity_SafariZoneEntrance | 4,5 | VAR_TEMP_0 = 0 |  |
| FuchsiaCity_SafariZoneEntrance | 5,5 | VAR_TEMP_0 = 0 |  |
| FuchsiaCity_SafariZoneEntrance | 6,5 | VAR_TEMP_0 = 0 |  |
| Gate_CeladonCity_Route16 | 6,4 | VAR_TEMP_0 = 0 | FLAG_SYS_CYCLING_ROAD |
| Gate_CeladonCity_Route16 | 6,5 | VAR_TEMP_0 = 0 | FLAG_SYS_CYCLING_ROAD |
| Gate_CeladonCity_Route16 | 6,6 | VAR_TEMP_0 = 0 | FLAG_SYS_CYCLING_ROAD |
| Gate_FuchsiaCity_Route18 | 6,4 | VAR_TEMP_0 = 0 | FLAG_SYS_CYCLING_ROAD |
| Gate_FuchsiaCity_Route18 | 6,5 | VAR_TEMP_0 = 0 | FLAG_SYS_CYCLING_ROAD |
| Gate_FuchsiaCity_Route18 | 6,6 | VAR_TEMP_0 = 0 | FLAG_SYS_CYCLING_ROAD |
| GoldenrodCity_DepartmentStoreBasement | 10,7 | VAR_TEMP_0 = 0 |  |
| GoldenrodCity_DepartmentStore_1F | 9,5 | VAR_TEMP_0 = 0 |  |
| GoldenrodCity_DepartmentStore_2F | 9,5 | VAR_TEMP_0 = 0 |  |
| GoldenrodCity_DepartmentStore_3F | 9,5 | VAR_TEMP_0 = 0 |  |
| GoldenrodCity_DepartmentStore_4F | 9,5 | VAR_TEMP_0 = 0 |  |
| GoldenrodCity_DepartmentStore_5F | 9,5 | VAR_TEMP_0 = 0 |  |
| GoldenrodCity_DepartmentStore_6F | 9,5 | VAR_TEMP_0 = 0 |  |
| GoldenrodCity_Gym | 15,11 | VAR_GOLDENROD_CITY_STATE = 3 |  |
| GoldenrodCity_Gym | 15,11 | VAR_GOLDENROD_CITY_STATE = 4 |  |
| GoldenrodCity_UndergroundSwitches | 26,5 | VAR_GOLDENROD_CITY_STATE = 8 |  |
| GoldenrodCity_UndergroundSwitches | 26,6 | VAR_GOLDENROD_CITY_STATE = 8 |  |
| IcePath_1F | 49,29 | VAR_ICE_PATH_STATE = 0 |  |
| LilycoveCity_CoveLilyMotel_1F | 10,2 | VAR_TEMP_1 = 0 |  |
| LittlerootTown | 10,1 | VAR_GARBAGEVAR = 0 |  |
| LittlerootTown | 11,1 | VAR_GARBAGEVAR = 0 |  |
| LittlerootTown_BrendansHouse_1F | 8,8 | VAR_GARBAGEVAR = 4 |  |
| LittlerootTown_MaysHouse_1F | 2,8 | VAR_GARBAGEVAR = 4 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 1 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 1 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 1 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 2 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 2 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 2 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 3 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 3 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 3 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 4 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 4 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 4 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 5 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 5 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 5 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 6 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 6 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 6 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 7 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 8 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 9 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 10 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 11 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 12 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 13 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 14 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 15 |  |
| Mahoganytown | 30,12 | VAR_MAHOGANY_TOWN_STATE = 16 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 16 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 15 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 14 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 13 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 12 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 11 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 10 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 9 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 8 |  |
| Mahoganytown | 30,13 | VAR_MAHOGANY_TOWN_STATE = 7 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 16 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 15 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 14 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 13 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 12 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 11 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 10 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 9 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 8 |  |
| Mahoganytown | 30,14 | VAR_MAHOGANY_TOWN_STATE = 7 |  |
| MeteorFalls_1F_1R | 14,18 | VAR_METEOR_FALLS_STATE = 0 |  |
| MtPyre_Summit | 22,9 | VAR_MT_PYRE_STATE = 2 |  |
| MtPyre_Summit | 23,9 | VAR_MT_PYRE_STATE = 2 |  |
| MtPyre_Summit | 24,9 | VAR_MT_PYRE_STATE = 2 |  |
| NationalPark_BugContest | 11,49 | VAR_TEMP_0 = 0 |  |
| NationalPark_BugContest | 12,49 | VAR_TEMP_0 = 0 |  |
| NationalPark_BugContest | 13,49 | VAR_TEMP_0 = 0 |  |
| NationalPark_BugContest | 14,49 | VAR_TEMP_0 = 0 |  |
| NewBarkTown | 0,12 | VAR_NEWBARK_TOWN_STATE = 2 |  |
| NewBarkTown | 0,13 | VAR_NEWBARK_TOWN_STATE = 2 |  |
| NewBarkTown | 0,14 | VAR_NEWBARK_TOWN_STATE = 2 |  |
| NewBarkTown | 0,12 | VAR_NEWBARK_TOWN_STATE = 4 |  |
| NewBarkTown | 0,13 | VAR_NEWBARK_TOWN_STATE = 4 |  |
| NewBarkTown | 0,14 | VAR_NEWBARK_TOWN_STATE = 4 |  |
| NewBarkTown_Lab | 5,8 | VAR_NEWBARKTOWN_LABSTATE = 1 |  |
| NewBarkTown_Lab | 6,8 | VAR_NEWBARKTOWN_LABSTATE = 1 |  |
| NewBarkTown_Lab | 7,8 | VAR_NEWBARKTOWN_LABSTATE = 1 |  |
| NewBarkTown_Lab | 5,7 | VAR_NEWBARKTOWN_LABSTATE = 0 |  |
| NewBarkTown_Lab | 6,7 | VAR_NEWBARKTOWN_LABSTATE = 0 |  |
| NewBarkTown_Lab | 7,7 | VAR_NEWBARKTOWN_LABSTATE = 0 |  |
| NewBarkTown_PlayersHouse_1F | 10,3 | VAR_NEWBARK_TOWN_STATE = 1 |  |
| NewBarkTown_PlayersHouse_1F | 9,2 | VAR_NEWBARK_TOWN_STATE = 1 |  |
| NewBarkTown_PlayersHouse_2F | 9,3 | VAR_NEWBARK_TOWN_STATE = 0 |  |
| NewBarkTown_PlayersHouse_2F | 10,3 | VAR_NEWBARK_TOWN_STATE = 0 |  |
| OldaleTown | 0,10 | VAR_GARBAGEVAR = 0 |  |
| PetalburgCity | 8,10 | VAR_GARBAGEVAR = 0 |  |
| PetalburgCity | 8,11 | VAR_GARBAGEVAR = 0 |  |
| PetalburgCity | 8,12 | VAR_GARBAGEVAR = 0 |  |
| PetalburgCity | 8,13 | VAR_GARBAGEVAR = 0 |  |
| PokemonLeague_ChampionsRoom | 5,14 | VAR_TEMP_0 = 1 |  |
| PokemonLeague_ChampionsRoom | 6,14 | VAR_TEMP_0 = 1 |  |
| PokemonLeague_ChampionsRoom | 7,14 | VAR_TEMP_0 = 1 |  |
| ReceptionGate | 11,14 | VAR_ROUTE27_STATE = 1 | FLAG_BADGE08_GET |
| RocketHideout_B2F | 8,24 | VAR_MAHOGANY_TOWN_STATE = 5 |  |
| RocketHideout_B2F | 9,24 | VAR_MAHOGANY_TOWN_STATE = 5 |  |
| RocketHideout_B2F | 10,24 | VAR_MAHOGANY_TOWN_STATE = 5 |  |
| RocketHideout_B2F | 15,18 | VAR_MAHOGANY_TOWN_STATE = 12 |  |
| RocketHideout_B2F | 14,18 | VAR_MAHOGANY_TOWN_STATE = 12 |  |
| RocketHideout_B2F | 16,18 | VAR_MAHOGANY_TOWN_STATE = 12 |  |
| RocketHideout_B2F | 14,17 | VAR_MAHOGANY_TOWN_STATE = 13 |  |
| RocketHideout_B2F | 14,16 | VAR_MAHOGANY_TOWN_STATE = 13 |  |
| RocketHideout_B2F | 14,18 | VAR_MAHOGANY_TOWN_STATE = 13 |  |
| Route101 | 10,19 | VAR_GARBAGEVAR = 1 |  |
| Route101 | 11,19 | VAR_GARBAGEVAR = 1 |  |
| Route101 | 10,18 | VAR_GARBAGEVAR = 2 |  |
| Route101 | 11,18 | VAR_GARBAGEVAR = 2 |  |
| Route101 | 6,16 | VAR_GARBAGEVAR = 2 |  |
| Route101 | 6,15 | VAR_GARBAGEVAR = 2 |  |
| Route101 | 6,17 | VAR_GARBAGEVAR = 2 |  |
| Route101 | 6,18 | VAR_GARBAGEVAR = 2 |  |
| Route101 | 7,13 | VAR_GARBAGEVAR = 2 |  |
| Route104 | 17,51 | VAR_GARBAGEVAR = 1 | FLAG_DEFEATED_RIVAL_ROUTE_104, FLAG_REGISTER_RIVAL_POKENAV |
| Route110_SeasideCyclingRoadNorthEntrance | 7,4 | VAR_TEMP_1 = 0 |  |
| Route110_SeasideCyclingRoadSouthEntrance | 7,4 | VAR_TEMP_1 = 0 |  |
| Route110_TrickHouseEnd | 2,2 | VAR_TEMP_2 = 0 |  |
| Route111 | 11,61 | VAR_TEMP_3 = 0 | ITEM_GO_GOGGLES |
| Route111 | 12,61 | VAR_TEMP_3 = 0 | ITEM_GO_GOGGLES |
| Route111 | 13,61 | VAR_TEMP_3 = 0 | ITEM_GO_GOGGLES |
| Route111 | 12,44 | VAR_TEMP_3 = 0 | ITEM_GO_GOGGLES |
| Route111 | 13,43 | VAR_TEMP_3 = 0 | ITEM_GO_GOGGLES |
| Route111 | 14,42 | VAR_TEMP_3 = 0 | ITEM_GO_GOGGLES |
| Route111 | 16,40 | VAR_TEMP_3 = 0 | ITEM_GO_GOGGLES |
| Route111 | 14,61 | VAR_TEMP_3 = 0 | ITEM_GO_GOGGLES |
| Route111 | 17,39 | VAR_TEMP_3 = 0 | ITEM_GO_GOGGLES |
| Route111 | 18,38 | VAR_TEMP_3 = 0 | ITEM_GO_GOGGLES |
| Route121_SafariZoneGate_SafariZoneEntrance | 8,4 | VAR_TEMP_1 = 0 |  |
| Route14 | 14,42 | VAR_SUICUNE_ENCOUNTERS = 4 |  |
| Route14 | 15,42 | VAR_SUICUNE_ENCOUNTERS = 4 |  |
| Route14 | 16,42 | VAR_SUICUNE_ENCOUNTERS = 4 |  |
| Route14 | 17,42 | VAR_SUICUNE_ENCOUNTERS = 4 |  |
| Route25 | 66,11 | VAR_SUICUNE_ENCOUNTERS = 6 |  |
| Route25 | 65,11 | VAR_SUICUNE_ENCOUNTERS = 6 |  |
| Route32 | 27,10 | VAR_VIOLET_CITY_STATE = 1 | FLAG_DEFEATED_VIOLET_GYM, FLAG_HIDE_SPROUT_TOWER_SILVER, FLAG_RECEIVED_TOGEPI_EGG |
| Route32 | 28,10 | VAR_VIOLET_CITY_STATE = 1 | FLAG_DEFEATED_VIOLET_GYM, FLAG_HIDE_SPROUT_TOWER_SILVER, FLAG_RECEIVED_TOGEPI_EGG |
| Route32 | 29,10 | VAR_VIOLET_CITY_STATE = 1 | FLAG_DEFEATED_VIOLET_GYM, FLAG_HIDE_SPROUT_TOWER_SILVER, FLAG_RECEIVED_TOGEPI_EGG |
| Route32 | 29,10 | VAR_VIOLET_CITY_STATE = 2 | FLAG_DEFEATED_VIOLET_GYM, FLAG_HIDE_SPROUT_TOWER_SILVER, FLAG_RECEIVED_TOGEPI_EGG |
| Route32 | 28,10 | VAR_VIOLET_CITY_STATE = 2 | FLAG_DEFEATED_VIOLET_GYM, FLAG_HIDE_SPROUT_TOWER_SILVER, FLAG_RECEIVED_TOGEPI_EGG |
| Route32 | 27,10 | VAR_VIOLET_CITY_STATE = 2 | FLAG_DEFEATED_VIOLET_GYM, FLAG_HIDE_SPROUT_TOWER_SILVER, FLAG_RECEIVED_TOGEPI_EGG |
| Route32 | 27,10 | VAR_VIOLET_CITY_STATE = 4 | FLAG_DEFEATED_VIOLET_GYM, FLAG_HIDE_SPROUT_TOWER_SILVER, FLAG_RECEIVED_TOGEPI_EGG |
| Route32 | 28,10 | VAR_VIOLET_CITY_STATE = 4 | FLAG_DEFEATED_VIOLET_GYM, FLAG_HIDE_SPROUT_TOWER_SILVER, FLAG_RECEIVED_TOGEPI_EGG |
| Route32 | 29,10 | VAR_VIOLET_CITY_STATE = 4 | FLAG_DEFEATED_VIOLET_GYM, FLAG_HIDE_SPROUT_TOWER_SILVER, FLAG_RECEIVED_TOGEPI_EGG |
| Route42 | 36,15 | VAR_TEMP_0 = 0 |  |
| SSAqua_1F | 28,8 | VAR_SSAQUA_STATE = 1 |  |
| SSAqua_1F | 29,8 | VAR_SSAQUA_STATE = 1 |  |
| SSAqua_B1F | 29,8 | VAR_SSAQUA_STATE = 2 |  |
| SafariZoneGate_SafariZoneEntrance | 9,2 | VAR_TEMP_0 = 0 |  |
| SlateportCity | 10,13 | VAR_SLATEPORT_OUTSIDE_MUSEUM_STATE = 2 |  |
| SlateportCity_Harbor | 8,14 | VAR_SLATEPORT_HARBOR_STATE = 1 |  |
| SlateportCity_OceanicMuseum_1F | 9,7 | VAR_SLATEPORT_MUSEUM_1F_STATE = 0 | FLAG_DELIVERED_DEVON_GOODS |
| SlateportCity_OceanicMuseum_1F | 10,7 | VAR_SLATEPORT_MUSEUM_1F_STATE = 0 | FLAG_DELIVERED_DEVON_GOODS |
| TinTower_RoofDay | 10,13 | VAR_COMPLETED_HO_OH = 2 |  |
| TinTower_RoofNight | 10,13 | VAR_COMPLETED_HO_OH = 2 |  |
| TrainerHill_Entrance | 9,6 | VAR_TRAINER_HILL_IS_ACTIVE = 0 | FLAG_SYS_GAME_CLEAR |
| VermilionCity | 49,20 | VAR_SUICUNE_ENCOUNTERS = 3 |  |
| VermilionCity | 50,20 | VAR_SUICUNE_ENCOUNTERS = 3 |  |
| VermilionCity | 51,20 | VAR_SUICUNE_ENCOUNTERS = 3 |  |
| WhirlIslands_LugiaChamber | 29,22 | VAR_COMPLETED_LUGIA = 2 |  |

Comprobaciones de medalla u objeto (504):

| Mapa | Evento | Medallas | Objetos |
|---|---|---|---|
| AbandonedShip_CaptainsOffice | object 3,4 |  | ITEM_SCANNER |
| AbandonedShip_Corridors_B1F | sign 11,4 |  | ITEM_STORAGE_KEY |
| AbandonedShip_HiddenFloorCorridors | sign 3,8 |  | ITEM_ROOM_1_KEY |
| AbandonedShip_HiddenFloorCorridors | sign 6,8 |  | ITEM_ROOM_2_KEY |
| AbandonedShip_HiddenFloorCorridors | sign 3,4 |  | ITEM_ROOM_4_KEY |
| AbandonedShip_HiddenFloorCorridors | sign 9,4 |  | ITEM_ROOM_6_KEY |
| AzaleaTown_Gym | object 12,42 | FLAG_BADGE02_GET |  |
| BattleFrontier_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| BattleFrontier_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| BlackthornCity | object 25,27 | FLAG_BADGE05_GET, FLAG_BADGE06_GET, FLAG_BADGE07_GET |  |
| BurnedTower_B1F | object 6,13 | FLAG_BADGE03_GET |  |
| CeladonCity | object 52,22 | FLAG_BADGE02_GET |  |
| CeladonCity | object 40,35 | FLAG_BADGE02_GET |  |
| CeladonCity_Gym | object 7,14 | FLAG_BADGE02_GET |  |
| CeladonCity_Gym | object 6,14 | FLAG_BADGE02_GET |  |
| CeladonCity_Gym | object 5,14 | FLAG_BADGE02_GET |  |
| CeladonCity_Gym | sign 8,16 | FLAG_BADGE12_GET |  |
| CeladonCity_Gym | sign 4,16 | FLAG_BADGE12_GET |  |
| CeruleanCave_1F | object 16,21 | FLAG_BADGE01_GET |  |
| CeruleanCave_1F | object 16,22 | FLAG_BADGE01_GET |  |
| CeruleanCave_1F | object 16,23 | FLAG_BADGE01_GET |  |
| CeruleanCave_1F | object 15,23 | FLAG_BADGE01_GET |  |
| CeruleanCave_1F | object 7,21 | FLAG_BADGE01_GET |  |
| CeruleanCave_1F | object 21,14 | FLAG_BADGE01_GET |  |
| CeruleanCave_1F | object 34,17 | FLAG_BADGE01_GET |  |
| CeruleanCave_1F | object 35,18 | FLAG_BADGE01_GET |  |
| CeruleanCave_1F | object 36,18 | FLAG_BADGE01_GET |  |
| CeruleanCave_B1F | object 5,13 | FLAG_BADGE01_GET |  |
| CeruleanCave_B1F | object 10,14 | FLAG_BADGE01_GET |  |
| CeruleanCave_B1F | object 13,21 | FLAG_BADGE01_GET |  |
| CeruleanCave_B1F | object 22,17 | FLAG_BADGE01_GET |  |
| CeruleanCave_B1F | object 28,21 | FLAG_BADGE01_GET |  |
| CeruleanCave_B1F | object 34,18 | FLAG_BADGE01_GET |  |
| CeruleanCave_B1F | object 26,12 | FLAG_BADGE01_GET |  |
| CeruleanCave_B1F | object 34,11 | FLAG_BADGE01_GET |  |
| CeruleanCave_B1F | object 29,6 | FLAG_BADGE01_GET |  |
| CeruleanCave_B1F | object 14,7 | FLAG_BADGE01_GET |  |
| CeruleanCave_B2F | object 14,6 | FLAG_BADGE01_GET |  |
| CeruleanCave_B2F | object 23,3 | FLAG_BADGE01_GET |  |
| CeruleanCave_B2F | object 19,13 | FLAG_BADGE01_GET |  |
| CeruleanCave_B2F | object 21,21 | FLAG_BADGE01_GET |  |
| CeruleanCave_B2F | object 30,21 | FLAG_BADGE01_GET |  |
| CeruleanCity_Gym | sign 4,16 | FLAG_BADGE10_GET |  |
| CeruleanCity_Gym | sign 10,16 | FLAG_BADGE10_GET |  |
| CianwoodCity | object 18,47 | FLAG_BADGE05_GET |  |
| CianwoodCity | object 10,26 | FLAG_BADGE01_GET |  |
| CianwoodCity | object 10,27 | FLAG_BADGE01_GET |  |
| CianwoodCity | object 11,27 | FLAG_BADGE01_GET |  |
| CianwoodCity | object 12,31 | FLAG_BADGE01_GET |  |
| CianwoodCity | object 13,31 | FLAG_BADGE01_GET |  |
| CianwoodCity | object 12,30 | FLAG_BADGE01_GET |  |
| CianwoodGym | object 10,8 | FLAG_BADGE03_GET |  |
| CianwoodGym | object 10,4 | FLAG_BADGE03_GET |  |
| CianwoodGym | object 10,6 | FLAG_BADGE03_GET |  |
| CianwoodGym | object 11,2 | FLAG_BADGE01_GET |  |
| CianwoodGym | object 9,2 | FLAG_BADGE01_GET |  |
| CianwoodHouse1 | object 4,4 |  | ITEM_CLEAR_BELL, ITEM_TIDAL_BELL |
| CianwoodHouse3 | object 4,4 | FLAG_BADGE01_GET |  |
| CianwoodShop | object 8,7 |  | ITEM_SECRET_POTION |
| CliffEdgeCave | object 21,25 | FLAG_BADGE01_GET |  |
| CliffEdgeCave | object 21,24 | FLAG_BADGE01_GET |  |
| CliffEdgeCave | object 22,24 | FLAG_BADGE01_GET |  |
| CliffEdgeCave | object 11,8 | FLAG_BADGE01_GET |  |
| CliffEdgeCave | object 31,11 | FLAG_BADGE01_GET |  |
| CliffEdgeCave | object 12,9 | FLAG_BADGE01_GET |  |
| CliffEdgeCave | object 10,7 | FLAG_BADGE01_GET |  |
| CliffEdgeCave | object 21,26 | FLAG_BADGE01_GET |  |
| CliffEdgeCave | object 22,25 | FLAG_BADGE01_GET |  |
| CliffEdgeCave | object 23,24 | FLAG_BADGE01_GET |  |
| DarkCave_NorthSide | object 28,5 | FLAG_BADGE01_GET |  |
| DarkCave_NorthSide | object 5,6 | FLAG_BADGE01_GET |  |
| DarkCave_SouthSide | object 23,19 | FLAG_BADGE01_GET |  |
| DarkCave_SouthSide | object 18,19 | FLAG_BADGE01_GET |  |
| DarkCave_SouthSide | object 43,12 | FLAG_BADGE01_GET |  |
| DarkCave_SouthSide | object 58,43 | FLAG_BADGE01_GET |  |
| DewfordTown_Gym | sign 4,23 | FLAG_BADGE02_GET |  |
| DewfordTown_Gym | sign 7,23 | FLAG_BADGE02_GET |  |
| DewfordTown_Gym | sign 4,24 | FLAG_BADGE02_GET |  |
| DewfordTown_Gym | sign 7,24 | FLAG_BADGE02_GET |  |
| DewfordTown_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| DewfordTown_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| DragonsDen_Cavern | object 24,22 | FLAG_BADGE07_GET |  |
| DragonsDen_Cavern | object 15,39 | FLAG_BADGE07_GET |  |
| DragonsDen_Cavern | object 15,38 | FLAG_BADGE07_GET |  |
| DragonsDen_Cavern | object 16,39 | FLAG_BADGE07_GET |  |
| DragonsDen_Cavern | object 15,39 | FLAG_BADGE07_GET |  |
| DragonsDen_Cavern | object 16,38 | FLAG_BADGE07_GET |  |
| DragonsDen_Cavern | object 25,22 | FLAG_BADGE07_GET |  |
| DragonsDen_Cavern | object 24,22 | FLAG_BADGE07_GET |  |
| DragonsDen_Cavern | object 24,21 | FLAG_BADGE07_GET |  |
| DragonsDen_Cavern | object 25,21 | FLAG_BADGE07_GET |  |
| EcruteakCity_SageOffice1 | object 16,2 |  | ITEM_CLEAR_BELL |
| EverGrandeCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| EverGrandeCity_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| EverGrandeCity_PokemonLeague_1F | object 8,2 | FLAG_BADGE06_GET |  |
| EverGrandeCity_PokemonLeague_1F | object 11,2 | FLAG_BADGE06_GET |  |
| EverGrandeCity_PokemonLeague_2F | object 1,2 |  | ITEM_EON_TICKET |
| EverGrandeCity_PokemonLeague_2F | object 3,2 | FLAG_BADGE05_GET |  |
| FallarborTown_CozmosHouse | object 6,4 |  | ITEM_METEORITE |
| FallarborTown_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| FallarborTown_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| FieryPath | object 10,15 | FLAG_BADGE03_GET |  |
| FieryPath | object 17,15 | FLAG_BADGE03_GET |  |
| FieryPath | object 8,11 | FLAG_BADGE03_GET |  |
| FieryPath | object 3,12 | FLAG_BADGE03_GET |  |
| FieryPath | object 6,23 | FLAG_BADGE03_GET |  |
| FieryPath | object 5,24 | FLAG_BADGE03_GET |  |
| FortreeCity | object 25,8 |  | ITEM_DEVON_SCOPE |
| FortreeCity_Gym | sign 14,21 | FLAG_BADGE06_GET |  |
| FortreeCity_Gym | sign 17,21 | FLAG_BADGE06_GET |  |
| FortreeCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| FortreeCity_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| FuchsiaCity | object 23,22 | FLAG_BADGE02_GET |  |
| FuchsiaCity_SafariZoneEntrance | object 12,5 |  | ITEM_EON_TICKET |
| GoldenrodCity_DepartmentStoreBasement | object 16,11 |  | ITEM_CARD_KEY |
| GoldenrodCity_FlowerShop | object 2,4 | FLAG_BADGE03_GET |  |
| GoldenrodCity_FlowerShop | object 8,4 | FLAG_BADGE04_GET |  |
| GoldenrodCity_FlowerShop | object 11,5 | FLAG_BADGE03_GET |  |
| GoldenrodCity_Gym | object 10,20 | FLAG_BADGE03_GET |  |
| GoldenrodCity_RadioTower_3F | sign 25,9 |  | ITEM_CARD_KEY |
| GoldenrodCity_RadioTower_3F | sign 26,9 |  | ITEM_CARD_KEY |
| GoldenrodCity_RadioTower_3F | sign 27,9 |  | ITEM_CARD_KEY |
| GoldenrodCity_RadioTower_3F | sign 28,9 |  | ITEM_CARD_KEY |
| GoldenrodCity_RadioTower_3F | sign 29,9 |  | ITEM_CARD_KEY |
| GoldenrodCity_RadioTower_3F | sign 30,9 |  | ITEM_CARD_KEY |
| GoldenrodCity_RadioTower_3F | sign 31,9 |  | ITEM_CARD_KEY |
| GoldenrodCity_TrainStation | object 16,20 |  | ITEM_PASS |
| GoldenrodCity_UndergroundStorage | object 13,8 |  | ITEM_CARD_KEY |
| GoldenrodCity_UndergroundTunnel | sign 12,10 |  | ITEM_BASEMENT_KEY |
| GraniteCave_B2F | object 5,14 | FLAG_BADGE01_GET |  |
| GraniteCave_B2F | object 3,14 | FLAG_BADGE01_GET |  |
| GraniteCave_B2F | object 2,16 | FLAG_BADGE01_GET |  |
| GraniteCave_B2F | object 7,12 | FLAG_BADGE01_GET |  |
| GraniteCave_B2F | object 4,22 | FLAG_BADGE01_GET |  |
| GraniteCave_B2F | object 6,22 | FLAG_BADGE01_GET |  |
| GraniteCave_B2F | object 3,21 | FLAG_BADGE01_GET |  |
| IcePath_B4F | object 12,19 | FLAG_BADGE01_GET |  |
| IcePath_B4F | object 9,20 | FLAG_BADGE01_GET |  |
| IcePath_B4F | object 7,19 | FLAG_BADGE01_GET |  |
| IcePath_B4F | object 13,13 | FLAG_BADGE01_GET |  |
| IcePath_B4F | object 17,13 | FLAG_BADGE01_GET |  |
| IcePath_B4F | object 19,14 | FLAG_BADGE01_GET |  |
| IcePath_B4F | object 21,15 | FLAG_BADGE01_GET |  |
| IcePath_B4F | object 23,17 | FLAG_BADGE01_GET |  |
| IcePath_B4F | object 20,22 | FLAG_BADGE01_GET |  |
| IcePath_B4F | object 14,22 | FLAG_BADGE01_GET |  |
| IlexForest | object 32,40 | FLAG_BADGE02_GET |  |
| LavaridgeTown_Gym_1F | sign 10,15 | FLAG_BADGE04_GET |  |
| LavaridgeTown_Gym_1F | sign 16,15 | FLAG_BADGE04_GET |  |
| LavaridgeTown_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| LavaridgeTown_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| LilycoveCity | object 15,18 | FLAG_BADGE07_GET |  |
| LilycoveCity | object 57,17 | FLAG_BADGE07_GET |  |
| LilycoveCity_CoveLilyMotel_1F | object 10,3 | FLAG_BADGE07_GET |  |
| LilycoveCity_Harbor | object 8,10 |  | ITEM_AURORA_TICKET, ITEM_EON_TICKET, ITEM_MYSTIC_TICKET, ITEM_OLD_SEA_MAP |
| LilycoveCity_PokemonCenter_1F | object 11,8 | FLAG_BADGE07_GET |  |
| LilycoveCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| LilycoveCity_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| LittlerootTown_BrendansHouse_1F | object 2,6 | FLAG_BADGE05_GET |  |
| LittlerootTown_MaysHouse_1F | object 8,6 | FLAG_BADGE05_GET |  |
| MagmaHideout_1F | object 5,22 | FLAG_BADGE03_GET |  |
| MagmaHideout_1F | object 7,22 | FLAG_BADGE03_GET |  |
| MagmaHideout_1F | object 6,23 | FLAG_BADGE03_GET |  |
| MauvilleCity_Gym | sign 3,18 | FLAG_BADGE03_GET |  |
| MauvilleCity_Gym | sign 6,18 | FLAG_BADGE03_GET |  |
| MauvilleCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| MauvilleCity_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| MirageTower_3F | object 3,7 | FLAG_BADGE01_GET |  |
| MirageTower_3F | object 4,8 | FLAG_BADGE01_GET |  |
| MirageTower_4F | object 6,7 | FLAG_BADGE01_GET |  |
| MossdeepCity_Gym | sign 4,34 | FLAG_BADGE07_GET |  |
| MossdeepCity_Gym | sign 8,34 | FLAG_BADGE07_GET |  |
| MossdeepCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| MossdeepCity_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| MtMortar_1F_North | object 22,43 | FLAG_BADGE03_GET |  |
| MtMortar_B1F | object 9,10 | FLAG_BADGE03_GET |  |
| MtSilver_2F | object 48,3 | FLAG_BADGE01_GET |  |
| MtSilver_2F | object 47,2 | FLAG_BADGE01_GET |  |
| MtSilver_2F | object 3,26 | FLAG_BADGE01_GET |  |
| MtSilver_2F | object 3,25 | FLAG_BADGE01_GET |  |
| MtSilver_2F | object 3,24 | FLAG_BADGE01_GET |  |
| NationalPark_Normal | object 26,3 | FLAG_BADGE02_GET |  |
| NewMauville_Entrance | trigger 4,2 |  | ITEM_BASEMENT_KEY |
| OldaleTown_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| OldaleTown_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| OlivineCity | object 26,52 |  | ITEM_AURORA_TICKET |
| OlivineCity_PortInside | object 8,17 |  | ITEM_SS_TICKET |
| PacifidlogTown_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| PacifidlogTown_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| PetalburgCity_Gym | sign 1,110 | FLAG_BADGE05_GET |  |
| PetalburgCity_Gym | sign 7,110 | FLAG_BADGE05_GET |  |
| PetalburgCity_PokemonCenter_2F | object 1,2 |  | ITEM_EON_TICKET |
| PetalburgCity_PokemonCenter_2F | object 3,2 | FLAG_BADGE05_GET |  |
| PetalburgWoods | object 19,10 | FLAG_BADGE02_GET |  |
| PetalburgWoods | object 19,11 | FLAG_BADGE02_GET |  |
| PewterCity | object 37,19 |  | ITEM_RAINBOW_WING, ITEM_SILVER_WING |
| PewterCity_Gym | sign 4,12 | FLAG_BADGE09_GET |  |
| PewterCity_Gym | sign 8,12 | FLAG_BADGE09_GET |  |
| PewterCity_Museum_1F | object 26,7 | FLAG_BADGE04_GET | ITEM_CLAW_FOSSIL, ITEM_DOME_FOSSIL, ITEM_HELIX_FOSSIL, ITEM_OLD_AMBER, ITEM_ROOT_FOSSIL |
| ReceptionGate | trigger 11,14 | FLAG_BADGE08_GET |  |
| … | 304 filas más en el JSON | | |

