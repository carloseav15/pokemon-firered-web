"""Convert the constant data definitions of decomp C files into JSON.

Each file is run through the C preprocessor with the build's defines and
through preproc (so _("...") strings become charmap bytes), then a small C
parser extracts:

* enum values (so identifiers in initializers resolve to numbers),
* struct/union field order (so positional initializers get field names),
* every top-level `name = initializer;` definition.

Values are emitted as JSON: numbers, arrays, objects keyed by field name,
and {"$sym": name, "index"?: n, "offset"?: n} for references to other
symbols (functions, arrays, INCBIN data, ...). Callers on the TS side
resolve those references by name.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

from common import BIN, BUILD, CPP_DEFINES, DECOMP, GEN_INCLUDE, OUT, write_json

INCBIN_MACROS = ("INCBIN", "INCBIN_U8", "INCBIN_U16", "INCBIN_U32", "INCBIN_S8", "INCBIN_S16", "INCBIN_S32")
BASE_TYPES = {"u8", "u16", "u32", "u64", "s8", "s16", "s32", "s64", "vu8", "vu16", "vu32", "bool8", "bool16", "bool32", "int", "unsigned", "signed", "char", "short", "long", "void", "float", "double", "const", "volatile", "static", "EWRAM_DATA", "IWRAM_DATA", "ALIGNED"}

TOKEN_RE = re.compile(r"""
    (?P<ws>\s+|//[^\n]*|/\*.*?\*/)
  | (?P<num>0[xX][0-9a-fA-F]+[uUlL]*|\d+\.\d*(?:[eE][-+]?\d+)?[fF]?|\d+[uUlL]*)
  | (?P<id>[A-Za-z_]\w*)
  | (?P<str>"(?:\\.|[^"\\])*")
  | (?P<chr>'(?:\\.|[^'\\])')
  | (?P<op><<=|>>=|\.\.\.|->|<<|>>|<=|>=|==|!=|&&|\|\||\+\+|--|[-+*/%&|^~!<>=?:;,.(){}\[\]#])
""", re.S | re.X)


def tokenize(text: str) -> list[str]:
    tokens = []
    pos = 0
    n = len(text)
    while pos < n:
        m = TOKEN_RE.match(text, pos)
        if not m:
            pos += 1
            continue
        pos = m.end()
        if m.lastgroup == "ws":
            continue
        tokens.append(m.group(0))
    return tokens


def preprocess(path: Path) -> str:
    defines = [f"-D{m}(...)=__INCBIN__(__VA_ARGS__)" for m in INCBIN_MACROS]
    include_args = ["-I", str(GEN_INCLUDE), "-iquote", "include", "-I", "include", "-I", "src", "-I", str(BUILD)]
    pre = subprocess.run(["clang", "-E", "-P", "-x", "c", "-U__APPLE__", "-w", *defines, *CPP_DEFINES, *include_args, str(path)], cwd=DECOMP, capture_output=True)
    i_path = BUILD / f"cdata_{path.stem}.i"
    i_path.write_bytes(pre.stdout)
    enc = subprocess.run([str(BIN / "preproc"), str(i_path), "charmap.txt"], cwd=DECOMP, capture_output=True)
    return enc.stdout.decode("utf-8", errors="replace")


class Unresolved(Exception):
    pass


class CParser:
    def __init__(self, tokens: list[str], incbin_sizes: dict[str, int]):
        self.t = tokens
        self.i = 0
        self.enums: dict[str, int] = {}
        self.structs: dict[str, list[tuple[str, str | None, bool]]] = {}  # name -> [(field, structType, isArray)]
        self.typedefs: dict[str, str] = {}
        self.defs: dict[str, dict] = {}
        self.incbin_sizes = incbin_sizes

    # ------------------------------------------------------------ helpers
    def peek(self, k: int = 0) -> str | None:
        j = self.i + k
        return self.t[j] if j < len(self.t) else None

    def skip_balanced(self, open_: str, close: str) -> None:
        depth = 0
        while self.i < len(self.t):
            tok = self.t[self.i]
            self.i += 1
            if tok == open_:
                depth += 1
            elif tok == close:
                depth -= 1
                if depth == 0:
                    return

    # ------------------------------------------------------------ top level
    def parse(self) -> None:
        while self.i < len(self.t):
            start = self.i
            try:
                self.top_level()
            except Exception:  # noqa: BLE001 - skip to the next declaration
                self.i = start
                self.skip_statement()

    def skip_statement(self) -> None:
        depth = 0
        while self.i < len(self.t):
            tok = self.t[self.i]
            self.i += 1
            if tok in "({[":
                depth += 1
            elif tok in ")}]":
                depth -= 1
                if depth == 0 and tok == "}" and self.peek() != ";" and self.peek() != ",":
                    return
            elif tok == ";" and depth <= 0:
                return

    def top_level(self) -> None:
        tok = self.peek()
        if tok == ";":
            self.i += 1
            return
        if tok == "typedef":
            self.parse_typedef()
            return
        if tok == "enum" and (self.peek(1) == "{" or self.peek(2) == "{"):
            self.i += 1
            if self.peek() != "{":
                self.i += 1
            self.parse_enum_body()
            self.skip_to_semicolon()
            return
        if tok in ("struct", "union") and (self.peek(2) == "{"):
            name = self.peek(1)
            self.i += 2
            self.structs[name] = self.parse_struct_body()
            self.skip_to_semicolon()
            return
        # Declaration or function definition.
        decl_start = self.i
        depth = 0
        eq = -1
        while self.i < len(self.t):
            tok = self.t[self.i]
            if tok == "(":
                depth += 1
            elif tok == ")":
                depth -= 1
            elif tok == "{" and depth == 0 and eq < 0:
                # function body
                self.skip_balanced("{", "}")
                return
            elif tok == "=" and depth == 0:
                eq = self.i
                break
            elif tok == ";" and depth == 0:
                self.i += 1
                return
            self.i += 1
        if eq < 0:
            return
        decl = self.t[decl_start:eq]
        name, base_type, array = self.declarator(decl)
        self.i = eq + 1
        value = self.parse_initializer(base_type, array)
        self.skip_to_semicolon()
        if name:
            self.defs[name] = {"type": base_type, "value": value}

    def skip_to_semicolon(self) -> None:
        while self.i < len(self.t) and self.t[self.i] != ";":
            if self.t[self.i] in "({[":
                self.skip_balanced(self.t[self.i], {"(": ")", "{": "}", "[": "]"}[self.t[self.i]])
                continue
            self.i += 1
        self.i += 1

    def declarator(self, decl: list[str]) -> tuple[str | None, str | None, bool]:
        # name is the last identifier before the first '[' (or the end), ignoring attributes
        clean = []
        j = 0
        while j < len(decl):
            if decl[j] == "__attribute__":
                depth = 0
                j += 1
                while j < len(decl):
                    if decl[j] == "(":
                        depth += 1
                    elif decl[j] == ")":
                        depth -= 1
                        if depth == 0:
                            break
                    j += 1
                j += 1
                continue
            clean.append(decl[j])
            j += 1
        array = "[" in clean
        head = clean[:clean.index("[")] if array else clean
        ids = [x for x in head if re.match(r"[A-Za-z_]\w*$", x)]
        if not ids:
            return None, None, array
        name = ids[-1]
        base_type = None
        if "struct" in head:
            k = head.index("struct")
            base_type = head[k + 1]
        elif "union" in head:
            k = head.index("union")
            base_type = head[k + 1]
        else:
            for x in ids[:-1]:
                if x not in ("static", "const", "EWRAM_DATA", "IWRAM_DATA"):
                    base_type = self.typedefs.get(x, x)
        return name, base_type, array

    def parse_typedef(self) -> None:
        self.i += 1
        if self.peek() in ("struct", "union"):
            self.i += 1
            tag = None
            if self.peek() != "{":
                tag = self.peek()
                self.i += 1
            if self.peek() == "{":
                fields = self.parse_struct_body()
                alias = self.peek()
                if tag:
                    self.structs[tag] = fields
                if alias and re.match(r"[A-Za-z_]\w*$", alias):
                    self.structs[alias] = fields
                    self.typedefs[alias] = alias
                self.skip_to_semicolon()
                return
            alias = self.peek()
            if tag and alias:
                self.typedefs[alias] = tag
            self.skip_to_semicolon()
            return
        if self.peek() == "enum":
            self.i += 1
            if self.peek() != "{":
                self.i += 1
            if self.peek() == "{":
                self.parse_enum_body()
            self.skip_to_semicolon()
            return
        self.skip_to_semicolon()

    def parse_enum_body(self) -> None:
        assert self.peek() == "{"
        self.i += 1
        value = -1
        while self.peek() != "}":
            name = self.peek()
            self.i += 1
            if self.peek() == "=":
                self.i += 1
                expr = []
                depth = 0
                while not (depth == 0 and self.peek() in (",", "}")):
                    tok = self.peek()
                    if tok in "([":
                        depth += 1
                    elif tok in ")]":
                        depth -= 1
                    expr.append(tok)
                    self.i += 1
                try:
                    value = int(self.eval_expr(expr))
                except Exception:  # noqa: BLE001
                    value += 1
            else:
                value += 1
            self.enums[name] = value
            if self.peek() == ",":
                self.i += 1
        self.i += 1

    def parse_struct_body(self) -> list[tuple[str, str | None, bool]]:
        assert self.peek() == "{"
        self.i += 1
        fields: list[tuple[str, str | None, bool]] = []
        while self.i < len(self.t) and self.peek() != "}":
            if self.peek() in ("struct", "union") and (self.peek(1) == "{" or self.peek(2) == "{"):
                kind = self.peek()
                self.i += 1
                tag = None
                if self.peek() != "{":
                    tag = self.peek()
                    self.i += 1
                inner = self.parse_struct_body()
                anon = f"__anon{len(self.structs)}"
                self.structs[tag or anon] = inner
                # field name(s) until ';'
                names = []
                while self.peek() != ";":
                    if re.match(r"[A-Za-z_]\w*$", self.peek() or ""):
                        names.append(self.peek())
                    self.i += 1
                self.i += 1
                if names:
                    fields.append((names[0], tag or anon, False))
                else:
                    # anonymous struct/union: its members are accessible directly
                    fields.extend(inner if kind == "struct" else inner[:1])
                continue
            decl = []
            while self.peek() != ";":
                decl.append(self.peek())
                self.i += 1
            self.i += 1
            # split multiple declarators on commas
            groups = [[]]
            depth = 0
            for tok in decl:
                if tok in "([":
                    depth += 1
                elif tok in ")]":
                    depth -= 1
                if tok == "," and depth == 0:
                    groups.append([])
                else:
                    groups[-1].append(tok)
            type_tokens = groups[0]
            struct_type = None
            if "struct" in type_tokens or "union" in type_tokens:
                k = type_tokens.index("struct") if "struct" in type_tokens else type_tokens.index("union")
                struct_type = type_tokens[k + 1]
            else:
                for x in type_tokens:
                    if x in self.structs or x in self.typedefs:
                        struct_type = self.typedefs.get(x, x)
            for gi, g in enumerate(groups):
                toks = g
                if "(" in toks and "*" in toks:
                    # function pointer: name is the identifier after '*'
                    k = toks.index("*")
                    name = toks[k + 1]
                    fields.append((name, None, False))
                    continue
                cut = len(toks)
                for stop in (":", "["):
                    if stop in toks:
                        cut = min(cut, toks.index(stop))
                ids = [x for x in toks[:cut] if re.match(r"[A-Za-z_]\w*$", x)]
                if not ids:
                    continue
                is_ptr = "*" in toks[:cut]
                fields.append((ids[-1], None if is_ptr else struct_type, "[" in toks))
        self.i += 1
        return fields

    # ------------------------------------------------------------ initializers
    def parse_initializer(self, struct_type: str | None, is_array: bool):
        if self.peek() == "{":
            return self.parse_braced(struct_type, is_array)
        return self.parse_expression_value()

    def field_list(self, struct_type: str | None):
        if struct_type is None:
            return None
        return self.structs.get(self.typedefs.get(struct_type, struct_type))

    def parse_braced(self, struct_type: str | None, is_array: bool):
        assert self.peek() == "{"
        self.i += 1
        fields = None if is_array else self.field_list(struct_type)
        positional: list = []
        keyed: dict = {}
        indexed: dict[int, object] = {}
        pos_index = 0
        any_index = False
        while self.peek() != "}":
            if self.peek() == ".":
                # designated field (possibly nested .a.b)
                path = []
                while self.peek() == ".":
                    self.i += 1
                    path.append(self.peek())
                    self.i += 1
                    if self.peek() == "[":
                        break
                self.expect("=")
                sub_type, sub_array = self.field_type(struct_type, path[0])
                value = self.parse_initializer(sub_type, sub_array)
                target = keyed
                for p in path[:-1]:
                    target = target.setdefault(p, {})
                target[path[-1]] = value
                if fields:
                    names = [f[0] for f in fields]
                    if path[0] in names:
                        pos_index = names.index(path[0]) + 1
            elif self.peek() == "[":
                self.i += 1
                expr = []
                depth = 0
                while not (depth == 0 and self.peek() == "]"):
                    tok = self.peek()
                    if tok == "[":
                        depth += 1
                    elif tok == "]":
                        depth -= 1
                    expr.append(tok)
                    self.i += 1
                self.i += 1
                if self.peek() == "...":
                    raise Unresolved("range designator")
                index = int(self.eval_expr(expr))
                if self.peek() == "=":
                    self.i += 1
                value = self.parse_initializer(struct_type if is_array else None, False)
                indexed[index] = value
                any_index = True
                pos_index = index + 1
            else:
                if is_array:
                    value = self.parse_initializer(struct_type, False)
                    if any_index:
                        indexed[pos_index] = value
                    else:
                        positional.append(value)
                    pos_index += 1
                elif fields and pos_index < len(fields):
                    name, sub, sub_array = fields[pos_index]
                    value = self.parse_initializer(sub, sub_array)
                    keyed[name] = value
                    pos_index += 1
                else:
                    value = self.parse_initializer(None, False)
                    positional.append(value)
                    pos_index += 1
            if self.peek() == ",":
                self.i += 1
        self.i += 1
        if any_index:
            size = max(indexed) + 1 if indexed else 0
            out = [None] * size
            for k, v in enumerate(positional):
                out[k] = v
            for k, v in indexed.items():
                out[k] = v
            return out
        if keyed and positional:
            for k, v in enumerate(positional):
                keyed[f"${k}"] = v
            return keyed
        if keyed:
            return keyed
        return positional

    def field_type(self, struct_type: str | None, field: str) -> tuple[str | None, bool]:
        fields = self.field_list(struct_type)
        if fields:
            for name, sub, arr in fields:
                if name == field:
                    return sub, arr
        return None, False

    def expect(self, tok: str) -> None:
        if self.peek() != tok:
            raise Unresolved(f"expected {tok} got {self.peek()}")
        self.i += 1

    def parse_expression_value(self):
        expr = []
        depth = 0
        while self.i < len(self.t):
            tok = self.peek()
            if depth == 0 and tok in (",", "}", ";"):
                break
            if tok in "([{":
                depth += 1
            elif tok in ")]}":
                depth -= 1
            expr.append(tok)
            self.i += 1
        return self.value_of(expr)

    # ------------------------------------------------------------ expressions
    def strip_casts(self, expr: list[str]) -> list[str]:
        out = []
        j = 0
        while j < len(expr):
            if expr[j] == "(":
                # find matching
                k = j + 1
                depth = 1
                while k < len(expr) and depth:
                    if expr[k] == "(":
                        depth += 1
                    elif expr[k] == ")":
                        depth -= 1
                    k += 1
                inner = expr[j + 1:k - 1]
                if inner and all(x in BASE_TYPES or x in ("struct", "union", "*") or x in self.structs or x in self.typedefs for x in inner) and k < len(expr) and (expr[k] not in (")", ",", "+", "-", "*", "/", "|", "&", "<<", ">>")):
                    j = k
                    continue
            out.append(expr[j])
            j += 1
        return out

    def value_of(self, expr: list[str]):
        expr = self.strip_casts(expr)
        if not expr:
            return None
        if len(expr) == 1 and expr[0].startswith('"'):
            return expr[0][1:-1]
        if expr[0] == "__INCBIN__":
            return {"$incbin": [e[1:-1] for e in expr if e.startswith('"')]}
        try:
            return self.eval_expr(expr)
        except Unresolved:
            pass
        except Exception:  # noqa: BLE001
            pass
        # symbol reference forms: &sym, sym, &sym[n], sym + n, (cast)sym
        e = [x for x in expr if x not in ("&",)]
        if e and re.match(r"[A-Za-z_]\w*$", e[0]):
            ref: dict = {"$sym": e[0]}
            rest = e[1:]
            if rest[:1] == ["["]:
                close = rest.index("]")
                try:
                    ref["index"] = int(self.eval_expr(rest[1:close]))
                except Exception:  # noqa: BLE001
                    ref["indexExpr"] = " ".join(rest[1:close])
                rest = rest[close + 1:]
            if rest[:1] in (["+"], ["-"]):
                try:
                    off = int(self.eval_expr(rest[1:]))
                    ref["offset"] = off if rest[0] == "+" else -off
                except Exception:  # noqa: BLE001
                    ref["expr"] = " ".join(expr)
            elif rest:
                ref["expr"] = " ".join(expr)
            return ref
        return {"$expr": " ".join(expr)}

    def eval_expr(self, expr: list[str]):
        expr = self.strip_casts(expr)
        out = []
        j = 0
        while j < len(expr):
            tok = expr[j]
            if tok == "sizeof":
                # sizeof(x) / sizeof x
                if j + 1 < len(expr) and expr[j + 1] == "(":
                    k = j + 2
                    depth = 1
                    while depth:
                        if expr[k] == "(":
                            depth += 1
                        elif expr[k] == ")":
                            depth -= 1
                        k += 1
                    inner = expr[j + 2:k - 1]
                    j = k
                else:
                    inner = [expr[j + 1]]
                    j += 2
                out.append(str(self.sizeof(inner)))
                continue
            if re.match(r"0[xX]", tok):
                out.append(str(int(re.sub(r"[uUlL]+$", "", tok), 16)))
            elif re.match(r"\d", tok):
                t = re.sub(r"[uUlLfF]+$", "", tok)
                out.append(t)
            elif tok.startswith("'"):
                out.append(str(ord(bytes(tok[1:-1], "utf-8").decode("unicode_escape"))))
            elif re.match(r"[A-Za-z_]\w*$", tok):
                if tok in self.enums:
                    out.append(str(self.enums[tok]))
                elif tok in ("TRUE", "FALSE", "NULL"):
                    out.append({"TRUE": "1", "FALSE": "0", "NULL": "0"}[tok])
                else:
                    raise Unresolved(tok)
            elif tok == "/":
                out.append("//")
            elif tok == "&&":
                out.append(" and ")
            elif tok == "||":
                out.append(" or ")
            elif tok == "!":
                out.append(" not ")
            elif tok == "?":
                raise Unresolved("ternary")
            else:
                out.append(tok)
            j += 1
        value = eval("".join(out), {"__builtins__": {}}, {})
        if isinstance(value, bool):
            value = int(value)
        if isinstance(value, float):
            # GBA data has no floats: Q_x_y() style macros are truncated to
            # integers by the implicit conversion in the initializer.
            value = int(value)
        return value

    def sizeof(self, inner: list[str]) -> int:
        # sizeof(sym) for INCBIN data or arrays, sizeof(sym[0]) for element size
        if len(inner) == 1 and inner[0] in self.incbin_sizes:
            return self.incbin_sizes[inner[0]]
        if len(inner) == 1 and inner[0] in self.defs:
            v = self.defs[inner[0]]["value"]
            if isinstance(v, dict) and "$incbin" in v:
                raise Unresolved("incbin size")
            if isinstance(v, list):
                return len(v) * self.elem_size(self.defs[inner[0]]["type"])
        if len(inner) == 4 and inner[1] == "[" and inner[0] in self.defs:
            return self.elem_size(self.defs[inner[0]]["type"])
        simple = {"u8": 1, "s8": 1, "u16": 2, "s16": 2, "u32": 4, "s32": 4, "bool8": 1, "int": 4}
        if len(inner) == 1 and inner[0] in simple:
            return simple[inner[0]]
        raise Unresolved("sizeof " + " ".join(inner))

    def elem_size(self, type_name: str | None) -> int:
        return {"u8": 1, "s8": 1, "u16": 2, "s16": 2, "u32": 4, "s32": 4, "bool8": 1}.get(type_name or "", 1)


def load_incbin_sizes() -> dict[str, int]:
    import json
    path = OUT / "incbin" / "index.json"
    if not path.exists():
        return {}
    symbols = json.loads(path.read_text())["symbols"]
    return {k: v[2] for k, v in symbols.items() if ":" not in k}


def convert_file(path: Path, incbin_sizes: dict[str, int]) -> dict:
    text = preprocess(path)
    parser = CParser(tokenize(text), incbin_sizes)
    parser.parse()
    # Resolve INCBIN sizes for symbols defined in this file.
    return {"defs": parser.defs, "enums": {k: v for k, v in parser.enums.items()}}


def export_cdata(files: list[str] | None = None) -> None:
    incbin_sizes = load_incbin_sizes()
    sources = [DECOMP / "src" / f for f in files] if files else sorted((DECOMP / "src").glob("*.c"))
    out = OUT / "cdata"
    out.mkdir(parents=True, exist_ok=True)
    total = 0
    for src in sources:
        data = convert_file(src, incbin_sizes)
        # enums are shared through headers; keep only the ones this file needs
        # would be expensive to compute, so store defs only and a global enum map.
        write_json(out / f"{src.stem}.json", {"defs": data["defs"]})
        total += len(data["defs"])
    print(f"  cdata: {len(sources)} files, {total} definitions")
