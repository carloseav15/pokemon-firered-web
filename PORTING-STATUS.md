Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: continuar `easy_chat.c` con el ajuste de línea y su consumidor de mensajes; mantener fuera las pantallas de escritura aún desconectadas.
Bloqueos: warps de Lavaridge dependen de los efectos no portados de `field_effect.c`; quedan callbacks Link, UI Pokéblock Case sin ruta y estructuras Pokémon/Sprite sin layout GBA activo.
Validación diferida: recorridos de navegador e historia; Berry Enigma no conserva direcciones GBA de punteros y no se afirma paridad runtime.
Entrega (2026-09-28): lookup y validación de palabras Easy Chat extraídos con nombres C desde `CopyEasyChatWord` en `pokemon/mail.ts`.
Funciones nuevas: 2 equivalencias conectadas; comportamiento de búsqueda ya existía, sin algoritmo nuevo.
Conteo: 7.586/10.115 (75,0 %), +2 nombres desde 7.584; `easy_chat.c` queda 10/39. Check:port, honesty, build y diff pasaron.
Pendiente: el ajuste de línea de mensajes Easy Chat aún no tiene consumidor TS activo; tests de navegador no ejecutados.
