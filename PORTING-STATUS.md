# Estado operativo del port
Modo: tanda por archivo/familia; meta principal de un jugador. Enlace e inalámbrico quedan aparte.
Siguiente: continuar `item_use.c` (49/73); callbacks de contexto y eventos de Quest Log aún incompletos.
Bloqueos previos en orden: `battle_controller_player.c` (solo enlace); `sprite.c` (copias binarias sin layout TS ni callers); `main.c` (arranque/rutinas Flash y serial); `battle_bg.c` (pantallas link).
Validación diferida: recorrido de navegador de las pantallas en PENDING; sin afirmar paridad runtime.
Entregas (2026-09-28): `item_use.c`, potenciadores de combate, cañas, consumo/mensaje común, Item Finder; helper nuevo y rutas existentes integradas por equivalencia.
Conteo: 7.221/10.115 (71,4 %), +6 desde el estado registrado 7.215; el delta incluye helpers nuevos y equivalencias con nombre C.
`check:port`, `check:honesty`, build y `git diff --check` pasaron; no hubo recorrido de navegador.
