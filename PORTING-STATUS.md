# FireRed web port status

Target: the full FireRed game, including its main progression and optional
systems. The first playable route is a milestone, not the completion criterion.

## Source-review update (2026-09-24, no execution checks)

- Fixed `ScrCmd_bufferboxname` to use the stored box name through
  `getBoxName`, matching `src/scrcmd.c` / `GetBoxNamePtr` in the decomp.
  The transfer messages in `data/scripts/pc_transfer.inc` now use the same
  name lookup as the PC menu, including renamed boxes and default names.
- Added source-style object lookup by local ID, map number and map group for
  `removeobjectat`, `showobjectat`, `hideobjectat`, `setobjectsubpriority` and
  `resetobjectsubpriority`. Reserved IDs retain the source's map-independent
  lookup. These commands previously discarded the map operands.
- Subpriority now wraps to eight bits, and resetting it requests ground-effect
  updates, matching `SetObjectSubpriority` / `ResetObjectSubpriority` in
  `event_object_movement.c`. This is not full object-event parity.
- Movement start/wait commands now resolve object identity using the requested
  map (or the current map for the unqualified commands). Waiting with local ID
  zero still refers to the last movement target, as in `scrcmd.c`.
- `addobjectat` now uses the requested map's template and preserves that map's
  identity on the spawned object. Current-map requests retain the mutable local
  templates. Remote map headers are loaded on demand, pausing bytecode until
  available; this loading wait is a browser adaptation. Spawn duplicate checks
  now include map identity. These changes have source review only.
- Current-map object commands (`setobjectxy`, `copyobjectxytoperm`,
  `turnobject`, `removeobject`) now qualify their lookup by the current map.
  Persistent movement-type updates ignore objects from other maps, matching
  `GetBaseTemplateForObjectEvent`. Trainer battle selection also uses current-map
  identity and clears a stale selection to the source's not-found sentinel when
  the requested trainer is absent. No execution checks were run for these edits.
- VS Seeker trainer collection, movement reset and rematch cleanup now use
  current-map identity, matching `vs_seeker.c`. Scripted trainer icons use the
  map number/group from field-effect arguments, matching `trainer_see.c`.
  SS Anne departure and camera-object removal likewise select the current-map
  object, following `ss_anne.c` and `field_specials.c`. Reviewed in source only.
- Trainer reaction icons now retain their canonical `FLDEFF_*` ID until their
  sprite finishes or its object disappears, so `waitfieldeffect` observes their
  lifetime. Concurrent icons of the same type are counted separately, matching
  the original active list's duplicate entries. Trainer approach waits use the
  same canonical ID, and the single-exclamation sprite uses source subpriority
  0x53. Source-reviewed only; no tests, compilation or browser checks run.
- This change was reviewed against source only. No tests, compilation or
  browser checks were run for it, at the user's request.
- The older inventory below predates several implementations. Naming is
  connected to Oak and battle; wild encounters and trainer sight are connected
  to field control; bag, party, shops and storage have partial adapters.
  These systems need completion and parity review, not implementation from zero.
- Confirmed remaining gaps include Pokédex search/area pages, battle
  animation interpretation, audio refinements, Berry Crush / Berry Picking /
  Pokémon Jump link minigames and specific postgame event handlers. Slots run
  with source betting, bias, stops, lines and payouts (headless-verified);
  reel sprites, the Clefairy dance and line flashes remain pending. Field
  weather runs its state machine with exact gamma shifts and fog drift
  (headless-verified); per-weather sprite effects beyond fog remain pending.

## Active path

The default URL runs `src/fr/startup.ts` on a 240×160 Canvas. New Game and
Continue hand off to `src/fr/boot.ts` and the decomp-driven overworld. `?fr=new` and `?fr=continue` bypass startup.

The copyright screen (`src/fr/introCopyright.ts`) now reads the exported
`sCopyright_*` binaries and runs through the GBA palette, VRAM and PPU model.
The Game Freak scene (`src/fr/introGameFreak.ts`) reads its `BgTemplate` and
`WindowTemplate` from C data and its graphics from INCBIN exports. Its
background, theatrical window, text/logo bitmap, logo-art/Presents (rev1)
sprites, star and sparkle callbacks run through the same TS hardware layer.
Scene 1
(`src/fr/introScene1.ts`) also uses the C background templates, INCBIN tiles,
tilemaps and palettes, with its grass animation, background zoom and palette
fade translated from `intro.c`. Scene 2 (`src/fr/introScene2.ts`) now ports the
forest pan, the Gengar/Nidorino wide-shot sprites, and the close-up backgrounds
and pan from the source callbacks. Scene 3 (`src/fr/introScene3.ts`) now runs
its entrance, Gengar/Nidorino fight callbacks, sprite effects, zoom, palette
fade and handoff to the title through the GBA-style TS hardware layer. The
source trig tables are loaded for both startup and direct game launches.
Title runs its source scenes, flame spawner, slash sweep, press-start blink
(60 visible / 30 hidden) and cry handoff through the TS hardware layer. The
title, Game Freak logo/Presents swap and Scene 1–3 frames were verified with
a headless Node renderer (real INCBIN/cdata through `ppu.renderFrame()`):
logo/Charizard/flames, WIN0 slide reveal, RUN, cry fade and a clean menu
backdrop all render. The new game scene (`src/fr/oakSpeech.ts`) is a direct
port of `oak_speech.c` on the hardware layer: controls guide, Pikachu intro,
Oak with the Nidoran♀ release/return, BOY/GIRL menu, name confirmation, rival
pic and name-choice menu, and the white-fade/affine-shrink exit. Verified in
the browser end to end (title → NEW GAME → overworld with the chosen names).
The keyboard naming screen (`naming_screen.c`) is the next port; until then
"NEW NAME" keeps the random default name. SEs and cries stay silent until the
audio backend exists.

## Verification status (2026-09-24)

- The read-only audit passed `tsc --noEmit --incremental false --project
  tsconfig.port.json`, covering every TypeScript source file, including battle.
- `npm run build` checks and bundles the runnable entry point. Compilation is
  not evidence of a complete playable game.
- Earlier implementation notes report browser checks of startup, Oak's speech
  and the lab rival battle. Those checks were not repeated in the read-only
  audit; no complete main-story or postgame playthrough has been verified.
- All 213 exported event-script command names resolve to handlers. Registration
  does not prove behavioral parity. All 272 distinct exported special names are
  registered (verified 2026-09-24: 273 handlers, 0 missing); link/tower/contest
  entries without browser hardware report the source's disconnected-cable codes,
  and some registered handlers are placeholders.
- Exported data includes 425 maps and 365 layouts. Imported maps do not prove
  their events, services or progression work.
- `tools/check_down_arrow.ts` passes (960 pixels, both variants, four frames):
  the battle dialogue continue arrow matches C tile addressing.

## C/header inventory first pass (2026-09-25)

[`C-PORT-INVENTORY.csv`](C-PORT-INVENTORY.csv) lists all 283 C source files,
their same-stem header when present, every included `.h`, source line count,
same-name TypeScript candidates, automatic match category and a separate
status extracted from this document. The
decomp has 343 distinct included headers; 192 C files have a same-stem header.
The inventory also extracts public function declarations from those headers
and records whether each exact function name appears anywhere in `src/fr`.

The current review labels 37 modules as documented ported, 59 as partial or
adapted, eight as pending, two with small parity fixes awaiting verification,
four as explicitly out of scope, 36 as probable out-of-scope candidates, and
137 as unreviewed. Separately, 42 files have a
same-name TypeScript candidate and 181 have no automatic name mapping. These
are inventory counts, not a port completion percentage: a filename match does
not prove parity, and no automatic match does not prove that a C module is
missing because TypeScript ports often combine or rename source modules. Next,
resolve the unmapped names and compare each relevant header's public
declarations with TypeScript exports; only then mark a module complete or
missing.

The initial public-API scan found 2,923 function declarations across 182
same-stem headers; 1,286 names appear in TypeScript and 1,637 do not. The 21
modules that were pending at that scan had 112 declarations; 94 exact names
were absent from TypeScript. Treat those 94 as review candidates, not proven
missing code: some C APIs are folded into another TS module or represented by
different functions. Sort `C-PORT-INVENTORY.csv` by `c_lines` to get a quick
small-to-large backlog, then source-review the absent names and existing TS
behavior before changing their status.

### Five small modules reviewed against source

Sorted by C source length (a quick effort proxy, not an estimate):

| C module | Lines | Finding |
|---|---:|---|
| `save_menu_util.c` | 56 | Save flow now renders the C summary fields before confirmation. Canvas frame/palette and exact text color controls remain simplified; check passes, visual execution still pending. |
| `play_time.c` | 65 | Reset/Start/Stop/Update/SetToMax now map to save.ts state and Game lifecycle calls. Total frames replace C's split time fields; typecheck passes, runtime parity is unverified. |
| `coins.c` | 98 | Balance and display logic exist in `items.ts` and `scriptMenu.ts`. Corrected `addCoins` to match C's cap behavior and u16 argument; verification is pending. |
| `save_location.c` | 112 | Reviewed with `load_save.c`: normal continue uses the saved warp directly. Missing flags affect Pokémon Center/lobby reset warps, GameCube-link unlocks and Champion/postgame behavior; no main-story single-player blocker found. Deferred. |
| `heal_location.c` | 122 | Whiteout now resolves the exported respawn map/NPC, source-specific spawn coordinates and the Pallet home-healing script. Verification is pending; Trainer Tower recovery and the pre-fade recovery presentation remain unported. |

The `AddCoins` mismatch is corrected in `src/fr/pokemon/items.ts`. The play-time lifecycle is implemented in `src/fr/save.ts` and wired to new/continue/frame in `src/fr/game.ts`; runtime parity remains unverified. The standard
whiteout respawn now uses the original heal-location data in
`src/fr/field/overworld.ts` and selects the correct healer/home script from
`src/fr/game.ts`. These changes still need execution verification. The other
`save_location.c` has no main-story single-player blocker; its missing flags are deferred with reset/link/postgame parity. `save_menu_util.c` now has the stats panel and remains partial until visual execution confirms placement, frame and colors.

### Módulos pequeños revisados contra el C (2026-09-25)

- `fldeff_berrytree.c` contiene únicamente un `DoWateringBerryTreeAnim`
  vacío (comentario del propio decomp: eliminado de R/S). El special TS también
  es vacío. Paridad exacta de este archivo; el juego no tiene esa animación.
- `random.c`: el LCG de `Random`, `Random32`, el estado inicial cero y el
  truncamiento `u16` de `SeedRng` coinciden. Sigue parcial porque el flujo TS
  aún no llama `seedRng` al salir del título con el valor de Timer1 ligado a la
  ID del entrenador, como hace C.
- `fldeff_dig.c`: mapa permitido, confirmación, selección del Pokémon,
  FieldEffect Dig, transición a pie y escape al último heal location están
  conectados entre `fieldMoveMenu.ts` y `fieldMoves.ts`; falta cotejo visual.
- `fldeff_teleport.c` tiene la compuerta de mapa y warp correctos, pero su
  task omite `CameraObjectReset2` y la transición de prioridad del subsprite;
  además mueve `y2` donde C cambia `sprite.y`. Queda parcial.
- `fldeff_strength.c`: TS conserva el requisito de estar a pie y tener una
  roca empujable delante; pasa el slot/nickname, muestra al Pokémon y reanuda
  el script para activar Strength. Cotejado con `field_moves.inc` y el C.
- `safari_zone.c`: los ocho APIs están enlazados entre specials, Game,
  FieldEffects y `battleSetup`: entrada/salida, 30 balls/600 pasos, prompt,
  timeout y retornos de batalla. Revisión de fuente; no jugué la zona en browser.
- `text_window_graphics.c`: datos cdata/incbin exportados; `GetUserWindowGraphics`
  y la carga de marco/tiles/paletas están en `hw/menu.ts`, incluido fallback al
  marco cero para índices fuera de rango. No comparé visualmente cada frame.
- `keyboard_text.c` es texto de teclado, no lógica. El exportador conserva sus
  definiciones; `namingScreen.ts` consume las filas enlazadas por C. Las
  pantallas Union Room/Easy Chat no forman parte del recorrido single-player.
- `party_menu_specials.c`: party picker, relearner entry, move counts,
  nickname/move variables, move deletion/PP-Up shift and egg check are wired.
  Move Deleter now uses the real PSS_MODE_FORGET_MOVE summary screen and returns
  the selected move slot (4 when canceled) to the script variable.
- `hof_pc.c` reabre el menú PC y muestra equipos guardados, pero usa listas y
  mensajes genéricos en lugar de fades/tasks/summary originales; es adaptación
  postgame conocida.
- `field_poison.c`: daño cada cinco pasos, resultado poison/faint y task que
  anuncia a cada Pokémon caído, baja amistad, limpia poison y calcula derrota
  están en `fieldEffects.ts` y `field/poison.ts`. El mosaic sigue en el C vecino.
- `event_object_lock.c`: comandos de lock esperan que jugador/NPC terminen,
  restauran facing, limpian held movement y desbloquean movimientos de script.
  El helper Union Room queda fuera del single-player.
- `prof_pc.c`: TS calcula vistos/capturados con Kanto/National igual que C;
  `profOakRating` conserva los umbrales 10–150, la excepción de Mew, RESULT y
  el texto del decomp. Paridad por revisión de fuente; falta comparación runtime.
- `money.c`: límites/suma/resta y formato básico ya existen en `items.ts`,
  `hw/menuHelpers.ts` y `scriptMenu.ts`. El saldo no usa la clave de cifrado C;
  el money box y APIs de label/draw son adaptadores, así que queda parcial.
- `help_message.c`: el gráfico de borde y su patrón de tiles se reutilizan
  en la descripción de movimientos de campo del Party Menu. Falta el lifecycle
  compartido que C usa para las ayudas del Start Menu.
- `field_weather_util.c`: TS cubre el guardado/cambio de clima habitual y el
  contador de lluvia. Faltan `ResumePausedWeather`, el setter marcado unused y
  las tablas de ciclo de rutas; los efectos visuales se documentan aparte.
- `fldeff_poison.c` aplica un pulso de mosaic y deja un task activo hasta
  completarlo. TS ya resta HP y suena al caminar, pero `flashOverlay` no se lee,
  no hay mosaic task y la batalla no espera esa animación; queda parcial.
- `coord_event_weather.c`: el propio C declara dummy los 13 callbacks y el
  dispatcher solo ejecuta uno vacío. Su efecto observable es no hacer nada;
  el clima que sí funciona está implementado por otras rutas.
- `bg_regs.c` define arreglos de registros/flags de BG. El PPU TS expone
  constantes individuales, pero el renderer de campo Canvas2D no conecta el
  setup BLDCNT del overworld; queda parcial/adaptado.
- `math_util.c`: los nueve helpers `Q_8_8`, `Q_N_S` y `Q_24_8` de producto,
  división e inversa viven en `src/fr/mathUtil.ts`. Los intermedios de 64 bits
  usan `BigInt`; Oak usa el helper común `Q_8_8_inv`. `npm run check:port`
  pasa; no se ejecutó comparación numérica en runtime.
- `field_special_scene.c` contiene callbacks vacíos de escena del porthole y
  helpers dummy. `LookThroughPorthole` está registrado como no-op; el otro
  callback solo lo llama `DoPortholeWarp`, marcado unused en el C.
- `blend_palette.c`: `BlendPalette` ya estaba en `hw/palette.ts`; añadí
  `BlendPalettesAt`, incluida su ruta de coeficiente 16 y las operaciones con
  coeficiente `u32` del C. `npm run check:port` pasa; no hice comparación en
  runtime ni validación visual de clima.
- `tilesets.c` no contiene funciones: incluye las tablas fuente de tilesets,
  metatiles y gráficos que `step_tilesets.py` exporta a `public/fr/tilesets`;
  `rom.loadTileset` consume esos datos. Paridad del rol de datos de este .c;
  callbacks y validación visual siguen siendo trabajo aparte.
- `decoration.c` también incluye tablas de datos y se exporta a
  `public/fr/cdata/decoration.json`, pero TS no las consume y los comandos de
  añadir/quitar decoración siguen siendo adaptadores que solo avanzan el script.
  La decoración de la habitación queda pendiente, fuera del camino principal.

### Helpers de `pokemon_special_anim.c` (2026-09-25)

`src/fr/pokemonSpecialAnim.ts` porta `GetAnimTypeByItemId` y
`GetClosenessFromFriendship`. También concentra `GetMonLevelUpWindowStats`,
antes definido en `battle/ext.ts`; ese módulo lo sigue reexportando para no
romper sus consumidores. `npm run check:port` valida tipos e imports, pero no
valida animación en navegador. Los cuatro task flows, la escena y el estado de
cancelación permanecen adaptados.

### Lista de movimientos del Recordador (2026-09-25)

`moveRelearner.ts` reemplaza la lista genérica por la pantalla de selección del C:
lee `sBgTemplates`, `sWindowTemplates`, el fondo y la paleta exportados; dibuja
los iconos de tipo/poder/precisión/PP/efecto, las estadísticas y la descripción
para el movimiento seleccionado; usa el `ListMenu` común y la fila
`gFameCheckerText_Cancel`. La navegación pregunta antes de enseñar y confirmar
salida; con cuatro movimientos usa `ShowSelectMovePokemonSummaryScreen`, actualiza
slot/PP/bonus, y presenta los textos de olvido/aprendizaje del decomp.
`hardwareChoice.ts` expande placeholders y ahora ofrece la pregunta seguida por
`CreateYesNoMenu` en la misma pantalla, sin el A intermedio ni una falsa fila de
cancelación; el Recordador pasa su `sMoveRelearnerYesNoMenuTemplate` y usa B como
No. Los textos de aprendizaje/olvido conservan sus estados de fanfarria: espera
la duración correcta y un A final, incluidos los dos arranques de fanfarria al
olvidar un movimiento. Verificado: `npm run check:port`, `npm run build` y
paridad de claves cdata/INCBIN referenciadas. No se comprobó aún en navegador.
Faltan el ciclo original de fades/tareas, sprites/animaciones propios del
Recordador y comparación visual.

### Pokédex area marker logic (2026-09-25)

`src/fr/pokedexArea.ts` now ports the source data resolution shared by
`wild_pokemon_area.c` and `pokedex_area_markers.c`:

- Reads the exported FireRed wild encounter rows and MAPSEC-to-DEX_AREA tables;
  applies unlocked Sevii flags, the current Altering Cave set and the roamer's
  starter/location rules.
- Builds marker descriptors from the exported `sAreaMarkers` and C subsprite
  templates, preserving source coordinates, shape, size, priority and tile offset.

`npm run check:port` passes. This is a partial port: the Pokédex area page does
not call the helper yet, and the C sprite/task lifecycle, compressed marker
sheet, palette and OBJ-window blend remain unported. Browser rendering is not
verified.

## Single-player completion audit (2026-09-25)

This is the fastest path to a trustworthy missing-work list. Audit only the
main-story path first; do not count optional/postgame or visual-only work as a
single-player blocker. A feature is complete only when its TS implementation
matches the source behavior needed at that point and has a recorded check.

| Order | Audit slice | Work product | Status |
|---:|---|---|---|
| 1 | Starting town → Route 1 → Viridian | Source scripts located; TS behavior still needs execution/parity checks | In progress |
| 2 | Pewter → Mt. Moon → Cerulean → Vermilion | Same map/event inventory, following actual story gates | Not audited |
| 3 | Lavender → Celadon → Saffron → Fuchsia → Cinnabar | Same inventory, including key items, rival/Rocket events and HM gates | Not audited |
| 4 | Victory Road → Indigo Plateau → Champion | Confirm Elite Four, Champion, credits/result flags and return/save behavior | Not audited |
| 5 | Re-run from a regression save at each discovered blocker | Record reproducible checks and fix only confirmed gaps | Not started |

Within each slice, inspect only source scripts and TS handlers actually
referenced by its story events. This keeps the first pass small and produces a
ranked list by real blockers, rather than treating every registered command or
every C file as equally important. Add optional content, Sevii Islands and
visual/audio parity after the main-story list is closed.

### First slice: initial source-derived checklist

- **Pallet Town and Oak's Lab:** starter/rival scene and flags are already
  implemented according to the earlier status notes. Recheck exit gating and
  return behavior during a browser walkthrough. Source: `data/maps/PalletTown/`
  and `data/maps/PalletTown_ProfessorOaksLab/`.
- **Route 1:** verify the one-time Potion gift, bag-full branch, its persistent
  flag, wild encounters and both exits. Source: `data/maps/Route1/scripts.inc`.
- **Viridian City:** verify Oak's Parcel pickup and return handoff, the Old Man
  road/tutorial scenes and their scene flags, shop/center interactions, and
  exits. Source: `data/maps/ViridianCity/` and
  `data/maps/ViridianCity_Mart/`.
- **Static code cross-check:** all 213 exported script command names have a
  TypeScript handler. The direct story specials found in this slice
  (`GetPokedexCount`, `SetWalkingIntoSignVars`, `DisableMsgBoxWalkaway`,
  `HealPlayerParty` and `StartOldManTutorialBattle`) also have handlers. The
  Parcel macro expands to `additem` plus the standard received-item script;
  both routes exist in the interpreter. This finds no missing command/special
  registration for the inspected scripts, but does not prove their runtime
  behavior matches the C.
- **Known irrelevant stub in this slice:** `QuestLog_CutRecording` and
  `GetQuestLogState` are Quest Log support, which the project lists as out of
  scope. The standard solo-player route does not require Quest Log playback.
- **Still unverified:** execute the new-game path through leaving the house,
  Oak's Lab/rival battle, Route 1's one-time Potion (including the full-bag
  branch), the Viridian Mart Parcel, and delivery back to Oak. Check flags,
  party/bag contents, map transitions and save/continue state. Static checks
  locate these paths but cannot establish the results.

## Pendiente, de más sencillo a más difícil (2026-09-24)

Orden aproximado por esfuerzo. Cada punto dice qué `.c` portar, qué archivo
TS reemplaza y por qué importa (**[juego]** afecta a la progresión o a las
reglas, **[visual]** solo a la fidelidad visual). Ya portados como pantallas
de hardware: intro/título, menú principal, Oak, teclado de nombres, mapa de
región, opciones, mochila, estuche MT, saquito de bayas, menú de equipo,
iconos de Pokémon, list_menu, Salón de la Fama (parcial), diploma, Seagallop,
motor de batalla completo. Método y verificación: [AGENTS.md](AGENTS.md).

### Nivel 1 — pequeño (menos de un día cada uno)

1. **Buzón del PC** (`mailbox_pc.c`, parte de `player_pc.c`) **[opcional/baja prioridad]**:
   En FRLG las cartas solo almacenan mensajes creados con Easy Chat; guardar hasta 10 cartas
   en el PC no bloquea eventos, medallas ni progresión en solitario (single-player).
   El flujo ahora lee las cartas persistidas en `save.pcMail`, permite leerlas, moverlas a la bolsa (borrando el mensaje) y darlas a un Pokémon sin objeto. Conserva menús simplificados; falta verificar la presentación nativa. La escritura Easy Chat sigue pendiente.
2. **Objetos ocultos renovables** (`renewable_hidden_items.c`, 608 líneas)
   **[juego]**: Portado fiel en `src/fr/renewableHiddenItems.ts`, conectado a
   `fieldControl.ts` (conteo de pasos) y `overworld.ts` (`onMapLoad`), verificado
   headless con `npm run check:renewable` (15 mapas, límite de 1500 pasos,
   regeneración y distribución exacta de rare/uncommon/common).
3. **Vista previa de mapa al entrar en cuevas/bosques** (`map_preview_screen.c`,
   transición en `fldeff_flash.c`) **[visual]**: Portado fiel en `src/fr/mapPreviewScreen.ts`,
   conectado a `overworld.ts` (`finishMapLoad`, `setUpWarpExitTask`, `cb2`, `render`)
   y `commands.ts` (`setworldmapflag`). Soporta los 28 mapas (bosques con blend EVA/EVB
   sobre el mapa y cuevas con fade blanco y salto con botón B). Verificado headless con
   `npm run check:preview` (28/28 pantallas renderizadas a 240×160, duraciones 120/40 y banderas).
4. **Efecto de Destello al usarlo** (`fldeff_flash.c`) **[visual]**: el nivel
   de oscuridad funciona; falta la animación de apertura del círculo.
5. **Bolsa del Viejo y bolsa de Teachy TV** (`item_menu.c`
   `InitOldManBag`/`Pokedude`) **[visual]**: la bolsa real no está conectada a
   esos modos guionizados.
6. **Marcas de Pokémon** (`mon_markings.c`, 605 líneas) **[PORTADO]**:
   portado fielmente en `src/fr/monMarkings.ts`. Incluye el menú interactivo de marcas
   (círculo, cuadrado, triángulo, corazón) con cursor y OK/Cancel, sprites combo para
   el resumen y las cajas (`CreateMonMarkingAllCombosSprite`, `CreateMonMarkingComboSprite`,
   `UpdateMonMarkingTiles`), y `BufferMonMarkingsMenuTiles` que genera las tiles del marco
   del usuario (`GetUserWindowGraphics`). Exportada también `GetUserWindowGraphics` en
   `hw/menu.ts` para uso compartido. Compila y pasa build.
7. **Registro de batallas** (`battle_records.c`) **[diferido]**: guarda rivales de combates por cable y muestra resultados de Trainer Tower. El port no tiene sesiones Cable Club y Trainer Tower es postgame; no bloquea la historia individual.
8. **Contador de tiempo y utilidades pequeñas** (`play_time.c`, `coins.c`,
   `save_location.c`, `heal_location.c`): revisados; tiempo, monedas y recuperación
   estándar tras derrota ya reflejan la lógica principal. Las banderas de guardado
   para enlace/postgame siguen diferidas; queda verificación de ejecución.

### Nivel 2 — pantallas medianas (1–3 días cada una)

9. **Pantalla de datos del Pokémon** (`pokemon_summary_screen.c`, 5225 líneas)
   **[PORTADO]**: portada fielmente en `src/fr/pokemonSummaryScreen.ts` sobre la capa de hardware
   GBA (`hw/`). Implementa los 4 BGs, ventanas con auto-wrap y buffer dinámico de memo/habilidades,
   sprites interactivos (mon pic con vigor de rebote/vibración de huevo, Poké Ball, condición de
   estado, barras de HP y EXP animadas, estrella variocolor, marcas con combo, punto de Pokérus
   curado), cursores duales de selección/intercambio de movimientos, transiciones deslizantes de
   página (Info, Habilidades, Movimientos y Datos de movimiento), cambio dinámico de Pokémon con
   reproducción de grito (cries) y modo de selección de movimiento para aprender/olvidar movimientos
   (`PSS_MODE_SELECT_MOVE`). Reemplaza el adaptador de texto en `summaryScreen.ts` y en `battle/ext.ts`.
   Verificado headless (`npm run check:summary`).
10. **Escena de "usar objeto"** (`pokemon_special_anim.c`, 709 líneas;
    `pokemon_special_anim_scene.c`, 1563 líneas) **[visual]**: los helpers de
    anim type, cercanía y estadísticas de subida de nivel ya están en
    `pokemonSpecialAnim.ts`. `partyMenu.ts` aún salta `StartUseItemAnim_*` y
    mantiene `PSA_IsCancelDisabled() = false`; faltan las cuatro tareas de escena,
    callbacks, tiempos de cancelación y efectos de sprites.
11. **Recordador de movimientos** (`learn_move.c`, 932 líneas; reglas en
    `pokemon.c`) **[parcial]**: `pokemon/partyRules.ts` busca movimientos; la
    pantalla `menus/moveRelearner.ts` usa recursos y ventanas del C, presenta
    datos de movimiento y lista, preguntas con el `YesNoMenu`/template del C, y
    el flujo enseña/olvida con la pantalla de resumen real y espera sus fanfarrias
    y la A final como el C. Faltan fades/estados temporales, sprites/animaciones
    propios y validación visual.
12. **Tarjeta de entrenador** (`trainer_card.c`, 1959 líneas) **[PORTADO]**:
    portada fielmente en `src/fr/menus/trainerCard.ts` sobre la capa de hardware GBA (`hw/`).
    Implementa:
    - Anverso con nombre del jugador, ID de 5 dígitos, dinero con símbolo de yen, conteo de Pokédex,
      tiempo de juego con parpadeo del colon cada 60 frames, las 8 medallas de Kanto como bloques
      2×2 de tiles en BG3, color de tarjeta según estrellas (0: Azul, 1: Verde por entrar al Hall of Fame,
      2: Bronce por 150 Kanto, 3: Plata por 380 Nacional, 4: Oro por 200 saltos de bayas), y sprite frontal
      del entrenador (Red/Leaf) renderizado en ventana 2 sobre BG3.
    - Reverso con tiempo de debut en el Hall of Fame, estadísticas (victorias/derrotas por link, intercambios,
      Berry Crush, sala Unión) e iconos mini de los 6 Pokémon del Salón de la Fama.
    - Animación de perspectiva 3D al voltear la tarjeta con efectos scanline en BG0 y recorte vertical
      mediante `WIN0V` en 11 frames de contracción a 7px/frame y expansión a 5px/frame con sonidos `SE_CARD_FLIP`
      y `SE_CARD_FLIPPING`.
    - Verificado headless con `npm run check:card` (cdata, estrellas, escena de hardware, animación de volteo 3D y fade out).
13. **Fame Checker y Teachy TV** (`fame_checker.c`, `teachy_tv.c`)
    **[visual]**: `menus/keyItemScreens.ts` son adaptadores de texto; Teachy TV
    necesita además el controlador de batalla Pokédude
    (`battle_controller_pokedude.c`, 2698 líneas).
14. **PC de objetos** (`item_pc.c`) **[visual]**: retirar/depositar ya funciona
    desde `playerPc.ts` con listas simplificadas y la mochila real; falta la
    interfaz GBA, cursor, animaciones y estados originales.
15. **Escena de Evolución** (`evolution_scene.c`, 1704 líneas + `evolution_graphics.c`, 638 líneas)
    **[PORTADO]**: portada fielmente en `src/fr/evolutionScene.ts` sobre la capa de hardware GBA (`hw/`).
    Implementa:
    - `evolution_graphics.c`: matrices de escala OAM (20..31), 4 tareas de chispas (`EvolutionSparkles_SpiralUpward`,
      `EvolutionSparkles_ArcDown`, `EvolutionSparkles_CircleInward`, `EvolutionSparkles_SprayAndFlash`), sprite de
      chispas 8x8 (tag 1001), y morphing de silueta blanca en matrices 30 y 31 (`CycleEvolutionMonSprite`) con
      aceleración progresiva (velocidad 8 a 128) y alternancia de escala pre/post evo.
    - `evolution_scene.c`: animación de fondo con rotación y blend (`Task_AnimateBg` y `Task_UpdateBgPalette`
      con `sBgAnim_PaletteControl` y `sBgAnim_PalIndexes`), cancelación con botón B (`canStopEvo`), bloqueo
      automático sin Pokédex Nacional para especies >151, gritos de Pokémon, fanfarrias y música (`MUS_EVOLUTION`),
      separación de Shedinja (`trySpawnShedinja`), y flujo de aprendizaje de movimientos con la pantalla de resumen
      real (`ShowSelectMovePokemonSummaryScreen`).
    - Conectado tanto en combate (`battle/evoScene.ts` y `battle/main.ts`) como en el campo (`fieldPartyHooks.evolve`,
      piedras evolutivas, Caramelo Raro y `ingameTrade.ts`).
    - Verificado headless (`npm run check:evolution`).
16. **Intercambios en juego** (`trade.c` escena + `ingameTrade`) **[visual]**:
    la lógica funciona; falta la animación del intercambio.
17. **Tragaperras: gráficos** (`slot_machine.c`) **[visual]**: reglas y pagos
    verificados; faltan rodillos, baile de Clefairy y destellos.
18. **Pokédex completa** (`pokedex_screen.c`, `pokedex_area_markers.c`,
    `wild_pokemon_area.c`) **[visual]**: lista, búsqueda, página de área
    (dónde vive cada especie) y página de registro en batalla (hoy adaptador en
    `battle/ext.ts DexScreen_RegisterMonToPokedex`).
19. **Menú Guardar e informe** (`start_menu.c` guardado, `save_menu_util.c`)
    **[visual]**: comparar la ventana de guardado y el resumen con el C.

### Nivel 3 — sistemas grandes (varios días)

20. **Transiciones de combate** (`battle_transition.c`, 3037 líneas)
    **[visual]**: hoy no hay transición (espiral, persianas, etc.); se nota en
    cada combate. El pack `graphics_battle_transitions` ya se exporta.
21. **Almacenamiento de cajas** (`pokemon_storage_system*.c`, ~7000 líneas)
    **[juego/visual]**: `menus/storageMenu.ts` implementa las reglas
    (sacar/dejar/mover/objetos/fondos/liberar/nombre) con listas; falta la
    interfaz real con cursor-mano, iconos y animaciones.
22. **Easy Chat** (`easy_chat*.c`, ~4000 líneas) **[juego]**: escribir cartas
    (hoy quedan en blanco), perfiles y frases de algunos NPC.
23. **Animaciones de ataques restantes** (`battle_anim_*.c`, ~30 000 líneas)
    **[visual]**: el intérprete está completo y ~68 % de las referencias tienen
    tareas reales; faltan flechas de stats, sacudidas de terreno, sustituto/
    transformación, scroll de BG, copias mon→BG y los efectos por tipo
    (`battle_anim_fire.c`, `…_ice.c`, `…_effects_1/2/3.c`…). Portar por
    frecuencia de uso (Growl/Tail Whip primero).
24. **Audio fino** (`m4a*.c`) **[visual/sonido]**: reverb, ADSR exacto,
    duty/sweep, keysplit, atenuación de BGM bajo los gritos, paneo.
25. **Torre Entrenador de Isla Siete** (`trainer_tower.c` + `trainer_tower_sets.c`,
    ~9000 líneas de datos) **[juego postgame]**: specials registrados, falta
    completar reglas y datos de equipos.
26. **Casos límite de revanchas/roaming/guardería** **[juego]**: Buscapelea,
    Pokémon errantes, huevos; núcleo portado, falta verificación contra el C.

### Nivel 4 — validación de juego completo (lo más largo)

27. **Recorrido zona por zona** de toda la historia de Kanto y Sevii con
    comparación contra el C/emulador: eventos, specials que aún devuelven
    valores fijos, entrenadores, objetos, capturas, Safari. Es el único
    criterio real de "juego completo".
28. **Guardados de regresión**: snapshots por zona + cargador para repetir
    pruebas rápido; checks headless por sistema en `tools/checks/`.
29. **Decisión de diseño postgame**: eventos de distribución (tickets de Mew/
    Deoxys): inalcanzables (fiel) o ruta alternativa.

### Fuera de alcance (no hay hardware de enlace en el navegador)

Batallas/intercambios por cable, Union Room y su chat, Berry Crush, Dodrio
Berry Picking, Pokémon Jump, Mystery Gift/Mystery Event, e-Reader, adaptador
inalámbrico, `link*.c`/`librfu*.c`, `quest_log*.c` (repetición de partida) y
el sistema de ayuda (`help_system.c`). Los stubs devuelven los códigos de
"cable desconectado" del C.

### Mejoras futuras posibles (no son parte del port fiel)

16:9 con cámara ampliada del overworld, escalado entero/filtros, guardado en
la nube, atajos de calidad de vida (correr siempre, texto instantáneo),
sin tocar las reglas: hacerlo detrás de opciones para mantener el modo fiel.

## Removed legacy code (2026-09-24)

Later cleanup: the text-list party adapter helpers (`fieldMovesOf`,
`fieldMoveName`, `flyDestinations`, `mapSecName`) and the unused exported PNGs
(`gfx/pokemon/{back,back_shiny,icon}`, `gfx/items`, `gfx/trainers`,
`gfx/battle`, `gfx/interface`, `gfx/fieldfx`, ~7 MB) were removed; the ports
read those graphics from INCBIN. `step_graphics.py` now exports only fonts,
window frames, doors and front pics. `tools/check_down_arrow.ts` moved to
`tools/checks/downArrow.ts` (`npm run check:arrow`).

The Phaser prototype (`src/engine`, `src/scenes`, `src/content`, `src/game`,
`src/audio`, `src/ui`), the `phaser` dependency, the legacy importers
(`tools/import_*.py`), their generated `public/assets/`, `Pallet Town.mp3`
and the prototype documents (`ENGINE-PORTING.md`, `PALLET-TOWN-TASKLIST.md`)
were deleted; they remain in the Git history. `tools/decomp/` is the only
exporter. `npm run build` passes without Phaser.

Existing Pokémon, inventory and save logic should be reused and compared with
source behavior; missing interfaces do not mean those rules are absent.
`game.ts` throws when no battle runner is installed, but normal boot installs
the battle host. Trainer sight and wild encounters are connected through
`fieldControl.ts` → `fieldEffects.ts` → `game.wild`/`game.trainerSee`; the
keyboard naming screen (`namingScreen.ts`) is connected for player, rival,
party, box and caught-mon naming. Several field services and specials still
return fixed results or resume without implementing the source behavior.

The exporter covers all steps including audio (`tools/decomp/step_audio.py`:
songs, voice groups, instrument samples, cries).

## Porting method and document ownership

The full method (data pipeline, cdata/INCBIN access, faithful translation
rules, animations, verification levels) is in [AGENTS.md](AGENTS.md).

This file describes the active `src/fr` port. `START-FLOW.md` describes its
launch path.
`SECONDARY-MISSIONS-AUDIT.md` inventories source content, not completed features.

## Battle engine (src/fr/battle)

The battle port is wired into
the game (`boot.ts` → `installBattleHost`, assets via `battle/preload.ts`).
Ported modules: battle_main (init + turn flow), all 248 battle script commands,
battle_util, battle_message, the player / opponent / Oak-Old Man controllers,
controller data transfer, damage calc, the trainer AI (script interpreter plus
switching and item use), battle_interface (health boxes, HP/EXP bars, party
ball tray), battle_gfx_sfx_util, battle_intro (terrain slide), pokeball (send-out,
ball particles, mon fade), reshow_battle_screen, battle_anim_mons (coordinates,
translations, rot/scale) and the level-up sprites.

Earlier implementation notes report a browser check: the Oak's Lab rival battle plays end to end (intro,
Oak's tutorial commentary, move selection, AI turns, damage, faint, EXP and
level-up, prize money, return to the field). Debug shortcut after launching a
game: `frDebug.rivalBattle()` (optionally `"SPECIES_SQUIRTLE"` / `"SPECIES_CHARMANDER"`).

Pending / placeholders:
- Battle animation *scripts* run through the full opcode interpreter
  (`battle/animScript.ts`: 664 scripts decode cleanly, headless-verified).
  Mon-movement, palette-blend and sound effect tasks are ported
  (`battle/animTasks.ts`, ~68% reference-weighted); the rest render a timed
  target flash preserving pacing. Particle choreography, BG scrolling,
  mon-to-BG copies and spatialized panning remain pending.
- Bag and party screens are the ported `bagMenu.ts` / `partyMenu.ts`; the
  summary screen and move-forget selection use the faithful `pokemonSummaryScreen.ts`;
  Pokédex page in `battle/ext.ts` remains a text adapter.
- Battle evolution runs the full presentation in `battle/evoScene.ts` (intro
  message, cry, evolution music, white flashes with B-hold cancel, national-dex
  auto-stop past Mew, congrats/stopped messages, Shedinja split, new-move
  learning); verified headless (complete, cancel, stone-no-cancel, auto-stop).
  Sprite/background animation callbacks remain pending.
- Shiny sparkles, link battles, VS Seeker rematch state.
- The battle continue-arrow source offset is corrected: C's 256-byte alternate
  offset maps to x=64 in the exported image. A focused check compared 960 pixels
  against the packed source tiles across both variants and all four frames,
  including delay ticks. TypeScript and production build pass. An interactive
  battle check of the corrected arrow is still pending.
