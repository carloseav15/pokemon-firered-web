# Pallet Town Web Port — Loop Task List

This checklist records the earlier Phaser slice. The default entry point now
uses `src/fr/startup.ts` and the decomp-driven `src/fr` engine. Checked items
here are not evidence that the corresponding `src/fr` feature is complete.

## Scope

Reconstruct one playable Pallet Town slice in Phaser using the local FireRed decompilation as a behavioral and visual reference.

The current prototype now includes a source-inspired boot/title/intro/starter flow before entering the open-world overworld.

The loop is not complete until every checked item has an implementation, a successful build, a runtime check, and a comparison against the source data.

## Loop protocol

For each task:

1. Read the relevant FireRed source/data.
2. Implement the smallest testable slice in the web project.
3. Run the importer, build, and focused checks.
4. Run the local app in a browser.
5. Verify the result visually and interactively.
6. Compare behavior against the source data.
7. Fix regressions and repeat the checks.
8. Mark the task complete only after evidence is recorded.

## 1. Presentation and visual fidelity

- [x] Preserve full 256x512 intro BG maps so source-style hardware scrolling can be reproduced.
- [x] Port the source BG offsets and timing windows for the close-grass scene and two forest pans.
- [ ] Port and visually compare every Game Freak logo sparkle/window phase and Gengar/Nidorino fight callback.
- [ ] Port the FireRed title-screen animation and verify startup-to-title timings.

- [x] Import Pallet Town map layout and render the real map.
- [x] Import primary and secondary tilesets.
- [x] Apply the map palettes and metatile composition.
- [x] Generate base and foreground map layers.
- [x] Apply metatile layer types for foreground occlusion.
- [x] Import Red, Professor Oak, the wandering woman, and the wandering man sprites.
- [x] Add camera bounds and player following.
- [x] Import animated environmental tiles for water, flowers, and water edges.
- [x] Use separate timing for the environmental animation groups.
- [ ] Verify the player can visibly pass behind every relevant tree, roof, and foreground tile.
- [ ] Match object sprite facing directions and idle frames from the source definitions.
- [ ] Match player walking timing and frame selection for all four directions.
- [ ] Add map transitions with a FireRed-like fade.
- [ ] Add the Pallet Town map-name presentation.
- [ ] Verify the full 24×20 map at native logical resolution and scaled resolution.

## 2. Exploration engine for one map

### Engine port foundation

- [x] Extract a browser-side `WorldEngine` from the Phaser scene.
- [x] Add a bounded game clock and source-inspired task scheduler.
- [x] Add held/pressed input state contracts.
- [x] Add map runtime accessors for collision, behavior, elevation, warps, objects, and events.
- [x] Add a reusable collision system with source water behavior IDs.
- [x] Port source metatile behavior IDs for water, grass, doors, warps, ledges, directional blockers, currents, and interaction tiles.
- [x] Add directional collision rules and elevation-aware traversal checks.
- [x] Add terrain-effect classification for grass, sand, puddles, water, waterfalls, reflections, and ice.
- [x] Add forced-movement resolution contracts for walks, slides, and currents.
- [x] Connect forced movement to the Phaser player animation chain.
- [x] Resolve front-facing metatile interactions for signs, PCs, bookshelves, maps, TVs, and computers.
- [x] Add player/object movement systems with facing and occupancy rules.
- [x] Add object-event wandering and source movement-range fields.
- [x] Keep object flags in engine state and hide/show flagged events through the script layer.
- [x] Add a script instruction VM for dialogue, waits, flags, variables, and facing hooks.
- [x] Advance overworld logic on fixed GBA video frames and pause scripts until dialogue closes.
- [x] Add label/jump/condition/call/return control flow to the script VM and use it for Oak/Rival lab dialogue.
- [x] Use source new-game hide flags and make object visibility depend on flag values.
- [x] Add map transition and connection contracts.
- [x] Add a camera-follow contract independent of Phaser rendering.
- [x] Add a browser audio-bus contract for the future source/recreated music layer.
- [ ] Port remaining source metatile behavior functions and visual movement effects.
- [ ] Port source object-event movement actions and ground effects.
- [ ] Port compiled map scripts, flags, variables, and scene callbacks.
- [x] Port the opening Oak trigger, lab scene values 1/2/3, and starter/rival choice state.
- [ ] Port the rival battle and Oak's Parcel return before awarding the Pokédex.
- [x] Port map connection metadata and directional edge resolution.
- [ ] Port source weather, field effects, and fade state machines.

- [x] Load map metadata from `map.json`.
- [x] Load object event coordinates from `map.json`.
- [x] Load background event coordinates from `map.json`.
- [x] Load warp event metadata from `map.json`.
- [x] Use map-grid collision bits as the initial walkability source.
- [x] Export collision, elevation, and terrain grids from the source map.
- [x] Export metatile behavior IDs and treat ocean water as blocked without Surf.
- [x] Add a collision debug overlay (`C`) to visually verify blocked land and water cells.
- [x] Prevent movement through loaded NPCs.
- [x] Support grid-based player movement.
- [x] Add basic NPC wandering within source ranges.
- [x] Add proximity interaction with NPCs and signs.
- [x] Detect warps and report their source destination.
- [ ] Validate every walkable and blocked cell against the source map behavior.
- [ ] Use elevation values in collision and rendering decisions.
- [ ] Import metatile behaviors for doors, ledges, grass, water, signs, and interaction rules.
- [ ] Implement facing direction and interaction only in front of the player.
- [ ] Implement the remaining branching Pallet Town NPC scripts from `scripts.inc`.
- [x] Port the first Pallet Town, interior, and Route 1 dialogue registry from source `text.inc`.
- [x] Route known object and background scripts through `ScriptVM` before the visual fallback layer.
- [x] Add source-style text variable replacement for `{PLAYER}`, `{RIVAL}`, and runtime variables.
- [x] Add page wrapping and typewriter-style message advancement.
- [x] Add a reusable YES/NO choice model for future `MSGBOX_YESNO` scripts.
- [ ] Replace the procedural message panel with source-derived frame/font assets.
- [ ] Implement all Pallet Town signs and background events.
- [x] Import the four Pallet Town interior maps with their source tilesets and event metadata.
- [x] Load interior object graphics: Mom, Daisy, scientists, worker, Blue, Poké Balls, Town Map, and Pokédex.
- [x] Add runtime map loading and source warp-ID resolution for imported interiors.
- [x] Import Route 1's map, tilesets, collision, terrain, behavior, objects, and map metadata.
- [x] Add the Pallet Town ↔ Route 1 north/south edge connection rule.
- [ ] Manually verify every interior entrance/exit and Route 1 edge transition in the browser.
- [ ] Implement source-faithful interior scripts/text and scene-state flags.
- [ ] Import Route 1's Viridian City connection; Route 2 follows after Viridian/Pewter connection maps exist.
- [ ] Add a deterministic test map fixture for movement and collision regression tests.
- [ ] Add a restart-safe initial player position and map state.

## 3. Audio

- [x] Identify Pallet Town music and sound references from the decompilation (`MUS_PALLET` / `mus_pallet.mid`).
- [x] Decide whether the internal prototype uses source audio, recreated audio, or placeholders: use synthesized placeholders until licensing is resolved.
- [x] Add an audio manager with music, effects, volume, mute, and lifecycle handling.
- [x] Add looping Pallet Town background music as a synthesized placeholder.
- [x] Add movement or step feedback where appropriate.
- [x] Add interaction, dialogue-open, dialogue-advance, and warp sounds.
- [ ] Add an ambient water or environmental sound layer if supported by the source reference.
- [ ] Stop or crossfade audio on map transition.
- [x] Prevent duplicate audio instances after scene reloads.
- [x] Verify audio behavior in a browser after user interaction unlocks playback (`AUDIO: LOCKED` -> `AUDIO: MUTED` -> `AUDIO: ON`; reload produced no console errors).
- [ ] Keep source or recreated audio outside public distribution until licensing is resolved.

## 4. Verification gate

- [x] `python3 tools/import_pallet_town.py --source /Users/carancibia/Documents/ChatGPT/pokefirered` succeeds.
- [x] `npm run build` succeeds.
- [x] The local browser loads without console errors.
- [ ] Player movement, collision, NPC movement, interaction, and animation are manually verified.
- [ ] Environmental animation is observed across multiple frames.
- [ ] Foreground occlusion is manually verified at representative trees and buildings.
- [x] Audio is manually verified after browser playback unlock.
- [ ] Remaining differences from FireRed are documented before declaring this slice complete.

## 5. Pallet Town interior inventory and expansion order

### Interiors belonging to Pallet Town

- [x] Player's House 1F: 13x10, Mom NPC, TV event, two outside warps, and stairs to 2F.
- [x] Player's House 2F: 12x9, PC/NES/sign events, and stairs back to 1F.
- [x] Rival's House: 13x10, Daisy NPC, Town Map object, bookshelf and picture events.
- [x] Professor Oak's Lab: 13x14, Oak, assistants, starter Poké Balls, Rival, Pokédex objects, and scene triggers.

### Outdoor expansion order

1. [x] Import the four Pallet Town interiors and make their warp IDs resolve in both directions.
2. [x] Import Route 1, which is the direct north connection from Pallet Town.
3. [ ] Import the Viridian City connection needed to exit Route 1.
4. [ ] Import Route 2, which connects Viridian City to Pewter City and is not directly adjacent to Pallet Town.

### Collision note

Pallet Town's ocean-water cells use metatile behavior `0x15` and are not all marked with a blocking map-grid bit. The web runtime therefore blocks the source water behavior explicitly until a Surf/player-state system exists. This is a behavior rule, not a missing visual layer.

## Current loop status

The four Pallet Town interiors and Route 1 are now imported into the runtime. The next loop must manually verify all map transitions, then continue with exact layer/occlusion validation and source-faithful scripts/text. Route 1 currently stops at the unimported Viridian City edge.
