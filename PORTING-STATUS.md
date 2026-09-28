# Estado operativo del port
Modo: tanda por archivo/familia; meta principal de un jugador. Enlace e inalámbrico quedan aparte.
Siguiente: continuar familias de `item_use.c` (45/73); quedan callbacks de contexto, Quest Log y `BattleUseFunc_StatBooster`.
Bloqueos previos en orden: `battle_controller_player.c` (solo enlace); `sprite.c` (copias binarias sin layout TS ni callers); `main.c` (arranque/rutinas Flash y serial); `battle_bg.c` (pantallas link).
Validación diferida: navegación en navegador de las entregas recientes y de las pantallas listadas en PENDING; sin afirmar paridad runtime.
Entregas recientes (2026-09-27): field avatar, player battle controller, battle interface, region map; en `item_use.c`, handoffs TM Case/Berry Pouch/Mail/Bike conectados.
Conteo: 7.215/10.115 (71,3 %), +7 desde 7.208; incluye equivalencias de rutas existentes, además de helpers nuevos.
`check:port`, `check:honesty`, build y `git diff --check` pasaron; no hubo recorrido de navegador.
