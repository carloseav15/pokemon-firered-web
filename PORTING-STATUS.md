# Estado operativo del port

Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras: [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: `field_player_avatar.c`, en una ruta de jugador activa.
Bloqueo: acciones affine `0x6c–0x6f` requieren matriz/animación OAM, ausente en `Sprite`/Canvas; resolver esa dependencia antes de portarlas.
Validación diferida: recorrido hasta Monte Moon; naming (página negra/SELECT); subsprites Canvas; adaptadores, cajas del PC y Teachy TV. Mantener la cola en PENDING.
Última entrega (2026-09-27): `RockSmashBreak`/`CutTree` ahora reproducen animación, espera y parpadeo de 32 frames hasta quedar ocultos.
Contador: 6.283 → 6.283/11.826 (sin nombres nuevos); `inventory`/`pending`: 97 archivos con huecos.
Validación: `check:port`, `check:honesty`, build e inventarios pasaron; sin prueba de juego/navegador.
