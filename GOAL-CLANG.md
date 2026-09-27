# Continuar el portado por tandas

El generador Clang existente admite familias acotadas; no reconstruir el piloto.
Las reglas, frecuencia de checks y documentación están únicamente en AGENTS.md.

## Mensaje para copiar

Continúa portando Pokémon FireRed C → TypeScript con el modo por tandas de
AGENTS.md. Lee el estado operativo de PORTING-STATUS.md y los huecos relevantes
de PENDING.md. Conserva el alcance completo y el runtime TypeScript.

Selecciona un grupo coherente de funciones pendientes con dependencias resueltas,
priorizando comportamiento nuevo conectado al juego. Identifica equivalencias
existentes sin presentarlas como nueva implementación. Reutiliza Clang para las
familias soportadas; amplía una regla si desbloquea un grupo y traduce manualmente
los casos aislados. No conviertas cada helper en un proyecto de generador y pruebas.

Lee los cuerpos C completos de la tanda y sus dependencias, conserva semántica GBA
y datos exportados, e integra los callers reales. Aplica los checks mínimos y las
excepciones críticas de AGENTS.md una vez por tanda. Aplaza recorridos, capturas
y revisión visual; registra la validación pendiente sin declarar fidelidad probada.

Cierra una tanda revisable con inventario, pendientes, un resumen operativo breve
y commit local. Continúa con la siguiente tanda viable mientras quede trabajo
dentro de la sesión autorizada; no cierres el turno tras un helper trivial.
No hagas push. Informa qué comportamiento se añadió, qué era equivalente, el
cambio del contador y las comprobaciones realmente ejecutadas.
