@AGENTS.md

## Particularidades de Claude Code

- Sigue AGENTS.md: una tanda es un archivo C completo (o una familia completa) de la
  meta principal; lee PORTING-STATUS.md y solo los pendientes relevantes. La guía
  técnica se consulta bajo demanda.
- Resuelve el decomp como `tools/decomp/common.py`; no lo modifiques.
- Si necesitas navegador, usa `preview_start` con `vite` (`.claude/launch.json`)
  para el servidor. No es un paso rutinario durante el portado.
- Commits de tanda solo con código; estado (inventario, pending, KNOWN_GAPS y
  PORTING-STATUS.md) una vez al final de la sesión. Reporta aparte funciones
  nuevas y equivalencias/wrappers, y no borres entradas de validación diferida.
- Usa lecturas por rangos en módulos grandes. Indica Claude en `Co-Authored-By`.
