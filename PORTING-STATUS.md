Modo: una tanda = archivo C completo o familia completa; commits de tanda solo código; estado una vez al final de la sesión. Meta principal de un jugador. No push.
Siguiente: cerrar las 9 funciones restantes de `field_effect_helpers.c` (Sparkle sin caller en FireRed); después `overworld.c`, `field_effect.c`, `easy_chat_2/3.c` y `pokemon_storage_system_*.c`.
Bloqueos: affine `WALK_DOWN_AFFINE` pide animación 1 fuera de la tabla dummy C; `UsedPokemonCenterWarp` solo cierra Link; Sparkle sin ruta C activa.
Validación diferida: vuelo/pesca, alfombras de Base Secreta y grabación de pasos, matrices affine Canvas, recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV, SS Anne sin paleta de reflejo, paletas de disfraces; campo, navegador e historia sin validar.
Última entrega (2026-09-28): `field_effect_helpers.c` 67/76: hierbas, sombras, huellas, Surf Blob, SandPile y disfraces conectados; reglas de tanda/estado reforzadas en AGENTS.md.
Contador: 7.641/10.115 (75,5 %), 52 archivos con huecos; enlace aparte.
Acumulado desde 6.234 (2026-09-27, estimado): ~+800 equivalencias/wrappers (`scrcmd.c` 223, `MovementAction_*`/`MovementType_*` 408, `field_player_avatar.c` ~155) y ~+600 funciones nuevas.
Wrappers a revisar contra el cuerpo C: `MovementAction_*` y `MovementType_*` (`objectEvents.ts`, delegan en `movementActionStep`/lógica genérica); renombres de `field_player_avatar.c`.
