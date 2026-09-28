# Estado operativo del port
Modo: tanda por archivo/familia; meta principal de un jugador. Enlace e inalámbrico quedan aparte.
Siguiente: `field_player_avatar.c`; luego `sprite.c`. Revisar `PENDING.md` tras el cierre.
Bloqueos: `field_player_avatar.c` 172/176; `GetPlayerAvatarObjectId` y flechas warp dependen de IDs/sprites web; `SetPlayerAvatarWatering` está vacío en C. `sprite.c` restante afecta OAM GBA.
Validación diferida: Canvas de mugshots, Surf, ShowMon, Waterfall y Pokécenter/Hall of Fame; vuelo/pesca, historia hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última entrega (2026-09-27): Pokécenter/Hall of Fame en `field_effect.c`; esperas de scripts de `scrcmd.c`; contratos de audio de `sound.c`.
Conteo: 7.156/10.115 (70,7 %), +33 nombres desde 7.123; `field_effect.c` 87/239, `scrcmd.c` 224/224, `sound.c` 48/48.
Checks `check:port`, `check:honesty`, build e inventario pasaron; no se recorrió el juego en navegador.
