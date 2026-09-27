"""Check deterministic output and fail-closed handling for table accessors."""

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


def main() -> None:
    generated_a = clang_codegen.generate_cdata_table_accessors_ts()
    generated_b = clang_codegen.generate_cdata_table_accessors_ts()
    assert generated_a == generated_b, "table accessor generation must be deterministic"
    assert "FacilityClassToPicIndex" in generated_a and "PageToNextGfxId" in generated_a

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

    naming_path = clang_ast.DECOMP / "src" / "naming_screen.c"
    naming_ast = clang_ast.dump_clang_ast_json(naming_path)
    page_func = clang_ast.extract_functions(naming_ast, {"PageToNextGfxId"})["PageToNextGfxId"]
    try:
        clang_codegen._cdata_table_accessor(page_func, "naming_screen.c", "naming_screen", "sPageToNextKeyboardId")
    except clang_codegen.UnsupportedAstError as exc:
        assert "expected table sPageToNextKeyboardId" in str(exc)
    else:
        raise AssertionError("wrong-table AST must be rejected, not translated as a page graphics accessor")

    page_body = clang_ast.preprocess_c_file(naming_path).read_text()
    node = page_func.raw_node
    start = node["range"]["begin"]["offset"]
    end = node["range"]["end"]["offset"] + node["range"]["end"]["tokLen"]
    body = page_body[start:end]
    cdata = json.loads((ROOT / "public/fr/cdata/naming_screen.json").read_text())["defs"]["sPageToNextGfxId"]["value"]
    calls = list(range(3)) + [0x100, 0x101, 0x102]
    cases = "\n".join(
        f'    {{ unsigned input = {value}u; printf("%u\\n", (unsigned)PageToNextGfxId(input)); }}'
        for value in calls
    )
    source = f'''#include <stdint.h>
#include <stdio.h>
typedef uint8_t u8;
_Static_assert(sizeof(u8) == 1, "u8 width");
static const u8 sPageToNextGfxId[3] = {{{", ".join(map(str, cdata))}}};
{body}
int main(void)
{{
{cases}
    return 0;
}}
'''
    build_dir = ROOT / ".decomp-build" / "checks"
    build_dir.mkdir(parents=True, exist_ok=True)
    c_file = build_dir / "pageToNextGfxId.c"
    binary = build_dir / "pageToNextGfxId"
    c_file.write_text(source)
    subprocess.run(["clang", "-std=c11", "-Wall", "-Werror", str(c_file), "-o", str(binary)], check=True)
    actual = [int(value) for value in subprocess.run([str(binary)], check=True, capture_output=True, text=True).stdout.splitlines()]
    (build_dir / "pageToNextGfxIdResults.json").write_text(json.dumps({"cases": calls, "expected": actual}))
    print("Clang cdata table accessors: deterministic generation, unsupported-AST rejection, and PageToNextGfxId C harness passed")


if __name__ == "__main__":
    main()
