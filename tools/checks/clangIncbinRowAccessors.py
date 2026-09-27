"""Check deterministic generation and C parity for INCBIN row accessors."""

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
    output_a = clang_codegen.generate_incbin_row_pointer_accessors_ts()
    output_b = clang_codegen.generate_incbin_row_pointer_accessors_ts()
    assert output_a == output_b, "INCBIN row accessor generation must be deterministic"
    assert "GetBattleInterfaceGfxPtr" in output_a and "* 32" in output_a

    c_path = clang_ast.DECOMP / "src" / "battle_interface.c"
    ast = clang_ast.dump_clang_ast_json(c_path)
    func = clang_ast.extract_functions(ast, {"GetBattleInterfaceGfxPtr"})["GetBattleInterfaceGfxPtr"]
    unsupported = copy.deepcopy(func)
    lookup = unsupported.body["inner"][0]["inner"][0]
    lookup["inner"][0]["inner"][0]["inner"][0]["referencedDecl"]["name"] = "gOtherGraphics"
    try:
        clang_codegen._incbin_row_pointer_accessor(unsupported, "battle_interface.c", "gBattleInterface_Gfx")
    except clang_codegen.UnsupportedAstError as exc:
        assert "expected INCBIN symbol gBattleInterface_Gfx" in str(exc)
    else:
        raise AssertionError("wrong INCBIN table AST must be rejected")

    preprocessed = clang_ast.preprocess_c_file(c_path).read_text()
    node = func.raw_node
    start = node["range"]["begin"]["offset"]
    end = node["range"]["end"]["offset"] + node["range"]["end"]["tokLen"]
    body = preprocessed[start:end]
    index = json.loads((ROOT / "public/fr/incbin/index.json").read_text())
    _pack, _offset, byte_size = index["symbols"]["gBattleInterface_Gfx"]
    row_size = 32
    assert byte_size % row_size == 0
    row_count = byte_size // row_size
    inputs = list(range(row_count)) + [0x100, 0x101, 0x102]
    calls = "\n".join(
        f'    {{ unsigned input = {value}u; u8 row = (u8)input; printf("%u\\n", '
        f'(unsigned)(GetBattleInterfaceGfxPtr(input) == &gBattleInterface_Gfx[row][0])); }}'
        for value in inputs
    )
    source = f'''#include <stdint.h>
#include <stdio.h>
typedef uint8_t u8;
_Static_assert(sizeof(u8) == 1, "u8 width");
static const u8 gBattleInterface_Gfx[{row_count}][{row_size}] = {{{{0}}}};
_Static_assert(sizeof(gBattleInterface_Gfx[0]) == {row_size}, "row width");
{body}
int main(void)
{{
{calls}
    return 0;
}}
'''
    build_dir = ROOT / ".decomp-build" / "checks"
    build_dir.mkdir(parents=True, exist_ok=True)
    c_file = build_dir / "battleInterfaceGfxPtr.c"
    binary = build_dir / "battleInterfaceGfxPtr"
    c_file.write_text(source)
    subprocess.run(["clang", "-std=c11", "-Wall", "-Werror", str(c_file), "-o", str(binary)], check=True)
    actual = [int(line) for line in subprocess.run([str(binary)], check=True, capture_output=True, text=True).stdout.splitlines()]
    if actual != [1] * len(inputs):
        raise AssertionError("C GetBattleInterfaceGfxPtr did not return the selected row start")
    (build_dir / "battleInterfaceGfxPtrResults.json").write_text(json.dumps({"inputs": inputs, "rowSize": row_size}))
    print(f"Clang INCBIN row accessor: deterministic output, wrong-symbol rejection, and {len(inputs)} exact-C row pointer cases passed")


if __name__ == "__main__":
    main()
