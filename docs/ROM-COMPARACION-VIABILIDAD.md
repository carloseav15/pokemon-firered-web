# Comparación con la ROM en emulador: informe de viabilidad (TAREAS-FINALES 4.2)

Fecha: 2026-10-10. Actualizado tras la fase 1 (sección 8). Lo marcado **[sin verificar]** es
una hipótesis pendiente de comprobar.

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
| ROM de referencia | **disponible**: `assets/gba-reference/firered.gba` (ignorada por git), SHA1 `41cb23d8…2fdc` = `firered.sha1` (FireRed USA 1.0 original) |
| Herramientas del decomp (`gbagfx`, `preproc`…) | **sin compilar** (`tools/*/` solo con fuentes). Se compilan con `make tools` con `gcc`/`libpng` del sistema (presentes) |
| Compilador ARM | **ausente** (`arm-none-eabi-gcc` no está en el PATH). Homebrew lo ofrece (`arm-none-eabi-gcc`, `-binutils`) |
| `agbcc` (compilador original) | **ausente**. Hay que clonar y compilar `pret/agbcc` |
| Emulador | mGBA 0.10.5 instalado (`/Applications/mGBA.app`), con scripts de ejemplo Lua |
| Node/Python/make/clang | presentes (`llvm@16` ya lo usa `tools/oracle`) |
| Lado TS | ya existe replay determinista (10×10.000 fotogramas con observación idéntica, `5de398c3`) y `frDebug.state()` |

## 3. Piezas y su dificultad

### 3.1 ROM de referencia: **resuelto** (ya no hay que compilarla)
- La ROM aportada por el usuario es la oficial 1.0 (SHA1 idéntico al del decomp).
- **Corrección:** `sym_*.txt` del decomp no son tablas símbolo→dirección, solo listas de
  `.include` de objetos. Las direcciones de variables C (`gRngValue`, `gMain`,
  `gSaveBlock1Ptr`, `gPlayerParty`…) salen del `.map` del enlazado, que hoy no existe. Ver 3.5.

### 3.2 Gobernar el emulador: **resuelto para el experimento, parcial para automatizar**
- mGBA 0.10.5 (Qt) ejecuta Lua desde `Tools > Scripting`, que tiene consola: `dofile('…')`
  carga un script del repo. Verificado en la fase 1: callbacks por fotograma, `emu:reset()`,
  `emu:addKey/clearKey`, lectura de `emu.memory.iwram/wram` y escritura de ficheros con `io`.
- No hay opción de línea de comandos para cargar un script al arrancar. Hoy se lanza
  pulsando Enter en la consola (se hace por accesibilidad con la herramienta de control de
  apps). Para un `npm run` sin intervención quedan: frontend SDL con `--script`
  **[sin verificar]** o bindings Python.

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
- Lado ROM: hace falta la dirección de cada variable. Opciones, de mejor a peor:
  (1) un `.map` del enlazado del decomp (requiere `arm-none-eabi-*` y `agbcc`, el único
  motivo que queda para la antigua fase 0; y se comprueba con el SHA1);
  (2) localizarlas en la ROM por los literales de las funciones (p. ej. el puntero que usa
  `Random()` para `gRngValue`), verificando cada una por comportamiento en el emulador;
  (3) mapas de RAM de la comunidad para FireRed 1.0 **[sin verificar, no se han consultado]**.
  `SaveBlock1/2` están tras punteros (`gSaveBlock1Ptr`), así que se desreferencian en el volcado.
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
| 0 | ~~Compilar la ROM~~ — **no necesaria** (ROM oficial aportada, SHA1 verificado) | hecha | — |
| 1 | Scripting: reset, teclas por fotograma, volcado de IWRAM/EWRAM; repetir dos veces | **hecha** (sección 8) | — |
| 2a | Obtener direcciones de variables (`.map` o ingeniería inversa, ver 3.5) | tabla símbolo→dirección verificada con el SHA1 o por comportamiento | decidir entre toolchain y ROM-literales |
| 2 | Tabla de campos observados (símbolo ROM ↔ valor TS) y volcador por fotograma en ambos lados | mismos campos y formato en ambos | — |
| 3 | Comparador "primera divergencia" y primera comparación: título → partida nueva → habitación | informe con divergencia o "idéntico en N fotogramas" | — |
| 4 | Ampliar hasta el final del laboratorio de Oak y al primer combate | informe y lista de divergencias clasificadas | — |

Cada divergencia se clasifica: **bug del port**, **adaptador conocido**, **no determinista en C**,
**error del arnés**. Solo las del primer tipo pasan a TAREAS-FINALES.

## 6. Qué necesito del usuario

Nada para seguir con la fase 2 si se elige ingeniería inversa de direcciones. Si se prefiere
el `.map` exacto: `brew install arm-none-eabi-gcc arm-none-eabi-binutils` y clonar
`pret/agbcc` (red); escribe artefactos en `../pokefirered`. La ROM no se versiona
(`assets/gba-reference/` está en `.gitignore`).

## 7. Veredicto

**Viable.** La ROM oficial está disponible y el scripting de mGBA funciona. Lo que queda es
trabajo de ingeniería (direcciones, observación, alineación de fotogramas), no una
incógnita de viabilidad. Riesgo principal restante: la alineación fotograma a fotograma con
el arranque del port (3.4) y automatizar sin intervención (3.2).

## 8. Resultado de la fase 1 (2026-10-10)

Experimento: `tools/rom-compare/probe.lua`, cargado desde la consola Scripting de mGBA 0.10.5
con `firered.gba`. Hace `emu:reset()`, cuenta sus fotogramas, pulsa START/A según un
calendario y cada 60 fotogramas escribe `iw` (suma de IWRAM, 32 KiB), `ew` (EWRAM, 256 KiB)
y una palabra de IWRAM.

| Comprobación | Resultado |
|---|---|
| El script carga y corre en el emulador | sí |
| Callbacks por fotograma, teclas, lectura de memoria, `io` a fichero | funcionan |
| Dos corridas consecutivas (con `emu:reset()` al inicio), 1.500 fotogramas, 25 muestras | **idénticas** (`cmp`) |
| Ejecución sin intervención desde `npm run` | **no**: hay que pulsar Enter en la consola |

Lo que **no** demuestra: que el estado coincida con el del port (aún no hay mapeo de
variables) ni determinismo ante temporizadores reales distintos de los de mGBA.

## 9. Resultado de la fase 2: direcciones y primera divergencia (2026-10-10)

### Direcciones recuperadas de la propia ROM
Sin `.map`. Detalle y método de verificación de cada una en
[tools/rom-compare/addresses.json](../tools/rom-compare/addresses.json).

| Símbolo | Dirección | Verificación |
|---|---|---|
| `gRngValue` | `0x03005000` | literal de `Random()` (`0x08044ee0`: ×`0x41C64E6D`, +`0x6073`); avanza exactamente un paso del LCG por fotograma |
| `gMain` | `0x030030F0` | `vblankCounter2` (+0x24) sube 1 por fotograma; `callback2`/`vblankCallback` son punteros a ROM |
| `gSaveBlock1Ptr` / `gSaveBlock2Ptr` | `0x03005008` / `0x0300500C` | apuntan a `0x0202552C` / `0x02024588`; separación = `sizeof(SaveBlock2)` + rango DMA (`load_save.c`); campos aún sin comprobar jugando |
| `gPlayerParty`, `gPlayerPartyCount` | `0x02024284`, `0x02024029` | **no verificadas** (valores conocidos de la comunidad; coherentes con `gEnemyParty`) |

### Herramientas
`probe.lua` (fase 1), `scan.lua` (volcado de IWRAM por fotograma), `trace.lua` (una línea por
fotograma: contador, RNG, callbacks) y `port-trace.mjs` (lado port: avanza las escenas de
arranque de una en una y vuelca el estado del LCG).

### Primera divergencia encontrada: el RNG avanza por fotograma en la ROM y no en el port
- ROM: `main.c:412`, `VBlankIntr()` llama a `Random()` en **cada** VBlank. Medido en 1.600
  fotogramas de intro: 1 llamada por fotograma, sin saltos. `gRngValue` empieza en 0 y no
  se siembra hasta pulsar START en el título (`title_screen.c:735`).
- Port, intro: tras 2.400 fotogramas de `frStartupStep`, el estado del LCG sigue en `00000000`.
- Port, juego (partida nueva, `frDebug.run(1)`): el estado del LCG no cambia en fotogramas
  en reposo (6 fotogramas medidos; `hardware.vblankCounter2` también queda en 0).
- `src/fr/hw/runtime.ts:147` `VBlankIntr` omite `Random()` (y `m4aSoundMain`,
  `TryReceiveLinkBattleData`, `UpdateWirelessStatusIndicatorSprite`, que viven en otro sitio o
  no aplican).
- Consecuencia: en la ROM el resultado de cualquier tirada (encuentros, golpes críticos,
  precisión, capturas) depende del número exacto de fotogramas transcurridos; en el port solo
  del número de llamadas. Con las mismas pulsaciones las secuencias divergen desde la primera
  tirada tras sembrar. Clasificación: **bug del port** (no adaptador, no enlace).
- **Arreglo aplicado** (`0767f563`): `Game.frame()` y el bucle de `Startup` llaman a
  `random()` una vez por fotograma, y la pantalla de copyright del arranque modela el
  `Random()` de `ResetMenuAndMonGlobals` (ver abajo). Comprobado: `check:port`, `build`,
  `check:all` (45 PASS, 0 regresiones) y replay determinista (3×2.000 fotogramas, hash
  idéntico); en partida nueva el estado avanza un paso de LCG por fotograma (3 pasos
  comprobados a mano).

### Segunda observación: una llamada extra en el arranque
En la ROM hay exactamente un fotograma con dos `Random()` (fotograma 175, fin de la pantalla
de copyright): `CB2_InitCopyrightScreenAfterBootup` → `ResetMenuAndMonGlobals` →
`SeedWildEncounterRng(Random())` con el LCG aún sin sembrar. El port la modela solo en
`IntroCopyright.afterBootup` (no al volver del título, que usa
`CB2_InitCopyrightScreenAfterTitleScreen`). Tras la siembra del título el estado es
independiente de esto; solo afecta al estado previo.

### Alineamiento del arranque: no es exacto, y por qué
- El port arranca por `requestAnimationFrame` y el número de fotogramas ejecutados antes de
  tomar el control varía entre corridas (se observaron desfases de 11 y 12). Un arnés que
  compare el arranque debe fijar ese punto de partida o alinear por el valor del LCG.
- La ROM tarda ~15 fotogramas entre el fin del copyright y el inicio de la intro
  (`LoadGameSave` sobre flash/SRAM); el port no modela esa latencia. Es una diferencia de
  hardware, no del RNG.
- La semilla real viene de `REG_TM1CNT_L` al pulsar START en el título
  (`title_screen.c:735`). No se puede reproducir por fotogramas; el arnés debe leer el valor
  que usó la ROM (`gRngValue` justo tras sembrar) y pasarlo como `timer1Low` al port.

### Estado de las fases
| Fase | Estado |
|---|---|
| 2a Direcciones | hecha para RNG, `gMain`, save blocks; party y objetos de campo pendientes |
| 2 Campos observados | parcial: contador, RNG, callbacks (en la ROM sin nombres; hace falta tabla dirección→nombre de callback) |
| 3 Comparador | siguiente: comparar desde la siembra del título (leer el `timer1Low` de la ROM, inyectarlo en el port) hasta el menú principal y la partida nueva |

## 10. Resultado de la fase 3: del título a Oak, RNG idéntico (2026-10-10)

Escenario: ROM y port arrancan de cero; en cada lado, START a 300 fotogramas de entrar en el
título y A cada 80 desde los 550 (el reloj de entrada es relativo al título, porque el
arranque difiere en latencia). Se pasa al port el mismo valor de Timer1 que usó la ROM
(`0x3649`, recuperado invirtiendo el LCG del fotograma de siembra).

| Medida | ROM | Port |
|---|---|---|
| Fotograma de siembra | 1884 | paso 1762 (la ROM tarda ~122 más: arranque y carga de guardado) |
| Pasos del LCG en el fotograma de siembra | 2 | 2 |
| Pasos del LCG por fotograma después | 1 | 1 |
| Índice de cadena desde la semilla, 2.417 fotogramas (menú, Oak) | — | **idéntico en todos** |

Comando: `python3 tools/rom-compare/compare-rng.py <rom_trace> <port_trace>`.

Lo que **sí** demuestra: el consumo de `Random()` entre la siembra del título y la charla de
Oak coincide llamada a llamada, y el arreglo de §9 es correcto.
Lo que **no** demuestra:
- Que RNG coincida cuando haya consumidores reales (combates, encuentros, nombres, objetos):
  en este tramo no hay ninguno, por eso no hay una sola diferencia que ver.
- Ningún estado de juego (mapa, posición, flags, equipo, dinero). Esa es la fase 4.
- El tiempo de pantalla: tras sembrar, la ROM tarda +17 fotogramas hasta `CB2_InitMainMenu`
  y +22 hasta la charla de Oak; el port está en el menú en +0 y en Oak en +2 (la carga de
  guardado de `LoadGameSave` no está modelada). Con entrada fijada por fotograma, esta
  diferencia de latencia desplaza qué pulsación recibe cada pantalla en cada lado.

Hallazgo de herramienta: `frStartupStep` re-arma `requestAnimationFrame` en cada tick; si el
arnés cede el control (`await`) el navegador avanza fotogramas por su cuenta. El arnés
cancela el `raf` tras cada paso.

### Siguiente: fase 4 (estado de juego)
1. Verificar en la ROM `gSaveBlock1Ptr`→`pos` (x, y), `location` y `gSaveBlock2Ptr`→nombre
   jugando hasta la habitación (necesita pasar la charla de Oak y nombres, con teclas
   deterministas para el teclado de nombres).
2. Volcar mapa/posición/dirección y flags/vars desde la ROM y compararlos con
   `frDebug.state()` en el mismo punto; primera divergencia = primera tarea.
3. Fijar la latencia de entrada: o bien anclar cada pulsación a un evento observable
   (callback activo en la ROM, escena en el port) en vez de a un fotograma.

## 11. Resultado de la fase 4: partida nueva hasta el cuarto del jugador (2026-10-10)

Guion de entrada (idéntico en ROM y port, relativo al título): START a +300, A cada 20
fotogramas desde +487. Con A pulsada, la ROM pasa por Oak, género BOY y los dos teclados de
nombres (`AAAAAAA` para jugador y rival) hasta la habitación. Estado volcado a +229 fotogramas
del overworld:

| Campo | ROM (`drive.lua`) | Port (`port-new-game.mjs`) |
|---|---|---|
| Mapa (grupo, número) | 4, 1 | 4, 1 (`MAP_PALLET_TOWN_PLAYERS_HOUSE_2F`) |
| Posición | 6, 6 | 6, 6 |
| `warpId`, x, y de `location` | 255 (= -1), 6, 6 | -1, 6, 6 |
| Nombre | `BB×7 FF` | `187×7, 255` (igual) |
| Género | 0 | 0 |
| Trainer ID, mitad baja | `0xbd99` | `0xbd99` tras la corrección |
| Trainer ID, mitad alta | `0xf45c` | `0xc153` |
| RNG | `0x5016545c` | `0xbfdda482` |

### Divergencia real encontrada y corregida
`naming_screen.c` `DoNamingScreen` llama a `StartTimer1()` para `NAMING_SCREEN_PLAYER` y
`MainState_Exit` llama a `SeedRngAndSetTrainerId()` al salir. La ROM **resiembra** el LCG y la
mitad baja del Trainer ID con el valor de Timer1 (aquí `0xbd99`, no la semilla del título
`0x3649`). El port no lo hacía: conservaba la semilla del título. Corregido en
`src/fr/namingScreen.ts`; el Trainer ID bajo ya coincide. `check:all` 45 PASS, 0 regresiones.

### Diferencias que quedan, y por qué no se tratan como errores
Mitad alta del Trainer ID y RNG dependen del número de fotogramas entre la resiembra y
`InitPlayerTrainerId`: 1.907 en la ROM frente a 2.014 en el port (107 de diferencia). La
línea de tiempo por callbacks, relativa al inicio de la charla de Oak:

| Evento | ROM | Port | Diferencia |
|---|---|---|---|
| 1ª pantalla de nombres | +2.429 | +2.355 | port 74 antes |
| Duración del teclado 1 | 220 | 200 | 20 |
| Entre fin del teclado 1 y 2ª pantalla | 610 | 590 | 20 |
| Duración del teclado 2 | 222 | 202 | 20 |
| Retorno de nombres → overworld | 1.057 | 1.017 | 40 |

Todas son múltiplos de 20, el intervalo de la pulsación A: lo que se ve es la cuantización
de la entrada por fase, no un cálculo distinto. Para decidir si hay una divergencia real de
lógica (p. ej. el teclado, que parece durar siempre 20 menos en el port) hace falta
sincronizar la entrada por evento (cuándo cada pantalla acepta A) y no por fotograma.

### Qué queda de la fase 4
1. Entrada sincronizada por eventos en ROM y port (callback/tarea activos, texto terminado).
2. Comparar el Trainer ID alto y el RNG con esa entrada; si siguen distintos, medir la latencia
   de `LoadGameSave` (+17/+22 fotogramas tras sembrar en la ROM, +0/+2 en el port).
3. Verificar `gPlayerParty` y objetos de campo cuando haya equipo (tras el laboratorio).

## 12. Por qué los fotogramas no coinciden: lag de CPU de la ROM (2026-10-10)

Objetivo: explicar los 216 fotogramas entre la ROM y el port antes de la primera pantalla de
nombres (§11). Método: captura de cada fotograma en ambos lados (`drive.lua` con
`DRIVE_SHOTS`; `port-new-game.mjs` con `toDataURL`) y comparación de cuándo cambia la imagen.

| Medida (relativa a la pulsación A en la página 1 de «CONTROLS») | ROM | Port |
|---|---|---|
| Latencia hasta empezar el fundido de salida | +3 | +2 (1 fotograma por la inyección de Lua) |
| Duración del fundido de salida | 12 | 12 |
| Página 1 se borra | +21 | +20 |
| Página 2 en blanco hasta empezar el fundido de entrada | **~10** | ~2 |
| Duración del fundido de entrada | 12 | 12 |

La lógica de fundido (`deltaY`, alternancia OBJ/BG, `softwareFadeFinishing`) coincide con
`palette.c`: 17 fotogramas activos por fundido, igual en ambos. La diferencia es un **hueco de
~8–10 fotogramas** entre «borrar la página» y «empezar a mostrar la siguiente» en la ROM. El
C no tiene ninguna espera ahí (`Task_ControlsGuide_ChangePage` → `Task_ControlsGuide_LoadPage`
→ `BeginNormalPaletteFade`), así que es **tiempo de CPU**: montar tres ventanas de texto,
volcar tiles y tilemaps tarda más de un fotograma en la GBA. Durante ese lag los VBlanks
siguen ocurriendo (contador de fotogramas y `Random()` avanzan), pero el bucle principal no.

Consecuencias:
- El número de fotogramas entre dos eventos depende de la carga de CPU de la ROM, que el port
  no modela (hace ese trabajo en 0 tiempo). Cualquier cosa que dependa de fotogramas
  transcurridos —tiradas de RNG con entrada temporizada, Trainer ID alto, semillas de
  encuentros— no puede coincidir fotograma a fotograma sin un modelo de coste de CPU.
- Con entrada por reloj de pared (A cada 20 fotogramas) estos desfases se amplifican por
  cuantización: una pulsación perdida cuesta 20 fotogramas.
- La latencia de `LoadGameSave` tras sembrar en el título (17 fotogramas) sí es un hueco
  fijo y medible; se modela desde `startup.ts` (`SAVE_LOAD_FRAMES`).

### Cómo comparar entonces
1. **Lógica y estado**: sincronizar por evento (pantalla/callback alcanzado), no por tiempo.
2. **Resultados dependientes de RNG**: escribir el mismo `gRngValue` en ROM y port en el
   evento de partida (Lua puede escribir en `0x03005000`; el port, vía `seedRng`/estado de
   `random.ts`) y comparar a partir de ahí, p. ej. un combate o un encuentro.
3. **Latencias grandes y fijas** (guardado, pantallas de carga) se pueden modelar como
   esperas medidas; el lag disperso de CPU no.

## 13. Resultado de la fase 5: cuarto → pueblo → laboratorio → inicial (2026-10-10)

Método: la ROM se maneja con estados guardados de mGBA (`emu:saveStateFile`/`loadStateFile`, 2.300
fotogramas por iteración en vez de 7.000) y teclas por fotograma; el port con la misma ruta pero con
esperas por posición/mapa/script. Se compara **estado** (mapa, posición, flags, vars, equipo) en
puntos lógicos, no fotogramas. Direcciones nuevas verificadas: `gPlayerParty` `0x02024284` (la mon
aparece con OT = Trainer ID y nivel 5), contador `0x02024029`.

Dos divergencias reales, ambas con impacto en el juego, encontradas y corregidas (`620303ab`):

1. **`applymovement` no funcionaba nunca.** `ScriptMovement.GetMovementScriptIdFromObjectEventId`
   buscaba el hueco libre (`MOVEMENT_SLOT_EMPTY`) entre entradas `undefined`, así que nunca lo
   encontraba, y además `ScriptMovement_AddNewMovement` escribía puntero y bit "terminado" antes
   de que existiera la entrada. Efecto: ningún personaje caminaba en escenas con script (Oak
   guiando al jugador, entrada al laboratorio, etc.); el script seguía como si hubiera terminado.
   El commit `3b709ab5` ya había tapado un síntoma (el `waitmovement` colgado) sin arreglar la causa.
2. **Ventana de aparición de objetos.** `TrySpawnObjectEvents` comparaba la cámara con las
   coordenadas de la cabecera del mapa en vez de `template->x/y` (C: `event_object_movement.c`),
   así que un objeto movido con `setobjectxyperm` (Oak, al entrar al laboratorio) no aparecía.

| Comprobación | Antes | Después |
|---|---|---|
| Jugador al terminar la escena de Oak en el laboratorio | (6,12), sin Oak ni rival | **(6,4)**, igual que la ROM |
| `applymovement` (llamadas que tienen éxito) | 0 | todas |
| Flags y vars tras elegir inicial (ROM vs port) | — | **idénticos** salvo `FLAG_0x838` y `VAR_0x403C`, sin nombre, ya distintos en la habitación (candidatos: Quest Log/sistema) |
| Inicial | — | Bulbasaur nivel 5, apodo `AAAAAAAAAA` (ROM y port) |
| `check:all`, build, gate del driver | 45/45; — | 45/45; build OK; **20/20** |

Limitaciones: la elección se hizo con A repetida en ambos lados; PID/IV del inicial dependen del RNG
por fotograma y difieren (ver §12), así que no se comparan. En modo manual de Playwright los
fanfarrias y fundidos dependen del reloj real; el recorrido condicionado se verificó en tiempo real
(`?fr=new` con teclado) y el arnés manual necesita esperas de pared.

Siguiente: batalla con el rival al salir del laboratorio, con RNG inyectado en un evento; y revisar el resto
de usos de movimiento por script (los que no funcionaban hasta ahora): cualquier escena puede tener
ahora comportamiento nuevo.
