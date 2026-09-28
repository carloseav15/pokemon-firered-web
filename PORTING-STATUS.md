Modo: tanda por archivo/familia; meta principal de un jugador. Enlace e inalámbrico quedan aparte.
Siguiente: terminar `item_use.c` (61/73); quedan callbacks de framework, Teachy TV y Sacred Ash de batalla (sin caller activo).
Bloqueo: `berry.c` Enigma depende del payload Mystery Gift fuera de alcance y de representar punteros/layout GBA para validar su checksum.
Después: `item_menu.c` (103/116); Teachy TV y la bolsa Pokedude siguen como adaptadores parciales.
Validación diferida: recorrido de navegador de las pantallas en PENDING; sin afirmar paridad runtime.
Entrega (2026-09-28): callbacks de party y Vs Seeker de `item_use.c`; callbacks de submenús y entrada a bolsa de `item_menu.c`.
Conteo: 7.243/10.115 (71,6 %), +22 frente al último estado registrado; incluye funciones nuevas y equivalencias con nombre C.
`check:port`, `check:honesty`, build y `git diff --check` pasaron en cada tanda; no hubo recorrido de navegador.
