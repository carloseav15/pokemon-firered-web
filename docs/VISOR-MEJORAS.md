# Visor del mundo: auditoría y tareas (7.6)

Auditoría solicitada el 2026-10-03 sobre `main`, `9142b1b1`. Este documento
sustituye el plan sobre `eb3e6092`: sus tareas mezclaban cambios ya aplicados con
pendientes. Alcance original en [VISOR-MUNDO.md](VISOR-MUNDO.md);
registro de tareas en [TAREAS-FINALES §7](../TAREAS-FINALES.md).

## 1. Dictamen y verificación

**El viewer es un sandbox creativo personal:** inspeccionar el mundo y sus
colisiones, editar tiles/rellenar huecos, guardar el proyecto y volver a modificarlo,
y recorrer ese mismo mundo para verlo vivo y reconocer sus límites.
Clarificación directa del usuario tras la auditoría, 2026-10-03: batallas y avance
de historia quedan fuera de esta fase; movimiento, animaciones, transiciones,
música y relación visual del protagonista con árboles/casas/pasto sí importan.

La base cartográfica es útil y el modo de exploración propio tiene sentido para
este objetivo. La recomendación anterior de sustituirlo obligatoriamente por el
juego completo en iframe queda retirada: impediría ver las ediciones sin construir
además un puente de mapas. Hay que mejorar el sandbox, reutilizando datos y
componentes del port cuando encajen, sin exigir scripts ni combates para caminar.
La geometría de cámara está corregida; audio, animaciones y edición siguen pendientes.

Se leyeron HTML, CSS, todos los módulos de `src/viewer/`, generador, planes,
historial reciente y dependencias relevantes de ROM, renderer, paletas, audio,
arranque y guardado. No se auditó exhaustivamente todo el motor FireRed.

Comprobaciones ejecutadas:

- `npm run build` y `npm run check:honesty`: PASS. Build advierte sobre tamaños
  de chunks e importación mixta; compilar no demuestra fidelidad funcional.
- Chromium con Vite local y perfil temporal: carga, búsqueda, entrada/salida de
  Explorar, audio, zoom, capas y barra a 900×700.
- Índice: 37 mapas, 408×400 casillas, 363 elementos, 74 activadores,
  164 entrenadores, 10 elementos startsHidden, 11 pares de tilesets y 24 partidas.
  BFS/conflictos, initialFlags y writers coinciden con una lectura nueva mediante
  funciones del generador; partidas copiadas idénticas byte a byte a sus fuentes.
  Es consistencia, no un oracle independiente del parser. No se regeneró el índice.
- El único conflicto sigue siendo Ruta 6 → conexión de Azafrán. No inventar
  posiciones para corregir una asimetría documentada de la fuente.
- Pendientes: persistencia de proyectos editables, exploración del mundo editado,
  profundidad visual, conexiones/transiciones, Safari, móvil, escucha humana y
  comparación focalizada de animaciones con la fuente. Las pruebas de partida
  sandbox del juego completo pertenecen a la tarea futura 7.3.

Conservar caché de metatiles, carga paralela de layouts, debounce del hash,
escape en fichas, contador de capas y módulos ya extraídos. TileRenderer carga
paletas en su constructor y conserva RGB por instancia; no añadir una segunda
carga global por rutina.

## 2. Hallazgos

Esta tabla conserva el diagnóstico sobre `9142b1b1`; el estado de los cambios
posteriores de Muse está en §4. No volver a asignar hallazgos ya aceptados allí.

| Prioridad | Evidencia | Consecuencia y tarea |
|---|---|---|
| Alta | Edición retirada de ruta activa: no hay proyecto editable persistente. | Falta uno de los tres objetivos principales. C6. |
| Alta | Movimiento usa tiempos 100/120/160 ms y saltos que evitan isWalkable; efectos/sprites se posicionan con capas DOM fijas. | Revisar movimiento, aterrizaje, profundidad y efectos. Ausencia de batallas/scripts no es un fallo del alcance actual. C1/C7. |
| Alta | build usa objetos del índice parcial para colisión/entidades sin política de visibilidad; diálogos genéricos y avisos de combate simulado. | Definir objetos visibles en la sesión libre, cargar datos completos necesarios y retirar falsas batallas/diálogos canónicos. C1. |
| Alta | Audio activado en Paleta: rom.constants ausente, backend de sound ausente, música actual 0 y transición a 300 pendiente en estado 6. init oculta el error; build no carga constantes. | El botón indica activo sin instalar reproducción. C2. |
| Alta | setZoom multiplica dimensiones por zoom y también aplica transform. A 1,25×: estilo 8.160 px, rectángulo/scroll 10.200 px; extensión prevista del mundo 8.160 px. | Doble escalado de extensión y espacios sobrantes. C3. |
| Media | tick congela mapas invisibles y zoom <0,5; invalida/compone por casilla. Audio recibe un callback por RAF con pasos, no uno por paso GBA, y depende de tiles activados. | Desincronización y reloj de audio incorrecto. C2/C4. |
| Media | parseHash ignora capas= por if(capas). Tras Ninguna, recargar sin ajustes locales vuelve a 11/12 y sobrescribe enlace. PREPARED: se eliminó solo la clave de ajustes del perfil temporal para simular destinatario. | Compartir cero capas falla; selección/modo tampoco se guardan. C3. |
| Media | Búsquedas reales paleta y route 1: cero resultados y lista oculta. Títulos PalletTown/Route1 y secciones MAPSEC_* no tienen alias ni separación de palabras. | Búsqueda incompleta y sin feedback. M1. |
| Media | Ficha retorna antes de las acciones si no hay elementos. showAt reabre panel cerrado; seleccionar puerta exterior cambia cámara inmediatamente. | Selección y navegación sorprendentes. M4/C3. |
| Media | loadStored acepta enums/booleanos sin validación; animación no se persiste. | Estado local incoherente. M2; persistencia de animación tras C4. |
| Media | A 900×700 botones estrechos parten texto y grupo de zoom se solapa. Faltan nombre accesible propio de búsqueda y estados ARIA. | Interfaz frágil con poco espacio/teclado. M3. |
| Media | Minimapa 176×130 para mundo 408×400, listeners mouse permanentes en window. | Distorsión y arrastre limitado. M5. |
| Media | Relleno usa IDs fijos, primer renderer y distancia a rectángulos. Automático (Canónico) describe una heurística; conflicts no se comunica. | Distinguir fondo automático de terreno editado con colisión y tileset propios. M3/C5/C6. |
| Baja | Búsqueda/error de carga interpolan innerHTML sin escape; índice sin validación; main.ts tiene 1.168 líneas y estado duplicado. | Robustez/mantenibilidad. M1/C3/C5. |

Rendimiento: relleno 6.528×6.400 píxeles = **159,38 MiB** bajo representación RGBA
de 4 bytes/píxel; mapas base suman **57,61 MiB** con la misma hipótesis, sin overlays
ni cachés. Son cálculos de superficies, no consumo medido del navegador.
Se observaron 216 canvases en el DOM. Medir y fragmentar antes de prometer mejoras.

## 3. Trabajo reservado a Codex

### C1 — Exploración libre sobre el proyecto del viewer

Recorrer el mundo base más las ediciones de C6, con un estado de sesión separado
de SaveData. Inspección, edición y exploración comparten un único modelo efectivo
del mundo: pintar una pared/suelo cambia tanto dibujo como colisión y efectos.
Cambiar de modo no descarta proyecto ni posición. Caminar no necesita medallas,
historia ni combates; surf/bici pueden ser herramientas libres explícitas.

Separar controlador de movimiento, cámara, entidades y rendering; reutilizar
tablas, animaciones y assets fuente con sus frames/semántica cuando corresponda.
No importar el overworld completo a ciegas: revisar dependencias globales antes
de elegir componentes. Un iframe del juego original sin patches no cumple la
exploración del proyecto editado. El motor libre es una adaptación del viewer,
no una implementación C contable ni una afirmación de fidelidad del juego entero.

Mantener colisiones/límites coherentes, aterrizaje válido de salientes, elección
de casilla inicial transitable y NPCs con política explícita de visibilidad libre.
Quitar desafíos de combate simulados; interacciones de inspección o sandbox deben
identificarse como tales, no atribuir texto inventado al juego fuente.
Interiores jugables y campañas no se incorporan por rutina.

Aceptar: caminar entre mapas sin salto de cámara, chico/chica, cambios caminar/
bici/surf, bordes y obstáculos, selección de punto de inicio, Esc/blur sin teclas
atascadas, probar pared y suelo recién pintados, salir/volver sin perder ediciones.
Guardar el proyecto nunca modifica la partida FireRed del usuario.

### C2 — Audio con inicialización válida y reloj independiente

Constantes fuente disponibles sin cargar todo el juego por rutina. Conservar
musicId junto al mapa: reactivar hoy pierde ID y llama rom.c(MUS_MAP_...), cuyo
throw no se resuelve con ??. UI activa solo al inicializar; error visible/reintento.
sound.frame por cada paso GBA, aunque tiles estén apagados; pausa al ocultar;
una única fuente de audio compartida por los modos del viewer. Validar mismo mapa,
reactivación, cambios de mapa/
misma canción, tiles apagados, visibilidad y fallo de carga. Scheduler instrumentado
no sustituye escucha humana.

### C3 — Cámara, URL, selección y separación por responsabilidades

Una transformación y extensión de scroll correcta; coordenadas mundo/local claras;
fuente única de estado. Distinguir capas= de parámetro ausente; selección/modo en URL;
minimapa ante resize/zoom; respetar panel cerrado y navegar destinos explícitamente.
Gestionar blur y pointercancel/lostpointercapture. Después extraer cámara, carga/
render y toolbar; no perseguir un límite de líneas sacrificando legibilidad.
Aceptar con 0,25/0,5/1/2/4×, zoom al cursor, arrastre/resize, extremos, enlace cero
capas con perfil limpio y ficha restaurada.

Entrega `0c890154`: cámara extraída; mundo en píxeles sin escalar y stage con
extensión escalada, selección/modo/posición del avatar/panel en URL, `capas=` válido,
cancelación de puntero/blur y navegación al destino explícita. Browser PASS a las
cinco escalas, ancla al cursor, extremos tras resize, ficha/panel y modo/posición
restaurados, minimapa con teclado, búsqueda y diálogo. Cancelación usa evento
**PREPARED** de dispositivo sobre arrastre real. Sin puertas con destino exterior en
el índice actual: el botón tiene revisión estática, no recorrido real. Pendientes:
extraer carga/render/toolbar, navegación por cambios del hash sin recarga y revisar
cámara de seguimiento/foco en Explorar con C1. No se afirma C3 entero cerrado.

### C4 — Animadores/cachés y memoria con mediciones

Renderer/animador por par, relojes avanzan fuera de vista; redibujar solo visible y
acumular suciedad para reentrada. Invalidar una vez por metatile, no cada casilla.
ROM ya cachea tilesets: no rediseñar caché redundante; deduplicar promesas en vuelo
en viewer si se paraleliza. Fragmentar relleno, separar geometría de dibujo/ajustes.
Medir arranque/superficies/frame antes/después en mismas condiciones; comprobar
agua/flores/fuente, cambios de cámara y zoom bajo.

### C5 — Procedencia, índice y errores honestos

Writers sintácticos no prueban ejecución/desbloqueo; faltan potenciales cambios
desde C/macros. Decir sin referencia en scripts analizados, no asegurar fuera de
scripts. Validar dimensiones/coordenadas/capas/versión; error visible aunque panel
esté cerrado; comunicar conflicto y relleno heurístico. No convertir el índice
parcial en inventario completo de NPC. Exportar los metadatos adicionales que el
sandbox necesita desde la fuente. Si cambia generador: dos regeneraciones, hashes
iguales; ningún JSON generado se edita a mano.

### C6 — Edición y proyectos que se pueden seguir modificando

Crear capa de datos de proyecto versionada sobre el mundo fuente inmutable. Un
tile editado registra metatile, par de tilesets y ubicación estable: mapa+casilla
local dentro de mapas y coordenada de mundo en huecos. Conservar comportamiento,
colisión y elevación fuente, con overrides explícitos cuando el editor los permita.
No guardar solo una imagen ni pintar en el canvas del fondo: no permite reabrir
el trabajo, recalcular capas o explorar correctamente.

Pincel, cuentagotas, selección de tileset/metatile, relleno de área, borrar patch,
deshacer/rehacer por operación y guardar/abrir proyecto. Un gesto de arrastre es
una operación de undo, no cientos de entradas. Cuentagotas no pinta; drag de
cámara no pinta. Separar relleno visual automático de terreno editable/transitable.
Permitir llenar huecos con tiles de distintos pares sin perder colores/comportamiento.

Persistencia local para proyectos y exportar/importar JSON como copia durable;
evaluar IndexedDB según tamaño medido, reservar localStorage para ajustes pequeños.
Versionar esquema y referencia a datos base; validar al importar, advertir si cambia
la base, gestionar cuota/errores y mostrar cambios sin guardar. Fallo de guardado
no marca proyecto como guardado; importación inválida no reemplaza el abierto.
Cambiar bioma, zoom, capas o modo no borra patches. El guardado del viewer no toca
public/fr, datos generados ni claves de partida FireRed.

Aceptar: pintar mapa+hueco, cuentagotas, relleno acotado, deshacer/rehacer, guardar,
cerrar/recargar, reabrir y seguir editando; exportar/importar reproduce proyecto,
incluidas colisiones; iniciar Explorar y recorrer suelo/obstáculos editados.
Comprobar error de escritura/importación sin perder trabajo y partida real intacta.

### C7 — Profundidad visual, animaciones e interacciones del entorno

Separar suelo, objetos/sprites y partes altas de tiles según atributos y rendering
fuente. El protagonista debe pasar detrás de copa/tejado y delante de bases según
posición/profundidad, no dibujarse siempre encima. Revisar máscara de hierba,
huellas/polvo/salpicaduras, salto y entrada/salida de agua; usar gráficos y secuencias
fuente, sin inventar un efecto por estar cerca de una casa o árbol.

Conexiones deben cargar continuidad de terreno, entidades y música sin teletransportar
la cámara. Mantener coherencia en mundo editado; terrenos sintéticos se identifican
como decisiones del proyecto, no mapas canónicos. Probar árbol/casa desde lados
distintos, caminar por pasto/arena/agua, salto, cambio de mapa y tiles pintados.
Comparación focalizada con renderer/tablas C antes de afirmar fidelidad; comprobar
profundidad visual en navegador y escuchar transiciones de música.

## 4. Tareas para Muse Spark 1.3

M1–M11/R1–R6 revisadas e integradas (`ebe759c4`). Check integrado del viewer:
buscador Azulona, ARIA de popovers, minimapa con teclado y cierre de diálogo PASS.
Interacción NPC activada con DOM click **PREPARED**; no equivale a recorrido narrativo.

Asignación por tamaño/acoplamiento, sin afirmar una evaluación comparativa del
modelo. **Una tarea por vez y revisión del diff antes de la siguiente.**
No encargar modelo/persistencia de proyectos, relojes, fidelidad C ni reescritura global.

### Revisión M1–M5 y cierre de correcciones

Revisión de Codex sobre `1e622f71`, documentada el 2026-10-04. Tipos, build,
honesty y diff-check PASS; comprobaciones en Chromium. No se corrigió código.

| Tarea | Estado revisado | Commit de implementación |
|---|---|---|
| M1 | Aceptada tras R1/R2: Meseta Añil y ARIA sin opción activa corregidas | `01fd20f2`, `c62343fa` |
| M2 | Aceptada: JSON/tipos inválidos, capas vacías/duplicadas y almacenamiento no disponible | `65bd06fb` |
| M3 | Aceptada: layout a 900×700/1280×800, foco y movimiento reducido | `63079241` |
| M4 | Aceptada: acción en ficha vacía, sin callback no hay botón y render repetido no duplica llamadas | `8765ab2b` |
| M5 | Aceptada tras R3: indicadores CSS alineados y actualización ante resize | `1e622f71`, `8a36d0d8` |

Segunda revisión sobre `8a36d0d8`, 2026-10-04: tipos/build/honesty PASS; Chromium
confirma Meseta Añil con/sin acentos, búsquedas previas, Sin resultados sin atributo
activo, Enter sin navegación y Esc. Minimap: viewbox alineado a 900×700/1280×800 y
punto alineado con el jugador. R1–R3 cerrados; las instrucciones siguientes quedan
como criterios de comprobación, no tareas abiertas. M6–M9 se revisan abajo.

Las comprobaciones aisladas de M2/M4 y texto HTML de M1 usaron entradas
**PREPARED** para probar límites del módulo; no representan un recorrido de juego.
M3/M5 se comprobaron también sobre el viewer real. No se validó un dispositivo
táctil físico ni Safari. No rehacer M2–M4 ni volver a ejecutar todo su trabajo.

**R1 — Alias completo de Meseta Añil (M1).** Archivos permitidos: search.ts y
auxiliar de nombres bajo `src/viewer/ui/`. Buscar `Meseta Añil` devuelve Sin
resultados: traducir palabras en orden no coincide con el nombre fuente.
Añadir alias completos por mapa y normalizarlos como título/ID, conservando
identificadores y callbacks. ID verificado en el índice: `MAP_INDIGO_PLATEAU_EXTERIOR`
(título `IndigoPlateau_Exterior`); volver a contrastarlo antes de editar. Aceptación:
`Meseta Añil` y `meseta anil` encuentran ese mapa; siguen funcionando pallet,
paleta, route 1, ruta 1, Pueblo Paleta, Ciudad Verde e ID completo, con Route1
antes de Route10. No añadir un caso especial que cambie la consulta de otros mapas.

**R2 — Limpiar opción activa inexistente (M1).** Archivo: `src/viewer/ui/search.ts`,
rama sin coincidencias de renderResults. Buscar un mapa y después `zzzzzz` deja
aria-activedescendant apuntando al nodo eliminado. Quitar el atributo cuando no
existe opción seleccionable; mantener mensaje y aria-expanded coherentes con la
lista visible. Aceptación: resultado → Sin resultados → consulta vacía → nueva
coincidencia; cada vez el atributo está ausente o apunta a una opción existente.
Enter sin coincidencias no llama onSelectMap; Esc cierra y limpia el atributo.

**R3 — Indicadores en píxeles CSS (M5).** Archivo: `src/viewer/ui/minimap.ts`.
Canvas interno observado 176×130, tamaño CSS 174×129,5. updateRadar coloca viewbox
y punto del jugador directamente en coordenadas internas, aunque el dibujo se
escala al mostrarse. Convertir posiciones y tamaños al sistema CSS del contenedor
de los indicadores usando las medidas reales del canvas y su origen relativo al
contenedor. Reutilizar una transformación coherente; conservar navegación inversa
y captura de pointer. No modificar main.ts ni el zoom del mundo (C3 pendiente).
Aceptar al comprobar centro/esquinas, viewbox/punto alineados con el dibujo, zoom
y resize, ratón/toque emulado y arrastre fuera/cancelación. Medir dimensiones de
nuevo: las cifras anteriores son evidencia de la revisión, no valores a fijar.

Entregar R1/R2 como una corrección de M1 y R3 como corrección de M5, con commits
de código separados y las comprobaciones de las instrucciones comunes. No marcar
M1/M5 aceptadas sin repetir sus casos pendientes; no ampliar el alcance al editor.

### Instrucciones comunes para copiar junto a cada tarea

Lee AGENTS.md, TAREAS-FINALES §0 y tu tarea. Worktree/rama propios si hay otro agente.
Sin merge/push. No tocar src/fr, public/fr, tools/decomp, inventario, baselines,
kanto.json ni partidas. Solo archivos permitidos; conservar contratos públicos.
Si necesitas otro archivo, explicar dependencia y dejar parcial. Ejecutar
check:port, build, check:honesty y git diff --check; comprobar aceptación en navegador
o informar REQUIERE NAVEGADOR. No declarar terminada si falta aceptación.
Un commit de código en inglés; identificar entorno en Co-Authored-By. Entregar
hash, archivos, checks y pendientes; no escribir crónicas ni marcar otras tareas.

### M1 — Buscador útil, seguro y accesible

**Archivos:** `src/viewer/ui/search.ts` y auxiliar en `src/viewer/ui/` si hace falta.
Conservar setupSearch/onSelectMap.

1. Crear nodos título/ID con textContent, sin interpolar HTML.
2. Separar CamelCase/guiones bajos y comparar también sin espacios; alias UI en
   español para mapas, sin cambiar IDs fuente ni atribuir traducciones al exportador.
3. Consulta vacía oculta; no vacía sin coincidencias muestra Sin resultados y no
   ejecuta callback. Priorizar coincidencia exacta sobre subcadena.
4. Conservar ↑/↓/Enter/Esc; opción activa visible; roles combobox/listbox/option,
   IDs estables y aria-activedescendant.
5. Probar pallet, paleta, route 1, ruta 1, ID completo, sin coincidencias y texto
   literal con < y &. Route10 puede coincidir, pero Route1 debe tener prioridad.

### M2 — Validar ajustes locales

**Archivo:** `src/viewer/state.ts`. Conservar clave/métodos públicos.

1. Raíz JSON objeto no nulo/no array. Enums solo valores permitidos; radar/audio
   solo booleanos. Campo inválido conserva default; otros válidos sí se cargan.
2. activeLayers solo array, filtrar capas conocidas/deduplicar; [] es cero capas.
   No añadir persistencia de animación antes de C4.
3. Probar JSON roto, null, array raíz, enums inválidos, strings en booleanos,
   capas mixtas/desconocidas/vacías y almacenamiento que lanza excepción.
   Usar perfil temporal y clave viewer; no tocar save del juego.

### M3 — Barra responsive, etiquetas y foco

**Archivos:** `viewer.html` y `src/viewer/viewer.css`. No tocar TS.

1. Página grid auto minmax(0,1fr) auto; quitar calc(100% - 76px). Barra con fila
   adicional si falta espacio; grupos sin solaparse/texto cortado; sin IDs duplicados.
2. :focus-visible para controles; nombre accesible Buscar mapa. Cambiar Animaciones
   (60 FPS) por Animar tiles y Automático (Canónico) por Automático (relleno visual);
   aclarar que el relleno automático es fondo, distinto del terreno pintado del proyecto.
3. prefers-reduced-motion para spinner/transiciones decorativas vía CSS; no cambiar
   reloj del motor. ARIA dinámico de modos se conectará en C1/C6.
4. Probar 900×700/1280×800, Tab, popovers/búsqueda y panel visible/colapsado; footer/
   viewport siguen utilizables con barra de dos filas.

### M4 — Acciones de ficha en casillas vacías

**Archivo:** `src/viewer/ui/panel.ts`. No modificar showAt ni crear sandbox.

1. Eliminar retorno que omite acción sin els/trs; conservar mensaje Sin elementos.
2. Crear botón al final solo con onExploreHere; listener sobre el nodo directamente,
   no getElementById global; callback una vez por clic.
3. No acción nueva en renderBiomePanel ni inventar transitabilidad durante M4.
   C1/C6 añadirá inicio en huecos convertidos en terreno; este cambio no valida C1.
4. Probar ficha vacía con callback, entrenador/puerta, sin callback, relleno y render
   repetido sin listeners acumulados; mantener escape.

### M5 — Proporción y Pointer Events del minimapa

**Archivo:** `src/viewer/ui/minimap.ts`. Conservar setupMinimap/updateRadar.

1. Escala uniforme del mundo dentro del área actual, con márgenes centrados.
   Misma transformación para mapas/viewbox/jugador/navegación.
2. Cambiar mouse/listeners window por pointerdown/move/up/cancel con captura,
   liberación y fin ante pérdida de captura; limitar click al rectángulo útil;
   touch-action apropiado. No miniatura real ni cambio de cámara.
3. Probar proporción 408/400, centro/esquinas/zoom, arrastre fuera y cancelación,
   mouse/emulación táctil. C3 puede limitar validación final: informar sin tocar main.

### M6 — Buscar también fragmentos de alias españoles

**Aceptada:** `e12741d1`, revisión de Codex el 2026-10-05. Chromium: Azulona/azul,
Ciudad Azulona, Meseta Añil/Añil, ruta 1/Route1 antes de Route10, ID, espacios
repetidos/tabs y Sin resultados con ARIA limpio y Enter sin navegación. Tipos,
build/honesty/diff-check PASS. Entregas posteriores M7–M9 revisadas abajo.

**Archivo:** `src/viewer/ui/search.ts` (auxiliar bajo ui/ si hace falta).
Defecto reproducido: Ciudad Azulona encuentra CeladonCity; Azulona sola no.
Los alias completos solo participan en igualdad/prefijo, no en subcadena.

1. Incorporar cada alias en las coincidencias por subcadena normalizada y sin
   espacios, manteniendo exacto > prefijo > subcadena. No concatenar aliases para
   producir coincidencias ficticias entre final de un nombre e inicio de otro.
2. Conservar IDs, onSelectMap, resultados seguros y ARIA de M1; normalizar espacios
   repetidos, tabs y acentos de forma coherente en consulta y nombres.
3. Comprobar Azulona, azul, Ciudad Azulona, Meseta Añil, Añil, ruta 1 y Route1 antes
   de Route10; consulta con espacios repetidos y sin coincidencias. Contrastarlos
   con maps del índice, sin editar JSON. Entrega un diff pequeño: no reescribir M1.

### M7 — Popovers con estado accesible y posición dentro de pantalla

**Aceptada:** `87b2a9c2`, revisión de Codex el 2026-10-05. Chromium a 900×700
y 900×300: controles/estado ARIA, Tab, Esc, clic fuera, alternancia y resize con
scroll interno correctos. Fallback comprobado con fixture aislada **PREPARED**:
Esc devuelve foco al botón y clic fuera conserva el foco del control elegido.

**Archivos:** `src/viewer/ui/popover.ts`; CSS solo reglas de estos menús si hace falta.
setupPopovers conserva firma. Defecto original: menú Capas abierto en Chromium
dejaba aria-expanded/aria-controls ausentes en su botón.

1. Añadir aria-controls con ID real y sincronizar aria-expanded en apertura/cierre.
   En Popover API nativa observar toggle: incluye Esc, clic fuera y cambio al otro
   menú. En fallback actualizar estado al cambiar popover-open; no simular nativo.
2. Fallback admite Esc, cierra menú anterior y mantiene foco razonable: cierre por
   Esc devuelve foco al botón; clic fuera no roba foco al control elegido.
3. Posicionar según tamaño real con margen de pantalla; si no cabe debajo, situar
   arriba o permitir scroll interno. Actualizar al resize con menú abierto sin
   reabrirlo. No asignar role=menu a un formulario de checkboxes/selects.
4. Probar Capas/Opciones, Esc/clic fuera, alternancia, Tab, resize, 900×700 y ventana
   de poca altura. Fallback se prueba con fixture aislada PREPARED o navegador sin
   soporte; documentar cuál. No tocar main ni crear un segundo controlador de UI.

### M8 — Fichas claras y coordenadas copiables

**Aceptada tras R4:** `1e00d1ed` + `11915f9a`. Primera revisión: ficha vacía, entrenador,
puerta/interior y flag del índice, textos escapados, render repetido y callback
único correctos. Clipboard de éxito diferido/error y texto con `<`/`&` comprobados
con fixture **PREPARED**, sin afirmar prueba del portapapeles del sistema.
Relleno válido ofrecía copia; antes de R4, `renderBiomePanel(panel, -1, -4, -5)`
no ofrecía coordenadas ni copia. Corregido; comprobación final abajo.

**Archivos:** `src/viewer/ui/panel.ts`; CSS de ficha si hace falta.
Mantener firmas/callbacks; no navegar automáticamente ni modificar showAt.

1. Mostrar nombre legible de capa mediante LAYER_LABELS, junto al identificador
   fuente cuando ayude; mantener mapa, posiciones locales/mundo y nombres simbólicos.
2. Sin writers: decir Sin referencias en los scripts analizados, en vez de asegurar
   Se cambia fuera de los scripts de mapa. Etiquetar flags como estado inicial de
   referencia, no estado actual del sandbox; no inferir qué desbloquea un camino.
3. Botón Copiar coordenadas con ID de mapa + local(x,y) + mundo(x,y); en fondo,
   solo mundo(x,y). Clipboard tras clic; feedback accesible de éxito/error y sin
   falsas confirmaciones si falla. Nunca copiar script como si fuera un comando.
4. Ficha vacía, entrenador, puerta/interior, flags/writers, coordenadas negativas,
   relleno, texto con < y &, fallo de clipboard y render repetido. Conservar M4:
   un callback por clic y sin botón de explorar cuando no se proporciona callback.

### M9 — Minimapa con teclado y arrastre protegido

**Aceptada tras R5:** `fde7c0fc` + `c2c8e47f`. Primera revisión: flechas con foco desplazan
128 px a zoom 1 y 160 px a 1,25; fuera del minimapa no capturan la tecla.
Mouse real, panel colapsado y ocultar/reaparecer radar correctos. Segundo dedo,
cancelación, lostcapture y botón derecho del mouse comprobados **PREPARED**.
Con avatar activo la flecha no lo mueve; la cámara vuelve a seguirlo por la ruta
existente de C1, no se acepta como cámara libre de exploración.
Antes de R5, fixture **PREPARED** con canvas desplazado 20 px: viewbox quedaba
20 px a la izquierda. Lápiz primario con `button: 2` también navegaba.
Ambos corregidos; comprobación final abajo.

**Archivo:** `src/viewer/ui/minimap.ts`; CSS solo reglas de foco de minimapa.
Mantener setupMinimap/updateRadar, coordenadas y alineación aceptada en R3.

1. Dar foco y nombre accesible al área navegable. Flechas desplazan cámara con paso
   estable expresado en casillas del mundo y convertido con zoom; impedir scroll
   de página y propagación de teclas manejadas al movimiento del protagonista.
   No capturar teclas cuando el foco está fuera del minimapa.
2. Aceptar solo pointer primario/botón principal; mientras hay arrastre no sustituir
   pointerId por un segundo dedo. Cancelar/release/lostcapture dejan estado limpio.
3. Limitar viewbox al rectángulo útil del mundo, no a todo el canvas con márgenes;
   coordenadas relativas al canvas real dentro del wrap. Seguir también resize del
   canvas y reaparición después de ocultar radar. No corregir C3 desde este módulo.
4. Probar teclado con foco/fuera de foco, mouse/touch, segundo pointer (PREPARED si
   sintético), cancelar y continuar, centro/bordes, panel colapsado y radar oculto/
   visible. Separar cualquier límite heredado de C3 de un fallo propio de M9.

### Correcciones finales para Muse: R4 → R5

**Cerradas:** R4 `11915f9a` y R5 `c2c8e47f`; M1–M9 aceptadas. Revisión de Codex
el 2026-10-05: tipos/build/honesty/diff-check PASS. Chromium normal a 900×700:
mouse, paso de teclado de 128 px, panel colapsado y radar oculto/reaparecido correctos.
Fixtures **PREPARED**: R4 con índices -1/3/99, coordenadas negativas, render repetido
y clipboard diferido/error; R5 con canvas desplazado 20×10 px y reducido a 140×110
sin cambiar wrap, punto/viewbox alineados (error <0,02 px), resize/reaparición,
lápiz principal/secundario, touch, segundo dedo, cancelación y reinicio correctos.
No se afirma prueba del portapapeles del sistema ni de hardware táctil/lápiz real.
Las instrucciones siguientes quedan como criterios ya cumplidos, no tareas abiertas.

**R4 — Copiar coordenadas también fuera de los mapas (M8).** Solo `panel.ts`.
En la rama de bioma inválido conservar «Fuera de los mapas», mostrar mundo(x,y)
y añadir el mismo botón/feedback de copia que en el fondo válido, sin inventar
un ID ni casilla local. Verificar índices -1 y fuera de BIOME_NAMES, coordenadas
negativas, éxito/error asincrónico y render repetido. No modificar showAt ni
crear una segunda implementación de clipboard. Un commit de código.

**R5 — Indicadores relativos al canvas y botón principal del lápiz (M9).** Solo
`minimap.ts`, CSS únicamente si resulta necesario. Convertir el origen del canvas
al sistema de coordenadas del wrap que contiene viewbox/player-dot; sumar ese
desplazamiento a ambos indicadores y conservar la escala uniforme y el recorte
al mundo. Observar también el canvas para actualizar ante su resize aunque el
wrap conserve tamaño. No asumir que canvas y wrap comienzan en el mismo punto.
Rechazar botones secundarios de mouse **y lápiz** manteniendo touch primario y
la protección contra segundo dedo. Verificar layout actual y fixture **PREPARED**
con canvas desplazado 20 px/reducido sin redimensionar wrap, punto del avatar,
viewbox, navegación, ocultar/reaparecer, lápiz con button 0/2 y cancelación.
No tocar cámara/zoom de main: la doble escala C3 y el seguimiento C1 quedan
reservados a Codex. Un commit de código; revisar después de R4.

El editor, sus datos/persistencia, audio y profundidad visual siguen reservados a
Codex. No añadir controles de editor sin modelo funcional ni funciones contables.

### Nueva tanda: entorno e interacciones de Explorar (M10–M13)

**Objetivo:** mejorar la presentación del entorno sin duplicar el motor. M1–M9
cerradas no significan que las animaciones de FireRed estén conectadas a Explorar.
En el diagnóstico M10, el viewer usaba `spawnFieldFx` propio para cinco tipos de efecto, frames manuales
del avatar y giros aleatorios de NPC. Reutiliza TilesetAnimator, pero no el sistema
de efectos de suelo/objetos del motor. Suelo y partes altas se componen hoy en un
canvas; el z-index fijo del protagonista no resuelve copas/tejados.

**Asignación y orden:** M10/M11 revisadas. M12/R7 y M13 entregadas en
`codex/viewer-m13`; contratos y revisión al final de esta sección. Mantener el
reloj compartido y los datos fuente, sin fixtures en la ruta real.
Una tarea por commit; no iniciar subagentes ni enviar mensajes a otros chats.
Mantener las instrucciones comunes de AGENTS.md y §4, con estas excepciones
acotadas: Muse puede contrastar tablas para M10 y consumir secuencias ya exportadas
en M12/M13; Codex decide semántica, activación y conexiones con el motor.

#### M10 — Comprobar recursos y cobertura real de las animaciones [aceptada tras R6]

**Entrega documental:** completar aquí una tabla compacta de cobertura, sin abrir
otra crónica ni añadir código desconectado. Leer `render/fieldFx.ts`, `sprites.ts`,
`entities.ts`, llamadas de `main.ts`, `public/fr/fieldfx.json`, metadatos de objetos
y las tablas C relevantes en `pokefirered/src/data/field_effects/field_effect_objects.h`.

1. Registrar por familia: recurso/template fuente, secuencia disponible, caller
   activo del viewer, diferencia concreta y destino C1/C7 o M12/M13. Incluir avatar
   caminar/correr/bici/surf, hierba, polvo, ondas, huellas, marcas de bici, sombras,
   reflejos, NPC y alerta; distinguir inexistente, disponible sin conexión y activo.
2. Verificar que los archivos referidos existen, dimensiones del PNG, tamaño de
   frame y límites de cada índice usado. No deducir número de frames solo del nombre
   ni ajustar cifras a esta guía. Contrastar arena/marcas por dirección y las
   secuencias de hierba/polvo/ondas; anotar líneas C y TS de cualquier diferencia.
3. No editar assets/JSON generados, generadores, lógica de juego ni el inventario.
   No declarar fidelidad por usar una imagen del juego. Si falta metadato, señalar
   qué dato debe exportar Codex y detener únicamente esa comprobación.

#### M10 — Tabla de cobertura (entrega Muse, 2026-10-05; corregida R6)

1 tick GBA = 280896/16777216 s (≈16,74 ms; `viewer/constants.ts:53`, igual que
`game.ts:112`), no 1/60 exacto. PNG medidos por cabecera IHDR con `python3`;
frames/anims de `public/fr/fieldfx.json`; líneas C de
`pokefirered/src/data/field_effects/field_effect_objects.h`; callers de
`src/viewer/`. Estados: «activo simplificado» (renderiza en Explorar con
secuencia o reloj propios, sin afirmar fidelidad), «fuente disponible sin
conectar» (recurso o secuencia fuente existentes sin uso en Explorar), «no
implementado en Explorar» (ni recurso ni uso). Ninguna cifra sale del nombre:
todas de comandos/lecturas. Límites: versión auditada en esta rama, sin prueba
visual; las tablas de movimiento C del avatar/NPC no se declaran comprobadas
(revisión reservada a Codex); la distribución de frames del SurfBlob no se deduce.

Diagnóstico M10 anterior a M12/M13; estado vigente en las entregas de abajo.

| Familia | Recurso / template fuente | Secuencia fuente | Caller del viewer | Diferencia concreta | Estado | Destino |
|---|---|---|---|---|---|---|
| Avatar caminar | `objects/rednormal__player.png` 144×32, `greennormal` ídem | Tablas de movimiento C (reservadas, sin contrastar aquí) | `main.ts:234-241` frames manuales 0-8 por `playerStep`, sheets en `sprites.ts:42-54` | Secuencia manual, sin tabla C | Activo simplificado | Reservado Codex/C1 |
| Avatar correr | `green/redsurfrun__player.png` 224×32 medidos (el caller usa *surfrun, no la hoja normal 144×32) | Ídem | `main.ts:226-233`, sheets en `sprites.ts:50-52` | Hoja por confirmar contra fuente | Activo simplificado | Reservado Codex: señalar qué sheet/frames usa correr |
| Avatar bici | `greenbike/redbike__player.png` 288×32 | Ídem | `main.ts:210-217` (hoja de 32 px, frames 0-8), paso 100 ms en `:457` | Secuencia manual | Activo simplificado | Reservado Codex/C1 |
| Avatar surf | `redsurfrun__player.png` 224×32; `SurfBlob` 6 frames, 4 anims por orientación con `J` loop (`fieldfx.json`, C `:182-215`), PNG `surfblob` 192×32 | Por orientación, 48 ticks/frame | `main.ts:218-225` sprite estático por dirección + `:425-431` cambia a surf con ripple; sin blob | Avatar activo simplificado; flotador sin conectar | Activo simplificado / fuente disponible sin conectar | Reservado Codex/C7 |
| Hierba | `tallgrass__ette1.png` 16×80 = 5×16×16 ✓ JSON 5 frames; anims orden 1,2,3,4,0 ×10 ticks (≈167 ms c/u, 50 ticks ≈837 ms); C `:64-94`, `UpdateTallGrassFieldEffect` | 1-2-3-4-0 a 10 ticks | `fieldFx.ts:11-27` (5 pos a 50 ms orden 0-4 = 250 ms, `setInterval`), caller `main.ts:448` | Ritmo, orden y reloj propios | Activo simplificado | M12 |
| Polvo | `groundimpactdust__ette0.png` 16×24 = 3×16×8 ✓; anims 0,1,2 ×8 ticks (≈134 ms c/u, 24 ticks ≈402 ms); C `:288-313`, `UpdateJumpImpactEffect` | 0-1-2 a 8 ticks | `fieldFx.ts:28-44` (3 pos a 60 ms = 180 ms), caller `:482` solo tras salto de saliente | Ritmo propio; momento begin/finish sin confirmar | Activo simplificado | M12 (`JumpTallGrass` C `:319-347`, 4×16×8 a 8 ticks: fuente disponible sin conectar) |
| Ondas | `ripple__ette1.png` 16×80 = 5×16×16 ✓; 8 cmds 0,1,2,3,0,1,2,4 a 12/9/9/9/9/9/11/11 ticks (79 ticks ≈1,32 s); C `:99-132`, `WaitFieldEffectSpriteAnim` | 8 pasos no lineales | `fieldFx.ts:45-61` (5 pos a 70 ms = 350 ms orden 0-4), callers `:428` entrar al agua y `:453-455` ripple aleatorio 0.3 en surf | Secuencia, duración y activación (el 0.3 es invento del viewer) | Activo simplificado | M12 |
| Huellas | `sandfootprints__ette0.png` 16×32 = 2×16×16 ✓ (+`deep` ídem); 5 anims por dirección (tabla C `:382-388`), frame 0 ó 1 a 1 tick; `UpdateFootprintsTireTracksFieldEffect` | Variante por dirección, 1 tick | `fieldFx.ts:62-74` recorte 16×8, siempre frame 0 + fade 1200/600 ms, caller `:450` | Recorte, dirección ignorada, permanencia inventada | Activo simplificado | M13 (`SandPile` sin uso: fuente disponible sin conectar) |
| Marcas bici | `biketiretracks__ette0.png` 32×32, 4 frames 16×16; 9 anims (4 dirs + 4 giros + base), C `:460-514` | Frame por dirección y giro | `fieldFx.ts:75-88` recorte 16×8, siempre frame 0 + fade, caller `:450` | Recorte, dirección y giros ignorados | Activo simplificado | M13 |
| Sombras | `shadow{small,medium,large,extralarge}` 8×8, 16×8, 32×8, 64×32 ✓ 1 frame c/u; C `:4-59`, `UpdateShadowFieldEffect` | 1 frame por tamaño | Ningún uso en Explorar (solo `box-shadow` CSS decorativo) | Sin conectar | Fuente disponible sin conectar | Reservado Codex/C7 |
| Reflejos | C copia el sprite del objeto (`field_effect_helpers.c:33`); TS usa `reflectionFrames`/`bridgeReflectionFrames` de `objects.json` (`fieldEffects.ts:1090-1097`). ReflectionDistortion sin imágenes propias; WaterSurfacing es otro efecto | Dos secuencias affine en C (`field_effect_objects.h:889-931`); no aparecen en el template exportado de fieldfx.json. Integración/semántica affine pendientes de revisar | Ningún uso en Explorar | Fuente y recursos disponibles; distorsión/exportación requieren revisión de Codex | Fuente disponible sin conectar | Reservado Codex/C7 |
| NPC | `GFX_MAP` manual `sprites.ts:3-40` (campo `frames` sin usar); `faceTowards`/giros aleatorios `entities.ts:95-135`; `updateAutonomousBehaviors` en `main.ts:632` | Tablas de movimiento C (reservadas) | Sprites y giros propios | Secuencia y visibilidad manuales | Activo simplificado | Reservado Codex/C1-C7 |
| Alerta | Secuencia fuente `EMOTE_ANIMS` (`field/fieldEffects.ts:61`: 5 anims, frames 0-2/6-8/… a 4,4,52 ticks; tablas en `trainer_see.c:581+`); viewer usa `emoticons.png` 48×80 + `emoticonBounce` 0,4 s (`viewer.css:476-487`, `entities.ts:118-127`), caller `:309` tras `checkTrainerSight` (`:295-313`, rango cardinal) | 4,4,52 ticks por emoticono | Globo propio sin secuencia de frames | Secuencia y espera sustituidas por bounce; avistamiento simplificado | Activo simplificado / fuente disponible sin conectar | Reservado Codex/C7 |

Metadato que debe exportar Codex si M12/M13 lo necesitan: loader/cache tipado de
templates y eventos con posición/prioridad/sesión (ya pedido en M12), y la
correspondencia dirección↔huella validada (ya pedida en M13); nada más detenido aquí.

**Aceptar:** cada fila tiene evidencia verificable y estado de conexión; referencias
existentes, sin cifras supuestas ni afirmación de prueba visual. Diff/enlaces y
honesty antes del commit documental; no necesita build. Codex revisa la tabla.

#### R6 — Corregir la tabla M10 [cerrada]

**Aceptada:** M10 `afcc1f0a` + R6 `3ac164a7`, revisión de Codex el 2026-10-05.
Estados, recursos, recortes y secuencias contrastados con callers/metadatos/C.
Codex corrige aquí dos detalles finales: ondas = 79 ticks y distorsión de reflejo
con dos secuencias affine en C, aunque fieldfx.json no las exporta. Revisión de
fuente/documentación; sin afirmar comportamiento visual ni conexión de efectos.
Las instrucciones siguientes quedan como criterios ya revisados.

1. Separar estado de conexión de fidelidad: los cinco efectos y sprites manuales
   sí están activos en el viewer, aunque sus secuencias no sean fieles. Usar
   «activo simplificado», «fuente disponible sin conectar» y «no implementado en
   Explorar». No definir activo como fiel ni afirmar ausencia de recursos que existen.
2. Reflejos: revisar `field/fieldEffects.ts` (ruta reflectionFrames) y
   `field/objectEvents.ts`/`public/fr/objects.json`. ReflectionDistortion sin frames
   no demuestra falta de datos: el reflejo reutiliza imágenes del objeto. WaterSurfacing
   es otro efecto. Registrar fuente disponible y falta de conexión al viewer.
3. Alerta: revisar `pokefirered/src/trainer_see.c` tablas de emoticons y
   `field/fieldEffects.ts` EMOTE_ANIMS. La ausencia de template en fieldfx.json no
   significa que la secuencia fuente sea N/A; distinguirla del bounce CSS del viewer.
4. Avatar: corregir recurso de correr (el caller usa *surfrun, no la hoja normal),
   separar avatar surf activo simplificado de flotador SurfBlob sin conectar y
   apuntar las líneas de bici al bloque correcto. No declarar comprobadas tablas
   de movimiento C que siguen pendientes de la revisión reservada a Codex.
5. Huellas/bici: registrar además el recorte actual de 16×8 frente a frames fuente
   de 16×16; verificar geometría real y variantes sin inferirlas de dimensiones.
   Usar el tick GBA de constants.ts (16777216/280896), no 60 Hz exactos, al convertir
   duraciones. Revisar referencias C/TS con la versión auditada y declarar límites.

**Aceptar:** tabla coherente con callers y metadatos; recursos, frames y conexión
verificados independientemente. Diff/enlaces/honesty antes del commit documental.
M12 dispone de APIs de C7 en `6743381e`; M13 entregada en `a29c9ae9`. La integración revisada está completada; futuras entregas van
en ramas propias y las fusiona el revisor tras comprobarlas.

#### M11 — Diálogos de interacción seguros y accesibles [aceptada en rama Muse]

**Aceptada:** `ddd899ae`; tipos/build/honesty/diff-check PASS. Chromium a
900×300/700: texto largo con scroll y cierre visible sin solapar cabecera;
texto/strong seguros, sin interpretar HTML, y render repetido con un cierre por clic.
Entrada maliciosa/texto largo e instancia aislada: **PREPARED**. Callbacks reales
sobre NPC del índice invocados por DOM click **PREPARED**: Z/Espacio/Enter cierran,
botón Cerrar no mueve avatar. No se afirma recorrido físico de interacción ni
validación con lector de pantalla; role/status y nombre comprobados en DOM.

**Archivos:** `ui/dialog.ts`, HTML/CSS del diálogo y cambios mínimos a sus callers
en `main.ts`. No cambiar contenido narrativo, combate, scripts ni movimiento.

1. Sustituir la entrada HTML arbitraria por texto: revisar TODOS los callers de
   `DialogManager.show`, retirar el `<b>` del mensaje de entrenador y presentar
   nombres/flags con `textContent`. No dejar un segundo camino inseguro. Si se
   necesita énfasis, usar nodos DOM explícitos con valores tratados como texto.
2. Dar nombre/descripción accesibles al panel visible mediante sus IDs reales y
   anunciar el mensaje una vez al abrir/actualizar. Elegir un único mecanismo
   accesible adecuado; no combinar anuncios duplicados ni afirmar modalidad con
   aria-modal si no se controla el foco. Mantener cierre con Z/Espacio/Enter y
   parada del movimiento mientras el diálogo está abierto.
3. Añadir botón Cerrar visible y accesible que use `close()`; estado oculto y abierto
   coherentes para tecnologías de asistencia. No añadir listeners globales por
   cada apertura, atrapar foco ni robarlo al mostrar un diálogo automático.
4. Ajustar texto largo a 900×300 y 900×700: contenido y cierre alcanzables, scroll
   interno si hace falta, sin recortar el mensaje ni cubrir toda la barra superior.

**Aceptar:** NPC y mensaje de entrenador conservan su información; `<`, `&` y
`<img onerror=...>` aparecen como texto sin crear elementos (fixture **PREPARED**).
Abrir/actualizar/cerrar repetidamente no duplica callbacks; botón y teclas cierran,
no avanza el avatar por clic en Cerrar. Tipos/build/honesty/diff-check y comprobación
focalizada en navegador. No afirmar fidelidad de los diálogos al juego original.

#### M12 — Presentación de hierba, polvo y ondas desde templates [aceptada con R7; integrada]

**Base entregada:** rama `codex/viewer-c7-contract`, código `6743381e` sobre
`1d4a23c9`. Local, integrado en main (2026-10-06), sin push. M12 se integró desde esta base;
para continuar usar main y los commits registrados. C2/C7 completos siguen abiertos;
esta base desbloqueó las APIs de M12. M13 entregada en `a29c9ae9` (ver abajo).

**Reloj:** `src/viewer/clock.ts` exporta `viewerClock`, `ViewerClock` y
`bindViewerClockVisibility`. Main ya conecta visibilidad, audio, movimiento, NPCs
y tiles; no añadir otra instancia ni otro RAF. Periodo `GBA_FRAME_MS`, calculado
con 280896 ciclos / 16777216 Hz. Uso desde `render/fieldFx.ts`:

```ts
import { viewerClock } from "../clock";
const off = viewerClock.subscribe(({ tick, deltaMs, elapsedMs }) => {
  // Un callback por tick GBA; avanzar UN tick de animación, sin performance.now().
});
off(); // Baja idempotente; llamar al finalizar, limpiar sesión o desmontar.
viewerClock.pause("mi-motivo");
viewerClock.resume("mi-motivo");
```

Las pausas son un conjunto de motivos: `resume` solo elimina el suyo. Main usa
`visibility`/`pagehide`; el renderer no debe quitarlos. Al ocultar se cancela RAF
y se descarta acumulador/tiempo de pared; el primer RAF al volver fija la nueva
base, sin recuperar tiempo oculto. Un retraso visible admite máximo ocho ticks.
`tick`/`elapsedMs` no se reinician por sesión; usar generación y tick de spawn.
`wallTimeMs` es solo para medir FPS, nunca para duraciones del efecto. Apagar tiles
quita únicamente su suscripción; audio/movimiento/efectos siguen teniendo reloj.

**Cargador:** `src/viewer/data/fieldFxTemplates.ts` exporta
`loadEffectTemplate(name)`, `loadM12Templates()`, `validateEffectAnimation(raw,
frameCount, name)`, y los tipos `EffectTemplate`, `EffectFrame`, `ViewerAnimCmd`.
Nombres admitidos: `TallGrass`, `GroundImpactDust`, `Ripple`; otros se rechazan.
Main precarga las tres con `ViewerFieldEffects.create(grid, viewerClock)` antes de
explorar. Cachea resultados/promesas e imágenes en vuelo; un fallo se elimina de
caché y permite reintento. Valida HTTP/JSON, existencia y estructura de template,
callback/size, rutas dentro de `fieldfx/`, índices, tamaños, carga real del PNG,
packing integral y rectángulos dentro de la imagen, índices de animación, destinos
de J y ciclos de control sin frames. No ejecuta callbacks C ni animaciones affine.

`template.frames[i]` contiene `{image, url, sourceX, sourceY, width, height}`:
`i` es el índice de **frame del template**, no un offset del PNG. Usar esos
rectángulos: no deducir vertical/horizontal en el renderer. `template.anims`
contiene las secuencias fuente validadas. Comandos aceptados por el cargador:

- `["F", frameIndex, durationTicks, hFlip, vFlip]`: mantener el frame exactamente
  `durationTicks` (1–63); flips 0/1. Aplicar el primer frame al crear el nodo.
- `["J", commandIndex]`: salto a índice de **comando** de la misma animación;
  resolver sin inventar un frame/duración entre instrucciones.
- `["E"]`: animación terminada. No hay fallback por frames ausentes.

`L`, duración cero, affine, comandos desconocidos o mal formados se rechazan con
nombre y motivo. El intérprete de presentación F/E/J es trabajo de M12; no existe
uno nuevo en esta base. Las tres secuencias M12 actuales solo usan F/E. Comprobado
contra C: hierba begin 50 ticks, polvo 24, ondas 79. No copiarlas a una tabla manual.

**Eventos:** `src/viewer/fieldEffects.ts` exporta `ViewerFieldEffects`,
`FieldEffectEvent`, `FieldEffectSpawn`, `GroundActor`, `EffectPhase`. Main posee
la instancia y llama `onGroundStep("spawn" | "begin" | "finish", actor)`;
Muse no debe emitir eventos, detectar terreno ni modificar movimiento.
`effects.subscribe(listener)` devuelve baja idempotente. Formato:

```ts
// type: "spawn"
{
  id, generation, tick, template, animation, startCommand, initialExtraTicks,
  phase, direction, previousDirection, retainUntilLeave,
  position: { tileX, tileY, xPx, yPx },
  priority: { oamPriority, subpriority, domZIndex }
}
// type: "release": { id, generation }
// type: "clear":   { generation }  // generación NUEVA, invalida todo lo anterior
```

Posición: casilla en coordenadas globales; `xPx/yPx` son píxeles globales de la
esquina superior izquierda del efecto, pueden ser negativos. Para CSS dentro de
content: `left = xPx - minX * TILE`, `top = yPx - minY * TILE`; **sin zoom ni
scroll ni offsets adicionales**. Direcciones: north/south/west/east.
`generation` crece al entrar, salir o reposicionar con Explorar; no confundir con
mapa. Un cambio de mapa dentro del mismo mundo no crea otra sesión.

Hierba nace en spawn/begin sobre `IsTallGrass`, se deduplica por casilla y se
retira cuando sale tanto de current como previous coords. En spawn usa
`startCommand=4`, `initialExtraTicks=1` (`sprite.c:SeekSpriteAnim`); en begin usa
0/0. Inicializar contador del primer F con duración + initialExtraTicks;
el extra se aplica una sola vez. Tras E, conservar frame final si
`retainUntilLeave`; `release` permite retirada cuando la animación haya terminado
(si llegó antes de E, terminarla primero). Polvo solo en finish de salto sobre
suelo normal; efectos de aterrizaje en otros terrenos quedan para Codex. Ondas
en finish sobre `HasRipples`; ya no se generan al azar durante surf.

Prioridad: grass OAM 2; ripple OAM 3/subpriority 151; polvo usa 2 provisional del
avatar actual. `domZIndex` conserva 26 de la adaptación actual. **No representa
profundidad C/elevación completa**: esa tarea sigue reservada a Codex. Aplicar el
valor recibido, no fijar otra capa dentro del renderer; así la corrección futura
se hace en el productor sin rehacer M12. Offsets fuente: grass 0, dust +8,
ripple −2 en y, ya incluidos en el evento.

**Punto de integración:** sustituir el cuerpo de
`installFieldFxRenderer(effects, content, minX, minY)` en `render/fieldFx.ts`,
conservando firma y retorno `() => void`. Main ya lo instala una sola vez. Hoy
ese consumidor mantiene secuencias/tiempos visuales simplificados: **no es M12
terminada**. Crear nodos/suscripciones solo al recibir spawn; en clear quitar
nodos y bajas de TODAS las generaciones anteriores; en dispose dar de baja bus y
reloj. La carga está resuelta antes del evento: no hacen falta awaits dentro del
handler. Si se añade async, descartar resultados de una generación invalidada.
En la base C7 se mantuvo `spawnFieldFx` para sand/tire; M13 lo sustituye y elimina.

**Verificación de la base:** tipos/build/honesty/diff PASS; tabla exportada contra
C PASS (`check:fieldfx-anims`). `tools/checks/viewerClock.ts` prueba pausas por
motivos, baja, no recuperar tiempo y rechazos (timestamps **PREPARED**); ejecutar
con `./node_modules/.bin/esbuild tools/checks/viewerClock.ts --bundle --platform=node
--format=esm --outfile=/tmp/viewer-clock-check.mjs` y luego
`node /tmp/viewer-clock-check.mjs`. Job reproducible:
`PW_BASE=http://127.0.0.1:5193/ node tools/playtest/pw.mjs tools/playtest/smoke/viewer-c7.job.mjs /tmp/pw/viewer-c7`.
Carga assets reales/cache, paso con teclado sobre hierba real (posición inicial
**PREPARED** vía URL), pausa/reentrada, limpieza y reloj con tiles apagados PASS.
Fixture **PREPARED** de terreno valida ondas/polvo/seek/release/generación;
fallo HTTP **PREPARED** valida reintento. Recorrido real agua/salto, composición,
profundidad y escucha humana siguen pendientes, no se afirman validados.

**Revisión inicial de `8df8c6a3` (rama `muse/visor-m12`; R7 resuelta en `3b3acabc`):** tipos/build/diff PASS;
contrato C7 con assets reales y paso por hierba PASS. Fixtures de ticks
**PREPARED**: hierba begin 50 y spawn 11, polvo 24, ondas 79 PASS; retención tras E
PASS. **No aceptada todavía:** `release` antes de E trunca la animación.
Reproducción sobre template real: avanzar 10 ticks de TallGrass begin y llamar
`release()` elimina el nodo inmediatamente, en vez de continuar hasta tick 50.
Fuente: `field_effect_helpers.c:UpdateTallGrassFieldEffect` retira al combinar
`data[7]` (salió de current/previous) con `animEnded`, no al salir por sí solo.

**R7 cerrada por Codex en `3b3acabc`; requisitos conservados para revisión:**
1. `effectPresenter.ts:81-84`: registrar que se pidió retirada. Si la animación
   sigue activa, conservarla y seguir recibiendo ticks; no llamar `complete()`
   ni `dispose()` por `release`. Si ya terminó, retirar inmediatamente.
2. En `complete()`, retirar si no hay `retainUntilLeave` **o** si ya se pidió
   retirada; si hay retención sin petición, conservar el frame final hasta release.
   `clear`/`dispose` siguen siendo cancelación inmediata y baja idempotente.
3. `fieldFx.ts:58`: no borrar de `active` al recibir release. Dejar que `onDone`
   lo quite cuando haya terminado; borrar antes impediría seguir avanzándolo
   aunque se corrija el presenter. No tocar arena/bici, main ni productores C7.
4. Check focalizado (fixtures **PREPARED**, templates reales): release en tick 10
   conserva nodo/frames y acaba en 50; spawn seek release antes de acabar termina
   en 11; release tras E retira una vez; release repetido es idempotente;
   clear/desmontaje a mitad termina de inmediato sin nodos/suscripciones. Probar
   además por `installFieldFxRenderer`, no solo la clase aislada, para detectar
   eliminación prematura de `active`. Mantener checks normales y caminar rápido
   por varias casillas de hierba (release puede llegar antes de E).
5. Un commit propio sobre `muse/visor-m12`; no sustituir documentos por versiones
   de main: Muse partió del código `6743381e` y los contratos completos viven en
   `30308cee`/esta rama. Al integrar se conserva esa documentación del revisor.

**Archivos para Muse:** `render/fieldFx.ts` y auxiliar de presentación si hace falta;
CSS del efecto. Integración mínima con la API entregada, sin modificar movimiento.

1. Presentar TallGrass/GroundImpactDust/Ripple consumiendo frames, tamaños, orden,
   duraciones y flips de los templates; no copiar secuencias a una tabla manual.
   Resolver índices sobre la distribución real del asset, sin suponer orientación.
2. Avanzar con el reloj entregado; sustituir secuencias/tiempos simplificados de
   esas tres ramas. No crear otro requestAnimationFrame ni depender del interruptor de tiles.
3. Terminar efectos y liberar nodos/suscripciones al finalizar o invalidarse la
   sesión. Reentrada y cambio de modo no reviven efectos anteriores. Reutilizar
   prioridad/posición recibidas: no imponer z-index que sustituya la profundidad C7.
4. Comando/template no soportado: error identificable, sin éxito ficticio ni
   fallback a una secuencia aproximada. Mantener arena/bici intactas hasta M13.

**Aceptar:** comparación focalizada con datos fuente en ticks exactos, frame final
y liberación; reloj simulado **PREPARED** identificado. Después recorrido real por
hierba/agua/salto, pausa/reentrada y efectos simultáneos. No preparar los eventos
del recorrido que luego se afirma validar. Codex verifica la activación y fidelidad.

#### M13 — Variantes visuales de huellas y marcas de bicicleta [entregada por Codex]

**Entrega:** rama `codex/viewer-m13`, código `a29c9ae9`. Incluye M12
`8df8c6a3` como `df095b47` y R7 corregida en `3b3acabc`; integrado en main (2026-10-06).
R7 ahora conserva y sigue avanzando hierba liberada antes de E (50/11 ticks).

`loadViewerEffectTemplates()` carga seis plantillas; `loadEffectTemplate()` acepta
SandFootprints/DeepSandFootprints/BikeTireTracks además de las tres M12.
`GroundActor.vehicle` transporta walk/bike/surf; el productor emite animation,
previousDirection, position y `lifetime: { holdTicks: 41, endTick: 57 }` con la
misma generación de sesión. El renderer usa F/E/J y el reloj compartido; las marcas
retienen su frame tras E, parpadean desde tick 42 y se retiran en 57. Sin timers.

Variantes y duración salen de `python3 tools/viewer/track_effects.py` (`--check`
comprueba vigencia y rechazo). La tabla C usa direccionamiento contiguo u8:
previousDirection * 4 + facingDirection - 5. El evento se crea al comenzar el
paso en previousCoords y según previousMetatileBehavior, prioridades 2/149.
Los frames completos 16×16 y flips proceden de fieldfx.json. Corregido el extractor
compartido: quitaba los flips por espacios en las claves `.hFlip`/`.vFlip`.
Regeneración de objects/fieldfx determinista; solo cambiaron 48 flags 0→1.

Tipos/build/honesty/diff y `check:fieldfx-anims` PASS. Jobs
`viewer-effects.job.mjs` (terreno/reloj **PREPARED**, assets reales) y
`viewer-tracks.job.mjs` (solo posición inicial **PREPARED** vía URL; arena real,
teclas y botón de bicicleta) PASS: cuatro direcciones, 16 pares de bici,
recortes/flips, posición previa, superposición, pausa, expiración y cambio de modo.
Regresión `viewer-c7.job.mjs` PASS. IsDeepSand/IsFootprints devuelven FALSE en FR:
DeepSandFootprints se carga y comprueba como plantilla dormida, sin inventar terreno.
Profundidad/elevación y todas las animaciones del protagonista siguen pendientes.

**Contrato requerido y satisfecho en esta entrega:** correspondencia validada entre dirección anterior/
actual, tipo de huella, animación y flips fuente; evento con esos datos y política
de duración/desvanecimiento. No inferir curvas ni dirección leyendo teclas del usuario.

**Archivos:** presentación de `sand`/`tire` en `render/fieldFx.ts`; CSS si hace falta.
Consumir la variante proporcionada, dimensiones y comandos fuente; corregir el
recorte fijo que hoy muestra siempre el primer frame. Usar el reloj/lifecycle de
M12 para permanencia y retirada; eliminar timers sustituidos. No decidir qué
terrenos producen marcas, cuándo se crean ni incorporar terrenos de otro juego.

**Aceptar:** cuatro direcciones y giros permitidos, arena a pie/bici, paso repetido,
superposición, expiración y cambio de modo. Comparar variantes con fuente; fixtures
**PREPARED** para combinaciones y recorrido real por arena separados. Si la fuente
solo permite un subconjunto, documentarlo sin inventar variantes. Revisión de Codex.

**Reservado a Codex:** frames/transiciones del protagonista y flotador de surf,
saltos/aterrizaje y colisiones, sombras/reflejos y profundidad por elevación,
movimiento/visibilidad de NPC, puertas/scripts, continuidad de mapas, audio y modelo
editable. No hacer que casa/árbol reaccionen por cercanía sin comportamiento fuente.

## 5. Orden y cierre

Codex: bases C3 y C2/C7 entregadas; M13 entregada en `a29c9ae9`; seguir con profundidad C7,
C6 y exploración C1/C7 sobre el modelo, con C4/C5 según dependencias. No implementar editor como pintura
cosmética para después reconstruirlo: render, colisión y persistencia van juntos.
Muse: M1–M11 y R1–R6 cerradas e integradas. M12 aceptada con R7 (`3b3acabc`); M13
hecha por Codex (`a29c9ae9`), ambas integradas en main. Controles del editor esperan fundamentos C2/C3 y C6.
Worktrees separados; coordinar main/HTML/CSS con C1/C6 antes de nuevas entregas.

Editar no existe en ruta actual; **reconstruirlo es ahora objetivo principal C6**,
autorizado por la clarificación del usuario. No ampliar regiones ni añadir batallas
o historia en esta fase. La tarea 7.3 de jugar el FireRed completo queda para después.
Del plan anterior ya estaban resueltos contador, debounce, layouts duplicados,
distancia/dueño en una pasada, guardia de inputs, cursor sin innerHTML, extracción
CSS y módulos búsqueda/ficha/minimapa; musicName/copia de partidas también existen.
Modularización sigue parcial; sandbox del juego completo existe en motor pero su
desconexión no bloquea el sandbox creativo del viewer.

Siguiente entrega de Codex para Muse:
1. C3: geometría y restauración entregadas en `0c890154`; extracción restante y
   seguimiento de cámara pendientes.
2. C2/C7: entregado en `6743381e`: reloj, baja/pausa y loader validado para M12.
3. C7: eventos/activación/lifecycle conectados en `6743381e`; profundidad y
   elevación completas siguen abiertas; variantes M13 entregadas en `a29c9ae9`.
4. Muse M12: hierba/polvo/ondas consumen ese contrato; Codex compara ticks/secuencias
   y revisa recorrido. R7 y variantes M13 resueltas en `codex/viewer-m13`.

Entrega actual: **C2/C7 + M12/R7 + M13 en rama propia**, integrado en main; editor y profundidad aún abiertos.
Checks de integración previos sin errores de navegador: viewer, C5, Brock desde checkpoint,
PC depósito/retiro y estados de audio. Curación, ruta previa de C6, escucha humana,
MOVE ITEMS con caja vacía y animaciones completas del viewer siguen pendientes.
