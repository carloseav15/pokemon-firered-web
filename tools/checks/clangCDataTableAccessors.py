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
    naming_defs = json.loads((ROOT / "public/fr/cdata/naming_screen.json").read_text())["defs"]
    cdata = naming_defs["sPageToNextGfxId"]["value"]
    extra_names = {"CurrentPageToNextKeyboardId", "CurrentPageToKeyboardId", "GetTextEntryPosition", "GetPreviousTextCaretPosition"}
    ast_funcs = clang_ast.extract_functions(naming_ast, extra_names)
    current_bodies = []
    for name in sorted(extra_names):
        function = ast_funcs[name]
        start = function.raw_node["range"]["begin"]["offset"]
        end = function.raw_node["range"]["end"]["offset"] + function.raw_node["range"]["end"]["tokLen"]
        current_bodies.append((name, page_body[start:end]))
    next_keyboard = naming_defs["sPageToNextKeyboardId"]["value"]
    keyboard = naming_defs["sPageToKeyboardId"]["value"]
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
static const u8 sPageToNextKeyboardId[3] = {{{", ".join(map(str, next_keyboard))}}};
static const u8 sPageToKeyboardId[3] = {{{", ".join(map(str, keyboard))}}};
typedef int8_t s8;
struct NamingTemplate {{ u8 maxChars; }};
struct NamingScreenData {{ u8 currentPage; struct NamingTemplate *template; u8 textBuffer[10]; }};
static struct NamingScreenData namingScreen;
static struct NamingTemplate namingTemplate;
static struct NamingScreenData *sNamingScreen = &namingScreen;
{body}
{chr(10).join(item[1] for item in current_bodies)}
int main(void)
{{
{cases}
    for (u8 page = 0; page < 3; page++) {{
        sNamingScreen->currentPage = page;
        printf("N %u %u\\n", (unsigned)CurrentPageToNextKeyboardId(), (unsigned)CurrentPageToKeyboardId());
    }}
    for (u8 maxChars = 1; maxChars <= 10; maxChars++) {{
        namingTemplate.maxChars = maxChars;
        sNamingScreen->template = &namingTemplate;
        for (unsigned mask = 0; mask < (1u << maxChars); mask++) {{
            for (u8 i = 0; i < 10; i++) sNamingScreen->textBuffer[i] = (i < maxChars && (mask & (1u << i))) ? 65 : 255;
            printf("T %u %u %u %u\\n", maxChars, mask, (unsigned)GetTextEntryPosition(), (unsigned)GetPreviousTextCaretPosition());
        }}
    }}
    return 0;
}}
'''
    build_dir = ROOT / ".decomp-build" / "checks"
    build_dir.mkdir(parents=True, exist_ok=True)
    c_file = build_dir / "pageToNextGfxId.c"
    binary = build_dir / "pageToNextGfxId"
    c_file.write_text(source)
    subprocess.run(["clang", "-std=c11", "-Wall", "-Werror", str(c_file), "-o", str(binary)], check=True)
    lines = subprocess.run([str(binary)], check=True, capture_output=True, text=True).stdout.splitlines()
    gfx_actual = [int(value) for value in lines[:len(calls)]]
    page_line_start = len(calls)
    keyboard_actual = [[int(x) for x in line.split()[1:]] for line in lines[page_line_start:page_line_start + 3]]
    caret_cases = [[int(x) for x in line.split()[1:]] for line in lines[page_line_start + 3:]]
    (build_dir / "pageToNextGfxIdResults.json").write_text(json.dumps({
        "cases": calls, "expected": gfx_actual,
        "currentPageMappings": keyboard_actual,
        "caretCases": caret_cases,
    }))
    print(f"Clang naming accessors: deterministic generation, unsupported-AST rejection, three C keyboard-page mappings, and {len(caret_cases)} C caret cases passed")


if __name__ == "__main__":
    main()
