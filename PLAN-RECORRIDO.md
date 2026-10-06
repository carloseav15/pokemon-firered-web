# Plan de recorrido para la fase de revisión

Estrategia actualizada el 2026-10-06. Define trabajo futuro; esta actualización
no ejecuta ni acepta ningún tramo. Estado y tareas abiertas en
[TAREAS-FINALES.md](TAREAS-FINALES.md) §1–4; reglas en [AGENTS.md](AGENTS.md).
Driver y comandos: [guía técnica §6](docs/PORTING-GUIDE.md#6-cómo-se-prueba-y-valida).
El viewer creativo tiene su propio ciclo de edición/guardado/exploración y no
sustituye este recorrido del juego.

## Objetivo y tres pasadas

1. **Continuidad de historia:** una partida desde el inicio, encadenada hasta Liga
   y contenido de un jugador de Sevii. Verificar eventos, recompensas, acceso a
   zonas y devolución del control. Resolver bloqueos y reglas incorrectas.
2. **Sistemas y alternativas:** reutilizar checkpoints para cubrir ramas que una
   partida no demuestra: cancelar evolución, derrota, captura con equipo lleno,
   PC vacío, opciones de menús, decisiones y escenarios opcionales. Usar §3 de
   TAREAS-FINALES; no repetir toda la historia por cada caso.
3. **Fidelidad visual, temporal y audio:** comprobar escenas representativas y
   puntos dudosos contra C/datos; comparación con ROM según tarea 4.2. Una salida
   de estado correcta no valida animación, composición, duración ni sonido.

Cerrar la primera pasada significa historia recorrida, no juego enteramente
validado. Mantener pendientes las otras pasadas. Enlace/inalámbrico/Mystery Gift,
e-Reader y minijuegos multijugador quedan fuera. Tickets de eventos requieren la
decisión de alcance de TAREAS-FINALES §4; no concederlos artificialmente.

## Antes de iniciar

- [ ] Revisor fija rama/commit integrado; ejecutor usa worktree propio y servidor
      propio. Una persona/agente responsable de cada tramo, sin duplicación.
- [ ] Ejecutar `npm run play:smoke` como diagnóstico inicial. Separar FALLO del
      juego, del driver o del entorno. No repetir la suite completa por tramo.
- [ ] Inventariar checkpoints existentes y su procedencia; un guardado importado
      demuestra su estado inicial, no cómo se obtuvo. Confirmar `route4` no prueba
      el fósil ni la salida de Monte Moon.
- [ ] Elegir tramo piloto: completar y reconstruir evidencia del tramo 1; después
      tramo 2. Medir tiempo, llamadas/consumo disponible y fallos del ejecutor.
- [ ] Antes de empezar un tramo, leer scripts C relevantes y fijar los resultados
      esperados. Coordenadas, IDs, dinero y flags salen de datos/fórmulas reales;
      no copiar cifras antiguas ni inferirlas del TS que se está evaluando.

## Checklist reutilizable por tramo

**Entrada**
- [ ] Registrar commit, checkpoint, mapa/posición, equipo, bolsa, dinero, medallas
      y flags/vars relevantes; lectura de estado permitida, escritura no.
- [ ] Definir inicio, final, acciones obligatorias, resultado de cada evento y
      casos alternativos que se derivan a la segunda pasada.
- [ ] Registrar ayudas PREPARED antes de usarlas y comprobar que no fabrican
      precisamente el resultado que se pretende validar.

**Recorrido**
- [ ] Llegar con movimiento normal: conexiones, puertas/escaleras y colisiones
      respetadas; interacción y cambios de mapa devuelven el control.
- [ ] NPC/scripts: diálogo legible, movimiento/locks terminan, elección tomada
      produce la rama correcta; cancelar y reinteractuar donde corresponda.
- [ ] Combates obligatorios: inicio, combate, desenlace y retorno al mapa; equipo,
      experiencia, dinero, flags/recompensas y entrenador ya vencido coherentes.
- [ ] Objetos/recompensas: entrega real por guion, bolsa/equipo correctos y uso o
      desbloqueo posterior comprobado; no sustituir la obtención por una mutación.
- [ ] MO/objeto clave nuevo: obtenerlo por evento, probar permiso antes/después
      y uso real por UI, efecto sobre mapa y posibilidad de seguir avanzando.
- [ ] Guardar desde el menú real y recargar/CONTINUAR; conservar mapa/posición,
      equipo, inventario, dinero, medallas y progreso esperado. Verificar regreso
      del Quest Log cuando corresponda. `H.checkpoint()` no valida GUARDAR.
- [ ] No hay excepción nueva ni bloqueo; anotar anomalías visuales/audio con mapa,
      acción y evidencia sin convertirlas automáticamente en bloqueos.

**Salida**
- [ ] Comprobar el resultado final y el acceso al siguiente tramo por acciones
      reales; un mapa cargado por depuración no prueba su acceso.
- [ ] Exportar checkpoint antes/después a `tools/playtest/saves/`; confirmar que
      el final se puede importar y continuar. Conservar procedencia y ayudas.
- [ ] Entregar una fila breve: tramo, commit probado, checkpoints, acciones y
      aserciones, resultado, ayudas, incidencias y pendientes visuales/manuales.
- [ ] Revisor acepta con evidencia; actualizar tareas correspondientes sin borrar
      validaciones pendientes. Arreglos y registro van en commits separados.

## Tramos y riesgo principal

El orden es una ruta propuesta; confirmar permisos y prerequisitos en scripts.
No imponer una cifra de medallas ni un orden opcional si la fuente permite otro.

| Tramo | Ruta / final | Validaciones específicas además de la checklist |
|---|---|---|
| 0 | Inicio → Paleta → Verde → Brock / Plateada | Título y NUEVA PARTIDA sin `?fr=new`, Oak y nombres, inicial/rival, Pokédex, entrega del paquete, eventos de progreso, gimnasio y recompensa |
| 1 | Ruta 3 → Monte Moon → Ruta 4 | Escaleras/colisiones de cueva, Rocket, elección de fósil y recepción, salida real, PC y guardado |
| 2 | Celeste → Rutas 24/25 → Bill → Misty → salida sur | Rival/Puente Pepita, guion y recompensa de Bill, gimnasio, casa robada/Rocket y apertura de camino |
| 3 | Rutas 5/6 → Carmín → S.S. Anne → Surge | Acceso con billete, rival/capitán, obtener/enseñar/usar Corte, puzle de cubos y desbloqueo del gimnasio, retirada del barco |
| 4 | Diglett / Ruta 11 → Rutas 9/10 → Túnel Roca → Lavanda | Acceso al ayudante/Destello según fuente, iluminación si se obtiene, recorrido de cueva, escaleras y salidas |
| 5 | Rutas 8/7 → Azulona → Rocket → Erika | Tiendas, té y guardias, baldosas giratorias, ascensor/llave, Giovanni/Silph Scope; casino en segunda pasada |
| 6 | Torre Pokémon → Fuji → Poké Flauta → Snorlax → rutas ciclistas | Fantasmas antes/después del Scope, evento Marowak, rescate, flauta por UI, desenlace de Snorlax y paso desbloqueado, bicicleta y pendientes |
| 7 | Azafrán → Silph S.A. → Sabrina | Guardia de acceso, teletransportes/Tarjeta Llave, rival/Giovanni, regalos, liberación del edificio y gimnasio |
| 8 | Fucsia → Safari → Koga | Entrada/coste, pasos/retirada de Safari, captura/huida, obtener Surf y Dientes de Oro, entregar y obtener Fuerza, permisos/uso de MO |
| 9 | Surf → Canela → Mansión → Blaine | Agua/desembarco, interruptores y rutas de Mansión, llave/acceso al gimnasio, recompensa; resurrección del fósil en segunda pasada |
| 10 | Viaje con Bill → Sevii 1–3 → regreso | Ferry, encargos Celio/Bill, eventos de Dos/Tres Islas y retorno; completar requisitos reales, no basta visitar mapas |
| 11 | Verde → Giovanni → Rutas 22/23 → Calle Victoria | Gimnasio accesible, rival, guardias de medallas, Fuerza/rocas y salidas de cueva |
| 12 | Liga → Campeón → Hall of Fame → créditos → continuar | Combates consecutivos, mugshots, recuperación entre combates permitida, registro de equipo, créditos, guardado y estado postgame al continuar |
| 13 | Postgame de un jugador / Sevii restante | Requisitos de Pokédex y accesos según C/scripts, misión de Celio y objetos entregados por evento, Rocket/almacén y zonas abiertas; legendarios y alternativas en segunda pasada |

## Casos de sistemas que la historia no cubre por sí sola

Usar TAREAS-FINALES §3 como checklist única de sistemas. Esta tabla asigna ventanas
para probarlos; no cierra esas tareas solo por haber pasado por una zona.

| Ventana | Casos |
|---|---|
| Inicio / Plateada | C1/C2 arranque completo, guardar/continuar y Quest Log C3/C4; tienda/menús C9/C10; derrota C7 |
| Antes de Monte Moon | C5 luchar/huir/capturar y captura con equipo lleno; C8 curación, depósito/retiro y 1.18 PC vacío |
| Celeste y siguientes | C11 evolución: cancelar/aceptar y movimientos nuevos; ramas opcionales, objetos de combate y estados |
| Cada nueva familia de mapa | C12 puertas, conexiones, cuevas, cartel, colisiones y movimiento; revisar tablas/wrappers §2 cuando un fallo los implique |
| Primera aparición de un efecto | C13 estado BGM/SE/grito y muestra de escucha humana; clima C14, reflejos/sombras, MO, surf/bici, animaciones y profundidad |
| Postgame / final | Intercambio NPC, guardería, Teachy TV, Fame Checker, casino y demás pantallas de §3.1; Hall of Fame y persistencia final |

## Ayudas y automatización

- Automatizar pulsaciones y navegación con el driver existente, auditando el helper
  elegido: `H.goto` usa BFS sobre colisiones, `H.battle` pulsa menús, `H.heal` habla
  con la enfermera; sus retornos no son aserciones suficientes. Confirmar desenlace
  en estado y devolución del control. No asumir que toda API debug simula input.
- Hasta Monte Moon, conservar la regla de recorrido sin preparación de equipo.
  Desde Celeste, preparar niveles/equipo si evita grind, en paso separado PREPARED.
  Ese tramo no valida equilibrio, experiencia ni evolución causados por la ayuda.
- Nunca escribir flags de historia, medallas, MO/objetos clave ni resultados de
  combate para declarar éxito. No usar teleport como prueba de conexiones/acceso.
- Agrupar movimientos y consultas; capturas en escenas clave o al fallar, no cada
  paso. Usar jobs/checks reutilizables para regresiones ya entendidas.
- Cada bucle/espera lleva tope. Los jobs smoke conservan su límite existente;
  un tramo largo se divide en hitos reanudables, no en un job ilimitado.

## Fallos, prioridad y escalado

1. Guardar reproducción: checkpoint previo, commit, acciones mínimas, esperado y
   observado, estado relevante y primera excepción. Distinguir juego/driver/entorno.
2. Ejecutar una reproducción limpia. Si sigue fallando, no superar dos intentos de
   diagnóstico del ejecutor; entregar al revisor. No saltar el evento para seguir.
3. P0: pérdida/corrupción de guardado. P1: bloqueo de historia o regla necesaria
   incorrecta. P2: fallo de sistema opcional. P3: detalle visual/audio no bloqueante.
   Texto ilegible, render que impide navegar o audio que cuelga se clasifican por
   impacto, no automáticamente como cosméticos.
4. P0/P1 bloquean aceptación y continuación de esa cadena; otros casos independientes
   pueden probarse desde checkpoints identificados. P2/P3 quedan en TAREAS-FINALES,
   con evidencia; no desaparecen porque el tramo se acepte para continuidad.
5. Corrección fiel contra C → comprobación focalizada → repetir desde antes del
   fallo y hasta recuperar continuidad. Ejecutar checks de AGENTS al cerrar código.
   No repetir toda la historia ni todas las suites sin una dependencia afectada.

Resultados: **PASS continuidad**, **FAIL**, **BLOCKED** o **MANUAL pendiente**.
Una comprobación sin ejecutar es NOT RUN; una pantalla cargada sin aserciones no
es PASS. Fidelidad visual/audio y paridad con original tienen su resultado aparte.

## Reparto actual: Sonnet 5.5, Gemini Flash 3.8 y GPT-6.1 Sol

Asignación propuesta por rol; no demuestra que un modelo sea más barato/mejor.
Tareas preparadas para entregar al usuario: este documento no crea agentes ni
manda mensajes. Sonnet mantiene la cadena de historia, Flash ejecuta validaciones
acotadas y Sol revisa/diagnostica/integra. Cada uno en worktree y puerto propios.
TAREAS-FINALES sigue siendo la lista única de problemas y validación pendientes;
los IDs siguientes son paquetes de ejecución para sus tareas, no nuevos cierres.

### Primera tanda (hacer ahora)

- [ ] **SOL-01 — Fijar base y reglas de aceptación.** Leer AGENTS, TAREAS-FINALES
  §1/§3/§4 y este plan. Fijar el commit del juego integrado para ambos ejecutores,
  indicar worktrees/puertos, checkpoints y driver. Confirmar scripts fuente para
  los resultados esperados de SON-01/FLASH-02. Entregar contrato breve con rutas,
  final y aserciones. El viewer y M13 no son prerequisito de la ruta del juego.
  **Aceptación:** ambos ejecutores pueden arrancar en la misma base identificada,
  con resultados verificables; no mezclar commits durante un trabajo.

- [ ] **FLASH-01 — Diagnóstico inicial y mapa de checkpoints.** Tras SOL-01,
  ejecutar `play:smoke` con servidor propio; inspeccionar los resultados de cada
  C1–C14 y distinguir PASS/FAIL/MANUAL/NOT RUN, incluyendo límites de las pruebas.
  Revisar saves de tools/playtest/saves y registrar mapa/equipo/procedencia cuando
  se pueda verificar. No transformar existencia de un save en tramo jugado.
  **Entrega:** tabla breve, comando/commit probado y evidencia de fallos. Cambios
  solo en pruebas si el driver falla; reportar al Sol los fallos del juego.
  **Aceptación:** ninguna salida parcial o timeout figura como PASS completo.

- [ ] **SON-01 — Partida nueva completa (C1/C2).** Tras SOL-01, entrar por `/`
  con perfil aislado sin save. Recorrer copyright/intro/título/menú, NUEVA PARTIDA,
  Oak, nombres, habitación, encuentro con Oak, laboratorio, inicial y rival.
  Usar pulsaciones/driver sin saltar el discurso ni los scripts. Consultar C/datos
  para recompensas y flags esperados. Guardar desde menú, recargar y confirmar
  continuidad desde el checkpoint final. Reutilizar/ampliar C1/C2 jobs cuando sea
  viable; lectura por estado y observación visual se informan por separado.
  **Entrega:** acciones/aserciones, checkpoint inicial/final, evidencia y ayudas.
  **Aceptación:** rival terminado, control recuperado y progreso correcto; la
  verificación de intro visual tiene su resultado aparte. Dos intentos ante un
  bloqueo reproducible; luego entregar a Sol, sin mutar el evento para avanzar.

- [ ] **FLASH-02 — Curación y PC (C8).** Tras FLASH-01, cargar `pewter-pc`/`pewter`
  y confirmar sus datos reales. Si ningún Pokémon está herido, obtener daño real
  o declarar PREPARED una fixture solo para curación; no preparar HP final.
  Hablar con enfermera por UI y verificar recuperación HP/PP/estado según fuente
  y devolución del control. Depositar/retirar y comprobar identidad del Pokémon,
  equipo/caja antes/después y persistencia al guardar/continuar. Reutilizar C8.
  **Entrega:** job reproducible, resultados separados de curación/PC/persistencia,
  preparación identificada y cualquier excepción. **Aceptación:** el recorrido
  medido funciona; lo no ejecutado sigue MANUAL. 1.18 PC vacío se reproduce como
  fallo aparte y se deriva a Sol; nunca se arregla con un objeto ficticio.

- [ ] **SOL-02 — Revisar y resolver bloqueos de esta tanda.** Reproducir desde el
  checkpoint previo, separar juego/driver/entorno y comparar con fuente C. Priorizar
  pérdida de save y bloqueos SON-01, luego C8/1.18. En 1.18 respetar la decisión
  pendiente de fidelidad del acceso NULL. Cambios selectivos, checks de AGENTS y
  comprobación focalizada; integrar solo entregas revisadas, con commits exactos.
  **Aceptación:** repetir el fallo con ejecutor y recuperar continuidad; marcar
  cualquier problema sin resolver en TAREAS-FINALES. No prometer cerrar todos los
  bloqueos si falta evidencia del original.

SON-01 y FLASH-01/02 pueden ejecutarse a la vez tras SOL-01; el juego y los saves
son independientes en sus worktrees/perfiles. Sol atiende incidencias con evidencia,
no repite preventivamente toda la navegación de ambos. Sonnet reanuda sobre la
base nueva solo después de aceptar la corrección y registrar el commit.

### Segunda tanda (tras revisión de la primera)

- [ ] **SON-02 — Continuidad hasta Ruta 4.** Partir del checkpoint aceptado de
  SON-01 o reconstruir la cadena hasta Plateada. Validar paquete/Pokédex, acceso al
  gimnasio y Brock; luego Ruta 3, Monte Moon, Rocket, fósil y salida real. Usar
  checkpoints existentes para diagnóstico y anotar qué partes previas siguen sin
  validar. Exportar `route4` obtenido por recorrido. **Aceptación:** checklist de
  tramos 0/1 con evidencia y posibilidad de continuar; cargar route4 no basta.

- [ ] **FLASH-03 — Regresiones delegadas por Sol.** Repetir los jobs afectados por
  arreglos aceptados; validar guardar/continuar C3 y Quest Log C4 desde saves reales.
  En C4 observar reproducción y devolución de control, no solo presencia de datos.
  **Aceptación:** resultados con commit exacto y límites; fallo de C4 se escala,
  sin escribir flags ni cerrar el punto por un smoke parcial.

- [ ] **SOL-03 — Aceptar tramos 0/1 y preparar Celeste.** Contrastar entregas con
  C/datos y checklist, registrar fallos abiertos y evaluar coste del piloto. Fijar
  inicio/final/aserciones de tramo 2 y asignar evolución C11/mapas C12 según riesgo.
  **Aceptación:** cadena y saves trazables; decisión de siguiente tanda sustentada,
  sin ampliar a toda la historia antes de evaluar el piloto.

- [ ] **SON-03 — Tramo 2: Celeste/Bill/Misty.** Solo tras SOL-03. Validar rival,
  Puente Pepita, Bill/recompensa, Misty/recompensa y acceso sur; equipo PREPARED
  permitido desde Celeste bajo las reglas de ayudas. **Aceptación:** checklist de
  tramo 2 y checkpoint exportado. No contar evolución/experiencia manipulada como
  comportamiento verificado.

### Formato de entrega y coste

Cada agente entrega: ID; commit/base; checkpoint antes/después; acciones y resultado
esperado/observado; PASS/FAIL/BLOCKED/MANUAL/NOT RUN; ayudas PREPARED; fallos y
reproducción; archivos/commit de entrega. Registrar tiempo, reintentos y consumo
cuando sea visible; sin facturación comparable no inventar dólares.

No crear crónicas nuevas: registro de ruta aquí y problemas en TAREAS-FINALES.
Las comprobaciones compartidas existentes se reutilizan; no escribir pruebas que
solo repitan la implementación. Capturas para escenas clave/fallos y consultas
agrupadas. Un ejecutor mantiene la historia, otro valida sistemas independientes.

## Registro histórico (sin nueva validación)

La tabla siguiente conserva lo registrado el 2026-09-25. Puede estar desactualizada;
actualizar solo tras reproducir y revisar evidencia, no por existencia del save.

## Registro de tramos

| Tramo | Estado | Fallos arreglados | Ayudas |
|---|---|---|---|
| 0 (intro → Plateada, PC, tienda, guardar) | jugado | ver historial en Git: `git show 3355d2e:docs/archive/PORTING-STATUS-2026-09-27.md` | ninguna |
| 1 (Ruta 3 → Monte Moon → Ruta 4) | a medias: Ruta 3 y Monte Moon 1F/B1F/B2F; falta la salida | ninguno del juego (solo driver) | ninguna |

## Pendiente al cortar la sesión (2026-09-25)

- **Terminar el tramo 1**: desde el punto de control `mtmoon-1f`, `H.explore`
  hacia la escalera de B1F que da a la Ruta 4 (`(map, w) => map === "MAP_MT_MOON_B1F" && w.dest === "MAP_ROUTE4"`,
  evitando la entrada de 1F). El explorador ya retrocede por la escalera menos
  usada, pero no se llegó a comprobar tras ese cambio. Ver en el camino: guion
  de Miguel y el fósil (B2F, coord event en 14,11), Team Rocket.
- ~~Exportar al repo los puntos de control nuevos~~: hecho el 2026-10-01; los 24
  puntos de control están en `tools/playtest/saves/` (actualizar el registro del
  tramo 1: tarea 4.1 de `TAREAS-FINALES.md`).
- Driver sin probar a fondo: `H.explore` con retroceso y el modo `"switch"`
  cuando el segundo Pokémon también cae.
- `tools/playtest/driver.js` `H.battle` registra `outcome: 0` en combates de
  entrenador ganados (lee `frGame.battleOutcome` después de que se reinicia);
  usar la experiencia/flags para saber si se ganó.
