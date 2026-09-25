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

## Pendiente, de más sencillo a más difícil (2026-09-24)

Orden aproximado por esfuerzo. Cada punto dice qué `.c` portar, qué archivo
TS reemplaza y por qué importa (**[juego]** afecta a la progresión o a las
reglas, **[visual]** solo a la fidelidad visual). Ya portados como pantallas
de hardware: intro/título, menú principal, Oak, teclado de nombres, mapa de
región, opciones, mochila, estuche MT, saquito de bayas, menú de equipo,
iconos de Pokémon, list_menu, Salón de la Fama (parcial), diploma, Seagallop,
motor de batalla completo. Método y verificación: [AGENTS.md](AGENTS.md).

### Nivel 1 — pequeño (menos de un día cada uno)

1. **Buzón del PC** (`mailbox_pc.c`, parte de `player_pc.c`) **[juego]**:
   `menus/playerPc.ts` lista las cartas *del equipo*; en el C el buzón guarda
   hasta 10 cartas en el PC con LEER / A LA MOCHILA / DAR A POKéMON. Unificar
   con `save.pcMail` (lo crea `TakeMailFromMon2` en `partyMenu.ts`) y
   completar `TryGiveMailToSelectedMon` (`PARTY_ACTION_GIVE_MAILBOX_MAIL`).
2. **Objetos ocultos renovables** (`renewable_hidden_items.c`, 608 líneas)
   **[juego]**: Portado fiel en `src/fr/renewableHiddenItems.ts`, conectado a
   `fieldControl.ts` (conteo de pasos) y `overworld.ts` (`onMapLoad`), verificado
   headless con `npm run check:renewable` (15 mapas, límite de 1500 pasos,
   regeneración y distribución exacta de rare/uncommon/common).
3. **Vista previa de mapa al entrar en cuevas/bosques** (`map_preview_screen.c`)
   **[visual]**: los datos (`map_preview_screen` cdata, pack
   `graphics_map_preview`) ya se precargan; falta la pantalla y el hook de warp.
4. **Efecto de Destello al usarlo** (`fldeff_flash.c`) **[visual]**: el nivel
   de oscuridad funciona; falta la animación de apertura del círculo.
5. **Bolsa del Viejo y bolsa de Teachy TV** (`item_menu.c`
   `InitOldManBag`/`Pokedude`) **[visual]**: la bolsa real no está conectada a
   esos modos guionizados.
6. **Marcas de Pokémon** (`mon_markings.c`) **[visual]**: necesarias para el
   resumen y las cajas; sin ellas esos menús no pueden mostrar/editar marcas.
7. **Registro de batallas** (`battle_records.c`) **[visual]**: solo afecta al
   récord de combates por cable (fuera de alcance), pero el menú existe en el PC.
8. **Contador de tiempo y utilidades pequeñas** (`play_time.c`, `coins.c`,
   `save_location.c`, `heal_location.c`): comprobar que las reglas existentes
   (en `save.ts`/`game.ts`) coinciden con el C línea a línea.

### Nivel 2 — pantallas medianas (1–3 días cada una)

9. **Pantalla de datos del Pokémon** (`pokemon_summary_screen.c`, ~4700 líneas)
   **[visual]**: reemplaza `summaryScreen.ts` (texto) y el selector de
   movimiento a olvidar (`battle/ext.ts ShowSelectMovePokemonSummaryScreen`,
   `menus/monProgress.ts`). Desbloquea también la versión de batalla y la de
   las cajas. Es el hueco visual más visible hoy.
10. **Escena de "usar objeto"** (`pokemon_special_anim.c`, 2272 líneas)
    **[visual]**: `partyMenu.ts` salta `StartUseItemAnim_*` y fija
    `PSA_IsCancelDisabled() = false`; al portarla se cambia solo eso.
11. **Recordador de movimientos** (`move_relearner.c`) **[juego]**: verificar
    si la pantalla actual es adaptador y portarla (el menú de equipo ya le pasa
    `VAR_0x8005` como en el C).
12. **Tarjeta de entrenador** (`trainer_card.c`) **[visual]**: gráficos,
    giro de la tarjeta, medallas y fotos (`menus/trainerCard.ts` es adaptador).
13. **Fame Checker y Teachy TV** (`fame_checker.c`, `teachy_tv.c`)
    **[visual]**: `menus/keyItemScreens.ts` son adaptadores de texto; Teachy TV
    necesita además el controlador de batalla Pokédude
    (`battle_controller_pokedude.c`, 2698 líneas).
14. **PC de objetos** (`item_pc.c`) **[visual]**: retirar/depositar con la
    interfaz real (hoy `playerPc.ts` usa listas; el depósito ya usa la mochila).
15. **Evolución fuera de combate** (`evolution_scene.c` desde el campo +
    `evolution_graphics.c`) **[visual]**: `battle/evoScene.ts` ya tiene la
    presentación; conectar `BeginEvolutionScene` desde el menú de equipo /
    Caramelo Raro / piedras (hoy `monProgress.evolveWithMessages`) y portar las
    chispas de `evolution_graphics.c`.
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
  summary move-forget selection and Pokédex page are still text adapters in
  `battle/ext.ts`.
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
