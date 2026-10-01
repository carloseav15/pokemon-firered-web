"""Generation 4 validation called by compare_pokeapi.py."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


NATIONAL_COUNT = 493
STAT_IDS = {"hp": 1, "attack": 2, "defense": 3, "special_attack": 4, "special_defense": 5, "speed": 6}
STAT_ORDER = ("hp", "attack", "defense", "speed", "special_attack", "special_defense")
MOVE_FIELDS = ("type", "power", "accuracy", "pp", "priority", "effect_chance")
METHODS = {"by_level": 1, "egg_moves": 2, "by_tutor": 3, "by_tm": 4}
SPECIAL_TUTOR_MOVE_IDS = {307, 308, 338, 434}  # Blast Burn, Hydro Cannon, Frenzy Plant, Draco Meteor
GENDER_RATE = {
    "GENDER_RATIO_MALE_ONLY": 0,
    "GENDER_RATIO_FEMALE_12_5": 1,
    "GENDER_RATIO_FEMALE_25": 2,
    "GENDER_RATIO_FEMALE_50": 4,
    "GENDER_RATIO_FEMALE_75": 6,
    "GENDER_RATIO_FEMALE_ONLY": 8,
    "GENDER_RATIO_NO_GENDER": -1,
}
GROWTH_RATE = {
    "EXP_RATE_SLOW": "slow",
    "EXP_RATE_MEDIUM": "medium",
    "EXP_RATE_MEDIUM_FAST": "medium",
    "EXP_RATE_MEDIUM_SLOW": "medium-slow",
    "EXP_RATE_FAST": "fast",
    "EXP_RATE_ERRATIC": "slow-then-very-fast",
    "EXP_RATE_FLUCTUATING": "fast-then-very-slow",
}
EGG_GROUP = {
    "EGG_GROUP_MONSTER": "monster",
    "EGG_GROUP_WATER_1": "water1",
    "EGG_GROUP_BUG": "bug",
    "EGG_GROUP_FLYING": "flying",
    "EGG_GROUP_FIELD": "ground",
    "EGG_GROUP_FAIRY": "fairy",
    "EGG_GROUP_GRASS": "plant",
    "EGG_GROUP_HUMAN_LIKE": "humanshape",
    "EGG_GROUP_WATER_3": "water3",
    "EGG_GROUP_MINERAL": "mineral",
    "EGG_GROUP_AMORPHOUS": "indeterminate",
    "EGG_GROUP_WATER_2": "water2",
    "EGG_GROUP_DITTO": "ditto",
    "EGG_GROUP_DRAGON": "dragon",
    "EGG_GROUP_UNDISCOVERED": "no-eggs",
}


def read_rows(directory: Path, name: str) -> list[dict[str, str]]:
    path = directory / f"{name}.csv"
    if not path.is_file():
        raise SystemExit(f"PokéAPI CSV not found: {path}")
    with path.open(encoding="utf8", newline="") as stream:
        return list(csv.DictReader(stream))


def integer(value: str | int | None) -> int:
    return int(value) if value not in (None, "") else 0


def compare_platinum(csv_dir: Path, root: Path, out_path: str | None = None) -> None:
    version_groups = read_rows(csv_dir, "version_groups")
    platinum_group = next((row for row in version_groups if row["identifier"] == "platinum"), None)
    if not platinum_group or platinum_group["generation_id"] != "4":
        raise SystemExit("version_groups.csv: missing Platinum version group in generation 4")
    version_group_id = int(platinum_group["id"])
    version_group_order = int(platinum_group["order"])
    group_order = {int(row["id"]): int(row["order"]) for row in version_groups}

    types = read_rows(csv_dir, "types")
    type_id_by_name = {row["identifier"]: int(row["id"]) for row in types}
    type_name_by_id = {int(row["id"]): row["identifier"] for row in types}
    abilities = read_rows(csv_dir, "abilities")
    ability_name_by_id = {int(row["id"]): row["identifier"] for row in abilities}
    egg_groups = read_rows(csv_dir, "egg_groups")
    egg_group_name_by_id = {int(row["id"]): row["identifier"] for row in egg_groups}
    growth_rates = read_rows(csv_dir, "growth_rates")
    growth_name_by_id = {int(row["id"]): row["identifier"] for row in growth_rates}

    platinum_moves_doc = json.loads((root / "refs/platinum/moves.json").read_text())
    platinum_species_doc = json.loads((root / "refs/platinum/species.json").read_text())
    platinum_moves = platinum_moves_doc["data"]
    platinum_species = platinum_species_doc["data"]
    move_id_by_const = {row["const"]: row["id"] for row in platinum_moves}
    if len(move_id_by_const) != len(platinum_moves):
        raise SystemExit("refs/platinum/moves.json: duplicate move constants")
    if len(platinum_species) < NATIONAL_COUNT + 1:
        raise SystemExit(f"refs/platinum/species.json: expected ids 0-{NATIONAL_COUNT}")

    # Reconstruct the values that were in force at the selected version group.
    current_moves = {int(row["id"]): row for row in read_rows(csv_dir, "moves")}
    move_history: dict[int, list[dict[str, str]]] = defaultdict(list)
    for row in read_rows(csv_dir, "move_changelog"):
        move_history[int(row["move_id"])].append(row)

    def move_at_platinum(move_id: int) -> dict[str, str]:
        if move_id not in current_moves:
            raise SystemExit(f"moves.csv: missing move id {move_id}")
        value = dict(current_moves[move_id])
        restored: set[str] = set()
        changes = sorted(
            move_history[move_id],
            key=lambda row: group_order[int(row["changed_in_version_group_id"])],
        )
        for change in changes:
            if group_order[int(change["changed_in_version_group_id"])] <= version_group_order:
                continue
            for field in MOVE_FIELDS:
                source_field = "type_id" if field == "type" else field
                if change[source_field] != "" and field not in restored:
                    value[source_field] = change[source_field]
                    restored.add(field)
        return value

    # Map each species id to its default Pokémon form, then apply per-generation
    # history for stats, types, and standard abilities.
    pokemon_by_species: dict[int, int] = {}
    for row in read_rows(csv_dir, "pokemon"):
        if row["is_default"] == "1":
            pokemon_by_species[int(row["species_id"])] = int(row["id"])
    missing_forms = [national for national in range(1, NATIONAL_COUNT + 1) if national not in pokemon_by_species]
    if missing_forms:
        raise SystemExit(f"pokemon.csv: missing default forms for national species {missing_forms[:10]}")

    stats_now: dict[int, dict[int, tuple[int, int]]] = defaultdict(dict)
    for row in read_rows(csv_dir, "pokemon_stats"):
        stat_id = int(row["stat_id"])
        if stat_id in STAT_IDS.values():
            stats_now[int(row["pokemon_id"])][stat_id] = (int(row["base_stat"]), int(row["effort"]))
    stats_past: dict[tuple[int, int], list[tuple[int, int, int]]] = defaultdict(list)
    for row in read_rows(csv_dir, "pokemon_stats_past"):
        stat_id = int(row["stat_id"])
        if stat_id in STAT_IDS.values():
            stats_past[(int(row["pokemon_id"]), stat_id)].append(
                (int(row["generation_id"]), int(row["base_stat"]), int(row["effort"]))
            )

    def stat_at(pokemon_id: int, stat_id: int) -> tuple[int, int]:
        future = sorted(item for item in stats_past[(pokemon_id, stat_id)] if item[0] >= 4)
        if future:
            return future[0][1], future[0][2]
        if stat_id not in stats_now[pokemon_id]:
            raise SystemExit(f"pokemon_stats.csv: missing stat {stat_id} for Pokémon {pokemon_id}")
        return stats_now[pokemon_id][stat_id]

    types_now: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for row in read_rows(csv_dir, "pokemon_types"):
        types_now[int(row["pokemon_id"])].append((int(row["slot"]), int(row["type_id"])))
    types_past: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    for row in read_rows(csv_dir, "pokemon_types_past"):
        types_past[(int(row["pokemon_id"]), int(row["generation_id"]))].append(
            (int(row["slot"]), int(row["type_id"]))
        )

    def types_at(pokemon_id: int) -> list[str]:
        past_generations = sorted(generation for pid, generation in types_past if pid == pokemon_id and generation >= 4)
        if past_generations:
            pairs = types_past[(pokemon_id, past_generations[0])]
        else:
            pairs = types_now[pokemon_id]
        names = [type_name_by_id[type_id] for _, type_id in sorted(pairs)]
        return list(dict.fromkeys(names))

    abilities_now: dict[int, dict[int, int]] = defaultdict(dict)
    for row in read_rows(csv_dir, "pokemon_abilities"):
        if row["is_hidden"] == "0":
            abilities_now[int(row["pokemon_id"])][int(row["slot"])] = int(row["ability_id"])
    abilities_past: dict[tuple[int, int, int], list[tuple[int, str]]] = defaultdict(list)
    for row in read_rows(csv_dir, "pokemon_abilities_past"):
        if row["is_hidden"] == "0":
            abilities_past[(int(row["pokemon_id"]), int(row["slot"]), int(row["generation_id"]))].append(
                (int(row["generation_id"]), row["ability_id"])
            )

    def abilities_at(pokemon_id: int) -> list[str]:
        slots = dict(abilities_now[pokemon_id])
        candidate_slots = {slot for pid, slot, generation in abilities_past if pid == pokemon_id and generation >= 4}
        for slot in candidate_slots:
            generation = min(g for pid, candidate, g in abilities_past if pid == pokemon_id and candidate == slot and g >= 4)
            history = abilities_past[(pokemon_id, slot, generation)]
            ability_id = history[0][1]
            if ability_id:
                slots[slot] = int(ability_id)
            else:
                slots.pop(slot, None)
        return sorted(ability_name_by_id[ability_id] for ability_id in slots.values())

    species_rows = {int(row["id"]): row for row in read_rows(csv_dir, "pokemon_species")}
    egg_groups_by_species: dict[int, set[str]] = defaultdict(set)
    for row in read_rows(csv_dir, "pokemon_egg_groups"):
        egg_group_id = int(row["egg_group_id"])
        if egg_group_id not in egg_group_name_by_id:
            raise SystemExit(f"egg_groups.csv: missing egg group id {egg_group_id}")
        egg_groups_by_species[int(row["species_id"])].add(egg_group_name_by_id[egg_group_id])

    # Version-group-specific learnsets and machine compatibility.
    moves_by_pokemon: dict[int, dict[int, list[tuple[int, int]]]] = defaultdict(lambda: defaultdict(list))
    for row in read_rows(csv_dir, "pokemon_moves"):
        if int(row["version_group_id"]) == version_group_id:
            moves_by_pokemon[int(row["pokemon_id"])][int(row["pokemon_move_method_id"])].append(
                (integer(row["level"]), int(row["move_id"]))
            )
    machine_moves = {
        int(row["machine_number"]): int(row["move_id"])
        for row in read_rows(csv_dir, "machines")
        if int(row["version_group_id"]) == version_group_id
    }

    checks: dict[str, list[int]] = {}
    actual_errors: list[dict] = []
    history_incomplete: list[dict] = []
    representations: Counter[str] = Counter()
    representation_examples: dict[str, list[dict]] = defaultdict(list)

    def record_representation(rule: str, example: dict | None = None) -> None:
        representations[rule] += 1
        if example is not None and len(representation_examples[rule]) < 5:
            representation_examples[rule].append(example)

    def check(category: str, same: bool, detail: dict, bucket: str = "actual_errors") -> None:
        counts = checks.setdefault(category, [0, 0])
        counts[0] += 1
        if same:
            return
        counts[1] += 1
        if bucket == "history_incomplete":
            history_incomplete.append(detail)
        else:
            actual_errors.append(detail)

    def type_name_from_platinum(value: str) -> str:
        if value == "TYPE_MYSTERY":
            return "unknown"
        return value.removeprefix("TYPE_").lower()

    # Moves: use the first value recorded after Platinum for each changed field
    # to roll current PokéAPI data back to version group 9.
    for move_id, platinum_move in enumerate(platinum_moves[1:], start=1):
        if platinum_move.get("id") != move_id:
            raise SystemExit(f"refs/platinum/moves.json: index {move_id} has id {platinum_move.get('id')!r}")
        pokeapi = move_at_platinum(move_id)
        platinum_type = type_name_from_platinum(platinum_move["type"])
        pokeapi_type = type_name_by_id.get(integer(pokeapi["type_id"]))
        if pokeapi_type is None:
            raise SystemExit(f"types.csv: missing type id {pokeapi['type_id']!r} for move {move_id}")
        if platinum_type not in type_id_by_name:
            raise SystemExit(f"{platinum_move['const']}: Platinum type is missing from types.csv: {platinum_type}")
        if platinum_type == "unknown":
            record_representation("TYPE_MYSTERY and PokéAPI unknown type share the same type")

        normalized = {
            "type": type_id_by_name.get(platinum_type),
            "power": platinum_move["power"],
            "accuracy": platinum_move["accuracy"],
            "pp": platinum_move["pp"],
            "priority": platinum_move["priority"],
            "effect_chance": platinum_move["effect_chance"],
        }
        from_api = {
            "type": integer(pokeapi["type_id"]),
            "power": integer(pokeapi["power"]),
            "accuracy": integer(pokeapi["accuracy"]),
            "pp": integer(pokeapi["pp"]),
            "priority": integer(pokeapi["priority"]),
            "effect_chance": integer(pokeapi["effect_chance"]),
        }
        for field in ("power", "accuracy", "effect_chance"):
            if normalized[field] == 0 and pokeapi[field] == "" and not (field == "power" and platinum_move["power"] == 1):
                record_representation(
                    f"Unset PokéAPI {field} is represented as 0 in Platinum",
                    {"move": platinum_move["const"], "field": field, "platinum": 0, "pokeapi": None},
                )
        api_fields = {field: ("type_id" if field == "type" else field) for field in MOVE_FIELDS}
        for field in MOVE_FIELDS:
            if field == "effect_chance" and normalized[field] == 0 and from_api[field] == 100:
                record_representation(
                    "Platinum encodes guaranteed effects with chance 0; PokéAPI uses 100",
                    {"move": platinum_move["const"], "field": field, "platinum": 0, "pokeapi": 100},
                )
                check(f"moves.{field}", True, {})
                continue
            if field == "power" and normalized[field] == 1:
                record_representation(
                    "Variable-power moves use a non-fixed power marker in Platinum",
                    {"move": platinum_move["const"], "field": field, "platinum": 1, "pokeapi": from_api[field]},
                )
                check(f"moves.{field}", True, {})
                continue
            if field == "priority" and (
                platinum_move["const"] == "MOVE_FAKE_OUT"
                or platinum_move["effect"] == "BATTLE_EFFECT_PRIORITY_1"
            ) and normalized[field] != from_api[field]:
                record_representation(
                    "Move-effect handling changes effective priority beyond the stored move priority",
                    {
                        "move": platinum_move["const"], "field": field,
                        "stored_priority": normalized[field], "pokeapi_effective_priority": from_api[field],
                    },
                )
                check(f"moves.{field}", True, {})
                continue

            future_history = any(
                group_order[int(change["changed_in_version_group_id"])] > version_group_order
                and change[api_fields[field]] != ""
                for change in move_history[move_id]
            )
            check(
                f"moves.{field}",
                normalized[field] == from_api[field],
                {
                    "domain": "moves",
                    "id": move_id,
                    "const": platinum_move["const"],
                    "field": field,
                    "platinum": platinum_move[field],
                    "pokeapi": pokeapi[api_fields[field]],
                },
                "actual_errors" if future_history else "history_incomplete",
            )

    def move_ids(values: list[str], species_name: str, field: str) -> list[int]:
        result = []
        for const in values:
            if const not in move_id_by_const:
                raise SystemExit(f"{species_name}: unknown move constant {const!r} in {field}")
            result.append(move_id_by_const[const])
        return result

    type_names = set(type_id_by_name)
    for national in range(1, NATIONAL_COUNT + 1):
        if national >= len(platinum_species):
            raise SystemExit(f"refs/platinum/species.json: missing national species {national}")
        p = platinum_species[national]
        if p.get("id") != national:
            raise SystemExit(f"refs/platinum/species.json: index {national} has id {p.get('id')!r}")
        if national not in species_rows:
            raise SystemExit(f"pokemon_species.csv: missing national species {national}")
        species = species_rows[national]
        pokemon_id = pokemon_by_species[national]
        const = p["const"]

        base_stats = [stat_at(pokemon_id, STAT_IDS[key])[0] for key in STAT_ORDER]
        ev_yields = [stats_now[pokemon_id][STAT_IDS[key]][1] for key in STAT_ORDER]
        p_stats = [p["base_stats"][key] for key in STAT_ORDER]
        p_evs = [p["ev_yields"][key] for key in STAT_ORDER]
        check("species.base_stats", p_stats == base_stats, {
            "domain": "species", "national": national, "const": const,
            "field": "base_stats", "platinum": p_stats, "pokeapi": base_stats,
        })
        check("species.ev_yields", p_evs == ev_yields, {
            "domain": "species", "national": national, "const": const,
            "field": "ev_yields", "platinum": p_evs, "pokeapi": ev_yields,
        }, "history_incomplete")

        p_types = list(dict.fromkeys(type_name_from_platinum(value) for value in p["types"]))
        if any(value not in type_names for value in p_types):
            raise SystemExit(f"{const}: Platinum type is missing from types.csv: {p_types}")
        api_types = types_at(pokemon_id)
        if len(set(p["types"])) < len(p["types"]):
            record_representation("Duplicate Platinum type slots collapse to one PokéAPI monotype")
        check("species.types", p_types == api_types, {
            "domain": "species", "national": national, "const": const,
            "field": "types", "platinum": p_types, "pokeapi": api_types,
        })

        raw_abilities = [
            ability.removeprefix("ABILITY_").lower().replace("_", "-")
            for ability in p["abilities"] if ability != "ABILITY_NONE"
        ]
        p_abilities = sorted(set(raw_abilities))
        if "ABILITY_NONE" in p["abilities"]:
            record_representation("ABILITY_NONE placeholder is omitted from PokéAPI ability rows")
        if len(raw_abilities) != len(p_abilities):
            record_representation("Duplicate Platinum ability slots collapse to a PokéAPI set")
        api_abilities = abilities_at(pokemon_id)
        if any(ability not in ability_name_by_id.values() for ability in p_abilities):
            raise SystemExit(f"{const}: Platinum ability is missing from abilities.csv: {p_abilities}")
        check("species.abilities", p_abilities == api_abilities, {
            "domain": "species", "national": national, "const": const,
            "field": "abilities", "platinum": p_abilities, "pokeapi": api_abilities,
        })

        raw_egg_groups = [EGG_GROUP[group] for group in p["egg_groups"] if group in EGG_GROUP]
        p_egg_groups = sorted(set(raw_egg_groups))
        if len(raw_egg_groups) != len(p_egg_groups):
            record_representation("Duplicate Platinum egg-group slots collapse to a PokéAPI set")
        missing_egg_groups = [group for group in p["egg_groups"] if group not in EGG_GROUP]
        if missing_egg_groups:
            raise SystemExit(f"{const}: unmapped Platinum egg groups {missing_egg_groups}")
        api_egg_groups = sorted(egg_groups_by_species[national])
        check("species.egg_groups", p_egg_groups == api_egg_groups, {
            "domain": "species", "national": national, "const": const,
            "field": "egg_groups", "platinum": p_egg_groups, "pokeapi": api_egg_groups,
        }, "history_incomplete")

        gender = GENDER_RATE.get(p["gender_ratio"])
        if gender is None:
            raise SystemExit(f"{const}: unmapped gender ratio {p['gender_ratio']!r}")
        record_representation("Platinum gender-ratio enum is converted to PokéAPI's 0-8/-1 rate")
        static_checks = (
            ("catch_rate", p["catch_rate"], int(species["capture_rate"])),
            ("base_friendship", p["base_friendship"], int(species["base_happiness"])),
            ("hatch_cycles", p["hatch_cycles"], int(species["hatch_counter"])),
            ("gender_ratio", gender, int(species["gender_rate"])),
            ("exp_rate", GROWTH_RATE.get(p["exp_rate"]), growth_name_by_id[int(species["growth_rate_id"])]),
        )
        for field, platinum_value, api_value in static_checks:
            if platinum_value is None:
                raise SystemExit(f"{const}: unmapped growth rate {p['exp_rate']!r}")
            check(f"species.{field}", platinum_value == api_value, {
                "domain": "species", "national": national, "const": const,
                "field": field, "platinum": platinum_value, "pokeapi": api_value,
            }, "history_incomplete")

        grouped = moves_by_pokemon[pokemon_id]
        level_api = Counter(grouped[METHODS["by_level"]])
        level_platinum = Counter()
        for level, move in p["learnset"]["by_level"]:
            if move not in move_id_by_const:
                raise SystemExit(f"{const}: unknown move constant {move!r} in by_level")
            level_platinum[(level, move_id_by_const[move])] += 1
        check("species.learnset_by_level", level_platinum == level_api, {
            "domain": "species", "national": national, "const": const,
            "field": "learnset_by_level",
            "platinum": sorted([list(pair) for pair in level_platinum.elements()]),
            "pokeapi": sorted([list(pair) for pair in level_api.elements()]),
        })

        tm_api = {move_id for _, move_id in grouped[METHODS["by_tm"]]}
        tm_platinum = set()
        for machine in p["learnset"]["by_tm"]:
            match = re.fullmatch(r"(TM|HM)(\d{2})", machine)
            if not match:
                raise SystemExit(f"{const}: invalid machine identifier {machine!r}")
            number = int(match[2]) + (100 if match[1] == "HM" else 0)
            if number not in machine_moves:
                raise SystemExit(f"machines.csv: missing Platinum machine {machine} (number {number})")
            tm_platinum.add(machine_moves[number])
        check("species.learnset_tm_hm", tm_platinum == tm_api, {
            "domain": "species", "national": national, "const": const,
            "field": "learnset_tm_hm", "platinum": sorted(tm_platinum), "pokeapi": sorted(tm_api),
        })

        for key, method in (("by_tutor", METHODS["by_tutor"]), ("egg_moves", METHODS["egg_moves"])):
            api_values = {move_id for _, move_id in grouped[method]}
            platinum_values = set(move_ids(p["learnset"].get(key, []), const, key))
            if (
                key == "by_tutor"
                and platinum_values <= api_values
                and api_values - platinum_values
                and api_values - platinum_values <= SPECIAL_TUTOR_MOVE_IDS
            ):
                record_representation(
                    "PokéAPI tutor method includes special species tutors outside Platinum by_tutor lists",
                    {
                        "national": national,
                        "species": const,
                        "extra_moves": sorted(api_values - platinum_values),
                    },
                )
                check("species.learnset_by_tutor", True, {})
                continue
            check(f"species.learnset_{key}", platinum_values == api_values, {
                "domain": "species", "national": national, "const": const,
                "field": f"learnset_{key}", "platinum": sorted(platinum_values), "pokeapi": sorted(api_values),
            })

    representation_rows = [
        {"rule": rule, "occurrences": count, "examples": representation_examples[rule]}
        for rule, count in sorted(representations.items())
    ]
    summary = {
        "generation": 4,
        "version_group": {"id": version_group_id, "identifier": "platinum", "order": version_group_order},
        "comparisons": {
            category: {"compared": counts[0], "differ": counts[1]}
            for category, counts in sorted(checks.items())
        },
        "actual_errors": actual_errors,
        "history_incomplete": history_incomplete,
        "representation_differences": representation_rows,
    }

    print(f"PokéAPI generation 4, version group platinum (id {version_group_id})")
    print(f"{'categoría':32} {'comparados':>9} {'difieren':>8}")
    for category, (compared, different) in sorted(checks.items()):
        print(f"{category:32} {compared:>9} {different:>8}")
    print(f"errores reales: {len(actual_errors)}")
    print(f"historial incompleto: {len(history_incomplete)}")
    print(f"diferencias de representación normalizadas: {sum(representations.values())}")
    for row in representation_rows:
        print(f"  {row['occurrences']:>5}  {row['rule']}")
    if out_path:
        Path(out_path).write_text(json.dumps(summary, ensure_ascii=False, indent=1, sort_keys=True) + "\n")
        print(f"wrote {out_path}")
