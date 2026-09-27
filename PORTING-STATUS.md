# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras vivas en [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: continuar playback de Quest Log (`quest_log_player.c`); la normalización del estado ya alimenta `ObjectEventSetHeldMovement`.
Bloqueo affine restante: `WALK_DOWN_AFFINE` pide animación 1 fuera de la tabla dummy C de objeto; no se inventó transformación.
Validación diferida: matrices affine Canvas en juego, recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última entrega (2026-09-27): `QL_GetPlaybackState` normaliza los estados de grabación/reproducción y ahora decide si `ObjectEventSetHeldMovement` limpia un movimiento activo; `ObjectEventSetGraphicsId` conserva la animación y reancla al tile como C.
Contador: 6.297/11.826 (53,2 %); `event_object_movement.c`: 111/759; 97 archivos con huecos.
Checks: `check:port`, `check:honesty`, build, diff, inventory y pending. Vuelo/pesca desde Surf y recorrido en juego pendientes.
