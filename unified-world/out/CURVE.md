# Suministro de experiencia de entrenadores (generado)

Generado por `unified-world/extract_curve.py`; no editar a mano. Solo entrenadores (XP finita): la XP de
Pokémon salvajes es ilimitada y **no se mide**. Fórmula gen 3 con un participante y combate de
entrenador: `floor(1.5 × expYield × nivel / 7)`. No modela Huevo Suerte ni Repartir Experiencia.

| Fuente | Entrenadores usados | Pokémon | XP total | Nivel de los rivales (mín / mediana / máx) | Sin resolver |
|---|--:|--:|--:|---|--:|
| firered | 455 | 1172 | 953,781 | 5 / 29 / 63 | 0 |
| emerald | 502 | 954 | 689,691 | 3 / 26 / 78 | 0 |
| hns | 407 | 943 | 1,214,020 | 2 / 38 / 75 | 15 |

## Qué nivel alcanzaría un equipo con toda esa XP

| Fuente | 1 Pokémon (rápido-medio) | 1 Pokémon (medio-lento) | 6 Pokémon repartido (rápido-medio) | 6 Pokémon repartido (medio-lento) |
|---|--:|--:|--:|--:|
| firered | 98 | 96 | 54 | 54 |
| emerald | 88 | 87 | 48 | 49 |
| hns | 100 | 100 | 58 | 59 |
| **las tres juntas** (2,857,492 XP) | 100 | 100 | 78 | 77 |

Cota superior: asume que ningún combate se evita y que el equipo gana toda la XP de entrenadores. Contrasta con
la escalera de aces de líderes (11, 14, 15, 16, 19, 21, 21, 24, 24, 25, 29, 29, 31, 31, 33, 33, 36, 42, 43, 43, 45, 46, 47, 50).

## Límites

- Los entrenadores se detectan por las líneas `trainerbattle*` de los scripts: pueden incluir alguno
  inaccesible y omitir los que se generan por `special` o por scripts compartidos.
- HnS tiene especies posteriores a la generación 3 que no están en la tabla de FireRed; se excluyen y se
  cuentan en «Sin resolver». Su XP real sería algo mayor.
- No se mide la XP de salvajes, que es lo que realmente permite sobrepasar la curva (grind).
