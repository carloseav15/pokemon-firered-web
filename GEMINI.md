@AGENTS.md

## Particularidades de Gemini

- Sigue AGENTS.md: una tanda es un archivo C completo (o una familia completa) de la
  meta principal; enlace e inalámbrico quedan fuera salvo indicación del usuario.
- Lee PORTING-STATUS.md y solo las filas relevantes de PENDING.md; consulta
  `docs/PORTING-GUIDE.md` por secciones cuando lo necesites.
- Resuelve el decomp como `tools/decomp/common.py`; no lo modifiques.
- Commits de tanda solo con código; nunca un commit "Update … status" por tanda.
  Inventario, pending, KNOWN_GAPS y PORTING-STATUS.md se actualizan una vez al
  final de la sesión en un único commit de estado.
- Si el archivo no cabe entero, toma la familia completa más grande posible; no
  agrupes 3–10 funciones sueltas por commit.
- Reporta aparte funciones nuevas y equivalencias/wrappers, súmalas al acumulado
  de PORTING-STATUS.md y no borres entradas de `TAREAS-FINALES.md` sin resolverlas.
- Usa lecturas por rangos en módulos grandes. Indica Gemini en `Co-Authored-By`
  (`Co-Authored-By: Gemini <noreply@google.com>`).
