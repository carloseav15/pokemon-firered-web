# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras vivas en [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: continuar callbacks de movimiento en `event_object_movement.c`; rutas WALK_SEQUENCE y condiciones ya comparadas con C.
Bloqueo: acciones affine `0x6c–0x6f` requieren matriz/animación OAM en Canvas.
Validación diferida: recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y gráfico SS Anne sin paleta de reflejo asociada.
Última entrega (2026-09-27): la pesca en Surf conserva el offset animado del jugador sobre el bob del Surf Blob, equivalente a `SetSurfBlob_PlayerOffset`.
Contador: 6.296/11.826 (53,2 %); `event_object_movement.c`: 111/759; 97 archivos con huecos.
Checks: `check:port`, `check:honesty`, build, diff, inventory y pending; exportación de objetos reproducida determinísticamente. Pesca en Surf y recorrido en juego pendientes.
