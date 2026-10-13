# src/core

Shared engine (docs/SEPARACION-MOTOR.md). Step 5 moves modules here from
`src/games/firered/`, bottom layer first. Done: runtime `gba/`, `hw/` (without the menu
cluster), `audio/`, `decompress`, `random`, `mathUtil`, `util`, `rom`; Pokémon model (`pokemon/`: mon, mon_extra, pokemon,
pics, storage, berry, roamer, saveLocation, battleMusic); script engine (`script/commands`,
`context`, `movement`, `eventObjectLock`) and the field engine (`field/*` except `vsSeeker`).
Game modules import core with the `@core/*` alias; core reaches the game with `@game/*`.

Rules, enforced by `npm run check:layers`:
- Code here never imports `src/games/<game>/` by path. It reaches game content only
  through `@game/<module>`.
- Every `@game/<module>` used here must be listed in `tools/checks/layers-contract.json`
  and exist in each game directory. The list may only shrink.
