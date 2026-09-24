#!/usr/bin/env python3
"""Export the pokefirered decompilation into browser data for the web port.

Usage:
    python3 tools/decomp/export.py            # every step
    python3 tools/decomp/export.py maps tilesets

Set POKEFIRERED=/path/to/pokefirered if the decompilation is not a sibling
folder of this project.
"""

from __future__ import annotations

import sys
import time

sys.path.insert(0, __import__("os").path.dirname(__file__))

from common import DECOMP, OUT, read_json  # noqa: E402
import step_setup  # noqa: E402
import step_scripts  # noqa: E402

STEPS = ["setup", "constants", "scripts", "battlescripts", "maps", "tilesets", "objects", "data", "graphics", "codegen", "incbin", "cdata", "tsconst", "structs", "audio"]


def main(argv: list[str]) -> None:
    wanted = argv or STEPS
    if not (DECOMP / "charmap.txt").exists():
        raise SystemExit(f"pokefirered not found at {DECOMP}")
    OUT.mkdir(parents=True, exist_ok=True)
    constants = None

    def get_constants():
        nonlocal constants
        if constants is None:
            path = OUT / "constants.json"
            constants = read_json(path) if path.exists() else step_setup.dump_constants()
        return constants

    for step in STEPS:
        if step not in wanted:
            continue
        started = time.time()
        print(f"[{step}]")
        if step == "setup":
            step_setup.build_tools()
            step_setup.generate_headers()
            step_setup.export_charmap()
        elif step == "constants":
            constants = step_setup.dump_constants()
        elif step == "scripts":
            step_scripts.export_scripts(get_constants())
        elif step == "battlescripts":
            import step_battle_scripts
            step_battle_scripts.export_battle_scripts(get_constants())
        elif step == "incbin":
            import step_incbin
            step_incbin.export_incbin()
        elif step == "cdata":
            import step_cdata
            step_cdata.export_cdata()
        elif step == "tsconst":
            import step_tsconst
            step_tsconst.export_ts_constants()
        elif step == "structs":
            import step_structs
            step_structs.export_structs()
        elif step == "maps":
            import step_maps
            step_maps.export_maps(get_constants())
        elif step == "tilesets":
            import step_tilesets
            step_tilesets.export_tilesets()
        elif step == "objects":
            import step_objects
            step_objects.export_objects(get_constants())
            step_objects.export_field_effect_objects(get_constants())
        elif step == "data":
            import step_data
            step_data.export_data(get_constants())
        elif step == "graphics":
            import step_graphics
            step_graphics.export_graphics(get_constants())
        elif step == "codegen":
            import step_codegen
            step_codegen.export_codegen(get_constants())
        elif step == "audio":
            import step_audio
            step_audio.export_audio(get_constants())
        print(f"  done in {time.time() - started:.1f}s")


if __name__ == "__main__":
    main(sys.argv[1:])
