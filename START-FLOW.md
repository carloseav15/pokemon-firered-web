# Active FireRed startup flow

The default entry point uses the TypeScript engine and a 240×160 Canvas.

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
variable. Audio data exports to `public/fr/audio` (songs, voice groups,
samples, cries); see [port status](PORTING-STATUS.md) before regenerating assets.

## Current limitations

- Oak's speech supports gender and name choices through the keyboard naming
  screen (`namingScreen.ts`, wired for player, rival, party, box and caught mons).
- Music, sounds and cries play through the WebAudio backend (`audio/m4a.ts`,
  installed at boot); browsers start it on the first input.
- Wild encounters and trainer sight run through the field engine
  (`fieldControl.ts` → `fieldEffects.ts` → `game.wild`/`game.trainerSee`);
  source parity checks are still pending.
- Party, bag and PC screens still have placeholders (trainer card, Pokédex
  list/info and capture registration are connected).
- The entire starter-to-Champion and postgame progression has not been verified.

## Verification

`npm run check:port` checks all TypeScript sources, including battle.
`npm run build` checks and bundles the runnable application.

The 2026-09-24 read-only audit passed the full TypeScript check. Earlier notes
report browser checks of startup and the lab rival battle; this audit did not
repeat those interactive checks. Future startup changes need a default-URL
check through title, START, controls, Oak and entry into the world.

