-- ROM side of the Route 1 -> Viridian City -> Poke Mart (Oak's Parcel) comparison. It replays the port's tile trace
-- (tools/rom-compare/port-parcel.mjs writes /tmp/port-parcel-trace.lua: PARCEL_TRACE = { {g,n,x,y,dir,script}, ... })
-- and dumps flags/vars at every map change and at the end (the parcel scene var reaches 1 and 600 frames pass).
-- Globals: PV_ENDMAP/PV_ENDTAG (second milestone: map {group,num} and the dump tag, default "route2"), PV_LOAD (state file), PV_OUT (report), PV_MAXF (frame cap), PARCEL_TRACE (set by dofile of the trace).
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
local MART_SCENE = 0x4057   -- VAR_MAP_SCENE_VIRIDIAN_CITY_MART
local ENDVAR, ENDVAL = PV_ENDVAR or MART_SCENE, PV_ENDVAL or 1   -- the run ends 600 frames after ENDVAR == ENDVAL
local mapCount, parcelAt = {}, nil
local lastIdx, idxFrames = 0, 0
local endDumped, mapAt = false, nil
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
  -- bagPocket_KeyItems (+0x3B8, 30 slots) and bagPocket_PokeBalls (+0x430, 13 slots): u16 item id, u16 quantity ^ key
  out:write("BAG ", tag, " ", hex(b + 0x3B8, 172), "\n")
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
  if PV_SAVES and PV_SAVES[n] then emu:saveStateFile(PV_SAVES[n], 31) out:write("SAVED " .. PV_SAVES[n] .. " f=" .. n .. "\n") end
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
    if lastMap then
      mapCount[mapKey] = (mapCount[mapKey] or 0) + 1
      dump(string.format("map:%d,%d#%d", g, m, mapCount[mapKey]), n)
    end
    lastMap = mapKey
  end
  -- Position on the trace: the first entry at or after idx that matches (a script can skip entries); if none does,
  -- the nearest one behind (the trace revisits tiles, e.g. (4,4) before and after the counter).
  local found
  for k = idx, math.min(#TR, idx + 6) do
    if same(TR[k], g, m, x, y) then found = k break end
  end
  if not found then
    for k = idx - 1, math.max(1, idx - 8), -1 do
      if same(TR[k], g, m, x, y) then found = k break end
    end
  end
  if found then idx = found end
  if idx ~= lastIdx then lastIdx, idxFrames = idx, 0 else idxFrames = idxFrames + 1 end
  local e, nx = TR[idx], TR[idx + 1]
  local set = {}
  local burst = (n % 50) < 30
  local tapA = (n % 20) < 3
  if n % 300 == 0 then out:write(string.format("T f=%d idx=%d/%d pos=%d,%d map=%d,%d scene=%d mode=%d dir=%s\n", n, idx, #TR, x, y, g, m, var(MART_SCENE), I:read8(0x03000EB1 - 0x03000000), tostring(TR[idx] and TR[idx][5]))) end
  -- the parcel script ends by setting the lab scene var to 5: dump 120 frames later, like the port's settled state
  if var(0x4055) == 5 and not parcelAt then parcelAt = n end
  if parcelAt and n - parcelAt == 120 then dump("parcel", n) end
  -- Milestone dumps: "end" = ENDVAR == ENDVAL for 600 frames (the port's settled state); with PV_ENDMAP = {group, num}
  -- the run continues and finishes 600 frames after the player is free on that map ("route2"); without it "end"
  -- finishes the run.
  if var(ENDVAR) == ENDVAL and not doneAt then doneAt = n end
  if doneAt and doneAt > 0 and not endDumped and n - doneAt >= 600 then
    endDumped = true
    dump("end", n)
    if not PV_ENDMAP then out:write("DONE\n") out:close() doneAt = -1 return end
  end
  if PV_ENDMAP and g == PV_ENDMAP[1] and m == PV_ENDMAP[2] and I:read8(0x03000EB1 - 0x03000000) == 0 then
    mapAt = mapAt or n
    if n - mapAt >= 600 then dump(PV_ENDTAG or "route2", n) out:write("DONE\n") out:close() doneAt = -1 return end
  end
  -- sGlobalScriptContext.mode (IWRAM 0x03000EB0 + 1, located with scanctx.lua by its command-table pointers):
  -- 0 = no script, 1 = bytecode, 2 = native wait (text box, movement, ...). A is tapped only while a script runs
  -- (text boxes close, scenes advance); on a free field only the port's direction is held, so A never re-opens a
  -- conversation with the NPC in front.
  local mode = I:read8(0x03000EB1 - 0x03000000)
  -- Gate (PARCEL_GATES[idx] = {var, value}): the port waited on this tile until the scene variable had that value;
  -- the ROM talks/taps here until it does, whatever the frame budget, instead of walking on with the scene unfinished.
  local gate = PARCEL_GATES and PARCEL_GATES[idx]
  local gated = gate and var(gate[1]) ~= gate[2]
  if mode ~= 0 then
    if tapA then set[KEY.A] = true end
  elseif gated then
    if tapA then set[KEY.A] = true end
  elseif nx and e and e[5] and DIRKEY[e[5]] then
    set[DIRKEY[e[5]]] = true
  elseif not nx and var(ENDVAR) ~= ENDVAL then
    -- end of the trace: the port faced the last NPC and talked to it, so talk (one tap every 20 frames) until the
    -- end variable is set; the script that starts then keeps mode ~= 0 and the branch above takes over
    if tapA then set[KEY.A] = true end
  end
  want(set)
end)
emu:loadStateFile(PV_LOAD or "/tmp/rom-postrival.ss", 31)
console:log("parcel armed")
