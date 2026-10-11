-- Phase 3 tracer: reset, apply TRACE_KEYS (frame -> key name, held 3 frames), write one line per frame:
--   frame vblankCounter2 gRngValue callback2 callback1 heldKeys
-- Addresses (FireRed USA 1.0, verified by behaviour in tools/rom-compare/addresses.json):
--   gMain 0x030030F0, gRngValue 0x03005000. dofile('<repo>/tools/rom-compare/trace.lua')
local OUT = TRACE_OUT or "/tmp/rom-compare-trace.txt"
local LAST = TRACE_LAST or 1800
local KEYS = TRACE_KEYS or {}
-- Optional anchor: TRACE_REL = { cb2 = <callback2 address>, keys = { [frames since cb2 first seen] = "KEY" } }
local REL = TRACE_REL
local anchor = nil
local KEY = { A = 0, B = 1, SELECT = 2, START = 3, RIGHT = 4, LEFT = 5, UP = 6, DOWN = 7 }
if _G.trace_cb then callbacks:remove(_G.trace_cb) end
local out = io.open(OUT, "w")
local n, held = -1, {}
_G.trace_cb = callbacks:add("frame", function()
  n = n + 1
  if n > LAST then return end
  local cb2 = emu.memory.iwram:read32(0x30F4)
  if REL and not anchor and cb2 == REL.cb2 then anchor = n end
  local k = KEYS[n]
  if REL and anchor then k = REL.keys[n - anchor] or k end
  if k then emu:addKey(KEY[k]); held[n + 3] = KEY[k] end
  if held[n] then emu:clearKey(held[n]); held[n] = nil end
  local iw = emu.memory.iwram
  out:write(string.format("%d %d %08x %08x %08x %04x\n", n, iw:read32(0x3114), iw:read32(0x5000),
    iw:read32(0x30F4), iw:read32(0x30F0), iw:read16(0x311C)))
  if n == LAST then out:close(); console:log("trace done") end
end)
emu:reset()
console:log("trace armed")
