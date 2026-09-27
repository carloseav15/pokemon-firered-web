# Procedimiento para ampliar el generador Clang → TypeScript

El piloto inicial ya está integrado: `clang_ast.py`, `clang_analyze.py`,
`clang_codegen.py` y `src/fr/generated/stringUtil.ts`; el comparador
`check:string-util` prueba 235 observaciones contra C. Usa este procedimiento
para seleccionar y portar la siguiente familia. No reconstruyas el piloto ni
supongas que el emisor actual admite una familia nueva.

Primera extensión posterior: `generate:cdata-table-accessors` genera
`FacilityClassToPicIndex` desde `pokemon.c`; `check:cdata-table-accessors`
verifica regeneración determinista, rechazo de una forma AST no soportada,
los 150 elementos de la tabla exportada y su caller activo. La familia aún es
una sola función y no demuestra ahorro neto. Sigue seleccionando las siguientes
funciones por AST, caller y dependencias reales.

## Mensaje para copiar

Continúa ampliando el port fuente-fiel de Pokémon FireRed. Selecciona funciones
pendientes mediante el AST de Clang, callers C/scripts y dependencias del motor
activo; implementa el siguiente bloque coherente en TypeScript y mide si la
generación ahorra trabajo total. Conserva TypeScript como salida; no sustituyas
el motor por WebAssembly.

Lee AGENTS.md y ESTADO-Y-REGLAS.md, especialmente §7.8 y la última entrada de
PORTING-STATUS.md. Inspecciona el estado actual, el analizador de símbolos TS y
el exportador antes de cambiar código. Respeta el decomp original y las salidas
generadas. Trabaja en bloques coherentes.

1. Reutiliza la resolución del decomp y configuración de tools/decomp/common.py.
   Registra revisión del C, versión de Clang, target, defines e includes.
   Verifica semántica de enteros y ABI de GBA; no asumas que macOS tiene el
   mismo layout. Usa el AST de Clang para analizar los cuerpos, no regex.
2. Analiza al menos tres archivos pendientes seleccionados por patrones y
   dependencias, no solo por porcentaje de nombres. Usa el AST de TypeScript
   para localizar declaraciones, arrows, callbacks de objetos y aliases; una
   mención del nombre en TS no prueba que haya cuerpo real. Presenta funciones
   candidatas, ya implementadas, bloqueadas y no soportadas, con motivos y
   alcance exacto. No cuentes fallos de parsing como cobertura.
3. Si existe una familia viable, implementa un generador acotado en tools/decomp/
   que emita funciones completas y deterministas. Conserva nombres, tipos
   efectivos, estados, callbacks y temporización. Reutiliza hardware y datos
   existentes. No construyas un compilador universal ni reescribas lo ya fiel.
4. Rechaza explícitamente operaciones o dependencias no soportadas, identificando
   archivo y función. No inventes retornos, constantes, datos ni efectos.
   Conserva la procedencia C → TS y una separación clara entre código generado
   y manual; corrige las reglas del generador en vez de parchear su salida.
5. Integra el bloque adaptado o generado en un flujo real del juego. Valídalo
   contra el C con entradas comunes y casos límite relevantes; justifica los
   supuestos de un harness de host. Comprueba regeneración determinista y rechazo
   de un caso no soportado. Ejecuta tipos, honesty, build y checks focalizados;
   prueba en navegador cuando se modifique una pantalla o flujo observable.
6. Registra tiempo de preparación, generación, revisión, integración y reparación,
   cobertura real y limitaciones. Actualiza PORTING-STATUS.md, inventory y pending.
   Haz commits locales por bloque conforme a AGENTS.md; no hagas push.

Termina con herramientas y comandos reproducibles, evidencia del bloque generado
e integrado, y una decisión razonada sobre qué familia ampliar después. No
declares aceleración demostrada sin una comparación de alcance equivalente.

Si la muestra no contiene ninguna familia viable, el resultado aceptable del
goal es un informe reproducible de los impedimentos y del alcance analizado,
con una recomendación concreta; no un generador ficticio ni código aproximado.
No extrapoles esa conclusión a todo el decomp sin evidencia. Continúa las tareas
autorizadas sin pedir confirmación para decisiones rutinarias.
