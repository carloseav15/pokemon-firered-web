# Visión a largo plazo (ideas futuras)

No son tareas activas. Nada de esto empieza hasta cerrar [TAREAS-FINALES.md](../TAREAS-FINALES.md)
(FireRed fiel y validado). Análisis del 2026-10-01 a partir de los repos de pret.

## Objetivo final

Un solo juego con **libertad total**: un único mundo donde el jugador puede recorrer
Kanto, Hoenn y Johto (y quizá otras regiones), con las adaptaciones mínimas
necesarias. Hasta llegar ahí, cada juego vive en su propia carpeta y conserva un
modo fiel que se puede comparar con el original.

## Fases

| Fase | Qué | Resultado |
|---|---|---|
| 1 | FireRed fiel (`src/fr/`) | FireRed funciona igual que el original. **Actual.** |
| 2 | Separar motor y contenido | `core/` (hardware GBA, texto, sprites, tareas, audio, combate, scripts, save) + `games/firered/` (mapas, scripts, entrenadores, datos) |
| 3 | Emerald fiel (`games/emerald/`) | Segundo juego sobre el mismo motor, validado contra su ROM |
| 4 | Capa de reglas | `rules/gen3` (fiel) y `rules/gen4+` (opcional) elegibles por partida |
| 5 | Johto | Contenido de Crystal + HeartGold convertido al motor Gen 3 |
| 6 | Mundo unificado | Un paquete de contenido nuevo que importa las regiones en un solo mundo |

Regla de oro: **las fases 4–6 nunca modifican los modos fieles**. Las novedades se
activan por reglas o por paquete de contenido, para poder seguir comparando
FireRed y Emerald con sus ROM.

## Fuentes y qué aporta cada una

| Repo | Plataforma | Qué se aprovecha |
|---|---|---|
| pokefirered | GBA, C | Base actual |
| pokeemerald | GBA, C | 310 `.c` (~421k líneas). 207 archivos comparten nombre con FireRed; de las funciones con el mismo nombre, 3.677 son idénticas y 3.707 difieren. 103 archivos propios (~124k líneas): Frente Batalla, concursos, Pokécubos, PokéNav/Match Call, bases secretas, TV, reloj RTC, Rayquaza, Torre Espejismo |
| pokecrystal | GBC, ensamblador | No es portable al motor. Sirve como **datos**: 388 mapas, entrenadores, encuentros y scripts (~170 comandos, casi todos con equivalente Gen 3) |
| pokeheartgold | DS, C (WIP) | Johto en formato Gen 4: equipos con IV/habilidades, scripts de eventos, teléfono, radio, concurso de bichos, Bonguri, encuentros por día/noche |
| pokeplatinum | DS, C (WIP) | Datos JSON de 493 Pokémon, movimientos, habilidades y objetos; división físico/especial; scripts de combate para efectos nuevos |

De las versiones de DS no se porta el hardware (ARM7/ARM9, Nitro SDK, 3D, overlays,
pantalla táctil): solo datos y reglas.

## Capa de reglas (fase 4)

Ideas recogidas (incluida una conversación previa con ChatGPT) para un modo
"FireRed perfecto", siempre opcional:

- **Combate:** división físico/especial por movimiento (en Gen 3 depende del tipo:
  un solo predicado consultado por combate, IA y habilidades), tipo Hada,
  movimientos y habilidades modernos, IA mejor.
- **Una sola mecánica especial:** Megaevolución como principal; Teracristalización
  quizá opcional; nada de movimientos Z ni Dinamax, y nunca Mega + Tera a la vez.
- **Dificultad:** salvajes y entrenadores comunes con niveles por zona; líderes,
  Alto Mando, rivales y jefes escalan según medallas (equipos distintos con 0, 3 o 7).
- **MO:** las capacidades de exploración (Corte, Surf, Fuerza, Vuelo…) se
  desbloquean sin ocupar huecos de movimiento.
- **Competitivo sin grind:** IV/EV/naturaleza/habilidad ajustables en el endgame.
- **QoL moderno:** sin cambiar el diseño ni la identidad del original.

Límites de las fuentes: pret solo tiene datos hasta Gen 4 (493 Pokémon). Hada,
Megaevoluciones y Pokémon posteriores no tienen decomp de referencia: habría que
crearlos como contenido propio (estadísticas, gráficos, gritos).

## Mundo unificado (fase 6): qué hay que resolver

1. **Espacios de IDs:** flags, vars, mapas, entrenadores y objetos de cada región
   usan los mismos números con otro significado. Se importan con prefijo o tabla
   de reubicación por región. El save web no tiene los límites de la GBA, así que
   se puede ampliar.
2. **Un Kanto, no dos:** Crystal/HeartGold incluyen su propio Kanto. Se usa el de
   FireRed y se adaptan los eventos de Johto que dependen de Kanto (Rojo en el
   Monte Plateado, revanchas de líderes, Azul como líder).
3. **Conexiones entre regiones:** puertos y transportes que ya existen (S.S. Anne,
   Seagallop, ferry de Emerald, S.S. Aqua y Tren Magnético) como enlaces naturales.
4. **Cronología e historia:** FireRed → Johto encaja (tres años después); Hoenn va en
   paralelo. Revisar personajes repetidos, legendarios duplicados y el arco del
   Team Rocket.
5. **Libertad de orden:** el escalado por medallas de la fase 4 es lo que hace
   jugable recorrer cualquier región en cualquier orden.
6. **Reglas únicas:** todo el mundo unificado usa una sola capa de reglas.
   El contenido Gen 2 se convierte (DV → IV, naturaleza, habilidad); HeartGold ya trae datos Gen 4.
7. **Estilo visual:** todas las regiones con estética GBA. Johto requiere redibujar
   tilesets: es el trabajo más largo y el que menos se automatiza.
8. **Pokédex:** los 251 de Johto y los 386 de Gen 3 ya existen en los datos;
   Sinnoh necesitaría los datos de Platinum.

## Primeros pasos cuando toque

La extracción de referencias ya tiene base y guía propias en
[refs/README.md](../refs/README.md) y puede avanzar en paralelo.

1. Validar FireRed (`TAREAS-FINALES.md`), incluida la comparación con emulador.
2. Con el script de comparación de cuerpos C, decidir qué va a `core/` y qué es
   propio de cada juego.
3. Mover `src/fr/` a `core/` + `games/firered/` sin cambiar comportamiento
   (los checks deben seguir pasando).
4. Empezar Emerald por la historia principal; el Frente Batalla, los concursos y
   la TV, después.
