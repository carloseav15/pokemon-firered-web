Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: `field_specials.c`; `UsedPokemonCenterWarp` solo alimenta `CloseLink` en la reanudación, sin ruta activa single-player equivalente.
Bloqueos: callbacks Link/Cable Club; Dive sin mapas FireRed; raw `struct Sprite`/Pokemon sin layout GBA activo; UI de Pokéblock Case y Teachy TV sin ruta conectada; Battle/Trainer Tower pendientes.
Validación diferida: recorridos de navegador e historia; sin afirmaciones de paridad runtime.
Entrega (2026-09-28): completa el nombre ausente de `item_use.c` con `BattleUseFunc_SacredAsh` (C lo marca unused; sin dispatcher inventado).
Funciones nuevas: 0 rutas single-player; equivalencia C añadida: `BattleUseFunc_SacredAsh`, usa el callback de Sacred Ash y el helper de salida de bolsa existente.
Conteo: 7.537/10.115 (74,5 %), +1 nombre desde 7.536; `item_use.c` queda 73/73; tanda checks/build/diff pasaron.
