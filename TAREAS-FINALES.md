# Tareas finales del juego de un jugador

Lista única de lo que queda del port de un jugador. Cifras vivas en
[PENDING.md](PENDING.md); estado breve en [PORTING-STATUS.md](PORTING-STATUS.md).
Por nombres el juego está completo (lo que falta es enlace, hardware sustituido o
código sin caller en el C); lo pendiente es cerrar la sección 1, revisar contra el C
(2), validar en navegador (3) y recorrer la historia (4).

Meta de producto acordada: el visor en modo navegación debe evolucionar hasta ser
la interfaz del juego completo, incorporando NPC, scripts, historia, combates,
menús y guardado sobre la navegación existente.

## Máxima prioridad vigente: puntos 1 a 8

Decisión expresa del usuario (2026-10-15). Este orden sustituye las prioridades
anteriores de esta lista y rige la continuación de todos los agentes. El primer
punto de control de §6.5p es una base implementada; no da estos puntos por cerrados.

1. Pulir la experiencia dentro del visor para que todo se vea natural, sobre el mismo mundo y sin saltar a otro escenario en una ventana.
2. Completar NPC y scripts de Centros Pokémon.
3. Completar tiendas: comprar, vender y guardar los cambios.
4. Integrar combates salvajes y captura.
5. Completar equipo, mochila y menús necesarios para jugar.
6. Integrar combates contra entrenadores.
7. Completar el gimnasio de Brock y su medalla persistente.
8. Completar los otros siete gimnasios y sus eventos.

**Solo por petición expresa del usuario; no iniciar automáticamente al terminar el punto 8:**

9. Integrar el resto de la historia y los NPC.
10. Revisar toda la navegación, gráficos, animaciones y sonido.
11. Sustituir el inicio temporal por el definitivo.

Dentro de 1–8 se pueden resolver las dependencias y los bloqueos concretos que
necesite esa entrega; eso no autoriza ampliar el alcance al resto de la historia
ni a una revisión general. Las tareas diferidas se conservan abiertas. La
reorganización de carpetas/documentos sigue diferida. Al cerrar 1–8, detener la
continuación automática y esperar la siguiente petición del usuario.

### Estado al 2026-10-16 (viewer jugable; detalle en Git)

Hecho y verificado con `tools/playtest/smoke/viewer-game-*.job.mjs` (Chromium, teclado): tiendas y venta (todas las marts y Celadón), 19 Centros (curación, PC, respawn), menú de inicio (Pokédex, equipo, mochila, resumen, orden, opciones, guardar), objetos de bolsa (Poción, Antídoto, baya, MT, Mapa, Buscatesoros, dar, tirar, Bici, Repelente), combates salvajes, captura y derrota, pasos (veneno, huevo), Corte, entrenadores y Brock (Fame Checker incluido), Teletransporte, Vuelo, Cuerda Huida y Excavar.
Las pruebas usan precondiciones explícitas (objetos, nivel, estado, flags) marcadas PREPARED en cada job.

### Pendientes adicionales de las tareas importantes (1–8), de sencillo a complejo

Anotados el 2026-10-16 a partir de lo que esa sesión dejó sin probar, sin verificar o sin revisar. No se borran sin resolverlos.

**A. Solo probar (el código ya existe)**
- [x] Tiendas: Isla Dos por etapas en `74665100` (`viewer-game-two-island-shop`: `VAR_MAP_SCENE_TWO_ISLAND` 0/2/3/4, bandera de presentación y artículo exclusivo de cada lista); las demás tiendas de Sete (Islas Tres, Cuatro, Seis, Siete) ya estaban en `viewer-game-shops-all`. Game Corner en `324b3879`/`03b95346`; los NPC que regalan fichas son historia (punto 9).
- [x] Centros: reaparición tras derrota en un Centro ya visitado — `e4036097` (`viewer-game-whiteout-center`: enfermera de Verde registra el respawn, guardar/recargar lo conserva, derrota en Ruta 1 y Mt. Moon 1F reaparece en el Centro de Verde curado; −40 ₽ como el C).
- [x] Menú: Pokédex con más entradas y vistas — `f0e6231b` (`viewer-game-pokedex`: portada, lista numérica, dos fichas, página de zona/tamaño, recuentos visto/capturado). Opciones en `46aa35a3` y tarjeta en `d94463f5`. Fallo visual abierto en B (sprites de tamaño/zona).
- [x] Objetos: cañas (probado en 151c6bbb con viewer-game-fishing), bayas y objetos de estado distintos de Antídoto, mochila con otros bolsillos (Poké Balls fuera de combate, Objetos clave variados), Poké Flauta.
- [ ] Brock: segundo intento tras perder hecho en `e4036097` (`viewer-game-gym-retry`: Liam vuelve a retar, medalla al segundo intento; regreso al gimnasio por URL, no caminando). Falta ganar con el inicial sin preparar el nivel (requiere entrenar; `viewer-game-gymloss` necesita `PW_TIMEOUT_MS=300000`).
- [x] Reaparición: derrota dentro de cuevas e interiores — `e4036097` (Mt. Moon 1F y gimnasio de Plateada).
- [x] Rocas rompibles y bloques de Fuerza en cuevas — Golpe Roca en Túnel Roca B1F (`viewer-game-r3`, preparación del Nv.50 corregida en `f0e6231b`), interruptor de Calle Victoria (`viewer-game-strength`) y caída de bloque por agujero de Islas Espuma 1F→B1F (`viewer-game-seafoam-boulder`, `f0e6231b`).
- [x] Entrenadores fuera del gimnasio y los otros gimnasios — `e4036097` (`viewer-game-route-trainers`: Greg y Ben en Ruta 3, Rick en Bosque Verde; vista, premio 4×nivel×tasa de `battle_main.c`, flag persistente y sin nuevo combate) y `b5108d77` (`check:gyms`). Resto de entrenadores de ruta sin recorrer.
- [x] Precargas: medido el 2026-10-18 — los pasos se cuentan siempre (Paleta→Ruta 1 sin parar: 13 casillas, 13 pasos; interior 5/5); si se camina antes de que el motor termine de cargar (se precarga a los 1,5 s), el primer paso tarda ~0,5 s en vez de ~0,27 s.
- [x] Veneno hasta desmayo y eclosión con apodo; huevo con ciclos > 0 sin preparar el contador — `c05ce98d` (`viewer-game-poison-faint`: con compañero sin whiteout y −5 amistad, solo con whiteout; `viewer-game-egg-hatch`: eclosión a los 511 − contador pasos exactos, apodo AAA con START→OK, que antes no llegaba al motor).

**B. Comparar o revisar contra la ROM / el C**
- [ ] Fondo magenta del resumen del Pokémon: la paleta fuente tiene magenta como color 0; comparar con la ROM.
- [ ] Estado de vídeo del mapa sin portar: el overworld en canvas no ejecuta `InitOverworldBgs`/`InitOverworldGraphicsRegisters` (ni en `LoadMapInStepsLocal` ni en el visor), así que las pantallas que heredan ese estado arrancan sin él: la Pokédex sin `OBJ_ON` (`DISPCNT=0x0f00`; siluetas de tamaño y marcadores de zona invisibles) y la eclosión con la paleta BG 15 vacía (cuadro SÍ/NO negro; el C la deja el cuadro de mensajes con `LoadStdWindowFrameGfx`). Decisión de arquitectura pendiente: cómo convive ese estado PPU con el canvas del mapa y la proyección del visor. También el icono de la página de zona/tamaño de la Pokédex sale con colores erróneos.
- [ ] Scripts de transición de mapa fuera de los Centros (p. ej. `Route20_OnTransition`, que reinicia los bloques de Islas Espuma) no se ejecutan en el visor; con entrada por URL los bloques del B1F de Islas Espuma están visibles desde el principio. Pertenece a la integración de la historia (punto 9).
- [ ] `check:anims` falla por falta de `public/fr/incbin/pokeball.bin` (también antes de `03b95346`); `03b95346` cambió `CopyToBgTilemapBuffer` para fuentes u16, revisar fondos de animaciones de combate (Atracción, Cara Susto) cuando el check vuelva a correr.
- [ ] Rótulos y orden de las pantallas del motor proyectadas a pantalla completa frente a la captura de ROM (paridad audiovisual).
- [x] Posición de entrenadores al terminar el combate — `f5e80a9c`. Chromium: Liam se acerca (3,8)→(5,8), premio al jugador 3.000→3.220, conserva posición/orientación tras menú, bloquea casilla nueva y permite caminar a la antigua (URL/equipo/movimiento de ataque PREPARED; sin preparar victoria ni movimiento). Tipos/honesty/build y 58 checks PASS; persistencia de poses añadida en `31dfe405`; revisión general abierta abajo.
- [ ] Objetos que el motor oculta/desplaza al final de un script y su sincronía con el visor. PARCIAL `f5e80a9c`: puente de posición/dirección/invisibilidad y retiradas explícitas de objetos observados del mapa actual; hidrata instancias ya cargadas en la siguiente interacción y actualiza colisiones/sectores. Invisibilidad con colisión, identidad por mapa y retiradas no indexadas comprobadas con fixtures PREPARED; Corte y flags en Chromium PASS. `31dfe405`: guarda/restaura posición, orientación, invisibilidad y retiradas observadas en la partida, con reinicio al cambiar de mapa y compatibilidad legacy. Chromium: Liam real, guardar/Continuar/recargar URL y colisiones PASS; menú fuente SAVE PASS. Serialización y estados especiales con fixtures PREPARED. `c46538b4`: observación/retiradas identifican el mapa propietario; convierte coordenadas cargadas↔propietario, hidrata identidades por mapa y guarda clones observados en proyección v2 compatible con v1. Chromium: clon Ruta 9 desde Celeste, menú→guardar/Continuar/recargar, culling sin retirada y retorno a Ruta 9 PASS; fixtures PREPARED de siete clones y migración, tipos/honesty/build PASS. `20c7e4e8`: selección/interacción de clones por `{ mapId, localId }` vía `GetObjectEventScriptPointerByObjectEventId` (`GetObjectEventTemplateByLocalIdAndMap` resuelve plantillas de mapas foráneos sin colisión de `localId` homónimos) y captura fresca de `viewerObjects` antes/durante `SAVE` fuente y guardado del visor (`check:viewer-warps` con fixtures PREPARED PASS). `d5986c54`: `addobjectat`/`removeobjectat`/`setobjectxyperm`/`copyobjectxytoperm`/`setobjectmovementtype` sincronizan `save.objectEventTemplates` y `viewerObjects` incluso para plantillas fuera de la ventana de spawn, `prepareObjects` instancia con `TrySpawnObjectEvent` objetos desplazados a la cámara actual y sincroniza `graphicsId` (`VAR_OBJ_GFX_ID_*`), `elevation` y `movementType` entre motor y visor (`check:viewer-warps` con fixtures PREPARED PASS). Falta validación jugable en navegador de los scripts del alcance.
- [x] Predicados de aparición de árboles/rocas junto a conexiones — `059a1a25`: familia C compartida por motor/visor, identidad fuente de clones sin duplicar entidades y retención de obstáculos activos entre conexiones/reconstrucciones. Chromium: Corte→guardar/Continuar/recarga→Celeste, clon cercano oculto, aparición al alejarse y regreso a Ruta 9 sin activar flag de ocultación PASS (URL/medalla/movimiento PREPARED). Fixtures PREPARED: límites inclusivos, cuatro bordes, flags y siete identidades/coordenadas fuente PASS; tipos/honesty/build PASS. Pendiente: recorrido del resto de fronteras/clones NPC y revisión jugable en navegador (fila anterior sigue abierta).

**C. Cambios de tamaño medio**
- [x] Retirar la lista DOM de equipo/mochila y añadir acceso desde ajustes al menú del motor — `5af2a378`. Chromium: apertura/retorno, resumen/orden del equipo, Poción, opciones persistentes, sesión y compra/recarga PASS; precondiciones PREPARED de los jobs conservadas. 58 checks/tipos/honesty/build PASS; táctil y paridad audiovisual siguen pendientes.
- [ ] Entrada táctil/móvil para el menú del juego (Enter no existe; solo hay botón) y para los combates.
- [x] Presencia general por flags de guardado, exteriores/interiores, dibujo/colisión/interacción y banderas iniciales fuente solo en partidas nuevas — `2fc61ad4`. Chromium: ocultar/restaurar, guardado cambiado/recarga, interior numérico, Corte y sesión PASS; victoria real Liam/Brock (equipo Nv.40 PREPARED), medalla/MT y carga de Plateada (URL PREPARED): guía oculto/ayudante visible PASS. 49 flags iniciales contrastadas con fuente; 58 checks/tipos/honesty/build PASS.
- [x] Ciclo temporal por mapa y conservación de plantillas retiradas — `50350097`. Reutiliza `clearTempFieldEventData` en conexiones/puertas/warps del motor; menú/continuar conservan el estado del mapa y los flags temporales no se propagan a otros sectores. Chromium: Corte real→guardar/Continuar/recarga→Celeste, puerta/menú de Paleta, presencia general, Cuerda Huida y Excavar PASS; entradas PREPARED según jobs. Check existente cubre warp al mismo mapa y retirada/restauración sin flag (fixtures PREPARED); 58 checks/tipos/honesty/build PASS.
- [x] Visor: persistencia de posiciones/direcciones/invisibilidad/retiradas **observadas del mapa actual** — `31dfe405`: Liam real conserva pose y colisiones tras guardar/Continuar/recargar URL; compatibilidad legacy y serialización con fixtures PREPARED. La persistencia de clones y plantillas fuera de spawn se amplió en `c46538b4` y `d5986c54` (validación jugable abierta en B y R1).
- [ ] Quest Log conectado a los eventos del visor.
- [x] Tarea de curación del Centro tras derrota (`FieldCB_RushInjuredPokemonToCenter`) y su diálogo — `a2eed273`: `PrintWhiteOutRecoveryMessage` usa coordenadas píxel `x, y` y velocidad `1` como `AddTextPrinterParameterized4` en `field_screen_effect.c`; `EngineInteraction` mantiene la pantalla en negro durante `CB2_WhiteOut` y `Task_RushInjuredPokemonToCenter`, reubica el visor al mapa de curación al iniciar `FieldCB_RushInjuredPokemonToCenter` y ejecuta `EventScript_AfterWhiteOutHeal` o `EventScript_AfterWhiteOutMomHeal` antes de devolver el control. Validación jugable en navegador pendiente.
- [ ] Contadores por paso fuera de pasos reales (bici rápida, saltos) y sincronía de pasos en mapas distintos.

**D. Integración nueva**
- [x] Empujar bloques con Fuerza (mover entidad con colisión, interruptores y pozos) — `b4f81dc5`.
- [x] Pesca (cerrada en `151c6bbb`; smoke test `viewer-game-fishing` PASS), Golpe Roca, olor dulce y Zona Safari (cerrados en `0d86ddb4`; smoke test `viewer-game-r3` PASS); pendientes fantasmas de Pokémon Tower, merodeadores.
- [x] Surf con la MO real y acciones desde el equipo (Flash, Corte, Fuerza) — cerrado en `443d3152`: requisito de Medalla Alma FLAG_BADGE05_GET y MOVE_SURF, rechazo en orilla sin medalla/movimiento, sustitución de embarque automático por diálogo y salto de EventScript_UseSurf, máscara PLAYER_AVATAR_FLAG_SURFING, sincronía de vehículo/coordenadas, navegación en agua y desembarco natural en tierra, y acciones Flash/Corte/Fuerza desde menú de equipo; validado en check:field-moves, viewerMovement y smoke test viewer-game-r5 PASS.
- [x] Vuelo/Teletransporte/Cuerda Huida con animación completa — cerrado en `12fa87a5`: animaciones completas y ciclo de warp de salida/llegada para Vuelo, Teletransporte y Cuerda Huida/Excavar; correcciones de dirección/movimiento y persistencia de reubicación sin corte prematuro; validado en check:field-moves PASS.
- [x] Los otros siete gimnasios con sus puzzles y eventos propios (punto 8) — `b5108d77`: accesos (árboles de Corte, Silph Co., Llave Secreta, 7 medallas), puzzles y mecánicas (papeleras de Carmín, laberinto vegetal de Azulona, barreras invisibles de Fucsia, teletransportadores de Azafrán, máquinas de preguntas 1-6 de Canela y paneles de giro/stop de Ciudad Verde), 34 entrenadores, 7 líderes (Misty, Lt. Surge, Erika, Koga, Sabrina, Blaine, Giovanni), 7 MTs, medallas 2 a 8, obediencia de nivel (30, 50, 70, 100), autorización de MOs de campo (Corte, Vuelo, Fuerza, Surf, Golpe Roca, Cascada) y persistencia de guardado; validado en check:gyms PASS.

**E. Fuera de las prioridades 1–8 (solo por petición expresa)**
- [ ] NPC genéricos y eventos de mapa (punto 9): hoy corren enfermeras, tenderos, obstáculos de campo, entrenadores y gimnasios; el resto muestra un texto genérico.
- [ ] Revisión general de navegación, gráficos, animaciones y sonido (punto 10) e inicio definitivo (punto 11).

## Hoja de ruta para el siguiente agente

Punto de entrega: 2026-10-17, código `f0e119c3` + `277bbbe6` (zoom `5×`/`6×`, preferencias y HUD), `d5986c54` (R1.3/R1.5 sincronía de plantillas y mutaciones de posición), `a2eed273` (C.75 curación tras whiteout), `6bfc21a5` (validación en navegador R1/C.75 PASS), `b4f81dc5` (R2: Fuerza y bloques de empuje en visor PASS), `151c6bbb` (R3 pesca y caña registrada PASS), `0d86ddb4` (R3 Golpe Roca, Dulce Aroma y Zona Safari PASS), `a91d31b3` (R4 evolución tras subida de nivel, aprendizaje/reemplazo de movimientos, retorno a visor y guardado PASS) y `443d3152` (R5 Surf mediante MO auténtica y acciones desde equipo: Flash, Corte y Fuerza PASS). Continuar por R6 (Vuelo/Teletransporte/Cuerda Huida), luego R7.
Esta sección ordena las tareas abiertas de arriba; no sustituye sus límites ni
abre otra lista de trabajo. La meta es completar el juego de un jugador dentro
del visor, con lógica fuente y guardado compartido; la cobertura por nombres no
mide esa integración ni la fidelidad.

### Arranque y reglas de continuidad

1. Leer `AGENTS.md`, `PORTING-STATUS.md`, esta sección y la fila de la tanda elegida;
   comprobar `git status` y la rama. Un agente a la vez en `main`, sin ramas,
   worktrees, subagentes ni push. Preservar cambios ajenos.
2. Empezar por **R6** (Animaciones completas de Vuelo/Teletransporte/Cuerda Huida). No volver a implementar flags, Corte, Fuerza, pesca, Golpe Roca, Dulce Aroma, Safari, evolución, aprendizaje de movimientos ni Surf: ya están conectados. Confirmar el
   estado vivo antes de editar; los commits citados son evidencia, no un permiso
   para restaurar archivos completos ni descartar cambios posteriores.
3. Una tanda integrada por archivo/familia o dependencia funcional completa;
   leer C, tipos, tablas y callers. No inventar retornos, stubs ni progreso de
   historia para cerrar una prueba. Los puntos 9–11 siguen sin autorización.
4. No lanzar una revisión general ni todas las suites por rutina. Navegador solo
   cuando lo pida el usuario o para diagnosticar un fallo concreto. Si una tanda
   no se prueba jugando, dejar explícito ese límite.

### Lo que ya se entregó y no se debe rehacer

| Entrega | Estado comprobado | Límite que conserva |
| --- | --- | --- |
| `2fc61ad4` | Flags controlan presencia, colisión e interacción; inicialización desde fuente solo en partidas nuevas | No ejecuta toda la historia |
| `50350097` | Ciclo temporal por mapa; menús/Continuar conservan temporales | No sustituye las reglas de spawn |
| `f5e80a9c` | Poses/invisibilidad/retiradas explícitas observadas pasan del motor al visor; Liam se mueve realmente tras acercarse | Solo objetos observados del mapa actual |
| `31dfe405` | Guardar/Continuar/recargar conserva pose, orientación y colisión de Liam; SAVE fuente escribe la misma partida | Proyección del visor de un mapa; no es el snapshot completo de slots del motor |
| `059a1a25` | Predicados C compartidos de árboles/rocas; siete identidades/coordenadas de clones contrastadas; Corte y Ruta 9↔Celeste con aparición/retención comprobadas | No demuestra sincronización completa de clones NPC ni de todos los bordes |
| `c46538b4` | Proyección cargado↔propietario, observación/retiradas por identidad, hidratación y guardado v2 de clones observados; v1 compatible; clon Ruta 9 desde Celeste sobrevive menú/guardar/Continuar/recarga y culling | Selección de scripts, actores nunca cargados y captura fresca durante SAVE fuente siguen pendientes |
| `20c7e4e8` | Selección/interacción de clones por `{ mapId, localId }` vía `GetObjectEventScriptPointerByObjectEventId` (`GetObjectEventTemplateByLocalIdAndMap` en cabeceras foráneas sin colisión de `localId` homónimos) y captura fresca de `viewerObjects` en SAVE fuente/visor (`check:viewer-warps` PREPARED PASS) | Validación jugable en navegador de R1 verificada en smoke job Brock |
| `d5986c54` | `addobjectat`/`removeobjectat`/`setobjectxyperm`/`copyobjectxytoperm`/`setobjectmovementtype` sincronizan `save.objectEventTemplates` y `viewerObjects` fuera de spawn; `prepareObjects` instancia con `TrySpawnObjectEvent` en cámara y sincroniza `graphicsId`/`elevation`/`movementType` (`check:viewer-warps` PREPARED PASS) | Validación jugable en navegador de R1 verificada en smoke job Brock |
| `a2eed273` | `FieldCB_RushInjuredPokemonToCenter` + `EventScript_AfterWhiteOutHeal`/`EventScript_AfterWhiteOutMomHeal` integrados en `EngineInteraction` tras derrota, con `PrintWhiteOutRecoveryMessage` corregido a coordenadas píxel `(x, y)` y velocidad `1` | Validación jugable en navegador de C.75 verificada en smoke job whiteout |
| `a6d44c03` | Corrección de ciclo TDZ en `fieldMoves.ts` (`DIR_EAST`); validación jugable completa en navegador con smoke jobs `viewer-game-whiteout` (derrota, curación y reaparición en casa) y `viewer-game-brock` (gimnasio Brock, MT39, objetos dinámicos de Ciudad Plateada y persistencia de guardado PASS) | No cubre el resto de gimnasios ni mapas no visitados en los smoke tests |

Las pruebas de juego citadas emplean entradas PREPARED declaradas en los jobs.
No equivalen a un recorrido desde Nueva partida ni a comparación audiovisual ROM.
Los contadores vivos están exclusivamente en `PENDING.md` y `PORT-INVENTORY.md`.

### R1. Completar el puente de objetos antes de construir más eventos

**Objetivo:** un objeto conserva identidad fuente, posición y estado correctos
cuando se representa como clon o sale de la ventana de spawn. Los cambios hechos
por scripts deben verse y colisionar correctamente, y sobrevivir al guardado
cuando el C los conserva. Corresponde a la fila abierta B de objetos dinámicos.

**Inspección concreta pendiente, en este orden:**

1. **Identidad/proyección entregadas en `c46538b4`.** El clon conserva el mapa
   propietario y normaliza sus coordenadas desde el mapa realmente cargado del
   motor; la hidratación hace la transformación inversa. Observación y retiradas
   ya no descartan clones por pertenecer a otro mapa. Conservar estos contratos.
2. **Selección/interacción de clones conectada en `20c7e4e8` (validado en navegador con `viewer-game-brock`).**
   `show`, `present`, `close`, `interactWithEntity` y `GetObjectEventTemplateByLocalIdAndMap`
   resuelven por `{ mapId, localId }` y `GetObjectEventScriptPointerByObjectEventId`
   sin confundir `localId` homónimos (`check:viewer-warps` PREPARED PASS y smoke job Brock PASS).
3. **Actores fuera de spawn conectados en `d5986c54` (validado en navegador con `viewer-game-brock`):**
   `addobjectat`, `removeobjectat`, movimientos y cambios de coordenadas/plantillas
   (`setobjectxyperm`, `copyobjectxytoperm`, `setobjectmovementtype`) persisten en
   `save.objectEventTemplates` y `viewerObjects`, y `prepareObjects` instancia con
   `TrySpawnObjectEvent` cuando entran en la cámara (comprobado con ayudante de Deportivas tras victoria en Brock).
4. **Persistencia observada v2 (`c46538b4`), captura fresca en SAVE (`20c7e4e8`) y plantillas fuera de spawn (`d5986c54`) (validado en navegador con `viewer-game-brock`).**
   `observeObjects`/`onScriptObjectRemoved` y el guardado del visor actualizan
   `save.viewerObjects` y `save.objectEventTemplates` antes de serializar `saveStore.write(save)` (verificado con recarga de partida en Ciudad Plateada).
5. **Campos `graphicsId`, `elevation` y `movementType` conectados en `d5986c54` (`check:viewer-warps` PREPARED PASS y `viewer-game-brock` PASS).**
   Conservar pendientes otros campos o casos que aparezcan en mapas avanzados.

**Archivos de entrada y fuente:**

- `src/viewer/engineInteraction.ts`: `objectState`, `observeObjects`,
  `prepareObjects`, `show`, `finish` y observador `onScriptObjectRemoved`.
- `src/viewer/main.ts`: `readObjects`/`syncObjects`, `applyViewerObjects`,
  `continueViewerSession`, `renderMap` y cambios de mundo/mapa.
- `src/viewer/objectState.ts`, `session.ts`, `mapEvents.ts`,
  `render/entities.ts`, `data/objectPresence.ts`, `data/objectSpawns.ts`.
- `src/core/field/objectEvents.ts`, `objectSpawnRules.ts`, `overworld.ts`;
  `src/games/firered/loadSave.ts` y `save.ts` para slots y serialización.
- Fuente: `../pokefirered/src/event_object_movement.c` (inicialización de clones,
  spawn/culling, coordenadas y retirada), `overworld.c`, `scrcmd.c`,
  `load_save.c` y scripts de los mapas elegidos. Leer los cuerpos completos y
  los callers de la familia, sin recuperar el procedimiento histórico.

**Precauciones de la implementación vigente:**

- `ViewerObjectSpawns` conserva obstáculos activos entre conexiones; warp forzado
  reinicia el estado. `retainedViewerObjects` es una adaptación temporal durante
  `prepareViewerInteraction`, se limpia en `finally` y evita volver a aplicar
  efectos de inicialización a identidades ya activas. No es un estado C persistente.
- La ausencia de un objeto en `objects.list` no acredita `removeobject`.
  `onScriptObjectRemoved` distingue retirada explícita de culling.
- Los siete clones del índice son cinco árboles y dos NPC. El de Ruta 21 Norte
  apunta al objeto 2 de Paleta; el de Ruta 4 al objeto 12 de Celeste. Usar datos
  exportados para confirmar flags, coordenadas y scripts, no resultados inventados.
- No editar a mano `public/fr/` ni `src/games/firered/generated/`.

**Criterios para cerrar R1:** identidad por mapa sin duplicados ni confusión entre
IDs homónimos; transformación de coordenadas correcta; culling distinto de
retirada; colisión/invisibilidad coherentes; menú no reinicia posiciones;
conexión y warp respetan sus ciclos; SAVE/Continuar/recarga conserva los estados
que correspondan; partidas antiguas siguen cargando. Usar NPC/objetos reales y
resultados producidos por scripts cuando se haga comprobación de juego. Si solo
hay fixtures estáticos PREPARED, declarar esa cobertura y mantener la revisión
jugable abierta. No cerrar toda la fila B con un único caso de clon.

### R2–R7. Orden posterior dentro de las prioridades 1–8

| Orden | Trabajo | Condición de cierre |
| --- | --- | --- |
| R2 | Fuerza y bloques en interiores/cuevas | Cerrado en commit `b4f81dc5`: empuje de rocas OBJ_EVENT_GFX_PUSHABLE_BOULDER (32 ticks, SE_M_STRENGTH), colisión y límites, pozo MB_FALL_WARP (SE_FALL), botones MB_STRENGTH_BUTTON (Victory Road 1F), diálogo fuente de Fuerza y persistencia de coordenadas en save.viewerObjects; validado en viewer-game-strength.job.mjs PASS |
| R3 | Pesca, Golpe Roca, olor dulce y Safari; después fantasmas/merodeadores que necesiten esas rutas | Cerrado en commits `151c6bbb` (pesca y caña registrada) y `0d86ddb4` (Golpe Roca en Túnel Roca B1F con rechazo, rotura, encuentro salvaje de roca, desbroce de casilla y persistencia; Dulce Aroma en campo con FLDEFF_SWEET_SCENT y encuentro salvaje; Zona Safari con pasos, bolas, aviso de fin de tiempo, warp y combate Safari); validado en `viewer-game-fishing.job.mjs` y `viewer-game-r3.job.mjs` PASS |
| R4 | Evolución y aprendizaje de movimientos | Cerrado en commit `a91d31b3`: subida de nivel en combate salvaje y de entrenador, Everstone, renombramiento según C, aprendizaje y reemplazo de movimientos con pantalla de resumen, evolución fiel a Ivysaur con escena completa y música, retorno al visor y persistencia de guardado/recarga; validado en `check:viewer-warps`, `driver-evolution`, `driver-learn-move` y `viewer-game-r4.job.mjs` PASS |
| R5 | Surf mediante MO y acciones desde equipo; Flash/Corte/Fuerza aplicables | Cerrado en commit `443d3152`: requisito de Medalla Alma FLAG_BADGE05_GET y MOVE_SURF, rechazo en orilla sin medalla/movimiento, sustitución de embarque automático por diálogo y salto de EventScript_UseSurf, máscara PLAYER_AVATAR_FLAG_SURFING, sincronía de vehículo/coordenadas, navegación en agua y desembarco natural en tierra, y acciones Flash/Corte/Fuerza desde menú de equipo; validado en check:field-moves, viewerMovement y viewer-game-r5.job.mjs PASS |
| R6 | Animaciones completas de Vuelo/Teletransporte/Cuerda Huida | Cerrado en commit `12fa87a5`: animaciones completas y ciclo de warp de salida/llegada para Vuelo (despegue, carga, aterrizaje con ave y retorno a Poké Ball), Teletransporte (giro y ascenso/descenso) y Cuerda Huida/Excavar (giro y ascenso/descenso); corrección de dirección en TeleportInFieldEffectTask3 y estado de movimiento en EscapeRopeWarpInEffect_Spin; reubicación en mapa destino durante fundido en EngineInteraction con avatar en animación de campo sin corte prematuro a 90 frames hasta fin de tareas de llegada; validado en check:field-moves PASS |
| R7 | Otros siete gimnasios: Misty, Surge, Erika, Koga, Sabrina, Blaine y Giovanni | Cerrado en commit `b5108d77`: accesos (árboles de Corte, Silph Co., Llave Secreta, 7 medallas), puzzles y mecánicas (papeleras de Carmín, laberinto vegetal de Azulona, barreras invisibles de Fucsia, teletransportadores de Azafrán, máquinas de preguntas 1-6 de Canela y paneles de giro/stop de Ciudad Verde), 34 entrenadores, 7 líderes, 7 MTs, medallas 2 a 8, obediencia (30, 50, 70, 100), autorización de MOs de campo (Corte, Vuelo, Fuerza, Surf, Golpe Roca, Cascada) y persistencia de guardado; validado en check:gyms PASS |

Antes de dar R7 y las prioridades 1–8 por cerradas, resolver los pendientes A/C:
tiendas/centros/menús, derrota y reaparición, pasos/precargas, entrada táctil,
Quest Log y curación tras derrota según sus filas. Las dependencias pueden
adelantarse justificadamente; una ruta bloqueada no autoriza inventar datos ni
iniciar el resto de la historia. Al completar 1–8, detenerse y pedir la siguiente
dirección: no iniciar automáticamente 9, 10 ni 11.

### Verificación y entrega para cada tanda

- Código: `npm run check:port`, `npm run check:honesty`, `npm run build`,
  `git diff --check`; ejecutar además el check focalizado de la regla modificada.
  Cambios críticos en guardado/API/scheduler necesitan comprobación focal antes
  de construir la siguiente tanda. No ampliar baselines de honestidad.
- Harness existente: `npm run check:viewer-warps` cubre identidad, temporales,
  poses, serialización y límites de aparición. Extenderlo con casos significativos.
- Para un diagnóstico de navegador, reutilizar
  `node tools/playtest/pw.mjs tools/playtest/smoke/<job>.job.mjs /tmp/<salida>`;
  levantar Vite en 5173 y usar `PW_TIMEOUT_MS=240000` si el caso lo necesita.
  Jobs relevantes: `viewer-game-object-movement`, `viewer-game-cut`,
  `viewer-game-object-flags`, `viewer-game-session`, `viewer-game-startmenu-save`,
  `viewer-game-escape` y `viewer-game-brock` (todos `.job.mjs`).
- Declarar PREPARED para ubicación, equipo, objetos o flags de entrada. No preparar
  el movimiento, victoria, retirada o guardado que se afirma demostrar. Un cambio
  solo del fragmento URL no reconstruye el visor: usar recarga/navegación completa.
  Evitar HMR durante el recorrido; dejar terminar los cambios de código primero.
- Un commit local de código por tanda, inglés imperativo y coautor de Codex,
  sin archivos de estado. Al final de sesión (o cada cinco tandas), ejecutar
  `npm run inventory` y después `npm run pending`; actualizar estado/tareas y
  `KNOWN_GAPS` en un único commit documental. Si cambia `KNOWN_GAPS`, regenerar
  de nuevo pendientes. No cambiar el algoritmo para aumentar cobertura.
- Reportar cuerpos C nuevos y equivalencias/wrappers por separado, incluso si
  ambos son cero por tratarse de integración. Mantener el estado en ocho líneas,
  las revisiones abiertas y el árbol limpio cuando no haya cambios ajenos.
- Si la entrega es solo documental: coherencia/enlaces/diff y `check:honesty`;
  no ejecutar tipos, build, inventario ni juego por rutina.

## 0. Cómo trabajar

Lee esta sección entera y después **solo la tarea que vayas a hacer**. Si algo choca
con [AGENTS.md](AGENTS.md), manda AGENTS.md.

### Orden
La sección «Máxima prioridad vigente: puntos 1 a 8» manda sobre el orden histórico
de abajo. Los puntos 9–11 requieren una nueva petición expresa del usuario.

Orden histórico para cuando el usuario autorice retomarlo:
1. Sección 1 de arriba abajo. Las **[avanzado]** déjalas a un agente capaz si no
   entiendes el C.
2. Sección 2, un bloque de archivo por sesión, en el orden recomendado.
3. Sección 3: primero `npm run play:smoke`, luego lo manual.
4. Sección 4.

### Al empezar
```bash
git switch main && git pull --ff-only && git status --short
```
`git status` debe salir vacío. Si hay cambios que no son tuyos, otro agente está
trabajando: no hagas `stash`, `checkout` ni `reset` sobre ellos y avisa al usuario.
Elige **una** tarea sin marcar.

### Un solo agente en `main`
Solo existe la rama `main` (decisión del usuario, 2026-10-06). Trabaja **un agente a
la vez**, directamente en `main`, sin worktrees ni ramas propias. Si `git status` muestra
cambios ajenos, otro agente sigue activo: para y avisa al usuario. Commit local por
tarea; sin `push` salvo indicación del usuario. Claude revisa por defecto las entregas
en `main`; para DRV-14 el usuario acordó revisión de Muse Spark 1.3 (2026-10-08).
El revisor corrige o revierte con un commit nuevo si la entrega no cumple.

### Eficiencia (obligatorio)
- **Lee solo lo necesario:** §0 y tu tarea. En archivos grandes usa `grep -n` y
  lecturas por rango; nunca vuelques JSON ni logs enteros (`| tail -20`).
- **Localiza funciones sin buscar:** `npm run review:where -- <Nombre>` da su línea
  en el C y en el TS (tabla completa en [docs/REVIEW-LOCATIONS.md](docs/REVIEW-LOCATIONS.md)).
- **Prueba de lo barato a lo caro:** check focalizado → `npm run check:all` una vez
  al final → `npm run play:smoke` → navegador manual solo para lo visual. Capturas
  solo si algo falla.
- **Funciones de cálculo puro** (enteros, tablas): compáralas con el oracle
  (`node tools/oracle/run.mjs --fn <Nombre>`, ver `tools/oracle/README.md`), que
  ejecuta el C real y el TS con miles de entradas.
- **Presupuesto:** dos intentos fallidos con el mismo error, o una tarea básica que
  se alarga sin avanzar → `BLOQUEADO: <motivo>` bajo la tarea y pasa a otra.
- **Notas de cierre cortas:** al marcar una tarea, como mucho 3 líneas con el commit.
  El detalle va en el mensaje del commit, no en este archivo.

### Dónde está cada cosa
- C: `../pokefirered/src/<archivo>.c`. Port TS: `src/games/firered/`.
- Datos generados (`src/games/firered/generated/`, `public/fr/`): **no se editan a mano**.
- Checks: `tools/checks/*.ts` → `npm run check:<nombre>`. Navegador:
  `tools/playtest/` (driver `driver.js`, ejecutor `pw.mjs`, `smoke/`, partidas `saves/`).

### Reglas
- Lee el cuerpo C completo (y la función C que lo llama) antes de cambiar código.
  "Renombrar" o "mover" también exige comparar el cuerpo con el C.
- Conserva nombres C, orden de estados y callbacks, y aritmética (u8 → `& 0xFF`,
  s16 → `(x << 16) >> 16`, división entera → `Math.trunc`).
- No cambies `tools/portInventory.py` ni las baselines de `check:honesty`.
- **Aserciones:** no se cambian para que un check pase; **sí se corrigen cuando
  contradicen al C**, citando la línea exacta y marcando `PISTA INCORRECTA`.
  No añadas entradas a `tools/checks/known-failing.json` sin permiso del usuario.
- **Pistas y cifras "esperadas":** son ayudas. Compruébalas con una muestra; si no
  cuadran escribe `PISTA INCORRECTA: <dice> / <datos>` y no ajustes tu resultado.
  Quien escribe una tarea pone solo cifras salidas de un comando ejecutado.
- Cita la línea exacta del C y del TS cada vez que escribas "como el C".
- Marca `[x]` solo si se cumple "Terminada cuando"; si no, `PARCIAL: <qué falta>`.
  No borres una tarea sin hacerla.
- No mezcles código y documentos en un commit. Di qué nivel verificaste (tipos,
  check, navegador): "compila" no es "funciona".
- Tareas de navegador sin navegador: `REQUIERE NAVEGADOR` y pasa a otra.
- Nada de `git push` ni de borrar ramas sin permiso del usuario.

### Al terminar una tarea de código
```bash
npm run check:port && npm run build && git diff --check && npm run check:all
```
`check:all` sale con error solo ante una **regresión**; si dice `FIXED`, quita ese
check de `known-failing.json` en el mismo commit. Tareas solo de documentos:
`git diff --check`.

### Commits
- Código: `git add <tus archivos>` y
  `git commit -m "<Verbo> <qué> (<archivo>.c)" -m "Co-Authored-By: <agente> <correo>"`.
  Sin `TAREAS-FINALES.md`, `PORTING-STATUS.md`, `PENDING.md`, `PORT-INVENTORY.md`
  ni `tools/portPending.py`.
- **Todo commit lleva `Co-Authored-By`** con tu entorno real (`OpenAI Codex
  <codex@openai.com>`, `opencode <noreply@opencode.ai>`, `Claude Opus 5.5
  <noreply@anthropic.com>`…). Después ejecuta `npm run check:honesty`: rechaza
  mensajes sin esa línea o con palabras como "faithful", "complete" o "fully";
  corrige con `git commit --amend` antes de subir.
- **Cierre de sesión, un solo commit de estado:** `npm run inventory`,
  `npm run pending`, marca aquí lo hecho (3 líneas máx. por tarea), actualiza en
  `PORTING-STATUS.md` las líneas "Siguiente", "Última entrega", "Contador" y
  "Acumulado" (total y cambio de la sesión), y
  `git commit -m "Update final task status" -m "Co-Authored-By: …"`.

## 1. Código de un jugador por cerrar

Hechas (detalle en cada commit):
- [x] 1.1 Checks rotos por `rom.charmap` (`sText_100` perezoso) — `aeb5ca05`.
- [x] 1.2 `oac_poke_ally_` y `TradeAnimInit_LoadGfx` con nombre C — `5b304853`.
- [x] 1.3 Huecos conocidos obsoletos (correo, mugshots, `item_use.c`) — `bc7e3e9f`.
- [x] 1.4 Whiteout: respawn mirando al norte — `b41615cd`. Divergencias restantes en §2 (`overworld.c`).
- [x] 1.5 Módulos sin caller: borrados `game/slots.ts` y `openTeachyTv` — `f6680d05`.
  `paletteUtil.ts`, `cableCarUtil.ts`, `imageProcessingEffects.ts`: sin caller en C.
- [x] 1.6 Clima: niebla (Torre Pokémon 3F) y sombra (Bosque Verde) validadas en mapas
  reales — `98725298`. Lluvia/nieve/arena/ceniza no se usan en FireRed (`// unused`).
- [x] 1.7 Evolución tras intercambio con NPC (`TradeEvolutionScene`) — `a061b06e`.
- [x] 1.8 Grabación del Quest Log: buffer de 32 acciones — `1431d1cc`. Diferencia estructural en §2.
- [x] 1.9 Créditos: tiles animados, cámara en espera, duraciones — `f926b597`,
  `91b2e504`, `061b9206`, `ab6dbcd9`, `63bfecc8`.
- [x] 1.10 Audio M4A: ADSR, duty, sweep, keysplit, reverb, coros — `98725298`. Falta escucha humana (C13).
- [x] 1.12 Flores y agua animadas (`Math.trunc` en `tileRenderer.ts`) — `0bf58c37`.

Abiertas:
- [x] 1.11 `check:questlog-battle` comprueba eventos de un jugador en escenas guardadas (`87675830`). Los eventos de enlace se excluyen por alcance.
- [x] 1.13 Animaciones de tiles compartidas entre campo y créditos; agua verificada en ambos (`10c5c535`).
- [x] 1.14 Falsa alarma: el juego sí abre el PC; la prueba pulsaba A una sola vez. C8 ahora
  recorre el menú hasta `CB2_PokeStorage` (`fbb30c01`).
- [x] 1.15 Registros BG del campo (`hw/bgRegs.ts`): declarados sustituidos por Canvas, por
  decisión del usuario (2026-10-01); el navegador no tiene `BLDCNT` (`overworld.c:2071-2073`).
- [x] 1.16 **Poké Ball desde la mochila en combate** [medio]. Era fallo del driver,
  no del juego: el borrador navegaba al bolsillo 1 (objetos clave) y pulsaba A sobre
  la Bici, cuyo menú solo-CANCELAR vuelve a la mochila. Con el bolsillo 2 (`OPEN_BAG_POKEBALLS`)
  la bola se lanza (`927c206c`); check integrado C5 captura en equipo con 2 lanzamientos.
- [x] 1.17 **Brock inicia el combate con `H.talk`** [medio]. Era fallo del juego:
  `GetMovementScriptIdFromObjectEventId` devolvía -1 (`findIndex`) frente al
  centinela 16 del C, así que `applymovement` nunca obtenía slot y `waitmovement`
  colgaba el reveal de Brock. Con el centinela como `script_movement.c`, el
  combate arranca, se gana, hay medalla y el dinero sube 3150→4550 (`3b709ab5`).
  Job C6 integrado (`caa6885d`) y repetido: medalla y 3150→4550.
- [x] 1.18 **MOVE ITEMS con caja vacía rompe el PC** — `1a767524`. El C escribe por un puntero NULL (región BIOS, escritura
  ignorada) en las casillas vacías; en JS lanzaba `TypeError`. Se omite la casilla vacía. El job
  `C8-move-items-118-repro` reproducía el fallo (`TypeError … 'oam'`) y ahora pasa sin errores. La región BIOS ignora
  escrituras por diseño del hardware; no se contrastó en la ROM la pantalla MOVE ITEMS con casillas vacías.

- [x] 1.19 **Marcas de bicicleta del motor** — `7af1dae9`. La tabla se indexaba `[previous][facing - 5]` (índice
  negativo en JS) y nunca creaba la marca: 16/16 combinaciones fallaban. Ahora `previous * 4 + facing - 5` como el C, y los
  argumentos solo se escriben si la bici se movió. Comprobado con las 16 combinaciones frente a la tabla del C; sin
  validar visualmente en el motor.

- [x] 1.20 **C8 persistencia y salida del PC**: Flash 0d982c02 integrada en
  85e1e082; revisor repitió PC/enfermera, cierre y movimiento, guardados0→1 y
  continue con mapa/coords/bolsa/dinero/contador e identidades/orden coincidentes.
  Curación cubre un Bulbasaur con entrada médica PREPARED; sin paridad audiovisual
  ni prueba de varios miembros. Evidencia en el mensaje del commit.
- [x] 1.21 **Continue con escenas Quest Log**: 4ce0ab7f restaura índice de objetos,
  avatar por MOVEMENT_TYPE_PLAYER, paletas y mapa/posición guardados. Bytes SON-PREP
  sin alterar: playback2→3→0, equipo/HP/PP/bolsa/dinero/respawn/contador intactos,
  movimiento posterior; continue sin escenas y auto/Brock pasan (detalle en el commit).
- [x] 1.22 **Persistencia de NPC y objetos dinámicos** — `bab7d84a`: SaveObjectEvents/LoadObjectEvents copian los 16 slots y campos C; SAVE normal conserva el mapa sin activar el warp especial; continue y retorno de Quest Log restauran registros antes de recrear sprites. Dos cuerpos C nuevos en `load_save.c` (archivo ya cubierto por navegador; delta del indicador 0), cero equivalencias. Check `tools/checks/objectEventSave.ts`: 53 campos C, slots inactivos, copias independientes, s16 y rechazo de registros incompletos. Job `object-event-save.job.mjs` con/sin `OBJECT_SAVE_PLAYBACK=1`: NPC movido por held movement, invisibilidad/dirección bloqueada y objeto runtime ausente de templates persisten; playback2→3→0 y movimiento posterior PASS. Entradas PREPARED declaradas; guardados antiguos sin snapshot usan templates y no recuperan posiciones históricas perdidas. Revisión manual del usuario y paridad audiovisual completa pendientes.
- [x] 1.23 **H.heal reporta menú ausente tras curar**: 6fc39013 observa el
  ofrecimiento frame a frame, libera A y confirma YES; HP/PP/estados e identidades
  verificados con dos miembros y velocidades0/1/2. No acepta menú ausente como éxito.
- [x] 1.24 **Driver conserva reserva curable al agotarse ataques del activo**:
  6fc39013 cura por BAG al miembro identificado, cambia y ataca por UI; prueba
  real PASS y sin medicina conserva la guardia. Recuperación exige que una
  medicina alcance60% HP; no acredita victoria ni recorrido completo.
- [x] 1.25 **Menú de cambio del driver**: c8ccc36f reproduce activo vivo y
  CHOOSE_MON opcional; cancela por B sin reserva atacante y vuelve a atacar.
  Debilitamiento real/SEND_OUT conserva reemplazo obligatorio y ataque. Pruebas
  PREPARED acotadas, sin afirmar victoria ni reconstruir el intento de Sonnet.
- [x] 1.26 **Ruta4 sin path en el driver**: c8ccc36f corrige planificación
  de ledges y behavior/elevación por nodo; cálculo sin mutar jugador/estadísticas.
  Route4(32,6)→(107,10) con dos saltos reales y conexión Celeste(0,20) PASS desde
  posición PREPARED; no acredita fósil, ruta anterior ni guardado. CB2 de gMain
  era antiguo, no prueba de carga activa; fieldFree/exit ahora esperan campo real.

- [x] 1.27 **Recorrido reanudable Celeste→Ruta5** — `98dc7ab1`: `play:cerulean` encadena entrenamiento natural, rival, Puente Pepita, Bill, Misty y Rocket; rondas/hitos SAVE→export→CONTINUAR→movimiento, importación con hash y recursos contrastados, medicina→KO→reemplazo y cálculo de daño corregidos. Ruta5 alcanzada y recargada; repetición desde checkpoint posterior a Misty con Rocket/salida PASS, reanudación de tramo ya completo PASS. Regresión de medicina PREPARED 10/10 y gate focalizado 2/2; tipos/honesty/build PASS. Entrada importada, ejecución con paradas/reanudaciones: no acredita historia anterior, Liga/Sevii, todas las opciones ni paridad ROM. Checkpoint/procedencia en `tools/playtest/saves/route5-arrival.*`; evidencia de sesión en `/tmp/pokemon-cerulean-progress-20261008`, `/tmp/pokemon-cerulean-retest-20261008` y `/tmp/pokemon-medicine-repeat2-20261008`.

### Fiabilidad del driver: alcance inicial hasta Ciudad Celeste

Prioridad vigente para recorridos; detalles y dependencias en
[PLAN-RECORRIDO.md](PLAN-RECORRIDO.md#estado-de-fiabilidad-del-driver).
No equivale a completar el juego ni su fidelidad. Las correcciones1.23–1.27 se
conservan como evidencia focalizada; 1.22 implementada y comprobada en casos acotados;
las validaciones generales anteriores siguen abiertas.

- [ ] **DRV-01 — Matriz de capacidades.** Inventariar funciones públicas de
  driver.js, consumidores y checks/jobs existentes; clasificar implementado,
  comprobado, parcial, no soportado y NOT RUN por caso. Priorizar fallos del
  recorrido hasta Celeste. Terminada con referencias y huecos verificables,
  sin convertir análisis estático en PASS runtime.
- [x] **DRV-02 — Estado y carga.** 6d693641/51cd5646/2e78b7df: observe distingue
  callbacks activos, carga, Quest Log, menús y movimiento terminado; ready espera
  control real. Carga pendiente, continue grabado y navegación focalizada PASS.
- [x] **DRV-03 — Entradas y ejecución acotada.** 6d693641/51cd5646: pasos de
  un frame, resultados compatibles, límites/cancelación y reemplazo de sesión;
  control0/1/2 y Brock PASS. Guardias cooperativas: no cubren llamadas directas a frDebug.
- [ ] **DRV-04 — Navegación y recursos por capacidades.**
  Revisar cobertura a pie, NPC/obstáculos, ledges, puertas/conexiones y recuperación
  con HP/PP/medicinas/reemplazos. Corregir fallos necesarios para Celeste y declarar
  límites posteriores (Surf/bici/empujes/movimientos forzados); no asumir que están
  ausentes del motor. Terminada con casos acotados y parada diagnosticada ante
  estado no soportado, sin bucles de curación ni repetir la historia completa.
- [x] **DRV-05 — Checkpoints y exportación segura.** 2e78b7df: SAVE por UI,
  bytes/hash/procedencia y exportación exclusiva; velocidades0/1/2, NO inicial,
  cancelación, continue/movimiento y C8 PASS. Persistencia de NPC comprobada aparte
  en 1.22 (`bab7d84a`); DRV-05 por sí solo no la demuestra.
- [ ] **DRV-06 — Gate de regresión del driver.** Con contratos
  aceptados, integrar checks/jobs focalizados existentes y los casos faltantes
  aprobados en un comando acotado. Terminada con exit no exitoso ante fallo,
  MANUAL/NOT RUN separados, trazas de estado/acción/recurso y cobertura enlazada
  a DRV-01. No ejecutar toda la suite del juego por cada cambio.
- [x] **DRV-07 — Continuación de historia.** `30ac65b9`/`78e781ad`: el job guarda un
  checkpoint verificado en cada hito (B2F, Miguel, Dome Fossil, salida a Ruta 4) y
  `cerulean-arrival.json` continúa en Celeste con layout 81 y paso real; los cinco pasan
  `mtmoon-checkpoints.job.mjs`. Destapó el layout id perdido al cruzar conexiones
  (`77005743`). Política auto de combate; sin paridad audiovisual.

- [x] **DRV-08 — Aprendizaje, evolución, fuerza y entrenamiento** (`40140bf1`, `7ade4328`):
  aprender/rechazar movimiento y evolución con su aviso, `assessTrainer` con
  diagnóstico de derrota, `train`/`healAtCenter`, `gate.mjs` y `scan-interactions.mjs`.
  Probado con jobs focalizados; gate 14/15 (`driver-navigation` inestable, ver DRV-10).
- [x] **DRV-09 — Entrenamiento largo contra el rival de Celeste.** `98dc7ab1`: entrenamiento natural hasta favorable (Pidgeotto20/Ivysaur19), checkpoints por ronda conservados y reanudación por archivo; rival vencido después por UI. No acredita origen del guardado importado ni repetibilidad de toda la historia.
- [ ] **DRV-10 — `driver-navigation` depende del azar.** Su caso de debilitamiento forzado
  espera que el rival derribe a un líder con 1 PS; falló 1 de 4 ejecuciones (liveHp 1).
  Fijar una entrada que garantice el debilitamiento o aceptar ambos desenlaces.

- [x] **DRV-11 — Reconstrucción del driver, fases 0–4** (Sonnet, `22ce04c7`…`6b30760e`): catálogo de
  pantallas, política única, bucle único sin A genérica, `random-walk`. Revisado; traspaso en
  `tools/playtest/DRIVER-REBUILD-HANDOFF.md`.
- [ ] **DRV-12 — Pantalla "mensaje de derrota" sin manejador.** Tras un whiteout, la tarea de
  `Task_RushInjuredPokemonToCenter` (overworld.ts) imprime gText_PlayerScurriedToCenter, que termina en
  `\p`: la impresora queda en estado 2 (CLEAR) esperando A y `recognize()` la llama `field-busy`, así que el
  bucle no avanza (atasco del Centro de Ruta 4 en `random-walk`). Reproducido: `frGame.whiteOut()` y una A
  llevan al diálogo de la enfermera. Falta pantalla + manejador + caso en `screen-catalog`; C7 no está en el gate.
- [ ] **DRV-13 — Tests de combate dependientes del azar.** `driver-navigation` (caso opcional),
  `driver-switch` y `driver-recovery` fallan de vez en cuando y pasan al repetir; hacerlos deterministas
  sin perder lo que comprueban.
- [x] **DRV-14 — Modo manual y replay, fase 1**: `5de398c3`, 10×10.000 fotogramas con observación idéntica, sin rAF espontáneo; entrada/semilla alteradas detectadas, lotes y waits exactos, teclado aislado y arranque normal comprobados.
  Driver H: OPTION y retorno al campo, 409 fotogramas/409 entradas grabadas. `check:manual-frames`, tipos, honesty y build PASS; revisión independiente de Muse pendiente.
- [ ] **DRV-15 — Ampliar determinismo**: cargas/continuaciones, audio lógico, intro/título, observación de combate y savestates; contrastar el consumo RNG por VBlank con C. DRV-10/13 siguen abiertos; investigar por separado `Quest Log palette backup is not initialized` al continuar `cerulean-arrival` (diagnóstico 2026-10-08).
- [ ] **DRV-16 — Extender recorrido y cobertura de opciones.** `98dc7ab1` deja Ruta5 comprobada; `aa681ccd` (Ruta5→Carmín, checkpoint `vermilion-arrival-*`) y `0a9432ac` (S.S.Anne, HM01, `ssanne-hm01-*`) verificados con SAVE/continue/movimiento desde entradas importadas; `61610652` añade `H.teachMove`. Pendiente: Surge (`surge-progress.job.mjs`, comprometido sin validar: «no path» a la puerta del gimnasio), luego Liga/Sevii. Encadenar entradas/salidas verificadas y casos alternativos de §3; revisión independiente del tramo2 pendiente. No cerrar por flags importados ni por checks estáticos.
- [x] **Gritos en fotogramas y por id de grito** — `7dd38034`: la lógica ya no espera al audio del
  navegador (combate colgado en SoundTask_PlayDoubleCry_Step) y cada especie usa su grito (antes el de la
  siguiente). `check:cry-timing`. Falta escucha humana (C13).

- [x] **SON-PREP**: b765818f integrada en a8fc2c6a; guardado por UI con procedencia,
  SHA25645b315d0… y restauración/movimiento repetidos por Sol. Entrada aceptada
  para SON-MM01-R; todavía no fósil ni llegada a Celeste.
- [x] **LUNA-02 regresión focalizada del driver**: base66baef56, cinco casos PASS
  revisados; entradas PREPARED y segmento500 sin victoria declarados. Ronda4ce0ab7f:
  dos continue PASS; retorno Brock MANUAL válido, cerrado por revisor14238405
  con comprobación explícita y paso real. Sin ruta completa.
- [x] **Driver detiene navegación tras derrota/atasco**: 65e631f9 propaga
  battle lost/battle stuck por goto/explore/grind, permite sustituto sano en slot0
  y evita restauración perdida de battleDefaults. C7 confirma pérdida natural y
  devolución al Centro; runner ok:false devuelve exit1. Estrategia/curación
  automática y reemplazos con más miembros requieren revisión focalizada posterior.

- [x] **SOL-DRV01 decisiones/recursos/curación del driver**: 66baef56, política auto
  con tipos/PP/restricciones y stats, medicinas/objetivo identificado por UI,
  enfermera verificada, reserva/retirada y presupuestos. Casos PREPARED focalizados
  pasan en campo/salvaje/Brock/cambio/medicina tras cambio; C7 explícito conserva
  whiteout. Sin claim de ruta completa/C8, ni todas las interacciones del combate.

## 2. Revisión de equivalencias y wrappers contra el C

Funciones con nombre C que delegan en lógica adaptada. Un bloque de archivo por sesión.
Orden: `pokemon.c` → `text.c` → `quest_log.c` y `overworld.c` → `event_object_movement.c`
→ `party_menu.c` y `pokemon_summary_screen.c` → `battle_transition.c` → `field_effect.c`
→ `intro.c` → `m4a.c` → otros.

Receta:
0. `npm run review:where` para regenerar
   [docs/REVIEW-LOCATIONS.md](docs/REVIEW-LOCATIONS.md) y ver dónde está cada nombre.
1. Lee el cuerpo C y el TS en esas líneas.
2. Compara ramas, orden de llamadas, constantes, anchos de entero, divisiones y
   callbacks. Si es cálculo puro, pásale también el oracle.
3. Igual → `[x]` citando líneas. Diferencia pequeña con check que la cubra →
   corrígela (commit de código). Si no → `DIFERENCIA: <C> / <TS>` y sin marcar.
4. No marques nada que no hayas leído en los dos lados.

**`field_specials.c`** (`field/elevatorAnimation.ts`, `script/specialsExtra.ts`)
- [ ] `0b1c6ac0`: `AnimateElevator` del motor delega las cuatro funciones de animación en `ElevatorAnimation`; nombres ya contados, delta cero. Comparación focal `field_specials.c:1049–1092,1119–1161` / `elevatorAnimation.ts:23–71`: oracle C 121 casos/15.475 frames PASS. 5ec96850 conecta el host del visor y su menú DOM; Azulona Rojo/Hoja, Silph, Rocket (llave PREPARED y rechazo sin ella) y Trainer Tower PASS. Presentación adaptada, sin VM general ni comparación ROM de ascensores.

**`field_player_avatar.c`** (`field/playerAvatar.ts`, `field/teleportAnimation.ts`)
- [ ] `97a3122d`: `playerAvatar.ts` delega en `ForcedMovement` (`field/forcedMovement.ts`): `TryUpdatePlayerSpinDirection`, `TryDoMetatileBehaviorForcedMovement`, `DoForcedMovement`, `DoForcedMovementInCurrentDirection`, `ForcedMovement_*` y `sForcedMovementFuncs`; revisar callers del motor contra el C. Oracle C: 49152 casos PASS; sin recorrido del motor principal.
- [ ] `eebdadff`: `escalatorWarp.ts` y `specialFieldAnim.ts` delegan en `field/escalatorAnimation.ts` (`StartEscalatorWarp`, `Task_EscalatorWarp*`, `EscalatorWarp(In)Effect_*`, `StartEscalator`, `StopEscalator`, `IsEscalatorMoving`). Nombres ya contados (`59df1eb5` restituye los nombres C); delta cero. Oracle C: 3488 frames/64 casos PASS; el visor omite la grabación del Quest Log.
- [ ] `4aab2061`: cinco APIs existentes delegan en `TeleportAnimation`: `SavePlayerFacingDirectionForTeleport`, `StartTeleportWarpOutPlayerAnim`, `WaitTeleportWarpOutPlayerAnim`, `StartTeleportInPlayerAnim`, `WaitTeleportInPlayerAnim`. Nombres ya contados, delta cero; comparar también los callers del motor durante la revisión. Oracle C: 3700 frames/24 casos PASS; navegación real focal Rojo/Hoja PASS, sin acreditar el recorrido del motor principal.

**`event_object_movement.c`** (`field/objectEvents.ts`, `fieldEffects.ts`)
- [~] `MovementAction_*` (delegan en `movementActionStep`): comparadas las 105 familias de `Step0/Step1` extraídas del C
  (init, argumentos y condición de fin) con los brazos del TS. Iguales: Face*, Walk (slowest/slower/slow/normal/fast/faster),
  RideWaterCurrent, PlayerRun, RunSlow, Jump/Jump2/JumpInPlace*/JumpSpecial*, Delay*, WalkInPlace*, Spin, Fly, Emote*,
  RockSmash/CutTree, Acro (init y tipo de salto). Corregido: `Slide*` (el C usa `MOVE_SPEED_FASTEST`; el TS FAST_1 con anim
  de cara), `ShakeHeadOrWalkInPlace` (termina con `animEnded`, el TS con 32 fotogramas), `Glide*` (faltaba
  `AnimateSprite` por fotograma), saltos acro (faltaba `hasShadow = FALSE`; el sonido SE_BIKE_HOP/SE_WALL_HIT sonaba dos
  veces: ya lo emite `field_player_avatar.c`). Cubierto en `check:movement-actions`.
  Sin revisar: `InitSpin`, `RaiseHandAndJump` S1 y `RevealTrainer`.
- [ ] `UpdateObjectEventCurrentMovement` (secuencia por objeto/ground effects) y
  driver por objeto; `ObjectEventSetSingleMovement`, `ObjectEventExecSingleMovementAction`,
  `ClearObjectEventMovement` (registro QL y `sprite.data[2]`).
- [x] `GetTrainerFacingDirectionMovementType` (9 entradas idénticas a `sTrainerFacingDirectionMovementTypes`);
  `GetVectorDirection` y los 10 `GetLimitedVectorDirection_*` (ramas idénticas al C, `objectEvents.ts:~135-185`);
  `TryGetTrainerEncounterDirection` (envoltura s16 de dx/dy/abs y mapeo RUNFOLLOW 0–10 frente a
  `gGetVectorDirectionFuncs`; los 11 `MovementType_*_Step4` pasan el RUNFOLLOW correcto).
- [x] `MoveCoords`/`MoveCoordsInDirection` (envoltura s16; `(u16)delta` equivale módulo 2^16; vectores iguales a
  `sDirectionToVectors`); `SetObjectEventCoords`.
  - Encontrado y corregido (`1f6608ff`): `MovementType_FaceDownAndUp`/`FaceLeftAndRight` usan
    `gMovementDelaysMedium`; el TS usaba `Short` para todos salvo LookAround. Cubierto en `check:movement-types`.
  - `movementTypeBranch` (máquina fusionada de los `MovementType_*`) revisada contra el C: LookAround, Face*, FaceDirection,
    Wander*, Rotate*, WalkBackAndForth, las 24 `WalkSequence*` (ruta, índice, eje y valor de las 24 coinciden),
    `MoveNextDirectionInSequence`, Invisible, RaiseHand*, Buried, Disguise, WalkInPlace/JogInPlace y
    `gInitialMovementTypeFacingDirections` (81 entradas). Corregido (commit siguiente a `1f6608ff`):
    `FACE_UP/DOWN/LEFT/RIGHT` y `WALK/JOG_IN_PLACE` usaban la dirección inicial del tipo en vez de
    `facingDirection` en `Step0` y `WALK/JOG_IN_PLACE` devolvía FALSE donde el C devuelve TRUE (un fotograma).
  - Sin revisar aún: `MovementType_CopyPlayer*` y `CopyablePlayerMovement_*` (el TS usa `runCopyablePlayerMovement`),
    `ObjectEventIsTrainerAndCloseToPlayer`, `PlayerGetDestCoords`, y la capa `MovementAction_*`.
- [ ] `GetAvailableObjectEventId`, `TrySetupObjectEventSprite`, `TrySpawnObjectEventTemplate`,
  `TrySpawnObjectEvents`, `RemoveObjectEventsOutsideView`, getters/overrides de plantillas;
  `GroundEffect_*`/`DoTracksGroundEffect_*`.
- [x] `ObjectEventSetHeldMovement`, `ObjectEventForceSetHeldMovement`, `ClearHeldMovement*`, `CheckHeldMovementStatus`,
  `ClearHeldMovementIfFinished`, `GetHeldMovementActionId`, `IsHeldMovementActive`, `IsMovementOverridden` y
  `ObjectEventFaceOppositeDirection` iguales al C. Corregido `GetOppositeDirection` (el C mapea también las diagonales 5–8;
  el TS solo 1–4). Los drivers `ObjectEventExecHeldMovementAction` / `QL_UpdateObjectEventCurrentMovement` sin revisar.
- [x] `InitNpcForWalk*`/`InitWalk*`/`UpdateWalk*`, `InitRunSlow`/`UpdateRunSlow`;
  `Step1/2/3/4/8` y tablas de velocidad frente a `NpcTakeStep`: cuerpos, campos `data[3..5]`, las cinco tablas
  `sSpeed*StepFuncs`/`sStepTimes` y los saltos (`InitJump*`, `sJumpInitDisplacements`/`sJumpDisplacements`,
  `DoJump*SpriteMovement`, `UpdateJumpAnim`) coinciden con el C. Corregida la diferencia anterior: `UpdateSlowStyleAnim` ya
  solo mueve el sprite (commit tras `194eaef3`). OAM de hierba larga sin revisar.
- [ ] `StartFieldEffectForObjectEvent` y `DoRippleFieldEffect` (dispatch y scripts de efecto).
- [ ] `UpdateObjectEventVisibility` y `ObjectEventUpdateSubpriority` (orden del ciclo de frame).
- [ ] `ObjectEventSetGraphicsId*`, `ObjectEventTurn*`, `PlayerObjectTurn`, `SetObjectEventDirection`.
- [ ] `RemoveObjectEvent`, `RemoveObjectEventInternal`, `RemoveObjectEventIfOutsideView`
  (teardown del renderer frente a destrucción de sprites C).
- [ ] `InitJumpRegular`, `UpdateJumpAnim`, `DoJumpAnim`, `DoJumpSpecialAnim`,
  `DoJumpInPlaceAnim`, `InitJumpSpecial` (frames, aterrizaje y sombras).
- [ ] `InitAcroWheelieJump`, `InitAcroPopWheelie`, `InitAcroWheelieMove`, `InitSpin`,
  `AcroWheelieFaceDirection`.
- [ ] `ObjectEventIsTrainerAndCloseToPlayer`, `MoveNextDirectionInSequence`,
  `GetLedgeJumpDirection` (callers y colisión de ledge).
- [x] `CopyablePlayerMovement_*` y `cph_IM_DIFFERENT` frente a `gCopyPlayerMovementFuncs` y `MovementType_CopyPlayer*`:
  tabla de 11 entradas, `GetCopyDirection`/`sPlayerDirectionsForCopy`/`sPlayerDirectionToCopyDirection` (generado del C),
  los 7 ids de acción (`Get*MovementAction`, verificados con script) y `MoveCoordsInDirection(…, 2, 2)` del salto
  coinciden. Corregido: con bloqueo el C llama dos veces a `ObjectEventSetSingleMovement` (andar y después girar; el Quest
  Log registra ambas) y el TS una; y el TS saltaba el fotograma con direcciones DIR_NONE/fuera de rango donde el C
  continúa con `DIR_NONE`. Cubierto en `check:movement-types`.
- [ ] Clones/obstáculos y ciclo `SpawnObjectEventsOnReturnToField`.

**`overworld.c`** (`field/overworld.ts`, `fieldControl.ts`, `game.ts`)
- [x] `Overworld_ResetStateAfterFly/Teleport/DigEscRope/WhitingOut`: cuerpos C idénticos
  (`overworld.c:289-342`) y secuencia compartida en `overworld.ts:524-542`.
- [x] `CB2_WhiteOut` (`overworld.c:1545`): secuencia comprobada contra el C (`StopMapMusic`, `DoWhiteOut`,
  `SetInitialPlayerAvatarStateWithDirection(DIR_NORTH)`, `ScriptContext_Init`/`UnlockPlayerFieldControls` dentro de
  `warpIntoMapAndLoad`, `QuestLog_CutRecording` tras la carga). Faltaba `StopMapMusic()`: añadido; `ResetSafariZoneFlag_`
  queda dentro de `Overworld_ResetStateAfterWhitingOut`. Job C7 (whiteout con teclado real) pasa.
- [ ] `WarpIntoMap`/`TryFadeOutOldMapMusic`.
  - DIFERENCIA: el C carga el mapa de forma síncrona (`overworld.c:583-588`); el TS lo
    hace por etapas asíncronas (`overworld.ts:641-673`). `TryFadeOutOldMapMusic`
    coincide (`overworld.c:1112-1118`, `overworld.ts:2342-2349`).
- [x] `GetMapTypeByGroupAndId`, `GetLastUsedWarpMapType`, `GetSavedWarpRegionMapSectionId`,
  `GetCurrentRegionMapSectionId`, `GetCurrentMapBattleScene`.
  - Revisado: en mapas válidos coinciden; el TS devuelve `undefined` en mapas inválidos donde el C lee basura.
    También `IsMapTypeOutdoors`/`Indoors`/`AllowsTeleportAndFly` y el estado `UpdateAmbientCry`/`ChooseAmbientCrySpecies`
    (retardos 1200–3599 y 1200–2399). Corregido `PlayAmbientCry`: comprobaba la casilla de enfrente en vez de la propia
    (`PlayerGetDestCoords`) para mons de agua.
- [~] `SetWarpData`/`SetWarpDestination`/`SetDynamicWarp*`/`SetWarpDestinationTo*`: coinciden (parámetros `s8` truncados
  en `SetWarpData`). `LoadMapFromWarp`/`LoadMapFromCameraTransition`/`QL_LoadMapNormal`: mismas llamadas (la elección del
  grito ambiental va dentro de `stepCallback.reset()`); orden distinto sin dependencia de datos
  (`TrySetMapSaveWarpStatus` después de `onMapLoad`). Sin revisar: `SetDiveWarp*`, `cb1`/`cb2`,
  `CB2_ReturnToFieldContinueScript`, `CB2_ContinueSavedGame` (comparten dispatch con carga asíncrona).
- [ ] `DoCB1_Overworld_QuestLogPlayback`, `LoadMap_QLPlayback`,
  `CB2_SetUpOverworldForQLPlayback*`, `QL_UpdateObject`/`QL_UpdateObjectEventCurrentMovement`.
  - DIFERENCIA: el C consume la máquina de estados en un callback
    (`overworld.c:2210-2250`); el TS la reparte entre frames (`overworld.ts:792-840`).
    `QL_UpdateObject` aplica movimiento y gfx antes de actualizar (`quest_log.c:1340-1365`);
    el TS aplica comandos en `fieldControl.ts:204-214` antes del driver.

**`quest_log.c`** (`questLogEvents.ts`)
- [~] Callbacks de entrada/fin de playback, `RunQuestLogCB`, `QLogCB_Playback`,
  `QuestLog_PlayCurrentEvent`, `HandleShowQuestLogMessage`, `QL_TryRunActions` (bucle de acciones y
  retardos iguales al C; el TS además espera a `scriptContextIdle` y no pasa a STOPPED con `idx >= max` mientras los
  controles están bloqueados; la entrada reproduce los bytes 0 y 2 de `FieldInput`, sin `pressedRButton`).
  - DIFERENCIA: fin de escena (`quest_log.c:270-289`) frente a `sPlaybackEndMode`
    (`questLogEvents.ts:824-849`); `QL_TryRunActions` escribe estado global en C
    (`quest_log.c:1594-1669`) y devuelve comandos en TS (`questLogEvents.ts:1168-1221`).
- [ ] Escenas como array en TS frente al anillo de escenas del C (`QL_StartRecordingAction`,
  `ClearSavedScene`, `Task_BeginQuestLogPlayback`); formato de save sin cambiar (1.8).

**`battle_transition.c`** (`battle/transition.ts`)
- [ ] Driver de intro y transición; helpers de scanline y HBlank/VBlank; `SetSinWave`/`SetCircularMask`.
- [ ] `Task_Swirl`/`Swirl_*`/`VBlankCB_Swirl`; `Task_Ripple`/`Ripple_*`/`VBlankCB_Ripple`/`HBlankCB_Ripple`.
- [ ] `Task_BigPokeball` y sus callbacks/buffers; `Task_ClockwiseWipe` y fases;
  familia `Task_Slice`/`Slice_*`; `Task_WhiteBarsFade` y callbacks Sprite/VBlank/HBlank.

**`intro.c`** (`introCopyright.ts`, `introGameFreak.ts`, `introScene*.ts`)
- [ ] Callbacks Game Freak, tareas/etapas de escenas 1–3, `Scene3_*`/`SpriteCB_*`;
  `SetUpCopyrightScreen` y `CB2_WaitFadeBeforeSetUpIntro`.

**`field_effect.c`**
- [ ] `popOutOfAsh`/`startLavaridgeGymWarpEffect` y callbacks `SpriteCB_*` conectados a sus tareas.

**`party_menu.c`**
- [~] Revisión 2026-10-13 (`partyMenu.ts`): comparados con el C `ItemUseCB_Medicine/Step`, `ItemUseCB_RareCandy`,
  `TryUsePPItemInBattle`, `ItemUseCB_RestorePP`, `ItemUseCB_TMHM`, `Task_ReplaceMoveWithTMHM`,
  `GetPartyMenuActionsType(InBattle)`, `CanLearnTutorMove`, `UpdatePartyTo{Battle,Field}Order`,
  `GetPartyIdFromBattle{PartyId,Slot}`, `SwitchPartyMon`, `Display{Gave,Took}HeldItemMessage`: lógica igual salvo que el TS
  **no registraba ninguno de los 8 `ItemUse_SetQuestLogEvent` del C** (usar objeto sobre un mon, dar/quitar objeto,
  MT/MO, PP, reemplazar movimiento). Añadidos. Sin comprobar en juego: el Quest Log ignora estos eventos fuera de una
  escena ya abierta (`ShouldRegisterEvent_HandlePartyActions`), así que el smoke C10 no los ve. Sin revisar:
  `CreatePartyMon*SpriteParameterized`, `PartyMenuStartSpriteAnim`, `CB2_ReturnTo*Menu`, evolución por objeto.
- [ ] `CreatePartyMon*SpriteParameterized` (especie, prioridad, estado, objeto);
  `PartyMenuStartSpriteAnim`, los tres `CB2_ReturnTo*Menu`, `CB2_SetUpExitToBattleScreen`.

**`pokemon.c`**
- [x] Los 6 wrappers BoxMon/Mon revisados con líneas citadas; `GetMonSpritePalStruct`
  corregido a `MON_DATA_SPECIES_OR_EGG` — `3bea3c6d`, `3d63e11a`.
- [x] `CalculateBaseDamage` (`pokemon.c`, `battle/damage.ts`): comparada línea a línea con el C (objetos, habilidades,
  insignias, rama física/especial, clima, Flash Fire; `gStatStageRatios` y `sHoldEffectToType` vienen de cdata). Iguales.
  Corregido `WEATHER_HAS_EFFECT2` (se aliasaba a `WEATHER_HAS_EFFECT`: el C usa el modo `ABILITYEFFECT_FIELD_SPORT`, sin
  comprobar `hp != 0`) — `475b8118`. Macros de `battle.h`/`battle_util.h` (`GET_MOVE_TYPE`, `IS_TYPE_*`,
  `SET_BATTLER_TYPE`, `GET_STAT_BUFF_*`, `MOVE_IS_PERMANENT`, `ABILITY_ON_FIELD*`) iguales.
  Oracle (`tools/oracle`, funciona con `llvm@16`; todo en ~20 s): grupo F nuevo con 11 funciones de pokemon.c
  (`GetNatureFromPersonality`, `GetFlavorRelationByPersonality`, `SpeciesToNationalPokedexNum`,
  `NationalPokedexNumToSpecies`, `SpeciesToHoennPokedexNum`, `HoennPokedexNumToSpecies`, `NationalToHoennOrder`,
  `HoennToNationalOrder`, `SpeciesToCryId`, `IsHMMove2`, `IsMonSpriteNotFlipped`): 0 diferencias en el dominio
  realista salvo `SpeciesToCryId(411)` (el C lee un byte tras `sHoennSpeciesIdToCryId`; Chimecho no existe en FireRed).
  Sin cobertura: las funciones sobre `Mon`/`BoxMon` (`CalculateBoxMonChecksum`, `GetLevelFromBoxMonExp`,
  `CalculateMonStats`, `GetMonGender`…): el TS usa objetos decodificados, no bytes, y el adaptador ByteStruct no los
  alcanza sin una capa de conversión.

**`pokemon_summary_screen.c`**
- [~] `SwapMonMoveSlots`/`SwapBoxMonMoveSlots` (`SwapMoveSlotsInMon`: movimientos, PP y bonos de PP idénticos),
  `GetMonPpByMoveSlot`/`GetMonMoveBySlotId`, `SeekToNextMonInSingleParty`, mapeo de dirección de
  `PokeSum_SeekToNextMon` en caja y `PokeSum_BufferOtName_IsEqualToCurrentOwner` (rama sin enlace): iguales.
  Corregido `PokeSum_PrintTrainerMemo_Egg`: el TS siempre mostraba el texto 0 («guardería»); ahora elige entre los 7
  de `sEggOriginTexts` según lugar/versión de encuentro, OT y `isBadEgg`. Sin comprobar con un huevo real.
  Detector `tools/reviewSizeCompare.py` (funciones del C cuyo port del mismo nombre es mucho más corto): sin más señales
  en lógica; el resto son sprites/visual (`CreateHpBarObjs`, `PokeSum_*BeforePageFlip`). Pendiente:
  `UpdateCurrentMonBufferFromPartyOrBox`, transición de páginas, setup y `SpriteCB_MonPicDummy`.
- Detector aplicado a `battle_transition.c`, `field_effect.c` e `intro.c`: **no informativo**. Esos tres están reescritos
  como escenas sobre Canvas (intro: un cuerpo de 1 sentencia por escena; transiciones: `Spiral_UpdateFrame` etc. con
  un 1/N de sentencias; field_effect: 70 funciones del C sin homónimo exacto en el TS), así que la comparación por
  tamaño no identifica omisiones; requieren revisión visual/comparación por fotogramas.

**`text.c`** (`gba/textPrinter.ts`)
- [x] `DecompressGlyph_NormalCopy2` y 4 `TextPrinter*` (espera, flecha, modo auto) — `c4282dab`.
- [x] `TextPrinterDrawDownArrow`, `TextPrinterClearDownArrow`, `TextPrinterInitDownArrowCounters`,
  `TextPrinterWaitAutoMode` (50 fotogramas en Quest Log, 120 si no), `TextPrinterWait*`, `DrawDownArrow` y `RenderText`
  (todos los estados y códigos de control): iguales al C. La diferencia anotada (`CopyWindowToVram`/`ScrollWindow` por
  fotograma frente al Canvas) es estructural del renderer; `sWindowVerticalScrollSpeeds` {1,2,4} y la lógica de
  `scrollDistance` coinciden. `GetStringWidth` (código a código, incl. `CHAR_DYNAMIC`, `PLACEHOLDER_*`, saltos de
  `COLOR_HIGHLIGHT_SHADOW`/`PLAY_*`) igual. Corregido el quirk de `EXT_CTRL_CODE_ESCAPE` (el C no consume el byte
  siguiente; solo aparece en `gText_Escape3`, sin uso).

**`m4a.c`** (`audio/sound.ts`, `audio/m4a.ts`)
- [ ] `m4aSongNumStart*`, `m4aSongNumStop/Continue`, `m4aMPlayContinue/FadeOut/
  FadeOutTemporarily/FadeIn/VolumeControl`, `m4aSoundInit`/`m4aSoundMain`,
  `SetPokemonCryTone`, `SetPokemonCryStereo`, `IsPokemonCryPlaying`, `m4aMPlayPanpotControl`.

**Otros archivos**
- [ ] `field_player_avatar.c`: renombres.
- [x] `field_control_avatar.c`: getters de posición y helpers con `FieldControl` como contexto.
  Iguales: `GetPlayerPosition` (C:345-349 frente a `fieldControl.ts:293-296`),
  `GetInFrontOfPlayerPosition` (C:351-360 frente a `:299-304`),
  `GetPlayerCurMetatileBehavior` (C:362-367 frente a `:217-220`),
  `PlayerGetDestCoords`/`PlayerGetElevation`/`GetPlayerMovementDirection`/`GetPlayerFacingDirection`
  (`field_player_avatar.c:1034-1095` frente a `playerAvatar.ts:47-73`; "dest" es
  `currentCoords` y elevación es `previousElevation` en ambos) y vectores
  S/N/W/E (`objectEvents.ts:17-19`). Wrappers de módulo en `:50-52`; callers vivos
  en `:311,328,331,337`.
- [x] `start_menu.c` — `d15dc8f8`: barra de ayuda solo en modo HELP, `SE_SELECT` en
  `CloseStartMenu`, redibujado sin refreeze, ventana Safari en (1,1), ancho u32 en
  `PrintSaveStats`. Sin corregir: colores `sTextColor_*` de `PrintSaveStats`
  (`start_menu.c:184-186`), orden de `SaveQuestLogData` (C:786, TS en `writeSave`).
- [x] `vs_seeker.c` — `e07840ac`: `Task_ResetObjectsRematchWantedState` llama a
  `HandleEnforcedLookDirectionOnPlayerStopMoving` y `StopPlayerAvatar` como el C
  (`:603-633`); `Reset...` (`:636-661`) sin diferencias.
- [ ] `trainer_card.c`: `Unref_InitTrainerCard`; `battle_setup.c`: `SetBattledTrainerFlag2`.
- [ ] `trainer_tower.c`: `TT_ConvertEasyChatMessageToString`, `GetTrainerTowerTrainerFrontSpriteId`,
  `CB2_EndTrainerTowerBattle`, `Task_DoTrainerTowerBattle`.
- [ ] `battle_tower.c`: `Task_WaitBT` (adapta el scheduler a `game.startBattle`).
- [x] `trade_scene.c`: `LoadTradeAnimGfx`; `mail.c`: `GetInGameTradeMail` (`attachTradeMail`).
  Iguales: `LoadTradeAnimGfx` delega en una línea (`trade_scene.c:2803` frente a
  `ingameTrade.ts:369`); el correo copia 9 palabras, nombre, 4 bytes de ID con
  máscaras explícitas, especie y objeto (`trade_scene.c:2500-2512` frente a
  `pokemon/mail.ts:259-276`, con guardas benignas ante cdata ausente y firma adaptada a
  anexar al mon). `MAIL_WORDS_COUNT` 9 en ambos.
- [ ] `trade_scene.c`: `TradeAnimInit_LoadGfx` no sigue el cuerpo C: el C hace
  `ChangeBgX/Y(0, 0, 0)`, carga dos veces gráficos, tilemap y paleta del textbox
  (`gBattleInterface_Textbox_*`) y no asigna buffer a BG2; el TS asigna BG2 y no carga
  el textbox. Comprobar si esa carga ocurre en otro sitio.
- [x] `metatile_behavior.c`: fachada de predicados en `fieldmap.ts` (`fieldmap.ts:132-139`,
  delegación 1:1 sin lógica). Cuerpos generados clavan al C (`metatile_behavior.c:253,446,
  454,527,535,648,676,846` frente a `generated/metatileBehavior.ts:365,563,571,644,652,
  778,807,987`); 10 constantes MB_* coinciden con `metatile_behaviors.h`. Solo
  `IsWater` tiene callers vivos (7 archivos); los otros 7 sin caller en TS.

## 3. Validación en navegador

**Primero `npm run play:smoke`** (Playwright sin ventana; necesita un servidor:
`npx vite --port 5174 --strictPort` y `PW_BASE=http://localhost:5174/`). Cada punto
devuelve OK, FALLO o MANUAL en una línea. Amplía los trabajos de
`tools/playtest/smoke/` antes que probar a mano.

### Estrategia de prueba para agentes

Lo que funcionó (C3, C7, C9 y C10 de `fea0682e`) y conviene repetir:
1. **Un trabajo por punto** en `tools/playtest/smoke/C<n>-*.job.mjs`, que parte de
   una partida de `tools/playtest/saves/` y usa los helpers de `smoke/lib.mjs`
   (`openStart`, `tap`, `until`, `bagCount`).
2. **Pulsaciones reales, no llamadas internas.** Pulsa botones y espera estados
   (`H.cb2()`, tareas activas, `H.st()`), como haría un jugador. Si para llegar a la
   situación hay que tocar el estado (p. ej. resetear un cursor), márcalo `PREPARED`.
3. **Comprueba el resultado en el estado guardado** (dinero, bolsa, equipo, mapa,
   orientación) y, si hay fórmula en el C, compárala (en C7 la pérdida de 96 =
   nivel 12 × 8 sin medallas). Las capturas solo sirven para diagnosticar.
4. **Todo bucle lleva tope.** `run.mjs` corta cada trabajo a los 120 s; un `for` sin
   tope deja colgado el diagnóstico (le pasó al borrador de C5).
5. **Si falla, primero decide quién falla: el juego o la prueba.** Reprodúcelo por
   etapas en el navegador integrado (`preview_start` con `vite`, `H.importSave`, y
   cada etapa con `javascript_tool`) y compara con el C. Fallo del juego → tarea en
   §1 con su reproducción. Fallo de la prueba → corrige la prueba.
6. **MANUAL honesto.** Si solo se verifica una parte, el trabajo devuelve `manual`
   diciendo qué falta; nunca OK parcial.
7. **Un agente por punto**, cada uno en su worktree (§0). En la Fase B dos agentes
   hicieron el mismo trabajo en paralelo y una rama quedó sin fusionar.

Reparto por dificultad:
- **Agentes básicos (Sonnet, Codex, opencode):** puntos con partida justo antes de la
  acción y un resultado medible: C8 (curar y depositar/retirar), C13 (música de
  combate, efectos y gritos por estado de `sound`) y ampliar C1.
- **Agente avanzado o revisor:** puntos donde la prueba destapa fallos del juego y hay
  que leer el C: 1.18 (PC vacío), C2 (Oak completo hasta el rival), C4 (Quest
  Log), C11 (evolución) y C12 (ruta con puertas, conexiones y cueva).

Receta manual (si un punto no se puede automatizar):
1. Servidor (`npm run dev` o `preview_start` con `vite`) y `http://localhost:5173/?fr=new`.
2. Carga una partida de `tools/playtest/saves/` en dos pasos (`importSave` recarga la página):
   ```js
   (async () => { const { H } = await import("/tools/playtest/driver.js"); await H.importSave("pewter"); })();
   // cuando recargue:
   (async () => { const { H } = await import("/tools/playtest/driver.js"); window.H = H; console.log(await H.ready()); })();
   ```
   Con `pewter`: `MAP_PEWTER_CITY_POKEMON_CENTER_1F` (7, 4) y `H.party()` = `1:L12:33/33`.
3. Usa el driver (`H.goto`, `H.talk`, `H.battle`, `frDebug.press("A")`) y lee el
   estado (`H.st()`, `frDebug.state()`) en vez de adivinar. Un warp tarda unos 300
   frames; el clima forzado se pierde al cambiar de mapa.
4. Terminada cuando se comporta como el original y la consola no tiene errores.
   Un fallo se añade como tarea en la sección 1 con su reproducción.

### 3.0 Checklist prioritario
- [ ] **C1 Arranque completo** (`/`): copyright → Game Freak → intro → título → menú principal.
  PARCIAL: `play:smoke` OK por estado (logo, escenas, título, menú); falta ver la secuencia.
- [ ] **C2 Partida nueva** (desde `/`, no `?fr=new`): título → NUEVA PARTIDA →
  discurso de Oak y nombres → habitación (`MAP_PALLET_TOWN_PLAYERS_HOUSE_2F` (6, 6)) →
  Oak te detiene en la hierba → laboratorio → inicial → combate con el rival.
  `?fr=new` se salta el discurso de Oak y empieza en la habitación: sirve para la
  segunda mitad del recorrido, no para la primera.
  PARCIAL: el smoke llega del título a Oak (`da01814a`); no alcanza el campo.
- [x] **C3 Guardar y continuar**: misma posición, equipo y dinero — `play:smoke` con `pewter` (`190efec3`).
- [ ] **C4 Quest Log**: tras continuar se reproduce el resumen y devuelve el control.
- [x] **C5 Combate salvaje**: luchar, huir y capturar con pulsaciones reales
  (`d59b5003`), repetido sobre integración: captura en equipo y consumo de 2 balls.
  Job ampliado (`d2743aa7`): cinco casos aislados, equipo lleno → PC incluido; destapó el
  fallo de texto de transferencia al PC, corregido en `bcd841b5`.
- [ ] **C6 Combate de entrenador**: partida `pewter` → gimnasio → Brock; medalla y dinero.
  PARCIAL: `gym-camper` → Brock, victoria, medalla y 3150→4550 comprobados
  con el job `caa6885d` sobre integración. Falta la ruta previa desde `pewter` al gimnasio.
- [x] **C7 Derrota (whiteout)**: reaparece en el Centro Pokémon **mirando al norte**,
  equipo curado y dinero reducido — `play:smoke` pierde un combate real (`fea0682e`).
- [ ] **C8 Centro Pokémon y PC**: depósito/retiro automatizado con pulsaciones reales
  (`54895bba`, devuelve MANUAL honesto); curación de la enfermera pendiente.
- [x] **C9 Tienda** (partida `mart`): el dependiente aparece, comprar y vender; el
  dinero cambia — `play:smoke` compra 200 y vende 150 (`fea0682e`, con el arreglo de `shop.c` `06b08838`).
- [x] **C10 Menús**: Pokédex, Pokémon (resumen, mover, objeto), Mochila (Poción),
  Ficha, Opciones — `play:smoke` con pulsaciones reales (`fea0682e`).
- [ ] **C11 Evolución por nivel** (`H.grind`): ver la escena, cancelar con B y aceptar.
- [ ] **C12 Mapas y transiciones**: puertas, escaleras, mapas conectados, cartel de
  nombre y cueva (`route3` → Monte Moon); flores y agua animadas.
- [ ] **C13 Audio**: música por mapa y combate, efectos y gritos; escucha humana del M4A.
  PARCIAL: el smoke verifica BGM de mapa (303) y de combate salvaje (298), SE y
  grito por estado (`9b95defe`); falta la escucha humana.
- [x] **C14 Clima**: niebla y sombra en mapas reales (1.6).

### 3.1 Lista completa por áreas
**Campo y movimiento**
- [ ] Movimiento normal/carrera, giro rápido, delays, saltos, ledge/Acro, Step*,
  hierba larga y elevación; frames Canvas y virtual objects.
- [ ] Clones/obstáculos de mapas conectados, retorno al campo, reset tras warp,
  carga local escalonada, estado inicial/Dive y popup de mapa.
- [ ] Vuelo, pesca, alfombras y pasos, SS Anne/reflejos, paletas de disfraces, matrices affine.
- [ ] Efectos: Fly, Photo Flash, VS Seeker, Lavaridge, Deoxys, Escape Rope, escalera,
  Ripple/Swirl (animaciones, render y warp).
- [ ] Transición de música; audio general.

**Combate**
- [ ] Transiciones: driver completo, Big Poké Ball, ClockwiseWipe, Slice, WhiteBarsFade,
  scanline/HBlank.
- [ ] Entrenadores: tabla de facing y recorrido de batalla; IA; sprites de combate;
  derrota/whiteout.

**Pantallas y menús**
- [ ] Título, Copyright, Game Freak y escenas 1–3 de la intro.
- [ ] Retorno del party menu al campo (fade/controles); naming/subsprites.
- [ ] Cajas del PC y resumen (incluida la regla HM del resumen); guardería; Teachy TV; Fame Checker.
- [ ] Guardado desde script: confirmación, cancelar, escritura y retorno al script.
- [ ] Battle Records y Trainer Tower; Battle Tower y flujo e-Reader.
- [ ] Quest Log: reproducción/UI, paridad normal/warp y retorno al mapa guardado.
- [ ] Créditos completos (nombres y pantallas tras las escenas de mapa).
- [ ] Pantallas de la sección 5 de [PENDING.md](PENDING.md) (Pokédex, tienda, PC,
  Hall of Fame, tragaperras, Item Finder, intercambio NPC, etc.).

## 4. Recorrido de historia

Sigue [PLAN-RECORRIDO.md](PLAN-RECORRIDO.md): un tramo por sesión, punto de control
antes y partida exportada a `tools/playtest/saves/` al terminarlo.

- [x] **4.1 Revisar checkpoint `route4` y actualizar registro** — revisión 2026-10-06:
  carga en Ruta 4 oeste (8,19), movimiento a (15,19), control libre y sin errores.
  `967a496e` no demuestra salida de Monte Moon: falta fósil/flag 562 en el save.
  El tramo 1 sigue parcial; obtener fósil → salida este → Celeste → guardar/continuar
  sigue abierto en el recorrido siguiente y PLAN-RECORRIDO. Notas B2F preservadas.
- [ ] Recorrido zona por zona de Kanto y Sevii (tramos 2–13, incluido postgame de un jugador), con partidas por tramo.
- [ ] Checks headless por sistema en `tools/checks/` donde falten.
- [ ] **4.2 Comparación con el juego original en emulador** [avanzado]. Compilar la ROM
  del decomp (`make` en `../pokefirered`), ejecutarla en un emulador con scripting
  (mGBA), reproducir las mismas pulsaciones con la misma semilla y comparar flags,
  variables, equipo, dinero, posición y mapa. Primer objetivo: hasta el final del
  laboratorio de Oak. Entregar antes un informe de viabilidad.
  PARCIAL: informe y fases 1–3 en [docs/ROM-COMPARACION-VIABILIDAD.md](docs/ROM-COMPARACION-VIABILIDAD.md)
  (`e7a57cf3`…`3cee1e9d`, herramientas en `tools/rom-compare/`). ROM oficial 1.0 verificada por SHA1
  (`assets/gba-reference/`, ignorada). Hecho: scripting mGBA determinista, direcciones de `gRngValue`/`gMain`/save
  blocks, RNG por fotograma corregido en el port (`0767f563`), cadena de RNG idéntica del título a Oak (2.417
  fotogramas), partida nueva hasta el cuarto del jugador con mapa/posición/nombre/género idénticos y una
  divergencia real corregida (resiembra al salir de la pantalla de nombres, `ad3eb30a`), cuarto→pueblo→laboratorio→inicial con
  flags/vars idénticos y dos fallos reales corregidos (`applymovement` sin hueco de movimiento y ventana de spawn por coordenadas
  de cabecera, `620303ab`; informe §13). Los fotogramas entre eventos
  difieren por lag de CPU de la ROM (~10 fotogramas al montar páginas de texto; informe §12), no modelable en general:
  comparar por eventos y con `gRngValue` inyectado. Fase 6 (batalla del rival, informe §14): flags/vars/posición/equipo/rival idénticos hasta el inicio de batalla
  tras corregir `EnableNationalPokedex_RSE` en `NewGameInitData`; el resultado de la batalla depende del RNG
  (ROM: tres `RV_RNG`, tres derrotas con flags/vars idénticos al port; el port ganó en una corrida y cambia
  `VAR_QUEST_LOG_MON_COUNTS`/`VAR_QLBAK_MAP_LAYOUT`, consistente con `quest_log.c` pero sin verificar en la ROM).
  Fase 7 (Ruta 1 → Verde → Tienda → Paquete de Oak, informe §15): flags/vars/posición idénticos en cada
  cambio de mapa y al recibir el paquete (solo difieren las variables del Quest Log por haber ganado el port la
  batalla). Tramo «devolver el paquete → Pokédex» (informe §15.1): ROM y port coinciden en flags,
  vars y bolsa en los 9 cambios de mapa y al terminar la escena (`FLAG_SYS_POKEDEX_GET`, Poké Ball ×5, sin
  paquete; dinero distinto solo por la batalla del rival). El control de la ROM usa `sGlobalScriptContext.mode`
  (`0x03000EB1`, localizado por firma con `scanctx.lua`). Automatizado (`7252d79a`, `fa2ad30d`): `run-rom.sh` reinicia
  mGBA y carga el Lua por System Events (mGBA 0.10.5 no tiene `--script`; exige pantalla desbloqueada y permiso de
  Accesibilidad); `run-milestone.sh` encadena recorrido del port, replay y `compare-route.py`. Port hasta Pewter
  (`FOREST=1`, `ae1935cd`): 0 errores, sin whiteout. Replay en la ROM con compuertas de escena (`PARCEL_GATES`; sin ellas
  la ROM salía del laboratorio antes de terminar el Pokédex): flags, vars y bolsa idénticos en cada mapa hasta la entrada
  del Bosque Verde. **Divergencia abierta:** en el bosque la ROM pierde una batalla (whiteout a la casa del jugador, mapa 4,0)
  que el port gana con el mismo RNG fijado y el mismo inicial nivel 6. Falta registrar cada batalla en la ROM (especie,
  nivel, HP, resultado) y compararla con el port; candidatos: orden/velocidad, daño, precisión o el RNG de batalla.
- [x] **Revalidar escenas con movimiento por script** (detectado en 4.2, `620303ab`; revalidado con `e03bdc7a`,
  `526e9004`): `tools/playtest/smoke/scene-scan.job.mjs` ejecutó 423 etiquetas con `applymovement` de todo el
  decomp en su mapa (384 terminan, 32 entran en combate, resto = artefactos: créditos, enlace, Trainer Tower y
  guardería sin estado previo). Hallazgos reales corregidos: (1) `warpIntoMapAndLoad` no hacía el
  `ScriptContext_Init` de `CB2_LoadMap`: tras `warp`/`warphole` + `waitstate` el jugador quedaba sin control
  (S.S. Anne, Zona Safari, caída de Cueva Helada…); (2) `dump_all_strings` omitía las definiciones
  `ALIGNED(4) const u8` (341 símbolos, entre ellos `gText_Ghost`: `StartMarowakBattle` lanzaba excepción).
  Verificado con teclado real (`tools/rom-compare/port-realtime.mjs`: cuarto→pueblo→Oak→laboratorio→inicial sin
  atascos), gate del driver 20/20, `check:all` 45/45, `ssanne-progress` y `vermilion-progress` pasan.
  Pendiente menor: reejecutar `cerulean-progress`/`route2` desde cero (las partidas del tramo 1–2 se grabaron
  sin movimientos; sus etiquetas sueltas ya pasan el escáner) y mirar a ojo las escenas largas (créditos,
  salida del S.S. Anne, ~2.500 fotogramas sin cambio de posición).
- [ ] Fidelidad de arranque (detectada en 4.2): falta modelar la latencia de `LoadGameSave` entre el copyright y la
  intro (ROM ~15 fotogramas; la de tras sembrar en el título, +17, ya está: `b21dd0df`). El lag de CPU disperso de la
  ROM (informe §12) no se modela. Resolver en la revisión.
- [ ] Decisión de diseño postgame (tickets de Mew/Deoxys).

## 5. Fuera de la meta principal (después)

Enlace e inalámbrico (tabla `LINK` de `tools/portInventory.py`): combate e intercambio
por cable/RFU, Union Room, Mystery Gift/Wonder Card (bloquea `GetSavedRamScriptIfValid`),
e-Reader, minijuegos multijugador, Battle Records por Cable Club y el enlace de `trade.c`.

## 6. Preparación para Emerald (cuando §3.0 esté en verde)

Empiezan cuando `npm run play:smoke` dé OK en todo lo automatizable, que es la red
que avisa si algo se rompe. Ver [docs/VISION.md](docs/VISION.md) fases 2 y 3.

- [x] **6.1 Informe: separación del motor** [avanzado] — [docs/SEPARACION-MOTOR.md](docs/SEPARACION-MOTOR.md)
  (`ec6f0747`, cifras en `tools/engineSplit.py`). Antes de mover código: permiso para tocar la ruta en `portInventory.py`. Proponer qué va a `core/` y qué a
  `games/firered/`, apoyándose en `refs/emerald/functions.json` (3.677 funciones
  idénticas entre Emerald y FireRed) y en los imports reales de `src/games/firered/`. Entregar
  la lista de módulos, el orden de traslado en pasos pequeños (cada paso con
  `check:all` y `play:smoke` en verde) y los riesgos. Sin mover código todavía.
- [x] **6.2 Informe: exportador para Emerald** [avanzado] — [docs/EXPORTADOR-EMERALD.md](docs/EXPORTADOR-EMERALD.md)
  (Codex, `58cfe2a9`; cifra de constantes corregida en `54b6157f`). Partiendo del informe R8 de
  `refs/README.md`, proponer cómo parametrizar `tools/decomp/` por juego (rutas,
  `CPP_DEFINES`, `.decomp-build/<juego>`, `public/<juego>/`) sin cambiar lo que genera
  para FireRed: la regeneración de FireRed debe dar archivos idénticos. Sin código todavía.
- [x] **6.3 Informe: nombres simbólicos** [avanzado] — [docs/NOMBRES-SIMBOLICOS.md](docs/NOMBRES-SIMBOLICOS.md)
  (Codex, `3a1b4425`). Qué salidas conservan nombres y propuesta de `symbols.json` y
  tabla de operandos tipados para la fase 6; comandos reproducidos por el revisor.

- [x] **6.4 Separación del motor, pasos 1–5.6** (Claude, `d2892e70`..`4aa31451`): `src/fr` →
  `src/games/firered`, alias `@game/*` y `@core/*`, `@game/data`, `check:layers`, y 152
  módulos en `src/core` (runtime, modelo Pokémon, scripts, campo, combate, base de menús,
  nombre/marcas/ficha). Contrato en `tools/checks/layers-contract.json` (38 entradas,
  solo puede encoger). Inventario y `public/fr` sin cambios. El paso 6 (interfaz `Game`)
  y el 7 (dividir `save`) no se hicieron: razones y lista de miembros en
  [docs/SEPARACION-MOTOR.md](docs/SEPARACION-MOTOR.md) §8. `play:smoke` completo no se ejecutó
  (el usuario lo declinó); solo C1–C3, C5–C10 y dos drivers.
- [x] **6.5a Emerald caminable en el visor** (Claude, 2026-10-13): `viewer.html?game=emerald`, botón
  «Explorar Mapa»: Brendan/May, colisiones del mapa, surf, NPC de Hoenn, música de Emerald. Sin
  interiores, combates, menús, guardado, bici ni efectos de campo. Verificado en el navegador
  (Littleroot: se camina y los muros bloquean); el panel iba a 3 FPS, sin comparar con la ROM.
- [x] **6.5b Atlas de consulta y validación** (Claude, 2026-10-13, `a62516d9`..`06eaf918`): interiores por warps
  (`src/viewer/ui/interior.ts`; los 943 mapas abren, `interiors.job.mjs`), `check:warps` y `check:compare-data`,
  Pokédex comparada con espalda/icono/huella (`dex.html`), biblioteca visual (`library.html`), comparador
  (`compare.html`), quests con etiquetas (`quests.html`, `quest_tags.json`), línea argumental (`story.html`) e índice
  (`atlas.html`, `docs/ATLAS.md`). Datos contra datos del mismo decomp: no validan comportamiento ni se compararon con
  la ROM. Pendiente: revisión visual con capturas, verificar las 12 etiquetas de confianza baja y el orden `SPINE`.
- [x] **6.5c Johto GBA de Heart & Soul** — `dfe3926b`: fuente fijada, visor 2D `/hns.html` con mundo por bloques, fichas y warps; 584 mapas renderizados / 955 IDs, rechazo explícito de 303 layouts. Verificación fuente→PNG y determinismo; límites y regeneración en [docs/ATLAS.md](docs/ATLAS.md).
- [ ] **6.5c revisión del visor HnS**: zoom/arrastre/búsqueda/warps/historial y captura 390 px cubiertos por 79ec8960; quedan gestos táctiles/dispositivos reales, paridad visual con la fuente/ROM, Route 7 (metatile 902 fuera de tileset), 14 discrepancias de conexiones y variantes superpuestas. NPC son marcadores; animación, paletas horarias y audio no implementados. No acredita portado jugable ni historia HnS.
- [x] **6.5d Visor común eficiente** — `79ec8960`: consulta de FireRed/Emerald/HnS/Crystal, carga por bloques/mips, caché con límite de RGBA estimado, fichas/warps/historial y puente a Explorar; retirada de UI duplicada HnS/Crystal. Datos, determinismo, contraste de renderizadores, recorridos Chromium, caché y capturas escritorio/390 px comprobados; medición y límites en [docs/ATLAS.md](docs/ATLAS.md).
- [x] **6.5e Atlas principal de tres regiones** — `7ef990af`: Kanto FireRed (256), Johto HnS (253) y Hoenn Emerald (487), 996 mapas/140 exteriores, IDs por región, selección de fuentes y variantes separadas, puertas/fronteras y viajes identificados como navegación. Datos, determinismo de 389 archivos, recorrido real Chromium/caché/reposo y capturas escritorio/móvil comprobados; política y límites en [docs/ATLAS.md](docs/ATLAS.md).
- [x] **6.5f Islas Sevii en atlas principal** — `bd310671`: siete islas y 135 mapas asociados a Kanto, interiores/rutas y ferris como navegación de consulta; 1131 mapas/167 exteriores en total. Datos/fuente Seagallop, determinismo de 526 archivos, puertas Tanoby y recorrido/caché/capturas Chromium escritorio/móvil comprobados; sin simulación de ferris ni exploración de Sevii.
- [x] **6.5f Áreas aisladas y especiales** — `652d9e3e`/`7f252e84`: 18 superficies aisladas Hoenn, Faraway Emerald, Navel Rock/Birth FireRed y 14 mapas submarinos en nivel separado con IDs conservados y referencias dive/emerge. Fuente/datos/conexiones/determinismo de 707 archivos y Chromium/puertas/caché/capturas comprobados; 1155 mapas y 203 colocados, sin transporte/Dive simulados. Ver [docs/ATLAS.md](docs/ATLAS.md).
- [x] **6.5g Superficie y accesos a otros niveles** — `fe68ee77`: 155 superficies en plano principal; 1155 mapas consultables, interiores desde puertas, submarinos desde Dive/Emerge con retorno y ferris desde Vermilion/puertos identificados. Se retiran franjas terrestres no ubicadas y submarino del plano; 39 superficies con posición pendiente señalada. Datos/determinismo de 507 archivos y Chromium/puertas/retorno/URL antigua/caché/capturas comprobados; sin simulación de transporte/Dive.
- [ ] **6.5g Geografía pendiente**: verificar y colocar las 39 superficies de `_meta.pendingSurfacePlacement` en `public/map-viewer/principal/catalog.json`, incluidas zonas terrestres, patios/tejados y componentes secundarios Johto/Sevii; entradas y búsqueda siguen disponibles. No convertirlos en islas ni afirmar posiciones por coincidencia de nombres. Conservar revisión exhaustiva/ROM/dispositivos y simulación pendientes.
- [ ] **6.5f Revisión y simulación de áreas adicionales**: revisar exhaustivamente selección, interiores, paletas, eventos y geometría de Sevii, superficies aisladas, islas especiales y nivel submarino; comparación ROM/dispositivos/producción pendiente. Integrar movimiento/transiciones/ferris/Dive mediante simulación por sectores; distribución entre componentes editorial, sin afirmar uniones físicas.
- [ ] **6.5e Mundo continuo y revisión del atlas**: revisar exhaustivamente pertenencia/interiores y siete fronteras fuera de selección; seis discrepancias de conexiones Johto pendientes. Distribución entre regiones/componentes y viajes del atlas son editoriales; resolver geometría y correspondencias explícitas antes de transporte/simulación compartida. Johto estático; conservar revisión ROM, dispositivos y producción.
- [x] **6.5h Kanto: navegación inmersiva por mapas próximos** — `e1702ffe`: viewport/16:9, escalas enteras, menú con pausa, minimapa opcional y retorno al mismo punto del atlas. Canvas/colisiones por mapa con precarga espacial, liberación de lejanos y estado ligero de NPC conservado; borde exportado limitado a la cámara. Checks de carga tardía/cierre/reintento y reloj; Chromium con colisión, 62 pasos Pallet→Ruta 1 y regreso, hierba real, expulsión/reentrada, borde contra fuente, 16:9, pausa y captura 390 px PASS. Muestras del recorrido ~60 FPS; primera muestra de arranque ~48 FPS; corregido y vuelto a medir en 6.5i. Métricas/alcance en docs/ATLAS.md; no acredita paridad ROM ni juego completo.
- [x] **6.5i Kanto: arranque y revisión focal del movimiento** — `e32a8a02`: la capa de carga se oculta de verdad al estar listo, layout y sprites se preparan antes de jugar; errores visibles con reintento. Saltos desde el saliente delantero, aterrizaje comprobado, arco exportado y 32 ticks C; surf cambia solo con paso válido, conserva modo al recargar en agua y rechaza posiciones iniciales bloqueadas. Correr/B quedan estables hasta terminar el paso. Checks focalizados y harness existente C-data PASS; Chromium con teclado para caminar/correr/bici/surf/salto/inverso/recarga y arranque/reintento HTTP 503 PREPARED PASS. Tres muestras iniciales ~59 FPS, recorrido Pallet/Ruta 1 ~60 FPS; no acredita rendimiento general ni paridad completa.
- [x] **6.5j Avatar de navegación de Kanto (Rojo/Hoja)** — `c7a2fca7`: fotogramas/hojas/dimensiones/espejados y comandos desde objects.json con Sprite compartido; carrera corrige índices, alternancia y pausas desde C. Marcha/carrera/bici/surf normales 16/8/6/8 ticks, giros en sitio 8, colisión a pie/bici 32/16 y saltos/transiciones de surf 32. Selector de personaje en menú. Checks: 72 selecciones y 4.608 muestras de frames, sprite/C-data y reloj; Chromium 32 combinaciones (dos personajes/cuatro direcciones/cuatro modos), cuatro colisiones y dos saltos reales, giro/entrada/salida de surf, regresión Pallet/Ruta 1 ~60 FPS y capturas revisadas PASS. Capturas congelan reloj con PREPARED; no simulan terreno/progreso. No acredita ROM/hardware ni efectos de soporte de surf/sombras/profundidad; siguen en 6.5d.
- [x] **6.5k Soporte de surf de Kanto, navegación normal** — `aa4279a8`: SurfBlob original, geometría OAM frente a reserva overworld_frame, cuatro direcciones con Sprite compartido y jinete +1px según comando C; pausa/retirada en tierra/salida. Tipos, honesty, build, tablas C/Sprite, harness PREPARED de hierba/huellas y Chromium (32 combinaciones, ocho comprobaciones del soporte, entrada/recarga/salida, capturas y 62 pasos ~59–60 FPS, p95≤16,8 ms) PASS. Una tarea54 ms/intervalo máximo33,3 ms en recorrido; no garantiza FPS constantes. Soporte durante salto de orilla y sombra de salto resueltos en 6.5l; reflejos/profundidad y revisión completa siguen pendientes en 6.5d.
- [x] **6.5l Efectos durante saltos de Kanto** — `2778bf87`: soporte de surf fijo en agua durante entrada/salida según estados C; sombra de salto desde gfx/OAM y gShadowVerticalOffsets exportado, con exclusiones C; cobertura de hierba desactivada en vuelo. Tipos, honesty, build, tablas/Sprite, harness PREPARED de hierba/huellas y Chromium Rojo/Hoja con teclado/terreno real y capturas inspeccionadas PASS. Reflejos, profundidad por elevación/puentes, cobertura en suelo, validación de ramas de supresión y retirada de sombra al encadenar pasos sin soltar la tecla quedan en 6.5d; no acredita paridad ROM ni todos los efectos.
- [x] **6.5m Reflejos del avatar de Kanto** — `ce2f4708`: scan C de filas actual/anterior, paleta/frames exportados, inversión de y2 y deformación con cdata/trig/intérprete affine original. Máscara de casillas reflectantes adapta prioridad al mapa aplanado; sin compositor completo BG/elevaciones. Tipos, honesty, build, Avatar/affine y Chromium Rojo/Hoja en Ruta22 (cuatro direcciones, paleta/frame, píxeles solo en agua, bici, surf0/1, pausa y capturas) PASS; Pallet no reflectante. Arranque/reintento PASS, ventanas iniciales ~57–58 FPS y posteriores~60. Hielo sin recorrido, clima/ROM, profundidad y cobertura en suelo siguen pendientes en 6.5d; retirada de sombra adelantada al aterrizar, prueba específica con tecla mantenida pendiente.
- [x] **6.5n Cobertura local del avatar por capas** — `30bdd798`: BG1/BG2 según DrawMetatile, prioridad desde tabla C y elevaciones 0/15, sin recorte fijo de pies en Explorar Kanto. Dos canvases 128×128 (128 KiB), referencias de sectores reutilizadas/liberadas e invalidación por animación. Tipos, honesty, build y Chromium Rojo/Hoja en hierba real de Ruta 2 (57 metatiles, píxeles NORMAL/COVERED, orden y capturas) y regresión de reflejos de Hoja PASS. SPLIT solo en Sevii; prioridades 0/1 sin casillas continentales transitables: ramas sin recorrido real. Compositor de cámara completa/NPC/subsprites, colisión por elevación/puentes y revisión exhaustiva/ROM pendientes en 6.5d.
- [ ] **6.5o Revisión pendiente de los puntos 1, 3, 4 y 6 de navegación de Kanto** (diferida por la nueva prioridad 10; retomarla solo por petición expresa del usuario). No cerrar con checks estáticos/PREPARED solamente ni reducir el alcance al último commit.
  - Regresión de esta entrega: suite `viewer-navigation-suite.mjs` **25/25 Rojo y 25/25 Hoja** PASS, incluidos ascensores y casetas ida/vuelta. Confirma los casos del harness; conservar recorrido exhaustivo, ROM, dispositivos y producción pendientes.
  - [x] **Ascensores de navegación** — `5ec96850` (guardas `a03de99a`) sobre `0b1c6ac0`: cuatro menús y 20 destinos extraídos de scripts, rechazo de cambios no soportados, host de animación compartido y retorno por coordenadas conservado al recargar. Azulona Rojo/Hoja (cancelar/misma planta/viaje/recarga/salida), Silph 1F→11F, Rocket B1F→B4F (llave PREPARED; rama sin llave también PASS) y Trainer Tower Roof→Lobby con salida guiada PASS; duración/tiles observados contra cdata. Menú DOM y adaptador acotado; VM general, obtención real de la llave y paridad ROM siguen pendientes; delta 0 cuerpos C nuevos/0 nombres por equivalencias.
  - [ ] **1 Árboles y edificios**: verificar con movimiento real la ocultación parcial/completa y vuelta al frente según BG original, colisiones y ausencia de restos al cambiar sector; revisar también los casos interiores. `70c81706`: Rojo/Hoja, recorridos reales de ida/vuelta en tejado, árbol, mueble 2F y pared 1F; capturas contrastadas píxel a píxel con capas fuente y colisiones focalizadas PASS. `d7aa1aeb`: ocultación completa en Ciudad Carmín (35–37,22), tres rutas a pie de ida/vuelta con Rojo/Hoja y comparación de píxeles PASS (0 visibles detrás; 0 cubiertos al volver). Censo geométrico: 255 mapas/72.050 casillas, seis casillas candidatas; Fucsia, laboratorio de Cinnabar y Ruta 10 sin ruta solo a pie desde la entrada probada, con accesos alternativos/saltos/Surf/scripts sin validar. Siguen pendientes todos los cambios de sector/mapa y la revisión exhaustiva.
  - [ ] **3 Terrenos especiales**: colisiones por lado/elevación, escaleras/puentes/saltos, hielo, giros y corrientes en los mapas conectados; respetar estados/cadencias/direcciones C y restricciones de correr/bici. `f87e8e28` añade barreras direccionales y elevaciones residentes, con checks PREPARED de colisión/vida de sectores y teclado exterior PASS; falta comprobar terrenos reales del alcance. Verificar profundidad durante el primer giro/colisión después de entrar a un mapa. `c9624819` integra desplazamiento diagonal de las escaleras direccionales y reutiliza `GetStairsMovementDirection` del motor; Rojo/Hoja Paleta 1F↔2F, offsets firmados, prioridad y fin de animación rápida PASS. Bajar de bici/espera de 12 ticks integrado sin recorrido real específico; otros mapas/variantes pendientes. Hielo/giros/corrientes/cascada: `97a3122d`/`c4b962e8`/`0d2769df` comparten `ForcedMovement` (49152 casos C nativos) y Rojo/Hoja con teclado pasan hielo (Hall of Fame, Icefall B1F), giros con parada (Rocket B2F, gimnasio de Ciudad Verde), corriente (Seafoam B4F) y cascada (Seafoam B3F); FireRed no tiene Slide, Walk ni Slip de Trick House en sus mapas, así que esos manejadores quedan solo con la comparación C. La entrada a Surf tras una colisión sigue siendo adaptación del visor. Escaleras mecánicas de los Centros Pokémon: `eebdadff`/`59df1eb5` comparten las tareas de `field_effect.c`/`special_field_anim.c` (3488 frames/64 casos C nativos); Rojo/Hoja suben y bajan en Ciudad Verde 1F↔2F con teclado. Bajar de bici en escaleras direccionales: Rojo/Hoja en Ruta 16 entrada norte 1F→2F, espera de 12 ticks y sin bici al llegar PASS (smoke `viewer-bike-stairs`). Puente de Ruta 12 (tramo al sur del Snorlax): Rojo/Hoja caminan 9 baldosas con elevación 3 y Surf automático al llegar al agua (smoke `viewer-bridge-walk`); no cubre pasar bajo un puente ni la prioridad de dibujo. Niveles de cueva: Victory Road 1F, escalones de roca (10,9), elevación 3↔4 ida y vuelta con Rojo/Hoja PASS (`viewer-cave-levels`). Corrige un bloqueo real: el visor pasaba la elevación de prioridad (previousElevation) a la colisión; ahora `playerCurrentElevation` sigue la regla de ObjectEventUpdateElevation (0 en baldosas neutras). Los jobs actuales contrastan prioridad del avatar con sElevationToPriority (cueva también comprueba z-index); la oclusión completa de puentes/cuevas sigue pendiente. Selección de planta resuelta en 5ec96850; conservar revisión exhaustiva de terrenos y profundidad.
  - [ ] **4b Auditoría de animaciones FireRed en navegación** (`GROUND_EFFECT_FLAG_*` frente a los 255 layouts de FireRed y el visor): cubiertas con recorrido real o comparación C: hierba alta (spawn/move/salto), huellas de arena y rastro de bici, charco, agua somera que fluye, ondas, agua termal (`HotSpringsWater`, Ember Spa), sombras, reflejos, polvo de aterrizaje, salpicaduras de salto, Surf blob, puertas, escaleras direccionales, teletransporte, caída, escaleras mecánicas, hielo/giros/corriente/cascada y animaciones de tiles (6/6 callbacks de `tileset_anims.c`). No alcanzables en FireRed (predicado `false` o 0 mapas): hierba larga, hierba corta, ceniza, arena profunda, huellas, puente de tipo, alga marina y montón de arena. Fuera del visor por requerir NPC/scripts: iconos de exclamación/pregunta, uso de movimientos de campo (Corte, Surf, Fuerza…), Vuelo, Hall of Fame, sacudida de ascensor, PC y curación del Centro Pokémon. Pendiente: aserciones de prioridad en cuevas/puentes y revisión de cada animación de objeto con NPC cuando existan.
  - [ ] **4c Puertas por tipo** (`viewer-door-types.mjs`, observador existente con píxeles/cadencia/fundidos): 13 gráficos 1x1 de `sDoorGraphics` con warp real en exteriores de Kanto PASS con Rojo (general, corrediza simple/doble, grandes almacenes, Cerulean, Viridian, Vermilion, Lavender, Laboratorio de Oak, laboratorio de Cinnabar, Fuchsia, Pewter, Zona Safari); Paleta y Centro Pokémon ya cubiertos. Puertas 1x2 (`viewer-door-large.job.mjs`, desde warps interiores `MB_WARP_DOOR`): ascensores de grandes almacenes, Rocket y Silph, puerta de camarote del SS Anne, ascensores de Trainer Tower y puerta del cable club PASS con Rojo (píxeles de tiles fuente y duraciones `sDoorAnimFrames_*Large`, que hoy coinciden con las pequeñas: 20 ticks); las 13 puertas 1x1 también PASS con Hoja. Saffron City real se abre como mapa de contexto desde las cuatro casetas de ruta (`viewer-saffron-gates`, Rojo/Hoja PASS): Ruta 5 llega en `MB_CAVE_DOOR` y sale un paso como `Task_ExitNonAnimDoor` (34,6); Rutas 6/7/8 en sus flechas; sus puertas (casa, Silph Co, corredizas) PASS con el observador. Puertas de Sevii (Isla 1/2/4/6, como mapas de contexto) y de Saffron PASS con Rojo; las 20 de Kanto, incluidas las 1x2, PASS con Hoja. Las puertas del teletransportador de Cabaña Marina (Ruta 25, baldosas (3,3) y (10,3)) y del almacén Rocket de Isla 5 (`RocketWarehouseDoor_Locked` 779 hasta que un script la cambia a 687) no tienen warp de puerta: las mueven scripts/NPC, así que dependen de la decisión sobre la VM en el visor. Suite completa: `node tools/playtest/smoke/viewer-navigation-suite.mjs [--doors]` con `PW_CHARACTER=red|leaf`; 24/24 PASS con ambos (`viewer-tracks` se reescribió sobre un arranque por URL en Ruta 19: fallaba ya en `b2fa6a73`). Pendiente: la integración visual de Saffron con las rutas (el atlas solo contiene el stub `MAP_SAFFRON_CITY_CONNECTION`, 48x40 frente a 66x55).
  - **Saffron y sus casetas** — `d41c93d0`: `mapjson.cpp:155–159` emite NULL para las conexiones de Saffron real; `step_maps.py:144–147` ahora lo respeta. Check nativo de ambas cabeceras, 425 mapas fuente y regeneración determinista PASS; Rojo/Hoja hacen las cuatro idas/vueltas caseta→ciudad→caseta→Ruta 5/6/7/8. La ciudad real (66×55) conserva su contexto y el atlas el mapa de conexión (48×40); inserción visual conjunta pendiente, sin inventar conexiones jugables.
  - [ ] **4d Acciones del jugador** (`field_player_avatar.c`, 55 funciones `Player*`): con recorrido real en el visor: caminar/correr/girar en sitio, `PlayerWalkFast` (Surf, hielo), bici, salto de repisa, giro, corriente, choque a pie (32 ticks) y en bici (16), y desde `2d71365a` **caminar y correr lento en escalones de roca** (23/11 ticks; Victory Road 1F 16/23/16 y 16/16/23/16; antes todo iba a 16). No aplican a FireRed (Emerald/RS): `PlayerAcro*`, `PlayerStartWheelie`/`*Wheelie*`, `PlayerAvatar_*SecretBaseMat*`, `PlayerAvatarTransition_Underwater`. Sin aserción propia: `PlayerGlide`, `PlayerFaceDirectionFast` y `PlayerShakeHeadOrWalkInPlace` (los usa el motor desde scripts/NPC), `PlayerAvatarTransition_*` fuera de Surf/bici y `PlayerSetCopyableMovement`. Correr lento en escalones con Shift: 8/11/8 subiendo y 8/8/11/8 bajando en Victory Road 1F (Rojo). Puente de Ruta 12: prioridad de cada paso igual a `sElevationToPriority`. Pendiente: recorrer cada `MovementAction_*` que el jugador ejecuta por script cuando haya VM en el visor.
  - [ ] **4e Sombras y reflejos por terreno** (`viewer-reflection-terrains`, `viewer-shadow-terrains`, Rojo/Hoja PASS, `863ddb9c`): reflejo de agua de estanque, charco y agua de camino de bicis (distorsión afín, tipo 2) y de los dos mapas de hielo (espejo, tipo 1) con copia de fotograma, máscara sin fuga a tierra y celda negativa sin filas reflectantes; sombra de salto visible en todos los fotogramas al aterrizar o salir de hierba alta hacia suelo y oculta al aterrizar en hierba alta, como `UpdateShadowFieldEffect`. Los saltos de FireRed solo aterrizan en suelo o hierba alta, así que no hay caso real de sombra sobre agua. Bici: reflejo con fotogramas de bici y mismo tipo en estanque, charco y camino de bicis (los mapas de hielo no permiten bici); Surf: estanque con fotogramas de Surf y océano sin reflejo (`IsReflective` es falso para `MB_OCEAN_WATER`). Pendiente: orden de prioridad del reflejo frente a BG y la sombra de objetos de NPC.
  - [ ] **4 Efectos durante navegación**: hierba, huellas/bici, ondas, polvo, charcos/agua somera, aterrizajes, sombras/reflejos, prioridad y retirada/pausa; casos reales Rojo/Hoja. 297fc052 integra salpicaduras adjuntas y aterrizajes, corrige centro de onda y orden de prioridad/hierba; harness PREPARED y teclado exterior PASS, revisión de casos interiores reales pendiente. `70c81706`: Rojo/Hoja en hierba de Ruta 1, arena/huellas a pie y bici de Ruta 19, agua somera de Ruta 20 y ondas de Ciudad Azulona; activación/presentación/pausa y retirada aplicable PASS. Los 88 metatiles de charco censados en mapas conectados tienen colisión: no inventar un recorrido ni equiparar el harness PREPARED a validación real; `4c5126a4`: aterrizajes reales secos/húmedos de Islas Espuma con Rojo/Hoja, polvo/salpicadura y Surf al caer al agua PASS; resto de efectos/interiores pendiente.
  - [ ] **6 Interiores jugables**: mismo control/render/cámara que exteriores; entrar, caminar y salir por warp correcto; puertas, escaleras/teletransportes, llegadas, transiciones y retorno dinámico sin recargar todo el juego. Censo actual: 255 mapas conectados desde los 37 exteriores, 941 warps y ocho MAP_DYNAMIC (ascensores y salas de enlace solo como navegación); comprobar destinos/elevaciones y no confundir consultar mapas con transitarlos. NPC/historia/combates completos, guardado de sesión, móvil, Hoenn/Johto y conexiones regionales no forman parte de este objetivo. `33a980b4` conecta el contexto interior al mismo movimiento/render/cámara/efectos, eventos de warp por coordenadas/elevación, direcciones de llegada C, retorno dinámico único y URL interior. Chromium real: casa de Paleta entrada/caminar/salida, recarga y escaleras 1F↔2F PASS; libera grids anteriores. Check de datos: 933 destinos estáticos y 47 entradas con retorno dinámico PASS en 255 mapas. No cierra el punto: `a4b1148b` integra animación/fades de puertas y apertura de pantalla; Rojo/Hoja en Paleta y Centro Pokémon de Ciudad Verde pasan fotogramas/píxeles/cadencias, entrada/recarga/salida y liberación del mapa previo. Corrige la terminación del fade compartido (cinco llamadas finales, check focal PASS). `c9624819` incorpora entrada/salida diagonal de escaleras de Paleta con movimiento real y sin rebote. El blend conserva la adaptación de overlay del motor: sin comparación ROM global. `4aab2061` comparte las tareas C de teletransporte entre motor y visor: oracle nativo 3700 frames/24 casos; Rojo/Hoja, ida/vuelta en gimnasio de Saffron y Silph 3F↔5F, dirección/prioridad/retirada/no rebote PASS. `4c5126a4` comparte siete estados C de caída: oracle nativo 944 frames/24 casos; Rojo/Hoja en Islas Espuma 1F→B1F seco y B2F→B3F húmedo, aterrizaje/visibilidad/prioridad/sacudida/Surf/liberación PASS. El visor usa ancla GBA virtual y salida de agujero adaptada de `hole.inc` (esperas 21/3/61 verificadas); no ejecuta la VM de historia ni demuestra paridad global ROM/clima. Tipos/honesty/build, checks focales de transiciones y diff PASS. Ascensores/selección de planta resueltos en 5ec96850; las cuatro casetas de Saffron tienen ida/vuelta hasta sus rutas comprobada en d41c93d0. Conservar revisión exhaustiva de interiores/efectos, profundidad y presentación conjunta de Saffron en el atlas; la cabecera original no conecta la ciudad real directamente con los exteriores.
- [x] **6.5p Primer punto de control: partida, menú básico, guardar/continuar, Centro Pokémon y compra** — `3935b183`: inicial aleatorio Bulbasaur/Charmander/Squirtle/Pikachu Nv.5, cinco Poké Balls y ₽3.000; SaveBlock/mochila/curación/tienda/VM existentes, clave de guardado independiente. UI de ventanas/sprites sobre el mapa del visor, sin segundo escenario ni diálogo modal de juego.
  Chromium: inicio/menú/guardar/continuar y enfermera de Viridian Rojo/Hoja; compras de 3 y 12 Poké Balls en Pewter, rechazo con ₽0 y recarga persistente PASS. PREPARED: ubicación inicial por URL y lesión antes de curar; ninguna compra/curación ni flag de historia preparados. Continuidad de mapas/cámara, interiores Rojo/Hoja, 58 checks, tipos/honesty/build PASS; delta 0 cuerpos C nuevos/0 equivalencias por nombre.
  Adaptaciones/pendientes: inicio temporal, menú DOM de consulta y proyección de ventanas/sprites del motor; eventos automáticos de mapa/historia, VM general, revisión completa de objetos dinámicos del visor (persistencia de poses observadas en `31dfe405`), otros NPC/centros/tiendas, venta, menús completos, prioridad general de sprites y comparación audiovisual/ROM sin cerrar. Conservar §6.5o y las demás validaciones abiertas.
- [ ] **6.5q Combate salvaje y captura (prioridad 4, después de 1–3)**: integrar sobre la navegación las rutas existentes de encuentro, movimientos/daño, objetos/captura, experiencia y retorno al mapa con equipo/mochila/dinero persistentes; definir con el usuario la tanda y aceptación antes de encargarla a otro agente.
- [ ] **6.5r Gimnasio de Brock (prioridad 7; otros gimnasios en prioridad 8)**: diálogos, entrenadores/líder, victoria y medalla persistente; después los otros siete gimnasios con sus eventos. Depende de la integración de combate y de la VM de historia necesaria; no fabricar progreso para validar.
- [ ] **6.5s Planificación conjunta para otros agentes** (petición del usuario, 2026-10-15): orden 1–8 y reserva expresa de 9–11 ya registrados arriba; concretar el alcance de la siguiente tanda y sus pruebas de aceptación dentro de esas prioridades antes de repartir trabajo. Un agente a la vez en `main`, sin ramas/worktrees/subagentes automáticos ni push; preservar cambios ajenos. Reorganización general de carpetas/documentos diferida.
- [ ] **6.5d Explorar por sectores y revisión restante**: Kanto continental usa mapas próximos (6.5h); el inspector técnico y Hoenn conservan carga global, Johto es estático. Arranque/movimiento tienen revisión focal en 6.5i y avatar base en 6.5j. Orden acordado: efectos (hierba, agua/ondas, polvo, huellas, sombras/reflejos, soporte/balanceo de surf y máscaras de profundidad) → NPC/objetos → recorrido exhaustivo de Kanto (incluidos terrenos especiales/cámara/cargas) → interiores con control/llegadas/salida → sesión persistente → sectores Hoenn/Johto → conexiones entre regiones. Actualizar jobs UI históricos C7/huellas al modo inmersivo antes de usarlos en la revisión de efectos; la regresión actual usa los drivers nuevos. Quedan audio y medición en producción/dispositivos. Conservar revisión de sprites, ROM, Route 7 HnS, discrepancias de fuente, gestos/dispositivos reales y producción; los interiores básicos ya usan control compartido (6.5o), pero las transiciones fuente y el recorrido completo siguen abiertos, sin historia/combates del juego.
- [ ] **6.5 Primer corte de Emerald (fase 3)**: elegir un sistema pequeño de
  `docs/EMERALD-FALTANTE.md` y portarlo sobre `src/core` con `GAME=emerald`; cada entrada del
  contrato que Emerald necesite decide si se abstrae o se bifurca. Los datos de Emerald ya
  se exportan y validan (`docs/EMERALD-EXPORTADOR-DIAGNOSTICO.md` §7–9). Medido el 2026-10-13
  (`tools/emeraldCoreGap.py` → [docs/EMERALD-BRECHA-NUCLEO.md](docs/EMERALD-BRECHA-NUCLEO.md)):
  `src/core` contra Emerald da 898 errores de tipos; Emerald solo aporta 4 de los 38
  módulos del contrato (`data`, `generated/constants`, `generated/structs`,
  `generated/metatileBehavior`); faltan 227 constantes de FireRed y `save`, `game`,
  `questLogEvents`, `battle/ext`… Esa lista es el trabajo.

## 7. Herramientas de diseño (fuera del juego)

No tocan `public/fr/`; salvo cambios mínimos de sandbox de 7.3, no tocan `src/games/firered/`.
Las tareas de módulos del visor pueden hacerse en paralelo con las secciones 1–4.

- [x] **6.4 Exportador por juego (Emerald)** — datos `37fe6675`, `5d482143`, `75a54ac2`, `c1a981f6`, `674615b9`; validación `bf6fffdc`…`7466b3ad`;
  [docs/EMERALD-EXPORTADOR-DIAGNOSTICO.md](docs/EMERALD-EXPORTADOR-DIAGNOSTICO.md) §7–9. `EXPORT_GAME=emerald` termina los 15 pasos y
  `tools/emeraldExportValidate.py` + `tools/emeraldScriptValidate.py` los comparan con las fuentes (66.470 + 17.228 comparaciones, 0
  diferencias; 98,8 % de `scripts.bin` reensamblado); FireRed regenera idéntica. Tilesets de Emerald con `attributes` (16 bits) y
  `attributes32` (formato FireRed). Abierto (validación): los datos no están contrastados con la ROM ni con el motor.
- [ ] **6.6 Emerald: cablear en el motor lo ya exportado** — hecho: índice de Hoenn (`e9a43e6e`), visor de Hoenn solo lectura con
  `?game=emerald` (`e971864b`: perfil de tilesets 512/6, `attributes32`, comportamientos de Emerald), `UseEmeraldCoordEventWeather` y la voz
  inversa (`da9c4466`). Falta: llamar a `UseEmeraldCoordEventWeather(game.weather.setWeather)` al cargar Emerald (no existe cargador), terreno y
  tipo de encuentro de Emerald derivados del comportamiento, animación de tiles y exploración de Hoenn en el visor (los sprites se muestran fijos y la música carga, sin escucha; Ruta 118 queda muda), y el resto de la
  integración de Emerald. Sin comprobar jugando.
- [x] **6.5 FireRed: muestra `sc88pro_tuba_39` ausente del export de audio** — `795e7cb6`. La etiqueta con comentario `@` se saltaba en
  `step_audio._sample_files`; ahora `samples.json` la lista y se genera el `.wav`. `check:m4a` pasa; sin escucha de las canciones con `tuba_keysplit`.
- [x] **7.1 Visor del mundo, versión 1 (Kanto exterior)** [medio] — `7feababe` (rama
  `muse/visor`). Pistas §4.1–4.3 cuadran con datos (sin PISTA INCORRECTA); §6 verificado
  en navegador contra partidas reales (Verde) + capturas de mundo y ficha.
- [x] **7.2 Visor: correcciones y fichas para el modo libre** [básico] — opencode,
  `ee5d81ec`. Zoom, hash, flags y leyenda corregidos; `TRAINER_` y dirección de visión en
  los 164 entrenadores; writers con `addvar`/`copyvar`.
- [ ] **7.3 Visor: "Jugar aquí"** [medio] — [docs/VISOR-MUNDO.md](docs/VISOR-MUNDO.md) §8.
  DIFERIDA: sandbox y clave aparte existen en motor (`4bf12ca1`); falta integrar y
  validar juego completo. Usuario prioriza sandbox creativo 7.6 (sin batallas/historia);
  la exploración libre del viewer no necesita cerrar esta tarea.
- [x] **7.4 Visor: mejoras pequeñas** [básico] — `cd675c45` (rama `muse/visor-2`).
  Puertas nombran interior, buscador legible, zoom redondeado, estado inicial NPC con
  cita (`event_scripts.s:1013`); verificado por punto en navegador.
- [x] **7.5 Visor: animaciones de tiles** [básico] — `58fd3472` (rama
  `muse/visor-anim`). `TilesetAnimator` sin tocar `src/games/firered/`; flores (5 estados) y fuente
  verificadas contra el juego real; interruptor apagado por defecto.
- [ ] **7.6 Viewer: sandbox creativo persistente** — [docs/VISOR-MEJORAS.md](docs/VISOR-MEJORAS.md).
  Inspeccionar, editar tiles/rellenar huecos, guardar/reabrir y explorar mundo editado;
  Codex C1–C7. Sin batallas/historia; audio/editor y animaciones siguen pendientes.
  C3 base `0c890154`: zoom/scroll, selección/modo/posición/panel en URL y cancelación;
  checks y navegador PASS. C3 parcial: extracción/foco/seguimiento y hash sin recarga.
  Entregas integradas: M1–M9/R1–R5 cerradas; M11 aceptada (`ddd899ae`),
  M10 aceptada tras R6 (`3ac164a7`), revisión en VISOR-MEJORAS §4.
  C2/C7 `6743381e`, M12/R7 `3b3acabc` y M13 `a29c9ae9` integrados en main:
  reloj/loader/eventos, huellas/curvas/41–57 ticks y recorrido arena PASS.
  Profundidad/agua/salto reales y modelo editable siguen pendientes.
  Integración `ebe759c4`: viewer, 1.16/1.17, jobs C5/C6/C8/C13 y revisión B1.
  Tipos/build/honesty y checks focalizados PASS; C8/C13 siguen MANUAL parcial.
