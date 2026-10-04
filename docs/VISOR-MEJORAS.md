# Visor del mundo: tareas de mejora (tarea 7.6)

Plan escrito el 2026-10-03 sobre `main` (`eb3e6092`) tras auditar `viewer.html` y
`src/viewer/`. Es la continuación de [VISOR-MUNDO.md](VISOR-MUNDO.md); sus reglas (§2)
siguen vigentes. Las cifras y líneas marcadas como **pista** salen de ese commit:
compruébalas antes de usarlas y, si no cuadran, escribe
`PISTA INCORRECTA: <dice> / <datos>` (TAREAS-FINALES §0). Los números de línea
pueden haberse movido: busca por nombre de función.

## 0. Reglas para quien lo haga

- Trabaja en tu worktree y rama (TAREAS-FINALES §0). Sin merge ni push.
- **No modifiques `src/fr/`, `public/fr/` ni `tools/decomp/`.** El visor solo importa
  de `src/fr/` en modo lectura. Si una tarea lo necesita, para y avisa.
- `public/viewer/kanto.json` es generado: cambia `tools/viewer/world_index.py` y
  ejecuta `npm run viewer:index` (dos ejecuciones, mismo md5).
- Nada de textos, frames o tiempos inventados: si un dato no sale del decomp o del
  índice, no se muestra o se marca como aproximación en la UI.
- Cierre de cada bloque: `npm run build`, `npm run check:honesty`, `git diff --check`.
  `check:port` solo si tocas algo incluido en `tsconfig.port.json` (no debería).
- Un commit por bloque (A, B, C…), en inglés, imperativo, con tu `Co-Authored-By`.
  No toques `PORTING-STATUS.md`, `PENDING.md` ni `PORT-INVENTORY.md`.
- Navegador: cada bloque indica qué comprobar. Anota en la entrega lo que no pudiste
  validar.

## 1. Decisiones del usuario

Los commits `7acf157f` y `eb3e6092` añadieron los modos **Explorar** (motor de
movimiento propio) y **Editar** (pincel de tiles).

**Explorar — decidido (usuario, 2026-10-03):** se explora **dentro del visor** con
fidelidad total: movimiento, NPCs, scripts, efectos, animaciones y música del juego.
La vía es **ejecutar el motor real** (`src/fr/`) incrustado en el visor, no portar ni
reescribir su lógica dentro de `src/viewer/` (bloque E). El motor propio actual de
Explorar se elimina. El usuario autoriza los cambios mínimos en `src/fr/` que pide E
(modo sandbox y clave de guardado aparte); cualquier otro cambio en `src/fr/`, para y avisa.

Por qué el motor real y no portar al visor: el visor ya usa estado global del juego
(`TileRenderer` carga paletas con `hw/palette`), y el overworld del juego depende de
`gSprites`, paletas, tareas y el mapa cargado con sus conexiones. Reescribirlo sobre el
lienzo del mundo sería un segundo motor que nunca llega al 100 %. El motor real da el
100 % de lo que esté portado; lo que falte del port se verá también aquí, y eso es útil
para la revisión.

**Editar — pendiente:** pregunta al usuario antes de tocarlo (retirar, según
VISOR-MUNDO §1, o rehacer con E2). Hasta entonces no lo amplíes.

Los bloques A–D no dependen de E. Hazlos primero. En A–D, no inviertas en el motor
propio de Explorar (se borra en E1): solo lo imprescindible para que compile.

---

## Bloque A — Fallos y código muerto (sin cambiar diseño)

Archivo: `src/viewer/main.ts`, `viewer.html`.

| # | Tarea | Pista de ubicación | Aceptación |
|---|---|---|---|
| A1 | El botón "Capas (n/12)" no se actualiza al marcar una casilla suelta: llamar a `updateLayersBtnText` en el `change` de cada checkbox | `setupUi`, bucle `for (const layer of LAYERS)` ~L1059‑1076 | Marcar/desmarcar una capa cambia el contador |
| A2 | `setZoom` llama a `writeHash()` en cada evento de rueda (`history.replaceState`; Safari lo limita). Unificar en un `scheduleHashWrite()` con debounce de 200 ms y usarlo en zoom, scroll, drag y minimapa | `setZoom` ~L201, listener `scroll` ~L1936 | Una sola función escribe el hash; zoom continuo con rueda no lanza errores en Safari |
| A3 | Borrar código muerto: `biomeAt` (~L481), `nearestOwner` (~L556), `playerAnimFrame` (~L64), `header`/`void header` (~L679), búsqueda de `#player-btn` (~L1570), fallback `#meta` en `updateMeta` (~L449), comentario duplicado (~L1275) | — | `grep` de cada nombre devuelve 0; build verde |
| A4 | `rom.loadLayout` se pide dos veces por mapa (bucle `byPair` y bucle de dibujo). Cargar cada layout una vez y reutilizarlo | `build` ~L647‑683 | Un solo `loadLayout` por mapa |
| A5 | Aclarar paletas: `byPair` agrupa por par de tilesets para cargar paletas (VISOR-MUNDO §3), pero no se llama a `LoadMapTilesetPalettes`. Lee `src/fr/field/tileRenderer.ts` y decide: si el constructor ya usa las paletas del tileset, elimina `byPair`; si no, llama a la carga por par antes de dibujar | `build`, `tileRenderer.ts` ~L50‑80 | Explica en el commit cuál de los dos casos era; Paleta/Verde/Ruta 1 se ven igual que antes |
| A6 | `drawFill` recorre dos veces el mundo calculando la distancia a cada rectángulo (`dist` y `nearestOwner`). Fusionar en una sola pasada que calcule distancia y dueño | `drawFill` ~L521‑578 | Mismo resultado visual (captura antes/después de una zona de relleno); una sola pasada |
| A7 | El atajo `B` (bici) y `/` actúan aunque el foco esté en un `<select>` o `<input>`. Ignorar teclas si `document.activeElement` es `input`, `select` o `textarea` | listeners `keydown` ~L1670 y ~L1861 | Escribir en un control no dispara atajos |
| A8 | `#dialog-box` trae texto de relleno en el HTML ("¡Hola! La tecnología es increíble..."). Dejarlo vacío | `viewer.html` ~L620‑624 | Sin texto placeholder |
| A9 | `statusPos.innerHTML` en cada `pointermove`: cambiar a `textContent` sobre el `<code>` | ~L1894 | Sin `innerHTML` en el handler |

Navegador: capas, zoom con rueda y pellizco, URL compartible, relleno igual.

---

## Bloque B — Desacople en módulos (sin cambiar comportamiento)

Objetivo: `main.ts` (~1956 líneas, `setupUi` ~930) pasa a módulos con una
responsabilidad cada uno. **Refactor puro:** mismo comportamiento, misma URL, mismo
aspecto. Hazlo después de A para no mover código que vas a borrar.

Estructura objetivo:

```
src/viewer/
  main.ts              arranque y conexión de módulos (≤ 120 líneas)
  state.ts             estado único tipado + subscribe/emit
  constants.ts         TILE, LAYERS, LAYER_COLORS, LAYER_LABELS, GBA_FRAME_MS
  data/worldIndex.ts   fetch de kanto.json, minX/minY, elementos/activadores por mapa
  data/worldGrid.ts    clase WorldGrid: idx(gx,gy), inBounds, solid/water/ledge/grass/npc/metatile
  render/metatile.ts   composeMetatile(renderer, mt) con caché
  render/maps.ts       canvases base por mapa
  render/overlays.ts   capas superpuestas y visibilidad
  render/fill.ts       relleno de bioma
  render/tileAnim.ts   animación de tiles (bucle de paso fijo)
  ui/camera.ts         zoom, scroll, drag, rueda, hash
  ui/toolbar.ts        buscador, popovers, modos, opciones
  ui/panel.ts          ficha de casilla
  ui/minimap.ts
  ui/statusbar.ts
  explore/…            solo si el usuario mantiene Explorar (§1)
  edit/…               solo si el usuario mantiene Editar (§1)
  viewer.css           el <style> de viewer.html
```

Tareas:

- B1. `state.ts`: reunir las ~40 variables `let` globales en objetos tipados
  (`view`, `layers`, `fill`, `anim`, `explore`, `edit`). Ningún módulo exporta `let`.
- B2. `WorldGrid`: sustituir las seis rejillas sueltas y los cuatro chequeos de
  límites copiados (`isWaterTile`, `isGrassTile`, `ledgeDirection`, `isWalkable`).
- B3. `composeMetatile`: una única función para las cuatro copias de "dibujar
  `bottom` y `top`" (`drawFill`, `showAt`, `updateBrushPreview`, `tickAnimations`).
- B4. Helpers de dirección: `dirFromElement(e)` y `facingFrame(dir) → {frame, flip}`
  para las tres copias (jugador, alta de NPC, `interactWithEntity`).
- B5. Un solo `startTileAnimation()` / `stopTileAnimation()` (hoy duplicado en el
  `change` de `#anim-toggle` y en `startExploration`).
- B6. "Todas"/"Ninguna" de capas: una función `setLayers(set)`.
- B7. Mover el CSS a `src/viewer/viewer.css` (importado desde `main.ts`) y quitar los
  estilos inline de `viewer.html` (`#edit-toolbar`, labels del menú) y de TS
  (`fillCanvas.style.cssText`, `entitiesContainer`).
- B8. Ficha (`ui/panel.ts`): construir con `document.createElement`/`textContent`
  o una plantilla con escape; ningún dato del índice pasa por `innerHTML` sin escapar.

Aceptación: `main.ts` ≤ 120 líneas; ningún archivo > 400 líneas; `grep -c "^let "`
en módulos = 0 salvo estado local privado; build verde; mismo comportamiento en el
navegador (repite las comprobaciones del bloque A).

---

## Bloque C — Rendimiento

| # | Tarea | Aceptación |
|---|---|---|
| C1 | Carga en paralelo: `Promise.all` para mapas, layouts y tilesets; caché de tilesets por nombre (muchos mapas comparten `gTileset_General`) | Tiempo de arranque medido antes/después en la entrega |
| C2 | Indicador de progreso ("Cargando 12/37 mapas") sobre el viewport durante `build`; errores visibles aunque el panel esté colapsado | Se ve el progreso; un error de fetch se muestra en pantalla |
| C3 | Animación de tiles: un `TilesetAnimator` y un `TileRenderer` **por par de tilesets**, no por mapa; cada tick redibuja las celdas de todos los mapas del par | Número de animadores = número de pares animados (anótalo) |
| C4 | Caché de metatiles compuestos invalidada solo cuando `writeTiles` toca su rango (hoy se crea un canvas por metatile en cada tick, `composed` en `tickAnimations`) | Sin `document.createElement("canvas")` dentro del tick salvo al invalidar |
| C5 | Visibilidad de capas por clase CSS en `#content` (`.hide-agua { [data-layer=agua] {display:none} }`) en lugar de 12 `querySelectorAll` | `applyLayerVisibility` no recorre el DOM |
| C6 | Con zoom < 0.5 el animador no avanza y al acercar salta: seguir llamando a `animator.update()` (barato) y solo saltarse el redibujado | Sin salto visible al acercar |

---

## Bloque D — Usabilidad e interfaz

| # | Tarea | Aceptación |
|---|---|---|
| D1 | Buscador propio (sustituye al `datalist`): coincidencia por subcadena sin acentos sobre ID, título y sección; lista con ↑ ↓ Enter Esc; muestra nombre legible + ID; mensaje "Sin resultados" | "pallet", "paleta", "route 1" encuentran su mapa |
| D2 | Buscar también elementos: entrenador, flag, variable, script → centra y selecciona la casilla | Buscar un `TRAINER_*` del índice centra su casilla |
| D3 | Etiquetas legibles de capas (`LAYER_LABELS`: "Golpe roca", "NPC condicional"…) con recuento por capa | El menú no muestra identificadores con guion bajo |
| D4 | Contraste de capas: revisar pares cercanos (agua/activador, entrenador/NPC condicional); añadir patrón (rayado o borde) a las de historia | Distinguibles con un simulador de daltonismo (anota cuál usaste) |
| D5 | Zoom: indicador "200 %" clicable que vuelve a 100 %; "Ajustar al mundo"; pasos enteros (1×–4×) con botones y fraccionarios solo < 1× | Con botones el zoom siempre queda entero ≥ 1 |
| D6 | Layout con CSS grid (`auto 1fr auto`) en vez de `calc(100% - 76px)`; barra que agrupa en un menú lo que no cabe por debajo de ~1100 px | Usable a 900 px de ancho |
| D7 | Panel: no reabrirlo solo si el usuario lo cerró; redimensionable; botón "Copiar enlace" (hash con la casilla seleccionada); `aria-live="polite"` | Cerrar el panel y pinchar no lo reabre |
| D8 | Hash: añadir casilla seleccionada (`sel=x,y`) y modo; al cargar, restaurarlos | Un enlace copiado abre la misma ficha |
| D9 | Persistir ajustes (animación, relleno, bioma, minimapa, protagonista) en `localStorage` con clave `pokemon-gba-web-lab.viewer.v1` (distinta de la del juego, `src/fr/save.ts`) | Recargar conserva los ajustes; la partida del juego no cambia |
| D10 | Opciones: renombrar "Animaciones (60 FPS)" a "Animar tiles"; agrupar "Bioma de fondo" y "Relleno visual" bajo "Relleno" | — |
| D11 | Barra de estado: mapa bajo el cursor, coordenadas locales, metatile e identificador `MB_*` del comportamiento, zoom | Pasar sobre agua muestra un `MB_*` de agua |
| D12 | Minimapa: miniatura real (cada canvas base a 1/16), proporción correcta del mundo (hoy 176×130 frente a 408×400, **pista**), arrastre con Pointer Events y captura, botón de plegar | Sin listeners permanentes en `window` |
| D13 | Accesibilidad: `aria-pressed` en modos, `aria-expanded` en popovers, foco visible en todos los controles, `cursor: grabbing` al arrastrar, iconos SVG en lugar de emojis | Navegable con teclado (Tab) |
| D14 | `prefers-reduced-motion`: animación de tiles y efectos desactivados por defecto | Con la preferencia activa arranca sin animación |

---

## Bloque E — Explorar con el motor real dentro del visor

Objetivo: pulsar **Explorar** (o "Explorar aquí" en la ficha de una casilla) y jugar en
esa casilla con el juego de verdad, visto **en su sitio sobre el mapa del mundo**: la
pantalla del juego (240×160) se superpone alineada con el lienzo y el resto del mundo
queda alrededor, atenuado. Movimiento, colisiones, saltos, surf, bici, NPCs, scripts,
entrenadores, efectos de campo, animaciones y música son los del motor (`src/fr/`).

Arquitectura (**pistas**, compruébalas):
- `launchFireRed(options, container)` (`src/fr/boot.ts:30`) ya acepta un contenedor y
  monta un canvas de 240×160; el bucle va a paso fijo GBA (`FRAME_MS`, `src/fr/game.ts:112`).
- El motor usa estado global de módulo (paletas `hw/palette`, `gSprites`, tareas,
  `save`), igual que el `TileRenderer` del visor. **No pueden convivir en el mismo
  documento.** Por eso el juego corre en un `<iframe>` del mismo origen (`/?fr=sandbox`):
  realm JS separado, mismo `localStorage`.
- `window.frDebug.state()` (`boot.ts:120-123`) ya devuelve `{x, y, facing, map}` en
  coordenadas locales del mapa. Al ser mismo origen, el visor puede leerlo desde
  `iframe.contentWindow` sin tocar el motor. Para el desplazamiento sub‑casilla durante
  un paso, lee `game.overworld.player.object` (coords y offset del sprite) o la cámara
  (`overworld.ts`, sección `camera` ~L2425); documenta qué campo usaste.
- La partida vive en una sola clave, `pokemon-gba-web-lab.firered.v2`
  (`src/fr/save.ts:214`). El sandbox **no debe tocarla**.

### E1 — Retirar el motor propio de Explorar

- Borrar de `src/viewer/` todo lo de Explorar: `GFX_MAP`, `LiveEntity`/`liveEntities`,
  rejillas usadas solo por el jugador (`ledgeGrid`, `grassGrid`, `npcCollisionGrid` y lo
  que quede sin uso), `processPlayerStep`, `updatePlayerDisplay`, `spawnFieldFx`,
  `checkTrainerSight`, `interactWithEntity`, diálogo, bici, teclado del jugador.
- Borrar en `viewer.html` `#player-sprite`, `#dialog-box`, `#bike-btn`, el selector
  "Protagonista" si E3 no lo reutiliza, y el CSS de `.world-npc`, `.field-fx`,
  `.emoticon-balloon`, `#dialog-*`.
- Commit propio. Aceptación: `grep -n "playerX\|liveEntities\|spawnFieldFx" src/viewer` = 0; build verde.

### E2 — Modo sandbox en el motor (único cambio autorizado en `src/fr/`)

- `src/fr/save.ts`: `saveStore` con clave configurable; en sandbox usa
  `pokemon-gba-web-lab.firered.sandbox`. Sin sandbox, comportamiento idéntico.
- `src/fr/boot.ts`: `LaunchOptions` añade `{ mode: "sandbox"; data: SaveData }` que
  fija la clave sandbox y llama a `game.continueGame(data)`.
- `src/main.ts`: `?fr=sandbox` lee la partida preparada de `sessionStorage`
  (`fr-sandbox-save`) y lanza el modo sandbox; si falta, muestra un error claro.
- Comprobación focalizada (cambio crítico de guardado, AGENTS.md): valor de
  `pokemon-gba-web-lab.firered.v2` idéntico antes y después de jugar **y guardar**
  dentro del sandbox. Anota cómo lo comprobaste.
- `check:port`, `check:honesty`, `build`, `git diff --check`. Commit propio.

### E3 — Partidas base y preparación de la partida

- `world_index.py` copia las partidas de `tools/playtest/saves/` (24, **pista**) a
  `public/viewer/saves/` (generadas) y escribe un manifiesto: nombre, mapa, posición,
  medallas (`FLAG_BADGE01_GET`…`08`) y variables de escena activas.
- `world_index.py` añade a cada `maps[*]` lo que el visor necesita para colocar al
  jugador: `group` y `num` de `public/fr/maps.json` → `groups` (**pista**: Route3 =
  grupo 3, índice 21).
- Visor: selector "Punto de la historia" (manifiesto, ordenado por medallas) y
  "Chico/Chica" en Opciones, persistidos (D9).
- `prepareSandboxSave(base, mapId, x, y, gender)`: copia la base y fija `location`,
  `pos` (coordenadas locales **sin** el +7, **pista** VISOR-MUNDO §8.1),
  `playerGender`, mirada al sur, `questLogScenes` vacío. Si la casilla tiene colisión
  o agua, proponer la casilla transitable más cercana del mismo mapa.

### E4 — Incrustar el juego y alinearlo con el mundo

- Al entrar en Explorar: crear el `<iframe src="/?fr=sandbox">` dentro de `#content`
  (mismo sistema de coordenadas que los mapas), 240×160, `image-rendering: pixelated`,
  sin borde; quitar el `iframe` al salir (y con él todo el estado del motor).
- Cada `requestAnimationFrame` del visor: leer la posición del jugador del iframe,
  convertir `map + (x, y)` a casilla de mundo con `index.maps[map].x/y − minX/minY`,
  sumar el desplazamiento sub‑casilla y colocar el iframe para que el jugador del juego
  caiga sobre su casilla en el lienzo. Calibra el punto del jugador dentro de la
  pantalla de 240×160 midiendo en el navegador; no lo supongas.
- La cámara del visor sigue al iframe (sin escribir el hash en cada frame: A2).
- Fuera del iframe, el mundo se atenúa (capa semitransparente) y las capas de revisión
  pueden seguir visibles.
- **Interiores** (mapa que no está en `index.maps`): el iframe pasa a un panel centrado
  escalado a entero (×2/×3) y el mundo se atenúa del todo; al volver al exterior,
  se realinea.
- Minimapa y barra de estado muestran la posición del jugador del juego.
- Teclado: el foco va al iframe al entrar; `Esc` sale de Explorar (el visor lo escucha
  fuera del iframe, o el iframe lo reenvía con `postMessage`).
- Zoom del visor aplicado al iframe con `transform: scale()`; con zoom no entero el
  juego se ve irregular: en Explorar, forzar zoom entero (D5).

### E5 — Entrada desde la ficha

- Botón "Explorar aquí" en la ficha de cualquier casilla de mapa exterior: prepara la
  partida (E3), entra en Explorar (E4).
- Botón "Abrir en pestaña" con el mismo sandbox a pantalla completa (`/?fr=sandbox`).

### Aceptación de E (navegador, cada punto comprobado)

- La partida real no cambia (E2).
- En Ciudad Verde, con la partida `parcel` el anciano bloquea el norte y con `oldman`
  el camino está libre (VISOR-MUNDO §8.5).
- Chico y chica con su sprite correcto.
- Entrar en Ruta 3 desde la ficha deja al jugador en la casilla pinchada, y la pantalla
  del juego queda alineada con el lienzo (captura).
- Caminar de Paleta a Ruta 1: el iframe sigue alineado durante el paso de mapa por
  conexión; la música cambia como en el juego.
- Entrar y salir de una casa: panel de interior y realineado al salir.
- Las animaciones (agua, flores, hierba, surf, saltos) son las del motor: no hay código
  de animación del jugador ni de efectos en `src/viewer/`.
- Lo que falle por huecos del port se anota en la entrega con mapa y casilla, no se
  parchea en el visor.

### E6 — Editar (solo si el usuario decide mantenerlo, §1)

- Herramientas separadas: Pincel (clic/arrastre pinta) y Cuentagotas (`Alt`+clic o botón).
  Hoy cada clic clona y pinta a la vez (`showAt` ~L917‑948).
- Capa de pintura propia por **encima** de los mapas (hoy pinta en el canvas de relleno,
  bajo los mapas).
- Usar el `TileRenderer` del par de tilesets de donde salió el metatile (hoy siempre el
  del primer mapa: los metatiles ≥ 640 salen mal).
- Leer `customPaintedTiles` al redibujar el relleno (hoy se pierde al cambiar bioma).
- Deshacer/rehacer, borrar todo, exportar/importar JSON `{x, y, mt, pair}`.
- Arrastrar con el pincel pinta; la cámara se mueve con espacio+arrastre o botón central.
- Lo pintado **no** llega al sandbox de E (el juego carga sus propios mapas).

---

## Bloque F — Audio en modo Visor (opcional, apagado por defecto)

En Explorar la música y los efectos los produce el motor dentro del iframe (E4); no se
duplica nada en el visor. Este bloque es solo para el modo Visor, si el usuario lo pide.

- F0. Comprobar que importar `sound` en el visor no arrastra estado global del juego
  (tareas, paletas, guardado). Si lo arrastra, reproducir dentro de un iframe oculto o
  descartar el bloque, y avisar.
- F1. `world_index.py`: exportar `musicName` en `maps[*]` (`MAP_PALLET_TOWN` →
  `MUS_PALLET`, **pista**).
- F2. Botón de sonido (silenciado por defecto), `AudioContext` tras el primer gesto,
  volumen persistido (D9), pausa con `visibilitychange`, silencio al entrar en Explorar.
- F3. Música del mapa en el centro de la vista, con 500 ms de retardo tras dejar de
  mover; si la canción no cambia, no reiniciar; al cambiar, fundido como
  `FadeOutAndPlayNewMapMusic`.

---

## Orden recomendado y entrega

1. A → B → C → D (no dependen de E; no inviertas en el motor propio de Explorar).
2. E1 → E2 → E3 → E4 → E5, un commit cada uno.
3. Preguntar por Editar (§1) y hacer E6 o retirarlo.
4. F solo si el usuario lo pide.

En la entrega de cada bloque: qué se verificó (build, checks, navegador, capturas
fuera del repo), qué quedó sin validar y las `PISTA INCORRECTA` encontradas. Al
terminar todo, una línea en TAREAS-FINALES §7 en un commit aparte de estado.
