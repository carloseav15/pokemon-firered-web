-- Locate the global ScriptContext (script.c sGlobalScriptContext) in IWRAM/EWRAM without symbols. The struct is
--   u8 stackDepth; u8 mode; u8 comparisonResult; bool8 (*nativePtr)(void) @+4; const u8 *scriptPtr @+8;
--   const u8 *stack[20] @+0xC; ScrCmdFunc *cmdTable @+0x5C; ScrCmdFunc *cmdTableEnd @+0x60; u32 data[4] @+0x64
-- so it is the 4-aligned block whose +0x5C/+0x60 are ROM pointers a whole command table (213 commands) apart.
-- Globals: CTX_STATES (list of state files to report mode/scriptPtr for), CTX_OUT.
local out = io.open(CTX_OUT or "/tmp/rom-ctxscan.txt", "w")
local function inRom(v) return v >= 0x08000000 and v < 0x0A000000 end
local function find()
  local hits = {}
  for _, space in ipairs({ { emu.memory.iwram, 0x03000000, 0x8000 }, { emu.memory.wram, 0x02000000, 0x40000 } }) do
    local mem, base, size = space[1], space[2], space[3]
    for a = 0, size - 0x74, 4 do
      local t, e = mem:read32(a + 0x5C), mem:read32(a + 0x60)
      if inRom(t) and e > t and (e - t) % 4 == 0 and (e - t) // 4 >= 150 and (e - t) // 4 <= 260 then
        hits[#hits + 1] = { mem = mem, addr = base + a, off = a, count = (e - t) // 4 }
      end
    end
  end
  return hits
end
local hits
for i, path in ipairs(CTX_STATES) do
  emu:loadStateFile(path, 31)
  hits = hits or find()
  for _, h in ipairs(hits) do
    out:write(string.format("%s ctx=0x%08x cmds=%d stackDepth=%d mode=%d cmp=%d native=%08x scriptPtr=%08x\n", path, h.addr, h.count,
      h.mem:read8(h.off), h.mem:read8(h.off + 1), h.mem:read8(h.off + 2), h.mem:read32(h.off + 4), h.mem:read32(h.off + 8)))
  end
end
out:write("DONE\n")
out:close()
