# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras: [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: revisar llamadas activas restantes de `event_object_movement.c` para movimiento de NPC y acciones de campo.
Bloqueo: acciones affine `0x6c–0x6f` requieren matriz/animación OAM, ausente en `Sprite`/Canvas; resolver antes de portarlas.
Validación diferida: recorrido hasta Monte Moon; naming (página negra/SELECT); subsprites Canvas; adaptadores, cajas del PC y Teachy TV. Mantener la cola en PENDING.
Última entrega (2026-09-27): seguidores copian clases C; corregida selección aleatoria; culling de objetos conserva coordenadas s16 y margen del S.S. Anne.
Contador: 6.285/11.826; `inventory`/`pending`: 97 archivos con huecos.
Validación: checks estáticos e inventarios pasaron; AI NPC/culling sin prueba de juego/navegador.
