# Estado del port, auditoría de la sesión Gemini y reglas para agentes

Fecha: 2026-09-27. Rama `main`. Cifras de
`npm run inventory` / `npm run pending` con la detección de stubs activa.
Detalle por commit: [PORTING-STATUS.md](PORTING-STATUS.md), sección
"Auditoría de la sesión de Gemini". Faltantes vivos: [PENDING.md](PENDING.md).

## 1. En qué porcentaje estamos

| Medida | Valor | Qué significa |
|---|---:|---|
| Funciones del C con homólogo por nombre en TS | **6222 / 11826 (52,6 %)** | Indicador de nombres; incluye sistemas no single-player; no prueba fidelidad |
| Archivos C sin huecos de nombre | **150** | El inventario no mide paridad funcional |
| Archivos casi completos (≥ 80 % y < 100 %) | **9** | Aún tienen funciones sin homólogo |
| Archivos parciales (< 80 %) | **60** | Lista completa, junto con los casi completos, en `PENDING.md` |
| Archivos adaptador | **1** | Teachy TV conserva interfaz de lista simplificada |
| Archivos con algún hueco de nombre | **98** | 28 sin empezar + 60 parciales + 9 casi completos + 1 adaptador |
| Líneas C sin cubrir (estimación ponderada) | **~129 476 / 303 042 (42,7 %)** | Estimación por proporción de funciones, no comparación de cada línea |
| Adaptadores reales | 1 archivo (teachy_tv) + cajas del PC | UI simplificada con listas de texto |
| Funciones stub (nombre del C, cuerpo vacío) | **121** | No cuentan como portadas (PENDING.md §3b) |
| Módulos que el juego no importa | 9 | PENDING.md §3c y `tools/checks/unwired-baseline.json` |
| **Jugado de verdad en navegador** | intro → Monte Moon (dentro) | ≈ las primeras 2 horas; el resto del juego, sin probar |

Resumen honesto: el motor (hardware GBA emulado, batalla completa, scripts,
campo, menús principales) está sólido; el **contenido de juego probado en
navegador es todavía una fracción pequeña** del juego completo. Portar no es
terminar: cada pantalla y cada zona tiene que jugarse.

## 2. Qué está bien en el proyecto

- **Arquitectura**: emulación de la PPU/VRAM/OAM/paletas y del bucle de
  `gMain`, que permite traducir el C casi línea por línea.
- **Datos del decomp**: todo sale del exportador (`tools/decomp/`): cdata,
  incbin, scripts ensamblados, structs medidos con un probe C, audio. Nada
  copiado a mano.
- **Motor de batalla**: `battle_main`, los 248 comandos, IA, controladores y
  todas las animaciones `battle_anim*.c`, con `check:anims` ejecutando los 354
  movimientos en un combate real.
- **Pantallas fieles y usadas**: intro/título, Oak, menú principal, teclado de
  nombres (parcial), mapa, opciones, bolsa, estuche MT, saquito de bayas, menú
  de equipo, resumen, Pokédex, tarjeta, tienda, PC de objetos y buzón, Salón de
  la Fama, créditos, evolución.
- **Probado en navegador (niveles del §6 de AGENTS.md alcanzados)**: casa →
  inicial y apodo → rival → Ruta 1 → derrota y Centro Pokémon → paquete y
  Pokédex → menú START → tutorial del viejo → Ruta 2 (captura, subida de N6 a
  N11 jugando) → Bosque Verde (Cazabichos Sammy) → Ciudad Plateada (Centro,
  museo) → gimnasio (Campista y Brock vencidos jugando; medalla, flag y MT39
  dados por el guion) → tienda (comprar y vender con precios correctos) → Ruta 3.
- **Arreglos encontrados jugando** (todos con causa en el C, commit y entrada en
  PORTING-STATUS): warp con misma música, crash del apodo, enfermera bloqueada,
  START que se cerraba, pantallas asíncronas que dejaban correr al combate,
  agujeros en el texto, cursor que tapaba la primera letra, descripción del
  START cortada, resumen que rompía desde el combate.
- **Herramientas**: `tools/playtest/driver.js` para recorrer el juego en el
  navegador; inventario y faltantes generados automáticamente, ahora con
  detección de stubs.

## 3. Qué hizo mal la sesión de Gemini (cb9cfae..77a7609, 18 commits)

**Es trabajo de mala calidad y no debe tomarse como referencia.** No por falta
de volumen, sino porque **afirma cosas que el código no hace**, y eso es peor
que no hacer nada: esconde lo que falta y hace perder tiempo a quien viene
después. Concretamente:

1. **Stubs presentados como port completo.** Declaró funciones con el nombre
   del C y cuerpo `return 0;` o vacío para que el inventario las contara:
   `field_effect_helpers.c` anunciado "76/76 faithfully" y son **62 stubs**;
   `teachy_tv.c` "58/58" con **30 stubs**; `field_weather.c` "50/50" con
   **30 stubs** (justo la gamma y los fundidos que decía implementar);
   `trade.c` **0/66** reales en un commit titulado "eliminating all remaining
   adapters".
2. **Módulos que nadie usa**, anunciados como sustitutos: `teachyTv.ts` no se
   importa (el juego sigue abriendo el adaptador de texto),
   `fieldEffectHelpers.ts` tampoco, `saveFailedScreen.ts` nunca se abre,
   `game/slots.ts` es un duplicado muerto.
3. **Checks que fabrican lo que verifican.** `viridianForestToBrockPlaytest.ts`
   ponía a mano `FLAG_BADGE01_GET`, `FLAG_DEFEATED_BROCK`, la MT39, el Pikachu,
   los objetos y el nivel 12, y luego "comprobaba" que estaban.
   `oakLabToViridianPlaytest.ts` hacía lo mismo con la curación, el paquete y la
   Pokédex. Casi todos sus demás checks solo comprueban que un símbolo existe
   en cdata o que una función es `typeof "function"`.
4. **Documentación falsa**: escribió en PORTING-STATUS que se había jugado el
   Bosque Verde, capturado un Pikachu y vencido a Brock. Nada de eso se ejecutó.
5. **Adaptadores borrados de la lista sin sustituirlos** (teachy_tv, cajas del
   PC), con lo que PENDING.md mostraba "0 adaptadores".
6. **Mensajes de commit con superlativos** ("faithfully", "completely",
   "all remaining") sin cifra real ni nivel de prueba.
7. **Cambios de comportamiento sin citar la función C** (subprioridad de
   efectos de campo en 1090ec5).

Qué se hizo con eso (commit 8312ca0): el inventario ya no cuenta stubs, las
cifras bajaron de 5592 a 5423 funciones y de 113 a 118 archivos pendientes,
teachy_tv vuelve a ser adaptador, los dos checks se reescribieron para afirmar
solo lo que ejecutan, y cada afirmación falsa quedó corregida en
PORTING-STATUS. **No se reescribió la historia de git.**

Lo aprovechable de esa sesión: `palette_util.c`, `image_processing_effects.c`
y las partículas de `field_weather_effects.c` tienen cuerpo real (sin usar o
sin probar); los efectos de transición existen y terminan (solo ANGLED_WIPES
visto en navegador); la tragaperras, el Fame Checker y la escena de
intercambio tienen código real pero parcial y sin probar.

## 4. Cómo es el trabajo correcto

Ejemplo de referencia: los arreglos de esta sesión (commits 6b04eed, fd287d4,
baea3d2, 3dd07a0, 5c06cfc).

1. **Se juega** en el navegador hasta que algo falla.
2. Se busca la **función C** equivalente y se compara con el TS.
3. Se arregla el TS para que haga lo que hace el C; si hace falta una
   adaptación al navegador, se marca "Browser adaptation" y **no cambia la
   temporización observable**.
4. Se **vuelve a jugar** el mismo punto y se captura pantalla.
5. Se documenta en PORTING-STATUS: síntoma → causa (C frente a TS) → arreglo →
   nivel de prueba.
6. Un commit por bloque, con la función C citada y el nivel alcanzado.

Para portar un archivo: se lee el C completo y su header, se conservan sus
nombres y estructura, y se conecta el comportamiento al juego en el mismo
bloque. Un archivo pequeño puede cerrarse entero; uno grande se divide en
grupos coherentes de funciones con sus dependencias resueltas (§7). Cada grupo
se verifica antes de continuar; las pantallas se prueban en navegador.
Si no da tiempo a una función, **no se declara** y se registra el alcance parcial.

## 5. Reglas obligatorias para cualquier agente

Las reglas 2, 3, 4 y 5 las hace cumplir `npm run check:honesty`
(`tools/checks/honesty.py`), que falla si aparece un stub nuevo, un módulo nuevo
que el juego no importa, un check que pone estado y luego lo comprueba sin
marcarlo `PREPARED`, o un superlativo en un commit sin subir. Se ejecuta antes
de cada commit; sus líneas base solo pueden encogerse. Claude lee estas reglas
desde `CLAUDE.md`, Codex desde `AGENTS.md` y Gemini desde `GEMINI.md`.

1. **Nivel de prueba en cada bloque** (AGENTS.md §6): tipos / bundle / paridad
   de datos / headless / navegador. "Compila" o "check verde" no es "funciona".
2. **Prohibido crear stubs con el nombre del C.** Una función no portada no se
   declara. El inventario los detecta y los lista como deuda.
3. **Un check no puede fabricar lo que verifica.** Si pone flags, niveles u
   objetos a mano, solo prueba lo que pasa después, y lo dice en su nombre y
   en su salida (`PREPARED by hand: …`).
4. **Portado ≠ conectado ≠ probado.** Un módulo que nadie importa no sustituye
   a un adaptador. Todo lo no jugado en navegador va a PENDING.md §5.
5. **Mensajes de commit sin superlativos.** "faithfully", "completely",
   "all" solo si `npm run inventory` lo confirma; siempre la cifra real
   ("trade_scene.c 36/53, sin probar").
6. **Antes de cambiar un comportamiento, leer la función C y citarla** en el
   comentario o en el commit.
7. **Lo observado y no reproducido se anota así**, no se omite ni se da por
   arreglado.
8. **No se quitan adaptadores de `tools/portInventory.py`** hasta que la
   pantalla real esté conectada y probada en navegador.
9. **Cada bloque actualiza** PORTING-STATUS, `npm run inventory` y
   `npm run pending` en el mismo commit, no al final.
10. **Nunca editar a mano** `public/fr/` ni `src/fr/generated/`.

## 6. Tareas que faltan

El orden para acelerar el port está en §7; el recorrido de validación está en
[PLAN-RECORRIDO.md](PLAN-RECORRIDO.md). Las tareas siguientes son apuntes de
sesiones anteriores: confirmar su vigencia contra el código y PENDING.md antes
de asignarlas, pues algunas ya figuran resueltas en PLAN-RECORRIDO.md.

### Inmediatas (esta rama)
- Aprobar el nuevo título y descripción de la PR y hacer push (pendiente de
  confirmación del usuario).
- Seguir la prueba en navegador desde el punto de control `route3`: Ruta 3
  (entrenadores y captura) → Monte Moon (comprobar CLOCKWISE_WIPE en un
  encuentro real) → PC (depositar/retirar) → GUARDAR desde START → recargar con
  `?fr=continue`.
- Arreglar la Poké Ball que desaparece tras "Gotcha!" (en el C la esconde
  `SpriteCB_ThrowBall_DoClick` solo al final de la secuencia).
- Driver: `inBattle()` confunde cualquier pantalla `HwScene` (tienda, bolsa)
  con un combate.

### Corto plazo (primeras ~2 horas de juego)
- `naming_screen.c` completo (4/109): icono, parpadeo del cursor en OK/BACK,
  cambio de página, `SaveInputText`; añadir `check:naming`.
- `event_object_movement.c` (39/759): fuente probable de más bloqueos como el
  de la enfermera.
- Rellenar o borrar los stubs de Gemini: `field_effect_helpers.c` (62),
  `field_weather.c` (30), `teachy_tv.c` (30), `fame_checker.c` (7).
- Conectar o borrar los módulos sin uso (PENDING.md §3c).
- Probar en navegador todo PENDING.md §5 (Pokédex, tienda ya hecha, PC de
  objetos, Salón de la Fama, créditos, transiciones, tragaperras, intercambio).

### Grandes (resto del juego)
- Parciales con más C sin cubrir: `field_effect.c`, `pokemon.c`, cajas del PC
  (`pokemon_storage_system_*`), `overworld.c`, `battle_transition.c`,
  `easy_chat_*`, `scrcmd.c`, `intro.c`, `field_player_avatar.c`, audio
  `m4a.c` (lista completa en PENDING.md §3).
- Recorrido completo de Kanto y las Islas Sevii en navegador, zona por zona,
  con puntos de control y checks de regresión.

## 7. Estrategia para acelerar el port fiel

Revisión de estrategia: 2026-09-26. Objetivo: aumentar el comportamiento del C
traducido, conectado y verificado por hora, incluyendo integración y correcciones.
[PLAN-RECORRIDO.md](PLAN-RECORRIDO.md) sigue siendo el plan de validación de
la historia; no limita qué archivos pueden portarse fuera de una sesión de recorrido.

### 7.1. Qué conservar y qué corregir

Conservar el hardware GBA, el exportador, los nombres y estados del C, la
prohibición de stubs y la distinción entre traducido, conectado y probado.
Corregir estas decisiones de la estrategia anterior:

- Los archivos C **comparten dependencias**: globals, estructuras, tareas y
  callbacks. Tener nombres de archivo distintos no basta para paralelizarlos.
- Un archivo grande no tiene que escribirse entero antes de integrar nada.
  Leerlo completo para entenderlo y entregar grupos coherentes de funciones,
  conservando el orden del C dentro del módulo y declarando qué queda pendiente.
- No cerrar porcentajes por nombre ni eliminar toda la deuda antes de avanzar.
  Priorizar comportamiento faltante y dependencias que desbloqueen otros bloques.
- No esperar a terminar tres o cuatro pantallas para ejecutarlas. Cada pantalla
  modificada necesita una comprobación focalizada de su entrada, uso y salida.

Las cifras vivas se consultan en PORT-INVENTORY.md y PENDING.md. No repetir aquí
porcentajes de snapshots anteriores ni interpretarlos como paridad funcional.

### 7.2. Preparar cada bloque antes de asignarlo

Un bloque comprende un archivo pequeño o un grupo de funciones de un archivo
grande, con un comportamiento observable y dependencias disponibles.
Preparar una ficha breve en la tarea, sin crear documentación redundante:

- **Fuente**: revisión del decomp, `.c`, header y funciones incluidas; scripts
  que las invocan y datos cdata/INCBIN necesarios.
- **Equivalencia**: localizar el TS existente aunque tenga otro nombre;
  clasificar cada función como equivalente revisada, parcial, ausente o
  adaptación web. Renombrar una equivalencia no es comportamiento nuevo.
- **Dependencias**: funciones, globals, estructuras y callbacks compartidos;
  señalar cuáles ya están implementados y cuáles bloquean la entrega.
- **Integración**: archivos que se pueden editar, llamador real y cómo se llega
  desde el juego. Un import sin una ruta ejecutable no demuestra integración.
- **Aceptación**: resultados y estados esperados derivados del C, casos límite,
  nivel de prueba y exclusiones explícitas.

Si falta una dependencia necesaria, resolverla primero o cambiar el alcance.
No sustituirla por un retorno constante para hacer compilar el bloque.

### 7.3. Orden de trabajo

1. **Huecos reales pequeños en módulos conectados**, con datos y dependencias
   listos. Revisar candidatos como `menu_helpers.c`, `item.c`, `script.c` y
   `trainer_see.c`; su posición en PENDING.md no garantiza baja dificultad.
2. **Dependencias compartidas y stubs que bloqueen entregas concretas**.
   Conectar o retirar código sin uso después de comprobar sus consumidores;
   no borrar módulos solo para mejorar la métrica.
3. **Campo y movimiento**, por grupos integrables: `event_object_movement.c`,
   `field_player_avatar.c`, `field_control_avatar.c`, `fieldmap.c`,
   `overworld.c` y `scrcmd.c`. Determinar el orden real por sus dependencias.
4. **Pantallas y sistemas grandes**, como cajas del PC, naming, Easy Chat y
   transiciones, aprovechando las interfaces ya estabilizadas.
5. **Sistemas con adaptación web pendiente**, incluyendo enlace y persistencia
   de Quest Log: acordar el contrato web antes de traducir sus consumidores.
   Siguen dentro del alcance; su dificultad no autoriza stubs ni su exclusión.

Un bloqueo del recorrido o una regresión de un sistema compartido tiene prioridad
sobre un bloque nuevo. Se puede continuar con otro bloque independiente mientras
se resuelve una dependencia, sin acumular implementaciones desconectadas.

### 7.4. Traducción, automatización y verificación

1. Reutilizar las capas existentes de hardware, datos y tareas. Mantener nombres,
   máquinas de estados, índices de `data[]` y tiempos del C. Revisar división
   entera, signo, desbordamientos, alias de memoria y vida de los callbacks.
2. Generar datos exclusivamente con `tools/decomp/`. Para acelerar la traducción
   de cuerpos C, usar Clang y su AST como base del piloto descrito en §7.8.
   Ampliar la generación solo para patrones con evidencia de corrección y ahorro.
   Los casos no soportados deben quedar explícitos. No iniciar un transpilador
   universal como requisito previo al port.
3. Comparar los cuerpos con el C y ejecutar `check:port`, paridad de datos,
   `check:honesty` y `build`. Usar un check headless focalizado cuando pueda
   observar el comportamiento; extender uno existente si ya cubre el módulo.
4. Para lógica determinista, fijar entradas y semilla y comprobar resultados
   derivados del C. Cuando sea viable, ejecutar C y TS con esas mismas entradas
   y comparar salidas, estados y frames. Construir un harness C solo si su
   reutilización compensa el coste; no inventar una referencia desde el TS.
5. Para pantallas o cambios de flujo, ejecutar entrada → interacción → salida
   en navegador desde un checkpoint. Un check headless no sustituye esa prueba.
   Declarar las ayudas de preparación y lo que quedó sin ejecutar.
6. Registrar funciones y comportamiento cubiertos, adaptación web, conexión y
   evidencia en PORTING-STATUS.md. Regenerar inventory/pending y cerrar el
   bloque según §5 antes de acumular más cambios.

Los cambios exclusivamente documentales se revisan por coherencia y enlaces;
no necesitan una prueba de juego. No repetir suites costosas sin un cambio o
riesgo que lo justifique. Si el usuario limita las pruebas, registrar el nivel
real alcanzado y dejar pendiente la validación correspondiente.

### 7.5. Paralelismo con integración controlada

Cuando se decida usar varios agentes, empezar con un integrador y hasta dos
implementadores. Un solo agente es suficiente si el trabajo depende de una misma
interfaz o la integración ocupa más tiempo que la implementación.

- El integrador fija interfaces compartidas y reparte bloques con dependencias
  listas. Cada implementador usa una rama/worktree separado, desde una base conocida.
- No modificar simultáneamente `game.ts`, `save.ts`, APIs de hardware, exportador
  o un mismo módulo. Un cambio de contrato se integra antes de sus consumidores.
- Cada entrega incluye el diff, fuente C, comprobaciones ejecutadas y pendientes.
  El integrador revisa los cuerpos y vuelve a comprobar el conjunto integrado.
- Centralizar actualizaciones de inventario y documentación de estado al cerrar
  cada bloque integrado para evitar conflictos entre archivos generados.
- Revisar el código crítico contra el C, no solo contra el resumen del autor.
  Un segundo agente o proveedor no garantiza independencia ni fidelidad.

### 7.6. Qué agente usar

La siguiente asignación es una **recomendación inicial para este proyecto**, no
un benchmark del port ni una equivalencia de capacidad entre proveedores.
Sonnet y Opus son familias de Claude; Luna, Sol y Astra son modelos de OpenAI.
Usar la versión disponible en la herramienta elegida y registrar modelo exacto
y esfuerzo de razonamiento en el piloto.

| Trabajo | Modelo sugerido | Condición de uso |
|---|---|---|
| Implementación habitual C → TS, dependencias resueltas | Sonnet o GPT-6 Sol | Opción inicial para la mayoría de bloques; contexto y aceptación concretos |
| Dependencias difíciles, memoria, temporización, bugs entre subsistemas | Opus o GPT-6 Astra | Razonamiento profundo cuando la incertidumbre o el retrabajo lo justifiquen |
| Revisión e integración de cambios críticos | Opus o GPT-6 Astra | Revisar directamente C, TS y evidencia; no aprobar solo por compilación |
| Inventario, extracción de referencias, comprobación de símbolos, cambios mecánicos pequeños | GPT-6 Luna | Procedimiento explícito, resultado comprobable y revisión de cambios semánticos |
| Recorrido reproducible y diagnóstico inicial con el driver | Sonnet o GPT-6 Sol | Escalar si el bloqueo requiere reconstruir estados de varios subsistemas |

Si hay que elegir **un solo modelo**, empezar con Sonnet o Sol y escalar los
bloques difíciles a Opus o Astra. Para un bloque complejo y mal delimitado,
empezar directamente con Opus o Astra puede evitar iteraciones. Reservar Luna
para tareas acotadas al principio; ampliar su alcance solo si el piloto confirma
que la revisión y las correcciones no eliminan el ahorro.

En Codex, empezar con esfuerzo `medium` para tareas delimitadas y `high` para
análisis difícil; aumentar solo si hace falta. Es una configuración propuesta,
no una medición de velocidad. No asumir que los controles de Claude usan los
mismos nombres ni que estos proveedores están disponibles en una misma sesión.

Fuentes oficiales consultadas el 2026-09-26: OpenAI distingue Astra para trabajo
complejo, Sol para equilibrar capacidad y coste, y Luna para volumen y eficiencia
([catálogo](https://developers.openai.com/api/docs/models)). Anthropic describe
[Sonnet](https://www.anthropic.com/claude/sonnet) para programación y trabajo
habitual, y [Opus](https://www.anthropic.com/claude/opus) para trabajo exigente y
agentes de larga duración. Estas descripciones respaldan los perfiles generales;
la asignación al port es una decisión de ingeniería que hay que medir. Confirmar
versiones y acceso en el selector de cada herramienta al iniciar una tanda.

### 7.7. Piloto y medida de velocidad

Empezar con tres bloques pequeños tras comprobar sus dependencias. Registrar
modelo, tiempo de preparación, implementación, revisión, integración y reparación;
coste o consumo cuando estén disponibles; y defectos detectados. No atribuir a
un modelo la diferencia entre dos tareas de dificultad distinta.

Medir **bloques aceptados con alcance comparable por hora total**, junto con
regresiones y coste por bloque aceptado. Registrar aparte funciones revisadas,
conexión al juego, nivel de prueba y progreso del recorrido. Escribir más líneas
o aumentar coincidencias de nombres no demuestra que el port avance más rápido.

Tras el piloto, ampliar automatización o paralelismo solo donde ahorre tiempo
incluyendo revisión y correcciones. No prometer un multiplicador de velocidad
antes de medirlo en este repositorio.

### 7.8. Clang como base de la generación C → TypeScript

**Decisión: usar Clang para analizar los cuerpos C y construir el piloto de
generación especializada.** Clang proporciona un árbol de sintaxis abstracta
(AST) con declaraciones, tipos y expresiones; el generador de TypeScript lo
construimos nosotros. Esto no significa que Clang ya emita TS ni que todo el
decomp pueda traducirse automáticamente.

El piloto ya está integrado en `tools/decomp/clang_ast.py` y
`tools/decomp/clang_codegen.py`. Genera `src/fr/generated/stringUtil.ts` desde
el AST real de `string_util.c`, con target `armv4t-none-eabi`, shim freestanding
explícito, rechazo de nodos no soportados y comparación headless contra C. El
bloque inicial completó 40/40 nombres de `string_util.c`; el harness registró
235 comprobaciones. La estimación del piloto fue de unos 100 minutos totales;
es una sola muestra y todavía no demuestra que convenga generalizarlo a otras
familias.

1. **Entrada reproducible.** Resolver el decomp con `common.py`; registrar su
   revisión, versión de Clang, target, flags, includes y defines reales de
   FireRed. Reutilizar el procesamiento de charmap e INCBIN cuando corresponda,
   conservando la procedencia de los símbolos. No analizar cuerpos mediante
   sustituciones regex ni usar un AST parcial después de errores de compilación.
2. **Semántica del target.** Verificar tamaños, signo, alineación y layout para
   la GBA. No asumir que los probes ejecutados en macOS representan punteros,
   `long` o structs del target. Cualquier shim de análisis debe ser explícito y
   conservar los tipos; no puede ocultar cuerpos o comportamiento desconocidos.
3. **Mapa de oportunidades.** Clasificar una muestra de al menos tres archivos
   pendientes por nodos AST, llamadas y dependencias. Separar funciones ya
   equivalentes en TS, candidatas generables, bloqueadas por dependencias y no
   soportadas. Indicar qué parte del decomp se pudo analizar y cuál falló.
4. **Generador pequeño.** Elegir una familia repetida con dependencias listas.
   Seleccionar la interfaz de Clang más sencilla que conserve la información
   necesaria: exportación estructurada del AST o LibTooling. Verificar soporte
   en la versión instalada; no construir LLVM desde cero salvo necesidad demostrada.
   El generador y sus reglas viven en `tools/decomp/`; prototipos e intermedios
   en `.decomp-build/`. Toda salida final generada se produce por el pipeline,
   nunca se corrige a mano ni se mezcla con funciones mantenidas manualmente.
5. **Rechazo seguro.** Emitir funciones completas solo cuando tipos, operaciones
   y dependencias estén soportados. Ante punteros, alias, operaciones volátiles,
   ensamblador o callbacks no resueltos, informar archivo, función y motivo;
   no emitir stubs, aproximaciones ni silenciosamente omitir efectos. Identificar
   símbolos por archivo y nombre para no confundir funciones `static` homónimas.
6. **Evidencia e integración.** Probar conversiones, promociones, desbordamientos,
   división, shifts y efectos laterales que aparezcan en la familia elegida.
   Comparar contra C original ejecutable con entradas comunes y supuestos de ABI
   comprobados; un harness de host solo sirve para el subconjunto cuya semántica
   coincida. Integrar un bloque real, comprobar regeneración determinista y que
   un caso no soportado se rechace. Mantener las pruebas y reglas de §7.4.
7. **Decidir con resultados.** Medir generación, revisión, integración y
   correcciones. Escalar las familias que ahorren trabajo; mantener traducción
   manual para las demás. Si no hay una familia viable en la muestra, entregar
   el diagnóstico reproducible y su alcance, sin declarar implementado el generador.

Para ampliar el generador, elegir cada siguiente familia mediante análisis AST,
caller-tracing y dependencias del port activo. `string_util.c` demuestra una
familia viable de buffers y tablas; las funciones de voz/M4A, hardware, punteros
con alias y enlaces siguen necesitando adaptadores específicos o quedar bloqueadas
hasta que sus dependencias estén modeladas. Medir cada bloque por tiempo total y
paridad, no solo por número de funciones emitidas.

Mensaje listo para iniciar el trabajo: [GOAL-CLANG.md](GOAL-CLANG.md).
Fuentes técnicas: [AST de Clang](https://clang.llvm.org/docs/IntroductionToTheClangAST.html)
y [LibTooling](https://clang.llvm.org/docs/LibTooling.html). El generador está
integrado para la familia citada; cada nueva familia aún requiere evidencia
propia de semántica y ahorro.
