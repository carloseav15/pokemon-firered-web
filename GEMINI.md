@AGENTS.md

## Particularidades de Gemini

- Sigue AGENTS.md: una tanda es un archivo C completo (o una familia completa) de la
  meta principal; enlace e inalámbrico quedan fuera salvo indicación del usuario.
- Lee PORTING-STATUS.md y solo las filas relevantes de PENDING.md; consulta
  `docs/PORTING-GUIDE.md` por secciones cuando lo necesites.
- Resuelve el decomp como `tools/decomp/common.py`; no lo modifiques.
- Commits de tanda solo con código; inventario, pending y PORTING-STATUS.md se
  actualizan una vez por sesión en un commit de estado.
- Usa lecturas por rangos en módulos grandes. Indica Gemini en `Co-Authored-By`
  (`Co-Authored-By: Gemini <noreply@google.com>`).
