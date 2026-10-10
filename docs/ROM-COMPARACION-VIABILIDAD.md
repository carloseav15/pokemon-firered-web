# Comparación con la ROM en emulador: informe de viabilidad (TAREAS-FINALES 4.2)

Fecha: 2026-10-10. Solo diagnóstico: no se ha instalado ni compilado nada, no se ha tocado código.
Lo marcado **[sin verificar]** es una hipótesis que la fase 0/1 debe comprobar antes de seguir.

## 1. Qué se quiere

Ejecutar la ROM compilada del decomp (`../pokefirered`) y el port TS con las mismas
pulsaciones y la misma semilla, y comparar estado (mapa, posición, flags, variables,
equipo, dinero, RNG, contador de fotogramas) cada N fotogramas hasta encontrar la primera
divergencia. Primer objetivo: de la partida nueva al final del laboratorio de Oak.

Esto sustituye la revisión función a función como forma de encontrar divergencias: la
máquina señala dónde empieza a diferir y solo se lee el C de esa zona.

## 2. Qué hay hoy en esta máquina

| Pieza | Estado |
|---|---|
| Decomp `../pokefirered` | presente; `Makefile` soporta `MODERN=0` (agbcc) y `MODERN=1` (arm-none-eabi-gcc) |
| ROM base (`baserom`) | no hace falta: el decomp compila desde fuente; solo `compare` usa los `.sha1` |
| Herramientas del decomp (`gbagfx`, `preproc`…) | **sin compilar** (`tools/*/` solo con fuentes). Se compilan con `make tools` con `gcc`/`libpng` del sistema (presentes) |
| Compilador ARM | **ausente** (`arm-none-eabi-gcc` no está en el PATH). Homebrew lo ofrece (`arm-none-eabi-gcc`, `-binutils`) |
| `agbcc` (compilador original) | **ausente**. Hay que clonar y compilar `pret/agbcc` |
| Emulador | mGBA 0.10.5 instalado (`/Applications/mGBA.app`), con scripts de ejemplo Lua |
| Node/Python/make/clang | presentes (`llvm@16` ya lo usa `tools/oracle`) |
| Lado TS | ya existe replay determinista (10×10.000 fotogramas con observación idéntica, `5de398c3`) y `frDebug.state()` |

## 3. Piezas y su dificultad

### 3.1 Compilar la ROM de referencia: **viable, riesgo bajo-medio**
- Con `agbcc` el binario es byte a byte el oficial y se verifica con `firered.sha1`. Es la
  referencia que conviene: da una comprobación objetiva de que el toolchain es correcto.
- `MODERN=1` es más fácil de instalar pero no es idéntico (distinto compilador, layout y
  comportamiento ante UB/variables sin inicializar). Solo como plan B; las direcciones de
  `sym_*.txt` dejarían de valer y habría que leer el `.map` generado.
- Riesgo: `agbcc` en macOS arm64 puede dar problemas de compilación **[sin verificar]**.
- Los `.sha1` del repo son de la ROM de 1.0; es la que se compilaría (`firered`).

### 3.2 Gobernar el emulador sin interfaz: **la incógnita principal**
mGBA 0.10.5 tiene scripting Lua (`emu:addKey`, `emu:read8/16/32`, callbacks por fotograma,
`io` para volcar a fichero), pero el `--help` de la app Qt **no lista** una opción de script:
- Opción A: abrir Scripting desde la interfaz y cargar un `.lua` a mano. Sirve para el
  experimento, no para automatizar.
- Opción B: `mgba` (frontend SDL) de Homebrew o compilado desde fuente con Lua: puede
  aceptar `--script` **[sin verificar]**; da ejecución sin ventana y repetible.
- Opción C: bindings Python de mGBA (compilar desde fuente con `-DBUILD_PYTHON`): control
  total del bucle, más trabajo de montaje.
- Plan: fase 1 decide A/B/C con una prueba de 20 líneas de Lua.

### 3.3 Determinismo: **viable con trabajo**
- En emulador, mismas teclas + misma ROM + mismo punto de partida da la misma ejecución.
- La semilla inicial viene de los temporizadores hardware. El port ya recibe ese valor como
  parámetro (`SeedRngAndSetTrainerId(timer1Low)`, `src/fr/random.ts:28`), así que el
  mecanismo es: fijar el mismo valor en ambos lados (escribir `gRngValue` / el estado de
  semilla en la ROM con Lua en un fotograma acordado, o dejar que ambos corran y registrar
  el valor de timer que usó el emulador).
- El avance del RNG depende del número exacto de fotogramas y de quién llama `Random()`
  por VBlank. El driver ya tiene esa auditoría abierta (DRV-15); es justo donde la
  comparación aportará más.

### 3.4 Alinear fotogramas: **riesgo medio**
- La ROM arranca con BIOS, logos y pantallas con duraciones propias; el port las
  reproduce por escenas. El contador `gMain.vblankCounter` y el estado de la máquina
  (`gMain.callback2`, tarea activa) permiten anclarse en puntos comunes (título, menú
  principal, nueva partida) en vez de contar desde el reset.
- Primer ancla propuesta: pulsar START en el título; comparar desde ahí.

### 3.5 Qué observar: **viable**
- Lado ROM: direcciones fijas de IWRAM/EWRAM en `sym_ewram.txt`/`sym_common.txt`/
  `sym_bss.txt` (con `agbcc`). `SaveBlock1/2` están tras punteros (`gSaveBlock1Ptr`), por
  lo que se desreferencian en el volcado.
- Lado TS: `window.frDebug.state()` y las estructuras de `save.ts`.
- Conjunto mínimo de la v1: mapa, x/y, dirección, flags y vars activadas, dinero, equipo
  (especie, nivel, HP, movimientos, PP, experiencia), `gRngValue`, `vblankCounter`,
  `gMain.callback2`.
- Pixels y audio quedan fuera de la v1 (el port dibuja en Canvas, no hay paridad
  de renderizado garantizada); se podría añadir luego comparando VRAM/OAM.

### 3.6 Partidas cargadas: **no automático**
- El port guarda JSON; la ROM usa SRAM con layout GBA. No se pueden compartir saves
  directamente. Para v1 se compara siempre desde partida nueva con la misma secuencia de
  teclas, y Lua puede inyectar estado en la ROM si hiciera falta saltar tramos.

## 4. Riesgos

| Riesgo | Efecto | Mitigación |
|---|---|---|
| `agbcc` no compila en macOS arm64 | no hay ROM idéntica | `MODERN=1` como plan B, con las salvedades de 3.1 |
| mGBA Qt no admite script de arranque | no hay ejecución automática | frontend SDL / bindings (3.2) |
| Divergencia temprana por fotogramas de arranque | todo parece distinto | anclar en el título, comparar desde ahí |
| Divergencias legítimas del port (adaptadores, sin enlace, sin reloj RTC) | falsos positivos | lista de campos excluidos con motivo escrito |
| UB y valores sin inicializar en C | ruido | tratarlo como categoría "no determinista en C", no como fallo |
| Coste de mantener el arnés | se abandona | un solo comando y un informe de primera divergencia |

## 5. Plan por fases con puntos de decisión

| Fase | Contenido | Termina cuando | Si falla |
|---|---|---|---|
| 0 | Instalar `arm-none-eabi-*`, compilar `agbcc`, `make tools`, `make firered` | el SHA1 coincide con `firered.sha1` | probar `MODERN=1`; si tampoco, parar e informar |
| 1 | Experimento de scripting: cargar ROM, pulsar teclas por fotograma, volcar `gRngValue` y `vblankCounter`; repetir dos veces | dos corridas con volcado idéntico y modo de ejecución sin intervención | cambiar de opción A/B/C; si ninguna, no seguir |
| 2 | Tabla de campos observados (símbolo ROM ↔ valor TS) y volcador por fotograma en ambos lados | mismos campos y formato en ambos | — |
| 3 | Comparador "primera divergencia" y primera comparación: título → partida nueva → habitación | informe con divergencia o "idéntico en N fotogramas" | — |
| 4 | Ampliar hasta el final del laboratorio de Oak y al primer combate | informe y lista de divergencias clasificadas | — |

Cada divergencia se clasifica: **bug del port**, **adaptador conocido**, **no determinista en C**,
**error del arnés**. Solo las del primer tipo pasan a TAREAS-FINALES.

## 6. Qué necesito del usuario antes de la fase 0

Instalar software en esta máquina no es parte de un cambio de código, así que no se
hace sin permiso:
1. `brew install arm-none-eabi-gcc arm-none-eabi-binutils` (y quizá el frontend `mgba`).
2. Clonar `pret/agbcc` junto al decomp (acceso a la red) y compilarlo dentro de
   `../pokefirered/tools/agbcc`; compilar `tools` del decomp. Ambos escriben en el repo
   hermano `../pokefirered` (artefactos de build, no fuentes).
3. Confirmar que la ROM generada es solo para uso local y no se versiona.

## 7. Veredicto

**Viable, con una incógnita acotada** (cómo automatizar mGBA, fase 1). La parte cara no es
técnica sino de mantener el arnés alineado fotograma a fotograma, y para eso ya existen
el replay determinista del port y el estado observable del driver. Recomendación: autorizar
la fase 0; si el SHA1 coincide y la fase 1 da volcados repetibles, seguir; si no, se
cierra con el coste de una tarde.
