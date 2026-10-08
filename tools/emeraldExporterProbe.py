#!/usr/bin/env python3
"""Run the (unmodified) FireRed exporter against pokeemerald in an isolated copy, step by step.

Nothing in this repository is written: the exporter is copied to <work>/tools/decomp, pokeemerald to <work>/pokeemerald
(from ../refs-src/pokeemerald, with the extra sparse paths added in the copy only), and the exporter's own outputs
(public/fr, .decomp-build, src/fr/generated) land under <work>. Used by docs/EMERALD-EXPORTADOR-DIAGNOSTICO.md.

  python3 tools/emeraldExporterProbe.py --work /tmp/emerald-probe                 # unmodified exporter, every step
  python3 tools/emeraldExporterProbe.py --work /tmp/emerald-probe --patched       # + the four diagnostic edits below
  python3 tools/emeraldExporterProbe.py --work /tmp/emerald-probe --steps setup,constants --timeout 300

--patched edits only the COPY (see PATCHES): mapjson mode, skipping jsonproc inputs Emerald lacks, Emerald defines and
the generated-header include path. They are findings, not a proposed implementation.
Needs network for the sparse-checkout of the extra paths (about 14 MB from the commit pinned in tools/refs/sources.json).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EM_REFS = ROOT.parent / "refs-src" / "pokeemerald"
EXTRA_SPARSE = ["/charmap.txt", "/asm/", "/data/", "/graphics/", "/sound/", "/tools/jsonproc/", "/tools/mapjson/", "/tools/preproc/"]
STEPS = ["setup", "constants", "scripts", "battlescripts", "maps", "tilesets", "objects", "data", "graphics", "codegen", "incbin", "cdata", "tsconst", "structs", "audio"]


def patch_copy(work: Path) -> list[str]:
    done = []
    p = work / "tools/decomp/step_setup.py"
    s = p.read_text()
    s = s.replace('"firered"', '"emerald"')
    s = s.replace("    run([jsonproc,", "    srun([jsonproc,")
    s = s.replace("def generate_headers", '''def srun(cmd, **kw):  # skip jsonproc inputs that Emerald does not have
    miss = [c for c in cmd[1:3] if not (DECOMP / c).exists()]
    if miss:
        print("  SKIPPED (missing input in Emerald):", miss)
        return b""
    return run(cmd, **kw)


def generate_headers''', 1)
    p.write_text(s)
    done.append("step_setup.py: mapjson mode firered -> emerald; jsonproc inputs missing in Emerald are skipped")
    p = work / "tools/decomp/common.py"
    s = p.read_text()
    old = 'CPP_DEFINES = ["-DFIRERED", "-DREVISION=0", "-DENGLISH", "-DMODERN=0"]'
    assert old in s, "common.py changed: update this probe"
    p.write_text(s.replace(old, 'CPP_DEFINES = ["-DEMERALD", "-DREVISION=0", "-DENGLISH", "-DMODERN=0", "-I", str(GEN_INCLUDE / "constants")]'))
    done.append("common.py: -DFIRERED -> -DEMERALD and -I <generated>/constants (Emerald's maps.h includes map_groups.h next to itself)")
    return done


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--patched", action="store_true")
    ap.add_argument("--steps", default=",".join(STEPS))
    ap.add_argument("--timeout", type=int, default=900)
    a = ap.parse_args()
    work = Path(a.work).resolve()
    if ROOT in work.parents or work == ROOT:
        sys.exit("--work must be outside the repository")
    work.mkdir(parents=True, exist_ok=True)
    em = work / "pokeemerald"
    if not em.exists():
        shutil.copytree(EM_REFS, em, symlinks=True)
        subprocess.run(["git", "sparse-checkout", "add", *EXTRA_SPARSE], cwd=em, check=True)
    dec = work / "tools/decomp"
    if dec.exists():
        shutil.rmtree(dec)
    shutil.copytree(ROOT / "tools/decomp", dec, ignore=shutil.ignore_patterns("__pycache__"))
    (work / "src/fr/generated").mkdir(parents=True, exist_ok=True)
    notes = patch_copy(work) if a.patched else []
    for n in notes:
        print("PATCH", n)
    env = dict(os.environ, POKEFIRERED=str(em))
    results = []
    for step in a.steps.split(","):
        t = time.time()
        try:
            r = subprocess.run([sys.executable, "tools/decomp/export.py", step], cwd=work, env=env, capture_output=True, text=True, timeout=a.timeout)
            tail = (r.stdout + r.stderr).strip().splitlines()[-8:]
            results.append({"step": step, "rc": r.returncode, "secs": round(time.time() - t, 1), "tail": tail})
        except subprocess.TimeoutExpired:
            results.append({"step": step, "rc": "timeout", "secs": a.timeout, "tail": []})
        print(f"{step:14} rc={results[-1]['rc']} {results[-1]['secs']}s")
    (work / "steps.json").write_text(json.dumps({"patched": a.patched, "patches": notes, "steps": results}, indent=1))


if __name__ == "__main__":
    main()
