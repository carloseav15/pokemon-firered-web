# Legacy Phaser overworld engine port

The active browser entry now runs `src/fr/startup.ts` and then `src/fr/game.ts`
without Phaser. This document describes the earlier Phaser/WorldEngine
prototype, which remains in the repository as a reference but is not reached
from the default entry point. The native startup and battle hardware layer
still need source-by-source parity work.

The legacy prototype keeps the Phaser scene as a presentation adapter and moves gameplay rules into `src/engine`.

## Source mapping

| FireRed source | Web engine module |
| --- | --- |
| `main.c` | `WorldEngine.ts` + Phaser game loop adapter |
| `task.c` | `TaskScheduler.ts` |
| `global.fieldmap.h`, `fieldmap.c` | `types.ts`, `MapRuntime.ts` |
| `metatile_behavior.c` | `CollisionSystem.ts` |
| `field_player_avatar.c` | `MovementSystem.ts`, `InputState.ts` |
| `field_control_avatar.c` | `WorldEngine.ts`, `ScriptVM.ts` |
| `event_object_movement.c` | `ObjectEventSystem.ts` |
| `field_camera.c` | `CameraSystem.ts` |
| `field_fadetransition.c` | `TransitionSystem.ts` |
| `script.c`, `script_movement.c` | `ScriptVM.ts` |
| `sound.c`, `m4a.c` | `AudioBus.ts`, `AudioManager.ts` |

## Current engine boundary

`WorldEngine` owns deterministic state and gameplay operations:

- map runtime and map data
- player state and facing
- object-event state
- collision and terrain behavior
- directional blockers, jump/ledge behavior IDs, water/surfability, and elevation checks
- movement
- task scheduling
- input state
- script instructions
- flags and variables
- map transition contracts
- map connection offsets and edge resolution
- camera target state

The overworld now consumes fixed GBA video frames (280,896 CPU cycles at
16,777,216 cycles/second) rather than treating every browser redraw as one game
frame. The script VM runs consecutive nonblocking commands in one frame, waits
for dialogue dismissal, supports frame waits, and executes labels, conditional
jumps, calls, and returns. Oak's and Rival's first lab conversations now use
those variable branches. Map fades hold a transition
lock until the fade-in completes. These changes provide timing and ordering
contracts for future source-script imports; they do not mean every FireRed
script command or event is already implemented.

Source-backed Pallet Town dialogue definitions live in `src/content/sourceScripts.ts` and are consumed by `ScriptVM.fromObject`.

`PalletQuest.ts` now owns the first source scene variables and starter/rival
selection data. The initial hide flags come from `EventScript_ResetAllMapFlags`.
The first lab introduction uses `ScriptVM` frame waits and dialogue blocking.
The rival battle and the Oak's Parcel return sequence are still needed before
the original Pokédex award can be reproduced.

Text presentation is currently separated into `TextProcessor.ts` and `ChoiceModel.ts`; the Phaser panel remains a temporary renderer until the source UI assets are imported.

`WorldScene` owns Phaser-specific work:

- textures and sprites
- tweens
- camera rendering
- text boxes
- keyboard event registration
- visual animation frames
- audio device initialization

## Startup sequence port

`BootScene` now follows the source callbacks in `src/intro.c` for the Game Freak logo and the three intro scenes. The importer preserves 32x64-tile (256x512-pixel) background maps as well as composed screen layers. Phaser `TileSprite` viewports reproduce the GBA background X/Y offsets and wrapping used by `ChangeBgX` / `ChangeBgY`; the early grass, forest-pan, close-up, and Gengar-background motion use the source offsets and 60 Hz callback durations.

This is a behavior port, not a GBA register emulator. Palette blending, display windows, affine sprite matrices, DMA/VBlank sequencing, and the exact sprite/task callback order are translated to Phaser fades, tweens, frame updates, and timers. The Nidorino/Gengar fight choreography and title-screen animation still need a callback-by-callback pass against the decompilation.

## GBA display and timing equivalents

| FireRed/GBA mechanism | Browser implementation path | Current fidelity |
| --- | --- | --- |
| VBlank, main callback, task priority | Fixed game frame in `GameClock` and ordered `TaskScheduler`; render with `requestAnimationFrame` | Overworld step fixed; startup still uses Phaser timers/tweens |
| BG layers, BGxHOFS/BGxVOFS | Tilemap or wrapping `TileSprite` layer with pixel offsets | Intro scrolls use `TileSprite`; no general register model |
| OAM objects and priorities | Sprites with explicit depth and source frame callbacks | Partial sprite import; callback order incomplete |
| WIN0/WIN1/OBJ window | Phaser geometry/bitmap masks for simple shapes; stencil shader for exact per-layer windows | Not ported |
| BLDCNT/BLDALPHA/BLDY, palette fades | Indexed palette texture plus fragment shader for layer-specific blending | Camera fades only; not equivalent for layered effects |
| Affine BG/OBJ, mosaic | GPU transforms or a shader driven by frame state | Not ported |
| HBlank/scanline writes | Per-scanline shader uniforms/texture evaluated on GPU | Not ported |
| DMA and VBlank copies | Stage texture/palette state, commit it at a game-frame boundary | Asset preload exists; copy order not modeled |
| GBA audio timer/m4a mixing | Web Audio scheduling from source sequence data | Partial sound effects; original sequence timing not ported |

For an exact baseline of all original rules and hardware effects, run a ROM
built from the sibling decompilation in a browser GBA emulator. That executes
the original compiled logic and display registers, while the native TypeScript
port remains the route for 16:9 presentation and later free exploration. A
WebAssembly emulator is a practical reference or optional mode, not a shortcut
that makes the Phaser engine's missing systems complete. Keep ROM/BIOS loading
and redistribution choices separate from the engine port.

## Porting policy

The target is to translate the original game rules and sequence logic wherever browser code can represent them, not to stop at a visual mock or a generic overworld contract. Keep a source-to-web mapping for each subsystem, use the decompilation as the behavior reference, and record hardware-only details that need a browser equivalent. Preserve logical game time, state transitions, flags, variables, map data, and animation frame order; use Phaser only to render and receive browser input. When a behavior is still a placeholder, identify it as such instead of treating the contract as a completed port.

Build the port in playable vertical slices: startup and naming, Pallet Town and the lab, starter/Pokédex progression, a minimal faithful battle/capture loop, then connected Kanto maps. A slice is ready to expand only after its source path is traced and its web behavior has been manually compared in the browser.
