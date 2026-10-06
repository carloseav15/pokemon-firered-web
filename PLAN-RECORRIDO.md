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

- [ ] Registrar el commit de `main` usado. Un solo agente ejecuta cada tramo, en `main`
      y con su propio servidor; sin duplicación.
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

## Estado de fiabilidad del driver

Resumen al 2026-10-06; las rondas de agentes, contratos y revisiones anteriores
están en el historial de Git. Tareas canónicas DRV-01–07 en TAREAS-FINALES §1.
Objetivo inicial: driver comprobado para las acciones necesarias hasta Ciudad
Celeste; no promete paridad del juego entero.

- **Hecho:** estado/carga, entradas acotadas y SAVE/export/continue seguros
  (DRV-02/03/05); decisiones de combate, medicina, enfermera y cambios (1.23–1.25);
  planificación con saltos de ledge y conexión Ruta 4 → Celeste comprobada como
  diagnóstico, no como recorrido (1.26, `c8ccc36f`).
- **C5** (`tools/playtest/smoke/C5-wild-battle.job.mjs`): luchar, huir, lanzamiento
  natural, Master Ball con hueco y equipo lleno → PC, casos aislados; cada desenlace
  camina a la casilla sin encuentros más cercana y un encuentro en el camino es MANUAL.
  Destapó y cerró el fallo de texto de transferencia al PC (`bcd841b5`).
- **Monte Moon (SON-MM01):** intentos previos obtuvieron el Dome Fossil y
  llegaron a Ruta 4 (32,6), pero ninguno guardó un checkpoint; no hay evidencia
  reutilizable de ese avance. `son-mm01-r.job.mjs` está adaptado a la API
  (`5b1380a0`) y aún no se ha ejecutado.
- **Abierto:** DRV-01 (matriz de capacidades), DRV-04 (navegación/recursos más
  allá de Celeste), DRV-06 (gate de regresión) y DRV-07 (checkpoint real en Celeste).

### Siguiente tramo: Monte Moon → fósil → Ciudad Celeste

Entrada: `mtmoon-prepared.json` (procedencia en `mtmoon-prepared.provenance.json`),
importado, no evidencia del tramo anterior. Contrastar mapa, equipo y flags al cargar;
una discrepancia es motivo para parar, no para ajustar el estado.

- [ ] Recorrer 1F/B1F/B2F con colisiones y combatir los entrenadores encontrados.
- [ ] Ganar a Miguel (B2F, coord event (14,11)): flag TRAINER_FLAGS_START +
      TRAINER_SUPER_NERD_MIGUEL y VAR_MAP_SCENE_MT_MOON_B2F = 1.
- [ ] Elegir **Dome Fossil** por diálogo: ITEM_DOME_FOSSIL +1, FLAG_GOT_DOME_FOSSIL y
      FLAG_GOT_FOSSIL_FROM_MT_MOON verdaderas; HELIX falsa. Nunca concederlo por debug.
- [ ] B2F warp (5,10) → B1F; salida B1F (45,4) → Ruta 4 (32,5); conexión este a
      MAP_CERULEAN_CITY.
- [ ] Curar, guardar por menú, recargar/CONTINUAR y comprobar fósil/flags/equipo/mapa
      con un paso real; exportar `cerulean-arrival.json` sin sobrescribir otros saves.

Fuente: `pokefirered/data/maps/MtMoon_B2F/scripts.inc` y `map.json` de B2F/B1F/Ruta 4.
Usar `C.NOMBRE` en ejecución. Una derrota legítima se reintenta desde checkpoint;
tras dos diagnósticos de un fallo reproducible, guardar checkpoint previo y evidencia
y pasar el caso a revisión, sin saltar el guion.
