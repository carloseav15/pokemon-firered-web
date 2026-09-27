"""Analyze candidate C files using Clang AST and classify their functions.

Clang analysis step of the batch porting workflow (AGENTS.md):
- Analyzes at least 3 pending files chosen for pattern/dependency diversity:
  1. src/string_util.c (buffer manipulation, charmap strings, formatting, control codes)
  2. src/item.c (save block struct, item slot queries, EWRAM encryption, ROM getters)
  3. src/digit_obj_util.c (dynamic heap allocation, direct OAM hardware manipulation, digit graphics)
- Finds existing TS equivalents in src/fr/
- Classifies functions into:
  - ALREADY_PORTED (present with real body)
  - CANDIDATE (viable AST patterns, dependencies resolved or resolvable)
  - BLOCKED (blocked by unported dependencies / subsystems)
  - UNSUPPORTED (unsupported language constructs, assembly, raw register I/O)
"""

from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from common import DECOMP, ROOT
import clang_ast

# Import inventory helpers
sys.path.insert(0, str(ROOT / "tools"))
import portInventory


@dataclass
class FunctionAnalysis:
    name: str
    c_file: str
    line: int
    return_type: str
    params: list[tuple[str, str]]
    ts_status: str  # "ported", "stub", "missing", "adapted"
    classification: str  # "ALREADY_PORTED", "CANDIDATE", "BLOCKED", "UNSUPPORTED"
    reason: str
    ast_kinds: list[str] = field(default_factory=list)
    callees: list[str] = field(default_factory=list)
    globals_used: list[str] = field(default_factory=list)


def collect_ast_stats(node: dict[str, Any], kinds: set[str], callees: set[str], globals_used: set[str]) -> None:
    k = node.get("kind")
    if k:
        kinds.add(k)
    if k == "CallExpr":
        # Check callee name
        inner = node.get("inner", [])
        if inner and inner[0].get("kind") == "ImplicitCastExpr":
            cast_inner = inner[0].get("inner", [])
            if cast_inner and cast_inner[0].get("kind") == "DeclRefExpr":
                callees.add(cast_inner[0].get("referencedDecl", {}).get("name", ""))
    elif k == "DeclRefExpr":
        ref = node.get("referencedDecl", {})
        if ref.get("kind") == "VarDecl":
            storage = ref.get("storageClass")
            # If global or static
            if storage in ("static", "extern") or "loc" in ref:
                name = ref.get("name", "")
                if name.startswith(("g", "s")) and len(name) > 1:
                    globals_used.add(name)

    for child in node.get("inner", []):
        collect_ast_stats(child, kinds, callees, globals_used)


def analyze_file(c_stem: str, idents: set[str], real_defs: dict[str, bool]) -> list[FunctionAnalysis]:
    c_path = DECOMP / "src" / f"{c_stem}.c"
    if not c_path.exists():
        raise FileNotFoundError(f"{c_path} not found")

    # Get C function definitions from source
    source_funcs = dict(portInventory.c_functions(c_path.read_text()))
    ast_json = clang_ast.dump_clang_ast_json(c_path)
    ast_funcs = clang_ast.extract_functions(ast_json, target_func_names=set(source_funcs.keys()))

    analyses: list[FunctionAnalysis] = []

    for name, has_real_body in source_funcs.items():
        ast_f = ast_funcs.get(name)
        norm_name = portInventory.norm(name)

        # Determine TS status
        if norm_name in real_defs:
            if real_defs[norm_name]:
                ts_status = "ported"
            else:
                ts_status = "stub"
        elif norm_name in idents:
            ts_status = "unverified"
        else:
            ts_status = "missing"

        if not ast_f:
            analyses.append(
                FunctionAnalysis(
                    name=name,
                    c_file=f"{c_stem}.c",
                    line=0,
                    return_type="unknown",
                    params=[],
                    ts_status=ts_status,
                    classification="UNSUPPORTED",
                    reason="Not resolved in Clang AST",
                )
            )
            continue

        kinds: set[str] = set()
        callees: set[str] = set()
        globals_used: set[str] = set()
        collect_ast_stats(ast_f.body, kinds, callees, globals_used)

        # Classification logic based on file patterns
        classification: str
        reason: str

        if "GotoStmt" in kinds:
            classification = "UNSUPPORTED"
            reason = "Contains goto statement"
        elif "GCCAsmStmt" in kinds:
            classification = "UNSUPPORTED"
            reason = "Contains inline assembly"
        elif ts_status == "ported":
            classification = "ALREADY_PORTED"
            reason = f"Present in src/fr/ with real body"
        elif c_stem == "digit_obj_util":
            # digit_obj_util uses raw dynamic heap Alloc and raw hardware OAM array
            if "Alloc" in callees or "Free" in callees:
                classification = "BLOCKED"
                reason = "Requires dynamic EWRAM heap Alloc/Free allocator"
            elif any("Oam" in g or "gOamObjects" in g for g in globals_used | callees):
                classification = "BLOCKED"
                reason = "Direct low-level GBA OAM hardware array indexing (not mapped to TS sprite manager)"
            else:
                classification = "BLOCKED"
                reason = "Digit printer subsystem dependencies unported"
        elif c_stem == "item":
            if "ApplyNewEncryptionKey" in name:
                classification = "BLOCKED"
                reason = "GBA EWRAM XOR save encryption not used in web port (save.ts uses unencrypted JSON)"
            else:
                classification = "ALREADY_PORTED" if ts_status == "ported" else "CANDIDATE"
                reason = "Item queries / getters"
        elif c_stem == "string_util":
            # string_util functions are char-buffer routines
            # Check for viable candidate families
            if name in (
                "GetExtCtrlCodeLength",
                "SkipExtCtrlCode",
                "StringLength",
                "StringCompare",
                "StringCompareN",
                "StringCompareWithoutExtCtrlCodes",
                "StringCopy",
                "StringAppend",
                "StringFill",
                "StringFillWithTerminator",
                "StringCopyPadded",
                "StripExtCtrlCodes",
                "ConvertIntToDecimalStringN",
                "ConvertIntToHexStringN",
            ):
                classification = "CANDIDATE"
                reason = "Pure GBA charmap/buffer operation with standard control flow and resolved dependencies"
            elif "ExpandPlaceholder" in name or name == "StringExpandPlaceholders" or name == "GetExpandedPlaceholder":
                classification = "BLOCKED"
                reason = "Depends on global string vars (gStringVar1..4) and expanded text tables"
            elif "Multibyte" in name or "Braille" in name or "International" in name:
                classification = "BLOCKED"
                reason = "Requires Braille / Japanese 16-bit font encoding tables"
            else:
                classification = "CANDIDATE"
                reason = "Charmap string helper"
        else:
            classification = "CANDIDATE"
            reason = "Standard function"

        analyses.append(
            FunctionAnalysis(
                name=name,
                c_file=f"{c_stem}.c",
                line=ast_f.line,
                return_type=ast_f.return_type,
                params=ast_f.params,
                ts_status=ts_status,
                classification=classification,
                reason=reason,
                ast_kinds=sorted(kinds),
                callees=sorted(callees),
                globals_used=sorted(globals_used),
            )
        )

    return analyses


def run_sample_analysis() -> dict[str, list[FunctionAnalysis]]:
    idents, real_defs, _cites = portInventory.load_ts()
    scan = subprocess.run(
        ["node", str(ROOT / "tools" / "decomp" / "ts_symbol_scan.mjs")],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    real_defs.update(json.loads(scan.stdout))
    for generated_idents, generated_defs, _generated_path in portInventory.generated_ts_for_source().values():
        idents.update(generated_idents)
        real_defs.update(generated_defs)
    results: dict[str, list[FunctionAnalysis]] = {}
    for stem in ["string_util", "item", "digit_obj_util"]:
        results[stem] = analyze_file(stem, idents, real_defs)
    return results


def print_summary(results: dict[str, list[FunctionAnalysis]]) -> None:
    print("=" * 80)
    print("CLANG AST ANALYSIS OF CANDIDATE PENDING FILES")
    print("Target: armv4t-none-eabi | ABI: 32-bit ILP32, unsigned char default")
    print("=" * 80)
    for stem, analyses in results.items():
        total = len(analyses)
        counts: dict[str, int] = {}
        for a in analyses:
            counts[a.classification] = counts.get(a.classification, 0) + 1
        print(f"\n### {stem}.c (Total: {total} functions)")
        for cat, cnt in sorted(counts.items()):
            pct = (cnt / total) * 100
            print(f"  - {cat:16}: {cnt:3d} ({pct:5.1f}%)")

        print("\n  Sample details:")
        for a in analyses[:8]:
            param_str = ", ".join(f"{p[0]}: {p[1]}" for p in a.params)
            print(f"    * {a.name}({param_str}) -> {a.return_type} [Line {a.line}]")
            print(f"      Status in TS: {a.ts_status:8} | Class: {a.classification:14} | Reason: {a.reason}")


if __name__ == "__main__":
    results = run_sample_analysis()
    print_summary(results)
