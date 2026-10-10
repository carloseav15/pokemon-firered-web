-- Phase 1 probe (docs/ROM-COMPARACION-VIABILIDAD.md): reset, scripted keys, per-60-frame state dump.
-- Load from mGBA's Scripting console: dofile('<repo>/tools/rom-compare/probe.lua')
-- Output goes to OUT_BASE .. run number (.txt); re-running the file removes the previous callback.
local OUT_BASE = PROBE_OUT or "/tmp/rom-compare-probe-run"  -- set PROBE_OUT before dofile to change
local LAST = 1500
local KEY = { A = 0, B = 1, SELECT = 2, START = 3 }
local schedule = { [420] = "START", [500] = "A", [560] = "A", [620] = "A", [680] = "A", [760] = "START" }

if _G.probe_cb then callbacks:remove(_G.probe_cb) end
_G.probe_run = (_G.probe_run or 0) + 1
local out = io.open(OUT_BASE .. _G.probe_run .. ".txt", "w")
out:write("probe v2\n")
local held, n = {}, -1

local function sum(region, size)
  local h = 0
  for off = 0, size - 4, 4 do h = (h * 31 + region:read32(off)) & 0xFFFFFFFF end
  return h
end

_G.probe_cb = callbacks:add("frame", function()
  n = n + 1
  if n > LAST then return end
  local k = schedule[n]
  if k then emu:addKey(KEY[k]); held[n + 3] = KEY[k] end
  if held[n] then emu:clearKey(held[n]); held[n] = nil end
  if n % 60 == 0 then
    local iw = emu.memory.iwram
    out:write(string.format("%d iw=%08x ew=%08x w5000=%08x\n", n,
      sum(iw, 0x8000), sum(emu.memory.wram, 0x40000), iw:read32(0x5000)))
    out:flush()
  end
  if n == LAST then out:write("done\n"); out:close(); console:log("probe done") end
end)
emu:reset()
console:log("probe run " .. _G.probe_run .. " armed")
