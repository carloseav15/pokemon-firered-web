# refs: información extraída de otros decomps

Datos y catálogos extraídos de otros proyectos (Emerald, Platinum, HeartGold,
PokéAPI) para las fases futuras de [docs/VISION.md](../docs/VISION.md). **El juego no
usa nada de esta carpeta**: FireRed sigue saliendo solo de `pokefirered`.

Índice de fuentes y salidas: [MANIFEST.md](MANIFEST.md) (generado).

## 0. Cómo trabajar (léelo entero antes de empezar)

Este trabajo es independiente de [TAREAS-FINALES.md](../TAREAS-FINALES.md): no toca
`src/` y puede avanzar en paralelo. Si el usuario pide prioridad para FireRed,
manda FireRed. Si algo de aquí choca con [AGENTS.md](../AGENTS.md), manda AGENTS.md.

### Al empezar cada sesión

```bash
git switch main
git pull --ff-only
git status --short
npm run refs:fetch
npm run refs:check
```

- `git status` debe salir vacío; si no, para y pregunta.
- `refs:fetch` descarga o actualiza las fuentes en `../refs-src/<fuente>` (fuera del
  repo), en el commit fijado en `tools/refs/sources.json`. Tarda unos minutos la
  primera vez. Para una sola fuente: `npm run refs:fetch -- pokeplatinum`.
- `refs:check` debe decir `PASS`. Si falla antes de tocar nada, para y avisa.

Elige **una** tarea sin marcar de la sección 3 y trabaja solo en ella.

### Reglas que no se rompen

1. **Nada de `src/` importa `refs/`.** `refs:check` lo comprueba.
2. **`refs/` no se edita a mano.** Todo archivo sale de un script de `tools/refs/`
   y se regenera ejecutándolo.
3. **Cada salida JSON se escribe con `write_output()`** de `tools/refs/common.py`, que
   añade `_meta` (fuente, commit fijado, script, número de entradas).
4. **Solo commits fijados.** No uses ramas ni `HEAD` remoto. Cambiar el commit de una
   fuente en `sources.json` requiere permiso del usuario y regenerar todas sus salidas.
5. **Nada de gráficos, audio ni copias de archivos fuente.** Solo datos (JSON) y
   catálogos. Cada archivo de salida debe pesar menos de 5 MB.
6. **Deterministas.** Ejecutar el script dos veces debe dar el mismo archivo
   (`md5 -q refs/<juego>/<archivo>.json` antes y después).
7. **El decomp manda.** Si una fuente contradice al decomp de pokefirered en datos de
   FireRed, el error es de la fuente: anótalo, no "corrijas" nada.
8. Si llevas dos intentos fallidos con el mismo error, anota `BLOQUEADO: <motivo>`
   bajo la tarea y pasa a otra.
9. Nada de `git push` sin permiso del usuario.

### Receta: crear un extractor nuevo

1. Copia el ejemplo más parecido:
   - datos desde JSON de un decomp → `tools/refs/platinum_moves.py`;
   - catálogo de funciones C → `tools/refs/emerald_functions.py`;
   - comparación entre fuentes → `tools/refs/compare_pokeapi.py`.
2. Nómbralo `tools/refs/<juego>_<qué>.py` y cambia la docstring: qué produce, de qué
   archivos y cómo se usa.
3. Obtén la ruta de la fuente con `source_path("<fuente>")` (nunca una ruta fija) y
   escribe con `write_output("<juego>", "<qué>.json", datos, "<fuente>", "tools/refs/<script>.py")`.
4. Si un dato esperado falta, termina con `raise SystemExit("<qué falta y dónde>")`.
   No inventes valores por defecto.
5. Añade el comando a `package.json` junto a los otros `refs:*`:
   `"refs:<juego>-<qué>": "python3 tools/refs/<script>.py"`.
6. Ejecuta el script dos veces y comprueba que el md5 no cambia.
7. `npm run refs:check -- --write` (actualiza `MANIFEST.md`) y después `npm run refs:check`.

### Antes del commit

```bash
npm run refs:check
npm run check:honesty
git diff --check
```

Un commit por tarea con el script, su salida, `package.json` y `refs/MANIFEST.md`.
Mensaje en inglés, imperativo, sin palabras como "complete", "faithful" o "fully"
(`check:honesty` las rechaza; ejecútalo **después** de escribir el commit):

```bash
git add tools/refs/<script>.py refs/ package.json
git commit -m "Extract <qué> from <fuente> into refs" -m "Co-Authored-By: <tu agente> <correo>"
npm run check:honesty
```

Al cerrar la sesión, marca `[x]` en las tareas hechas de este archivo en un commit
aparte (`Update refs task status`).

## 1. Fuentes

| Fuente | Qué es | Para qué sirve | Estado |
|---|---|---|---|
| `pokeemerald` | GBA, C completo | Catálogo de lógica frente a FireRed; datos de Emerald | Fuente de verdad de Emerald |
| `pokeplatinum` | DS, C en progreso, datos JSON | Reglas y datos de Gen 4 (físico/especial, 493 especies) | Muy fiable en datos |
| `pokeheartgold` | DS, C + ensamblador | Johto: entrenadores, encuentros, teléfono, radio | Solo fijado; extracción más adelante |
| `pokeapi` | CSV de todas las generaciones | Megas, especies posteriores, nombres en español | **No es fuente de verdad**: errores medidos en `compare_pokeapi.py` |

## 2. Salidas actuales

- `emerald/functions.json`: cada función C de Emerald frente a FireRed, con estado
  `identical` / `different` / `emerald_only` / `firered_only` y línea en cada archivo.
  "identical" compara texto: el mismo cuerpo puede leer otros globals o constantes.
- `platinum/moves.json`: los 468 movimientos de Platinum (id = índice; 1–354 son los
  mismos ids que FireRed) con clase física/especial, tipo, potencia, precisión, PP,
  prioridad, efecto y flags.
- `npm run refs:pokeapi`: comparación de PokéAPI con los datos de FireRed (solo
  imprime; no escribe en `refs/` salvo con `--out`).

## 3. Tareas

Orden recomendado de arriba abajo. **[básico]**: copiar un ejemplo y adaptar campos.
**[medio]**: hay que entender formatos nuevos. **[avanzado]**: para un agente capaz.

- [x] **R1 Especies de Platinum** [básico]. Crea `tools/refs/platinum_species.py`
  copiando `platinum_moves.py`.
  - Fuente: `generated/species.txt` (orden = id; `SPECIES_NONE` = 0, terminan en
    `SPECIES_EGG` y `SPECIES_BAD_EGG`) y `res/pokemon/<nombre>/data.json`, donde
    `<nombre>` es la constante sin `SPECIES_` en minúsculas (`SPECIES_MR_MIME` → `mr_mime`).
  - Campos a conservar: `base_stats`, `types`, `abilities`, `catch_rate`, `ev_yields`,
    `gender_ratio`, `hatch_cycles`, `base_friendship`, `exp_rate`, `egg_groups`,
    `held_items`, `evolutions` y `learnset` (con sus cuatro listas). Descarta
    `pokedex_data`, `footprint`, `body_color`, `icon_palette` y lo gráfico.
  - Salida: `refs/platinum/species.json`, lista indexada por id. Comando
    `refs:platinum-species`.
  - Terminada cuando: 496 entradas (0–495), md5 estable y `refs:check` en verde.
- [x] **R2 Movimientos: Platinum frente a FireRed** [básico]. Crea
  `tools/refs/compare_platinum_moves.py` copiando la estructura de `compare_pokeapi.py`.
  - Lee `refs/platinum/moves.json` (no la fuente) y `public/fr/data/moves.json`.
    Ids 1–354 en ambos. Tipos de FireRed: el número Gen 3 (0–17, 9 = `???`); Platinum
    usa nombres `TYPE_*`. Haz la tabla de conversión a mano desde
    `../pokefirered/include/constants/pokemon.h`.
  - Compara tipo, potencia, precisión, PP, prioridad y probabilidad de efecto.
    Guarda con `write_output("platinum", "moves_vs_firered.json", ...)` una entrada
    por movimiento que cambie: `{id, const, cambios: {campo: [firered, platinum]}}`.
  - Imprime el resumen por campo, como `compare_pokeapi.py`.
  - Esperado (para comprobar que lo hiciste bien): 53 movimientos cambian potencia,
    precisión o PP; por ejemplo Vuelo 70 → 90 de potencia, Látigo Cepa 10 → 15 PP y
    Anulación 55 → 80 de precisión. Placaje (35/95) y la prioridad de Protección (+3)
    no cambian en Gen 4. Si tus cifras no coinciden, revisa la conversión antes de
    sospechar de los datos.
- [ ] **R3 Especies: Platinum frente a FireRed** [básico, requiere R1]. Igual que R2
  para los 386 primeros: estadísticas, tipos, habilidades, grupos huevo, ratio de
  captura y movimientos por nivel. Usa el campo `national` de
  `public/fr/data/species.json` para emparejar (el índice interno de FireRed no es
  el número nacional a partir de Treecko). Salida `refs/platinum/species_vs_firered.json`.
- [ ] **R4 Resumen de Emerald por archivo** [básico]. Crea
  `tools/refs/emerald_summary.py`, que lee `refs/emerald/functions.json` y escribe
  `refs/emerald/summary.json`: por archivo `{lines, identical, different,
  emerald_only, firered_only}`, ordenado por `different + emerald_only` descendente.
  Sirve para planificar el port de Emerald. No necesita la fuente.
- [ ] **R5 Validar PokéAPI con Platinum** [medio, requiere R1 y R2]. Amplía
  `compare_pokeapi.py` con `--generation 4`: reconstruye los valores de PokéAPI para
  Platinum (version group `platinum`, id en `version_groups.csv`) y compáralos con
  `refs/platinum/*.json`. Reporta como en Gen 3: errores reales, historial incompleto
  y diferencias de representación.
- [ ] **R6 Entrenadores de Emerald** [medio]. `src/data/` ya está en el sparse de
  `pokeemerald`. Extrae `src/data/trainers.h` y
  `src/data/trainer_parties.h` a `refs/emerald/trainers.json`. Son inicializadores C:
  intenta primero reutilizar el exportador de FireRed (`tools/decomp/`, sin
  modificarlo); si no encaja, anota `BLOQUEADO` y por qué.
- [ ] **R7 Inventario de datos de HeartGold** [avanzado]. Sin extraer nada todavía:
  documenta en esta sección dónde están en `pokeheartgold` los entrenadores, los
  encuentros salvajes, los scripts de eventos y los textos del teléfono/radio, en
  qué formato y si están descompilados. Si hace falta ampliar el sparse, hazlo en
  `sources.json` y explica por qué.
- [ ] **R8 Datos de Emerald con el exportador** [avanzado]. Evaluar si
  `tools/decomp/export.py` puede apuntar a pokeemerald (especies, movimientos,
  objetos, mapas) sin modificar su comportamiento para FireRed. Entregar un informe
  con lo que funciona y lo que no, antes de escribir código.
