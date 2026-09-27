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
