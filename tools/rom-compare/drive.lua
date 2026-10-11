-- Phase 4 driver: reset, press keys at ABSOLUTE ROM frames (the ROM is deterministic from reset),
-- save screenshots and a state line. Globals: DRIVE_KEYS = { [frame]="A", ... }, DRIVE_SHOTS = { frames },
-- DRIVE_LAST, DRIVE_OUT (state file), DRIVE_SHOT_DIR (ends with "/").
local KEY = { A = 0, B = 1, SELECT = 2, START = 3, RIGHT = 4, LEFT = 5, UP = 6, DOWN = 7 }
local KEYS, SHOTS = DRIVE_KEYS or {}, DRIVE_SHOTS or {}
local LAST, DIR = DRIVE_LAST or 4000, DRIVE_SHOT_DIR or "/tmp/rom-shots/"
local out = io.open(DRIVE_OUT or "/tmp/rom-drive.txt", "w")
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
end
if _G.drive_cb then callbacks:remove(_G.drive_cb) end
local n, held = -1, {}
local shotset = {}
for _, f in ipairs(SHOTS) do shotset[f] = true end
_G.drive_cb = callbacks:add("frame", function()
  n = n + 1
  if n > LAST then return end
  local k = KEYS[n]
  if k then emu:addKey(KEY[k]); held[n + 3] = KEY[k] end
  if held[n] then emu:clearKey(held[n]); held[n] = nil end
  local iw = emu.memory.iwram
  out:write(string.format("%d %08x %08x\n", n, iw:read32(0x5000), iw:read32(0x30F4)))
  if DUMP[n] then dump(n) end
  if shotset[n] then emu:screenshot(string.format("%s%05d.png", DIR, n)) end
  if n == LAST then out:close(); console:log("drive done") end
end)
emu:reset()
console:log("drive armed")
