Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: continuar `field_effect_helpers.c`; elegir la siguiente familia con caller activo tras inspeccionar las filas pendientes.
Bloqueos: `UsedPokemonCenterWarp` solo cierra Link; Safari requiere Pokéblock Case sin ruta activa y otros huecos Safari son Link/no usados.
Entrega (2026-09-28): hierba corta, sombras de salto y hierba alta; callbacks conectados desde efectos de campo y movimiento.
Inventario: 7.615/10.115 (75,3 %), +11 nombres desde 7.604; `field_effect_helpers.c` 44/76.
Equivalencias: callbacks de hierba corta y sombra reemplazaron lógica/adaptadores TS; hierba alta completó callbacks y el salto C.
Checks: `check:port`, `check:honesty` (91 stubs), build y `git diff --check` pasaron.
Pendiente: revisión funcional exhaustiva de campo, navegador e historia todavía sin validar.
