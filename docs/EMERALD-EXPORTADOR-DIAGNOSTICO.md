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

## 7. Avance posterior (2026-10-08): los 15 pasos terminan para Emerald

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
| graphics | OK | 3 s. Fuentes: las 5 latinas de `src/fonts.c` (`small`, `small_narrow`, `narrow`, `short`, `normal`; 512 anchos cada una; sin las FRLG male/female, solo japonesas; decisión del usuario), más `down_arrow`, `down_arrow_alt`, `keypad_icons`. Ventanas: marcos `1`–`20`, `message_box` y 4 paletas `text_pal1-4`. Pokémon: 440 imágenes de frente (tabla *still*, 64×64; la tabla animada es una hoja de 2 fotogramas) y 439 variantes shiny; Treecko = 277, Mew = 151. Puertas: 53 |
| cdata | OK | 310 archivos, 24.188 definiciones, 60 s (FireRed: 283, 18.606, 38 s). Causa de los 900 s: `preproc` intentaba abrir `x.pal.gbapal`, que solo existe tras compilar, por `INCGFX_U16("x.pal", ".gbapal")`; fallaba, el código ignoraba el error, el texto quedaba cortado en una llave abierta y el analizador giraba sin fin. Arreglo: `INCGFX_*` se pliega al mismo marcador que `INCBIN_*`, y un fallo de `preproc` ya levanta error |
| tsconst | OK | 18.474 constantes de 317 cabeceras (18 rechazadas), 52–62 s. La causa real no era el límite de errores de clang: el enlazado de la sonda fallaba con símbolos indefinidos (p. ej. `AbilityBattleEffects`) que algunas macros alcanzan a través de otras macros; el bucle solo miraba el texto del `#define` y repetía 40 pasadas de 15 s sin rechazar nada. Ahora rechaza los nombres cuya expansión completa menciona el símbolo. Comprobado: `SPECIES_TREECKO` 277, `SPECIES_MEW` 151, `NUM_SPECIES` 412, `MOVE_PSYCHO_BOOST` 354, `ABILITY_WONDER_GUARD` 25, `ITEM_MASTER_BALL` 1, `TYPE_DARK` 17. FireRed sigue en 14.057 |
| incbin | OK | 6.617 símbolos, 6.610 blobs, 65 paquetes, 9,2 MB, 2 min. `INCGFX_U8/U16/U32` (png/pal → `gbapal`/`4bpp`/`1bpp`/`8bpp`/`latfont` con `gbagfx` y los flags de la macro; fuentes binarias tal cual; `.lz`/`.rl` se guardan sin comprimir). `gbagfx` se compila en `step_setup` solo para Emerald (libpng de Homebrew); la descarga parcial incluye `tools/gbagfx/` y `/*.mk`. Reglas de make: referencias de sustitución `$(v:%=…)` (`move_types`) y `cp`+`dd` (`rayquaza_tail_fix`). Tamaños comprobados: frente de Treecko 4.096 (hoja de 2 fotogramas 64×128), espalda 2.048, paleta 32, icono 1.024, tiles del tileset General 16.384, tipos 5.888 (23×256) y paleta de tipos 96 |

Lo que **no** demuestra esto: que los datos exportados de Emerald sean correctos. Solo que el paso termina y cuenta cosas
plausibles (518 mapas = los de `refs/emerald/maps.json`). La validación contra la ROM sigue pendiente.

Adaptaciones de `data` (todas condicionadas al juego, FireRed regenera idéntico): encuentros salvajes sin el filtro `_FireRed` (en FireRed
convive con LeafGreen; antes Emerald daba 0 mapas sin avisar), descripciones de movimientos en `src/data/text/move_descriptions.h`,
entrenadores con `data.h`, objetos leídos del C de `src/data/items.h` (+ `item_descriptions.h`; los 67 `ITEM_0xx` de relleno
tienen `itemId = ITEM_NONE` en el propio C), Pokédex `pokedex_text.h`, aprendizaje de MT/MO como bitfield (`gTMHMLearnsets[s].as_u32s`),
`gTutorMoves`, menús de `data/script_menu.h` (`MULTI_*`), y `extract_definition()` ya no toma como definición un fragmento
de comentario. En Emerald `script_menu.json` tiene `stdStrings` y `textColors` a `null` (no existen).

Ejecución completa `EXPORT_GAME=emerald python3 tools/decomp/export.py`: los 15 pasos terminan sin errores (incbin 146 s, cdata 67 s, tsconst 62 s). FireRed regenerada tras cada cambio: 0 archivos cambiados en `public/fr` y `src/fr/generated`. Sigue pendiente la validación de los datos de Emerald contra la ROM o el motor; las salidas parciales no se versionan.

## 8. Validación cruzada de los datos exportados (2026-10-08)

`python3 tools/emeraldExportValidate.py` (tras `EXPORT_GAME=emerald python3 tools/decomp/export.py`) compara `public/emerald` con
`refs/emerald/*.json` y con las fuentes de pokeemerald. Son dos canalizaciones independientes sobre el mismo commit (el exportador
compila el C con clang; `tools/refs/emerald_*.py` leen el texto), así que la coincidencia prueba que el exportador leyó las tablas
correctas, no que coincidan con la ROM ni con el motor. Resultado: **48.000 comparaciones, 0 diferencias** (26.369 al principio; objetos, tilesets, audio, fuentes y constantes añadieron el resto). Se comprobó que detecta
una alteración (Treecko con HP 41 → 1 diferencia).

| Qué | Comparación |
|---|---|
| Especies (412) | estadísticas base, tipos, habilidades, grupos huevo, ratio de captura, exp., EV, ciclos de huevo, crecimiento, objetos, color, amistad |
| Movimientos (355) | potencia, precisión, PP, prioridad, probabilidad, tipo, efecto, objetivo |
| Entrenadores (855) | nombre (decodificado con `charmap.json`), clase, doble, tamaño del equipo, especie/nivel/IV de cada Pokémon |
| Mapas (518) | conjunto de nombres; por mapa: música, clima, tipo y número de objetos/warps/coordenadas/carteles (los salones de concurso heredan los eventos de `ContestHall` por `shared_events_map`; la referencia deja esos contadores en `null`) y de conexiones |
| Encuentros salvajes (116 mapas) | mismo conjunto de mapas que `wild_encounters.json`; tasa y lista (nivel mín/máx, especie) de land, water, rock smash y fishing iguales a una de las cabeceras del mapa |
| Objetos (377) | nombre, precio, bolsillo, tipo, uso en combate, efecto y parámetro de objeto equipado, importancia, `secondaryId`, funciones de uso y descripción, contra el bloque de `src/data/items.h` y `item_descriptions.h` (con `ITEM_TO_MAIL/BERRY` y comentarios). `{POKEBLOCK}` decodifica como katakana por colisión de bytes y se normaliza |
| Gráficos | 4.521 `INCGFX` `.4bpp`/`.gbapal` sin flags: tamaño exportado = ancho×alto/2 del png o 2 bytes por color; 385 de 440 imágenes de frente con el tamaño de su `front.png` |
| Región, curación, menús | 213 secciones del mapa regional (`region_map_sections.json`, con los valores por omisión de la plantilla: x=y=0, ancho=alto=1), 22 puntos de curación, 114 menús de `MultichoiceList_*` |
| Fuentes (5) | tabla de anchos de `src/fonts.c` y píxeles/tamaño de `latin_*.png` |
| Constantes (`tsconst`) | 9.595 `#define NOMBRE <entero>` de `include/constants/*.h`: todos están en `constants.ts` con el valor del encabezado (los 18.474 totales incluyen enums y expresiones, que no se comparan) |
| Tilesets (75) | nombres, `isSecondary`, callback; tiles recalculados desde `tiles.png` (4bpp, con `-num_tiles`), metatiles y atributos byte a byte con los `.bin`, 16 paletas por tileset contra los `.pal` (5 bits por canal) |
| Audio | 610 canciones (nombre, jugador, prioridad `-P`, volumen `-V`, reverb `-R`, grupo `-G` de `midi.cfg`), 530 MIDI, 195 grupos de voces y su secuencia de tipos, muestras usadas por las voces y su `.wav`, 388 gritos en el orden de `cry_tables.inc`, 5 tablas de keysplit |

Hallazgos que no son errores: seis `front.png` de origen (Blaziken, Marshtomp, Poochyena, Walrein, Swablu, Rayquaza) miden 64×256, no
64×64, y se exportan tal cual; 55 especies no se comparan por no tener `graphics/pokemon/<nombre>/front.png` (NONE, Castform, las letras de Unown y OLD_UNOWN).

No cubierto: enums y constantes definidas con expresiones de `tsconst`, la parte de `scripts.bin` que el segundo comprobador no
ensambla (1,2 %, abajo), y las estructuras de FireRed que Emerald no define (`PokedudeBattlerState`, `MultiBattlePokemonTx`: no aparecen en ningún archivo de pokeemerald, así que su ausencia en los 25 structs es correcta). Tampoco se contrastó ningún dato con la ROM.

Fallos del exportador que esta comprobación destapó (corregidos, FireRed intacta):

- `keysplit_tables.json` salía **vacío**: pokeemerald escribe las tablas con las macros `keysplit piano, 36` / `split 0, 55`, no con `.set KeySplitTable1, . - 36`. Ahora 5 tablas.
- 40 tilesets secundarios llevaban una baldosa de más: `INCGFX_U32(..., "-num_tiles 159")` recorta el png y el exportador no aplicaba la marca.
- 2 voces `voice_directsound_reverse` (rs_sfx_2) se descartaban sin aviso; ahora se exportan con ese `kind` (el reproductor tendrá que reconocerlo).
- Los grupos `unused_2` y `vs_kyogre_groudon` se perdían porque su línea `.include` lleva un comentario `@`.
- 2 muestras (`sc88pro_tuba_39`, `sc88pro_accordion_duplicate`) se perdían porque su etiqueta lleva un comentario `@`.

Hallazgo en **FireRed**, corregido a petición del usuario: el mismo fallo de etiqueta con comentario hacía que `public/fr/audio/samples.json` no tuviera `DirectSoundWaveData_sc88pro_tuba_39`, aunque `voicegroups.json` la referencia (grupo `tuba_keysplit`, usado por varias canciones). La regeneración añade esa entrada y `sc88pro_tuba_39.wav`; es lo único que cambia en `public/fr`.

### Scripts (`python3 tools/emeraldScriptValidate.py`)

Segundo comprobador, para `scripts.bin` y `scripts.json`. Reensambla los datos con un expansor de macros propio (no LLVM):
`asm/macros/event.inc`, `map.inc`, `movement.inc`, `battle_frontier/*.inc`, `.byte/.2byte/.4byte`, `.if/.elseif/.else/.endif`,
`.ifb/.ifnb`, macros anidadas, `#ifdef` con ninguna macro opcional definida, y `.string` codificado directamente desde `charmap.txt`
(el exportador usa `preproc`). Resultado: **17.228 comparaciones, 0 diferencias**.

- Tabla de comandos: 227 entradas en el mismo orden que `script_cmd_table.inc`, y los índices coinciden con los comentarios `@ 0xNN`.
- Especiales: 527, en el orden de `specials.inc`.
- Conjunto de etiquetas: las 17.295 de `data/event_scripts.s` y sus inclusiones, ni una más ni una menos.
- Bytes: 960.985 de los 972.520 de `scripts.bin` (98,8 %) reproducidos byte a byte; 16.989 etiquetas completas y 234 hasta la primera
  línea que el comprobador no sabe ensamblar (cada una compara el prefijo). Los 192 bytes de punteros a símbolos de C son comodines.
  Emula también la `waitstate` implícita de `special`/`specialvar` (una explícita pegada a una implícita se descarta, como en el
  ensamblador real) con los `waitstate=` de `specials.inc`.
- No ensamblado: condiciones sobre `STR_VAR_1/2/3` y otras constantes sin valor numérico en las fuentes (`NO_MUSIC`, `DOLL_COINS`…),
  `.align` (37), `.braille` (22), `.set` (3), `.endif` (3).
- Mientras se escribía apareció una falsa alarma instructiva: `cave_hole.inc` usa `#ifdef UBFIX`; sin `BUGFIX` (comentado en
  `config.h`, `MODERN=0`) se ensambla la rama `#else`, y el exportador la tomó igual que el compilador.

## 9. Decisiones de formato preparadas en el exportador (2026-10-08)

**Atributos de metatile, versión 16 y 32 bits.** Cada `public/emerald/tilesets/gTileset_*.json` conserva `attributes` (los 16 bits originales,
`attributeBits: 16`) y añade `attributes32`: los mismos metatiles en el formato de FireRed (comportamiento en los bits 0-8, tipo de capa en
los bits 29-30). Emerald no guarda terreno ni tipo de encuentro, así que esos campos quedan a 0; el motor tendrá que obtenerlos del
comportamiento. La conversión (`attributes_to_32` en `step_tilesets.py`) falla si un valor no cabe (bits 8-11 usados o capa > 2). Con los
datos reales caben todos: capa 0 = 9.749 metatiles, capa 1 = 8.538, capa 2 = 31. Los **números de comportamiento siguen siendo los de Emerald**,
no los de FireRed: hace falta `src/games/emerald/generated/metatileBehavior.ts`. El validador recalcula `attributes32` desde los `.bin`.
FireRed no cambia (la rama solo se ejecuta si el atributo no es de 32 bits).

**Clima.** Hay dos mecanismos. (1) El clima de la cabecera de cada mapa (`weather`), ya leído por `src/fr/field/weather.ts`, que contiene
todos los tipos de Emerald, incluidos sequía, diluvio y los ciclos de las rutas 119 y 123. En los 518 mapas: sin clima 428, soleado 51,
burbujas submarinas 14, sombra 14, niebla horizontal 10, ceniza 1. (2) Los 86 eventos de coordenada de tipo `weather` (un cambio de clima
al pisar una casilla): soleado 34, ciclo ruta 119 12, ciclo ruta 123 12, nubes 12, ceniza 12, lluvia 4. Se exportan como
`{"type": "weather", x, y, elevation, weather}` en `coords` de cada mapa y el validador comprueba los 86 contra los `map.json`. Falta el
consumidor: `src/fr/field/coordEventWeather.ts` tiene los 13 manejadores vacíos (así es FireRed, "it's always sunny in Viridian"), y en
`src/coord_event_weather.c` de Emerald cada uno llama a `SetWeather(WEATHER_X)`; `DoCoordEventWeather` se invoca desde
`field_control_avatar.c`.

**Voces de audio.** Emerald añade un solo tipo, `voice_directsound_reverse` (2 voces en `rs_sfx_2`; el byte de tipo es 0x10). El reproductor
`src/fr/audio/m4a.ts` ya tiene búfer invertido para los gritos, pero `envelopePlan` (línea 119) solo trata como directas
`voice_directsound`, `_no_resample` y `_alt`, y la reproducción de voces no invierte la muestra. Cambio necesario: incluir el tipo nuevo en
esa rama y reproducir el búfer invertido.

Pendiente de autorización (tocan `src/`): el consumidor de eventos de clima y el tipo de voz invertido.

## 10. Índice del visor para Hoenn (2026-10-08, tarea 6.6 paso 1)

`EXPORT_GAME=emerald python3 tools/viewer/world_index.py` escribe `public/viewer/hoenn.json` (el de Kanto sigue siendo `kanto.json`, idéntico
byte a byte tras el cambio). Origen del BFS: `MAP_LITTLEROOT_TOWN`. Resultado: 49 mapas exteriores unidos, mundo de 800×383 casillas, 712
elementos (295 entrenadores, 210 NPC condicionales, 168 puertas, 20 árboles de corte, 8 rocas, 11 NPC), 209 activadores de los que 81 son
cambios de clima (los otros 5 de los 86 están en mapas fuera de la red conectada), 159 banderas iniciales (`EventScript_ResetAllMapFlags` de
`data/scripts/new_game.inc`). Determinista (mismo md5 en dos ejecuciones).

Comprobación independiente: el conjunto de 49 mapas es exactamente la componente conexa desde Pueblo Raíz siguiendo solo las conexiones
arriba/abajo/izquierda/derecha de los `map.json` (las 7 de bucear/emerger no cuentan); de las 112 conexiones entre esos mapas, 106 dan
posiciones coherentes y las 6 restantes son los 3 pares de desajuste de 2 casillas que el índice informa como `conflicts` (Dewford–Ruta 107,
Fallarbor–Ruta 114, Verdanturf–Ruta 116), un defecto de los propios datos de pokeemerald. Quedan fuera de la red, por no estar conectados con
el resto: el Frente de Batalla (este y oeste) y las seis zonas del Parque Safari, que tienen conexiones propias.

Diferencias de configuración por juego (`GAME_CONFIG`): gráficos de obstáculo (`CUTTABLE_TREE`, `BREAKABLE_ROCK`, `SUDOWOODO` en lugar de
`CUT_TREE`, `ROCK_SMASH_ROCK`, `SNORLAX`), archivo de banderas iniciales, y los eventos de clima se indexan como activadores con el campo
`weather`. Las partidas de prueba de `tools/playtest/saves` solo se copian en FireRed.

**Paso 2: el visor abre Hoenn** (`/viewer.html?game=emerald`, o el selector Kanto/Hoenn de la barra). Solo lectura: mapa, capas, fichas,
búsqueda y minimapa. Cambios en código compartido, todos con FireRed como valor por omisión:

- `src/fr/field/fieldmap.ts`: `NUM_METATILES_IN_PRIMARY`, `NUM_TILES_IN_PRIMARY` y el nuevo `NUM_PALS_IN_PRIMARY` son enlaces vivos con
  perfiles `firered` (640/640/7) y `emerald` (512/512/6); `SetTilesetProfile(nombre)` los cambia. `tileRenderer.ts` usa los vivos.
- `src/fr/rom.ts`: `DATA_ROOT` es mutable (`setDataRoot`) y `loadTileset` prefiere `attributes32` si el tileset lo trae (solo Emerald).
- `src/viewer/main.ts`: `GAME` desde `?game=`, predicados de comportamiento por juego, índice `hoenn.json`, selector. En Hoenn no hay avatar,
  sprites de NPC, música, efectos de campo ni animación de tiles (sus gráficos y audio son de FireRed).
- `src/games/emerald/generated/metatileBehavior.ts` pasa a estar versionado (es lo único de `src/games` que se importa).

Fallo del exportador que apareció aquí: `step_codegen.py` dejaba en el `metatileBehavior.ts` de Emerald C sin traducir (`#define` de
`TILE_FLAG_*`, `#ifdef BUGFIX` dentro de una condición y funciones `bool8 UNUSED`), con errores de sintaxis aunque el paso «terminaba».
Ahora resuelve `#ifdef/#else/#endif` con ninguna macro opcional definida, convierte los `#define` y acepta `UNUSED`; la salida de FireRed
no cambia. Comprobado en el navegador: Hoenn se pinta con los mosaicos correctos (49 mapas) y Kanto sigue igual, incluida la exploración;
`check:all` 44 pasan, `check:tileset-profile` nuevo.

Pendiente del visor de Hoenn: sprites de objetos de Emerald, audio de Emerald, animación de tiles de pokeemerald y exploración con
avatar (necesitan sus propios módulos de campo, no los de FireRed). No se contrastaron los atributos de capa/colisión de Hoenn jugando.
