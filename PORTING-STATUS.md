Modo: tandas integradas por archivo/familia; alcance principal de un jugador. No push.
Siguiente: portar `FldEff_Splash` y `UpdateSplashFieldEffect` y conectarlos a `GroundEffect_StepOnPuddle`.
Bloqueos: warps Lavaridge dependen de efectos no portados; callbacks Link, UI Pokéblock Case sin ruta y estructuras Pokémon/Sprite sin layout GBA activo.
Validación diferida: recorridos de navegador e historia; Berry Enigma no conserva direcciones GBA de punteros y no se afirma paridad runtime.
Entrega (2026-09-28): callbacks Ash y efectos de aterrizaje de `field_effect_helpers.c`, conectados a `FieldEffects` y su ruta de movimiento.
Funciones nuevas: 8 equivalencias C conectadas; retiré 4 stubs sustituidos. Sin algoritmos nuevos.
Conteo: 7.594/10.115 (75,1 %), +8 nombres desde 7.586; `field_effect_helpers.c` queda 27/76, 49 stubs. Checks/build/diff pasaron.
Pendiente: tests de navegador/historia; la ruta Mystery Event Club del ajuste de línea Easy Chat sigue fuera de la meta principal.
