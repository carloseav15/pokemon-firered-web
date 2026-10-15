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
```

Salida: `out/gates_<fuente>.json` (evidencia por evento) y `out/GATES.md` (resumen). Es
determinista: ejecutarlo dos veces da los mismos archivos.

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
