# Differential oracle (proof of concept)

Compares a pokefirered C function, compiled to wasm32, with the real TypeScript in `src/fr`
on the same inputs. **Opt-in**: nothing here is wired to `check:port`, `npm test`, the normal
checks or CI, and nothing here edits `src/fr` or the decomp tree.

```text
same inputs ─┬─> pokefirered C  ─ clang --target=wasm32 ─> wasm ─┐
             └─> real src/fr TS ─ esbuild bundle (+expose) ──────┴─> compare ─> MATCH_OBSERVED | NEEDS_TRIAGE
```

## What it is not

clang/wasm32 is a reference for **controlled C semantics** (ILP32, little endian, `unsigned char`,
wrapping signed arithmetic). It is not a GBA emulator and not an exact reproduction of agbcc or
the ARM ABI: no hardware, no timing, no ARM calling convention, and compiler-defined behaviour
(uninitialised locals, argument evaluation order, out-of-bounds reads) may differ from the ROM.
`MATCH_OBSERVED` means "no difference in the inputs tried and the effects observed", not equivalence.

## Run

```bash
node tools/oracle/run.mjs                       # everything (writes results/latest.json)
node tools/oracle/run.mjs --group A,B --domain realistic
node tools/oracle/run.mjs --fn ModifyStatByNature --domain structural
node tools/oracle/run.mjs --fn CalculatePanIncrement --impl 'battle/animScript.ts' --case '[-1,0,-32768]' --domain type   # single repro
node tools/oracle/report.mjs                    # results/latest.json + verdicts.json -> REPORT.generated.md
node tools/oracle/controls/adapter_mutants.mjs  # detector check for the RNG/buffer adapters (run --group C first)
```

Options: `--group A|B|C|controls|all`, `--fn`, `--impl`, `--seed` (default 20260928), `--fuzz` (default 2000),
`--cap` (boundary combinations, default 20000), `--domain type|structural|realistic|call|both|all`, `--case`, `--no-write`.

Requirements: a clang with the wasm32 backend and `wasm-ld` (Homebrew `llvm@16` was used:
clang 16.0.6, LLD 16.0.6; override the directory with `ORACLE_LLVM_BIN`), `python3` (reuses
`tools/decomp` preprocessing), `esbuild` from `node_modules`. If something is missing the tool prints what
and exits with status 2; it never affects the rest of the project.

C compile line (per translation unit, from the preprocessed source that `tools/decomp/clang_ast.py` already produces):

```text
clang --target=wasm32 -O0 -fwrapv -funsigned-char -ffreestanding -nostdlib -w -Wno-implicit-function-declaration \
      -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -fuse-ld=<wasm-ld> <unit>.oracle.c
```

`static` is dropped, in the oracle's copy only, for the functions/tables a spec lists (`c.unstatic`).
Functions the unit calls but does not define become wasm imports; a stub throws if one is reached
(only `abs`, `memcpy`, `memmove`, `memset` are provided).

## Results, verdicts, domains

The harness only emits `MATCH_OBSERVED` or `NEEDS_TRIAGE`. A verdict is assigned afterwards in
`verdicts.json` (raw evidence is never rewritten): `TS_DIVERGENCE`, `DATA_MISMATCH`, `HARNESS_ERROR`,
`ORACLE_LIMITATION`, `UNDEFINED_BEHAVIOR`, `INVALID_DOMAIN`. A cluster is one automatic cause hint per
function/impl/domain; the hint (for example `missing-truncation-to-u8`) is a lead, not a diagnosis.

Input domains:

| Domain | Meaning |
|---|---|
| `type` | every value of each C type (often triggers undefined behaviour) |
| `structural` | type range for data values, realistic range for structural parameters (table indices, sizes) |
| `realistic` | ranges derived from callers; each spec records `fact` vs `assumed` evidence |
| `call` | speculative: TS callers passing unnormalised numbers (C converts them to the parameter type, TS receives them raw) |

Inputs: boundaries per type (0, 1, -1, MIN, MIN+1, MAX-1, MAX, sign/width edges) combined (capped, deterministic
sample) plus seeded fuzz (mulberry32). C traps (divide by zero, out-of-bounds) are captured and reported.

## Layout

- `run.mjs` driver, `report.mjs` report generator, `verdicts.json` triage decisions.
- `lib/` toolchain lookup, C->wasm, esbuild bundle with in-memory expose plugin, input generation, comparators (pure, sequence, RNG, buffer, table).
- `specs/` one entry per function (`groupA` direct, `groupB` wrapper, `groupC` scalar state adapters, `groupD` ByteStruct state, `controls`).
- `controls/` known-buggy vs fixed integer semantics used to prove the detector works; `adapter_mutants.mjs` (RNG/buffer) and `struct_mutants.mjs` (layout probe) do the same for the adapters.
- `results/latest.json`, `REPORT.generated.md` generated output; raw build products live in `.decomp-build/oracle/` (ignored).

Adding a function: one spec entry (about 10 lines) naming the C unit, the parameter types, the TS file and
identifier, and, when relevant, realistic ranges with evidence, a `setup` for data, or `dataChecks` for tables.

## ByteStruct adapter (group D)

For a function whose state is a C struct global mirrored by a binary-compatible TS `ByteStruct`
(`src/fr/generated/structs.ts`): the initial state is written as **raw bytes** to the C global (defined by an appended
`struct X gName[N];`, or `struct X storage; struct X *gName` plus an appended init function for pointer globals) and to
the TS instances, both sides run, and **all struct bytes** are compared afterwards. A mismatch names the element, byte
offset, member, and the C and TS bytes. Before any call the layout is checked: `sizeof` and every member's bit range from
`clang -fdump-record-layouts-complete` against a poke of every TS setter/array view. A layout difference is reported, not adapted.

A new struct is one descriptor line in the spec (`{ name, ctype, structName, count, pointer?, tsFile, tsClassFile }`).
States tried: zero, all ones, walking single bit, dense and sparse random bytes; the realistic domain additionally zeroes
C padding bytes (assumed: never written).

## Scalar globals (group E)

A scalar C global is one descriptor in the spec (`{ name, type, ts: { file, expr }, realistic, structural?, typeCap? }`; small
arrays add `count` and use `ts: { file, name }`). The harness defines it in the C unit (`u8 gName;`), writes the same value to
the C memory and to the TS side (an accessor appended by the bundle), runs both, and compares every global afterwards:

```text
Global mismatch: gLastUsedAbility  initial: 181  C after: 1  TS after: 0
```

`typeCap` limits the type domain when the full range would make the C code write outside its own arrays (memory-corrupting UB).
Note that many TS battle globals are plain JS properties (`G.gActiveBattler`), which do not truncate to the C width; RAM-backed
ones (`defineScalars`) do.

## INT gate (generator vs C/wasm)

`specs/controls.mjs` (46 C functions in `controls/controls.c`) and `specs/generatedReal.mjs` (16 real pokefirered functions) compare three
TypeScript variants with the C/wasm reference: the generator **before** the INT work (frozen in `baseline/clang_codegen_before_int.py`,
never edited), the **current** `tools/decomp` generator, and (for the ten original controls) hand-fixed TS. `expect` pins only the
current generator: it must reach `MATCH_OBSERVED`, except division/modulo controls, which may differ only in `c-trap` clusters
(wasm traps on `b == 0` and `INT_MIN / -1`). Run `node tools/oracle/run.mjs --group controls,real`; the three-way table is in
`REPORT.generated.md`. `baseline/stringUtil.before_int.ts` is the previous `src/fr/generated/stringUtil.ts`, kept for diffing.
