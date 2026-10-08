"""Compile small host C programs against the decompilation to dump tables.

Data headers are compiled with the host clang after the decompilation's
preproc tool encodes _("...") strings, so the exported values are exactly the
values the game is built from.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from common import BIN, BUILD, CPP_DEFINES, DECOMP, GEN_INCLUDE, run

PRELUDE = r"""
#include <stdio.h>
static int __first;
static void jstr(const u8 *s, int max) {
    int i;
    putchar('"');
    for (i = 0; i < max; i++) {
        printf("%02x", s[i]);
        if (s[i] == 0xFF) break;
    }
    putchar('"');
}
#define JSTR(s) jstr((const u8 *)(s), 4096)
#define JSTRN(s, n) jstr((const u8 *)(s), (n))
"""


def extract_definition(path: Path, symbol: str) -> str:
    """Return the C text defining `symbol` (declaration through the closing `};`)."""
    text = path.read_text()
    # Look for the definition in code, not in a comment that quotes it (pokeemerald's party_menu.h documents sTMHMMoves
    # in a block comment before defining it): blank comments for the search, keep the original text for the result.
    blank = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S)
    blank = re.sub(r"//[^\n]*", lambda m: " " * len(m.group(0)), blank)
    match = re.search(rf"^[^\n;]*\b{re.escape(symbol)}\b\s*(\[[^\]]*\])*\s*=", blank, flags=re.M)
    if not match:
        raise KeyError(f"{symbol} not found in {path}")
    start = match.start()
    depth = 0
    i = text.index("{", match.end() - 1)
    while i < len(text):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = text.index(";", i) + 1
                return text[start:end].replace("static ", "")
        i += 1
    raise ValueError(f"unterminated definition of {symbol}")


def compile_and_run(name: str, source: str, extra_includes: list[str] | None = None) -> str:
    c_path = BUILD / f"dump_{name}.c"
    c_path.write_text(source)
    include_args = ["-I", str(GEN_INCLUDE), "-iquote", "include", "-I", "include", "-I", "src", "-I", str(BUILD)]
    for inc in extra_includes or []:
        include_args += ["-I", inc]
    incbin = ["-D" + f"{name}(...)={{0}}" for name in ("INCBIN", "INCBIN_U8", "INCBIN_U16", "INCBIN_U32", "INCBIN_S8", "INCBIN_S16", "INCBIN_S32")]
    # global.h expands _() on __APPLE__ for IDEs; undefine it so preproc sees
    # the string literals exactly as in the real build.
    pre = run(["clang", "-E", "-x", "c", "-U__APPLE__", *incbin, *CPP_DEFINES, *include_args, str(c_path)])
    i_path = BUILD / f"dump_{name}.i"
    i_path.write_bytes(pre)
    encoded = run([str(BIN / "preproc"), str(i_path), "charmap.txt"])
    e_path = BUILD / f"dump_{name}_enc.c"
    e_path.write_bytes(encoded)
    exe = BUILD / f"dump_{name}"
    result = subprocess.run(["clang", "-w", "-x", "c", str(e_path), "-o", str(exe)], cwd=DECOMP, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode()[:5000])
    return run([str(exe)]).decode()


def dump_json(name: str, source: str) -> object:
    output = compile_and_run(name, source)
    try:
        return json.loads(output)
    except json.JSONDecodeError as error:
        (BUILD / f"dump_{name}.json").write_text(output)
        raise RuntimeError(f"bad JSON from dumper {name}: {error}")


def hexbytes(value: str) -> bytes:
    return bytes.fromhex(value)
