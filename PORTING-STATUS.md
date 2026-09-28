Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: `field_specials.c` sigue bloqueado: `UsedPokemonCenterWarp` solo alimenta `CloseLink`; revisar siguiente fila para una tanda single-player viable.
Bloqueos: callbacks Link/Cable Club; Dive sin mapas FireRed; raw `struct Sprite`/Pokemon sin layout GBA activo; UI Pokéblock Case/Teachy TV sin ruta conectada; Battle/Trainer Tower pendientes.
Validación diferida: recorridos de navegador e historia; sin afirmaciones de paridad runtime.
Entrega (2026-09-28): `berry.c` Enigma Berry persistida e integrada a inicio de partida, special script y datos de batallas single-player.
Funciones nuevas: 5 nombres reconocidos; las rutas existentes `GetBerryInfo`/special se conectaron a los datos. Sin equivalencias contadas aparte.
Conteo: 7.542/10.115 (74,6 %), +5 nombres desde 7.537; `berry.c` queda 9/9; tanda checks/build/diff pasaron.
Límite conocido: los punteros de descripción Berry2 no se conservan como direcciones GBA; el navegador resuelve descripciones desde ROM y checksum sobre slots opacos cero.
