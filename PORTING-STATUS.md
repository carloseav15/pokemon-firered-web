# FireRed web port status

Target: the full FireRed game, including its main progression and optional
systems. The first playable route is a milestone, not the completion criterion.

## Active path

The default URL runs `src/fr/startup.ts` on a 240×160 Canvas. New Game and
Continue hand off to `src/fr/boot.ts` and the decomp-driven overworld. The
earlier Phaser scenes remain as reference code and are not imported by the
default entry point. `?fr=new` and `?fr=continue` bypass startup.

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
  does not prove behavioral parity. Of 272 distinct exported special names,
  150 are registered and 122 are not; some registered handlers are placeholders.
- Exported data includes 425 maps and 365 layouts. Imported maps do not prove
  their events, services or progression work.

## Remaining work, from simpler to more complex

This is an approximate complexity order. Dependencies can change implementation
order; each item requires comparison with the original C, scripts and data.

1. Keep documentation current and establish a local Git baseline.
2. Fix small visual defects, including the battle dialogue continue arrow.
3. Port `naming_screen.c` and connect player, rival and Pokémon naming.
4. Complete options, trainer card and town map screens.
5. Replace small, bounded event-special placeholders with source behavior.
6. Complete shops and the bag, including item selection and use.
7. Complete party, summary and move-learning screens.
8. Connect wild encounters and trainer sight detection to the field engine.
9. Complete and verify capture flow and its party/storage destinations.
10. Complete PC storage and Pokédex interfaces and persistent interactions.
11. Interpret battle animation scripts and verify their effects.
12. Implement audio export and a playback backend for music, sounds and cries.
13. Complete daycare, trades, rematches, roaming Pokémon and related systems.
14. Validate and complete main-story and postgame events across Kanto and Sevii.
15. Verify full-game fidelity, saves and regression checkpoints. Focused checks
    are also required during every earlier step.

Existing Pokémon, inventory and save logic should be reused and compared with
source behavior; missing interfaces do not mean those rules are absent.
`game.ts` still has a fallback battle outcome when no runner is installed, but
normal boot installs the battle host. Trainer sight and wild-encounter hooks
remain unconnected. Several field services and specials still return fixed
results or resume without implementing the source behavior.

The exporter lists an audio step, but `tools/decomp/step_audio.py` is missing.
Running the full exporter therefore cannot currently complete all its steps.

## Porting method and document ownership

Read source headers for constants and structures, C implementations for rules
and callbacks, and event/battle scripts for sequencing. Translate behavior into
TypeScript and reuse exported data through the hardware abstraction. Headers
alone do not define the complete game behavior.

This file describes the active `src/fr` port. `START-FLOW.md` describes its
launch path. `ENGINE-PORTING.md` and `PALLET-TOWN-TASKLIST.md` describe the legacy
Phaser prototype; their checked items are not proof of active-engine parity.
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
- Move, status and general animation *scripts* are not interpreted yet; they
  end immediately (the engine, sprites and callbacks they rely on exist).
- Bag, party, summary, naming, Pokédex and evolution screens: `battle/ext.ts`
  resolves them immediately (bag = no item, party = cancel / first usable mon on
  a forced switch, new move not learned, name kept, evolution applied in place).
- Shiny sparkles, link battles, VS Seeker rematch state.
- Known glitch: the battle text box's continue arrow draws as a black box.
