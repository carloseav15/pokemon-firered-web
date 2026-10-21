# Hoja de ruta: mundo Pokémon unificado

Prioridad vigente del usuario, 2026-10-21. Este documento manda sobre el orden
histórico de VISION, MUNDO-UNIFICADO, FUTURO y TAREAS-FINALES. Estos conservan
referencias y pendientes, pero no son hojas de ruta paralelas.

## Meta y límites

Un solo juego web con Kanto, Johto y Hoenn, un equipo y progreso persistente.
FireRed y el visor son medios para esa meta. Se conserva el motor y la referencia
original; terminar el recorrido completo de FireRed no bloquea la construcción del
mundo. Ese recorrido y su postgame quedan para la validación posterior.

Primera versión: contenido basado en información original verificable, sin
inventar diálogos, encuentros, equipos, recompensas ni reglas. UI y UX exclusivamente
en inglés, incluidos menús, ayuda, errores, accesibilidad y diálogos visibles.
Los documentos de trabajo pueden seguir en español. Los recursos generados se
corrigen en su exportador y se regeneran; no se traducen a mano los datos fuente.

Johto requiere elegir y fijar una fuente oficial concreta (Crystal o HeartGold y
su versión). HnS es una adaptación comunitaria: puede aportar representación GBA,
pero sus gráficos o scripts no prueban fidelidad oficial. Toda conversión declara
fuente, versión, transformación y límites. Cambios necesarios para conectar regiones
se documentan por separado; no se presentan como contenido original.

Reglas modernas, escalado de líderes, misiones opcionales y otros diseños de
MUNDO-UNIFICADO son propuestas diferidas, no requisitos de la primera versión.
No borrar código útil ni desactivar funciones existentes sin estudiar consumidores.

## Orden de trabajo, de fácil a difícil

1. [x] Fijar objetivo, idioma, límites y diagnóstico por región (esta entrega).
2. [x] Ordenar accesos: Home → Play / Continue; World Map y Pokédex secundarios;
   herramientas bajo Tools. Traducir primero raíz y navegación compartida. Conservar
   enlaces antiguos y comprobar rutas tanto en desarrollo como en build servido.
   Hecho: `38eda5b3`; Home/Tools y navegación principal en inglés, nueve enlaces
   de herramientas, escritorio/móvil 390 px, lectura de checkpoint PREPARED sin
   modificarlo. Smoke de entradas PASS en Vite y build servido; no prueba la campaña.
3. [ ] Auditar el resto de textos visibles y migrarlos al inglés, por superficie;
   incluir etiquetas accesibles y expectativas de los smoke jobs en español.
4. [ ] Fijar fuentes por región y reemplazar datos manuales de Johto por extracción:
   diálogos, encuentros con niveles/probabilidades/horarios, entrenadores, tiendas,
   objetos y recompensas. Cada lote debe comparar su salida con la fuente.
5. [ ] Compactar estructura interna por responsabilidad: core (motor), games
   (contenido), viewer (presentación del mundo), web (entrada), tools (desarrollo).
   Mover solo con mapa de imports/consumidores; preservar generación y contratos.
   Consolidar pendientes de FUTURO contra TAREAS sin perder validaciones abiertas.
6. [ ] Contrato regional común: IDs de mapas/especies/entrenadores, flags y variables
   con región, progreso regional/global, guardado versionado y migración. Probar
   que visitar una región no modifica por colisión el estado de otra.
7. [ ] Integrar un circuito pequeño original por región: llegar → hablar → combatir
   → comprar/curar → guardar → continuar. Kanto como referencia; Johto con fuente
   fijada; Hoenn necesita conectar su contenido al motor, no solo mostrar mapas.
8. [ ] Unir viajes regionales con una sola sesión: ida, vuelta, derrota y continuar
   conservan posición, equipo, dinero y progreso; sin reinicios ni estados ficticios.
9. [ ] Completar sistemas regionales, historia y gimnasios sobre ese contrato.
   Sustituir cinemáticas adaptadas por eventos fuente y revisar gráficos/audio con
   comparación focalizada. Resolver divergencias de combate antes de depender de él.
10. [ ] Validación extensa posterior: partida continua FireRed hasta Liga/postgame,
    después recorridos Johto/Hoenn, regresión interregional, audio y móvil real.

Un agente en main, sin subagentes ni push. Código por lote integrado y commit;
estado al cierre. Los contadores de nombres siguen como diagnóstico del port,
no como porcentaje de mundo terminado. No se exige portar funciones sin uso para
subirlos. Las reglas de fidelidad y comprobación de AGENTS siguen vigentes.

## Accesos: estado y destino

Actualmente `/` ofrece Play/Continue y accesos secundarios; `tools.html` agrupa
inspectores, fuentes y eventos. La navegación común enlaza Home, Play, World Map,
Pokédex y Tools, con disposición móvil. `play.html` arranca FireRed; `world.html` carga
el visor regional; `maps.html` consulta mapas. `viewer.html`, Crystal y HnS tienen
redirecciones o modos legacy. Dex, atlas, biblioteca, quests, story, compare y
expansion se publican como entradas independientes en vite.config.ts.
El README describe los accesos vigentes. Los enlaces anteriores siguen disponibles.

La entrada principal y Tools ya están organizados (`38eda5b3`). Quedan para el
punto 3 los menús internos, diálogos, paneles e inspectores en español. La
estructura de URLs no obliga a mover archivos físicos ahora. `/play` y `/world` solo tienen reescritura explícita de desarrollo;
no prometer esos accesos en producción sin configurar y probar el hosting.

## Diagnóstico por región (lectura de código, 2026-10-21)

No es una prueba de navegador ni una certificación visual. Los checks anteriores
registrados en TAREAS son antecedentes; no se repitieron en esta revisión.

| Área | Kanto | Johto | Hoenn |
|---|---|---|---|
| Mapas/gráficos | Datos FireRed, mundo compuesto, sprites y efectos en visor; comparación visual completa pendiente | Mapas GBA exportados de HnS, recursos combinados; no equivalen a gráficos oficiales Crystal/HG | Datos Emerald, mapas, interiores y efectos; comparación visual completa pendiente |
| Integración | EngineInteraction conecta scripts, combate, menús y estado del motor | Reutiliza motor FireRed para combates, con capa de interacción propia | setupUi no crea EngineInteraction cuando HOENN; no hay integración general equivalente |
| Eventos/historia | enterMap conectado, eventos de paso/coordenadas; recorrido completo pendiente | Eventos selectivos, iniciales/objetos/curación/entrenadores escritos en visor; no campaña original completa | Mecánicas y cinemáticas selectivas; no campaña Emerald ejecutada por VM general |
| Mecánicas | Base más amplia: batalla/captura, bolsa, tiendas, PC, campo y guardado; revisar fidelidad | Encuentros con Math.random y niveles por nombre de mapa; tablas manuales, no extracción canónica demostrada | Mach/Acro Bike, pendientes, suelos y puzzles implementados en visor; cobertura/fidelidad por revisar |
| Persistencia | SaveData y navegación; existen pruebas focalizadas con condiciones PREPARED | Comparte piezas de sesión; aislamiento regional y continuidad completa no demostrados | Continuidad regional de equipo/eventos/guardado no demostrada |
| Balance del estado | Base integrada más avanzada; no certificada completa | Región navegable con interactividad parcial adaptada | Región navegable con mecánicas parciales; integración de juego más limitada |

### Evidencia y correcciones pendientes

- src/viewer/main.ts: setupUi excluye HOENN de EngineInteraction; enterMap excluye
  HOENN y JOHTO. Viajes Vermilion/Slateport usan location.href: un enlace no prueba
  continuidad de sesión ni progreso regional.
- src/viewer/engineInteraction.ts: startWildBattle/startTrainerBattle reutilizan
  el motor; equipos custom no prueban datos originales de entrenadores.
- src/viewer/interaction/johtoTrainers.ts: diálogos manuales y Mikey/Don/Wade
  reutilizan IDs FireRed. Auditar también flags y retratos asociados a esos IDs.
- src/viewer/audio/johtoWildMons.ts y main.ts: listas manuales, fallback y niveles
  heurísticos. No tratar el comentario “distribución canónica” como prueba.
- src/viewer/interaction/johtoMart.ts: catálogos genéricos por nombre de ciudad.
- src/viewer/hoennCinematics.ts: escenas DOM y temporización propia; sustituir o
  marcar adaptadas hasta comparar eventos, condiciones y secuencia originales.
- tools/viewer/hns_maps.py declara exportación de mapas sin ejecución de scripts.
- Home, Tools y navegación principal en inglés (`38eda5b3`); retiradas las
  promesas de campaña completa/paridad total. World conserva menús y paneles
  españoles; diálogos e inspectores quedan en el punto 3.
- TAREAS-FINALES §4 conserva divergencia ROM/port en combate del Bosque Verde.

## Cómo medir avance

Por región: fuente trazable, funciones integradas, prueba focalizada y límites
pendientes. Para el mundo: viajes y guardado entre regiones sin colisiones. Para
la web: accesos comprensibles, inglés completo y herramientas apartadas del juego.
No asignar porcentajes de completitud sin un catálogo verificable de requisitos.
