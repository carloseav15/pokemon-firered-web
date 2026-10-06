# FireRed C → TypeScript: reglas de trabajo

Modo vigente desde 2026-09-27: **portado por archivo completo, revisión funcional
exhaustiva posterior**, autorizado por el usuario para reducir pruebas y
documentación repetitivas. Estas reglas sustituyen el procedimiento anterior.
Responde en español.

## Lectura inicial

- Lee este archivo y [PORTING-STATUS.md](PORTING-STATUS.md), y comprueba `git status`.
- [TAREAS-FINALES.md](TAREAS-FINALES.md) es la lista única de lo que queda del
  juego de un jugador: código por cerrar, equivalencias/wrappers y validación.
- Consulta las filas relevantes de [PENDING.md](PENDING.md) y el código de la tanda.
- [Referencia técnica](docs/PORTING-GUIDE.md): mapa, datos, semántica C y driver;
  lee únicamente la sección necesaria. No releas el historial al iniciar una tarea.
- [refs/README.md](refs/README.md): extracción de otros decomps (Emerald, Platinum,
  HeartGold, PokéAPI) para fases futuras. Trabajo aparte con su propia guía;
  `src/` nunca importa `refs/`.
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
   Si el archivo no cabe entero, toma la familia completa más grande posible
   (todas las `Task_*`, todos los `SpriteCB_*`, todos los efectos de un tipo…);
   agrupar 3–10 funciones sueltas por commit no es una tanda válida.
2. Localiza primero equivalencias TS: comportamiento que ya existe con otro nombre
   o estructura (p. ej. la tabla de comandos de `script/commands.ts` frente a los
   `ScrCmd_*` de `scrcmd.c`). Reestructúralo con el nombre y la forma del C,
   revisando cada función contra el C; es trabajo válido, pero se reporta aparte
   como **equivalencia**, no como implementación nueva. Un método de una línea
   que delega en lógica genérica previa (p. ej. `MovementAction_*` →
   `movementActionStep`) es un **wrapper**: cuenta como equivalencia y su familia
   se anota en la sección 2 de `TAREAS-FINALES.md` para revisarla contra
   el cuerpo C en la fase de revisión.
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
  orden de callbacks, etc.) se anotan en una línea en `TAREAS-FINALES.md` y se
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
- Las cifras y ejemplos "esperados" de una guía o tarea se verifican con los datos
  antes de escribirlos, y quien los sigue los contrasta en vez de ajustar su
  resultado para que encajen (ver `TAREAS-FINALES.md` §0).
- Navegador, capturas y recorridos quedan para revisión posterior, salvo petición
  del usuario o diagnóstico de un fallo concreto. No son requisito por pantalla
  durante esta fase. Anota de forma compacta qué quedó sin validar.
- No ignores una regresión conocida que invalida las dependencias de la siguiente
  tanda. Corrígela o continúa por una ruta independiente.
- Cambios exclusivamente documentales: revisar coherencia, enlaces y diff; no
  necesitan tipos, build, inventario ni pruebas de juego. `check:honesty` sigue
  siendo obligatorio antes de cualquier commit; no amplíes sus baselines.

## Cierre y documentación mínima

- **Commits de tanda solo con código.** No toques `PORTING-STATUS.md`,
  `TAREAS-FINALES.md`, `PENDING.md`, `PORT-INVENTORY.md` ni `KNOWN_GAPS` de `portPending.py` en ellos,
  y no hagas un commit "Update … status" después de cada tanda.
- **Estado una vez al final de la sesión** (o, en sesiones largas, como mucho cada
  cinco tandas): `npm run inventory`, después `npm run pending`, actualizar
  `PORTING-STATUS.md`, `TAREAS-FINALES.md` y `KNOWN_GAPS`, todo en un único commit de estado. No
  cambies el algoritmo del inventario para inflar cobertura.
- Mantén `PORTING-STATUS.md` como estado operativo breve (máximo 8 líneas) con
  estas líneas fijas: modo, siguiente tanda, bloqueos, validación diferida,
  última entrega, contador, **acumulado nuevo/equivalencia** y **wrappers a
  revisar**; las dos últimas listas viven en `TAREAS-FINALES.md` y la línea solo
  las enlaza. Sustituye la última entrega; el detalle permanece en Git. El
  acumulado es una sola frase con el total y el cambio de la última sesión (el
  desglose histórico vive en Git; decisión del usuario, 2026-10-01). En
  `TAREAS-FINALES.md` las tareas abiertas no se borran sin resolverse; las hechas
  quedan en una línea con su commit. No abras otra crónica.
- Solo `PENDING.md` y `PORT-INVENTORY.md` contienen las cifras vivas. En el cierre
  informa el cambio del contador separado en funciones nuevas (cuerpo portado del
  C) y equivalencias/wrappers, y actualiza con ellas la frase de acumulado de
  `PORTING-STATUS.md`.
- Un commit local por tanda integrada, en inglés, imperativo, con fuente C cuando
  corresponda y `Co-Authored-By: OpenAI Codex <codex@openai.com>` si trabaja Codex
  (otros agentes indican su entorno). Sin superlativos ni afirmaciones no probadas.
  Preserva cambios ajenos; no hagas push sin indicación del usuario.
- Solo existe la rama `main` (decisión del usuario, 2026-10-06): un agente a la vez,
  commits directos en `main`, sin worktrees ni ramas de agente. Claude revisa las
  entregas (`TAREAS-FINALES.md` §0, "Un solo agente en `main`").
- No inicies subagentes por defecto. La documentación antigua de paralelismo no
  autoriza delegación automática.

## Paso a revisión

Implementado, integrado y validado son estados distintos. Terminar la fase de
portado requiere revisar huecos, stubs, adaptadores y dependencias de todo el
alcance principal, no solo alcanzar todos los nombres. Después usar `PLAN-RECORRIDO.md`
y los checks para revisar historia, sistemas opcionales, gráficos y temporización.
No borres de `TAREAS-FINALES.md` una validación pendiente al sustituir el resumen de entrega.
