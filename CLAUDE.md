@AGENTS.md

## Notas específicas para Claude Code

- Lee `AGENTS.md` (arriba), `ESTADO-Y-REGLAS.md` (reglas obligatorias) y la sección "Pendiente" de `PORTING-STATUS.md` antes de empezar.
- Decomp de referencia: `../pokefirered` (directorio de trabajo adicional). Léelo con Read/grep; no lo modifiques.
- Servidor de desarrollo: `preview_start` con el nombre `vite` (`.claude/launch.json`). No uses Bash para servidores.
- Archivos grandes del port (`partyMenu.ts`, `bagMenu.ts`, `battle/*`) superan el límite de lectura: usa `offset`/`limit` o `grep -n`.
- Para portar un `.c` grande, lee el C completo y su header; divide la entrega en grupos coherentes de funciones con dependencias resueltas, conservando el orden del C. Integra y verifica cada bloque según ESTADO-Y-REGLAS.md §7.
