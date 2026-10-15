# Etapas de gimnasio (generado)

Generado por `unified-world/extract_stages.py` a partir de `levels.json`; no editar a mano.

Regla: con **N** medallas, el as del líder sale de la escalera natural formada por los 24 aces originales
ordenados por nivel. Los equipos **draft** son mecánicos y **no están revisados**: no incluyen movimientos,
objetos ni estrategia. Supuestos propios: formas no-nivel retroceden bajo el nivel 30; los miembros añadidos van 2 niveles bajo el as.

## Escalera y etapas

| Etapa | Medallas | As (de la escalera real) | As medio | Pokémon medidos (mín–máx) | Tamaño usado |
|--:|---|---|--:|---|--:|
| 1 | 0–3 | 11–16 | 14 | 2–3 | 3 |
| 2 | 4–7 | 19–24 | 22 | 2–4 | 3 |
| 3 | 8–15 | 24–33 | 28 | 3–5 | 4 |
| 4 | 16–23 | 36–50 | 43 | 4–5 | 5 |

Escalera completa (nivel del as con N medallas previas, N = 0…23): 11, 14, 15, 16, 19, 21, 21, 24, 24, 25, 29, 29, 31, 31, 33, 33, 36, 42, 43, 43, 45, 46, 47, 50

## Cobertura

De 96 configuraciones (24 líderes × 4 etapas): **37 con un equipo real** de alguna fuente y **59 draft**. Con miembros que faltan: 0.

| Líder | Región | Equipos reales disponibles | E1 | E2 | E3 | E4 |
|---|---|--:|---|---|---|---|
| ROXANNE | hoenn | 5 | R 15/3 | D 22/3 | D 28/4 | R 42/5 |
| BRAWLY | hoenn | 5 | D 14/3 | R 19/3 | D 28/4 | R 42/4 |
| WATTSON | hoenn | 5 | D 14/3 | R 24/4 | R 24/4 | R 45/5 |
| FLANNERY | hoenn | 5 | D 14/3 | D 22/3 | R 29/4 | R 45/5 |
| NORMAN | hoenn | 5 | D 14/3 | D 22/3 | R 31/4 | R 45/4 |
| WINONA | hoenn | 5 | D 14/3 | D 22/3 | R 33/5 | R 45/5 |
| TATE_LIZA | hoenn | 5 | D 14/3 | D 22/3 | D 28/4 | R 42/4 |
| JUAN | hoenn | 5 | D 14/3 | D 22/3 | D 28/4 | R 46/5 |
| FALKNER | johto | 4 | R 11/2 | D 22/3 | D 28/4 | D 43/5 |
| BUGSY | johto | 4 | R 16/3 | R 17/3 | D 28/4 | D 43/5 |
| WHITNEY | johto | 4 | D 14/3 | R 21/3 | D 28/4 | D 43/5 |
| MORTY | johto | 4 | D 14/3 | R 25/4 | R 25/4 | D 43/5 |
| CHUCK | johto | 6 | D 14/3 | D 22/3 | R 31/4 | R 38/5 |
| JASMINE | johto | 6 | D 14/3 | D 22/3 | R 35/3 | R 38/5 |
| PRYCE | johto | 6 | D 14/3 | D 22/3 | R 33/4 | R 38/5 |
| CLAIR | johto | 5 | D 14/3 | D 22/3 | D 28/4 | R 45/5 |
| BROCK | kanto | 4 | R 14/2 | D 22/3 | D 28/4 | D 43/5 |
| MISTY | kanto | 4 | D 14/3 | R 21/2 | D 28/4 | D 43/5 |
| LT_SURGE | kanto | 4 | D 14/3 | R 24/3 | R 24/3 | D 43/5 |
| ERIKA | kanto | 4 | D 14/3 | D 22/3 | R 29/3 | D 43/5 |
| KOGA | kanto | 1 | D 14/3 | D 22/3 | D 28/4 | R 43/4 |
| SABRINA | kanto | 4 | D 14/3 | D 22/3 | D 28/4 | R 43/4 |
| BLAINE | kanto | 4 | D 14/3 | D 22/3 | D 28/4 | R 47/4 |
| GIOVANNI | kanto | 1 | D 14/3 | D 22/3 | D 28/4 | R 50/5 |

R = equipo real; D = draft; formato «nivel del as / Pokémon».

Drafts con una especie repetida: 26 (parte viene del equipo original, p. ej. los dos Geodude de Roxanne; otros salen de reajustar la evolución y deben revisarse a mano): ROXANNE E2, FLANNERY E1, FLANNERY E2, FALKNER E2, FALKNER E3, MORTY E1, MORTY E4, JASMINE E1, JASMINE E2, CLAIR E3, MISTY E1, MISTY E3, LT_SURGE E1, LT_SURGE E4, KOGA E1, KOGA E2, KOGA E3, SABRINA E1, SABRINA E2, SABRINA E3, BLAINE E1, BLAINE E2, BLAINE E3, GIOVANNI E1, GIOVANNI E2, GIOVANNI E3

## Ejemplo: BROCK

**Etapa 1** — real (base `TRAINER_LEADER_BROCK` de firered)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Geodude | 12 |  |
| Onix | 14 |  |

**Etapa 2** — draft (base `TRAINER_LEADER_BROCK` de firered, desplazado +8)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Geodude | 20 |  |
| Onix | 22 |  |
| Aerodactyl | 20 | añadido de otro equipo del líder; sin datos de evolución (especie fuera de FireRed) |

**Etapa 3** — draft (base `TRAINER_LEADER_BROCK` de firered, desplazado +14)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Graveler | 26 | SPECIES_GEODUDE → SPECIES_GRAVELER |
| Onix | 28 |  |
| Aerodactyl | 26 | añadido de otro equipo del líder; sin datos de evolución (especie fuera de FireRed) |
| Kabuto | 26 | añadido de otro equipo del líder; SPECIES_KABUTOPS → SPECIES_KABUTO |

**Etapa 4** — draft (base `TRAINERCLASS_LEADER_BROCK#253` de heartgold, desplazado -11)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Graveler | 40 |  |
| Rhyhorn | 40 |  |
| Omastar | 42 |  |
| Onix | 43 |  |
| Kabutops | 41 |  |

## Ejemplo: FALKNER

**Etapa 1** — real (base `TRAINER_FALKNER_1` de hns)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Pidgey | 8 |  |
| Noctowl | 11 |  |

**Etapa 2** — draft (base `TRAINERCLASS_LEADER_FALKNER#20` de heartgold, desplazado +9)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Pidgeotto | 18 | SPECIES_PIDGEY → SPECIES_PIDGEOTTO |
| Pidgeotto | 22 |  |
| Wingull | 20 | añadido de otro equipo del líder; SPECIES_PELIPPER → SPECIES_WINGULL |

**Etapa 3** — draft (base `TRAINERCLASS_LEADER_FALKNER#20` de heartgold, desplazado +15)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Pidgeotto | 24 | SPECIES_PIDGEY → SPECIES_PIDGEOTTO |
| Pidgeotto | 28 |  |
| Pelipper | 26 | añadido de otro equipo del líder |
| Noctowl | 26 | añadido de otro equipo del líder |

**Etapa 4** — draft (base `TRAINERCLASS_LEADER_FALKNER#712` de heartgold, desplazado -13)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Pidgeot | 43 |  |
| Honchkrow | 41 | sin datos de evolución (especie fuera de FireRed) |
| Noctowl | 39 |  |
| Swellow | 39 |  |
| Staraptor | 37 | sin datos de evolución (especie fuera de FireRed) |

## Ejemplo: ROXANNE

**Etapa 1** — real (base `TRAINER_ROXANNE_1` de emerald)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Geodude | 12 |  |
| Geodude | 12 |  |
| Nosepass | 15 |  |

**Etapa 2** — draft (base `TRAINER_ROXANNE_1` de emerald, desplazado +7)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Geodude | 19 |  |
| Geodude | 19 |  |
| Nosepass | 22 | sin datos de evolución (especie fuera de FireRed) |

**Etapa 3** — draft (base `TRAINER_ROXANNE_2` de emerald, desplazado -9)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Geodude | 23 | SPECIES_GOLEM → SPECIES_GEODUDE |
| Kabuto | 26 |  |
| Onix | 26 |  |
| Nosepass | 28 | sin datos de evolución (especie fuera de FireRed) |

**Etapa 4** — real (base `TRAINER_ROXANNE_3` de emerald)

| Pokémon | Nivel | Notas |
|---|--:|---|
| Omanyte | 37 |  |
| Golem | 37 |  |
| Kabutops | 40 |  |
| Onix | 40 |  |
| Nosepass | 42 |  |

