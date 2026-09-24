"""Export every map header, layout, connection, and event list."""

from __future__ import annotations

import base64
import json
from pathlib import Path

from common import DECOMP, OUT, read_json, write_json

ROM_BASE = 0x08000000


def const(constants: dict[str, int], value, default=0):
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if text in constants:
        return constants[text]
    try:
        return int(text, 0)
    except ValueError:
        pass
    if text.startswith("(") or "+" in text or "|" in text or "<<" in text:
        expression = text
        for name in sorted(constants, key=len, reverse=True):
            if name in expression:
                expression = expression.replace(name, str(constants[name]))
        try:
            return int(eval(expression, {}, {}))
        except Exception:
            pass
    raise KeyError(f"unknown constant {text}")


def export_maps(constants: dict[str, int]) -> None:
    scripts = read_json(OUT / "scripts.json")
    labels = scripts["labels"]

    def script_address(name):
        if not name or name in ("0x0", "0", "NULL"):
            return 0
        if name not in labels:
            print(f"  warning: missing script label {name}")
            return 0
        return ROM_BASE + labels[name]

    layouts = {}
    for layout in read_json(DECOMP / "data/layouts/layouts.json")["layouts"]:
        if not layout:
            continue
        layouts[layout["id"]] = layout

    groups = read_json(DECOMP / "data/maps/map_groups.json")
    folder_by_name = {}
    maps_json = {}
    for folder in sorted((DECOMP / "data/maps").iterdir()):
        path = folder / "map.json"
        if not path.exists():
            continue
        data = read_json(path)
        maps_json[data["id"]] = data
        folder_by_name[data["name"]] = folder.name

    index = {"groups": [], "maps": {}, "layouts": {}}
    out_dir = OUT / "maps"
    out_dir.mkdir(parents=True, exist_ok=True)
    layout_dir = OUT / "layouts"
    layout_dir.mkdir(parents=True, exist_ok=True)

    for group_name in groups["group_order"]:
        index["groups"].append([maps_json_name for maps_json_name in groups[group_name]])

    exported_layouts = set()
    for map_id, data in maps_json.items():
        events_source = data
        if "shared_events_map" in data:
            events_source = next(m for m in maps_json.values() if m["name"] == data["shared_events_map"])
        scripts_name = data.get("shared_scripts_map", data["name"])
        layout = layouts.get(data["layout"])
        objects = []
        for local_index, obj in enumerate(events_source.get("object_events", [])):
            if obj.get("type") == "clone":
                objects.append({
                    "clone": True,
                    "graphicsId": const(constants, obj["graphics_id"]),
                    "x": obj["x"], "y": obj["y"],
                    "targetLocalId": const(constants, obj["target_local_id"]),
                    "targetMap": obj["target_map"],
                })
                continue
            objects.append({
                "localId": local_index + 1,
                "graphicsId": const(constants, obj["graphics_id"]),
                "graphicsName": obj["graphics_id"],
                "x": obj["x"], "y": obj["y"],
                "elevation": const(constants, obj.get("elevation", 0)),
                "movementType": const(constants, obj.get("movement_type", "MOVEMENT_TYPE_NONE")),
                "rangeX": const(constants, obj.get("movement_range_x", 0)),
                "rangeY": const(constants, obj.get("movement_range_y", 0)),
                "trainerType": const(constants, obj.get("trainer_type", "TRAINER_TYPE_NONE")),
                "trainerRange": const(constants, obj.get("trainer_sight_or_berry_tree_id", 0)),
                "script": script_address(obj.get("script")),
                "scriptName": obj.get("script") if obj.get("script") not in ("0x0", "0") else None,
                "flag": const(constants, obj.get("flag", 0)),
            })
        warps = [{
            "x": w["x"], "y": w["y"], "elevation": const(constants, w.get("elevation", 0)),
            "destMap": w["dest_map"], "destWarpId": const(constants, w.get("dest_warp_id", 0)),
        } for w in events_source.get("warp_events", [])]
        coords = []
        for c in events_source.get("coord_events", []):
            coords.append({
                "x": c["x"], "y": c["y"], "elevation": const(constants, c.get("elevation", 0)),
                "var": const(constants, c.get("var", 0)), "value": const(constants, c.get("var_value", 0)),
                "script": script_address(c.get("script")), "scriptName": c.get("script"),
            })
        bgs = []
        for b in events_source.get("bg_events", []):
            if b["type"] == "hidden_item":
                bgs.append({
                    "type": "hidden_item", "x": b["x"], "y": b["y"], "elevation": const(constants, b.get("elevation", 0)),
                    "item": const(constants, b["item"]), "flag": const(constants, b["flag"]),
                    "quantity": const(constants, b.get("quantity", 1)), "underfoot": bool(b.get("underfoot", False)),
                })
            else:
                bgs.append({
                    "type": "sign", "x": b["x"], "y": b["y"], "elevation": const(constants, b.get("elevation", 0)),
                    "facing": const(constants, b.get("player_facing_dir", "BG_EVENT_PLAYER_FACING_ANY")),
                    "script": script_address(b.get("script")), "scriptName": b.get("script"),
                })
        connections = []
        for connection in data.get("connections") or []:
            connections.append({
                "direction": connection["direction"],
                "offset": const(constants, connection["offset"]),
                "map": connection["map"],
            })
        entry = {
            "id": map_id,
            "num": constants[map_id],
            "name": data["name"],
            "layout": data["layout"],
            "music": const(constants, data.get("music", 0)),
            "musicName": data.get("music"),
            "regionMapSection": const(constants, data.get("region_map_section", 0)),
            "regionMapSectionName": data.get("region_map_section"),
            "requiresFlash": bool(data.get("requires_flash")),
            "weather": const(constants, data.get("weather", "WEATHER_NONE")),
            "mapType": const(constants, data.get("map_type", "MAP_TYPE_NONE")),
            "allowCycling": bool(data.get("allow_cycling")),
            "allowEscaping": bool(data.get("allow_escaping")),
            "allowRunning": bool(data.get("allow_running")),
            "showMapName": bool(data.get("show_map_name")),
            "floorNumber": data.get("floor_number", 0),
            "battleScene": const(constants, data.get("battle_scene", 0)),
            "mapScripts": script_address(f"{scripts_name}_MapScripts") if f"{scripts_name}_MapScripts" in labels else 0,
            "connections": connections,
            "objects": objects,
            "warps": warps,
            "coords": coords,
            "bgs": bgs,
        }
        write_json(out_dir / f"{map_id}.json", entry)
        index["maps"][map_id] = {"num": constants[map_id], "name": data["name"], "layout": data["layout"], "section": data.get("region_map_section")}

        if layout and layout["id"] not in exported_layouts:
            exported_layouts.add(layout["id"])
            blocks = (DECOMP / layout["blockdata_filepath"]).read_bytes()
            border = (DECOMP / layout["border_filepath"]).read_bytes()
            write_json(layout_dir / f"{layout['id']}.json", {
                "id": layout["id"],
                "width": layout["width"], "height": layout["height"],
                "borderWidth": layout.get("border_width", 2), "borderHeight": layout.get("border_height", 2),
                "primary": layout["primary_tileset"], "secondary": layout["secondary_tileset"],
                "blocks": base64.b64encode(blocks).decode(),
                "border": base64.b64encode(border).decode(),
            })
    # Layouts referenced by scripts (setmaplayoutindex) but not by maps.
    for layout_id, layout in layouts.items():
        if layout_id in exported_layouts:
            continue
        exported_layouts.add(layout_id)
        write_json(layout_dir / f"{layout_id}.json", {
            "id": layout_id, "width": layout["width"], "height": layout["height"],
            "borderWidth": layout.get("border_width", 2), "borderHeight": layout.get("border_height", 2),
            "primary": layout["primary_tileset"], "secondary": layout["secondary_tileset"],
            "blocks": base64.b64encode((DECOMP / layout["blockdata_filepath"]).read_bytes()).decode(),
            "border": base64.b64encode((DECOMP / layout["border_filepath"]).read_bytes()).decode(),
        })
    index["layouts"] = {layout_id: constants.get(layout_id, 0) for layout_id in layouts}
    write_json(OUT / "maps.json", index)
    print(f"  {len(maps_json)} maps, {len(exported_layouts)} layouts")
