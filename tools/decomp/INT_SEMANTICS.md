# INT: type-directed C integer semantics in `clang_codegen.py`

Implemented in [clang_intsem.py](clang_intsem.py) (pure helpers) and the `_ix*` methods of `ClangTsEmitter`
([clang_codegen.py](clang_codegen.py)). No IR: the Clang AST already carries everything needed.

## What the AST gives us (verified on real dumps)

| Need | Where Clang puts it |
|---|---|
| type of any expression | `node.type.qualType` (`u8`) and `node.type.desugaredQualType` (`unsigned char`); typedef names such as `u8/s16/bool8` desugar to the C type |
| integer promotion / usual arithmetic conversion | explicit `ImplicitCastExpr castKind=IntegralCast` around operands; the `BinaryOperator` itself has the promoted type (`int`, `unsigned int`) |
| assignment `x = e` | RHS is wrapped in an `ImplicitCastExpr <IntegralCast>` to the destination type |
| initialiser `u8 q = e` | same: cast inside the `VarDecl` |
| `return e` | cast to the function return type inside the `ReturnStmt` |
| call argument | cast to the parameter type inside the `CallExpr` (one per argument) |
| explicit `(s8)x` | `CStyleCastExpr castKind=IntegralCast` with the destination type |
| compound `x op= e` | `CompoundAssignOperator`, type = type of `x`, plus `computeLHSType` / `computeResultType` |
| `++` / `--` | `UnaryOperator opcode=++/--`, `isPostfix`, type = type of the operand |
| comparisons, `!`, `&&`, `\|\|` | type `int` (0 or 1); operands already converted to a common type |
| `?:` | `ConditionalOperator` typed with the common type, branches cast to it |
| integer literal | `IntegerLiteral.value` with its own type (`int`, `unsigned int`) |
| enum constant | `DeclRefExpr` to `EnumConstantDecl` typed `int`; its value is on the `EnumDecl` (found anywhere, including function-local anonymous enums) |
| `static` local | `VarDecl storageClass=static` inside the body |

So every conversion point is an explicit cast node. The generator only has to give the cast nodes their meaning.

## Design

Each integer expression is translated to `Ix(code, precedence, C type, lo, hi)` where `[lo, hi]` is the exact interval of
the JS number the code produces.

* **Conversion (`convert`)**: nothing is emitted when the interval already fits the destination type. Otherwise
  `u8/u16`: `x & 0xff/0xffff`; `s8/s16`: `(x << 24) >> 24` / `(x << 16) >> 16`; `s32`: `x | 0`; `u32`: `x >>> 0`.
  Constants are folded (`(u16)-1` becomes `65535`).
* **Promotions**: not re-implemented. A `u8` variable has interval `[0, 255]`; Clang casts it to `int`, which fits, so `a + b`
  on two `u8` values is emitted as `a + b` and only the assignment/return/argument cast truncates.
* **Lazy 32-bit wrap**: `+ - & | ^ << ~` and unary `-` are congruent modulo 2^32 with the C result, so chains stay
  "pending" (interval wider than the type) and are normalised once, where a consumer needs it (a conversion, comparison, division,
  call argument, condition, array index...). JS numbers are exact below 2^53, so this is safe.
* **Multiplication**: plain `a * b` when the product interval fits the C type (for example `s16 * s16`), `Math.imul(a, b)` otherwise
  (and `>>> 0` when a normalised unsigned result is needed).
* **Shifts**: `<<` and `>>` for signed types, `>>>` for unsigned right shifts (works on pending operands: `ToUint32`).
* **Division / modulo**: operands are normalised first, `Math.trunc(a / b)` (toward zero) and `%` (sign of the dividend, as in C).
  Division by zero and `INT_MIN / -1` are not defined here; the oracle labels them.
* **Compound assignment / ++ / --**: `x = convert(op(convert(x, computeLHSType), rhs, computeResultType), type of x)`;
  postfix in value context is `(x = new, old)`.
* **Comparisons / `!` / `&&` / `||` / `?:`**: JS booleans internally, `cond ? 1 : 0` only where a C `int` is needed.
* **`static` locals** (non-const): module-level `let <function>_<name>`, initialised once.
* **64-bit integers**: rejected explicitly (`long long`), instead of being silently emitted as doubles.

## TERNARY is not INT

`?:` was added alongside INT because it blocked real functions and is small. It is a separate feature and is counted separately:

```text
INT      fidelity: 4,430 already-accepted functions change output substantively (870 more only in parentheses)
TERNARY  coverage: +92 accepted functions (every one of them was rejected only for "ConditionalOperator")
```

Do not attribute the +92 to INT.

## `long long` is rejected on purpose

64-bit integers used to be emitted as JS doubles, which is wrong beyond 2^53 and for wrapping. They are now rejected with
"64-bit integer arithmetic is not supported" (8 functions, none pending in the main goal):

| Function | Use | State |
|---|---|---|
| `link.c: DoHandshake`, `DoRecv` | `*(u64 *)recv = REG_SIOMLT_RECV` (serial register copy) | link, out of the main goal, no TS |
| `ereader_helpers.c: EReaderHelper_SerialCallback`, `ereader_screen.c: ValidateEReaderConnection` | same 64-bit register/buffer copies | link, no TS |
| `math_util.c: Q_24_8_mul`, `Q_24_8_div`, `Q_24_8_inv` | `s64` intermediate of a fixed-point operation | already hand-ported in TS (name match) |
| `pokemon_size_record.c: GetMonSize` | `u64` locals for a size comparison | already hand-ported in TS (name match) |

Nothing pending is affected. The three `Q_24_8_*` ports are candidates for a future oracle check (their 64-bit intermediate is exactly what a 32-bit-only review misses).

## Regression kept: GetReceivedValueInPixels

The generator reproduces, without help, the three semantics the oracle found in the hand port
(`tools/oracle/controls/check_generated_patterns.mjs` asserts them on the generated text; `--group real` compares generated, hand port and C/wasm):

```ts
totalPixels = (totalPixels * 8) & 0xff;                                        // u8 truncation
newVal = (oldValue - receivedValue) | 0;                                       // s32 difference
oldToMax = (Math.trunc(Math.imul(oldValue, totalPixels) / maxValue) << 24) >> 24;  // 32-bit product, s8 store
```

## Callers written by hand

Generated functions assume normalised parameters (see Assumptions). Only `generated/stringUtil.ts` is produced by this path today.
Static scan of `src/fr`: the generated entry points are reached through `gba/charmap.ts` (9 direct call sites, 3 with narrow arguments, all
inside `charmap.ts` wrappers) and, mostly, through `intToDecimal` (114 call sites in 27 files: `digits` is a literal 1..10 in 106, a literal
outside that range in 1, an expression in 7; `value` is a game quantity). No call site was found that can pass a value outside the C range,
but nothing enforces it: a future hand-written caller can pass 300 to a `u8` parameter.

## Readability limits (not optimised, fidelity first)

* Postfix `++`/`--` used as a value on a narrow variable prints `(d = (d + 1) & 0xffff, (d - 1) & 0xffff)`: 161 occurrences in 86 of 9,418
  accepted functions. Hoisting it to a preceding statement is unsafe without ordering analysis.
* A `u32:1` bitfield read is typed `unsigned int` and is normalised with `| 0` when promoted to `int`. Using the field width as the interval would remove
  it, but needs the FieldDecl (not done).
* 622 accepted functions have a line longer than 160 characters (mostly long `||` chains).

## Fail-closed audit ([clang_support.py](clang_support.py))

`ClangTsEmitter.emit_function` first runs `clang_support.audit`, a structural walk over the Clang AST (node kinds, types, cast
kinds; never text). Anything outside the modeled subset is rejected with a code `UNSUPPORTED_*`; no support was added.
"Supported" means *every construct is inside the model*, not that the output is proven equivalent.

Modeled subset: INT expressions; byte (`u8`/`char`) pointer cursors passed as `(buffer, offset)`; the `gStringVar*`,
`gSaveBlock1/2Ptr.{playerName,playerGender,rivalName}` and `gExpandedPlaceholder_*` symbols; const scalar arrays with a full
initialiser; a local table of function references with an indirect call; `sizeof(a)/sizeof(*a)`; scalar globals by name;
calls to functions generated under the same convention.

Rejected (primary code by priority): ASM, GOTO, HARDWARE_ACCESS, LONG_LONG, FLOAT, UNION, STRUCT_VALUE, STRUCT_ACCESS,
STRUCT_POINTER, ADDRESS_OF_{LOCAL,MEMBER,ELEMENT,GLOBAL}, POINTER_{INTEGER_CAST,CAST,ARITHMETIC,COMPARE,NULL,ASSIGN,RETURN,MODEL,
TO_POINTER,DEREFERENCE}, WIDE_POINTER, VOID_POINTER, CALL_POINTER_ARGS, INDIRECT_CALL (incl. function-pointer parameters and
returns), VARARGS, LOCAL_ARRAY (no or partial initialiser), MULTIDIM_ARRAY, SIZEOF, STATEMENT(_EXPRESSION), FUNCTION_TABLE.

Defects found by sampling the "supported" set and closed here: function-pointer parameters treated as byte cursors; pointer
locals initialised from a call or a table element (the offset was lost); global pointer variables incremented as cursors
(`sBattleAnimScriptPtr++`); partially initialised local arrays (`= {0}` emitted as `[]`); pointer returns other than a global
array or a cursor.

Measured on the 11,991 C functions (see the delivery report for the table): SUPPORTED 2,124; 0 functions are supported that the
pre-fail-closed generator rejected. Regressions kept passing: `check:string-util`, `check:event-object-anims`,
`check:cdata-table-accessors`, `check:incbin-row-accessors`, oracle `--group controls,real`.

## Known unrelated failure

`npm run check:honesty` reports unpushed commit `9ecc74f` ("complete" in its message body). It predates this work and is not touched.

## Assumptions

* Function parameters arrive normalised (the C ABI does this at the call site; generated callers do it through the argument casts).
* Enum-typed variables are treated as `unsigned int` (Clang's underlying type for enums without negative constants).
