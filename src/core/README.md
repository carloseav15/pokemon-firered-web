# src/core

Shared engine (docs/SEPARACION-MOTOR.md). Empty until step 5 moves modules here from
`src/games/firered/`, bottom layer first (runtime `gba/`, `hw/`, `audio/`, ...).

Rules, enforced by `npm run check:layers`:
- Code here never imports `src/games/<game>/` by path. It reaches game content only
  through `@game/<module>`.
- Every `@game/<module>` used here must be listed in `tools/checks/layers-contract.json`
  and exist in each game directory. The list may only shrink.
