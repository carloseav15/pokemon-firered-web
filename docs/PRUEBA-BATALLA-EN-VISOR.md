# Prueba: el sistema de batalla del port dentro de una página web

Fecha: 2026-10-14. Objetivo: comprobar que el visor web puede albergar en el futuro el sistema de batalla (animaciones primero,
combate completo después). Esto es una **prueba de viabilidad**, no una función integrada: no cambia nada en `src/`.

## Qué se demostró

Con `tools/viewer/poc/battle-anim-in-viewer.mjs` (Playwright contra el servidor de desarrollo):

1. `?fr=sandbox` arranca el motor FireRed del port en una página (ya existía en `src/main.ts`).
2. `window.frDebug` (de `src/games/firered/boot.ts`) permite crear Pokémon y llamar a
   `game.battleSetup.StartWildBattle(enemigo)`: el motor monta el combate real con la especie que se pida.
3. Importando `/src/core/battle/anim.ts` y fijando `G.gBattlerAttacker/gBattlerTarget`, `DoMoveAnim(move)` lanza la animación
   exacta del juego; llamando a `animState.gAnimScriptCallback()` en cada fotograma (como hace `PlayerDoMoveAnimation`) corre
   hasta que `gAnimScriptActive` es falso. Con `MOVE_EMBER` fueron ~100 fotogramas, sin errores.

## Qué no se probó

- Solo Ember; las animaciones que dependen del estado del combate (daño, clima, sustituto, potencia) necesitan valores por defecto.
- El atacante aún no estaba en pantalla (se lanzó durante la presentación); un arnés real debe esperar a que termine.
- Emerald: el núcleo no compila (898 errores de tipos, `docs/EMERALD-BRECHA-NUCLEO.md`); solo hay datos de animación.
- Tiempo y memoria de arranque, y varios combates seguidos sin recargar.

## Camino previsible hacia el visor con combate

1. Entrada de arnés (`?fr=anims`) con una API estable `play({atacante, objetivo, movimiento})` y espera a la presentación.
2. Página del visor que incruste el motor (iframe del mismo origen o módulo) y mande órdenes por esa API; ficha del Pokémon al lado.
3. Combate completo: el motor ya ejecuta combates de verdad (`rivalBattle`, `StartWildBattle`); el visor aportaría la selección de
   equipos y movimientos y leería el estado desde `frDebug.snapshot()`.
4. Emerald: cerrar la brecha del núcleo (tarea del port, no del visor).
