#!/usr/bin/env python3
"""Generate PORT-INVENTORY.md: one row per pokefirered/src/*.c.

For every C file it measures how many of its function definitions exist by
the same name in src/fr (the port keeps C names), which TS files cite the
file (`name.c` anywhere in a comment), and whether its constant data is
exported (public/fr/cdata/<name>.json). Categories that cannot be measured
automatically (out of scope, covered by the browser/exporter, adapters) come
from the tables below; edit them when a file changes state.

A TS `function` whose body is trivial (empty, `return 0;`, `if (!x) return;`…)
while the C body has real statements is a stub: it is NOT counted as ported and
is listed in the "Stubs" column, so a named placeholder cannot inflate the count.

Usage: python3 tools/portInventory.py   (or npm run inventory)
"""

from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DECOMP = Path(os.environ.get("POKEFIRERED", ROOT.parent / "pokefirered")).resolve()
SRC = ROOT / "src" / "fr"
OUT = ROOT / "PORT-INVENTORY.md"

# No link hardware, Quest Log or help system in the browser (PORTING-STATUS.md).
OUT_OF_SCOPE_PREFIXES = (
    "link", "librfu", "AgbRfu_", "union_room", "mystery_gift", "mystery_event",
    "ereader", "berry_crush", "dodrio_berry_picking", "pokemon_jump", "quest_log",
    "help_system", "battle_controller_link_",
)
OUT_OF_SCOPE = {
    "sloopsvc", "multiboot", "wonder_news", "minigame_countdown", "digit_obj_util",
    "wireless_communication_status_screen", "berry_fix_program", "cable_club",
    "help_message", "cereader_tool", "battle_records", "rfu_union_tool",
}

# Replaced by the TS hardware layer, the browser, or the decomp exporter.
COVERED: dict[str, str] = {
    "malloc": "memoria de JS",
    "agb_flash": "save.ts (localStorage)",
    "agb_flash_1m": "save.ts (localStorage)",
    "agb_flash_le": "save.ts (localStorage)",
    "agb_flash_mx": "save.ts (localStorage)",
    "save": "save.ts (formato propio)",
    "load_save": "save.ts (formato propio)",
    "reset_save_heap": "save.ts",
    "isagbprn": "depuración de GBA",
    "mini_printf": "depuración de GBA",
    "rom_header_gf": "cabecera de ROM",
    "dma3_manager": "hw/ (copias directas)",
    "m4a_tables": "exportador (audio)",
    "graphics": "exportador (incbin)",
    "data": "exportador (data)",
    "tilesets": "exportador (tilesets)",
    "decoration": "exportador",
    "strings": "exportador (textos)",
    "move_descriptions": "exportador (textos)",
    "keyboard_text": "exportador (textos)",
    "text_window_graphics": "exportador (incbin)",
    "trainer_tower_sets": "exportador (cdata)",
}

# Files cited by TS whose screen is still a simplified adapter (AGENTS.md §5).
ADAPTERS: dict[str, str] = {
    "teachy_tv": "menus/keyItemScreens.ts: lista de texto; teachyTv.ts no está conectado",
}


FUNC_RE = re.compile(
    r"^(?!static const|const|typedef|struct\s+\w+\s*$)"
    r"(?:(?:static|inline|NAKED|UNUSED|NOINLINE|ARM_FUNC|IWRAM_CODE|EWRAM_CODE)\s+)*"
    r"[A-Za-z_][\w\s\*]*?\b([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\n\{",
    re.M,
)
KEYWORDS = {"if", "while", "for", "switch", "return", "sizeof"}
TS_FUNC_RE = re.compile(r"\bfunction\s+([A-Za-z_]\w*)\s*\(")
TRIVIAL_LINE = re.compile(
    r"^(return(\s+[\w.\[\]]+)?;|if\s*\(!?[\w.]+\)\s*return;|void\s+[\w.]+;|//.*|/\*.*\*/|\*.*)$"
)


def norm(name: str) -> str:
    return name.replace("_", "").lower()


def body_after(text: str, start: int) -> str:
    """Text between the `{` at/after `start` and its matching `}`."""
    i = text.find("{", start)
    if i < 0:
        return ""
    depth, j = 0, i
    while j < len(text):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i + 1 : j]
        j += 1
    return text[i + 1 :]


def statements(body: str) -> list[str]:
    return [l.strip() for l in body.splitlines() if l.strip() and l.strip() not in ("{", "}")]


def is_trivial(body: str) -> bool:
    return all(TRIVIAL_LINE.match(l) for l in statements(body))


def c_functions(text: str) -> list[tuple[str, bool]]:
    """(name, has_real_body) for each function definition in a .c file."""
    out: dict[str, bool] = {}
    for m in FUNC_RE.finditer(text):
        name = m.group(1)
        if name not in KEYWORDS and name not in out:
            out[name] = not is_trivial(body_after(text, m.end() - 1))
    return list(out.items())


def ts_body_end(text: str, paren: int) -> int:
    """Index of the `{` opening a TS function body, skipping the parameter list."""
    depth, j = 0, paren
    while j < len(text):
        if text[j] == "(":
            depth += 1
        elif text[j] == ")":
            depth -= 1
            if depth == 0:
                break
        j += 1
    return j


def load_ts() -> tuple[set[str], dict[str, bool], dict[str, list[str]]]:
    idents: set[str] = set()
    # norm(name) -> True if at least one TS `function name` has a real body.
    real_def: dict[str, bool] = {}
    cites: dict[str, list[str]] = {}
    for path in sorted(SRC.rglob("*.ts")):
        if "generated" in path.parts:
            continue
        text = path.read_text()
        # Case/underscore-insensitive: older field code uses camelCase names.
        idents.update(norm(i) for i in re.findall(r"\b[A-Za-z_]\w*\b", text))
        for m in TS_FUNC_RE.finditer(text):
            key = norm(m.group(1))
            real = not is_trivial(body_after(text, ts_body_end(text, m.end() - 1)))
            real_def[key] = real_def.get(key, False) or real
        rel = str(path.relative_to(SRC))
        for c in set(re.findall(r"\b([A-Za-z0-9_]+)\.c\b", text)):
            cites.setdefault(c, []).append(rel)
    return idents, real_def, cites


def count_found(funcs: list[tuple[str, bool]], idents: set[str], real_def: dict[str, bool]) -> tuple[int, list[str]]:
    """Ported functions and stubs (TS `function` with a trivial body for a non-trivial C body)."""
    found, stubs = 0, []
    for name, c_real in funcs:
        key = norm(name)
        if key not in idents:
            continue
        if c_real and real_def.get(key) is False:
            stubs.append(name)
            continue
        found += 1
    return found, stubs


def classify(name: str, funcs: list[tuple[str, bool]], found: int, cited: bool) -> tuple[str, str]:
    if name in OUT_OF_SCOPE or name.startswith(OUT_OF_SCOPE_PREFIXES):
        return "fuera", ""
    if name in COVERED:
        return "cubierto", COVERED[name]
    if name in ADAPTERS:
        return "adaptador", ADAPTERS[name]
    if not funcs:
        return ("datos", "") if (ROOT / "public/fr/cdata" / f"{name}.json").exists() else ("falta", "")
    ratio = found / len(funcs)
    if ratio >= 0.8:
        return "portado", ""
    if found or cited:
        return "parcial", ""
    return "falta", ""


ORDER = ["falta", "parcial", "adaptador", "portado", "datos", "cubierto", "fuera"]
TITLES = {
    "falta": "Falta (sin funciones portadas)",
    "parcial": "Parcial (menos del 80 % de funciones)",
    "adaptador": "Adaptador (UI simplificada)",
    "portado": "Portado (≥ 80 % de funciones con el mismo nombre)",
    "datos": "Solo datos (exportados a cdata)",
    "cubierto": "Cubierto por hw/navegador/exportador",
    "fuera": "Fuera de alcance",
}


def main() -> None:
    idents, real_def, cites = load_ts()
    rows = []
    for path in sorted((DECOMP / "src").glob("*.c")):
        name = path.stem
        text = path.read_text(errors="replace")
        funcs = c_functions(text)
        found, stubs = count_found(funcs, idents, real_def)
        status, note = classify(name, funcs, found, name in cites)
        rows.append((status, name, text.count("\n"), found, len(funcs), note, cites.get(name, []), len(stubs)))

    out = [
        "# Inventario del port (generado)",
        "",
        "Generado por `tools/portInventory.py` (`npm run inventory`); no editar a mano.",
        "Mide cuántas funciones de cada `.c` existen con el mismo nombre en `src/fr`.",
        "La comparación ignora mayúsculas y `_` (la capa de campo antigua usa camelCase).",
        "Un nombre presente no prueba paridad: es un indicador de avance, no de fidelidad.",
        "Una `function` TS con cuerpo trivial (vacío, `return 0;`…) cuando el C tiene",
        "código real cuenta como **stub** (columna Stubs) y no suma como portada.",
        "Las categorías fuera/cubierto/adaptador salen de las tablas del script.",
        "",
        "| Estado | Archivos | Líneas C | Funciones con nombre en TS |",
        "|---|---:|---:|---:|",
    ]
    for s in ORDER:
        sel = [r for r in rows if r[0] == s]
        out.append(f"| {TITLES[s]} | {len(sel)} | {sum(r[2] for r in sel)} | {sum(r[3] for r in sel)}/{sum(r[4] for r in sel)} |")
    todo = [r for r in rows if r[0] in ("falta", "parcial", "adaptador")]
    scope = [r for r in rows if r[0] not in ("cubierto", "fuera")]
    out.append(f"| **Pendiente de portar** | **{len(todo)}** | **{sum(r[2] for r in todo)}** | |")
    out.append(f"| **Total en alcance** | **{len(scope)}** | **{sum(r[2] for r in scope)}** | **{sum(r[3] for r in scope)}/{sum(r[4] for r in scope)}** |")
    for s in ORDER:
        sel = sorted((r for r in rows if r[0] == s), key=lambda r: (-r[2], r[1]))
        if not sel:
            continue
        out += ["", f"## {TITLES[s]}", "", "| Archivo C | Líneas | Funciones | TS que lo citan | Nota | Stubs |", "|---|---:|---:|---|---|---:|"]
        for _, name, lines, found, total, note, ts, nstubs in sel:
            fn = f"{found}/{total}" if total else "—"
            where = ", ".join(f"`{t}`" for t in ts[:3]) + (" …" if len(ts) > 3 else "")
            out.append(f"| `{name}.c` | {lines} | {fn} | {where} | {note} | {nstubs or ''} |")
    OUT.write_text("\n".join(out) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {len(rows)} archivos, pendientes {len(todo)} ({sum(r[2] for r in todo)} líneas), stubs {sum(r[7] for r in rows)}")


if __name__ == "__main__":
    main()
