# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras: [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: auditar callbacks de movimiento NPC en `event_object_movement.c`; reflejos bloqueados por el mapeo de paleta.
Bloqueo: acciones affine `0x6c–0x6f` requieren matriz/animación OAM, ausente en `Sprite`/Canvas; resolver antes de portarlas.
Validación diferida: recorrido hasta Monte Moon; naming (página negra/SELECT); subsprites Canvas; adaptadores, cajas del PC y Teachy TV. Mantener la cola en PENDING.
Última entrega (2026-09-27): driver de movimientos repite callbacks hasta `FALSE`; gestos `RAISE_HAND` siguen las tres tablas C.
Contador: 6.296/11.826; `event_object_movement.c`: 111/759; `inventory`/`pending`: 97 archivos con huecos.
Validación: `check:port`, `check:honesty`, build y diff pasaron; subsprites Canvas y juego pendientes.
