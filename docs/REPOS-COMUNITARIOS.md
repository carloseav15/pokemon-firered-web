# Repositorios comunitarios para el motor común y el mundo unificado

Informe de Codex, 2026-10-02. Recoge los enlaces propuestos por el usuario y la
investigación de esta conversación para que Claude u otro agente pueda retomarla.
Es investigación para [VISION.md](VISION.md), no una nueva tanda de portado ni una
autorización para cambiar el alcance o las prioridades actuales.

## 1. Contexto y alcance de la revisión

Meta: un motor web TypeScript con FireRed y Emerald fieles, contenido de Johto
adaptado a estética GBA, reglas modernas opcionales y, después, un mundo único
con libertad de recorrido. Las mejoras comunitarias no sustituyen las fuentes
de verdad de los modos fieles ni deben introducirse en ellos por defecto.

Se leyeron README, documentación seleccionada, árboles Git y algunos archivos C
y JSON. **No se compiló ningún proyecto externo, no se ejecutaron sus pruebas,
no se jugaron sus campañas y no se compararon exhaustivamente sus cuerpos C.**
Las pruebas y cifras publicadas por sus autores se identifican como tales.
Las copias de investigación en `/tmp/pokemon-review` son temporales: este informe
es la referencia persistente; no asumir que esas copias existirán en otra sesión.

Grados de evidencia usados:

- **Código/árbol:** se inspeccionó el archivo o su presencia en el árbol Git.
- **Documentación:** lo declara el proyecto; ejecución no verificada aquí.
- **Hipótesis:** posible utilidad que exige una revisión posterior.
- **Inaccesible:** no se pudo consultar la fuente; no implica que haya desaparecido.

## 2. Fuentes y revisiones observadas

Los commits son referencias de la inspección, **no fuentes añadidas ni aprobadas
en `tools/refs/sources.json`**. Las primeras lecturas de algunos README se hicieron
contra HEAD; los SHA siguientes se obtuvieron del árbol de GitHub. Para repetir
el análisis, leer directamente el SHA y registrar cualquier diferencia.

| Fuente | Revisión observada | Evidencia y uso propuesto |
|---|---|---|
| [Rangi42/polishedcrystal](https://github.com/Rangi42/polishedcrystal) | `9b25b5273f11942ef7013b28ce04272035a24da8`, `master` | README y raíz; Johto mejorado y diseño de interfaces |
| [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion) | `dfb0f84374230f4d462191601179b742f9f077df`, `master` | README, FEATURES y raíz; reglas modernas y herramientas |
| [Pokabbie/pokeemerald-rogue](https://github.com/Pokabbie/pokeemerald-rogue) | `5ccb74cf1ef2c0349dfa5d70883b030bbc9ff803`, `vanilla` | Árbol y archivos C seleccionados; sistemas dinámicos |
| [unsupo/Pokemon-World-GBA](https://github.com/unsupo/Pokemon-World-GBA) | `d321875130d45ee859127345e1a00fd316f09450`, `master` | README, árbol, regiones y registro de mapas |
| [evilchinesefood/PKMN-World](https://github.com/evilchinesefood/PKMN-World) | `4303e6ddcb8c168f79a424a4875e156a7012dbe3`, `master` | Documentación, árbol, cambio regional, registro de mapas y progreso |
| [AsparagusEduardo/Inclement-Emerald](https://github.com/AsparagusEduardo/Inclement-Emerald) | Sin revisión | HTTP 404 en URL del repo y README raw |
| [rioluwott/ROWE](https://github.com/rioluwott/ROWE) | Sin revisión | HTTP 404 en URL del repo y README raw; confirmado de nuevo en la segunda lista |
| [LOuroboros/pokeemerald-revelation](https://github.com/LOuroboros/pokeemerald-revelation) | Sin revisión | HTTP 404 en URL del repo y README raw |
| [Crystal Clear](https://shockslayer.com/crystal-clear/) | Sin revisión | Proxy del entorno rechazó el acceso con 403 |
| [PokéCommunity 437688](https://www.pokecommunity.com/threads/437688/) | Sin revisión | Proxy del entorno rechazó el acceso con 403 |
| [PokéCommunity 382178](https://www.pokecommunity.com/threads/382178/) | Sin revisión | Proxy del entorno rechazó el acceso con 403 |
| [PokéCommunity 326118](https://www.pokecommunity.com/threads/326118/) | Sin revisión | Proxy del entorno rechazó el acceso con 403 |
| [PokéCommunity 360725](https://www.pokecommunity.com/threads/360725/) | Sin revisión | Proxy del entorno rechazó el acceso con 403 |

No se verificaron los títulos de los cuatro hilos. No asociar sus números a un
hack concreto por memoria ni tratar los enlaces repetidos como fuentes distintas.
Los 404 no permiten distinguir un enlace antiguo de un repo privado o eliminado.

## 3. Hallazgos por proyecto

### 3.1 pokeemerald-expansion: primera referencia para reglas modernas

El README lo describe como **base de desarrollo**, construida sobre pret/pokeemerald,
no como una aventura independiente. README y FEATURES documentan:

- División físico/especial, Hada/Stellar, movimientos, habilidades y objetos
  hasta Gen IX, Mega/Primal y otras mecánicas especiales.
- Especies, formas, estadísticas, habilidades ocultas, crianza y evoluciones
  con condiciones combinables; selección de grupos de especies.
- Entrenadores con EV, IV, naturaleza, habilidad, movimientos y otros atributos;
  importación de equipos en sintaxis de Pokémon Showdown y pools de entrenadores.
- IA para los efectos añadidos, límites de nivel/EV, interfaces de información,
  Pokédex estilo HGSS, seguidores, día/noche y mejoras de comodidad.
- Menús de depuración de campo/combate, visualizador de sprites y pruebas integradas.

**Utilidad:** principal candidato para fase 4. Seleccionar físico/especial, Hada,
Megas, IA y herramientas competitivas según nuestra visión; la presencia de Z,
Dinamax o Tera no obliga a portarlos. Los toggles del proyecto suelen ser de
compilación: no asumir que equivalen a reglas elegibles por partida en nuestro motor.

**Pendiente:** lectura de implementación, comparación contra el Emerald original,
dependencias y port C → TS. No se inspeccionaron aquí los cuerpos del motor de
combate de Expansion. Sus reglas son una implementación comunitaria, no una prueba
de fidelidad oficial de generaciones posteriores.

### 3.2 Polished Crystal: Johto mejorado opcional

El README describe una modificación de la descompilación de Crystal, con división
físico/especial, Hada, naturalezas/habilidades, mejoras de PC/Pokédex, mapas y eventos
nuevos o renovados, revanchas y ajustes de curva de niveles. También describe
opciones de inicio y variantes de compilación.

**Utilidad:** comparar sus encuentros, eventos y mejoras de experiencia cuando
toque un paquete de Johto mejorado. Crystal/HeartGold siguen siendo las referencias
del contenido original. No importar cambios de balance como datos oficiales.

**Límite:** base GBC en ensamblador. No es un módulo C que nuestro generador pueda
portar directamente. Datos y diseño pueden ser útiles; scripts, gráficos y
dependencias requieren conversión. No se revisaron aquí funciones ni mapas concretos.

### 3.3 Emerald Rogue: sistemas dinámicos, no campaña continua de referencia

El README de la rama predeterminada `vanilla` conserva el texto genérico de
pret/pokeemerald. **Eso no significa que el código de Rogue esté ausente.** Se
comprobó su árbol y se leyeron archivos del SHA observado:

| Archivo | Evidencia inspeccionada | Posible uso |
|---|---|---|
| `src/rogue_controller.c` | Hooks de campo/combate, selección de encuentros, dificultad, configuración y recompensas | Reglas opcionales y puntos de extensión; dependencias amplias |
| `src/rogue_adventurepaths.c` | Generación de caminos, salas, conexiones y selección de encuentros | Expediciones o modo adicional |
| `src/rogue_query.c` | Filtros y selección ponderada para especies, objetos, entrenadores y movimientos | Selección dinámica para encuentros/equipos |
| `src/rogue_pokedex.c` | Páginas de datos, movimientos, evoluciones y formas | Pokédex informativa opcional |
| `include/rogue.h` | Declaraciones y estructuras de Rogue | Contratos y dependencias de los sistemas anteriores |

El árbol también contiene `src/rogue_quest.c`, `src/rogue_settings.c`,
`src/rogue_save.c`, `src/rogue_player_customisation.c` y JSON de entrenadores
organizados por región en `src/data/rogue/trainers/`. Su presencia no acredita
que puedan extraerse aisladamente ni que esas regiones tengan campañas completas.

`git ls-remote --heads` confirmó ramas `vanilla`, `expansion` y ramas de desarrollo.
No confundir el nombre `vanilla` con ausencia de modificaciones. Para datos modernos
habrá que revisar la rama Expansion en una versión explícita; no se inspeccionó aquí.

**Utilidad:** componentes elegidos tras resolver dependencias. La estructura de
expediciones roguelike no sustituye el mundo continuo de VISION.md.

### 3.4 Pokemon-World-GBA: README más amplio que la integración confirmada

Su README anuncia Hoenn/Kanto/Johto/Sinnoh, región inicial, ferris, starters
cruzados, modo difícil y revanchas escaladas en siete tramos. Son **afirmaciones
documentales**: no se probaron esas rutas ni las compilaciones Emerald/FRLG.

Inspección concreta del SHA observado:

- `include/regions.h` identifica Kanto por rango de secciones; el resto cae en
  Hoenn. Ese helper no distingue Johto o Sinnoh.
- `src/regions.c` contiene clasificación de subregiones de Kanto.
- `data/maps/map_groups.json` no contiene grupos con nombres Johto/Sinnoh.
- El árbol contiene metatiles GBA de Johto (`johto_general`, `johto_building`,
  `azalea_town`, `ecruteak_city`, `goldenrod`, `new_bark_town`, etc.) y algunos
  recursos de Sinnoh, por ejemplo `jubilife`.
- No se encontraron `map.json` con nombres de muestra Sinnoh/Jubilife/Twinleaf/
  Oreburgh/Hearthome. Es una búsqueda de nombres, no una prueba exhaustiva de ausencia.

**Conclusión:** no se confirmó una campaña Johto/Sinnoh integrada pese a la frase
inicial del README. Tener tilesets no equivale a tener historias jugables. Útil
como catálogo de recursos y experimentos; PKMN-World ofrece evidencia regional
más concreta para nuestro objetivo.

El README acredita gráficos de Johto/Kanto a PokemonHnS-Development/pokemonHnS y
recursos de Sinnoh a LiderMorti00/Sinnoh-pokeemerald-expansion. Esas fuentes no
se inspeccionaron directamente en esta conversación.

### 3.5 PKMN-World: primera referencia para integración multirregional

Documenta Kanto/Johto/Hoenn sobre Expansion. **Se confirmó presencia de código
de integración**, no únicamente un anuncio del README.

Archivos leídos en el SHA observado:

- `src/region_switch.c`: `SetCurrentRegion`, `ResyncCurrentRegionFromMap`,
  `IsRegionChampion`, `SyncDifficultyForRegion`, entrada regional, reaparición,
  depósito de equipo y consultas de medallas/campeonatos. Explica el despacho de
  flags/vars absolutos por región en `GetFlagPointer`/`GetVarPointer`; estos
  accessors no se leyeron aquí, por lo que el aislamiento completo sigue pendiente.
- `include/regions.h`: distingue región del mapa de campaña activa; esta última
  importa dentro del hub. Incluye detección de Johto y declaraciones de refresco
  de objetos día/noche.
- `src/regions.c`: subregiones de Kanto.
- `data/maps/map_groups.json`: grupos de Johto, además de Hoenn y FRLG.
- `data/maps/NewBarkTown/map.json`: conexiones a Route29/Route27, objetos y scripts
  en formato GBA; evidencia de contenido, no prueba de progresión.
- `src/story_progress.c`: deriva estado de las tres campañas de flags, vars,
  medallas y marcas de inicio; incluye tablas regionales y selecciona objetivos.
  Las tablas incluidas no se revisaron íntegramente.

README/FEATURES documentan PC, Pokédex, bolsa y dinero compartidos; medallas,
historia y derrotas de entrenadores por región; save v10 con migración desde v7–v9.
No se inspeccionó el lector de migración ni se ejecutó guardar/continuar.

**Diferencias de diseño con nuestra visión:**

- El hub deposita el equipo en el PC compartido al entrar en otra región; luego
  permite retirarlo. El viaje marítimo Johto ↔ Kanto conserva el equipo.
- MO y obediencia dependen de las medallas de la región activa.
- La dificultad de revanchas sigue al campeón de cada región. Esto no demuestra
  un escalado global que permita cualquier orden de gimnasios.
- Johto usa GARY como rival según su documentación; no asumir fidelidad a GSC/HGSS.
- Restringe familias a Gen 1–3, conservando evoluciones posteriores de esas familias.
- Cambia evoluciones y añade economía de Megas, hub, campeonato y otras decisiones
  propias. No convertirlas automáticamente en requisitos nuestros.

**Estado publicado, no validado por Codex:** README y
`maintenance/final-pass/zone-status.md` declaran 1.190 mapas registrados auditados
estructuralmente: 418 Kanto, 252 Johto, 518 Hoenn y 2 hub. El árbol tiene también
un `map.json` adicional; no confundir conteo de archivos con mapas registrados.
La auditoría publicada excluye determinadas convenciones de warps dinámicos del
control estático. Admite diagnósticos heredados y deja sin verificar recorridos
continuos de campañas/postgame. **100% de cobertura estructural no significa
100% de juego terminado o validado.**

El informe de mantenimiento publica pruebas de emulador y de combate, incluyendo
categorías omitidas/TODO. No se ejecutaron aquí ni se verificaron sus logs. No
usar esas cifras como pruebas de nuestro futuro port.

### 3.6 Fuentes inaccesibles y valoración provisional

- **Crystal Clear:** por su propuesta conocida de Kanto/Johto abiertos, sería
  referencia de orden de gimnasios, escalado y desbloqueos. La web no pudo leerse;
  no se comprobó fuente pública, versión ni posibilidad de reutilizar código.
- **ROWE:** por su propuesta conocida de Hoenn abierto, interesa para progresión
  y exploración. URL 404; no se comprobó implementación ni versión.
- **Inclement Emerald:** candidato conceptual para dificultad, equipos y acceso
  competitivo. URL 404; no se evaluó código ni balance concreto.
- **Emerald Revelation:** URL 404; sin hallazgos técnicos ni recomendación concreta.
- **Cuatro hilos de PokéCommunity:** acceso bloqueado; identificación, fuente,
  licencia y aportes pendientes. No inventar títulos ni características.

## 4. Fuentes adicionales descubiertas y efecto sobre VISION.md

Los créditos de PKMN-World identifican
[PokemonHnS-Development/pokemonHnS](https://github.com/PokemonHnS-Development/pokemonHnS)
(Pokémon Heart & Soul) como upstream del Johto portado: mapas, tilesets, scripts,
entrenadores y sistemas. Sus afirmaciones de identidad de assets por MD5 proceden
de ese documento; **Codex no hizo esa comparación ni leyó el repo HnS**.

Antes de desarrollar el editor Crystal → GBA, evaluar HnS y el contenido de
PKMN-World. Ya hay una representación GBA de Johto candidata a importación, que
puede reducir trabajo gráfico. Falta revisar colisiones, animaciones, fidelidad,
eventos y permisos; el editor sigue siendo útil para diferencias y piezas faltantes.

El README de Pokemon-World-GBA también enlaza
[LiderMorti00/Sinnoh-pokeemerald-expansion](https://github.com/LiderMorti00/Sinnoh-pokeemerald-expansion).
Solo se comprobó esa referencia documental. No demuestra que Sinnoh esté terminado.

Dos matices a la visión actual:

1. Pret no ofrece decomp oficial posterior a Gen 4, pero Expansion sí ofrece
   implementaciones y recursos comunitarios modernos. No sería necesario crear
   toda mecánica posterior desde cero; hay que comprobar reglas y procedencia.
2. Hay integración multirregional pública y Johto con tilesets GBA. Aun así, la
   libertad global, cronología, un Kanto único, reglas y fidelidad web quedan por
   resolver. PKMN-World no reemplaza esas decisiones.

## 5. Cómo continuar la comparación por archivos

El método existente está en [SEPARACION-MOTOR.md](SEPARACION-MOTOR.md),
`tools/refs/emerald_functions.py` y `tools/engineSplit.py`:

- `emerald_functions.py` elimina comentarios/espacios y compara cuerpos de
  funciones con el mismo nombre en el mismo archivo C de Emerald y FireRed.
  Produce `identical`, `different`, `emerald_only`, `firered_only`.
- `engineSplit.py` cruza ese catálogo con nombres de funciones TS, detecta nombres
  encontrados en otros archivos (`moved`, sin comparar sus cuerpos), analiza
  imports y propone núcleo/variantes/contenido específico. Sus umbrales son
  heurísticos; no prueban reutilización ni equivalencia funcional.
- El informe de separación documenta una revisión manual de 17 casos: 11 de
  estilo, 5 de comportamiento y 1 sin clasificar. Es evidencia documental del
  procedimiento, no una muestra nueva ejecutada por Codex ni una estimación global.

`CLAUDE.md` remite a `AGENTS.md`; no contiene un algoritmo privado adicional.
La documentación permite reconstruir el método registrado, no razonamientos o
sesiones de Claude que no estén guardados.

**Procedimiento propuesto para estas fuentes (todavía no implementado):**

1. Fijar SHA, procedencia y base upstream de cada repo. Comparar cada fork contra
   su propia base para aislar aportes; compartir nombres no prueba compartir base.
2. Catalogar archivos, funciones, scripts y datos. Ampliar las herramientas
   existentes para parámetros de fuente; no usar directamente su catálogo Emerald
   como si describiera Expansion o PKMN-World.
3. Emparejar por símbolo/archivo y buscar funciones movidas. Comparar cuerpos como
   filtro inicial. Un archivo puede mezclar código heredado, cambios y novedades.
4. Leer firmas, estructuras, globals, constantes, macros/defines de compilación,
   tablas, callers y comandos de script. C idéntico puede tener otra semántica por
   dependencias; C distinto puede ser equivalente. El parser textual no sustituye
   Clang ni una revisión de ramas de preprocesado.
5. Buscar el equivalente TS y comprobar la ruta de uso. Valorar si ya existe el
   sistema, qué parte falta y cuánto requiere adaptar. La utilidad para la visión
   y la similitud textual son criterios separados.
6. Registrar resultado por archivo/familia y validar comportamiento antes de
   integrarlo. No anunciar un port como validado por compilar o por coincidencia de nombres.

Formato de salida recomendado:

| Fuente + SHA + archivo/símbolo | Base y equivalente C/TS | Evidencia | Cambios de comportamiento | Dependencias | Utilidad para fase | Decisión / validación pendiente |
|---|---|---|---|---|---|---|
| Referencia precisa | Ruta, función y versión | Cuerpo/datos/callers revisados | Detalle concreto | Estado, tipos, IDs, assets | 2–6 | Compartir, adaptar, importar contenido, posponer o descartar |

**Primeras familias candidatas:**

- PKMN-World: `region_switch.c`, `regions.h`, luego despacho regional en
  `event_data.c` y estructuras/lectores de save. Estas últimas son entradas para
  investigar, no archivos ya revisados. Después registros/warps de Johto y specials.
- HnS/PKMN-World: inventario de tilesets, metatiles, colisiones y mapas para decidir
  importación frente a conversión de Crystal.
- Expansion: datos/condiciones de evolución y efectos de combate seleccionados;
  localizar sus rutas en el SHA fijado antes de preparar tandas.
- Rogue: `rogue_query.c` y sus consumidores; solo después selección de equipos o
  encuentros, evitando importar el controlador completo sin resolver dependencias.

## 6. Reutilización, permisos y aislamiento

No se encontró archivo de licencia general en la raíz de los tres primeros repos
accesibles. En los árboles completos de Rogue y los dos World no se encontró
licencia general fuera de herramientas; licencias de `tools/` no cubren el juego.
Es una inspección limitada, no una conclusión legal sobre todos los componentes.

Expansion pide acreditar a RHH/contribuidores. PKMN-World pide conservar créditos
y contiene un aviso de proyecto fan gratuito/no comercial y derechos de terceros.
**Créditos y avisos no equivalen por sí solos a una licencia de reutilización.**
Comprobar permisos por componente, incluidos assets de upstreams, antes de copiar
o distribuir. Código público no implica permiso general; tampoco hace falta
suponer que todos los componentes tienen la misma restricción.

Aplicar `AGENTS.md` y `refs/README.md` al trabajo futuro:

- No ejecutar el exportador FireRed contra otro repo: comparte build/salidas.
- No hacer que `src/` importe `refs/`; las referencias son catálogos/datos separados.
- En `refs/`, salidas generadas con `_meta` y fuentes fijadas; no copiar gráficos,
  audio ni fuente C. Una importación gráfica futura necesita su propio alcance.
- No cambiar commits de fuentes configuradas ni activar nuevas fases por este informe.
- Para port C → TS, preservar ABI GBA, anchos, signo, división, callbacks y estados;
  adaptar los contratos necesarios en vez de sustituir nuestro runtime por un ROM hack.

## 7. Recomendación y límites pendientes

Orden de interés: **PKMN-World para integración**, **HnS como candidato para Johto
GBA**, **Expansion para reglas modernas**, **Polished Crystal para mejoras opcionales**
y **Rogue para sistemas concretos**. Pokemon-World-GBA sirve como referencia
secundaria. Los demás enlaces requieren recuperar acceso o identificar fuente actual.

Mantener la prioridad de cerrar/validar FireRed. Este informe no importa contenido,
no cambia `sources.json`, no ejecuta exportadores ni modifica reglas del juego.
La próxima investigación útil es una comparación con evidencia por archivo de
PKMN-World/HnS, seguida de una estimación de dependencias; todavía no se puede
cuantificar el ahorro ni garantizar fidelidad o campañas completas.

## 8. Triaje de beneficio y cruce `IS_FRLG` (Claude, 2026-10-02)

Segunda pasada sobre clones locales. Se contaron archivos y se leyeron fragmentos;
nada se compiló ni se ejecutó. Revisiones: Expansion `dfb0f84374230f4d462191601179b742f9f077df`
(ahora fuente fijada de `refs/`, R21), PKMN-World `15d3888b0d81322a04d3c71b0bce18948761ee44`
(posterior al SHA de §2), HnS `751823abaf677020bcd72c45fe3e7cb2b8a576e4`, Rogue `5ccb74cf`.

### 8.1 Qué aporta cada uno, por fase

| Repo | Beneficio | Fase | Dato medido |
|---|---|---|---|
| Expansion | Alto | 2–4 | Compila Emerald y FRLG desde el mismo árbol (`make firered`, desde 1.15; su changelog 1.15.0 dice "jugable, pero le faltan funciones"). ~5.000 tests de combate: `SINGLE_BATTLE_TEST` 3.496, `DOUBLE_BATTLE_TEST` 953, `AI_*` 543, `WILD_*` 56, `MULTI_*` 21; más 920 `TEST`. 1.029 carpetas de sprites de especies en `graphics/pokemon`. `migration_scripts/frlg_metatile_behavior_converter.py` traduce comportamientos de baldosa FRLG → Emerald |
| HnS | Alto | 5 | Johto de HGSS con Kanto de postgame, sobre Emerald. 956 `map.json`, unos 200 de Johto (filtro por nombre de ciudad/ruta). Tilesets primarios `johto_*` y `kanto_*`. 176 MIDI `mus_hg_*`. Sin archivo de licencia. Contenido adaptado (50 MT, sin buscaobjetos ni objetos ocultos, otra curva de niveles), no fiel a HGSS |
| PKMN-World | Medio | 6 | Bancos de flags y vars por región en `event_data.c` (en `SaveBlock3`) y `region_switch.c` (539 líneas). Su Johto viene de HnS: para mapas, ir a HnS |
| Rogue | Bajo | 4+ | Solo `rogue_query.c` (2.188 líneas) es aislable; `rogue_controller.c` tiene 10.413 |
| Polished Crystal, Pokemon-World-GBA | Bajo | 5 | Ensamblador GBC (Crystal ya está en `refs/`, R20) / referencia secundaria |

Compatibilidad con nuestras herramientas, comprobada por formato y no por ejecución:

- **Mapas:** HnS y PKMN-World usan `map.json`, `layouts.json` y `map_groups.json` de
  pret, los mismos que lee `tools/decomp/step_maps.py`. Las baldosas usan los
  comportamientos y atributos de Emerald; hay que convertirlas a FRLG (la tabla de
  Expansion sirve de punto de partida, invertida y revisada).
- **Música:** `step_audio.py` lee `.mid` y voicegroups igual que HnS, pero HnS no tiene
  `sound/songs/midi/midi.cfg`; la configuración por canción está en otro sitio.

### 8.2 Cruce `IS_FRLG` con la separación del motor (6.1)

`npm run refs:expansion-frlg` y `python3 tools/engineSplit.py --expansion`:

- 298 pruebas del juego en 270 funciones, más 39 fuera de funciones (tablas y macros).
  182 de esas funciones existen en pokefirered.
- **Ninguna está marcada `identical`** en `refs/emerald/functions.json`: Expansion no
  separa nada que el catálogo textual dé por igual. No aparece ningún caso del
  riesgo R1 de la 6.1 por esta vía (no prueba que no los haya).
- **19 funciones están en módulos que la 6.1 llama núcleo puro.** Candidatas a
  variante en la fase 3:
  - `hw/bg`: `InitBgFromTemplate`, `InitBgsFromTemplates`, `ResetBgsAndClearDma3BusyFlags`.
    Es el mapa de reserva de tiles `gpu_tile_allocation_map_bg`, que pret FireRed tiene
    (`bg.c:44`, usado en 305–356) y pret Emerald no. **Resuelve el caso "sin
    clasificar" de la 6.1 (`BgTileAllocOp`): es una diferencia de comportamiento.**
  - Combate: `HandleTurnActionSelectionState`, `HandleAction_WatchesCarefully`
    (`battle/main`), `HandleMoveSwitching`, `SafariHandleChooseAction`,
    `BattleStringExpandPlaceholders`.
  - Campo: `GetInteractedMetatileScript` (TV y comida de FRLG), `GetOnOffBike`,
    `GetRivalAvatarGraphicsIdByStateIdAndGender`; las 5 funciones de la guardería de
    la Ruta 5 (`pokemon/daycare`).
  - Otros: `DrawStarsAndBadgesOnCard`, `TrainerCard_GenerateCardForLinkPlayer`,
    `PlayerGenderToFrontTrainerPicId`.
- 11 caen en módulos `variant`, como ya preveía la 6.1, y 140 en módulos de FireRed.
  1 está en `generated/`, 7 son ambiguas (el nombre existe en varios módulos TS) y 4 no
  tienen TS (son de enlace).
- De los 76 `.c` de pokefirered que no existen en pret Emerald, Expansion tiene 10
  (`fame_checker`, `oak_speech`, `seagallop`, `ss_anne`, `trainer_tower`, `vs_seeker`…).
  No tiene Quest Log, Sistema de Ayuda, Teachy TV, Caja MT, Bolsa de Bayas ni la
  Pokédex y la Mochila de FireRed: ahí su FRLG usa las pantallas de Emerald. Es la
  medida de lo que "le faltan funciones".

Límite: dónde ramifica Expansion es una decisión comunitaria. Las 3.680 funciones
`different` que Expansion **no** ramifica se comportan como en Emerald en su FRLG; no
demuestra que la diferencia sea de estilo. La fuente de fidelidad sigue siendo pret.

### 8.3 Siguientes pasos (no activos; FireRed tiene prioridad)

1. **Fase 2/3:** al definir el contrato `@game/*`, tratar las 19 funciones de §8.2
   como variantes conocidas, empezando por `hw/bg`.
2. **Fase 4:** extraer a `refs/` un catálogo de los tests de Expansion (nombre,
   movimiento/habilidad/objeto, generación de la regla) como especificación de la capa
   de reglas. El sparse `test/` ya está descargado.
3. **Fase 5:** antes del editor de equivalencias, medir qué parte del Johto de HnS se
   importa con `step_maps.py` tras convertir los comportamientos de baldosa.
