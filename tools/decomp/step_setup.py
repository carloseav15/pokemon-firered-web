"""Build the decompilation's own host tools and generated headers."""

from __future__ import annotations

import re
from pathlib import Path

from common import BIN, BUILD, CPP_DEFINES, DECOMP, GAME, GEN_INCLUDE, MAPJSON_MODE, run, write_json, OUT


def build_tools() -> None:
    BIN.mkdir(parents=True, exist_ok=True)
    tools = {
        "preproc": (["tools/preproc/" + f for f in ("asm_file.cpp", "c_file.cpp", "charmap.cpp", "preproc.cpp", "string_parser.cpp", "utf8.cpp", "io.cpp")], "-std=c++17"),
        "mapjson": (["tools/mapjson/mapjson.cpp", "tools/mapjson/json11.cpp"], "-std=c++11"),
        "jsonproc": (["tools/jsonproc/jsonproc.cpp"], "-std=c++17"),
    }
    for name, (sources, std) in tools.items():
        target = BIN / name
        newest = max((DECOMP / s).stat().st_mtime for s in sources)
        if target.exists() and target.stat().st_mtime >= newest:
            continue
        print(f"  building {name}")
        run(["clang++", std, "-O2", "-w", "-Itools/jsonproc", *sources, "-o", str(target)])


def jsonproc_run(cmd: list[str]) -> bytes:
    """FireRed needs every jsonproc input. Another game may keep some of that data in C headers (pokeemerald has
    src/data/items.h, no items.json): a missing input is reported and skipped there, never silently for FireRed."""
    missing = [c for c in cmd[1:3] if not (DECOMP / c).exists()]
    if missing and GAME != "firered":
        print(f"  skipped (no {', '.join(missing)} in {GAME})")
        return b""
    return run(cmd)


def generate_headers() -> None:
    constants = GEN_INCLUDE / "constants"
    constants.mkdir(parents=True, exist_ok=True)
    maps_out = BUILD / "maps"
    layouts_out = BUILD / "layouts"
    maps_out.mkdir(parents=True, exist_ok=True)
    layouts_out.mkdir(parents=True, exist_ok=True)
    mapjson = str(BIN / "mapjson")
    jsonproc = str(BIN / "jsonproc")
    run([mapjson, "layouts", MAPJSON_MODE, "data/layouts/layouts.json", str(layouts_out), str(constants)])
    run([mapjson, "groups", MAPJSON_MODE, "data/maps/map_groups.json", str(maps_out), str(constants)])
    map_jsons = sorted(str(p.relative_to(DECOMP)) for p in (DECOMP / "data/maps").glob("*/map.json"))
    run([mapjson, "event_constants", MAPJSON_MODE, *map_jsons, str(constants / "map_event_ids.h")])
    jsonproc_run([jsonproc, "src/data/region_map/region_map_sections.json", "src/data/region_map/region_map_sections.constants.json.txt", str(constants / "region_map_sections.h")])
    jsonproc_run([jsonproc, "src/data/heal_locations.json", "src/data/heal_locations.constants.json.txt", str(constants / "heal_locations.h")])
    data_dir = GEN_INCLUDE / "data"
    (data_dir / "region_map").mkdir(parents=True, exist_ok=True)
    jsonproc_run([jsonproc, "src/data/items.json", "src/data/items.json.txt", str(data_dir / "items.h")])
    jsonproc_run([jsonproc, "src/data/wild_encounters.json", "src/data/wild_encounters.json.txt", str(data_dir / "wild_encounters.h")])
    jsonproc_run([jsonproc, "src/data/heal_locations.json", "src/data/heal_locations.json.txt", str(data_dir / "heal_locations.h")])
    jsonproc_run([jsonproc, "src/data/region_map/region_map_sections.json", "src/data/region_map/region_map_sections.entries.json.txt", str(data_dir / "region_map" / "region_map_entries.h")])
    jsonproc_run([jsonproc, "src/data/region_map/region_map_sections.json", "src/data/region_map/region_map_sections.strings.json.txt", str(data_dir / "region_map" / "region_map_entry_strings.h")])


CONSTANT_PREFIXES = (
    "FLAG_", "VAR_", "SPECIES_", "ITEM_", "MOVE_", "MUS_", "SE_", "MAP_", "LAYOUT_", "TRAINER_", "OBJ_EVENT_GFX_",
    "MOVEMENT_TYPE_", "MOVEMENT_ACTION_", "WEATHER_", "MAP_TYPE_", "LOCALID_", "METATILE_", "MB_", "BG_EVENT_",
    "TYPE_", "ABILITY_", "NATURE_", "EFFECT_", "MOVE_TARGET_", "FLAG_MAKES_CONTACT", "POCKET_", "ITEM_USE_",
    "HOLD_EFFECT_", "GROWTH_", "EGG_GROUP_", "MON_", "TRAINER_CLASS_", "TRAINER_PIC_", "TRAINER_BACK_PIC_",
    "TRAINER_ENCOUNTER_MUSIC_", "BATTLE_TYPE_", "B_OUTCOME_", "HEAL_LOCATION_", "SPAWN_", "MAPSEC_", "MULTICHOICE_",
    "STD_", "DIR_", "FLDEFF_", "FLDEFFOBJ_", "FANFARE_", "STATUS1_", "STATUS2_", "EVO_", "CONNECTION_",
    "MAP_BATTLE_SCENE_", "BATTLE_TERRAIN_", "NUM_", "MAX_", "PARTY_SIZE", "TRAINER_TYPE_", "OBJ_KIND_",
    "FADE_", "SCR_MENU_", "CONTEXT_", "LOCALID_", "SPECIAL_FLAGS_", "TEMP_FLAGS_", "TRAINER_FLAGS_",
    "SYSTEM_FLAGS", "DAILY_FLAGS", "TEMP_VARS", "SPECIAL_VARS", "GAME_STAT_", "MAP_SCRIPT_", "COIN_",
    "QL_", "HELPCONTEXT_", "MOVE_EFFECT_", "WILD_", "DOOR_", "STR_VAR_", "LAST_", "WARP_", "OBJ_EVENT_ID_", "SPRITE_", "BAG_", "PC_ITEMS_",
    "FIRST_", "BADGE_", "FEMALE", "MALE", "GENDER_", "PLAYER_AVATAR_", "COLLISION_", "CONNECTION_",
    "ELEVATION_", "SEAGALLOP_", "TRAINER_TOWER_", "FAMECHECKER_", "MOVE_TUTOR_", "HM", "TM",
    "LOCALID_", "SONG_", "B_WEATHER_", "SIDE_STATUS_", "HITMARKER_", "STAT_", "MAP_GROUP", "MAP_NUM", "TRIGGER_",
)

# Emerald-only name families (FireRed has none of them as constants, so its output must not change).
GAME_PREFIXES = {"emerald": ("BERRY_TREE_", "BERRY_STAGE_", "SECRET_BASE_", "COORD_EVENT_",
                            "OLD_ROD", "GOOD_ROD", "SUPER_ROD", "MACH_BIKE", "ACRO_BIKE", "MULTI_")}.get(GAME, ())
# Headers FireRed's list lacks. item.h holds Emerald's ITEM_TM_* enum, built from FOREACH_TMHM with an X-macro.
GAME_HEADERS = {"emerald": ["item.h", "constants/secret_bases.h", "constants/berry.h", "constants/tms_hms.h", "constants/script_menu.h"]}.get(GAME, [])

CONSTANT_HEADERS = [
    "global.h", "constants/flags.h", "constants/vars.h", "constants/species.h", "constants/items.h", "constants/moves.h",
    "constants/songs.h", "constants/maps.h", "constants/map_groups.h", "constants/layouts.h", "constants/trainers.h", "constants/event_objects.h",
    "constants/event_object_movement.h", "constants/weather.h", "constants/map_types.h", "constants/metatile_behaviors.h",
    "constants/metatile_labels.h", "constants/event_bg.h", "constants/pokemon.h", "constants/abilities.h",
    "constants/battle_move_effects.h", "constants/battle.h", "constants/item.h", "constants/hold_effects.h",
    "constants/item_effects.h", "constants/heal_locations.h", "constants/region_map_sections.h", "constants/menu.h",
    "constants/field_effects.h", "constants/trainer_types.h", "constants/map_scripts.h", "constants/game_stat.h",
    "constants/coins.h", "constants/seagallop.h", "constants/fame_checker.h", "constants/trainer_tower.h",
    "constants/battle_setup.h", "constants/map_event_ids.h", "constants/field_weather.h", "constants/sound.h",
    "constants/quest_log.h", "constants/daycare.h", "constants/help_system.h", "constants/field_tasks.h",
]


def dump_constants() -> dict[str, int]:
    """Evaluate integer #defines with the host compiler and export them."""
    header = BUILD / "constants_probe.h"
    header.write_text("".join(f'#include "{h}"\n' for h in CONSTANT_HEADERS + GAME_HEADERS if header_exists(h)))
    macros = run(["clang", "-E", "-dM", "-x", "c", *CPP_DEFINES, "-I", str(GEN_INCLUDE), "-iquote", "include", "-I", "include", str(header)]).decode()
    names = []
    for line in macros.splitlines():
        match = re.match(r"#define ([A-Za-z_][A-Za-z0-9_]*) (.+)$", line)
        if not match:
            continue
        name, value = match.groups()
        if not name.startswith(CONSTANT_PREFIXES + GAME_PREFIXES):
            continue
        if value.strip().startswith('"') or "(" in name:
            continue
        names.append(name)
    # Enum members (MAPSEC_*, some menu ids) are not macros; scrape them too.
    for header_name in CONSTANT_HEADERS + GAME_HEADERS:
        for base in (DECOMP / "include", GEN_INCLUDE):
            path = base / header_name
            if not path.exists():
                continue
            text = re.sub(r"/\*.*?\*/", "", path.read_text(errors="replace"), flags=re.S)
            text = re.sub(r"//[^\n]*", "", text)
            for block in re.findall(r"enum\s*\w*\s*\{([^}]*)\}", text):
                for member in re.findall(r"^\s*([A-Z_][A-Z0-9_a-z]*)\s*(?:=|,|$)", block, flags=re.M):
                    if member.startswith(CONSTANT_PREFIXES):
                        names.append(member)
    if GAME != "firered":
        # Enumerators generated by X-macros (Emerald's ITEM_TM_* come from FOREACH_TM) only exist after preprocessing.
        expanded = run(["clang", "-E", "-P", "-x", "c", *CPP_DEFINES, "-I", str(GEN_INCLUDE), "-iquote", "include", "-I", "include", str(header)]).decode(errors="replace")
        for block in re.findall(r"enum\s*\w*\s*\{([^}]*)\}", expanded):
            for member in re.findall(r"([A-Z_][A-Z0-9_a-z]*)\s*(?:=[^,]*)?(?:,|$)", block):
                if member.startswith(CONSTANT_PREFIXES + GAME_PREFIXES):
                    names.append(member)
    names = sorted(set(names))
    rejected: set[str] = set()
    for _ in range(12):
        source = BUILD / "constants_probe.c"
        keep = [n for n in names if n not in rejected]
        body = "\n".join(f'printf("%s %lld\\n", "{n}", (long long)({n}));' for n in keep)
        source.write_text(f'#include "global.h"\n#include "constants_probe.h"\n#include <stdio.h>\nint main(void){{\n{body}\nreturn 0;}}\n')
        exe = BUILD / "constants_probe"
        result = __import__("subprocess").run(
            ["clang", "-w", "-x", "c", *CPP_DEFINES, "-I", str(BUILD), "-I", str(GEN_INCLUDE), "-iquote", "include", "-I", "include", str(source), "-o", str(exe)],
            cwd=DECOMP, capture_output=True)
        if result.returncode == 0:
            break
        errors = result.stderr.decode()
        bad_lines = {int(m) for m in re.findall(r"constants_probe\.c:(\d+):\d+: error", errors)}
        if not bad_lines:
            raise RuntimeError(errors[:3000])
        for line in bad_lines:
            index = line - 5
            if 0 <= index < len(keep):
                rejected.add(keep[index])
    output = run([str(BUILD / "constants_probe")]).decode()
    values = {}
    for line in output.splitlines():
        name, value = line.rsplit(" ", 1)
        values[name] = int(value)
    write_json(OUT / "constants.json", values)
    print(f"  {len(values)} constants")
    return values


def header_exists(name: str) -> bool:
    return (DECOMP / "include" / name).exists() or (GEN_INCLUDE / name).exists()


def export_charmap() -> None:
    """charmap.txt as JSON so browser code can encode its own strings."""
    chars: dict[str, int] = {}
    names: dict[str, list[int]] = {}
    for line in (DECOMP / "charmap.txt").read_text(encoding="utf-8").splitlines():
        line = line.split("@")[0].rstrip()
        match = re.match(r"^'(.+)'\s*=\s*([0-9A-Fa-f ]+)$", line)
        if match:
            char = match.group(1).replace("\\n", "\n").replace("\\l", "\x0b").replace("\\p", "\x0c").replace("\\'", "'").replace('\\"', '"')
            codes = [int(v, 16) for v in match.group(2).split()]
            if len(codes) == 1 and char not in chars:
                chars[char] = codes[0]
            continue
        match = re.match(r"^([A-Z_0-9]+)\s*=\s*([0-9A-Fa-f ]+)$", line)
        if match:
            names.setdefault(match.group(1), [int(v, 16) for v in match.group(2).split()])
    write_json(OUT / "charmap.json", {"chars": chars, "names": names})
