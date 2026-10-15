# Reglas de combate: matriz e impacto (generado)

Generado por `unified-world/extract_rules.py`; no editar a mano. Evidencia en el simulador de Showdown (checkout
fijado) y, para el clima, en el decomp de FireRed. Showdown no reproduce el RNG ni el orden de llamadas de la
GBA: es evidencia de **reglas**, no de comportamiento exacto. La columna *propuesta* es mía, no una decisión.

## 1. Matriz de reglas

| Regla | Gen 3 | Gen 4 | Gen 5 | Gen 6 | Propuesta | Evidencia |
|---|---|---|---|---|---|---|
| Categoría físico/especial | por tipo (Fuego, Agua, Planta, Hielo, Eléctrico, Siniestro, Psíquico y Dragón = especial) | por movimiento | por movimiento | por movimiento | por movimiento (Gen 4) | `showdown/data/mods/gen3/scripts.ts:5` |
| Probabilidad de crítico por etapa | 1/16, 1/8, 1/4, 1/3, 1/2 | igual | igual | 1/16, 1/8, 1/2, 1/1 | la de Gen 3 (fiel) | `showdown/sim/battle-actions.ts:1627`<br>`showdown/sim/battle-actions.ts:1631` |
| Multiplicador de crítico | ×2 | ×2 | ×2 | ×1,5 | ×2 (fiel) | `showdown/sim/battle-actions.ts:1751` |
| Modificador de golpe múltiple en dobles | ×0,5 | ×0,75 | ×0,75 | ×0,75 | pendiente (afecta solo a dobles) | `showdown/data/mods/gen3/scripts.ts:52`<br>`showdown/data/mods/gen4/scripts.ts:74` |
| Quemadura: daño residual | 1/8 de PS | 1/8 | 1/8 | 1/8 (1/16 desde Gen 7) | 1/8 (fiel) | `showdown/data/mods/gen6/conditions.ts:5`<br>`showdown/data/conditions.ts:17` |
| Quemadura: reducción de daño físico | ×0,5 salvo Agallas | igual | igual | igual | ×0,5 (fiel) | `showdown/data/mods/gen3/scripts.ts:41` |
| Parálisis: velocidad | ×0,25 | ×0,25 | ×0,25 | ×0,25 (×0,5 desde Gen 7) | ×0,25 (fiel) | `showdown/data/mods/gen4/conditions.ts:11`<br>`showdown/data/mods/gen6/conditions.ts:14` |
| Sueño: duración | 1–4 turnos; el contador se conserva al cambiar (Sleep Talk y Ronquido no cuentan) | 1–4 turnos | 1–3 turnos; el contador se reinicia al cambiar | 1–3 turnos | Gen 3 (fiel) | `showdown/data/mods/gen3/conditions.ts:12`<br>`showdown/data/conditions.ts:59`<br>`showdown/data/mods/gen5/conditions.ts:4` |
| Congelación | 1/5 de descongelar por turno; un golpe de Fuego descongela (Hidden Power y Weather Ball no cuentan) | 1/5 por turno; golpe de Fuego descongela | igual | igual | pendiente (Frostbite por evaluar) | `showdown/data/mods/gen3/conditions.ts:47`<br>`showdown/data/mods/gen4/conditions.ts:90` |
| Movimientos de atadura (Wrap, Bind…) | 3–6 turnos del simulador; daño 1/16 por turno | 3–6; Garra Garra fija la duración en 6 | 5–6; daño 1/16 (1/8 con Banda Atadura) | 5–6; daño 1/8 (1/6 con Banda Atadura) | Gen 3 (fiel) | `showdown/data/mods/gen4/conditions.ts:114`<br>`showdown/data/mods/gen5/conditions.ts:12`<br>`showdown/data/conditions.ts:231` |
| Protección encadenada (Protect, Detect, Endure) | la probabilidad se divide a la mitad hasta 1/8 | igual | se divide a la mitad hasta 1/256 | se divide entre 3 hasta 1/729 | Gen 3 (fiel) | `showdown/data/mods/gen4/conditions.ts:146`<br>`showdown/data/mods/gen5/conditions.ts:27`<br>`showdown/data/conditions.ts:443` |
| Tormenta de arena | no sube la Def. Esp. de tipo Roca | sube ×1,5 a tipo Roca | igual | igual | pendiente | `showdown/data/mods/gen3/conditions.ts:54` |
| Clima fijado por habilidad (Llovizna, Sequía…) | permanente mientras no cambie el clima | no verificado en Showdown | no verificado | no verificado | pendiente: el decomp de FireRed es la referencia fiel | `pokefirered/src/battle_util.c:1717` |
| Tabla de tipos | 18 tipos; Acero resiste Siniestro y Fantasma | igual | igual | añade Hada; Acero deja de resistir Siniestro y Fantasma | Gen 6 | `showdown/data/mods/gen6/typechart.ts:4` |

Filas **no** cubiertas aquí por no haberse leído (siguen abiertas): orden de acción y empates de velocidad,
precisión y evasión, retroceso, `Counter`/`Mirror Coat`, objetos retenidos, habilidades concretas.

## 2. Impacto del split físico/especial

De **215** movimientos de daño de las generaciones 1–3 de tipo fijo (según FireRed y Platinum; Hidden Power queda fuera porque su tipo depende de los IV), **53** cambian de categoría respecto al reparto por tipo.
Showdown cuenta 53 cambios de categoría en Gen 4; difieren en 0 (solo en Platinum: –; solo en Showdown: –).

| Movimiento | Tipo | Antes | Después | Potencia |
|---|---|---|---|--:|
| Acid | Poison | physical | special | 40 |
| Aeroblast | Flying | physical | special | 100 |
| Air Cutter | Flying | physical | special | 55 |
| AncientPower | Rock | physical | special | 60 |
| Doom Desire | Steel | physical | special | 120 |
| Gust | Flying | physical | special | 40 |
| Hyper Beam | Normal | physical | special | 150 |
| Hyper Voice | Normal | physical | special | 90 |
| Mud Shot | Ground | physical | special | 55 |
| Mud-Slap | Ground | physical | special | 20 |
| Night Shade | Ghost | physical | special | 1 |
| Razor Wind | Normal | physical | special | 80 |
| Shadow Ball | Ghost | physical | special | 80 |
| Signal Beam | Bug | physical | special | 75 |
| Silver Wind | Bug | physical | special | 60 |
| Sludge | Poison | physical | special | 65 |
| Sludge Bomb | Poison | physical | special | 90 |
| Smog | Poison | physical | special | 20 |
| Snore | Normal | physical | special | 40 |
| SonicBoom | Normal | physical | special | 1 |
| Spit Up | Normal | physical | special | 100 |
| Swift | Normal | physical | special | 60 |
| Tri Attack | Normal | physical | special | 80 |
| Uproar | Normal | physical | special | 50 |
| Weather Ball | Normal | physical | special | 50 |
| Beat Up | Dark | special | physical | 10 |
| Bite | Dark | special | physical | 60 |
| Blaze Kick | Fire | special | physical | 85 |
| Bullet Seed | Grass | special | physical | 10 |
| Clamp | Water | special | physical | 35 |
| Crabhammer | Water | special | physical | 90 |
| Crunch | Dark | special | physical | 80 |
| Dive | Water | special | physical | 60 |
| Dragon Claw | Dragon | special | physical | 80 |
| Faint Attack | Dark | special | physical | 60 |
| Fire Punch | Fire | special | physical | 75 |
| Flame Wheel | Fire | special | physical | 60 |
| Ice Ball | Ice | special | physical | 30 |
| Ice Punch | Ice | special | physical | 75 |
| Icicle Spear | Ice | special | physical | 10 |
| Knock Off | Dark | special | physical | 20 |
| Leaf Blade | Grass | special | physical | 70 |
| Needle Arm | Grass | special | physical | 60 |
| Outrage | Dragon | special | physical | 90 |
| Pursuit | Dark | special | physical | 40 |
| Razor Leaf | Grass | special | physical | 55 |
| Sacred Fire | Fire | special | physical | 100 |
| Spark | Electric | special | physical | 65 |
| Thief | Dark | special | physical | 40 |
| ThunderPunch | Electric | special | physical | 75 |
| Vine Whip | Grass | special | physical | 35 |
| Volt Tackle | Electric | special | physical | 120 |
| Waterfall | Water | special | physical | 80 |

### Efecto sobre especies (325 con Ataque ≠ Ataque Esp.)

Mejor movimiento STAB de aprendizaje por nivel que usa su estadística ofensiva alta: **37 especies mejoran**, 23 empeoran y 265 quedan igual.

Solo movimientos aprendidos por nivel; no cuenta MT/MO, tutores ni movimientos de huevo, ni precisión o efectos.

| Gana más | Prefiere | Mejor STAB antes → después |
|---|---|---|
| Corphish | physical | 0 → 90 |
| Crawdaunt | physical | 0 → 90 |
| Dragonair | physical | 0 → 90 |
| Dratini | physical | 0 → 90 |
| Kingler | physical | 0 → 90 |
| Krabby | physical | 0 → 90 |
| Bagon | physical | 0 → 80 |
| Carvanha | physical | 0 → 80 |
| Gastly | special | 0 → 80 |
| Gengar | special | 0 → 80 |
| Goldeen | physical | 0 → 80 |
| Haunter | special | 0 → 80 |

| Pierde más | Prefiere | Mejor STAB antes → después |
|---|---|---|
| Grimer | physical | 90 → 0 |
| Muk | physical | 90 → 0 |
| Banette | physical | 80 → 0 |
| Shuppet | physical | 80 → 0 |
| Volbeat | physical | 75 → 0 |
| Electrode | special | 65 → 0 |
| Koffing | physical | 65 → 0 |
| Snorlax | physical | 150 → 85 |
| Voltorb | special | 65 → 0 |
| Weezing | physical | 65 → 0 |
| Kabuto | physical | 60 → 0 |
| Kabutops | physical | 60 → 0 |

## 3. Impacto de Fairy

- Especies que cambian de tipo en Gen 6 (datos de Showdown): **18** de las 386 de Gen 1–3.
- Movimientos que cambian de tipo en Gen 6: **3**.

| Especie | Antes | Después |
|---|---|---|
| azumarill | Water | Water/Fairy |
| azurill | Normal | Normal/Fairy |
| clefable | Normal | Fairy |
| clefairy | Normal | Fairy |
| cleffa | Normal | Fairy |
| gardevoir | Psychic | Psychic/Fairy |
| granbull | Normal | Fairy |
| igglybuff | Normal | Normal/Fairy |
| jigglypuff | Normal | Normal/Fairy |
| kirlia | Psychic | Psychic/Fairy |
| marill | Water | Water/Fairy |
| mawile | Steel | Steel/Fairy |
| mrmime | Psychic | Psychic/Fairy |
| ralts | Psychic | Psychic/Fairy |
| snubbull | Normal | Fairy |
| togepi | Normal | Fairy |
| togetic | Normal/Flying | Fairy/Flying |
| wigglytuff | Normal | Normal/Fairy |

| Movimiento | Antes | Después |
|---|---|---|
| charm | Normal | Fairy |
| moonlight | Normal | Fairy |
| sweetkiss | Normal | Fairy |

Hada **ataca**: superefectivo contra Dark, Dragon, Fighting; resistido por Fire, Poison, Steel; inmune: –.
Hada **defiende**: débil a Poison, Steel; resiste Bug, Dark, Fighting; inmune a Dragon.
Acero deja de resistir Dark y Ghost en Gen 6.

## 4. Catálogo y cambios por generación (Showdown, desde la base Gen 3)

| Generación | Movimientos nuevos | Habilidades nuevas | Objetos nuevos | Especies nuevas |
|---|--:|--:|--:|--:|
| gen4 | 113 | 47 | 97 | 107 |
| gen5 | 92 | 41 | 37 | 156 |
| gen6 | 62 | 27 | 64 | 72 |

Cambios sobre lo que ya existía en Gen 3 (movimientos, habilidades y objetos con algún campo modificado):

| Generación | Movimientos | Habilidades | Objetos | Especies |
|---|--:|--:|--:|--:|
| gen4 | 103 | 20 | 45 | 89 |
| gen5 | 89 | 35 | 19 | 348 |
| gen6 | 83 | 4 | 44 | 43 |
