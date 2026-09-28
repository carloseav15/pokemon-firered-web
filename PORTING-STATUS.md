# Estado operativo del port
Modo: tanda por archivo/familia; documentación al cierre de sesión. Meta principal: juego de un jugador; enlace/inalámbrico aparte.
Siguiente: `battle_transition.c`, integrar mugshots de Élite/Campeón y revisar el controlador; después retomar `field_effect.c`.
Bloqueos: `field_player_avatar.c` 172/176; `GetPlayerAvatarObjectId` y flechas warp esperan IDs/sprites web fieles; `SetPlayerAvatarWatering` está vacío en C.
Validación diferida: Big Poké Ball, rastro de Poké Balls y otros efectos de transición en navegador; vuelo/pesca, historia hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última tanda (2026-09-27): `PokeballsTrail_Init/Main/End`, `FldEff_PokeballTrail`, `SpriteCB_FldEffPokeballTrail` y dispatcher integrados con RNG, sprite y paleta C.
Conteo: 7.055/10.115 (69,7 %), +12 nombres nuevos en esta sesión; avatar 172/176, overworld 61/242, battle transitions 18/134.
Checks `check:port`, `check:honesty`, build e inventario pasaron; sin recorrido de juego.
