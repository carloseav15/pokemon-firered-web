# FireRed / LeafGreen — Auditoría de tareas secundarias

Este documento inventaría contenido del juego original; no acredita que esté implementado en el motor activo. Consulta [PORTING-STATUS.md](PORTING-STATUS.md) para el estado del port.

## Propósito

Este inventario sirve para decidir qué contenido puede convertirse en progresión libre para el proyecto web. La fuente de comportamiento es el decomp local:

- `/Users/carancibia/Documents/ChatGPT/pokefirered/data/maps`
- `/Users/carancibia/Documents/ChatGPT/pokefirered/data/scripts`
- `/Users/carancibia/Documents/ChatGPT/pokefirered/data/field_move_scripts`

No existe un contador oficial único de “misiones secundarias” en FireRed. El juego mezcla objetivos, regalos, servicios, coleccionables, batallas y eventos postgame. Por eso se usan tres categorías:

1. **Arco secundario:** tiene objetivo identificable, condición de inicio y recompensa/desbloqueo.
2. **Actividad opcional:** tiene recompensa o utilidad, pero no una cadena narrativa completa.
3. **Servicio/colección:** interacción repetible, intercambio, captura, objetos o contenido sin final narrativo único.

## Resumen de cantidades

| Categoría | Cantidad de diseño | Comentario |
|---|---:|---|
| Arcos secundarios principales | 28 | Misiones con objetivo y recompensa/desbloqueo claro |
| Actividades opcionales independientes | 18 | Regalos, elecciones, tutores, pesca, fósiles, etc. |
| Contenido postgame con estructura propia | 8 | Islas Sevii, Cerulean Cave, Trainer Tower y similares |
| Servicios, colecciones y sistemas repetibles | 10+ | Game Corner, daycare, pesca, intercambios, rematches |

La cifra práctica para diseño es **28 arcos secundarios grandes**. Si se cuentan todas las actividades opcionales y servicios, el catálogo supera las **50 unidades de contenido**.

## Arcos ordenados por progreso natural

Las etiquetas significan:

- **Libre:** se puede hacer sin bloquear la campaña.
- **Capacidad:** requiere Cut, Surf, Strength, Flash, Poké Flute, etc.
- **Historia:** depende de una escena o evento principal.
- **Postgame:** requiere terminar la Liga o cumplir una condición posterior.

| Orden natural | Arco | Zona | Tipo | Recompensa o desbloqueo final | Restricción |
|---:|---|---|---|---|---|
| 1 | Fósil de Mt. Moon | Mt. Moon | Elección | Helix Fossil o Dome Fossil para revivir un Pokémon | Libre, pero depende de llegar a Mt. Moon |
| 2 | Old Amber | Pewter Museum | Actividad | Old Amber para revivir Aerodactyl | Cut y acceso posterior al museo |
| 3 | Flash del ayudante de Oak | Ruta 2 | Arco corto | HM05 Flash | Capturar 10 especies y visitar al ayudante |
| 4 | Bike Voucher | Vermilion Fan Club | Arco corto | Bike Voucher, canjeable por Bicycle | Libre al llegar a Vermilion |
| 5 | Old Rod | Vermilion Pokémon Center | Actividad | Old Rod | Libre |
| 6 | Good Rod | Ruta 12 | Actividad | Good Rod | Llegar a Fuchsia/Ruta 12 |
| 7 | Super Rod | Fuchsia Fishing Guru | Actividad | Super Rod | Llegar a Fuchsia |
| 8 | Pokémon Fan Club | Vermilion | Servicio | Información, Bike Voucher y diálogos | Libre |
| 9 | Copycat y Poké Doll | Saffron / Celadon | Arco secundario | TM Mimic | Acceso a Saffron y Celadon; normalmente requiere progreso de historia |
| 10 | Fighting Dojo | Saffron | Arco secundario | Elección de Hitmonlee o Hitmonchan | Derrotar al líder del dojo |
| 11 | Eevee de Celadon Mansion | Celadon | Actividad | Eevee | Acceso a la azotea de la mansión |
| 12 | Game Corner y premios | Celadon | Actividad/servicio | Pokémon, objetos y TM mediante monedas | Dinero o monedas; no es una misión lineal |
| 13 | Tea/entrada a Saffron | Celadon | Desbloqueo | Acceso a Saffron City | Evento de progresión, no secundaria pura |
| 14 | Lapras de Silph Co. | Saffron | Regalo | Lapras | Rescate/limpieza de Silph Co. |
| 15 | Silph Scope y Pokémon Tower | Lavender | Arco de historia | Acceso a rescates y continuación de la campaña | Principal, no secundaria pura |
| 16 | Snorlax de las rutas 12/16 | Rutas 12 y 16 | Actividad/bloqueo | Captura de Snorlax y apertura de rutas | Poké Flute |
| 17 | Warden's Teeth | Safari Zone / Fuchsia | Arco secundario | HM04 Strength y acceso a objetos movibles | Completar Safari Zone y devolver los dientes |
| 18 | Safari Zone | Fuchsia | Actividad | Pokémon, objetos y acceso a Surf | Pago y límite de pasos |
| 19 | Secret Key | Cinnabar Pokémon Mansion | Arco secundario | Entrada a Cinnabar Gym | Explorar Mansion; requiere avanzar hasta Cinnabar |
| 20 | Pokémon Mansion | Cinnabar | Actividad/exploración | Secret Key y objetos | Acceso a Cinnabar; movimientos de campo |
| 21 | Moltres | Mt. Ember | Encuentro opcional | Captura de Moltres | Acceso a Mt. Ember; normalmente Surf/Strength |
| 22 | Articuno | Seafoam Islands | Encuentro opcional | Captura de Articuno | Surf y resolución de corrientes/puzle |
| 23 | Zapdos | Power Plant | Encuentro opcional | Captura de Zapdos | Surf y acceso a Power Plant |
| 24 | Cerulean Cave / Mewtwo | Cerulean Cave | Postgame | Captura de Mewtwo | Liga terminada y condiciones de Pokédex/islas |
| 25 | Ruby de Mt. Ember | One Island / Mt. Ember | Postgame | Reparación de Network Machine de Celio | Liga y acceso a Sevii Islands |
| 26 | Sapphire de Dotted Hole | Six Island / Five Island | Postgame | Completa la Network Machine | Ruby entregado; acceso a Ruin Valley y Rocket Warehouse |
| 27 | Lostelle | Three Island / Berry Forest | Postgame | Rescate y resolución del conflicto Rocket | Acceso a Three Island; parte del arco Sevii |
| 28 | Icefall Cave y Lorelei | Four Island | Postgame | Desbloqueo de la continuación de Sevii | Acceso postgame a Four Island |
| 29 | Rocket Warehouse | Five Island | Postgame | Resolución Team Rocket y avance de Sevii | Ruby/Sapphire y acceso a Five Island |
| 30 | Trainer Tower | Seven Island | Postgame/actividad | Premios y récords | Acceso postgame |
| 31 | Tanoby Ruins | Seven Island | Exploración/colección | Unown y contenido de colección | Acceso a Seven Island |
| 32 | Lost Cave | Five Island | Exploración | Objetos y encuentros | Surf y acceso a Resort Gorgeous |

## Actividades opcionales que no deben confundirse con misiones

Estas tienen valor jugable, pero no necesariamente deberían aparecer como “quest” en un diario:

| Grupo | Ejemplos | Resultado |
|---|---|---|
| Regalos | Eevee, Lapras, fósiles, Hitmonlee/Hitmonchan | Añaden Pokémon u objetos al estado del jugador |
| Movimientos | Tutores de Double-Edge, Rock Slide, Softboiled, etc. | Enseñan un movimiento una vez o bajo condiciones |
| Intercambios | NPC trades | Cambian un Pokémon por otro |
| Pesca | Old Rod, Good Rod, Super Rod | Desbloquean tablas de encuentros |
| Colección | Unown, objetos ocultos, cartas, Game Corner | Progreso no lineal y completismo |
| Batallas opcionales | Entrenadores evitables, rematches | Experiencia, dinero y registros |
| Servicios | Day Care, Pokémon Fan Club, Move Tutors | Cambios persistentes o repetibles |
| Legendarios | Birds, Mewtwo, Deoxys y eventos externos | Encuentros opcionales con alto valor de colección |

## Qué es lineal y qué es restrictivo

### Fuertemente lineal

Estos eventos dependen de escenas o estados principales:

- Silph Co. y Lapras.
- Pokémon Tower.
- Team Rocket Hideout.
- Cinnabar Gym y Secret Key.
- Ruby/Sapphire de Celio.
- Icefall Cave/Lorelei.
- Rocket Warehouse.

Son buenos candidatos para convertirse en una cadena principal o en arcos opcionales desbloqueados por medallas.

### Restrictivos por capacidad

No son lineales por historia, pero necesitan habilidades:

- Old Amber: Cut/acceso al museo.
- Warden's Teeth: Safari Zone y exploración.
- Moltres: Strength/Surf según la ruta.
- Articuno: Surf y corrientes.
- Zapdos: Surf.
- Snorlax: Poké Flute.
- Cerulean Cave: progreso alto/postgame.

Estos encajan muy bien con un mundo abierto porque el jugador puede descubrirlos temprano, pero resolverlos después.

### Prácticamente libres

- Bike Voucher.
- Fishing Rods.
- Eevee.
- Fighting Dojo.
- Game Corner.
- Old Amber.
- Pokémon Fan Club.
- Intercambios de NPC.

Estos deberían ser prioritarios para la versión de exploración no lineal.

## Adaptación recomendada para nuestro mundo abierto

En lugar de copiar las restricciones originales, cada misión debería declarar requisitos opcionales:

```ts
type MissionDefinition = {
  id: string;
  title: string;
  category: "exploration" | "gym" | "rescue" | "collection" | "gift" | "postgame";
  startMap: string;
  requirements: Requirement[];
  objectives: Objective[];
  rewards: Reward[];
  unlocks: string[];
  repeatable: boolean;
};
```

Ejemplo:

```ts
{
  id: "warden-teeth",
  title: "The Warden's Teeth",
  category: "rescue",
  startMap: "FUCHSIA_CITY",
  requirements: [],
  objectives: ["find_teeth", "return_to_warden"],
  rewards: ["HM_STRENGTH"],
  unlocks: ["strength_interactions"],
  repeatable: false
}
```

Para permitir gimnasios en cualquier orden, las misiones deberían desbloquear capacidades, no ciudades completas. Las medallas pueden controlar el escalado de líderes, pero no impedir la exploración salvo en zonas diseñadas específicamente para ello.

## Conclusión

FireRed no tiene solo unas pocas misiones secundarias: tiene aproximadamente **28 arcos secundarios grandes**, más de **18 actividades opcionales** y numerosos servicios/coleccionables. La mayoría no son cadenas lineales estrictas; muchas están restringidas por habilidades, medallas, objetos o acceso a una zona.

Para nuestro proyecto conviene conservar:

- Objetivo.
- Recompensa.
- Flags.
- Desbloqueos.
- Dependencias de capacidad.

Y eliminar o flexibilizar:

- Orden obligatorio de gimnasios.
- Bloqueos narrativos innecesarios.
- Dependencias de escenas principales.
- Requisitos de postgame cuando no aporten diseño.
