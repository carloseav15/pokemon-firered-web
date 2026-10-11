-- Phase 4 driver: reset, press keys at ABSOLUTE ROM frames (the ROM is deterministic from reset),
-- save screenshots and a state line. Globals: DRIVE_KEYS = { [frame]="A", ... }, DRIVE_SHOTS = { frames },
-- DRIVE_LAST, DRIVE_OUT (state file), DRIVE_SHOT_DIR (ends with "/").
local KEY = { A = 0, B = 1, SELECT = 2, START = 3, RIGHT = 4, LEFT = 5, UP = 6, DOWN = 7 }
local KEYS, SHOTS = DRIVE_KEYS or {}, DRIVE_SHOTS or {}
local LAST, DIR = DRIVE_LAST or 4000, DRIVE_SHOT_DIR or "/tmp/rom-shots/"
local out = io.open(DRIVE_OUT or "/tmp/rom-drive.txt", "w")
local SAVE_AT, SAVE_PATH = DRIVE_SAVE_AT, DRIVE_SAVE_PATH   -- frame (since reset/load) -> save state file
local LOAD_PATH = DRIVE_LOAD                               -- start from a state file instead of reset
local DUMP = {}
for _, f in ipairs(DRIVE_DUMP or {}) do DUMP[f] = true end
-- gSaveBlock1Ptr 0x03005008, gSaveBlock2Ptr 0x0300500C (tools/rom-compare/addresses.json)
local function sb(ptrAddr) return emu.memory.iwram:read32(ptrAddr - 0x03000000) - 0x02000000 end
local function dump(n)
  local w, b1, b2 = emu.memory.wram, sb(0x03005008), sb(0x0300500C)
  local name = {}
  for i = 0, 7 do name[#name + 1] = string.format("%02x", w:read8(b2 + i)) end
  out:write(string.format("DUMP %d pos=%d,%d map=%d,%d warp=%d,%d,%d name=%s gender=%d trainer=%04x%04x rng=%08x\n", n,
    w:read16(b1), w:read16(b1 + 2), w:read8(b1 + 4), w:read8(b1 + 5), w:read8(b1 + 6),
    w:read16(b1 + 8), w:read16(b1 + 10), table.concat(name), w:read8(b2 + 8),
    w:read16(b2 + 0xC), w:read16(b2 + 0xA), emu.memory.iwram:read32(0x5000)))
  -- flags (SaveBlock1+0xEE0, 288 B), vars (+0x1000, 512 B), money (+0x290, XOR encryptionKey at SaveBlock2+0xF1C),
  -- party count 0x02024029 and gPlayerParty[0] 0x02024284 (100 B) -- offsets from clang record layouts.
  local function hex(off, len)
    local t = {}
    for i = 0, len - 1 do t[#t + 1] = string.format("%02x", w:read8(off + i)) end
    return table.concat(t)
  end
  out:write("FLAGS ", n, " ", hex(b1 + 0xEE0, 288), "\n")
  out:write("VARS ", n, " ", hex(b1 + 0x1000, 512), "\n")
  out:write(string.format("MONEY %d %08x key=%08x\n", n, w:read32(b1 + 0x290), w:read32(b2 + 0xF1C)))
  out:write(string.format("PARTY %d count=%d mon0=%s\n", n, w:read8(0x02024029 - 0x02000000), hex(0x02024284 - 0x02000000, 100)))
end
if _G.drive_cb then callbacks:remove(_G.drive_cb) end
local n, held = -1, {}
local shotset = {}
for _, f in ipairs(SHOTS) do shotset[f] = true end
_G.drive_cb = callbacks:add("frame", function()
  n = n + 1
  if n > LAST then return end
  local k = KEYS[n]
  if k then
    -- "RIGHT:48" holds the key for 48 frames; plain "A" is a 3-frame tap
    local name, dur = k:match("^(%a+):(%d+)$")
    name, dur = name or k, tonumber(dur) or 3
    emu:addKey(KEY[name]); held[n + dur] = held[n + dur] or {}
    table.insert(held[n + dur], KEY[name])
  end
  if held[n] then for _, key in ipairs(held[n]) do emu:clearKey(key) end held[n] = nil end
  local iw = emu.memory.iwram
  out:write(string.format("%d %08x %08x\n", n, iw:read32(0x5000), iw:read32(0x30F4)))
  if DUMP[n] then dump(n) end
  if SAVE_AT and n == SAVE_AT then emu:saveStateFile(SAVE_PATH, 31); out:write("SAVED ", SAVE_PATH, "\n") end
  if shotset[n] then emu:screenshot(string.format("%s%05d.png", DIR, n)) end
  if n == LAST then out:close(); console:log("drive done") end
end)
if LOAD_PATH then emu:loadStateFile(LOAD_PATH, 31) else emu:reset() end
console:log("drive armed")
