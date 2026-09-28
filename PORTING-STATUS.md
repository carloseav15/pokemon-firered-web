# Estado operativo del port
Modo: tanda por archivo/familia; documentación al cierre de sesión. Meta principal: juego de un jugador; enlace/inalámbrico aparte.
Siguiente: continuar `overworld.c` con una familia integrada de warps/destinos; después `battle_transition.c`.
Bloqueos: `field_player_avatar.c` 172/176; `GetPlayerAvatarObjectId` y flechas warp esperan IDs/sprites web fieles; `SetPlayerAvatarWatering` está vacío en C.
Validación diferida: efectos de teleport en navegador; vuelo/pesca, historia hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última tanda (2026-09-27): tareas de salida/entrada de Teleport desde `field_player_avatar.c` y efectos de campo de `field_effect.c`, integrados en Overworld/Field Moves.
Conteo: 7.019/10.115 (69,4 %), +82 desde el último estado publicado; 20 nombres nuevos en estas tandas, 0 equivalencias; avatar 172/176 y field effects 24/239.
Checks `check:port`, `check:honesty`, build y `git diff --check` pasaron; sin recorrido de juego.
