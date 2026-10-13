#!/bin/bash
# One command for a ROM-vs-port route milestone: port walk (Playwright) -> tile trace -> ROM replay in a fresh mGBA
# (run-rom.sh) -> compare-route.py. Nothing is typed by hand.
#
# Usage: tools/rom-compare/run-milestone.sh [workdir]
# Env: PV_ENDMAP="{15,0}" (ROM stops 600 frames after the player is free on that map; default Route 2's forest gate),
#      RV_STATE (ROM savestate to start from, default /tmp/rom-postrival.ss), RNG (pinned gRngValue, port side),
#      SKIP_PORT=1 (reuse the port json/trace in the workdir), ROM_LIMIT (seconds, default 1500).
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
W="${1:-/tmp/rom-milestone}"; mkdir -p "$W"
ENDMAP="${PV_ENDMAP:-{15,0\}}"
STATE="${RV_STATE:-/tmp/rom-postrival.ss}"
export BASE="${BASE:-http://localhost:5197/}"

if [ "${SKIP_PORT:-0}" != "1" ]; then
  if ! curl -s -o /dev/null "$BASE"; then
    echo "starting play-server..."; (npm run play:server >"$W/server.log" 2>&1 &) 
    for _ in $(seq 60); do curl -s -o /dev/null "$BASE" && break; sleep 1; done
  fi
  echo "== port walk =="
  OUT="$W/port.json" TRACE="$W/trace.lua" node tools/rom-compare/port-parcel.mjs 2>&1 | tee "$W/port.log" | tail -15
fi

echo "== ROM replay =="
PRELUDE="dofile('$W/trace.lua'); PV_LOAD='$STATE'; PV_OUT='$W/rom.txt'; PV_ENDMAP=$ENDMAP"
tools/rom-compare/run-rom.sh "$ROOT/tools/rom-compare/parcel.lua" "$W/rom.txt" "$PRELUDE" "${ROM_LIMIT:-1500}"

echo "== compare =="
python3 tools/rom-compare/compare-route.py "$W/rom.txt" "$W/port.json" | tee "$W/compare.txt" | tail -40
