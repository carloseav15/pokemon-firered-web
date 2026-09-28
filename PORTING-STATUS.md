Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: inspeccionar sincronización y bobbing de Surf Blob en `field_effect_helpers.c`, incluidos sus callers de surf.
Bloqueos: `UsedPokemonCenterWarp` solo cierra Link; Safari requiere Pokéblock Case sin ruta activa y otros huecos Safari son Link/no usados.
Entrega (2026-09-28): hierba corta/alta/larga, sombras de salto y huellas/neumáticos conectados a rutas de campo.
Inventario: 7.624/10.115 (75,4 %), +3 nombres desde 7.621; `field_effect_helpers.c` 50/76.
Equivalencias: huellas/neumáticos ya tenían lógica inline; se conectaron los efectos C y se corrigió su ciclo de desvanecimiento.
Checks: `check:port`, `check:honesty` (85 stubs), build y `git diff --check` pasaron.
Pendiente: revisión funcional exhaustiva de campo, navegador e historia todavía sin validar.
