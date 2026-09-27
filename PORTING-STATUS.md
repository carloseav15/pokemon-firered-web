# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras: [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: portar clasificación y vida de reflejos (`event_object_movement.c`/`field_effect_helpers.c`); requiere resolver el mapeo de paleta.
Bloqueo: acciones affine `0x6c–0x6f` requieren matriz/animación OAM, ausente en `Sprite`/Canvas; resolver antes de portarlas.
Validación diferida: recorrido hasta Monte Moon; naming (página negra/SELECT); subsprites Canvas; adaptadores, cajas del PC y Teachy TV. Mantener la cola en PENDING.
Última entrega (2026-09-27): dispatch de spawn/paso; agua poco profunda, charcos, ondas, Short Grass y Hot Springs.
Contador: 6.291/11.826; `inventory`/`pending`: 97 archivos con huecos.
Validación: checks estáticos e inventarios pasaron; efectos nuevos sin prueba de juego/navegador.
