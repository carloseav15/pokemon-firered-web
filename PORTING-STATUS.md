# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras vivas en [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: retomar almacenamiento/ciclo de escenas y acciones de Quest Log; falta persistencia de escenas y buffer serializado para conectar pasos.
Bloqueo affine: `WALK_DOWN_AFFINE` pide animación 1 fuera de la tabla dummy C de objeto; no se inventó transformación.
Validación diferida: vuelo/pesca en juego, alfombras de Base Secreta y grabación de pasos, matrices affine Canvas, recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última entrega (2026-09-27): FlyUp/FlyDown ahora terminan en su tercer callback como `MovementAction_FlyUp_Step2` de C.
Contador: 6.301/11.826 (53,3 %); `event_object_movement.c`: 111/759; 97 archivos con huecos.
Checks: `check:port`, `check:honesty`, build, diff, inventory y pending.
