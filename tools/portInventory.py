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
    "window_8bpp": "hw/window.ts: API 8bpp implementada; nullsub_9 es un no-op del C reemplazado por UnsetBgTilemapBuffer",
    "hof_pc": "hallOfFame.ts: entrada del HOF PC, consulta de equipos y retorno al menú PC",
    "save_failed_screen": "game.ts/save.ts: el error de localStorage ya muestra el texto de guardado fallido; reparación física de sectores Flash no aplica al navegador",
    "field_special_scene": "field_special_scene.c: las dos escenas públicas y los cuatro callbacks/dummies tienen cuerpo vacío en el decomp; no hay lógica que portar",
    "fldeff_teleport": "fieldMoveMenu.ts + field/fieldMoves.ts + field/overworld.ts: gate, selección/animación, callbacks y warp están conectados; CameraObjectReset2 no aplica al campo web 2D",
    "fldeff_dig": "fieldMoveMenu.ts + field/fieldMoves.ts + field/overworld.ts: CanUseEscapeRopeOnCurrMap, setup, animación ShowMon, transición a pie y escape/warp están conectados",
    "fldeff_strength": "fieldMoveMenu.ts + field/fieldMoves.ts: requisito de roca/pie, slot de selección, script, nickname, ShowMon y reanudación están conectados",
    "field_camera": "field/overworld.ts + fieldmap.ts + tileRenderer.ts + doors.ts + battle/transition.ts: el seguimiento/paneo del jugador está conectado; el viewport Canvas recompone los metatiles desde FieldMap y omite el ring buffer BG/VRAM, doors.ts dibuja el overlay y las transiciones usan una captura de pantalla. Cámara de créditos en overworldCredits.ts; MoveCameraAndRedrawMap está unused en C",
}

# Files cited by TS whose screen is still a simplified adapter (AGENTS.md §5).
ADAPTERS: dict[str, str] = {
    "teachy_tv": "menus/keyItemScreens.ts: lista de texto; teachyTv.ts no está conectado",
}


FUNC_RE = re.compile(
    r"^(?!typedef|struct\s+\w+\s*$)"
    r"(?:(?:static|inline|NAKED|UNUSED|NOINLINE|ARM_FUNC|IWRAM_CODE|EWRAM_CODE)\s+)*"
    r"[A-Za-z_][\w\s\*]*?\b([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\n\{",
    re.M,
)
KEYWORDS = {"if", "while", "for", "switch", "return", "sizeof"}
TS_FUNC_RE = re.compile(r"\bfunction\s+([A-Za-z_]\w*)\s*\(")
TS_ARROW_RE = re.compile(
    r"\b([A-Za-z_]\w*)\s*:\s*(?:\([^()]*\)|[A-Za-z_]\w*)\s*=>\s*\{"
)
TRIVIAL_LINE = re.compile(
    # Only flag empty returns and literal placeholder values. A return of a
    # variable/property (for example a C task-data pointer adapted to TS state)
    # can be a real getter and must not be mistaken for a stub.
    r"^(return(\s+(?:0|1|false|true|FALSE|TRUE|null|undefined|NULL))?;|if\s*\(!?[\w.]+\)\s*return;|void\s+[\w.]+;|//.*|/\*.*\*/|\*.*)$"
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


def strip_c_comments(text: str) -> str:
    """Blank C/TypeScript comments without changing positions or quoted text."""
    out: list[str] = []
    i = 0
    state = "code"
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if state == "code":
            if ch == "'":
                state = "char"
                out.append(ch)
            elif ch == '"':
                state = "string"
                out.append(ch)
            elif ch == "`":
                state = "template"
                out.append(ch)
            elif ch == "/" and nxt == "/":
                state = "line"
                out.extend("  ")
                i += 1
            elif ch == "/" and nxt == "*":
                state = "block"
                out.extend("  ")
                i += 1
            else:
                out.append(ch)
        elif state in ("string", "char", "template"):
            out.append(ch)
            if ch == "\\" and i + 1 < len(text):
                i += 1
                out.append(text[i])
            elif (
                (state == "string" and ch == '"')
                or (state == "char" and ch == "'")
                or (state == "template" and ch == "`")
            ):
                state = "code"
        elif state == "line":
            if ch == "\n":
                out.append(ch)
                state = "code"
            else:
                out.append(" ")
        else:  # block comment
            if ch == "*" and nxt == "/":
                out.extend("  ")
                i += 1
                state = "code"
            else:
                out.append("\n" if ch == "\n" else " ")
        i += 1
    return "".join(out)


def c_functions(text: str) -> list[tuple[str, bool]]:
    """(name, has_real_body) for each function definition in a .c file."""
    out: dict[str, bool] = {}
    uncommented = strip_c_comments(text)
    for m in FUNC_RE.finditer(uncommented):
        name = m.group(1)
        if name not in KEYWORDS and name not in out:
            out[name] = not is_trivial(body_after(uncommented, m.end() - 1))
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
        code = strip_c_comments(text)
        # Ignore comments: they describe mappings but do not implement C
        # functions. Case/underscore-insensitive for older camelCase ports.
        tokens = {norm(i) for i in re.findall(r"\b[A-Za-z_]\w*\b", code)}
        idents.update(tokens)
        for m in TS_FUNC_RE.finditer(code):
            key = norm(m.group(1))
            real = not is_trivial(body_after(code, ts_body_end(code, m.end() - 1)))
            real_def[key] = real_def.get(key, False) or real
        for m in TS_ARROW_RE.finditer(code):
            key = norm(m.group(1))
            real = not is_trivial(body_after(code, m.end() - 1))
            real_def[key] = real_def.get(key, False) or real
        rel = str(path.relative_to(SRC))
        for c in set(re.findall(r"\b([A-Za-z0-9_]+)\.c\b", text)):
            cites.setdefault(c, []).append(rel)
    return idents, real_def, cites


def generated_ts_for_source() -> dict[str, tuple[set[str], dict[str, bool]]]:
    """Return mechanically translated functions scoped to their source C file."""
    path = SRC / "generated" / "metatileBehavior.ts"
    text = path.read_text()
    code = strip_c_comments(text)
    idents = {norm(i) for i in re.findall(r"\b[A-Za-z_]\w*\b", code)}
    real_def: dict[str, bool] = {}
    for m in TS_FUNC_RE.finditer(code):
        key = norm(m.group(1))
        real = not is_trivial(body_after(code, ts_body_end(code, m.end() - 1)))
        real_def[key] = real_def.get(key, False) or real
    for m in TS_ARROW_RE.finditer(code):
        key = norm(m.group(1))
        real = not is_trivial(body_after(code, m.end() - 1))
        real_def[key] = real_def.get(key, False) or real
    return {"metatile_behavior": (idents, real_def)}


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


def classify(name: str, funcs: list[tuple[str, bool]], found: int, cited: bool, stubs: list[str]) -> tuple[str, str]:
    if name in COVERED:
        return "cubierto", COVERED[name]
    if name in ADAPTERS:
        return "adaptador", ADAPTERS[name]
    if not funcs:
        return ("datos", "") if (ROOT / "public/fr/cdata" / f"{name}.json").exists() else ("falta", "")
    ratio = found / len(funcs)
    if found == len(funcs) and not stubs:
        return "portado", ""
    if ratio >= 0.8:
        return "casi", ""
    if found or cited:
        return "parcial", ""
    return "falta", ""


ORDER = ["falta", "parcial", "adaptador", "casi", "portado", "datos", "cubierto"]
TITLES = {
    "falta": "Falta (sin funciones portadas)",
    "parcial": "Parcial (< 80 % de funciones)",
    "adaptador": "Adaptador (UI simplificada)",
    "casi": "Casi completo (≥ 80 % y < 100 %)",
    "portado": "Sin huecos de nombre (100 %; fidelidad no medida)",
    "datos": "Solo datos (exportados a cdata)",
    "cubierto": "Cubierto por hw/navegador/exportador",
}


def main() -> None:
    idents, real_def, cites = load_ts()
    generated_for_source = generated_ts_for_source()
    rows = []
    for path in sorted((DECOMP / "src").glob("*.c")):
        name = path.stem
        text = path.read_text(errors="replace")
        funcs = c_functions(text)
        c_idents = set(idents)
        c_real_def = dict(real_def)
        if name in generated_for_source:
            generated_idents, generated_defs = generated_for_source[name]
            c_idents.update(generated_idents)
            c_real_def.update(generated_defs)
        found, stubs = count_found(funcs, c_idents, c_real_def)
        if name in generated_for_source:
            generated_path = "generated/metatileBehavior.ts"
            if generated_path not in cites.setdefault(name, []):
                cites[name].append(generated_path)
        status, note = classify(name, funcs, found, name in cites, stubs)
        rows.append((status, name, text.count("\n"), found, len(funcs), note, cites.get(name, []), len(stubs)))

    out = [
        "# Inventario del port (generado)",
        "",
        "Generado por `tools/portInventory.py` (`npm run inventory`); no editar a mano.",
        "Mide cuántas funciones de cada `.c` existen con el mismo nombre en `src/fr`.",
        "La comparación ignora mayúsculas y `_` (la capa de campo antigua usa camelCase).",
        "La coincidencia de nombres no demuestra paridad funcional ni fidelidad.",
        "Una `function` TS con cuerpo trivial (vacío, `return 0;`…) cuando el C tiene",
        "código real cuenta como **stub** (columna Stubs) y no suma como portada.",
        "Las categorías cubierto/adaptador salen de las tablas del script.",
        "",
        "| Estado | Archivos | Líneas C | Funciones con nombre en TS |",
        "|---|---:|---:|---:|",
    ]
    for s in ORDER:
        sel = [r for r in rows if r[0] == s]
        out.append(f"| {TITLES[s]} | {len(sel)} | {sum(r[2] for r in sel)} | {sum(r[3] for r in sel)}/{sum(r[4] for r in sel)} |")
    todo = [r for r in rows if r[0] in ("falta", "parcial", "adaptador", "casi")]
    scope = [r for r in rows if r[0] != "cubierto"]
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
