"""Fail-closed audit for ClangTsEmitter: which C constructs of a function are inside the model the generator implements.

The generator models exactly this:
  * integer/boolean expressions, conditions, loops, switch, calls by name with scalar arguments (INT, clang_intsem.py);
  * byte buffers: `u8`/`char` pointer parameters and locals used as (buffer, offset) cursors, `*p`, `p[i]`, `*p++`, `p +/- n`,
    `p = ...`, `&p[i]`, passed to other generated functions;
  * the two save-block pointers in SYMBOL_MAP with member access, the string buffers and placeholder texts in SYMBOL_MAP;
  * const integer arrays with an initialiser (and one local table of function references), `sizeof(a) / sizeof(a[0])`;
  * scalar and one-dimensional scalar-array globals, referenced by name (the TS module must provide the same name).

Everything else is reported with an UNSUPPORTED_* code instead of producing plausible but wrong TypeScript. The audit is
structural (it looks at Clang node kinds, types and cast kinds), never at source text.
"""

from __future__ import annotations

import re
from typing import Any

# Most fundamental reason first: used to pick the primary reason of a rejected function.
PRIORITY = [
    "UNSUPPORTED_ASM", "UNSUPPORTED_GOTO", "UNSUPPORTED_HARDWARE_ACCESS", "UNSUPPORTED_LONG_LONG", "UNSUPPORTED_FLOAT",
    "UNSUPPORTED_UNION", "UNSUPPORTED_STRUCT_VALUE", "UNSUPPORTED_STRUCT_ACCESS", "UNSUPPORTED_STRUCT_POINTER",
    "UNSUPPORTED_ADDRESS_OF_LOCAL", "UNSUPPORTED_ADDRESS_OF_MEMBER", "UNSUPPORTED_ADDRESS_OF_ELEMENT", "UNSUPPORTED_ADDRESS_OF_GLOBAL",
    "UNSUPPORTED_POINTER_INTEGER_CAST", "UNSUPPORTED_POINTER_CAST", "UNSUPPORTED_WIDE_POINTER", "UNSUPPORTED_VOID_POINTER",
    "UNSUPPORTED_POINTER_TO_POINTER", "UNSUPPORTED_POINTER_DEREFERENCE", "UNSUPPORTED_POINTER_ARITHMETIC", "UNSUPPORTED_POINTER_COMPARE",
    "UNSUPPORTED_POINTER_NULL", "UNSUPPORTED_POINTER_ASSIGN", "UNSUPPORTED_CALL_POINTER_ARGS", "UNSUPPORTED_INDIRECT_CALL",
    "UNSUPPORTED_VARARGS", "UNSUPPORTED_LOCAL_ARRAY", "UNSUPPORTED_MULTIDIM_ARRAY", "UNSUPPORTED_SIZEOF",
    "UNSUPPORTED_STATEMENT_EXPRESSION", "UNSUPPORTED_STATEMENT", "UNSUPPORTED_EXPRESSION",
    "UNSUPPORTED_POINTER_MODEL", "UNSUPPORTED_FUNCTION_TABLE", "UNSUPPORTED_POINTER_RETURN",
]

BYTE = {"unsigned char", "char"}
_CV = re.compile(r"\b(const|volatile)\b")


_TYPEDEFS = {
    "u8": "unsigned char", "s8": "signed char", "bool8": "unsigned char", "vu8": "unsigned char", "vs8": "signed char",
    "u16": "unsigned short", "s16": "short", "bool16": "unsigned short", "vu16": "unsigned short", "vs16": "short",
    "u32": "unsigned int", "s32": "int", "bool32": "unsigned int", "vu32": "unsigned int", "vs32": "int",
    "u64": "unsigned long long", "s64": "long long", "vu64": "unsigned long long",
}
_TD = re.compile(r"\b(" + "|".join(_TYPEDEFS) + r")\b")


def norm_type(q: str) -> str:
    """Type text with GBA typedefs resolved (Clang leaves them in a pointer's qualType when no desugared name is given)."""
    return re.sub(r"\s+", " ", _TD.sub(lambda m: _TYPEDEFS[m.group(1)], _CV.sub("", q))).strip().replace(" *", " *").replace("* *", "**")


def qt(node: dict[str, Any]) -> str:
    t = node.get("type", {})
    return norm_type(t.get("desugaredQualType") or t.get("qualType", ""))


def is_func_ptr(t: str) -> bool:
    return "(*" in t


def is_ptr(t: str) -> bool:
    return t.endswith("*") and not is_func_ptr(t)


def pointee(t: str) -> str:
    return t.rstrip("*").strip()


def _unwrap(n: dict[str, Any]) -> dict[str, Any]:
    while n.get("kind") in ("ParenExpr", "ImplicitCastExpr", "CStyleCastExpr", "ConstantExpr") and n.get("inner"):
        if n["kind"] in ("ImplicitCastExpr", "CStyleCastExpr") and n.get("castKind") not in ("LValueToRValue", "NoOp", "ArrayToPointerDecay"):
            break
        n = n["inner"][0]
    return n


def _strip_casts(n: dict[str, Any]) -> dict[str, Any]:
    while n.get("kind") in ("ParenExpr", "ImplicitCastExpr", "CStyleCastExpr") and n.get("inner"):
        n = n["inner"][0]
    return n


def _ref(n: dict[str, Any]) -> dict[str, Any] | None:
    n = _unwrap(n)
    return n.get("referencedDecl") if n.get("kind") == "DeclRefExpr" else None


def _type_reason(t: str, where: str) -> tuple[str, str] | None:
    """Reason a declared type (parameter, local, return, expression) is outside the model, or None."""
    if re.search(r"\b(float|double)\b", t):
        return "UNSUPPORTED_FLOAT", f"{where}: {t}"
    if "long long" in t or re.search(r"\b[us]64\b", t):
        return "UNSUPPORTED_LONG_LONG", f"{where}: {t}"
    if "union " in t:
        return "UNSUPPORTED_UNION", f"{where}: {t}"
    if is_func_ptr(t):
        return None
    if "][" in t:
        return "UNSUPPORTED_MULTIDIM_ARRAY", f"{where}: {t}"
    base = re.sub(r"\s*\[\d*\]", "", t).strip()
    if base.endswith("*"):
        base = base.rstrip("*").strip()
        if t.count("*") > 1:
            return "UNSUPPORTED_POINTER_TO_POINTER", f"{where}: {t}"
        if base.startswith("struct "):
            return "UNSUPPORTED_STRUCT_POINTER", f"{where}: {t}"
        if base == "void":
            return "UNSUPPORTED_VOID_POINTER", f"{where}: {t}"
        if base not in BYTE:
            return "UNSUPPORTED_WIDE_POINTER", f"{where}: {t} (the buffer model is byte-granular)"
    elif base.startswith("struct "):
        return "UNSUPPORTED_STRUCT_VALUE", f"{where}: {t}"
    return None


def audit(
    func: Any,
    *,
    modeled_globals: set[str],
    known_functions: set[str],
    modeled_members: set[str] | None = None,
) -> list[tuple[str, str]]:
    """All out-of-model constructs of a function as (code, detail), in traversal order."""
    out: list[tuple[str, str]] = []

    def add(code: str, detail: str) -> None:
        out.append((code, detail))

    # ---- signature
    for pname, ptype in func.params:
        t = norm_type(ptype)
        r = _type_reason(t, f"parameter {pname}")
        if r:
            add(*r)
        elif is_func_ptr(t):  # a callback is not a byte cursor: the model has no function values
            add("UNSUPPORTED_INDIRECT_CALL", f"function-pointer parameter {pname}: {t}")
    rt = norm_type(func.return_type)
    r = _type_reason(rt, "return type")
    if r:
        add(*r)
    elif is_func_ptr(rt):
        add("UNSUPPORTED_INDIRECT_CALL", f"function-pointer return type: {rt}")

    # ---- local table of function references is the only modeled indirect call
    fn_tables: set[str] = set()
    local_ids: set[str] = set()

    def collect(n: dict[str, Any]) -> None:
        if n.get("kind") == "VarDecl":
            local_ids.add(n.get("id", ""))
            for il in (c for c in n.get("inner", []) if c.get("kind") == "InitListExpr"):  # array whose initialisers are all function names
                els = [_strip_casts(e) for e in il.get("inner", [])]
                if els and all(e.get("kind") == "DeclRefExpr" and e.get("referencedDecl", {}).get("kind") == "FunctionDecl" for e in els):
                    fn_tables.add(n.get("id", ""))
        for c in n.get("inner") or []:
            if isinstance(c, dict):
                collect(c)

    collect(func.body)

    def modeled_ptr_expr(n: dict[str, Any]) -> bool:
        """A byte-pointer expression built only from forms the cursor model implements."""
        n = _unwrap(n)
        k = n.get("kind")
        if k == "DeclRefExpr":
            return True
        if k == "MemberExpr":
            return _root_modeled(n)
        if k == "UnaryOperator" and n.get("opcode") in ("++", "--"):
            return modeled_ptr_expr(n["inner"][0])
        if k == "BinaryOperator" and n.get("opcode") in ("+", "-"):
            a, b = n["inner"]
            return (is_ptr(qt(a)) or qt(a).endswith("]")) and not is_ptr(qt(b)) and modeled_ptr_expr(a)
        if k == "CallExpr":
            return True  # the callee rules below decide
        if k == "UnaryOperator" and n.get("opcode") == "&":
            sub = _unwrap(n["inner"][0])
            return sub.get("kind") == "ArraySubscriptExpr"
        return False

    def _root_modeled(n: dict[str, Any]) -> bool:
        while True:
            n = _unwrap(n)
            k = n.get("kind")
            if k in ("MemberExpr", "ArraySubscriptExpr"):
                n = n["inner"][0]
                continue
            if k == "DeclRefExpr":
                return n.get("referencedDecl", {}).get("name") in modeled_globals
            return False

    def visit(n: dict[str, Any], parent: dict[str, Any] | None) -> None:
        k = n.get("kind")
        t = qt(n) if n.get("type") else ""
        # ---- statements
        if k == "GotoStmt" or k == "LabelStmt":
            add("UNSUPPORTED_GOTO", "goto/label")
        elif k == "GCCAsmStmt":
            add("UNSUPPORTED_ASM", "inline assembly")
        elif k == "StmtExpr":
            add("UNSUPPORTED_STATEMENT_EXPRESSION", "GNU statement expression")
        elif k in ("DoStmt", "ContinueStmt", "NullStmt"):
            add("UNSUPPORTED_STATEMENT", k)
        elif k in ("FloatingLiteral",):
            add("UNSUPPORTED_FLOAT", "floating literal")
        elif k in ("CompoundLiteralExpr", "StringLiteral", "VAArgExpr", "OffsetOfExpr", "GenericSelectionExpr"):
            add("UNSUPPORTED_EXPRESSION", k)
        # ---- declarations
        elif k == "VarDecl":
            vt = norm_type(n.get("type", {}).get("qualType", ""))
            r = _type_reason(qt(n) if qt(n) else vt, f"local {n.get('name', '')}")
            if r:
                add(*r)
            elif is_ptr(qt(n)) and n.get("inner") and not modeled_ptr_expr(n["inner"][-1]):
                add("UNSUPPORTED_POINTER_ASSIGN", f"pointer local {n.get('name', '')} initialised from outside the cursor model")
            elif "[" in vt and (m := re.search(r"\[(\d+)\]", vt)) and any(
                    c.get("kind") == "InitListExpr" and len(c.get("inner", [])) != int(m.group(1)) for c in n.get("inner", [])):
                add("UNSUPPORTED_LOCAL_ARRAY", f"array {n.get('name', '')} partially initialised (implicit zero fill is not emitted)")
            elif "[" in vt and not is_func_ptr(qt(n)):
                inits = [c for c in n.get("inner", []) if c.get("kind") == "InitListExpr"]
                if not inits:
                    add("UNSUPPORTED_LOCAL_ARRAY", f"array {n.get('name', '')} without an initialiser list")
                elif any(_strip_casts(e).get("kind") not in ("IntegerLiteral", "CharacterLiteral", "DeclRefExpr", "UnaryOperator", "BinaryOperator", "ConstantExpr")
                         for e in inits[0].get("inner", [])):
                    add("UNSUPPORTED_LOCAL_ARRAY", f"array {n.get('name', '')} with non-scalar initialisers")
            elif is_func_ptr(qt(n)) and "[" not in vt:
                add("UNSUPPORTED_INDIRECT_CALL", f"function-pointer local {n.get('name', '')}")
        # ---- struct / member access
        elif k == "MemberExpr":
            base = n["inner"][0]
            if "union " in qt(base) or "union " in t:
                add("UNSUPPORTED_UNION", "member of a union")
            elif not _root_modeled(n):
                add("UNSUPPORTED_STRUCT_ACCESS", f".{n.get('name', '')} on a struct the generator does not model")
            elif modeled_members is not None and n.get("name") not in modeled_members:
                add("UNSUPPORTED_STRUCT_ACCESS", f".{n.get('name', '')} is not one of the modeled save-block fields")
        # ---- address-of / dereference / pointer arithmetic
        elif k == "UnaryOperator":
            op = n.get("opcode")
            sub = n["inner"][0]
            if op == "&":
                s = _unwrap(sub)
                sk = s.get("kind")
                if sk == "ArraySubscriptExpr":
                    b = _unwrap(s["inner"][0])
                    br = _ref(b)
                    if not (br and is_ptr(qt(b))):
                        add("UNSUPPORTED_ADDRESS_OF_ELEMENT", "& of an element of something other than a byte-pointer cursor")
                elif sk == "MemberExpr":
                    add("UNSUPPORTED_ADDRESS_OF_MEMBER", "&struct.field")
                elif sk == "DeclRefExpr":
                    add("UNSUPPORTED_ADDRESS_OF_LOCAL" if s.get("referencedDecl", {}).get("id") in local_ids or s.get("referencedDecl", {}).get("kind") == "ParmVarDecl"
                        else "UNSUPPORTED_ADDRESS_OF_GLOBAL", "& of a variable")
                else:
                    add("UNSUPPORTED_ADDRESS_OF_ELEMENT", f"& of {sk}")
            elif op == "*":
                if not modeled_ptr_expr(sub) or not (is_ptr(qt(_unwrap(sub))) or qt(_unwrap(sub)).endswith("]")):
                    add("UNSUPPORTED_POINTER_DEREFERENCE", "dereference outside the cursor model")
            elif op in ("++", "--") and is_ptr(qt(sub)) and not modeled_ptr_expr(sub):
                add("UNSUPPORTED_POINTER_ARITHMETIC", "++/-- on a pointer outside the cursor model")
        elif k in ("BinaryOperator", "CompoundAssignOperator"):
            op = n.get("opcode")
            a, b = n["inner"][0], n["inner"][1]
            ta, tb = qt(a), qt(b)
            pa, pb = is_ptr(ta), is_ptr(tb)
            if op in ("<", ">", "<=", ">=", "==", "!=") and (pa or pb):
                add("UNSUPPORTED_POINTER_COMPARE", "comparison involving a pointer (the cursor is an offset, not an address)")
            elif op == "-" and pa and pb:
                add("UNSUPPORTED_POINTER_ARITHMETIC", "pointer difference")
            elif op in ("+", "-", "+=", "-=") and (pa or pb) and not ((pa != pb) and modeled_ptr_expr(a if pa else b)):
                add("UNSUPPORTED_POINTER_ARITHMETIC", "pointer +/- outside the cursor model")
            elif op in ("&&", "||") and (pa or pb):
                add("UNSUPPORTED_POINTER_NULL", "pointer truthiness (a null pointer is not offset 0)")
            elif op == "=" and pa and (not modeled_ptr_expr(b) or _unwrap(a).get("kind") != "DeclRefExpr"):
                add("UNSUPPORTED_POINTER_ASSIGN", "pointer stored anywhere but a pointer local/parameter, or assigned from outside the cursor model")
            elif op == "=" and t.startswith("struct "):
                add("UNSUPPORTED_STRUCT_VALUE", "struct assignment")
        elif k == "ConditionalOperator" and is_ptr(t):
            add("UNSUPPORTED_POINTER_ASSIGN", "pointer selected by ?:")
        # ---- casts
        elif k in ("ImplicitCastExpr", "CStyleCastExpr"):
            ck = n.get("castKind")
            if ck in ("PointerToIntegral", "IntegralToPointer"):
                inner = _unwrap(n["inner"][0])
                hw = ck == "IntegralToPointer" and (inner.get("kind") in ("IntegerLiteral", "ConstantExpr") or "value" in inner)
                add("UNSUPPORTED_HARDWARE_ACCESS" if hw else "UNSUPPORTED_POINTER_INTEGER_CAST", f"{ck}")
            elif ck == "BitCast":
                src = qt(n["inner"][0])
                if not (is_ptr(t) and is_ptr(src) and pointee(t) in BYTE and pointee(src) in BYTE):
                    add("UNSUPPORTED_POINTER_CAST", f"{src} -> {t}")
            elif ck == "NullToPointer":
                add("UNSUPPORTED_POINTER_NULL", "NULL pointer value")
            elif ck == "PointerToBoolean":
                add("UNSUPPORTED_POINTER_NULL", "pointer truthiness (a null pointer is not offset 0)")
        # ---- calls
        elif k == "ReturnStmt" and is_ptr(norm_type(func.return_type)):
            rv = _unwrap(n["inner"][0]) if n.get("inner") else {}
            rd = rv.get("referencedDecl") if rv.get("kind") == "DeclRefExpr" else None
            global_array = rd and rd.get("kind") == "VarDecl" and rd.get("id") not in local_ids and "]" in norm_type(rd.get("type", {}).get("qualType", ""))
            if not (global_array or (rv and modeled_ptr_expr(n["inner"][0]))):
                add("UNSUPPORTED_POINTER_RETURN", "pointer return other than a global array or a byte cursor")
        elif k == "CallExpr" and is_ptr(t) and not _cursor_call(n, known_functions) and not (
                _strip_casts(n["inner"][0]).get("kind") == "ArraySubscriptExpr"
                and (_ref(_strip_casts(n["inner"][0])["inner"][0]) or {}).get("id") in fn_tables):
            add("UNSUPPORTED_POINTER_RETURN", "call returning a pointer: the buffer/offset pair is not reconstructed")
        elif k == "CallExpr":
            callee = _strip_casts(n["inner"][0])
            cr = callee.get("referencedDecl") if callee.get("kind") == "DeclRefExpr" else None
            if cr and cr.get("kind") == "FunctionDecl":
                if "..." in cr.get("type", {}).get("qualType", ""):
                    add("UNSUPPORTED_VARARGS", f"call to variadic {cr.get('name')}")
                ptr_args = [a for a in n["inner"][1:] if is_ptr(qt(a))]
                if ptr_args and cr.get("name") not in known_functions:
                    add("UNSUPPORTED_CALL_POINTER_ARGS", f"{cr.get('name')} receives a pointer but is not generated with the (buffer, offset) convention")
                for a in ptr_args:
                    if _unwrap(a).get("kind") not in ("DeclRefExpr", "MemberExpr"):
                        add("UNSUPPORTED_POINTER_ARITHMETIC", f"pointer expression passed to {cr.get('name')}: only a plain buffer travels with its offset")
            elif callee.get("kind") == "ArraySubscriptExpr" and _ref(callee["inner"][0]) and _ref(callee["inner"][0]).get("id") in fn_tables:
                pass
            else:
                add("UNSUPPORTED_INDIRECT_CALL", "call through a function pointer other than the local reference table")
        elif k == "UnaryExprOrTypeTraitExpr":
            p = parent or {}
            arg = _CV.sub("", (n.get("argType") or (n["inner"][0].get("type") if n.get("inner") else {}) or {}).get("qualType", ""))
            in_div = p.get("kind") == "BinaryOperator" and p.get("opcode") == "/" and _strip_casts(p["inner"][0]).get("kind") == "UnaryExprOrTypeTraitExpr"
            if not (in_div and n.get("name") == "sizeof" and (p["inner"][0] is not n or "[" in arg)):
                add("UNSUPPORTED_SIZEOF", "sizeof outside sizeof(array) / sizeof(element)")
        if k == "DeclRefExpr":  # a pointer stored in a global has no offset companion
            gd = n.get("referencedDecl") or {}
            if (gd.get("kind") == "VarDecl" and gd.get("id") not in local_ids and gd.get("name") not in modeled_globals
                    and is_ptr(norm_type(gd.get("type", {}).get("qualType", "")))):
                add("UNSUPPORTED_POINTER_MODEL", f"global pointer variable {gd.get('name')}")
        # ---- any other expression typed with something outside the model
        index_base = (parent is not None and parent.get("kind") == "ArraySubscriptExpr" and parent["inner"][0] is n
                      and k == "ImplicitCastExpr" and n.get("castKind") == "ArrayToPointerDecay")  # a[i]: indexing a scalar array, not a pointer value
        if k in ("DeclRefExpr", "ArraySubscriptExpr", "CallExpr", "ImplicitCastExpr", "CStyleCastExpr", "UnaryOperator", "BinaryOperator") and t and not index_base:
            root_ok = False
            rr = _ref(n) if k == "DeclRefExpr" else None
            if rr is not None and rr.get("name") in modeled_globals:
                root_ok = True  # gSaveBlock*Ptr and friends: only reachable through member access, checked above
            if not root_ok and not (is_func_ptr(t) or t.startswith("void (")):
                if is_ptr(t) and pointee(t) not in BYTE:
                    base = pointee(t)
                    if base.startswith("struct ") and not (parent and parent.get("kind") in ("MemberExpr", "ImplicitCastExpr")):
                        add("UNSUPPORTED_STRUCT_POINTER", f"expression of type {t}")
                    elif not base.startswith("struct "):
                        r = _type_reason(t, "expression")
                        if r:
                            add(*r)
                elif t.startswith("struct ") and k == "DeclRefExpr" and not (parent and parent.get("kind") in ("MemberExpr", "ArraySubscriptExpr", "ImplicitCastExpr")):
                    add("UNSUPPORTED_STRUCT_VALUE", f"struct-typed expression {t}")
                elif re.search(r"\b(float|double)\b", t) or "long long" in t or "union " in t:
                    r = _type_reason(t, "expression")
                    if r:
                        add(*r)
        for c in n.get("inner") or []:
            if isinstance(c, dict):
                visit(c, n)

    visit(func.body, None)
    return out


def _cursor_call(n: dict[str, Any], known: Any) -> bool:
    """Call to a function already generated under the (buffer, offset) convention."""
    callee = _strip_casts(n["inner"][0])
    cr = callee.get("referencedDecl") if callee.get("kind") == "DeclRefExpr" else None
    if not cr or cr.get("name") not in known:
        return False
    return True  # its own return statements were audited (global array or byte cursor); local uses are re-checked by the pointer-assign rules


def primary(reasons: list[tuple[str, str]]) -> tuple[str, str]:
    order = {c: i for i, c in enumerate(PRIORITY)}
    return min(reasons, key=lambda r: order.get(r[0], len(PRIORITY)))
