#!/usr/bin/env python3
"""What is missing from the port to cover pokeemerald (analysis only; reads, never writes src/).

Inputs:
  refs/emerald/functions.json  per C function: identical / different / emerald_only / firered_only
  refs/emerald/systems.json    the 103 Emerald-only files grouped into 10 systems
  refs/emerald/summary.json    per-file counts (used as a cross-check)
  ../refs-src/pokeemerald/src  the pinned Emerald sources (function line spans)
  src/fr                       the port (a function counts as ported when its name appears in a TS file with a real
                               body, the same rule as tools/portInventory.py: it measures names, not fidelity)

Output: docs/EMERALD-FALTANTE.md (deterministic). Usage: python3 tools/emeraldGap.py [--check]
--check prints the cross-check numbers only.
"""

from __future__ import annotations

import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import portInventory as P  # noqa: E402  (read-only reuse of the inventory C/TS parser)

EM_SRC = ROOT.parent / "refs-src" / "pokeemerald"
FR_SRC = ROOT / "pokefirered" / "src"
OUT = ROOT / "docs" / "EMERALD-FALTANTE.md"
# Indicative size of one batch ("tanda": one whole C file) from the git history, see section 6 of the report.
TANDA_LINES = 2300

# Shared files (same name in FireRed) grouped by system. First match wins.
SHARED_SYSTEMS: list[tuple[str, str]] = [
    ("Enlace / inalámbrico / minijuegos (fuera de la meta)", r"link|union_room|rfu|agbrfu|cable_club|trade|wireless|mystery|e_reader|dodrio|pokemon_jump|berry_crush|minigame|rom_8|multiboot|cereader|battle_tower|record_mixing|wonder|battle_controller_(link|recorded)|pokedex_cry|librfu|sio"),
    ("Combate", r"^battle|^pokemon_animation|^pokemon_special_anim|^trainer_ai|^party_menu_battle"),
    ("Mundo / campo / scripts", r"^overworld|^field_|^event_|^fldeff|^script|^scrcmd|^map_|^trainer_see|^wild_encounter|^metatile|^region_map|^item_use|^new_game|^field|^cable_car|^start_menu_field|^bike|^coord_event|^roamer|^heal_location|^safari|^easy_chat|^day_night|^daycare|^decoration|^secret|^player_pc|^lilycove|^rotating|^trainer_hill|^tileset|^fieldmap|^mauville|^dewford|^berry"),
    ("Casino y minijuegos locales", r"slot_machine|roulette|casino"),
    ("Menús y pantallas", r"menu|bag|easy_chat|^pokemon_storage|^pokedex|summary|trainer_card|option|title_screen|intro|naming|learn_move|evolution|shop|^item|^party|^pokemon_storage|^help|^credits|^oak|^diploma|^hall_of_fame|^teachy|^tv$|^save|^reset|^clear_save|^main_menu|^text_window|^mail"),
    ("Pokémon / datos", r"^pokemon|^daycare|^egg|^berry|^pokedex_plus|^data$|^constants|^ability|^moves"),
    ("Hardware / runtime / sonido", r"^gpu|^bg$|^window$|^text|^sprite$|^palette|^sound|^m4a|^dma3|^main$|^load_save|^decompress|^random|^scanline|^task$|^malloc|^gba|^agb|^flash|^m4|^music|^cry|^blit|^dynamic|^string_util|^util|^trig|^math|^battle_interface|^libs|^crt|^sin|^siirtc|^overlay|^init|^help_system|^save$"),
]

# Names that mark link/wireless (outside the main goal) among the Emerald-only files too.
LINK_NAMES = re.compile(r"link|union|rfu|mystery|e_reader|wireless|cable_club|dodrio|record(ed|_mixing)|wonder|multiboot|minigame|cereader")


LINK_SYSTEM_FILES: set[str] = set()


def norm(n: str) -> str:
    return P.norm(n)


def load():
    fn = json.loads((ROOT / "refs/emerald/functions.json").read_text())["data"]
    systems = json.loads((ROOT / "refs/emerald/systems.json").read_text())["data"]
    summary = json.loads((ROOT / "refs/emerald/summary.json").read_text())["data"]
    return fn, systems, summary


def emerald_spans(files: dict[str, dict]) -> tuple[dict[str, dict[str, tuple[int, int, bool]]], dict]:
    """{file: {function: (first_line, line_count, has_real_body)}} parsed with the inventory's C parser."""
    by_name: dict[str, Path] = {}
    for p in sorted((EM_SRC / "src").rglob("*.c")):
        by_name.setdefault(p.stem, p)
    spans: dict[str, dict[str, tuple[int, int, bool]]] = {}
    stats = {"files_missing": [], "start_matches": 0, "start_total": 0}
    for name, entry in files.items():
        p = by_name.get(name)
        if not p:
            stats["files_missing"].append(name)
            continue
        text = P.strip_c_comments(p.read_text(errors="replace"))
        out: dict[str, tuple[int, int, bool]] = {}
        for m in P.FUNC_RE.finditer(text):
            fname = m.group(1)
            if fname in P.KEYWORDS or fname in out:
                continue
            body = P.body_after(text, m.end() - 1)
            end = text.find(body, m.end() - 1) + len(body) + 1 if body else m.end()
            first = text.count("\n", 0, m.start()) + 1
            out[fname] = (first, text.count("\n", m.start(), end) + 1, not P.is_trivial(body))
        spans[name] = out
        for fname, rec in entry["functions"].items():
            if rec[0] == "firered_only":
                continue
            stats["start_total"] += 1
            if fname in out and abs(out[fname][0] - rec[1]) <= 1:
                stats["start_matches"] += 1
    return spans, stats


def classify(files, spans, idents, real_def, fr_names):
    """Per function: category, C lines. Categories:
    HER_OK   identical to FireRed and the FireRed function is in the port (inherited as is)
    HER_PEND identical to FireRed but not in the port yet (pending in FireRed too)
    VAR_OK   body differs and the FireRed function is in the port: an Emerald variant is needed
    VAR_PEND body differs and FireRed's is not in the port yet
    MOVED    only in this Emerald file, but a function of that name exists in another FireRed C file (FireRed split or
             renamed the file): it is not new code, it still has to be compared function by function
    NEW      only in Emerald, no function of that name in FireRed's C and none in the port
    NEW_NAME only in Emerald, not in FireRed's C, but the name already exists in the port (shared helper?)"""
    rows = []
    for fname, entry in files.items():
        for name, rec in entry["functions"].items():
            status = rec[0]
            if status == "firered_only":
                continue
            first, n, real = spans.get(fname, {}).get(name, (rec[1], 0, True))
            key = norm(name)
            in_port = key in idents and not (real and real_def.get(key) is False)
            if status == "identical":
                cat = "HER_OK" if in_port else "HER_PEND"
            elif status == "different":
                cat = "VAR_OK" if in_port else "VAR_PEND"
            elif key in fr_names:
                cat = "MOVED"
            else:
                cat = "NEW_NAME" if in_port else "NEW"
            rows.append((fname, entry["status"], name, cat, n))
    return rows


def shared_system(name: str, link_files: set[str]) -> str:
    if f"{name}.c" in link_files:
        return "Enlace / inalámbrico / minijuegos (fuera de la meta)"
    for title, rx in SHARED_SYSTEMS:
        if re.search(rx, name):
            return title
    return "Otros archivos compartidos"


def fmt(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def tandas(lines: int) -> str:
    return f"{lines / TANDA_LINES:.1f}".replace(".", ",")


def main() -> None:
    fn, systems, summary = load()
    files = fn["files"]
    spans, span_stats = emerald_spans(files)
    idents, real_def, _ = P.load_ts()
    fr_names = {norm(n) for p_ in sorted(FR_SRC.rglob("*.c")) for n, _ in P.c_functions(p_.read_text(errors="replace"))}
    rows = classify(files, spans, idents, real_def, fr_names)
    link_files = set(P.LINK)
    LINK_SYSTEM_FILES.update(x["file"] for gr in systems if gr["system"] == "link_recording" for x in gr["files"])

    # ---------- checks
    checks: list[str] = []
    tot = defaultdict(int)
    for f, st, name, cat, n in rows:
        tot[cat] += 1
    count = {s: sum(1 for x in files.values() for r in x["functions"].values() if r[0] == s) for s in ("identical", "different", "emerald_only", "firered_only")}
    assert count == {k: fn["totals"][k] for k in count}, (count, fn["totals"])
    checks.append(f"functions.json: totales por estado = totals ({count})")
    mism = [s["file"] for s in summary if any(
        sum(1 for r in files[s["file"]]["functions"].values() if r[0] == k) != s[k.replace("emerald_only", "emerald_only")]
        for k in ("identical", "different", "emerald_only", "firered_only"))]
    checks.append(f"summary.json frente a functions.json: {len(summary) - len(mism)}/{len(summary)} archivos coinciden")
    sys_files = {x["file"] for g in systems for x in g["files"]}
    only = {n for n, x in files.items() if x["status"] == "emerald_only"}
    checks.append(f"systems.json: {len(sys_files)} archivos; coincide con los {len(only)} de solo-Emerald: {sys_files == only}")
    fr_exist = sorted(n for n in only if (FR_SRC / f"{n}.c").exists())
    checks.append(f"archivos 'solo Emerald' que existen en pokefirered/src con el mismo nombre: {len(fr_exist)} {fr_exist}")
    checks.append(f"líneas de inicio de función coincidentes con functions.json (±1): {span_stats['start_matches']}/{span_stats['start_total']}")
    checks.append(f"archivos Emerald sin fuente localizada: {span_stats['files_missing']}")
    if "--check" in sys.argv:
        print("\n".join(checks))
        return

    # ---------- aggregates
    def agg(selected):
        d = defaultdict(lambda: [0, 0])
        for f, st, name, cat, n in selected:
            d[cat][0] += 1
            d[cat][1] += n
        return d

    g = agg(rows)
    shared_rows = [r for r in rows if r[1] == "shared"]
    only_rows = [r for r in rows if r[1] == "emerald_only"]
    gs, go = agg(shared_rows), agg(only_rows)

    lines = []
    w = lines.append
    w("# Qué falta portar de pokeemerald (análisis)")
    w("")
    w("Generado por `python3 tools/emeraldGap.py` (solo lectura: no toca `src/` ni `refs/`). No editar a mano.")
    w(f"Fuente: pokeemerald `{json.loads((ROOT / 'refs/emerald/functions.json').read_text())['_meta']['commit'][:10]}` (`refs/emerald/`), inventario del port (`src/fr`) y las fuentes C de Emerald para medir cada función.")
    w("")
    w("**Cómo leer las cifras.** Una función cuenta como *en el port* si su nombre aparece en `src/fr` con cuerpo real (la misma regla de `tools/portInventory.py`): mide nombres, no fidelidad. *Idéntica* y *distinta* son comparaciones de texto entre Emerald y FireRed; una función idéntica puede leer constantes o estructuras distintas (ver `docs/SEPARACION-MOTOR.md` §2.1 y §2.3). Las líneas son líneas de C de cada función (de la firma a la llave de cierre). Las estimaciones de esfuerzo están en la sección 5 con sus supuestos.")
    w("")
    # ---------- 1. summary
    w("## 1. Resumen")
    w("")
    total_lines = sum(r[4] for r in rows)
    new = g["NEW"][1] + g["NEW_NAME"][1]
    w(f"- Emerald tiene **{fmt(len(rows))} funciones** en las que Emerald aporta algo (sin contar las {fmt(count['firered_only'])} exclusivas de FireRed): {fmt(count['identical'])} idénticas a FireRed, {fmt(count['different'])} con cuerpo distinto y {fmt(count['emerald_only'])} solo de Emerald; unas **{fmt(total_lines)} líneas** de C.")
    w(f"- **Heredables:** {fmt(g['HER_OK'][0])} funciones idénticas a FireRed cuya versión FireRed ya está en el port ({fmt(g['HER_OK'][1])} líneas). Otras {fmt(g['HER_PEND'][0])} ({fmt(g['HER_PEND'][1])} líneas) son idénticas pero la de FireRed aún no está en el port: su coste ya pertenece a la lista de FireRed.")
    w(f"- **Variantes a portar:** {fmt(g['VAR_OK'][0])} funciones con cuerpo distinto cuya versión FireRed ya está en el port ({fmt(g['VAR_OK'][1])} líneas), más {fmt(g['VAR_PEND'][0])} ({fmt(g['VAR_PEND'][1])} líneas) con la de FireRed pendiente.")
    w(f"- **Código nuevo de Emerald:** {fmt(g['NEW'][0])} funciones ({fmt(g['NEW'][1])} líneas) sin ningún homólogo por nombre en el port. De ellas {fmt(go['NEW'][0])} ({fmt(go['NEW'][1])} líneas) están en los **{len(only)} archivos exclusivos de Emerald** y {fmt(gs['NEW'][0])} ({fmt(gs['NEW'][1])} líneas) en archivos compartidos con FireRed. Aparte, {fmt(g['MOVED'][0])} funciones solo-Emerald ({fmt(g['MOVED'][1])} líneas) existen con el mismo nombre en **otro** archivo C de FireRed (FireRed repartió el código de otro modo): no son código nuevo, pero tampoco están comparadas; y {fmt(g['NEW_NAME'][0])} ({fmt(g['NEW_NAME'][1])} líneas) comparten nombre con algo del port que no está en el C de FireRed (¿ayudantes comunes?).")
    link_sh = sum(r[4] for r in shared_rows if r[3] in ("VAR_OK", "VAR_PEND", "NEW") and shared_system(r[0], link_files).startswith("Enlace"))
    link_ex = sum(r[4] for r in only_rows if r[3] == "NEW" and (LINK_NAMES.search(r[0]) or r[0] in LINK_SYSTEM_FILES))
    work = g["NEW"][1] + g["VAR_OK"][1] + g["VAR_PEND"][1]
    w(f"- **Orden de magnitud:** código nuevo + variantes = unas **{fmt(work)} líneas de C** a escribir o revisar (cota alta: {tandas(work)} tandas, sección 5). Quitando enlace e inalámbrico (fuera de la meta) quedan unas **{fmt(work - link_sh - link_ex)} líneas** ({tandas(work - link_sh - link_ex)} tandas). El reparto: {fmt(go['NEW'][1])} líneas ({go['NEW'][1] * 100 // work} %) son archivos que FireRed no tiene; las variantes de funciones compartidas son {fmt(g['VAR_OK'][1] + g['VAR_PEND'][1])} líneas ({(g['VAR_OK'][1] + g['VAR_PEND'][1]) * 100 // work} %).")
    orden_idx = len(lines)
    w("")
    # ---------- 2. global table
    w("## 2. Cuadro global por categoría")
    w("")
    w("| Categoría | Funciones | Líneas C | En archivos compartidos | En archivos solo-Emerald |")
    w("|---|---:|---:|---:|---:|")
    labels = {
        "HER_OK": "Heredable: idéntica a FireRed y ya en el port",
        "HER_PEND": "Idéntica a FireRed, pendiente en FireRed",
        "VAR_OK": "Variante: cuerpo distinto, FireRed ya en el port",
        "VAR_PEND": "Variante: cuerpo distinto, FireRed pendiente",
        "MOVED": "Movida: solo en este archivo de Emerald, pero el nombre existe en otro .c de FireRed",
        "NEW": "Nueva: solo en Emerald, sin homólogo en FireRed ni en el port",
        "NEW_NAME": "Solo en Emerald pero el nombre ya existe en el port",
    }
    for k in ("HER_OK", "HER_PEND", "VAR_OK", "VAR_PEND", "MOVED", "NEW", "NEW_NAME"):
        w(f"| {labels[k]} | {fmt(g[k][0])} | {fmt(g[k][1])} | {fmt(gs[k][0])} / {fmt(gs[k][1])} | {fmt(go[k][0])} / {fmt(go[k][1])} |")
    w("")
    w("Cada celda de las dos últimas columnas es funciones / líneas.")
    w("")
    # ---------- 3. systems
    w("## 3. Por sistema")
    w("")
    w("### 3.1 Sistemas exclusivos de Emerald (archivos que FireRed no tiene)")
    w("")
    w("Agrupación de `refs/emerald/systems.json`. Todo es código nuevo salvo el que ya tenga nombre en el port.")
    w("")
    w("| Sistema | Archivos | Funciones | Líneas C (funciones) | Líneas del archivo | Nuevas sin homólogo | Movidas desde otro .c de FireRed | Tandas (cota alta) |")
    w("|---|---:|---:|---:|---:|---:|---:|---:|")
    title = {"battle_frontier": "Frente de Batalla (arena, domo, fábrica, palacio, pirámide, pike, torre, aprendiz, Trainer Hill)",
             "clock_rtc": "Reloj y RTC (siirtc, wallclock, eventos de tiempo)", "contests": "Concursos de Pokémon",
             "link_recording": "Combates grabados y mezcla de récords (enlace)", "other": "Otros archivos exclusivos (37, ver 3.3)",
             "pokeblocks_berries": "Pokécubos y bayas (blender, pokeblock)", "pokenav_match_call": "PokéNav y Match Call",
             "secret_bases": "Bases secretas", "story_scenes": "Escenas de historia (Rayquaza, Torre Espejismo, teleférico, braille, puertas giratorias)",
             "tv_characters": "TV y personajes (Anciano de Mauville, Dewford Trend, Lilycove Lady, Walda)"}
    sys_totals = []
    for gr in sorted(systems, key=lambda x: -x["lines"]):
        fs = [x["file"] for x in gr["files"]]
        sel = [r for r in only_rows if r[0] in fs]
        a = agg(sel)
        fl = sum(x["lines"] for x in gr["files"])
        nl = a["NEW"][1] + a["VAR_OK"][1] + a["VAR_PEND"][1]
        sys_totals.append((gr["system"], nl))
        w(f"| {title.get(gr['system'], gr['system'])} | {gr['file_count']} | {fmt(gr['functions'])} | {fmt(sum(r[4] for r in sel))} | {fmt(fl)} | {fmt(a['NEW'][1])} | {fmt(a['MOVED'][1])} | {tandas(fl)} |")
    tl = sum(x["lines"] for gr in systems for x in gr["files"])
    w(f"| **Total** | **{len(only)}** | **{fmt(sum(g_['functions'] for g_ in systems))}** | **{fmt(sum(r[4] for r in only_rows))}** | **{fmt(tl)}** | **{fmt(go['NEW'][1])}** | **{fmt(go['MOVED'][1])}** | **{tandas(tl)}** |")
    w("")
    w("La columna *Tandas* usa las líneas del archivo entero (incluye tablas de datos y gráficos que el exportador ya podría generar), por eso es una cota alta.")
    w("")
    w("### 3.2 Sistemas de los archivos compartidos con FireRed")
    w("")
    w("Archivos con el mismo nombre en los dos decomps, agrupados por sistema con reglas de nombre (heurística, sin garantías: un archivo mal clasificado cae en *Otros*).")
    w("")
    w("| Sistema | Archivos | Heredables (fn / líneas) | Variantes a portar (fn / líneas) | Nuevas (fn / líneas) | Movidas desde otro .c de FireRed (fn / líneas) | Idénticas pend. en FireRed (fn) |")
    w("|---|---:|---:|---:|---:|---:|---:|")
    by_sys: dict[str, list] = defaultdict(list)
    sys_of = {}
    for name, x in files.items():
        if x["status"] == "shared":
            sys_of[name] = shared_system(name, link_files)
    for r in shared_rows:
        by_sys[sys_of[r[0]]].append(r)
    nfiles = defaultdict(int)
    for n_, s_ in sys_of.items():
        nfiles[s_] += 1
    order = sorted(by_sys, key=lambda s: -sum(r[4] for r in by_sys[s] if r[3] in ("VAR_OK", "VAR_PEND", "NEW")))
    for s_ in order:
        a = agg(by_sys[s_])
        w(f"| {s_} | {nfiles[s_]} | {fmt(a['HER_OK'][0])} / {fmt(a['HER_OK'][1])} | {fmt(a['VAR_OK'][0] + a['VAR_PEND'][0])} / {fmt(a['VAR_OK'][1] + a['VAR_PEND'][1])} | {fmt(a['NEW'][0] + a['NEW_NAME'][0])} / {fmt(a['NEW'][1] + a['NEW_NAME'][1])} | {fmt(a['MOVED'][0])} / {fmt(a['MOVED'][1])} | {fmt(a['HER_PEND'][0])} |")
    w("")
    w("#### Archivos compartidos con más trabajo (variantes + nuevas, líneas de C)")
    w("")
    w("| Archivo | Idénticas | Distintas (variante) | Nuevas | Movidas | Líneas a revisar o escribir (variantes + nuevas) | Sistema |")
    w("|---|---:|---:|---:|---:|---:|---|")
    per_file = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    for f, st, name, cat, n in shared_rows:
        per_file[f][cat][0] += 1
        per_file[f][cat][1] += n
    ranked = sorted(per_file, key=lambda f: -(per_file[f]["VAR_OK"][1] + per_file[f]["VAR_PEND"][1] + per_file[f]["NEW"][1] + per_file[f]["NEW_NAME"][1]))
    for f in ranked[:25]:
        d = per_file[f]
        work = d["VAR_OK"][1] + d["VAR_PEND"][1] + d["NEW"][1] + d["NEW_NAME"][1]
        w(f"| `{f}.c` | {d['HER_OK'][0] + d['HER_PEND'][0]} | {d['VAR_OK'][0] + d['VAR_PEND'][0]} | {d['NEW'][0] + d['NEW_NAME'][0]} | {d['MOVED'][0]} | {fmt(work)} | {sys_of[f]} |")
    w("")
    # ---------- 3.2b rewritten shared files
    rew = []
    for name, x in files.items():
        if x["status"] != "shared":
            continue
        st = defaultdict(int)
        for rec in x["functions"].values():
            st[rec[0]] += 1
        em_total = st["identical"] + st["different"] + st["emerald_only"]
        if st["emerald_only"] >= 50 and (st["identical"] + st["different"]) * 4 < em_total:
            fr_funcs = P.c_functions((FR_SRC / f"{name}.c").read_text(errors="replace")) if (FR_SRC / f"{name}.c").exists() else []
            found, _ = P.count_found(fr_funcs, idents, real_def)
            lines_new = sum(r[4] for r in shared_rows if r[0] == name and r[3] in ("NEW", "NEW_NAME"))
            rew.append((name, st["emerald_only"], lines_new, st["firered_only"], found, len(fr_funcs), x["lines"]))
    rew.sort(key=lambda r: -r[2])
    w("### 3.2b Archivos compartidos que Emerald reescribió")
    w("")
    w("Archivos con el mismo nombre en los dos juegos donde menos de una cuarta parte de las funciones de Emerald coincide por nombre con FireRed (y hay al menos 50 solo-Emerald). Aquí «solo Emerald» no significa un sistema que falte: el port ya tiene la versión de FireRed (columna *FireRed en el port*) y Emerald es otra implementación del mismo sistema. Cuántas de estas líneas hay que portar de verdad depende de si se quiere la versión de Emerald de esa pantalla o minijuego, y hay que decidirlo por sistema.")
    w("")
    w("| Archivo | Funciones solo-Emerald | Líneas C nuevas | Funciones solo-FireRed | FireRed en el port | Líneas del archivo Emerald |")
    w("|---|---:|---:|---:|---:|---:|")
    for name, eo, ln, fo, found, nfr, fl in rew:
        w(f"| `{name}.c` | {eo} | {fmt(ln)} | {fo} | {found}/{nfr} | {fmt(fl)} |")
    rew_lines = sum(r[2] for r in rew)
    w("")
    w(f"Suman {fmt(rew_lines)} líneas de C «nuevas» en {len(rew)} archivos, es decir {rew_lines * 100 // max(1, g['NEW'][1])} % de las líneas nuevas de la tabla global.")
    w("")
    lines.insert(orden_idx, f"- **Matiz importante:** {fmt(rew_lines)} de las líneas «nuevas» ({rew_lines * 100 // max(1, g['NEW'][1])} %) están en {len(rew)} archivos que los dos juegos tienen pero Emerald reescribió (sección 3.2b: `easy_chat`, `pokedex`, `slot_machine`, `pokemon_summary_screen`…). Ahí el port ya tiene la versión de FireRed del mismo sistema; la cifra mide cuánto C distinto hay, no cuánto sistema falta.")
    # ---------- 3.3 other
    w("### 3.3 Los 37 archivos exclusivos agrupados como «otros»")
    w("")
    w("| Archivo | Funciones | Líneas del archivo | Líneas C de funciones nuevas |")
    w("|---|---:|---:|---:|")
    other = next(x for x in systems if x["system"] == "other")
    for x in sorted(other["files"], key=lambda x: -x["lines"]):
        nl = sum(r[4] for r in only_rows if r[0] == x["file"] and r[3] == "NEW")
        w(f"| `{x['file']}.c` | {x['functions']} | {fmt(x['lines'])} | {fmt(nl)} |")
    w("")
    w("Esta lista contiene cosas muy distintas (fuentes, iconos, éclosión de huevos, aprendizaje de movimientos, hardware de depuración): el nombre del archivo no dice si el comportamiento ya existe en el port con otro nombre. Hay que revisar a mano cada uno antes de contarlo como pendiente.")
    w("")
    # ---------- 4. link
    link_in_only = [x for gr in systems for x in gr["files"] if LINK_NAMES.search(x["file"])]
    w("## 4. Enlace e inalámbrico")
    w("")
    w(f"Los archivos de solo-Emerald con nombre de enlace, grabación o minijuego ({len(link_in_only)} por coincidencia de nombre: {', '.join('`' + x['file'] + '`' for x in link_in_only[:12])}{'…' if len(link_in_only) > 12 else ''}) y la fila de enlace de la tabla 3.2 quedan fuera de la meta principal igual que en FireRed (decisión del usuario, 2026-09-27). Suman {fmt(sum(x['lines'] for x in link_in_only))} líneas de archivo. La coincidencia por nombre es una heurística (puede dejar fuera o incluir de más algún archivo); la sección 5 da el total con y sin enlace.")
    w("")
    # ---------- 5. effort
    w("## 5. Estimación de esfuerzo")
    w("")
    work_fn = g["NEW"][1] + g["VAR_OK"][1] + g["VAR_PEND"][1]
    link_lines = sum(x["lines"] for x in link_in_only)
    w(f"Unidad: una *tanda* de `AGENTS.md` (un archivo C completo o una familia). En el historial de este repositorio los 38 commits que nombran un `.c` cubren una mediana de 2.264 líneas de C por commit (cuartiles 1.424 y 3.563), medidas con el tamaño del archivo entero, no con lo realmente portado; uso **{fmt(TANDA_LINES)} líneas por tanda** como referencia.")
    w("")
    w("| Concepto | Líneas C | Tandas (cota alta) |")
    w("|---|---:|---:|")
    w(f"| Código nuevo (funciones solo-Emerald sin homólogo) | {fmt(g['NEW'][1])} | {tandas(g['NEW'][1])} |")
    w(f"| Variantes de funciones ya portadas (cuerpo distinto) | {fmt(g['VAR_OK'][1])} | {tandas(g['VAR_OK'][1])} |")
    w(f"| Variantes cuya versión FireRed aún no está portada | {fmt(g['VAR_PEND'][1])} | {tandas(g['VAR_PEND'][1])} |")
    w(f"| **Total** | **{fmt(work_fn)}** | **{tandas(work_fn)}** |")
    link_sh2 = sum(r[4] for r in shared_rows if r[3] in ("VAR_OK", "VAR_PEND", "NEW") and shared_system(r[0], link_files).startswith("Enlace"))
    link_ex2 = sum(r[4] for r in only_rows if r[3] == "NEW" and (LINK_NAMES.search(r[0]) or r[0] in LINK_SYSTEM_FILES))
    w(f"| De ello, enlace/inalámbrico en archivos compartidos (variantes + nuevas) | {fmt(link_sh2)} | {tandas(link_sh2)} |")
    w(f"| De ello, enlace/grabación/minijuegos en archivos solo-Emerald (por nombre de archivo) | {fmt(link_ex2)} | {tandas(link_ex2)} |")
    w(f"| **Total sin enlace** | **{fmt(work_fn - link_sh2 - link_ex2)}** | **{tandas(work_fn - link_sh2 - link_ex2)}** |")
    w("")
    w("Supuestos y límites:")
    w("")
    w("- La cota alta cuenta cada variante como si hubiera que escribirla entera. Una variante suele ser más barata que código nuevo, pero **no tengo una medida** de cuánto: no inventarla.")
    w("- No incluye datos que el exportador genera (mapas, tilesets, especies, movimientos, scripts): el informe `docs/EXPORTADOR-EMERALD.md` trata ese coste aparte y está sin verificar.")
    w("- No incluye la separación `core/` + `games/` (`docs/SEPARACION-MOTOR.md`), que es previa y aplica también a FireRed.")
    w("- Ni la validación en navegador ni el audio: cada sistema nuevo necesita sus propias comprobaciones.")
    w("")
    # ---------- 6. verification
    w("## 6. Comprobaciones hechas al generar")
    w("")
    for c in checks:
        w(f"- {c}")
    w("- Discrepancia en la documentación previa: `docs/VISION.md` habla de 3.707 funciones con cuerpo distinto y `docs/SEPARACION-MOTOR.md` de 3.680. `functions.json` da **3.680** (más 885 con el mismo nombre en otro archivo, que aquí no se cuentan); la cifra de 3.707 queda sin reproducir.")
    w("- «Idéntica» es comparación de texto con comentarios y espacios ignorados. Reutilizarla sin leer es la hipótesis más optimista.")
    w("")
    w("## 7. Cómo regenerar")
    w("")
    w("```bash")
    w("npm run refs:fetch -- pokeemerald   # fuente fijada en el commit de tools/refs/sources.json")
    w("python3 tools/emeraldGap.py          # reescribe este informe")
    w("python3 tools/emeraldGap.py --check  # solo las comprobaciones")
    w("```")
    OUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")
    print("\n".join(checks))


if __name__ == "__main__":
    main()
