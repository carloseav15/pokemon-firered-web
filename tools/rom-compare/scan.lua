-- Phase 2 helper: after emu:reset(), dump the whole IWRAM (hex, one line per frame) for frames FROM..TO.
-- Used offline to locate counters/RNG/pointers by behaviour. dofile('<repo>/tools/rom-compare/scan.lua')
local OUT = SCAN_OUT or "/tmp/rom-compare-iwram-scan.txt"
local FROM, TO = SCAN_FROM or 200, SCAN_TO or 260
if _G.scan_cb then callbacks:remove(_G.scan_cb) end
local out = io.open(OUT, "w")
local n = -1
_G.scan_cb = callbacks:add("frame", function()
  n = n + 1
  if n < FROM or n > TO then return end
  out:write(n, " ", emu.memory.iwram:readRange(0, 0x8000):gsub(".", function(c) return string.format("%02x", c:byte()) end), "\n")
  if n == TO then out:close(); console:log("scan done") end
end)
emu:reset()
console:log("scan armed")
