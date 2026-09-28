# Estado operativo del port
Modo: tanda por archivo/familia; documentación al cierre de sesión. Meta principal: juego de un jugador; enlace/inalámbrico aparte.
Siguiente: continuar `field_player_avatar.c` con la familia de movimientos Acro/wheelie y callbacks restantes; después `field_effect.c`, `overworld.c`, `battle_transition.c`.
Bloqueos: ninguno nuevo; `GetPlayerAvatarObjectId` espera una representación de sprite ID fiel en el runtime web.
Fidelidad pendiente: `IsPlayerFacingSurfableFishableWater` aún difiere del gate C (`PlayerGetElevation() == 3` y atributo terrain water); requiere check focalizado de puentes/elevación.
Validación diferida: vuelo/pesca en juego, alfombras de Base Secreta y grabación de pasos, matrices affine Canvas, recorrido hasta Monte Moon, naming, subsprites Canvas, cajas del PC, Teachy TV y SS Anne sin paleta de reflejo.
Última tanda (2026-09-27): equivalencias de getters gráficos/estado del avatar y dirección expuestas con nombres C en `field/playerAvatar.ts`; `GetPlayerFacingDirection` conectado al especial de script.
Conteo: 6.937/10.115 (68,6 %), +9 equivalencias, 0 funciones nuevas; `field_player_avatar.c` 102/176. Checks port, honesty, build y diff-check pasaron; sin recorrido de juego.
