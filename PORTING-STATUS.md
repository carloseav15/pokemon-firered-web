# Estado operativo del port
Modo: tanda por archivo/familia; meta principal de un jugador. Enlace e inalámbrico quedan aparte.
Siguiente: `field_effect.c`, comparar y completar la familia `FldEff_PokecenterHeal` / `FldEff_HallOfFameRecord` y sus callbacks de sprite.
Bloqueos: `field_player_avatar.c` 172/176; `GetPlayerAvatarObjectId` y flechas warp esperan IDs/sprites web fieles; `SetPlayerAvatarWatering` está vacío en C.
Validación diferida: Canvas de mugshots, Surf, ShowMon y Waterfall en navegador; vuelo/pesca, historia hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última entrega (2026-09-27): familias ShowMon exterior/interior y Waterfall reestructuradas con sus estados y callbacks C; corregidos cry sin ducking y opacidad de paleta para ShowMon.
Conteo: 7.123/10.115 (70,4 %), +33 coincidencias de nombre desde 7.090; `field_effect.c` 63/239, `battle_transition.c` 47/134.
Checks `check:port`, `check:honesty`, build e inventario pasaron; sin recorrido de juego.
