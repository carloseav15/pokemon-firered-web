# Estado operativo del port
Modo: tanda por archivo/familia; meta principal de un jugador. Enlace e inalámbrico quedan aparte.
Siguiente: completar `field_player_avatar.c` (`GetPlayerAvatarObjectId` y flechas warp); después revisar `sprite.c`.
Bloqueos: las dos funciones restantes de avatar requieren IDs de sprite estables y flechas en el renderer Canvas; `sprite.c` conserva rutinas de buffer OAM de GBA.
Validación diferida: Canvas de mugshots, Surf, ShowMon, Waterfall y Pokécenter/Hall of Fame; vuelo/pesca, historia hasta Monte Moon, naming, subsprites, cajas del PC, Teachy TV y SS Anne.
Última entrega (2026-09-27): transiciones del Quest Log nombradas; callback de movimiento jugador y desmontar Surf conectados; handlers 37/38/39/40/42 del controlador jugador conservan sus bitfields.
Conteo: 7.175/10.115 (70,9 %), +19 nombres desde 7.156; `field_player_avatar.c` 173/176, `quest_log_player.c` 15/15, `battle_controller_player.c` 116/123.
Checks `check:port`, `check:honesty`, build e inventario pasaron; no se recorrió el juego en navegador.
