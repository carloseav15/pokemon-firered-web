# Curva de experiencia y modelo de progreso

Resultados y diseño de la tanda del 2026-10-15. Datos generados en `out/`; este documento los interpreta.
Todo lo medido sale de los decomps; lo propuesto está marcado como propuesta.

## 1. Curva de experiencia

Fuente: `extract_curve.py` → `out/CURVE.md`, `out/curve.json`. Solo cuenta la XP **finita** de
entrenadores (fórmula gen 3, un participante: `floor(1,5 × expYield × nivel / 7)`); la XP de salvajes es
ilimitada y no se mide. Verificado a mano con Brock: 221 + 324 = 545 XP.

| Fuente | Entrenadores | XP total | Nivel si toda va a 1 Pokémon | Nivel si se reparte entre 6 |
|---|--:|--:|--:|--:|
| FireRed | 455 | 953.781 | 98 | 54 |
| Emerald | 502 | 689.691 | 88 | 48 |
| Heart & Soul | 407 | 1.214.020 | 100 | 58 |
| **Las tres** | 1.364 | 2.857.492 | 100 | **78** |

Lectura (propuesta, no medida):

- Un equipo de 6 que reciba **toda** la XP de entrenadores de las tres regiones llega a ~78, no a 100. Con
  Repartir Experiencia más grind de salvajes el nivel 100 sí es alcanzable, pero **no por XP de historia**.
- Dos riesgos distintos: un Pokémon que concentre la XP (el único que lucha) sí pasa del 98 con una sola
  región, y la mezcla de tres regiones multiplica por ~3 la XP disponible respecto a una.
- La escalera real de aces (11 → 50, `STAGES.md`) y el techo de las revanchas (66–75) y del combate posterior de Steven (78) dejan **mucho margen** entre
  el 50 y el 100: no hace falta acelerar la XP, hace falta decidir qué ocurre entre el 50 y el 78.
- Antes de tocar fórmulas faltaría medir la **XP de salvajes** por zona; es la variable que decide si el
  jugador sobrepasa la curva.

## 2. Espacios de flags y variables

Fuente: `extract_flag_spaces.py` → `out/FLAG_SPACES.md`, `out/flag_spaces.json`, `out/flag_ids.json`.

| Par | IDs de flag comunes | Con el mismo nombre | **Colisiones vivas** (flags) | Colisiones vivas (vars) |
|---|--:|--:|--:|--:|
| FireRed ↔ Emerald | 1.393 | 42 | **147** | 28 |
| FireRed ↔ HnS | 1.391 | 31 | **212** | 60 |
| Emerald ↔ HnS | 1.538 | 764 | **243** | 32 |

«Viva» = ambos juegos usan el ID en scripts con nombres distintos. Un único espacio compartido corrompería
el estado: por ejemplo `FLAG_HIDE_MOLTRES` (FireRed) y `FLAG_RESCUED_BIRCH` (Emerald) son el mismo número.
Incluso Hoenn y Johto, aunque HnS parte de Modern Emerald, chocan en 243 flags.

Y al revés: 73 flags de FireRed↔Emerald tienen el mismo nombre con distinto ID (p. ej. `FLAG_BADGE01_GET` =
2080 en FireRed y 2151 en Emerald), así que no se pueden copiar por número.

## 3. Modelo de progreso

Código: `progress/progress.ts`; comprobación: `progress/progress.check.ts`.

| Capa | Estado guardado | Qué contiene |
|---|---|---|
| Regional | Sí | Un espacio de flags y variables por fuente (`kanto`=FireRed, `johto`=HnS, `hoenn`=Emerald). Los scripts de cada juego usan sus IDs originales sin cambios. |
| Derivada | No (se calcula) | Medallas por región y totales; habilidades de exploración. |
| Exploración | Sí | Mapas visitados y puntos de Fly por región; enlaces entre regiones desbloqueados. |

Decisiones de diseño:

- **Las medallas y las habilidades se derivan**, no se copian. Así no pueden desincronizarse y no hace falta
  un sistema de eventos.
- **Una habilidad (Surf, Cortar…) se desbloquea con el evento equivalente de cualquier región** y se comprueba
  en la capa de movimientos de campo; no se escribe la flag de HM en las otras regiones, para no alterar sus
  historias.
- **Persistencia:** solo flags < 0x4000 y variables en [0x4000, 0x8000). Las flags especiales y las variables
  de trabajo `VAR_0x8000…` no se guardan. Las temporales se limpian al cargar un mapa, como en el original.
- **Nombres inexistentes lanzan error** en vez de leerse como «no activada».
- El guardado tiene versión y es determinista (listas ordenadas).

### Comprobado (`progress.check.ts`, con los IDs reales exportados)

1. Aislamiento con una colisión real (FireRed `FLAG_HIDE_MOLTRES` ↔ Emerald `FLAG_RESCUED_BIRCH`).
2. Medallas por región y suma global; un ID de otra región no cuenta.
3. Habilidad concedida por Hoenn sin tocar las flags de Kanto.
4. Limpieza de temporales; los rangos especiales no se guardan.
5. Criterio de la fase 1: medalla en Kanto → visita a Johto → medalla allí → ida y vuelta, con guardado y
   recarga idénticos.
6. 47 nombres de flag que usa el modelo existen en los datos de su región.

### No comprobado

- No está conectado al motor ni al visor: hoy el guardado de FireRed (`src/games/firered/save.ts`) sigue
  siendo el único. Falta el adaptador que enlace `FlagGet/VarGet` de cada juego a su `RegionScope`.
- Waterfall de FireRed se detecta por la flag de ocultación del objeto (se activa al recogerlo); no se ha
  verificado en juego.
- Dive no existe en FireRed; Hoenn y Johto sí lo tienen.
- La lista de candidatos globales (14 nombres) coincide por nombre; falta confirmar su significado.

## 4. Siguiente paso técnico

Conectar el modelo: sustituir el almacén de flags de `save.ts` por un `RegionScope` para Kanto, manteniendo
la API `FlagGet/FlagSet/VarGet/VarSet`, y comprobar que el guardado de FireRed sigue cargando. Es un cambio
en una API compartida, así que requiere revisar todos sus consumidores antes de hacerlo.
