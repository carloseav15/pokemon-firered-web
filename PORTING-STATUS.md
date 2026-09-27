# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras vivas en [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: continuar `event_object_movement.c` con callbacks de movimiento dependientes disponibles.
Bloqueo: acciones affine `0x6c–0x6f` requieren matriz/animación OAM en Canvas.
Validación diferida: recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y gráfico SS Anne sin paleta de reflejo asociada.
Última entrega (2026-09-27): reflejos de objetos sobre hielo/superficies reflectantes, con frames y paletas del decomp, integrados en Canvas.
Contador: 6.296/11.826 (53,2 %); `event_object_movement.c`: 111/759; 97 archivos con huecos.
Checks: `check:port`, `check:honesty`, build y diff; exportación de objetos reproducida determinísticamente. Validación en juego pendiente.
