# Guía para agentes: port de Pokémon FireRed a TypeScript web

Lee esto antes de tocar código. Te ahorra horas: explica qué es el proyecto,
dónde está cada cosa, cómo se sacan los datos del decomp y cómo se porta y se
verifica un archivo C sin inventar nada.

- Estado y lista de pendientes (de fácil a difícil): [PORTING-STATUS.md](PORTING-STATUS.md)
- Flujo de arranque (intro → título → partida): [START-FLOW.md](START-FLOW.md)
- Inventario de contenido opcional del juego: [SECONDARY-MISSIONS-AUDIT.md](SECONDARY-MISSIONS-AUDIT.md)

## 1. Qué es

Es un **port fiel** del decomp `pokefirered` (C, en `../pokefirered`) a
TypeScript que corre en el navegador sobre un Canvas de 240×160. No es un
remake: se **emula el hardware de la GBA** (PPU con BG/OBJ/ventanas/blend,
VRAM, OAM, paletas, DMA de tilemaps, VBlank/HBlank, tareas, callbacks de
`gMain`). Así el código C se traduce casi línea por línea y usa los datos
originales (gráficos, tablas, scripts, música) exportados del decomp.

Regla de oro: **el comportamiento sale del C, los datos salen del decomp.**
Nada de valores, coordenadas, tiempos ni textos escritos a mano si existen en
el decomp.

## 2. Mapa del repositorio

```text
src/main.ts                 entrada → src/fr/startup.ts
src/fr/hw/                  "hardware" GBA y librerías base del juego
  runtime.ts                gMain, SetMainCallback2, VBlank/HBlank, HwScene (bucle por frame)
  ppu.ts gpu.ts             PPU scanline (BG 0-3, OBJ, WIN0/1, blend, mosaic), registros
  bg.ts window.ts text.ts   bg.c, window.c, text.c (templates, tilemaps, impresoras de texto)
  sprite.ts                 sprite.c completo (OAM, anims, affine, sheets, paletas por tag)
  palette.ts scanline.ts    palette.c (fades), scanline_effect.c
  menu.ts listMenu.ts menuHelpers.ts   menu.c, list_menu.c+menu_indicators.c, menu_helpers.c+money.c
  assets.ts                 acceso a datos exportados: incbin(), incbin16(), cdata(), loadCData()
  cdataSprite.ts            convierte cdata a OamData/AnimCmd/AffineAnimCmd/SpriteTemplate
src/fr/gba/                 capa antigua de campo (Canvas2D): tasks, input, charmap, fuentes, textPrinter
src/fr/field/               overworld: mapas, objetos, efectos de campo, clima, puertas, encuentros
src/fr/script/              intérprete de scripts de eventos (213 comandos) y specials (272)
src/fr/battle/              motor de batalla completo (battle_main, 248 comandos, IA, controladores, anims)
src/fr/pokemon/             reglas de Pokémon/objetos/caja/guardería/intercambios
src/fr/menus/               adaptadores de menús de campo (algunos aún son listas de texto)
src/fr/*.ts                 pantallas portadas 1:1: intro*, oakSpeech, mainMenu, namingScreen,
                            regionMap, optionMenu, bagMenu, tmCase, berryPouch, partyMenu,
                            pokemonIcon, hallOfFame, diploma, seagallop…
src/fr/generated/           GENERADO (no editar): constants.ts, structs.ts, metatileBehavior.ts
src/fr/rom.ts save.ts       datos cargados (rom.text, rom.c, rom.moveName…) y partida guardada
public/fr/                  GENERADO por el exportador (datos del juego para el navegador)
tools/decomp/               exportador Python del decomp (única fuente de public/fr y generated/)
tools/checks/               verificaciones headless en Node (ver §6)
.decomp-build/              caché del exportador (ignorado por git)
```

`game.ts` une el campo, los menús, las batallas y el guardado. `boot.ts`
arranca la partida e instala `window.frDebug` (ver §6).

## 3. Comandos

```sh
npm ci                     # dependencias (typescript, vite; esbuild viene con vite)
npm run dev                # servidor Vite (o preview_start "vite" desde .claude/launch.json)
npm run check:port         # tsc sobre TODO src (incluye batalla). Obligatorio tras cada cambio
npm run build              # tsc + bundle de producción
npm run check:arrow        # ejemplo de check headless (flecha de diálogo vs tiles del C)
python3 tools/decomp/export.py [pasos…]   # regenerar datos (ver §4)
```

URLs de desarrollo: `/` = arranque completo; `?fr=new` / `?fr=continue` saltan la intro.

## 4. De dónde salen los datos (pipeline del exportador)

`tools/decomp/export.py` lee `../pokefirered` (o `$POKEFIRERED`), compila las
herramientas del propio decomp (`gbagfx`, `preproc`…) y escribe `public/fr` y
`src/fr/generated`. Pasos (`export.py <paso>` ejecuta solo ese):

| Paso | Qué hace | Salida | Cómo se lee en TS |
|---|---|---|---|
| `setup` | compila tools del decomp, genera headers, charmap | `.decomp-build/`, `charmap.json` | `gba/charmap.ts` |
| `constants` | todos los `#define`/enum evaluados por el compilador | `constants.json` | `rom.c("NAME")`, `rom.constants` |
| `tsconst` | lo mismo como TS tipado | `src/fr/generated/constants.ts` | `import * as C` → `C.ITEM_POTION` |
| `structs` | clases TS con offsets/bitfields **medidos** con un probe C | `generated/structs.ts` | `BattlePokemon`, etc. |
| `scripts` / `battlescripts` | ensambla `data/*.s` con clang y los macros reales | `scripts.bin`, `battle/*.bin` | intérpretes en `script/` y `battle/` |
| `maps` `tilesets` `objects` | mapas, layouts, tilesets 4bpp, objetos y sus anims | `maps/ layouts/ tilesets/ objects/` | `field/` |
| `data` | especies, movimientos, objetos, entrenadores, encuentros, textos | `data/*.json` | `rom.*` |
| `incbin` | **cada `INCBIN_*` de cada .c**, ya descomprimido (sin LZ/RL) | `incbin/<pack>.bin` + `index.json` | `incbin("gSym")`, `incbin16("gSym")` |
| `cdata` | **cada definición constante de cada .c** (templates, tablas, anims) | `cdata/<archivo>.json` | `cdata("archivo","sNombre")` |
| `graphics` | solo PNG que aún se usan como imagen: fuentes, marcos, puertas, pics frontales | `gfx/` | `rom.fonts`, `rom.windows`… |
| `audio` | canciones, voicegroups, samples, cries | `audio/` | `audio/m4a.ts` |
| `codegen` | traducción mecánica de `metatile_behavior.c` | `generated/metatileBehavior.ts` | `MB.*` |

### cdata: cómo es el JSON

`step_cdata.py` pasa cada `.c` por el preprocesador con los defines del build
real (FIRERED) y por `preproc` (los `_("…")` quedan en bytes del charmap). Cada
definición queda así:

```json
{"defs": {"sPartyMenuBgTemplates": {"type": "BgTemplate", "value": [{"bg": 0, "charBaseIndex": 0, …}]}}}
```

- Números, arrays y objetos con los **nombres de campo del C**.
- Referencias a otros símbolos: `{"$sym": "gText_Summary5"}`, con `index`/`offset`
  si el C hacía `&tabla[3]` (p. ej. `{"$sym":"gMoveNames","index":148}`).
- Expresiones no evaluables: `{"$expr": "…"}` → `cexpr()` en `hw/cdataSprite.ts`.

Resolver referencias: `symName(ref)` da el nombre; con él llamas a `rom.text()`
(textos), `incbin()` (binarios), `cdata()`/`cdataAny()` (otra tabla) o haces un
`switch` a la función TS homónima (callbacks). Ejemplo real: `runCursorOption`
en `partyMenu.ts` despacha `sCursorOptions[i][1].$sym` a `CursorCB_*`.

Antes de usar `cdata("x", …)` hay que cargar el archivo: `await loadCData("x", …)`.
Antes de `incbin(…)` hay que cargar su pack: `await preloadPacks(["graphics_x"])`
o `preloadIncbin(["gSym"])`. Las pantallas lo hacen al inicio de su `Init…` (ver
`InitPartyMenu`, `GoToBagMenu`). Para saber en qué pack está un símbolo:
`public/fr/incbin/index.json` → `symbols[sym] = [pack, offset, size]`.

Para buscar rápido una definición: `grep -o '"sNombre":{[^}]*' public/fr/cdata/archivo.json`
o `python3 -c "import json;print(json.load(open('public/fr/cdata/party_menu.json'))['defs']['sFontColorTable'])"`.

## 5. Cómo se porta un archivo C (método fiel)

1. **Lee el C completo y su header** (`include/*.h`, `include/constants/*.h`).
   El header da tipos, enums y firmas; el `.c` da las reglas. Lee también los
   scripts (`data/scripts/*.inc`, `data/battle_scripts_*.s`) que lo llaman.
2. **Localiza los datos** en `public/fr/cdata/<archivo>.json` y los INCBIN en
   `incbin/index.json`. Si falta algo, arregla el exportador (no lo copies a mano)
   y reexporta el paso.
3. **Traduce con los mismos nombres** (funciones, variables `s*`/`g*`, estados).
   Así cualquiera puede comparar TS y C lado a lado. Comenta arriba del archivo
   qué `.c` porta y **qué adaptaciones** hiciste (ejemplo: cabecera de `partyMenu.ts`).
4. **Conserva la estructura temporal**: `switch (gMain.state)` de las funciones
   de init, `tasks.create/setFunc` con los mismos índices de `data[]`, callbacks
   de sprite, `BeginNormalPaletteFade`, `SetMainCallback2`. Si el C tarda N
   frames, el TS debe tardar N frames.
5. **Callbacks entre pantallas**: los `MainCallback` del C que saltan a otra
   pantalla se pasan como funciones (`exitCallback`) u objetos de handlers
   (`BagHandlers`, `TmCaseHandlers`, `PartyMenuFieldHooks`, `ItemUseReturns`).
   Así el bag abre el menú de equipo y este vuelve al bag igual que en el C.
6. **Pantallas de hardware desde el campo**: el campo es Canvas2D (`gba/`),
   las pantallas nuevas corren sobre `hw/`. `fieldMenu(game, begin)` en
   `menus/fieldMenus.ts` crea un `HwScene`, ejecuta la pantalla y devuelve el
   control al overworld al cerrar.
7. **Gráficos y animaciones**:
   - `WindowTemplate`/`BgTemplate`: `InitWindows(cdata(…))`, `InitBgsFromTemplates(0, cdata(…))`.
   - Tiles/tilemaps/paletas: `LoadBgTiles(bg, incbin("gX_Gfx"), …)`,
     `incbin16("gX_Tilemap")`, `LoadPalette(incbin("gX_Pal"), BG_PLTT_ID(n), size)`.
     Todo INCBIN ya viene **descomprimido**: donde el C llama `LZ77UnCompWram`
     o `DecompressAndCopyTileDataToVram`, usa directamente los bytes.
   - Sprites: `templateFrom(cdata("f","sSpriteTemplate_X"))` convierte
     oam/anims/affineAnims/images; `animsFrom`, `affineAnimsFrom`, `oamFrom`
     para piezas sueltas; `LoadSpriteSheet({data: incbin(…), size, tag})`.
     Las tablas `ANIMCMD_FRAME/LOOP/JUMP/END` y `AFFINEANIMCMD_*` llegan del C
     tal cual, así la animación es idéntica sin reescribir tiempos.
   - Callbacks de sprite (`SpriteCB_*`) se traducen línea por línea usando
     `sprite.data[]`, `x2/y2`, `animNum`, `invisible`, como en el C.
   - Iconos de Pokémon: `pokemonIcon.ts` (`CreateMonIcon`, `UpdateMonIconFrame`).
8. **Textos**: `rom.text("gText_X")` devuelve bytes del charmap (terminados en
   0xFF). Placeholders: `stringVars.var1..var4` + `expandPlaceholders()`
   (= `StringExpandPlaceholders`). Números: `intToDecimal(n, modo, dígitos)`.
   Nombres: `rom.moveName`, `itemName`, `speciesName`.
9. **Constantes**: `C.NOMBRE` (import de `generated/constants.ts`) en código
   nuevo; `rom.c("NOMBRE")` solo si el nombre llega como string en tiempo de
   ejecución (p. ej. `itemInfo(x).fieldUseFunc`, tipos de objeto).

### Trampas frecuentes al traducir C

- División entera: C trunca hacia cero → `Math.trunc(a / b)` si puede ser
  negativo; `Math.floor` solo con valores positivos.
- Tipos pequeños: emula el desbordamiento (`& 0xff`, `& 0xffff`, `(v << 24) >> 24`
  para `s8`, `>>> 0` para `u32`). Muchos bugs vienen de un `u8` que no envolvió.
- `>>` vs `>>>`: en C `u32 >> n` es lógico → `>>>` en TS.
- Bitfields/structs de memoria: usa `generated/structs.ts`, no inventes offsets.
- Strings: siempre bytes charmap (0xFF = EOS); no mezcles `string` JS salvo en
  adaptadores (`encode`/`decode`).
- Aleatoriedad: `random()` / `random32()` de `random.ts` (el LCG del juego), nunca `Math.random`.
- TS 5.8 y `Uint16Array<ArrayBuffer>` vs `<ArrayBufferLike>`: anota el tipo
  como `Uint16Array` cuando asignas `subarray`.
- `cdata` de listas con terminador (`FIELD_MOVE_END`, `TAG_NONE`, `0xFFFF`):
  respeta el terminador como en el C.

### Adaptadores (lo que aún no es fiel)

Cuando una pantalla del C no está portada, se usa un **adaptador**: misma
entrada/salida (variables, callbacks) pero UI simplificada, casi siempre con
`openHardwareChoice`/`openHardwareMessage` (listas de texto sobre `ListMenu`).
Márcalo en el comentario de cabecera y en `PORTING-STATUS.md`. Adaptadores
actuales: resumen (`summaryScreen.ts`), elegir movimiento a olvidar
(`battle/ext.ts ShowSelectMovePokemonSummaryScreen`, `menus/monProgress.ts`),
PC de objetos/buzón (`menus/playerPc.ts`), almacenamiento de cajas
(`menus/storageMenu.ts`), Pokédex (`menus/pokedex.ts`), tarjeta de entrenador,
Fame Checker/Teachy TV (`menus/keyItemScreens.ts`), tragaperras (visual),
intercambios en juego (`pokemon/ingameTrade.ts`), Salón de la Fama y créditos
(`hallOfFame.ts`), evolución fuera de batalla (`monProgress.evolveWithMessages`).

## 6. Cómo se prueba y valida

Niveles, de más barato a más caro. Informa siempre **qué nivel** alcanzaste;
"compila" no significa "funciona".

1. **Tipos**: `npm run check:port` (todo `src`). Para detectar restos muertos
   en un archivo: `npx tsc --noEmit -p tsconfig.port.json --noUnusedLocals | grep archivo`.
2. **Bundle**: `npm run build` (detecta imports rotos/ciclos que tsc no ve).
3. **Paridad de datos**: comprueba que cada `cdata(...)`/`incbin(...)` que usas
   existe. Script rápido usado para `partyMenu.ts`:
   ```sh
   python3 - <<'EOF'
   import json,re
   d=json.load(open('public/fr/cdata/party_menu.json'))['defs']
   src=open('src/fr/partyMenu.ts').read()
   used=set(re.findall(r'rd(?:<[^>]*>)?\("(\w+)"\)',src))
   print(sorted(u for u in used if u not in d))
   idx=json.load(open('public/fr/incbin/index.json'))['symbols']
   print(sorted(s for s in re.findall(r'incbin(?:16)?\("(\w+)"\)',src) if s not in idx))
   EOF
   ```
4. **Checks headless en Node** (`tools/checks/`): se empaqueta el módulo TS con
   esbuild y se ejecuta con los datos reales de `public/fr`, sin navegador.
   Patrón (`tools/checks/downArrow.ts`): cargar JSON/packs con `readFileSync`,
   asignarlos a `rom`/`assets`, ejecutar la función portada y comparar píxel a
   píxel con los tiles del C (o con `ppu.renderFrame()` frente a PNG de
   `../pokefirered/graphics`). Así se verificaron título, intro, tragaperras,
   clima y el intérprete de animaciones de batalla. Añade un script `check:*`
   en `package.json` por cada check nuevo.
5. **Navegador** (`npm run dev` o `preview_start` con `.claude/launch.json`):
   `window.frDebug` permite avanzar sin rAF:
   - `frDebug.run(frames, botones)`, `await frDebug.wait(frames)`
   - `await frDebug.walk("U"|"D"|"L"|"R", casillas)`, `await frDebug.press("A"|"B"|"START"|"SELECT")`
   - `frDebug.rivalBattle("SPECIES_SQUIRTLE")` combate del laboratorio
   - `frDebug.state()`, `frDebug.save`, `frDebug.rom`, `window.frGame`
   Usa `?fr=new`/`?fr=continue`, revisa la consola y captura pantalla como prueba.
6. **Comparación con el juego real** (opcional): mismo punto en un emulador con
   la ROM compilada del decomp (`make` en `../pokefirered`) y comparar frames.

Si el usuario pide "no probar", haz solo 1–3 y dilo explícitamente.

## 7. Convenciones de trabajo

- Un commit por bloque terminado; mensaje en inglés, imperativo, que diga qué
  `.c` se portó; terminar con la línea `Co-Authored-By` que indique el entorno.
  No hay remoto git: no se puede hacer push.
- Tras cada bloque: actualizar `PORTING-STATUS.md` (y `START-FLOW.md` si cambia el arranque).
- No editar `src/fr/generated/` ni `public/fr/` a mano: cambia `tools/decomp/` y reexporta.
- Borrar adaptadores y helpers cuando la pantalla real los sustituye (y los
  exports que queden sin uso).
- El usuario escribe en español; responde en español.
