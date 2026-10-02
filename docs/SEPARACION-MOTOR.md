# Informe 6.1: separación del motor (`core/` y `games/firered/`)

Tarea 6.1 de [TAREAS-FINALES.md](../TAREAS-FINALES.md), fase 2 de [VISION.md](VISION.md).
Es solo un informe: no se mueve código. Redactado el 2026-10-01 sobre `main` (`e95ee70a`).

Las cifras salen de `python3 tools/engineSplit.py` (añade `--modules` para ver las
listas). El script solo lee y no escribe nada; su docstring explica cómo clasifica.

## 1. Resumen

- **El 69 % de las funciones C de FireRed tienen nombre en Emerald.** De 12.018:
  3.677 idénticas, 3.680 con cuerpo distinto, 885 con el mismo nombre en otro
  archivo de Emerald y 3.776 exclusivas de FireRed.
- **Reparto propuesto de `src/fr/`** (260 módulos, 167.888 líneas, sin contar los
  generados):

  | Destino | Módulos | Líneas |
  |---|---:|---:|
  | Núcleo | 144 | 82.003 |
  | Núcleo con variantes | 36 | 23.700 |
  | FireRed | 68 | 44.804 |
  | Enlace (fuera de alcance) | 5 | 587 |

- **El obstáculo no es el tamaño, es la dirección de los imports.** 169 de los 260
  módulos forman un único ciclo, y el futuro núcleo importa 234 veces módulos que no
  son núcleo: 67 de ellas van a sistemas exclusivos de FireRed o de enlace.
- **Recomendación:** elegir el juego al compilar con un alias `@game/`, igual que el
  decomp compila cada juego con sus propios headers. No conviene un registro en
  tiempo de ejecución. En la fase 2 no se bifurca ninguna función. Primero se
  renombra la carpeta, después se extrae el núcleo por capas y por último se cortan
  las dependencias hacia arriba a través de un contrato `@game/*` comprobado por un
  check.

## 2. Qué dicen los datos

### 2.1 "Idéntica" y "distinta" son pistas, no pruebas

Revisé a mano 17 funciones marcadas `different` en `bg.c`, `palette.c`, `sound.c` y
`save.c`:

- **11 difieren solo en estilo:** `!= FALSE` frente a `!`, `case 0` frente a
  `case BG_TYPE_NORMAL`, nombres de variables locales, o `CpuFastCopy` frente a
  `DmaCopy32` para copiar lo mismo.
- **5 cambian el comportamiento:**
  - `PlayCryInternal` usa volumen 90 en FireRed y 70 en Emerald.
  - `PlaySE`, `PlayCry_Script` y `PlayFanfareByFanfareNum` comprueban el estado del
    Quest Log.
  - `ClearSaveData` borra los sectores de otra manera.
- **1 sin clasificar:** `BgTileAllocOp`, reescrita.

Al revés también pasa: una función idéntica en texto puede leer constantes con otro
valor (§2.3). La comparación cuerpo a cuerpo corresponde a la fase 3, función por
función, y no condiciona la fase 2.

### 2.2 FireRed mete ganchos propios en el motor común

El propio C de FireRed llama al Quest Log desde código compartido. Ejemplos:
`sound.c:193` y `sound.c:579` (`gQuestLogState`), y `text.c:537` (retardo en modo
reproducción). El port reproduce esos ganchos, y por eso módulos de bajo nivel
importan módulos exclusivos de FireRed:

| Módulo del núcleo | Importa | Para qué |
|---|---|---|
| `audio/sound` | `questLogEvents` | `gQuestLogState` |
| `gba/textPrinter`, `hw/menu` | `questLogState` | `gQuestLogState`, `CommitQuestLogWindow1` |
| `save` | `questLogObjects` | tipo `QuestLogScene` |
| `field/objectEvents` | `questLogEvents` | `QuestLogRecordNPCStep` y estado de reproducción |
| `hw/menuHelpers` | `unionRoom`, `linkState`, `pokemon/berry`, `pokemon/mail` | comprobaciones de enlace y de objetos |
| `battle/globals` | `trainerTower` | reserva y liberación de su estructura de combate |

En total, el núcleo importa 9 veces `questLogEvents` y 6 veces `game` (el módulo de
composición). Las otras 52 aristas van a 28 módulos más de FireRed (45) y a 3 de
enlace (7). La lista completa la da `tools/engineSplit.py`.

### 2.3 Las constantes son de cada juego

`src/fr/generated/constants.ts` tiene 14.057 constantes y lo importan 188 módulos.
Comparé los `#define NOMBRE número` literales de `include/constants/*.h` en los dos
decomps:

- FireRed tiene 6.730 defines literales.
- 3.746 nombres existen en los dos juegos; **737 tienen otro valor** en Emerald.
  Sobre todo están en `songs.h` (250), `trainers.h` (194),
  `event_object_movement.h` (135), `flags.h` (51) y `vars.h` (16).
- 2.984 solo existen en FireRed.

Así que el núcleo no puede importar las constantes de FireRed: tiene que importar
las del juego que se compila. Esta medición no cuenta los defines con expresiones.
El inventario completo de valores corresponde al informe 6.2.

### 2.4 Lo que ya está bien separado

- **Una sola raíz de datos:** `DATA_ROOT = "/fr"` (`src/fr/rom.ts:9`), usada por
  `rom.ts`, `hw/assets.ts`, `battle/bscript.ts` y seis módulos más.
- **El guardado es un objeto JSON** (`SaveData`, `src/fr/save.ts:121`) con clave de
  `localStorage` propia (`save.ts:677`). No copia el layout de bytes, así que
  Emerald puede tener su propio esquema sin chocar.
- **El runtime GBA escrito para el navegador** (`hw/ppu`, `hw/assets`, `gba/tasks`,
  `audio/m4a`…) no tiene C equivalente ni depende de nada de FireRed salvo las
  excepciones de §2.2.

## 3. Reparto propuesto

Criterio, para cada módulo: qué fracción de sus funciones existe en Emerald.

- **Núcleo:** al menos el 75 %.
- **Núcleo con variantes:** entre el 30 % y el 75 %.
- **FireRed:** menos del 30 %.

Los módulos sin C equivalente y unos pocos casos discutibles se clasifican a mano
(`NO_C` y `OVERRIDES` en el script), con estos motivos:

- **`save` y `hw/text` → variantes.** `save` mezcla la API de flags y vars (común)
  con el esquema `SaveData` (de cada juego). `hw/text` envuelve `new_menu_helpers.c`,
  que no existe en Emerald.
- **`battle/anims/special` y `field/weatherEffects` → variantes.** Sus funciones
  existen en otros archivos de Emerald (39 y 92 movidas), pero sus cuerpos no se han
  comparado.
- **`game` → FireRed.** Es el módulo de composición del juego. El núcleo solo
  necesita el tipo `Game`, que pasará a ser una interfaz del núcleo.
- **Enlace** (`linkState`, `unionRoom`, `mysteryGift`, `wonderNews`,
  `cereaderTool`): aparte, como en la meta principal.

**Núcleo (144).** Runtime `gba/` y `hw/` (salvo `hw/menu` y `hw/text`), `audio/`,
`decompress`, `random`, `util`, `rom` (cargador parametrizado). Motor de combate
completo (`battle/`, salvo los controladores de Oak/Old Man y Pokédude, `bg`, `ext`
y `main_init`). Modelo de Pokémon (`pokemon/` salvo `items`, `mail` y `partyRules`).
`script/commands` y `script/movement`. Campo: `objectEvents`, `playerAvatar`,
`fieldControl`, `doors`, `tileRenderer`… Pantallas compartidas: `partyMenu`,
`namingScreen`, `monMarkings`, `trainerCard` y el almacenamiento del PC.

**Núcleo con variantes (36).** `field/overworld`, `fieldmap`, `weather`,
`wildEncounter`, `trainerSee`, `gba/font`, `gba/textPrinter`, `hw/menu`, `save`,
`script/context`, `pokemon/items`, `pokemon/mail`, `evolutionScene`, `hallOfFame`,
`shop`… Van al núcleo, pero sus funciones con cuerpo distinto se bifurcarán en la
fase 3.

**FireRed (68).** Quest Log (8 módulos), Sistema de Ayuda, Fame Checker, Teachy TV,
VS Seeker, Trainer Tower, Battle Tower de FireRed, intro y Oak, menú principal y de
inicio, Mochila, Caja MT, Bolsa de Bayas, Pokédex, mapa regional, resumen,
Seagallop, créditos, `script/specials` y `game`/`boot`/`startup`.

**Ojo con el almacenamiento del PC.** Los `storageSystem*` quedan en el núcleo por
las 885 funciones "movidas": FireRed reparte en 6 archivos lo que Emerald tiene en
`pokemon_storage_system.c`. Antes de darlas por compartidas hay que comparar sus
cuerpos (fase 3).

## 4. Diseño recomendado

### 4.1 Elegir el juego al compilar

```
src/core/           motor común; nunca importa src/games/* directamente
src/games/firered/  contenido, sistemas propios y generated/ de FireRed
src/games/emerald/  (fase 3)
```

El juego se elige con un alias, `@game/*` → `src/games/<juego>/*`. Tiene que estar
igual en tres sitios: `tsconfig` (`paths`), Vite (`resolve.alias`) y esbuild
(`--alias`, para `tools/checks`). Cada juego es un build propio.

Motivos frente a un registro en tiempo de ejecución:

1. Las constantes son `export const` de cada juego (§2.3). Pasarlas a búsquedas en
   tiempo de ejecución cambiaría 188 módulos y quitaría tipos e inlining.
2. Es lo mismo que hace el decomp: el mismo `.c` se compila con otros headers.
3. Las fases 3–5 no necesitan dos juegos a la vez en memoria. La fase 6 (mundo
   unificado) es un paquete de contenido nuevo y su motor se diseñará entonces (ver
   el riesgo R8).

### 4.2 El contrato `@game/*`

El contrato es el conjunto de módulos que todo juego debe proporcionar y que el
núcleo puede importar. Al principio, exactamente lo que el núcleo importa hoy (§2.2):

- `@game/constants`, `@game/structs`, `@game/metatileBehavior`: los generados.
- `@game/data`: `DATA_ROOT` y clave de guardado.
- `@game/save`: esquema `SaveData`.
- Los sistemas propios que el núcleo llama: `questLog*`, `summaryScreen`, `bagMenu`,
  `startMenu`, `vsSeeker`, `trainerTower`…

Un check nuevo, `check:layers`, falla si `src/core/` importa `src/games/` sin pasar
por `@game/`, o si importa algo de `@game/` que no está en la lista del contrato. La
lista solo puede encoger.

En la fase 3, cada entrada del contrato tiene una de dos salidas:

- **Emerald tiene una función C con el mismo nombre** (`ShowPokemonSummaryScreen`,
  `CB2_BagMenuFromStartMenu`…). Su módulo `games/emerald/` la exporta. Es como el
  enlazador de C.
- **Es un sistema exclusivo de FireRed** (Quest Log, VS Seeker, Trainer Tower,
  Sistema de Ayuda). Lo que se bifurca es la función del núcleo que lo llama: su
  cuerpo de Emerald no contiene la llamada. **Emerald nunca proporciona módulos
  vacíos**, porque serían stubs y AGENTS.md los prohíbe.

### 4.3 En la fase 2 no se bifurca nada

En la fase 2 solo existe FireRed. Las funciones con cuerpo distinto siguen en
`core/` con el cuerpo de FireRed, sin capas de abstracción especulativas. La lista
`different` de `refs/emerald/functions.json` es la lista de trabajo de la fase 3.

## 5. Orden del traslado

Cada paso es un commit (o una rama corta) que deja verdes `check:port`,
`check:honesty`, `build`, `check:all` y `play:smoke`. Además, el inventario debe
dar la misma cifra (9.772 hoy) y la regeneración de FireRed debe dar archivos
idénticos.

0. **Requisitos.** §3.0 en verde con `play:smoke` estable. Ninguna rama de agente
   abierta: el paso 2 cambia todas las rutas. Guardar el md5 de `public/fr/` y
   `src/fr/generated/` como referencia.
1. **Rutas centralizadas en las herramientas.** Hoy 70 archivos de `tools/` citan
   `src/fr` (sin contar `engineSplit.py`) y 44 citan `public/fr`. Pasarlos a una constante compartida (Python y
   JS) sin mover nada. Incluye `portInventory.py`, `portPending.py`, `honesty.py` y
   `review_locations.py`: solo cambian la ruta, no el algoritmo. **Necesita permiso
   del usuario**, porque TAREAS-FINALES §0 prohíbe tocar `portInventory.py`.
2. **Mover `src/fr/` a `src/games/firered/` con `git mv` y añadir el alias**
   (tsconfig, Vite y esbuild). Es un cambio de nombre puro: los imports relativos no
   cambian, así que tampoco el orden de evaluación del ciclo de 169 módulos.
3. **Configuración del juego.** `@game/data` exporta `DATA_ROOT` y la clave de
   guardado con los valores actuales (`/fr` y `pokemon-gba-web-lab.firered.v2`, `save.ts:214`), para que las 24
   partidas de `tools/playtest/saves/` sigan cargando. El exportador escribe
   `generated/` en la nueva ruta: hay que coordinarlo con el informe 6.2.
4. **Crear `src/core/` y el check `check:layers`**, con el contrato inicial.
5. **Extraer el núcleo de abajo arriba, una capa por paso.** En cada paso los
   imports de los módulos movidos que apuntan a FireRed pasan a `@game/…`:
   1. runtime: `gba/`, `hw/`, `audio/`, `decompress`, `random`, `util`, `rom`;
   2. modelo de Pokémon (`pokemon/`) y la API de flags y vars;
   3. motor de scripts;
   4. motor de campo;
   5. motor de combate y animaciones (68 módulos, 48.805 líneas: puede ir en dos
      pasos, animaciones y luego el resto);
   6. pantallas compartidas (equipo, nombre, PC, ficha).
6. **Interfaz `Game` en el núcleo.** Los 6 módulos del núcleo que importan `game`
   pasan a depender de una interfaz declarada en `core/`. La implementación sigue en
   `games/firered/game.ts`.
7. **Dividir `save`.** La API de flags, vars y tiempo de juego va a `core/`; el
   esquema `SaveData` y sus tipos de Battle Tower, Trainer Tower y Quest Log van a
   `@game/save`. Es el primer paso que cambia código y no solo rutas: hay que
   comparar con `event_data.c` y `save.c` y probar guardar y continuar (C3).

Después del paso 7, `check:layers` ya refleja el contrato real, que es la entrada de
la fase 3.

## 6. Riesgos

- **R1 Falsa identidad entre funciones.** Un cuerpo idéntico puede leer constantes,
  structs o tablas distintas, y uno "distinto" puede ser solo estilo (§2.1). En la
  fase 3 se revisa cada función de la lista `different` con el C de Emerald; no se
  reutiliza nada a ciegas.
- **R2 Ciclo de 169 módulos.** Los movimientos no deben cambiar el orden de los
  imports dentro de cada archivo, o pueden aparecer errores TDZ al arrancar. Por eso
  cada paso exige `play:smoke` además de los tipos.
- **R3 Constantes.** Si algún módulo del núcleo usara una constante con valor propio
  de FireRed sin pasar por `@game/constants`, Emerald compilaría pero se comportaría
  mal. El alias lo evita mientras nadie importe `games/firered/generated`
  directamente; `check:layers` debe vigilarlo.
- **R4 Partidas guardadas.** Cambiar la clave de `localStorage` o la forma de
  `SaveData` inutiliza las partidas actuales y las 24 de prueba. Los pasos 3 y 7
  conservan los valores.
- **R5 Herramientas y cifras.** Un cambio de ruta mal hecho en `portInventory.py`
  hace bajar el contador sin que el juego cambie. Al terminar cada paso hay que
  comprobar que el inventario da el mismo resultado.
- **R6 Trabajo en paralelo.** El paso 2 choca con cualquier rama abierta, como la de
  Codex. Hay que hacerlo con todas las ramas fusionadas y avisar antes.
- **R7 Funciones "movidas" sin comparar.** Las 885 incluyen el almacenamiento del PC,
  `battle_anim_special` y `field_weather_effects`. Su sitio en el núcleo es
  provisional hasta compararlas.
- **R8 Fase 6.** Compilar un juego por build impide cargar FireRed y Emerald a la
  vez. Es aceptable mientras la fase 6 sea un paquete de contenido nuevo, pero hay
  que revisar la decisión al diseñarla.

## 7. Qué no cubre este informe

- La parametrización del exportador `tools/decomp/` por juego (rutas,
  `CPP_DEFINES`, `.decomp-build/<juego>`, `public/<juego>/`): es la tarea 6.2. Este
  informe solo fija que `generated/` y `public/` deben ser de cada juego.
- La revisión función por función de la lista `different` (fase 3).
- El orden de port de los 103 archivos exclusivos de Emerald (`refs/emerald/systems.json`).
