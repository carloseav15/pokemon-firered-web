@AGENTS.md

## Particularidades de Claude Code

- Sigue el modo por tandas de AGENTS.md; lee PORTING-STATUS.md y solo los pendientes
  relevantes. El archivo histórico y la guía técnica se consultan bajo demanda.
- Resuelve el decomp como `tools/decomp/common.py`; no lo modifiques.
- Si necesitas navegador, usa `preview_start` con `vite` (`.claude/launch.json`)
  para el servidor. No es un paso rutinario durante el portado.
- Usa lecturas por rangos en módulos grandes. Indica Claude en `Co-Authored-By`.
