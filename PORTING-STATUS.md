# Estado operativo del port
Modo: tanda por archivo/familia; documentación al cierre de sesión. Meta principal: juego de un jugador; enlace/inalámbrico aparte.
Siguiente: `battle_transition.c`, revisar/portar familias de espiral y mugshots; después retomar `field_effect.c`.
Bloqueos: `field_player_avatar.c` 172/176; `GetPlayerAvatarObjectId` y flechas warp esperan IDs/sprites web fieles; `SetPlayerAvatarWatering` está vacío en C.
Validación diferida: Big Poké Ball y otros efectos de transición en navegador; vuelo/pesca, historia hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última tanda (2026-09-27): `BigPokeball_Init`, `BigPokeball_SetGfx` y cuatro estados PatternWeave integrados con tiles, tilemap y paleta C; compositor Canvas adaptado.
Conteo: 7.049/10.115 (69,7 %), +6 nombres nuevos esta tanda; avatar 172/176, overworld 61/242, battle transitions 12/134.
Checks `check:port`, `check:honesty`, build y `git diff --check` pasaron; sin recorrido de juego.
