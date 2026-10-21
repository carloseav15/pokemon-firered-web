# Mundo unificado: decisiones de diseño

> Prioridad actual (2026-10-21): [HOJA-DE-RUTA.md](HOJA-DE-RUTA.md).
> Este documento conserva propuestas y referencias históricas; su orden y sus
> reglas modernas no son requisitos activos. El mundo unificado es la meta;
> contenido original verificable e interfaz en inglés primero.

Estado: **propuesta histórica de diseño (2026-10-15)**. La meta de mundo unificado
está confirmada; estas reglas concretas no lo están por esa confirmación. La
primera versión prioriza contenido original según HOJA-DE-RUTA.md. Las cifras
de niveles son objetivos propuestos, **no datos medidos**.

## 1. Objetivo

Un solo juego con Kanto, Johto y Hoenn en un mundo conectado:

- región inicial elegible;
- 24 gimnasios y las Ligas en el orden que quiera el jugador;
- combate con reglas modernas seleccionadas (sin Mega, Z, Dynamax ni Tera);
- fidelidad de datos y apariencia a FireRed, Crystal/HnS y Emerald.

Principio: **clásico en exploración, moderno en combate, libre en progresión.**

## 2. Decisiones propuestas

### Mundo y exploración

| Tema | Propuesta |
|---|---|
| Región inicial | Elegible (o aleatoria opcional). El starter es obligatorio solo en la región inicial. |
| Conexión | Kanto y Johto continuos (canon); Hoenn unida por mar. Un mundo para el jugador, cargado por sectores. |
| Viajes entre regiones | Se desbloquean tras la 2.ª medalla global. |
| Obstáculos | Habilidades de exploración como flag global (`ability.surf`...), obtenibles en cualquiera de los tres eventos equivalentes; no ocupan movimiento. |
| NPC y misiones | Opcionales; nada bloquea el avance. Paquete de Oak: misión opcional. |
| Rival | Encuentro narrativo por lugar, solo la primera vez que se cruza su zona; no se fuerza al llegar a la región. |
| Interiores | Warps y transiciones originales (ya escritos en el visor, falta validarlos). |
| Viaje rápido | Fly a ciudades visitadas; entre regiones, una vez alcanzadas. |
| Día/noche | Diferido; las tablas de encuentros deben llevar ya el campo de franja. |
| Pokémon visibles en el mundo | Descartado. |

### Combate y gimnasios

| Tema | Propuesta |
|---|---|
| Motor | FireRed como base técnica. |
| Reglas modernas | Split físico/especial por movimiento, Fairy, clima temporal; Frostbite y terrenos por evaluar. |
| Rebalanceo de especies | Fuera de alcance inicial. |
| Gimnasios | Cuatro etapas por líder según medallas globales (0-3, 4-7, 8-15, 16-23), con ajuste de nivel dentro de la etapa; la identidad del líder se conserva. Empezar con un líder. |
| Ligas | Una Meseta Añil con dos circuitos (Kanto y Johto), Hoenn con la suya, campeonato interregional final. Una Liga debe ser más difícil que un gimnasio. |
| Salvajes y entrenadores normales | Nivel por zona; no escalan. Revanchas progresivas. |
| Equipo al viajar | Sin restricción; un equipo fuerte en una zona inicial simplemente es fuerte. |
| Medallas | Progreso y reconocimiento, sin bonos de combate. |
| Experiencia | Nivel máximo 100; curva global a diseñar **después** de medir los niveles reales de las tres fuentes. |
| IA | La original por ahora; Experto/Maestro más adelante. |

### Finalización

1. **Campeón regional:** ocho medallas y circuito de su región.
2. **Campeón de las tres regiones:** los tres circuitos.
3. **Campeón definitivo:** campeonato interregional.

## 3. Arquitectura funcional

Seis sistemas independientes de la región, con nombres que evitan confundirlos:

| Sistema | Responsabilidad |
|---|---|
| Mundo | Mapas, regiones, conexiones, transporte, exploración. |
| Historia y flags | Eventos, misiones, medallas, desbloqueos; espacios de nombres por región más una capa global y otra de exploración. |
| Combate | Reglas, estadísticas, movimientos, habilidades, estados. |
| Entrenadores | Equipos, IA, revanchas. |
| Ligas | Gimnasios, Altos Mandos, campeones, torneos; es el único que conoce la región para elegir circuito. |
| Curva de nivel | Experiencia, niveles y equilibrio global. |

No hace falta construir seis capas de golpe; cada módulo se crea cuando una fase lo
necesita. Cada dato transformado conserva su fuente (`firered`, `emerald`, `hns`,
`crystal`).

## 4. Reglas oficiales frente a reglas del mundo unificado

Se mantienen dos configuraciones y **los modos fieles no se modifican**, para poder
seguir comparando el port con el original (regla de oro de [VISION.md](VISION.md)).

| Regla | FireRed original | Mundo unificado |
|---|---|---|
| Split físico/especial | Por tipo | Por movimiento |
| Fairy | No | Sí |
| Clima | Gen 3 | Temporal moderno |
| EV/IV | Originales | Originales, editables |
| Gimnasios | Equipos fijos | Cuatro etapas |
| Nivel máximo | 100 | 100 |
| Mega/Z/Dynamax/Tera | No | No |

## 5. Fases y criterio de aceptación

| Fase | Trabajo | Criterio |
|---|---|---|
| 0 | Cerrar warps de interiores del visor | Smoke jobs en navegador, `check:warps` y commit. |
| 1 | Modelo de progreso y datos comunes | Flags de las tres regiones independientes y persistentes. |
| 2 | Primer gimnasio completo (Kanto) | Derrotar a Brock, recibir medalla, guardar y cargar. La medalla ya usa el modelo de la fase 1. |
| 3 | Reglas modernas | Split, Fairy y clima pasan pruebas deterministas; el modo FireRed fiel sigue igual. |
| 4 | Mundo conectado | Viajar entre las tres regiones sin perder progreso. |
| 5 | Gimnasios y Ligas | Los 24 líderes eligen bien su etapa. |
| 6 | Curva de experiencia | Simulaciones validan la progresión sin exigir una ruta. |

Después de cada fase se repite una prueba de regresión del motor original.

## 6. Riesgos conocidos

- **Núcleo de Emerald:** ejecutar scripts y entrenadores de Hoenn y de Johto (HnS) exige
  cerrar el hueco documentado en [EMERALD-BRECHA-NUCLEO.md](EMERALD-BRECHA-NUCLEO.md).
  Tener los mapas no basta; hoy Johto y Hoenn son visuales/explorables, no jugables.
- **HnS no es canon GSC/HGSS:** es una adaptación (seguidores, MO libres, reglas
  propias). Hay que decidir qué conservar y mantener Crystal/HGSS como referencia.
- **Techo de especies:** 386 (generación 3), aunque los catálogos traigan más.
- **Contenido nuevo inevitable:** el puente marítimo Hoenn↔Kanto/Johto no existe en
  ninguna ROM.
- **Niveles:** los rangos de líderes difieren por región (aprox. Kanto hasta ~50,
  Johto ~40, Hoenn ~55); hay que extraerlos de los datos antes de fijar la curva.
- **Licencias y créditos** de HnS y de las fuentes comunitarias: revisar antes de
  redistribuir.

## 7. Decisiones abiertas

1. Confirmar la conexión del mundo (continuo con Hoenn por mar frente a regiones
   separadas con transporte).
2. Umbral de desbloqueo de viajes (2.ª medalla propuesta).
3. Dónde se alojan los dos Altos Mandos de la Meseta Añil.
4. Qué cambios de HnS sobre Crystal se conservan.
5. Frostbite y terrenos: incluir o no.

## 8. Recursos

Mapa de recursos y herramientas: [ATLAS.md](ATLAS.md), `refs/MANIFEST.md`,
[REPOS-COMUNITARIOS.md](REPOS-COMUNITARIOS.md).
