# Pokémon Odyssey — mundo unificado en TypeScript

Meta: un juego web con Kanto, Johto y Hoenn, construido sobre el motor FireRed.
Orden activo y diagnóstico regional: [hoja de ruta](docs/HOJA-DE-RUTA.md).
UI en inglés y contenido original trazable son los requisitos iniciales.

## Base técnica

Port fiel de [pokefirered](https://github.com/pret/pokefirered) (C) a TypeScript
que corre en el navegador sobre un Canvas de 240×160. No es un remake: emula el
hardware de la GBA (PPU, VRAM, OAM, paletas, DMA, VBlank, tareas) y traduce el
código del decomp casi línea por línea, usando sus datos originales exportados.

> Este repositorio es privado. `public/fr/` contiene datos exportados del juego
> original (gráficos, audio, textos) generados desde el decomp; no se distribuye.

## Empezar

```sh
npm ci
npm run dev          # / = hub; /play.html = FireRed; /world.html = mundo regional
npm run check:port   # tsc sobre todo src al cerrar una tanda de código
npm run build
```

El decomp de referencia va incluido como submódulo (`pokefirered/`, fijado en el
commit usado para exportar los datos). Tras clonar:

```sh
git clone --recurse-submodules <repo>     # o: git submodule update --init
```

El exportador (`tools/decomp/export.py`) busca el decomp en `$POKEFIRERED`, luego
en `../pokefirered` y por último en el submódulo; ver la
[referencia del exportador](docs/PORTING-GUIDE.md#4-de-dónde-salen-los-datos-pipeline-del-exportador).
`public/fr/` y `src/games/firered/generated/` ya están versionados, así que solo hace falta
reexportar si cambias `tools/decomp/`.

## Accesos web

- `/`: Home, con Play o Continue según la partida detectada.
- `/play.html`: FireRed; `/world.html`: mapa regional y exploración.
- `/dex.html`: Pokédex; `/tools.html`: inspectores, fuentes y herramientas.

La portada y la navegación principal están en inglés. Las pantallas internas se
traducen en la siguiente tanda. Los accesos `.html` funcionan en el build servido;
las reescrituras `/play` y `/world` siguen siendo solo del servidor de desarrollo.

## Documentación

| Archivo | Contenido |
|---|---|
| [Hoja de ruta](docs/HOJA-DE-RUTA.md) | Prioridad vigente, orden sencillo, accesos y diagnóstico por región |
| [AGENTS.md](AGENTS.md) | Reglas únicas: portado por tandas, comprobaciones mínimas y revisión posterior |
| [Guía técnica](docs/PORTING-GUIDE.md) | Consulta bajo demanda: mapa, exportador, semántica C y driver |
| [PENDING.md](PENDING.md) | **Faltantes** (generado): sin empezar, adaptadores, parciales, huecos conocidos, pantallas sin probar |
| [PORT-INVENTORY.md](PORT-INVENTORY.md) | Avance por archivo `.c` (generado con `npm run inventory`) |
| [PORTING-STATUS.md](PORTING-STATUS.md) | Estado operativo breve y siguiente tanda |
| [TAREAS-FINALES.md](TAREAS-FINALES.md) | **Lista de tareas finales** del juego de un jugador: código, equivalencias y validación |
| [docs/REVIEW-LOCATIONS.md](docs/REVIEW-LOCATIONS.md) | Dónde está cada función de la revisión (C y TS), generado con `npm run review:where` |
| [PLAN-RECORRIDO.md](PLAN-RECORRIDO.md) | Recorrido para la fase de revisión funcional |
| [refs/README.md](refs/README.md) | Datos y catálogos extraídos de otros decomps (Emerald, Platinum, HeartGold, PokéAPI); el juego no los usa |
| [docs/VISION.md](docs/VISION.md) | Ideas futuras: Emerald, Johto, reglas modernas y mundo unificado (propuestas; consultar la hoja de ruta vigente) |
| [docs/REPOS-COMUNITARIOS.md](docs/REPOS-COMUNITARIOS.md) | Repositorios comunitarios revisados, versiones, aportes posibles, límites y guía de comparación por archivos |

## Estado

Las cifras vivas y los huecos están en [PENDING.md](PENDING.md); no se duplican
en los documentos de instrucciones. El contador mide homólogos por nombre,
no fidelidad ni validación funcional. La meta principal es el juego de un
jugador; enlace e inalámbrico se cuentan aparte. El modo actual porta por
archivo completo y deja la revisión exhaustiva para una fase posterior. El
historial de proceso anterior está en Git, no en el árbol de trabajo.
