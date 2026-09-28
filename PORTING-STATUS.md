Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: continuar `fieldmap.c` con la familia restante de copia de mapa/tilesets; antes, `field_specials.c` está bloqueado porque `UsedPokemonCenterWarp` solo alimenta `CloseLink`.
Bloqueos: callbacks Link/Cable Club; Dive sin mapas FireRed; raw `struct Sprite`/Pokemon sin layout GBA activo; UI Pokéblock Case/Teachy TV sin ruta conectada; Battle/Trainer Tower pendientes.
Validación diferida: recorridos de navegador e historia. Berry Enigma: slots de puntero descriptivo no conservan direcciones GBA; no afirmar paridad runtime.
Entrega (2026-09-28): `fieldmap.c`, accesores de metatile, geometría de conexiones y transición de cámara conectados a movimiento, corte, scripts e Itemfinder.
Funciones nuevas: 0 algoritmos nuevos; 18 equivalencias C añadidas sobre comportamiento existente, con nombres y anchos de argumentos del C.
Conteo: 7.560/10.115 (74,7 %), +18 nombres desde 7.542; `fieldmap.c` queda 24/54; tanda checks/build/diff pasaron.
Pendiente del archivo: inicialización/copia de mapa y tilesets de hardware; Dive/Emerge sin mapas FireRed; `SetMetatileEntryAt` sin caller C single-player.
