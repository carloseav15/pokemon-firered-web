# Experiment B: one ByteStruct adapter

Chosen function: `WasUnableToUseMove` (battle_util.c), struct `ProtectStruct` (16 bytes, 26 one-bit and multi-bit members).
Second and third functions, to measure the marginal cost: `BtlCtrl_OakOldMan_SetState2Flag` / `TestState2Flag`
(struct `BattleStruct`, 512 bytes, pointer global). No `src/fr` file was changed for this experiment.

## Candidates considered

| Candidate | Struct | Reads/writes | Why not chosen as the first |
|---|---|---|---|
| `WasUnableToUseMove(u8)` | ProtectStruct | reads 9 bitfields, returns bool | chosen: only global is the struct array, exported TS |
| `BtlCtrl_OakOldMan_Set/TestState2Flag(u8)` | BattleStruct | writes / reads 1 byte of a pointer global | used second: needs the pointer-global init |
| `AreStatsRaised()` | BattlePokemon | reads statStages | needs `gActiveBattler` (scalar global) too |
| `SpecialStatusesClear()` | SpecialStatus | writes | needs `gActiveBattler` and `gBattlersCount` |
| `GetEnigmaBerryChecksum(struct EnigmaBerry*)` | EnigmaBerry (as raw bytes) | reads 0x30 bytes | TS takes a byte array, not the ByteStruct class |

## Harness errors found while building it (kept as history in verdicts.json)

1. Layout probe filled `Uint16Array`/`Int16Array` views with `0xff`, which sets half the bits: 8 false layout findings on BattleStruct.
2. Size of a `u8` member followed by padding was taken as the distance to the next member: 2 false findings.
3. `TestState2Flag` (C `bool8`, returns `x & mask`, e.g. 2) against a TS boolean (1): 398 realistic mismatches; comparison is now by truthiness.
The layout probe reported 0 real differences for both structs after fixing 1 and 2.

## Line counts (approximate, this phase)

| Cost | Lines |
|---|---:|
| one-time generic (lib/structs.mjs 179 + run.mjs ~25 + compare.mjs ~6 + report.mjs ~4) | ~215 |
| detector checks for the layout probe (controls/struct_mutants.mjs) | 37 |
| per struct (descriptor line in the spec) | 1 |
| per function: WasUnableToUseMove (first, incl. 2 mutants) | 22 (10 without mutants) |
| per function: SetState2Flag (new struct BattleStruct, incl. 2 mutants) | 17 (11 without) |
| per function: TestState2Flag (struct already supported) | 9 |
