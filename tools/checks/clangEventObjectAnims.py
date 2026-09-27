"""Check deterministic Clang generation and fail-closed AST handling."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "decomp"))

import clang_ast  # noqa: E402
import clang_codegen  # noqa: E402


def main() -> None:
    generated_a = clang_codegen.generate_event_object_anims_ts()
    generated_b = clang_codegen.generate_event_object_anims_ts()
    assert generated_a == generated_b, "event object lookup generation must be deterministic"
    assert "export function GetJumpY(i: number, type: number)" in generated_a

    c_path = clang_ast.DECOMP / "src" / "event_object_movement.c"
    ast = clang_ast.dump_clang_ast_json(c_path)
    func = clang_ast.extract_functions(ast, {"GetJumpY"})["GetJumpY"]
    unsupported = copy.deepcopy(func)
    unsupported.body["inner"] = [{"kind": "ReturnStmt", "inner": [{"kind": "IntegerLiteral", "value": "0"}]}]
    try:
        clang_codegen._event_object_jump_y(unsupported)
    except clang_codegen.UnsupportedAstError as exc:
        assert "expected nested table lookup" in str(exc)
    else:
        raise AssertionError("literal-return AST must be rejected, not translated as a jump table lookup")
    print("Clang event object lookups: deterministic generation and unsupported-AST rejection passed")


if __name__ == "__main__":
    main()
