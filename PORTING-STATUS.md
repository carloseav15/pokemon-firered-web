# Estado operativo del port

Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras: [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: buscar otra familia activa de `event_object_movement.c`; los historiales Acro de `bike.c` no tienen consumidores en C.
Bloqueos/validación diferida: recorrido hasta Monte Moon; naming (página negra/SELECT); subsprites Canvas; adaptadores, cajas del PC y Teachy TV. Mantener la cola en PENDING.
Última entrega (2026-09-27): dispatcher Acro (36 acciones), sonidos de salto/choque del jugador y ciclo de `hasShadow` para saltos normales y Acro.
Equivalencias: los saltos especiales mantienen su ruta C sin sombra; `FieldEffects` crea/retira sombra solo cuando el flag lo solicita.
Contador: 6.283 → 6.283/11.826 (sin nombres nuevos); `inventory`/`pending`: 97 archivos con huecos.
Validación: `check:port`, `check:honesty`, build e inventarios pasaron; falta prueba de juego/navegador y revisión visual de saltos.
