# Checkpoint after Group A (8 DIRECT functions)

Recorded at the pause point, before starting Group B, RNG or CRC. Machine wall-clock from the first file written to
the first Group A result: about 7 minutes (20:16:37 -> 20:23:43). That figure excludes the time spent reading code and
writing the tool, which the machine clock does not capture; the honest cost indicators are the line counts and the
number of failed runs below.

## Infrastructure at that point (one-time)

| Piece | Lines |
|---|---:|
| `run.mjs` driver | 154 |
| `lib/` (toolchain, C->wasm, esbuild expose plugin, inputs, comparators) | 511 |
| `controls/` (controls.c, fixed TS, generator script) + `specs/controls.mjs` | 98 |
| Total | about 760 |

Trial runs needed before the first successful run: controls 1 (worked first time), Group A 1 (worked first time).
Nothing had to be fixed in the harness to obtain Group A results; the later additions (envelope, smallest example,
structural/call domains, pair comparison) came from triage needs, not from failures.

## Group A results (before verdicts)

| Function | Realistic domain | Type domain |
|---|---|---|
| Sin | MATCH_OBSERVED | NEEDS_TRIAGE (negative / >= 320 index) |
| GetTileMapIndexFromCoords | MATCH_OBSERVED | NEEDS_TRIAGE (extreme widths) |
| CountTrailingZeroBits | MATCH_OBSERVED | MATCH_OBSERVED |
| CalculatePanIncrement | MATCH_OBSERVED | NEEDS_TRIAGE (incrementPan = -32768) |
| IsShinyOtIdPersonality | MATCH_OBSERVED | MATCH_OBSERVED |
| ExtractMetatileAttribute | MATCH_OBSERVED | MATCH_OBSERVED |
| GetHPBarLevel | MATCH_OBSERVED | NEEDS_TRIAGE (maxhp = 0, C trap) |
| GetGenderFromSpeciesAndPersonality | MATCH_OBSERVED | NEEDS_TRIAGE (species >= 412) |

Data checks: gSineTable (320 entries) and gSpeciesInfo.genderRatio (412 entries) identical between C and TS.

## Per-function cost (spec lines)

Sin 17, GetTileMap 11, CountTrailingZeroBits 7, CalculatePanIncrement 8, IsShiny 7, ExtractMetatile 7, GetHPBarLevel 7,
GetGender 13 (data load + table check). Average 9.6 lines. Hooking needed no change to any TS file.

## Toolchain and bundling problems

- Toolchain: none. `--allow-undefined` turns the unit's external calls into imports; none was reached by these functions.
- Bundling: none. esbuild bundled the seven modules in about 180 ms. The `setupNodeGbaMock` import was enough for
  `battle/interface.ts` and `pokemon/mon.ts` to load under Node.
- Reproduction: a single `--case` command reproduced a chosen counterexample (checked on CalculatePanIncrement).

## Decision

No fundamental blocker. Continued with Group B, RNG and CRC.
