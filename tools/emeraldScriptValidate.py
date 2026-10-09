#!/usr/bin/env python3
"""Cross-check the Emerald script bytecode exported by tools/decomp (public/emerald/scripts.bin + scripts.json).

The exporter assembles pokeemerald's data/event_scripts.s with LLVM. This script re-derives the bytes with a small macro
expander of its own (asm/macros/event.inc and map.inc: .byte/.2byte/.4byte, .if/.elseif/.else/.endif, .ifb/.ifnb, nested
macros) and compares every label's bytes with the exported binary. Pointers to symbols outside the script data are wildcards.
Also compares the command table, the specials table and the label set with the sources.

Run `EXPORT_GAME=emerald python3 tools/decomp/export.py` first. Exit status 1 on any mismatch.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/emerald"
SRC = ROOT.parent / "refs-src/pokeemerald"
if not SRC.exists():
    raise SystemExit(f"pokeemerald checkout not found at {SRC} (npm run refs:fetch -- pokeemerald)")

scripts = json.loads((OUT / "scripts.json").read_text())
binary = (OUT / "scripts.bin").read_bytes()
constants: dict[str, int] = json.loads((OUT / "constants.json").read_text())
TS = ROOT / "src/games/emerald/generated/constants.ts"
if TS.exists():
    for line in TS.read_text().splitlines():
        if line.startswith("export const "):
            name, value = line[len("export const "):].rstrip(";").split(" = ")
            constants.setdefault(name, int(value))
failures: list[str] = []
compared = 0


def check(label: str, got, want) -> None:
    global compared
    compared += 1
    if got != want:
        failures.append(f"{label}: exported {got!r}, source {want!r}")


# ------------------------------------------------------------------ tables
cmd_table = (SRC / "data/script_cmd_table.inc").read_text()
entries = re.findall(r"script_cmd_table_entry\s+(SCR_OP_\w+)\s+(\w+)", cmd_table)
for index, (op, _) in enumerate(entries):
    constants[op] = index
check("command count", len(scripts["commands"]), len(entries))
check("command order", scripts["commands"], [fn for _, fn in entries])
hex_marks = re.findall(r"script_cmd_table_entry\s+SCR_OP_\w+\s+\w+\s+@ 0x([0-9a-f]+)", cmd_table)
check("command indices match the 0xNN comments", [int(h, 16) for h in hex_marks], list(range(len(entries))))
specials = re.findall(r"^\s*def_special\s+(\w+)", (SRC / "data/specials.inc").read_text(), re.M)
check("specials", scripts["specials"], specials)
# data/specials.inc: `def_special Name[, waitstate]` sets SPECIAL_WAITSTATE_Name (the special's index is SPECIAL_Name)
for index, (name, wait) in enumerate(re.findall(r"^\s*def_special\s+(\w+)(?:\s*,\s*(?:waitstate\s*=\s*)?(\d+))?", (SRC / "data/specials.inc").read_text(), re.M)):
    constants[f"SPECIAL_{name}"] = index
    constants[f"SPECIAL_WAITSTATE_{name}"] = int(wait or 0)
# plain `NAME = value` assignments of the macro files (YES = 1, NO = 0, STR_VAR_1 ...)
for macro_path in ("asm/macros/event.inc", "asm/macros/map.inc"):
    in_macro = False
    for raw in (SRC / macro_path).read_text().splitlines():
        line = raw.split("@")[0].strip()
        if line.startswith(".macro"):
            in_macro = True
        elif line == ".endm":
            in_macro = False
        elif not in_macro:
            m = re.match(r"^(\w+)\s*=\s*(0[xX][0-9a-fA-F]+|\d+)$", line)
            if m:
                constants.setdefault(m.group(1), int(m.group(2), 0))

# ------------------------------------------------------------------ source files and labels
def active_lines(rel: str):
    """Lines of a data file after the C preprocessor's #ifdef/#ifndef/#else/#endif, with none of the build's optional macros
    defined (the exporter passes -DEMERALD -DREVISION=0 -DENGLISH -DMODERN=0; BUGFIX is commented out in config.h)."""
    stack: list[bool] = []
    for line in (SRC / rel).read_text(errors="replace").splitlines():
        word = line.split(None, 1)[0] if line.startswith("#") and line.split() else ""
        if word in ("#ifdef", "#ifndef"):
            stack.append(word == "#ifndef")
        elif word in ("#if", "#elif"):
            raise SystemExit(f"{rel}: unsupported preprocessor line {line!r}")
        elif word == "#else":
            stack[-1] = not stack[-1]
        elif word == "#endif":
            stack.pop()
        elif all(stack):
            yield line



seen: set[str] = set()
files: list[str] = []


def walk(rel: str) -> None:
    if rel in seen or not (SRC / rel).exists():
        return
    seen.add(rel)
    files.append(rel)
    for line in active_lines(rel):
        m = re.match(r'\s*\.include\s+"([^"]+)"', line)
        if m:
            walk(m.group(1))


walk("data/event_scripts.s")
source_labels = set()
for rel in files:
    for line in active_lines(rel):
        m = re.match(r"^(\w+)::?", line)
        if m:
            source_labels.add(m.group(1))
check("label set", sorted(scripts["labels"]), sorted(source_labels))

# ------------------------------------------------------------------ macro expander
state = {"implicit_end": -1, "base": 0}  # position (in the current label's bytes) where the last implicit waitstate ended


class Unsupported(Exception):
    pass


class Unknown(Exception):
    """A symbol whose value is not known to this check (a C symbol): its bytes become wildcards."""


macros: dict[str, tuple[list[tuple[str, str | None, bool]], list[str]]] = {}


def strip_comment(line: str) -> str:
    out, quoted = [], False
    for ch in line:
        if ch == '"':
            quoted = not quoted
        if ch == "@" and not quoted:
            break
        out.append(ch)
    return "".join(out).strip()


def split_args(text: str) -> list[str]:
    parts, depth, current, quoted = [], 0, [], False
    for ch in text:
        if ch == '"':
            quoted = not quoted
        if not quoted:
            if ch in "([":
                depth += 1
            elif ch in ")]":
                depth -= 1
            elif ch == "," and depth == 0:
                parts.append("".join(current).strip())
                current = []
                continue
        current.append(ch)
    if current or parts:
        parts.append("".join(current).strip())
    return parts


def load_macros(path: Path) -> None:
    current = None
    for raw in path.read_text(errors="replace").splitlines():
        line = strip_comment(raw)
        m = re.match(r"create_movement_action\s+(\w+)\s*,\s*(\w+)$", line)
        if m and current is None:  # movement.inc defines each action by a macro that defines a macro
            macros[m.group(1)] = ([], [f".byte {m.group(2)}"])
            continue
        if line.startswith(".macro"):
            head = line[len(".macro"):].strip()
            name, _, rest = head.partition(" ")
            params = []
            for param in split_args(rest.replace(" ,", ",")) if rest.strip() else []:
                m = re.match(r"(\w+)(?::(req|vararg))?(?:\s*=\s*(.*))?$", param.strip())
                if not m:
                    raise SystemExit(f"cannot parse macro parameter {param!r} in {name}")
                params.append((m.group(1), m.group(3), m.group(2) == "vararg"))
            current = (name, params, [])
        elif line == ".endm" and current:
            macros[current[0]] = (current[1], current[2])
            current = None
        elif current is not None and line:
            current[2].append(line)


for macro_file in ["asm/macros/event.inc", "asm/macros/map.inc", "asm/macros/movement.inc", "asm/macros/trainer_hill.inc", "asm/macros/battle_tent.inc"] + sorted(str(f.relative_to(SRC)) for f in (SRC / "asm/macros/battle_frontier").glob("*.inc")):
    load_macros(SRC / macro_file)


# ---- text: .string / .braille encoded straight from charmap.txt (the exporter uses the preproc tool for the same job)
CHARS: dict[str, list[int]] = {}
NAMES: dict[str, list[int]] = {}
for entry in (SRC / "charmap.txt").read_text().splitlines():
    entry = entry.split("@")[0].strip() if not entry.lstrip().startswith("'@'") else entry.strip()
    m = re.match(r"^'(.+)'\s*=\s*((?:[0-9A-Fa-f]{2}\s*)+)$", entry)
    if m:
        key = m.group(1)
        CHARS[{"\\n": "\n", "\\l": "\\l", "\\p": "\\p", "\\'": "'", "\\\\": "\\"}.get(key, key)] = [int(x, 16) for x in m.group(2).split()]
        continue
    m = re.match(r"^(\w+)\s*=\s*((?:[0-9A-Fa-f]{2}\s*)+)$", entry)
    if m:
        NAMES[m.group(1)] = [int(x, 16) for x in m.group(2).split()]


def encode_string(literal: str) -> list[int]:
    out: list[int] = []
    i = 0
    while i < len(literal):
        ch = literal[i]
        if ch == "\\":
            nxt = literal[i + 1]
            key = {"n": "\n", "l": "\\l", "p": "\\p", '"': '"', "\\": "\\", "'": "'"}.get(nxt)
            if key is None or key not in CHARS:
                raise Unsupported(f"escape \\{nxt}")
            out += CHARS[key]
            i += 2
        elif ch == "{":
            end = literal.index("}", i)
            for token in literal[i + 1:end].split():
                if token in NAMES:
                    out += NAMES[token]
                elif re.fullmatch(r"-?\d+|0[xX][0-9a-fA-F]+", token):
                    out.append(int(token, 0) & 0xFF)
                else:
                    raise Unsupported(f"text token {token}")
            i = end + 1
        else:
            if ch not in CHARS:
                raise Unsupported(f"character {ch!r}")
            out += CHARS[ch]
            i += 1
    return out

IDENT = re.compile(r"\b[A-Za-z_]\w*\b")


def value_of(name: str) -> int:
    if name in constants:
        return constants[name]
    if name in scripts["labels"]:
        return scripts["base"] + scripts["labels"][name]
    raise Unknown(name)


def evaluate(expr: str) -> int:
    expr = expr.strip()
    if expr.startswith("(") is False and re.fullmatch(r"-?\d+|0[xX][0-9a-fA-F]+", expr):
        return int(expr, 0)
    text = expr.replace("&&", " and ").replace("||", " or ")
    text = re.sub(r"!(?!=)", " not ", text)
    text = IDENT.sub(lambda m: m.group(0) if m.group(0) in ("and", "or", "not") else str(value_of(m.group(0))), text)
    try:
        return int(eval(text, {"__builtins__": {}}, {}))  # noqa: S307 - constant expressions from the decomp sources
    except SyntaxError:
        raise Unsupported(f"expression {expr!r}") from None


def condition(expr: str) -> bool:
    try:
        return evaluate(expr) != 0
    except Unknown as error:
        raise Unsupported(f"condition on unknown symbol {error}") from None


def emit(width: int, args: str, out: list[int | None]) -> None:
    for item in split_args(args):
        try:
            value = evaluate(item)
            out.extend((value >> (8 * i)) & 0xFF for i in range(width))
        except Unknown:
            out.extend([None] * width)


def expand(line: str, out: list[int | None], depth: int = 0) -> None:
    if depth > 20:
        raise Unsupported("macro recursion")
    name, _, rest = line.partition(" ")
    name = name.strip()
    rest = rest.strip()
    if name == ".byte":
        emit(1, rest, out)
    elif name == ".2byte":
        emit(2, rest, out)
    elif name == ".4byte":
        emit(4, rest, out)
    elif name == "waitstate":
        # asm/macros/event.inc: an explicit waitstate directly after an implicit one (from `special`) is dropped
        implicit = rest.replace("implicit=", "").strip() not in ("", "0")
        if state["implicit_end"] != len(out) or state["base"] != id(out):
            out.append(constants["SCR_OP_WAITSTATE"])
        if implicit:
            state["implicit_end"], state["base"] = len(out), id(out)
    elif name == ".string":
        literals = re.findall(r'"((?:[^"\\]|\\.)*)"', rest)
        if not literals:
            raise Unsupported(".string")
        for literal in literals:
            out.extend(encode_string(literal))  # the terminator is the literal's own `$`
    elif name in macros:
        params, body = macros[name]
        given = split_args(rest) if rest else []
        named = {}
        for position in reversed(range(len(given))):  # `name=value` arguments (waitstate implicit=1)
            m = re.match(r"^(\w+)=(.*)$", given[position])
            if m and any(param == m.group(1) for param, _, _ in params):
                named[m.group(1)] = m.group(2)
                given.pop(position)
        values: dict[str, str] = {}
        for i, (param, default, vararg) in enumerate(params):
            if vararg:
                values[param] = ", ".join(given[i:])
            elif param in named:
                values[param] = named[param]
            elif i < len(given) and given[i] != "":
                values[param] = given[i]
            else:
                values[param] = default if default is not None else ""
        run_block(body, values, out, depth + 1)
    else:
        raise Unsupported(name)


def substitute(line: str, values: dict[str, str]) -> str:
    return re.sub(r"\\(\w+)", lambda m: values.get(m.group(1), m.group(0)), line)


def run_block(body: list[str], values: dict[str, str], out: list[int | None], depth: int) -> None:
    # stack of (branch is live, a branch of this .if already ran, parent is live)
    stack: list[list[bool]] = []

    def live() -> bool:
        return all(frame[0] for frame in stack)

    for raw in body:
        line = substitute(raw, values)
        word = line.split(None, 1)[0]
        arg = line[len(word):].strip()
        if word in (".if", ".ifb", ".ifnb", ".ifdef", ".ifndef"):
            if not live():
                stack.append([False, True])
                continue
            if word == ".if":
                cond = condition(arg)
            elif word == ".ifb":
                cond = arg == ""
            elif word == ".ifnb":
                cond = arg != ""
            elif word == ".ifdef":
                cond = arg in constants or arg in scripts["labels"]
            else:
                cond = not (arg in constants or arg in scripts["labels"])
            stack.append([cond, cond])
        elif word == ".elseif":
            frame = stack[-1]
            outer = all(f[0] for f in stack[:-1])
            if frame[1] or not outer:
                frame[0] = False
            else:
                frame[0] = condition(arg)
                frame[1] = frame[0]
        elif word == ".else":
            frame = stack[-1]
            outer = all(f[0] for f in stack[:-1])
            frame[0] = outer and not frame[1]
            frame[1] = True
        elif word == ".endif":
            stack.pop()
        elif live():
            expand(line, out, depth)


# ------------------------------------------------------------------ per-label comparison
stats = Counter()
reasons = Counter()
for rel in files:
    if rel == "data/event_scripts.s":
        continue
    current = None
    bodies: dict[str, list[str]] = {}
    for raw in active_lines(rel):
        m = re.match(r"^(\w+)::?", raw)
        if m:
            current = m.group(1)
            bodies[current] = []
            continue
        line = strip_comment(raw)
        if current and line and not line.startswith("#"):
            bodies[current].append(line)
    for label, lines in bodies.items():
        if label not in scripts["labels"] or not lines:
            continue
        out: list[int | None] = []
        stopped = None
        try:
            for line in lines:
                expand(line, out)
        except Unsupported as error:
            stopped = str(error)
        offset = scripts["labels"][label]
        got = list(binary[offset:offset + len(out)])
        bad = [i for i, (a, b) in enumerate(zip(got, out)) if b is not None and a != b]
        compared += 1
        if len(got) < len(out) or bad:
            failures.append(f"label {label} ({rel}): bytes differ at {bad[:3]} (exported {got[:12]}, source {out[:12]})")
            stats["mismatch"] += 1
        elif stopped:
            stats["prefix only"] += 1
            reasons[stopped.split()[0] if not stopped.startswith("condition") else stopped] += 1
        else:
            stats["complete"] += 1
        stats["bytes compared"] += sum(1 for b in out if b is not None)
        stats["wildcard bytes"] += sum(1 for b in out if b is None)

print(f"  labels: {dict(stats)}")
print(f"  stopped at (not assembled by this check): {reasons.most_common(12)}")
print(f"{compared} comparisons, {len(failures)} mismatches")
for line in failures[:30]:
    print("  ", line)
sys.exit(1 if failures else 0)
