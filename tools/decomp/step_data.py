"""Export game data tables (species, moves, items, trainers, encounters, text)."""

from __future__ import annotations

import base64
import re
import subprocess
from pathlib import Path

from cdump import dump_json, extract_definition
from common import BIN, BUILD, DECOMP, GAME, OUT, decode_gba_string, read_json, run, write_json

SRC = DECOMP / "src"


def b64hex(value: str) -> str:
    return base64.b64encode(bytes.fromhex(value)).decode()


def encode_strings(strings: list[str]) -> list[str]:
    """Encode text with the decompilation's charmap via preproc; returns base64 with terminator."""
    lines = []
    for s in strings:
        escaped = s.replace('"', '\\"')
        lines.append(f'.string "{escaped}$"')
    path = BUILD / "encode_strings.s"
    path.write_text("\n".join(lines) + "\n")
    out = run([str(BIN / "preproc"), str(path), "charmap.txt"]).decode()
    result = []
    for line in out.splitlines():
        line = line.strip()
        if not line.startswith(".byte"):
            continue
        values = bytes(int(v, 16) for v in line[5:].split(","))
        result.append(base64.b64encode(values).decode())
    if len(result) != len(strings):
        raise RuntimeError("string encoding mismatch")
    return result


def dump_species(constants):
    source = r'''
#include "global.h"
#include "constants/species.h"
#include "constants/moves.h"
#include "constants/abilities.h"
#include "constants/items.h"
#include "constants/pokemon.h"
#include "constants/pokedex.h"
#include "constants/party_menu.h"
#include "pokemon.h"
#include "pokedex.h"
#include "data.h"
''' + open(Path(__file__).parent / "cdump.py").read().split('PRELUDE = r"""')[1].split('"""')[0] + r'''
#include "data/pokemon/species_info.h"
#include "data/text/species_names.h"
#include "data/pokemon/level_up_learnsets.h"
#include "data/pokemon/level_up_learnset_pointers.h"
#include "data/pokemon/evolution.h"
#include "data/pokemon/tmhm_learnsets.h"
#include "data/pokemon/tutor_learnsets.h"
#include "data/pokemon/experience_tables.h"
#include "data/pokemon/egg_moves.h"
#include "data/pokemon/pokedex_text@POKEDEX_TEXT@.h"
#include "data/pokemon/pokedex_entries.h"
#include "data/pokemon_graphics/front_pic_coordinates.h"
#include "data/pokemon_graphics/back_pic_coordinates.h"
#include "data/pokemon_graphics/enemy_mon_elevation.h"
#define SPECIES_TO_NATIONAL(name)   [SPECIES_##name - 1] = NATIONAL_DEX_##name
#define HM_MOVES_END 0xFFFF
''' + extract_definition(SRC / "pokemon.c", "sSpeciesToNationalPokedexNum") + "\n" + \
        extract_definition(SRC / "pokemon.c", "sHMMoves") + "\n" + \
        ('#define TMHM_MOVE(id) CAT(MOVE_, id),\n' if GAME != "firered" else "") + extract_definition(SRC / "data" / "party_menu.h", "sTMHMMoves") + "\n" + \
        extract_definition(SRC / "pokemon.c", "gStatStageRatios") + "\n" + r'''
int main(void) {
    int s, i;
    printf("{\"species\":[");
    for (s = 0; s < NUM_SPECIES; s++) {
        const struct SpeciesInfo *p = &gSpeciesInfo[s];
        if (s) printf(",");
        printf("{\"name\":"); JSTRN(gSpeciesNames[s], POKEMON_NAME_LENGTH + 1);
        printf(",\"base\":[%d,%d,%d,%d,%d,%d]", p->baseHP, p->baseAttack, p->baseDefense, p->baseSpeed, p->baseSpAttack, p->baseSpDefense);
        printf(",\"types\":[%d,%d],\"catchRate\":%d,\"expYield\":%d", p->types[0], p->types[1], p->catchRate, p->expYield);
        printf(",\"evYield\":[%d,%d,%d,%d,%d,%d]", p->evYield_HP, p->evYield_Attack, p->evYield_Defense, p->evYield_Speed, p->evYield_SpAttack, p->evYield_SpDefense);
        printf(",\"items\":[%d,%d],\"genderRatio\":%d,\"eggCycles\":%d,\"friendship\":%d,\"growthRate\":%d", p->itemCommon, p->itemRare, p->genderRatio, p->eggCycles, p->friendship, p->growthRate);
        printf(",\"eggGroups\":[%d,%d],\"abilities\":[%d,%d],\"safariFlee\":%d,\"color\":%d,\"noFlip\":%d", p->eggGroups[0], p->eggGroups[1], p->abilities[0], p->abilities[1], p->safariZoneFleeRate, p->bodyColor, p->noFlip);
        printf(",\"learnset\":[");
        for (i = 0; gLevelUpLearnsets[s][i] != 0xFFFF; i++) {
            if (i) printf(",");
            printf("[%d,%d]", gLevelUpLearnsets[s][i] >> 9, gLevelUpLearnsets[s][i] & 0x1FF);
        }
        printf("],\"evolutions\":[");
        {
            int first = 1;
            for (i = 0; i < EVOS_PER_MON; i++) {
                if (!gEvolutionTable[s][i].method) continue;
                if (!first) printf(",");
                first = 0;
                printf("[%d,%d,%d]", gEvolutionTable[s][i].method, gEvolutionTable[s][i].param, gEvolutionTable[s][i].targetSpecies);
            }
        }
        printf("],\"tmhm\":[%u,%u],\"tutor\":%d", sTMHMLearnsets[s][0], sTMHMLearnsets[s][1], sTutorLearnsets[s]);
        printf(",\"national\":%d", s == 0 ? 0 : sSpeciesToNationalPokedexNum[s - 1]);
        printf(",\"frontCoords\":[%d,%d],\"backCoords\":[%d,%d],\"elevation\":%d", gMonFrontPicCoords[s].size, gMonFrontPicCoords[s].y_offset, gMonBackPicCoords[s].size, gMonBackPicCoords[s].y_offset, gEnemyMonElevation[s]);
        printf("}");
    }
    printf("],\"pokedex\":[");
    for (i = 0; i < NATIONAL_DEX_COUNT + 1; i++) {
        const struct PokedexEntry *e = &gPokedexEntries[i];
        if (i) printf(",");
        printf("{\"category\":"); JSTRN(e->categoryName, 12);
        printf(",\"height\":%d,\"weight\":%d,\"description\":", e->height, e->weight); JSTR(e->description);
        printf(",\"pokemonScale\":%d,\"pokemonOffset\":%d,\"trainerScale\":%d,\"trainerOffset\":%d}", e->pokemonScale, e->pokemonOffset, e->trainerScale, e->trainerOffset);
    }
    printf("],\"exp\":[");
    for (i = 0; i < 6; i++) {
        int l;
        if (i) printf(",");
        printf("[");
        for (l = 0; l <= MAX_LEVEL; l++) printf(l ? ",%u" : "%u", gExperienceTables[i][l]);
        printf("]");
    }
    printf("],\"tutorMoves\":[");
    for (i = 0; i < TUTOR_MOVE_COUNT; i++) printf(i ? ",%d" : "%d", sTutorMoves[i]);
    printf("],\"eggMoves\":[");
    for (i = 0; gEggMoves[i] != 0xFFFF; i++) printf(i ? ",%d" : "%d", gEggMoves[i]);
    printf("],\"hmMoves\":[");
    for (i = 0; sHMMoves[i] != 0xFFFF; i++) printf(i ? ",%d" : "%d", sHMMoves[i]);
    printf("],\"tmhmMoves\":[");
    for (i = 0; i < (int)(sizeof(sTMHMMoves) / sizeof(sTMHMMoves[0])); i++) printf(i ? ",%d" : "%d", sTMHMMoves[i]);
    printf("],\"statStageRatios\":[");
    for (i = 0; i < 13; i++) printf(i ? ",[%d,%d]" : "[%d,%d]", gStatStageRatios[i][0], gStatStageRatios[i][1]);
    printf("]}");
    return 0;
}
'''
    source = source.replace("@POKEDEX_TEXT@", "_fr" if GAME == "firered" else "")  # pokeemerald: pokedex_text.h
    if GAME != "firered":
        # pokeemerald: the TM/HM learnsets are a bitfield struct built from FOREACH_TMHM (gTMHMLearnsets[s].as_u32s[]).
        source = source.replace('#include "pokedex.h"', '#include "pokedex.h"\n#include "constants/tms_hms.h"', 1)
        source = source.replace("sTMHMLearnsets[s][0], sTMHMLearnsets[s][1]", "gTMHMLearnsets[s].as_u32s[0], gTMHMLearnsets[s].as_u32s[1]")
        source = source.replace("sTutorMoves[i]", "gTutorMoves[i]")  # pokeemerald's tutor move list is a global
    data = dump_json("species", source)
    for s in data["species"]:
        s["name"] = b64hex(s["name"])
    for e in data["pokedex"]:
        e["category"] = b64hex(e["category"])
        e["description"] = b64hex(e["description"])
    return data


def cdump_prelude() -> str:
    return open(Path(__file__).parent / "cdump.py").read().split('PRELUDE = r"""')[1].split('"""')[0]


def dump_moves_and_misc():
    if GAME == "firered":
        move_desc = extract_definition(SRC / "move_descriptions.c", "gMoveDescriptionPointers")
        desc_strings = "\n".join(re.findall(r"^(?:static )?const u8 \w+\[\] = _\((?:[^;])*?\);", (SRC / "move_descriptions.c").read_text(), flags=re.M)).replace("static ", "")
    else:
        # pokeemerald keeps the strings and gMoveDescriptionPointers together in a data header.
        move_desc = '#include "data/text/move_descriptions.h"'
        desc_strings = ""
    source = r'''
#include "global.h"
#include "constants/species.h"
#include "constants/moves.h"
#include "constants/abilities.h"
#include "constants/items.h"
#include "constants/pokemon.h"
#include "constants/battle_move_effects.h"
#include "constants/trainers.h"
#include "pokemon.h"
#include "battle.h"
#include "battle_main.h"
''' + cdump_prelude() + r'''
#include "data/battle_moves.h"
#include "data/text/move_names.h"
#include "data/text/abilities.h"
#include "data/text/nature_names.h"
#include "data/text/trainer_class_names.h"
''' + desc_strings + "\n" + move_desc + "\n" + \
        extract_definition(SRC / "battle_main.c", "gTypeEffectiveness") + "\n" + \
        extract_definition(SRC / "battle_main.c", "gTypeNames") + "\n" + \
        extract_definition(SRC / "battle_main.c", "gTrainerMoneyTable") + "\n" + r'''
int main(void) {
    int i;
    printf("{\"moves\":[");
    for (i = 0; i < MOVES_COUNT; i++) {
        const struct BattleMove *m = &gBattleMoves[i];
        if (i) printf(",");
        printf("{\"name\":"); JSTRN(gMoveNames[i], MOVE_NAME_LENGTH + 1);
        printf(",\"effect\":%d,\"power\":%d,\"type\":%d,\"accuracy\":%d,\"pp\":%d,\"chance\":%d,\"target\":%d,\"priority\":%d,\"flags\":%d",
            m->effect, m->power, m->type, m->accuracy, m->pp, m->secondaryEffectChance, m->target, m->priority, m->flags);
        printf(",\"description\":");
        if (i == 0) printf("\"ff\""); else JSTR(gMoveDescriptionPointers[i - 1]);
        printf("}");
    }
    printf("],\"abilities\":[");
    for (i = 0; i < ABILITIES_COUNT; i++) {
        if (i) printf(",");
        printf("{\"name\":"); JSTRN(gAbilityNames[i], ABILITY_NAME_LENGTH + 1);
        printf(",\"description\":"); JSTR(gAbilityDescriptionPointers[i]); printf("}");
    }
    printf("],\"natures\":[");
    for (i = 0; i < NUM_NATURES; i++) { if (i) printf(","); JSTR(gNatureNamePointers[i]); }
    printf("],\"trainerClasses\":[");
    for (i = 0; i < (int)(sizeof(gTrainerClassNames) / 13); i++) { if (i) printf(","); JSTRN(gTrainerClassNames[i], 13); }
    printf("],\"types\":[");
    for (i = 0; i < NUMBER_OF_MON_TYPES; i++) { if (i) printf(","); JSTRN(gTypeNames[i], TYPE_NAME_LENGTH + 1); }
    printf("],\"typeEffectiveness\":[");
    for (i = 0; i < (int)sizeof(gTypeEffectiveness); i++) printf(i ? ",%d" : "%d", gTypeEffectiveness[i]);
    printf("],\"trainerMoney\":[");
    for (i = 0; gTrainerMoneyTable[i].classId != 0xFF; i++) printf(i ? ",[%d,%d]" : "[%d,%d]", gTrainerMoneyTable[i].classId, gTrainerMoneyTable[i].value);
    printf("]}");
    return 0;
}
'''
    data = dump_json("moves", source)
    for m in data["moves"]:
        m["name"] = b64hex(m["name"])
        m["description"] = b64hex(m["description"])
    for a in data["abilities"]:
        a["name"] = b64hex(a["name"])
        a["description"] = b64hex(a["description"])
    data["natures"] = [b64hex(n) for n in data["natures"]]
    data["trainerClasses"] = [b64hex(n) for n in data["trainerClasses"]]
    data["types"] = [b64hex(n) for n in data["types"]]
    return data


def dump_trainers():
    source = r'''
#include "global.h"
#include "constants/species.h"
#include "constants/moves.h"
#include "constants/items.h"
#include "constants/trainers.h"
#include "constants/battle_ai.h"
#include "battle.h"
''' + ('#include "data.h"\n' if GAME != "firered" else "") + cdump_prelude() + r'''
#include "data/trainer_parties.h"
#include "data/trainers.h"
static void mons(const struct Trainer *t) {
    int i, j;
    for (i = 0; i < t->partySize; i++) {
        if (i) printf(",");
        switch (t->partyFlags) {
        case 0: { const struct TrainerMonNoItemDefaultMoves *m = &t->party.NoItemDefaultMoves[i];
            printf("{\"iv\":%d,\"level\":%d,\"species\":%d}", m->iv, m->lvl, m->species); break; }
        case F_TRAINER_PARTY_HELD_ITEM: { const struct TrainerMonItemDefaultMoves *m = &t->party.ItemDefaultMoves[i];
            printf("{\"iv\":%d,\"level\":%d,\"species\":%d,\"item\":%d}", m->iv, m->lvl, m->species, m->heldItem); break; }
        case F_TRAINER_PARTY_CUSTOM_MOVESET: { const struct TrainerMonNoItemCustomMoves *m = &t->party.NoItemCustomMoves[i];
            printf("{\"iv\":%d,\"level\":%d,\"species\":%d,\"moves\":[%d,%d,%d,%d]}", m->iv, m->lvl, m->species, m->moves[0], m->moves[1], m->moves[2], m->moves[3]); break; }
        default: { const struct TrainerMonItemCustomMoves *m = &t->party.ItemCustomMoves[i];
            printf("{\"iv\":%d,\"level\":%d,\"species\":%d,\"item\":%d,\"moves\":[%d,%d,%d,%d]}", m->iv, m->lvl, m->species, m->heldItem, m->moves[0], m->moves[1], m->moves[2], m->moves[3]); break; }
        }
    }
}
int main(void) {
    int i;
    printf("[");
    for (i = 0; i < (int)(sizeof(gTrainers) / sizeof(gTrainers[0])); i++) {
        const struct Trainer *t = &gTrainers[i];
        if (i) printf(",");
        printf("{\"class\":%d,\"music\":%d,\"female\":%d,\"pic\":%d,\"name\":", t->trainerClass, t->encounterMusic_gender & 0x7F, t->encounterMusic_gender >> 7, t->trainerPic);
        JSTRN(t->trainerName, 12);
        printf(",\"items\":[%d,%d,%d,%d],\"double\":%d,\"ai\":%u,\"party\":[", t->items[0], t->items[1], t->items[2], t->items[3], t->doubleBattle, t->aiFlags);
        mons(t);
        printf("]}");
    }
    printf("]");
    return 0;
}
'''
    data = dump_json("trainers", source)
    for t in data:
        t["name"] = b64hex(t["name"])
    return data


def dump_all_strings():
    """Every `const u8 name[] = _("...")` in src/*.c, keyed by symbol (file-qualified when static)."""
    definitions = []
    seen = set()
    pattern = re.compile(r"^(static )?const u8 (\w+)\[\w*\]\s*=\s*_\((.*?)\);", flags=re.M | re.S)
    for path in sorted(SRC.glob("*.c")) + sorted((SRC / "data/text").glob("*.h")):
        text = path.read_text(errors="replace")
        for match in pattern.finditer(text):
            is_static, name, body = match.groups()
            key = f"{path.stem}.{name}" if is_static else name
            if key in seen:
                continue
            seen.add(key)
            cname = f"S_{len(definitions)}"
            definitions.append((key, cname, body))
    source = "#include \"global.h\"\n" + cdump_prelude() + "\n"
    source += "\n".join(f"static const u8 {cname}[] = _({body});" for _, cname, body in definitions)
    source += "\nint main(void){printf(\"{\");\n"
    for index, (key, cname, _) in enumerate(definitions):
        source += f'printf("{"," if index else ""}\\"{key}\\":"); JSTRN({cname}, sizeof({cname}));\n'
    source += 'printf("}"); return 0;}\n'
    data = dump_json("strings", source)
    return {k: b64hex(v if v.endswith("ff") else v + "ff") for k, v in data.items()}


def dump_battle_strings():
    source = r'''
#include "global.h"
#include "constants/battle_string_ids.h"
''' + cdump_prelude() + "\n"
    text = (SRC / "battle_message.c").read_text()
    strings = "\n".join(m.group(0).replace("static ", "") for m in re.finditer(r"^(?:static )?const u8 \w+\[\]\s*=\s*_\(.*?\);", text, flags=re.M | re.S))
    table = extract_definition(SRC / "battle_message.c", "gBattleStringsTable")
    defined = set(re.findall(r"const u8 (\w+)\[\]", strings))
    external = [name for name in dict.fromkeys(re.findall(r"=\s*(\w+),", table)) if name not in defined]
    markers = "\n".join(f"static const u8 {name}[] = {{0xF7, {i}, 0xFF}};" for i, name in enumerate(external))
    source += strings + "\n" + markers + "\n" + table + "\n"
    source += r'''
int main(void) {
    int i;
    printf("{\"start\":%d,\"table\":[", BATTLESTRINGS_TABLE_START);
    for (i = 0; i < BATTLESTRINGS_COUNT - BATTLESTRINGS_TABLE_START; i++) { if (i) printf(","); JSTR(gBattleStringsTable[i]); }
    printf("]}");
    return 0;
}
'''
    data = dump_json("battle_strings", source)
    data["table"] = [{"label": external[int(v[2:4], 16)]} if v.startswith("f7") and len(v) == 6 else b64hex(v) for v in data["table"]]
    return data


def _eval_c(text: str, constants: dict[str, int]) -> int:
    """Value of a C constant expression made of literals, known constants and + - * | & << >>."""
    text = text.strip()
    # include/constants/items.h: #define ITEM_TO_MAIL(itemId) ((itemId) - FIRST_MAIL_INDEX)
    text = re.sub(r"\bITEM_TO_MAIL\(([^()]*)\)", r"((\1) - FIRST_MAIL_INDEX)", text)
    try:
        return int(text, 0)
    except ValueError:
        pass
    constants = {"TRUE": 1, "FALSE": 0, "NULL": 0, **constants}
    if text in constants:
        return constants[text]
    expr = re.sub(r"\b[A-Za-z_]\w*\b", lambda m: str(constants[m.group(0)]) if m.group(0) in constants else m.group(0), text)
    if re.fullmatch(r"[0-9a-fA-FxX\s()+\-*|&<>]+", expr):
        return int(eval(expr, {"__builtins__": {}}, {}))
    raise KeyError(f"cannot evaluate {text!r}")


def export_items_from_c(constants):
    """pokeemerald declares gItems in C (src/data/items.h) instead of FireRed's items.json: same fields, same output."""
    text = (SRC / "data/items.h").read_text()
    descriptions = {}
    for symbol, body in re.findall(r"static const u8 (\w+)\[\] = _\((.*?)\);", (SRC / "data/text/item_descriptions.h").read_text(), flags=re.S):
        descriptions[symbol] = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', body))
    entries = []
    for const, body in re.findall(r"^\s*\[(ITEM_\w+)\]\s*=\s*\{(.*?)^\s*\},", text, flags=re.M | re.S):
        fields = {}
        for line in body.splitlines():
            line = re.sub(r"\s*//.*$", "", line)  # trailing comments (outside the string literals this file uses)
            m = re.match(r"^\s*\.(\w+)\s*=\s*(.*?),?\s*$", line)
            if m:
                fields[m.group(1)] = m.group(2)
        entries.append((const, fields))
    names = encode_strings([re.match(r'_\("(.*)"\)$', f["name"]).group(1) for _, f in entries])
    encoded_desc = encode_strings([descriptions[f["description"]] for _, f in entries])
    out = []
    for (const, f), name, description in zip(entries, names, encoded_desc):
        value = lambda key, default="0": _eval_c(f.get(key, default), constants)
        out.append({
            "id": value("itemId"), "const": const, "name": name, "price": value("price"),
            "holdEffect": value("holdEffect"), "holdEffectParam": value("holdEffectParam"),
            "description": description, "importance": value("importance"), "registrability": value("registrability"),
            "pocket": value("pocket"), "type": value("type"),
            "fieldUseFunc": f.get("fieldUseFunc", "NULL"), "battleUsage": value("battleUsage"),
            "battleUseFunc": f.get("battleUseFunc", "NULL"), "secondaryId": value("secondaryId"),
        })
    return out


def export_items(constants):
    if GAME != "firered":
        return export_items_from_c(constants)
    items = read_json(SRC / "data/items.json")["items"]
    names = encode_strings([i["english"] for i in items])
    descriptions = encode_strings([i.get("description_english", "") for i in items])
    out = []
    for item, name, description in zip(items, names, descriptions):
        out.append({
            "id": constants.get(item["itemId"], 0), "const": item["itemId"], "name": name, "price": item["price"],
            "holdEffect": constants.get(item["holdEffect"], 0), "holdEffectParam": item["holdEffectParam"],
            "description": description, "importance": item["importance"], "registrability": item["registrability"],
            "pocket": constants.get(item["pocket"], 0), "type": constants.get(item["type"], item["type"]) if isinstance(item["type"], str) else item["type"],
            "fieldUseFunc": item["fieldUseFunc"], "battleUsage": item["battleUsage"], "battleUseFunc": item["battleUseFunc"],
            "secondaryId": constants.get(str(item["secondaryId"]), item["secondaryId"]) if not isinstance(item["secondaryId"], int) else item["secondaryId"],
        })
    return out


def export_item_effects():
    source = r'''
#include "global.h"
#include "constants/items.h"
#include "constants/item_effects.h"
#include "constants/pokemon.h"
''' + cdump_prelude() + r'''
#include "data/pokemon/item_effects.h"
int main(void) {
    int i, j;
    printf("[");
    for (i = 0; i < ITEM_ENIGMA_BERRY - ITEM_POTION + 1; i++) {
        const u8 *e = gItemEffectTable[i];
        if (i) printf(",");
        if (!e) { printf("null"); continue; }
        printf("[");
        for (j = 0; j < 6; j++) printf(j ? ",%d" : "%d", e[j]);
        {
            int extra = 0;
            for (j = 4; j < 6; j++) { int b; for (b = 0; b < 8; b++) if (e[j] & (1 << b)) extra++; }
            for (j = 0; j < extra; j++) printf(",%d", e[6 + j]);
        }
        printf("]");
    }
    printf("]");
    return 0;
}
'''
    return dump_json("item_effects", source)


def export_wild(constants):
    data = read_json(SRC / "data/wild_encounters.json")
    result = {"rates": {}, "maps": {}}
    for group in data["wild_encounter_groups"]:
        if group["label"] != "gWildMonHeaders":
            continue
        for field in group["fields"]:
            result["rates"][field["type"]] = field["encounter_rates"]
        for entry in group["encounters"]:
            # FireRed's file holds both FireRed and LeafGreen tables; pokeemerald has a single version.
            if GAME == "firered" and not entry["base_label"].endswith("_FireRed"):
                continue
            map_entry = {}
            for kind in ("land_mons", "water_mons", "rock_smash_mons", "fishing_mons"):
                if kind in entry:
                    map_entry[kind] = {
                        "rate": entry[kind]["encounter_rate"],
                        "mons": [[m["min_level"], m["max_level"], constants[m["species"]]] for m in entry[kind]["mons"]],
                    }
            result["maps"][entry["map"]] = map_entry
    return result


def export_heal_locations(constants):
    data = read_json(SRC / "data/heal_locations.json")
    return data


def export_region_map():
    data = read_json(SRC / "data/region_map/region_map_sections.json")
    sections = data["map_sections"]
    names = encode_strings([s.get("name", "") for s in sections])
    return [{"id": s["id"], "name": n, "x": s.get("x", 0), "y": s.get("y", 0), "width": s.get("width", 1), "height": s.get("height", 1)} for s, n in zip(sections, names)]


def export_data(constants) -> None:
    out = OUT / "data"
    out.mkdir(parents=True, exist_ok=True)
    print("  species")
    write_json(out / "species.json", dump_species(constants))
    print("  moves/misc")
    write_json(out / "moves.json", dump_moves_and_misc())
    print("  trainers")
    write_json(out / "trainers.json", dump_trainers())
    print("  items")
    write_json(out / "items.json", {"items": export_items(constants), "effects": export_item_effects()})
    print("  wild")
    write_json(out / "wild.json", export_wild(constants))
    write_json(out / "heal_locations.json", export_heal_locations(constants))
    write_json(out / "region_map.json", export_region_map())
    print("  strings")
    write_json(out / "strings.json", dump_all_strings())
    write_json(out / "battle_strings.json", dump_battle_strings())
    write_json(out / "script_menu.json", export_script_menu(constants))


def export_script_menu(constants):
    """Multichoice lists, std strings and NPC text colors used by scripts."""
    if GAME == "firered":
        text = (SRC / "script_menu.c").read_text()
        list_pattern = r"static const struct MenuAction (sMultichoiceList_\w+)\[\]\s*=\s*\{(.*?)\};"
        key_prefix = "MULTICHOICE_"
    else:
        # pokeemerald: lists and the id table are in a data header; ids are MULTI_*.
        text = (SRC / "data/script_menu.h").read_text()
        list_pattern = r"static const struct MenuAction (MultichoiceList_\w+)\[\]\s*=\s*\{(.*?)\};"
        key_prefix = "MULTI_"
    lists = {}
    for name, body in re.findall(list_pattern, text, flags=re.S):
        lists[name] = re.findall(r"\{\s*(\w+)", body)
    table = re.search(r"sMultichoiceLists\[\]\s*=\s*\{(.*?)\};", text, flags=re.S).group(1)
    multichoice = {}
    for key, list_name in re.findall(rf"\[({key_prefix}\w+)\]\s*=\s*MULTICHOICE\((\w+)\)", table):
        if key in constants:
            multichoice[constants[key]] = lists.get(list_name, [])
    if GAME != "firered":
        # pokeemerald has neither gStdStringPtrs nor the NPC text colour table (dynamic_placeholder_text_util.c).
        return {"multichoice": multichoice, "stdStrings": None, "textColors": None}
    std = re.search(r"gStdStringPtrs\[\]\s*=\s*\{(.*?)\};", text, flags=re.S).group(1)
    std_strings = {}
    for key, value in re.findall(r"\[(STDSTRING_\w+)\]\s*=\s*(\w+)", std):
        std_strings[key] = value
    std_list = [value for _, value in re.findall(r"\[(STDSTRING_\w+)\]\s*=\s*(\w+)", std)]
    colors_src = extract_definition(SRC / "dynamic_placeholder_text_util.c", "sTextColorTable")
    source = '#include "global.h"\n#include "constants/event_objects.h"\n#include "constants/vars.h"\n#include <stdio.h>\n#define COLORS(lo, hi) (((hi) << 4) | (lo))\n' + colors_src + r'''
int main(void) { int i; printf("["); for (i = 0; i < (int)sizeof(sTextColorTable); i++) printf(i ? ",%d" : "%d", sTextColorTable[i]); printf("]"); return 0; }
'''
    colors = dump_json("text_colors", source)
    # Multichoice window widths/positions are computed at runtime from the strings.
    return {"multichoice": multichoice, "stdStrings": std_list, "textColors": colors}
