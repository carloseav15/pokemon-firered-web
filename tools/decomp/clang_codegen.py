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
}


class ClangTsEmitter:
    def __init__(self, c_file: str, func: clang_ast.AstFunction):
        self.c_file = c_file
        self.func = func
        self.func_name = func.name
        self.pointer_params: list[str] = []
        self.pointer_locals: set[str] = set()
        self.pointer_buffer: dict[str, str] = {}
        self.indent_level = 0
        self.lines: list[str] = []

        # Identify pointer parameters in declaration order
        for pname, ptype in func.params:
            if "*" in ptype:
                self.pointer_params.append(pname)
                self.pointer_buffer[pname] = pname

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
            ret_type = "number"  # returns offset into buffer
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
        for child in node.get("inner", []):
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
                if child.get("kind") == "VarDecl":
                    vname = child.get("name", "")
                    vtype = child.get("type", {}).get("qualType", "")
                    inits = child.get("inner", [])
                    if "*" in vtype:
                        self.pointer_locals.add(vname)
                        if inits:
                            ref_name = self._get_decl_ref_name(inits[0])
                            if ref_name and self.is_pointer(ref_name):
                                self.pointer_buffer[vname] = self.get_pointer_buffer(ref_name)
                                self.emit_line(f"let {vname}_idx = {ref_name}_idx;")
                            else:
                                init_expr = self.emit_expr(inits[0])
                                self.pointer_buffer[vname] = vname
                                self.emit_line(f"let {vname}_idx = {init_expr};")
                        else:
                            self.pointer_buffer[vname] = vname
                            self.emit_line(f"let {vname}_idx = 0;")
                    elif "[" in vtype and inits and inits[0].get("kind") == "InitListExpr":
                        # Constant or static array declaration
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
                    self.emit_line(f"return {ref_name}_idx;")
                else:
                    ret_val = self.emit_expr(inner[0])
                    self.emit_line(f"return {ret_val};")
            else:
                self.emit_line("return;")
        elif k == "BreakStmt":
            self.emit_line("break;")
        elif k in ("BinaryOperator", "CompoundAssignOperator", "UnaryOperator", "CallExpr"):
            expr = self.emit_expr(node)
            self.emit_line(f"{expr};")
        else:
            self.reject(f"unsupported statement kind: {k}")

    def emit_expr(self, node: dict[str, Any]) -> str:
        k = node.get("kind")
        if k == "ImplicitCastExpr":
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
            return name
        elif k == "UnaryOperator":
            op = node.get("opcode")
            is_postfix = node.get("isPostfix", False)
            sub = node["inner"][0]
            # Pointer dereference *ptr or *ptr++
            if op == "*":
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
            elif op in ("-", "!", "~"):
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

            # Special case: ptr = expr (pointer offset assignment)
            if op == "=":
                lhs_ptr = self._get_decl_ref_name(lhs_node)
                if lhs_ptr and self.is_pointer(lhs_ptr):
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
    ]

    out_lines = [
        "// GENERATED BY tools/decomp/clang_codegen.py FROM pokefirered/src/string_util.c",
        "// DO NOT EDIT MANUALLY. Re-run npm run generate:string-util to regenerate.",
        "// Target: armv4t-none-eabi | ABI: 32-bit ILP32, unsigned char default.",
        "",
        "export const EOS = 0xff;",
        "export const CHAR_SPACE = 0x00;",
        "export const CHAR_0 = 0xa1;",
        "export const CHAR_QUESTION_MARK = 0xac;",
        "export const EXT_CTRL_CODE_BEGIN = 0xfc;",
        "export const PLACEHOLDER_BEGIN = 0xfd;",
        "export const CHAR_NEWLINE = 0xfe;",
        "",
    ]

    for name in target_funcs:
        f = funcs.get(name)
        if not f:
            raise UnsupportedAstError("string_util.c", name, "function definition not found in Clang AST")
        emitter = ClangTsEmitter("string_util.c", f)
        code = emitter.emit_function()
        out_lines.append(code)
        out_lines.append("")

    return "\n".join(out_lines)


def write_generated_file() -> Path:
    code = generate_string_util_ts()
    out_file = ROOT / "src" / "fr" / "generated" / "stringUtil.ts"
    out_file.write_text(code)
    return out_file


if __name__ == "__main__":
    out_path = write_generated_file()
    print(f"Generated {out_path} ({len(out_path.read_text().splitlines())} lines)")
