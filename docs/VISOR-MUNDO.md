# Visor del mundo: plan de la versión 1 (Kanto exterior)

Herramienta de diseño y revisión, **no es parte del juego**. Muestra los 37 mapas
exteriores de Kanto unidos en un solo lienzo, con capas que marcan qué bloquea el
paso y qué dispara historia, y una ficha por elemento que dice **qué lo desactiva y
dónde**. Sirve para la revisión de historia (`PLAN-RECORRIDO.md`) y para diseñar el
modo libre ([VISION.md](VISION.md); análisis de bloqueos en la conversación del
2026-10-02 con el usuario).

Plan escrito por Claude el 2026-10-02 sobre `main`. Las cifras marcadas como
**pista** salieron de comandos ejecutados ese día: compruébalas, y si no cuadran
escribe `PISTA INCORRECTA: <dice> / <datos>` (TAREAS-FINALES §0).

## 1. Qué entra y qué no

**Entra (V1):**
- Kanto exterior: ciudades, rutas 1–25 y Meseta Añil, unidas por sus conexiones.
- Capas: colisión, agua, salientes, obstáculos de MO, NPCs condicionales,
  entrenadores, activadores de historia y puertas.
- Ficha al pinchar, con el script o la condición que activa o desactiva el elemento.
- Zoom, desplazamiento, buscador por nombre de mapa y estado en la URL.

**No entra (V2 o más adelante, no lo empieces):** interiores, Islas Sete, simulación
de alcance según medallas y objetos, otras regiones, edición de mapas, animación de
tiles.

## 2. Reglas de la tarea

- **No modifiques `src/fr/`, `public/fr/` ni `tools/decomp/`.** El visor importa
  módulos de `src/fr/` en modo solo lectura (`rom`, `TileRenderer`,
  `metatileBehavior`). Si necesitas un cambio en ellos, para y avisa.
- **Archivos nuevos:**
  - `viewer.html` en la raíz;
  - `src/viewer/` (TS de la página);
  - `tools/viewer/world_index.py` (índice);
  - `public/viewer/kanto.json` (salida del índice, generada; nunca a mano).
- **El índice sale del decomp** (`../pokefirered`). Resuelve su ruta como
  `tools/decomp/common.py` (`DECOMP`), sin rutas fijas. Debe ser determinista: dos
  ejecuciones, mismo md5.
- **Nada de `refs/`.** `src/` nunca importa `refs/`.
- Trabajo en paralelo según TAREAS-FINALES §0: tu carpeta y tu rama, sin merge ni push.

## 3. Datos disponibles (ya exportados)

| Qué | Dónde | Notas |
|---|---|---|
| Cabecera de mapa | `public/fr/maps/MAP_*.json` | `connections`, `objects`, `warps`, `coords` (activadores: `var`, `value`, `scriptName`), `bgs`. Tipos en `src/fr/rom.ts:11-62` (`MapHeader` en 38) |
| Layout | `public/fr/layouts/LAYOUT_*.json` | `width`, `height`, `primary`, `secondary`, `blocks` (u16 en base64; `rom.loadLayout` lo decodifica) |
| Tileset | `public/fr/tilesets/gTileset_*.json` | tiles 4bpp, paletas, metatiles, `attributes` (u32 por metatile) |
| Cargadores | `src/fr/rom.ts:405` `loadMap`, `:421` `loadLayout`, `:449` `loadTileset` | Devuelven los tipos de `rom.ts` |
| Bits de cada bloque | `src/fr/field/fieldmap.ts:11-15` | metatile `& 0x3FF`; colisión `& 0xC00 >> 10`; elevación `& 0xF000 >> 12` |
| Atributos de un metatile | `src/fr/field/fieldmap.ts:428-429` | primario si id < 640 (`NUM_METATILES_IN_PRIMARY`), si no secundario `id - 640`. Para extraer el comportamiento, sigue `ExtractMetatileAttribute` y `sMetatileAttrMasks` del C (`fieldmap.c:63` y `:382`) |
| Comportamientos | `src/fr/generated/metatileBehavior.ts` | `MetatileBehavior_IsSurfable`, `IsJumpEast/West/North/South`, `IsTallGrass`, `IsWaterfall`… |
| Dibujo de metatiles | `src/fr/field/tileRenderer.ts:15` (`TileRenderer`), `:173` `metatile(id)` | Devuelve canvas `bottom` y `top`. **Usa el estado global de paleta** (`hw/palette`): carga las paletas de cada par de tilesets antes de dibujar sus mapas (`LoadMapTilesetPalettes`) y dibuja los mapas uno a uno |

Los **scripts** están compilados (`public/fr/scripts.bin`). Para saber quién cambia
una variable o un flag, el índice lee el texto fuente del decomp (§4.3), no el binario.

## 4. Índice: `tools/viewer/world_index.py`

Comando: `npm run viewer:index`. Escribe `public/viewer/kanto.json`.

### 4.1 Unir los mapas

- BFS **en cola (FIFO)** desde `MAP_PALLET_TOWN` en (0, 0), siguiendo solo
  conexiones `up`, `down`, `left` y `right`.
- Posición del vecino `b` desde `a`, con `o = offset` y tamaños en metatiles:

  | Dirección | Posición de `b` |
  |---|---|
  | `up` | (ax + o, ay − bh) |
  | `down` | (ax + o, ay + ah) |
  | `left` | (ax − bw, ay + o) |
  | `right` | (ax + aw, ay + o) |

- **Gana la primera posición.** Cada conexión que no cuadre va a `conflicts`.
- **Pista** (comprobada con un BFS FIFO sobre `public/fr/maps` y `public/fr/layouts`):
  - 37 mapas unidos;
  - mundo de 408 × 400 metatiles;
  - exactamente 1 conflicto: `MAP_ROUTE6` → `MAP_SAFFRON_CITY_CONNECTION`
    (posición previa (204, −140), propuesta (216, −140)). Ruta 6 declara offset 0 y
    la conexión de Azafrán 12: es una asimetría del propio decomp.
- **El orden importa:** con una pila (DFS) en lugar de cola aparecen 9 conflictos en
  cadena. Usa FIFO y en el mismo orden en que aparecen las conexiones.

### 4.2 Clasificar elementos

Para cada mapa unido:

| Capa | Regla | Ejemplo para verificar |
|---|---|---|
| `corte` | objeto con `graphicsName` `OBJ_EVENT_GFX_CUT_TREE` | Ciudad Carmín (19, 24), junto a la puerta del gimnasio (warp en (14, 25)) |
| `fuerza` | `OBJ_EVENT_GFX_PUSHABLE_BOULDER` | (no hay en Kanto exterior; correcto si sale 0) |
| `golpe_roca` | `OBJ_EVENT_GFX_ROCK_SMASH_ROCK` | (idem) |
| `snorlax` | `OBJ_EVENT_GFX_SNORLAX` | Rutas 12 y 16 |
| `entrenador` | objeto con `trainerType != 0` | dibuja su rango de visión (`trainerRange`) hacia donde mira |
| `npc_condicional` | resto de objetos con `flag` de ocultación | |
| `activador` | cada entrada de `coords` | Ruta 23: 42 activadores para 7 guardias (`Cascade`, `Thunder`, `Rainbow`, `Soul`, `Marsh`, `Volcano`, `Earth`) |
| `puerta` | cada `warp`, con `destMap` | |

Además, guarda en cada objeto si su posición cambia por script: el nombre del mapa
aparece en un `setobjectxyperm` de su `scripts.inc` con su `local_id`. Ejemplo: el
policía de Celeste se mueve en `CeruleanCity_EventScript_BlockExits`
(`data/maps/CeruleanCity/scripts.inc:10-13`) mientras no está `FLAG_GOT_SS_TICKET`.

### 4.3 Quién cambia cada variable y flag

- Recorre `data/maps/*/scripts.inc` y `data/scripts/*.inc` del decomp.
- La etiqueta actual es la última línea que termina en `::` o en `:`.
- Registra:
  - `setvar VAR, valor` → `{var, valor, mapa, etiqueta, línea}`;
  - `setflag FLAG` y `clearflag FLAG` → `{flag, acción, mapa, etiqueta, línea}`.
- Las variables y flags que nunca aparecen así se cambian desde C o con macros. Para
  esos, guarda `writers: []` y en la ficha muestra "se cambia fuera de los scripts
  de mapa".
- Muestras para verificar:
  - `VAR_MAP_SCENE_VIRIDIAN_CITY_OLD_MAN`: 1 en `PalletTown_ProfessorOaksLab`
    (`scripts.inc:680`) y 2 en `ViridianCity` (`scripts.inc:234`);
  - `VAR_MAP_SCENE_PEWTER_CITY`: 1 en `PewterCity_Gym` (`scripts.inc:16`);
  - `FLAG_HIDE_ROUTE_12_SNORLAX`: `setflag` en `Route12` (`scripts.inc:27`).

### 4.4 Esquema de salida

```json
{
  "_meta": {"generator": "tools/viewer/world_index.py", "decomp_commit": "<git rev-parse HEAD de ../pokefirered>"},
  "world": {"width": 408, "height": 400, "origin": "MAP_PALLET_TOWN"},
  "maps": {"MAP_PALLET_TOWN": {"x": 0, "y": 0, "width": 24, "height": 20, "layout": "LAYOUT_PALLET_TOWN"}},
  "conflicts": [{"from": "MAP_ROUTE6", "to": "MAP_SAFFRON_CITY_CONNECTION", "placed": [204, -140], "proposed": [216, -140]}],
  "elements": [{"map": "MAP_ROUTE12", "x": 0, "y": 0, "layer": "snorlax", "localId": 0, "graphics": "OBJ_EVENT_GFX_SNORLAX", "flag": "FLAG_HIDE_ROUTE_12_SNORLAX", "movedByScript": false}],
  "triggers": [{"map": "MAP_VIRIDIAN_CITY", "x": 0, "y": 0, "var": "VAR_MAP_SCENE_VIRIDIAN_CITY_OLD_MAN", "value": 0, "script": "ViridianCity_EventScript_RoadBlocked"}],
  "writers": {"VAR_MAP_SCENE_VIRIDIAN_CITY_OLD_MAN": [{"value": 1, "map": "PalletTown_ProfessorOaksLab", "label": "...", "line": 680}]}
}
```

Las coordenadas de `elements` y `triggers` son locales al mapa (el visor suma la
posición del mapa). Los ceros del ejemplo son marcadores, no datos. Ordena todas las
listas para que la salida sea estable. Usa los nombres de constante del decomp
(`var` como texto); en `public/fr/maps` `var` es numérico, así que toma los nombres
de los `map.json` del decomp.

## 5. Página: `viewer.html` + `src/viewer/`

1. **Arranque:** carga `public/viewer/kanto.json`; después, con `rom`, los mapas,
   layouts y tilesets que aparecen en él.
2. **Render base:**
   - Cada mapa en un canvas fuera de pantalla de `width × 16` por `height × 16`
     píxeles: capa `bottom` y encima `top` de cada metatile.
   - Agrupa los mapas por par de tilesets y carga sus paletas antes de dibujarlos (§3).
   - Primer frame de las animaciones; sin borde del mapa.
   - Compón todo en el lienzo del mundo según `maps[*].x/y`.
3. **Navegación:**
   - Arrastrar para mover y rueda para zoom (×0,25 a ×4, píxeles nítidos con
     `imageSmoothingEnabled = false`).
   - Buscador por nombre de mapa.
   - Estado en el hash de la URL (`#x=…&y=…&z=…&capas=…`) para compartir una vista.
4. **Capas superpuestas** (casillas semitransparentes, interruptor por capa):
   - colisión (bloque con colisión ≠ 0);
   - agua (`IsSurfable`);
   - salientes (`IsJump*`, con flecha);
   - las del índice (§4.2).
5. **Ficha al pinchar:**
   - mapa, coordenadas, tipo;
   - flag o variable con su condición;
   - lista de `writers` (mapa, etiqueta, línea);
   - si se mueve por script;
   - para puertas, el mapa de destino.
6. **Integración:**
   - Vite multipágina: añade `viewer.html` a `build.rollupOptions.input` en un
     `vite.config.ts` que conserve el comportamiento actual de `index.html`.
   - TypeScript: incluye `src/viewer/main.ts` en `tsconfig.json`.
   - Script `npm run viewer:index`.
   - Servir con el servidor `vite` de `.claude/launch.json` y abrir `/viewer.html`.

## 6. Terminada cuando

- `npm run viewer:index` dos veces da el mismo md5, y el índice cumple las pistas
  de §4.1 o las corrige con `PISTA INCORRECTA`.
- Las muestras de §4.2 y §4.3 aparecen en la ficha correspondiente del visor.
- En el navegador:
  - Paleta, Verde y Ruta 1 se ven como en el juego (compáralos con una partida en
    esas zonas);
  - la Ruta 6 y Azafrán se ven sin solapes visibles (anota cómo se ve el conflicto);
  - las capas se encienden y apagan.

  Una captura del mundo completo y otra de una ficha, adjuntas en la entrega (no en
  el repo).
- `npm run check:port` (el inventario no cambia), `npm run build`, `git diff --check`
  y `npm run check:honesty` en verde.
- Commits: uno de código (índice + página) y, aparte, la marca en TAREAS-FINALES §7.
  Indica qué verificaste: datos, tipos, navegador.

## 7. Después (V2, solo como referencia)

- **Interiores:** abrir el mapa destino de una puerta en un panel.
- **Simulador de alcance:** un estado (medallas, objetos clave, flags) decide qué
  activadores y obstáculos siguen activos, y se pinta lo alcanzable desde un punto.
  Es la herramienta para comprobar que el modo libre no deja callejones sin salida.
- **Islas Sete y otras regiones:** el formato de mapas de Emerald, HnS y PKMN-World
  es el mismo de pret (Crystal ya está en `refs/crystal/`).
