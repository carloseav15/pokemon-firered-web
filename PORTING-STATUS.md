# Estado operativo del port

Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras: [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: seguir rastreando acciones activas de `event_object_movement.c` que hoy se reducen a placeholders.
Bloqueos/validación diferida: recorrido hasta Monte Moon; naming (página negra/SELECT); subsprites Canvas; adaptadores, cajas del PC y Teachy TV. Mantener la cola en PENDING.
Última entrega (2026-09-27): `RaiseHandAndStop`, `RaiseHandAndJump` y `RaiseHandAndSwim` completan sus secuencias C en el dispatcher.
Añade salto sinusoidal y balanceo `gSineTable`, estado `singleMovementActive` y cierres de animación/ciclos por frames.
Contador: 6.283 → 6.283/11.826 (sin nombres nuevos); `inventory`/`pending`: 97 archivos con huecos.
Validación: `check:port`, `check:honesty`, build e inventarios pasaron; sin prueba de juego/navegador.
