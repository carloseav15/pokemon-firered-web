# Estado operativo del port

Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras: [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: portar reconocimiento/entrada de trucos Acro en `bike.c`, conectándolo a `PlayerAvatar`.
Bloqueos y validación diferida: revisión de recorrido hasta Monte Moon; naming (página negra/SELECT); composición visual de subsprites; revisar pantallas adaptadoras, cajas del PC y Teachy TV. Conservar la cola en PENDING.
Última entrega (2026-09-27): dispatcher de `objectEvents.ts` ahora implementa las 36 acciones Acro: wheelie, transiciones, hops, salto, impacto y desplazamiento.
Cambio funcional integrado: reemplaza el giro facial aproximado; consume animaciones y rutinas de salto/movimiento ya existentes.
Contador: 6.283 → 6.283/11.826 (sin nuevos nombres); `inventory` y `pending`: 97 archivos con huecos.
Validación: `check:port`, `check:honesty`, build y `git diff --check` pasaron; sin prueba de juego/navegador.
