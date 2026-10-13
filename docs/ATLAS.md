# Atlas FireRed / Emerald: índice de las herramientas de consulta

Páginas del servidor de desarrollo (`npm run dev`, puerto 5174 en esta máquina). La portada de todas es
[`atlas.html`](../atlas.html) (enlace «☰ Atlas» en cada cabecera). Ninguna ejecuta el motor del juego: leen los datos
exportados de los decomps.

| Sección | Página | Para qué | Datos que necesita |
|---|---|---|---|
| Visor del mundo | `/viewer.html`, `/viewer.html?game=emerald` | Exteriores unidos, capas, fichas, buscador | `public/viewer/kanto.json` / `hoenn.json`, `public/fr`, `public/emerald` |
| Explorar a pie | `/viewer.html#modo=explore` (+ `?game=emerald`) | Caminar con Rojo/Hoja o Bruno/Aura; pisar una puerta abre su interior | los mismos |
| Interiores | desde el buscador o `#mapa=MAP_ID` | 425 + 518 mapas con warps, objetos, eventos, carteles | `public/<juego>/maps`, `layouts`, `tilesets` |
| Pokédex comparada | `/dex.html`, `#<id de especie>` | Sprites y datos comunes / exclusivos por juego; sección «Sprites de otros juegos» (PMD Red con sus animaciones y 8 direcciones, pokeemerald-expansion, Crystal con su animación, Platinum, HeartGold); las especies de Gen 4-9 sin datos de juego salen como fichas solo de sprites (`#n<nacional>`) | `public/<juego>/data`, `gfx/pokemon/*`, `public/sprites/` |
| Biblioteca visual | `/library.html` | Entrenadores con equipo, objetos con icono, gráficos de objetos de mapa | `data/trainers.json`, `gfx/trainers`, `gfx/items`, `objects.json` |
| Comparador | `/compare.html` | Diferencias campo a campo (especies, movimientos, objetos, entrenadores) | `public/<juego>/data` |
| Quests | `/quests.html` | Quests candidatas con clase, flags y variables | `public/viewer/quests_<juego>.json` |
| Mapas de Crystal | `/crystal.html`, `#<Mapa>` | 388 mapas de Johto/Kanto renderizados (bloques + tiles + paletas de día, tejados por grupo), warps navegables, carteles, objetos con su sprite y orientación, escenas y conexiones | `public/crystal/` |
| Mundo de Crystal | `/crystal-world.html`, `#<Mapa>` | 68 mapas exteriores conectados (Johto, Kanto, Route 28) en un solo plano con zoom, arrastre, sprites de objetos (capa opcional), enlaces a cada ficha y las uniones por warps entre mapas (puertas, cuevas, tren, barco) | `public/crystal/world/` |
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
npm run refs:fetch -- pmd-red pokeemerald-expansion pokeplatinum pokeheartgold pokecrystal   # una vez
npm run crystal:maps                                    # public/crystal/ (mapas renderizados de Crystal, ~4 MB, ignorado en git)
npm run crystal:world                                   # public/crystal/world/ (mapa del mundo; requiere crystal:maps)
npm run sprites:sources                                 # public/sprites/ (~70 MB, ignorado en git); admite una fuente: pmd-red | emerald-expansion | crystal | platinum | heartgold
```

## Comprobaciones

```bash
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

- Paleta de día fija; sin animación de tiles (agua, flores). Los objetos se dibujan estáticos (orientación según `SPRITEMOVEDATA_*`,
  paleta `PAL_NPC_*` o la del sprite) con un desplazamiento vertical de -4 px que es una convención del motor, no verificada aquí;
  los Pokémon de mapa (`SPRITE_POKEMON`, 0x80+) solo salen como marcador.
- `house.pal` y `mansion_2.pal` no se aplican: su condición de uso está en el motor (`engine/`), que no está en el checkout.
- Coordenadas de eventos en pasos de 16 px (2×2 tiles); los warps salen tal cual del `.asm`.
- Mundo: las conexiones del decomp unen Johto (31 mapas), Kanto (35) y Route 28 + Silver Cave (2); el juego los une con warps,
  así que la colocación entre secciones es editorial. Dos solapes de un bloque (Route 13/14 y Viridian/Route 1) vienen de las
  conexiones del propio decomp y quedan listados en `world.json`. Las ~320 salas interiores no entran en el mundo.
- Enlaces por warps: componentes de salas interiores unidas por warps; cada puerta de un mapa exterior que entra en ellas es una salida
  y dos salidas de mapas distintos forman un enlace (`via` = camino más corto). Las salas con un warp de destino -1 (Pokécenter 2F,
  ascensores) vuelven a la última puerta usada y no se atraviesan; FastShip1F es la excepción deliberada (Olivine ⇄ Vermilion).
