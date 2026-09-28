Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: inspeccionar familia de huellas y marcas de bicicleta en `field_effect_helpers.c`, con callers de `event_object_movement.c`.
Bloqueos: `UsedPokemonCenterWarp` solo cierra Link; Safari requiere Pokéblock Case sin ruta activa y otros huecos Safari son Link/no usados.
Entrega (2026-09-28): hierba corta, sombras de salto, hierba alta y hierba larga conectadas a sus rutas de campo/movimiento.
Inventario: 7.621/10.115 (75,3 %), +6 nombres desde 7.615; `field_effect_helpers.c` 47/76.
Equivalencias: el movimiento de hierba larga ya existía inline; se conectaron los callbacks C y el comportamiento de salto/elevación.
Checks: `check:port`, `check:honesty` (88 stubs), build y `git diff --check` pasaron.
Pendiente: revisión funcional exhaustiva de campo, navegador e historia todavía sin validar.
