Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: continuar `fieldmap.c` con cámara/tilesets restantes; antes, `field_specials.c` está bloqueado porque `UsedPokemonCenterWarp` solo alimenta `CloseLink`.
Bloqueos: callbacks Link/Cable Club; Dive sin mapas FireRed; raw `struct Sprite`/Pokemon sin layout GBA activo; UI Pokéblock Case/Teachy TV sin ruta conectada; Battle/Trainer Tower pendientes.
Validación diferida: recorridos de navegador e historia. Berry Enigma: slots de puntero descriptivo no conservan direcciones GBA; no afirmar paridad runtime.
Entrega (2026-09-28): `fieldmap.c`, guardado/restauración del área de mapa y flujo de inicialización/copia de layouts y conexiones conectados a continuar y transiciones.
Funciones nuevas: 0 algoritmos nuevos; 13 equivalencias C añadidas sobre rutas activas, incluido el solapamiento de mapa persistido.
Conteo: 7.573/10.115 (74,9 %), +13 nombres desde 7.560; `fieldmap.c` queda 37/54; tanda checks/build/diff pasaron.
Pendiente del archivo: copia de tilesets hardware; Dive/Emerge sin mapas FireRed; `SetMetatileEntryAt` sin caller C single-player.
