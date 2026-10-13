#!/bin/bash
# Run a ROM-side Lua script in a fresh mGBA without any manual step (mGBA 0.10.5 has no --script flag, so the
# Scripting console is driven through System Events; needs Accessibility permission for the calling app).
#
# Usage: run-rom.sh <script.lua> <out-file> [lua prelude, e.g. "PV_LOAD='/tmp/x.ss'; PV_OUT='/tmp/o.txt'"] [timeout-s]
# The script must write a line "DONE" to <out-file> (parcel.lua / rival.lua do). The emulator is restarted every
# run because callbacks of a previous script linger. Exit code 0 = DONE seen, 2 = timeout.
set -u
LUA="$1"; OUT="$2"; PRELUDE="${3:-}"; LIMIT="${4:-900}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ROM="${ROM:-$ROOT/assets/gba-reference/firered.gba}"
APP=/Applications/mGBA.app

osascript -e 'tell application "mGBA" to quit' >/dev/null 2>&1
for _ in $(seq 20); do pgrep -x mGBA >/dev/null || break; sleep 0.5; done
rm -f "$OUT"
open -a "$APP" "$ROM"
for _ in $(seq 40); do
  osascript -e 'tell application "System Events" to tell process "mGBA" to return (count of windows)' 2>/dev/null | grep -qE '^[1-9]' && break
  sleep 0.5
done
sleep 2

# Open the Scripting window if it is not already open (Tools > Scripting...).
HAVE=$(osascript -e 'tell application "System Events" to tell process "mGBA" to return (exists window "Scripting")' 2>/dev/null)
if [ "$HAVE" != "true" ]; then
  osascript <<'AS' >/dev/null 2>&1
tell application "mGBA" to activate
delay 0.5
tell application "System Events" to tell process "mGBA"
  click menu item "Scripting..." of menu 1 of menu bar item "Tools" of menu bar 1
end tell
AS
  sleep 2
fi

CMD="${PRELUDE}; dofile('${LUA}')"
osascript - "$CMD" <<'AS' >/dev/null
on run argv
  tell application "System Events" to tell process "mGBA" to tell splitter group 1 of window "Scripting"
    set value of text field 1 to (item 1 of argv)
    click button "Run"
  end tell
end run
AS

END=$(( $(date +%s) + LIMIT ))
while [ "$(date +%s)" -lt "$END" ]; do
  if [ -f "$OUT" ] && grep -q '^DONE' "$OUT"; then
    osascript -e 'tell application "mGBA" to quit' >/dev/null 2>&1
    exit 0
  fi
  sleep 2
done
echo "run-rom.sh: timeout after ${LIMIT}s (no DONE in $OUT)" >&2
osascript -e 'tell application "mGBA" to quit' >/dev/null 2>&1
exit 2
