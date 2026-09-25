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

## Source review loop (2026-09-25, no runtime checks)

- `tileset_anims.c`: reviewed all six primary/secondary callbacks against `TilesetAnimator` in `src/fr/field/tileRenderer.ts`. Tile frame order, destination/count, trigger cadence and counter periods match. The web renderer writes tiles directly instead of scheduling DMA3; `prime()` initializes the opening frame. No browser or pixel comparison was run.
- `event_data.c`: core persisted vars/flags, special vars/flags and temporary-field clearing exist in `save.ts`; National Dex behavior is represented in script helpers. Quest Log flag/var recording/playback, upper-flag clearing, Mystery Event/Gift toggles and clearing, RTC-reset gates, and `ResetSpecialVars` are not implemented as source-equivalent APIs. Marked partial; optional systems remain unverified.
- `special_field_anim.c`: escalator start/stop/state and its staged 3×3 metatile redraw are not implemented as the C field-task sequence; warp routing exists separately. `AnimateTeleporterHousing` and `AnimateTeleporterCable` are no-op specials, while C animates Sea Cottage tiles over timed task sequences. Marked partial; source behavior identifies optional field-animation gaps.
- `trainer_fan_club.c`: postgame fan storage, NPC reveal, time-based gain/loss and dialogue helpers are represented in `specialsExtra.ts`. The new-game reset helper and link-battle updates/link trainer record names are absent; link battle is outside the single-player path. Marked partial.
- `field_tasks.c`: the Icefall Cave thin/cracked ice state machine and persistent puzzle flags are represented in `fieldTasks.ts` with a four-frame delay. The source ambient-cry/time-based task is absent; other per-step callbacks are dummy or unused in FireRed. The web update uses an overworld frame hook instead of a priority-80 task. Marked partial.
- `decompress.c`: source graphics are exported pre-decompressed; Pokémon picture selection and Unown/Deoxys/Spinda handling exist in `pokemon/pics.ts`. Buffer/heap sprite loaders and decompressed-size helper have no direct equivalents; the static object-stitching helper has no callers. Marked partial; no pixel comparison.
- `mini_printf.c`: formatting is used only by emulator debug-print and SWI logging code in `isagbprn.c`, which has no gameplay caller. Marked out of scope for browser single-player.
- `multiboot.c`: implements the GBA cable multiboot download protocol and is unrelated to the single-player game. Marked out of scope.
- `bike.c`: Mach/Acro movement state, rail/collision behavior, cycling-road movement and toggle/music behavior are embedded in `playerAvatar.ts`. Bumpy-slope Acro jumps and some bike counter/history helpers are absent. Marked partial; route behavior was not played through.
- `item_menu_icons.c`: bag pocket animation/shake, swap line and item/berry icon sprite paths are implemented in `bagMenu.ts` and shared with `berryPouch.ts`; typed arrays replace C heap buffers. The custom-template icon loader has no separate equivalent. Marked ported for active single-player scope; no pixel comparison.
- `digit_obj_util.c`: OAM-based number printer is used only by Berry Crush and Pokemon Jump; no TypeScript equivalent exists, and those optional minigame interfaces remain incomplete. Marked partial.
- `field_screen_effect.c`: Flash has a Canvas radius-mask adaptation. The barn-door window wipe and Safari out-of-balls callback are absent; also no source-equivalent post-defeat whiteout recovery text/task was found. Marked partial; includes the main story loss-recovery path.
- `palette_util.c`: RouletteFlash and pulse-blend code is explicitly unused in FireRed, and decomp call search also finds no callers for its tilemap helpers. Marked out of scope.
- `main.c`: `hw/runtime.ts` models callbacks and frame-driven scenes, while startup flow is separate. GBA interrupt/register setup, RFU/link gates, soft reset, flash checks and sound scheduling are hardware-specific and not implemented in the browser runtime. Marked partial.
- `seagallop.c`: ferry state machine, route tables, scrolling crossing, sprite animations, fades, selection and destination warp are ported in `seagallop.ts` with exported source data. Canvas/WebAudio adaptation; no frame comparison.
- `window.c`: window operations are split across `gba/window.ts` and `hw/window.ts`; allocation and rendering APIs are adapted, and some 8-bit/source helper entry points are missing. Marked partial; no exhaustive API/pixel parity check.
- `field_door.c`: door asset table, frame timing, open/close/closed draws, sound and animation state are implemented in `field/doors.ts`; Canvas draws exported frames instead of VRAM tile copies. No visual comparison.
- `trig.c`: exported sine tables and Q8.8/degree Sin/Cos helpers are loaded and consumed through `hw/trig.ts`. No exhaustive numeric diff was run.
- `field_camera.c`: camera movement/map transitions, pan and metatile drawing are integrated in `field/overworld.ts`; GBA ring-buffer slices and camera sprite callbacks are adapted or absent. Marked partial; no movement trace this pass.
- `option_menu.c`: six settings, cycling/input, frame preview, persistence and return flow are implemented in `optionMenu.ts`; Canvas/HwScene adaptation, no pixel comparison.
- `wireless_communication_status_screen.c`: counts RFU trade/battle/union/minigame activity and displays nearby peers; no single-player caller or wireless hardware. Marked out of scope for single-player.
- `script.c`: bytecode/native execution and map-script table dispatch exist in `script/context.ts` and `overworld.ts`; RAM scripts, some dialogue control flags and Quest Log input helpers are missing. Marked partial.
- `itemfinder.c`: current-map hidden item scan, underfoot digging and ding/message behavior exist in `fieldMenus.ts`; connected-map search and arrow/star directional sprites are absent. Marked partial; neighboring-map item detection is a gameplay gap.
- `sound.c`: map music state/fades, fanfares, SEs, cries and ducking have WebAudio counterparts, but the source M4A engine and table-level audio behavior are adapted. Marked partial; no audio comparison.
- `menu_indicators.c`: scroll arrows, outline/arrow cursors and their add/update/remove behavior are implemented in `hw/listMenu.ts` and consumed by menus. Browser sprite adaptation; no pixel comparison.
- `item.c`: item metadata, bag/PC inventory operations and item lookup exist across `pokemon/items.ts`, `save.ts` and `bagMenu.ts`; GBA encrypted slot storage, some sort/compaction helpers and story-item Quest Log logging are not exact equivalents. Marked partial.
- `move_descriptions.c`: all 355 source definitions, including the pointer table, are exported as cdata; move relearner and Pokémon summary screens load the table and resolve source text symbols. Source/data path reviewed; rendering parity was not checked.
- `battle_controller_safari.c`: the Safari action menu, throw/intro animations, text, healthbox, sound and battle-animation waits are mapped in `battle/controller_safari.ts`; encounter and catch logic is in `battle/main.ts` / `battleSetup.ts`. Remaining controller opcodes often complete immediately, leaving source sprite/data/status/move/party-summary commands incomplete. Partial; no runtime execution.
- `battle_ai_switch_items.c`: switch choices, switch targets, move/type scoring, held trainer-item classification/effects and AI action selection are represented in `battle/ai.ts`. The source itself notes the omitted Flying/Levitate trapping check. Source code review only; no battle replay or parity execution.
- `menu2.c`: the species/Unown stat-page positioning table and blend task are exported as C data but lack active TypeScript consumers/equivalents. Stat-page sprite positions and blending remain gaps; code/data lookup only.
- `mail.c`: held mail and Easy Chat word decoding are represented, while `ReadMail` uses the simplified `menus/mailView.ts` field adapter; C screen/task behavior and Easy Chat authoring remain incomplete. Partial; no UI comparison.
- `player_pc.c`: item-PC and mailbox flows are wired through `menus/playerPc.ts` with bag/party/save behavior, but use generic choice/message adapters instead of the full C window/task/fade/list implementation. Partial source review; PC storage UI remains simplified.
- `list_menu.c`: core list lifecycle, input, scrolling, cursor, template, palette and icon helpers are implemented in `hw/listMenu.ts`; the Mystery Gift-specific wrapper is outside the active single-player path. Source review only; visual list parity was not compared.
- `string_util.c`: byte-string copy/concat/length, decimal conversion and placeholder expansion are spread across `gba/charmap.ts` and `battle/message.ts`; Braille, Japanese/international and multibyte/control-code APIs remain partial or unverified. No parity vectors run.
- `new_menu_helpers.c`: text-box/window/frame, printer and BG-copy behavior is split across hardware and GBA modules; several heap-decompression, printer variant, start-menu/help/signpost and temp-buffer APIs are missing or adapted through pre-exported assets. Partial; no exhaustive visual/frame check.
- `menu.c`: cursor/input, yes-no, frame, top-bar and action-text helpers are spread across hardware-menu modules; grid multichoice, generic text/table printers and several utility APIs remain absent or adapted. Partial; no full menu parity check.
- `item_use.c`: most field item classes dispatch to the corresponding party/screen/field flows; battle effects are shared with battle code. Oak item gate, Quest Log recording, Enigma battle use and some C task timing/details remain absent or adapted. Partial source review; no flow execution.
- `fieldmap.c`: map layout, tile/behavior queries, camera and tileset loading are spread across field map/overworld/tile-renderer and BG modules. Backup map-view state and VRAM-copy paths are adapted; camera-specific differences are also tracked under `field_camera.c`. Partial source review; no route trace.
- `save.c`: gameplay save state and play time live in `save.ts`, but persistence is JSON in localStorage; C sector checksums, incremental writes, damaged-sector recovery, slot/signature logic and link full-save are absent. Save format/recovery parity remains incomplete; no reload exercise this pass.
- `field_fadetransition.c`: common door/fall/dive/teleport/map fades and music are wired in `field/overworld.ts`; several special transitions and return callbacks are absent or folded into shared handlers, with Canvas/palette sequencing adapted. Partial; route timing was not checked.
- `berry.c`: Berry records/descriptions export to cdata and Berry Pouch UI is present, but field berry-tree growth and berry lookup/type APIs lack active TS equivalents; Enigma Berry validity remains a stub. Partial; optional Berry lifecycle is not implemented.

## C/header inventory first pass (2026-09-25)

[`C-PORT-INVENTORY.csv`](C-PORT-INVENTORY.csv) lists all 283 C source files,
their same-stem header when present, every included `.h`, source line count,
same-name TypeScript candidates, automatic match category and a separate
status extracted from this document. The
decomp has 343 distinct included headers; 192 C files have a same-stem header.
The inventory also extracts public function declarations from those headers
and records whether each exact function name appears anywhere in `src/fr`.

The current review labels 58 modules as documented ported, 114 as partial or adapted, 8 as pending, 2 with small parity fixes awaiting verification, 23 as explicitly out of scope, 36 as probable out-of-scope candidates, and 42 as unreviewed. Separately, 42 files have a
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
- `blit.c`: 4bpp con/sin color key y fill ya estaban; añadí blit 4→8bpp,
  fill 8bpp y wrapper sin color key. `npm run check:port` pasó; falta contraste
  pixel/runtime. `window_8bpp.c` sigue pendiente en su ciclo de ventana y VRAM.
- `braille_text.c`: el export contiene la fuente Braille comprimida, pero
  `commands.ts` imprime `braillemessage` con el impresor normal y calcula
  `getbraillestringwidth` a 8 px por carácter; el C descomprime glifos de 16 px
  y ejecuta desplazamiento/esperas propios. Queda parcial; afecta las pistas
  Braille opcionales de las islas Sevii. Revisión de código, sin prueba visual.
- `script_pokemon_util.c`: `HealPlayerParty` y `DoesPartyHaveEnigmaBerry` ya
  tienen specials TS. Corregí `HasEnoughMonsForDoubleBattle`: ahora conserva
  los tres resultados C según el tamaño de party y cuántos Pokémon vivos no
  huevo hay. `ScriptGiveMon`, `ScriptGiveEgg`, `ScriptSetMonMoveSlot` y
  `CreateScriptedWildMon` aún no están implementadas con la semántica C; los
  selectores de equipos especiales son no-ops. `npm run check:port` pasó;
  queda revisión de comportamiento y de flujos individuales.
- `pokemon_size_record.c`: hash, tabla de tallas, comparación y textos de
  récord de Magikarp/Heracross están implementados en `specialsExtra.ts` y se
  usan en scripts de casas opcionales. Los inicializadores C solo fijan las
  variables a cero al crear partida, igual que el valor inicial guardado web.
  `GiveGiftRibbonToParty` solo lo llama Mystery Event (distribución externa);
  las firmas Seedot/Lotad del header no tienen definiciones en este C. Revisión
  de fuente, sin cotejo runtime.
- `malloc.c`: allocator fijo de EWRAM (headers de bloque, alineación, split,
  merge, zero y comprobación de integridad) queda fuera del runtime web, que usa
  objetos/arrays JS y garbage collection, sin heap GBA direccionable. La
  clasificación excluye el allocator, no los comportamientos de fallo por
  presión de memoria de sus callers.
- `save_failed_screen.c`: recupera sectores físicos de Flash con `ReadFlash` y
  `ProgramFlashByte`; no hay sectores equivalentes en el guardado `localStorage`
  web. Se excluye solo este reparador físico. El manejo de partidas web
  corruptas o incompatibles no queda demostrado por esta clasificación.
- `map_name_popup.c`: el adaptador web conserva nombre/piso, dimensiones,
  reaparición, deslizamiento de 24 px y espera de 120 frames. Canvas sustituye
  BG0/DMA/windows; falta respetar reproducción Quest Log y `palIntoFadedBuffer`.
  Revisión de fuente; timing sin ejecutar.
- `tilemap_util.c`: el original corta y copia rectángulos de tiles para PKMN
  Data, party menu y botón de cerrar caja (incluye su desplazamiento/estados
  alternos); sus callers viven en `pokemon_storage_system_tasks.c`. El storage
  web sigue como adaptador y no usa esos tilemaps; es brecha visual opcional
  del PC, no de progresión/equipo de combate. Revisión de código.
- `menu_helpers.c`: `hw/menuHelpers.ts` cubre las rutinas single-player de
  impresor/tarea, sí-no, L/R, cantidad, fuente de diálogo y reset de BG. Falta
  link queue/wait y callbacks de interrupción; no hay hardware link web.
  `IsHoldingItemAllowed` y `IsWritingMailAllowed` permiten todo por ausencia de
  link activo; no equivalen a restricciones de link. Revisión de fuente.
- `scanline_effect.c`: buffers dobles, DMA por HBlank 16/32-bit, write de
  primera línea y siguientes desde PPU, onda/tarea y offset opcional de BG de
  batalla están en `hw/scanline.ts`. Revisión fuente→TS; sin comparación de
  frames.
- `roamer.c`: corregí la diferencia entre los warps/continue (cambio obligado
  de set) y los pasos entre mapas por cámara (cambio aleatorio 1/16), y los
  resultados de batalla: WON/CAUGHT/DREW desactivan; TELEPORTED no. Wiring de
  ambos loaders y continue; `npm run check:port` pasó. No simulé encuentros.
- `isagbprn.c`: logging para impresoras/emuladores AGB Print, no$gba y mGBA,
  con registros de dirección fija, timing WAITCNT y aserciones debug; sin
  callers de juego single-player ni equivalente requerido en el navegador.
- `diploma.c`: pantalla, datos y estados principales están en `diploma.ts`;
  añadí `ScanlineEffect_Stop` del reset C. El retorno web adapta
  `FieldCB_WarpExitFadeFromBlack` a `fieldCBContinueScript`, por lo que falta
  paridad de transición de salida. `npm run check:port` pasó; sin chequeo visual.
- `util.c`: helpers repartidos: `BlendPalette`/`DoBgAffineSet` y
  `CountTrailingZeroBits` están mapeados en palette/bg/battle. Faltan
  `CopySpriteTiles` y CRC16/suma; sus callers son Mystery Event, validación
  RAM-script y transfer tower, fuera del recorrido normal single-player.
- `trainer_pokemon_sprites.c`: decompression/paletas y dibujo de trainer card
  usan datos C en `pokemon/pics.ts`/`trainerCard.ts`; falta ciclo completo de
  `CreatePicSprite`. El dex-info de batalla aún usa stub `0xffff`, coherente
  con el Pokédex UI adaptado. Revisión de fuente; presentación no fiel completa.
- `fldeff_cut.c`: Cut de césped/árbol y tabla de metatiles están en
  `fieldMoveMenu.ts`/`fieldMoves.ts`; corregí la comprobación de elevación al
  aplicar el corte. Falta abrir Dotted Hole tras la pista Braille y actualizar
  efectos de suelo; sprites de césped son adaptación omitida. `check:port` pasó.
- `sloopsvc.c`: servicios `SWI` propios del emulador Sloop (RFU/link, guardado
  sectorial del emulador, controles parentales de comunicación, bad-word,
  telemetría); no implementan reglas de juego single-player ni existen en web.
- `agb_flash.c`: driver físico GBA (ID chip, bancos, Thumb en RAM, timers,
  lectura/programación/verificación sectorial). El browser guarda en
  `localStorage` y no tiene bus Flash. Se excluye hardware, no equivalencia de
  guardados web dañados.
- `load_save.c`: `save.ts` persiste estado completo de juego como JSON en
  `localStorage`, incluyendo party, bolsa, cajas, flags/vars y warps. No porta
  estructura SaveBlock, cifrado/key rotation, checksums ni recovery Flash;
  `load()` solo valida JSON y versión 2. Revisión de código.
- `data.c`: este TU son tablas, no funciones. El export genera sus animaciones,
  nombres y tablas de sprites/trainer desde C en `cdata/data.json` + packs; TS
  los consume en `battle/anim.ts`, `pokemon/pics.ts`, `gfx_sfx_util.ts` y
  `oakSpeech.ts`. Revisé definiciones representativas; sin chequeo de píxeles.
- `m4a_tables.c`: tablas MPlay/PCM/ruido/frecuencias/cries se exportan, pero
  `audio/m4a.ts` usa secuenciador WebAudio propio y no las consume ni replica
  dispatch/síntesis M4A. Brecha de fidelidad de audio, sin impacto en reglas de
  progreso single-player; revisión de fuente.
- `bag.c`: las 13 funciones de ventana/texto/depósito/sí-no/dinero tienen
  implementación homónima dentro de `bagMenu.ts` y se usan por la pantalla real
  de mochila con hardware TS. Revisión de nombres/flujo; sin comparación pixel.
- `text_printer.c`: state machine, controles, colores, tiempos/scroll/prompt
  están repartidos en `gba/textPrinter.ts`/`hw/text.ts`; hice `clearSpan` no-op
  porque el `ClearTextSpan` C está vacío. La rasterización usa fuentes exportadas
  en lugar de lookup y VRAM GBA; Braille custom sigue pendiente. `check:port` pasó.
- `minigame_countdown.c`: countdown 3-2-1/START solo lo llaman Berry Crush,
  Dodrio Berry Picking y Pokémon Jump, todos minijuegos de comunicación/link;
  sin caller de aventura single-player.
- `ss_anne.c`: salida del barco conserva espera de 50 frames, estela/humo,
  desplazamiento cada cinco frames, bocina, umbral de salida y espera final 40
  frames antes de reanudar el script. Animaciones/callbacks cotejados con C;
  presentación de sprites usa Canvas y no se midió el timing visual.
- `script_movement.c`: el movimiento por script respeta mapa/local ID, slots,
  espera de held movement, avance del script, STEP_END, freeze/unfreeze y estados
  de éxito/pending como C. TS guarda referencias a objetos en vez de IDs empaquetados.
  Revisión de fuente; timing y convivencia de tasks no se ejecutaron.
- `task.c`: `gba/tasks.ts` ahora conserva lista priorizada estable del C,
  inserción/reuso de slots, recorrido incluso al crear/destruir durante callback,
  reset y APIs de query/word args. El followup guarda referencia JS en vez de
  dos halfwords de pointer. `npm run check:port` pasó; falta comparar orden frame a frame.
- `clear_save_data_screen.c`: fade, setup BG/ventanas, prompt sí/no, borrado,
  fade de salida y limpieza siguen los estados del C. El web vuelve a startup
  con `done` en vez de hacer soft reset físico; falta comparación visual.
- `buy_menu_helpers.c`: transacciones de compra/venta, cantidad y confirmación
  están en `shopMenu.ts`, pero con ventanas Canvas2D; faltan templates y bordes
  originales, money box y callbacks de mensaje/pacing de la pantalla C.
- `mail_data.c`: leer/tomar/guardar mail en PC y asociar mail están adaptados;
  TS guarda el mensaje dentro del Pokémon, sin el array C de 16 slots ni el
  mapeo de formas Unown. El compositor Easy Chat y la importación de trades
  siguen pendientes/adaptados.
- `dma3_manager.c`: TS copia BG/tilemaps inmediatamente; falta la cola DMA3
  de 128 requests con presupuesto por VBlank, fill/copy 16/32-bit y wait APIs.
  Los callers existentes usan semántica inmediata y el busy check siempre es false.
- `pc_screen_effect.c`: no existe el encendido/apagado CRT por WIN0/blend; C
  lo usa Item PC, cajas y PC del Hall of Fame. Las versiones web actuales son
  adaptadores de menú sin esa transición.
- `text_window.c`: frames standard/user/menu, paletas, diálogo y borde externo
  están en `hw/menu.ts`/`menuHelpers.ts`; faltan signpost, tiles Quest Log,
  borde interior y `rbox_fill_rectangle`. El campo adapta ventana Canvas2D.
- `new_game.c`: `game.newGame`/`newSaveData` inicializan nombre, dinero,
  Potion, Pokédex, flags/vars, tiempo y warp; faltan resets de varios sistemas
  y el trainer ID todavía usa `Math.random()` en vez de Random + Timer1 de C.
- `gpu_regs.c`: buffer, coalescing y flush en VBlank están en `hw/gpu.ts` y
  `runtime.ts`; IE/IME/DISPSTAT de hardware se abstraen y los helpers de
  interrupción son no-op. En TS solo se llama `EnableInterrupts(0)`.
- `pokedex.c`: las comprobaciones de completar Kanto/National ahora verifican
  cada especie elegible según las exclusiones del C; arregla los umbrales usados
  por scripts, estrellas de Trainer Card y diploma. La pantalla Pokédex sigue
  adaptada (búsqueda/área/gráficos pendientes). `check:port` pasó.
- `field_message_box.c`: show normal/autoscroll, expansión, color por NPC,
  bloqueo mientras imprime, cierre y reset están en `field/messageBox.ts`. La
  ventana y sus frames usan Canvas2D, no el task/ventana GBA original.
- `fldeff_rocksmash.c`: el menú exige la roca delante; el handler registra
  el stat, reproduce `show mon`/sonido y reanuda el script igual que C. Revisión
  de código completada; no se comparó el timing de animación en navegador.
- `dynamic_placeholder_text_util.c`: el color de texto NPC usa la tabla C
  exportada. Los placeholders F7 tienen implementaciones locales en resumen
  y diploma, pero falta el helper compartido Reset/Set/Get/Expand para el resto
  de callers; cajas y minijuegos opcionales conservan adaptaciones.
- `berry_powder.c`: la resta/comprobación de polvo y el vendor tienen handlers
  TS. Faltan el tope 99.999 de GiveBerryPowder, el rewrap por encryption key
  y la ventana exacta; la adquisición depende de Berry Crush (link).
- `window_8bpp.c`: falta portar AddWindow8Bit, su fill/blit 4→8 bpp y
  CopyWindowToVram8Bit. El caller es la ventana de multi-move de las cajas;
  PPU sí interpreta tiles BG 8bpp, pero la pantalla de cajas sigue adaptada.
- `battle_util2.c`: la pérdida de amistad al caer coincide, incluida la
  selección del rival de mayor nivel en dobles y el umbral de 29 niveles. Los
  recursos globales están preasignados en TS; faltan las llamadas propias al
  estado de combate de Trainer Tower, por lo que el módulo queda parcial.
- `post_battle_event_funcs.c`: `EnterHallOfFame` ahora entrega los dos tickets
  y activa los flags de islas cuando se concede la primera Champion Ribbon,
  como en REVISION >= 0xA. `SetCB2WhiteOut` está conectado; la UI/animación de
  Hall of Fame sigue adaptada con mensajes y elecciones genéricos. Solo revisión
  de fuente; falta verificación de ejecución.
- `reset_save_heap.c` expone `ReloadSave`, usado solo por recuperación de link;
  su reset EWRAM/registro no aplica al recorrido single-player web.
- `cable_car_util.c` solo define dos helpers estáticos para llenar/copiar
  tilemaps con wrap; no tienen call sites en el repositorio. Los specials de
  Cable Car se registran como `NullFieldSpecial`; se excluye solo este módulo
  inactivo, sin inferir paridad general de tilemaps.
- `berry_fix_program.c` envía el programa multiboot Berry Fix a otro GBA por
  cable, para reparar berries incompatibles entre cartuchos. Requiere hardware
  link y queda fuera del recorrido single-player web.
- `agb_flash_mx.c` contiene comandos físicos de erase/program para MX29L010,
  switching de bancos y polling de timer. No aplican a localStorage; se excluye
  el driver del chip, no la semántica de guardado.
- `agb_flash_1m.c` identifica el chip Flash de 1 Mbit, cambia registros y
  asigna drivers específicos de hardware. Web guarda en localStorage; esto
  excluye solo el controlador físico, no la paridad del sistema de guardado.
- `rom_header_gf.c` define una tabla Game Freak de metadatos/offsets SaveBlock
  consumida por integraciones externas; no hay caller de runtime FireRed. Se
  excluye esta interfaz de herramientas, no datos o lógica del juego.
- `wonder_news.c` reparte berries por noticias enviadas/recibidas con
  partners link y limita recompensas por pasos. Requiere datos Mystery Gift
  transferidos; single-player web no tiene ese canal, así que se excluye solo
  ese sistema de distribución.
- `cereader_tool.c` valida y guarda pisos de Trainer Tower recibidos por
  e-Reader/link en sectores especiales. En FireRed, `ReadTrainerTowerAndValidate`
  es un stub que siempre retorna FALSE; los retos importados no forman parte
  del Trainer Tower single-player normal. Se excluye solo esa transferencia.
- `agb_flash_le.c` solo configura el chip Flash GBA y sus sectores/timings;
  se reemplaza por localStorage en web. Esto no implica paridad del formato de
  SaveBlock ni del flujo de guardado.
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
- `fldeff_sweetscent.c`: arreglé el orden de encuentro con roamer (antes de
  revisar la tabla normal). La transición rosa sigue como overlay Canvas y aún
  no reproduce la copia/fade de paletas del C; permanece parcial.
- `fldeff_softboiled.c`: eligibility, elegir destinatario, rechazar usuario/
  debilitado/HP lleno, transferir 1/5 HP y devolver cursor/mensaje coinciden con
  el task de `partyMenu.ts`; fuente revisada, sin interacción live.
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
