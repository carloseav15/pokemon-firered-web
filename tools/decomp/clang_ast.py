"""Extract and navigate Clang ASTs for pokefirered C source files.

Uses clang with target armv4t-none-eabi and pokefirered's preprocessing pipeline
(preproc for charmap.txt strings, target ABI shims).
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from common import BIN, BUILD, CPP_DEFINES, DECOMP, GEN_INCLUDE, ROOT

SHIM_DIR = ROOT / "tools/decomp" / "shim"
INCBIN_MACROS = ["INCBIN_U8", "INCBIN_U16", "INCBIN_U32", "INCBIN_S8", "INCBIN_S16", "INCBIN_S32"]


def ensure_shim() -> None:
    SHIM_DIR.mkdir(parents=True, exist_ok=True)
    shim_string = SHIM_DIR / "string.h"
    if not shim_string.exists():
        shim_string.write_text(
            "#ifndef _STRING_H_\n"
            "#define _STRING_H_\n"
            "#include <stddef.h>\n"
            "void *memcpy(void *dest, const void *src, size_t n);\n"
            "void *memset(void *s, int c, size_t n);\n"
            "void *memmove(void *dest, const void *src, size_t n);\n"
            "int memcmp(const void *s1, const void *s2, size_t n);\n"
            "char *strcpy(char *dest, const char *src);\n"
            "char *strncpy(char *dest, const char *src, size_t n);\n"
            "int strcmp(const char *s1, const char *s2);\n"
            "int strncmp(const char *s1, const char *s2, size_t n);\n"
            "size_t strlen(const char *s);\n"
            "#endif\n"
        )


def preprocess_c_file(c_path: Path) -> Path:
    """Run clang -E and preproc to produce a standalone C source file."""
    ensure_shim()
    defines = [f"-D{m}(...)={{0}}" for m in INCBIN_MACROS]
    defines.append("-D__INCBIN__(...)={0}")
    include_args = [
        "-I", str(SHIM_DIR),
        "-I", str(GEN_INCLUDE),
        "-iquote", "include",
        "-I", "include",
        "-I", "src",
        "-I", str(BUILD),
    ]
    pre = subprocess.run(
        ["clang", "-E", "-x", "c", "-U__APPLE__", "-w", *defines, *CPP_DEFINES, *include_args, str(c_path)],
        cwd=DECOMP,
        capture_output=True,
    )
    if pre.returncode != 0:
        raise RuntimeError(f"clang -E failed on {c_path}:\n{pre.stderr.decode('utf-8', errors='replace')}")

    BUILD.mkdir(parents=True, exist_ok=True)
    i_path = BUILD / f"ast_{c_path.stem}.i"
    i_path.write_bytes(pre.stdout)

    enc = subprocess.run(
        [str(BIN / "preproc"), str(i_path), "charmap.txt"],
        cwd=DECOMP,
        capture_output=True,
    )
    if enc.returncode != 0:
        raise RuntimeError(f"preproc failed on {i_path}:\n{enc.stderr.decode('utf-8', errors='replace')}")

    out_c = BUILD / f"ast_{c_path.stem}.c"
    out_c.write_bytes(enc.stdout)
    return out_c


def dump_clang_ast_json(c_path: Path) -> dict[str, Any]:
    """Preprocess and dump the Clang AST as JSON using target armv4t-none-eabi."""
    out_c = preprocess_c_file(c_path)
    cmd = [
        "clang",
        "--target=armv4t-none-eabi",
        "-Xclang", "-ast-dump=json",
        "-fsyntax-only",
        "-w",
        "-x", "c",
        "-I", str(SHIM_DIR),
        str(out_c),
    ]
    res = subprocess.run(cmd, cwd=DECOMP, capture_output=True)
    if res.returncode != 0:
        raise RuntimeError(f"clang -ast-dump=json failed on {out_c}:\n{res.stderr.decode('utf-8', errors='replace')}")
    return json.loads(res.stdout)


@dataclass
class AstFunction:
    name: str
    return_type: str
    params: list[tuple[str, str]]  # (name, type)
    raw_node: dict[str, Any]
    body: dict[str, Any]
    line: int = 0
    is_static: bool = False


def extract_functions(ast_json: dict[str, Any], target_func_names: set[str] | None = None) -> dict[str, AstFunction]:
    """Find all FunctionDecl nodes with a CompoundStmt body matching target function names."""
    funcs: dict[str, AstFunction] = {}
    for node in ast_json.get("inner", []):
        if node.get("kind") != "FunctionDecl":
            continue
        name = node.get("name")
        if not name:
            continue
        if target_func_names is not None and name not in target_func_names:
            continue
        # Find CompoundStmt
        body = None
        params: list[tuple[str, str]] = []
        for child in node.get("inner", []):
            if child.get("kind") == "ParmVarDecl":
                params.append((child.get("name", ""), child.get("type", {}).get("qualType", "")))
            elif child.get("kind") == "CompoundStmt":
                body = child

        if body is not None:
            qual_type = node.get("type", {}).get("qualType", "")
            ret_type = qual_type.split("(")[0].strip()
            storage_class = node.get("storageClass", "")
            is_static = (storage_class == "static")
            line = node.get("loc", {}).get("presumedLine", node.get("loc", {}).get("line", 0))
            funcs[name] = AstFunction(
                name=name,
                return_type=ret_type,
                params=params,
                raw_node=node,
                body=body,
                line=line,
                is_static=is_static,
            )
    return funcs
