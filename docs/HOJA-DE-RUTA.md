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
3. [x] Auditar el resto de textos visibles y migrarlos al inglés, por superficie;
   incluir etiquetas accesibles y expectativas de los smoke jobs en español.
   Hecho: `fd61199e`; menús, diálogos adaptados, paneles, controles, fichas e
   inspectores traducidos. Smoke de presentación en Vite/build servido: Kanto,
   Hoenn, controles táctiles/390 px y ocho inspectores; no acredita paridad fuente.
   **Pendiente de ejecución Johto:** falta `/hns/fieldfx.json`; conservar este
   bloqueo hasta resolver su exportación y repetir el smoke, sin fallback inventado.
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

La entrada principal y Tools ya están organizados (`38eda5b3`). Menús internos,
diálogos adaptados, paneles e inspectores ya usan inglés
(`fd61199e`); la ejecución de exploración Johto queda bloqueada por sus recursos. La
estructura de URLs no obliga a mover archivos físicos ahora. `/play` y `/world` solo tienen reescritura explícita de desarrollo;
no prometer esos accesos en producción sin configurar y probar el hosting.

## Diagnóstico por región (lectura de código, 2026-10-21)

La matriz resume una lectura de código, sin certificar fidelidad visual o de
historia. La entrega `fd61199e` añade comprobación de presentación en inglés en
Vite/build servido; las demás pruebas históricas de TAREAS siguen como antecedentes.

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
- UI web en inglés (`38eda5b3`, `fd61199e`); retiradas las promesas de campaña
  completa/paridad total. Los textos de sprites y capítulos se corrigen desde sus
  generadores; las claves de datos y los alias de búsqueda permanecen estables.
- Exploración Johto: falta `public/hns/fieldfx.json`; el cargador sin modificar
  recibe HTML de Vite en vez del manifiesto. Smoke de Johto MANUAL, pendiente
  resolver la exportación con su fuente y revisar también los recursos de frames.
- Navegador de mapas: raíz de catálogo corregida a `/map-viewer/principal/`,
  coherente con `principal_world.py`; geometría y discrepancias fuente conservadas.
- TAREAS-FINALES §4 conserva divergencia ROM/port en combate del Bosque Verde.

## Cómo medir avance

Por región: fuente trazable, funciones integradas, prueba focalizada y límites
pendientes. Para el mundo: viajes y guardado entre regiones sin colisiones. Para
la web: accesos comprensibles, inglés completo y herramientas apartadas del juego.
No asignar porcentajes de completitud sin un catálogo verificable de requisitos.

## Johto: comparación de fuentes y siguiente lote

Revisión local, 2026-10-21. Se inspeccionaron los checkouts fijados y los datos
extraídos; no se ejecutó una partida ni se cambió el contenido activo de Johto.
Los repositorios pret reconstruyen los juegos originales; son proyectos comunitarios,
no publicaciones oficiales de Nintendo. Su procedencia se conserva por commit.

| Criterio | Crystal en inglés | HeartGold en inglés |
| --- | --- | --- |
| Fuente fijada | `pokecrystal`, `5beda23ffa505f62e1dad7e3d7c214d1737b3358` | `pokeheartgold`, `9d8b7591f09b65804da2fb2dfd56f320633e0d36` |
| Material disponible | Mapas, bloques, scripts, eventos y textos en `maps/*.asm`; tablas de encuentros, tiendas y equipos existen en Git, fuera de parte del sparse actual | JSON de entrenadores, encuentros y eventos de zona ya extraídos en `refs/heartgold/`; textos generales y scripts requieren ampliar el sparse y extracción |
| Representación original | Mapas y tilesets GBC ya extraídos en `refs/crystal/`; precisan integración en la exploración | La representación DS requiere una conversión propia; los mapas GBA de HnS no equivalen a ella |
| Integración pendiente | Interpretar comandos/eventos ASM y traducir IDs, condiciones, horarios y reglas de Gen 2 | Traducir IDs y eventos DS, seleccionar ramas HeartGold frente a SoulSilver y resolver mecánicas de Gen 4 |
| Ventaja práctica | Referencia 2D directa con texto y condiciones del mapa juntos | Extracción de equipos/encuentros adelantada y lógica C disponible |
| Límite compartido | Reutilizar el combate FireRed no acredita las reglas originales de Crystal | Reutilizar el combate FireRed no acredita las reglas originales de HeartGold |

**Recomendación técnica pendiente de elección del usuario:** Crystal en inglés como
base inicial de Johto si prima reproducir un mundo original 2D con menos conversión
visual. HeartGold es preferible si se busca específicamente su versión de Johto y
se acepta el trabajo adicional de representación y mecánicas DS. Tener más tablas
extraídas no basta para decidir. No mezclar ambas versiones por comodidad ni declarar
una fuente elegida a partir de esta recomendación. La decisión incluye versión visual
y reglas de combate; no solo especies o diálogos.

Diferencia comprobada que debe guiar el primer lote: en
`pokecrystal/maps/CherrygroveMart.asm`, el dependiente consulta
`EVENT_GAVE_MYSTERY_EGG_TO_ELM` y elige `MART_CHERRYGROVE` o
`MART_CHERRYGROVE_DEX`. En `src/viewer/interaction/johtoMart.ts`,
`getMartCatalogue(mapId)` agrupa ciudades por nombre y ofrece Poké Balls sin esa
condición. Por tanto, traducir el catálogo al inglés no resolvió su fidelidad.
`johtoWildMons.ts` también conserva listas manuales sin niveles, slots ni horarios;
esos campos deben provenir de la versión elegida, no de heurísticas del mapa.

Orden del siguiente trabajo después de elegir versión:

1. Ampliar solo el sparse necesario, conservar el commit y extraer tablas con
   procedencia (mapa, símbolo fuente y condiciones). `src/` no importará `refs/`;
   el exportador del juego generará los recursos de runtime separados.
2. Sustituir la familia de tiendas de Johto: catálogos, precios, condiciones y
   recompensas de compra de la fuente elegida. Revisar los consumidores compartidos
   Kanto/Hoenn antes de sustituir el catálogo genérico. Aceptación: comparación
   determinista de cada catálogo y prueba de Cherrygrove antes/después del evento.
3. Sustituir encuentros completos con slots, niveles, métodos y horarios; después
   equipos, diálogos, objetos y condiciones de eventos. No usar nombres de entrenadores
   FireRed como identidad persistente Johto.
4. Resolver representación y efectos antes del circuito jugable. Exportar efectos
   de HnS repararía una adaptación; no convertiría sus gráficos en originales.
   Si se elige Crystal, adaptar sus recursos originales al contrato de presentación;
   si se elige HeartGold, documentar y comprobar su conversión. Sigue abierto el
   bloqueo `/hns/fieldfx.json`; no copiar el manifiesto de Emerald para ocultarlo.
5. Repetir el smoke inglés y un circuito pequeño hablar/combatir/comprar/curar/
   guardar/continuar, con aislamiento regional. Mantener el recorrido extenso diferido.
