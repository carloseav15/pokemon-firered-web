#!/usr/bin/env python3
"""Export authentic Johto NPC dialogues and interior map descriptors from Heart & Soul.

Extracts event scripts and text labels from refs-src/pokemon-hns/data/maps
and generates src/viewer/interaction/johtoDialogues.ts for authentic NPC
conversations in Johto cities, routes, and interiors.
"""

from __future__ import annotations

import glob
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HNS_MAPS = ROOT.parent / "refs-src/pokemon-hns/data/maps"
PUBLIC_HNS = ROOT / "public/hns"
OUT_FILE = ROOT / "src/viewer/interaction/johtoDialogues.ts"

if not HNS_MAPS.exists():
    raise SystemExit(f"HnS maps not found at {HNS_MAPS}")

script_files = glob.glob(f"{HNS_MAPS}/*/scripts.inc")

pattern_text = re.compile(
    r"^([A-Za-z0-9_]+):[ \t]*\r?\n((?:[ \t]*\.(?:string|ascii)[ \t]+\"[^\"]*\"[ \t]*\r?\n)+)",
    re.MULTILINE,
)
pattern_script = re.compile(
    r"^([A-Za-z0-9_]+)::[ \t]*\r?\n(.*?)(?=\r?\n[A-Za-z0-9_]+::|\Z)",
    re.MULTILINE | re.DOTALL,
)

all_texts: dict[str, str] = {}
all_scripts: dict[str, str] = {}

for sf in script_files:
    with open(sf, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    for match in pattern_text.finditer(content):
        label = match.group(1)
        raw_body = match.group(2)
        lines = re.findall(r"\.(?:string|ascii)\s+\"([^\"]*)\"", raw_body)
        full_text = "".join(lines)
        cleaned = (
            full_text.replace("\\p", "\n\n")
            .replace("\\n", "\n")
            .replace("\\l", "\n")
            .replace("$", "")
            .replace("{PLAYER}", "viajero")
            .strip()
        )
        all_texts[label] = cleaned
    for match in pattern_script.finditer(content):
        all_scripts[match.group(1)] = match.group(2)


def resolve_script_text(slabel: str, depth: int = 0) -> str | None:
    if depth > 5 or slabel not in all_scripts:
        return None
    body = all_scripts[slabel]
    m = re.search(r"(?:msgbox|message|pokenavcall)\s+([A-Za-z0-9_]+)", body)
    if m and m.group(1) in all_texts:
        return all_texts[m.group(1)]
    tb = re.search(r"trainerbattle_\w+\s+\w+,\s*([A-Za-z0-9_]+)", body)
    if tb and tb.group(1) in all_texts:
        return all_texts[tb.group(1)]
    sub = re.findall(
        r"(?:goto|call|goto_if_\w+|call_if_\w+)\s+(?:VAR_\w+,\s*\w+,\s*)?([A-Za-z0-9_]+)",
        body,
    )
    for target in sub:
        t = resolve_script_text(target, depth + 1)
        if t:
            return t
    return None


johto_index_path = ROOT / "public/viewer/johto.json"
johto_ext = set(json.loads(johto_index_path.read_text())["maps"].keys())
johto_maps = set(johto_ext)
queue = list(johto_ext)
while queue:
    curr = queue.pop(0)
    map_p = PUBLIC_HNS / "maps" / f"{curr}.json"
    if map_p.exists():
        try:
            h = json.loads(map_p.read_text())
            for w in h.get("warps", []):
                dest = w.get("destMap")
                if dest and dest.startswith("MAP_") and dest not in johto_maps:
                    if not any(
                        k in dest
                        for k in [
                            "LITTLEROOT",
                            "SLATEPORT",
                            "RUSTBORO",
                            "DEWFORD",
                            "MAUVILLE",
                            "FALLARBOR",
                            "LAVARIDGE",
                            "FORTREE",
                            "MOSSDEEP",
                            "SOOTOPOLIS",
                            "PACIFIDLOG",
                            "EVER_GRANDE",
                            "PALLET",
                            "VIRIDIAN",
                            "PEWTER",
                            "CERULEAN",
                            "VERMILION",
                            "CELADON",
                            "FUCHSIA",
                            "SAFFRON",
                            "CINNABAR",
                        ]
                    ):
                        johto_maps.add(dest)
                        queue.append(dest)
        except Exception:
            pass

script_dialogues: dict[str, str] = {}

for m in sorted(johto_maps):
    map_p = PUBLIC_HNS / "maps" / f"{m}.json"
    if map_p.exists():
        try:
            h = json.loads(map_p.read_text())
            for o in h.get("objects", []):
                sn = o.get("scriptName")
                if sn and sn not in (
                    "0",
                    "0x0",
                    "NULL",
                    "EventScript_CutTree",
                    "EventScript_RockSmash",
                ):
                    txt = resolve_script_text(sn)
                    if txt:
                        script_dialogues[sn] = txt
        except Exception:
            pass

# Enhanced authentic dialogue for Route 29 Old Man tutorial
script_dialogues["Route29_EventScript_OldMan"] = (
    "POKéMON hide in the grass. Who knows when they'll pop out…\n\n"
    "If you weaken them first, POKéMON are easier to catch. Then, throw a ball at them from your bag! Any ball will do.\n\n"
    "If you want to learn more, go to the ACADEMY in VIOLET CITY!"
)

# Also ensure Lake of Rage Lance is pristine
if "LakeOfRage_EventScript_Lance" in script_dialogues:
    script_dialogues["LakeOfRage_EventScript_Lance"] = (
        "This lake is full of GYARADOS but nothing else…\n\n"
        "So the MAGIKARP are being forced to evolve…\n\n"
        "Did you come here because of the rumors? I'm LANCE, a trainer like you."
    )

print(f"Total resolved dialogues: {len(script_dialogues)}")

ts_content = [
    "// Diálogos auténticos de personajes (NPCs) de Johto extraídos de Heart & Soul.",
    "",
    "export interface JohtoDialogueInfo {",
    "  title: string;",
    "  text: string;",
    "}",
    "",
    "export const JOHTO_MAP_NAMES: Record<string, string> = {",
    '  MAP_NEW_BARK_TOWN: "Pueblo Primavera",',
    '  MAP_NEW_BARK_TOWN_LAB: "Laboratorio del Prof. Elm",',
    '  MAP_NEW_BARK_TOWN_PLAYERS_HOUSE_1F: "Casa del Jugador (Planta 1)",',
    '  MAP_NEW_BARK_TOWN_PLAYERS_HOUSE_2F: "Habitación del Jugador (Planta 2)",',
    '  MAP_NEW_BARK_TOWN_HOUSE1: "Casa en Pueblo Primavera",',
    '  MAP_NEW_BARK_TOWN_HOUSE2: "Casa en Pueblo Primavera",',
    '  MAP_CHERRYGROVE_CITY: "Ciudad Cerezo",',
    '  MAP_CHERRYGROVE_CITY_MART: "Tienda Pokémon de Ciudad Cerezo",',
    '  MAP_CHERRYGROVE_CITY_POKEMON_CENTER: "Centro Pokémon de Ciudad Cerezo",',
    '  MAP_CHERRYGROVE_CITY_HOUSE1: "Casa en Ciudad Cerezo",',
    '  MAP_CHERRYGROVE_CITY_HOUSE2: "Casa en Ciudad Cerezo",',
    '  MAP_CHERRYGROVE_CITY_HOUSE3: "Casa del Guía",',
    '  MAP_VIOLET_CITY: "Ciudad Malva",',
    '  MAP_VIOLET_CITY_GYM: "Gimnasio Pokémon de Ciudad Malva",',
    '  MAP_VIOLET_CITY_MART: "Tienda Pokémon de Ciudad Malva",',
    '  MAP_VIOLET_CITY_POKEMON_CENTER: "Centro Pokémon de Ciudad Malva",',
    '  MAP_VIOLET_CITY_SPROUT_TOWER_1F: "Torre Bellsprout (P1)",',
    '  MAP_VIOLET_CITY_SPROUT_TOWER_2F: "Torre Bellsprout (P2)",',
    '  MAP_VIOLET_CITY_SPROUT_TOWER_3F: "Torre Bellsprout (P3)",',
    '  MAP_AZALEA_TOWN: "Pueblo Azalea",',
    '  MAP_AZALEA_TOWN_GYM: "Gimnasio Pokémon de Pueblo Azalea",',
    '  MAP_AZALEA_TOWN_MART: "Tienda Pokémon de Pueblo Azalea",',
    '  MAP_AZALEA_TOWN_POKEMON_CENTER: "Centro Pokémon de Pueblo Azalea",',
    '  MAP_AZALEA_TOWN_KURTS_HOUSE: "Casa de César",',
    '  MAP_GOLDENROD_CITY: "Ciudad Trigal",',
    '  MAP_GOLDENROD_CITY_GYM: "Gimnasio Pokémon de Ciudad Trigal",',
    '  MAP_GOLDENROD_CITY_POKEMON_CENTER: "Centro Pokémon de Ciudad Trigal",',
    '  MAP_GOLDENROD_CITY_MART_1F: "Centro Comercial Trigal (P1)",',
    '  MAP_GOLDENROD_CITY_MART_2F: "Centro Comercial Trigal (P2)",',
    '  MAP_GOLDENROD_CITY_MART_3F: "Centro Comercial Trigal (P3)",',
    '  MAP_GOLDENROD_CITY_MART_4F: "Centro Comercial Trigal (P4)",',
    '  MAP_GOLDENROD_CITY_MART_5F: "Centro Comercial Trigal (P5)",',
    '  MAP_GOLDENROD_CITY_MART_6F: "Terraza Centro Comercial Trigal",',
    '  MAP_ECRUTEAK_CITY: "Ciudad Iris",',
    '  MAP_ECRUTEAK_CITY_GYM: "Gimnasio Pokémon de Ciudad Iris",',
    '  MAP_ECRUTEAK_CITY_POKEMON_CENTER: "Centro Pokémon de Ciudad Iris",',
    '  MAP_ECRUTEAK_CITY_MART: "Tienda Pokémon de Ciudad Iris",',
    '  MAP_OLIVINE_CITY: "Ciudad Olivo",',
    '  MAP_OLIVINE_CITY_GYM: "Gimnasio Pokémon de Ciudad Olivo",',
    '  MAP_OLIVINE_CITY_POKEMON_CENTER: "Centro Pokémon de Ciudad Olivo",',
    '  MAP_OLIVINE_CITY_MART: "Tienda Pokémon de Ciudad Olivo",',
    '  MAP_CIANWOOD_CITY: "Ciudad Orquídea",',
    '  MAP_CIANWOOD_CITY_GYM: "Gimnasio Pokémon de Ciudad Orquídea",',
    '  MAP_CIANWOOD_CITY_POKEMON_CENTER: "Centro Pokémon de Ciudad Orquídea",',
    '  MAP_MAHOGANYTOWN: "Pueblo Caoba",',
    '  MAP_MAHOGANY_TOWN_GYM: "Gimnasio Pokémon de Pueblo Caoba",',
    '  MAP_MAHOGANY_TOWN_POKEMON_CENTER: "Centro Pokémon de Pueblo Caoba",',
    '  MAP_BLACKTHORN_CITY: "Ciudad Endrino",',
    '  MAP_BLACKTHORN_CITY_GYM: "Gimnasio Pokémon de Ciudad Endrino",',
    '  MAP_BLACKTHORN_CITY_POKEMON_CENTER: "Centro Pokémon de Ciudad Endrino",',
    '  MAP_BLACKTHORN_CITY_MART: "Tienda Pokémon de Ciudad Endrino",',
    '  MAP_LAKE_OF_RAGE: "Lago de la Furia",',
    '  MAP_ILEX_FOREST: "Bosque Ilex",',
    '  MAP_ROUTE29: "Ruta 29",',
    '  MAP_ROUTE30: "Ruta 30",',
    '  MAP_ROUTE31: "Ruta 31",',
    '  MAP_ROUTE32: "Ruta 32",',
    '  MAP_ROUTE33: "Ruta 33",',
    '  MAP_ROUTE34: "Ruta 34",',
    '  MAP_ROUTE35: "Ruta 35",',
    '  MAP_ROUTE36: "Ruta 36",',
    '  MAP_ROUTE37: "Ruta 37",',
    '  MAP_ROUTE38: "Ruta 38",',
    '  MAP_ROUTE39: "Ruta 39",',
    '  MAP_ROUTE40: "Ruta 40",',
    '  MAP_ROUTE41: "Ruta 41",',
    '  MAP_ROUTE42: "Ruta 42",',
    '  MAP_ROUTE43: "Ruta 43",',
    '  MAP_ROUTE44: "Ruta 44",',
    '  MAP_ROUTE45: "Ruta 45",',
    '  MAP_ROUTE46: "Ruta 46",',
    '  MAP_ROUTE47: "Ruta 47",',
    '  MAP_ROUTE48: "Ruta 48",',
    "};",
    "",
    "export function formatJohtoInteriorName(mapId: string): string | undefined {",
    "  if (JOHTO_MAP_NAMES[mapId]) return JOHTO_MAP_NAMES[mapId];",
    "  const clean = mapId.replace(/^MAP_/, '');",
    "  if (clean.includes('_MART')) return 'Tienda Pokémon';",
    "  if (clean.includes('_POKEMON_CENTER') || clean.includes('_POKE_CENTER')) return 'Centro Pokémon';",
    "  if (clean.includes('_GYM')) return 'Gimnasio Pokémon';",
    "  if (clean.includes('_LAB')) return 'Laboratorio Pokémon';",
    "  if (clean.includes('_HOUSE')) return 'Casa';",
    "  return undefined;",
    "}",
    "",
    "export function formatNpcTitle(mapId: string, scriptName?: string, graphicsName?: string): string {",
    "  if (scriptName) {",
    '    if (scriptName.includes("Lance")) return "Campeón Lance";',
    '    if (scriptName.includes("Elm")) return "Prof. Elm";',
    '    if (scriptName.includes("Mom")) return "Madre";',
    '    if (scriptName.includes("Silver") || scriptName.includes("Rival")) return "Silver";',
    '    if (scriptName.includes("Pryce")) return "Líder Fredo";',
    '    if (scriptName.includes("Falkner")) return "Líder Pegaso";',
    '    if (scriptName.includes("Bugsy")) return "Líder Antón";',
    '    if (scriptName.includes("Whitney")) return "Líder Blanca";',
    '    if (scriptName.includes("Morty")) return "Líder Morti";',
    '    if (scriptName.includes("Chuck")) return "Líder Aníbal";',
    '    if (scriptName.includes("Jasmine")) return "Líder Yasmina";',
    '    if (scriptName.includes("Clair")) return "Líder Débora";',
    '    if (scriptName.includes("OldMan") || scriptName.includes("Gramps")) return "Anciano";',
    '    if (scriptName.includes("OldWoman") || scriptName.includes("Granny")) return "Anciana";',
    '    if (scriptName.includes("Lass")) return "Chica";',
    '    if (scriptName.includes("Youngster")) return "Joven";',
    '    if (scriptName.includes("FatMan")) return "Vecino";',
    '    if (scriptName.includes("Fisher") || scriptName.includes("Andre") || scriptName.includes("Raymond")) return "Pescador";',
    '    if (scriptName.includes("Cooltrainer") || scriptName.includes("Aaron") || scriptName.includes("Lois")) return "Entrenador Guay";',
    '    if (scriptName.includes("Aide")) return "Ayudante de Elm";',
    '    if (scriptName.includes("Nurse")) return "Enfermera Joy";',
    '    if (scriptName.includes("Clerk") || scriptName.includes("Mart")) return "Dependiente";',
    '    if (scriptName.includes("Kurt")) return "César";',
    '    if (scriptName.includes("Tuscany")) return "Tuscany (Martes)";',
    '    if (scriptName.includes("Wesley")) return "Wesley (Miércoles)";',
    '    if (scriptName.includes("Arthur")) return "Arthur (Jueves)";',
    '    if (scriptName.includes("Frieda")) return "Frieda (Viernes)";',
    '    if (scriptName.includes("Santos")) return "Santos (Sábado)";',
    '    if (scriptName.includes("Sunny")) return "Sunny (Domingo)";',
    '    if (scriptName.includes("Monica")) return "Monica (Lunes)";',
    "  }",
    "  if (graphicsName) {",
    '    if (graphicsName.includes("LANCE")) return "Campeón Lance";',
    '    if (graphicsName.includes("ELM")) return "Prof. Elm";',
    '    if (graphicsName.includes("MOM")) return "Madre";',
    '    if (graphicsName.includes("SILVER")) return "Silver";',
    '    if (graphicsName.includes("PRYCE")) return "Líder Fredo";',
    '    if (graphicsName.includes("OLD_MAN")) return "Anciano";',
    '    if (graphicsName.includes("SCIENTIST")) return "Científico";',
    '    if (graphicsName.includes("FAT_MAN")) return "Vecino";',
    '    if (graphicsName.includes("LASS")) return "Chica";',
    '    if (graphicsName.includes("YOUNGSTER")) return "Joven";',
    '    if (graphicsName.includes("FISHER")) return "Pescador";',
    '    if (graphicsName.includes("POLICEMAN")) return "Agente de Policía";',
    '    if (graphicsName.includes("WOOPER")) return "Wooper";',
    '    if (graphicsName.includes("GYARADOS")) return "Gyarados Rojo";',
    '    if (graphicsName.includes("DRAGONITE")) return "Dragonite";',
    "  }",
    '  if (JOHTO_MAP_NAMES[mapId]) return JOHTO_MAP_NAMES[mapId];',
    '  return mapId.replace(/^MAP_/, "").replace(/_/g, " ");',
    "}",
    "",
    "export const JOHTO_SCRIPT_DIALOGUES: Record<string, string> = {",
]

for sn, txt in sorted(script_dialogues.items()):
    clean_txt = json.dumps(txt, ensure_ascii=False)
    ts_content.append(f"  {json.dumps(sn)}: {clean_txt},")

ts_content.extend([
    "};",
    "",
    "export function getJohtoDialogue(",
    "  mapId: string,",
    "  localId: number,",
    "  scriptName?: string,",
    "  graphicsName?: string,",
    "): JohtoDialogueInfo | undefined {",
    "  if (scriptName && JOHTO_SCRIPT_DIALOGUES[scriptName]) {",
    "    return {",
    "      title: formatNpcTitle(mapId, scriptName, graphicsName),",
    "      text: JOHTO_SCRIPT_DIALOGUES[scriptName]!,",
    "    };",
    "  }",
    '  if (scriptName === "Common_EventScript_PkmnCenterNurse" || (graphicsName && graphicsName.includes("NURSE"))) {',
    "    return {",
    '      title: "Enfermera Joy",',
    '      text: "¡Hola! Te damos la bienvenida al Centro Pokémon.\\n\\nNos encargamos de curar a tus Pokémon para que recuperen toda su energía. ¡Vuelve cuando quieras!",',
    "    };",
    "  }",
    '  if (scriptName === "Common_OpenMart" || (graphicsName && graphicsName.includes("CLERK"))) {',
    "    return {",
    '      title: "Dependiente",',
    '      text: "¡Hola! Bienvenido a la Tienda Pokémon.\\n\\nTenemos Poké Balls, Pociones y todo tipo de artículos útiles para tu viaje de entrenador.",',
    "    };",
    "  }",
    "  return undefined;",
    "}",
    "",
])

OUT_FILE.write_text("\n".join(ts_content) + "\n", encoding="utf-8")
print(f"Wrote {OUT_FILE}")
