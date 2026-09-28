Modo: tandas integradas por archivo/familia; meta principal de un jugador. Enlace e inalámbrico quedan aparte.
Siguiente: `item_use.c` (69/73); revisar los tres callbacks de retorno a campo, además de `BattleUseFunc_SacredAsh` sin caller activo.
Bloqueos: `sprite.c` `CopyFromSprites`/`CopyToSprites` serializan el layout C de `struct Sprite` sin callers; `battle_controller_player.c` solo tiene pendiente el callback LINK.
Validación diferida: recorridos de navegador e historia; no afirmar paridad runtime. Teachy TV sigue como adaptador.
Entrega (2026-09-28): estados de warp/puerta de `field_fadetransition.c` conectados a callbacks nombrados y `data[]` de tasks.
Conteo: 7.368/10.115 (72,8 %), +125 desde el estado registrado; mezcla trabajo nuevo y equivalencias.
`check:port`, `check:honesty`, build y `git diff --check` pasaron para la tanda; build conserva avisos previos de chunks/imports. Sin navegador.
