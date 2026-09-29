#!/usr/bin/env python3
"""Re-derive the `overworld.c` candidates for the overworld batch (see HANDOFF-overworld.md).

For every function definition of pokefirered/src/overworld.c it reports:
  * nominal status as PORT-INVENTORY counts it (`portInventory.count_found`);
  * whether the frozen generator's fail-closed audit calls it SUPPORTED (fixpoint over known_functions);
  * callees taken from the AST and which of them exist in TS (by portInventory's normalised name) or are also SUPPORTED;
  * global variables referenced (DeclRefExpr to a non-function, non-local VarDecl);
  * the hw/gfx flag, frozen below from the original corpus analysis.

Read-only: does not modify src/fr or the generator.   python3 tools/handoff/overworld_candidates.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "decomp"))
sys.path.insert(0, str(ROOT / "tools"))
import clang_ast  # noqa: E402
import clang_codegen as CG  # noqa: E402
import clang_intsem as I  # noqa: E402
import portInventory as PI  # noqa: E402
from common import DECOMP  # noqa: E402

# hw/gfx flag from the corpus analysis (scratchpad corpus5.pkl); heuristic, revalidate by reading the body.
HW_GFX = {
    "CB2_ReturnToFieldFromMultiplayer", "VBlankCB_Field", "MoveSaveBlocks_ResetHeap_", "InitOverworldGraphicsRegisters",
    "SetCameraToTrackGuestPlayer", "SetCameraToTrackGuestPlayer_2", "CB2_EnterFieldFromQuestLog", "CheckRfuKeepAliveTimer",
    "UpdateHeldKeyCode", "KeyInterCB_SelfIdle", "KeyInterCB_DeferToRecvQueue", "InitLinkRoomStartMenuScript",
    "Overworld_SendKeysToLinkIsRunning", "IsSendingKeysOverCable",
}


def calls_and_globals(node, out_calls, out_globals, local_ids):
    k = node.get("kind")
    if k == "VarDecl":
        local_ids.add(node.get("id"))
    if k == "DeclRefExpr":
        d = node.get("referencedDecl") or {}
        if d.get("kind") == "FunctionDecl":
            out_calls.add(d.get("name"))
        elif d.get("kind") == "VarDecl" and d.get("id") not in local_ids:
            out_globals.add(d.get("name"))
    for c in node.get("inner") or []:
        if isinstance(c, dict):
            calls_and_globals(c, out_calls, out_globals, local_ids)


def main() -> None:
    src = DECOMP / "src" / "overworld.c"
    ast = clang_ast.dump_clang_ast_json(src)
    enums = I.enum_constants(ast)
    text = src.read_text(errors="replace")
    cfuncs = PI.c_functions(text)
    idents, real_def, _ = PI.load_ts()
    funcs = clang_ast.extract_functions(ast, {n for n, _ in cfuncs})

    def run(known):
        res = {}
        for name, f in funcs.items():
            try:
                CG.ClangTsEmitter("overworld.c", f, known_functions=set(known) | {name}, enums=enums).emit_function()
                res[name] = (True, ())
            except CG.UnsupportedAstError as e:
                res[name] = (False, tuple(e.codes))
            except Exception as e:  # emitter backstop
                res[name] = (False, ("EXCEPTION:" + type(e).__name__,))
        return res

    res = run(())
    for _ in range(6):
        sup = {n for n, r in res.items() if r[0]}
        redo = {n for n, r in res.items() if not r[0] and r[1] == ("UNSUPPORTED_CALL_POINTER_ARGS",)}
        if not redo:
            break
        new = run(sup)
        res = {n: (new[n] if n in redo and new[n][0] else res[n]) for n in res}
    sup = {n for n, r in res.items() if r[0]}

    nominal_pending = []
    for name, c_real in cfuncs:
        key = PI.norm(name)
        if key in idents and not (c_real and real_def.get(key) is False):
            continue
        nominal_pending.append(name)
    print(f"overworld.c functions {len(cfuncs)}; nominally pending {len(nominal_pending)}; SUPPORTED among pending {len(sup & set(nominal_pending))}")
    print("name | line | supported | codes | hw/gfx(frozen) | unresolved callees | globals | globals with no TS identifier")
    for name in nominal_pending:
        f = funcs.get(name)
        if f is None:
            print(f"{name} | ? | no AST body")
            continue
        calls, globs = set(), set()
        calls_and_globals(f.body, calls, globs, set())
        calls.discard(name)
        unres = sorted(c for c in calls if PI.norm(c) not in idents and c not in sup)
        gmiss = sorted(g for g in globs if PI.norm(g) not in idents)
        ok, codes = res[name]
        print(f"{name} | {f.line} | {'SUPPORTED' if ok else 'no'} | {','.join(c.replace('UNSUPPORTED_', '') for c in codes)} | "
              f"{'hw/gfx' if name in HW_GFX else '-'} | {','.join(unres) or '-'} | {','.join(sorted(globs)) or '-'} | {','.join(gmiss) or '-'}")


if __name__ == "__main__":
    main()
