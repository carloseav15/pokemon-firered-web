Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: retomar los warps individuales de `field_fadetransition.c`; revisar la ruta TS y completar una familia conectada.
Bloqueos: restos tempranos de `fieldmap.c`, callbacks Link, Pokéblock Case sin UI, raw `struct Sprite`/Pokemon sin layout GBA activo, Dive sin mapas FireRed.
Validación diferida: recorridos de navegador e historia; Berry Enigma no conserva direcciones GBA de punteros y no se afirma paridad runtime.
Entrega (2026-09-28): carga/copia de tilesets y paletas de `fieldmap.c`, integrada en `TileRenderer`.
Funciones nuevas: 11 equivalencias C conectadas, sin algoritmos nuevos; incluye aplicación de tint global sobre buffers GBA.
Conteo: 7.584/10.115 (75,0 %), +11 nombres desde 7.573; `fieldmap.c` queda 48/54. Checks/build/diff pasaron.
Pendiente: setters sin caller de `fieldmap.c`; Dive/Emerge y entradas Link/Union Room fuera o sin datos/ruta para la meta principal.
