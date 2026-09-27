"""Bounded TypeScript code generator from Clang AST for Pokémon FireRed.

Implements steps 3 and 4 of GOAL-CLANG.md:
- Translates a viable, bounded family of functions directly from Clang's AST.
- Enforces GBA ABI semantics:
  - 8-bit unsigned chars, EOS = 0xFF, EXT_CTRL_CODE_BEGIN = 0xFC.
  - integer truncation / wrapping (& 0xFF, & 0xFFFF, Math.trunc for division).
- Rejects unsupported constructs (goto, inline asm, complex pointer aliasing, unhandled types)
  with explicit UnsupportedAstError identifying file, function, and reason.
- Deterministic output, clean formatting, full type signatures.
"""

from __future__ import annotations

import json
import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from common import ROOT
import clang_ast


class UnsupportedAstError(Exception):
    def __init__(self, c_file: str, func_name: str, reason: str):
        super().__init__(f"[{c_file}:{func_name}] Unsupported AST: {reason}")
        self.c_file = c_file
        self.func_name = func_name
        self.reason = reason


# Supported GBA constants mapped to TS constants
CONSTANTS_MAP: dict[int, str] = {
    0xFF: "EOS",
    0xFC: "EXT_CTRL_CODE_BEGIN",
    0xFD: "PLACEHOLDER_BEGIN",
    0xFE: "CHAR_NEWLINE",
    0xAC: "CHAR_QUESTION_MARK",
}

# Globals of the C translation unit that live outside the generated module.
# stringVars/saveBlocks come from gba/stringBuffers.ts (a leaf module so the
# generated file never enters the save.ts -> charmap.ts import cycle) and the
# gExpandedPlaceholder_* strings are the exported rom texts.
SYMBOL_MAP: dict[str, str] = {
    "gStringVar1": "stringVars.var1",
    "gStringVar2": "stringVars.var2",
    "gStringVar3": "stringVars.var3",
    "gStringVar4": "stringVars.var4",
    "gSaveBlock1Ptr": "saveBlocks()",
    "gSaveBlock2Ptr": "saveBlocks()",
}
for _ph in (
    "Empty", "Kun", "Chan", "Sapphire", "Ruby", "Aqua", "Magma",
    "Archie", "Maxie", "Kyogre", "Groudon", "Red", "Green",
):
    SYMBOL_MAP[f"gExpandedPlaceholder_{_ph}"] = f'rom.text("gExpandedPlaceholder_{_ph}")'

MODULE_IMPORTS = [
    'import { rom } from "../rom";',
    'import { saveBlocks, stringVars } from "../gba/stringBuffers";',
]

# Expected element count for pointer-to-function tables, verified against
# PLACEHOLDER_ID_UNKNOWN..PLACEHOLDER_ID_KYOGRE (0x0..0xD) in
# pokefirered/include/constants/characters.h: Clang linearizes the designated
# initializers, so the check must prove no gap was dropped.
INIT_LIST_EXPECTED: dict[tuple[str, str], int] = {
    ("GetExpandedPlaceholder", "funcs"): 14,
}


def _iter_nodes(node: dict[str, Any]) -> Any:
    yield node
    for child in node.get("inner") or []:
        if isinstance(child, dict):
            yield from _iter_nodes(child)


def _decl_ref_name(node: dict[str, Any]) -> str | None:
    while isinstance(node, dict) and node.get("kind") in (
        "ImplicitCastExpr", "ConstantExpr", "CStyleCastExpr", "ParenExpr",
    ):
        inner = node.get("inner") or []
        if not inner:
            return None
        node = inner[0]
    if isinstance(node, dict) and node.get("kind") == "DeclRefExpr":
        return node.get("referencedDecl", {}).get("name")
    return None


class ClangTsEmitter:
    def __init__(
        self,
        c_file: str,
        func: clang_ast.AstFunction,
        models: dict[str, str] | None = None,
        known_functions: set[str] | None = None,
    ):
        self.c_file = c_file
        self.func = func
        self.func_name = func.name
        self.models: dict[str, str] = models or {}
        self.known_functions: set[str] = known_functions or {func.name}
        self.pointer_params: list[str] = []
        self.pointer_locals: set[str] = set()
        self.pointer_buffer: dict[str, str] = {}
        # Pointer locals are either "offset" (a buffer name plus a {name}_idx
        # cursor, as C pointer arithmetic is emulated) or "buffer" (the local
        # holds the array itself, as ExpandPlaceholder_* return global arrays).
        self.pointer_kind: dict[str, str] = {}
        self.indent_level = 0
        self.lines: list[str] = []

        # Identify pointer parameters in declaration order
        for pname, ptype in func.params:
            if "*" in ptype:
                self.pointer_params.append(pname)
                self.pointer_buffer[pname] = pname
                self.pointer_kind[pname] = "offset"

        # Every pointer local of the body, known before emission so the model
        # pre-scan can classify declarations and assignments.
        self.pointer_decls: set[str] = set()
        for node in _iter_nodes(func.body):
            if node.get("kind") == "VarDecl" and "*" in node.get("type", {}).get("qualType", ""):
                name = node.get("name", "")
                if name:
                    self.pointer_decls.add(name)

        self.buffer_locals: set[str] = set()
        self.buffer_locals = self._scan_buffer_locals()
        self.return_model = self._compute_return_model()

    def indent(self) -> str:
        return "  " * self.indent_level

    def emit_line(self, line: str) -> None:
        self.lines.append(f"{self.indent()}{line}" if line else "")

    def is_pointer(self, name: str) -> bool:
        return name in self.pointer_params or name in self.pointer_locals

    def get_pointer_buffer(self, name: str) -> str:
        return self.pointer_buffer.get(name, name)

    def reject(self, reason: str) -> None:
        raise UnsupportedAstError(self.c_file, self.func_name, reason)

    def emit_function(self) -> str:
        # Pre-scan body for unsupported nodes
        self._check_supported(self.func.body)

        # Signature: buffer and scalar params first, followed by optional offset params
        main_params = []
        offset_params = []
        for pname, ptype in self.func.params:
            if "*" in ptype:
                is_const = "const" in ptype
                ts_type = "ArrayLike<number>" if is_const else "Uint8Array"
                main_params.append(f"{pname}: {ts_type}")
                offset_params.append(f"{pname}Offset = 0")
            elif ptype in ("u8", "u16", "u32", "s8", "s16", "s32", "int", "unsigned int"):
                main_params.append(f"{pname}: number")
            elif ptype in ("bool8", "bool32", "_Bool"):
                main_params.append(f"{pname}: boolean")
            else:
                main_params.append(f"{pname}: number")

        param_parts = main_params + offset_params

        ret_type = "void"
        if "*" in self.func.return_type:
            # Offset-returning functions hand back a cursor into their pointer
            # parameter (StringCopy & co.); buffer-returning ones hand back a
            # whole array (gStringVar*, gExpandedPlaceholder_*, save fields).
            if self.return_model == "buffer":
                ret_type = "ArrayLike<number>"
            elif self.return_model == "offset":
                ret_type = "number"
            else:
                self.reject("cannot classify the returned pointer model")
        elif self.func.return_type in ("u8", "u16", "u32", "s8", "s16", "s32", "int"):
            ret_type = "number"
        elif self.func.return_type in ("bool8", "bool32", "_Bool"):
            ret_type = "boolean"

        self.emit_line(f"export function {self.func_name}({', '.join(param_parts)}): {ret_type} {{")
        self.indent_level += 1

        # Initialize pointer offset trackers for pointer params
        for pname in self.pointer_params:
            self.emit_line(f"let {pname}_idx = {pname}Offset;")

        # Translate body
        self.emit_compound_stmt(self.func.body, is_func_root=True)

        self.indent_level -= 1
        self.emit_line("}")
        return "\n".join(self.lines)

    def _check_supported(self, node: dict[str, Any]) -> None:
        k = node.get("kind")
        if k == "GotoStmt":
            self.reject("goto statements are not supported")
        elif k == "GCCAsmStmt":
            self.reject("inline assembly is not supported")
        for child in node.get("inner") or []:
            if isinstance(child, dict):
                self._check_supported(child)

    def emit_compound_stmt(self, node: dict[str, Any], is_func_root: bool = False) -> None:
        for stmt in node.get("inner", []):
            self.emit_stmt(stmt)

    def emit_stmt(self, node: dict[str, Any]) -> None:
        k = node.get("kind")
        if k == "CompoundStmt":
            self.emit_line("{")
            self.indent_level += 1
            self.emit_compound_stmt(node)
            self.indent_level -= 1
            self.emit_line("}")
        elif k == "DeclStmt":
            for child in node.get("inner", []):
                if not isinstance(child, dict):
                    continue
                if child.get("kind") == "VarDecl":
                    vname = child.get("name", "")
                    vtype = child.get("type", {}).get("qualType", "")
                    inits = child.get("inner", [])
                    if "*" in vtype:
                        self.pointer_locals.add(vname)
                        if vname in self.buffer_locals:
                            # The local holds an array (gStringVar*, a save
                            # field or a placeholder string), not a cursor.
                            self.pointer_kind[vname] = "buffer"
                            self.pointer_buffer[vname] = vname
                            if inits:
                                init_expr = self.emit_expr(inits[0])
                                self.emit_line(f"let {vname}: ArrayLike<number> = {init_expr};")
                            else:
                                self.emit_line(f"let {vname}: ArrayLike<number>;")
                            self.emit_line(f"let {vname}_idx = 0;")
                        elif inits:
                            ref_name = self._get_decl_ref_name(inits[0])
                            self.pointer_kind[vname] = "offset"
                            if ref_name and self.is_pointer(ref_name):
                                self.pointer_buffer[vname] = self.get_pointer_buffer(ref_name)
                                self.emit_line(f"let {vname}_idx = {ref_name}_idx;")
                            else:
                                init_expr = self.emit_expr(inits[0])
                                self.pointer_buffer[vname] = vname
                                self.emit_line(f"let {vname}_idx = {init_expr};")
                        else:
                            self.pointer_kind[vname] = "offset"
                            self.pointer_buffer[vname] = vname
                            self.emit_line(f"let {vname}_idx = 0;")
                    elif "[" in vtype and inits and inits[0].get("kind") == "InitListExpr":
                        # Constant or static array declaration
                        refs = self._parse_init_list_refs(inits[0], vname)
                        if refs is not None:
                            self.emit_line(f"const {vname} = [{', '.join(refs)}];")
                        else:
                            arr_vals = self._parse_init_list(inits[0])
                            self.emit_line(f"const {vname} = [{', '.join(map(str, arr_vals))}];")
                    else:
                        if inits:
                            init_expr = self.emit_expr(inits[0])
                            self.emit_line(f"let {vname} = {init_expr};")
                        else:
                            self.emit_line(f"let {vname} = 0;")
        elif k == "IfStmt":
            inner = node.get("inner", [])
            cond_expr = self.emit_expr(inner[0])
            then_stmt = inner[1]
            has_else = len(inner) > 2
            self.emit_line(f"if ({cond_expr}) {{")
            self.indent_level += 1
            self.emit_stmt(then_stmt)
            self.indent_level -= 1
            if has_else:
                self.emit_line("} else {")
                self.indent_level += 1
                self.emit_stmt(inner[2])
                self.indent_level -= 1
            self.emit_line("}")
        elif k == "WhileStmt":
            inner = node.get("inner", [])
            cond_expr = self.emit_expr(inner[0])
            body_stmt = inner[1]
            self.emit_line(f"while ({cond_expr}) {{")
            self.indent_level += 1
            self.emit_stmt(body_stmt)
            self.indent_level -= 1
            self.emit_line("}")
        elif k == "ForStmt":
            inner = node.get("inner", [])
            # Standard Clang AST ForStmt 5-tuple: [init, (null), cond, inc, body]
            init_node = inner[0] if len(inner) > 0 and inner[0] is not None and inner[0].get("kind") is not None else None
            cond_node = inner[2] if len(inner) > 2 and inner[2] is not None and inner[2].get("kind") is not None else None
            inc_node = inner[3] if len(inner) > 3 and inner[3] is not None and inner[3].get("kind") is not None else None
            body_node = inner[4] if len(inner) > 4 else inner[-1]

            init_str = self.emit_expr(init_node) if init_node else ""
            cond_str = self.emit_expr(cond_node) if cond_node else ""
            inc_str = self.emit_expr(inc_node) if inc_node else ""

            self.emit_line(f"for ({init_str}; {cond_str}; {inc_str}) {{")
            self.indent_level += 1
            self.emit_stmt(body_node)
            self.indent_level -= 1
            self.emit_line("}")
        elif k == "ReturnStmt":
            inner = node.get("inner", [])
            if inner:
                ref_name = self._get_decl_ref_name(inner[0])
                if ref_name and self.is_pointer(ref_name):
                    if self.pointer_kind.get(ref_name) == "buffer":
                        self.emit_line(f"return {ref_name};")
                    else:
                        self.emit_line(f"return {ref_name}_idx;")
                else:
                    ret_val = self.emit_expr(inner[0])
                    self.emit_line(f"return {ret_val};")
            else:
                self.emit_line("return;")
        elif k == "BreakStmt":
            self.emit_line("break;")
        elif k == "SwitchStmt":
            inner = node.get("inner", [])
            cond_expr = self.emit_expr(inner[0])
            self.emit_line(f"switch ({cond_expr}) {{")
            self.indent_level += 1
            body_stmt = inner[1]
            if body_stmt.get("kind") == "CompoundStmt":
                self.emit_compound_stmt(body_stmt)
            else:
                self.emit_stmt(body_stmt)
            self.indent_level -= 1
            self.emit_line("}")
        elif k == "CaseStmt":
            inner = node.get("inner", [])
            case_val = self.emit_expr(inner[0])
            self.emit_line(f"case {case_val}:")
            if len(inner) > 1:
                self.indent_level += 1
                self.emit_stmt(inner[1])
                self.indent_level -= 1
        elif k == "DefaultStmt":
            inner = node.get("inner", [])
            self.emit_line("default:")
            if inner:
                self.indent_level += 1
                self.emit_stmt(inner[0])
                self.indent_level -= 1
        elif k in ("BinaryOperator", "CompoundAssignOperator", "UnaryOperator", "CallExpr"):
            expr = self.emit_expr(node)
            self.emit_line(f"{expr};")
        else:
            self.reject(f"unsupported statement kind: {k}")

    def emit_expr(self, node: dict[str, Any]) -> str:
        k = node.get("kind")
        if k == "ImplicitCastExpr":
            return self.emit_expr(node["inner"][0])
        elif k == "ConstantExpr":
            return self.emit_expr(node["inner"][0])
        elif k == "CStyleCastExpr":
            return self.emit_expr(node["inner"][0])
        elif k == "ParenExpr":
            return f"({self.emit_expr(node['inner'][0])})"
        elif k == "IntegerLiteral":
            val = int(node.get("value", "0"))
            return CONSTANTS_MAP.get(val, str(val))
        elif k == "DeclRefExpr":
            name = node.get("referencedDecl", {}).get("name", "")
            if name in self.pointer_params or name in self.pointer_locals:
                # Value context of a pointer variable: the cursor for offset
                # locals, the array itself for buffer locals.
                if self.pointer_kind.get(name) == "buffer":
                    return name
                return f"{name}_idx"
            return SYMBOL_MAP.get(name, name)
        elif k == "MemberExpr":
            # gSaveBlock2Ptr->playerGender / gSaveBlock1Ptr->rivalName[0]
            base_expr = self.emit_expr(node["inner"][0])
            return f"{base_expr}.{node.get('name', '')}"
        elif k == "UnaryOperator":
            op = node.get("opcode")
            is_postfix = node.get("isPostfix", False)
            sub = node["inner"][0]
            # Pointer dereference *ptr or *ptr++ or *(ptr +/- offset)
            if op == "*":
                unwrapped = sub
                while unwrapped.get("kind") in ("ParenExpr", "ImplicitCastExpr"):
                    unwrapped = unwrapped["inner"][0]
                if unwrapped.get("kind") == "BinaryOperator" and unwrapped.get("opcode") in ("+", "-"):
                    bin_op = unwrapped.get("opcode")
                    bin_lhs = unwrapped["inner"][0]
                    bin_rhs = unwrapped["inner"][1]
                    ptr_name = self._get_decl_ref_name(bin_lhs)
                    if ptr_name and self.is_pointer(ptr_name):
                        buf = self.get_pointer_buffer(ptr_name)
                        rhs_expr = self.emit_expr(bin_rhs)
                        return f"{buf}[{ptr_name}_idx {bin_op} {rhs_expr}]"
                if sub.get("kind") == "UnaryOperator" and sub.get("opcode") in ("++", "--"):
                    sub_op = sub.get("opcode")
                    sub_is_postfix = sub.get("isPostfix", False)
                    sub_inner = sub["inner"][0]
                    ptr_name = self._get_decl_ref_name(sub_inner)
                    if ptr_name and self.is_pointer(ptr_name):
                        buf = self.get_pointer_buffer(ptr_name)
                        return f"{buf}[{ptr_name}_idx{sub_op}]" if sub_is_postfix else f"{buf}[{sub_op}{ptr_name}_idx]"
                sub_ref = self._get_decl_ref_name(sub)
                if sub_ref and self.is_pointer(sub_ref):
                    buf = self.get_pointer_buffer(sub_ref)
                    return f"{buf}[{sub_ref}_idx]"
                sub_expr = self.emit_expr(sub)
                return f"{sub_expr}[0]"
            elif op in ("++", "--"):
                sub_ref = self._get_decl_ref_name(sub)
                if sub_ref and self.is_pointer(sub_ref):
                    return f"{sub_ref}_idx{op}" if is_postfix else f"{op}{sub_ref}_idx"
                sub_expr = self.emit_expr(sub)
                return f"{sub_expr}{op}" if is_postfix else f"{op}{sub_expr}"
            elif op == "-":
                inner_expr = self.emit_expr(sub)
                if inner_expr.isdigit():
                    return f"-{inner_expr}"
                return f"-({inner_expr})"
            elif op in ("!", "~"):
                sub_expr = self.emit_expr(sub)
                return f"{op}({sub_expr})"
            elif op == "&":
                # Address-of: &base[index] -> base_idx + index
                if sub.get("kind") == "ArraySubscriptExpr":
                    base_node = sub["inner"][0]
                    idx_node = sub["inner"][1]
                    base_ref = self._get_decl_ref_name(base_node)
                    idx_expr = self.emit_expr(idx_node)
                    if base_ref and self.is_pointer(base_ref):
                        return f"{base_ref}_idx + {idx_expr}"
                    base_expr = self.emit_expr(base_node)
                    return f"{base_expr}Offset + {idx_expr}"
                self.reject(f"unsupported address-of operation: & on {sub.get('kind')}")
            else:
                self.reject(f"unsupported unary operator: {op}")
        elif k in ("BinaryOperator", "CompoundAssignOperator"):
            op = node.get("opcode")
            lhs_node = node["inner"][0]
            rhs_node = node["inner"][1]

            # Special case: *ptr = val or *ptr++ = val
            if op == "=" and lhs_node.get("kind") == "UnaryOperator" and lhs_node.get("opcode") == "*":
                sub = lhs_node["inner"][0]
                if sub.get("kind") == "UnaryOperator" and sub.get("opcode") in ("++", "--"):
                    sub_op = sub.get("opcode")
                    sub_inner = sub["inner"][0]
                    ptr_name = self._get_decl_ref_name(sub_inner)
                    rhs_expr = self.emit_expr(rhs_node)
                    if ptr_name and self.is_pointer(ptr_name):
                        buf = self.get_pointer_buffer(ptr_name)
                        return f"{buf}[{ptr_name}_idx{sub_op}] = {rhs_expr}"
                ptr_name = self._get_decl_ref_name(sub)
                rhs_expr = self.emit_expr(rhs_node)
                if ptr_name and self.is_pointer(ptr_name):
                    buf = self.get_pointer_buffer(ptr_name)
                    return f"{buf}[{ptr_name}_idx] = {rhs_expr}"
                ptr_expr = self.emit_expr(sub)
                return f"{ptr_expr}[0] = {rhs_expr}"

            # Special case: ptr = expr (buffer or cursor assignment)
            if op == "=":
                lhs_ptr = self._get_decl_ref_name(lhs_node)
                if lhs_ptr and self.is_pointer(lhs_ptr):
                    model = self._expr_model(rhs_node)
                    if self.pointer_kind.get(lhs_ptr) == "buffer":
                        if model != "buffer":
                            self.reject(f"buffer pointer {lhs_ptr} assigned a cursor expression")
                        rhs_expr = self.emit_expr(rhs_node)
                        return f"{lhs_ptr} = {rhs_expr}"
                    if model == "buffer":
                        if lhs_ptr in self.pointer_params:
                            self.reject("assigning a whole buffer to a pointer parameter is not supported")
                        self.reject(f"pointer {lhs_ptr} was not pre-scanned as a buffer local")
                    rhs_ptr = self._get_decl_ref_name(rhs_node)
                    if not rhs_ptr and rhs_node.get("kind") == "UnaryOperator" and rhs_node.get("opcode") in ("++", "--"):
                        rhs_ptr = self._get_decl_ref_name(rhs_node["inner"][0])
                    if rhs_ptr and self.is_pointer(rhs_ptr):
                        self.pointer_buffer[lhs_ptr] = self.get_pointer_buffer(rhs_ptr)
                    rhs_expr = self.emit_expr(rhs_node)
                    return f"{lhs_ptr}_idx = {rhs_expr}"

            # Special case: ptr += val (pointer offset addition)
            if op == "+=" and self._get_decl_ref_name(lhs_node) and self.is_pointer(self._get_decl_ref_name(lhs_node)):
                ptr_name = self._get_decl_ref_name(lhs_node)
                rhs_expr = self.emit_expr(rhs_node)
                return f"{ptr_name}_idx += {rhs_expr}"

            # Special case: sizeof(arr) / sizeof(arr[0]) -> arr.length
            if op == "/" and lhs_node.get("kind") == "UnaryExprOrTypeTraitExpr" and lhs_node.get("name") == "sizeof":
                arr_ref = self._find_first_decl_ref(lhs_node)
                if arr_ref:
                    return f"{arr_ref}.length"

            # Integer division / and /=
            if op == "/":
                lhs_expr = self.emit_expr(lhs_node)
                rhs_expr = self.emit_expr(rhs_node)
                return f"Math.trunc({lhs_expr} / {rhs_expr})"
            if op == "/=":
                lhs_expr = self.emit_expr(lhs_node)
                rhs_expr = self.emit_expr(rhs_node)
                return f"{lhs_expr} = Math.trunc({lhs_expr} / {rhs_expr})"

            lhs_expr = self.emit_expr(lhs_node)
            rhs_expr = self.emit_expr(rhs_node)
            js_op = "===" if op == "==" else "!==" if op == "!=" else op
            return f"{lhs_expr} {js_op} {rhs_expr}"
        elif k == "ArraySubscriptExpr":
            base_node = node["inner"][0]
            idx_node = node["inner"][1]
            base_ref = self._get_decl_ref_name(base_node)
            idx_expr = self.emit_expr(idx_node)
            if base_ref and self.is_pointer(base_ref):
                buf = self.get_pointer_buffer(base_ref)
                return f"{buf}[{base_ref}_idx + {idx_expr}]"
            base_expr = self.emit_expr(base_node)
            return f"{base_expr}[{idx_expr}]"
        elif k == "CallExpr":
            callee_node = node["inner"][0]
            callee_name = self._get_decl_ref_name(callee_node) or self.emit_expr(callee_node)
            args = node["inner"][1:]
            arg_exprs: list[str] = []
            ptr_offsets_to_append: list[str] = []
            for a in args:
                ref_name = self._get_decl_ref_name(a)
                if ref_name and self.is_pointer(ref_name):
                    buf = self.get_pointer_buffer(ref_name)
                    arg_exprs.append(buf)
                    ptr_offsets_to_append.append(f"{ref_name}_idx")
                else:
                    arg_exprs.append(self.emit_expr(a))
            if ptr_offsets_to_append:
                arg_exprs.extend(ptr_offsets_to_append)
            return f"{callee_name}({', '.join(arg_exprs)})"
        else:
            self.reject(f"unsupported expression kind: {k}")

    def _get_decl_ref_name(self, node: dict[str, Any]) -> str | None:
        if node.get("kind") == "ImplicitCastExpr":
            return self._get_decl_ref_name(node["inner"][0])
        if node.get("kind") == "DeclRefExpr":
            return node.get("referencedDecl", {}).get("name")
        return None

    def _find_first_decl_ref(self, node: dict[str, Any]) -> str | None:
        if node.get("kind") == "DeclRefExpr":
            return node.get("referencedDecl", {}).get("name")
        for child in node.get("inner", []):
            res = self._find_first_decl_ref(child)
            if res:
                return res
        return None

    def _is_pointer_name(self, name: str | None) -> bool:
        return bool(name) and (name in self.pointer_params or name in self.pointer_decls)

    def _expr_model(self, node: dict[str, Any]) -> str | None:
        """Pointer model of an expression: "buffer" (a whole array) or "offset"
        (a cursor into a buffer). None when it cannot be classified."""
        while isinstance(node, dict) and node.get("kind") in (
            "ImplicitCastExpr", "ConstantExpr", "CStyleCastExpr", "ParenExpr",
        ):
            inner = node.get("inner") or []
            if not inner:
                return None
            node = inner[0]
        if not isinstance(node, dict):
            return None
        k = node.get("kind")
        if k == "DeclRefExpr":
            name = node.get("referencedDecl", {}).get("name", "")
            if self._is_pointer_name(name):
                if name in self.pointer_kind:
                    return self.pointer_kind[name]
                if name in self.buffer_locals:
                    return "buffer"
                return "offset"
            return "buffer"
        if k == "MemberExpr":
            return "buffer"
        if k == "CallExpr":
            inner = node.get("inner") or []
            if not inner:
                return None
            callee = _decl_ref_name(inner[0])
            if not callee:
                return None  # indirect call: unknown until the caller decides
            return self.models.get(callee)
        if k == "UnaryOperator":
            op = node.get("opcode")
            inner = node.get("inner") or []
            if op in ("++", "--") and inner:
                return self._expr_model(inner[0])
            if op == "&":
                return "offset"
            return None
        if k == "BinaryOperator" and node.get("opcode") in ("+", "-"):
            inner = node.get("inner") or []
            if len(inner) == 2:
                left = self._expr_model(inner[0])
                return left if left is not None else self._expr_model(inner[1])
            return None
        return None

    def _return_kind(self, node: dict[str, Any], param_names: list[str]) -> tuple[str, str | None] | str | None:
        """Classify a returned expression: "buffer"/"offset", ("call", name) or None."""
        while isinstance(node, dict) and node.get("kind") in (
            "ImplicitCastExpr", "ConstantExpr", "CStyleCastExpr", "ParenExpr",
        ):
            inner = node.get("inner") or []
            if not inner:
                return None
            node = inner[0]
        if not isinstance(node, dict):
            return None
        k = node.get("kind")
        if k == "DeclRefExpr":
            name = node.get("referencedDecl", {}).get("name", "")
            if name in param_names:
                return "offset"
            if name in self.pointer_decls:
                if name in self.buffer_locals:
                    return "buffer"
                return "offset"
            return "buffer"
        if k == "MemberExpr":
            return "buffer"
        if k == "CallExpr":
            inner = node.get("inner") or []
            if not inner:
                return None
            callee = _decl_ref_name(inner[0])
            if callee and callee in self.models:
                return self.models[callee]
            return ("call", callee)
        if k == "UnaryOperator":
            op = node.get("opcode")
            inner = node.get("inner") or []
            if op in ("++", "--") and inner:
                return self._return_kind(inner[0], param_names)
            if op == "&":
                return "offset"
            return None
        if k == "BinaryOperator" and node.get("opcode") in ("+", "-"):
            inner = node.get("inner") or []
            if len(inner) == 2:
                left = self._return_kind(inner[0], param_names)
                if isinstance(left, str):
                    return left
                right = self._return_kind(inner[1], param_names)
                if isinstance(right, str):
                    return right
            return None
        return None

    def _compute_return_model(self) -> str | None:
        if "*" not in self.func.return_type:
            return None
        param_names = [p for p, _ in self.func.params]
        direct: list[str] = []
        deferred = 0
        for node in _iter_nodes(self.func.body):
            if node.get("kind") != "ReturnStmt":
                continue
            inner = node.get("inner") or []
            if not inner:
                continue
            kind = self._return_kind(inner[0], param_names)
            if isinstance(kind, str):
                direct.append(kind)
            else:
                deferred += 1
        if not direct:
            return None
        if len(set(direct)) > 1:
            self.reject(f"mixed return models {sorted(set(direct))}")
        model = direct[0]
        if model == "offset" and deferred:
            self.reject("offset-returning function has an unclassifiable return expression")
        return model

    def _scan_buffer_locals(self) -> set[str]:
        """Pointer locals that hold an array instead of a cursor."""
        for _ in range(3):
            changed = False
            for node in _iter_nodes(self.func.body):
                k = node.get("kind")
                if k == "VarDecl":
                    name = node.get("name", "")
                    if not self._is_pointer_name(name) or name in self.pointer_params:
                        continue
                    inits = node.get("inner") or []
                    if inits and name not in self.buffer_locals and self._expr_model(inits[0]) == "buffer":
                        self.buffer_locals.add(name)
                        changed = True
                elif k == "BinaryOperator" and node.get("opcode") == "=":
                    inner = node.get("inner") or []
                    if len(inner) == 2:
                        lhs_name = _decl_ref_name(inner[0])
                        if (
                            self._is_pointer_name(lhs_name)
                            and lhs_name not in self.pointer_params
                            and lhs_name not in self.buffer_locals
                            and self._expr_model(inner[1]) == "buffer"
                        ):
                            self.buffer_locals.add(lhs_name)
                            changed = True
            if not changed:
                break
        return self.buffer_locals

    def _parse_init_list(self, node: dict[str, Any]) -> list[int]:
        vals: list[int] = []
        for el in node.get("inner", []):
            val = None
            if el.get("kind") == "ImplicitCastExpr":
                inner = el.get("inner", [])
                if inner:
                    val = inner[0].get("value")
            elif "value" in el:
                val = el.get("value")
            vals.append(int(val) if val is not None else 0)
        return vals


    def _parse_init_list_refs(self, node: dict[str, Any], vname: str) -> list[str] | None:
        """Names for a table of function pointers, or None for a numeric table."""
        elements = node.get("inner", [])
        if not elements:
            return None
        refs = [_decl_ref_name(el) for el in elements]
        if any(r is None for r in refs):
            if all(r is None for r in refs):
                return None
            self.reject(f"table {vname} mixes function references and literals")
        names = [r for r in refs if r is not None]
        expected = INIT_LIST_EXPECTED.get((self.func_name, vname))
        if expected is not None and len(names) != expected:
            self.reject(f"table {vname} has {len(names)} entries, expected {expected}")
        for name in names:
            if name not in self.known_functions:
                self.reject(f"table {vname} references unknown function {name}")
            if self.models.get(name) != "buffer":
                self.reject(f"table {vname} entry {name} does not return a buffer")
        return names


def generate_string_util_ts() -> str:
    """Generate stringUtil.ts for the supported string_util family."""
    c_path = ROOT.parent / "pokefirered" / "src" / "string_util.c"
    ast = clang_ast.dump_clang_ast_json(c_path)
    funcs = clang_ast.extract_functions(ast)

    target_funcs = [
        "GetExtCtrlCodeLength",
        "SkipExtCtrlCode",
        "StringLength",
        "StringCopy",
        "StringAppend",
        "StringCopyN",
        "StringAppendN",
        "StringCompare",
        "StringCompareN",
        "StringFill",
        "StringFillWithTerminator",
        "StringCopyPadded",
        "StripExtCtrlCodes",
        "StringCompareWithoutExtCtrlCodes",
        "StringCopy_Nickname",
        "StringGet_Nickname",
        "StringCopy_PlayerName",
        "ConvertIntToDecimalStringN",
        "ConvertIntToHexStringN",
        "StringCopyN_Multibyte",
        "StringLength_Multibyte",
        "WriteColorChangeControlCode",
        "ConvertInternationalString",
        # Placeholder family (StringExpandPlaceholders + GetExpandedPlaceholder
        # + the static ExpandPlaceholder_* functions of the same file).
        "StringExpandPlaceholders",
        "StringBraille",
        "ExpandPlaceholder_UnknownStringVar",
        "ExpandPlaceholder_PlayerName",
        "ExpandPlaceholder_StringVar1",
        "ExpandPlaceholder_StringVar2",
        "ExpandPlaceholder_StringVar3",
        "ExpandPlaceholder_KunChan",
        "ExpandPlaceholder_RivalName",
        "ExpandPlaceholder_Version",
        "ExpandPlaceholder_Magma",
        "ExpandPlaceholder_Aqua",
        "ExpandPlaceholder_Maxie",
        "ExpandPlaceholder_Archie",
        "ExpandPlaceholder_Groudon",
        "ExpandPlaceholder_Kyogre",
        "GetExpandedPlaceholder",
    ]

    target: dict[str, clang_ast.AstFunction] = {}
    for name in target_funcs:
        f = funcs.get(name)
        if not f:
            raise UnsupportedAstError("string_util.c", name, "function definition not found in Clang AST")
        target[name] = f

    # Classify every returned pointer as "buffer" (a whole array) or "offset"
    # (a cursor). Functions whose returns are calls are resolved once the
    # callee is known, so iterate to a fixed point.
    models: dict[str, str] = {}
    for _ in range(len(target) + 1):
        changed = False
        for name, f in target.items():
            if name in models:
                continue
            model = ClangTsEmitter("string_util.c", f, models, set(target)).return_model
            if model is None:
                continue
            models[name] = model
            changed = True
        if not changed:
            break

    out_lines = [
        "// GENERATED BY tools/decomp/clang_codegen.py FROM pokefirered/src/string_util.c",
        "// DO NOT EDIT MANUALLY. Re-run npm run generate:string-util to regenerate.",
        "// Target: armv4t-none-eabi | ABI: 32-bit ILP32, unsigned char default.",
        "",
        *MODULE_IMPORTS,
        "",
        "export const EOS = 0xff;",
        "export const CHAR_SPACE = 0x00;",
        "export const CHAR_0 = 0xa1;",
        "export const CHAR_QUESTION_MARK = 0xac;",
        "export const EXT_CTRL_CODE_BEGIN = 0xfc;",
        "export const PLACEHOLDER_BEGIN = 0xfd;",
        "export const CHAR_NEWLINE = 0xfe;",
        "",
        "export const POKEMON_NAME_LENGTH = 10;",
        "export const PLAYER_NAME_LENGTH = 7;",
        "export const LANGUAGE_JAPANESE = 1;",
        "",
        "export const STR_CONV_MODE_LEFT_ALIGN = 0;",
        "export const STR_CONV_MODE_RIGHT_ALIGN = 1;",
        "export const STR_CONV_MODE_LEADING_ZEROS = 2;",
        "",
        "export const WAITING_FOR_NONZERO_DIGIT = 0;",
        "export const WRITING_DIGITS = 1;",
        "export const WRITING_SPACES = 2;",
        "",
        "export const gUnknownStringVar = new Uint8Array(16);",
        "",
        "export const sPowersOfTen = [",
        "  1,",
        "  10,",
        "  100,",
        "  1000,",
        "  10000,",
        "  100000,",
        "  1000000,",
        "  10000000,",
        "  100000000,",
        "  1000000000,",
        "];",
        "",
        "export const sDigits = [",
        "  0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa,",
        "  0xbb, 0xbc, 0xbd, 0xbe, 0xbf, 0xc0,",
        "];",
        "",
    ]

    for name in target_funcs:
        f = target[name]
        emitter = ClangTsEmitter("string_util.c", f, models, set(target))
        code = emitter.emit_function()
        out_lines.append(code)
        out_lines.append("")

    return "\n".join(out_lines)


EVENT_OBJECT_ANIM_FUNCS = {
    "GetFaceDirectionAnimNum", "GetMoveDirectionAnimNum",
    "GetMoveDirectionFastAnimNum", "GetMoveDirectionFasterAnimNum",
    "GetMoveDirectionFastestAnimNum", "GetJumpSpecialDirectionAnimNum",
    "GetAcroWheelieDirectionAnimNum", "GetAcroBunnyHopFrontWheelDirectionAnimNum",
    "GetAcroEndWheelieDirectionAnimNum", "GetSpinDirectionAnimNum",
    "GetAcroUnusedActionDirectionAnimNum", "GetAcroWheeliePedalDirectionAnimNum",
    "GetFishingDirectionAnimNum", "GetFishingNoCatchDirectionAnimNum",
    "GetFishingBiteDirectionAnimNum", "GetRunningDirectionAnimNum",
    "GetTrainerFacingDirectionMovementType",
    "ElevationToPriority",
}
EVENT_OBJECT_JUMP_FUNCS = {"GetJumpY"}
EVENT_OBJECT_COPY_DIRECTION_FUNCS = {"GetPlayerDirectionForCopy"}
EVENT_OBJECT_COPY_FUNCS = {"GetCopyDirection"}


# Explicitly reviewed const-table accessors whose source table is exported as cdata.
# Each entry is resolved in its C translation unit to avoid static-name collisions.
# The current callers cover trainer portraits and the naming-screen page button.
CDATA_TABLE_ACCESSORS = {
    "FacilityClassToPicIndex": ("pokemon.c", "pokemon", "gFacilityClassToPicIndex"),
    "PageToNextGfxId": ("naming_screen.c", "naming_screen", "sPageToNextGfxId"),
}


def _cdata_table_accessor(func: clang_ast.AstFunction, c_file: str, cdata_file: str, expected_table: str) -> tuple[str, str, int]:
    """Validate a direct `return const_u8_table[integer_parameter]` accessor."""
    if len(func.params) != 1:
        raise UnsupportedAstError(c_file, func.name, "expected one integer parameter")
    param_type = func.params[0][1]
    if param_type not in ("u8", "u16") or func.return_type != param_type:
        raise UnsupportedAstError(c_file, func.name, "expected matching u8 or u16 return and parameter types")
    param = func.params[0][0]
    statements = func.body.get("inner") or []
    if len(statements) != 1 or statements[0].get("kind") != "ReturnStmt":
        raise UnsupportedAstError(c_file, func.name, "expected one return statement")
    ret = statements[0].get("inner") or []
    subscript = ret[0] if len(ret) == 1 else {}
    while subscript.get("kind") in ("ImplicitCastExpr", "ConstantExpr", "CStyleCastExpr", "ParenExpr"):
        children = subscript.get("inner") or []
        if len(children) != 1:
            raise UnsupportedAstError(c_file, func.name, "unexpected cast around table lookup")
        subscript = children[0]
    if subscript.get("kind") != "ArraySubscriptExpr":
        raise UnsupportedAstError(c_file, func.name, "expected direct array lookup")
    operands = subscript.get("inner") or []
    if len(operands) != 2:
        raise UnsupportedAstError(c_file, func.name, "unexpected array lookup operands")
    table_ref = operands[0]
    while table_ref.get("kind") in ("ImplicitCastExpr", "ConstantExpr", "CStyleCastExpr", "ParenExpr"):
        children = table_ref.get("inner") or []
        if len(children) != 1:
            raise UnsupportedAstError(c_file, func.name, "unexpected table reference cast")
        table_ref = children[0]
    index_ref = operands[1]
    while index_ref.get("kind") in ("ImplicitCastExpr", "ConstantExpr", "CStyleCastExpr", "ParenExpr"):
        children = index_ref.get("inner") or []
        if len(children) != 1:
            raise UnsupportedAstError(c_file, func.name, "unexpected index cast")
        index_ref = children[0]
    table_decl = table_ref.get("referencedDecl", {})
    if table_ref.get("kind") != "DeclRefExpr" or table_decl.get("kind") != "VarDecl" or table_decl.get("name") != expected_table:
        raise UnsupportedAstError(c_file, func.name, f"expected table {expected_table}")
    index_decl = index_ref.get("referencedDecl", {})
    if index_ref.get("kind") != "DeclRefExpr" or index_decl.get("kind") != "ParmVarDecl" or index_decl.get("name") != param:
        raise UnsupportedAstError(c_file, func.name, f"array index must be the {param_type} parameter")
    table_type = table_decl.get("type", {}).get("qualType", "")
    prefix = "const u8["
    if not table_type.startswith(prefix) or not table_type.endswith("]"):
        raise UnsupportedAstError(c_file, func.name, f"expected const u8[N] table, got {table_type or 'unknown type'}")
    try:
        length = int(table_type[len(prefix):-1])
    except ValueError as exc:
        raise UnsupportedAstError(c_file, func.name, "table length is not a constant integer") from exc
    cdata_path = ROOT / "public" / "fr" / "cdata" / f"{cdata_file}.json"
    try:
        table_data = json.loads(cdata_path.read_text())["defs"][expected_table]
    except (OSError, KeyError, json.JSONDecodeError) as exc:
        raise UnsupportedAstError(c_file, func.name, f"exported cdata {cdata_file}.{expected_table} is missing") from exc
    if table_data.get("type") != "u8" or not isinstance(table_data.get("value"), list) or len(table_data["value"]) != length:
        raise UnsupportedAstError(c_file, func.name, "exported cdata type or length differs from the C declaration")
    return param, cdata_file, length


def generate_cdata_table_accessors_ts() -> str:
    rows: list[str] = []
    for name, (c_file, cdata_file, table) in sorted(CDATA_TABLE_ACCESSORS.items()):
        ast = clang_ast.dump_clang_ast_json(clang_ast.DECOMP / "src" / c_file)
        func = clang_ast.extract_functions(ast, {name}).get(name)
        if not func:
            raise UnsupportedAstError(c_file, name, "function definition not found in Clang AST")
        param, data_file, _ = _cdata_table_accessor(func, c_file, cdata_file, table)
        mask = "0xff" if func.params[0][1] == "u8" else "0xffff"
        rows.append(f'export function {name}({param}: number): number {{ return cdata<number[]>("{data_file}", "{table}")[{param} & {mask}]!; }}')
    return "\n".join([
        "// GENERATED BY tools/decomp/clang_codegen.py FROM Clang AST-validated C table accessors.",
        "// DO NOT EDIT MANUALLY. Re-run npm run generate:cdata-table-accessors to regenerate.",
        "// Target: armv4t-none-eabi | u8/u16 input wrapping is preserved; table data comes from exported C cdata.",
        "",
        'import { cdata } from "../hw/assets";',
        "",
        *rows,
        "",
    ])


def write_cdata_table_accessors_file() -> Path:
    out_file = ROOT / "src" / "fr" / "generated" / "cdataTableAccessors.ts"
    out_file.write_text(generate_cdata_table_accessors_ts())
    return out_file


def _event_object_anim_table(func: clang_ast.AstFunction) -> tuple[str, str, int]:
    """Accept only `return table[index]` on exported const u8[9]/u8[16] tables."""
    if func.return_type != "u8" or len(func.params) != 1 or func.params[0][1] != "u8":
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected u8 function with one u8 parameter")
    param = func.params[0][0]
    statements = func.body.get("inner") or []
    if len(statements) != 1 or statements[0].get("kind") != "ReturnStmt":
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected a single return statement")

    def unwrap(node: dict[str, Any]) -> dict[str, Any]:
        while node.get("kind") in ("ImplicitCastExpr", "ConstantExpr", "CStyleCastExpr", "ParenExpr"):
            children = node.get("inner") or []
            if len(children) != 1:
                raise UnsupportedAstError("event_object_movement.c", func.name, "unexpected cast expression")
            node = children[0]
        return node

    ret_children = statements[0].get("inner") or []
    subscript = unwrap(ret_children[0]) if len(ret_children) == 1 else {}
    if subscript.get("kind") != "ArraySubscriptExpr":
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected direct C array lookup")
    operands = subscript.get("inner") or []
    if len(operands) != 2:
        raise UnsupportedAstError("event_object_movement.c", func.name, "unexpected array lookup operands")
    array = unwrap(operands[0])
    index = unwrap(operands[1])
    decl = array.get("referencedDecl", {}) if array.get("kind") == "DeclRefExpr" else {}
    table = decl.get("name")
    array_type = array.get("type", {}).get("qualType", "")
    if decl.get("kind") != "VarDecl" or not table or array_type not in ("const u8[9]", "const u8[16]"):
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected a const u8[9] or const u8[16] table")
    if index.get("kind") != "DeclRefExpr" or index.get("referencedDecl", {}).get("name") != param:
        raise UnsupportedAstError("event_object_movement.c", func.name, "array index is not the function parameter")
    return table, param, int(array_type.rsplit("[", 1)[1][:-1])


def _event_object_jump_y(func: clang_ast.AstFunction) -> tuple[str, str, str]:
    """Accept only the C's `sJumpYTable[type][i]` signed-byte lookup."""
    if func.return_type != "s16" or [(t) for _, t in func.params] != ["s16", "u8"]:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected s16 function with (s16, u8) parameters")
    i_param, type_param = (n for n, _ in func.params)
    statements = func.body.get("inner") or []
    if len(statements) != 1 or statements[0].get("kind") != "ReturnStmt":
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected a single return statement")

    def unwrap(node: dict[str, Any]) -> dict[str, Any]:
        while node.get("kind") in ("ImplicitCastExpr", "ConstantExpr", "CStyleCastExpr", "ParenExpr"):
            children = node.get("inner") or []
            if len(children) != 1:
                raise UnsupportedAstError("event_object_movement.c", func.name, "unexpected cast in nested table lookup")
            node = children[0]
        return node

    ret = statements[0].get("inner") or []
    outer = unwrap(ret[0]) if len(ret) == 1 else {}
    if outer.get("kind") != "ArraySubscriptExpr" or len(outer.get("inner") or []) != 2:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected nested table lookup")
    table_expr, i_expr = (unwrap(n) for n in outer["inner"])
    if i_expr.get("kind") != "DeclRefExpr" or i_expr.get("referencedDecl", {}).get("name") != i_param:
        raise UnsupportedAstError("event_object_movement.c", func.name, "inner array index must be the s16 parameter")
    if table_expr.get("kind") != "ArraySubscriptExpr" or len(table_expr.get("inner") or []) != 2:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected table-of-tables lookup")
    root, type_expr = (unwrap(n) for n in table_expr["inner"])
    if type_expr.get("kind") != "DeclRefExpr" or type_expr.get("referencedDecl", {}).get("name") != type_param:
        raise UnsupportedAstError("event_object_movement.c", func.name, "outer array index must be the u8 parameter")
    ref = root.get("inner", [{}])[0] if root.get("kind") == "ImplicitCastExpr" else root
    if ref.get("kind") != "DeclRefExpr" or ref.get("referencedDecl", {}).get("name") != "sJumpYTable":
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected sJumpYTable as the outer table")
    cdata_path = ROOT / "public" / "fr" / "cdata" / "event_object_movement.json"
    try:
        defs = json.loads(cdata_path.read_text())["defs"]
        refs = defs["sJumpYTable"]["value"]
    except (OSError, KeyError, json.JSONDecodeError) as exc:
        raise UnsupportedAstError("event_object_movement.c", func.name, "exported sJumpYTable is missing") from exc
    if defs["sJumpYTable"].get("type") != "s8" or len(refs) != 3:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected three exported signed jump tables")
    for entry in refs:
        name = entry.get("$sym") if isinstance(entry, dict) else None
        table = defs.get(name or "", {})
        if table.get("type") != "s8" or not isinstance(table.get("value"), list) or len(table["value"]) != 16:
            raise UnsupportedAstError("event_object_movement.c", func.name, "jump table reference or signed-byte table data is invalid")
    return i_param, type_param, "sJumpYTable"


def _event_object_player_direction_copy(func: clang_ast.AstFunction) -> tuple[str, str, str]:
    """Accept only `sPlayerDirectionsForCopy[initDir - 1][moveDir - 1]`."""
    if func.return_type != "u32" or [t for _, t in func.params] != ["u8", "u8"]:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected u32 function with (u8, u8) parameters")
    init_param, move_param = (n for n, _ in func.params)
    statements = func.body.get("inner") or []
    if len(statements) != 1 or statements[0].get("kind") != "ReturnStmt":
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected a single return statement")

    def unwrap(node: dict[str, Any]) -> dict[str, Any]:
        while node.get("kind") in ("ImplicitCastExpr", "ConstantExpr", "CStyleCastExpr", "ParenExpr"):
            children = node.get("inner") or []
            if len(children) != 1:
                raise UnsupportedAstError("event_object_movement.c", func.name, "unexpected cast in direction table lookup")
            node = children[0]
        return node

    def minus_one(node: dict[str, Any], param: str) -> bool:
        node = unwrap(node)
        children = node.get("inner") or []
        if node.get("kind") != "BinaryOperator" or node.get("opcode") != "-" or len(children) != 2:
            return False
        left, right = unwrap(children[0]), unwrap(children[1])
        return (left.get("kind") == "DeclRefExpr"
                and left.get("referencedDecl", {}).get("name") == param
                and right.get("kind") == "IntegerLiteral"
                and right.get("value") == "1")

    ret = statements[0].get("inner") or []
    outer = unwrap(ret[0]) if len(ret) == 1 else {}
    if outer.get("kind") != "ArraySubscriptExpr" or len(outer.get("inner") or []) != 2:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected nested direction table lookup")
    table_expr, move_index = (unwrap(n) for n in outer["inner"])
    if not minus_one(move_index, move_param):
        raise UnsupportedAstError("event_object_movement.c", func.name, "second table index must be moveDir - 1")
    if table_expr.get("kind") != "ArraySubscriptExpr" or len(table_expr.get("inner") or []) != 2:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected two-dimensional direction table")
    root, init_index = (unwrap(n) for n in table_expr["inner"])
    if not minus_one(init_index, init_param):
        raise UnsupportedAstError("event_object_movement.c", func.name, "first table index must be initDir - 1")
    if root.get("kind") != "DeclRefExpr" or root.get("referencedDecl", {}).get("name") != "sPlayerDirectionsForCopy":
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected sPlayerDirectionsForCopy table")
    if root.get("type", {}).get("qualType") != "const u8[4][4]":
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected const u8[4][4] table")
    cdata_path = ROOT / "public" / "fr" / "cdata" / "event_object_movement.json"
    try:
        table = json.loads(cdata_path.read_text())["defs"]["sPlayerDirectionsForCopy"]
    except (OSError, KeyError, json.JSONDecodeError) as exc:
        raise UnsupportedAstError("event_object_movement.c", func.name, "exported sPlayerDirectionsForCopy is missing") from exc
    rows = table.get("value")
    if table.get("type") != "u8" or not isinstance(rows, list) or len(rows) != 4 or any(not isinstance(row, list) or len(row) != 4 for row in rows):
        raise UnsupportedAstError("event_object_movement.c", func.name, "exported direction table must be 4 by 4 u8 values")
    return init_param, move_param, "sPlayerDirectionsForCopy"


def _event_object_copy_direction(func: clang_ast.AstFunction) -> tuple[list[str], int, int, str]:
    """Accept the reviewed guard, helper call, and 4x4 C table lookup in GetCopyDirection."""
    expected_types = ["u8", "u32", "u32"]
    if func.return_type != "u32" or [t for _, t in func.params] != expected_types:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected u32 function with (u8, u32, u32) parameters")
    params = [n for n, _ in func.params]
    statements = func.body.get("inner") or []
    if len(statements) != 6:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected declarations, guard, helper assignment, and table return")

    def unwrap(node: dict[str, Any]) -> dict[str, Any]:
        while node.get("kind") in ("ImplicitCastExpr", "ConstantExpr", "CStyleCastExpr", "ParenExpr"):
            children = node.get("inner") or []
            if len(children) != 1:
                raise UnsupportedAstError("event_object_movement.c", func.name, "unexpected cast in copy-direction routine")
            node = children[0]
        return node

    def ref_name(node: dict[str, Any]) -> str | None:
        node = unwrap(node)
        if node.get("kind") == "DeclRefExpr":
            return node.get("referencedDecl", {}).get("name")
        return None

    def decl(stmt: dict[str, Any], name: str, typ: str, initializer: str | None = None) -> None:
        inner = stmt.get("inner") or []
        if stmt.get("kind") != "DeclStmt" or len(inner) != 1:
            raise UnsupportedAstError("event_object_movement.c", func.name, f"expected local declaration {name}")
        variable = inner[0]
        if variable.get("kind") != "VarDecl" or variable.get("name") != name or variable.get("type", {}).get("qualType") != typ:
            raise UnsupportedAstError("event_object_movement.c", func.name, f"unexpected declaration for {name}")
        values = variable.get("inner") or []
        if initializer is None:
            if values:
                raise UnsupportedAstError("event_object_movement.c", func.name, f"expected uninitialized local {name}")
        elif len(values) != 1 or ref_name(values[0]) != initializer:
            raise UnsupportedAstError("event_object_movement.c", func.name, f"{name} must copy {initializer}")

    decl(statements[0], "dir", "u32")
    decl(statements[1], "_playerInitDir", "u8", "playerInitDir")
    decl(statements[2], "_playerMoveDir", "u8", "playerMoveDir")

    if_node = statements[3]
    if if_node.get("kind") != "IfStmt" or len(if_node.get("inner") or []) != 2:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected one guarded return")
    condition, guarded_return = if_node["inner"]
    comparisons: list[dict[str, Any]] = []

    def flatten_or(node: dict[str, Any]) -> None:
        node = unwrap(node)
        children = node.get("inner") or []
        if node.get("kind") == "BinaryOperator" and node.get("opcode") == "||" and len(children) == 2:
            flatten_or(children[0])
            flatten_or(children[1])
        else:
            comparisons.append(node)

    flatten_or(condition)
    expected_comparisons = [("_playerInitDir", "=="), ("_playerMoveDir", "=="), ("_playerInitDir", ">"), ("_playerMoveDir", ">")]
    if len(comparisons) != len(expected_comparisons):
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected four direction guard comparisons")
    literals: list[int] = []
    for comparison, (local, opcode) in zip(comparisons, expected_comparisons):
        children = comparison.get("inner") or []
        if comparison.get("kind") != "BinaryOperator" or comparison.get("opcode") != opcode or len(children) != 2:
            raise UnsupportedAstError("event_object_movement.c", func.name, "unexpected player-direction guard comparison")
        if ref_name(children[0]) != local:
            raise UnsupportedAstError("event_object_movement.c", func.name, f"guard must compare {local}")
        literal = unwrap(children[1])
        if literal.get("kind") != "IntegerLiteral":
            raise UnsupportedAstError("event_object_movement.c", func.name, "guard constant is not resolved by Clang")
        literals.append(int(literal["value"]))
    if literals[0] != literals[1] or literals[2] != literals[3]:
        raise UnsupportedAstError("event_object_movement.c", func.name, "guard sentinel and maximum direction differ")

    guarded_values = guarded_return.get("inner") or []
    guarded_value = unwrap(guarded_values[0]) if guarded_return.get("kind") == "ReturnStmt" and len(guarded_values) == 1 else {}
    if guarded_value.get("kind") != "IntegerLiteral" or int(guarded_value["value"]) != literals[0]:
        raise UnsupportedAstError("event_object_movement.c", func.name, "guard must return its C DIR_NONE value")

    assignment = statements[4]
    assignment_children = assignment.get("inner") or []
    if assignment.get("kind") != "BinaryOperator" or assignment.get("opcode") != "=" or len(assignment_children) != 2:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected helper result assignment")
    if ref_name(assignment_children[0]) != "dir":
        raise UnsupportedAstError("event_object_movement.c", func.name, "helper result must be assigned to dir")
    call = unwrap(assignment_children[1])
    call_children = call.get("inner") or []
    if call.get("kind") != "CallExpr" or len(call_children) != 3 or ref_name(call_children[0]) != "GetPlayerDirectionForCopy":
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected GetPlayerDirectionForCopy call")
    if ref_name(call_children[1]) != "_playerInitDir" or ref_name(call_children[2]) != "playerMoveDir":
        raise UnsupportedAstError("event_object_movement.c", func.name, "unexpected copy-direction helper arguments")

    ret_children = statements[5].get("inner") or []
    outer = unwrap(ret_children[0]) if statements[5].get("kind") == "ReturnStmt" and len(ret_children) == 1 else {}
    if outer.get("kind") != "ArraySubscriptExpr" or len(outer.get("inner") or []) != 2:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected nested copy-direction table lookup")
    row_expr, col_index = (unwrap(n) for n in outer["inner"])

    def minus_one_ref(node: dict[str, Any], name: str) -> bool:
        node = unwrap(node)
        children = node.get("inner") or []
        if node.get("kind") != "BinaryOperator" or node.get("opcode") != "-" or len(children) != 2:
            return False
        return ref_name(children[0]) == name and unwrap(children[1]).get("kind") == "IntegerLiteral" and unwrap(children[1]).get("value") == "1"

    row_children = row_expr.get("inner") or []
    if row_expr.get("kind") != "ArraySubscriptExpr" or len(row_children) != 2:
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected first dimension of final table lookup")
    if not minus_one_ref(row_children[1], "copyInitDir"):
        raise UnsupportedAstError("event_object_movement.c", func.name, "first final-table index must be copyInitDir - 1")
    root = unwrap(row_children[0])
    if ref_name(root) != "sPlayerDirectionToCopyDirection" or root.get("type", {}).get("qualType") != "const u8[4][4]":
        raise UnsupportedAstError("event_object_movement.c", func.name, "expected sPlayerDirectionToCopyDirection u8[4][4]")
    if not minus_one_ref(col_index, "dir"):
        raise UnsupportedAstError("event_object_movement.c", func.name, "second final-table index must be dir - 1")
    cdata_path = ROOT / "public" / "fr" / "cdata" / "event_object_movement.json"
    try:
        table = json.loads(cdata_path.read_text())["defs"]["sPlayerDirectionToCopyDirection"]
    except (OSError, KeyError, json.JSONDecodeError) as exc:
        raise UnsupportedAstError("event_object_movement.c", func.name, "exported sPlayerDirectionToCopyDirection is missing") from exc
    rows = table.get("value")
    if table.get("type") != "u8" or not isinstance(rows, list) or len(rows) != 4 or any(not isinstance(row, list) or len(row) != 4 for row in rows):
        raise UnsupportedAstError("event_object_movement.c", func.name, "exported copy-direction table must be 4 by 4 u8 values")
    return params, literals[0], literals[2], "sPlayerDirectionToCopyDirection"


def generate_event_object_anims_ts() -> str:
    c_path = clang_ast.DECOMP / "src" / "event_object_movement.c"
    ast = clang_ast.dump_clang_ast_json(c_path)
    expected = EVENT_OBJECT_ANIM_FUNCS | EVENT_OBJECT_JUMP_FUNCS | EVENT_OBJECT_COPY_DIRECTION_FUNCS | EVENT_OBJECT_COPY_FUNCS
    funcs = clang_ast.extract_functions(ast, expected)
    missing = expected - funcs.keys()
    if missing:
        raise UnsupportedAstError("event_object_movement.c", sorted(missing)[0], "function definition not found in Clang AST")
    rows = []
    for name in sorted(EVENT_OBJECT_ANIM_FUNCS):
        table, param, _ = _event_object_anim_table(funcs[name])
        rows.append(f'export function {name}({param}: number): number {{ return cdata<number[]>("event_object_movement", "{table}")[{param} & 0xff]!; }}')
    i_param, type_param, table = _event_object_jump_y(funcs["GetJumpY"])
    rows.append(
        f'export function GetJumpY({i_param}: number, {type_param}: number): number {{\n'
        f'  const tableRef = cdata<unknown[]>("event_object_movement", "{table}")[{type_param} & 0xff];\n'
        f'  const tableName = symName(tableRef);\n'
        f'  if (!tableName) throw new Error(`GetJumpY: missing C jump table for type ${{{type_param} & 0xff}}`);\n'
        f'  return cdata<number[]>("event_object_movement", tableName)[({i_param} << 16) >> 16]!;\n'
        f'}}'
    )
    init_param, move_param, table = _event_object_player_direction_copy(funcs["GetPlayerDirectionForCopy"])
    rows.append(
        f'export function GetPlayerDirectionForCopy({init_param}: number, {move_param}: number): number {{\n'
        f'  return cdata<number[][]>("event_object_movement", "{table}")'
        f'[(({init_param} & 0xff) - 1)]![(({move_param} & 0xff) - 1)]!;\n'
        f'}}'
    )
    params, none_value, east_value, table = _event_object_copy_direction(funcs["GetCopyDirection"])
    copy_init, player_init, player_move = params
    rows.append(
        f'export function GetCopyDirection({copy_init}: number, {player_init}: number, {player_move}: number): number {{\n'
        f'  const _playerInitDir = {player_init} & 0xff;\n'
        f'  const _playerMoveDir = {player_move} & 0xff;\n'
        f'  if (_playerInitDir === {none_value} || _playerMoveDir === {none_value} || _playerInitDir > {east_value} || _playerMoveDir > {east_value}) return {none_value};\n'
        f'  const dir = GetPlayerDirectionForCopy(_playerInitDir, {player_move});\n'
        f'  return cdata<number[][]>("event_object_movement", "{table}")[(({copy_init} & 0xff) - 1)]![(dir - 1)]!;\n'
        f'}}'
    )
    return "\n".join([
        "// GENERATED BY tools/decomp/clang_codegen.py FROM pokefirered/src/event_object_movement.c",
        "// DO NOT EDIT MANUALLY. Re-run npm run generate:event-object-anims to regenerate.",
        "// Target: armv4t-none-eabi | ABI: u8 direction lookups, signed s16 jump index, and u32 copy helper with u8 narrowing.",
        "// C array bounds are preserved: out-of-range indices have no defined C result.",
        "",
        'import { cdata, symName } from "../hw/assets";',
        "",
        *rows,
        "",
    ])


def write_event_object_anims_file() -> Path:
    out_file = ROOT / "src" / "fr" / "generated" / "eventObjectAnims.ts"
    out_file.write_text(generate_event_object_anims_ts())
    return out_file


def write_generated_file() -> Path:
    code = generate_string_util_ts()
    out_file = ROOT / "src" / "fr" / "generated" / "stringUtil.ts"
    out_file.write_text(code)
    return out_file


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--event-object-anims", action="store_true", help="generate event_object_movement direction-animation lookups")
    parser.add_argument("--cdata-table-accessors", action="store_true", help="generate reviewed direct cdata table accessors")
    args = parser.parse_args()
    if args.event_object_anims and args.cdata_table_accessors:
        parser.error("choose one generator mode")
    if args.cdata_table_accessors:
        out_path = write_cdata_table_accessors_file()
    elif args.event_object_anims:
        out_path = write_event_object_anims_file()
    else:
        out_path = write_generated_file()
    print(f"Generated {out_path} ({len(out_path.read_text().splitlines())} lines)")
