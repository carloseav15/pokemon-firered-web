# Estado operativo del port
Modo: tanda por archivo/familia; meta principal de un jugador. Enlace e inalámbrico quedan aparte.
Siguiente viable: `item_use.c` (38/73); revisar primero equivalencias de despacho y callbacks.
Bloqueos en orden: `battle_controller_player.c` solo conserva `SetLinkBattleEndCallbacks` (enlace); `sprite.c` conserva copias binarias sin layout TS ni callers; `main.c` mezcla arranque ya integrado con Flash/serial; `battle_bg.c` conserva solo pantallas link.
Validación diferida: navegación en navegador de las entregas recientes y de las pantallas listadas en PENDING; no se afirma paridad de juego en runtime.
Últimas entregas (2026-09-27): `field_player_avatar.c`, `battle_controller_player.c`, `battle_interface.c` y `region_map.c`; flechas warp, transferencias de datos de batalla y nombres especiales de mapa conectados.
Conteo: 7.208/10.115 (71,3 %), +27 desde 7.181; trabajo nuevo y equivalencias integradas se detallan en el resumen de sesión.
`check:port`, `check:honesty`, build y `git diff --check` pasaron para las tandas de código; sin recorrido de navegador.
