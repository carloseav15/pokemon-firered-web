-- ROM side of the rival-battle comparison (docs/ROM-COMPARACION-VIABILIDAD.md, phase 6).
-- From a state in Oak's lab with the Oak scene finished and no starter (/tmp/rom-free.ss) it chooses the first ball,
-- walks to the lab exit and fights the rival, pressing A (FIGHT, first move) in battle. Synchronized by EVENTS, not by
-- frame count: starter chosen (VAR_MAP_SCENE_..._OAKS_LAB == 3), battle start (gMain.inBattle), battle end (var == 4).
-- Globals: RV_LOAD (state file), RV_OUT (report), RV_MAXF (frame cap), RV_RNG (optional gRngValue written at battle
-- start, to make RNG-dependent results comparable), RV_RNG_TURN (also write it each time FIGHT is first selectable is
-- not detectable from memory, so only the battle-start injection is supported).
-- Addresses: tools/rom-compare/addresses.json (gRngValue 0x03005000, gMain 0x030030F0 (+0x439 bit1 = inBattle),
-- gSaveBlock1Ptr 0x03005008, gPlayerParty 0x02024284, gEnemyParty 0x0202402C = gPlayerParty - 6*0x64).
local KEY = { A = 0, B = 1, SELECT = 2, START = 3, RIGHT = 4, LEFT = 5, UP = 6, DOWN = 7 }
local W, I = emu.memory.wram, emu.memory.iwram
local out = io.open(RV_OUT or "/tmp/rom-rival.txt", "w")
out:setvbuf("no")   -- the report must be readable while the emulator is still running
local MAXF = RV_MAXF or 40000
local function sb() return I:read32(0x03005008 - 0x03000000) - 0x02000000 end
local function pos() local b = sb(); return W:read16(b), W:read16(b + 2) end
local function map() local b = sb(); return W:read8(b + 4), W:read8(b + 5) end
local function var(id) return W:read16(sb() + 0x1000 + (id - 0x4000) * 2) end
local function hex(off, len) local t = {} for i = 0, len - 1 do t[#t + 1] = string.format("%02x", W:read8(off + i)) end return table.concat(t) end
local function inBattle() return (I:read8(0x30F0 + 0x439) & 2) ~= 0 end
local SCENE = 0x4055
local function dump(tag, n)
  local b = sb()
  local x, y = pos()
  local mg, mn = map()
  out:write(string.format("DUMP %s f=%d pos=%d,%d map=%d,%d scene=%d rng=%08x\n", tag, n, x, y, mg, mn, var(SCENE), I:read32(0x5000)))
  out:write("FLAGS ", tag, " ", hex(b + 0xEE0, 288), "\n")
  out:write("VARS ", tag, " ", hex(b + 0x1000, 512), "\n")
  out:write(string.format("MONEY %s %08x\n", tag, W:read32(b + 0x290)))
  out:write(string.format("PARTY %s count=%d mon0=%s\n", tag, W:read8(0x02024029 - 0x02000000), hex(0x02024284 - 0x02000000, 100)))
  out:write(string.format("ENEMY %s mon0=%s\n", tag, hex(0x0202402C - 0x02000000, 100)))
  out:flush()
end
if _G.rv_cb then callbacks:remove(_G.rv_cb) end
local n, held = -1, {}
local phase, phaseAt, wasBattle, battles, doneAt = "dismiss", 0, false, 0, nil
local function want(set)
  for _, k in pairs(KEY) do
    local w = set[k] == true
    if w and not held[k] then emu:addKey(k) held[k] = true
    elseif not w and held[k] then emu:clearKey(k) held[k] = nil end
  end
end
_G.rv_cb = callbacks:add("frame", function()
  n = n + 1
  if n > MAXF or phase == "done" then if phase ~= "done" then dump("timeout", n) out:close() phase = "done" end return end
  local x, y = pos()
  local set = {}
  local tapA = (n % 20) < 3
  if n % 300 == 0 then
    local mg, mn = map()
    out:write(string.format("T f=%d phase=%s pos=%d,%d map=%d,%d scene=%d party=%d battle=%s\n", n, phase, x, y, mg, mn, var(SCENE), W:read8(0x02024029 - 0x02000000), tostring(inBattle())))
  end
  -- Battle events are phase-independent.
  local b = inBattle()
  if b and not wasBattle then
    battles = battles + 1
    if RV_RNG and battles == 1 then I:write32(0x5000, RV_RNG) end
    dump("battle-start", n)
    if battles == 1 then phase = "battle" end
  elseif wasBattle and not b then
    dump("battle-end", n)
    phase, phaseAt = "after", n
  end
  wasBattle = b
  if phase == "dismiss" then
    -- The saved state still holds Oak's text box. Only A (no direction held: a held DOWN kept the box open).
    if tapA then set[KEY.A] = true end
    if n >= 240 then phase, phaseAt = "ball", n end
  elseif phase == "ball" then
    if y < 5 then set[KEY.DOWN] = true
    elseif x < 8 then set[KEY.RIGHT] = true
    else phase, phaseAt = "face", n end
  elseif phase == "face" then
    if n - phaseAt >= 30 and n - phaseAt < 38 then set[KEY.UP] = true end
    if n - phaseAt >= 40 then phase, phaseAt = "choose", n end
  elseif phase == "choose" then
    if tapA then set[KEY.A] = true end
    if var(SCENE) == 3 then dump("starter-chosen", n) phase, phaseAt = "afterpick", n end
  elseif phase == "afterpick" then
    if tapA then set[KEY.A] = true end
    if n - phaseAt >= 900 then dump("afterpick", n) phase, phaseAt = "walk", n end
  elseif phase == "walk" then
    -- Rival trigger tiles are (5..7, 8): go to x=6, then down.
    if x > 6 then set[KEY.LEFT] = true elseif x < 6 then set[KEY.RIGHT] = true else set[KEY.DOWN] = true end
    if tapA then set[KEY.A] = true end
  elseif phase == "battle" then
    if tapA then set[KEY.A] = true end
  elseif phase == "after" then
    if tapA then set[KEY.A] = true end
    if var(SCENE) == 4 and not doneAt then doneAt = n end
    if doneAt and n - doneAt >= 900 then dump("final", n) out:write("DONE\n") out:close() phase = "done" end
  end
  want(set)
end)
emu:loadStateFile(RV_LOAD or "/tmp/rom-free.ss", 31)
console:log("rival armed")
