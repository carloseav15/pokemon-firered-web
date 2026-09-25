"""Export music, instrument samples and cries for the WebAudio backend.

Reads sound/song_table.inc (song id order), sound/songs/midi/midi.cfg
(per-song voicegroup/volume/reverb/priority), sound/voice_groups.inc,
sound/keysplit_tables.inc, sound/cry_tables.inc and the .mid/.wav sources.
Writes public/fr/audio/{songs.json,voicegroups.json,keysplit_tables.json,
cries.json,samples.json} plus the midi/cries/samples/ blobs.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

from common import DECOMP, OUT, write_json


def _wavname(label: str) -> str | None:
    name = label[4:] if label.startswith("Cry_") else label
    if name.startswith("Unused"):
        return None
    out = ""
    for i, ch in enumerate(name):
        if ch.isupper() and i and (name[i - 1].islower() or (i + 1 < len(name) and name[i + 1].islower())):
            out += "_"
        out += ch.lower()
    return out + ".wav"


def _parse_cfg() -> dict[str, dict[str, int]]:
    flags: dict[str, dict[str, int]] = {}
    for line in (DECOMP / "sound/songs/midi/midi.cfg").read_text().splitlines():
        match = re.match(r"^(\S+?):\s*(.*)$", line.strip())
        if not match:
            continue
        opts: dict[str, int] = {}
        for flag in re.findall(r"-([A-Z])(\d+)", match.group(2)):
            opts[flag[0]] = int(flag[1])
        flags[match.group(1)] = opts
    return flags


def _parse_voicegroups() -> tuple[dict[str, list], set[str]]:
    text = (DECOMP / "sound/voice_groups.inc").read_text()
    groups: dict[str, list] = {}
    samples: set[str] = set()
    current: list | None = None
    for line in text.splitlines():
        line = line.strip()
        match = re.match(r"^(voicegroup\d+)::$", line)
        if match:
            current = groups[match.group(1)] = []
            continue
        if current is None:
            continue
        match = re.match(r"^(voice_\w+)\s+(.*)$", line)
        if not match:
            continue
        kind, args = match.group(1), [a.strip() for a in match.group(2).split(",")]
        if kind in ("voice_square_1", "voice_square_1_alt"):
            base, pan, sweep, duty, attack, decay, sustain, release = (int(a) for a in args)
            current.append({"kind": kind, "base": base, "pan": pan, "sweep": sweep,
                            "duty": duty, "attack": attack, "decay": decay,
                            "sustain": sustain, "release": release})
        elif kind in ("voice_square_2", "voice_square_2_alt"):
            base, pan, duty, attack, decay, sustain, release = (int(a) for a in args)
            current.append({"kind": kind, "base": base, "pan": pan, "sweep": 0,
                            "duty": duty, "attack": attack, "decay": decay,
                            "sustain": sustain, "release": release})
        elif kind in ("voice_directsound", "voice_directsound_no_resample", "voice_directsound_alt"):
            base, pan, sample, attack, decay, sustain, release = args
            samples.add(sample)
            current.append({"kind": kind, "base": int(base), "pan": int(pan), "sample": sample,
                            "attack": int(attack), "decay": int(decay),
                            "sustain": int(sustain), "release": int(release)})
        elif kind in ("voice_noise", "voice_noise_alt"):
            base, pan, period, attack, decay, sustain, release = (int(a) for a in args)
            current.append({"kind": kind, "base": base, "pan": pan, "period": period,
                            "attack": attack, "decay": decay,
                            "sustain": sustain, "release": release})
        elif kind in ("voice_programmable_wave", "voice_programmable_wave_alt"):
            base, pan, wave, attack, decay, sustain, release = args
            current.append({"kind": kind, "base": int(base), "pan": int(pan), "wave": wave,
                            "attack": int(attack), "decay": int(decay),
                            "sustain": sustain, "release": release})
        elif kind == "voice_ahhs":
            current.append({"kind": kind, "args": [int(a, 0) for a in args]})
        elif kind == "voice_keysplit":
            current.append({"kind": kind, "group": args[0], "table": args[1]})
        elif kind == "voice_keysplit_all":
            current.append({"kind": kind, "group": args[0]})
        # Other lines (labels, directives) are not voice entries.
    return groups, samples


def _parse_keysplit_tables() -> dict[str, dict]:
    text = (DECOMP / "sound/keysplit_tables.inc").read_text()
    tables: dict[str, dict] = {}
    name: str | None = None
    start = 0
    values: list[int] = []
    def flush() -> None:
        if name is not None:
            tables[name] = {"start": start, "values": values}
    for line in text.splitlines():
        line = line.strip()
        match = re.match(r"^\.set\s+(\w+),\s*\.\s*-\s*(\d+)$", line)
        if match:
            flush()
            name, start, values = match.group(1), int(match.group(2)), []
            continue
        match = re.match(r"^\.byte\s+(\d+)", line)
        if match and name is not None:
            values.append(int(match.group(1)))
    flush()
    return tables


def _sample_files() -> dict[str, str]:
    """DirectSoundWaveData label -> relative .wav path (bins map 1:1 to wavs)."""
    text = (DECOMP / "sound/direct_sound_data.inc").read_text()
    mapping: dict[str, str] = {}
    label: str | None = None
    for line in text.splitlines():
        line = line.strip()
        match = re.match(r"^(\w+)::$", line)
        if match:
            label = match.group(1)
            continue
        match = re.match(r'^\.incbin "sound/direct_sound_samples/(.+)\.bin"$', line)
        if match and label:
            mapping[label] = match.group(1) + ".wav"
            label = None
    return mapping


def export_audio(_constants=None) -> None:
    out = OUT / "audio"
    cfg = _parse_cfg()
    table = (DECOMP / "sound/song_table.inc").read_text()
    entries = re.findall(r"^\s*song\s+(\w+),\s*(\d+),\s*(\d+)", table, re.M)
    songs = []
    midi_dir = out / "midi"
    for index, (name, player, _unknown) in enumerate(entries):
        src = DECOMP / f"sound/songs/midi/{name}.mid"
        opts = cfg.get(f"{name}.mid", {})
        entry = {"id": index, "name": name, "midi": None, "player": int(player),
                 "voicegroup": opts.get("G", 0), "volume": opts.get("V", 100),
                 "reverb": opts.get("R", 0), "priority": opts.get("P", 0)}
        if src.exists():
            midi_dir.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, midi_dir / f"{name}.mid")
            entry["midi"] = f"{name}.mid"
        songs.append(entry)
    write_json(out / "songs.json", {"songs": songs})

    groups, wanted_samples = _parse_voicegroups()
    write_json(out / "voicegroups.json", {"groups": groups})
    write_json(out / "keysplit_tables.json", _parse_keysplit_tables())

    files = _sample_files()
    samples_dir = out / "samples"
    samples: dict[str, str] = {}
    for label in sorted(wanted_samples):
        rel = files.get(label)
        src = DECOMP / "sound/direct_sound_samples" / rel if rel else None
        if rel and src and src.exists():
            dest = samples_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dest)
            samples[label] = rel
    write_json(out / "samples.json", {"samples": samples})

    cry_text = (DECOMP / "sound/cry_tables.inc").read_text()
    labels = re.findall(r"^\s*cry\s+(\w+)", cry_text, re.M)
    cries_dir = out / "cries"
    order: list[str | None] = []
    for label in labels:
        wav = _wavname(label)
        if wav and (DECOMP / "sound/direct_sound_samples/cries" / wav).exists():
            cries_dir.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(DECOMP / "sound/direct_sound_samples/cries" / wav, cries_dir / wav)
            order.append(wav)
        else:
            order.append(None)
    write_json(out / "cries.json", {"order": order})

    print(f"  songs={len(songs)} midis={sum(1 for s in songs if s['midi'])} "
          f"groups={len(groups)} samples={len(samples)} cries={sum(1 for c in order if c)}")
