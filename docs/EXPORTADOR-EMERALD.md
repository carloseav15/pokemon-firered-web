# Informe 6.2: exportador para Emerald

Tarea 6.2 de [TAREAS-FINALES.md](../TAREAS-FINALES.md), fase 2 de [VISION.md](VISION.md). Informe estático: no se ejecutó `tools/decomp/export.py` ni ningún `step_*.py`/`clang_*.py`, y no se modificó código del exportador. Fuente Emerald fijada: `fe1d8e51b265851676b65885818b1f5f62586135`.

## 1. Resumen

- No basta cambiar `DECOMP`: FireRed está fijado en rutas, defines, build, generadores, formatos, filtros y salidas.
- Centralizar esos valores en una configuración `Game`; FireRed sigue por defecto. Destinos finales: `.decomp-build/<juego>`, `public/<juego>` y `src/games/<juego>/generated`.
- El sparse actual cubre `/src/`, `/include/`, `/data/maps/`, `/data/layouts/`. Para las entradas estáticas revisadas faltan las rutas de §2.2. Emerald no tiene los paths FireRed `src/data/items.json`, `src/data/items.json.txt`, `src/data/pokemon/pokedex_text_fr.h` ni `src/move_descriptions.c`; requieren adaptar lectores.
- Ningún paso entero queda demostrado como no aplicable. Los formatos/contenidos que no pueden verificarse sin ejecución se identifican como `SIN VERIFICAR`.

## 2. Datos e inventario

### 2.1 Acoplamientos a FireRed

| Clase | Evidencia | Efecto |
|---|---|---|
| (a) Parámetros | `common.py:17-32` resuelve `DECOMP` mediante `POKEFIRERED`/hermano, fija `BUILD = .decomp-build`, `OUT = public/fr`, y `CPP_DEFINES` contiene `-DFIRERED`; `export.py:8-9,29-30` nombra FireRed y crea esa salida. | Resolver fuente, build, salida y defines según juego, aislando build por juego. |
| (a) Salida generada | `step_codegen.py:14,57-62`, `step_tsconst.py:1,106-107` y `step_structs.py:1,176` escriben en `src/fr/generated/`. | Usar `Game.generated`, finalmente `src/games/<juego>/generated`. |
| (b) Pokédex/textos | `step_data.py:64-65` incluye `pokedex_text_fr.h`; el árbol Emerald contiene `pokedex_text.h` (`git ls-tree`). | Diferencia de nombre/ruta de entrada; no demuestra diferencia semántica en los datos. Adaptar el lector. |
| (b) Descripciones de movimientos | `step_data.py:151-152` lee `src/move_descriptions.c`; Emerald guarda `src/data/text/move_descriptions.h` (`git ls-tree`). | Representación/ubicación distinta; lector/adaptador, no duplicación completa de `step_data.py`. |
| (b) Ítems | `step_setup.py:44` y `step_data.py:323` requieren `src/data/items.json`; Emerald tiene `src/data/items.h`, sin esos JSON. | Formato de fuente diferente; significado/equivalencia de contenido `SIN VERIFICAR`. |
| (b) Encuentros/mapas | `step_data.py:370-389` conserva solo `base_label` terminado en `_FireRed`; `step_setup.py:36-39` pasa `firered` literalmente a mapjson. | El filtro descartaría Emerald; ambos comportamiento y modo deben parametrizarse. Conteo final `SIN VERIFICAR`. |
| (b) INCBIN/objetos/paletas | `step_objects.py:81-94,139-152,237-257` extrae con regex `INCBIN_U16/U32`, tags/slots `PALSLOT_*`; `step_tilesets.py:20-28`, `step_graphics.py:82-90` parsean tablas de gráficos; `step_incbin.py:155-168` reconoce dos patrones de inicializadores. | Compatibilidad de sintaxis, tags y relaciones de paleta en Emerald `SIN VERIFICAR`; adaptar si la lectura de fuente lo requiere. |
| (c) Paso no aplicable | `export.py:23` enumera 15 pasos; la inspección estática no prueba que alguno entero no aplique. | No excluir un paso completo sin evidencia. Excluir/reemplazar productos o subdatos exclusivos FireRed en el adaptador correspondiente. |

### 2.2 Pasos `STEPS`, presencia en árbol y sparse

Comandos usados: `git -C ../refs-src/pokeemerald rev-parse HEAD`, `git -C ../refs-src/pokeemerald sparse-checkout list`, y `git -C ../refs-src/pokeemerald ls-tree -r fe1d8e51 -- <ruta>`. “Sparse” se determina con los patrones actuales `/src/`, `/include/`, `/data/maps/`, `/data/layouts/`. Las rutas bajo `src/` e `include/` quedan cubiertas; las rutas citadas en cada fila son representativas, no una expansión de cada include transitivo.

| Paso | Fuentes requeridas (rutas representativas; referencias en exportador) | Árbol fijado / sparse | Estado para Emerald |
|---|---|---|---|
| `setup` | `tools/preproc/*`, `tools/mapjson/*`, `tools/jsonproc/*`, `charmap.txt`, `data/maps/*`, `data/layouts/*`, `src/data/region_map/*`, `src/data/heal_locations.*`, `src/data/items.*` (`step_setup.py:11-48,144-160`). | Tools y charmap: existen, fuera sparse. Mapas, layouts, region/heal: existen, cubiertos. `src/data/items.json` y `.json.txt`: no existen; sí `src/data/items.h`. | Requiere modo y adaptación de items; plantilla equivalente no identificada.
| `constants` | `include/constants/*.h`, headers setup y defines (`step_setup.py:51-78,81-141`). | Headers cubiertos; productos setup en build. | Reutilizar algoritmo con defines y lista de headers por juego; valores cambian.
| `scripts` | `data/event_scripts.s` y fuentes ensambladas (`step_scripts.py:1,15,31-61,110-133`). | Existe, no sparse (`/data/` faltante). | Formato/labels Emerald `SIN VERIFICAR`.
| `battlescripts` | `data/battle_scripts_1.s`, `_2.s`, `data/battle_ai_scripts.s`, `data/battle_anim_scripts.s` (`step_battle_scripts.py:60-74`). | Existen, no sparse (`/data/`). | Formato de binario común; labels/externos Emerald `SIN VERIFICAR`.
| `maps` | `data/layouts/layouts.json`, `data/maps/map_groups.json`, todos los `data/maps/*/map.json` y binarios de layouts (`step_maps.py:40-73,168-196`). | JSON base cubierto; `/data/` cubriría el resto de referencias. | Datos de mapas existen (R15); modo mapjson y etiquetas de scripts requieren lector adaptado.
| `tilesets` | `src/graphics.c`, `src/data/tilesets/{graphics,metatiles,headers}.h`, assets (`step_tilesets.py:19-46`). | Fuentes cubiertas; assets `/graphics/` fuera sparse. | Parser/representación Emerald `SIN VERIFICAR`.
| `objects` | `src/data/object_events/*.h`, `src/event_object_movement.c`, `include/event_object_movement.h`, `src/data/field_effects/field_effect_objects.h`, assets (`step_objects.py:80-94,139-152,237-310`). | Fuentes cubiertas; `/graphics/` falta. | Compatibilidad regex/tags/slots `SIN VERIFICAR`.
| `data` | Fuentes de Pokémon/texto, movimientos, trainers, items, encuentros, healing/region (`step_data.py:45-74,150-174,221-232,322-401`). | `src/` cubierto; pokédex y move descriptions difieren de ruta; JSON de ítems no existe. | Adaptadores para pokédex, movimientos e ítems y corregir filtro `_FireRed`.
| `graphics` | `src/text.c`, `src/data/graphics/pokemon.h`, `src/graphics.c`, `src/data/pokemon_graphics/*` y bitmaps/paletas (`step_graphics.py:21-43,81-123`). | C/H cubiertos; `/graphics/` falta. | Contenido/convenciones `SIN VERIFICAR`.
| `codegen` | `src/metatile_behavior.c` (`step_codegen.py:50-67`). | Existe y está cubierto. | Aplicable con constantes del juego.
| `incbin` | `src/*.c`, includes y recursos binarios referidos (`step_incbin.py:155-168,185-227`). | Fuentes C cubiertas; `/graphics/`, `/data/` y quizá `/sound/` faltan. | Necesita recursos completos y cotejo de macros Emerald.
| `cdata` | C de `src/`, headers, macros INCBIN y `charmap.txt` (`step_cdata.py:23-60,623-650`). | `src/include` cubiertos; charmap no. | Parser/preprocesado Emerald `SIN VERIFICAR`; aislar build/ABI.
| `tsconst` | Headers `include/`/generados, define de compilación (`step_tsconst.py:15-50,106-107`). | `include` cubierto; headers de setup por generar. | Aplicable con juego/defines y destino configurados.
| `structs` | Headers, preprocesado y layout (`step_structs.py:13,30-45,137-176`). | `include` cubierto; setup genera includes. | Aplicable con layout target GBA; Emerald `SIN VERIFICAR`.
| `audio` | `sound/songs/midi/midi.cfg`, `sound/voice_groups.inc`, `sound/keysplit_tables.inc`, `sound/direct_sound_data.inc`, `sound/song_table.inc`, cry tables, MIDI/samples (`step_audio.py:31-45,97-183`). | Existen en árbol; `/sound/` fuera sparse. | Dato por juego; parser Emerald `SIN VERIFICAR`.

**Propuesta exacta de rutas sparse a sumar** (cada ruta fue consultada en el árbol fijado; no se altera `sources.json`):

```text
/charmap.txt
/data/
/graphics/
/sound/
/tools/jsonproc/
/tools/mapjson/
/tools/preproc/
```

`/data/` incluye scripts de evento/combate y archivos referidos por mapas/INCBIN. Las ausencias `src/data/items.json`, `src/data/items.json.txt`, `src/data/pokemon/pokedex_text_fr.h` y `src/move_descriptions.c` sí faltan del árbol; no se arreglan ampliando sparse.

### 2.3 Cifra de defines

6.1 daba 737 discrepancias entre 3.746 comunes sin dejar el comando. El comando que
estaba escrito aquí (patrón sin comentarios al final de línea) da 7.154 FireRed,
9.649 Emerald, 3.386 comunes y **485** discrepantes, no la salida que se citaba.
La salida citada (7.641, 10.634, 3.783 y 740) corresponde al patrón que también
acepta comentarios `//` o `/* */` al final de la línea. Ese patrón es el que ahora
usa `python3 tools/engineSplit.py --constants`, y 6.1 quedó corregido a 740.
Muestra: `BAG_BERRIES_COUNT` 43/46, `BAG_ITEMS_COUNT` 42/30,
`BAG_POKEBALLS_COUNT` 13/16. Es una medida de defines literales directos, no de
todos los símbolos que usa el port (corrección del revisor, 2026-10-01).

### 2.4 Tamaño y consumidores

`du -sh public/fr src/fr/generated` dio `32M public/fr` y `684K src/fr/generated`. **SIN VERIFICAR: tamaño de `public/emerald`**, que requeriría exportar.

Hay consumidores FireRed-only: `tools/portInventory.py:7,295` lee `public/fr/cdata`; `tools/checks/honesty.py:16,130` consulta `public/fr/constants.json`; por ejemplo, `tools/checks/wildEncounter.ts:8,38` y `tools/checks/incbinRowAccessors.ts:6,9-15` fijan rutas `public/fr`/`src/fr/generated`. Coordinar estos cambios con el traslado 6.1.

## 3. Diseño

Centralizar en `common.py` una configuración inmutable `Game`:

```python
@dataclass(frozen=True)
class Game:
    name: str
    decomp: Path
    build: Path
    out: Path
    generated: Path
    cpp_defines: tuple[str, ...]
    readers: ReaderAdapters
```

Resolver `--game firered|emerald` una vez y pasar `Game` a cada paso. `firered` es el default y debe preservar la resolución de fuente actual (`POKEFIRERED`, hermano o submódulo) y defines actuales: `-DFIRERED -DREVISION=0 -DENGLISH -DMODERN=0`. Sus destinos finales son `.decomp-build/firered`, `public/fr` y, al aplicar 6.1, `src/games/firered/generated`; Emerald usa `.decomp-build/emerald`, `public/emerald`, `src/games/emerald/generated`.

Cada paso conserva una sola lógica común. Los adaptadores solo eligen fuentes/lectores para charmap, mapas, pokédex/textos, descripciones, ítems, encuentros, gráficos y audio. Cuando el formato difiere, el lector propio normaliza a un modelo interno común; no se copia el paso entero. `Game.generated` parametriza las tres salidas hoy fijas: `metatileBehavior.ts` (`step_codegen.py:14,57-62`), `constants.ts` (`step_tsconst.py:106-107`) y `structs.ts` (`step_structs.py:176`).

Esto encaja con el alias `@game/*` del diseño 6.1: el paso 2 mueve `src/fr/` a `src/games/firered/` y el alias selecciona `src/games/<juego>/*`, incluyendo `generated/`. El paso 3 de 6.1 configura datos y exige coordinar la nueva ruta del exportador; no debe quedar un generador escribiendo en `src/fr/generated`. `public/<juego>` es la raíz de datos de esa compilación.

## 4. Orden de los pasos de código

Cada paso pequeño se verifica con §5 y se detiene si FireRed difiere sin explicación.

1. Capturar baseline y añadir `Game`/selector con FireRed por defecto; comprobar valores resueltos sin exportar. No depende de 6.1.
2. Separar intermediarios a `.decomp-build/<juego>` (incluidos `BIN`, `GEN_INCLUDE`, temporales y materialización INCBIN; `common.py:27-29`, `step_incbin.py:24`). No depende de 6.1.
3. Parametrizar `OUT=public/<juego>`, conservando `public/fr`. No depende de 6.1.
4. Hacer que codegen, tsconst y structs escriban en `Game.generated`. Depende de 6.1 paso 2 y se coordina con su paso 3 y alias.
5. Parametrizar defines y comandos de compilación/preprocesado. Independiente del traslado salvo por el destino generado.
6. Separar lectores de setup: modo mapjson y formatos de JSON/ítems. No depende del traslado, salvo salida generada.
7. Adaptar lecturas de datos: pokédex/textos, movimientos, ítems y encuentros; quitar `_FireRed` como filtro universal. No depende del traslado salvo rutas finales.
8. Adaptar en pasos por familia mapas/tilesets, objetos/paletas, gráficos/INCBIN y audio; comprobar primero la forma fuente. No depende del traslado salvo el `generated`.
9. Coordinar checks, inventory y consumidores FireRed-only después del movimiento de 6.1. Depende de sus pasos 1–3 y puede exceder `tools/decomp/`.

## 5. Riesgos y procedimiento de equivalencia FireRed

- **Constantes:** 740 discrepancias en defines literales (§2.3). Resolverlas desde headers del juego, no desde constantes FireRed compartidas.
- **Charmap/texto:** `step_setup.py:144-160` lee y transforma `charmap.txt`; `step_data.py:20-42,271-320` codifica textos. Sparse no incluye charmap. Igualdad de formato no prueba códigos/textos iguales: `SIN VERIFICAR`.
- **Build:** `common.py:27-29` comparte `.decomp-build`; headers/probes/cachés contaminados pueden cruzar juegos. Mantener uno por juego y no enlazar el build principal.
- **Tamaño:** FireRed mide 32M en disco; Emerald `SIN VERIFICAR`.
- **Consumidores:** checks e inventory siguen apuntando a `public/fr` y `src/fr/generated` (§2.4); cambiar outputs aislado deja validaciones leyendo FireRed.
- **INCBIN/ABI:** regex pueden no reconocer variantes Emerald; compilar en host no demuestra el layout GBA.

Procedimiento futuro, **no ejecutado aquí**: en un worktree aislado con checkout de FireRed fijado y `.decomp-build` propio (no compartido), guardar antes un manifiesto ordenado `{ruta relativa, md5}` de cada archivo regular de `public/fr/` y `src/fr/generated/`. Ejecutar exportación FireRed antes y después de cada paso de código y comparar conjuntos de rutas y MD5 por ruta. Si un hash difiere, detenerse, localizar productor y revisar bytes/diff; no modificar baseline para aceptar el resultado. Tras el traslado 6.1 de `generated/`, comparar el contenido con una transformación explícita de prefijo de ruta, sin confundir movimiento con diferencia de bytes.

## 6. Qué no cubre

- No se cambia/ejecuta el exportador ni se editan `tools/decomp/`, `src/`, `public/`, `refs/` o `tools/refs/sources.json`.
- Compatibilidad de lectura Emerald, outputs y tamaño de `public/emerald` quedan `SIN VERIFICAR` hasta implementación y exportación aislada.
- El conteo de defines es solo de literales numéricos en headers directos; no mide macros evaluadas, enums ni constantes efectivamente consumidas.
- No actualiza checks/consumidores externos; eso debe coordinarse con 6.1.
