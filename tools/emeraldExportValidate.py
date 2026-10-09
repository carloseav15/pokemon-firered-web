#!/usr/bin/env python3
"""Cross-check the Emerald data exported by tools/decomp (public/emerald) against refs/emerald/*.json.

Two independent pipelines read the same pokeemerald commit: the exporter compiles the C data with clang, while
tools/refs/emerald_*.py parse the sources as text. Equal values show the exporter read the right tables; they say nothing
about the ROM or the engine. Run `EXPORT_GAME=emerald python3 tools/decomp/export.py` first. Exit status 1 on any mismatch.
"""

from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/emerald"
REFS = ROOT / "refs/emerald"


def load(path: Path):
    return json.loads(path.read_text())


constants = load(OUT / "constants.json")
# a byte can have several characters (0x2D is both "&" and the Japanese "を"): prefer the ASCII/Latin one
charmap: dict[str, str] = {}
for char, byte in sorted(load(OUT / "charmap.json")["chars"].items(), key=lambda kv: (ord(kv[0][0]) >= 0x3000, ord(kv[0][0]))):
    charmap.setdefault(str(byte), char)
# constants.json holds the script-visible ones; the rest (BODY_COLOR_*, ...) come from the tsconst step
TS_CONSTANTS = ROOT / "src/games/emerald/generated/constants.ts"
if TS_CONSTANTS.exists():
    for line in TS_CONSTANTS.read_text().splitlines():
        if line.startswith("export const "):
            name, value = line[len("export const "):].rstrip(";").split(" = ")
            constants.setdefault(name, int(value))
failures: list[str] = []
checked = 0


def decode(text: str) -> str:
    out = []
    for byte in base64.b64decode(text):
        if byte == 0xFF:
            break
        out.append(charmap.get(str(byte), "?"))
    # bytes 0x55-0x59 spell {POKEBLOCK} in the charmap but also decode as katakana
    return "".join(out).replace("オカキクケ", "{POKEBLOCK}")


def spelled(text: str) -> str:
    """A source string with {NAME} tokens (charmap.json "names") written the way decode() shows their bytes."""
    names = load(OUT / "charmap.json")["names"]
    return re.sub(r"\{(\w+)\}", lambda m: "".join(charmap.get(str(b), "?") for b in names[m.group(1)]) if m.group(1) in names else m.group(0), text)


def num(value):
    """Reference value (constant name, number or small macro) -> number."""
    if isinstance(value, (int, float)):
        return int(value)
    if value in constants:
        return constants[value]
    if value == "FALSE":
        return 0
    if value == "TRUE":
        return 1
    raise KeyError(value)


def expect(label: str, got, want) -> None:
    global checked
    checked += 1
    if got != want:
        failures.append(f"{label}: exported {got!r}, reference {want!r}")


def species() -> None:
    exported = load(OUT / "data/species.json")["species"]
    ref = load(REFS / "species.json")["data"]
    expect("species count", len(exported), len(ref))
    for r in ref:
        i = r["id"]
        e = exported[i]
        tag = f"species {i} {r['const']}"
        expect(tag + " base", e["base"], r["base_stats"])
        expect(tag + " types", e["types"], [num(t) for t in r["types"]])
        expect(tag + " abilities", e["abilities"], [num(a) for a in r["abilities"]])
        expect(tag + " eggGroups", e["eggGroups"], [num(g) for g in r["egg_groups"]])
        expect(tag + " catchRate", e["catchRate"], r["catch_rate"])
        expect(tag + " expYield", e["expYield"], r["exp_yield"])
        expect(tag + " evYield", e["evYield"], r["ev_yields"])
        expect(tag + " eggCycles", e["eggCycles"], r["egg_cycles"])
        expect(tag + " growth", e["growthRate"], num(r["growth_rate"]))
        expect(tag + " items", e["items"], [num(x) for x in r["items"]])
        expect(tag + " color", e["color"], num(r["body_color"]))
        if r["friendship"] == "STANDARD_FRIENDSHIP":
            expect(tag + " friendship", e["friendship"], 70)
        else:
            expect(tag + " friendship", e["friendship"], num(r["friendship"]))


def moves() -> None:
    exported = load(OUT / "data/moves.json")["moves"]
    ref = load(REFS / "moves.json")["data"]
    expect("move count", len(exported), len(ref))
    for r in ref:
        e = exported[r["id"]]
        tag = f"move {r['id']} {r['const']}"
        expect(tag + " power", e["power"], r["power"])
        expect(tag + " accuracy", e["accuracy"], r["accuracy"])
        expect(tag + " pp", e["pp"], r["pp"])
        expect(tag + " priority", e["priority"], r["priority"])
        expect(tag + " chance", e["chance"], r["effect_chance"])
        expect(tag + " type", e["type"], num(r["type"]))
        expect(tag + " effect", e["effect"], num(r["effect"]))
        expect(tag + " target", e["target"], num(r["target"]))


def trainers() -> None:
    exported = load(OUT / "data/trainers.json")
    ref = load(REFS / "trainers.json")["data"]
    expect("trainer count", len(exported), len(ref))
    for index, r in enumerate(ref):
        e = exported[index]
        tag = f"trainer {index} {r['const']}"
        expect(tag + " name", decode(e["name"]), r["name"])
        expect(tag + " class", e["class"], num(r["class"]))
        expect(tag + " double", e["double"], num(r["double"]))
        expect(tag + " party size", len(e["party"]), len(r["party"]))
        for slot, (pe, pr) in enumerate(zip(e["party"], r["party"])):
            expect(f"{tag} mon {slot} species", pe["species"], num(pr["species"]))
            expect(f"{tag} mon {slot} level", pe["level"], pr["lvl"])
            expect(f"{tag} mon {slot} iv", pe["iv"], pr["iv"])


def maps() -> None:
    ref = load(REFS / "maps.json")["data"]
    exported = load(OUT / "maps.json")
    names = {n for group in exported["groups"] for n in group}
    expect("map count", len(names), len(ref))
    expect("map names", sorted(names), sorted(r["name"] for r in ref))


def map_files() -> None:
    ref = load(REFS / "maps.json")["data"]
    by_name = {r["name"]: r for r in ref}
    for r in ref:
        path = OUT / "maps" / f"{r['id']}.json"
        if not path.exists():
            expect(f"map {r['id']} file", None, "present")
            continue
        e = load(path)
        tag = f"map {r['id']}"
        expect(tag + " name", e["name"], r["name"])
        expect(tag + " music", e["musicName"], r["music"])
        expect(tag + " weather", e["weather"], num(r["weather"]))
        expect(tag + " type", e["mapType"], num(r["map_type"]))
        for key, count in (("objects", "object_event_count"), ("warps", "warp_event_count"), ("coords", "coord_event_count"), ("bgs", "bg_event_count")):
            # maps with shared_events_map (the contest halls) reuse another map's events; the reference leaves their counts null
            owner = by_name[r["shared_events_map"]] if r["shared_events_map"] else r
            expect(f"{tag} {key}", len(e[key]), owner[count])
        expect(tag + " connections", len(e["connections"]), len(r["connections"] or []))


def weather_events() -> None:
    """The 86 coord events of type weather (a weather change tied to a tile) and each map header's weather."""
    expected = []
    for path in sorted((SRC / "data/maps").glob("*/map.json")):
        data = load(path)
        for event in data.get("coord_events", []):
            if event["type"] == "weather":
                expected.append((data["id"], event["x"], event["y"], num(event.get("elevation", 0)), num(event["weather"])))
    got = []
    for path in sorted((OUT / "maps").glob("*.json")):
        data = load(path)
        got += [(data["id"], e["x"], e["y"], e["elevation"], e["weather"]) for e in data["coords"] if e.get("type") == "weather"]
    expect("weather event count", len(got), len(expected))
    expect("weather events", sorted(got), sorted(expected))
    print(f"  weather coord events: {len(expected)}")


def wild() -> None:
    source = ROOT.parent / "refs-src/pokeemerald/src/data/wild_encounters.json"
    if not source.exists():
        print("  (skipped wild: refs-src/pokeemerald not found)")
        return
    exported = load(OUT / "data/wild.json")["maps"]
    headers: dict[str, list[dict]] = {}
    for group in load(source)["wild_encounter_groups"]:
        for entry in group["encounters"]:
            if "map" in entry:
                headers.setdefault(entry["map"], []).append(entry)
    expect("wild map set", sorted(exported), sorted(headers))
    kinds = ("land_mons", "water_mons", "rock_smash_mons", "fishing_mons")
    for map_id, e in exported.items():
        # a map can have several headers (weather/time variants): the export must equal one of them
        matches = False
        for header in headers.get(map_id, []):
            same = True
            for kind in kinds:
                src = header.get(kind)
                got = e.get(kind)
                if (src is None) != (got is None):
                    same = False
                elif src is not None:
                    want = [[m["min_level"], m["max_level"], num(m["species"])] for m in src["mons"]]
                    same = same and got["rate"] == src["encounter_rate"] and got["mons"] == want
            matches = matches or same
        expect(f"wild {map_id}", matches, True)


def incbin_sizes() -> None:
    """Sizes of the converted graphics against the source images: 4bpp = w*h/2 bytes, gbapal = 2 bytes per colour."""
    import re
    try:
        from PIL import Image
    except ImportError:
        print("  (skipped incbin sizes: Pillow not installed)")
        return
    root = ROOT.parent / "refs-src/pokeemerald"
    if not root.exists():
        print("  (skipped incbin sizes: refs-src/pokeemerald not found)")
        return
    symbols = load(OUT / "incbin/index.json")["symbols"]
    pattern = re.compile(r'(\w+)\[\]\s*=\s*INCGFX_U(?:8|16|32)\("([^"]+)",\s*"(\.4bpp|\.gbapal)(?:\.lz)?"\)')
    seen = 0
    for path in sorted((root / "src").rglob("*.[ch]")):
        for symbol, source, kind in pattern.findall(path.read_text(errors="replace")):
            # headers (trade.h) are indexed under the .c file that includes them: match on the symbol alone
            candidates = [v for k, v in symbols.items() if k.split(":")[-1] == symbol]
            if not candidates:
                expect(f"incbin {symbol} present", None, "present")
                continue
            if kind == ".4bpp" and source.endswith(".png"):
                width, height = Image.open(root / source).size
                want = width * height // 2
            elif kind == ".gbapal" and source.endswith(".pal"):
                lines = (root / source).read_text().split()
                want = int(lines[2]) * 2
            else:
                continue
            seen += 1
            expect(f"incbin {symbol} ({source}) size", want in [c[2] for c in candidates], True)
    print(f"  incbin sizes compared: {seen}")


def pokemon_images() -> None:
    from PIL import Image
    manifest = load(OUT / "gfx.json")["pokemon"]
    root = ROOT.parent / "refs-src/pokeemerald/graphics/pokemon"
    compared = 0
    for sid, name in manifest.items():
        source = root / name.lower() / "front.png"
        if source.exists():
            compared += 1
            expect(f"front {sid} {name} size", Image.open(OUT / f"gfx/pokemon/front/{sid}.png").size, Image.open(source).size)
    print(f"  Pokemon front images compared with their source png: {compared} of {len(manifest)}")


SRC = ROOT.parent / "refs-src/pokeemerald"


def c_strings(text: str) -> list[str]:
    """Concatenated string literals of a C initializer, with the \\n \\l \\p escapes kept as the game stores them."""
    return re.findall(r'"((?:[^"\\]|\\.)*)"', text)


def items() -> None:
    exported = load(OUT / "data/items.json")["items"]
    source = (SRC / "src/data/items.h").read_text()
    descriptions = {}
    for name, body in re.findall(r"static const u8 (\w+)\[\]\s*=\s*_\(((?:\s*\"(?:[^\"\\]|\\.)*\")+)\s*\);", (SRC / "src/data/text/item_descriptions.h").read_text()):
        descriptions[name] = "".join(c_strings(body))
    blocks = re.findall(r"\[(ITEM_\w+)\]\s*=\s*\{(.*?)\n    \},", source, re.S)
    expect("item blocks", len(blocks), len(exported))
    scope = {**constants, "ITEM_TO_MAIL": lambda i: i - constants["FIRST_MAIL_INDEX"], "ITEM_TO_BERRY": lambda i: i - constants["FIRST_BERRY_INDEX"] + 1}
    compared = 0
    for const, body in blocks:
        body = re.sub(r"//[^\n]*", "", body)
        fields = dict(re.findall(r"\.(\w+)\s*=\s*(.+?),\s*(?:\n|$)", body))
        index = constants[const]
        e = exported[index]
        tag = f"item {index} {const}"
        expect(tag + " const", e["const"], const)
        name = re.search(r'_\("((?:[^"\\]|\\.)*)"\)', fields.get("name", '_("")'))
        expect(tag + " name", decode(e["name"]), name.group(1) if name else "")
        for field in ("price", "importance", "registrability", "secondaryId", "holdEffectParam"):
            if field in fields:
                expect(f"{tag} {field}", e[field], eval(fields[field], {}, scope))
            else:
                expect(f"{tag} {field}", e[field], 0)
        for field in ("pocket", "type", "battleUsage", "holdEffect"):
            if field in fields:
                expect(f"{tag} {field}", e[field], eval(fields[field], {}, scope))
            else:
                expect(f"{tag} {field}", e[field], 0)
        for field in ("fieldUseFunc", "battleUseFunc"):
            expect(f"{tag} {field}", e.get(field) or "NULL", fields.get(field, "NULL"))
        desc = fields.get("description")
        if desc in descriptions:
            expect(tag + " description", decode(e["description"]).replace("\n", " ").replace("\\", ""), descriptions[desc].replace("\\n", " ").replace("\\p", " ").replace("\\l", " "))
        compared += 1
    print(f"  items compared: {compared} of {len(exported)}")


def tilesets() -> None:
    """Tileset pixels, metatiles, attributes and palettes against data/tilesets/*: the exporter reads the same files through
    gbagfx and the C headers, this recomputes 4bpp tiles from the png and compares the .bin files byte for byte."""
    from PIL import Image
    graphics = (SRC / "src/data/tilesets/graphics.h").read_text() + (SRC / "src/graphics.c").read_text()
    headers = (SRC / "src/data/tilesets/headers.h").read_text()
    metatile_sources = (SRC / "src/data/tilesets/metatiles.h").read_text()
    names = re.findall(r"const struct Tileset (gTileset_\w+)\s*=", headers)
    exported = {p.stem: load(p) for p in (OUT / "tilesets").glob("*.json")}
    expect("tileset names", sorted(exported), sorted(names))
    for name in names:
        e = exported.get(name)
        if e is None:
            continue
        suffix = name.removeprefix("gTileset_")
        body = re.search(rf"const struct Tileset {name}\s*=\s*\{{(.*?)\n\}};", headers, re.S).group(1)
        expect(f"{name} isSecondary", e["isSecondary"], "TRUE" in re.search(r"\.isSecondary = (\w+)", body).group(1))
        callback = re.search(r"\.callback = (\w+)", body).group(1)
        expect(f"{name} callback", e["callback"] or "NULL", callback)
        tiles_symbol = re.search(r"\.tiles = (\w+)", body).group(1)
        found = re.search(rf'{tiles_symbol}\[\] = INCGFX_U32\("([^"]+)/tiles\.png",\s*"[^"]+"(?:,\s*"([^"]*)")?', graphics)
        folder, flags = found.group(1), found.group(2) or ""
        limit = re.search(r"-num_tiles (\d+)", flags)
        base = SRC / folder
        image = Image.open(base / "tiles.png")
        width, height = image.size
        pixels = list(image.getdata())
        packed = bytearray()
        for ty in range(height // 8):
            for tx in range(width // 8):
                for y in range(8):
                    row = [pixels[(ty * 8 + y) * width + tx * 8 + x] & 0xF for x in range(8)]
                    packed += bytes(row[i] | (row[i + 1] << 4) for i in range(0, 8, 2))
        if limit:  # gbagfx -num_tiles keeps only the first N tiles
            packed = packed[:int(limit.group(1)) * 32]
        expect(f"{name} tiles", base64.b64decode(e["tiles"]), bytes(packed))
        def bin_of(field: str) -> bytes:
            symbol = re.search(rf"\.{field} = (\w+)", body).group(1)
            return (SRC / re.search(rf'{symbol}\[\] = INCBIN_U16\("([^"]+)"', metatile_sources).group(1)).read_bytes()
        expect(f"{name} metatiles", base64.b64decode(e["metatiles"]), bin_of("metatiles"))
        expect(f"{name} attributes", base64.b64decode(e["attributes"]), bin_of("metatileAttributes"))
        # attributes32: the same metatiles in FireRed's layout (behavior bits 0-8, layer type bits 29-30, nothing else)
        raw = bin_of("metatileAttributes")
        want32 = bytearray()
        for offset in range(0, len(raw), 2):
            value = raw[offset] | (raw[offset + 1] << 8)
            want32 += ((value & 0xFF) | (((value >> 12) & 3) << 29)).to_bytes(4, "little")
            expect(f"{name} attribute {offset // 2} has no unused bits", (value & 0x0F00, value >> 12 <= 2), (0, True))
        expect(f"{name} attributes32", base64.b64decode(e["attributes32"]), bytes(want32))
        expect(f"{name} attributes keep the 16-bit original", e["attributeBits"], 16)
        palette_symbol = re.search(r"\.palettes = (\w+)", body).group(1)
        palette_block = re.search(rf"{palette_symbol}\[\]\[16\] =\s*\{{(.*?)\n\}};", graphics, re.S).group(1)
        palette_files = re.findall(r'INCGFX_U16\("([^"]+\.pal)"', palette_block)
        expect(f"{name} palette count", len(e["palettes"]), len(palette_files))
        for index, palette in enumerate(e["palettes"]):
            lines = (SRC / palette_files[index]).read_text().split()
            colors = [[(int(lines[3 + 3 * i + c]) >> 3) << 3 for c in range(3)] for i in range(16)]
            expect(f"{name} palette {index}", palette, colors)
    print(f"  tilesets compared: {len(names)}")


def audio() -> None:
    root = SRC / "sound"
    # songs: song_table.inc (order, player, priority) + midi.cfg (volume, reverb, voicegroup)
    players = {"MUSIC_PLAYER_BGM": 0, "MUSIC_PLAYER_SE1": 1, "MUSIC_PLAYER_SE2": 2, "MUSIC_PLAYER_SE3": 3}
    table = re.findall(r"^\s*song\s+(\w+),\s*(\w+),\s*(\d+)", (root / "song_table.inc").read_text(), re.M)
    config = {}
    for line in (root / "songs/midi/midi.cfg").read_text().splitlines():
        m = re.match(r"^(\S+\.mid):\s*(.*)$", line)
        if m:
            config[m.group(1)] = m.group(2)
    songs = load(OUT / "audio/songs.json")["songs"]
    named = [s for s in songs if s["midi"]]
    expect("song table entries", len(table), 610 - 0 if len(table) == len(songs) else len(table))
    expect("song count", len(songs), len(table))
    for index, (name, player, priority) in enumerate(table):
        e = songs[index]
        tag = f"song {index} {name}"
        expect(tag + " name", e["name"], name)
        expect(tag + " player", e["player"], players[player])
        cfg = config.get(f"{name}.mid")
        if cfg is None:
            continue
        flags = dict(re.findall(r"-([A-Z])(\S*)", cfg))
        # the third column of `song` is an unnamed field in the macro; the priority comes from midi.cfg -P
        expect(tag + " priority", e["priority"], int(flags.get("P", 0)))
        expect(tag + " volume", e["volume"], int(flags.get("V", 100)))
        expect(tag + " reverb", e["reverb"], int(flags.get("R", 0)))
        expect(tag + " voicegroup", e["voicegroup"], flags.get("G", 0))
    midi_files = {p.name for p in (root / "songs/midi").glob("*.mid")}
    expect("midi files exported", sorted(p.name for p in (OUT / "audio/midi").glob("*.mid")), sorted(midi_files))
    # voice groups: names and the sequence of voice kinds
    groups = load(OUT / "audio/voicegroups.json")["groups"]
    source_groups: dict[str, list[str]] = {}
    current = None
    for path in sorted((root / "voicegroups").rglob("*.inc")):
        for raw in path.read_text().splitlines():
            line = raw.split("@")[0].strip()
            m = re.match(r"voice_group\s+(\w+)", line)
            if m:
                current = "voicegroup_" + m.group(1)
                source_groups[current] = []
            elif current and re.match(r"voice_\w+\s", line + " "):
                source_groups[current].append(line.split()[0])
    expect("voicegroup names", sorted(groups), sorted(source_groups))
    for name, kinds in source_groups.items():
        if name in groups:
            expect(f"{name} voices", [v["kind"] for v in groups[name]], kinds)
    # direct sound samples and cries
    samples = load(OUT / "audio/samples.json")["samples"]
    labels = re.findall(r"^(DirectSoundWaveData_\w+)::", (root / "direct_sound_data.inc").read_text(), re.M)
    # the export keeps the samples some voice uses; every one of them must be a label of direct_sound_data.inc and map to its .bin
    used = {v["sample"] for voices in groups.values() for v in voices if "sample" in v}
    incbins = dict(re.findall(r'^(DirectSoundWaveData_\w+)::[^\n]*\n\s*\.incbin "sound/direct_sound_samples/([^"]+)\.bin"', (root / "direct_sound_data.inc").read_text(), re.M))
    for label, wav in samples.items():
        expect(f"sample {label} file", wav, incbins.get(label, "?") + ".wav")
    expect("sample set = samples used by the voice groups", sorted(samples), sorted(used))
    expect("every sample is a direct sound label", sorted(set(samples) - set(labels)), [])
    cries = load(OUT / "audio/cries.json")
    forward = re.findall(r"^\s*cry\s+(\w+)", (root / "cry_tables.inc").read_text(), re.M)
    expect("cry count", len(cries["order"]), len(forward))
    files = dict(re.findall(r'^(\w+)::\s*\n\s*\.incbin "[^"]*?/([^/"]+)\.bin"', (root / "direct_sound_data.inc").read_text(), re.M))
    expect("cry order", [n.removesuffix(".wav") if n else None for n in cries["order"]], [None if (files.get(c) or "").startswith("unused_") else files.get(c) for c in forward])
    keysplits = load(OUT / "audio/keysplit_tables.json")
    source_tables = re.findall(r"^keysplit\s+(\w+)", (root / "keysplit_tables.inc").read_text(), re.M)
    expect("keysplit tables", sorted(keysplits), sorted("keysplit_" + n for n in source_tables))
    print(f"  songs {len(table)}, voice groups {len(source_groups)}, samples {len(labels)}, cries {len(forward)}, keysplits {len(source_tables)}")


def fonts() -> None:
    from PIL import Image
    exported = load(OUT / "gfx/fonts.json")
    text = (SRC / "src/fonts.c").read_text()
    table = {"small": "latin_small", "small_narrow": "latin_small_narrow", "narrow": "latin_narrow", "short": "latin_short", "normal": "latin_normal"}
    for key, file in table.items():
        symbol = "gFont" + "".join(w.capitalize() for w in key.split("_")) + "LatinGlyphWidths"
        body = re.search(rf"{symbol}\[\] = \{{(.*?)\}};", text, re.S).group(1)
        widths = [int(x) for x in re.findall(r"\d+", body)]
        expect(f"font {key} widths", exported[key]["widths"], widths)
        image = Image.open(SRC / f"graphics/fonts/{file}.png")
        expect(f"font {key} size", (exported[key]["width"], exported[key]["height"]), image.size)
        expect(f"font {key} pixels", base64.b64decode(exported[key]["pixels"]), bytes(image.getdata()))


def ts_constants() -> None:
    """Every plain `#define NAME <integer>` of include/constants/*.h that the tsconst step kept has the value written in the header."""
    if not TS_CONSTANTS_PATH.exists():
        print("  (skipped tsconst: run the tsconst step first)")
        return
    exported = {}
    for line in TS_CONSTANTS_PATH.read_text().splitlines():
        if line.startswith("export const "):
            name, value = line[len("export const "):].rstrip(";").split(" = ")
            exported[name] = int(value)
    seen = missing = 0
    for path in sorted((SRC / "include/constants").glob("*.h")):
        for name, value in re.findall(r"^#define\s+([A-Z][A-Z0-9_]*)\s+(0[xX][0-9a-fA-F]+|\d+)\s*(?://.*|/\*.*)?$", path.read_text(), re.M):
            if name not in exported:
                missing += 1
                continue
            seen += 1
            expect(f"constant {name} ({path.name})", exported[name], int(value, 0))
    print(f"  constants compared: {seen}; plain defines absent from constants.ts: {missing}")


def small_tables() -> None:
    """region_map (213 sections), heal_locations and the multichoice menus, against their sources."""
    sections = load(SRC / "src/data/region_map/region_map_sections.json")["map_sections"]
    exported = load(OUT / "data/region_map.json")
    expect("region map sections", len(exported), len(sections))
    for e, r in zip(exported, sections):
        tag = f"region map {r['id']}"
        expect(tag + " id", e["id"], r["id"])
        expect(tag + " name", decode(e["name"]), spelled(r["name"]))
        # the template (region_map_sections.json.txt) defaults a missing x/y to 0 and width/height to 1
        for key, default in (("x", 0), ("y", 0), ("width", 1), ("height", 1)):
            expect(f"{tag} {key}", e.get(key), r.get(key, default))
    heal = load(SRC / "src/data/heal_locations.json")["heal_locations"]
    got = load(OUT / "data/heal_locations.json")["heal_locations"]
    expect("heal locations", got, heal)
    text = (SRC / "src/data/script_menu.h").read_text()
    lists = {name: re.findall(r"\{(\w+)\}", body) for name, body in re.findall(r"struct MenuAction (MultichoiceList_\w+)\[\] =\s*\{(.*?)\};", text, re.S)}
    table = re.search(r"sMultichoiceLists\[\] =\s*\{(.*?)\n\};", text, re.S).group(1)
    entries = re.findall(r"\[(MULTI_\w+)\]\s*=\s*MULTICHOICE\((\w+)\)", table)
    menus = load(OUT / "data/script_menu.json")["multichoice"]
    expect("multichoice count", len(menus), len(entries))
    for const, symbol in entries:
        expect(f"multichoice {const}", menus.get(str(constants[const])), lists[symbol])
    print(f"  region map {len(sections)}, heal locations {len(heal)}, multichoice menus {len(entries)}")


TS_CONSTANTS_PATH = ROOT / "src/games/emerald/generated/constants.ts"
for step in (species, moves, trainers, maps, map_files, weather_events, wild, incbin_sizes, pokemon_images, items, tilesets, audio, fonts, ts_constants, small_tables):
    step()
print(f"{checked} comparisons, {len(failures)} mismatches")
for line in failures[:40]:
    print("  ", line)
sys.exit(1 if failures else 0)
