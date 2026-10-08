# Diagnóstico: el exportador de FireRed contra pokeemerald

Fase A.4 del plan de [EXPORTADOR-EMERALD.md](EXPORTADOR-EMERALD.md) y [SEPARACION-MOTOR.md](SEPARACION-MOTOR.md). Fecha: 2026-10-08.
Ejecutado con `python3 tools/emeraldExporterProbe.py` (ver la cabecera del script): copia el exportador **sin modificar** y
pokeemerald (commit `fe1d8e51`, el fijado en `tools/refs/sources.json`) a una carpeta fuera del repositorio. Ninguna ruta del repo
se escribe. Es un diagnóstico: cada «parche» de abajo se aplicó solo a la copia y es un hallazgo, no una propuesta de código.

## 1. Línea base de FireRed

`python3 tools/decomp/export.py` completo: unos 3 min y **0 archivos cambiados** en `git status` de `public/fr` (3.290 archivos
versionados) y `src/fr/generated` (7). Es decir, la regeneración actual de FireRed es reproducible, y git sirve de línea base
para cualquier cambio del exportador.

## 2. Resultado

Pasos de `export.py`: `setup constants scripts battlescripts maps tilesets objects data graphics codegen incbin cdata tsconst structs audio`.

| Paso | Exportador sin modificar | Con los 4 cambios de §3 |
|---|---|---|
| setup | **falla** (`mapjson` modo `firered`: «Value for 'border_width' cannot be empty») | OK (3 comandos `jsonproc` saltados por falta de entrada, §3.2) |
| constants | falla (en cascada: no existe `map_groups.h`) | **OK**: 8.340 constantes (`constants.json` de FireRed: 7.785; no son comparables, ver §5) |
| scripts | falla (en cascada) | **falla**: `preproc` no encuentra `asm/macros.inc` |
| battlescripts | falla (en cascada) | **falla**: `asm/macros.inc` |
| maps | falla (en cascada) | falla: necesita la salida de `scripts` |
| tilesets | falla: `KeyError: 'General'` | falla igual (`step_tilesets.py:39`) |
| objects | falla (en cascada) | falla: `Unsupported animation index in sAnimTable_BerryTree: [BERRY_STAGE_PLANTED - 1]` (`step_objects.py`) |
| data | falla (en cascada) | falla: falta `data/pokemon/pokedex_text_fr.h` (`step_data.py:64`) |
| graphics | falla (en cascada) | falla: `sFontSmallLatinGlyphWidths` no existe en `src/text.c` de Emerald (`step_graphics.py:45`) |
| codegen | falla (en cascada) | **OK** (`metatileBehavior.ts`) |
| incbin | «OK» (97 s) pero con varios ficheros inexistentes (p. ej. `sootopolis/anim/stormy_water/3..7_kyogre.4bpp`); no se contaron todos | sin repetir |
| cdata | **tiempo agotado (900 s)**; FireRed tarda 38 s. Causa **sin diagnosticar** | sin repetir |
| tsconst | falla (en cascada) | **falla tras 802 s**: no se genera el ejecutable `tsconst_probe`; causa sin diagnosticar |
| structs | falla por un artefacto de la copia (no existía `src/fr/generated`, que el exportador no crea); no es un hallazgo de Emerald | **OK**: 25 structs (FireRed: 27); faltan `PokedudeBattlerState` y `MultiBattlePokemonTx` |
| audio | falla (en cascada) | «OK» con **songs=0, midis=0, groups=0, samples=0** (cries=386): no extrajo canciones, causa sin diagnosticar |

Resumen: con los 4 cambios pasan 4 de 15 pasos (`setup`, `constants`, `codegen`, `structs`; este último con el directorio de salida creado a mano); `audio` y `incbin` terminan pero
no producen datos válidos; el resto falla por causas distintas, que aparecen una vez desbloqueado `setup`.

## 3. Los 4 cambios de la copia (qué hay que parametrizar)

1. **Modo de `mapjson`** (`step_setup.py:36,37,39`): el literal `"firered"` debe ser el del juego. Con Emerald, `mapjson` usa
   otro formato de layouts (sin `border_width`).
2. **Entradas de `jsonproc`** (`step_setup.py:44-49`): se saltaron 3 comandos. Emerald no tiene `src/data/items.json` ni `items.json.txt` (sus objetos
   están ya en `src/data/items.h`) ni las plantillas `region_map_sections.entries.json.txt` y `.strings.json.txt`. Hay que saltar o sustituir
   esas generaciones por juego.
3. **Defines** (`common.py` `CPP_DEFINES`): `-DFIRERED` → `-DEMERALD`.
4. **Ruta de inclusión**: el `include/constants/maps.h` de Emerald hace `#include "map_groups.h"` relativo a su propio
   directorio, así que el directorio de cabeceras generadas `constants/` debe estar en las rutas de inclusión.

## 4. Lo que el diagnóstico añade a los informes previos

- **Falta `/asm/` en la lista de descargas parciales.** `EXPORTADOR-EMERALD.md` §2.2 propone `/charmap.txt /data/ /graphics/
  /sound/ /tools/…`, pero `scripts` y `battlescripts` necesitan `asm/macros.inc` (24 archivos, 0,21 MB en el árbol fijado).
- **Tamaño de lo que falta descargar** (suma del árbol de GitHub del commit fijado, sin comprimir): unos **14 MB en 8.741
  archivos** sobre lo ya descargado (`data/` sin mapas 2,8 MB; `graphics/` 3,2 MB; `sound/` 7,1 MB; herramientas 1,1 MB).
- **Orden real de bloqueos**: el primero (`mapjson`) tapa a todos los demás; los que quedan son de formato de datos (tilesets,
  animaciones de objetos, fuentes, Pokédex, audio), no de la herramienta.
- Los puntos `SIN VERIFICAR` de `EXPORTADOR-EMERALD.md` que este diagnóstico convierte en hechos: el filtro `_FireRed` de `data`
  no se llegó a alcanzar; el formato de ítems de Emerald (`items.h`) frente al JSON de FireRed **sí falla** (punto 2).

## 5. Límites

- Emerald y FireRed no tienen el mismo número de constantes, ni de estructuras: la cifra de §2 no mide cobertura.
- Los pasos «en cascada» no se probaron sin su causa raíz: pueden esconder otros fallos propios (p. ej. `maps`).
- `cdata`, `tsconst`, `audio` e `incbin` quedan sin diagnosticar: no se sabe si es una limitación de los datos o un fallo de
  las rutas, ni cuánto cuesta arreglarlos.
- El descargado `sound/songs/midi/` existe (531 archivos en el árbol), por lo que `songs=0` no se debe a que falten archivos
  sino a cómo se leen (no investigado).
- Nada de esto prueba que lo exportado, una vez arreglado, sea correcto para Emerald.

## 6. Estado tras A.1–A.3 (2026-10-08, con permiso para editar `common.py`)

Hecho en el exportador (`tools/decomp/`), con FireRed por defecto:

- **Selector de juego** `EXPORT_GAME=firered|emerald` en `common.py`. Cada juego tiene su checkout (`POKEFIRERED`/`POKEEMERALD`, o
  `../refs-src/pokeemerald`), su build (`.decomp-build` / `.decomp-build/emerald`), sus datos (`public/fr` / `public/emerald`) y su
  TS generado (`src/fr/generated` / `src/games/emerald/generated`), más el modo de `mapjson`, los defines y las rutas de inclusión extra.
- `step_setup.py` usa el modo de `mapjson` del juego; las entradas `jsonproc` que no existan se saltan **solo** si el juego no es
  FireRed (aviso en pantalla). `step_codegen/structs/tsconst.py` escriben en el directorio del juego (y lo crean); `step_scripts.py`
  usa `.set <JUEGO>` y las rutas de inclusión extra; `export.py` muestra el juego.
- **FireRed regenerada con estos cambios: 0 archivos cambiados** (dos veces, 3 min cada una) en `public/fr` y `src/fr/generated`.
- `tools/refs/sources.json`: la lista parcial de pokeemerald incluye ahora `/data/ /graphics/ /sound/ /asm/ /constants/ /charmap.txt
  /tools/jsonproc/ /tools/mapjson/ /tools/preproc/`. `npm run refs:fetch -- pokeemerald` y `npm run refs:check` pasan. Faltaba
  también `/constants/` (5 archivos, 30 KB): `data/event_scripts.s` hace `.include "constants/constants.inc"`. Revisado todo el
  nivel superior del árbol del commit fijado: no hay más carpetas necesarias para el exportador.

Con `EXPORT_GAME=emerald` y la configuración real (no la copia): `setup`, `constants` (8.340), `codegen` y `structs` (25) **pasan**.

## 7. Avance posterior (2026-10-08): 12 de 15 pasos pasan para Emerald (tsconst sin confirmar)

`EXPORT_GAME=emerald python3 tools/decomp/export.py <paso>`; tras cada cambio FireRed se regeneró con **0 archivos cambiados**
(`public/fr`, `src/fr/generated`).

| Paso | Estado | Resultado / qué se adaptó |
|---|---|---|
| setup, constants | OK | 9.282 constantes. Hubo que añadir `map_groups.h` (enum), prefijos y cabeceras propios de Emerald (`BERRY_TREE_`, `BERRY_STAGE_`, `SECRET_BASE_`, `COORD_EVENT_`, `item.h`) y buscar los `enum` en la salida preprocesada (el `ITEM_TM_*` se genera con una macro X). Solo para Emerald |
| codegen, structs | OK | `metatileBehavior.ts`; 25 estructuras (FireRed 27; faltan `PokedudeBattlerState` y `MultiBattlePokemonTx`) |
| scripts | OK | 972.520 bytes, 17.295 etiquetas, 227 comandos, 527 especiales. La macro `waitstate implicit=` compara el contador de posición, que LLVM no evalúa; se sustituye por un `.byte` simple con una comprobación en cada ejecución de que ningún `waitstate` explícito va pegado a uno implícito (en Emerald hay 0 casos de 214) |
| battlescripts | OK | 13.593 bytes de combate, 9.303 de IA, 63.811 de animaciones; se descartan `.equiv` repetidos |
| maps | OK | 518 mapas y 441 diseños (coinciden con `refs/emerald/maps.json`). Eventos nuevos: clima (86) y bases secretas (75) |
| tilesets | OK | 75 tilesets. `INCGFX_*`; atributos de metateja de 16 bits (`attributeBits: 16` en esos JSON; FireRed usa 32) |
| objects | OK | 239 gráficos de objetos, 424 imágenes, 37 efectos de campo. `INCGFX_*`; expresiones con constantes en tablas de animación; sin hoja de emoticonos (`emoticons: null`) |
| audio | OK | 610 canciones, 530 MIDI, 193 grupos de voces, 154 muestras, 386 gritos. Jugadores musicales simbólicos, `voice_group nombre`, `.include` de grupos |
| data | OK | los 10 archivos (`species`, `moves`, `trainers`, `items`, `wild`, `heal_locations`, `region_map`, `strings`, `battle_strings`, `script_menu`) en 5 s. Especies 412 (Pokédex nacional 387 entradas; Treecko 40/45/35/70/65/55, Planta, Espesura, evoluciona a nivel 16, comprobado con los valores conocidos de Gen 3), movimientos 355, habilidades 78, entrenadores 855 (1.825 Pokémon), objetos 377, 116 mapas con encuentros salvajes, 114 menús de selección múltiple, 30 movimientos de tutor (FireRed 15) |
| graphics | **falla** | `export_fonts` busca `sFont*LatinGlyphWidths` en `src/text.c`; Emerald los tiene en `src/fonts.c` con otro conjunto (small, small narrow, narrow, short, normal; FRLG male/female solo japonés). Hay que decidir qué fuentes necesita el motor |
| cdata | OK | 310 archivos, 24.188 definiciones, 60 s (FireRed: 283, 18.606, 38 s). Causa de los 900 s: `preproc` intentaba abrir `x.pal.gbapal`, que solo existe tras compilar, por `INCGFX_U16("x.pal", ".gbapal")`; fallaba, el código ignoraba el error, el texto quedaba cortado en una llave abierta y el analizador giraba sin fin. Arreglo: `INCGFX_*` se pliega al mismo marcador que `INCBIN_*`, y un fallo de `preproc` ya levanta error |
| tsconst | causa hallada, **sin confirmar** | `usable_headers` tarda 21 s (320 cabeceras); el resto eran 40 pasadas de `clang` de ~20 s con el límite por defecto de 20 errores por pasada, y Emerald tiene cientos de nombres a rechazar. Se añadió `-ferror-limit=0` (también en `step_setup`); FireRed idéntico. La ejecución de Emerald se interrumpió antes de terminar, así que no se sabe si basta |
| incbin | **diagnosticado, no resuelto** | Emerald declara los gráficos con `INCGFX_*` (2.467 usos frente a 265 `INCBIN_*`): el paso solo cubre ese ~10 % y ningún gráfico. Faltan en la descarga `/tools/gbagfx/` (22 archivos) y `graphics_file_rules.mk`; además `gbagfx` lo espera ya compilado en `.decomp-build/<juego>/bin` (el exportador no lo construye; el de FireRed se compiló a mano y `libpng` existe en `/opt/homebrew`). Conversiones necesarias, por frecuencia: `.4bpp.lz` (~2.300), `.gbapal` y `.gbapal.lz` (~3.300), `.4bpp` con tamaños (`-mwidth/-mheight`, `-num_tiles`), `.1bpp`, `.lz`, `.rl`, `.latfont` |

Lo que **no** demuestra esto: que los datos exportados de Emerald sean correctos. Solo que el paso termina y cuenta cosas
plausibles (518 mapas = los de `refs/emerald/maps.json`). La validación contra la ROM sigue pendiente.

Adaptaciones de `data` (todas condicionadas al juego, FireRed regenera idéntico): encuentros salvajes sin el filtro `_FireRed` (en FireRed
convive con LeafGreen; antes Emerald daba 0 mapas sin avisar), descripciones de movimientos en `src/data/text/move_descriptions.h`,
entrenadores con `data.h`, objetos leídos del C de `src/data/items.h` (+ `item_descriptions.h`; los 67 `ITEM_0xx` de relleno
tienen `itemId = ITEM_NONE` en el propio C), Pokédex `pokedex_text.h`, aprendizaje de MT/MO como bitfield (`gTMHMLearnsets[s].as_u32s`),
`gTutorMoves`, menús de `data/script_menu.h` (`MULTI_*`), y `extract_definition()` ya no toma como definición un fragmento
de comentario. En Emerald `script_menu.json` tiene `stdStrings` y `textColors` a `null` (no existen).

Siguiente trabajo, por orden: confirmar `tsconst`, `incbin` (compilar `gbagfx`, ampliar la descarga, manejar `INCGFX_*`) y `graphics` (antes: decidir qué fuentes necesita el motor).
