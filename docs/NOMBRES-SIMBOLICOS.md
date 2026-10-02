# Informe 6.3: nombres simbólicos para el mundo unificado

Tarea 6.3 de [TAREAS-FINALES.md](../TAREAS-FINALES.md), preparación de la fase 6 de [VISION.md](VISION.md). Informe estático redactado el 2026-10-01 sobre `codex/informe-6.3`. No se ejecutó el exportador ni se modificaron sus entradas. Las decisiones de alias `@game/*`, configuración `Game` y `public/<juego>` de 6.1/6.2 se mantienen.

## 1. Resumen

- Hay nombres conservados en índices de mapas, referencias parciales de eventos, etiquetas de scripts, datos de objetos/tilesets/audio y constantes. En cambio, especies, movimientos y entrenadores son principalmente arreglos posicionales cuyos IDs son índices; los binarios de scripts contienen operandos numéricos.
- `scripts.json` registra nombres de comandos en orden de opcode, etiquetas, símbolos externos y rutinas especiales, pero no un esquema que clasifique cada operando por tipo y offset. `src/fr/script/commands.ts` lee bytes/palabras en ejecución, no es un índice declarativo para reescritura.
- Propuesta: para cada juego, agregar `symbols.json` con nombres y valores, y un archivo auxiliar de operandos tipados con offsets, ancho, clase, valor y símbolo de origen. Para macros genéricas hay que conservar la clase antes de que el ensamblado borre esa información.
- `python3 tools/engineSplit.py --constants` dio **740** defines literales homónimos con valores distintos. Coincidir en el nombre no prueba equivalencia semántica.
- **SIN VERIFICAR:** forma/bytes de Emerald exportado, cobertura de anotaciones y equivalencia semántica. No hubo bloqueo repetido: **BLOQUEADO: ninguno**.

## 2. Datos e inventario de salidas actuales

“Nombre + número” indica referencia simbólica enlazada a ID/offset; “solo número” incluye identidad inferida por posición en un array. “Mixto” depende del campo. Las muestras son valores reales de `public/fr/`; se leyeron los productores pero no se ejecutaron.

| Salida / escritor | Conservación | Ejemplo real |
|---|---|---|
| `maps.json`, `maps/*.json` — `step_maps.py:40-69,111-169,196` | Mapa: símbolo + `num`; layout/tilesets/sección/música: nombre y/o número. Warp: `destMap` conserva nombre, warp ID solo número. Objetos/coordenadas: etiqueta de script y dirección juntas; flag, var, item oculto y graphicId solo numéricos salvo `graphicsName`. | `MAP_BATTLE_COLOSSEUM_2P: {num:0,name:"BattleColosseum_2P",layout:"LAYOUT_BATTLE_COLOSSEUM_2P"}`; objeto `{graphicsId:66,graphicsName:"OBJ_EVENT_GFX_UNION_ROOM_RECEPTIONIST",script:134594555,scriptName:"BattleColosseum_2P_EventScript_Attendant"}`; warp `destMap:"MAP_DYNAMIC"`. |
| `layouts/*.json` — `step_maps.py:171-195` | ID y tilesets primario/secundario simbólicos; bloques y bordes son bytes Base64 con índices numéricos. | `LAYOUT_BATTLE_COLOSSEUM_2P`, `primary:"gTileset_Building"`, `secondary:"gTileset_CableClub"`. |
| `scripts.json` + `scripts.bin` — `step_scripts.py:110-142` | Labels→offset, externos y specials simbólicos; `commands` da nombres por opcode. Operandos del binario son numéricos sin nombre/tipo declarativo. | `labels["Movement_HoOhAppear"]:22316`; primer comando `ScrCmd_nop`. |
| `battle/{scripts,ai,anims}.json` + `.bin` — `step_battle_scripts.py:60-74` | Etiquetas/externos con offset simbólico; operandos binarios numéricos, sin tipos. | `BattleScript_ExplosionDoAnimStartLoop:1257`; `AI_CV_Heal2:4515`; `Move_NONE:1608`. |
| `data/species.json`, `data/moves.json` — `step_data.py:137-143,150-218,404-410` | Arrays posicionales sin `SPECIES_*`/`MOVE_*` por fila; referencias numéricas. Nombres visibles codificados no son símbolos C. | `species[0]` y `moves[0]` carecen de constante por fila. |
| `data/items.json` — `step_data.py:322-335,404-414` | Mixto: item retiene `const` e `id`; bolsillo, tipo, efectos y referencias se resuelven a números. | `{"id":1,"const":"ITEM_MASTER_BALL",...}`. |
| `data/trainers.json` — `step_data.py:221-268,404-412` | Array posicional sin `TRAINER_*` por registro; clase/música/pic/especies/moves/items numéricos; nombre visible codificado. | Índice 1 comienza `{"class":2,"music":6,"female":0,"pic":0,...}`. |
| `data/wild.json`, `heal_locations.json`, `region_map.json` — `step_data.py:370-401,415-418` | Salvajes: clave mapa simbólica, especie numérica. Heal: `HEAL_LOCATION_*`, mapa y LOCALID conservados. Región: `MAPSEC_*` simbólico, texto codificado. | `maps["MAP_*"]`; heal `id:"HEAL_LOCATION_PALLET_TOWN",map:"MAP_PALLET_TOWN"`. El producto se llama `wild.json`; el auxiliar fuente se llama `wild_encounters.json`. |
| `data/strings.json`, `battle_strings.json`, `script_menu.json` — `step_data.py:271-319,425-445` | Strings: nombre C como clave. Battle strings: arreglo posicional y marcadores externos `{label}`. Menú de scripts: símbolos para strings estándar; multichoice numérico. | `strings["battle_interface.sText_Slash"]`; `stdStrings` contiene símbolos `STDSTRING_*` mapeados a nombres C. |
| `objects.json` — `step_objects.py:177-233` | Índice `gfx` numérico, registro preserva nombre gráfico; paletas, slots, animTables/anims conservan símbolos. | `gfx[66].name:"OBJ_EVENT_GFX_UNION_ROOM_RECEPTIONIST"`. |
| `tilesets.json` — `step_tilesets.py:19-69` | Claves `gTileset_*` simbólicas; tiles/metatiles/atributos binarios/Base64. | Clave `gTileset_General`; archivo individual conserva `name`. |
| `gfx.json` — `step_graphics.py:114-123` | Manifest heterogéneo; Pokémon indexado numéricamente con nombres de presentación, no `SPECIES_*`. | `pokemon["0"]:"NONE"`. |
| `fieldfx.json` — `step_objects.py:285-310` | Clave pierde prefijo `gFieldEffectObjectTemplate_`; callback simbólico, cuadros/rutas/índices numéricos. | `templates["ShadowSmall"]`; callback conserva nombre de función. |
| `constants.json` — `step_setup.py:81-137` | Nombre→entero; fuente más rica para reconstruir IDs. Puede contener aliases: el inverso no es necesariamente uno-a-uno. | `FLAG_GOT_HM01:567`, `VAR_RESULT:32781`, `MAP_ROUTE1:787`, `TRAINER_YOUNGSTER_TYLER:96`, `MUS_PALLET:300`. |
| `charmap.json` — `step_setup.py:144-160` | Carácter/nombre de glifo→byte(s); simbólico para texto, no ID de juego. | `chars["A"]:187`; `names["PKMN"]:[83,84]`. |
| `cdata/*.json` — `step_cdata.py:640-652` | Conserva nombres de declaraciones C y tipo/valor; referencias dentro de arrays/estructuras son números o bytes. | `event_object_movement.json.defs.sElevationToPriority`: nombre, `u8`, lista de valores. |
| `incbin/index.json` + packs — `step_incbin.py:185-229` | Índice símbolo C→pack/offset/tamaño; packs son bytes. | `bag.c:sBagWindowPalF:["graphics_item_menu",0,32]`. |
| `audio/*` — `step_audio.py:138-187` | Música: nombre + ID posicional; voicegroups/etiquetas de muestras simbólicos; cries posicionales. No es diccionario general de IDs de SE. | Canción `se_use_item`, `id:1`; claves `voicegroup000`. |

### 2.1 TypeScript generado

| Archivo/familia | Conservación y productor |
|---|---|
| `constants.ts` | Nombres de define + valores; `step_tsconst.py:81-107`. Ejemplo `ABILITIES_COUNT = 78`. |
| `metatileBehavior.ts` | Nombres de constantes y código convertido; `step_codegen.py:50-62`. Ejemplo `DIR_NORTH = 2`. |
| `structs.ts` | Nombres de tipos/campos y offsets/tamaños; `step_structs.py:168-176`. No es diccionario de IDs de campos. |
| `cdataTableAccessors.ts`, `incbinRowAccessors.ts`, `eventObjectAnims.ts`, `stringUtil.ts` | Conservan nombres C de accesores/funciones/constantes cuando existen; `clang_codegen.py:1236-1239,1321-1324,1645-1654`. Los datos siguen numéricos. `EOS` en `stringUtil.ts` no es ID de gameplay. |

## 3. Bytecode: operandos y medidas

No existe una tabla que indique “opcode X, bytes Y..Z = flag/map/item”. `scripts.json` guarda nombres de comandos, etiquetas, símbolos externos y rutinas especiales, pero no firmas de operandos (`step_scripts.py:131-141`). `commands.ts` interpreta bytes y palabras: `ScrCmd_setflag` pasa una halfword a `flagSet`, `ScrCmd_setvar` consume dos halfwords y `ScrCmd_specialvar` lee variable destino e índice de special (`src/fr/script/commands.ts:189-225,233-235`). El código del intérprete no es un índice declarativo exhaustivo de literales serializados.

La clase se puede derivar parcialmente de macros en `../pokefirered/asm/macros/event.inc`: `setvar`, `setflag`, `warp`, `giveitem`, `trainerbattle`, etc. Pero macros de alto nivel se expanden; macros genéricas pueden elegir var o inmediato por rango (`compare`, `setorcopyvar`); una constante `VAR_*` puede usarse como argumento de flag. El binario pierde el token fuente y parte de la intención. La firma debe cotejar macros y handlers C y guardarse antes de ensamblar.

El escaneo de `.s`/`.inc` de `../pokefirered/data` cuenta líneas de invocación macro por las listas explícitas del apéndice, no opcodes/operandos binarios. Categorías se solapan y macros wrapper pueden expandirse en varios opcodes:

| Familia de macros fuente | Invocaciones |
|---|---:|
| flag | 894 |
| var/compare | 2.785 |
| mapa/warp | 46 |
| combate de entrenador | 697 |
| especie | 30 |
| item | 260 |
| movimiento explícito (`teachmove`, `teachmoveto`) | 0 |
| música/SE | 1.121 |
| transferencia/control de script | 3.657 |

El cero solo dice que no hubo macro directa de esa lista en esos archivos, no que no haya IDs de movimiento en otras tablas o macros. **No hay conteo fiable de operandos tipados del binario en los JSON actuales.**

**Vars/flags dinámicas:** `specialvar` recibe ID de variable destino e índice de función; specials pueden leer/escribir globals `gSpecialVar_*`. `setflag` opera sobre flag aunque la expresión venga escrita como `VAR_*`. Compare/set-or-copy genéricos infieren el tipo según rango/valor. Un reverse-map de literales podría cambiar el operando equivocado o no traducir valores dinámicos. El sidecar debe anotar solo literales con tipo cierto y señalar ambiguos/dinámicos para runtime o revisión.

## 4. Refs existentes y colisiones comprobadas

`refs/emerald/scripts.json` (R18, `refs/README.md:340-345`) da por mapa labels, llamadas `special`/`specialvar` y usos simbólicos de flags/vars. El JSON existente mide 468 mapas, 6.846 labels, 690 llamadas `special` (194 símbolos únicos; 149 ausentes en FireRed), 241 `specialvar` (50 únicos; 39 ausentes), 597 flags y 158 vars nombrados únicos; suma 1.446 usos de flags y 3.139 de vars. Es un índice de fuentes Emerald, no offsets tipados del bytecode ni valores numéricos.

`refs/emerald/maps.json` y `trainers.json` conservan IDs simbólicos de mapas, música, clima/tipo y `TRAINER_*`, con datos/contadores de eventos. Con headers/constants por juego ayudan a formar tablas nombre→valor, pero no traducen operandos FireRed. R20 aporta mapas/tilesets Crystal como fuente visual de equivalencias Johto: 388 mapas, 37 tilesets y 2.664 filas de bloques en tilesets. Las rejillas son índices numéricos; esto no aporta IDs Gen 3 para flags/vars/trainers.

Ejemplos de discrepancia real comprobados en headers:

| Símbolo/slot | FireRed | Emerald | Interpretación |
|---|---:|---:|---|
| `FLAG_HIDE_DEOXYS` | 153 (`0x099`) | 763 (`0x2FB`) | Mismo nombre, valor distinto; verificar equivalencia de entidad en uso. Los slots `0x099` sí colisionan con significado distinto: ver fila siguiente. |
| `TRAINER_CLASS_AQUA_ADMIN` | 55 | `0x0B` (11) | Misma etiqueta de clase, valor reindexado (`trainers.h:238`/`:299`). |
| `MUS_CAUGHT` | 322 | 352 | Misma etiqueta, reindexada; confirmar el asset antes de asegurar equivalencia (`songs.h:330`/`:283`). |
| `FLAG_HIDE_HO_OH` / slot `0x09C` | `FLAG_HIDE_HO_OH` = 156 (`0x09C`) | `FLAG_HIDE_HO_OH` = 801 (`0x321`); en slot `0x09C`, `FLAG_BATTLE_FRONTIER_TRADE_DONE` | Mismo nombre reindexado y además colisión del valor FireRed con otro significado Emerald (`flags.h:172`/`:178`). |
| `VAR_ALTERING_CAVE_WILD_SET` | `0x4024` | `0x403E` | Valor distinto; no implica por sí solo cambio semántico (`vars.h:71`/`:82`). |
| `OBJ_EVENT_GFX_BEAUTY` | 29 | 45 | Valor numérico distinto; revisar identidad contra datos de objeto. |

`engineSplit.py` no cuenta expresiones, enums ni headers generados (`:20-22`). Los
740 son diferencias numéricas de defines literales; no significan que las 740
entidades hayan cambiado de significado. Las coincidencias semánticas se deben
verificar contra datos y referencias.

## 5. Propuesta Emerald y diseño de renumeración

### 5.1 Conservar símbolos sin cambiar FireRed

Usar la configuración `Game` y rutas de 6.2. Agregar productos nuevos por juego:

```json
{
  "game": "emerald",
  "flags": {"FLAG_GOT_SS_TICKET": 123},
  "vars": {"VAR_RESULT": 32781},
  "maps": {"MAP_ROUTE1": 787},
  "trainers": {"TRAINER_BROCK": 42},
  "items": {"ITEM_MASTER_BALL": 1},
  "species": {"SPECIES_BULBASAUR": 1},
  "moves": {"MOVE_POUND": 1},
  "songs": {"MUS_PALLET": 300}
}
```

Es solo un esquema, no salida exportada. Guardar inverso como `valor → [nombres]` para alias. Agregar `script_operands.json` (y equivalente de combate) con `{kind, scriptOffset, opcode, operandOffset, width, namespace, value, symbol, sourceKind}`. Capturar al expandir/ensamblar macros con firmas auditadas contra `event.inc` y handlers. Si conviene para FireRed, generar un archivo nuevo aparte; nunca editar/reserializar sus productos actuales.

**Equivalencia binaria FireRed:** árbol de trabajo aislado y compilación privada; manifiesto ordenado `{ruta relativa, MD5}` de archivos regulares de `public/fr/` y `src/fr/generated/` antes y después; comparar conjuntos de rutas y hashes siguiendo [EXPORTADOR-EMERALD.md §5](EXPORTADOR-EMERALD.md). Si 6.1 ya trasladó generated, usar solo correspondencia explícita de prefijos. Un archivo auxiliar nuevo no debe alterar hashes de archivos existentes.

### 5.2 Renumerar al unir el mundo

Entrada: registros de símbolos por juego/namespace, datos de mapas/trainers y referencias de bytecode tipadas. Salida: IDs comunes, contenido transformado y tablas `(juego, namespace, id_anterior) → id_común`. Para nombres homónimos con significado distinto, cualificar (`firered:FLAG_*`, `emerald:FLAG_*`, `crystal:*`) y mantener tabla explícita de equivalencias revisada. No fusionar por grafía ni número. Referencias desconocidas/ambiguas quedan opacas y bloquean su conversión automática. Versionar/migrar saves si se reescriben IDs persistidos.

## 6. Riesgos y alcance no cubierto

- **Expresiones C:** `FLAG_TRAINER_FLAG_START + id`, rangos, enums y alias calculados no entran al conteo literal; al compilar pueden perder su procedencia simbólica.
- **Flags temporales/sistema:** headers definen 1.470/1.545 nombres `FLAG_*` en FireRed/Emerald; slots persistentes principales son 2.304 (`0..0x8FF`) y 2.400 (`0..0x95F`). Ambos reservan 128 flags especiales `0x4000..0x407F` en EWRAM. Flags temporales/system se solapan/aliasan, no se suman a las persistentes.
- **Vars:** 274/285 nombres `VAR_*` definidos en headers primarios; 256 slots ordinarios `0x4000..0x40FF` en ambos; especiales 21 en FireRed (`0x8000..0x8014`) y 22 en Emerald (`0x8000..0x8015`). Caben en u16 (65.536 patrones), pero no son traducibles sin namespace y tipo.
- **Saves:** los JSON de partida guardan números; cambiar IDs requiere versión, migración y pruebas de saves. Globals efímeros y referencias externas quizá no tengan símbolo recuperable.
- **Semántica:** mismo número puede significar flags distintas; mismo nombre puede estar reindexado, ser alias o cambiar significado. No se deduce equivalencia del nombre solo.
- **Crystal:** catálogo útil para mapas/tilesets de fase 5; no es catálogo de IDs Gen 3.
- **SIN VERIFICAR:** no hay una salida `public/emerald` inspeccionada; no se ejecutó el exportador ni se calcularon hashes antes/después; no se probó cobertura de anotaciones Emerald ni equivalencia semántica de todas las colisiones.
- **BLOQUEADO:** ninguno; no se repitió el mismo bloqueo en dos intentos.

## 7. Comandos exactos y alcance de cifras

Defines literales, comando ejecutado:

```sh
python3 tools/engineSplit.py --constants
```

Salida relevante: `Literal defines: FireRed 7641, Emerald 10634, common 3783, different value 740, FireRed only 3858`. Alcance y patrón en `tools/engineSplit.py:20-22,44,157-175`: `#define NAME <entero>` directo, con comentario final opcional; no expresiones, enums ni headers generados.

Conteo exacto de invocaciones fuente por macro en `.s`/`.inc` bajo `../pokefirered/data`:

```sh
python3 - <<'PY'
from pathlib import Path
import re
root=Path('../pokefirered/data')
files=sorted([*root.rglob('*.s'),*root.rglob('*.inc')])
cats={
'flag':set('call_if_set call_if_unset clearflag goto_if_set goto_if_unset setflag'.split()),
'var':set('addvar call_if_eq call_if_ge call_if_le call_if_lt call_if_ne copyvar goto_if_eq goto_if_ge goto_if_le goto_if_lt goto_if_ne random setorcopyvar setvar specialvar subvar'.split()),
'map':set('setdynamicwarp setwarp warp warphole warpspinenter'.split()),
'trainer':set('trainerbattle trainerbattle_single trainerbattle_double trainerbattle_continue_script trainerbattle_no_intro trainerbattle_no_music trainerbattle_no_intro_or_music trainerbattle_tutorial trainerbattle_rematch trainerbattle_link'.split()),
'species':set('giveegg givemon setwildbattle'.split()),
'item':set('finditem giveitem giveitem_msg givemon putitemaway setwildbattle'.split()),
'move':set('teachmove teachmoveto'.split()),
'music_SE':set('playbgm playfanfare playse playsewithpan fadeoutbgm fadeinbgm'.split()),
'script_label':set('call goto goto_if_eq goto_if_ge goto_if_le goto_if_lt goto_if_ne call_if_eq call_if_ge call_if_le call_if_lt call_if_ne'.split()),
}
counts={k:0 for k in cats}
for p in files:
 for line in p.read_text(errors='replace').splitlines():
  line=line.split('@',1)[0].strip()
  m=re.match(r'([A-Za-z_][A-Za-z0-9_]*)\b',line)
  if m:
   token=m.group(1).lower()
   for k,s in cats.items():
    if token in s: counts[k]+=1
print('files',len(files))
for k,v in counts.items(): print(k,v)
PY
```

Esta ejecución: 797 archivos; flag 894, var 2.785, mapa 46, entrenador 697, especie 30, objeto 260, movimiento 0, música/SE 1.121 y script_label 3.657. Las categorías se solapan por diseño; no equivalen a códigos de operación ni operandos binarios.

Conteo exacto de nombres `#define` en headers de flags/vars (incluye reservados/aliases, no expansiones):

```sh
python3 - <<'PY'
import re
from pathlib import Path
for f in ['flags.h','vars.h']:
 for game,path in [('fr',Path('../pokefirered/include/constants')/f),('em',Path('../refs-src/pokeemerald/include/constants')/f)]:
  txt=path.read_text()
  pat=r'^\s*#define\s+(?:FLAG_|VAR_)\w+\b'
  print(f,game,len(set(re.findall(pat,txt,re.M))))
PY
```

Comando exacto de límites y fórmulas de capacidad en esos headers:

```sh
python3 - <<'PY'
import re
from pathlib import Path
for game, path in [('FireRed',Path('../pokefirered/include/constants/flags.h')),('Emerald',Path('../refs-src/pokeemerald/include/constants/flags.h'))]:
 s=path.read_text()
 print(game,'primary_last',re.findall(r'^#define (?:FLAG_0x8FF|FLAG_UNUSED_0x95F)\s+(.+)$',s,re.M)[-1])
 print(game,'flags_count',re.search(r'^#define FLAGS_COUNT\s+(.+)$',s,re.M).group(1))
 print(game,'special_start/end',*[re.search(r'^#define '+n+r'\s+(.+)$',s,re.M).group(1) for n in ['SPECIAL_FLAGS_START','SPECIAL_FLAGS_END']])
for game,path in [('FireRed',Path('../pokefirered/include/constants/vars.h')),('Emerald',Path('../refs-src/pokeemerald/include/constants/vars.h'))]:
 s=path.read_text()
 print(game,'vars',*[re.search(r'^#define '+n+r'\s+(.+)$',s,re.M).group(1) for n in ['VARS_START','VARS_END','SPECIAL_VARS_START','SPECIAL_VARS_END']])
PY
```

Los límites impresos son `FLAG_0x8FF`/`FLAG_UNUSED_0x95F`, `FLAGS_COUNT = FLAG_0x8FF + 1`/`DAILY_FLAGS_END + 1`, flags especiales `0x4000..0x407F`, vars ordinarias `0x4000..0x40FF` y vars especiales `0x8000..0x8014`/`0x8015`; las capacidades numéricas en §6 se calculan de esos límites y se corroboran en `flags.h`/`vars.h`.

Refs: comando exacto para los conteos R18/R20 (sumas R18 se calculan desde las listas por mapa; filas de tileset no son celdas de la rejilla del mapa):

```sh
python3 - <<'PY'
import json
from pathlib import Path
scripts=json.loads(Path('refs/emerald/scripts.json').read_text())['data']
t=scripts['totals']
print('R18',t)
print('R18 flag uses',sum(x['uses'] for m in scripts['maps'] for x in m['flags']))
print('R18 var uses',sum(x['uses'] for m in scripts['maps'] for x in m['vars']))
crystal={name:json.loads(Path('refs/crystal/'+name+'.json').read_text())['data'] for name in ['maps','tilesets']}
print('R20 maps',len(crystal['maps']),'tilesets',len(crystal['tilesets']),'tileset block rows',sum(len(x['blocks']) for x in crystal['tilesets']))
PY
```

Conteos impresos: R18 según la tabla; R20 mapas 388, tilesets 37, filas de bloques en tilesets 2.664. No sumar las celdas de las rejillas de mapa a esas filas de bloques de tileset.

Comando exacto de ejemplos de nombres comunes con valores distintos (mismo patrón literal de `engineSplit.py`, enumerando primeras cinco por familia):

```sh
python3 - <<'PY'
import re
from pathlib import Path
pat=re.compile(r'^\s*#\s*define\s+([A-Za-z_]\w*)\s+(-?(?:0[xX][0-9A-Fa-f]+|\d+))\s*(?://.*|/\*.*\*/)?\s*$',re.M)
a={n:int(v,0) for p in sorted(Path('../pokefirered/include/constants').glob('*.h')) for n,v in pat.findall(p.read_text(errors='replace'))}
b={n:int(v,0) for p in sorted(Path('../refs-src/pokeemerald/include/constants').glob('*.h')) for n,v in pat.findall(p.read_text(errors='replace'))}
for prefix in ['FLAG_','VAR_','TRAINER_CLASS_','MUS_','OBJ_EVENT_GFX_']:
 xs=[(n,a[n],b[n]) for n in sorted(a.keys()&b.keys()) if n.startswith(prefix) and a[n]!=b[n]]
 print(prefix,xs[:5])
PY
```

Imprime para flags `FLAG_HIDDEN_ITEMS_START (1000,500)`, `FLAG_HIDE_DEOXYS (153,763)`, `FLAG_HIDE_HO_OH (156,801)`; vars `VAR_ALTERING_CAVE_WILD_SET (16420,16446)`; entrenador `TRAINER_CLASS_AQUA_ADMIN (55,11)`; música `MUS_CAUGHT (322,352)`; gráfico `OBJ_EVENT_GFX_BEAUTY (29,45)`.

Muestras de JSON FireRed: comando exacto que leyó filas/claves acotadas (sin volcar archivos enteros):

```sh
python3 - <<'PY'
import json
from pathlib import Path
root=Path('public/fr')
idx=json.loads((root/'maps.json').read_text())
print('map',idx['maps']['MAP_BATTLE_COLOSSEUM_2P'])
m=json.loads((root/'maps/MAP_BATTLE_COLOSSEUM_2P.json').read_text())
print('warp',m['warps'][0]);print('object',m['objects'][0])
layout=json.loads((root/'layouts/LAYOUT_BATTLE_COLOSSEUM_2P.json').read_text());print('layout',layout['primary'],layout['secondary'])
s=json.loads((root/'scripts.json').read_text());print('scriptlabel',s['labels'].get('Movement_HoOhAppear'),'command0',s['commands'][0])
for f,key in [('battle/scripts.json','BattleScript_ExplosionDoAnimStartLoop'),('battle/ai.json','AI_CV_Heal2'),('battle/anims.json','Move_NONE')]:
 d=json.loads((root/f).read_text());print(f,key,d['labels'].get(key))
for f,key in [('species.json','species'),('moves.json','moves')]:
 d=json.loads((root/'data'/f).read_text());print(f,'row0',d[key][0])
print('trainer1',json.loads((root/'data/trainers.json').read_text())[1])
print('heal0',json.loads((root/'data/heal_locations.json').read_text())['heal_locations'][0])
print('song1',json.loads((root/'audio/songs.json').read_text())['songs'][1])
PY
```

Los ejemplos tabulares citan claves/valores de esas salidas o las líneas de productor. Headers de colisiones se revisaron con `nl -ba <header> | sed -n '<línea>,<línea>p'`; para nombres numéricos almacenados se leyó `public/fr/constants.json`. Muestras revisadas mediante lecturas acotadas, no se volcó JSON completo ni se ejecutó exportador/generador de `refs`.

Comando exacto para las muestras de constantes y familias de salida de la tabla:

```sh
python3 - <<'PY'
import json
from pathlib import Path
r=Path('public/fr')
c=json.loads((r/'constants.json').read_text())
for k in ['FLAG_GOT_HM01','VAR_RESULT','MAP_ROUTE1','TRAINER_YOUNGSTER_TYLER','MUS_PALLET']: print('constant',k,c[k])
print('item',next(x for x in json.loads((r/'data/items.json').read_text())['items'] if x['const']=='ITEM_MASTER_BALL'))
o=json.loads((r/'objects.json').read_text());print('object gfx',o['gfx']['66']['name'])
t=json.loads((r/'tilesets.json').read_text());print('tileset',t['gTileset_General'])
g=json.loads((r/'gfx.json').read_text());print('gfx pokemon0',g['pokemon']['0'])
f=json.loads((r/'fieldfx.json').read_text());print('fieldfx keys',f['templates']['ShadowSmall'].keys(),'callback',f['templates']['ShadowSmall'].get('callback'))
ch=json.loads((r/'charmap.json').read_text());print('charmap',ch['chars'].get('A'),ch['names'].get('PKMN'))
cb=json.loads((r/'cdata/event_object_movement.json').read_text());print('cdata',cb['defs']['sElevationToPriority']['type'],cb['defs']['sElevationToPriority']['value'][:3])
i=json.loads((r/'incbin/index.json').read_text());print('incbin',i['symbols'].get('sBagWindowPalF'))
print('string sample',next(iter(json.loads((r/'data/strings.json').read_text()).items())) )
print('menu',json.loads((r/'data/script_menu.json').read_text())['stdStrings'][:3])
PY
```

La fila de `constants.json` imprime los cinco pares nombre/valor; el comando de muestras de mapas/bytecode anterior imprime etiquetas, diseños, especies/movimientos posicionales, entrenador, punto de curación y audio.
