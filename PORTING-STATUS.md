# Estado operativo del port
Modo: **una tanda = un archivo C completo (o familia completa); docs una vez por sesión**. Meta principal: juego de un jugador; enlace/inalámbrico aparte. Cifras en [PENDING.md](PENDING.md) y [PORT-INVENTORY.md](PORT-INVENTORY.md).
Orden de tandas: 1) `scrcmd.c` 213 `ScrCmd_*` ya existen en `script/commands.ts` con nombre corto → equivalencia con forma C; 2) `event_object_movement.c` `MovementAction_*` (284) y `MovementType_*` (141) en lote con Clang; 3) `field_effect.c`, `overworld.c`, `field_player_avatar.c`, `battle_transition.c`; 4) `easy_chat_2/3.c` y `pokemon_storage_system_*.c`.
Pendiente previo: inicialización/consumidor de escenas del Quest Log, menú del Help System y warps de `field_control_avatar.c`.
Bloqueo affine: `WALK_DOWN_AFFINE` pide animación 1 fuera de la tabla dummy C de objeto; no se inventó transformación.
Validación diferida: vuelo/pesca en juego, alfombras de Base Secreta y grabación de pasos, matrices affine Canvas, recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última entrega (2026-09-27): reorganización del proceso; enlace/inalámbrico (42 archivos, 101/1711) sale del total principal; documentación histórica retirada del árbol (queda en Git).
Contador principal: 6.234/10.115 (61,6 %), 60 archivos con huecos; antes 6.335/11.826 (53,6 %) con enlace incluido. Sin código del port cambiado.
