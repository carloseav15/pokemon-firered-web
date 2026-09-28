Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: `field_specials.c` bloqueado (`UsedPokemonCenterWarp` solo alimenta `CloseLink`); seguir auditando filas siguientes para una tanda activa.
Bloqueos: callbacks Link/Cable Club; Dive sin mapas FireRed; raw `struct Sprite`/Pokemon sin layout GBA activo; UI Pokéblock Case/Teachy TV sin ruta conectada; Battle/Trainer Tower pendientes.
Validación diferida: recorridos de navegador e historia. Berry Enigma: slots de puntero descriptivo no conservan direcciones GBA; no afirmar paridad runtime.
Entrega (2026-09-28): `fieldmap.c`, accesores activos de elevación, colisión, metatile y atributos conectados a movimiento, corte y scripts.
Funciones nuevas: 0 algoritmos nuevos; 8 equivalencias C añadidas sobre comportamiento existente, con nombres y estrechamiento de coordenadas C.
Conteo: 7.550/10.115 (74,6 %), +8 nombres desde 7.542; `fieldmap.c` queda 14/54; tanda checks/build/diff pasaron.
Pendiente del archivo: SetMetatileEntryAt no tiene callers C; SetMetatileImpassabilityAt solo se usa desde la ruta Link excluida.
