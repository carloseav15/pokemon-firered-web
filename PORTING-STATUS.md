# Estado operativo del port
Modo: tanda por archivo/familia; documentación al cierre de sesión. Meta principal: juego de un jugador; enlace/inalámbrico aparte.
Siguiente: continuar `battle_transition.c` con el controlador común y familias de efectos aún faltantes; después retomar `field_effect.c`.
Bloqueos: `field_player_avatar.c` 172/176; `GetPlayerAvatarObjectId` y flechas warp esperan IDs/sprites web fieles; `SetPlayerAvatarWatering` está vacío en C.
Validación diferida: efectos de teleport y combate en navegador; vuelo/pesca, historia hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Últimas tandas (2026-09-27): setters de warp, game stats, predicados de tipo de mapa e intro de transición integrados en scripts, guardado, Field Moves y combate.
Conteo: 7.043/10.115 (69,6 %), +24 nombres nuevos esta sesión y 6 equivalencias; avatar 172/176, overworld 61/242, battle transitions 6/134.
Checks `check:port`, `check:honesty`, build y `git diff --check` pasaron; sin recorrido de juego.
