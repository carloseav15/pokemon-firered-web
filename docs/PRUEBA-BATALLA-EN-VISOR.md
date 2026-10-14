# El sistema de batalla del port dentro del visor web

Estado (2026-10-14): **integrado como arnés de animaciones** y mostrado en el dex de FireRed/Emerald. Es la base para albergar
más adelante el combate completo en el visor; hoy solo reproduce animaciones de movimientos.

## Qué hay

- `src/games/firered/animHarness.ts` + `?fr=anims` en `src/main.ts`: arranca el motor FireRed (`launchFireRed({mode:"sandbox"})`),
  monta un combate salvaje (`a` = especie del jugador, `t` = especie del rival, índices de especie de FireRed), avanza la
  presentación hasta el menú de acciones, congela la lógica de turnos (`gBattleMainFunc` vacío) y oculta el menú.
- `window.frAnim`: `ready` (promesa), `play(move, {power, damage, friendship})` (promesa que resuelve al terminar la animación) y
  `status()`. Pide la animación por el camino del juego: `BtlController_EmitMoveAnimation` → `PlayerHandleMoveAnimation` →
  `PlayerDoMoveAnimation`; no se llama a `DoMoveAnim` ni se altera el motor.
- Dex (`dex.html`): panel «Animaciones de movimientos (motor de FireRed)» en cada ficha; abre un iframe con `?fr=anims`, lista los
  movimientos de nivel de la especie y el resto, y deja elegir rival (al cambiarlo se recarga la ventana).
- `tools/viewer/check-anim-harness.mjs`: comprobación con Playwright (muestra de movimientos o `MOVES=ALL`). Con `MOVES=ALL`
  (2026-10-14, FireRed, Charmander contra Pidgey): los 425 nombres `MOVE_*` terminan sin error ni excepción de página; «termina» solo
  significa que el guion de la animación acabó, no que el resultado visual sea fiel.

## Qué no hace (todavía)

- No hay turnos, daño ni selección de movimientos del rival: la lógica de turnos está congelada a propósito.
- Cambiar el atacante recarga el motor (≈1,5 s con la caché caliente); cambiar de movimiento no.
- Los movimientos que dependen del estado del combate (clima, sustituto, potencia/daño) usan valores por defecto
  (`power` del movimiento, daño 0, amistad 70); no se ha revisado cada familia a ojo.
- Solo FireRed: el núcleo no compila contra Emerald (898 errores de tipos, `docs/EMERALD-BRECHA-NUCLEO.md`).

## Camino hacia el combate completo en el visor

1. Reutilizar `frAnim` para el rival (movimiento elegido, lado, doble combate) y para estados (clima, sustituto).
2. Descongelar la lógica de turnos y leer el estado desde `frDebug.snapshot()`; el visor aportaría equipos y selección.
3. Emerald: cerrar la brecha del núcleo (tarea del port, no del visor).
