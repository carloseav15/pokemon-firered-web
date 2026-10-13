# Atlas Pokémon: índice de las herramientas de consulta

Páginas del servidor de desarrollo (`npm run dev`, puerto 5174 en esta máquina). La portada de todas es
[`atlas.html`](../atlas.html) (enlace «☰ Atlas» en cada cabecera). Ninguna ejecuta el motor del juego: leen los datos
exportados de los decomps.

| Sección | Página | Para qué | Datos que necesita |
|---|---|---|---|
| Visor común | `/maps.html?game=firered`, `emerald`, `hns` o `crystal` | Cámara, búsqueda, mundo por bloques, mapas individuales, eventos, warps e historial | `public/map-viewer/` y datos de cada fuente |
| Inspector GBA | `/viewer.html?legacy=1` (+ `&game=emerald`) | Capas técnicas, ficha por casilla, flags, writers, animación y audio | `public/viewer/kanto.json` / `hoenn.json`, `public/fr`, `public/emerald` |
| Explorar a pie | `/viewer.html#modo=explore` (+ `?game=emerald`) | Caminar con Rojo/Hoja o Bruno/Aura; pisar una puerta abre su interior | los mismos |
| Interiores | desde el buscador o `#mapa=MAP_ID` | 425 + 518 mapas con warps, objetos, eventos, carteles | `public/<juego>/maps`, `layouts`, `tilesets` |
| Pokédex comparada | `/dex.html`, `#<id de especie>`, `#n<nacional>` | Sprites y datos comunes / exclusivos por juego, más la sección «Sprites de otros juegos» (tabla de fuentes abajo). Las especies de Gen 4-9 sin datos de juego salen como fichas solo de sprites | `public/<juego>/data`, `gfx/pokemon/*`, `public/sprites/` |
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
npm run refs:fetch -- pmd-red pokeemerald-expansion pokeplatinum pokeheartgold pokecrystal pmd-sky   # una vez
npm run crystal:maps                                    # public/crystal/ (mapas renderizados de Crystal, ~4 MB, ignorado en git)
npm run refs:fetch -- pokemon-hns                        # fuente fijada de Heart & Soul
npm run hns:maps                                       # public/hns/ (mapas 2D, ignorado en git)
npm run expansion:catalog                               # public/expansion/ (catálogo Gen 1-9; requiere clang y refs:fetch de pokeemerald-expansion)
npm run crystal:world                                   # public/crystal/world/ (mapa del mundo; requiere crystal:maps)
npm run maps:images                                    # imágenes/mips del visor común; exige las cuatro fuentes anteriores
# Una sola fuente: npm run maps:images -- firered | emerald | hns | crystal
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

Notas: en HeartGold la paleta normal sale de `front.png` y la variocolor de `back.png` (`pokegra.mk`). Los retratos de PMD Red no
se extraen porque en pmd-red son `incbin` de `baserom.gba` (solo 73 especies); haría falta una ROM propia en el equipo.

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
«Visor» regresa a la consulta común con su cámara. Su renderizador/simulación anterior sigue cargando
el mundo completo; optimizar Explorar por sectores es trabajo pendiente. No es un port jugable de
Emerald, HnS o Crystal.

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
producción, paridad con ROM, Explorer por sectores y traslado de más herramientas técnicas al visor común.
