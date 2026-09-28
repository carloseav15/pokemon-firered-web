Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: seleccionar una familia completa y con caller activo dentro de `field_effect_helpers.c` tras revisar scripts de campo.
Bloqueos anotados: `UsedPokemonCenterWarp` solo decide cerrar Link; Safari requiere Pokéblock Case sin ruta activa y los otros huecos Safari son Link/no usados.
Entrega (2026-09-28): Splash, burbujas, ripple, pies en agua corriente y aguas termales, conectados desde `GroundEffect_*`.
Funciones nuevas: 10 equivalencias C conectadas; se retiraron 10 stubs. Sin algoritmos nuevos.
Contador: 7.604/10.115 (75,2 %), +10 nombres desde 7.594; `field_effect_helpers.c` queda en 37/76.
Checks: `check:port`, `check:honesty` (98 stubs), build y `git diff --check` pasaron.
Pendiente: revisión de Safari antes de seleccionar funciones no Link; navegador e historia siguen sin validar.
