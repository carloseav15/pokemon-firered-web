# unified-world

Análisis de apoyo para [docs/MUNDO-UNIFICADO.md](../docs/MUNDO-UNIFICADO.md). No lo importa
`src/` ni el juego; solo lee los decomps y escribe informes.

## Qué hay ya en el repositorio (no se duplica)

- `tools/viewer/quest_index.py` → `public/viewer/quests_<juego>.json`: índice de flags, variables y
  scripts de FireRed y Emerald, con quests candidatas y clases manuales (`quest_tags.json`).
- `tools/refs/emerald_scripts.py`, `emerald_trainers.py`, `heartgold_zone_events.py`: datos de otras fuentes.

## Qué añade esto

`extract_gates.py` responde otra pregunta: **qué eventos de mapa pueden detener o redirigir al
jugador y bajo qué condición**. Parte de cada evento (objeto, coordenada, cartel) de
`data/maps/*/map.json`, sigue el grafo de scripts hasta 8 niveles y clasifica por evidencia:

| Tipo | Significado | Decisión relacionada |
|---|---|---|
| `field_move` | el script comprueba un movimiento del equipo (Cortar, Fuerza, Golpe Roca…) | A3 |
| `physical_obstacle` | objeto que bloquea por colisión (Snorlax, árbol, roca, bloque) | A3 |
| `forced_move` | el script desplaza al jugador (rebote o escena; no siempre es un bloqueo) | A4 |
| `badge_check` | comprueba una medalla fuera de un movimiento de campo | B3 / A3 |
| `item_check` | comprueba un objeto clave (según el `pocket` de la propia tabla de objetos) | A3 |

Fuentes: `pokefirered/` (repositorio), `../refs-src/pokeemerald` y `../refs-src/pokemon-hns`.

## Uso

```bash
python3 unified-world/extract_gates.py            # las tres fuentes
python3 unified-world/extract_gates.py firered    # una sola
python3 unified-world/extract_levels.py           # niveles de líderes, Alto Mando y campeones
```

Salida: `out/gates_<fuente>.json` (evidencia por evento) y `out/GATES.md` (resumen). Es
determinista: ejecutarlo dos veces da los mismos archivos.

## Etapas de gimnasio (`extract_stages.py`)

Parte de `out/levels.json` (ejecutar antes `extract_levels.py`). Regla: con **N** medallas, el as del líder
sale de la **escalera natural** de los 24 aces originales ordenados por nivel (11, 14, 15 … 50); las etapas
agrupan N en 0–3, 4–7, 8–15 y 16–23. Para cada líder y etapa devuelve un equipo **real** (original o
revancha de cualquier fuente cuyo as encaja) o un **draft**: el equipo real más cercano desplazado de nivel,
con tamaño medido de la escalera, líneas evolutivas reajustadas (datos de FireRed) y miembros prestados de otros
equipos del mismo líder. Salida: `out/stages.json` y `out/STAGES.md`.

Los drafts son mecánicos y **no están revisados**: sin movimientos, objetos ni estrategia. Supuestos propios,
como constantes en el script: `NON_LEVEL_EVO_FLOOR`, `ADDED_LEVEL_OFFSET` y `REAL_TOLERANCE`. Las especies de
generaciones posteriores de HnS no tienen datos de evolución y se dejan como están.

## Niveles reales (`extract_levels.py`)

Lee los equipos de líderes, Alto Mando y campeones donde ya estaban extraídos (no repite extracciones):

| Fuente | Entrada |
|---|---|
| FireRed | `public/fr/data/trainers.json` + `public/fr/constants.json` |
| Emerald | `refs/emerald/trainers.json` |
| HeartGold | `refs/heartgold/trainers.json` |
| Heart & Soul | `../refs-src/pokemon-hns/src/data/trainers.h` y `trainer_parties.h`, con lector propio: el de `tools/refs/emerald_trainers.py` es estricto y rechaza sus equipos |

Salida: `out/levels.json` y `out/LEVELS.md` (tablas por región, Alto Mando, revanchas y los 24 gimnasios
entrelazados por nivel del as). **Crystal no está**: el checkout fijado de pokecrystal es parcial y no trae
los equipos; Johto se compara con HnS y HeartGold. El orden canónico de gimnasios está escrito a mano en
`GYM_ORDER` y el script falla si un nombre no aparece en los datos.

## Verificado

- FireRed: los dos bloqueos de Ciudad Verde (viejo del camino y puerta del gimnasio) aparecen como
  `forced_move` con su variable de escena; Snorlax aparece en Ruta 12 y Ruta 16.
- Los árboles, rocas y bloques se cuentan solo si el evento tiene script.

## Límites (importan antes de decidir nada)

- Análisis **estático y heurístico**; no se ejecuta el juego.
- **No capta** guardias o NPC que bloquean solo por colisión y se retiran al activar un flag, ni
  condiciones dentro de `switch/case` o `special`.
- `forced_move` incluye escenas (el jugador es movido sin ser un bloqueo): hay que revisar a mano.
- La lista de objetos clave "no gating" (`NON_GATING_KEY_ITEMS`) es una decisión mía y está en el código.
- Las etiquetas son de los decomps; HnS no es canon GSC/HGSS.
