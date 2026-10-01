# refs: índice (generado)

Generado por `npm run refs:check -- --write`; no editar a mano. Guía: [README.md](README.md).

## Fuentes fijadas

| Fuente | Commit | Nota |
|---|---|---|
| [pokeemerald](https://github.com/pret/pokeemerald) | `fe1d8e51b2` | GBA, C completo. Fuente de verdad de Emerald. |
| [pokeplatinum](https://github.com/pret/pokeplatinum) | `c248fb3f8c` | DS, C en progreso. Datos JSON de Gen 4. |
| [pokeheartgold](https://github.com/pret/pokeheartgold) | `9d8b7591f0` | DS, C + ensamblador, en progreso. Fijado; sin extractores todavía. |
| [pokeapi](https://github.com/PokeAPI/pokeapi) | `bc92d3b602` | CSV de datos de todas las generaciones. No es fuente de verdad. |

## Salidas

| Archivo | Fuente | Entradas | Generador |
|---|---|---:|---|
| `emerald/functions.json` | pokeemerald | 17889 | `tools/refs/emerald_functions.py` |
| `emerald/maps.json` | pokeemerald | 518 | `tools/refs/emerald_maps.py` |
| `emerald/moves.json` | pokeemerald | 355 | `tools/refs/emerald_data.py` |
| `emerald/moves_vs_firered.json` | pokeemerald | 1 | `tools/refs/compare_emerald.py` |
| `emerald/species.json` | pokeemerald | 412 | `tools/refs/emerald_data.py` |
| `emerald/species_vs_firered.json` | pokeemerald | 0 | `tools/refs/compare_emerald.py` |
| `emerald/summary.json` | pokeemerald | 310 | `tools/refs/emerald_summary.py` |
| `emerald/trainers.json` | pokeemerald | 855 | `tools/refs/emerald_trainers.py` |
| `heartgold/encounters.json` | pokeheartgold | 142 | `tools/refs/heartgold_data.py` |
| `heartgold/trainers.json` | pokeheartgold | 738 | `tools/refs/heartgold_data.py` |
| `platinum/moves.json` | pokeplatinum | 468 | `tools/refs/platinum_moves.py` |
| `platinum/moves_vs_firered.json` | pokeplatinum | 71 | `tools/refs/compare_platinum_moves.py` |
| `platinum/species.json` | pokeplatinum | 496 | `tools/refs/platinum_species.py` |
| `platinum/species_vs_firered.json` | pokeplatinum | 362 | `tools/refs/compare_platinum_species.py` |
| `pokeapi/megas.json` | pokeapi | 97 | `tools/refs/pokeapi_extras.py` |
| `pokeapi/names_es.json` | pokeapi | 4 | `tools/refs/pokeapi_extras.py` |
