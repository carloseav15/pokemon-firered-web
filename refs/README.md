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
10. **Las pistas y cifras "esperadas" de una tarea son ayudas, no la verdad.** Si tu
   resultado coincide con la pista, comprueba también por qué: revisa una muestra de
   casos a mano. Si no coincide, o la pista mezcla cosas distintas, investiga y
   escribe `PISTA INCORRECTA: <qué dice> / <qué muestran los datos>` bajo la tarea;
   no ajustes tu resultado para que encaje. (Caso real 2026-10-01: la pista de R2
   contaba 53 cambios de Gen 4 y solo unos 18 eran reales.)
11. **Si escribes o editas una tarea**, cada cifra o ejemplo de la pista debe salir de
   un comando que hayas ejecutado sobre los datos, y la pista debe decir qué cuenta
   exactamente (p. ej. "cambios reales" frente a "diferencias de formato").

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

**Todo commit lleva `Co-Authored-By`**, también el de estado (`Update refs task
status`) y los solo de documentos. Compruébalo con `git log -1 --format=%B`.

Al cerrar la sesión, marca `[x]` en las tareas hechas de este archivo en **un único**
commit aparte (`Update refs task status`), no uno por tarea.

### Lecciones de las revisiones (2026-10-01)

- **Bien hecho y a repetir:** R5 separó errores reales, historial incompleto y
  diferencias de representación; R3 emparejó habilidades por nombre y así evitó el
  desfase de ids de Gen 3; R6–R8 documentaron bloqueos con rutas y formatos concretos.
- **No ejecutes `tools/decomp/` (el exportador de FireRed) contra otra fuente.**
  Comparte `.decomp-build/` y `public/fr/` con el juego: un fallo a medias puede dejar
  datos de otro juego donde FireRed los lee. Para otras fuentes, escribe un extractor
  propio en `tools/refs/`. (R6 y R8 lo intentaron; se comprobó que no dejaron restos.)
- **Compara siempre "real" frente a "representación"** cuando cruces dos fuentes: el
  mismo dato se guarda distinto (precisión 0 o 100 para "nunca falla", ids
  desplazados, enums frente a números).
- **Un dato raro es una pregunta, no una conclusión:** antes de escribir un número en
  la guía, ejecútalo y mira una muestra de casos.

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
  imprime; no escribe en `refs/` salvo con `--out`). Con
  `npm run refs:pokeapi -- --generation 4` reconstruye el grupo `platinum` y
  compara movimientos/especies con `refs/platinum/`, separando diferencias,
  huecos de historial y normalizaciones de representación.

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
  - Esperado: 53 movimientos difieren en potencia, precisión o PP, pero solo unos 18
    son cambios reales de Gen 4 (10 de potencia, como Vuelo 70 → 90; 6 de PP, como
    Látigo Cepa 10 → 15; 2 de precisión: Anulación 55 → 80 y Destello 70 → 100). El
    resto es representación: 34 movimientos que nunca fallan (FireRed guarda 100,
    Platinum 0) y Escupir (potencia 100 frente a 1). Corrección del 2026-10-01: la
    primera versión de esta pista daba 53 como cambios reales; ver R9.
- [x] **R3 Especies: Platinum frente a FireRed** [básico, requiere R1]. Igual que R2
  para los 386 primeros: estadísticas, tipos, habilidades, grupos huevo, ratio de
  captura y movimientos por nivel. Usa el campo `national` de
  `public/fr/data/species.json` para emparejar (el índice interno de FireRed no es
  el número nacional a partir de Treecko). Salida `refs/platinum/species_vs_firered.json`.
- [x] **R4 Resumen de Emerald por archivo** [básico]. Crea
  `tools/refs/emerald_summary.py`, que lee `refs/emerald/functions.json` y escribe
  `refs/emerald/summary.json`: por archivo `{lines, identical, different,
  emerald_only, firered_only}`, ordenado por `different + emerald_only` descendente.
  Sirve para planificar el port de Emerald. No necesita la fuente.
- [x] **R5 Validar PokéAPI con Platinum** [medio, requiere R1 y R2]. Amplía
  `compare_pokeapi.py` con `--generation 4`: reconstruye los valores de PokéAPI para
  Platinum (version group `platinum`, id en `version_groups.csv`) y compáralos con
  `refs/platinum/*.json`. Reporta como en Gen 3: errores reales, historial incompleto
  y diferencias de representación.
- [x] **R9 Separar representación en `moves_vs_firered`** [básico]. La salida de R2
  mezcla cambios reales con diferencias de formato. Añade a cada cambio un campo
  `"kind": "real"` o `"kind": "representation"` y resume ambos por separado. Reutiliza
  las reglas que ya aplica `tools/refs/compare_pokeapi_gen4.py` (precisión 0 = nunca
  falla, potencia variable, probabilidad 0 = efecto garantizado). Terminada cuando el
  resumen muestre unos 18 cambios reales de potencia/precisión/PP y la prioridad de
  Venganza (Bide) 0 → +1.
- [ ] **R6 Entrenadores de Emerald** [medio]. `src/data/` ya está en el sparse de
  `pokeemerald`. Extrae `src/data/trainers.h` y
  `src/data/trainer_parties.h` a `refs/emerald/trainers.json`. Son inicializadores C.
  (La versión original pedía probar el exportador de FireRed; **ya no**: sigue el
  enfoque de "DESBLOQUEADA" de abajo.)
  - BLOQUEADO: `step_data.dump_trainers()` con `POKEFIRERED` apuntando al checkout fijado falla al incluir `map_groups.h`. El checkout sparse solo contiene `src/` e `include/`; `step_setup.generate_headers()` requiere también `data/maps/map_groups.json`, `data/layouts/layouts.json` y los mapas, que no están disponibles. Además, el dumper usa defines `FIRERED` y la ruta de build/salida compartida con el port FireRed. No se generó una salida parcial.
  - **DESBLOQUEADA (2026-10-01): nuevo enfoque sin el exportador.** No hace falta
    ampliar el sparse: `src/data/trainers.h` y `src/data/trainer_parties.h` ya están.
    Crea `tools/refs/emerald_trainers.py` que lea esos dos archivos con expresiones
    regulares (son inicializadores C muy regulares). Datos comprobados en el commit
    fijado:
    * `trainers.h`: 855 entradas `[TRAINER_X] = { ... }`, incluida `TRAINER_NONE`
      (sin equipo, `.partySize = 0`). Campos: `.trainerClass`, `.encounterMusic_gender`,
      `.trainerPic`, `.trainerName = _("...")`, `.items`, `.doubleBattle`, `.aiFlags`
      (constantes unidas con `|`) y `.party = MACRO(sParty_X)`.
    * Las 4 macros de `.party` (definidas en `include/data.h`) y su recuento:
      `NO_ITEM_DEFAULT_MOVES` 672, `NO_ITEM_CUSTOM_MOVES` 87, `ITEM_DEFAULT_MOVES` 31,
      `ITEM_CUSTOM_MOVES` 64 (854 equipos).
    * `trainer_parties.h`: `static const struct TrainerMon<Tipo> sParty_X[] = { {...}, ... };`
      con `.iv`, `.lvl`, `.species` y, según el tipo, `.heldItem` y
      `.moves = {MOVE_A, MOVE_B, MOVE_C, MOVE_D}`.
    * Ejemplos para comprobar tu salida: `TRAINER_SAWYER_1` → clase
      `TRAINER_CLASS_HIKER`, nombre `SAWYER`, un Pokémon `SPECIES_GEODUDE` nivel 21 iv 0;
      `TRAINER_RANDALL` → `ITEM_CUSTOM_MOVES`, `SPECIES_SWELLOW` nivel 26 iv 255,
      `ITEM_NONE`, movimientos `QUICK_ATTACK`, `AGILITY`, `WING_ATTACK`, `NONE`.
    * Salida: `refs/emerald/trainers.json`, lista en el orden del archivo, con
      `{const, class, name, pic, music_gender, items, double, ai_flags, party_type,
      party: [...]}`. Guarda las constantes como texto (`"SPECIES_GEODUDE"`); no las
      conviertas a números. Si un equipo citado no existe, `raise SystemExit`.
    * Terminada cuando: 855 entradas, 854 con equipo, los dos ejemplos coinciden,
      md5 estable y `refs:check` en verde. Comando `refs:emerald-trainers`.
- [x] **R7 Inventario de datos de HeartGold** [avanzado]. Sin extraer nada todavía:
  documenta en esta sección dónde están en `pokeheartgold` los entrenadores, los
  encuentros salvajes, los scripts de eventos y los textos del teléfono/radio, en
  qué formato y si están descompilados. Si hace falta ampliar el sparse, hazlo en
  `sources.json` y explica por qué.
  - Entrenadores: `files/poketool/trainer/trainers.json` es la tabla JSON fuente; `trdata.json.txt` y `trpoke.json.txt` son plantillas que `trainer.mk` convierte en los NARC de atributos y equipos. La lógica de lectura está en `src/trainer_data.c` (C legible).
  - Encuentros: `files/fielddata/encountdata/gs_enc_data.json` contiene las tablas por mapa y método; `gs_enc_data.json.txt` sirve de plantilla para generar los NARC separados de HeartGold y SoulSilver. La carga/selección se implementa en `src/encounter.c` y `src/field/encounter_check.c` (C legible).
  - Eventos de mapa: `files/fielddata/eventdata/zone_event/*.json` describe objetos, warps y eventos de fondo; JSONPROC y el ensamblador los convierten en datos del NARC. Secuencias de eventos: `files/fielddata/script/scr_seq/*.s`, código ensamblador legible con comandos y etiquetas simbólicos, compilado a binarios/NARC. No son tablas C.
  - Teléfono: `src/application/pokegear/phone/scripts/phone_scripts_*.c` contiene guiones de llamadas en C legible; `src/phonebook_dat.c` mapea contactos a mensajes. Textos fuente en `files/msgdata/msg/msg_0NNN.gmm` (filas XML con IDs de mensaje); la agenda de contactos está en `files/tel/pmtel_book.json` y su plantilla `.json.txt`.
  - Radio: los programas están implementados en `src/application/pokegear/radio/shows/*.c` (C legible) y cargan mensajes por NARC/ID; los textos están en los mismos `.gmm`, por ejemplo `msg_0414.gmm` (Pokémon Talk) y `msg_0420.gmm` (perfiles de entrenadores).
  - Sparse: no se amplió. `sources.json` mantiene `/src/` y `/include/`; los datos citados están bajo `/files/`. Para este inventario bastó consultar el árbol y ejemplos del commit fijado sin extraer datos. Una futura tarea de extracción deberá añadir solo los subdirectorios `/files/` que consuma.
- [x] **R8 Datos de Emerald con el exportador** [avanzado]. Evaluar si
  `tools/decomp/export.py` puede apuntar a pokeemerald (especies, movimientos,
  objetos, mapas) sin modificar su comportamiento para FireRed. Entregar un informe
  con lo que funciona y lo que no, antes de escribir código.
  - Evaluación en el commit fijado `fe1d8e51`: el override `POKEFIRERED` sí cambia la ruta fuente, pero `export.py data` termina en la comprobación de `charmap.txt`; el sparse actual no lo incluye (el archivo sí existe en el árbol completo). No se ejecutaron pasos que escriban en `public/fr`.
  - Especies: varias tablas y rutas C coinciden, pero el dumper pide `src/data/pokemon/pokedex_text_fr.h`; Emerald tiene `pokedex_text.h`. La extracción no compila sin adaptación.
  - Movimientos: coinciden `src/battle_main.c`, `src/data/battle_moves.h` y nombres; el dumper busca `src/move_descriptions.c`, mientras Emerald guarda las descripciones en `src/data/text/move_descriptions.h`.
  - Objetos: existen las tablas C de `src/data/object_events/` y `src/event_object_movement.c`; el extractor usa regex específicas de FireRed para referencias INCBIN y paletas. Compatibilidad no verificada.
  - Mapas: Emerald contiene `data/layouts/layouts.json`, `data/maps/map_groups.json` y mapas JSON que el lector de `step_maps.py` consume directamente. La preparación aún fija el modo `firered`, y el lector depende de constantes y etiquetas de `scripts.json`; no se probó su equivalencia para Emerald.
  - Bloqueo común: `common.py` fija `CPP_DEFINES` a `FIRERED` y comparte `.decomp-build` y `public/fr`; `step_setup.py` y `step_maps.py` también codifican convenciones FireRed. El paso de ítems espera `src/data/items.json`, ausente en Emerald, que usa `src/data/items.h`; el exportador de encuentros filtra además etiquetas `_FireRed`. Conclusión: el exportador no sirve por simple cambio de ruta. Requiere un modo/fuentes/salidas separados y adaptaciones por datos; no se modificó código en este informe.
