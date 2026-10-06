# Referencia técnica del port

Consultar solo las secciones necesarias. Las reglas operativas vigentes están
en [AGENTS.md](../AGENTS.md). Las rutas de código de los ejemplos son relativas
a la raíz del proyecto. Este documento no es una lista de pasos obligatorios.

## 1. Qué es

Es un **port fiel** del decomp `pokefirered` (C, resuelto por `tools/decomp/common.py`) a
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
  sprite.ts                 sprite.c (OAM, anims, affine, sheets, paletas por tag)
  palette.ts scanline.ts    palette.c (fades), scanline_effect.c
  menu.ts listMenu.ts menuHelpers.ts   menu.c, list_menu.c+menu_indicators.c, menu_helpers.c+money.c
  assets.ts                 acceso a datos exportados: incbin(), incbin16(), cdata(), loadCData()
  cdataSprite.ts            convierte cdata a OamData/AnimCmd/AffineAnimCmd/SpriteTemplate
src/fr/gba/                 capa antigua de campo (Canvas2D): tasks, input, charmap, fuentes, textPrinter
src/fr/field/               overworld: mapas, objetos, efectos de campo, clima, puertas, encuentros
src/fr/script/              intérprete de scripts de eventos (213 comandos) y specials (272)
src/fr/battle/              motor de batalla (battle_main, 248 comandos, IA, controladores, anims)
src/fr/pokemon/             reglas de Pokémon/objetos/caja/guardería/intercambios
src/fr/menus/               adaptadores de menús de campo (algunos aún son listas de texto)
src/fr/*.ts                 pantallas del port: intro*, oakSpeech, mainMenu, namingScreen,
                            regionMap, optionMenu, bagMenu, tmCase, berryPouch, partyMenu,
                            pokemonIcon, hallOfFame, credits, itemPc, shop, diploma, seagallop…
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
npm run check:port         # tsc sobre TODO src (incluye batalla). Al cerrar una tanda de código
npm run check:honesty      # stubs nuevos, módulos sin conectar, checks que se validan solos,
                           # superlativos en commits. Obligatorio antes de cada commit
npm run build              # tsc + bundle de producción
npm run check:arrow        # ejemplo de check headless (flecha de diálogo vs tiles del C)
npm run inventory          # regenera PORT-INVENTORY.md (avance por archivo .c)
npm run pending            # regenera PENDING.md (faltantes; ejecutar tras inventory)
python3 tools/decomp/export.py [pasos…]   # regenerar datos (ver §4)
```

URLs de desarrollo: `/` = arranque completo; `?fr=new` / `?fr=continue` saltan la intro.

Flujo de arranque activo (antes en `START-FLOW.md`):

```text
src/main.ts -> src/fr/startup.ts
  -> copyright -> Game Freak -> intro escenas 1–3 -> título
  -> menú principal (main_menu.c)
     -> Nueva partida -> guía de controles -> discurso de Oak -> género y nombres
        -> src/fr/boot.ts -> habitación del jugador
     -> Continuar -> src/fr/boot.ts -> estado de campo guardado
```

`boot.ts` carga las tablas trigonométricas y los recursos de batalla e instala el
host de batalla antes del juego normal. Un cambio en el arranque necesita probar
la URL por defecto hasta entrar al mundo (título, START, controles, Oak).

## 4. De dónde salen los datos (pipeline del exportador)

`tools/decomp/export.py` resuelve `$POKEFIRERED`, `../pokefirered`
y el submódulo `pokefirered/` mediante `common.py`, compila las
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

1. **Lee completas las funciones C de la tanda, sus tipos y dependencias**
   (`include/*.h`, `include/constants/*.h`). Inspecciona globals, tablas y
   callers C/TS/scripts que determinan su comportamiento. Lee el archivo entero
   cuando el estado compartido lo requiera; no lo releas por cada helper.
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
Identifica la adaptación en el código. La lista vigente se consulta en
[PENDING.md](../PENDING.md); las listas históricas no certifican fidelidad.
Al sustituirla, elimina el camino anterior cuando la implementación esté
integrada; registra por separado la validación funcional pendiente.

**No dejes stubs con el nombre del C**: una función sin implementar no se declara.

## 6. Cómo se prueba y valida

Referencia de métodos; la frecuencia y selección las fija AGENTS.md.
El navegador y los recorridos se usan en la fase de revisión o para diagnosticar
un fallo concreto, no por cada función portada.

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

   **Driver de recorrido** (`tools/playtest/driver.js`, solo con el servidor de
   desarrollo). Desde la consola o `javascript_tool`:
   ```js
   const { H } = await import("/tools/playtest/driver.js");
   await H.init()            // OBLIGATORIO tras cada carga de página (ver "trampas" abajo)
   await H.goto(x, y)        // camina (BFS con las colisiones reales) y resuelve combates/scripts
   await H.exit("U")         // camina en una dirección hasta cambiar de mapa (conexiones, flechas)
   await H.enter(x, y)       // entra por la puerta (x, y) desde abajo
   await H.talk(x, y)        // se pone al lado, mira y pulsa A
   await H.counter(x, y)     // habla a través de un mostrador (dos casillas debajo)
   await H.idle()            // pulsa A hasta que no haya script (cede si empieza un combate)
   await H.battle("fight", 3) // combate eligiendo la ranura 3 con botones reales ("run" para huir)
   await H.heal()            // dentro de un Centro Pokémon 1F: enfermera y salir
   await H.grind([x1,y1], [x2,y2], { slot: 3, level: 14 })  // subir de nivel en la hierba
   H.battleDefaults = { mode: "fight", slot: 3 }            // lo que usa goto() al encontrar combates
   H.job(async () => …); H.jobStatus()                      // trabajo largo en segundo plano
   H.checkpoint("nombre"); H.restore("nombre")              // puntos de control (no es el GUARDAR del juego)
   H.st(), H.objects(), H.warps(), H.coords(), H.log, H.checkpoints()
   ```
   Las coordenadas son las de `frDebug.state()` (sin el borde de +7).

   Desde `66baef56`, la navegación usa `H.battleDefaults = { mode: "auto", slot: 0 }`.
   `H.battle("auto")` puntúa ataques disponibles con potencia/precisión, STAB,
   tipos de ambos lados, categoría física/especial de Gen III y etapas de stats.
   Descarta PP0, movimientos de estado, daño variable/fijo con potencia1 y
   restricciones Disable/Encore; contempla inmunidades comunes. Es política de
   recorrido, no un cálculo exacto de daño ni un port de IA. No cubre todas las
   interacciones de clima/objetos/efectos; formatos especiales/dobles se detienen.
   Cuando el equipo tiene cuatro movimientos, rechaza reemplazos por UI; los
   huecos libres se aprenden por el flujo normal. Los modos explícitos conservan
   su comportamiento diagnóstico (incluido repetir Gruñido en C7).

   API para los ejecutores:
   ```js
   H.resources()                       // HP/PP/estado, objetos y dinero observados
   await H.prepareStep()               // {ok,note,resources}; respeta reserva y PP
   await H.useItem(H.C.ITEM_POTION, 1)  // BAG > USE > miembro identificado; consumo real
   await H.heal({leave:false})          // enfermera + verificación; permanece dentro
   await H.heal()                       // mismo flujo y salida del Centro
   await H.goto(x, y, {recovery:true})   // retirada decidida: omite guardia de campo
   await H.enter(x, y, "D", {recovery:true})
   await H.exit("D", 3, {recovery:true})
   ```
   `recovery` conserva colisiones y combate auto; solo permite dirigirse al Centro
   con recursos bajos. No cambia HP/PP, resultado, bolsa ni flags. No activar para
   continuar la cueva a costa de ignorar una parada. La política conserva una
   medicina HP de reserva fuera del combate, exige dos PP de ataque por miembro,
   cura por debajo del 60% HP en campo y del 40% (o daño reciente) en combate.
   Estado sin remedio, miembro debilitado o PP escasos piden volver al Centro.
   Si el activo no dispone de ataques, primero cambia a una reserva saludable;
   si no existe, puede curar por BAG a una reserva con ataques cuando una medicina
   la lleva al 60% HP. Identifica el destinatario por personalidad y OT antes de
   usar el objeto; reconsidera el cambio tras el turno. No gasta curación en un
   activo sin ataques para evitar esta parada. H.heal observa el ofrecimiento
   frame a frame antes de confirmar YES y comprobar HP/PP/estado e identidades.
   Los umbrales y presupuestos son política de prueba, no reglas del C.
   `H.battle` devuelve `trace`, `stop`, `decisions` y `stuck`; goto/enter/exit/explore
   deben inspeccionarse por `note`. No relanzar un recorrido tras `battle lost`,
   presupuesto o recursos agotados sin diagnosticar/preparar una entrada nueva.
   Fijar configuración antes del job, sin cambiarla a mitad de la operación.

   Verificación focalizada: `node tools/playtest/strategy.check.mjs` y jobs
   `driver-strategy`, `driver-auto-battle`, `driver-switch`, `driver-recovery`,
   `driver-navigation` mediante `pw.mjs`.
   BFS consulta colisiones por nodo con behavior/elevación virtual y el predicado
   puro de ledges; no mueve al jugador ni incrementa estadísticas al planificar.
   Se limita al mapa actual; exit ejecuta conexiones y espera el callback de campo.
   Menús de cambio opcional sin reserva atacante se cancelan por B; SEND_OUT tras
   un debilitamiento conserva reemplazo obligatorio. La traza registra HP real
   del battler y acción del menú; HP del party aislado no basta para distinguirlos.
   driver-navigation usa posiciones PREPARED y verifica cambio opcional/forzado
   y Route4→Celeste con saltos reales; no acredita historia, fósil ni guardado.
   Sus entradas PREPARED están declaradas; switch verifica cambio/ataque/curación
   y huida, no victoria. Estos casos no acreditan la ruta Monte Moon ni guardado.


   ### Cómo probar rápido y sin engañarte (método usado en las sesiones de Claude)

   1. **Punto de control antes de cada tramo** (`H.checkpoint("zona")`). Un fallo
      se reproduce en segundos con `H.restore`, sin volver a jugar desde el
      principio. Nombres usados: `lab-done`, `viridian-pc`, `parcel`, `pokedex`,
      `oldman`, `route2-L11`, `forest`, `pewter`, `gym`, `brock-done`, `mart`,
      `route3`.
   2. **Trabajo largo en segundo plano.** Las llamadas de herramienta caducan a
      los ~45 s, pero la página sigue corriendo: `H.job(async () => …)` y luego
      consulta `H.jobStatus()` cada 30-40 s. Devuelve solo resúmenes pequeños
      (`H.party()`, `H.log.map(...)`): una traza enorme llena el contexto.
   3. **Lee el estado, no adivines.** Para saber qué pantalla hay, consulta
      `H.cb2()`, `H.G.gBattlerControllerFuncs[0].name`, `frDebug.save.save`
      (flags, bolsa, dinero, equipo) en vez de pulsar A a ciegas y hacer capturas.
      `H.battle` ya elige acción y movimiento mirando los cursores del combate.
   4. **Capturas solo en los hitos** (menú nuevo, final de combate, error). Para
      comprobar un valor (precio, flag, objeto) basta leer la partida.
   5. **Un combate atascado se diagnostica, no se reintenta.** Si `H.log` marca
      `stuck`, mira el controlador del jugador y el texto en pantalla antes de
      suponer un fallo del juego: dos "bloqueos" de esta sesión eran del driver
      (movimiento sin PP elegido en bucle; `idle` que no cedía el combate).
   6. **Ninguna ayuda de depuración sin decirlo.** Se sube de nivel jugando
      (`H.grind`, `H.heal`); si pones un flag, nivel u objeto a mano, dilo en el
      informe y en PORTING-STATUS.
   7. **Por cada fallo real**: función C → arreglo → `H.restore` del punto de
      control → repetir el mismo tramo. Resume resultados y evidencia al cerrar
      la tanda; no hace falta una captura, entrada o commit por cada arreglo.

   Trampas:
   - **Editar cualquier archivo servido por Vite recarga la página** y pierde
     `window.*`: vuelve con `H.restore(nombre)` y `await H.init()`. Agrupa las
     ediciones y prueba después.
   - **Instancias duplicadas de módulos**: tras un HMR la app importa
     `x.ts?t=…`. Un `import("/src/fr/…/x.ts")` a secas carga otra copia vacía y
     todo lo que leas es falso. Usa siempre `H.mod(ruta)` (lo hace `H.init()`).
   - Sin `H.init()`, `H.inBattle()` confunde cualquier pantalla de hardware
     (tienda, bolsa) con un combate.
   - `H.idle()` pulsa A: dentro de un menú puede elegir la primera opción. Para
     menús usa `frDebug.press`/`frDebug.wait(n, botones)` y lee el estado.
   - No muevas al jugador mientras un guion ejecuta `applymovement`/`waitmovement`:
     `goto`/`idle` ya esperan a que no haya script activo.
6. **Comparación con el juego real** (opcional): mismo punto en un emulador con
   la ROM compilada del decomp (`make` en `../pokefirered`) y comparar frames.

Si el usuario limita las pruebas, respeta ese alcance y declara el nivel real.
No ejecutes esta lista entera como requisito previo al portado.
