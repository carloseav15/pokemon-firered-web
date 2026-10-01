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
| `platinum/moves.json` | pokeplatinum | 468 | `tools/refs/platinum_moves.py` |
| `platinum/moves_vs_firered.json` | pokeplatinum | 71 | `tools/refs/compare_platinum_moves.py` |
| `platinum/species.json` | pokeplatinum | 496 | `tools/refs/platinum_species.py` |
| `platinum/species_vs_firered.json` | pokeplatinum | 362 | `tools/refs/compare_platinum_species.py` |
