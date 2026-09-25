# Pokémon FireRed en TypeScript (port fiel del decomp)

Port fiel de [pokefirered](https://github.com/pret/pokefirered) (C) a TypeScript
que corre en el navegador sobre un Canvas de 240×160. No es un remake: emula el
hardware de la GBA (PPU, VRAM, OAM, paletas, DMA, VBlank, tareas) y traduce el
código del decomp casi línea por línea, usando sus datos originales exportados.

> Este repositorio es privado. `public/fr/` contiene datos exportados del juego
> original (gráficos, audio, textos) generados desde el decomp; no se distribuye.

## Empezar

```sh
npm ci
npm run dev          # servidor Vite; / = arranque completo, ?fr=new / ?fr=continue saltan la intro
npm run check:port   # tsc sobre todo src (obligatorio tras cada cambio)
npm run build
```

El decomp de referencia va incluido como submódulo (`pokefirered/`, fijado en el
commit usado para exportar los datos). Tras clonar:

```sh
git clone --recurse-submodules <repo>     # o: git submodule update --init
```

El exportador (`tools/decomp/export.py`) busca el decomp en `$POKEFIRERED`, luego
en `../pokefirered` y por último en el submódulo; ver [AGENTS.md](AGENTS.md) §4.
`public/fr/` y `src/fr/generated/` ya están versionados, así que solo hace falta
reexportar si cambias `tools/decomp/`.

## Documentación

| Archivo | Contenido |
|---|---|
| [AGENTS.md](AGENTS.md) | Guía para agentes: mapa del repo, pipeline de datos, método de port y verificación |
| [PENDING.md](PENDING.md) | **Faltantes** (generado): sin empezar, adaptadores, parciales, huecos conocidos, pantallas sin probar |
| [PORT-INVENTORY.md](PORT-INVENTORY.md) | Avance por archivo `.c` (generado con `npm run inventory`) |
| [PORTING-STATUS.md](PORTING-STATUS.md) | Estado detallado, decisiones y lista de pendientes ordenada |
| [START-FLOW.md](START-FLOW.md) | Flujo de arranque (intro → título → partida) |
| [SECONDARY-MISSIONS-AUDIT.md](SECONDARY-MISSIONS-AUDIT.md) | Inventario de contenido opcional |

## Estado (2026-09-25)

Alrededor del 40 % de las funciones del C en alcance tienen homólogo del mismo
nombre en `src/fr`; el motor de batalla, la mayoría de las pantallas de menú y
el arranque están portados. Falta sobre todo: animaciones de ataques y
transiciones de combate, almacenamiento de cajas, Easy Chat, intercambios,
Teachy TV / Fame Checker y toda la fase de pruebas en navegador. Detalle en
[PENDING.md](PENDING.md).
