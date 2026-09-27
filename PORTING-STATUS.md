# Estado operativo del port

Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras: [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: localizar otra familia activa de `event_object_movement.c`; historia de entradas Acro en `bike.c` no tiene consumidores C.
Bloqueos y validación diferida: recorrido hasta Monte Moon; naming (página negra/SELECT); composición visual de subsprites; pantallas adaptadoras, cajas del PC y Teachy TV. Mantener la cola en PENDING.
Última entrega (2026-09-27): dispatcher de `objectEvents.ts` implementa las 36 acciones Acro: wheelie, transiciones, hops, salto, impacto y desplazamiento.
Corrección de equivalencia: efectos `SE_BIKE_HOP`/`SE_WALL_HIT` se emiten al iniciar acciones de jugador, igual que sus wrappers C.
Contador: 6.283 → 6.283/11.826 (sin nombres nuevos); `inventory`/`pending`: 97 archivos con huecos.
Validación: `check:port`, `check:honesty`, build e inventarios pasaron; sin prueba de juego/navegador.
