Modo: tandas integradas por archivo/familia; meta principal de un jugador. Enlace e inalámbrico quedan aparte.
Siguiente: `battle_controller_pokedude.c` bloqueado por Teachy TV desconectado y modos Catching/Status ausentes en la bolsa; seguir por otra familia viable.
Bloqueos: Sacred Ash no tiene caller de batalla; raw `Pokemon` requiere layout GBA; Pokémon Safari Pokéblock y battle callbacks restantes dependen de sistemas fuera de alcance.
No añadir alias para `AgbMain`: el loop activo es `Game`/`hw/runtime.ts`; serial y timer Flash requieren hardware o transporte no activo.
Validación diferida: recorridos de navegador e historia; no afirmar paridad runtime. Teachy TV sigue como adaptador.
Entrega (2026-09-28): reinicio poison y helpers de encuentro integrados; transición de batalla UNDERWATER usa constantes C y tipo de agua.
Conteo: 7.407/10.115 (73,2 %), +2 desde el estado registrado (7.405); incluye implementaciones y equivalencias.
`check:port`, `check:honesty`, build y `git diff --check` pasaron; `check:transitions` falla antes por aserción de sombra en salto. Sin navegador.
