-- Find boolean-looking bytes that separate "field controls free" from "script/text box active" in IWRAM and EWRAM:
-- STATES_FREE / STATES_LOCKED are lists of save-state files; a candidate has the same value in every FREE state, the
-- same (different) value in every LOCKED state. The report goes to DIFF_OUT.
local out = io.open(DIFF_OUT or "/tmp/rom-lockscan.txt", "w")
local function grab(path)
  emu:loadStateFile(path, 31)
  local t = {}
  for a = 0, 0x7FFF do t["i" .. a] = emu.memory.iwram:read8(a) end
  for a = 0, 0x3FFFF do t["w" .. a] = emu.memory.wram:read8(a) end
  return t
end
local free, locked = {}, {}
for _, p in ipairs(STATES_FREE) do free[#free + 1] = grab(p) end
for _, p in ipairs(STATES_LOCKED) do locked[#locked + 1] = grab(p) end
local n = 0
for k, v in pairs(free[1]) do
  local ok = true
  for i = 2, #free do if free[i][k] ~= v then ok = false break end end
  if ok then
    local lv = locked[1][k]
    if lv ~= v then
      for i = 2, #locked do if locked[i][k] ~= lv then ok = false break end end
      if ok and (v <= 1 and lv <= 1) then
        n = n + 1
        local space, addr = k:sub(1, 1), tonumber(k:sub(2))
        out:write(string.format("CAND %s 0x%08x free=%d locked=%d\n", space, (space == "i" and 0x03000000 or 0x02000000) + addr, v, lv))
      end
    end
  end
end
out:write("DONE " .. n .. "\n")
out:close()
