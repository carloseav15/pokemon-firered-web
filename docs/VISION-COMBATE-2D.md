# Visión: entorno de combate 2D al estilo Mundo Misterioso (idea futura)

Estado: **idea, sin construir** (anotada el 2026-10-14). Relacionada con `docs/PRUEBA-BATALLA-EN-VISOR.md` (motor de FireRed en el dex).

## Idea

Un entorno de combate 2D en el visor donde dos o más Pokémon se mueven y atacan con los sprites de Mundo Misterioso, pero con los
datos de la serie principal: las estadísticas deciden quién actúa antes, el usuario elige el ataque y la herramienta señala
qué movimientos son útiles. Una variación de PMD, no una copia de sus reglas.

## Piezas disponibles

| Pieza | Dónde |
|---|---|
| Estadísticas, tipos, habilidades y movimientos (prioridad, potencia, precisión, PP, objetivo, categoría) | `public/expansion/` (`expansion.html`) |
| Sprites de mazmorra con 8 direcciones | PMD Sky y SpriteCollab (`public/sprites/`) |
| Acciones de ataque con marcas rush / hit / return, desplazamientos y sombra | `AnimData.xml` de SpriteCollab (`spritecollab-data/`) |
| Procedencia por fuente | índice de sprites (`origin`) |

## Piezas que faltan

| Pieza | Esfuerzo | Nota |
|---|---|---|
| Escena 2D: cuadrícula, posiciones, cámara | Medio | Página nueva con canvas; no toca `src/` |
| Orden de turnos y daño | Medio | Fórmula propia o el simulador de Pokémon Showdown (`refs-src/pokemon-showdown`) |
| Acción de sprite por movimiento | Bajo-medio | Por categoría y alcance; PMD documenta rango y objetivo en `include/move_data.h` de pmd-sky |
| Marcar movimientos útiles | Bajo | Potencia x STAB x efectividad, precisión, prioridad y velocidad |
| Efectos reales (proyectiles, llamas, rayos) | Alto, incierto | `EFFECT/effect.bin` (3.9 MB) sin analizar; la tabla movimiento → efecto no está localizada |

## Probabilidad estimada

- Sin efectos, con sprites y reglas sencillas: alta (~90 %).
- Con los efectos oficiales de PMD: media-baja (35-50 %) hasta hacer un sondeo de `effect.bin`.

## Decisiones abiertas

1. Reglas: por turnos de la serie principal o alcance por casillas de PMD (frente, alrededor, sala).
2. Generación de estadísticas y movimientos (la configuración de expansion usa la 9 por defecto).
3. Si los efectos son imprescindibles o basta con el movimiento del Pokémon.

## Primer paso sugerido

Sondeo de `effect.bin` (formato y tabla movimiento → efecto) y, en paralelo, la escena 2D sin efectos.
