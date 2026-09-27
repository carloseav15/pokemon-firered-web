"""Check deterministic output and fail-closed handling for table accessors."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "decomp"))

import clang_ast  # noqa: E402
import clang_codegen  # noqa: E402


def main() -> None:
    generated_a = clang_codegen.generate_cdata_table_accessors_ts()
    generated_b = clang_codegen.generate_cdata_table_accessors_ts()
    assert generated_a == generated_b, "table accessor generation must be deterministic"
    assert "FacilityClassToPicIndex" in generated_a

    c_path = clang_ast.DECOMP / "src" / "pokemon.c"
    ast = clang_ast.dump_clang_ast_json(c_path)
    func = clang_ast.extract_functions(ast, {"FacilityClassToPicIndex"})["FacilityClassToPicIndex"]
    unsupported = copy.deepcopy(func)
    unsupported.body["inner"] = [{"kind": "ReturnStmt", "inner": [{"kind": "IntegerLiteral", "value": "0"}]}]
    try:
        clang_codegen._cdata_table_accessor(unsupported, "pokemon.c", "pokemon", "gFacilityClassToPicIndex")
    except clang_codegen.UnsupportedAstError as exc:
        assert "expected direct array lookup" in str(exc)
    else:
        raise AssertionError("literal-return AST must be rejected, not translated as a table accessor")
    print("Clang cdata table accessor: deterministic generation and unsupported-AST rejection passed")


if __name__ == "__main__":
    main()
