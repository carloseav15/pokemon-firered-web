# Active FireRed startup flow

The default entry point uses the TypeScript engine and a 240×160 Canvas.
Phaser remains a dependency for the legacy prototype, but its scenes are not
part of the default launch path.

```text
src/main.ts
  -> src/fr/startup.ts
  -> copyright -> Game Freak -> intro scenes 1–3 -> title
  -> main menu (main_menu.c hardware port)
     -> New Game -> controls guide -> Oak speech -> gender and name choices
        -> src/fr/boot.ts -> player's room
     -> Continue -> src/fr/boot.ts -> saved field state
```

`?fr=new` and `?fr=continue` are development shortcuts that bypass startup.
Boot loads the source trig tables and battle assets and installs the battle
host before normal gameplay. Field scripts can hand off to the battle engine
and return to the field.

## Run locally

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Use the default URL to check the complete startup
sequence. Exported runtime assets are under `public/fr`; the exporter reads the
sibling `../pokefirered` directory by default, or the `POKEFIRERED` environment
variable. The full export currently stops at the missing audio module; see
[port status](PORTING-STATUS.md) before regenerating assets.

## Current limitations

- Oak's speech supports gender and default name choices. The keyboard naming
  screen is not connected: NEW NAME keeps the default name.
- Music, sounds and cries need an audio backend.
- A connected battle engine does not imply a complete encounter/capture loop.
  Wild encounters and trainer sight hooks remain unconnected.
- Party, bag, PC, Pokédex and other screens still have placeholders.
- The entire starter-to-Champion and postgame progression has not been verified.

## Verification

`npm run check:port` checks all TypeScript sources, including battle.
`npm run build` checks and bundles the runnable application.

The 2026-09-24 read-only audit passed the full TypeScript check. Earlier notes
report browser checks of startup and the lab rival battle; this audit did not
repeat those interactive checks. Future startup changes need a default-URL
check through title, START, controls, Oak and entry into the world.

The earlier Phaser flow and its milestones are historical reference in
[the prototype checklist](PALLET-TOWN-TASKLIST.md).
