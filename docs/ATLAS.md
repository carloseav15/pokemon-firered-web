# Atlas Pokémon: índice de las herramientas de consulta

Páginas del servidor de desarrollo (`npm run dev`, puerto 5174 en esta máquina). La portada de todas es
[`atlas.html`](../atlas.html) (enlace «☰ Atlas» en cada cabecera). Ninguna ejecuta el motor del juego: leen los datos
exportados de los decomps.

| Sección | Página | Para qué | Datos que necesita |
|---|---|---|---|
| Mundo principal | `/maps.html` o `?game=world` | Kanto/Sevii FireRed, Johto HnS y Hoenn Emerald en un plano; selector de región, búsqueda, puertas y viajes de navegación | `public/map-viewer/principal/` más las fuentes principales |
| Variantes del visor común | `/maps.html?game=firered`, `emerald`, `hns` o `crystal` | Cámara, búsqueda, mundo por bloques, mapas individuales, eventos, warps e historial | `public/map-viewer/` y datos de cada fuente |
| Inspector GBA | `/viewer.html?legacy=1` (+ `&game=emerald`) | Capas técnicas, ficha por casilla, flags, writers, animación y audio | `public/viewer/kanto.json` / `hoenn.json`, `public/fr`, `public/emerald` |
| Explorar a pie | `/viewer.html#modo=explore` (+ `?game=emerald`) | Caminar con Rojo/Hoja o Bruno/Aura; pisar una puerta abre su interior | los mismos |
| Interiores | desde el buscador o `#mapa=MAP_ID` | 425 + 518 mapas con warps, objetos, eventos, carteles | `public/<juego>/maps`, `layouts`, `tilesets` |
| Pokédex comparada | `/dex.html`, `#<id de especie>`, `#n<nacional>` | Sprites y datos comunes / exclusivos por juego, más la sección «Sprites de otros juegos» (tabla de fuentes abajo). Las especies de Gen 4-9 sin datos de juego salen como fichas solo de sprites. Cada ficha de FireRed trae el panel «Animaciones de movimientos» (motor del juego en un iframe, `docs/PRUEBA-BATALLA-EN-VISOR.md`) | `public/<juego>/data`, `gfx/pokemon/*`, `public/sprites/` |
| Biblioteca visual | `/library.html` | Entrenadores con equipo, objetos con icono, gráficos de objetos de mapa | `data/trainers.json`, `gfx/trainers`, `gfx/items`, `objects.json` |
| Comparador | `/compare.html` | Diferencias campo a campo (especies, movimientos, objetos, entrenadores) | `public/<juego>/data` |
| Quests | `/quests.html` | Quests candidatas con clase, flags y variables | `public/viewer/quests_<juego>.json` |
| Johto GBA — Heart & Soul | `/maps.html?game=hns#mapa=MAP_NEW_BARK_TOWN` (`/hns.html` redirige) | Mundo conectado por bloques, mapas individuales, warps, conexiones y marcadores de eventos; adaptación HnS | `public/hns/` |
| Mapas de Crystal | `/maps.html?game=crystal#mapa=<Mapa>` (`/crystal.html` redirige) | 388 mapas de Johto/Kanto renderizados (bloques + tiles + paletas por entorno y hora, tejados por grupo), warps navegables, carteles, objetos con su sprite y orientación, escenas y conexiones | `public/crystal/` |
| Enlaces del mundo de Crystal | `/crystal-world.html?legacy=1`, `#<Mapa>` | 68 mapas exteriores conectados (Johto, Kanto, Route 28) en un solo plano con zoom, arrastre, hora del día, sprites de objetos (capa opcional), enlaces a cada ficha y las uniones por warps entre mapas (puertas, cuevas, tren, barco) | `public/crystal/world/` |
| Catálogo Gen 1-9 | `/expansion.html`, `#s/<ESPECIE>`, `#m/`, `#a/`, `#i/` | 1573 especies y formas, 956 movimientos, 320 habilidades y 874 objetos de pokeemerald-expansion; evoluciones, aprendizajes (por nivel de cualquier generación, huevo y otros) y sprites de todas las fuentes | `public/expansion/` |
| Línea argumental | `/story.html` | Escenas por capítulos en el orden oficial de rutas | `public/viewer/story_<juego>.json` |

## Regenerar datos

```bash
python3 tools/decomp/export.py                          # FireRed (public/fr, versionado)
EXPORT_GAME=emerald python3 tools/decomp/export.py      # Emerald (public/emerald, 44 MB, ignorado en git)
python3 tools/decomp/export.py graphics                 # solo sprites (espalda, iconos, huellas, retratos, objetos)
python3 tools/viewer/world_index.py                     # índice del mundo de Kanto
EXPORT_GAME=emerald python3 tools/viewer/world_index.py # índice de Hoenn
python3 tools/viewer/quest_index.py                     # quests de FireRed (y con EXPORT_GAME=emerald, de Emerald)
python3 tools/viewer/story_index.py                     # línea argumental de los dos juegos
npm run refs:fetch -- pmd-red pokeemerald-expansion pokeplatinum pokeheartgold pokecrystal pmd-sky spritecollab   # una vez
npm run crystal:maps                                    # public/crystal/ (mapas renderizados de Crystal, ~4 MB, ignorado en git)
npm run refs:fetch -- pokemon-hns                        # fuente fijada de Heart & Soul
npm run hns:maps                                       # public/hns/ (mapas 2D, ignorado en git)
npm run expansion:catalog                               # public/expansion/ (catálogo Gen 1-9; requiere clang y refs:fetch de pokeemerald-expansion)
npm run crystal:world                                   # public/crystal/world/ (mapa del mundo; requiere crystal:maps)
npm run maps:images                                    # imágenes/mips del visor común; exige las cuatro fuentes anteriores
npm run maps:principal                                 # componer mundo principal después de preparar imágenes
# Una sola fuente: npm run maps:images -- firered | emerald | hns | crystal
npm run sprites:spritecollab                             # tras sprites:sources: enlace public/sprites/sc, JSON por especie y nombres de acción
npm run sprites:sources                                 # public/sprites/ (~90 MB, ignorado en git); admite una fuente: pmd-red | pmd-sky | emerald-expansion | crystal | platinum | heartgold
```

## Fuentes de sprites del dex

| Fuente (id) | Qué aporta | Cobertura | Herramienta |
|---|---|---|---|
| `pmd-red` | Sprites de mazmorra con animaciones y 8 direcciones (poses OAM de `src/data/ax`) | Gen 1-3 (387) | `sprite_sources.py` |
| `pmd-sky` | Sprites de mazmorra (`monster.bin`, WAN) y retratos con emociones (`kaomado.kao`) | Gen 1-4 (493) | `pmd_sky_wan.py`, `pmd_sky_kao.py` |
| `emerald-expansion` | Frente animado, espalda, icono, huella, overworld, variocolor y estilo GBA | Gen 1-9 (1025) | `sprite_sources.py` |
| `crystal` | Frente con la animación de `anim.asm`, espalda y variocolor | Gen 1-2 (251) | `sprite_sources.py` |
| `platinum` | Frente y espalda (macho/hembra), variocolor, icono, huella, overworld | Gen 1-4 (493) | `sprite_sources.py` |
| `heartgold` | Frente y espalda (macho/hembra), variocolor, icono | Gen 1-4 (493) | `sprite_sources.py` |
| `heartgold-follower` | Pokémon que te sigue: 4 direcciones x 2 pasos, normal y variocolor (hembra y formas incluidas) | Gen 1-4 (493, 566 variantes) | `sprite_sources.py` + `nsbtx.py` |
| `spritecollab` | Sprites animados (35+ acciones, 8 direcciones) y retratos con todas las emociones, formas, variocolor y género | Gen 1-9 (985 con sprites; 1025 con retratos) | `spritecollab.py` |

Notas: en HeartGold la paleta normal sale de `front.png` y la variocolor de `back.png` (`pokegra.mk`). Los retratos de PMD Red no
se extraen porque en pmd-red son `incbin` de `baserom.gba` (solo 73 especies); haría falta una ROM propia en el equipo.

### Procedencia

Cada fuente declara un origen que el dex muestra como insignia: **Oficial · extraído del juego** (decomps de pret), **Proyecto comunitario**
(pokeemerald-expansion) y **Comunidad · arte de fans** (SpriteCollab, CC BY-NC 4.0, con los autores de cada variante junto al reproductor).

## Comprobaciones

```bash
npm run check:common-map-data # cobertura, geometría y assets preparados del visor común
npm run check:hns-maps       # 5 mapas contra PNG/paletas/bloques fuente; requiere datos y fuente HnS
npm run check:warps          # grafo de warps y conexiones (los dos juegos)
npm run check:compare-data   # el comparador coincide con una segunda implementación en Python
npm run check:all            # todas
python3 tools/emeraldCoreGap.py   # qué falta para compilar src/core contra Emerald
```

Trabajo de verificación pasada: los 943 mapas se abren y se pintan (`tools/playtest/smoke/interiors.job.mjs`).

## Lo que estas herramientas NO son

- No validan comportamiento: comparan datos con datos del mismo decomp, no con la ROM.
- Las etiquetas de quests (`tools/viewer/quest_tags.json`) y el orden de los capítulos (`SPINE` en
  `tools/viewer/story_index.py`) son criterio editorial, no un análisis de bloqueos reales.
- Emerald no es jugable: existe como datos y en el visor.

## Límites del visor de Crystal

- Hora del día: los mapas con `PALETTE_AUTO` (83) se pueden ver de mañana, día y noche; el resto tiene hora fija (`PALETTE_DAY`,
  `NITE`, `DARK`). Las paletas salen de `environment_colors.asm` y `LoadSpecialMapPalette` (casas, mansión, Ice Path, torre de radio,
  Battle Tower y PokéCom). Sin animación de tiles (agua, flores). Los objetos se dibujan estáticos (orientación según `SPRITEMOVEDATA_*`,
  paleta `PAL_NPC_*` o la del sprite) con un desplazamiento vertical de -4 px que es una convención del motor, no verificada aquí;
  los Pokémon de mapa (`SPRITE_POKEMON`, 0x80+) solo salen como marcador.
- Coordenadas de eventos en pasos de 16 px (2×2 tiles); los warps salen tal cual del `.asm`.
- Mundo: las conexiones del decomp unen Johto (31 mapas), Kanto (35) y Route 28 + Silver Cave (2); el juego los une con warps,
  así que la colocación entre secciones es editorial. Dos solapes de un bloque (Route 13/14 y Viridian/Route 1) vienen de las
  conexiones del propio decomp y quedan listados en `world.json`. Las ~320 salas interiores no entran en el mundo.
- Enlaces por warps: componentes de salas interiores unidas por warps; cada puerta de un mapa exterior que entra en ellas es una salida
  y dos salidas de mapas distintos forman un enlace (`via` = camino más corto). Las salas con un warp de destino -1 (Pokécenter 2F,
  ascensores) vuelven a la última puerta usada y no se atraviesan; FastShip1F es la excepción deliberada (Olivine ⇄ Vermilion).

## Retratos de PMD Sky

- Origen: `files/FONT/kaomado.kao` (tabla de 1155 filas × 40 casillas; casilla par = emoción, impar = volteada y vacía), `BALANCE/monster.md`
  (palabra u16 0 de cada entrada de 68 bytes = número nacional) y `MESSAGE/text_e.str` (cadena 8734 + fila = nombre).
  El lector está en `tools/viewer/pmd_sky_kao.py`; la descompresión AT4PX sigue `DecompressAT` de pmd-red.
- Cobertura: 648 retratos para las 493 especies; las filas ≥ 600 son variantes de género y las 555/560 variantes de Wigglytuff.
  Se omiten 4 filas con número nacional falso (Statue, Mama, Sentret y Bellossom del gremio).
- Las emociones sin retrato (p. ej. Special0 en Pikachu) no se muestran. No se exportan las casillas volteadas.

## Sprites de monstruos de PMD Sky

- Origen: `files/MONSTER/monster.bin` (pack de 599 PKDPX con WAN dentro de SIR0). Lector en `tools/viewer/pmd_sky_wan.py`; el formato
  está resumido en su docstring (piezas OAM de 10 bytes, imágenes como tiras con ceros, fotogramas de 12 bytes de `wan.h` de pmd-sky).
- Índice de sprite por fila: palabra u16 8 de cada entrada de `monster.md`. Las filas ≥ 600 (hembras) tienen su propio índice; si
  comparte sprite con la fila base no se repite. Cubre 493 especies con 597 sprites distintos.
- Se muestran igual que los de PMD Red: 8 direcciones y animaciones numeradas (sin nombres verificados) a 1/60 s.
- Paleta: solo la 0 (ningún sprite usa piezas con otra). No incluye `m_ground.bin` (sprites de suelo) ni `m_attack.bin`.

## Catálogo de pokeemerald-expansion

- `tools/viewer/expansion_catalog.py` pasa `clang -E` sobre `species_info.h`, `moves_info.h`, `abilities.h`, `items.h` y los learnsets, de modo que
  los `#if P_*` y los `P_UPDATED_* >= GEN_n` quedan resueltos con la **configuración por defecto** del repo (`GEN_LATEST = GEN_9`; en el repo
  `GEN_1 = 0 … GEN_9 = 8`). Falla si queda alguna macro sin definir en un `#if` (con `-Wundef`), en vez de tomarla como 0.
- No es la fuente de verdad de ningún juego: son los valores del proyecto, no los de una generación concreta (`species.json` lleva `_meta.config`).
- Learnsets por nivel: cada `gen_N.h` es un conjunto completo por generación y el motor incluye solo el de `P_LVL_UP_LEARNSETS` (Gen 9);
  la ficha deja elegir cualquiera de las nueve. «Otros» = `all_learnables.json` menos nivel y huevo (MT, tutor y similares).
- No incluye: formas de cambio (`form_change_tables`), compatibilidades de MT por separado, mapas ni encuentros.

## Johto GBA de Heart & Soul

`dfe3926b` añade `/hns.html`, accesible desde el Atlas y el selector de regiones del visor GBA.
Fuente fijada: `PokemonHnS-Development/pokemonHnS`, commit `751823abaf677020bcd72c45fe3e7cb2b8a576e4`.
Es una adaptación de Johto/Kanto basada en Modern Emerald, no los mapas oficiales de HGSS.
El exportador reutiliza el lector de tilesets con salida aislada y conserva atributos u16 originales;
compone imágenes con el perfil HnS 640 tiles/metatiles y 7 paletas primarias. Fuente y créditos
se conservan en `public/hns/SOURCE-README.md` y en la ficha `_meta` de `maps.json`.

La fuente tiene 956 archivos de mapa y 955 IDs únicos: el duplicado `MAP_ROCKET_HIDEOUT_B1F`
se resuelve con la carpeta que coincide con su nombre de mapa, registrándolo en `_meta.duplicateMapIds`.
El catálogo conserva todos los IDs: 584 mapas tienen imagen (541 layouts); 371 mapas no se renderizan
(303 layouts rechazados, en gran parte heredados con índices anteriores). El filtro «Toda la fuente»
muestra estos últimos con su motivo, sin imágenes aproximadas. El mundo contiene 77 mapas conectados,
76 renderizados y Route 7 marcada como no disponible porque usa el metatile 902, fuera de su tileset.
Las 14 discrepancias de conexiones y las variantes superpuestas se conservan y se registran.

El mundo usa 102 bloques PNG de hasta 1024 px, cargados por proximidad a la cámara, y una vista reducida
al alejarse. No crea un canvas del mundo completo en el navegador. Las puertas y conexiones abren
fichas de mapas, con historial de regreso. Los objetos/eventos son marcadores: sin sprites de NPC,
animación de tiles, ciclo horario, audio, scripts ni exploración jugable de HnS.

Verificación: `check:hns-maps` contrasta 48.640 píxeles de New Bark, Goldenrod, Ecruteak,
Union Cave 1F y el laboratorio de Elm contra los PNG/paletas/metatiles fuente; 829 archivos idénticos
entre dos exportaciones; lector FireRed conserva sus 69 archivos de tilesets. Tipos y build pasan.
El visor HnS independiente fue sustituido por el visor común en `79ec8960`: navegación por puertas,
historial, zoom/arrastre, fuente no disponible y captura a 390 px comprobados en Chromium. Quedan
comparación con ROM, gestos táctiles/dispositivos reales, conexiones y variantes. Estos checks no validan historia ni comportamiento.

## Visor común y rendimiento

`79ec8960` conecta FireRed, Emerald, HnS y Crystal en `maps.html`. `src/map-viewer/types.ts`
define el contrato en píxeles; los lectores de `sources.ts` mantienen el paso de evento de 16 px
(GBA: metatiles de 16 px; Crystal: bloques de 32 px y warps de 16 px). Crystal conserva paletas y
capas de sprites por hora. Las fichas GBA se descargan al abrir el mapa; los catálogos HnS/Crystal
ya contienen sus eventos. Se muestran hasta 100 filas de búsqueda, ampliables con «Mostrar más».

`TexturePool` conserva como máximo 96 MiB **estimados** de RGBA de sus imágenes, con expulsión LRU
antes de añadir recursos y limpieza al cambiar de fuente. No mide ni limita las cachés internas
ni la memoria total del navegador/GPU. El mundo carga bloques próximos a la cámara y usa mips de
hasta 2048 px al alejarse (umbral según resolución) o cuando las capas superarían el presupuesto.
No hay reloj de simulación ni bucle continuo en Visor; los cambios programan una actualización.
Se cancela la descarga de una ficha al cambiar de mapa/fuente; se restaura cámara/zoom al volver.

Los PNG GBA salen de los exports existentes, con perfiles FireRed 640/7 y Emerald 512/6, paletas
estáticas y slots BG reservados negros como en `TileRenderer.reloadPalettes`. No se modifica
`public/fr` ni `public/emerald`. `map_images.py` comparte la composición con HnS, cuyo perfil y
rechazos se conservan. Las capas de sprites muestran templates; clones y gráficos dinámicos sin
resolución quedan registrados en `_meta.unresolvedObjects`, sin inventar sprites. La capa de
colisión muestra bits de bloque, no toda la transitabilidad de una partida.

Las rutas antiguas conservan los enlaces de mapa y redirigen a la consulta común. Se retiraron
`src/hns/maps.ts` y `src/compare/crystalMain.ts`; el inspector GBA y el grafo de enlaces Crystal
se conservan porque aportan herramientas adicionales. Los jobs anteriores especifican `legacy=1`.
Explorar se ofrece solo para el mundo/exteriores de FireRed y Emerald: entra en el mapa elegido y
el menú de Kanto permite regresar al mismo punto del atlas. Kanto continental usa mapas próximos
(véase abajo); Hoenn y el inspector técnico conservan carga global. Johto sigue estático. No es un
port jugable de Emerald, HnS o Crystal.

Medición local antes/después: Chromium headless, Vite ya en ejecución, 1280×800, caché de red
desactivada, una muestra por fuente. «Listo» significa imágenes de la vista cargadas; tiempos
orientativos, no benchmark de producción. Buffers anteriores = suma RGBA de canvases; nuevos =
imágenes conectadas, sin incluir cachés del navegador. Las muestras posteriores tienen 0–1
callbacks RAF en dos segundos de reposo (una actualización pendiente puede entrar en esa ventana).

| Fuente | Antes: listo (ms) | Común: listo (ms) | Gráficos antes (MiB estimados) | Común: imágenes visibles (MiB estimados) |
|---|---:|---:|---:|---:|
| FireRed | 2219 | 185 | 501,1 | 32 |
| Emerald | 2265 | 65 | 1064,8 | 16 |
| HnS | 119 | 81 | 16,0 | 16 |
| Crystal mundo | 68 | 71 | 125,6 | 16 |

Verificación focalizada: `check:common-map-data` contrasta 943 mapas GBA, sus posiciones y 2984
referencias de imagen; 2530 archivos preparados regeneran idénticos; el renderer compartido
conserva los 829 archivos HnS. `maps-raster.job.mjs` compara 42.240 píxeles de seis mapas con el
`TileRenderer` anterior (selección de mapas por sonda declarada PREPARED; se excluyen su tinte de
colisión y píxeles transparentes). `check:hns-maps` conserva su contraste independiente con PNG fuente.

Jobs del harness existente (resultados locales en `.decomp-build`, capturas en `output/playwright`):

```bash
PW_BASE=http://localhost:5174/ node tools/playtest/pw.mjs tools/playtest/smoke/common-maps.job.mjs output/playwright/common-maps
PW_BASE=http://localhost:5174/ node tools/playtest/pw.mjs tools/playtest/smoke/maps-explore.job.mjs output/playwright/maps-explore
PW_BASE=http://localhost:5174/ node tools/playtest/pw.mjs tools/playtest/smoke/maps-cache.job.mjs .decomp-build/maps-cache
PW_BASE=http://localhost:5174/ node tools/playtest/pw.mjs tools/playtest/smoke/maps-raster.job.mjs .decomp-build/maps-raster
MAPS_COMMON=1 PW_BASE=http://localhost:5174/ node tools/playtest/pw.mjs tools/playtest/smoke/maps-performance.job.mjs .decomp-build/maps-performance-after
```

Los recorridos verifican búsqueda, cambio de fuente, puertas, historial, zoom/arrastre, noche de
Crystal, Route 7 no disponible, captura móvil sin desbordamiento, entrada/salida de Explorar y
compatibilidad de enlaces. El stress de caché pasó en las cuatro fuentes; la prueba de carrera
usa un retraso de red de 150 ms declarado PREPARED, sin preparar estado del juego. La consulta no
solicita módulos de `src/core` ni `src/games`. También pasó el job existente de huellas/bici y
limpieza al salir. Pendientes: revisión completa de todos los mapas/sprites, gestos táctiles reales,
producción, paridad con ROM, extender los sectores de Kanto a Hoenn/Johto y traslado de más herramientas técnicas al visor común.


## Navegación inmersiva de Kanto

Entrega `e1702ffe`. `/viewer.html#modo=explore&mapa=MAP_PALLET_TOWN` inicia la ruta de Kanto continental.
El viewport ocupa la página; Esc abre un menú modal que pausa el reloj fijo GBA, con formato
16:9 opcional sin deformación, escalas enteras 1–4×, minimapa de consulta y métricas opcionales.
La entrada desde el atlas conserva en la sesión su selección/cámara para volver a ella. El
inspector `?legacy=1` conserva sus capas técnicas; entrar en Explorar recarga la ruta por sectores.

La unidad de carga es **un mapa completo**, no una tesela ni un bloque fijo: se cargan los que
intersectan la cámara más 20 casillas de margen, protegiendo el mapa del personaje. Un cargador
serial prioriza el centro, cede al navegador entre mapas/filas y descarta cargas que ya no se
necesitan. Los canvas, renderizadores y colisiones lejanos se liberan; un caché ROM privado por
mapa evita retenerlos en el caché compartido del motor. Los objetos mantienen su estado ligero
independientemente de los sprites visibles. Las zonas sin datos permanecen bloqueadas. Los
fallos de recursos se muestran y los reintentos esperan al menos un segundo entre solicitudes.
No existe una cota global de RAM: la cota es espacial y depende de viewport, escala y tamaños de mapa.

Se elimina el lienzo de relleno global de Explorar Kanto. Un canvas del tamaño de la cámara más
una casilla repite el borde exportado del mapa actual, anclado a su origen local, siguiendo
`GetBorderBlockAt` de `fieldmap.c`; los mapas conectados se dibujan encima. El borde visual no
crea superficies transitables. Las animaciones existentes reutilizan la composición de cada
metatile una vez por actualización, conservando el reloj fijo y las duraciones previas del visor.
Esto no acredita fidelidad C de todas las animaciones ni introduce nuevas familias.

Verificación local: Chromium headless, Vite, viewport 1280×720; entrada por URL declarada
PREPARED, terreno exportado y teclado real. `viewer-navigation.job.mjs` hace 62 pasos desde
Pallet hasta el extremo norte de Ruta 1 y regresa; observa colisión, 44 efectos TallGrass,
expulsión/reentrada de mapas, pausa/reanudación, 16:9, retorno al atlas y captura 390×844 sin
desbordamiento. Compara 256 píxeles de un metatile de borde con su fuente. Los checks de sectores
usan grids/promesas/reloj PREPARED para memoria dispersa, carga tardía, cierre y reintento;
`viewerClock.ts` comprueba pausas/cancelación del reloj. Tipos, honestidad, build y diff pasan.

En la muestra inicial de `e1702ffe`, las diez ventanas del recorrido dieron ~60 FPS, p95 16,7–16,8 ms y máximo
16,8 ms; la primera ventana de arranque dio ~48 FPS y máximo 66,6 ms. Esa ventana incluía la
capa de carga residual, corregida en la revisión de arranque descrita abajo.
Son intervalos RAF, no presentación GPU ni garantía en dispositivos. En Pallet se retienen tres
mapas: canvas de mapas 2.703.360 bytes + colisiones 23.760 + borde de cámara 1.007.616 =
3.734.736 bytes (~3,56 MiB) estimados. Durante la ida se observaron tres/cuatro mapas y hasta
5.718.096 bytes (~5,45 MiB). El inspector global conserva 37 mapas y sus canvas suman
525.336.576 bytes (~501 MiB), incluidos 167.116.800 del relleno. Esta comparación es de buffers
observados en una escena, no de memoria total: excluye tilesets, sprites, objetos JS y cachés
GPU/navegador. No hay comparación de FPS antes/después.

```bash
node_modules/.bin/esbuild tools/checks/viewerSectors.ts --bundle --platform=node --format=esm --outfile=.decomp-build/checks/viewerSectors.mjs
node .decomp-build/checks/viewerSectors.mjs
PW_BASE=http://127.0.0.1:5173/ node tools/playtest/pw.mjs tools/playtest/smoke/viewer-navigation.job.mjs output/playwright/navigation
```

Pendientes: medición de arranque en producción/dispositivos, recorrido exhaustivo de Kanto, resto de animaciones y más casos de bici/surf/salientes,
interiores con control/llegadas reales, audio, comparación ROM, entrada táctil/dispositivos reales
y producción. Las puertas siguen abriendo el visor de interiores, los diálogos/NPC mantienen
la simulación adaptada y no se ejecutan historia/combates. Hoenn conserva su ruta global y Johto
solo consulta; la conexión entre regiones y la integración del juego completo son fases posteriores.

### Arranque y movimiento revisados

Entrega `e32a8a02`. La clase `hidden` de la capa de carga no tenía una regla CSS y el overlay
seguía cubriendo el juego, interceptando punteros y aplicando blur hasta retirarse 400 ms después.
Ahora desaparece al alcanzar `viewer-interactive`, con los mapas, el avatar y las hojas de sus
modos y NPC inmediatamente visibles preparados. El layout inmersivo se aplica antes de elegir
sectores; metadatos y tilesets independientes cargan en paralelo. Una imagen fallida conserva
un mensaje visible y un botón de reintento; se comprobó con HTTP 503 PREPARED y recursos reales al recargar.

`planStep` consulta el saliente en el destino adyacente, como `CheckForPlayerAvatarCollision` /
`ShouldJumpLedge` de `field_player_avatar.c`; comprueba el aterrizaje y bloquea el sentido inverso.
El salto usa `sJumpY_High` de cdata y 32 ticks de `DoJumpSpriteMovement` (distancia FAR), sin copiar
una curva a mano. El vehículo cambia únicamente al aceptar el paso, por lo que un bloqueo no
monta/desmonta surf. Recargar en agua elige surf; una URL que apunta a un muro busca una casilla
transitable. La velocidad/hoja de correr se fija durante el paso y B no cambia el vehículo en vuelo.
En esa entrega los pasos ordinarios conservaban 10/8/6 ticks para caminar/correr/bici;
la revisión del avatar descrita abajo los alinea con las tablas C. Esto es revisión del adaptador de navegación, no portado de nuevos cuerpos C.

Comprobación: `viewerMovement.ts` usa geometría PREPARED para aterrizajes ocupados/sólidos,
cambios de surf bloqueados y sectores ausentes. El harness existente `eventObjectAnims.ts` pasa
136.860 comparaciones de datos/límites y 137 casos C extraídos. El job de movimiento elige
posiciones del terreno real de Pallet/Ruta 1 y pulsa teclas: caminar, correr (incluida liberación
temprana), bici (B en movimiento), salto/curva/32 ticks y bloqueo inverso, surf/retorno y recarga
en agua. Una entrada PREPARED al árbol de (0,0) se reubica a terreno válido. No altera mapas ni flags.
Capturas de salto en el aire y regreso de surf inspeccionadas. La regresión de 62 pasos hasta
el norte de Ruta 1 y vuelta sigue pasando, ~60 FPS y p95 16,7–16,8 ms.

Tres muestras con caché HTTP desactivada y Vite local dieron ~59 FPS en los primeros 60 intervalos
del arranque preparado, con un máximo de 33,3 ms; la instrumentación visible dio ~58 FPS en su
primera ventana y ~60 durante el recorrido. La observación previa (~53–55 FPS) incluía el overlay
borroso y no representaba juego interactivo. Los tiempos de carga varían por módulos/cachés;
no se afirma una reducción uniforme de descarga ni una garantía en hardware real. Reloj y medidas
RAF conservan sus límites: no miden presentación GPU, audio percibido ni paridad ROM.

```bash
node_modules/.bin/esbuild tools/checks/viewerMovement.ts --bundle --platform=node --format=esm --outfile=.decomp-build/checks/viewerMovement.mjs
node .decomp-build/checks/viewerMovement.mjs
PW_BASE=http://127.0.0.1:5173/ node tools/playtest/pw.mjs tools/playtest/smoke/viewer-startup.job.mjs output/playwright/startup
PW_BASE=http://127.0.0.1:5173/ node tools/playtest/pw.mjs tools/playtest/smoke/viewer-movement.job.mjs output/playwright/movement
```

Siguen pendientes interiores controlables/llegadas, persistencia de sesión completa, revisión de
todos los mapas, elevaciones/puentes, animaciones y efectos completos (incluido surf), dispositivos,
producción y ROM. Surf sigue siendo automático sin requisitos MO/historia; NPC/diálogos conservan la adaptación del visor; las cadencias base se revisan abajo. Hoenn/Johto no se acreditan con estas pruebas.

### Avatar de Kanto: fotogramas y cadencias

Entrega `c7a2fca7`. `render/avatar.ts` lee las seis definiciones de Rojo/Hoja (normal, bici y surf)
de `/fr/objects.json`: tablas de comandos, lista lógica de frames, hoja física, índice, tamaño y
flips. Reutiliza `Sprite` de `src/core/gba/sprite.ts`; la ruta activa de Kanto ya no usa los índices
manuales por paso. Las hojas se precargan/decodifican y se comprueban sus límites; el menú permite
cambiar entre Rojo y Hoja. Hoenn mantiene su adaptador anterior y no se acredita con estas pruebas.

La carrera era incorrecta: `sAnim_Run*` referencia frames lógicos 9–17 de la definición NORMAL,
que a su vez apuntan a los frames físicos 3–11 de SurfRun. La selección anterior confundía esos
índices. Caminar y pedalear ahora incluyen sus frames neutrales y alternan los pies con
`sStepAnimTables` / `SetStepAnimHandleAlternation`, conservando la pausa en el sitio. La colisión a pie usa WalkInPlaceSlow y avanza
su animación cada dos ticks; el giro usa WalkInPlaceFast y la colisión en bici, WalkInPlaceNormal.

| Acción base | Tiempo de movimiento | Tabla/ruta de origen |
|---|---|---|
| Caminar | 16 ticks por casilla | `PlayerWalkNormal`, `sSpeedNormalStepFuncs`, `sAnim_Go*` |
| Correr | 8 ticks por casilla | `StartRunningAnim`, `sSpeedFast1StepFuncs`, `sAnim_Run*` |
| Bicicleta en terreno normal | 6 ticks por casilla | `BikeTransition_MoveDirection` → `PlayerRideWaterCurrent`, `sSpeedFast2StepFuncs`, `sAnim_GoFast*` |
| Surf ya montado | 8 ticks por casilla | `PlayerWalkFast`, `sAnim_SurfFace*` |
| Giro a pie/surf | 8 ticks en el sitio | `PlayerTurnInPlace`, `WalkInPlaceFast` |
| Colisión a pie / bici | 32 / 16 ticks en el sitio | `PlayerNotOnBikeCollide` / `PlayerOnBikeCollide` |
| Saliente / montar-desmontar surf | 32 ticks | `DoJumpSpriteMovement` FAR / `DoJumpSpecialSpriteMovement` NORMAL; `sJumpY_High` |

El desplazamiento por tick también sale de las tablas Step1/Step2/Step3, incluida la bici con
pasos no uniformes. Los giros cortos no desplazan al personaje y una colisión no lo empuja dentro
del obstáculo. Montar/desmontar conserva la pose de surf durante el salto y cambia a la hoja de
caminar al aterrizar. Las teclas del visor, Surf automático y ausencia de requisitos MO/historia
siguen siendo adaptaciones; esto no conecta las tareas/scripts originales completos.

Verificación: `viewerAvatar.ts` contrasta 72 selecciones (dos personajes, cuatro direcciones,
nueve acciones) y 4.608 muestras, incluidos progreso de comandos/delays, todos sus frames,
espejados, pausa y alternancia de pies. Pasan el check de animación de sprites y el harness
existente de event_object_movement. `viewer-avatar.job.mjs` usa terreno real y teclado para
32 combinaciones de locomoción, cuatro colisiones a pie/bici y dos saltos reales de Ruta 1.
Compara hojas físicas/posiciones CSS/flips con el exportado; las capturas congelan temporalmente
el reloj con PREPARED para inspeccionar un frame ya observado, sin preparar terreno ni progreso.
Se inspeccionaron las 32 capturas y los saltos. Entrada/salida/recarga de surf y la regresión de
62 pasos Pallet→Ruta 1 y vuelta pasan; recorrido ~60 FPS, p95 hasta 16,8 ms en Chromium local.
Arranque/reintento siguen pasando (~59 FPS en las muestras iniciales); no es garantía GPU/dispositivo.

```bash
node_modules/.bin/esbuild tools/checks/viewerAvatar.ts --bundle --platform=node --format=esm --outfile=.decomp-build/checks/viewerAvatar.mjs
node .decomp-build/checks/viewerAvatar.mjs
PW_BASE=http://127.0.0.1:5173/ PW_TIMEOUT_MS=180000 node tools/playtest/pw.mjs tools/playtest/smoke/viewer-avatar.job.mjs output/playwright/avatar-review
```

Soporte de surf (entrega aa4279a8): `render/surf.ts` conecta SurfBlob desde fieldfx.json
con el intérprete Sprite compartido. La geometría visible viene del OAM (32×32); los
argumentos 2×8 de overworld_frame reservan la misma cantidad de bytes, no definen el recorte PNG.
Usa las cuatro animaciones originales, incluidos los espejados, y el desplazamiento de un píxel
del jinete según animCmdIndex de CreateBobbingEffect. La dirección vertical del soporte empieza
en cero en FireRed y permanece cero; no se añade una oscilación sinusoidal. El reloj común pausa
el efecto y el menú; al salir a tierra o abandonar Explorar se oculta. En reposo solo actualiza
el soporte y la posición del jinete, sin recalcular sectores/cámara.

Revisión focal: tablas C, Sprite, tipos, honesty y build PASS. El job de avatar conserva las
32 combinaciones y añade ocho comprobaciones Rojo/Hoja×dirección con los dos fotogramas,
el desplazamiento relativo y pausa; capturas sur/surfeando al este inspeccionadas. Movimiento
con teclado confirma entrada, recarga y retirada al desembarcar. Hierba/huellas pasan el harness
PREPARED existente (terreno y RAF sintéticos, recursos reales). Regresión real de 62 pasos:
~59–60 FPS, p95 ≤16,8 ms; hubo una tarea de 54 ms y una muestra con intervalo máximo de 33,3 ms.
Estas medidas locales no garantizan 60 FPS constantes ni rendimiento en todos los dispositivos.

Entrega 2778bf87: soporte durante entrada/salida de surf según UseSurfEffect_4/5 y
Task_StopSurfingInit/WaitStopSurfing. Al subir espera en el destino acuático; al bajar permanece
en el origen, sin copiar el arco ni el balanceo al personaje hasta aterrizar. InitJumpRegular y
UpdateShadowFieldEffect aportan sombra de salto con tamaño del avatar y desplazamiento de
la tabla gShadowVerticalOffsets exportada, excluyendo hierba de destino, agua/reflejo actual o
anterior. InitJump desactiva la cobertura del personaje en vuelo; se retira el recorte de hierba
mientras salta. Los recursos mantienen la profundidad DOM del visor, pendiente de paridad por
elevación y metatile.

Tipos, honesty, build, tablas C/Sprite y harness PREPARED de hierba/huellas pasan. El driver de
movimiento usa terreno y teclado reales para Rojo y Hoja, con unas 30 observaciones por salto
que comprueban soporte fijo, sombra y ausencia de recorte; las capturas de salto/orilla se
inspeccionaron. PREPARED solo selecciona la posición inicial, sin fabricar terreno ni resultados.
La regresión posterior de 62 pasos pasa con muestras ~60 FPS y p95 ≤16,8 ms (arranque ~58 FPS);
no cambia los límites de la medición local. Reflejos, cobertura de terreno en suelo, profundidad con elevaciones/puentes, validación de las
ramas de supresión de sombra y recorrido exhaustivo siguen pendientes; no cierra los efectos.

Reflejos del avatar (ce2f4708): scan de las dos filas bajo las coordenadas actual y
anterior, en el orden de ObjectEventCheckForReflectiveSurface; fotograma y espejado del avatar,
PNG con paleta de reflejo exportada y desplazamiento height−2 con y2 invertido. La deformación
usa sAffineAnims_ReflectionDistortion desde cdata y el intérprete affine de sprite.c, inicializando
las tablas trigonométricas originales. Las dos matrices avanzan con el reloj común, también sin
reflejo visible; el menú/visibilidad pausan el reloj y se liberan las matrices al abandonar la página.

El visor conserva el mapa aplanado: una máscara de casillas reflectantes adapta la prioridad BG
para impedir que el reflejo pinte tierra. No sustituye el compositor GBA por capas/elevaciones.
GetBridgeType es false en FireRed; la rama de hielo tiene traducción estática, sin recorrido real
en esta entrega. Paletas con clima, profundidad completa y cobertura de hierba en suelo pendientes.
Se retira también la sombra al completar el salto antes de encadenar el siguiente movimiento;
la comprobación específica con tecla mantenida sigue pendiente.

Pruebas: tipos, honesty, build, Avatar (72 selecciones/4.608 muestras) y affine existentes PASS.
Chromium Rojo/Hoja en orilla real de Ruta 22: cuatro direcciones, misma paleta/fotograma, ningún
píxel fuera de agua, bici, surf con offsets0/1 y pausa PASS; capturas inspeccionadas. Nueve matrices
por ciclo observado, aunque el sprite pequeño conserva la misma imagen rasterizada en esas
muestras; no se añade una oscilación inventada. El canal de Pallet no es reflectante y queda sin
reflejo. PREPARED selecciona entradas sobre terreno real; no modifica comportamientos ni progreso.
Arranque: recursos de reflejo preparados antes de jugar, reintento HTTP503 PREPARED PASS;
tres primeras ventanas ~57–58 FPS y lecturas posteriores ~60, con un intervalo inicial de49,9 ms.
Regresión de 62 pasos: ~60 FPS, p95≤16,8 ms; una tarea de54 ms. Mediciones locales, no
garantía de FPS constantes, dispositivos o paridad ROM.

Cobertura local del avatar (30bdd798): se mantienen dos canvases de 128×128 (128 KiB RGBA)
para BG1/medio y BG2/superior cerca del personaje. DrawMetatile de field_camera.c asigna NORMAL
como bottom→BG1/top→BG2, COVERED como bottom→BG3/top→BG1 y SPLIT como bottom→BG3/top→BG2.
La base del visor sigue aplanada; las capas locales restauran la cobertura sobre avatar, efectos
y reflejo. OBJ gana el empate de prioridad: BG1 queda entre el reflejo (prioridad 3) y el avatar;
BG2 queda delante del avatar de prioridad 2 y detrás si su prioridad es 0/1, desde sElevationToPriority.
La elevación se lee de los bloques residentes y conserva las reglas 0/15 de ObjectEventUpdateElevation.
Se retira el recorte fijo de 4px en la exploración inmersiva de Kanto: hierba/terreno y efecto original
aportan los píxeles de cobertura. Los adaptadores anteriores de Hoenn/inspector conservan su ruta.

Las capas reutilizan renderer/bloques del sector sin duplicarlos; invalidan al cambiar tiles animados,
cargar o liberar sectores. Se recalculan al cambiar la ventana alineada a metatiles y se liberan al
abandonar la página. El contador de memoria estimada añade sus 128 KiB, sin pretender medir toda la GPU.
Checks de tipos/honesty/build y Chromium Rojo/Hoja PASS: 57 metatiles por muestra en hierba real de
Ruta 2 (44 NORMAL/13 COVERED), contraste de píxeles BG1/BG2, orden DOM y capturas inspeccionadas.
Regresión de reflejos de Hoja en Ruta 22 (direcciones/bici/surf/pausa) PASS y captura de surf revisada.
SPLIT solo está en gTileset_SeviiIslands67 (tres metatiles), fuera de esta exploración; revisión C,
sin recorrido real. Los bloques transitables de los exteriores del Kanto continental exportado no usan prioridades
altas0/1: esa rama queda conectada pero sin validación real en esta entrega.

El recorrido de 62 pasos Pallet/Ruta1 pasa (~60 FPS, p95≤16,8 ms, sin tareas>50 ms en esa muestra).
No completa el compositor de toda la cámara ni la prioridad/subsprites de todos los NPC/objetos,
colisiones por elevación/puentes o revisión exhaustiva/ROM. Esas validaciones continúan en 6.5d.

Revisión funcional en curso (objetivo6.5o: puntos1/3/4/6). `f87e8e28` conserva elevaciones de los
bloques en WorldGrid (un byte adicional por casilla residente), comprueba el lado de salida y el
de entrada con los predicados C, y rechaza desniveles incompatibles conservando0/15 y el retorno
de surf a nivel3. El embarque automático sigue siendo la adaptación de navegación ya declarada.
Checks PREPARED de barreras, elevación heredada y liberación/reintento de sectores PASS; teclado
exterior conserva16/8/6 ticks de caminar/correr/bici y32 de saltos/orilla.

297fc052 completa las activaciones de aterrizaje y agua utilizadas por el alcance: cobertura
suprimida durante salto, JumpTallGrass con hierba persistente al aterrizar, JumpSmall/BigSplash,
Splash de charco y bucle de pies en agua somera (sigue al centro base del avatar, sin copiar y2,
se retira inmediatamente al salir). Sonido SE_PUDDLE desde datos C. Ripple se centra a y+6 desde
la esquina de la casilla (centro base +height/2−2−alturaDelRipple/2); antes estaba 8 px arriba.
Huellas quedan detrás del actor, ondas bajo BG1 y hierba ordenada por elevación/subprioridad C
con cámara virtual nativa centrada para el viewport ampliado. BG2 conserva un plano fijo;
el avatar y soportes pasan delante al usar prioridad0/1. Esto evita alterar la prioridad de
otros efectos al cruzar niveles. La prioridad completa de NPC/subsprites continúa fuera del objetivo.

Tipos, honesty, build y harness PREPARED de efectos PASS (animaciones y recursos reales, suelo y
RAF sintéticos): bucle/seguimiento/retirada, charcos de 8 ticks, aterrizajes y centro/prioridad de ondas.
Teclado en terreno real conserva movimiento/salto/orilla/recarga y añade el polvo al desembarcar
según JumpSpecialWithEffect. El recorrido exterior de 62 pasos registra ~60 FPS, p95 ≤16,8 ms y ninguna tarea >50 ms; no mide GPU ni rendimiento general. Silph (charcos), Seafoam (corrientes/agua somera) y HallOfFame (hielo) necesitan el contexto interior jugable y su recorrido real antes de cerrar efectos/terrenos.

`tools/checks/viewerNavigationData.ts` lee los exportados sin cambiarlos y censa el grafo estático:
255 mapas desde los 37 exteriores, 941 warps y ocho salidas dinámicas; no implica que ya se naveguen.
SaffronCity real tiene 66×55 y SaffronCity_Connection 48×40: no se pueden sustituir como si fueran
el mismo plano. El cambio de contexto debe conservar warps/conexiones explícitos. El objetivo
completo continúa abierto en TAREAS-FINALES.md §6.5o.

Límite de la revisión base: avatar de locomoción. El soporte normal se añadió en aa4279a8;
las sombras fuera de los saltos revisados, revisión exhaustiva de reflejos, huellas/ondas en navegación real, revisión exhaustiva de máscaras/profundidad y terreno animado siguen en el punto de efectos; NPC/objetos, terrenos especiales (escaleras/puentes/rails), interiores, animaciones de
escenas/acciones especiales, recorrido exhaustivo y comparación ROM/dispositivos siguen pendientes.
Los jobs UI históricos C7/huellas necesitan adaptarse al modo inmersivo antes de servir de prueba
actual; no se ejecutaron ni se presentan como validación vigente en esta entrega.

## Mundo principal y variantes

Entrega vigente `fe68ee77`: `/maps.html` abre la **superficie** de Kanto, Johto, Hoenn y sus
islas. El catálogo conserva 1155 mapas; el plano principal dibuja 155 superficies. Los
interiores y los 14 mapas submarinos se consultan desde accesos o búsqueda, sin aparecer en
los chunks, imágenes reducidas ni rectángulos del plano principal.

«Región» enfoca las tres regiones, Sevii o las islas especiales. «Superficie» vuelve al plano;
«Superficie principal» filtra la lista a sus mapas colocados. «Vista» conserva FireRed, Emerald,
HnS y Crystal completos como variantes. El buscador permite consultar todos los niveles.
Cada ficha identifica superficie/interior/submarino y señala la ubicación pendiente cuando
procede. El atlas no ejecuta el motor, transportes, Dive ni requisitos de eventos.

| Fuente y grupo | Mapas disponibles | Presentación |
|---|---:|---|
| Kanto FireRed | 256 | Geometría continental original; interiores desde puertas |
| Johto HnS | 253 | Componente conectado desde New Bark; otros accesos consultables sin inventar posiciones |
| Sevii FireRed | 135 | Siete islas, manteniendo el componente conectado de cada una; Monte Ascuas abre desde Kindle Road |
| Navel Rock/Birth Island FireRed | 24 | Una representación principal, exteriores separados e interiores desde puertas; Emerald conserva sus variantes |
| Hoenn Emerald | 473 | Plano continental más Frente Batalla, Isla del Sur y entrada de Faraway como destinos de superficie |
| Submarino Emerald | 14 | Fichas aparte, sin grupo visible en el plano; incluye salas del barco abandonado |

Las regiones e islas se organizan con separación editorial de 1024 px; no se afirma una
posición geográfica exacta entre ellas. El plano continental de Hoenn conserva sus rectángulos
originales. Los componentes terrestres añadidos previamente como franja ya no se dibujan como
islas: Bosque Petalia, Monte Cenizo, Monte Pírico, Desfiladero, Safari, Arrecípolis y Pilar Celeste
se abren desde sus entradas o búsqueda mientras su ubicación se revisa. También se omiten los
componentes secundarios no ubicados de Johto y Monte Ascuas en Sevii. El catálogo registra
39 mapas de superficie con `positionPending`, en `_meta.pendingSurfacePlacement`.

La selección conserva fuentes/IDs: `johto/MAP_NEW_BARK_TOWN`, `sevii/MAP_ONE_ISLAND` y
`hoenn/MAP_UNDERWATER_ROUTE124`. Hoenn submarino conserva el namespace y URLs anteriores;
`#region=underwater` ahora abre la ficha submarina de Ruta 124, en lugar de otra franja del mundo.
Las salas LINK, prototipos de Route 104/Sevii y cinco estados alternativos HnS quedan en las
variantes. Los escondites Rocket de Mahogany/Celadon no se equiparan por compartir nombres.
Routes 26–28, Tohjo Falls y Mt Silver siguen agrupados con Johto por política de representación.
Persisten siete referencias fronterizas fuera de selección y seis discrepancias de conexiones
HnS registradas; se requiere revisión de fuente/ROM, no ajustes geográficos inventados.

La navegación conserva las conexiones/warps originales dentro de una fuente. Ruta 124 ofrece
«Sumergirse» hacia su mapa submarino; este conserva «Emerger» hacia Ruta 124. «Volver a la
superficie» usa la referencia de emergencia para submarinos, el contexto de acceso para
interiores o una entrada disponible; cuando no existe destino identificado vuelve al plano de
la región. Las puertas conservan su índice; las referencias entre fuentes diferentes, como
Route 26 North HnS hacia Route 22 FireRed, descartan el índice de warp.

Vermilion y los puertos con acceso identificado ofrecen viajes de consulta. Los siete ferris
Sevii conservan procedencia `data/scripts/seagallop.inc`; Olivine–Vermilion adapta la referencia
HnS `OlivinePort_EventScript_ChoseVermilion`. Vermilion–Slateport permanece etiquetado como
navegación del proyecto. Estos enlaces cambian el mapa consultado, sin simular viaje ni pases.
«Explorar» solo aparece para exteriores soportados por el explorer continental anterior.

Preparación: `npm run maps:principal` después de las imágenes fuente. Verificación vigente:
`check:principal-map-data` contrasta superficie exclusiva, ausencia de submarino/interiores del
plano, conservación de IDs/datos y geometría continental, islas con fuente única, rutas
Dive/Emerge, imágenes y lugares pendientes. Los 507 archivos generados regeneran idénticos.
El recorrido Chromium comprueba puertas, Ruta 124/submarino/retorno, URL antigua submarina,
ferris desde Vermilion, áreas pendientes señaladas, variantes, caché estimada ≤96 MiB y 0 RAF
en reposo; sin solicitudes al motor. Capturas decodificadas e inspeccionadas en escritorio y
móvil. También pasan tipos, honestidad, build y diff; permanecen avisos existentes de bundles.

```bash
PW_BASE=http://localhost:5174/ node tools/playtest/pw.mjs tools/playtest/smoke/principal-maps.job.mjs output/playwright/surface-only
```

Pendientes: verificar las posiciones omitidas, revisar exhaustivamente selección, mapas,
paletas/animación/ROM, gestos/dispositivos y producción; extender la navegación por sectores de Kanto,
Dive, ferris y conexiones físicas entre regiones. Consulta integrada y exploración jugable
siguen siendo estados distintos.

## Compañeros de HeartGold

- `files/data/mmodel/mmodel/mmodel_<297 + FOLLOWER_MON_*>.NSBTX` (el motor suma 297 en `RegisterHallOfFame_GetMmodelBySpeciesFormGender`):
  8 texturas de 32x32 (64x64 en los grandes) a 4 bits, orden de nombre `tsure_poke.1, .10 … .16` = arriba x2, abajo x2, izquierda x2,
  derecha x2 (comprobado con Arceus y Quilava), y 2 paletas (normal y variocolor). Decodificador: `tools/viewer/nsbtx.py`.
- Los nombres de formas salen de los sufijos de `FOLLOWER_MON_*` (letras de Unown, `ATK/DEF/SPD` de Deoxys…); `_F` es hembra solo si
  existe la entrada sin sufijo.

## SpriteCollab

- No se copia el repositorio (1.4 GB de sprites): `public/sprites/sc` es un enlace simbólico al checkout y los datos por especie están en
  `public/sprites/spritecollab-data/<dex>.json`. Las rutas `sprite/<dex>/<forma>/<0000|0001 variocolor>/<0001|0002 género>` heredan
  las acciones que faltan del nivel superior (se marcan con `*`).
- Nombres de acción para PMD Red/Sky: se asignan solo si el índice y la lista de duraciones coinciden exactamente con el `AnimData.xml`
  de la especie (7939 de 8750 animaciones); el resto sigue como «Animación N».
- «Solo ataques» filtra las acciones de golpe, carga, disparo y efecto (lista `ATTACK_ACTIONS` de `dexSprites.ts`, tomada de
  `sprite_config.json`); no hay una tabla movimiento → acción, así que no es un simulador (fase 4-5 pendientes).

## Ideas futuras

- Entorno de combate 2D con sprites de Mundo Misterioso y datos de la serie principal: `docs/VISION-COMBATE-2D.md`.
- Combate completo del motor de FireRed en el visor: `docs/PRUEBA-BATALLA-EN-VISOR.md`.
