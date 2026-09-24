"""Mechanical C -> TypeScript translation for simple decompilation files.

metatile_behavior.c is a list of pure predicates over behavior IDs; converting
it mechanically keeps every rule identical to the original instead of
re-typing ~150 functions by hand.
"""

from __future__ import annotations

import re

from common import DECOMP, ROOT

GEN_DIR = ROOT / "src" / "fr" / "generated"


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def convert_designated_array(name: str, body: str) -> str:
    entries = re.findall(r"\[([^\]]+)\]\s*=\s*([^,\n]+)", body)
    lines = [f"const {name}: Record<number, number> = {{"]
    for key, value in entries:
        value = value.strip().replace("TRUE", "1").replace("FALSE", "0")
        lines.append(f"  [{key.strip()}]: {value},")
    lines.append("};")
    return "\n".join(lines)


def convert_function(text: str) -> str:
    def signature(m: re.Match) -> str:
        ret, name, params = m.group(1), m.group(2), m.group(3)
        args = []
        for p in params.split(","):
            p = p.strip()
            if not p or p == "void":
                continue
            args.append(p.split()[-1].lstrip("*") + ": number")
        ret_type = "boolean" if ret in ("bool8", "bool32") else "number"
        return f"export function {name}({', '.join(args)}): {ret_type}\n{{"
    text = re.sub(r"^(?:static )?(bool8|bool32|u8|u16|u32|s32)\s+(\w+)\s*\(([^)]*)\)\s*\n?\{", signature, text, flags=re.M)
    text = re.sub(r"\b(?:u8|u16|u32|s32|bool8|bool32)\s+(\w+)\s*=", r"let \1 =", text)
    text = re.sub(r"\bTRUE\b", "true", text)
    text = re.sub(r"\bFALSE\b", "false", text)
    return text


def generate_metatile_behavior(constants: dict[str, int]) -> None:
    source = strip_comments((DECOMP / "src/metatile_behavior.c").read_text())
    source = re.sub(r"#include[^\n]*\n", "", source)
    source = re.sub(r"(static )?const (bool8|u8) (\w+)\[[^\]]*\]\s*=\s*\{(.*?)\};",
                    lambda m: convert_designated_array(m.group(3), m.group(4)), source, flags=re.S)
    source = convert_function(source)
    used = sorted(set(re.findall(r"\b((?:MB|DIR|NUM)_[A-Z0-9_]+)\b", source)))
    header = ["// Generated from pokefirered src/metatile_behavior.c by tools/decomp/step_codegen.py.", "// Do not edit by hand.", "/* eslint-disable */", "// @ts-nocheck", ""]
    for name in used:
        if name in constants:
            header.append(f"export const {name} = {constants[name]};")
    GEN_DIR.mkdir(parents=True, exist_ok=True)
    (GEN_DIR / "metatileBehavior.ts").write_text("\n".join(header) + "\n\n" + source.strip() + "\n")


def export_codegen(constants: dict[str, int]) -> None:
    generate_metatile_behavior(constants)
    print("  generated src/fr/generated/metatileBehavior.ts")
