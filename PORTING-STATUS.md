# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras: [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: revisar llamadas activas restantes de `event_object_movement.c` para movimiento de NPC y acciones de campo.
Bloqueo: acciones affine `0x6c–0x6f` requieren matriz/animación OAM, ausente en `Sprite`/Canvas; resolver antes de portarlas.
Validación diferida: recorrido hasta Monte Moon; naming (página negra/SELECT); subsprites Canvas; adaptadores, cajas del PC y Teachy TV. Mantener la cola en PENDING.
Última entrega (2026-09-27): `COPY_PLAYER` replica clases C y destinos; corregidos orden de orientación aleatoria y desempate de mirada de entrenadores.
Contador: 6.285/11.826; `inventory`/`pending`: 97 archivos con huecos.
Validación: `check:port`, `check:honesty`, build, diff e inventarios pasaron; AI NPC sin prueba de juego/navegador.
