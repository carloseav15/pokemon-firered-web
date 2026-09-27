# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras vivas en [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: cerrar la comparación de los movimientos NPC que copian al jugador y sus callers activos en `playerAvatar.ts`.
Bloqueo affine restante: `WALK_DOWN_AFFINE` pide animación 1 fuera de la tabla dummy C de objeto; no se inventó transformación.
Validación diferida: matrices affine Canvas en juego, recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última entrega (2026-09-27): ground effects siguen el orden por objeto de C (`OnSpawn`, callback, begin/finish); dirección/rango de entrenador conserva wrap `s16`; acciones affine y flags de animación corregidos.
Contador: 6.296/11.826 (53,2 %); `event_object_movement.c`: 111/759; 97 archivos con huecos.
Checks: `check:port`, `check:honesty`, build, diff, inventory y pending. Vuelo/pesca desde Surf y recorrido en juego pendientes.
