# Visor del mundo: auditoría y tareas (7.6)

Auditoría solicitada el 2026-10-03 sobre `main`, `9142b1b1`. Este documento
sustituye el plan sobre `eb3e6092`: sus tareas mezclaban cambios ya aplicados con
pendientes. Alcance original en [VISOR-MUNDO.md](VISOR-MUNDO.md);
registro de tareas en [TAREAS-FINALES §7](../TAREAS-FINALES.md).

## 1. Dictamen y verificación

**Mantener el visor: sirve para inspeccionar mapas, obstáculos y condiciones de
historia. Su exploración actual no tiene la fidelidad necesaria para revisar el
juego.** La calidad es desigual: datos con procedencia, renderer reutilizado y
módulos útiles, junto a un segundo motor simplificado y fallos de cámara/audio.

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
- Pendientes: aislamiento del guardado al jugar/guardar en sandbox, recorrido
  completo, Safari, móvil, escucha humana y comparación visual con GBA.

Conservar caché de metatiles, carga paralela de layouts, debounce del hash,
escape en fichas, contador de capas y módulos ya extraídos. TileRenderer carga
paletas en su constructor y conserva RGB por instancia; no añadir una segunda
carga global por rutina.

## 2. Hallazgos

| Prioridad | Evidencia | Consecuencia y tarea |
|---|---|---|
| Alta | main.ts: interactWithEntity/processPlayerStep/checkTrainerSight usan diálogos inventados, tiempos 100/120/160 ms, surf automático, saltos que evitan isWalkable y visión sin paredes. No ejecutan scripts/warps/combates del motor. | Explorar no valida historia. C1. |
| Alta | build añade objetos del índice a colisión/entidades sin aplicar startsHidden ni flags de partida. El índice selecciona obstáculos y condiciones, no todos los NPC. | Un índice de revisión se usa incorrectamente como estado del juego. C1. |
| Alta | Audio activado en Paleta: rom.constants ausente, backend de sound ausente, música actual 0 y transición a 300 pendiente en estado 6. init oculta el error; build no carga constantes. | El botón indica activo sin instalar reproducción. C2. |
| Alta | setZoom multiplica dimensiones por zoom y también aplica transform. A 1,25×: estilo 8.160 px, rectángulo/scroll 10.200 px; extensión prevista del mundo 8.160 px. | Doble escalado de extensión y espacios sobrantes. C3. |
| Media | tick congela mapas invisibles y zoom <0,5; invalida/compone por casilla. Audio recibe un callback por RAF con pasos, no uno por paso GBA, y depende de tiles activados. | Desincronización y reloj de audio incorrecto. C2/C4. |
| Media | parseHash ignora capas= por if(capas). Tras Ninguna, recargar sin ajustes locales vuelve a 11/12 y sobrescribe enlace. PREPARED: se eliminó solo la clave de ajustes del perfil temporal para simular destinatario. | Compartir cero capas falla; selección/modo tampoco se guardan. C3. |
| Media | Búsquedas reales paleta y route 1: cero resultados y lista oculta. Títulos PalletTown/Route1 y secciones MAPSEC_* no tienen alias ni separación de palabras. | Búsqueda incompleta y sin feedback. M1. |
| Media | Ficha retorna antes de las acciones si no hay elementos. showAt reabre panel cerrado; seleccionar puerta exterior cambia cámara inmediatamente. | Selección y navegación sorprendentes. M4/C3. |
| Media | loadStored acepta enums/booleanos sin validación; animación no se persiste. | Estado local incoherente. M2; persistencia de animación tras C4. |
| Media | A 900×700 botones estrechos parten texto y grupo de zoom se solapa. Faltan nombre accesible propio de búsqueda y estados ARIA. | Interfaz frágil con poco espacio/teclado. M3. |
| Media | Minimapa 176×130 para mundo 408×400, listeners mouse permanentes en window. | Distorsión y arrastre limitado. M5. |
| Media | Relleno usa IDs fijos, primer renderer y distancia a rectángulos. Automático (Canónico) describe una heurística; conflicts no se comunica. | Confunde decoración con terreno fuente. M3/C5. |
| Baja | Búsqueda/error de carga interpolan innerHTML sin escape; índice sin validación; main.ts tiene 1.168 líneas y estado duplicado. | Robustez/mantenibilidad. M1/C3/C5. |

Rendimiento: relleno 6.528×6.400 píxeles = **159,38 MiB** bajo representación RGBA
de 4 bytes/píxel; mapas base suman **57,61 MiB** con la misma hipótesis, sin overlays
ni cachés. Son cálculos de superficies, no consumo medido del navegador.
Se observaron 216 canvases en el DOM. Medir y fragmentar antes de prometer mejoras.

## 3. Trabajo reservado a Codex

### C1 — Exploración con motor real y guardado aislado

Iframe del mismo origen para separar globals de paletas/sprites/tareas/audio/save.
Eliminar movimiento/NPC/efectos/diálogos propios cuando la ruta real esté conectada.
No revertir commits completos: 4bf12ca1 es referencia parcial; dependía de
rom.mapNum sin cargar ROM y aceptaba base vacía si fallaba fetch.
b8b1f3c9 y 9142b1b1 reintrodujeron el motor propio.

boot.ts/save.ts ya tienen sandbox y clave aparte. Revisarlos antes de ampliar API.
Preparar copia válida de SaveData, group/num desde fuente, partida base/género,
posición local transitable y error si falta base. Preparación por lanzamiento
(sessionStorage/protocolo explícito) para evitar que dos visores pisen una base
compartida. La documentación anterior recoge autorización para cambios mínimos
de sandbox; no ampliarla a otras modificaciones del motor.

Aceptar tras comprobar clave canónica idéntica antes/después de jugar **y guardar**,
lecturas al arrancar, dos sandboxes, parcel/oldman en Verde, chico/chica, conexión,
puerta/interior/salida, alineación subcasilla, Esc y destrucción del iframe.
Los huecos del port se registran sin reemplazarlos por simulación del visor.

### C2 — Audio con inicialización válida y reloj independiente

Constantes fuente disponibles sin cargar todo el juego por rutina. Conservar
musicId junto al mapa: reactivar hoy pierde ID y llama rom.c(MUS_MAP_...), cuyo
throw no se resuelve con ??. UI activa solo al inicializar; error visible/reintento.
sound.frame por cada paso GBA, aunque tiles estén apagados; pausa al ocultar;
silenciar padre en sandbox. Validar reactivación mismo mapa, cambios de mapa/
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
parcial en inventario completo de NPC. Manifiesto de partidas/group/num desde
generador para C1. Si cambia generador: dos regeneraciones, hashes iguales; ningún
JSON generado se edita a mano.

## 4. Tareas para Muse Spark 1.3

Asignación por tamaño/acoplamiento, sin afirmar una evaluación comparativa del
modelo. **Una tarea por vez y revisión del diff antes de la siguiente.**
No encargar sandbox, save, relojes, fidelidad C ni reescritura global.

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
   aclarar decoración no jugable.
3. prefers-reduced-motion para spinner/transiciones decorativas vía CSS; no cambiar
   reloj del motor. ARIA dinámico de modos se conectará en C1.
4. Probar 900×700/1280×800, Tab, popovers/búsqueda y panel visible/colapsado; footer/
   viewport siguen utilizables con barra de dos filas.

### M4 — Acciones de ficha en casillas vacías

**Archivo:** `src/viewer/ui/panel.ts`. No modificar showAt ni crear sandbox.

1. Eliminar retorno que omite acción sin els/trs; conservar mensaje Sin elementos.
2. Crear botón al final solo con onExploreHere; listener sobre el nodo directamente,
   no getElementById global; callback una vez por clic.
3. No acción en renderBiomePanel ni inventar transitabilidad. Callback actual usa
   motor propio: este cambio no valida C1.
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

## 5. Orden y cierre

Codex C1–C3 primero (C2/C3 pueden preceder a integración final C1), luego C4/C5.
Muse M1 → M2 → M3 → M4 → M5, revisar cada entrega. Worktrees separados y
coordinar main/HTML/CSS con C1 antes de fusionar M3.

Editar no existe en ruta actual; quedan restos CSS como brush-active. No reconstruir
editor ni ampliar regiones/interiores cartográficos en esta tanda.
Del plan anterior ya estaban resueltos contador, debounce, layouts duplicados,
distancia/dueño en una pasada, guardia de inputs, cursor sin innerHTML, extracción
CSS y módulos búsqueda/ficha/minimapa; musicName/copia de partidas también existen.
Modularización sigue parcial; sandbox existe en motor pero desconectado del viewer.

Entrega actual: **auditoría y asignación**, no reparación. No se cambió código
del visor/motor. Marcar tareas terminadas solo tras cumplir aceptaciones.
