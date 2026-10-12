-- ROM side of the Route 1 -> Viridian City -> Poke Mart (Oak's Parcel) comparison. It replays the port's tile trace
-- (tools/rom-compare/port-parcel.mjs writes /tmp/port-parcel-trace.lua: PARCEL_TRACE = { {g,n,x,y,dir,script}, ... })
-- and dumps flags/vars at every map change and at the end (the parcel scene var reaches 1 and 600 frames pass).
-- Globals: PV_LOAD (state file), PV_OUT (report), PV_MAXF (frame cap), PARCEL_TRACE (set by dofile of the trace).
-- Input is never held together with A: when the trace says a script runs (or the ROM is off the trace) it taps A
-- in 30-frame bursts; otherwise it holds the recorded direction.
local KEY = { A = 0, B = 1, SELECT = 2, START = 3, RIGHT = 4, LEFT = 5, UP = 6, DOWN = 7 }
local DIRKEY = { U = KEY.UP, D = KEY.DOWN, L = KEY.LEFT, R = KEY.RIGHT }
local W, I = emu.memory.wram, emu.memory.iwram
local WILD = PV_WILD or 0x8B529B4A
local RNG = PV_RNG or 0x1B5BD042   -- same constant port-parcel.mjs writes before every frame (no wild encounters)
local out = io.open(PV_OUT or "/tmp/rom-parcel.txt", "w")
out:setvbuf("no")
local MAXF = PV_MAXF or 60000
local TR = PARCEL_TRACE
local MART_SCENE = 0x4000 + (16471 - 0x4000)   -- VAR_MAP_SCENE_VIRIDIAN_CITY_MART = 0x4057
local function sb() return I:read32(0x03005008 - 0x03000000) - 0x02000000 end
local function pos() local b = sb(); return W:read16(b), W:read16(b + 2) end
local function map() local b = sb(); return W:read8(b + 4), W:read8(b + 5) end
local function var(id) return W:read16(sb() + 0x1000 + (id - 0x4000) * 2) end
local function hex(off, len) local t = {} for i = 0, len - 1 do t[#t + 1] = string.format("%02x", W:read8(off + i)) end return table.concat(t) end
local function dump(tag, n)
  local b = sb()
  local x, y = pos()
  local g, m = map()
  out:write(string.format("DUMP %s f=%d pos=%d,%d map=%d,%d rng=%08x\n", tag, n, x, y, g, m, I:read32(0x5000)))
  out:write("FLAGS ", tag, " ", hex(b + 0xEE0, 288), "\n")
  out:write("VARS ", tag, " ", hex(b + 0x1000, 512), "\n")
  local b2 = I:read32(0x0300500C - 0x03000000) - 0x02000000
  out:write(string.format("MONEY %s %08x key=%08x\n", tag, W:read32(b + 0x290), W:read32(b2 + 0xF20)))
  out:write(string.format("PARTY %s count=%d mon0=%s\n", tag, W:read8(0x02024029 - 0x02000000), hex(0x02024284 - 0x02000000, 100)))
  out:flush()
end
-- PV_SCAN: locate sWildEncounterData.rngState (EWRAM u32, ISO_RANDOMIZE2 = 1103515245 * v + 12345 per grass step) by
-- comparing EWRAM at arrival on Route 1 and at the first wild battle.
local function snap() local t = {} for a = 0, 0x3FFFC, 4 do t[a] = W:read32(a) end return t end
local function inBattle() return (I:read8(0x30F0 + 0x439) & 2) ~= 0 end
local snap1, scanned = nil, false
local function scan(s2)
  for a, v in pairs(snap1) do
    local w, w2 = v, s2[a]
    if w ~= w2 then
      for k = 1, 40 do
        w = (1103515245 * w + 12345) & 0xFFFFFFFF
        if w == w2 then out:write(string.format("WILDRNG addr=0x%08x steps=%d old=%08x new=%08x\n", 0x02000000 + a, k, v, w2)) break end
      end
    end
  end
  out:flush()
end
if _G.pv_cb then callbacks:remove(_G.pv_cb) end
for k = 0, 9 do emu:clearKey(k) end
local n, held, idx, lastMap, doneAt = -1, {}, 1, nil, nil
local function want(set)
  for _, k in pairs(KEY) do
    local w = set[k] == true
    if w and not held[k] then emu:addKey(k) held[k] = true
    elseif not w and held[k] then emu:clearKey(k) held[k] = nil end
  end
end
local function same(e, g, m, x, y) return e[1] == g and e[2] == m and e[3] == x and e[4] == y end
_G.pv_cb = callbacks:add("frame", function()
  n = n + 1
  I:write32(0x5000, RNG)
  W:write32(0x020386d0 - 0x02000000, WILD)   -- sWildEncounterData.rngState (see port-parcel.mjs)
  if n > MAXF then if not doneAt then dump("timeout", n) out:close() doneAt = -1 end return end
  if doneAt == -1 then return end
  local g, m = map()
  local x, y = pos()
  local mapKey = g * 256 + m
  if PV_SCAN then
    if mapKey == 3 * 256 + 19 and not snap1 then snap1 = snap() out:write("SNAP1 f=" .. n .. "\n") end
    if snap1 and not scanned and inBattle() then scanned = true scan(snap()) out:write("SCANNED f=" .. n .. "\n") end
  end
  if mapKey ~= lastMap then
    if lastMap then dump(string.format("map:%d,%d", g, m), n) end
    lastMap = mapKey
  end
  -- Position on the trace: look a few entries ahead (a step can skip an entry when a script moves the player).
  for k = idx, math.min(#TR, idx + 6) do
    if same(TR[k], g, m, x, y) then idx = k break end
  end
  local e, nx = TR[idx], TR[idx + 1]
  local set = {}
  local burst = (n % 50) < 30
  local tapA = (n % 20) < 3
  if n % 300 == 0 then out:write(string.format("T f=%d idx=%d/%d pos=%d,%d map=%d,%d scene=%d\n", n, idx, #TR, x, y, g, m, var(MART_SCENE))) end
  if var(MART_SCENE) == 1 and not doneAt then doneAt = n end
  if doneAt and doneAt > 0 and n - doneAt >= 600 then
    dump("end", n) out:write("DONE\n") out:close() doneAt = -1 return
  end
  local onTrace = e and same(e, g, m, x, y)
  if not nx then
    if tapA then set[KEY.A] = true end
  elseif not onTrace then
    -- off the trace (a script moved the player or the ROM diverged): only A until the position matches again
    if tapA then set[KEY.A] = true end
  elseif e[6] then
    -- a script ran on this tile in the port: alternate A bursts and the recorded direction so neither side stalls
    if burst then if tapA then set[KEY.A] = true end
    elseif e[5] and DIRKEY[e[5]] then set[DIRKEY[e[5]]] = true end
  else
    local d = e[5]
    if d and DIRKEY[d] then set[DIRKEY[d]] = true end
  end
  want(set)
end)
emu:loadStateFile(PV_LOAD or "/tmp/rom-postrival.ss", 31)
console:log("parcel armed")
