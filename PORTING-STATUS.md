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

## Remaining work, from simpler to more complex

This is an approximate complexity order. Dependencies can change implementation
order; each item requires comparison with the original C, scripts and data.
Why each item matters is noted: progression content, visible fidelity, or
explicitly out of scope.

1. Keep documentation current. The local Git baseline exists (`main`, no
   remote configured, so nothing is pushed).
   - `list_menu.c` + `menu_indicators.c` are ported (`src/fr/hw/listMenu.ts`)
     over a `ListSurface`, so hardware windows and field canvas windows share
     one implementation (`src/fr/menus/fieldListMenu.ts` adds the field
     surface and the red scroll arrows as field sprites). In use by: every
     `openHardwareChoice` adapter (bag, party, PC, Pokédex, trades…; source
     selector arrow, 16px rows, D-pad paging, scroll arrows, grey disabled
     rows), the `special ListMenu` script lists (`sFieldSpecialsListMenuTemplate`,
     `ScriptListMenuMoveCursorFunction`, arrows at the source positions,
     suspend/`ReturnToListMenu`) and the shop item list (prices as in
     `BuyMenuPrintPriceInList`). Source review only; not run.
2. Fix small visual defects (battle dialogue arrow verified via
   `tools/check_down_arrow.ts`; naming page-swap/cursor choreography,
   trainer disguise icons, storage cursor animations pending).
3. Verify `naming_screen.c` parity for player, rival and Pokémon naming (screen
   exists and is connected; choreography details pending).
4. Options and region map screens are ported on the hardware layer:
   `src/fr/regionMap.ts` is `region_map.c` (Town Map with open/close edge
   animation, dungeon icons, map-preview zoom with flavor text, Kanto/Sevii
   switch menu; wall map for `ShowTownMap`; Fly map with fly icons and
   `SetFlyWarpDestination`, wired to the party menu's FLY), and
   `src/fr/optionMenu.ts` is `option_menu.c` (frame preview, WIN0 row
   highlight, returns to the open start menu). Source review only; not run.
   Trainer card: dedicated card graphics, flip animation and photo icons
   pending.
   - BAG: `src/fr/bagMenu.ts` ports `item_menu.c`, `bag.c` and
     `item_menu_icons.c` (bag sprite with pocket switch and shake, item icons,
     pocket list reveal, SELECT item moving with the swap line, context menus
     by location, toss/register, sell to a shop, deposit to the PC, give from
     the party menu). `src/fr/hw/menuHelpers.ts` adds `menu_helpers.c`,
     `money.c` and the scheduled-copy helpers. The field bag, the battle bag,
     the shop SELL option, PC deposit and the party GIVE option use it. TM CASE: `src/fr/tmCase.ts` ports
     `tm_case.c` (HMs first, move info with type/power/accuracy/PP icons,
     disc sprite tinted by type with the swap animation, USE/GIVE context
     menu, give-from-party/PC and sell flows); the bag opens it for OPEN,
     party GIVE, PC give and shop SELL. BERRY POUCH: `src/fr/berryPouch.ts` ports
     `berry_pouch.c` (wobbling pouch sprite, item icons, USE/GIVE/TOSS,
     party/PC give and sell), opened from the field bag, the battle bag and
     give/sell/PC bags. Old Man / Teachy TV scripted bags are not wired yet.
   - POKéMON (party menu): `src/fr/partyMenu.ts` ports `party_menu.c` and
     `fldeff_softboiled.c` (slot boxes with palette states, bouncing icons from
     `src/fr/pokemonIcon.ts` = `pokemon_icon.c`, held-item/ball/status sprites,
     action menus with field-move descriptions, SWITCH with the slide
     animation, give/take items, take/read mail, field moves and FLY map, HP
     count-up medicine, PP items, TMs/HMs with move replacement, Rare Candy
     level-up windows and new moves, Sacred Ash, evolution stones, Softboiled,
     battle switching and the Oak tutorial voice-over, choose-multiple, move
     tutor, relearner and daycare selection). Wired to the start menu, bag /
     TM case / berry pouch USE and GIVE, the battle bag (medicine/ethers) and
     battle switching, and the ChoosePartyMon / move tutor / relearner /
     daycare specials. Pending: `pokemon_special_anim.c` (the use-item scene is
     skipped), the real summary screen (`src/fr/summaryScreen.ts` is a text
     adapter), Easy Chat mail writing (given mail keeps a blank message) and
     giving PC-mailbox mail.
5. Replace small, bounded event-special placeholders with source behavior.
6. Complete shops and the bag, including item selection and use. Verify the
   Game Corner prize exchange scripts (stock, prices, delivery) — otherwise
   prize Pokémon/TMs stay unreachable.
7. Complete the summary screen (`pokemon_summary_screen.c`), the move-forget
   selection and `pokemon_special_anim.c`; the party menu is ported.
8. Verify wild encounters and trainer sight detection against source behavior
   (both are connected to the field engine; parity checks pending).
9. Complete and verify capture flow and its party/storage destinations, plus
   a Safari Zone end-to-end pass (controller exists; bait/rock/flee/TimesUp
   and clean exit unverified).
10. Complete PC storage sprite visuals and the Pokédex search/area pages
    (storage has withdraw/deposit/move-mon/move-items/wallpaper/
    release/name-box with source rules; dex list, info page with cry and
    capture registration are connected). Verify fossil revive and other gift
    scripts that reuse `scriptGiveMon`.
11. Battle animation effects: the 48-opcode interpreter is complete (664 scripts
    decode cleanly, headless-verified) and ~68% of effect references render
    real tasks; the rest flash on schedule. Still pending, by value: stat-change
    arrows (every Growl/Tail Whip), horizontal/terrain shake, substitute/
    transform/minimize sprites, BG scrolling, mon-to-BG copies, spatial panning.
12. Refine audio: reverb, exact ADSR/duty/sweep, keysplit melodic voices,
    BGM ducking under cries, per-channel panning. Playback, cries and the full
    exporter already work.
13. Complete rematches and roaming edge cases (daycare, trades, roamer core
    are ported). Shiny sparkles need the animation only; rates already flow.
14. Validate and complete main-story and postgame events across Kanto and Sevii
    with zone-by-zone playthroughs. This is the only "full game" criterion and
    the largest remaining item. Postgame distribution events (Mew/Deoxys
    tickets) need a design decision: unreachable (faithful) vs alternative path.
15. Verify full-game fidelity, saves and regression checkpoints (zone save
    snapshots + loaders). Focused checks are also required during every
    earlier step.

Explicitly out of scope (no link hardware in a browser): link battles/trades,
Battle Tower link play, Union Room, Berry Crush/Dodrio Berry Picking/Pokémon
Jump, e-Reader, wireless adapter, Contest linkups. Stubs report the source's
disconnected-cable codes. Quest Log recording and the Help system are inert
and affect only rewatching, not gameplay.

## Removed legacy code (2026-09-24)

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

Read source headers for constants and structures, C implementations for rules
and callbacks, and event/battle scripts for sequencing. Translate behavior into
TypeScript and reuse exported data through the hardware abstraction. Headers
alone do not define the complete game behavior.

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
