# Experiment C: scalar battle globals

## What the "82 candidates" turned into

| Filter (cumulative) | Functions |
|---|---:|
| ByteStruct + battle scalar globals only, scalar params, TS body, not gfx/hw (Experiment B list) | 82 |
| ... and no `gBattlescriptCurrInstr` / script or table pointer, checked transitively through same-unit callees | 23 |
| ... and no call that leaves the C unit (transitively) | 11 |
| ... and no `gBattleMons` (excluded by the brief) | 7 |

56 of the 82 read or advance `gBattlescriptCurrInstr` (the script cursor), which the brief excluded. The sample of 6 functions
came from the 7 (the 7th, `ModulateDmgByType`, reads `gBattleMoves`, a table defined in another C unit).

## Whole-corpus view (ported functions, single C unit, scalar parameters, TS body, not gfx/hw)

| Class | Functions | Share of 7,638 ported |
|---|---:|---:|
| considered (pass the basic filters) | 1,510 | 19.8 % |
| T0: no mutable globals (tables in the unit are fine) | 95 | 1.2 % |
| T1: only ByteStruct-backed globals | 4 | 0.1 % |
| T2: scalar globals (+ ByteStruct) | 112 | 1.5 % |
| T0+T1+T2 | 211 | 2.8 % |
| blocked by state of another kind | 1,299 | |

T2 splits into 58 scalars only, 18 with a ByteStruct other than `gBattleMons`, 36 with `gBattleMons`.
Blockers among the rest (a function can have several): non-scalar globals 2,155 references (Task[] 240, SaveBlock pointers 187,
Pokemon[] 173, Sprite[] 115, callback tables 103, large or 2-D arrays ~240, PartyMenu 64, Main 46, TextFlags 47), calls that leave
the unit 1,000, const tables defined in another unit 417. 176 functions are blocked only by outside calls (MarkBattlerForControllerExec 25,
GetBattlerForBattleScript 23, Random 16, FlagGet 14, CreateTask/DestroyTask 26); linking callee units would add only 3, because
the callees are stateful themselves.

## Line counts

| Cost | Lines |
|---|---:|
| one-time global adapter (structs.mjs +46, run.mjs ~5, compare.mjs ~2) | ~55 |
| per global (descriptor) | 1 |
| per function, without mutants | 6-10 |
| per function, with mutants | 8-19 |
