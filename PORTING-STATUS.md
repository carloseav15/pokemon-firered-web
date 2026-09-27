# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras vivas en [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: seguir con callbacks de movimiento en `event_object_movement.c`; rutas WALK_SEQUENCE y condiciones ya comparadas con C.
Bloqueo affine restante: `WALK_DOWN_AFFINE` pide animación 1 fuera de la tabla dummy C de objeto; no se inventó transformación.
Validación diferida: matrices affine Canvas en juego, recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última entrega (2026-09-27): acciones affine `0x6c–0x6f` integradas: modo doble/off de identidad y dos caminatas lentas al sur; tablas de objetos FRLG usan animación dummy.
Contador: 6.296/11.826 (53,2 %); `event_object_movement.c`: 111/759; 97 archivos con huecos.
Checks: `check:port`, `check:honesty`, build, diff, inventory y pending. Vuelo/pesca desde Surf y recorrido en juego pendientes.
