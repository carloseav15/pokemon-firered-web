Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: inspeccionar `Sparkle` y `SandPile` en `field_effect_helpers.c`, con callers de campo activos.
Bloqueos: `UsedPokemonCenterWarp` solo cierra Link; Safari requiere Pokéblock Case sin ruta activa y otros huecos Safari son Link/no usados.
Entrega (2026-09-28): hierbas, sombras, huellas/neumáticos y Surf Blob conectados a sus rutas de campo.
Inventario: 7.635/10.115 (75,5 %), +11 nombres desde 7.624; `field_effect_helpers.c` 61/76.
Equivalencias: Surf Blob ya existía inline; se sustituyó su estado paralelo por bits OAM y callbacks C, y se alinearon callers de Surf/Fly/pesca.
Checks: `check:port`, `check:honesty` (74 stubs), build y `git diff --check` pasaron.
Pendiente: revisión funcional exhaustiva de campo, navegador e historia todavía sin validar.
