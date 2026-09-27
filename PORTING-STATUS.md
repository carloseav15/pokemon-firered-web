# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras vivas en [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: continuar `event_object_movement.c` con callbacks de movimiento dependientes disponibles; las 24 rutas WALK_SEQUENCE comparan con C.
Bloqueo: acciones affine `0x6c–0x6f` requieren matriz/animación OAM en Canvas.
Validación diferida: recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y gráfico SS Anne sin paleta de reflejo asociada.
Última entrega (2026-09-27): comparación de WALK_SEQUENCE sin diferencias; `trainerCloseToPlayer` usa las constantes C para tipos normal/enterrado. Reflejos Canvas en `139da9b`.
Contador: 6.296/11.826 (53,2 %); `event_object_movement.c`: 111/759; 97 archivos con huecos.
Checks: `check:port`, `check:honesty`, build, diff, inventory y pending; exportación de objetos reproducida determinísticamente. Validación en juego pendiente.
