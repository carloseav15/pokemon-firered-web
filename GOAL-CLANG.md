# Prompt para un goal: piloto Clang → TypeScript

Este mensaje prepara un goal futuro; documentarlo no inicia su ejecución.
Modelo inicial recomendado: Opus o Astra para el diseño y revisión semántica.
Se puede usar Sonnet o Sol para implementar bloques ya delimitados.

## Mensaje para copiar

Establece como goal evaluar e implementar, si la muestra demuestra viabilidad,
un piloto reproducible de generación C → TypeScript basado en el AST de Clang
para este port de Pokémon FireRed. El objetivo es reducir el trabajo total de
traducción e integración manteniendo el comportamiento del decomp. Conserva
TypeScript como salida; no sustituyas el motor por WebAssembly.

Lee AGENTS.md y ESTADO-Y-REGLAS.md, especialmente §7.8. Inspecciona el estado
actual y el exportador antes de cambiar código. Respeta trabajo concurrente,
el decomp original y las salidas generadas. Trabaja en bloques pequeños.

1. Reutiliza la resolución del decomp y configuración de tools/decomp/common.py.
   Registra revisión del C, versión de Clang, target, defines e includes.
   Verifica semántica de enteros y ABI de GBA; no asumas que macOS tiene el
   mismo layout. Usa el AST de Clang para analizar los cuerpos, no regex.
2. Analiza al menos tres archivos pendientes seleccionados por patrones y
   dependencias, no solo por porcentaje de nombres. Busca equivalencias TS
   existentes y presenta funciones candidatas, bloqueadas y no soportadas,
   con motivos y alcance exacto. No cuentes fallos de parsing como cobertura.
3. Si existe una familia viable, implementa un generador acotado en tools/decomp/
   que emita funciones completas y deterministas. Conserva nombres, tipos
   efectivos, estados, callbacks y temporización. Reutiliza hardware y datos
   existentes. No construyas un compilador universal ni reescribas lo ya fiel.
4. Rechaza explícitamente operaciones o dependencias no soportadas, identificando
   archivo y función. No inventes retornos, constantes, datos ni efectos.
   Conserva la procedencia C → TS y una separación clara entre código generado
   y manual; corrige las reglas del generador en vez de parchear su salida.
5. Integra al menos un bloque generado en un flujo real del juego. Valídalo
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
