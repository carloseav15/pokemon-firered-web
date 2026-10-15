# Diseño: categoría por movimiento y tipo Hada

Especificación de trabajo (2026-10-15), **sin implementar**. Se apoya en las mediciones de `out/`:
[RULES.md](out/RULES.md), [SPLIT_CONSUMERS.md](out/SPLIT_CONSUMERS.md) y [FLAG_SPACES.md](out/FLAG_SPACES.md).
Lo medido está citado con `archivo:línea`; lo demás es propuesta y se marca como tal.

## 1. Principios

1. **El modo fiel de FireRed no cambia.** Las reglas nuevas viven en un perfil seleccionable; con el perfil
   `gen3` el motor debe dar exactamente los mismos resultados que hoy.
2. **No se editan datos generados** (`public/fr/`, `src/games/firered/generated/`). Los cambios de datos son una
   superposición (*overlay*) generada por script y aplicada al cargar.
3. **Un único predicado** decide la categoría; ningún sitio vuelve a mirar el tipo por su cuenta.
4. **Las reglas no leen flags regionales crudas.** Hoy el combate lee flags de FireRed (ver §5); en el mundo
   unificado eso debe pasar por el modelo de progreso.

## 2. Mecanismo de reglas

Un objeto `BattleRules` en el núcleo de combate (`src/core/battle/rules.ts`, nuevo), con perfil por defecto `gen3`:

```ts
interface BattleRules {
  profile: "gen3" | "unified";
  isPhysical(move: number, moveType: number): boolean;   // gen3: moveType < TYPE_MYSTERY
  isSpecial(move: number, moveType: number): boolean;    // gen3: moveType > TYPE_MYSTERY
  statBadgeBoosts: boolean;                              // gen3: true
}
```

Con `unified`, `isPhysical/isSpecial` consultan la categoría del movimiento y `statBadgeBoosts` es `false`.

### Sitios que cambian (medidos)

| Sitio actual | Función | Cambio |
|---|---|---|
| `src/core/battle/cmds/part1.ts:255` | `Cmd_accuracycheck` (Hustle) | `IS_TYPE_PHYSICAL(type)` → `rules.isPhysical(move, type)` |
| `src/core/battle/cmds/part1.ts:696` | `Cmd_datahpupdate` (Counter) | ídem |
| `src/core/battle/cmds/part1.ts:702` | `Cmd_datahpupdate` (Mirror Coat) | `!isPhysical` → `isSpecial` (ver nota) |
| `src/core/battle/damage.ts:59` | `CalculateBaseDamage` (objeto que sube un tipo) | por categoría del movimiento |
| `src/core/battle/damage.ts:98` | `CalculateBaseDamage` (rama física) | `isPhysical` |
| `src/core/battle/damage.ts:115` | `CalculateBaseDamage` (rama especial) | `isSpecial` |

Equivalen uno a uno a los 6 sitios de FireRed en `src/battle_script_commands.c` y `src/pokemon.c`.
En `damage.ts:113`, `type === TYPE_MYSTERY → daño 0` no decide la categoría y se conserva.

Nota: en el original, `IS_TYPE_SPECIAL(t)` es `t > TYPE_MYSTERY` y `!IS_TYPE_PHYSICAL` también incluye `???`.
Con categoría por movimiento hay que decidir qué hace un movimiento de categoría *estado* en esas ramas
(en la práctica no llega: no inflige daño). Propuesta: tratarlo como ni físico ni especial.

## 3. Datos: categoría por movimiento

**Fuente propuesta:** `refs/platinum/moves.json` (campo `class`), contrastada con Showdown: 53 de 215 movimientos
cambian y coinciden exactamente con los 53 cambios de categoría de Gen 4 de Showdown.

- **Overlay** `category: Record<moveId, "physical" | "special" | "status">` para los ids 1..354, generado por un
  script nuevo a partir de esas dos fuentes. Se aplica en el cargador (`src/core/rom.ts`), que hoy ya expone
  `rom.moves[i]`.
- **Hidden Power:** su tipo depende de los IV; en Gen 4+ su categoría es fija, no por tipo. Se toma de Platinum.
  *No verificado todavía:* qué categoría da Platinum para Hidden Power y Weather Ball (hay que mirarlo antes).
- **Opción conmutable** (como `optionStyle` en HnS): fuera del alcance inicial; el perfil se fija por partida.

## 4. Hada

| Elemento | Qué cambia | Fuente de datos |
|---|---|---|
| Id de tipo | `TYPE_FAIRY = 18` (tras `TYPE_DARK = 17`); HnS usa el mismo | HnS `include/constants/pokemon.h:24` |
| Nombre | 19.ª entrada de `rom.typeNames` (hoy 18) | – |
| Tabla de efectividad | +12 filas; −2 filas (ver abajo) | `out/RULES.md` §3 |
| Especies | 18 de las 386 cambian de tipo (Clefairy, Jigglypuff, Togepi, Marill, Ralts, Snubbull, Mawile, Mr. Mime y sus líneas) | Showdown `changes.gen6.types` |
| Movimientos | 3 pasan a Hada: Charm, Moonlight, Sweet Kiss | Showdown `changes.gen6.type` |
| Iconos y texto | icono de tipo en resumen, Pokédex y selección de movimiento | **requiere arte**; HnS ya lo trae |

**Tabla de efectividad** (`rom.typeEffectiveness`, tripletas ataque/defensa/multiplicador; 5 = resistido, 20 =
superefectivo, 0 = sin efecto). Las filas nuevas deben ir **antes** de la marca `TYPE_FORESIGHT` (0xFE):

| Ataca → defiende | Mult. | | Ataca → defiende | Mult. |
|---|--:|---|---|--:|
| Hada → Lucha | 20 | | Veneno → Hada | 20 |
| Hada → Dragón | 20 | | Acero → Hada | 20 |
| Hada → Siniestro | 20 | | Lucha → Hada | 5 |
| Hada → Fuego | 5 | | Bicho → Hada | 5 |
| Hada → Veneno | 5 | | Siniestro → Hada | 5 |
| Hada → Acero | 5 | | Dragón → Hada | 0 |

Filas que **se eliminan** (Acero deja de resistir): `GHOST → STEEL (5)` y `DARK → STEEL (5)`; existen hoy en la tabla
de FireRed. HnS deja a Hada sin resistir Bicho como decisión propia (`src/battle_main.c`, comentario junto a las filas);
la tabla de Showdown sí lo hace resistir, y aquí se sigue a Showdown.

**Consumidores a vigilar** (medidos):
- `src/core/battle/cmds/part4.ts:432`: `Cmd_hiddenpowercalc` usa `NUMBER_OF_MON_TYPES - 3`. Si la constante pasa a 19, Hidden
  Power podría salir de tipo Hada. Debe usar un valor fijo de 18.
- `src/core/rom.ts:300` y `controller_player.ts:779`, `message.ts:452`: leen `rom.typeNames[type]`; sin la 19.ª entrada, Hada
  rompe el texto.
- `src/core/battle/cmds/part1.ts:398,436` y `ai.ts:1009`: recorren la tabla hasta `TYPE_ENDTABLE`; no necesitan cambios si las filas
  se insertan antes de la marca.
- `src/core/battle/cmds/part3.ts:1533`: `Cmd_settypetorandomresistance` usa `rom.typeEffectiveness.length`; revisarlo con la
  tabla más larga.

## 5. Dependencias fuera de la categoría

El combate lee flags de FireRed directamente a través de `@game/save`:

| Sitio | Efecto |
|---|---|
| `src/core/battle/damage.ts:52-55` | Bonos de medalla: Ataque (medalla 1), Defensa (5), Ataque Esp. y Def. Esp. (7), +10 % |
| `src/core/battle/main.ts:804` | Bono de Velocidad (medalla 3) |
| `src/core/battle/util.ts:2143-2146` | Obediencia por medallas (2, 4 y 8) |

La decisión tomada es que las medallas **no den bonos de combate**. Hay que implementarla como `statBadgeBoosts = false` en el perfil
`unified`. La **obediencia** no tiene aún regla propia (decisión abierta): con medallas regionales y un modelo de progreso
global, `util.ts:2143` no puede seguir leyendo `FLAG_BADGE0x_GET` de FireRed.

## 6. Pruebas

**A. Fidelidad (perfil `gen3`).** Antes de tocar nada, fijar una prueba de caracterización: una malla fija de entradas a
`CalculateBaseDamage`, `Cmd_datahpupdate` y `Cmd_accuracycheck` con RNG fijo, guardada como referencia. Tras introducir
`BattleRules` con el perfil por defecto, el resultado debe ser idéntico. *Nota:* el oráculo diferencial de `tools/oracle/`
no cubre estas funciones hoy (no aparecen en sus especificaciones), así que habría que añadirlas o usar la malla propia.

**B. Reglas nuevas (perfil `unified`)** con los valores esperados **calculados desde los datos**, no escritos a mano:
1. Los 53 movimientos cambian de categoría y los 162 restantes no (coincide con Showdown).
2. Un movimiento físico de tipo antes especial (Crunch, Waterfall) usa Ataque y la Defensa del defensor.
3. Counter devuelve daño de un movimiento de categoría física aunque su tipo fuese «especial» en Gen 3, y Mirror Coat al revés.
4. Hustle penaliza la precisión de movimientos físicos por categoría.
5. Hada: las 12 filas nuevas dan el multiplicador esperado, `DARK → STEEL` y `GHOST → STEEL` pasan a neutros, y Hidden Power
   nunca devuelve Hada en 256 combinaciones de IV.
6. Con `statBadgeBoosts = false`, tener las medallas no altera las estadísticas.

## 7. Orden de trabajo

| Paso | Contenido | Criterio de aceptación |
|---|---|---|
| 0 | Prueba de caracterización del modo fiel (§6.A) | Referencia guardada y reproducible |
| 1 | `BattleRules` con perfil `gen3` y los 6 sitios apuntando al predicado | La referencia sigue idéntica; `check:port` y `check:honesty` pasan |
| 2 | Overlay de categoría + selección de perfil | Pruebas §6.B.1 a 4 |
| 3 | Hada: id, nombre, tabla, especies, movimientos, Hidden Power fijo | Pruebas §6.B.5 |
| 4 | Bonos de medalla desactivados en `unified` | Prueba §6.B.6 |
| 5 | UI: icono de Hada y, opcionalmente, icono de categoría | Revisión visual (diferida) |

## 8. Decisiones abiertas

1. Perfil fijo por partida frente a opción en el menú (como `optionStyle` de HnS).
2. Categoría de Hidden Power y Weather Ball (leer Platinum).
3. Regla de obediencia sin medallas.
4. Arte del icono de Hada: reutilizar el de HnS o dibujarlo (revisar licencia).
5. Si las revanchas y los equipos por etapa dependen del perfil de reglas.

## 9. Fuera de alcance

IA nueva, Frostbite, terrenos, Mega/Z/Dynamax/Tera, rebalanceo de especies, y cualquier cambio de la fórmula de daño más
allá de la categoría.
