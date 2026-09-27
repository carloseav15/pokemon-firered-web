# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras vivas en [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: implementar inicialización/consumidor de escenas del Quest Log; luego el menú del Help System y los warps pendientes de `field_control_avatar.c`.
Bloqueo affine: `WALK_DOWN_AFFINE` pide animación 1 fuera de la tabla dummy C de objeto; no se inventó transformación.
Validación diferida: vuelo/pesca en juego, alfombras de Base Secreta y grabación de pasos, matrices affine Canvas, recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última entrega (2026-09-27): input de playback del Quest Log aplica y consume direcciones registradas; START abre el menú tras liberar controles; pasos actualizan los tres contadores de campo.
Contador: 6.335/11.826 (53,6 %); `field_control_avatar.c`: 21/49; 97 archivos con huecos.
Checks: `check:port`, `check:honesty`, build, diff, inventory y pending; sin prueba de juego/navegador. Inicialización/consumidor de escenas y menú de ayuda siguen pendientes.
