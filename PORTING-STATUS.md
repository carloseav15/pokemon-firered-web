Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: continuar `field_specials.c`; priorizar Deoxys cuando estén portados `ApplyGlobalFieldPaletteTint` y el estado de tint global.
Bloqueo registrado: especiales de Deoxys requieren las paletas `sDeoxysObjectPals` y el tinte global; `field_control_avatar.c` sigue bloqueado en Dive.
Validación diferida: recorridos de navegador e historia; sin afirmaciones de paridad runtime.
Entrega (2026-09-28): callbacks de apodo y movimiento de roca Deoxys integrados; `GetPlayerAvatarBike` alineado con C.
Nuevas: 4 nombres C (2 callbacks de apodo y `FldEff_MoveDeoxysRock`/`Task_MoveDeoxysRock_Step`).
Equivalencias: `GetPlayerAvatarBike` prioriza Acro sobre Mach como C; callbacks de apodo conectados a su especial.
Conteo: 7.521/10.115 (74,4 %), +4 desde 7.517; checks de tanda, build y diff pasaron.
