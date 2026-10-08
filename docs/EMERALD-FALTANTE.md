# Qué falta portar de pokeemerald (análisis)

Generado por `python3 tools/emeraldGap.py` (solo lectura: no toca `src/` ni `refs/`). No editar a mano.
Fuente: pokeemerald `fe1d8e51b2` (`refs/emerald/`), inventario del port (`src/fr`) y las fuentes C de Emerald para medir cada función.

**Cómo leer las cifras.** Una función cuenta como *en el port* si su nombre aparece en `src/fr` con cuerpo real (la misma regla de `tools/portInventory.py`): mide nombres, no fidelidad. *Idéntica* y *distinta* son comparaciones de texto entre Emerald y FireRed; una función idéntica puede leer constantes o estructuras distintas (ver `docs/SEPARACION-MOTOR.md` §2.1 y §2.3). Las líneas son líneas de C de cada función (de la firma a la llave de cierre). Las estimaciones de esfuerzo están en la sección 5 con sus supuestos.

## 1. Resumen

- Emerald tiene **15.632 funciones** en las que Emerald aporta algo (sin contar las 2.257 exclusivas de FireRed): 3.677 idénticas a FireRed, 3.680 con cuerpo distinto y 8.275 solo de Emerald; unas **301.888 líneas** de C.
- **Heredables:** 2.625 funciones idénticas a FireRed cuya versión FireRed ya está en el port (31.287 líneas). Otras 1.052 (14.340 líneas) son idénticas pero la de FireRed aún no está en el port: su coste ya pertenece a la lista de FireRed.
- **Variantes a portar:** 2.917 funciones con cuerpo distinto cuya versión FireRed ya está en el port (73.936 líneas), más 763 (25.149 líneas) con la de FireRed pendiente.
- **Código nuevo de Emerald:** 7.287 funciones (137.480 líneas) sin ningún homólogo por nombre en el port. De ellas 3.918 (79.464 líneas) están en los **103 archivos exclusivos de Emerald** y 3.369 (58.016 líneas) en archivos compartidos con FireRed. Aparte, 945 funciones solo-Emerald (19.068 líneas) existen con el mismo nombre en **otro** archivo C de FireRed (FireRed repartió el código de otro modo): no son código nuevo, pero tampoco están comparadas; y 43 (628 líneas) comparten nombre con algo del port que no está en el C de FireRed (¿ayudantes comunes?).
- **Orden de magnitud:** código nuevo + variantes = unas **236.565 líneas de C** a escribir o revisar (cota alta: 102,9 tandas, sección 5). Quitando enlace e inalámbrico (fuera de la meta) quedan unas **205.141 líneas** (89,2 tandas). El reparto: 79.464 líneas (33 %) son archivos que FireRed no tiene; las variantes de funciones compartidas son 99.085 líneas (41 %).
- **Matiz importante:** 35.378 de las líneas «nuevas» (25 %) están en 19 archivos que los dos juegos tienen pero Emerald reescribió (sección 3.2b: `easy_chat`, `pokedex`, `slot_machine`, `pokemon_summary_screen`…). Ahí el port ya tiene la versión de FireRed del mismo sistema; la cifra mide cuánto C distinto hay, no cuánto sistema falta.

## 2. Cuadro global por categoría

| Categoría | Funciones | Líneas C | En archivos compartidos | En archivos solo-Emerald |
|---|---:|---:|---:|---:|
| Heredable: idéntica a FireRed y ya en el port | 2.625 | 31.287 | 2.625 / 31.287 | 0 / 0 |
| Idéntica a FireRed, pendiente en FireRed | 1.052 | 14.340 | 1.052 / 14.340 | 0 / 0 |
| Variante: cuerpo distinto, FireRed ya en el port | 2.917 | 73.936 | 2.917 / 73.936 | 0 / 0 |
| Variante: cuerpo distinto, FireRed pendiente | 763 | 25.149 | 763 / 25.149 | 0 / 0 |
| Movida: solo en este archivo de Emerald, pero el nombre existe en otro .c de FireRed | 945 | 19.068 | 616 / 13.070 | 329 / 5.998 |
| Nueva: solo en Emerald, sin homólogo en FireRed ni en el port | 7.287 | 137.480 | 3.369 / 58.016 | 3.918 / 79.464 |
| Solo en Emerald pero el nombre ya existe en el port | 43 | 628 | 38 / 495 | 5 / 133 |

Cada celda de las dos últimas columnas es funciones / líneas.

## 3. Por sistema

### 3.1 Sistemas exclusivos de Emerald (archivos que FireRed no tiene)

Agrupación de `refs/emerald/systems.json`. Todo es código nuevo salvo el que ya tenga nombre en el port.

| Sistema | Archivos | Funciones | Líneas C (funciones) | Líneas del archivo | Nuevas sin homólogo | Movidas desde otro .c de FireRed | Tandas (cota alta) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Otros archivos exclusivos (37, ver 3.3) | 37 | 1.076 | 21.720 | 33.330 | 17.093 | 4.606 | 14,5 |
| Frente de Batalla (arena, domo, fábrica, palacio, pirámide, pike, torre, aprendiz, Trainer Hill) | 14 | 734 | 16.877 | 25.594 | 16.653 | 195 | 11,1 |
| PokéNav y Match Call | 15 | 628 | 9.404 | 14.453 | 9.346 | 45 | 6,3 |
| Concursos de Pokémon | 7 | 558 | 10.580 | 13.292 | 10.535 | 45 | 5,8 |
| TV y personajes (Anciano de Mauville, Dewford Trend, Lilycove Lady, Walda) | 6 | 368 | 8.145 | 10.035 | 8.093 | 52 | 4,4 |
| Pokécubos y bayas (blender, pokeblock) | 5 | 245 | 6.007 | 8.924 | 5.847 | 96 | 3,9 |
| Escenas de historia (Rayquaza, Torre Espejismo, teleférico, braille, puertas giratorias) | 8 | 184 | 4.460 | 7.475 | 4.269 | 191 | 3,2 |
| Combates grabados y mezcla de récords (enlace) | 4 | 258 | 4.974 | 5.874 | 4.212 | 762 | 2,6 |
| Reloj y RTC (siirtc, wallclock, eventos de tiempo) | 6 | 102 | 1.737 | 2.854 | 1.725 | 6 | 1,2 |
| Bases secretas | 1 | 99 | 1.691 | 2.074 | 1.691 | 0 | 0,9 |
| **Total** | **103** | **4.252** | **85.595** | **123.905** | **79.464** | **5.998** | **53,9** |

La columna *Tandas* usa las líneas del archivo entero (incluye tablas de datos y gráficos que el exportador ya podría generar), por eso es una cota alta.

### 3.2 Sistemas de los archivos compartidos con FireRed

Archivos con el mismo nombre en los dos decomps, agrupados por sistema con reglas de nombre (heurística, sin garantías: un archivo mal clasificado cae en *Otros*).

| Sistema | Archivos | Heredables (fn / líneas) | Variantes a portar (fn / líneas) | Nuevas (fn / líneas) | Movidas desde otro .c de FireRed (fn / líneas) | Idénticas pend. en FireRed (fn) |
|---|---:|---:|---:|---:|---:|---:|
| Combate | 43 | 1.054 / 15.427 | 1.146 / 40.977 | 314 / 5.635 | 30 / 850 | 9 |
| Mundo / campo / scripts | 52 | 766 / 5.818 | 1.132 / 15.748 | 1.473 / 21.923 | 70 / 877 | 84 |
| Menús y pantallas | 30 | 276 / 2.682 | 467 / 11.137 | 1.008 / 20.058 | 405 / 7.994 | 22 |
| Enlace / inalámbrico / minijuegos (fuera de la meta) | 31 | 66 / 653 | 598 / 20.482 | 250 / 5.666 | 85 / 2.773 | 786 |
| Hardware / runtime / sonido | 28 | 281 / 3.580 | 194 / 4.897 | 49 / 786 | 24 / 565 | 93 |
| Pokémon / datos | 4 | 77 / 1.066 | 75 / 3.286 | 42 / 617 | 1 / 7 | 2 |
| Casino y minijuegos locales | 1 | 0 / 0 | 2 / 14 | 252 / 3.458 | 0 / 0 | 0 |
| Otros archivos compartidos | 18 | 105 / 2.061 | 66 / 2.544 | 19 / 368 | 1 / 4 | 56 |

#### Archivos compartidos con más trabajo (variantes + nuevas, líneas de C)

| Archivo | Idénticas | Distintas (variante) | Nuevas | Movidas | Líneas a revisar o escribir (variantes + nuevas) | Sistema |
|---|---:|---:|---:|---:|---:|---|
| `battle_script_commands.c` | 165 | 116 | 5 | 0 | 6.260 | Combate |
| `event_object_movement.c` | 247 | 383 | 87 | 1 | 5.005 | Mundo / campo / scripts |
| `battle_main.c` | 30 | 47 | 28 | 0 | 4.107 | Combate |
| `easy_chat.c` | 3 | 10 | 217 | 18 | 4.047 | Mundo / campo / scripts |
| `pokedex.c` | 7 | 1 | 132 | 0 | 3.818 | Menús y pantallas |
| `party_menu.c` | 141 | 146 | 41 | 26 | 3.695 | Menús y pantallas |
| `pokemon.c` | 68 | 62 | 31 | 1 | 3.652 | Pokémon / datos |
| `slot_machine.c` | 0 | 2 | 252 | 0 | 3.472 | Casino y minijuegos locales |
| `union_room.c` | 44 | 63 | 4 | 0 | 3.460 | Enlace / inalámbrico / minijuegos (fuera de la meta) |
| `field_specials.c` | 6 | 16 | 154 | 15 | 3.146 | Mundo / campo / scripts |
| `battle_util.c` | 13 | 23 | 4 | 11 | 3.058 | Combate |
| `pokemon_summary_screen.c` | 0 | 3 | 132 | 4 | 2.859 | Menús y pantallas |
| `battle_transition.c` | 47 | 77 | 86 | 0 | 2.802 | Combate |
| `battle_tower.c` | 0 | 12 | 69 | 0 | 2.546 | Enlace / inalámbrico / minijuegos (fuera de la meta) |
| `battle_controller_player.c` | 37 | 69 | 14 | 3 | 2.398 | Combate |
| `field_effect.c` | 36 | 94 | 93 | 2 | 2.382 | Mundo / campo / scripts |
| `berry_crush.c` | 11 | 58 | 3 | 1 | 2.250 | Enlace / inalámbrico / minijuegos (fuera de la meta) |
| `union_room_chat.c` | 1 | 15 | 95 | 11 | 2.111 | Enlace / inalámbrico / minijuegos (fuera de la meta) |
| `intro.c` | 1 | 5 | 61 | 2 | 2.110 | Menús y pantallas |
| `decoration.c` | 0 | 0 | 135 | 0 | 2.080 | Mundo / campo / scripts |
| `trade.c` | 17 | 47 | 18 | 52 | 2.074 | Enlace / inalámbrico / minijuegos (fuera de la meta) |
| `dodrio_berry_picking.c` | 101 | 45 | 3 | 8 | 2.000 | Enlace / inalámbrico / minijuegos (fuera de la meta) |
| `overworld.c` | 105 | 93 | 26 | 0 | 1.918 | Mundo / campo / scripts |
| `battle_ai_script_commands.c` | 3 | 88 | 24 | 0 | 1.900 | Combate |
| `link_rfu_2.c` | 80 | 65 | 3 | 2 | 1.844 | Enlace / inalámbrico / minijuegos (fuera de la meta) |

### 3.2b Archivos compartidos que Emerald reescribió

Archivos con el mismo nombre en los dos juegos donde menos de una cuarta parte de las funciones de Emerald coincide por nombre con FireRed (y hay al menos 50 solo-Emerald). Aquí «solo Emerald» no significa un sistema que falte: el port ya tiene la versión de FireRed (columna *FireRed en el port*) y Emerald es otra implementación del mismo sistema. Cuántas de estas líneas hay que portar de verdad depende de si se quiere la versión de Emerald de esa pantalla o minijuego, y hay que decidirlo por sistema.

| Archivo | Funciones solo-Emerald | Líneas C nuevas | Funciones solo-FireRed | FireRed en el port | Líneas del archivo Emerald |
|---|---:|---:|---:|---:|---:|
| `easy_chat.c` | 235 | 3.861 | 26 | 39/39 | 5.874 |
| `pokedex.c` | 132 | 3.761 | 0 | 8/8 | 5.661 |
| `slot_machine.c` | 252 | 3.458 | 75 | 77/77 | 7.955 |
| `field_specials.c` | 169 | 2.962 | 96 | 118/118 | 4.270 |
| `pokemon_summary_screen.c` | 136 | 2.809 | 134 | 131/137 | 4.183 |
| `battle_tower.c` | 69 | 2.318 | 33 | 45/45 | 3.548 |
| `decoration.c` | 135 | 2.080 | 0 | 0/0 | 2.748 |
| `intro.c` | 63 | 2.005 | 73 | 77/79 | 3.435 |
| `union_room_chat.c` | 106 | 1.837 | 35 | 0/51 | 3.321 |
| `main_menu.c` | 79 | 1.605 | 26 | 29/29 | 2.302 |
| `pokemon_storage_system.c` | 360 | 1.468 | 1 | 21/21 | 10.059 |
| `item_menu.c` | 108 | 1.464 | 102 | 116/116 | 2.596 |
| `region_map.c` | 54 | 1.176 | 134 | 140/140 | 2.027 |
| `player_pc.c` | 81 | 1.027 | 43 | 47/47 | 1.509 |
| `start_menu.c` | 70 | 980 | 55 | 58/65 | 1.439 |
| `menu.c` | 98 | 753 | 24 | 49/49 | 2.147 |
| `item_use.c` | 59 | 708 | 58 | 73/73 | 1.128 |
| `field_screen_effect.c` | 67 | 634 | 9 | 19/19 | 1.266 |
| `tileset_anims.c` | 73 | 472 | 17 | 28/28 | 1.188 |

Suman 35.378 líneas de C «nuevas» en 19 archivos, es decir 25 % de las líneas nuevas de la tabla global.

### 3.3 Los 37 archivos exclusivos agrupados como «otros»

| Archivo | Funciones | Líneas del archivo | Líneas C de funciones nuevas |
|---|---:|---:|---:|
| `pokemon_animation.c` | 240 | 5.544 | 4.210 |
| `roulette.c` | 104 | 4.775 | 2.514 |
| `field_weather_effect.c` | 106 | 2.636 | 69 |
| `battle_anim_throw.c` | 78 | 2.507 | 892 |
| `battle_controller_player_partner.c` | 92 | 1.935 | 1.190 |
| `menu_specialized.c` | 57 | 1.626 | 1.095 |
| `battle_tv.c` | 12 | 1.604 | 1.053 |
| `battle_controller_wally.c` | 81 | 1.570 | 1.149 |
| `fldeff_misc.c` | 62 | 1.326 | 881 |
| `intro_credits_graphics.c` | 20 | 1.172 | 390 |
| `move_relearner.c` | 19 | 959 | 494 |
| `egg_hatch.c` | 25 | 946 | 429 |
| `mystery_gift_view.c` | 18 | 935 | 0 |
| `pokedex_area_screen.c` | 19 | 797 | 572 |
| `starter_choose.c` | 18 | 667 | 291 |
| `pokedex_cry_screen.c` | 14 | 580 | 334 |
| `landmark.c` | 2 | 446 | 49 |
| `anim_mon_front_pics.c` | 0 | 424 | 0 |
| `mystery_event_menu.c` | 6 | 321 | 241 |
| `fonts.c` | 0 | 292 | 0 |
| `libisagbprn.c` | 16 | 257 | 0 |
| `international_string_util.c` | 16 | 233 | 204 |
| `field_region_map.c` | 6 | 215 | 119 |
| `trader.c` | 13 | 215 | 168 |
| `fldeff_escalator.c` | 6 | 193 | 0 |
| `confetti_util.c` | 8 | 181 | 162 |
| `item_icon.c` | 6 | 168 | 101 |
| `lottery_corner.c` | 8 | 168 | 136 |
| `decoration_inventory.c` | 11 | 159 | 137 |
| `gym_leader_rematch.c` | 3 | 105 | 72 |
| `birch_pc.c` | 3 | 88 | 79 |
| `pokedex_area_region_map.c` | 4 | 69 | 50 |
| `text_input_strings.c` | 0 | 64 | 0 |
| `berry_fix_graphics.c` | 1 | 49 | 12 |
| `give_gift_ribbon_to_party.c` | 1 | 38 | 0 |
| `io_reg.c` | 0 | 36 | 0 |
| `reload_save.c` | 1 | 30 | 0 |

Esta lista contiene cosas muy distintas (fuentes, iconos, éclosión de huevos, aprendizaje de movimientos, hardware de depuración): el nombre del archivo no dice si el comportamiento ya existe en el port con otro nombre. Hay que revisar a mano cada uno antes de contarlo como pendiente.

## 4. Enlace e inalámbrico

Los archivos de solo-Emerald con nombre de enlace, grabación o minijuego (8 por coincidencia de nombre: `contest_link`, `contest_link_util`, `battle_controller_recorded_opponent`, `battle_controller_recorded_player`, `record_mixing`, `recorded_battle`, `mystery_event_menu`, `mystery_gift_view`) y la fila de enlace de la tabla 3.2 quedan fuera de la meta principal igual que en FireRed (decisión del usuario, 2026-09-27). Suman 8.037 líneas de archivo. La coincidencia por nombre es una heurística (puede dejar fuera o incluir de más algún archivo); la sección 5 da el total con y sin enlace.

## 5. Estimación de esfuerzo

Unidad: una *tanda* de `AGENTS.md` (un archivo C completo o una familia). En el historial de este repositorio los 38 commits que nombran un `.c` cubren una mediana de 2.264 líneas de C por commit (cuartiles 1.424 y 3.563), medidas con el tamaño del archivo entero, no con lo realmente portado; uso **2.300 líneas por tanda** como referencia.

| Concepto | Líneas C | Tandas (cota alta) |
|---|---:|---:|
| Código nuevo (funciones solo-Emerald sin homólogo) | 137.480 | 59,8 |
| Variantes de funciones ya portadas (cuerpo distinto) | 73.936 | 32,1 |
| Variantes cuya versión FireRed aún no está portada | 25.149 | 10,9 |
| **Total** | **236.565** | **102,9** |
| De ello, enlace/inalámbrico en archivos compartidos (variantes + nuevas) | 26.144 | 11,4 |
| De ello, enlace/grabación/minijuegos en archivos solo-Emerald (por nombre de archivo) | 5.280 | 2,3 |
| **Total sin enlace** | **205.141** | **89,2** |

Supuestos y límites:

- La cota alta cuenta cada variante como si hubiera que escribirla entera. Una variante suele ser más barata que código nuevo, pero **no tengo una medida** de cuánto: no inventarla.
- No incluye datos que el exportador genera (mapas, tilesets, especies, movimientos, scripts): el informe `docs/EXPORTADOR-EMERALD.md` trata ese coste aparte y está sin verificar.
- No incluye la separación `core/` + `games/` (`docs/SEPARACION-MOTOR.md`), que es previa y aplica también a FireRed.
- Ni la validación en navegador ni el audio: cada sistema nuevo necesita sus propias comprobaciones.

## 6. Comprobaciones hechas al generar

- functions.json: totales por estado = totals ({'identical': 3677, 'different': 3680, 'emerald_only': 8275, 'firered_only': 2257})
- summary.json frente a functions.json: 310/310 archivos coinciden
- systems.json: 103 archivos; coincide con los 103 de solo-Emerald: True
- archivos 'solo Emerald' que existen en pokefirered/src con el mismo nombre: 0 []
- líneas de inicio de función coincidentes con functions.json (±1): 15632/15632
- archivos Emerald sin fuente localizada: []
- Discrepancia en la documentación previa: `docs/VISION.md` habla de 3.707 funciones con cuerpo distinto y `docs/SEPARACION-MOTOR.md` de 3.680. `functions.json` da **3.680** (más 885 con el mismo nombre en otro archivo, que aquí no se cuentan); la cifra de 3.707 queda sin reproducir.
- «Idéntica» es comparación de texto con comentarios y espacios ignorados. Reutilizarla sin leer es la hipótesis más optimista.

## 7. Cómo regenerar

```bash
npm run refs:fetch -- pokeemerald   # fuente fijada en el commit de tools/refs/sources.json
python3 tools/emeraldGap.py          # reescribe este informe
python3 tools/emeraldGap.py --check  # solo las comprobaciones
```
