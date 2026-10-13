#!/usr/bin/env python3
"""Story timeline (línea argumental) for the quest library.

Input : public/viewer/quests_<game>.json (tools/viewer/quest_index.py)
Output: public/viewer/story_<game>.json

A "scene" is a story variable (VAR_MAP_SCENE_* in FireRed; *_STATE / *_SCENE / *_PROGRESS in Emerald) that scripts advance
with setvar. For each scene the file keeps its steps (the values the scripts assign, with the script, its map and the
flags/variables that script and its same-map callers check) and the coordinate events that wait for a value.

ORDER IS EDITORIAL. Ordering scenes from the script dependency graph was tried and rejected: the eight badges collapsed
into two depths, so it carries no chronology. The chapters below are the official route order (a hand-written list of
locations in SPINE); each scene is placed by the longest-prefix match between its map folders and the spine
entries. Steps inside a scene are ordered by variable value, which does come from the data.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCENE_RE = re.compile(r"^VAR_(MAP_SCENE_|.*_(STATE|SCENE|PROGRESS)$)")

# (title, [map folder names or prefixes]). A map matches an entry when it equals the prefix or starts with prefix + "_".
SPINE: dict[str, list[tuple[str, list[str]]]] = {
    "firered": [
        ("Inicio: Pueblo Paleta", ["PalletTown"]),
        ("Ruta 1", ["Route1"]),
        ("Ciudad Verde", ["ViridianCity"]),
        ("Ruta 22 (rival)", ["Route22"]),
        ("Ruta 2 y Bosque Verde", ["Route2", "ViridianForest"]),
        ("Ciudad Plateada (Medalla 1)", ["PewterCity"]),
        ("Ruta 3 y Monte Luna", ["Route3", "MtMoon"]),
        ("Ruta 4 y Ciudad Celeste (Medalla 2)", ["Route4", "CeruleanCity"]),
        ("Rutas 24 y 25 (Bill)", ["Route24", "Route25"]),
        ("Rutas 5 y 6", ["Route5", "Route6", "UndergroundPath"]),
        ("Ciudad Carmín y SS Anne (Medalla 3)", ["VermilionCity", "SSAnne"]),
        ("Túnel Roca y Rutas 9-11", ["Route9", "Route10", "Route11", "RockTunnel", "DiglettsCave"]),
        ("Pueblo Lavanda y Torre Pokémon", ["LavenderTown", "PokemonTower"]),
        ("Rutas 7, 8 y Ciudad Azulona (Medalla 4)", ["Route7", "Route8", "CeladonCity", "RocketHideout"]),
        ("Rutas 12 a 18", ["Route12", "Route13", "Route14", "Route15", "Route16", "Route17", "Route18"]),
        ("Ciudad Fucsia y Zona Safari (Medalla 5)", ["FuchsiaCity", "SafariZone"]),
        ("Ciudad Azafrán, Silph S.A. (Medalla 6)", ["SaffronCity", "SilphCo", "PokemonTrainerFanClub"]),
        ("Rutas 19-21, Islas Espuma e Isla Canela (Medalla 7)", ["Route19", "Route20", "Route21", "SeafoamIslands", "CinnabarIsland", "PokemonMansion"]),
        ("Gimnasio de Ciudad Verde (Medalla 8)", ["ViridianCity_Gym"]),
        ("Ruta 23, Calle Victoria y Meseta Añil", ["Route23", "VictoryRoad", "IndigoPlateau"]),
        ("Islas Sevii (tras la Liga)", ["OneIsland", "TwoIsland", "ThreeIsland", "FourIsland", "FiveIsland", "SixIsland", "SevenIsland",
                                         "MtEmber", "BerryForest", "IcefallCave", "LostCave", "RuinValley", "TanobyRuins", "DottedHole",
                                         "PatternBush", "WaterPath", "TrainerTower", "NavelRock", "BirthIsland", "CapeBrink", "CanyonEntrance",
                                         "RocketWarehouse", "ResortGorgeous", "KindleRoad", "TreasureBeach", "OutcastIsland", "GreenPath",
                                         "BondBridge", "Route26", "Route27", "Route28", "Route29"]),
    ],
    "emerald": [
        ("Inicio: Pueblo Raíz", ["LittlerootTown"]),
        ("Ruta 101 y Pueblo Escaso", ["Route101", "OldaleTown"]),
        ("Ruta 102 y Ciudad Petalia", ["Route102", "PetalburgCity", "Route103"]),
        ("Ruta 104 y Bosque Petalia", ["Route104", "PetalburgWoods"]),
        ("Ciudad Férrica (Medalla 1)", ["RustboroCity", "Route116", "RusturfTunnel"]),
        ("Isla Cantera (Medalla 2)", ["DewfordTown", "GraniteCave", "Route105", "Route106"]),
        ("Ciudad Portual", ["SlateportCity", "Route107", "Route108", "Route109", "Route110", "NewMauville"]),
        ("Ciudad Malvalona (Medalla 3)", ["MauvilleCity", "Route117", "VerdanturfTown"]),
        ("Pueblo Lavacalda (Medalla 4)", ["Route111", "Route112", "Route113", "Route114", "Route115", "FieryPath", "LavaridgeTown", "MtChimney", "JaggedPass", "MeteorFalls", "FallarborTown"]),
        ("Gimnasio de Ciudad Petalia (Medalla 5)", ["PetalburgCity_Gym"]),
        ("Rutas 118-123 y Ciudad Arborada (Medalla 6)", ["Route118", "Route119", "Route120", "Route121", "Route122", "Route123", "FortreeCity", "WeatherInstitute", "SafariZone", "MtPyre", "ScorchedSlab", "AbandonedShip"]),
        ("Ciudad Calagua y Cueva Magma/Aqua", ["LilycoveCity", "Route124", "MagmaHideout", "AquaHideout", "Route125", "ShoalCave"]),
        ("Ciudad Algaria (Medalla 7)", ["MossdeepCity", "Route126", "Route127", "Route128", "SpaceCenter", "SeafloorCavern"]),
        ("Ciudad Arrecípolis (Medalla 8)", ["SootopolisCity", "CaveOfOrigin", "Route129", "Route130", "Route131", "SkyPillar", "Route132", "Route133", "Route134"]),
        ("Calle Victoria y Liga Pokémon", ["EverGrandeCity", "VictoryRoad", "Route128"]),
        ("Tras la Liga: Frente de Batalla y extras", ["BattleFrontier", "BattleTower", "SouthernIsland", "FarawayIsland", "BirthIsland", "NavelRock", "TerraCave", "MarineCave", "DesertRuins", "IslandCave", "AncientTomb", "Route1"]),
    ],
}


def best_entry(spine, folders):
    """Spine index with the longest matching prefix over all of the scene's map folders (None if no match)."""
    best = None
    for f in folders:
        for i, (_, prefixes) in enumerate(spine):
            for p in prefixes:
                if f == p or f.startswith(p + "_"):
                    key = (len(p), -i)
                    if best is None or key > best[0]:
                        best = (key, i)
    return None if best is None else best[1]


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def best_by_name(spine, var: str):
    """Placement by the variable's own name (VAR_MAP_SCENE_PEWTER_CITY_MUSEUM_1F -> pewtercitymuseum1f)."""
    base = re.sub(r"^VAR_(MAP_SCENE_)?", "", var)
    base = re.sub(r"_(STATE|SCENE|PROGRESS)$", "", base)
    n = norm(base)
    best = None
    for i, (_, prefixes) in enumerate(spine):
        for p in prefixes:
            pn = norm(p)
            if n.startswith(pn):
                key = (len(pn), -i)
                if best is None or key > best[0]:
                    best = (key, i)
    return None if best is None else best[1]


def main(game: str) -> int:
    d = json.loads((ROOT / "public" / "viewer" / f"quests_{game}.json").read_text())
    scripts = d["scripts"]
    callers: dict[str, list[str]] = defaultdict(list)
    for label, s in scripts.items():
        for callee in s["calls"]:
            if callee in scripts and callee != label:
                callers[callee].append(label)

    def effective(label: str) -> tuple[set[str], set[str]]:
        flags: set[str] = set()
        vars_: set[str] = set()
        seen, frontier, area = {label}, [label], scripts[label]["map"]
        for _ in range(7):
            nxt = []
            for l in frontier:
                s = scripts[l]
                flags.update(s["checks"])
                vars_.update(s["varChecks"])
                for c in callers.get(l, []):
                    if c not in seen and scripts[c]["map"] == area:
                        seen.add(c)
                        nxt.append(c)
            frontier = nxt
            if not frontier:
                break
        return flags, vars_

    spine = SPINE[game]
    chapters = [{"index": i, "title": t, "scenes": []} for i, (t, _) in enumerate(spine)]
    unplaced: list[dict] = []
    for name, v in d["vars"].items():
        if not SCENE_RE.match(name) or not v["setBy"]:
            continue
        values: dict[str, list] = defaultdict(list)
        for label, val in v["setBy"]:
            values[val].append(label)
        steps = []
        for val in sorted(values, key=lambda x: (not x.lstrip("-").isdigit(), int(x) if x.lstrip("-").isdigit() else 0, x)):
            reqs: set[str] = set()
            for l in values[val]:
                fl, vr = effective(l)
                reqs |= {f"flag {f}" for f in fl} | {f"var {x}" for x in vr if x != name}
            steps.append({"value": val, "scripts": [{"label": l, "map": scripts[l]["map"]} for l in values[val]], "requires": sorted(reqs)[:12]})
        maps = sorted({scripts[l]["map"] for l, _ in [(lab, 0) for lab, _ in v["setBy"]]})
        scene = {"var": name, "maps": maps, "steps": steps, "gates": v["gates"], "checkedBy": v["checkedBy"][:10]}
        idx = best_by_name(spine, name)
        if idx is None:
            idx = best_entry(spine, maps + [g["map"] for g in v["gates"]])
        (unplaced if idx is None else chapters[idx]["scenes"]).append(scene)
    for c in chapters:
        c["scenes"].sort(key=lambda s: s["var"])
    out = {
        "_meta": {"generator": "tools/viewer/story_index.py", "game": game,
                  "note": "capítulos = orden oficial de rutas escrito a mano; escenas colocadas por su mapa; pasos ordenados por valor de variable"},
        "chapters": chapters,
        "unplaced": sorted(unplaced, key=lambda s: s["var"]),
    }
    dst = ROOT / "public" / "viewer" / f"story_{game}.json"
    dst.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    placed = sum(len(c["scenes"]) for c in chapters)
    print(f"{dst.relative_to(ROOT)}: {placed} scenes placed in {sum(1 for c in chapters if c['scenes'])} chapters, {len(unplaced)} unplaced")
    return 0


if __name__ == "__main__":
    for g in sys.argv[1:] or ["firered", "emerald"]:
        main(g)
