# Estado operativo del port
Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**. Cifras vivas en [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Siguiente tanda: portar el recorder de pasos de Quest Log, dependencia de las alfombras; el driver de playback (`quest_log_player.c`) sigue sin modelo TS.
Bloqueo affine restante: `WALK_DOWN_AFFINE` pide animación 1 fuera de la tabla dummy C de objeto; no se inventó transformación.
Validación diferida: alfombras de Base Secreta y su grabación de pasos en juego; matrices affine Canvas, recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última entrega (2026-09-27): alfombras de salto/giro ya ejecutan sus secuencias C por tareas; `QL_GetPlaybackState` alimenta held movement y graphics ID reancla conservando animación.
Contador: 6.301/11.826 (53,3 %); `event_object_movement.c`: 111/759; 97 archivos con huecos.
Checks: `check:port`, `check:honesty`, build, diff, inventory y pending. Vuelo/pesca desde Surf y recorrido en juego pendientes.
