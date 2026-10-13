#!/usr/bin/env python3
"""Catálogo Gen 1-9 de pokeemerald-expansion: especies, movimientos, habilidades y objetos.

Preprocesa con clang -E las tablas de datos del checkout fijado (npm run refs:fetch -- pokeemerald-expansion)
para que las condiciones `#if P_*` y los operadores `P_UPDATED_*  >= GEN_n` queden resueltos con la
CONFIGURACIÓN POR DEFECTO del repositorio, y extrae los campos de las estructuras. Escribe en
public/expansion/ (ignorado en git; npm run expansion:catalog):

  species.json    1571 entradas (formas incluidas); referencias a movimientos, habilidades, objetos y especies por índice
  moves.json, abilities.json, items.json
  Cada archivo lleva `_meta` con el commit fijado, la configuración evaluada y el generador.

Expansion es una base comunitaria: no es la fuente de verdad de ningún juego; los valores son los de su
configuración por defecto, no los de una generación concreta.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "refs"))
from common import ROOT, SOURCES, source_path  # noqa: E402

OUT = ROOT / "public" / "expansion"

HEADERS = """
#include "config/general.h"
#include "constants/global.h"
#include "constants/species.h"
#include "constants/pokedex.h"
#include "constants/pokemon.h"
#include "constants/items.h"
#include "constants/moves.h"
#include "constants/abilities.h"
#include "constants/battle.h"
#include "constants/battle_move_effects.h"
#include "constants/contest.h"
#include "constants/hold_effects.h"
#include "constants/item.h"
#include "constants/item_effects.h"
#include "config/battle.h"
#include "config/pokemon.h"
#include "config/species_enabled.h"
#include "config/overworld.h"
#include "config/item.h"
#include "config/text.h"
#include "config/dexnav.h"
#include "config/contest.h"
#include "config/ai.h"
#include "config/caps.h"
#include "config/fishing.h"
"""
CONFIG_PROBES = ["GEN_LATEST", "P_LVL_UP_LEARNSETS", "P_UPDATED_STATS", "P_UPDATED_TYPES", "P_UPDATED_ABILITIES", "P_UPDATED_EXP_YIELDS", "P_UPDATED_EVS",
                 "P_UPDATED_FRIENDSHIP", "P_UPDATED_EGG_GROUPS", "B_UPDATED_MOVE_DATA", "B_UPDATED_MOVE_TYPES", "P_GENDER_DIFFERENCES",
                 "P_MEGA_EVOLUTIONS", "P_GIGANTAMAX_FORMS", "P_ALOLAN_FORMS", "P_GALARIAN_FORMS", "P_HISUIAN_FORMS", "P_PALDEAN_FORMS"]


# ---------------------------------------------------------------- preprocesado

def preprocess(src: Path, body: str) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        tu = Path(tmp) / "tu.c"
        tu.write_text(HEADERS + body)
        r = subprocess.run(
            ["clang", "-E", "-P", "-Wundef", "-DTRUE=1", "-DFALSE=0", "-DMODERN=1", "-DTESTING=0",
             "-I", str(src / "include"), "-I", str(src / "src"), str(tu)],
            capture_output=True, text=True,
        )
    errors = [l for l in r.stderr.splitlines() if " error:" in l]
    undef = sorted(set(re.findall(r"'(\w+)' is not defined", r.stderr)))
    if r.returncode != 0 or errors:
        raise SystemExit("clang -E falló:\n" + "\n".join(errors[:8]))
    if undef:
        raise SystemExit(f"macros sin definir en #if (el resultado dependería de un 0 implícito): {undef}")
    return r.stdout


# ---------------------------------------------------------------- análisis de C simple

def split_top(s: str, sep: str = ",") -> list[str]:
    """Divide por `sep` fuera de paréntesis, llaves, corchetes y cadenas."""
    out, depth, cur, i, n = [], 0, [], 0, len(s)
    while i < n:
        c = s[i]
        if c == '"':
            j = i + 1
            while j < n and s[j] != '"':
                j += 2 if s[j] == "\\" else 1
            cur.append(s[i : j + 1])
            i = j + 1
            continue
        if c in "({[":
            depth += 1
        elif c in ")}]":
            depth -= 1
        if c == sep and depth == 0:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(c)
        i += 1
    tail = "".join(cur)
    if tail.strip():
        out.append(tail)
    return out


def match_brace(s: str, start: int) -> int:
    """Índice de la `}` que cierra la `{` en start (respeta cadenas)."""
    depth, i, n = 0, start, len(s)
    while i < n:
        c = s[i]
        if c == '"':
            i += 1
            while i < n and s[i] != '"':
                i += 2 if s[i] == "\\" else 1
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("llave sin cerrar")


def entries(text: str, prefix: str) -> list[tuple[str, str]]:
    """[(CLAVE sin prefijo, cuerpo)] de las entradas `[PREFIX_X] = { ... }` del nivel superior de la tabla."""
    out = []
    for m in re.finditer(rf"\[{prefix}_(\w+)\]\s*=\s*\{{", text):
        end = match_brace(text, m.end() - 1)
        out.append((m.group(1), text[m.end() : end]))
    return out


def fields(body: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for piece in split_top(body):
        m = re.match(r"\s*\.(\w+)\s*=\s*(.*)$", piece, re.S)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


_ESC = {"n": " ", "l": " ", "p": " ", "\\": "\\", '"': '"', "'": "'", "t": " "}


def first_string(expr: str) -> str:
    """Primer grupo de literales de cadena adyacentes (`"a" "b"`), con los saltos de línea como espacio."""
    i = expr.find('"')
    if i < 0:
        return ""
    parts: list[str] = []
    n = len(expr)
    while i < n:
        while i < n and expr[i] in " \t\r\n":
            i += 1
        if i >= n or expr[i] != '"':
            break
        j = i + 1
        buf = []
        while j < n and expr[j] != '"':
            if expr[j] == "\\" and j + 1 < n:
                buf.append(_ESC.get(expr[j + 1], expr[j + 1]))
                j += 2
            else:
                buf.append(expr[j])
                j += 1
        parts.append("".join(buf))
        i = j + 1
    return re.sub(r" +", " ", "".join(parts)).strip()


# evaluador de expresiones enteras de C (operadores, ternario, min/max)
_TOK = re.compile(r"\s*(?:(\d+\.\d+|\d+)|([A-Za-z_]\w*)|(&&|\|\||==|!=|<=|>=|<<|>>|[-+*/%<>!?:(),&|^~]))")


def c_num(expr: str) -> int | float:
    toks = []
    pos = 0
    expr = expr.strip()
    while pos < len(expr):
        m = _TOK.match(expr, pos)
        if not m:
            raise ValueError(f"expresión no soportada: {expr!r}")
        toks.append(m.group(1) or m.group(2) or m.group(3))
        pos = m.end()
    p = [0]

    def peek() -> str | None:
        return toks[p[0]] if p[0] < len(toks) else None

    def take() -> str:
        t = toks[p[0]]
        p[0] += 1
        return t

    def ternary():
        c = binary(0)
        if peek() == "?":
            take()
            a = ternary()
            if take() != ":":
                raise ValueError("ternario")
            b = ternary()
            return a if c else b
        return c

    prec = {"||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, ">": 7, "<=": 7, ">=": 7,
            "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10}

    def binary(min_p: int):
        left = unary()
        while peek() in prec and prec[peek()] >= min_p:  # type: ignore[index]
            op = take()
            right = binary(prec[op] + 1)
            left = {"||": lambda a, b: int(bool(a) or bool(b)), "&&": lambda a, b: int(bool(a) and bool(b)),
                    "|": lambda a, b: int(a) | int(b), "^": lambda a, b: int(a) ^ int(b), "&": lambda a, b: int(a) & int(b),
                    "==": lambda a, b: int(a == b), "!=": lambda a, b: int(a != b), "<": lambda a, b: int(a < b),
                    ">": lambda a, b: int(a > b), "<=": lambda a, b: int(a <= b), ">=": lambda a, b: int(a >= b),
                    "<<": lambda a, b: int(a) << int(b), ">>": lambda a, b: int(a) >> int(b), "+": lambda a, b: a + b,
                    "-": lambda a, b: a - b, "*": lambda a, b: a * b,
                    "/": lambda a, b: a // b if isinstance(a, int) and isinstance(b, int) else a / b,
                    "%": lambda a, b: a % b}[op](left, right)
        return left

    def unary():
        t = take()
        if t == "(":
            v = ternary()
            if take() != ")":
                raise ValueError("paréntesis")
            return v
        if t == "-":
            return -unary()
        if t == "!":
            return int(not unary())
        if t == "~":
            return ~int(unary())
        if re.fullmatch(r"\d+\.\d+", t):
            return float(t)
        if t.isdigit():
            return int(t)
        if t in ("min", "max") and peek() == "(":
            take()
            a = ternary()
            take()  # ,
            b = ternary()
            take()  # )
            return min(a, b) if t == "min" else max(a, b)
        raise ValueError(f"identificador no resuelto {t!r} en {expr!r}")

    v = ternary()
    if p[0] != len(toks):
        raise ValueError(f"sobran tokens en {expr!r}")
    return int(v) if float(v).is_integer() else v


def num(expr: str | None, default: int | float | None = None) -> int | float | None:
    if expr is None:
        return default
    try:
        return c_num(expr)
    except ValueError:
        return default


def ident_list(expr: str) -> list[str]:
    """`{ A, B, C }` -> ['A', 'B', 'C']."""
    m = re.search(r"\{(.*)\}", expr, re.S)
    return [t.strip() for t in split_top(m.group(1))] if m else []


def strip_prefix(v: str | None, prefix: str) -> str | None:
    if v is None:
        return None
    return v[len(prefix):] if v.startswith(prefix) else v


def gen_of(nat: int) -> int:
    for gen, top in enumerate((151, 251, 386, 493, 649, 721, 809, 905, 1025), 1):
        if nat <= top:
            return gen
    return 9


# ---------------------------------------------------------------- extracción

def enum_members(text: str, prefix: str) -> dict[str, int]:
    """Valores de un `enum` (con asignaciones explícitas y alias): PREFIX_X -> valor, sin el prefijo."""
    out: dict[str, int] = {}
    for m in re.finditer(r"enum\b[^{;]*\{", text):
        end = match_brace(text, m.end() - 1)
        body = text[m.end() : end]
        if not re.search(rf"\b{prefix}_\w+", body):
            continue
        known: dict[str, int] = {}
        nxt = 0
        for part in split_top(body):
            part = part.strip()
            if not part:
                continue
            name, _, val = part.partition("=")
            name = name.strip()
            if val.strip():
                expr = re.sub(r"[A-Za-z_]\w*", lambda t: str(known[t.group(0)]) if t.group(0) in known else t.group(0), val)
                nxt = int(c_num(expr))
            known[name] = nxt
            nxt += 1
        for k, v in known.items():
            if k.startswith(prefix + "_"):
                out[k[len(prefix) + 1:]] = v
    if not out:
        raise SystemExit(f"enum con {prefix}_ no encontrado")
    return out


def main() -> None:
    src = source_path("pokeemerald-expansion")
    commit = SOURCES["pokeemerald-expansion"]["commit"]

    cfg_lines = "\n".join(f"CFG_{c} = {c};" for c in CONFIG_PROBES)
    cfg_txt = preprocess(src, cfg_lines + "\n")
    config = {}
    for m in re.finditer(r"CFG_(\w+)\s*=\s*([^;]+);", cfg_txt):
        v = m.group(2).strip()
        # GEN_1 = 0 ... GEN_9 = 8 (include/config/general.h): las opciones de generación salen como GEN_n
        is_gen = m.group(1) in ("GEN_LATEST", "P_LVL_UP_LEARNSETS") or m.group(1).startswith(("P_UPDATED_", "B_UPDATED_"))
        config[m.group(1)] = f"GEN_{int(v) + 1}" if is_gen and v.isdigit() else v

    dex_txt = preprocess(src, "")
    # Los enums de constants/*.h quedan en el texto preprocesado.
    nat_dex = enum_members(dex_txt, "NATIONAL_DEX")
    species_enum = enum_members(dex_txt, "SPECIES")
    moves_enum = enum_members(dex_txt, "MOVE")
    abil_enum = enum_members(dex_txt, "ABILITY")
    item_enum = enum_members(dex_txt, "ITEM")

    species_txt = preprocess(src, 'const struct SpeciesInfo gSpeciesInfo[] = {\n#include "data/pokemon/species_info.h"\n};\n')
    # Cada gen_N.h es un juego completo de learnsets; el motor incluye solo el de P_LVL_UP_LEARNSETS (src/pokemon.c).
    gen_texts = {g: preprocess(src, f'#include "data/pokemon/level_up_learnsets/gen_{g}.h"\n') for g in range(1, 10)}
    egg_txt = preprocess(src, '#include "data/pokemon/egg_moves.h"\n')
    default_gen = int(config["P_LVL_UP_LEARNSETS"].removeprefix("GEN_"))
    moves_txt = preprocess(src, '#include "data/moves_info.h"\n')
    abil_txt = preprocess(src, '#include "data/abilities.h"\n')
    items_txt = preprocess(src, '#include "data/items.h"\n')

    meta_base = {"source": "pokeemerald-expansion", "commit": commit, "generator": "tools/viewer/expansion_catalog.py",
                 "config": config,
                 "note": "Valores con la configuración por defecto del repositorio (clang -E); no son los de una generación concreta."}

    # índices estables por orden del enum
    def ordered(enum: dict[str, int]) -> list[str]:
        return [k for k, _v in sorted(enum.items(), key=lambda kv: kv[1])]

    move_keys = [k for k in ordered(moves_enum) if not k.endswith(("_COUNT", "UNAVAILABLE"))]
    move_idx = {k: i for i, k in enumerate(move_keys)}
    abil_keys = [k for k in ordered(abil_enum) if k != "COUNT" and not k.endswith("_COUNT")]
    abil_idx = {k: i for i, k in enumerate(abil_keys)}
    item_keys = [k for k in ordered(item_enum) if not k.endswith("_COUNT")]
    item_idx = {k: i for i, k in enumerate(item_keys)}

    # ---- movimientos
    moves: list[dict | None] = [None] * len(move_keys)
    for key, body in entries(moves_txt, "MOVE"):
        if key not in move_idx:
            continue
        f = fields(body)
        flags = sorted(k for k, v in f.items() if re.fullmatch(r"(1|TRUE)", v) and k not in ("name",))
        moves[move_idx[key]] = {
            "key": key, "name": first_string(f.get("name", "")), "desc": first_string(f.get("description", "")),
            "effect": strip_prefix(f.get("effect"), "EFFECT_"), "power": num(f.get("power"), 0),
            "type": strip_prefix(f.get("type"), "TYPE_"), "acc": num(f.get("accuracy"), 0), "pp": num(f.get("pp"), 0),
            "prio": num(f.get("priority"), 0), "cat": strip_prefix(f.get("category"), "DAMAGE_CATEGORY_"),
            "target": strip_prefix(f.get("target"), "TARGET_"), "flags": flags,
        }
    # ---- habilidades
    abilities: list[dict | None] = [None] * len(abil_keys)
    for key, body in entries(abil_txt, "ABILITY"):
        if key not in abil_idx:
            continue
        f = fields(body)
        abilities[abil_idx[key]] = {"key": key, "name": first_string(f.get("name", "")), "desc": first_string(f.get("description", "")),
                                    "ai": num(f.get("aiRating"), 0)}
    # ---- objetos
    items: list[dict | None] = [None] * len(item_keys)
    for key, body in entries(items_txt, "ITEM"):
        if key not in item_idx:
            continue
        f = fields(body)
        items[item_idx[key]] = {
            "key": key, "name": first_string(f.get("name", "")), "desc": first_string(f.get("description", "")),
            "price": num(f.get("price"), 0), "pocket": strip_prefix(f.get("pocket"), "POCKET_"),
            "hold": strip_prefix(f.get("holdEffect"), "HOLD_EFFECT_"), "use": strip_prefix(f.get("battleUsage"), "EFFECT_ITEM_"),
        }

    # ---- aprendizajes
    def level_sets_of(text: str) -> dict[str, list[list[int]]]:
        out: dict[str, list[list[int]]] = {}
        for m in re.finditer(r"struct LevelUpMove (\w+)\[\]\s*=\s*\{(.*?)\};", text, re.S):
            mv = []
            for mm in re.finditer(r"\.move\s*=\s*(\w+),\s*\.level\s*=\s*(\d+)", m.group(2)):
                k = strip_prefix(mm.group(1), "MOVE_")
                if k in move_idx:
                    mv.append([int(mm.group(2)), move_idx[k]])
            out[m.group(1)] = mv
        return out

    level_by_gen = {g: level_sets_of(t) for g, t in gen_texts.items()}
    level_sets = level_by_gen[default_gen]
    egg_sets: dict[str, list[int]] = {}
    for m in re.finditer(r"u16 (\w+EggMoveLearnset)\[\]\s*=\s*\{(.*?)\};", egg_txt, re.S):
        egg_sets[m.group(1)] = [move_idx[k] for k in (strip_prefix(t.strip(), "MOVE_") for t in m.group(2).split(",")) if k in move_idx]
    learnables = json.loads((src / "src/data/pokemon/all_learnables.json").read_text())
    shared_txt = preprocess(src, '#include "data/pokemon/species_info/shared_dex_text.h"\n')
    dex_text = {m.group(1): first_string(m.group(2)) for m in re.finditer(r"const u8 (\w+)\[\]\s*=\s*_\((.*?)\);", shared_txt, re.S)}

    # ---- especies
    sp_entries = entries(species_txt, "SPECIES")
    species_keys = [k for k, _b in sp_entries]
    sp_idx = {k: i for i, k in enumerate(species_keys)}
    species: list[dict] = []
    learnset_name: dict[str, str] = {}
    base_key_by_nat: dict[int, str] = {}
    for key, body in sp_entries:
        f = fields(body)
        nat_key = strip_prefix(f.get("natDexNum"), "NATIONAL_DEX_") or "NONE"
        nat = nat_dex.get(nat_key, 0)
        base_key_by_nat.setdefault(nat, key)
        abil = [strip_prefix(a, "ABILITY_") for a in ident_list(f.get("abilities", "{}"))]
        evs = {k[len("evYield_"):].lower(): int(num(v, 0)) for k, v in f.items() if k.startswith("evYield_") and num(v, 0)}
        evo_expr = f.get("evolutions", "")
        evolutions = []
        m = re.search(r"\]\)\s*\{(.*)\}\s*$", evo_expr, re.S)
        if m:
            for item in split_top(m.group(1)):
                item = item.strip()
                if not item.startswith("{"):
                    continue
                parts = split_top(item[1:-1])
                if not parts or re.search(r"EVOLUTIONS_END|0xFFFF", parts[0]):
                    continue
                conds = []
                if len(parts) > 3:
                    for c in re.findall(r"\{\s*(IF_\w+)\s*,\s*([^{}]*?)\s*\}", parts[3]):
                        conds.append([c[0], c[1]])
                target = strip_prefix(parts[2].strip(), "SPECIES_")
                evolutions.append({"method": strip_prefix(parts[0].strip(), "EVO_"), "param": parts[1].strip(),
                                   "to": target, "if": conds})
        lvl_name = f.get("levelUpLearnset", "")
        learnset_name[key] = lvl_name
        egg_name = f.get("eggMoveLearnset", "")
        species.append({
            "key": key, "name": first_string(f.get("speciesName", "")), "nat": nat, "gen": gen_of(nat) if nat else 0,
            "types": [strip_prefix(t, "TYPE_") for t in ident_list(f.get("types", "{}"))],
            "base": [int(num(f.get(k), 0)) for k in ("baseHP", "baseAttack", "baseDefense", "baseSpAttack", "baseSpDefense", "baseSpeed")],
            "abilities": [abil_idx.get(a, -1) if a and a != "NONE" else -1 for a in abil],
            "catch": num(f.get("catchRate"), 0), "exp": num(f.get("expYield"), 0), "ev": evs,
            "gender": int(num(f.get("genderRatio"), 0)), "eggCycles": num(f.get("eggCycles"), 0),
            "friend": num(f.get("friendship"), 0), "growth": strip_prefix(f.get("growthRate"), "GROWTH_"),
            "eggGroups": [strip_prefix(g, "EGG_GROUP_") for g in ident_list(f.get("eggGroups", "{}"))],
            "color": strip_prefix(f.get("bodyColor"), "BODY_COLOR_"), "height": num(f.get("height"), 0), "weight": num(f.get("weight"), 0),
            "category": first_string(f.get("categoryName", "")),
            "desc": first_string(f.get("description", "")) if '"' in f.get("description", "") else dex_text.get(f.get("description", "").strip(), ""),
            "evolutions": evolutions, "level": level_sets.get(lvl_name, []), "egg": egg_sets.get(egg_name, []),
            "items": [item_idx.get(strip_prefix(f.get(k, ""), "ITEM_") or "", -1) for k in ("itemCommon", "itemRare")],
            "flags": sorted(k for k in ("isLegendary", "isMythical", "isSubLegendary", "isRestrictedLegendary", "isUltraBeast",
                                        "isParadox", "isMegaEvolution", "isPrimalReversion", "isUltraBurst", "isGigantamax",
                                        "isAlolanForm", "isGalarianForm", "isHisuianForm", "isPaldeanForm", "isTeraForm",
                                        "isTotem", "isCosmeticForm") if f.get(k) in ("1", "TRUE")),
        })
    # evoluciones: especie destino por índice; aprendizajes extra desde all_learnables.json
    unresolved = 0
    for sp in species:
        for e in sp["evolutions"]:
            idx = sp_idx.get(e["to"], -1)
            if idx < 0:
                unresolved += 1
            e["to"] = idx
        base = sp["key"]
        listed = learnables.get(base)
        if listed is None:
            continue
        known = {m for _l, m in sp["level"]} | set(sp["egg"])
        sp["other"] = sorted({move_idx[k] for k in (strip_prefix(x, "MOVE_") for x in listed) if k in move_idx} - known)

    OUT.mkdir(parents=True, exist_ok=True)

    def write(name: str, data: list, extra: dict | None = None) -> None:
        doc = {"_meta": {**meta_base, "entries": len(data), **(extra or {})}, "data": data}
        (OUT / name).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"{name}: {len(data)} entradas, {(OUT / name).stat().st_size // 1024} KB")

    write("moves.json", [m or {"key": k, "name": k.replace("_", " ").title()} for m, k in zip(moves, move_keys)])
    write("abilities.json", [a or {"key": k, "name": k.replace("_", " ").title()} for a, k in zip(abilities, abil_keys)])
    write("items.json", [i or {"key": k, "name": k.replace("_", " ").title()} for i, k in zip(items, item_keys)])
    write("species.json", species, {"evolutionTargetsUnresolved": unresolved, "defaultLearnsetGen": default_gen})
    # learnsets de las otras generaciones: especie -> [[nivel, movimiento]] (indices de moves.json)
    for g, sets in level_by_gen.items():
        if g == default_gen:
            continue
        per: dict[str, list[list[int]]] = {}
        for sp in species:
            lname = learnset_name.get(sp["key"], "")
            if sets.get(lname):
                per[sp["key"]] = sets[lname]
        doc = {"_meta": {**meta_base, "entries": len(per), "gen": g}, "data": per}
        (OUT / f"learnsets_gen{g}.json").write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    print("learnsets por generación:", sorted(f.name for f in OUT.glob("learnsets_gen*.json")))
    print(f"config: {config}")


if __name__ == "__main__":
    main()
