# FireRed C → TypeScript: reglas de trabajo

Modo vigente desde 2026-09-27: **portado por archivo completo, revisión funcional
exhaustiva posterior**, autorizado por el usuario para reducir pruebas y
documentación repetitivas. Estas reglas sustituyen el procedimiento anterior.
Responde en español.

## Lectura inicial

- Lee este archivo y [PORTING-STATUS.md](PORTING-STATUS.md), y comprueba `git status`.
- Consulta las filas relevantes de [PENDING.md](PENDING.md) y el código de la tanda.
- [Referencia técnica](docs/PORTING-GUIDE.md): mapa, datos, semántica C y driver;
  lee únicamente la sección necesaria. No releas el historial al iniciar una tarea.
- `PLAN-RECORRIDO.md` se reserva para la revisión. El proceso anterior está solo
  en el historial de Git; no lo recuperes como guía.

## Objetivo y selección

**Meta principal:** portar e integrar el juego de un jugador completo. Enlace,
inalámbrico, Mystery Gift, e-Reader y minijuegos multijugador (tabla `LINK` de
`tools/portInventory.py`) quedan fuera de la meta principal por decisión del
usuario (2026-09-27): se cuentan aparte y se portan después. No muevas otros
archivos a esa tabla ni a `COVERED` para subir la cifra sin indicación del usuario.
El inventario mide nombres, no fidelidad.

1. **Una tanda = un archivo C completo** (o, si es muy grande, una familia completa
   del archivo, p. ej. todos los `MovementAction_*`). Prioriza los archivos de la
   meta principal con más funciones faltantes y dependencias resueltas. No cierres
   tandas de una o dos funciones cuando el resto del archivo está desbloqueado.
2. Localiza primero equivalencias TS: comportamiento que ya existe con otro nombre
   o estructura (p. ej. la tabla de comandos de `script/commands.ts` frente a los
   `ScrCmd_*` de `scrcmd.c`). Reestructúralo con el nombre y la forma del C,
   revisando cada función contra el C; es trabajo válido, pero se reporta aparte
   como **equivalencia**, no como implementación nueva.
3. Lee completas las funciones C seleccionadas, headers/tipos, globals, tablas y
   callers C/TS/scripts relevantes. Lee el archivo entero cuando sus dependencias
   lo exijan; no repitas esa lectura por cada helper.
4. Resuelve dependencias antes de sus consumidores. Si una tanda está bloqueada,
   registra el motivo en una línea y sigue con otra viable, sin inventar retornos.
5. Integra antes de cerrar: un import aislado no demuestra que el juego llame al
   código. No acumules módulos desconectados para rellenar el inventario.

## Clang y fidelidad

- Reutiliza `tools/decomp/clang_ast.py`, `clang_analyze.py`, `clang_codegen.py` y
  `common.py`. Clang analiza C; nuestro generador emite TS. Conserva este runtime.
- Usa las familias soportadas en lote. Amplía el generador cuando la misma regla
  desbloquee un grupo real; para casos aislados prefiere traducción manual fiel.
  No es obligatorio ampliar Clang ni analizar tres archivos en cada tanda.
- Conserva nombres C, estados, callbacks, frames, anchos/signo, división entera,
  alias y layout GBA. No supongas que el ABI de macOS coincide con GBA.
- Los datos salen del decomp. No edites `src/fr/generated/` ni `public/fr/` a mano:
  modifica `tools/decomp/` y regenera. Usa `C.NOMBRE` para constantes literales.
- El generador rechaza patrones no soportados con archivo, función y motivo.
  No emitas stubs ni aproximaciones para hacer compilar. Conserva procedencia y
  parámetros de generación en el código o artefacto, sin repetirlos en crónicas.
- Al cambiar una API compartida, revisa todos sus consumidores. Elimina el camino
  sustituido cuando el nuevo esté conectado; marca cualquier validación pendiente.
- Retira la etiqueta de adaptador solo si la UI simplificada fue sustituida en la
  ruta activa; deja la pantalla en la cola de validación hasta revisarla.

## Verificación durante el portado

Una tanda es una unidad integrada y revisable, no cada función o edición.

- Al cerrar una tanda de código: `npm run check:port`, `npm run check:honesty`,
  `npm run build` y `git diff --check`. Repite solo lo afectado por cambios posteriores.
- Las correcciones de fidelidad menores detectadas fuera de la tanda (anchos,
  orden de callbacks, etc.) se anotan en una línea en `PORTING-STATUS.md` y se
  resuelven en la revisión, salvo que rompan algo que la tanda necesita.
- Comprueba los cdata/INCBIN nuevos que se usan. Ejecuta el check focalizado existente
  si cubre una regla modificada; no ejecutes todas las suites por rutina.
- Una regla nueva/modificada del generador necesita comparación focalizada con C,
  semántica de target justificada, regeneración determinista y rechazo de casos
  no soportados. Reutiliza el harness; no crees uno por cada getter emitido.
- Cambios críticos en memoria, guardado, scheduler o APIs compartidas necesitan una
  comprobación focalizada antes de construir más código sobre ellos.
- No crees pruebas que solo repitan la implementación. Nunca prepares el resultado
  que luego afirmas verificar; identifica las ayudas legítimas con `PREPARED`.
- Navegador, capturas y recorridos quedan para revisión posterior, salvo petición
  del usuario o diagnóstico de un fallo concreto. No son requisito por pantalla
  durante esta fase. Anota de forma compacta qué quedó sin validar.
- No ignores una regresión conocida que invalida las dependencias de la siguiente
  tanda. Corrígela o continúa por una ruta independiente.
- Cambios exclusivamente documentales: revisar coherencia, enlaces y diff; no
  necesitan tipos, build, inventario ni pruebas de juego. `check:honesty` sigue
  siendo obligatorio antes de cualquier commit; no amplíes sus baselines.

## Cierre y documentación mínima

- **Documentación una vez por sesión, no por commit:** al final de la sesión (o
  cada varias tandas) ejecuta `npm run inventory`, después `npm run pending`, y
  actualiza `PORTING-STATUS.md`, todo en un único commit de estado. Los commits
  de tanda contienen solo código. No cambies el algoritmo del inventario para
  inflar cobertura.
- Mantén `PORTING-STATUS.md` como estado operativo breve: siguiente tanda,
  bloqueos, validación diferida y resumen de la última entrega (máximo 8 líneas).
  Sustituye el resumen anterior; el detalle permanece en Git. No abras otra crónica.
- Solo `PENDING.md` y `PORT-INVENTORY.md` contienen las cifras vivas. En el cierre
  informa el cambio del contador y separa trabajo nuevo de equivalencias existentes.
- Un commit local por tanda integrada, en inglés, imperativo, con fuente C cuando
  corresponda y `Co-Authored-By: OpenAI Codex <codex@openai.com>` si trabaja Codex
  (otros agentes indican su entorno). Sin superlativos ni afirmaciones no probadas.
  Preserva cambios ajenos; no hagas push sin indicación del usuario.
- No inicies subagentes por defecto. La documentación antigua de paralelismo no
  autoriza delegación automática.

## Paso a revisión

Implementado, integrado y validado son estados distintos. Terminar la fase de
portado requiere revisar huecos, stubs, adaptadores y dependencias de todo el
alcance principal, no solo alcanzar todos los nombres. Después usar `PLAN-RECORRIDO.md`
y los checks para revisar historia, sistemas opcionales, gráficos y temporización.
No borres de la cola una validación pendiente al sustituir el resumen de entrega.
