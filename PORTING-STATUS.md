# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras: [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: completar los efectos de suelo faltantes (`flowing water`, ripple y reflejos) desde `event_object_movement.c`/`field_effect_helpers.c`.
Bloqueo: acciones affine `0x6c–0x6f` requieren matriz/animación OAM, ausente en `Sprite`/Canvas; resolver antes de portarlas.
Validación diferida: recorrido hasta Monte Moon; naming (página negra/SELECT); subsprites Canvas; adaptadores, cajas del PC y Teachy TV. Mantener la cola en PENDING.
Última entrega (2026-09-27): efectos de suelo emiten ondas de agua y salpicadura al andar por charcos.
Contador: 6.288/11.826; `inventory`/`pending`: 97 archivos con huecos.
Validación: checks estáticos e inventarios pasaron; efectos y paridad visual sin prueba de juego/navegador.
