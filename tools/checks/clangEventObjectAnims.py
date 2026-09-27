"""Check deterministic Clang generation and fail-closed AST handling."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "decomp"))

import clang_ast  # noqa: E402
import clang_codegen  # noqa: E402


def check_copy_direction_against_c(ast: dict) -> None:
    """Compile the exact preprocessed C helper bodies for defined direction inputs."""
    c_path = clang_ast.DECOMP / "src" / "event_object_movement.c"
    preprocessed = clang_ast.preprocess_c_file(c_path).read_text()
    funcs = clang_ast.extract_functions(ast, {"GetPlayerDirectionForCopy", "GetCopyDirection"})
    c_bodies: list[str] = []
    for name in ("GetPlayerDirectionForCopy", "GetCopyDirection"):
        node = funcs[name].raw_node
        start = node["range"]["begin"]["offset"]
        end = node["range"]["end"]["offset"] + node["range"]["end"]["tokLen"]
        c_bodies.append(preprocessed[start:end])

    defs = json.loads((ROOT / "public/fr/cdata/event_object_movement.json").read_text())["defs"]
    none_value = clang_codegen._event_object_copy_direction(funcs["GetCopyDirection"])[1]
    east_value = clang_codegen._event_object_copy_direction(funcs["GetCopyDirection"])[2]

    def table(name: str) -> str:
        rows = defs[name]["value"]
        return "{" + ",".join("{" + ",".join(str(v) for v in row) + "}" for row in rows) + "}"

    cases = [
        [copy_dir, init_dir, move_dir]
        for copy_dir in range(1, 5)
        for init_dir in range(1, 5)
        for move_dir in range(1, 5)
    ]
    cases += [[copy_dir + 0x100, init_dir + 0x100, move_dir + 0x100] for copy_dir, init_dir, move_dir in cases[:64]]
    for invalid in (0, 5, 0x100, 0x105):
        cases.extend(([1, invalid, 1], [1, 1, invalid]))
    cases += [[1 + 0x100, 1 + 0x100, 2 + 0x100]]
    main = "\n".join(
        f'    printf("%u\\n", (unsigned)GetCopyDirection({a}u, {b}u, {c}u));'
        for a, b, c in cases
    )
    source = f'''#include <stdint.h>
#include <stdio.h>
typedef uint8_t u8;
typedef uint32_t u32;
_Static_assert(sizeof(u8) == 1, "u8 width");
_Static_assert(sizeof(u32) == 4, "u32 width");
#define DIR_NONE {none_value}
#define DIR_EAST {east_value}
static const u8 sPlayerDirectionsForCopy[4][4] = {table("sPlayerDirectionsForCopy")};
static const u8 sPlayerDirectionToCopyDirection[4][4] = {table("sPlayerDirectionToCopyDirection")};
{c_bodies[0]}
{c_bodies[1]}
int main(void)
{{
{main}
    return 0;
}}
'''
    build_dir = ROOT / ".decomp-build" / "checks"
    build_dir.mkdir(parents=True, exist_ok=True)
    c_file = build_dir / "copyDirection.c"
    binary = build_dir / "copyDirection"
    c_file.write_text(source)
    subprocess.run(["clang", "-std=c11", "-Wall", "-Werror", "-Wno-constant-conversion", str(c_file), "-o", str(binary)], check=True)
    result = subprocess.run([str(binary)], check=True, capture_output=True, text=True)
    actual = [int(line) for line in result.stdout.splitlines()]
    if len(actual) != len(cases):
        raise AssertionError(f"C copy-direction harness returned {len(actual)} rows for {len(cases)} cases")
    output = {"cases": cases, "expected": actual}
    (build_dir / "copyDirectionResults.json").write_text(json.dumps(output))


def check_elevation_helpers_against_c(ast: dict) -> None:
    """Compile the exact C helper bodies and exhaust their u8 input domains."""
    c_path = clang_ast.DECOMP / "src" / "event_object_movement.c"
    preprocessed = clang_ast.preprocess_c_file(c_path).read_text()
    funcs = clang_ast.extract_functions(ast, {"IsElevationMismatchAt", "AreElevationsCompatible"})
    bodies: list[str] = []
    for name in ("IsElevationMismatchAt", "AreElevationsCompatible"):
        node = funcs[name].raw_node
        start = node["range"]["begin"]["offset"]
        end = node["range"]["end"]["offset"] + node["range"]["end"]["tokLen"]
        bodies.append(preprocessed[start:end])
    source = f'''#include <stdint.h>
#include <stdio.h>
typedef uint8_t u8;
typedef int16_t s16;
typedef uint8_t bool8;
#define TRUE 1
#define FALSE 0
static u8 testMapElevation;
static u8 MapGridGetElevationAt(s16 x, s16 y) {{ (void)x; (void)y; return testMapElevation; }}
{bodies[0]}
{bodies[1]}
int main(void)
{{
    unsigned a, b;
    for (a = 0; a < 256; a++)
        for (testMapElevation = 0; testMapElevation < 16; testMapElevation++)
            printf("%u", (unsigned)IsElevationMismatchAt((u8)a, 0, 0));
    for (a = 0; a < 256; a++)
        for (b = 0; b < 256; b++)
            printf("%u", (unsigned)AreElevationsCompatible((u8)a, (u8)b));
    return 0;
}}
'''
    build_dir = ROOT / ".decomp-build" / "checks"
    build_dir.mkdir(parents=True, exist_ok=True)
    c_file = build_dir / "eventObjectElevation.c"
    binary = build_dir / "eventObjectElevation"
    c_file.write_text(source)
    subprocess.run(["clang", "-std=c11", "-Wall", "-Werror", str(c_file), "-o", str(binary)], check=True)
    result = subprocess.run([str(binary)], check=True, capture_output=True, text=True)
    values = result.stdout.strip()
    expected_count = 256 * 16 + 256 * 256
    if len(values) != expected_count or any(value not in "01" for value in values):
        raise AssertionError(f"C elevation harness returned {len(values)} values; expected {expected_count} booleans")
    output = {
        "mismatch": [int(value) for value in values[:256 * 16]],
        "compatible": [int(value) for value in values[256 * 16:]],
    }
    (build_dir / "eventObjectElevationResults.json").write_text(json.dumps(output))


def check_freeze_helpers_against_c(ast: dict) -> None:
    """Run exact C freeze/unfreeze bodies with explicitly sized state fields."""
    c_path = clang_ast.DECOMP / "src" / "event_object_movement.c"
    preprocessed = clang_ast.preprocess_c_file(c_path).read_text()
    names = (
        "FreezeObjectEvent",
        "FreezeObjectEvents",
        "FreezeObjectEventsExceptOne",
        "UnfreezeObjectEvent",
        "UnfreezeObjectEvents",
    )
    funcs = clang_ast.extract_functions(ast, set(names))
    bodies: list[str] = []
    for name in names:
        node = funcs[name].raw_node
        start = node["range"]["begin"]["offset"]
        end = node["range"]["end"]["offset"] + node["range"]["end"]["tokLen"]
        bodies.append(preprocessed[start:end])
    source = f'''#include <stdint.h>
#include <stdio.h>
typedef uint8_t u8;
typedef uint8_t bool8;
#define TRUE 1
#define FALSE 0
#define OBJECT_EVENTS_COUNT 16
_Static_assert(sizeof(u8) == 1, "u8 width");
struct Sprite {{ bool8 animPaused; bool8 affineAnimPaused; }};
struct ObjectEvent {{ bool8 heldMovementActive; bool8 frozen; u8 spriteId; bool8 spriteAnimPausedBackup; bool8 spriteAffineAnimPausedBackup; bool8 active; }};
struct PlayerAvatar {{ u8 objectEventId; }};
static struct Sprite gSprites[OBJECT_EVENTS_COUNT];
static struct ObjectEvent gObjectEvents[OBJECT_EVENTS_COUNT];
static struct PlayerAvatar gPlayerAvatar;
{''.join(body + chr(10) for body in bodies)}
static void setup(void)
{{
    unsigned i;
    gPlayerAvatar.objectEventId = 0;
    for (i = 0; i < OBJECT_EVENTS_COUNT; i++)
    {{
        gSprites[i].animPaused = (i & 1) != 0;
        gSprites[i].affineAnimPaused = (i & 2) != 0;
        gObjectEvents[i].heldMovementActive = FALSE;
        gObjectEvents[i].frozen = FALSE;
        gObjectEvents[i].spriteId = (u8)i;
        gObjectEvents[i].spriteAnimPausedBackup = FALSE;
        gObjectEvents[i].spriteAffineAnimPausedBackup = FALSE;
        gObjectEvents[i].active = i < 5;
    }}
}}
static void print_state(void)
{{
    unsigned i;
    for (i = 0; i < OBJECT_EVENTS_COUNT; i++)
        printf("%u,%u,%u,%u,%u,%u,%u,%u,", (unsigned)gObjectEvents[i].active, (unsigned)gObjectEvents[i].heldMovementActive,
            (unsigned)gObjectEvents[i].frozen, (unsigned)gObjectEvents[i].spriteId, (unsigned)gObjectEvents[i].spriteAnimPausedBackup,
            (unsigned)gObjectEvents[i].spriteAffineAnimPausedBackup, (unsigned)gSprites[i].animPaused, (unsigned)gSprites[i].affineAnimPaused);
    printf("\\n");
}}
int main(void)
{{
    bool8 result1, result2, result3;
    setup();
    gObjectEvents[1].heldMovementActive = TRUE;
    result1 = FreezeObjectEvent(&gObjectEvents[1]);
    result2 = FreezeObjectEvent(&gObjectEvents[2]);
    result3 = FreezeObjectEvent(&gObjectEvents[2]);
    printf("%u,%u,%u\\n", (unsigned)result1, (unsigned)result2, (unsigned)result3);
    print_state();
    setup();
    gObjectEvents[2].heldMovementActive = TRUE;
    gObjectEvents[3].active = FALSE;
    FreezeObjectEvents();
    print_state();
    setup();
    FreezeObjectEventsExceptOne(4);
    print_state();
    setup();
    gObjectEvents[1].frozen = TRUE;
    gObjectEvents[1].spriteAnimPausedBackup = TRUE;
    gObjectEvents[1].spriteAffineAnimPausedBackup = FALSE;
    gSprites[1].animPaused = TRUE;
    gSprites[1].affineAnimPaused = TRUE;
    gObjectEvents[2].active = FALSE;
    gObjectEvents[2].frozen = TRUE;
    UnfreezeObjectEvent(&gObjectEvents[2]);
    UnfreezeObjectEvent(&gObjectEvents[1]);
    print_state();
    setup();
    gObjectEvents[1].frozen = TRUE;
    gObjectEvents[1].spriteAnimPausedBackup = TRUE;
    gObjectEvents[1].spriteAffineAnimPausedBackup = TRUE;
    gObjectEvents[2].frozen = TRUE;
    gObjectEvents[2].spriteAnimPausedBackup = FALSE;
    gObjectEvents[2].spriteAffineAnimPausedBackup = TRUE;
    gObjectEvents[3].active = FALSE;
    gObjectEvents[3].frozen = TRUE;
    UnfreezeObjectEvents();
    print_state();
    return 0;
}}
'''
    build_dir = ROOT / ".decomp-build" / "checks"
    build_dir.mkdir(parents=True, exist_ok=True)
    c_file = build_dir / "eventObjectFreeze.c"
    binary = build_dir / "eventObjectFreeze"
    c_file.write_text(source)
    subprocess.run(["clang", "-std=c11", "-Wall", "-Werror", str(c_file), "-o", str(binary)], check=True)
    result = subprocess.run([str(binary)], check=True, capture_output=True, text=True)
    lines = [line.rstrip(",") for line in result.stdout.splitlines()]
    if len(lines) != 6 or any(not value.isdigit() for line in lines for value in line.split(",")):
        raise AssertionError("C object freeze harness returned malformed output")
    output = {"directResults": [int(value) for value in lines[0].split(",")], "states": [[int(value) for value in line.split(",")] for line in lines[1:]]}
    if len(output["directResults"]) != 3 or any(len(state) != 16 * 8 for state in output["states"]):
        raise AssertionError("C object freeze harness returned the wrong state shape")
    (build_dir / "eventObjectFreezeResults.json").write_text(json.dumps(output))


def main() -> None:
    generated_a = clang_codegen.generate_event_object_anims_ts()
    generated_b = clang_codegen.generate_event_object_anims_ts()
    assert generated_a == generated_b, "event object lookup generation must be deterministic"
    assert "export function GetJumpY(i: number, type: number)" in generated_a
    assert "export function GetPlayerDirectionForCopy(initDir: number, moveDir: number)" in generated_a
    assert "export function GetCopyDirection(copyInitDir: number, playerInitDir: number, playerMoveDir: number)" in generated_a

    c_path = clang_ast.DECOMP / "src" / "event_object_movement.c"
    ast = clang_ast.dump_clang_ast_json(c_path)
    check_copy_direction_against_c(ast)
    check_elevation_helpers_against_c(ast)
    check_freeze_helpers_against_c(ast)
    func = clang_ast.extract_functions(ast, {"GetJumpY"})["GetJumpY"]
    unsupported = copy.deepcopy(func)
    unsupported.body["inner"] = [{"kind": "ReturnStmt", "inner": [{"kind": "IntegerLiteral", "value": "0"}]}]
    try:
        clang_codegen._event_object_jump_y(unsupported)
    except clang_codegen.UnsupportedAstError as exc:
        assert "expected nested table lookup" in str(exc)
    else:
        raise AssertionError("literal-return AST must be rejected, not translated as a jump table lookup")

    copy_func = clang_ast.extract_functions(ast, {"GetPlayerDirectionForCopy"})["GetPlayerDirectionForCopy"]
    unsupported = copy.deepcopy(copy_func)
    unsupported.body["inner"] = [{"kind": "ReturnStmt", "inner": [{"kind": "IntegerLiteral", "value": "0"}]}]
    try:
        clang_codegen._event_object_player_direction_copy(unsupported)
    except clang_codegen.UnsupportedAstError as exc:
        assert "expected nested direction table lookup" in str(exc)
    else:
        raise AssertionError("literal-return AST must be rejected, not translated as a direction table lookup")

    copy_direction = clang_ast.extract_functions(ast, {"GetCopyDirection"})["GetCopyDirection"]
    unsupported = copy.deepcopy(copy_direction)
    unsupported.body["inner"] = [{"kind": "ReturnStmt", "inner": [{"kind": "IntegerLiteral", "value": "0"}]}]
    try:
        clang_codegen._event_object_copy_direction(unsupported)
    except clang_codegen.UnsupportedAstError as exc:
        assert "expected declarations, guard, helper assignment, and table return" in str(exc)
    else:
        raise AssertionError("trivial AST must be rejected, not translated as GetCopyDirection")
    print("Clang event object lookups: deterministic output, unsupported-AST rejection, and C harness passed")


if __name__ == "__main__":
    main()
