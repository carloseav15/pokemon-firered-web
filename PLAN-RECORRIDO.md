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

## Reparto actual: Sonnet 5.5, Gemini Flash 3.8, GPT-6 Luna y GPT-6.1 Sol

Asignación propuesta por rol; no demuestra que un modelo sea más barato/mejor.
Plan listo para que el usuario asigne cada paquete: este documento no crea agentes
ni manda mensajes. Sonnet mantiene la cadena de historia; Flash valida interacciones
acotadas; Luna ejecuta pruebas existentes y regresiones; Sol revisa/diagnostica/integra.
Cada uno en worktree, puerto y perfil de navegador propios.
TAREAS-FINALES sigue siendo la lista única de problemas y validación pendientes;
los IDs siguientes son paquetes de ejecución para sus tareas, no nuevos cierres.

### Cómo empezar: instrucciones para cada agente

Leer AGENTS.md, PORTING-STATUS.md, TAREAS-FINALES §1/§3/§4 y las secciones de este
plan correspondientes al paquete. Respetar cambios ajenos. Si el usuario te asigna
uno de estos roles, ejecutar solo sus tareas habilitadas y entregar evidencia:

| Agente | Paquete vigente | Después | No le corresponde |
|---|---|---|---|
| GPT-6.1 Sol | SOL-DRV01 entregada; revisión de SON-PREP/C8 | SOL-02/03 y preparación del siguiente tramo | Repetir toda la ruta de los ejecutores por rutina |
| GPT-6 Luna | LUNA-02 sobre 66baef56, jobs del contrato final | C8 después de aceptar FLASH-02-R2 | Modificar motor, tests o criterios para conseguir PASS |
| Sonnet 5.5 | SON-PREP sobre 66baef56 | SON-MM01-R tras aceptar entrada preparada; SON-03 tras Celeste | Saltar bloqueos de historia o abrir otra cadena de ruta |
| Gemini Flash 3.8 | FLASH-02-R2 sobre 66baef56 | C5/FLASH-03 después de C8 y contrato de Sol | Corregir el motor o ejecutar de nuevo la historia de Sonnet |

SOL-01 ya está entregada. Los paquetes vigentes usan la base fijada en el
contrato tras SOL-DRV01; no empezar pruebas sobre una base inventada. Una dependencia requiere entrega y aceptación; transcurrir tiempo no
la desbloquea. Para segunda tanda, Sol revisa primera tanda y publica commit nuevo.
No crear subagentes ni enviar mensajes a otros chats por esta asignación; entregar
al usuario/revisor los resultados en el chat donde se asignó el paquete.

**Contrato SOL-01 preparado el 2026-10-06:**

| Dato | Valor fijado |
|---|---|
| Commit integrado del juego | `bd41849f9412b3a06e7cf32a1a2fea0366700fcf` (base de código; esta entrega solo cambia documentos) |
| Sonnet | SON-MM01; worktree propuesto `../pokemon-sonnet-mtmoon`, rama temporal `codex/sonnet-mtmoon`, puerto 5197 |
| Flash | FLASH-02; worktree propuesto `../pokemon-flash-c8`, rama temporal `codex/flash-c8`, puerto 5198 |
| Luna | LUNA-01; worktree propuesto `../pokemon-luna-smoke`, rama temporal `codex/luna-smoke`, puerto 5199 |
| Perfil / URL | Un contexto Playwright nuevo por job o perfil vacío por ejecutor; `http://127.0.0.1:<puerto>/`; no compartir localStorage |
| Datos y herramientas | node/Vite/Playwright presentes en la base; fuente decomp en checkout principal, exportados en public/fr; driver `tools/playtest/driver.js` |
| Checkpoints y aserciones | Contratos SON-MM01 y FLASH-02 debajo; Luna ejecuta jobs existentes y conserva sus límites |
| Preparación | Contrato original: puertos libres al preparar. Ahora existen los tres worktrees; comprobar procesos y puerto antes de reusar |
| Estado | SOL-01 completada. LUNA-01 entregada y revisada; FLASH-02 revisada parcialmente, persistencia rechazada; SON-MM01 abortada por el usuario, sin checkpoint final |

**Inicio reproducible al recibir la tarea:** crear el worktree propio desde el
SHA fijado, sin cambiar main ni instalar dependencias de nuevo. Ejemplo de Sonnet
(desde el checkout principal; Flash/Luna sustituyen solo rama/path por la tabla):

```sh
git worktree add -b codex/sonnet-mtmoon ../pokemon-sonnet-mtmoon bd41849f9412b3a06e7cf32a1a2fea0366700fcf
cd ../pokemon-sonnet-mtmoon
ln -s /Users/carancibia/Documents/ChatGPT/pokemon/node_modules node_modules
export POKEFIRERED=/Users/carancibia/Documents/ChatGPT/pokemon/pokefirered
npx vite --host 127.0.0.1 --port 5197 --strictPort
```

La variable POKEFIRERED permite leer C/checks del decomp existente; no modificar
ese decomp compartido. Si ya existe la ruta/rama, inspeccionar antes de reutilizar;
no resetear ni borrar trabajo ajeno. Si el puerto está ocupado, elegir otro libre
y registrar URL, sin matar servidores ajenos. Mantener el mismo SHA durante el job.
Leer este plan actualizado en main aunque el worktree parta del SHA anterior.

Desde otro terminal en el worktree de cada agente:

```sh
# Luna: runner con tope de 120 s por caso y resultados por C1–C14.
PW_BASE=http://127.0.0.1:5199/ npm run play:smoke
# Flash: punto de partida C8 (solo depósito/retiro; devuelve MANUAL por curación).
PW_BASE=http://127.0.0.1:5198/ node tools/playtest/pw.mjs tools/playtest/smoke/C8-pokemon-center-pc.job.mjs /tmp/pw/flash-c8-baseline
```

Sonnet reutiliza `ctx.loadSave('mtmoon-1f')` en un job de pw.mjs o
`await H.importSave('mtmoon-1f')` seguido, tras recarga, de `await H.init()`/
`await H.ready()`. Crear su job de recorrido en tools/playtest con hitos/tiempos
acotados; no existe aún un job completo de esta ruta. Flash amplía C8 o añade un
job focalizado para enfermera/persistencia. Luna no amplía tests en LUNA-01.

`pw.mjs` puede terminar con exit 0 y `{ok:false}`: revisar siempre JSON y errors,
además del exit code. `play:smoke` aplica 120 s por caso y clasifica los payloads.
Un resultado con `manual` sigue MANUAL. C1 reemplaza render para verificar estados:
no prueba fidelidad visual; C13 por estado no valida escucha. No alterar esos
límites ni presentar la suite verde como recorrido completo.

### SON-MM01 — Monte Moon → fósil → salida este → Ciudad Celeste

Paquete prioritario de esta tanda; sustituye SON-01 como siguiente ruta, sin
aceptar por ello arranque/partida nueva ni recorrido previo. SON-01 sigue pendiente.

**Entrada contrastada en datos:** `mtmoon-1f.json` está en MAP_MT_MOON_1F (18,37),
Pidgey L12 con HP34 e Ivysaur L17 con HP48, dinero3840; flag fósil562 y flag
Miguel1450 falsas. SHA256 del save:
`5d4ec43e49e79119b80d1ab5e23e0a5164620784c7d46ac013c8fea9677928b8`.
Es un checkpoint importado, no evidencia del tramo anterior; no preparar niveles.
`route4` es alternativa de recuperación oeste, nunca save final de salida este.
`mtmoon-1f-healed` queda excluido como entrada recomendada: ubicación real B1F
(43,26), Pidgey L13 HP0; el nombre no demuestra curación.

- [ ] Confirmar al importar mapa/coords, equipo, flags y hash; discrepancia = parar
      y consultar Sol, sin ajustar el estado para encajar en la tabla.
- [ ] Recorrer con colisiones, combatir los entrenadores encontrados y registrar
      cambios 1F/B1F/B2F. Determinar camino con layout/driver; no teleport.
- [ ] Activar Miguel por conversación o coord event B2F (14,11); ganar combate,
      comprobar flag TRAINER_FLAGS_START + TRAINER_SUPER_NERD_MIGUEL =1450,
      VAR_MAP_SCENE_MT_MOON_B2F =1 y devolución del control.
- [ ] Elegir **Dome Fossil** por diálogo YES para hacer determinista esta tanda:
      ITEM_DOME_FOSSIL =358 aumenta en1; FLAG_GOT_DOME_FOSSIL =626 y
      FLAG_GOT_FOSSIL_FROM_MT_MOON =562 verdaderas. HELIX627 sigue falsa;
      no se añade ITEM_HELIX_FOSSIL357. Registrar antes/después y desaparición de
      ambos fósiles tras la secuencia de Miguel; no concederlos por debug.
- [ ] Alcanzar B2F warp(5,10) → B1F entrada(39,4); caminar al warp de salida
      B1F **(45,4)** → Ruta4 **(32,5)**. (39,4) no es la salida a Ruta4.
- [ ] Cruzar conexión derecha de Ruta4 a MAP_CERULEAN_CITY. Curar por enfermera,
      guardar desde menú, recargar/CONTINUAR y verificar fósil/flags/equipo/mapa;
      Quest Log que no devuelve control es bloqueo, no motivo para saltarlo.
- [ ] Exportar `cerulean-arrival.json` nuevo sin sobrescribir route4 ni los saves
      originales. Registrar coordenadas finales reales, ayudas y commit probado.

**Fuente independiente:** pokefirered/data/maps/MtMoon_B2F/scripts.inc
(BattleMiguel/DomeFossil), map.json de B2F/B1F/Route4 y exportados equivalentes;
battle_setup.c usa TRAINER_FLAGS_START + trainerId. Consultar C.NOMBRE en ejecución
además de IDs contrastados arriba. HELIX y cancelar elección quedan para otra pasada.
Una derrota legítima requiere reintentar desde checkpoint o curar por UI, no es
automáticamente un bug. Tras dos intentos de diagnóstico de un fallo reproducible,
entregar checkpoint anterior, hitos/estado y excepción a Sol; no saltar guion.

### FLASH-02 — Contrato concreto de C8

- [ ] Importar `pewter-pc` en MAP_PEWTER_CITY_POKEMON_CENTER_1F (11,2),
      Bulbasaur L15/Pidgey L2, equipo2, caja0 vacía; dinero3800. SHA256:
      `e2f7bf7cee99b071e81ef9e5d4fdc3abf66fb0cf870e154843162b7861485fe8`.
- [ ] Registrar identidad (species/personality/otId), movimientos, objeto y
      inventario del equipo; comprobar depósito de Bulbasaur: equipo1/caja1,
      retiro: equipo2/caja0, identidad conservada. El job existente solo compara
      especies y no cubre identidad completa ni persistencia: ampliar aserciones.
- [ ] Para curación, cargar por separado `pewter` (7,4), Bulbasaur L12 HP33/33
      y PP completos. Esta entrada no permite demostrar curación por sí sola.
      Obtener daño/gasto de PP jugando, o declarar PREPARED: HP reducido en5,
      primer PP no vacío reducido en1, status=C.STATUS1_POISON. No modificar
      HP máximo ni preparar HP/PP/status finales; no editar saves del repositorio.
- [ ] Tomar snapshot justo antes de la oferta, tras caminar al mostrador;
      rechazar/cancelar sin nuevos pasos y comprobar que la enfermera no curó.
      Después aceptar por UI. Esperado por HealPlayerParty C: HP=maxHP,
      status=0, cada PP=basePP + floor(basePP*20*PPUps/100). Verificar datos PP
      del C/gBattleMoves, no llamar al helper TS de curación como oráculo.
- [ ] Esperar fin de efecto/diálogo y devolución de control, comprobar equipo
      estable y dinero sin cambio por la enfermera. Animación/sonido tienen
      evidencia aparte; no afirmar paridad visual o escucha desde HP correctos.
- [ ] Guardar/continuar tras curación y tras depósito/retiro; comprobar estados
      respectivos y salida del PC. No sustituir GUARDAR por H.checkpoint.
- [ ] 1.18 MOVE ITEMS vacío: reproducir aparte si hay tiempo y entregar a Sol;
      el fix anterior está respaldado pero no integrado ni declarado fiel.

Fuente: pokefirered/data/scripts/pkmn_center_nurse.inc → special HealPlayerParty;
script_pokemon_util.c:17–44, pokemon.c:CalculatePPWithBonus, pc.inc y sistema de
almacenamiento. PREPARED verifica respuesta de curación, no la obtención natural
del daño/status. Informar por separado curación, PC, persistencia y pendientes.

El revisor mantiene esta tabla, el registro de ruta y TAREAS-FINALES. Los ejecutores
entregan sus resultados sin sobrescribir estos archivos compartidos con copias de
una base antigua. Sus jobs/checkpoints nuevos se entregan en commits selectivos de
rama propia; Sol los integra tras revisión. Los logs no requieren un commit.

**Mensaje de inicio listo para copiar:**

> Lee AGENTS.md del repositorio y esta versión del plan:
> `/Users/carancibia/Documents/ChatGPT/pokemon/PLAN-RECORRIDO.md`
> (rama `main`), especialmente “Cómo empezar” y tu paquete.
> Tu rol es [GPT-6.1 Sol / GPT-6 Luna / Sonnet 5.5 / Gemini Flash 3.8]. Ejecuta
> [ID del paquete] cuando sus dependencias estén aceptadas. Usa el commit fijado
> por SOL-01, worktree y perfil propios. No marques PASS sin acciones y aserciones;
> registra PREPARED y límites. Ante un bloqueo reproducible, conserva evidencia y
> escálalo tras dos intentos de diagnóstico. Entrega ID, base/commit, comandos,
> checkpoints, resultado esperado/observado, pendientes y commit de cambios si hay.

### Primera tanda (hacer ahora)

- [x] **SOL-01 — Fijar base y reglas de aceptación.** Contrato entregado arriba;
  preparación estática; resultados de ejecutores revisados en la primera ronda. Requisitos satisfechos: Leer AGENTS, TAREAS-FINALES
  §1/§3/§4 y este plan. Fijar el commit del juego integrado para los tres ejecutores,
  indicar worktrees/puertos, checkpoints y driver. Confirmar scripts fuente para
  los resultados esperados de SON-01/FLASH-02. Entregar contrato breve con rutas,
  final y aserciones. El viewer y M13 no son prerequisito de la ruta del juego.
  **Aceptación:** los tres ejecutores pueden arrancar en la misma base identificada,
  con resultados verificables; no mezclar commits durante un trabajo.

- [x] **LUNA-01 — Diagnóstico inicial y mapa de checkpoints.** Tras SOL-01,
  ejecutar `play:smoke` con servidor propio; inspeccionar los resultados de cada
  C1–C14 y distinguir PASS/FAIL/MANUAL/NOT RUN, incluyendo límites de las pruebas.
  Revisar saves de tools/playtest/saves y registrar mapa/equipo/procedencia cuando
  se pueda verificar. No transformar existencia de un save en tramo jugado.
  Revisión 2026-10-06: 6 PASS (C1/3/6/7/9/10), C5 FAIL observado; C2/4/8/11/12/13/14 MANUAL. Ver tabla de resultados de esta ronda más abajo.
  **Entrega:** tabla breve, comando/commit probado y evidencia de fallos. Cambios
  permitidos: ninguno en el motor ni en los tests de esta tarea. Conservar logs y
  resultados tal como salen; pasar a Sol cualquier fallo de juego/driver/entorno.
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

- [ ] **FLASH-02 — Curación y PC (C8).** Tras SOL-01, cargar `pewter-pc`/`pewter`
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
  pérdida de save y bloqueos SON-MM01/SON-01, luego C8/1.18. En 1.18 respetar la decisión
  pendiente de fidelidad del acceso NULL. Cambios selectivos, checks de AGENTS y
  comprobación focalizada; integrar solo entregas revisadas, con commits exactos.
  **Aceptación:** repetir el fallo con ejecutor y recuperar continuidad; marcar
  cualquier problema sin resolver en TAREAS-FINALES. No prometer cerrar todos los
  bloqueos si falta evidencia del original.

SON-MM01, LUNA-01 y FLASH-02 pueden ejecutarse a la vez tras SOL-01; el juego y los saves
son independientes en sus worktrees/perfiles. Sol atiende incidencias con evidencia,
no repite preventivamente toda la navegación de los ejecutores. Sonnet reanuda sobre la
base nueva solo después de aceptar la corrección y registrar el commit.

### Segunda tanda (tras revisión de la primera)

- [ ] **SON-02 — Continuidad hasta Ruta 4.** Partir del checkpoint aceptado de
  SON-01 o reconstruir la cadena hasta Plateada. Validar paquete/Pokédex, acceso al
  gimnasio y Brock; luego Ruta 3, Monte Moon, Rocket, fósil y salida real. Usar
  checkpoints existentes para diagnóstico y anotar qué partes previas siguen sin
  validar. Exportar `route4` obtenido por recorrido. **Aceptación:** checklist de
  tramos 0/1 con evidencia y posibilidad de continuar; cargar route4 no basta.

- [ ] **LUNA-02 — Regresiones delegadas por Sol.** Repetir únicamente los jobs
  afectados por correcciones revisadas, sobre el commit indicado por Sol; guardar
  comando, salida y estado por caso. Confirmar que un timeout/resultado parcial no
  se etiqueta PASS. No cambiar código, expectativas, baseline ni fixture para
  conseguir verde. **Aceptación:** resultado exacto y límites; cualquier fallo se
  devuelve a Sol con reproducción, sin repetir intentos indefinidamente.

- [ ] **FLASH-03 — Guardar/continuar y Quest Log (C3/C4).** Validar desde saves
  reales con acciones de UI; comparar estado guardado/recargado y observar
  reproducción y devolución del control, no solo presencia de datos de Quest Log.
  Reutilizar/ampliar C3/C4 jobs si corresponde, con cambios de tests en rama propia.
  **Aceptación:** evidencia por subcaso; cualquier bloqueo de C4 se escala a Sol,
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
agrupadas. Sonnet mantiene la historia, Flash valida sistemas independientes y Luna repite
pruebas definidas. Revisar este reparto después del piloto: si Luna cubre trabajo
de Flash con igual evidencia y menor coste observado, simplificar la asignación.

## Registro y revisión de OpenCode (2026-10-06)

| Tramo | Estado revisado | Evidencia / límites | Ayudas |
|---|---|---|---|
| 0 (intro → Plateada) | Registro histórico, sin revalidación completa en esta revisión | Historial: `git show 3355d2e:docs/archive/PORTING-STATUS-2026-09-27.md`; checkpoints y smoke parciales no sustituyen C1/C2 | Según registro previo |
| 1 (Ruta 3 → Monte Moon → Ruta 4 este) | PARCIAL; no aceptado como recorrido completo | OpenCode `967a496e` solo cargó `route4` y caminó. Repetido en navegador: MAP_ROUTE4 (8,19), Pidgey L12/Ivysaur L17, movimiento a (15,19), control libre, sin errores. El save está al oeste: entrada cueva (19,5), salida B1F este (32,5); no tiene fósil ni FLAG_GOT_FOSSIL_FROM_MT_MOON (562) | Importación de checkpoint existente; sin escritura de estado |
| 2 (Celeste → Bill/Misty) | NOT RUN; no checkpoint de Celeste entregado | Las notas sin commit de `opencode/tramo-2` describen volver desde route4 oeste a Monte Moon B2F y acabar en whiteout. Eso aún pertenece al tramo 1; no demuestra llegada a Celeste | Notas reportan driver y sin preparación; no reejecutadas aquí |

**Reanudación correcta:** obtener fósil por el guion real, alcanzar salida este
por B1F y llegar a `MAP_CERULEAN_CITY` (Ciudad Celeste). Exportar checkpoint real
tras curar/guardar y continuar. “Azulona” en las notas de OpenCode era un nombre
incorrecto: Azulona es Celadon y no el destino de la conexión derecha de Ruta 4.
Antes de ejecutar, consultar coordenadas/warps y scripts fuente, no adivinar ruta.

La revisión comprobó carga/movimiento del extremo, bolsa/flag del fósil y conexiones
fuente; no jugó toda la cueva ni confirmó un fallo del juego en el intento B2F.
No conceder fósil/flags para cerrar el tramo. `H.battle` puede leer outcome tras su
reset; corroborar desenlace con estado/experiencia/flags y control, no solo ese campo.

Las notas originales sin commit y todos los heads previos se conservaron fuera del
repositorio en `../pokemon-cleanup-backup-2026-10-06/` (documento y bundle Git).
La entrega 4.1 se acepta como inspección del checkpoint, no como prueba del tramo.
Tras integrar lo revisado, se retiraron 37 ramas locales y cuatro worktrees
auxiliares (dos archivados en Codex). Queda main y el checkout principal limpio.

### Estado de integración

C2/C7 del viewer, M12/R7/M13 y este plan están integrados en main. B2/B3/B4 de
OpenCode se revisaron estáticamente e integraron; B2 conserva la diferencia de
VS Seeker pendiente. `49c88b53` (PC 1.18) queda en el bundle sin integrar: propone
una guarda defensiva web pero afirma un no-op de BIOS/ROM sin evidencia de original.
La tarea 1.18 sigue abierta; decidir/documentar adaptación o verificar hardware
antes de aceptar fidelidad. No se perdieron esas entregas al limpiar ramas.


### Revisión de la primera ronda — 2026-10-06

Base de los ejecutores: bd41849f; revisión en main con servidor propio 5200; corrección del driver 65e631f9.
Luna no modificó código. Flash entregó 394b82b0; Sonnet no dejó commits ni
cerulean-arrival.json. Se revisaron su registro local y el estado de los worktrees.

| Caso | Luna | Revisión Sol y alcance |
|---|---|---|
| C1 | PASS | Estados con render sustituido; gráficos pendientes |
| C2/C4 | MANUAL | Intro completa y Quest Log pendientes |
| C3 | PASS | Save/continue del checkpoint Pewter; no ruta completa |
| C5 | FAIL | Cinco bolas sin captura. Revisión aislada pasó con dos lanzamientos (/tmp/sol-review-c5.json); no confirma fallo de motor. Azar, estrategia y navegación de bolsa pendientes de separar; retry de Luna sin PW_BASE no acredita reproducción en 5199 |
| C6/C7 | PASS | Brock y whiteout medidos; C7 repetido por Sol y parada de navegación tras pérdida comprobada (/tmp/sol-review-nav-stop.json) |
| C8 | MANUAL original | Flash amplió PC/enfermera. Primera revisión encontró falso positivo de persistencia: orden final [16,1], recarga [1,16]. No aceptar una recarga del fixture como prueba de guardado; contador sigue 0 en los intentos reforzados y aparece MC del PC superpuesto a YES/NO. No integrada |
| C9/C10 | PASS | Compra/venta y menús acotados a jobs actuales |
| C11/C12/C13/C14 | MANUAL | Evolución, ruta de mapas, escucha y clima pendientes |
| 1.18 | FAIL reproducido | MOVE ITEMS vacío: TypeError en InitBoxMonSprites; /tmp/sol-review-118.json. Decisión de fidelidad pendiente |
| SON-MM01 | ABORTADA / PARCIAL | Entradas a B2F y combates, derrotas y regresos al Centro. No fósil ni llegada a Celeste acreditados |

**Diagnóstico Sonnet:** primer job inició mode=switch, slot=0 (Somnífero de
Ivysaur), y cambió battleDefaults cuando la operación ya corría; goto captura
su slot al iniciar. Siguió con Ivysaur slot3 (Látigo Cepa), poco adecuado contra
Zubat y otros veneno. El primer registro contiene un combate de 2532 iteraciones,
Ivysaur debilitado y whiteout al sexto combate. Hubo más reentradas después de
las dos derrotas reportadas. explore elige warps por frecuencia, no una ruta de
historia; no equivale a alcanzar Miguel. No hay evidencia suficiente para atribuir
las derrotas a la fórmula del motor. No se acreditan fósil ni progreso final.

**Estado inicial para estrategia:** Pidgey L12: Placaje/Ataque Arena/Tornado;
Ivysaur L17: Somnífero/Gruñido/Drenadoras/Látigo Cepa (10 PP). Bolsa: 2 pociones,
4 bolas; dinero 3840. Los slots deben buscarse por C.MOVE_* en el Pokémon activo
cada vez; un nivel nuevo puede alterar movimientos. Dos miembros bastan como
entrada de diagnóstico, pero no garantizan completar la cueva.

### Siguiente ronda, lineal hasta tener preparación fiable

- [x] **SOL-DRV01 — Driver y estrategia de combate (Sol).** Entrega 66baef56: Parada tras pérdida/
  atasco integrada en 65e631f9 y comprobada con C7; no reanudar automáticamente. Completar
  decisión por Pokémon activo, enemigo, movimientos disponibles/PP y tabla de
  tipos de la fuente; registrar decisión y HP/PP antes/después. No repetir
  movimientos de estado como ataque ni elegir el primer slot con PP sin evaluar
  qué hace. Detectar turnos sin progreso con presupuesto acotado. Curación por
  mochila y cambio voluntario por UI con confirmación del objetivo; distinguir
  entrenadores y salvajes para huida. Probar casos focalizados con entradas
  PREPARED explícitas si son necesarias; nunca preparar victoria/daño final.
  No desplegar una IA general para esta ruta ni usar fórmulas del TS como oráculo.
- [ ] **SON-PREP — Preparar una entrada sostenible (Sonnet, tras SOL-DRV01).**
  Desde checkpoint importado, ir por entradas reales al Centro de Ruta4; curar,
  verificar HP/PP/estado y fijar respawn allí. Comprar por UI en Plateada hasta
  tener 8 pociones y 3 antídotos: con la bolsa inicial cuesta 6×300 + 3×100=2100,
  antes de otros gastos/combates (contrastar saldo real). Esa tienda vende ambos;
  no asignar Superpociones, que no vende. Fuente: items.json y
  PewterCity_Mart/scripts.inc. Llevar ambos sanos, movimientos/PP completos y
  guardar/continuar verificando orden/bolsa/respawn. Exportar nuevo
  mtmoon-prepared.json con procedencia, sin modificar los saves originales.
  Volver a curar si el trayecto de compra gasta recursos. Objetivos de provisión
  son política de prueba, no una regla del C ni garantía de victoria.
- [ ] **SON-MM01-R — Ruta acotada (Sonnet, tras aceptar SON-PREP).** Definir
  secuencia concreta de warps y coordenadas hacia Miguel con mapa/eventos; evitar
  ramales opcionales en esta pasada. No usar explore genérico para buscar la
  salida. Política: Tornado de Pidgey contra bicho/planta, Placaje contra rivales
  resistentes a planta cuando sea la mejor opción disponible; Látigo Cepa contra
  roca/tierra/agua, revisando tipos y PP reales. Estado como acción explícita
  puntual, nunca slot fijo del recorrido. Revisar recursos después de cada pelea;
  curar antes de quedar a un golpe y detenerse si ambos están dañados o sin ataque
  útil. Dos intentos máximo desde el nuevo checkpoint; guardar traza del fallo y
  devolver a Sol. No repetir la cueva completa indefinidamente.
- [ ] **FLASH-02-R2 — C8 sin falso positivo (Flash, prioridad antes de C5).**
  Conservar 394b82b0 como entrega original; no integrarla aún. Revisor dejó borrador
  en `../pokemon-cleanup-backup-2026-10-06/review-first-wave/C8-persistence-review.job.mjs`
  (FAIL, no solución aceptada). Corregir primero cierre del PC: verificar que se
  cancela el menú padre, no queda Task_MultichoiceMenu_HandleInput y un paso real
  fuera del mostrador devuelve control; H.st().script=false no prueba fin de
  waitstate. Trazar pc.inc/menus/scriptMenu.ts. Guardar por menú midiendo incremento
  GAME_STAT_SAVED_GAME y contenido de localStorage antes de recargar; comparar
  equipo completo en el mismo orden (ambas identidades), caja, dinero y posición
  con el estado inmediatamente anterior al guardado. Curación: identidad/equipo
  estable y tabla PP independiente del C, no rom.moves como único oráculo.
  Si persiste solapamiento, entregar snapshot de tareas/callbacks/VAR_RESULT a Sol;
  no modificar motor, ni parchear controles/estado para obtener PASS. Dos intentos
  diagnósticos máximo. C8 original en main continúa MANUAL para curación completa.
- [ ] **FLASH-C5-R1 — C5 fiable (Flash, tras contrato de Sol).** Separar lanzar bola
  por UI, conteo/consumo, captura y transferencia a caja con equipo lleno. El
  agotamiento legítimo de bolas debe terminar limpiamente y dejar evidencia del
  enemigo/HP/estado, no fingir captura ni confundirse con excepción del motor.
  Acordar entrada/RNG controlado PREPARED para el caso determinista antes de
  implementarlo; no poner Pokémon capturado ni flags finales por depuración.
**Contrato focalizado de LUNA-02 (Luna):** Tras commit de revisión fijo,
  repetir C7 sobre 65e631f9 (o una base posterior fijada); C8 tras aceptar R2, y C5 solo cuando exista su contrato revisado; inspeccionar JSON,
  excepciones, contador de guardado y límites. No ejecutar de nuevo toda la
  historia ni reintentar a ciegas. No empezar antes de fijar ese commit.

Capturar un tercer miembro es opcional después de medir si hace falta: obtenerlo
por juego real, registrar nivel/movimientos y entrenarlo con límite. No añadir un
Pokémon de nivel bajo solo para inflar el número; su captura, entrenamiento y
curación consumen tiempo y recursos. No crear un equipo fuerte por debug para
presentar la ruta como continuidad natural.


Los checks de cierre del driver pasaron: check:port, check:honesty, build y
diff --check; C7 con derrota natural devolvió `battle lost` y whiteout correcto.
El runner aislado ahora devuelve exit1 con ok:false (error intencional de harness,
no de juego). 0 cuerpos C nuevos y 0 equivalencias. C5 PASS aislado y 1.18 FAIL
son evidencia de sus casos; no sustituyen C8 ni la ruta de historia.


### Contrato de ejecución tras SOL-DRV01 — 2026-10-06

Base de código común: **66baef563892ff5191252acd213d823e5e2748dd**. No usar ya
bd41849f para la nueva ronda. Leer el plan actual en main aunque el checkout
propio todavía sea antiguo. Reusar los worktrees de cada ejecutor conservando
cambios ajenos. Sonnet/Luna pueden avanzar con fast-forward si siguen limpios;
Flash integra esta base en su rama propia conservando 394b82b0, sin fusionar main
ni cambiar el motor. Si hay conflicto, entregar a Sol antes de adaptar expectativas.
No arrancar automáticamente agentes; el usuario copia los prompts.

Pruebas de Sol: selección de tipos/PP/restricciones; objetos en campo al segundo
miembro; reserva y PP agotado impiden movimiento; enfermera y salida del Centro;
combate salvaje con poción real; Brock con Látigo Cepa ×4; cambio voluntario,
medicina al activo tras el cambio y huida. C7 explícito pasó. Entradas médicas y
orden de equipo de los jobs identificadas PREPARED. Tipos, honestidad y build
pasaron. No demuestra ruta completa, persistencia C8 ni calidad audiovisual.

**Comandos focalizados para Luna** (puerto 5199, perfil aislado por job):
```sh
node tools/playtest/strategy.check.mjs
PW_BASE=http://127.0.0.1:5199/ node tools/playtest/pw.mjs tools/playtest/smoke/driver-strategy.job.mjs /tmp/pw/luna-driver-resources
PW_BASE=http://127.0.0.1:5199/ node tools/playtest/pw.mjs tools/playtest/smoke/driver-auto-battle.job.mjs /tmp/pw/luna-driver-auto
PW_BASE=http://127.0.0.1:5199/ node tools/playtest/pw.mjs tools/playtest/smoke/driver-switch.job.mjs /tmp/pw/luna-driver-switch
PW_BASE=http://127.0.0.1:5199/ node tools/playtest/pw.mjs tools/playtest/smoke/C7-whiteout.job.mjs /tmp/pw/luna-driver-c7
```
Leer JSON/errors/exit. `driver-switch` corta el primer combate a 500 iteraciones
para observar cambio y ataque; `stuck:true` de ese segmento es deliberado y no
significa victoria. Luego verifica medicina/huida reales. Su aceptación global
exige completar esas acciones; si expira/falla, conservar evidencia y reportar.
No ajustar el límite o el resultado para convertirlo en PASS.

**Sonnet:** ahora solo SON-PREP, puerto 5197. Configurar auto antes de empezar,
leer H.resources y H.prepareStep, usar H.heal por UI. Para retirada usar recovery
con destino al Centro. Comprar hasta 8 pociones/3 antídotos por UI, con presupuesto
contrastado, curar después del trayecto y fijar respawn de Ruta4 por entrada real.
Guardar desde menú; demostrar incremento de GAME_STAT_SAVED_GAME y persistencia
antes de exportar el JSON realmente escrito en localStorage. H.checkpoint llama
writeSave: no usarlo para acreditar GUARDAR ni ocultar un fallo. Exportar
mtmoon-prepared.json con procedencia; no iniciar SON-MM01-R hasta aceptación de
Sol. Dos intentos diagnósticos máximo, detener jobs/timer propios al acabar.

**Flash:** FLASH-02-R2, puerto 5198, prioridad C8. Integrar base en su rama y revisar
su entrega original. H.fieldFree ayuda a detectar los menús suspendidos; no
sustituye prueba de movimiento real y guardado escrito. Corregir cierre por UI,
comparar orden/ambas identidades/caja/dinero/mapa/coords antes y después de guardar.
Tabla PP del C independiente, preparar solo entradas médicas declaradas. No
corregir motor ni 1.18, no tocar baselines/saves originales. Job reproducible y
commit de tests selectivo, checks de AGENTS; escalar juego/driver si dos intentos
no resuelven el fallo. C5 queda para su contrato posterior.

**Luna:** LUNA-02, puerto 5199. Ejecutar exclusivamente comandos arriba en la base
fijada, sin modificar nada. C8 espera entrega corregida y aceptada; no repetir
smoke completo, capturas de clima/audio ni la ruta de Sonnet en esta ronda.

Los tres paquetes pueden ejecutarse en paralelo con perfiles/worktrees separados.
La ruta de Monte Moon sigue lineal: SON-PREP → revisión Sol → SON-MM01-R. Cada
entrega informa SHA probado, ayudas, acciones reales, resultados y límites.


### Revisión de la segunda ronda — 2026-10-06

Revisor Sol: main d930521d, worktrees limpios; no fusiones ni push en esta revisión.

| Entrega | Resultado contrastado | Decisión / siguiente paso |
| --- | --- | --- |
| Luna LUNA-02, base 66baef56 | Cinco casos PASS: strategy, recursos/enfermera, auto/Brock, cambio/medicina/huida, C7. Revisado informe del chat y límites PREPARED; strategy repetido por Sol | Aceptar la regresión focalizada. C8 y ruta completa siguen fuera de esta entrega |
| Sonnet SON-PREP, 660d7dfa | Job y evidence.json acreditan compra por UI (8 pociones/3 antídotos, dinero1808), equipo curado, Pidgey L13/Ivysaur L17 y guardado0→1. Continuar falla en Quest Log | Entrega diagnóstica útil, entrada no aceptada: no existe mtmoon-prepared.json. No iniciar SON-MM01-R; Sol corrige 1.21 |
| Flash FLASH-02-R2, fa036fb4 | Sol ejecutó el job entregado sobre el motor de main: ok:true/errors:[], depósito/retiro con identidades y orden[16,1], PC cerrado y movimiento, enfermera rechazo/aceptación, dos guardados0→1 y continue | Avance funcional confirmado. Antes de integrar completar aserciones de mapa/bolsa en PC y mapa/bolsa/dinero en enfermera; verificar contador tras continue y devolver snapshots esperados para auditoría |

Evidencia de Sol en ../pokemon-cleanup-backup-2026-10-06/review-second-wave/:
sol-wave2-c8.json, sol-wave2-continue.json y job diagnóstico de continue.
La reproducción usa sin alterar los bytes de
../pokemon-son-prep-evidence/written-save.json. El runner diagnóstico devuelve
ok:true por completar la captura, pero contiene pageerror y state.error: el
resultado del juego es FAIL, nunca PASS. Traza: LoadMap_QLPlayback →
FieldCB2_QuestLogStartPlaybackWithWarpExit → setUpWarpExitTask; player.object
es undefined al leer currentCoords. Causa raíz y reparación contra C pendientes.

Revisión estática Flash: captura map/bag pero omite compararlos tras recarga;
en enfermera también omite money. El resultado real observado es correcto,
pero el test no detectaría esas regresiones. PP independiente cubre el Pokémon
único del fixture; no demuestra curación de un equipo completo.
Sonnet compara PP con rom y confirma enfermera por estado si H.heal devuelve
"nurse offer missing"; ese helper necesita diagnóstico, no aumentar esperas
sin observar la fase de diálogo. Cierre del job Sonnet no compara escapeWarp
ni saved tras continue; revisar al desbloquearlo.

Orden vigente: Sol 1.21 (Quest Log/continue) → repetir SON-PREP y aceptar
entrada → Sonnet SON-MM01-R. Flash completa R2 sin tocar motor en paralelo;
Luna espera commit corregido para regresión de continue/C8, sin suite completa.
M12/R7/M13 y revisión OpenCode ya integrados según el registro anterior; esta
ronda no valida de nuevo animaciones, sandbox ni calidad audiovisual.


### Corrección 1.21 y nueva base — 2026-10-06

**Base siguiente: 4ce0ab7f.** Quest Log ya completa playback2→3→0 y vuelve al
Centro Ruta4 (7,5) desde los bytes escritos por SON-PREP, SHA256
d68e2e067cb896ca4a2f6bb61d637f9c6082b97f78c794bce1eec8fa0487b6c6.
Snapshot conservado: PidgeyL13/IvysaurL17, identidades/orden/movimientos/HP/PP/estado,
8 pociones/3 antídotos,1808, respawn/escape y contador1. Hay control y un paso real.
Continue de pewter-pc sin escenas y driver-auto (salvaje/Brock/retorno) pasan.
Checks: questlog-objects, check:port, check:honesty, build y diff --check.
Inventario/pending regenerados sin delta:0 cuerpos nuevos,0 equivalencias.

La corrección sincroniza el índice web con gObjectEvents al reconstruir sprites,
registra avatar por MOVEMENT_TYPE_PLAYER como event_object_movement.c, inicializa
paletas en ReturnToFieldLocal y carga el mapa guardado sin aplicar el warp de la
última escena. El regreso reconstruye objetos con templates guardados; fidelidad
de snapshots dinámicos de NPC sigue abierta en TAREAS-FINALES1.22.

**Sonnet:** integrar 4ce0ab7f en codex/sonnet-mtmoon conservando660d7dfa (merge,
no reset). Corregir el final del job: H.ready solo confirma que existe un mapa,
no que terminó playback. Esperar QL_STATE_PLAYBACK/PLAYBACK_LAST→fin y control
libre antes de comparar. Reusar questlog-continue.job.mjs como regresión de los
bytes escritos; comparar también escapeWarp y contador. Repetir SON-PREP por UI,
exportar mtmoon-prepared.json solo tras continue exacto y entregar para aceptación.
El save original está desbloqueado, pero SON-MM01-R aún no empieza sin esa entrega.

**Luna:** avanzar con ff a4ce0ab7f si limpio. Ejecutar la regresión nueva primero
con QL_SAVE_PATH=/Users/carancibia/Documents/ChatGPT/pokemon-son-prep-evidence/written-save.json
y después sin QL_SAVE_PATH, en ambos con PW_BASE5199 explícito. No suite completa.
**Flash:** integrar4ce0ab7f conservando su rama, completar comparaciones pendientes
R2 y repetir C8; no motor/C5 todavía. No se enviaron mensajes ni arrancaron agentes.

Comando de reproducción, puerto del servidor propio:
```sh
QL_SAVE_PATH=/Users/carancibia/Documents/ChatGPT/pokemon-son-prep-evidence/written-save.json PW_BASE=http://127.0.0.1:5199/ node tools/playtest/pw.mjs tools/playtest/smoke/questlog-continue.job.mjs /tmp/pw/luna-ql-continue
```
El job exige escenas reproducidas, estado guardado, bytes persistidos intactos y
movimiento. Datos de entrada escritos por menú; no modifica sus archivos ni prepara
resultados. La variante sin escenas usa pewter-pc.
