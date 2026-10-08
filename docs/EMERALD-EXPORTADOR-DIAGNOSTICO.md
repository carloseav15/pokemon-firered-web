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

## 6. Qué decidir antes de seguir

1. **¿Se permite editar `tools/decomp/common.py`?** `CLAUDE.md` dice «no lo modifiques». El plan A.1 (una configuración `Game`
   con FireRed por defecto) y los cambios 3 y 4 de §3 lo exigen. Alternativa sin editarlo: un `common` por juego importado
   desde un módulo nuevo; es más frágil porque los pasos hacen `from common import …`.
2. **Ampliar `sparse` en `tools/refs/sources.json`** con `/charmap.txt /asm/ /data/ /graphics/ /sound/ /tools/jsonproc/
   /tools/mapjson/ /tools/preproc/` (unos 14 MB).
3. Siguiente trabajo útil: por orden, `scripts`/`battlescripts` (con `/asm/`), `tilesets`, `objects`, `data`, `graphics` y
   los cuatro pasos sin diagnosticar; en cada uno, FireRed debe regenerarse idéntico.
