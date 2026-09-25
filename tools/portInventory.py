#!/usr/bin/env python3
"""Generate PORT-INVENTORY.md: one row per pokefirered/src/*.c.

For every C file it measures how many of its function definitions exist by
the same name in src/fr (the port keeps C names), which TS files cite the
file (`name.c` anywhere in a comment), and whether its constant data is
exported (public/fr/cdata/<name>.json). Categories that cannot be measured
automatically (out of scope, covered by the browser/exporter, adapters) come
from the tables below; edit them when a file changes state.

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
    "player_pc": "menus/playerPc.ts: menú superior sobre el campo canvas",
    "fame_checker": "menus/keyItemScreens.ts",
    "teachy_tv": "menus/keyItemScreens.ts",
    "pokemon_storage_system_menu": "menus/storageMenu.ts: reglas con listas",
    "slot_machine": "menus/slotMachine.ts: reglas sin gráficos",
    "trade": "pokemon/ingameTrade.ts: sin escena",
}

FUNC_RE = re.compile(
    r"^(?!static const|const|typedef|struct\s+\w+\s*$)"
    r"(?:(?:static|inline|NAKED|UNUSED|NOINLINE|ARM_FUNC|IWRAM_CODE|EWRAM_CODE)\s+)*"
    r"[A-Za-z_][\w\s\*]*?\b([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\n\{",
    re.M,
)
KEYWORDS = {"if", "while", "for", "switch", "return", "sizeof"}


def c_functions(text: str) -> list[str]:
    names = []
    for m in FUNC_RE.finditer(text):
        name = m.group(1)
        if name not in KEYWORDS:
            names.append(name)
    return list(dict.fromkeys(names))


def load_ts() -> tuple[set[str], dict[str, list[str]]]:
    idents: set[str] = set()
    cites: dict[str, list[str]] = {}
    for path in sorted(SRC.rglob("*.ts")):
        if "generated" in path.parts:
            continue
        text = path.read_text()
        # Case/underscore-insensitive: older field code uses camelCase names.
        idents.update(i.replace("_", "").lower() for i in re.findall(r"\b[A-Za-z_]\w*\b", text))
        rel = str(path.relative_to(SRC))
        for c in set(re.findall(r"\b([A-Za-z0-9_]+)\.c\b", text)):
            cites.setdefault(c, []).append(rel)
    return idents, cites


def classify(name: str, funcs: list[str], found: int, cited: bool) -> tuple[str, str]:
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
    idents, cites = load_ts()
    rows = []
    for path in sorted((DECOMP / "src").glob("*.c")):
        name = path.stem
        text = path.read_text(errors="replace")
        funcs = c_functions(text)
        found = sum(f.replace("_", "").lower() in idents for f in funcs)
        status, note = classify(name, funcs, found, name in cites)
        rows.append((status, name, text.count("\n"), found, len(funcs), note, cites.get(name, [])))

    out = [
        "# Inventario del port (generado)",
        "",
        "Generado por `tools/portInventory.py` (`npm run inventory`); no editar a mano.",
        "Mide cuántas funciones de cada `.c` existen con el mismo nombre en `src/fr`.",
        "La comparación ignora mayúsculas y `_` (la capa de campo antigua usa camelCase).",
        "Un nombre presente no prueba paridad: es un indicador de avance, no de fidelidad.",
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
        out += ["", f"## {TITLES[s]}", "", "| Archivo C | Líneas | Funciones | TS que lo citan | Nota |", "|---|---:|---:|---|---|"]
        for _, name, lines, found, total, note, ts in sel:
            fn = f"{found}/{total}" if total else "—"
            where = ", ".join(f"`{t}`" for t in ts[:3]) + (" …" if len(ts) > 3 else "")
            out.append(f"| `{name}.c` | {lines} | {fn} | {where} | {note} |")
    OUT.write_text("\n".join(out) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {len(rows)} archivos, pendientes {len(todo)} ({sum(r[2] for r in todo)} líneas)")


if __name__ == "__main__":
    main()
