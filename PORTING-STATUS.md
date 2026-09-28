# Estado operativo del port
Modo: tanda por archivo/familia; meta principal de un jugador. Enlace e inalámbrico quedan aparte.
Siguiente: continuar `field_effect.c`; priorizar una familia completa con dependencias y ruta activa resueltas.
Bloqueos: `field_player_avatar.c` 172/176; `GetPlayerAvatarObjectId` y flechas warp esperan IDs/sprites web fieles; `SetPlayerAvatarWatering` está vacío en C.
Validación diferida: transiciones de combate (incluidas mugshots) y Surf en navegador; vuelo/pesca, historia hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última entrega (2026-09-27): mugshots de Alto Mando/Campeón integradas en `battle_transition.c`; familia `FldEff_UseSurf` renombrada y estructurada por los cinco estados del C como equivalencia.
Conteo: 7.090/10.115 (70,1 %), +35 nombres desde 7.055; 29 nuevos de mugshots y 6 equivalencias de Surf; `field_effect.c` 30/239 y `battle_transition.c` 47/134.
Checks `check:port`, `check:honesty`, build e inventario pasaron; sin recorrido de juego.
