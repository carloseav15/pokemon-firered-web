# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras: [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: exportar paletas de reflejo desde `step_objects.py` y conectarlas al renderer Canvas.
Bloqueo: acciones affine `0x6c–0x6f` requieren matriz/animación OAM, ausente en `Sprite`/Canvas; resolver antes de portarlas.
Validación diferida: recorrido hasta Monte Moon; naming (página negra/SELECT); subsprites Canvas; adaptadores, cajas del PC y Teachy TV. Mantener la cola en PENDING.
Última entrega (2026-09-27): `enableAnim` se consume antes del callback, como `TryEnableObjectEventAnim` en C.
Contador: 6.296/11.826; `event_object_movement.c`: 111/759; `inventory`/`pending`: 97 archivos con huecos.
Validación: `check:port`, `check:honesty`, build y diff pasaron; subsprites Canvas y juego pendientes.
