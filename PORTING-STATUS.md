Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: revisar por orden la próxima familia viable; `field_control_avatar.c` queda pendiente de una ruta Dive activa (FR no tiene mapas Dive).
Bloqueos: Sacred Ash sin caller; Pokedude requiere Teachy TV/bolsa Catching y Status; battle opponent requiere layout raw GBA o LINK; battle setup conserva Pokedude, Tower y función unused.
No añadir alias para `AgbMain`: el loop activo es `Game`/`hw/runtime.ts`; serial/timer Flash requieren hardware no activo.
Validación diferida: recorridos de navegador e historia; Teachy TV sigue como adaptador; no afirmar paridad runtime.
Entrega (2026-09-28): battle_setup.c Task_BattleStart, despacho/fin de batallas conectados; GetTrainerStarCount corrige los criterios FRLG de trainer_card.c.
Conteo: 7.437/10.115 (73,5 %), +30 desde 7.407; mezcla implementaciones y equivalencias, el inventario mide nombres.
`check:port`, `check:honesty`, build y `git diff --check` pasaron; `check:transitions` y `check:trainer-see` conservan fallos de fixture/sombra; sin navegador.
