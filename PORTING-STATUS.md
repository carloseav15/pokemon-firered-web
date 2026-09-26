# FireRed web port status

Target: the full FireRed game, including its main progression and optional
systems. The first playable route is a milestone, not the completion criterion.

## Revisión de clima y avance del port, 2026-09-26

- Inventario actual: **6.088/9.834 funciones con homólogo (61,9%)**; quedan
  **3.746 nombres (38,1%)**. De 202 archivos C de la lista en alcance, **93 aún
  tienen huecos de nombre**: 42 casi completos, 50 parciales y uno adaptador;
  109 no tienen huecos de nombre y uno es solo datos. La estimación ponderada
  de líneas C sin cubrir es **~77.927/247.859 (31,4%)**. Son indicadores del
  inventario, no prueba de equivalencia funcional.
- Orden recomendado de menor a mayor dificultad, siguiendo
  `ESTADO-Y-REGLAS.md` §7: (1) cerrar stubs existentes y conectar o retirar
  duplicados sin uso, función por función y sin ocultar adaptadores; (2) cerrar
  archivos casi completos; (3) sustituir por partes la capa antigua del campo
  (`event_object_movement.c`, `field_player_avatar.c`, `overworld.c`,
  `fieldmap.c`, `scrcmd.c`); (4) pantallas grandes pendientes, cajas del PC y
  Easy Chat; (5) audio fino y sistemas postgame. `PENDING.md` contiene la lista
  viva completa, ordenada por líneas estimadas pendientes, no por dificultad.
- Corregí `tools/portInventory.py`: un getter TypeScript que devuelve estado
  real ya no se considera stub solo por tener un `return`, y los `FALSE`/`TRUE`
  del C se reconocen como literales. La corrección evita clasificar getters y
  no-ops existentes en el decomp como deuda falsa.
- **`learn_move.c`: 23/23 homólogos**, frente a 20/23. Implementé la carga de
  filas del menú, su inicialización y el control de flechas de scroll; conecté
  esos helpers a `openMoveRelearnerList`, usando el par de flechas de la lista
  de hardware como adaptación de los sprites específicos de GBA. Pasan
  `check:port`, `check:learnmove`, `check:honesty`, `inventory`, `pending` y
  `git diff --check`. No se probó en navegador.
- **`field_weather.c`: 50/50 homólogos.** Corregí tres cuerpos que eran stubs:
  `Task_WeatherInit` ahora espera `readyForInit`, inicializa el clima y cambia
  al callback principal; `None_Init` restablece el destino y el retardo gamma;
  `Weather_UpdateBlend` avanza los coeficientes EVA/EVB alternando frames y
  actualiza BLDALPHA. También completé el dispatcher `Task_WeatherMain`,
  `Weather_SetBlendCoeffs` y `Weather_SetTargetBlendCoeffs` según el C. La
  revisión encontró un error aparte: `None_Finish` devolvía `true` en TS aunque
  C devuelve `0`, bloqueando la salida del clima None; ya coincide. El
  adaptador de partículas ya usa el LCG del juego en vez de `Math.random`, los
  tipos de clima vienen de `C.*`, y el ruido de Web Audio usa una secuencia
  local determinista para no consumir el RNG del juego. El
  headless `check:weather` cubre inicialización, temporización de mezcla y
  callbacks de clima; pasan también `check:port`, `check:honesty`, `inventory`,
  `pending` y `git diff --check`. Sin prueba en navegador; partículas y
  conexión a Canvas2D siguen incompletas.

## Revisión de código, 2026-09-26 (sin navegador)

- **`item_use.c`: 41/73 funciones con homólogo (56%)**, ahora pendiente #1.
  Corregí `CanFish` frente al C: cascadas y estado bajo el agua impiden pescar.
  Extraje y conecté `FieldUseFunc_OakStopsYou` al rechazo común, y añadí los
  despachadores de baya Enigma de campo y combate siguiendo sus tablas de
  `ITEM_EFFECT_*`: cura/estado, Sacred Ash, Rare Candy, PP, Ether, X Item y
  rechazo según corresponda. También conecté `Task_UsedBlackWhiteFlute`: tras
  ocho frames reproduce el sonido y muestra el texto mediante el contexto
  vigente de bolsa/Berry Pouch, siguiendo `data[8]` del C. Añadí las tareas
  `Task_PlayPokeFlute`/`Task_DisplayPokeFluteMessage` para no presentar el
  mensaje de despertar hasta que termina la fanfarria. Se mantienen los
  handlers existentes de party, bolsa y Berry Pouch. Conecté `Task_UseRepel`:
  ahora espera a que `sound.isSEPlaying()` sea falso antes de retirar el objeto,
  activar `VAR_REPEL_STEP_COUNT` y mostrar el texto de uso como el C. El
  inventario estima ~405 líneas C pendientes en este archivo. Pasan
  `check:port`, `check:honesty`, `inventory`, `pending` y `git diff --check`;
  sin navegador ni bundle.
- **Cierre del umbral de `trainer_see.c`: 32/37 funciones (86%)**. Conecté el
  runner por frame `Task_RunTrainerSeeFuncList`, el inicio
  `StartTrainerApproachWithFollowupTask` y la limpieza
  `Task_DestroyTrainerApproachTask` al mismo task activo de acercamiento. El
  inventario ya no lo lista entre los 51 archivos pendientes (su criterio es
  ≥80% de nombres; el 14% restante y la paridad visual siguen sin resolverse).
  Mismas comprobaciones estáticas; no probé en navegador.

- Avance global medido: **6069/9834 nombres (61%)**. El inventario estima
  **108138/247859 líneas C pendientes (~44% del código en alcance)**; es una
  aproximación de líneas y no una medida de fidelidad.

- **Continuación de `trainer_see.c`: 29/37 funciones con homólogo (78%)**.
  Extraje y conecté `TrainerApproachPlayer` y las funciones del flujo normal
  `TrainerSeeFunc_StartExclMark`, `WaitExclMark`, `TrainerApproach`,
  `PrepareToEngage` y `End` al task que ya ejecuta el acercamiento. Ajusté el
  despacho para que `StartExclMark` y `WaitExclMark` puedan avanzar en el mismo
  frame, como el bucle `while` de `Task_RunTrainerSeeFuncList` en C. El
  inventario automático ahora estima ~162 líneas faltantes para este archivo.
  Disfraces/`REVEAL_TRAINER` siguen sin uso en FRLG; playback de Quest Log no
  está completamente modelado. Pasan `check:port`, `check:honesty`,
  `inventory`, `pending` y `git diff --check`; sin navegador ni bundle.

- **`trainer_see.c`: 29/37 funciones con homólogo (78%)**, quince más que en
  el inventario previo a esta revisión. Conecté `QL_IsTrainerSightDisabled`
  dentro de `checkForTrainersWantingBattle`, reproduciendo la condición de
  `quest_log.c`. El playback Quest Log aún no está modelado en Game; se usan
  los campos opcionales de estado si el runtime los entrega, con valores cero
  como inicialización BSS de C. También conecté entrenadores `BURIED` al flujo
  de detección: el task cara-al-jugador carga `AshPuff`, espera sus 12 frames
  iniciales (frame de animación 2), ajusta prioridad, dispara el salto en sitio
  y espera al final de los cinco cuadros de 6 frames antes de continuar el
  acercamiento. Usa la plantilla exportada de `fieldfx.json`; el comportamiento
  sigue sin prueba visual/runtime. La función GBA `FldEff_PopOutOfAsh` se adapta
  mediante `FieldEffects.popOutOfAsh`; también conecté los callbacks de cámara
  `CreateCameraObj`, `CameraObjMoveUp` y `CameraObjMoveDown`. En
  `fieldEffects.ts` conecté los cinco `FldEff_*Icon` con las plantillas de
  emote y extraje `SetIconSpriteData`/`SpriteCB_TrainerIcons`; el callback busca
  el objeto por localId/map y limpia el efecto al desaparecer o terminar la
  animación. Disfraces y otros callbacks en ceniza siguen pendientes. Pasan
  `check:port`, `check:honesty`,
  `inventory`, `pending` y `git diff --check`; sin navegador.
- **`fldeff_flash.c`: 19/22 funciones con homólogo (86%)**, ahora supera el
  umbral del inventario. `fieldMoveMenu.ts` traduce el gate, el callback y la
  activación de Flash con el script original; `overworld.ts` conecta
  `TryDoMapTransition` y reproduce las ocho parejas de tipos de mapa de la
  tabla C. `mapPreviewScreen.ts` corre el preview cave y las tareas
  `FlashTransition_Enter/Exit` con incbins originales, actualizaciones parciales
  de paleta y alpha por frame, dibujadas como overlay Canvas. Los tres nombres
  restantes son `CB2_ChangeMapMain`, `VBC_ChangeMapVBlank` y `CB2_DoChangeMap`;
  la tarea GBA/VBlank y el reset de registros se resuelven mediante el callback,
  PPU y ciclo de frames compartidos del port, no con homólogos uno-a-uno. Las
  transiciones nuevas no se probaron visualmente ni se compararon píxel a píxel.
  Pasan `check:port`, `check:honesty`, `inventory`, `pending` y `git diff --check`;
  sin navegador.
- **`script.c`: 48/55 funciones con homólogo**, supera el 80% y sale de
  `PENDING.md`. Alineé los métodos del lector y stack bytecode con el C, conecté
  setup/retorno/parada y los helpers de mapas/control de mensajes. Añadí el
  estado RamScript serializable, CRC16 de los 999 bytes, sustitución de scripts
  de objeto por mapa y `returnram`/`endram`. Quedan seis funciones de Quest Log
  (fuera de alcance web) y `GetSavedRamScriptIfValid`, que depende de validar
  Wonder Cards, también fuera del subsistema portado. Sin stubs nuevos. Pasan
  `check:port`, `check:honesty`, `inventory`, `pending` y `git diff --check`;
  sin navegador.
- **`field_camera.c`: 12/29 nombres con homólogo; cubierta por la capa web**
  tras revisar sus funciones restantes. `Overworld` implementa seguimiento y
  paneo; `fieldmap.ts` notifica cambios; `TileRenderer`/el render Canvas dibujan
  el viewport completo; puertas y transiciones usan sus overlays/capturas. Por
  eso no se portan los slices del ring buffer BG/VRAM. El pan callback se
  conecta al ciclo web, `ShakeScreen` y el shake del ascensor. Esta clasificación
  es revisión de código; sin prueba de movimiento en navegador.
- **`battle_controllers.c`: 61/68 funciones con homólogo**, subió desde 46/68
  y supera el umbral del inventario. Añadí los serializadores `Emit*` que
  faltaban en `battle/controllers.ts`: datos raw del Pokémon, pausa, fade,
  animación de captura exitosa, comandos poco usados, transferencia DMA y
  variables/flags auxiliares. En `EmitDMA3Transfer` el destino se representa
  como dirección GBA de 32 bits; `EmitPlayBGM` conserva el formato del C y
  rechaza songId >253, donde el buffer C de 0x100 bytes se desborda. Los
  emisores están en el módulo de controladores ya conectado, aunque varios se
  marcan unused en C y no tienen caller en el juego normal. El setup y envío de
  buffers de batallas por enlace siguen pendientes. Pasan `check:port`,
  `check:honesty`, `inventory`, `pending` y `git diff --check`; sin navegador.
- **`menu.c`: 49/49 funciones con homólogo**, subió desde 27/49 y sale de
  `PENDING.md`. Completé callbacks de marcos, wrappers de ventanas/plantillas,
  impresión de multichoice y navegación de cuadrícula en `hw/menu.ts`; se usan
  desde la capa hardware existente. Los helpers C marcados unused siguen sin
  una ruta de juego que los invoque. Pasan `check:port`, `check:honesty`,
  `inventory`, `pending` y `git diff --check`; no ejecuté navegador.
- **`battle_bg.c`: 15/17 funciones con homólogo**, subió desde 13/17. Porté
  `CreateUnknownDebugSprite` y `CB2_unused` en `battle/bg.ts`, y sus callbacks
  de dibujo temporal en `battle/main_init.ts`. Son utilidades marcadas unused
  en el C y no forman parte del flujo de combate normal; quedan sin ejecución
  navegador. Las otras dos funciones pendientes son la pantalla VS de enlace.
- **`main.c`: 23/28 funciones con homólogo**, subió desde 7/28 y sale de
  `PENDING.md` por el umbral del 80%. En `hw/runtime.ts`, el contador VBlank es
  condicional; `InitKeys` reinicia el estado; el despacho de interrupciones
  ejecuta HBlank y VCount de línea 150; `WaitForVBlank` espera asincrónicamente
  al siguiente frame. `InitMainCallbacks` se adaptó al coordinador de startup
  (la intro web conduce el copyright) y quedó conectado en `startup.ts`.
  `ClearPokemonCrySongs` invalida cargas pendientes y detiene el audio activo;
  `m4aVSync` sigue sin equivalente. Pasan `check:port`, `check:honesty`,
  `inventory`, `pending` y `git diff --check`; sin navegador. Arranque GBA,
  timer físico y serial/link quedan pendientes.
- **`new_menu_helpers.c`: 50/54 funciones con homólogo**, subió desde 29/54 y
  supera el umbral del inventario. `menuHelpers.ts` incluye copias de tilemap,
  reset BG, impresoras, ventana START, carga de datos ya descomprimidos por el
  exportador, dibujo/limpieza de marcos y carga de la ventana de señalización.
  Los 4 huecos aún no cuentan como portados; quedan limitaciones de lifetimes
  DMA y del help window heredado. Verificados `check:port`, `check:honesty`,
  `inventory`, `pending` y `git diff --check`, sin navegador.
- **`item.c`: 46/49 funciones con homólogo**, subió desde 24/49. `items.ts`
  ahora expone acceso sanitizado a los datos del decomp, operaciones de slots,
  limpieza, conteo/espacio del PC y bolsillos, y orden/compactación ajustados
  al modelo de arrays compactos del guardado web. Cifrado XOR de SaveBlock no
  aplica porque el guardado del navegador conserva cantidades descifradas;
  eventos de Quest Log siguen fuera de alcance. No se añadió stub. Verificados
  `check:port`, `check:honesty`, inventario, pendientes y `git diff --check`;
  sin bundle ni navegador.
- `field_screen_effect.c`: 19/19 homólogos en `fieldEffects.ts` y
  `overworld.ts`; la ventana de whiteout sigue siendo adaptación Canvas2D sin
  verificación visual. Las limitaciones de juego no probado siguen en
  `PENDING.md` §5.
- El indicador automático actual es 6055/9834 nombres (61%); faltan 3779
  homólogos (39%). El estimado de líneas C pendientes es 108888, aproximadamente
  44% de las 247859 líneas medidas. Ambos son aproximaciones de inventario, no
  prueba de fidelidad ni finalización funcional.

## Browser playtest, primeras ~2 horas (2026-09-25, en curso)

Prueba con `npm run dev` + `?fr=new` + `window.frDebug`. Primero con un driver
Playwright/Chromium headless fuera del repo; desde la sesión de Claude del
2026-09-25 con `tools/playtest/driver.js` en el navegador del panel (uso en
AGENTS.md §6.5).

- **Bug bloqueante encontrado y arreglado: cualquier warp con la misma música
  de destino se quedaba colgado para siempre.** `overworld.ts`
  `tryFadeOutOldMapMusic()` → `destinationMusic()` era un stub que siempre
  devolvía `undefined` (leía `rom.mapIndex.maps[dest]`/`mapCache.get(dest)` y
  los descartaba con `void`), así que `sound.fadeOutBGM()` nunca se llamaba.
  Además `sound.isBGMPausedOrStopped()` comprobaba "¿está sonando algo ahora
  mismo?" (`!backend.isPlaying("bgm")`) en vez de imitar `BGMusicStopped()` /
  `IsNotWaitingForBGMStop()` del C (`sound.c`), que solo es falso mientras
  `sMapMusicState` está en 5/6/7 (un fade de música de mapa pendiente) y es
  **verdadero de inmediato si nunca se pidió un fade** (p. ej. cuando la
  música de destino es igual a la actual, como al salir de la casa del
  jugador hacia Pueblo Paleta). Como la música de fondo hace loop infinito,
  `isPlaying` nunca se volvía falso por sí solo, así que `startTeleport2WarpTask`
  (Task_Teleport2Warp) se quedaba esperando para siempre en el estado 1 con
  `controlsLocked=true` y ninguna excepción ni script activo: el jugador
  quedaba congelado en cualquier puerta/warp cuya música no cambiara. Esto
  afecta a la mayoría de transiciones del arranque (casa → Pueblo Paleta
  incluida). Arreglo: `destinationMusic()` ahora lee `rom.cachedMap(dest)?.music`
  (igual que `GetWarpDestinationMusic`/`GetLocationMusic`); nueva
  `sound.fadeOutMapMusic(speed)` (= `FadeOutMapMusic`) marca un flag
  `waitingForBGMStop` que `isBGMPausedOrStopped()` solo consulta si está
  activo, limpiándolo en cuanto el audio realmente para (o de inmediato si
  nunca se activó). También se implementó `destinationMusicFadeoutSpeed()`
  (`GetMapMusicFadeoutSpeed`: 2 en interiores, 4 fuera) y el chequeo de
  `FLAG_DONT_TRANSITION_MUSIC`. Verificado en navegador: salir de la casa del
  jugador ahora completa el fundido y llega a `MAP_PALLET_TOWN` con
  `controlsLocked=false`.
- Escaleras direccionales (`MB_UP_RIGHT_STAIR_WARP` en la casa del jugador,
  2F→1F) y el warp de flecha sur de la puerta funcionan correctamente cuando
  se disparan (`tryArrowWarp`/`isDirectionalStairWarp`/`doStairWarp` en
  `overworld.ts` coinciden con `field_control_avatar.c`/`field_player_avatar.c`
  línea a línea); el ping-pong y bloqueos que parecían intermitentes en
  pruebas manuales resultaron ser el bug de música de arriba, no un problema
  de estas rutinas.
- **Crash bloqueante encontrado y arreglado: elegir un inicial rompía el
  script en el prompt de apodo.** `game.ts` llamaba
  `rom.c("NAMING_SCREEN_NICKNAME")` (lookup en tiempo de ejecución contra
  `public/fr/constants.json`), pero ese `#define` de `naming_screen.h` no
  está incluido en el paso `constants` del exportador (sí lo está, con su
  valor correcto, en `generated/constants.ts` vía el paso `tsconst`), así que
  `rom.c()` lanzaba `unknown constant NAMING_SCREEN_NICKNAME` dentro de
  `Game.changeNickname` → `ChangePokemonNickname` (special), justo después de
  `givemon` en `PalletTown_ProfessorOaksLab_EventScript_ChoseStarter` /
  `EventScript_GiveNicknameToStarter`. La excepción no interrumpía el bucle
  de frames pero dejaba el intérprete de scripts a medio ejecutar: el
  Pokémon inicial SÍ quedaba en la party (`givemon` ya había corrido), pero
  el juego nunca mostraba la pantalla de apodo ni devolvía el control
  (bloqueo silencioso, sin `controlsLocked` visible desde fuera del script
  pero sin avanzar tampoco). Arreglo: las 3 llamadas en `game.ts` ahora usan
  `C.NAMING_SCREEN_NICKNAME` (import de `generated/constants.ts`), como pide
  AGENTS.md §9 para constantes literales. Nota para el exportador: `tools/decomp/export.py`
  paso `constants` no barre `include/naming_screen.h`; si aparecen más
  `rom.c("NAMING_SCREEN_*")` en el futuro, preferir `C.*` en vez de
  reexportar solo por esto.
- Verificado en navegador de punta a punta, sin contaminar el guion con
  movimiento manual mientras `applymovement`/`waitmovement` están en curso
  (los `__reliableStep`/`walk` de prueba intercalados con el guion de Oak
  desincronizaban el guion y daban falsos "bloqueos" — no eran bugs del
  puerto, sino del arnés de pruebas): casa → Pueblo Paleta → guion "OAK: ¡Hey!
  ¡Espera!" en la Ruta 1 → Oak lleva al jugador de vuelta y abre/cierra la
  puerta del laboratorio con `opendoor`/`closedoor` → `ChooseStarterScene`
  (`VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB` pasa a 1 correctamente) →
  diálogo de Oak y el rival → elegir Squirtle → `givemon` añade el Pokémon a
  la party (confirmado con `save.party.length === 1`) → "RED received the
  SQUIRTLE from PROF. OAK!" → pantalla de apodo (`namingScreen.ts`) se abre
  sin crashear (antes del arreglo, este era exactamente el punto de crash).
- **Resuelto en este tramo**: la navegación del cursor al botón "OK" de la
  pantalla de apodo (`menus/namingModel.ts`) incluye el atajo `START` para
  saltar inmediatamente a "OK"; confirmar todavía requiere `A`, como en
  `HandleKeyboardEvent` de `naming_screen.c`. Se agregó sonido de selección
  `SE_SELECT` al desplazarse y el cursor se centró sobre Page swap, Back y OK.
- **Revisión de fuente, 2026-09-26 (sin prueba de juego)**: las reglas de
  teclado de `naming_screen.c` se separaron en funciones con nombre C y ahora
  despachan desde `NamingModel.input`. Esto corrige la ruta `START` sobre OK,
  que antes confirmaba el nombre aunque el C solo mueve el cursor; también
  alinea las prioridades de A/B/SELECT/START y el salto al botón al llenar el
  buffer. El inventario sube a 16/109; las animaciones de cambio de página y
  flashes siguen pendientes. No se ejecutó el juego.
- **Revisión de fuente, 2026-09-26 (sin prueba de juego)**: al llenar el buffer
  del apodo, el cursor reproduce `sAnim_CursorSquish` y espera a que termine
  antes de moverse a OK, como `KeyboardKeyHandler_Character` y
  `MainState_MoveToOKButton`; la entrada queda bloqueada durante esa animación.
- **Revisión de fuente, 2026-09-26 (sin prueba de juego)**: `UpdateHappinessStepCounter`
  en `field_control_avatar.c` ya llamaba al homólogo portado de
  `AdjustFriendship`, pero el TS sumaba `+1` manualmente. Ahora invoca
  `AdjustFriendship` con `FRIENDSHIP_EVENT_WALKING`, que conserva la tirada del
  50 %, el límite y los modificadores del C.
- **Revisión de fuente, 2026-09-26 (sin prueba de juego)**: `naming_screen.c`
  ahora crea los cuatro iconos del `iconFunction` del template: avatar del
  jugador elegido por género desde `sPlayerAvatarGfxIds`, PC, Pokémon con sus
  paletas y personalidad, y rival con el template RED y sus recursos originales.
  El inventario sube a 21/109; siguen pendientes transición de página y flashes.
- **Revisión de fuente, 2026-09-25 (sin prueba de juego)**: `naming_screen.c`
  ahora prepara las dos páginas de teclado en BG1/BG2, aplica el blend del C,
  anima los offsets con la tabla seno y cambia prioridades en el frame 64/128
  (en unidades del C). El rótulo Page Swap conserva su callback independiente
  `SlideOff/SlideOn`; el modelo solo cambia al concluir la animación. El
  inventario sube a 28/109. Los flashes de botones siguen pendientes.
- **Revisión de fuente, 2026-09-25 (sin prueba de juego)**: se portó el ciclo
  `TryStartButtonFlash`/`Task_UpdateButtonFlash` de `naming_screen.c`, incluida
  la selección persistente según la columna del cursor, las interrupciones al
  borrar/confirmar/cambiar de página y la mezcla desde la paleta unfaded con la
  espera y los incrementos originales. El inventario sube a 33/109; quedan los
  detalles de parpadeo del cursor. Sin prueba de juego.
- **Revisión de fuente, 2026-09-25 (sin prueba de juego)**: `SpriteCB_Cursor`,
  `SetCursorInvisibility` y `SetCursorFlashing` ya están conectados al sprite
  real; el callback replica el ciclo de color y oculta el cursor en la columna
  de botones. Inventario: 35/109. Se revisó estáticamente, sin ejecutar el juego.
- **Revisión de fuente, 2026-09-26 (sin prueba de juego)**: confirmar OK ahora
  guarda el texto y decide fundido/mensaje en el estado siguiente, como
  `MainState_PressedOKButton`; antes se guardaba en el manejador de A, un frame
  antes que el C. Sin prueba de juego.
- **Revisión de fuente, 2026-09-25 (sin prueba de juego)**: se agregó
  `GetCollisionFlagsAtCoords` de `event_object_movement.c`, preservando los
  bits independientes de rango, impasable, elevación y objeto. `trainerSee.ts`
  ahora usa los flags para recorrer la línea de visión y enmascara solo el bit
  de rango, como `CheckPathBetweenTrainerAndPlayer`; luego desactiva el rango
  solo para comprobar que el jugador ocupa la última casilla. No se probó el juego.
- **Revisión de fuente, 2026-09-25 (sin prueba de juego)**: `trainerSee.ts`
  ahora tiene los homólogos `GetTrainerApproachDistanceSouth/North/West/East`,
  `GetTrainerApproachDistance` y `CheckPathBetweenTrainerAndPlayer`; el flujo
  normal usa la dirección del entrenador y el chequeo de colisión ya portado.
  Inventario de `trainer_see.c`: 13/37. Buried/disguise/ash y Quest Log siguen
  pendientes. Solo revisión estática.
- **Progresión de juego verificada (Laboratorio Oak → Ruta 1 → Ciudad Verde → Entrega de Correo y Pokédex)**:
  - Combate con el rival (`TRAINER_RIVAL_OAKS_LAB_*`, modo `TRAINER_BATTLE_EARLY_RIVAL`) verificado:
    se inicia tras la elección y apodo, avanza los turnos en el motor de batalla (`HandleTurnActionSelectionState`),
    y tras la victoria cura automáticamente al Pokémon del jugador (`RIVAL_BATTLE_HEAL_AFTER`).
  - Ruta 1 y encuentros salvajes: verificado el desove de hierba alta (`TallGrass`), sombra al saltar bordillos (`ShadowSmall`/`ShadowMedium`)
    y polvo de aterrizaje (`GroundImpactDust` / `JumpTallGrass`), con subprioridades asignadas de inmediato para evitar
    parpadeos de 1 frame.
  - Selección de transiciones salvajes: contra rivales más débiles (Pidgey/Rattata N2-3 vs inicial N5) se ejecuta
    `B_TRANSITION_SLICE` (desplazamiento de scanlines a izquierda/derecha); contra rivales de igual o mayor nivel se
    ejecuta `B_TRANSITION_WHITE_BARS_FADE` (barras de fade a blanco progresivo).
  - Tienda de Ciudad Verde y Correo de Oak: el dependiente entrega `ITEM_OAKS_PARCEL` en la bolsa; al regresar
    al laboratorio en Pueblo Paleta, Oak recibe el correo, retira el objeto de la bolsa, entrega la Pokédex
    (`FLAG_SYS_POKEDEX_GET`), 5 Poké Balls y avanza la variable de escena `VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB` a 6.
  - **Corrección (auditoría 2026-09-25):** una versión anterior de esta lista
    daba por jugados el Bosque Verde, la captura de Pikachu, el Centro de Ciudad
    Plateada y la victoria contra Brock con Medalla Roca y MT39. Nada de eso se
    ejecutó: venía de `tools/checks/viridianForestToBrockPlaytest.ts`, que
    añadía los objetos, el Pikachu, la curación, `FLAG_BADGE01_GET`,
    `FLAG_DEFEATED_BROCK` y `ITEM_TM39` a mano y luego comprobaba que estaban.
    Lo mismo hacía `oakLabToViridianPlaytest.ts` con la curación tras el rival,
    el paquete y la Pokédex. Ambos checks se reescribieron para afirmar solo lo
    que ejecutan (ver "Checks headless reales" abajo).
- **Checks headless reales de esta fase** (nivel headless, no navegador):
  - `npm run check:earlybattles` (`tools/checks/earlyBattlesActionSelection.ts`,
    antes `check:earlygame`): un combate de entrenador con equipo propio y
    enemigo creados a mano llega a `HandleTurnActionSelectionState`, y
    `getWildBattleTransition` elige SLICE/WHITE_BARS_FADE según el nivel sobre
    un overworld simulado. Registra como `PREPARED` todo lo puesto a mano.
  - `npm run check:brock-action` (`tools/checks/brockActionSelection.ts`, antes
    `check:viridian2brock`): los combates contra el Cazabichos Sammy y contra
    Brock llegan a la selección de acción con un equipo creado a mano (Bulbasaur
    N12 para Brock). **No** comprueba la victoria, la medalla ni la MT39.
  - `check:transitions`, `check:weather`, `check:teachytv`: comprueban que los
    datos existen y que las escenas de transición terminan dentro de un número
    de frames sobre un contexto simulado; no comparan píxeles ni frames con el C.

### Sesión de Claude (2026-09-25): arreglos encontrados jugando en navegador

Recorrido real en el navegador del panel con `tools/playtest/driver.js`: casa →
inicial y apodo → rival → Ruta 1 → desmayo (dinero perdido = 8 × nivel, coincide
con el C) → Centro Pokémon → paquete de Oak → Pokédex → menú START → tutorial del
viejo → Ruta 2 → captura de un Rattata (Pokédex y apodo "No").

1. **Centro Pokémon bloqueado para siempre** (6b04eed).
   - Síntoma: tras "¡Tus Pokémon están curados!", la enfermera no terminaba la
     reverencia y el jugador quedaba congelado.
   - Causa: en el C, `MovementAction_NurseJoyBowDown_Step0`
     (`event_object_movement.c`) usa `StartSpriteAnimInDirection` →
     `SetAndStartSpriteAnim`, que pone `animPaused = FALSE`. El TS
     (`field/objectEvents.ts`, acción `nurse_joy_bow`) llamaba a `startAnim` a
     secas, así que la pausa dejada por el `walk_in_place` anterior impedía que
     la animación terminara y `waitmovement` no volvía nunca.
   - Arreglo: la acción quita `animPaused` al arrancar la animación, como
     `SetAndStartSpriteAnim`.
   - Nivel: navegador (curación completa y control devuelto en Ciudad Verde).
2. **El menú START se cerraba en el mismo frame en que se abría** (fd287d4).
   - Síntoma: pulsar START no mostraba el menú (o parpadeaba un frame).
   - Causa: el TS leía `JOY_NEW(START_BUTTON)` en la misma tarea y frame en que
     el campo lo abría. En `start_menu.c`, `task50_startmenu` gasta los frames
     de `DoDrawStartMenu` (estados 0-3, dos opciones por frame, estado 5) y
     `Task_StartMenuHandleInput` un frame más en el estado 0 antes de que
     `StartCB_HandleInput` lea botones.
   - Arreglo: `game.ts` espera esos mismos frames antes de leer la entrada.
   - Nivel: navegador (abrir/cerrar START, entrar en Pokédex, Pokémon, Bolsa).
3. **Pantallas asíncronas cambiaban `callback2` tarde** (baea3d2).
   - Síntoma: al abrir la bolsa desde un combate se veía texto del combate con
     paletas erróneas, y al cerrarla el combate había perdido su menú de acción.
   - Causa: en el C, `GoToBagMenu`, `InitPartyMenu`, `InitTMCase`,
     `InitBerryPouch`, el menú de opciones, el PC de objetos y la Pokédex llaman
     a `SetMainCallback2` al instante. El TS esperaba a cargar sus datos y solo
     entonces cambiaba CB2; en ese intervalo `BattleMainCB2` seguía corriendo,
     `CompleteWhenChoseItem` devolvía `ITEM_NONE` y redibujaba el menú de acción
     en ventanas que luego tomaba la bolsa.
   - Arreglo: nuevo `SetMainCallback2WhenLoaded` en `hw/runtime.ts` (Browser
     adaptation): cambia CB2 en el acto a un callback inactivo y pone el real
     cuando los datos están listos, así el llamador deja de correr en el mismo
     frame que en el C.
   - Nivel: navegador (bolsa desde combate, usar Poké Ball, volver al combate).
4. **El texto dejaba agujeros transparentes** (el cambio quedó dentro de
   cb9cfae, no de ddf7d87).
   - Síntoma: letras con píxeles del fondo "perforados" sobre ventanas con
     color de fondo distinto de 0.
   - Causa: `GLYPH_COPY` (`text_printer.c`) solo escribe los píxeles con color
     distinto de 0 (`if (toOrr != 0)`); `gba/textPrinter.ts` `copyGlyph`
     escribía todos, incluidos los 0.
   - Arreglo: `copyGlyph` omite los píxeles de color 0.
   - Nivel: navegador (cuadros de diálogo del campo).

5. **El cursor del menú START tapaba la primera letra** (esta sesión).
   - Síntoma: la "P" de POKéDEX/POKéMON quedaba cortada al mover el cursor.
   - Causa: `Menu_RedrawCursor` (`menu.c`) borra `GetMenuCursorDimensionByFont`
     (8×14 para FONT_NORMAL, `gMenuCursorDimensions` de `new_menu_helpers.c`);
     `menus/menu.ts` borraba `maxLetterWidth` (10 px) y se comía 2 columnas del
     texto impreso en x = 8. `GridMenu` borraba 10×14 fijo
     (`MultichoiceGrid_RedrawCursor` también usa la tabla).
   - Arreglo: ambos usan `GetMenuCursorDimensionByFont` de `hw/menu.ts`.
   - Nivel: navegador (captura con el cursor en POKéDEX y en BAG).
6. **La descripción del menú START salía cortada** (esta sesión).
   - Síntoma: solo se veía la primera línea de la ayuda, sobre un fondo liso.
   - Causa: `DrawHelpMessageWindowWithText` (`help_message.c`) usa una ventana
     en y = 15 de 30×5 tiles con los tiles de `gHelpMessageWindow_Gfx`
     (0 arriba, 5 en medio, 14 abajo), paleta `GetTextWindowPalette(2)` y texto
     en (2, 5) con espaciado de letra y línea 1 y colores
     `{TRANSPARENT, DYNAMIC_COLOR_1, DARK_GRAY}`. El TS usaba una ventana en
     y = 17 de 3 tiles con relleno de color 15, así que la segunda línea caía
     fuera.
   - Arreglo: nuevo `menus/helpMessage.ts` (`CreateHelpMessageWindow`,
     `DrawHelpMessageWindowTilesById`, `PrintTextOnHelpMessageWindow`); el pack
     `graphics_help_system` se precarga en `boot.ts`. Browser adaptation: la
     ventana vive en la capa canvas del campo, los tiles se copian a su buffer.
   - Nivel: navegador (captura del menú START en la Ruta 2).

7. **El resumen de Pokémon rompía al abrirse desde un combate** (esta sesión).
   - Síntoma: al subir de nivel contra el Campista del gimnasio de Plateada y
     aceptar olvidar un movimiento, excepción `cdata mon_markings not loaded`
     en `PokeSum_CreateMonMarkingsSprite` y pantalla congelada.
   - Causa: `Cmd_yesnoboxlearnmove` (`battle_script_commands.c`) llama a
     `ShowSelectMovePokemonSummaryScreen`, que en el C pone
     `CB2_SetUpPSS` al instante con todo en ROM. En el TS nadie llamaba a
     `preloadSummaryScreen()`: el resumen solo funcionaba si otra pantalla ya
     había cargado sus datos, y nada carga `mon_markings`.
   - Arreglo: `InitSummaryScreenState` usa `SetMainCallback2WhenLoaded(preloadSummaryScreen(), …)`
     (Browser adaptation, mismo patrón que baea3d2).
   - Nivel: navegador (contra Brock, al llegar a N15 se abrió el resumen,
     se olvidó Placaje por Somnífero y el combate siguió).

8. **El menú del PC de Pokémon era invisible** (sesión Gemini, 998a96d).
   - Síntoma: tras "POKéMON Storage System opened." no aparecía ningún menú; el
     juego esperaba botones a ciegas.
   - Causa: `CreatePCMainMenu` (`pokemon_storage_system_menu.c`) dibuja la
     ventana `sWindowTemplate_MainMenu` con marco, `PrintTextArray` y
     `Menu_InitCursor`, y `Task_PCMainMenu` imprime la descripción en la
     ventana 0. El TS de Gemini ("29/29 faithfully") solo guardaba el cursor.
   - Arreglo: port real de `CreatePCMainMenu`/`Task_PCMainMenu` sobre la capa
     canvas del campo (Browser adaptation), con `FadeScreen` al entrar y el
     fundido de vuelta de `CB2_ReturnToField`.
   - Nivel: navegador (menú, descripciones, depositar y retirar a Pidgey).
9. **Las listas de `openHardwareChoice` salían vacías** (cajas del PC y demás
   adaptadores de lista).
   - Causa: `ListMenuInit` pone el tilemap de la ventana 1 y copia solo sus
     tiles (`COPYWIN_GFX`, como el C); el bucle del adaptador no ejecuta
     `DoScheduledBgTilemapCopiesToVram` y el tilemap de BG0 se había copiado
     antes de crear la lista.
   - Arreglo: `CopyWindowToVram(0, COPYWIN_FULL)` después de `ListMenuInit`.
   - Nivel: navegador.
10. **Depositar un Pokémon lanzaba `unknown constant MAIL_NONE`.**
    - Causa: `rom.c("MAIL_NONE")` busca en `constants.json`, que no incluye esa
      constante (mismo patrón que el crash del apodo). Había 8 búsquedas así,
      todas cuelgues latentes: veneno fuera de combate, guardería, recordador,
      `specials` de equipo de 1-2 Pokémon y `ChoosePartyMon`, que además usaba
      un nombre inexistente (`PARTY_MENU_TYPE_CHOOSE_MON`; el C usa
      `PARTY_MENU_TYPE_CHOOSE_SINGLE_MON`, `party_menu_specials.c`).
    - Arreglo: `C.*` de `generated/constants.ts`; `check:honesty` falla ahora
      con cualquier `rom.c("X")` que no esté en `constants.json`.
    - Nivel: navegador (depósito); el resto, tipos.
11. **GUARDAR se saltaba pasos del C.**
    - Causa: `SaveDialogCB_AskSaveHandleInput` → `SaveDialogCB_PrintAskOverwriteText`
      pregunta "There is already a saved file…" (Sí por defecto) si ya hay
      partida, y `SaveDialogCB_PrintSavingDontTurnOffPower` muestra
      "SAVING… DON'T TURN OFF THE POWER." antes de guardar; el SE suena cuando
      termina el texto del resultado. El TS guardaba directamente.
    - Arreglo: `startMenuSave` sigue la cadena `sSaveDialogCB` del C.
    - Nivel: navegador (guardar en el Centro de Plateada y recargar con
      `?fr=continue`: misma casilla, equipo, caja y dinero).

Tramo 1 (2026-09-25, en curso; sin ayudas de depuración):
- Pidgey capturado en la Ruta 2 y subido de N2 a N9 con cambio al primer
  turno (el participante recibe la mitad de la experiencia, como en Gen 3).
- **Evolución tras combate verificada**: Bulbasaur → Ivysaur al llegar a N16
  (`CB2_EvolutionSceneUpdate`, sin intervención).
- Ruta 3 recorrida entera: sus entrenadores vencidos (una derrota intermedia
  con vuelta al Centro de Plateada), llegada a la Ruta 4 y cura en su Centro.
- **Monte Moon, transiciones en encuentros reales**: dos combates salvajes con
  rival más débil usaron `ClockwiseWipeEffect` (CLOCKWISE_WIPE) y el entrenador
  de la cueva `BigPokeballEffect` (BIG_POKEBALL), lo que manda
  `sBattleTransitionTable_Wild/Trainer` para cueva. Sin captura del fotograma
  (no se pudo congelar a mitad del barrido); la prueba es la clase del efecto.
- Monte Moon 1F → B1F → B2F recorridos; falta llegar a la salida B1F → Ruta 4
  (el explorador automático se detuvo antes; ver "Pendiente" en
  PLAN-RECORRIDO.md). No se han visto aún los Rocket, el fósil ni Miguel.
- Fallos de esta parte: **ninguno del juego**. Los atascos fueron del driver
  (elegía en bucle un Pokémon debilitado; su BFS pisaba escaleras), ya
  corregidos en `tools/playtest/driver.js`.

Comprobado y **no es fallo**: la Poké Ball desaparece durante "Gotcha!".
`SpriteCB_ThrowBall_DoClick` muestra el mensaje en el frame 95 y en el 315
llama a `SpriteCB_ThrowBall_FinishClick`, que la funde a blanco y la oculta; el
TS es idéntico.

Observado una vez y **no reproducido**: tras el tutorial del viejo (Ciudad
Verde), la bolsa se quedó con los objetos temporales del viejo (Poción, 1 Poké
Ball, Teachy TV) en vez de restaurar la del jugador (`InitOldManBag` /
restauración en `item_menu.c`). Vigilar en cada prueba que pase por ahí.

- Nivel de prueba alcanzado en navegador: del arranque hasta la Ruta 2 con una
  captura (sesión anterior) y, en esta sesión, desde el punto de control
  `oldman`:
  - Bolsa tras el tutorial del viejo: correcta (5 Poké Balls, Teachy TV); el
    fallo de la bolsa temporal no se reprodujo.
  - Ruta 2: subida de N6 a N11 con combates salvajes reales (`H.battle`, primer
    movimiento), curas en el Centro de Ciudad Verde y dos derrotas con vuelta al
    Centro. Ninguna ayuda de depuración: ni niveles, ni flags, ni objetos.
  - Bosque Verde: entrada con su vista previa, combate real contra el
    Cazabichos Sammy (su flag de entrenador lo puso el guion), salida norte.
  - Ciudad Plateada: Centro Pokémon (curación), museo (cobro de ¥50,
    2980 → 2930, como el guion).
  - Gimnasio: Campista y Brock vencidos eligiendo Látigo Cepa con botones reales
    (la rutina lee `gBattlerControllerFuncs`, `gActionSelectionCursor` y
    `gMoveSelectionCursor` para saber dónde está el cursor; no toca el estado).
    El guion dio `FLAG_BADGE01_GET`, `FLAG_DEFEATED_BROCK` y la MT39 en el
    estuche (verificado leyendo la partida). Bulbasaur terminó en N15.
  - Tienda de Plateada: compra de 3 Pociones (¥900, 4550 → 3650) y venta de 1
    (¥150, la mitad del precio, 3650 → 3800), con el menú BUY/SELL/SEE YA.
  - Ruta 3: el primer combate de entrenador (Weedle N10) se perdió al gastar
    los PP de Látigo Cepa; la derrota llevó al Centro de Plateada con el equipo
    curado. Dos "bloqueos" vistos aquí eran del driver, no del juego (elegía en
    bucle un movimiento sin PP; `idle` no cedía el combate), corregidos en
    `tools/playtest/driver.js`.

## Auditoría de la sesión de Gemini (cb9cfae..77a7609, 18 commits)

Contraste de cada mensaje de commit con `npm run inventory`/`npm run pending`
(con la detección de stubs añadida en esta auditoría: una `function` TS de
cuerpo trivial cuando el C tiene código no cuenta como portada) y con lo que
el juego importa de verdad. No se reescribe la historia de git; las cifras
correctas son las de esta tabla y de [PENDING.md](PENDING.md).

| Commit | Afirma | Realidad medida | Nivel real |
|---|---|---|---|
| cb9cfae | save_failed_screen.c "faithfully, all 14" | 11/14 (3 stubs: DMA y `VerifySectorWipe`); nadie abre la pantalla | tipos |
| db645da | palette_util.c "faithfully, 17" | 17/17 con cuerpo; ningún llamador | tipos |
| 1090ec5 | subprioridad de efectos de campo "a tiempo"; check:earlygame cubre paquete y Pokédex | el cambio de subprioridad no cita función C; el check fabricaba paquete, Pokédex y curación (reescrito) | headless (parcial) |
| 8da5dd8 | player_pc.c "47/47" | 45/47 (2 stubs) | tipos |
| 2b02ea9 | GRID_SQUARES, SHUFFLE, BIG_POKEBALL | efectos existen y terminan en un contexto simulado; sin comparación de píxeles | headless (termina) |
| e722702 | image_processing_effects.c "38/38" | 38/38 con cuerpo; ningún llamador en el juego | headless (funciones puras) |
| 1f668c0 | learn_move.c "23/23" | 20/23 (3 stubs) | paridad de datos |
| 14af1ff | "las 12 transiciones portadas y verificadas" | 12 efectos existen; battle_transition.c 26/134 funciones; solo ANGLED_WIPES visto en navegador | headless (termina) |
| 998a96d | pokemon_storage_system_menu.c "29/29", quita el adaptador | 29/29 del menú; las cajas siguen siendo listas `openHardwareChoice` (`pokemon_storage_system_tasks.c` 4/82) | paridad de datos |
| acaa033 | field_effect_helpers.c "76/76 faithfully" | **14/76: 62 stubs** (`return 0;`); nadie importa el módulo | tipos |
| 1098752 | field_weather.c "50/50", gamma y fundidos | **20/50: 30 stubs** (gamma, fundidos, sequía) | headless (estado) |
| c90f013 | teachy_tv.c "58/58", quita el adaptador | **28/58: 30 stubs**; el juego sigue abriendo el adaptador de texto (`menus/keyItemScreens.ts`); `teachyTv.ts` no se importa | paridad de datos |
| ddf7d87 | playtest Bosque Verde → Brock con medalla y MT39 | el check ponía flags, nivel y objetos a mano (reescrito como `check:brock-action`) | headless (llega al menú) |
| 1aa553d | field_weather_effects.c "faithfully" | 87/93 (6 stubs) | headless (estado) |
| 1b0f0c4 | fame_checker.c "faithfully", "64+ funciones" | 15/64 (7 stubs de gráficos) | headless (estado) |
| 5a6f4ec | slot_machine.c "completely" | 76/77 (1 stub); `game/slots.ts` duplicado sin uso; sin probar en navegador | paridad de datos |
| 77a7609 | trade_scene.c + trade.c "eliminating all remaining adapters" | trade_scene.c 36/53 (3 stubs); **trade.c 0/66** (15 stubs de enlace); teachy_tv sigue siendo adaptador; naming_screen.c 4/109 | paridad de datos |
| cc52017 | ventana de estadísticas al guardar como `PrintSaveStats` | no medido por función; sin probar en navegador | tipos |

Cifras globales corregidas: **5421/9825 funciones (55 %)** con cuerpo real y
118 archivos C pendientes (antes se anunciaban 5592/9825 y 113). Stubs en todo
el repo: 172 (PENDING.md §3b). Adaptadores reales: teachy_tv (texto) y las
cajas del PC (listas).

## field_effect_helpers.c: ayudantes de efectos de campo (2026-09-25)

**Corrección (auditoría):** 14/76 funciones con cuerpo; 62 son stubs y el módulo no se importa. Texto original de la sesión Gemini:
Portado 1:1 en `src/fr/field/fieldEffectHelpers.ts` (76/76 funciones).
- Rutinas de movimiento y proyección de sombras en saltos (`UpdateShadowObjectProperties`, `SetShadowSpriteData`, etc.).
- Comportamientos y animaciones de hierba alta (`UpdateTallGrassFieldEffect`, `SpriteCB_TallGrass`), pisadas en arena, y salpicaduras en agua.
- Efectos de impacto y aterrizaje de saltos sobre bordillos (`GroundImpactDust`, `JumpTallGrass`, `AshPuff`).
- Verificado sin errores de compilación (`npm run check:port`) e integrado en `tools/checks/fieldAndBattleTransitions.ts`.

## field_weather.c: sistema meteorológico y efectos visuales (2026-09-25)

**Corrección (auditoría previa):** comenzó en 20/50 con cuerpo; la gamma, los fundidos con clima y la sequía eran stubs. Texto original:
Portado 1:1 en `src/fr/field/weather.ts` (50/50 funciones).
- Generación de tablas de gamma y fundidos de color según el clima (`BuildGammaShiftTables`, `ApplyWeatherGammaShiftToPalettes`).
- Control de ciclos, variaciones de lluvia (`WEATHER_RAIN`, `WEATHER_RAIN_THUNDERSTORM`, `WEATHER_DOWNPOUR`), tormentas de arena (`WEATHER_SANDSTORM`), ceniza volcánica (`WEATHER_VOLCANIC_ASH`) y nieblas (`WEATHER_FOG_HORIZONTAL`, `WEATHER_FOG_DIAGONAL`).
- Renderizado de partículas de clima sobre el overworld Canvas (`renderWeatherParticles`).
- Verificado con la nueva suite headless `npm run check:weather`.

## teachy_tv.c: Televisor de Enseñanza / Poké Tele (2026-09-25)

**Corrección (auditoría):** 28/58 con cuerpo (30 stubs) y el juego sigue usando el adaptador de texto; sigue siendo adaptador. Texto original:
Portado 1:1 en `src/fr/teachyTv.ts` (58/58 funciones).
- Sustituye el adaptador simplificado previo (`menus/keyItemScreens.ts`) y se elimina del listado de adaptadores.
- Inicialización y gestión de lecciones interactivas impartidas por el Poké Dude (captura, tipos, estados alterados, etc.).
- Verificado con la nueva suite headless `npm run check:teachytv`.

## field_weather_effects.c: partículas y controladores de clima (2026-09-25)

**Corrección (auditoría):** 87/93 (6 stubs). Texto original:
Portado 1:1 en `src/fr/field/weatherEffects.ts` (93/93 funciones).
- Sprites de gotas de lluvia y salpicaduras (`UpdateRainSprite`, `WaitRainSprite`, `InitRainSpriteMovement`, etc.).
- Partículas de copos de nieve, ceniza volcánica, nubes móviles, tormentas de arena y nieblas horizontal/diagonal.
- Vinculado directamente a `sWeatherFuncs` en `weather.ts`.
- Verificado con la suite headless `npm run check:weather`.

## `field_weather.c`: tablas y aplicación de gamma (2026-09-25)

- `BuildGammaShiftTables` ahora produce las tablas normal y alternativa de 19×32 niveles con la fórmula del C.
- `ApplyGammaShift` procesa `gPlttBufferUnfaded` hacia `gPlttBufferFaded`, respeta las 32 categorías base (`GAMMA_NONE`, `GAMMA_NORMAL`, `GAMMA_ALT`), el override de una paleta OBJ y el caso gamma 0. Los gamma negativos siguen sin efecto como en FRLG.
- `ApplyGammaShiftWithBlend` reproduce la selección de tabla y mezcla por canal; las paletas `GAMMA_NONE` siguen la ruta `BlendPalette` del C. `FadeInScreen_RainShowShade` ejecuta el fundido de 16 pasos y aplica gamma 3 al terminar.
- `ApplyDroughtGammaShiftWithBlend` mezcla los colores originales hacia el destino, sin usar la tabla gamma (así está escrito en el C); `FadeInScreen_Drought` aplica la misma secuencia de 16 pasos y la gamma negativa final, que en FRLG no-op.
- `FadeInScreenWithWeather` despacha según `currWeather`; `Task_WeatherMain` ejecuta actualización de gamma en estado 0 y el dispatcher en estado 1. `UpdateWeatherGammaShift` ahora aplica cada paso a las paletas y vuelve a IDLE cuando corresponde.
- `FadeInScreen_FogHorizontal`, `ApplyFogBlend`, `LightenSpritePaletteInFog` y `MarkFogSpritePalToLighten` implementan la mezcla del fondo y las seis paletas OBJ que C puede aclarar.
- `UpdateSpritePaletteWithWeather` conserva las ramas C de fade-in, fade-out, gamma y niebla; `ApplyWeatherGammaShiftToPal` expone el mismo hook que `overworld.c` usa para las paletas secundarias del mapa.
- `FadeScreen` y `FadeSelectedPals` siguen las cuatro direcciones `FADE_FROM/TO_BLACK/WHITE`: con clima compatible usan el dispatcher por paleta; en otros climas llaman `BeginNormalPaletteFade` con máscara completa o seleccionada, respectivamente.
- `SlightlyDarkenPalsInWeather` recibe el buffer/longitud de C y aplica `BlendPalettesAt(..., RGB_BLACK, 3, size)` solo con lluvia, nieve, tormenta, shade y downpour; otros climas no cambian el buffer.
- `PreservePaletteInWeather` y `ResetPreservedPalettesInWeather` ahora modifican/restauran la categoría de paleta.
- `LoadCustomWeatherSpritePalette` copia 16 colores al slot OBJ `weatherPicSpritePalIndex` y llama a `UpdateSpritePaletteWithWeather`, como el C. `check:weather` verifica ambos buffers con un índice preparado; la creación/render de sprites de clima sigue sin integrarse al overworld.
- `check:weather` ejecuta las escrituras de paleta, compara vectores numéricos y recorre los estados de gamma, lluvia, sequía y niebla horizontal sobre un estado de prueba preparado; nivel headless. La ruta Canvas2D del overworld sigue usando su aproximación de tint y no consume todavía los buffers globales de paleta.
- `DroughtStateInit`/`DroughtStateRun` reproducen el retardo, la rampa, la tabla seno y el retorno del C; el check ejecuta esos estados con la tabla trigonométrica exportada.
- En FRLG, `LoadDroughtWeatherPalette` está vacío en el C. Por eso `Drought_Main` permanece en el paso 2 y `Drought_InitAll` no termina; el port conserva ese comportamiento. La integración de sprites y del controlador de clima a Canvas2D sigue pendiente.

## fame_checker.c: Buscapeleas / Pokéradar (2026-09-25)

**Corrección (auditoría):** 15/64 con cuerpo (7 stubs de gráficos). Texto original:
Portado 1:1 en `src/fr/fameChecker.ts` (64+ funciones).
- Sustituye el adaptador de texto en `menus/keyItemScreens.ts` y se elimina de la lista de adaptadores (reduciéndolos a solo 2).
- Gestión fiel de las 16 personas célebres de Kanto (Oak, Daisy, Bill, Fuji, 8 líderes de gimnasio, Alto Mando y Giovanni).
- Estados de silueta / desbloqueo con pistas (`flavorTextFlags`), fotos, selector con Pokéball giratoria, paletas e incbins reales (`graphics_fame_checker`).
- Verificado con la nueva suite headless `npm run check:famechecker`.


## battle_transition.c: transiciones de combate de campo (2026-09-25)

Antes no existía transición alguna: `game.ts` `startBattle()` hacía un
`paletteFade.fadeScreen(FADE_TO_BLACK, 0)` liso y pasaba directo a la
escena de combate. Nuevo `src/fr/battle/transition.ts`:

- **Selección fiel**: `getWildBattleTransition`/`getTrainerBattleTransition`
  (`GetWildBattleTransition`/`GetTrainerBattleTransition`/
  `GetBattleTransitionTypeByMap` de `battle_setup.c`) deciden el id de
  transición real según terreno (normal/cueva/flash/agua vía
  `MetatileBehavior_IsSurfable`, `ow.flashLevel`, `mapType`) y si el rival
  es más débil que el jugador (`GetSumOfPlayerPartyLevel`/
  `GetSumOfEnemyPartyLevel`). Elite Four/Campeón/Base Secreta caen en
  `B_TRANSITION_BLUE` como marcador (sus mugshots dedicados no están
  portados; no son alcanzables en este tramo).
- **Intro compartida**: doble parpadeo a gris (`Task_BattleTransition_Intro`,
  `TransitionIntro_FadeToGray`/`FadeFromGray`, `BlendPalette` hacia
  `RGB(11,11,11)`), igual para las 18 transiciones.
- **Efectos portados con fidelidad de coordenadas y temporización**:
  `B_TRANSITION_ANGLED_WIPES` (7 barridos diagonales, elección de
  entrenador/terreno normal cuando el rival no es más débil — la propia
  batalla del rival en el laboratorio la usa) y `B_TRANSITION_CLOCKWISE_WIPE`
  (barrido en sentido horario por cuadrantes, elección salvaje/cueva cuando
  el rival es más débil — la que se verá en Monte Moon). `InitBlackWipe`/
  `UpdateBlackWipe` (el paso Bresenham compartido) se portaron letra por
  letra como la clase `BlackWipe`.
- **Adaptación de render, no de comportamiento**: el C mueve los registros
  GBA `WIN0H`/`WININ`/`WINOUT` por HBlank sobre la PPU en vivo. El campo de
  este puerto renderiza en el canvas2D `gba/` (no en `hw/ppu.ts`), así que no
  hay BG en vivo sobre el que recortar una vez arranca la transición. En su
  lugar `BattleTransitionScene` toma una sola instantánea del frame de campo
  y la recorta por scanline con las mismas coordenadas y el mismo avance por
  frame que `InitBlackWipe`/`UpdateBlackWipe`; solo cambia el backend de
  dibujo (`ctx.drawImage` recortado por fila en vez del registro de ventana
  de hardware).
- **Segundo bloque de transiciones portadas (salvaje/normal)**:
  `B_TRANSITION_SLICE` (persianas con desplazamiento horizontal de scanline alternado
  impar/par `ofsBuffer` y recorte `WIN0H`, selección salvaje/normal cuando el rival es más
  débil — Rutas 1 a 3) y `B_TRANSITION_WHITE_BARS_FADE` (6 barras blancas de 27px escalonadas
  según `sWhiteBarsFade_StartDelays`, con rampa de blend LIGHTEN y posterior transición de blanco
  a negro, selección salvaje/normal cuando el rival no es más débil). Con esto el 100% de los
  combates salvajes en terreno estándar de las primeras rutas tienen transición gráfica.
- **Tercer bloque de transiciones portadas (cueva y combates especiales)**:
  - `B_TRANSITION_GRID_SQUARES` (`Task_GridSquares`): cuadrícula de bloques de 8x8 con 15 etapas de
    contracción progresiva del campo a negro, usada en cuevas cuando el rival no es más débil.
  - `B_TRANSITION_SHUFFLE` (`Task_Shuffle`): desplazamiento senoidal de scanlines (`Sin(sinVal / 256, amplitude)`)
    con fade simultáneo a negro, usada en combates de entrenador en cuevas cuando el rival es más débil.
  - `B_TRANSITION_BIG_POKEBALL` (`Task_BigPokeball`): apertura y cierre de máscara circular con la silueta
    de Poké Ball, usada en combates de entrenador en cuevas cuando el rival no es más débil.
- **Cuarto bloque de transiciones portadas (100% de tablas wild/trainer completadas)**:
  - `B_TRANSITION_WAVE` (`Task_Wave` / `Wave_Main`): barrido senoidal de ventana de izquierda a derecha
    con modulación horizontal por scanline (`Sin(sinIndex, 40)`), completando combates en agua (rival débil).
  - `B_TRANSITION_RIPPLE` (`Task_Ripple` / `Ripple_Main`): ondulación vertical por scanlines
    con amplitud senoidal creciente y posterior fundido a negro, completando combates en agua (rival no débil).
  - `B_TRANSITION_SWIRL` (`Task_Swirl` / `Swirl_End`): remolino senoidal horizontal de scanlines
    con oscilación de amplitud y fade simultáneo a negro, completando combates de entrenador en agua (rival débil).
  - `B_TRANSITION_BLUR` (`Task_Blur` / `Blur_Main`): efecto de mosaico y pixelación progresiva
    con fade gradual a negro, completando combates en Flash (rival débil).
  - `B_TRANSITION_POKEBALLS_TRAIL` (`Task_PokeballsTrail` / `SpriteCB_FldEffPokeballTrail`): 5 Poké Balls
    deslizándose horizontalmente en bandas alternadas a velocidad 8px/frame y barriendo el fondo a negro,
    completando combates de entrenador normal (rival débil).
  - **Corrección (auditoría):** los 12 efectos existen y terminan en un contexto simulado; `battle_transition.c` sigue en 26/134 funciones y solo ANGLED_WIPES se vio en navegador. Texto original:
  - Con esto, **las 12 transiciones** de las tablas de encuentros salvajes y de entrenadores
    (`sBattleTransitionTable_Wild` y `sBattleTransitionTable_Trainer`) están 100% portadas y verificadas
    en la suite `npm run check:transitions`.
- **Bug encontrado y arreglado en el propio `gba/fade.ts`**: `paletteFade`
  necesita que algo llame a `update()` cada frame para avanzar (antes solo
  `overworld.ts` lo hacía); como la transición corre como su propia `Scene`
  fuera del campo, se quedaba con `active=true` y `level=0` para siempre tras
  terminar el barrido. `BattleTransitionScene.update()` ahora llama
  `paletteFade.update()` en su fase final.
- Verificado en navegador con `frDebug.rivalBattle('SPECIES_SQUIRTLE')`
  (mismo nivel enemigo, terreno normal → `ANGLED_WIPES`): parpadeo a gris,
  barrido diagonal visible cerrando la pantalla a negro, fundido final y
  entrega correcta a la escena de combate (`frGame.scene` pasa de
  `BattleTransitionScene` a `HwScene`; pantalla "RIVAL GREEN would like to
  battl[e]" se ve con normalidad).
- Nivel de prueba: **navegador** (`ANGLED_WIPES`) + tipos y build (`npm run check:port`, `npm run build`).

## `save_failed_screen.c`: reparación de sectores de Flash excluida del runtime web

- El port previo en `saveFailedScreen.ts` simulaba un verificador de sectores
  con `VerifySectorWipe` que siempre devolvía falso, además de no estar conectado
  al juego. Eliminé ese módulo y sus stubs: no hay sectores Flash en el
  guardado web y no existe una operación honesta equivalente a borrarlos.
- El flujo real de `Game.writeSave()` ya usa `saveStore.write()` y muestra
  `gText_SaveError_PleaseExchangeBackupMemory` cuando `localStorage` rechaza la
  escritura. Clasifiqué ese manejo como adaptación del error para navegador;
  no afirma recuperar datos dañados ni reproduce la pantalla de hardware.
- El flujo de error de guardado no se ejecutó en navegador ni con almacenamiento
  bloqueado. La verificación de esta clasificación es de código solamente.

## Source-review update (2026-09-24, no execution checks)

- Fixed `ScrCmd_bufferboxname` to use the stored box name through
  `getBoxName`, matching `src/scrcmd.c` / `GetBoxNamePtr` in the decomp.
  The transfer messages in `data/scripts/pc_transfer.inc` now use the same
  name lookup as the PC menu, including renamed boxes and default names.
- Added source-style object lookup by local ID, map number and map group for
  `removeobjectat`, `showobjectat`, `hideobjectat`, `setobjectsubpriority` and
  `resetobjectsubpriority`. Reserved IDs retain the source's map-independent
  lookup. These commands previously discarded the map operands.
- Subpriority now wraps to eight bits, and resetting it requests ground-effect
  updates, matching `SetObjectSubpriority` / `ResetObjectSubpriority` in
  `event_object_movement.c`. This is not full object-event parity.
- Movement start/wait commands now resolve object identity using the requested
  map (or the current map for the unqualified commands). Waiting with local ID
  zero still refers to the last movement target, as in `scrcmd.c`.
- `addobjectat` now uses the requested map's template and preserves that map's
  identity on the spawned object. Current-map requests retain the mutable local
  templates. Remote map headers are loaded on demand, pausing bytecode until
  available; this loading wait is a browser adaptation. Spawn duplicate checks
  now include map identity. These changes have source review only.
- Current-map object commands (`setobjectxy`, `copyobjectxytoperm`,
  `turnobject`, `removeobject`) now qualify their lookup by the current map.
  Persistent movement-type updates ignore objects from other maps, matching
  `GetBaseTemplateForObjectEvent`. Trainer battle selection also uses current-map
  identity and clears a stale selection to the source's not-found sentinel when
  the requested trainer is absent. No execution checks were run for these edits.
- VS Seeker trainer collection, movement reset and rematch cleanup now use
  current-map identity, matching `vs_seeker.c`. Scripted trainer icons use the
  map number/group from field-effect arguments, matching `trainer_see.c`.
  SS Anne departure and camera-object removal likewise select the current-map
  object, following `ss_anne.c` and `field_specials.c`. Reviewed in source only.
- Trainer reaction icons now retain their canonical `FLDEFF_*` ID until their
  sprite finishes or its object disappears, so `waitfieldeffect` observes their
  lifetime. Concurrent icons of the same type are counted separately, matching
  the original active list's duplicate entries. Trainer approach waits use the
  same canonical ID, and the single-exclamation sprite uses source subpriority
  0x53. Source-reviewed only; no tests, compilation or browser checks run.
- This change was reviewed against source only. No tests, compilation or
  browser checks were run for it, at the user's request.
- The older inventory below predates several implementations. Naming is
  connected to Oak and battle; wild encounters and trainer sight are connected
  to field control; bag, party, shops and storage have partial adapters.
  These systems need completion and parity review, not implementation from zero.
- Confirmed remaining gaps include Pokédex search/area pages, battle
  animation interpretation, audio refinements, Berry Crush / Berry Picking /
  Pokémon Jump link minigames and specific postgame event handlers. Slots run
  with source betting, bias, stops, lines and payouts (headless-verified);
  reel sprites, the Clefairy dance and line flashes remain pending. Field
  weather's active Canvas2D path uses the normal gamma table for background
  tint, but sprite brightness is still an approximation; the exact palette
  buffer operation is headless-verified and its hardware buffers are not yet
  connected to that renderer. Per-weather sprite effects beyond fog remain
  pending.

## Active path

The default URL runs `src/fr/startup.ts` on a 240×160 Canvas. New Game and
Continue hand off to `src/fr/boot.ts` and the decomp-driven overworld. `?fr=new` and `?fr=continue` bypass startup.

The copyright screen (`src/fr/introCopyright.ts`) now reads the exported
`sCopyright_*` binaries and runs through the GBA palette, VRAM and PPU model.
The Game Freak scene (`src/fr/introGameFreak.ts`) reads its `BgTemplate` and
`WindowTemplate` from C data and its graphics from INCBIN exports. Its
background, theatrical window, text/logo bitmap, logo-art/Presents (rev1)
sprites, star and sparkle callbacks run through the same TS hardware layer.
Scene 1
(`src/fr/introScene1.ts`) also uses the C background templates, INCBIN tiles,
tilemaps and palettes, with its grass animation, background zoom and palette
fade translated from `intro.c`. Scene 2 (`src/fr/introScene2.ts`) now ports the
forest pan, the Gengar/Nidorino wide-shot sprites, and the close-up backgrounds
and pan from the source callbacks. Scene 3 (`src/fr/introScene3.ts`) now runs
its entrance, Gengar/Nidorino fight callbacks, sprite effects, zoom, palette
fade and handoff to the title through the GBA-style TS hardware layer. The
source trig tables are loaded for both startup and direct game launches.
Title runs its source scenes, flame spawner, slash sweep, press-start blink
(60 visible / 30 hidden) and cry handoff through the TS hardware layer. The
title, Game Freak logo/Presents swap and Scene 1–3 frames were verified with
a headless Node renderer (real INCBIN/cdata through `ppu.renderFrame()`):
logo/Charizard/flames, WIN0 slide reveal, RUN, cry fade and a clean menu
backdrop all render. The new game scene (`src/fr/oakSpeech.ts`) is a direct
port of `oak_speech.c` on the hardware layer: controls guide, Pikachu intro,
Oak with the Nidoran♀ release/return, BOY/GIRL menu, name confirmation, rival
pic and name-choice menu, and the white-fade/affine-shrink exit. Verified in
the browser end to end (title → NEW GAME → overworld with the chosen names).
The keyboard naming screen (`naming_screen.c`) is the next port; until then
"NEW NAME" keeps the random default name. SEs and cries stay silent until the
audio backend exists.

## Verification status (2026-09-24)

- The read-only audit passed `tsc --noEmit --incremental false --project
  tsconfig.port.json`, covering every TypeScript source file, including battle.
- `npm run build` checks and bundles the runnable entry point. Compilation is
  not evidence of a complete playable game.
- Earlier implementation notes report browser checks of startup, Oak's speech
  and the lab rival battle. Those checks were not repeated in the read-only
  audit; no complete main-story or postgame playthrough has been verified.
- All 213 exported event-script command names resolve to handlers. Registration
  does not prove behavioral parity. All 272 distinct exported special names are
  registered (verified 2026-09-24: 273 handlers, 0 missing); link/tower/contest
  entries without browser hardware report the source's disconnected-cable codes,
  and some registered handlers are placeholders.
- Exported data includes 425 maps and 365 layouts. Imported maps do not prove
  their events, services or progression work.
- `tools/check_down_arrow.ts` passes (960 pixels, both variants, four frames):
  the battle dialogue continue arrow matches C tile addressing.

## Source review loop (2026-09-25, no runtime checks)

- `tileset_anims.c`: the current source review is superseded by the 2026-09-26 pass below. No browser or pixel comparison was run.
- `event_data.c`: updated by the 2026-09-26 source pass below. Quest Log pointer redirection/recording/playback is still not implemented.
- `special_field_anim.c` (2026-09-26): inventory is now 10/10. The two Sea Cottage specials run named priority-0 tasks with C task-data slots, tile IDs from `rom.c`, and their 13×16-frame / 4-frame timing. The escalator task advances the seven 3×3 sections in the C order and the field-control warp waits for its three stages before fading. The adjacent `field_effect.c` player rail animation, escalator sound, and Quest Log callback are not ported here; the browser integration uses the ordinary warp fade after the metatile task. `check:port`, `check:honesty`, inventory, pending, and `git diff --check` pass. No browser or pixel comparison.
- `trainer_fan_club.c`: postgame fan storage, NPC reveal, time-based gain/loss and dialogue helpers are represented in `specialsExtra.ts`. The new-game reset helper and link-battle updates/link trainer record names are absent; link battle is outside the single-player path. Marked partial.
- `field_tasks.c`: updated by the 2026-09-26 source pass below; the 2025 note's ambient-cry gaps have since been implemented except source audio mixing controls.
- `decompress.c`: source graphics are exported pre-decompressed; Pokémon picture selection and Unown/Deoxys/Spinda handling exist in `pokemon/pics.ts`. Buffer/heap sprite loaders and decompressed-size helper have no direct equivalents; the static object-stitching helper has no callers. Marked partial; no pixel comparison.
- `mini_printf.c`: formatting is used only by emulator debug-print and SWI logging code in `isagbprn.c`, which has no gameplay caller. Marked out of scope for browser single-player.
- `multiboot.c`: implements the GBA cable multiboot download protocol and is unrelated to the single-player game. Marked out of scope.
- `bike.c` (2026-09-26): inventory now recognizes 24/24 definitions in `playerAvatar.ts`. Split the bike input handlers and five transitions into C-named methods; added the collision, rail, running gate, bike speed/reset, stop-player and Acro bumpy-slope helpers. Connected speed gating to field input and cracked-floor steps, and the bumpy-slope stop check to event-object locking. FireRed's `PlayerUseAcroBikeOnBumpySlope` is itself an empty C function; R/S history fields are reset but the final game has no history consumer. `RS_IsRunningDisallowed` is retained with its C behavior but has no FireRed caller. Static checks and generated inventory passed; no browser route or pixel comparison.
- `item_menu_icons.c`: bag pocket animation/shake, swap line and item/berry icon sprite paths are implemented in `bagMenu.ts` and shared with `berryPouch.ts`; typed arrays replace C heap buffers. The custom-template icon loader has no separate equivalent. Marked ported for active single-player scope; no pixel comparison.
- `digit_obj_util.c`: OAM-based number printer is used only by Berry Crush and Pokemon Jump; no TypeScript equivalent exists, and those optional minigame interfaces remain incomplete. Marked partial.
- `field_screen_effect.c`: Flash has a Canvas radius-mask adaptation. The barn-door window wipe and Safari out-of-balls callback are absent; also no source-equivalent post-defeat whiteout recovery text/task was found. Marked partial; includes the main story loss-recovery path.
- `palette_util.c`: RouletteFlash and pulse-blend code is explicitly unused in FireRed, and decomp call search also finds no callers for its tilemap helpers. Marked out of scope.
- `main.c`: `hw/runtime.ts` models callbacks and frame-driven scenes, while startup flow is separate. GBA interrupt/register setup, RFU/link gates, soft reset, flash checks and sound scheduling are hardware-specific and not implemented in the browser runtime. Marked partial.
- `seagallop.c`: ferry state machine, route tables, scrolling crossing, sprite animations, fades, selection and destination warp are ported in `seagallop.ts` with exported source data. Canvas/WebAudio adaptation; no frame comparison.
- `window.c`: window operations are split across `gba/window.ts` and `hw/window.ts`; allocation and rendering APIs are adapted, and some 8-bit/source helper entry points are missing. Marked partial; no exhaustive API/pixel parity check.
- `field_door.c`: door asset table, frame timing, open/close/closed draws, sound and animation state are implemented in `field/doors.ts`; Canvas draws exported frames instead of VRAM tile copies. No visual comparison.
- `trig.c`: exported sine tables and Q8.8/degree Sin/Cos helpers are loaded and consumed through `hw/trig.ts`. No exhaustive numeric diff was run.
- `field_camera.c`: camera movement/map transitions, pan and metatile drawing are integrated in `field/overworld.ts`; GBA ring-buffer slices and camera sprite callbacks are adapted or absent. Marked partial; no movement trace this pass.
- `option_menu.c`: six settings, cycling/input, frame preview, persistence and return flow are implemented in `optionMenu.ts`; Canvas/HwScene adaptation, no pixel comparison.
- `wireless_communication_status_screen.c`: counts RFU trade/battle/union/minigame activity and displays nearby peers; no single-player caller or wireless hardware. Marked out of scope for single-player.
- `script.c`: bytecode/native execution and map-script table dispatch exist in `script/context.ts` and `overworld.ts`; RAM scripts, some dialogue control flags and Quest Log input helpers are missing. Marked partial.
- `itemfinder.c`: current-map hidden item scan, underfoot digging and ding/message behavior exist in `fieldMenus.ts`; connected-map search and arrow/star directional sprites are absent. Marked partial; neighboring-map item detection is a gameplay gap.
- `sound.c`: map music state/fades, fanfares, SEs, cries and ducking have WebAudio counterparts, but the source M4A engine and table-level audio behavior are adapted. Marked partial; no audio comparison.
- `menu_indicators.c`: actualizado por el pase fuente 2026-09-26 abajo; las dos tareas C vacías permanecen sin declararse.
- `item.c`: item metadata, bag/PC inventory operations and item lookup exist across `pokemon/items.ts`, `save.ts` and `bagMenu.ts`; GBA encrypted slot storage, some sort/compaction helpers and story-item Quest Log logging are not exact equivalents. Marked partial.
- `move_descriptions.c`: all 355 source definitions, including the pointer table, are exported as cdata; move relearner and Pokémon summary screens load the table and resolve source text symbols. Source/data path reviewed; rendering parity was not checked.
- `battle_controller_safari.c`: the Safari action menu, throw/intro animations, text, healthbox, sound and battle-animation waits are mapped in `battle/controller_safari.ts`; encounter and catch logic is in `battle/main.ts` / `battleSetup.ts`. Remaining controller opcodes often complete immediately, leaving source sprite/data/status/move/party-summary commands incomplete. Partial; no runtime execution.
- `battle_ai_switch_items.c`: switch choices, switch targets, move/type scoring, held trainer-item classification/effects and AI action selection are represented in `battle/ai.ts`. The source itself notes the omitted Flying/Levitate trapping check. Source code review only; no battle replay or parity execution.
- `menu2.c`: `Menu2_GetMonPosAttribute`/`Menu2_GetStarSpritePosAttribute` are used by the item-use scene. This pass adds `Menu_PrintFormatIntlPlayerName`, `StartBlendTask`, `Task_SmoothBlendLayers` and `IsBlendTaskActive` to `hw/menu.ts`, and connects the blend task to Game Freak intro's logo fade. `UnusedBlitBitmapRect` is static and has no callers, so it is intentionally omitted. Source-driven implementation; no browser test or pixel comparison.
- `mail.c`: held mail and Easy Chat word decoding are represented, while `ReadMail` uses the simplified `menus/mailView.ts` field adapter; C screen/task behavior and Easy Chat authoring remain incomplete. Partial; no UI comparison.
- `player_pc.c`: item-PC and mailbox flows are wired through `menus/playerPc.ts` with bag/party/save behavior, but use generic choice/message adapters instead of the full C window/task/fade/list implementation. Partial source review; PC storage UI remains simplified.
- `list_menu.c`: core list lifecycle, input, scrolling, cursor, template, palette and icon helpers are implemented in `hw/listMenu.ts`; the Mystery Gift-specific wrapper is outside the active single-player path. Source review only; visual list parity was not compared.
- `string_util.c`: byte-string copy/concat/length, decimal conversion and placeholder expansion are spread across `gba/charmap.ts` and `battle/message.ts`; Braille, Japanese/international and multibyte/control-code APIs remain partial or unverified. No parity vectors run.
- `new_menu_helpers.c`: text-box/window/frame, printer and BG-copy behavior is split across hardware and GBA modules; several heap-decompression, printer variant, start-menu/help/signpost and temp-buffer APIs are missing or adapted through pre-exported assets. Partial; no exhaustive visual/frame check.
- `menu.c`: cursor/input, yes-no, frame, top-bar and action-text helpers are spread across hardware-menu modules; grid multichoice, generic text/table printers and several utility APIs remain absent or adapted. Partial; no full menu parity check.
- `item_use.c`: field item classes dispatch to party/screen/field flows. Oak rejection, Enigma field/battle effect selection and the eight-frame Black/White Flute task are connected. Item-use Quest Log recording and the Stat Booster delay/message/button task remain absent or adapted. Partial source review; no flow execution.
- `fieldmap.c`: map layout, tile/behavior queries, camera and tileset loading are spread across field map/overworld/tile-renderer and BG modules. Backup map-view state and VRAM-copy paths are adapted; camera-specific differences are also tracked under `field_camera.c`. Partial source review; no route trace.
- `save.c`: gameplay save state and play time live in `save.ts`, but persistence is JSON in localStorage; C sector checksums, incremental writes, damaged-sector recovery, slot/signature logic and link full-save are absent. Save format/recovery parity remains incomplete; no reload exercise this pass.
- `field_fadetransition.c`: common door/fall/dive/teleport/map fades and music are wired in `field/overworld.ts`; several special transitions and return callbacks are absent or folded into shared handlers, with Canvas/palette sequencing adapted. Partial; route timing was not checked.
- `berry.c`: Berry records/descriptions export to cdata and Berry Pouch UI is present, but field berry-tree growth and berry lookup/type APIs lack active TS equivalents; Enigma Berry validity remains a stub. Partial; optional Berry lifecycle is not implemented.
- `field_screen_effect.c`: replaced the antialiased Canvas Flash arc with integer per-scanline boundaries from the C midpoint-circle algorithm; radius animation and levels already existed. `npm run check:port` passed. Canvas/GBA pixel parity is unverified; barn-door wipe and whiteout recovery remain incomplete.
- `item_menu.c` / `tm_case.c`: Old Man and Teachy TV's Register Item mode use temporary bags; Register follows the source pocket/context/cursor/scroll sequence and restores the real bag. “About TMs” now reaches a temporary bag and opens the existing TM Case with the four C tutorial TMs, restoring the player's TM/key-item pockets on return. Its timed narration/cursor tour and the status/catching battle modes remain unported; runtime frame/UI parity is unverified. Shared backup helpers and `npm run check:port` passed.

## C/header inventory first pass (2026-09-25)

[`C-PORT-INVENTORY.csv`](C-PORT-INVENTORY.csv) lists all 283 C source files,
their same-stem header when present, every included `.h`, source line count,
same-name TypeScript candidates, automatic match category and a separate
status extracted from this document. The
decomp has 343 distinct included headers; 192 C files have a same-stem header.
The inventory also extracts public function declarations from those headers
and records whether each exact function name appears anywhere in `src/fr`.

The current review labels 58 modules as documented ported, 114 as partial or adapted, 8 as pending, 2 with small parity fixes awaiting verification, 23 as explicitly out of scope, 36 as probable out-of-scope candidates, and 42 as unreviewed. Separately, 42 files have a
same-name TypeScript candidate and 181 have no automatic name mapping. These
are inventory counts, not a port completion percentage: a filename match does
not prove parity, and no automatic match does not prove that a C module is
missing because TypeScript ports often combine or rename source modules. Next,
resolve the unmapped names and compare each relevant header's public
declarations with TypeScript exports; only then mark a module complete or
missing.

The initial public-API scan found 2,923 function declarations across 182
same-stem headers; 1,286 names appear in TypeScript and 1,637 do not. The 21
modules that were pending at that scan had 112 declarations; 94 exact names
were absent from TypeScript. Treat those 94 as review candidates, not proven
missing code: some C APIs are folded into another TS module or represented by
different functions. Sort `C-PORT-INVENTORY.csv` by `c_lines` to get a quick
small-to-large backlog, then source-review the absent names and existing TS
behavior before changing their status.

### Five small modules reviewed against source

Sorted by C source length (a quick effort proxy, not an estimate):

| C module | Lines | Finding |
|---|---:|---|
| `save_menu_util.c` | 56 | `SaveStatToString` now formats all five C values and emits the C color/shadow control codes; `npm run check:port` passes. Canvas window/frame placement remains adapted and visual parity is unverified. |
| `play_time.c` | 65 | Reset/Start/Stop/Update/SetToMax now map to save.ts state and Game lifecycle calls. Total frames replace C's split time fields; typecheck passes, runtime parity is unverified. |
| `coins.c` | 98 | `GetCoins`, `SetCoins`, add and remove operations use the browser's plaintext `u16` balance; `check:coins` executes narrowing and cap cases. Coin-window presentation remains Canvas-adapted. |
| `save_location.c` | 112 | Reviewed with `load_save.c`: normal continue uses the saved warp directly. Missing flags affect Pokémon Center/lobby reset warps, GameCube-link unlocks and Champion/postgame behavior; no main-story single-player blocker found. Deferred. |
| `heal_location.c` | 122 | Whiteout now resolves the exported respawn map/NPC, source-specific spawn coordinates and the Pallet home-healing script. Verification is pending; Trainer Tower recovery and the pre-fade recovery presentation remain unported. |

`GetCoins`/`SetCoins` now share the coin balance API in `src/fr/pokemon/items.ts`; slot-machine reads, the `checkcoins` script command, script coin box and Coin Case use `GetCoins`. `check:coins` executes the balance API; the GBA SaveBlock encryption is replaced by the browser save's plaintext representation. The play-time lifecycle is implemented in `src/fr/save.ts` and wired to new/continue/frame in `src/fr/game.ts`; runtime parity remains unverified. The standard
whiteout respawn now uses the original heal-location data in
`src/fr/field/overworld.ts` and selects the correct healer/home script from
`src/fr/game.ts`. These changes still need execution verification. The other
`save_location.c` has no main-story single-player blocker; its missing flags are deferred with reset/link/postgame parity. `save_menu_util.c` now has a source-derived `SaveStatToString` used by the stats panel. Color/shadow controls are preserved; Canvas placement/frame remain adapted and visual parity is unverified.

### Módulos pequeños revisados contra el C (2026-09-25)

- `battle_setup.c`: al comprobar encuentros salvajes sin Silph Scope, el C
  incluye los pisos 1F–7F de la Torre Pokémon. `BattleSetup.startWildBattle`
  solo incluía 3F–7F; amplié la selección a 1F–7F, recuperando los combates
  fantasma de los dos primeros pisos. También `StartMarowakBattle` ahora crea
  al Marowak hembra, Serious y con IV 31 cuando hay Silph Scope, conserva las
  banderas Ghost + Ghost Unveiled y el apodo `Ghost`; antes siempre era el caso
  de fantasma oculto. `npm run check:port` pasa; no ejecuté un encuentro en
  runtime. `StartOldManTutorialBattle` ahora usa `createMaleMon`, port de
  `CreateMaleMon` con orden de RNG, ID de entrenador aleatorio y reroll hasta
  género macho. Los specials de legendarios ya conservan `LEGENDARY_FRLG`,
  `REGI` y `KYOGRE_GROUDON` por separado; la IA FRLG depende de la primera
  bandera. También se porta `GetBattleBGM`/`PlayMapChosenOrBattleBGM`: tema
  por clase de entrenador, tema especial por especie legendaria y overrides
  de roamer/Regi/Groudon-Kyogre; se detienen los players de audio previos y
  arranca la BGM antes de la transición. La selección
  está verificada por tipos y fuente, no por escucha/runtime. Las transiciones
  y la preparación general de entrenadores siguen adaptadas; `check:port` pasa.
- `fldeff_berrytree.c` contiene únicamente un `DoWateringBerryTreeAnim`
  vacío (comentario del propio decomp: eliminado de R/S). El special TS también
  es vacío. Paridad exacta de este archivo; el juego no tiene esa animación.
- `random.c` / `main.c`: `Random`, `Random32`, `SeedRng`, el muestreo de Timer1
  al salir del título y el consumo de RNG para encuentros/ID siguen ahora el
  orden de `ResetMenuAndMonGlobals`/`InitPlayerTrainerId`. La lectura de Timer1
  usa el reloj de alta resolución del navegador (adaptación con precisión
  limitada); `Random2`/`SeedRng2` solo tienen declaraciones en el decomp.
  `npm run check:port` pasa; falta comparación de secuencias runtime.
- `fldeff_dig.c`: mapa permitido, confirmación, selección del Pokémon,
  FieldEffect Dig, transición a pie y escape al último heal location están
  conectados entre `fieldMoveMenu.ts` y `fieldMoves.ts`; revisión de fuente,
  sin cotejo visual en navegador.
- `fldeff_teleport.c`: compuerta, selección, animación, callbacks y warp están
  conectados entre `fieldMoveMenu.ts`, `fieldMoves.ts` y `overworld.ts`. El
  campo web no tiene el `camera-object sprite` para `CameraObjectReset2`; la
  prioridad de subsprites no se representa en Canvas2D. Solo revisión estática.
- `decoration.c` solo incluye las tablas declarativas; el exportador ya las
  entrega como `cdata/decoration.json`. El decomp deja comentadas las
  implementaciones de alta/baja y nombre de decoración; los handlers TS también
  consumen operandos sin efecto, igual que C. La colocación de adornos en la
  habitación no tiene implementación activa en el decomp.
- `fldeff_strength.c`: TS conserva el requisito de estar a pie y tener una
  roca empujable delante; pasa el slot/nickname, muestra al Pokémon y reanuda
  el script para activar Strength. Cotejado con `field_moves.inc` y el C; sin
  prueba en navegador.
- `safari_zone.c`: los ocho APIs están enlazados entre specials, Game,
  FieldEffects y `battleSetup`: entrada/salida, 30 balls/600 pasos, prompt,
  timeout y retornos de batalla. Revisión de fuente; no jugué la zona en browser.
- `text_window_graphics.c`: datos cdata/incbin exportados; `GetUserWindowGraphics`
  y la carga de marco/tiles/paletas están en `hw/menu.ts`, incluido fallback al
  marco cero para índices fuera de rango. No comparé visualmente cada frame.
- `keyboard_text.c` es texto de teclado, no lógica. El exportador conserva sus
  definiciones; `namingScreen.ts` consume las filas enlazadas por C. Las
  pantallas Union Room/Easy Chat no forman parte del recorrido single-player.
- `party_menu_specials.c`: party picker, relearner entry, move counts,
  nickname/move variables, move deletion/PP-Up shift and egg check are wired.
  Move Deleter now uses the real PSS_MODE_FORGET_MOVE summary screen and returns
  the selected move slot (4 when canceled) to the script variable.
- `blit.c`: 4bpp con/sin color key y fill ya estaban; añadí blit 4→8bpp,
  fill 8bpp y wrapper sin color key. `npm run check:port` pasó; falta contraste
  pixel/runtime. `window_8bpp.c` sigue pendiente en su ciclo de ventana y VRAM.
- `braille_text.c`: portado. `FONT_BRAILLE` decodifica `sBrailleGlyphs` con
  `DecompressGlyphTile` y la tabla `sFontHalfRowOffsets` de `text_printer.c`
  (`gba/font.ts`), y `TextPrinter` tiene la `FontFunc_Braille` propia
  (16 px por glifo, sin sonidos ni iconos). `braillemessage` dibuja el marco de
  diálogo e imprime al instante en la ventana 0, como `ScrCmd_braillemessage`, y
  `getbraillestringwidth` usa `GetStringWidth(FONT_BRAILLE)`. `npm run check:braille`
  compara los 64 glifos con `graphics/fonts/braille.png` (16384 píxeles).
- `coord_event_weather.c`: portado en `field/coordEventWeather.ts` y llamado por
  los coord events sin script, como `TryRunCoordEventScript` (FireRed deja vacíos
  todos los manejadores).
- `cable_car_util.c`: portado en `cableCarUtil.ts`; sin llamadores en FireRed.
- `tilemap_util.c`: portado en `hw/tilemapUtil.ts` (vistas recortadas de los tres
  tilemaps de las cajas del PC); lo usará el port de `pokemon_storage_system_tasks.c`.
- `palette_util.c`: sin uso en FireRed. Su propio comentario lo dice: solo sirve a la
  ruleta y a la Torre Espejismo de Esmeralda. No se porta.
- `save_failed_screen.c`: fuera de alcance, como `agb_flash.c`. Solo se activa con
  sectores Flash dañados (`gDamagedSaveSectors`) y los borra byte a byte; el guardado
  web usa `localStorage` y no tiene sectores.
- `script_pokemon_util.c`: `HealPlayerParty` y `DoesPartyHaveEnigmaBerry` ya
  tienen specials TS. Corregí `HasEnoughMonsForDoubleBattle`: ahora conserva
  los tres resultados C según el tamaño de party y cuántos Pokémon vivos no
  huevo hay. `ScriptGiveMon`, `ScriptGiveEgg`, `ScriptSetMonMoveSlot` y
  `CreateScriptedWildMon` aún no están implementadas con la semántica C; los
  selectores de equipos especiales son no-ops. `npm run check:port` pasó;
  queda revisión de comportamiento y de flujos individuales.
- `pokemon_size_record.c`: hash, tabla de tallas, comparación y textos de
  récord de Magikarp/Heracross están implementados en `specialsExtra.ts` y se
  usan en scripts de casas opcionales. Los inicializadores C solo fijan las
  variables a cero al crear partida, igual que el valor inicial guardado web.
  `GiveGiftRibbonToParty` solo lo llama Mystery Event (distribución externa);
  las firmas Seedot/Lotad del header no tienen definiciones en este C. Revisión
  de fuente, sin cotejo runtime.
- `malloc.c`: allocator fijo de EWRAM (headers de bloque, alineación, split,
  merge, zero y comprobación de integridad) queda fuera del runtime web, que usa
  objetos/arrays JS y garbage collection, sin heap GBA direccionable. La
  clasificación excluye el allocator, no los comportamientos de fallo por
  presión de memoria de sus callers.
- `save_failed_screen.c`: recupera sectores físicos de Flash con `ReadFlash` y
  `ProgramFlashByte`; no hay sectores equivalentes en el guardado `localStorage`
  web. Se excluye solo este reparador físico. El manejo de partidas web
  corruptas o incompatibles no queda demostrado por esta clasificación.
- `map_name_popup.c`: el adaptador web conserva nombre/piso, dimensiones,
  reaparición, deslizamiento de 24 px y espera de 120 frames. Canvas sustituye
  BG0/DMA/windows; falta respetar reproducción Quest Log y `palIntoFadedBuffer`.
  Revisión de fuente; timing sin ejecutar.
- `tilemap_util.c`: el original corta y copia rectángulos de tiles para PKMN
  Data, party menu y botón de cerrar caja (incluye su desplazamiento/estados
  alternos); sus callers viven en `pokemon_storage_system_tasks.c`. El storage
  web sigue como adaptador y no usa esos tilemaps; es brecha visual opcional
  del PC, no de progresión/equipo de combate. Revisión de código.
- `menu_helpers.c`: `hw/menuHelpers.ts` cubre las rutinas single-player de
  impresor/tarea, sí-no, L/R, cantidad, fuente de diálogo y reset de BG. Falta
  link queue/wait y callbacks de interrupción; no hay hardware link web.
  `IsHoldingItemAllowed` y `IsWritingMailAllowed` permiten todo por ausencia de
  link activo; no equivalen a restricciones de link. Revisión de fuente.
- `scanline_effect.c`: buffers dobles, DMA por HBlank 16/32-bit, write de
  primera línea y siguientes desde PPU, onda/tarea y offset opcional de BG de
  batalla están en `hw/scanline.ts`. Revisión fuente→TS; sin comparación de
  frames.
- `roamer.c`: corregí la diferencia entre los warps/continue (cambio obligado
  de set) y los pasos entre mapas por cámara (cambio aleatorio 1/16), y los
  resultados de batalla: WON/CAUGHT/DREW desactivan; TELEPORTED no. Wiring de
  ambos loaders y continue; `npm run check:port` pasó. No simulé encuentros.
- `isagbprn.c`: logging para impresoras/emuladores AGB Print, no$gba y mGBA,
  con registros de dirección fija, timing WAITCNT y aserciones debug; sin
  callers de juego single-player ni equivalente requerido en el navegador.
- `diploma.c`: actualizado por el pase fuente de 2026-09-26; sigue adaptando el
  retorno del callback C al ciclo de campo web.
- `util.c`: actualizado por el pase fuente de 2026-09-26; el helperset ya está
  en `util.ts`, conectado por `CountTrailingZeroBits` en batalla.
- `trainer_pokemon_sprites.c`: decompression/paletas y dibujo de trainer card
  usan datos C en `pokemon/pics.ts`/`trainerCard.ts`; falta ciclo completo de
  `CreatePicSprite`. El dex-info de batalla aún usa stub `0xffff`, coherente
  con el Pokédex UI adaptado. Revisión de fuente; presentación no fiel completa.
- `fldeff_cut.c` / `field_specials.c`: Cut al pie de la puerta de Dotted Hole
  ahora comprueba posición, mapa, orientación y flag como
  `CutMoveRuinValleyCheck`; tras mostrar el Pokémon cambia el metatile abierto,
  reproduce `SE_BANG` y persiste la flag de la pista Braille. `check:port` pasa;
  no jugué el recorrido. Cut de césped/árbol conserva su tabla y comprobación
  de elevación, pero los sprites de césped y el refresco de efectos del suelo
  siguen adaptados/omitidos.
- `sloopsvc.c`: servicios `SWI` propios del emulador Sloop (RFU/link, guardado
  sectorial del emulador, controles parentales de comunicación, bad-word,
  telemetría); no implementan reglas de juego single-player ni existen en web.
- `agb_flash.c`: driver físico GBA (ID chip, bancos, Thumb en RAM, timers,
  lectura/programación/verificación sectorial). El browser guarda en
  `localStorage` y no tiene bus Flash. Se excluye hardware, no equivalencia de
  guardados web dañados.
- `load_save.c`: `save.ts` persiste estado completo de juego como JSON en
  `localStorage`, incluyendo party, bolsa, cajas, flags/vars y warps. No porta
  estructura SaveBlock, cifrado/key rotation, checksums ni recovery Flash;
  `load()` solo valida JSON y versión 2. Revisión de código.
- `data.c`: este TU son tablas, no funciones. El export genera sus animaciones,
  nombres y tablas de sprites/trainer desde C en `cdata/data.json` + packs; TS
  los consume en `battle/anim.ts`, `pokemon/pics.ts`, `gfx_sfx_util.ts` y
  `oakSpeech.ts`. Revisé definiciones representativas; sin chequeo de píxeles.
- `m4a_tables.c`: tablas MPlay/PCM/ruido/frecuencias/cries se exportan, pero
  `audio/m4a.ts` usa secuenciador WebAudio propio y no las consume ni replica
  dispatch/síntesis M4A. Brecha de fidelidad de audio, sin impacto en reglas de
  progreso single-player; revisión de fuente.
- `bag.c`: las 13 funciones de ventana/texto/depósito/sí-no/dinero tienen
  implementación homónima dentro de `bagMenu.ts` y se usan por la pantalla real
  de mochila con hardware TS. Revisión de nombres/flujo; sin comparación pixel.
- `text_printer.c`: state machine, controles, colores, tiempos/scroll/prompt
  están repartidos en `gba/textPrinter.ts`/`hw/text.ts`; hice `clearSpan` no-op
  porque el `ClearTextSpan` C está vacío. La rasterización usa fuentes exportadas
  en lugar de lookup y VRAM GBA; Braille custom sigue pendiente. `check:port` pasó.
- `minigame_countdown.c`: countdown 3-2-1/START solo lo llaman Berry Crush,
  Dodrio Berry Picking y Pokémon Jump, todos minijuegos de comunicación/link;
  sin caller de aventura single-player.
- `ss_anne.c`: salida del barco conserva espera de 50 frames, estela/humo,
  desplazamiento cada cinco frames, bocina, umbral de salida y espera final 40
  frames antes de reanudar el script. Animaciones/callbacks cotejados con C;
  presentación de sprites usa Canvas y no se midió el timing visual.
- `script_movement.c`: el movimiento por script respeta mapa/local ID, slots,
  espera de held movement, avance del script, STEP_END, freeze/unfreeze y estados
  de éxito/pending como C. TS guarda referencias a objetos en vez de IDs empaquetados.
  Revisión de fuente; timing y convivencia de tasks no se ejecutaron.
- `task.c`: `gba/tasks.ts` ahora conserva lista priorizada estable del C,
  inserción/reuso de slots, recorrido incluso al crear/destruir durante callback,
  reset y APIs de query/word args. El followup guarda referencia JS en vez de
  dos halfwords de pointer. `npm run check:port` pasó; falta comparar orden frame a frame.
- `clear_save_data_screen.c`: fade, setup BG/ventanas, prompt sí/no, borrado,
  fade de salida y limpieza siguen los estados del C. El web vuelve a startup
  con `done` en vez de hacer soft reset físico; falta comparación visual.
- `buy_menu_helpers.c`: transacciones de compra/venta, cantidad y confirmación
  están en `shopMenu.ts`, pero con ventanas Canvas2D; faltan templates y bordes
  originales, money box y callbacks de mensaje/pacing de la pantalla C.
- `mail_data.c`: se conservan los 16 registros SaveBlock de C; el compositor
  Easy Chat y la importación de mail de enlace siguen pendientes/adaptados.
- `dma3_manager.c`: TS copia BG/tilemaps inmediatamente; falta la cola DMA3
  de 128 requests con presupuesto por VBlank, fill/copy 16/32-bit y wait APIs.
  Los callers existentes usan semántica inmediata y el busy check siempre es false.
- `pc_screen_effect.c`: no existe el encendido/apagado CRT por WIN0/blend; C
  lo usa Item PC, cajas y PC del Hall of Fame. Las versiones web actuales son
  adaptadores de menú sin esa transición.
- `text_window.c`: los loaders estándar, user, help, menú, signpost y Quest Log,
  sus variantes `OnBg`, los dos bordes y `rbox_fill_rectangle` están en
  `hw/menu.ts`/`menuHelpers.ts`. Las ventanas del campo siguen adaptadas a
  Canvas2D; no se hizo cotejo visual en navegador.
- `new_game.c`: `game.newGame`/`newSaveData` inicializan nombre, dinero,
  Potion, Pokédex, flags/vars, tiempo y warp; el trainer ID ahora usa Random +
  el Timer1 adaptado descrito arriba. Faltan resets de varios sistemas.
- `gpu_regs.c`: buffer, coalescing y flush en VBlank están en `hw/gpu.ts` y
  `runtime.ts`; IE/IME/DISPSTAT de hardware se abstraen y los helpers de
  interrupción son no-op. En TS solo se llama `EnableInterrupts(0)`.
- `pokedex.c`: las comprobaciones de completar Kanto/National ahora verifican
  cada especie elegible según las exclusiones del C; arregla los umbrales usados
  por scripts, estrellas de Trainer Card y diploma. La pantalla Pokédex sigue
  adaptada (búsqueda/área/gráficos pendientes). `check:port` pasó.
- `field_message_box.c`: show normal/autoscroll, expansión, color por NPC,
  bloqueo mientras imprime, cierre y reset están en `field/messageBox.ts`. La
  ventana y sus frames usan Canvas2D, no el task/ventana GBA original.
- `fldeff_rocksmash.c`: el menú exige la roca delante; el handler registra
  el stat, reproduce `show mon`/sonido y reanuda el script igual que C. Revisión
  de código completada; no se comparó el timing de animación en navegador.
- `dynamic_placeholder_text_util.c`: el color de texto NPC usa la tabla C
  exportada. Reset/Set/Get/Expand están disponibles en
  `dynamicPlaceholderTextUtil.ts`; expand devuelve bytes nuevos en vez de
  escribir en un destino C. Cajas y minijuegos opcionales conservan adaptaciones.
- `berry_powder.c`: la resta/comprobación de polvo y el vendor tienen handlers
  TS. Faltan el tope 99.999 de GiveBerryPowder, el rewrap por encryption key
  y la ventana exacta; la adquisición depende de Berry Crush (link).
- `window_8bpp.c`: AddWindow8Bit, fills/blits 8bpp y CopyWindowToVram8Bit ya
  están en `hw/window.ts`; `GetNumActiveWindowsOnBg8Bit` usa la tabla compartida.
  El caller de multi-move aún falta porque las cajas del PC siguen adaptadas.
- `battle_util2.c`: la pérdida de amistad al caer coincide, incluida la
  selección del rival de mayor nivel en dobles y el umbral de 29 niveles. Los
  recursos globales están preasignados en TS; faltan las llamadas propias al
  estado de combate de Trainer Tower, por lo que el módulo queda parcial.
- `post_battle_event_funcs.c`: `EnterHallOfFame` ahora entrega los dos tickets
  y activa los flags de islas cuando se concede la primera Champion Ribbon,
  como en REVISION >= 0xA. `SetCB2WhiteOut` está conectado; la UI/animación de
  Hall of Fame sigue adaptada con mensajes y elecciones genéricos. Solo revisión
  de fuente; falta verificación de ejecución.
- `reset_save_heap.c` expone `ReloadSave`, usado solo por recuperación de link;
  su reset EWRAM/registro no aplica al recorrido single-player web.
- `cable_car_util.c` solo define dos helpers estáticos para llenar/copiar
  tilemaps con wrap; no tienen call sites en el repositorio. Los specials de
  Cable Car se registran como `NullFieldSpecial`; se excluye solo este módulo
  inactivo, sin inferir paridad general de tilemaps.
- `berry_fix_program.c` envía el programa multiboot Berry Fix a otro GBA por
  cable, para reparar berries incompatibles entre cartuchos. Requiere hardware
  link y queda fuera del recorrido single-player web.
- `agb_flash_mx.c` contiene comandos físicos de erase/program para MX29L010,
  switching de bancos y polling de timer. No aplican a localStorage; se excluye
  el driver del chip, no la semántica de guardado.
- `agb_flash_1m.c` identifica el chip Flash de 1 Mbit, cambia registros y
  asigna drivers específicos de hardware. Web guarda en localStorage; esto
  excluye solo el controlador físico, no la paridad del sistema de guardado.
- `rom_header_gf.c` define una tabla Game Freak de metadatos/offsets SaveBlock
  consumida por integraciones externas; no hay caller de runtime FireRed. Se
  excluye esta interfaz de herramientas, no datos o lógica del juego.
- `wonder_news.c` reparte berries por noticias enviadas/recibidas con
  partners link y limita recompensas por pasos. Requiere datos Mystery Gift
  transferidos; single-player web no tiene ese canal, así que se excluye solo
  ese sistema de distribución.
- `cereader_tool.c` valida y guarda pisos de Trainer Tower recibidos por
  e-Reader/link en sectores especiales. En FireRed, `ReadTrainerTowerAndValidate`
  es un stub que siempre retorna FALSE; los retos importados no forman parte
  del Trainer Tower single-player normal. Se excluye solo esa transferencia.
- `agb_flash_le.c` solo configura el chip Flash GBA y sus sectores/timings;
  se reemplaza por localStorage en web. Esto no implica paridad del formato de
  SaveBlock ni del flujo de guardado.
- `hof_pc.c` reabre el menú PC y muestra equipos guardados, pero usa listas y
  mensajes genéricos en lugar de fades/tasks/summary originales; es adaptación
  postgame conocida.
- `field_poison.c`: daño cada cinco pasos, resultado poison/faint y task que
  anuncia a cada Pokémon caído, baja amistad, limpia poison y calcula derrota
  están en `fieldEffects.ts` y `field/poison.ts`. `fldeff_poison.c` ahora anima
  los niveles de mosaic del C (ajuste por revisión) sobre BGs durante 11 frames;
  los sprites quedan fuera del pixelado y battle setup espera que termine.
  `npm run check:port` pasa; la muestra Canvas y la paridad visual/frame siguen
  sin comparar con GBA.
- `event_object_lock.c`: comandos de lock esperan que jugador/NPC terminen,
  restauran facing, limpian held movement y desbloquean movimientos de script.
  El helper Union Room queda fuera del single-player.
- `prof_pc.c`: TS calcula vistos/capturados con Kanto/National igual que C;
  `profOakRating` conserva los umbrales 10–150, la excepción de Mew, RESULT y
  el texto del decomp. Paridad por revisión de fuente; falta comparación runtime.
- `fldeff_sweetscent.c`: arreglé el orden de encuentro con roamer (antes de
  revisar la tabla normal). La transición rosa sigue como overlay Canvas y aún
  no reproduce la copia/fade de paletas del C; permanece parcial.
- `fldeff_softboiled.c`: eligibility, elegir destinatario, rechazar usuario/
  debilitado/HP lleno, transferir 1/5 HP y devolver cursor/mensaje coinciden con
  el task de `partyMenu.ts`; fuente revisada, sin interacción live.
- `money.c`: límites/suma/resta y formato básico ya existen en `items.ts`,
  `hw/menuHelpers.ts` y `scriptMenu.ts`. Añadí el ciclo C de `DrawMoneyBox`,
  `ChangeAmountInMoneyBox` y `HideMoneyBox` con la ventana 8×3. El guardado web
  mantiene el saldo descifrado; el acceso C a campos cifrados por puntero no se
  usa directamente. Queda un homónimo pendiente; solo revisión estática.
- `help_message.c`: el gráfico de borde y su patrón de tiles se reutilizan
  en la descripción de movimientos de campo del Party Menu. Falta el lifecycle
  compartido que C usa para las ayudas del Start Menu.
- `field_weather_util.c`: TS cubre el guardado/cambio de clima habitual y el
  contador de lluvia. Ahora traduce WEATHER_ROUTE119/123 con `weatherCycleStage`,
  implementa `UpdateWeatherPerDay`, `GetSav1Weather`, el setter unused y reanuda
  el clima al regresar al mapa. Check estático pendiente al cierre del bloque;
  no hubo prueba en navegador.
- `fldeff_poison.c` aplica su curva de mosaic por task y hace esperar al setup
  de batalla antes de la transición. TS reproduce niveles/timing del C y
  pixeliza BGs Canvas (no sprites); paridad gráfica/frame sigue pendiente.
- `coord_event_weather.c`: el propio C declara dummy los 13 callbacks y el
  dispatcher solo ejecuta uno vacío. Su efecto observable es no hacer nada;
  el clima que sí funciona está implementado por otras rutas.
- `bg_regs.c` define arreglos de registros/flags de BG. El PPU TS expone
  constantes individuales, pero el renderer de campo Canvas2D no conecta el
  setup BLDCNT del overworld; queda parcial/adaptado.
- `math_util.c`: los nueve helpers `Q_8_8`, `Q_N_S` y `Q_24_8` de producto,
  división e inversa viven en `src/fr/mathUtil.ts`. Los intermedios de 64 bits
  usan `BigInt`; Oak usa el helper común `Q_8_8_inv`. `npm run check:port`
  pasa; no se ejecutó comparación numérica en runtime.
- `field_special_scene.c` contiene callbacks vacíos de escena del porthole y
  helpers dummy. `LookThroughPorthole` está registrado como no-op; el otro
  callback solo lo llama `DoPortholeWarp`, marcado unused en el C.
- `blend_palette.c`: `BlendPalette` ya estaba en `hw/palette.ts`; añadí
  `BlendPalettesAt`, incluida su ruta de coeficiente 16 y las operaciones con
  coeficiente `u32` del C. `npm run check:port` pasa; no hice comparación en
  runtime ni validación visual de clima.
- `tilesets.c` no contiene funciones: incluye las tablas fuente de tilesets,
  metatiles y gráficos que `step_tilesets.py` exporta a `public/fr/tilesets`;
  `rom.loadTileset` consume esos datos. Paridad del rol de datos de este .c;
  callbacks y validación visual siguen siendo trabajo aparte.
- `decoration.c` también incluye tablas de datos y se exporta a
  `public/fr/cdata/decoration.json`, pero TS no las consume y los comandos de
  añadir/quitar decoración siguen siendo adaptadores que solo avanzan el script.
  La decoración de la habitación queda pendiente, fuera del camino principal.

### Escena de "usar objeto": `pokemon_special_anim.c` y `pokemon_special_anim_scene.c` (2026-09-25)

`src/fr/pokemonSpecialAnim.ts` porta ambos `.c` completos: `StartUseItemAnim_Normal/
ForgetMoveAndLearnTMorHM/CantEvolve`, las seis tareas (`Task_UseItem_Normal`,
`Task_ForgetMove`, `Task_EvoStone_CantEvolve`, `Task_UseTM_NoForget`,
`Task_MachineSet`, `Task_CleanUp`), `sCancelDisabled`/`PSA_IsCancelDisabled`, la
escena (fondos, ventana de mensaje, zoom, icono del objeto, espirales, estrellas,
vaivén de la máquina), los sprites verticales de subida de nivel y las ventanas
`DrawLevelUpWindowPg1/2` (antes duplicadas en `battle/anim.ts` y `battle/ext.ts`,
que ahora las reexportan). También añade `menu2.ts` (`Menu2_GetMonPosAttribute`,
`Menu2_GetStarSpritePosAttribute`), los placeholders dinámicos en
`dynamicPlaceholderTextUtil.ts` (antes locales de `pokemonSummaryScreen.ts`) y
`CheckIfItemIsTMHMOrEvolutionStone` en `pokemon/items.ts`. `partyMenu.ts` llama
a los `StartUseItemAnim_*` reales (los callbacks pasan por `CB2_ONCE`).
Adaptaciones: el puntero `PokemonSpecialAnim` de `data[0..1]` es el módulo
`sPSA`; los punteros a sprite en `data[]` son índices de `gSprites`. Verificado:
`check:port`, `build` y paridad de cdata/incbin/textos; sin probar en navegador.

### PC de objetos y buzón: `item_pc.c`, `mailbox_pc.c`, `pc_screen_effect.c` (2026-09-25)

`itemPc.ts` porta `item_pc.c` completo (setup por estados, lista con modo de
intercambio, retirar con cantidad, "Dar" al menú de equipo y regreso);
`pcScreenEffect.ts` porta `pc_screen_effect.c` (efecto CRT); `mailboxPc.ts`
porta `mailbox_pc.c` y `gPlayerPcMenuManager`; `playerPcMailbox.ts` porta el flujo
del buzón de `player_pc.c` (lista, leer / pasar a la mochila / dar a un Pokémon)
y `partyMenu.ts` implementa `TryGiveMailToSelectedMon` y
`ChooseMonToGiveMailFromMailbox`. `menus/playerPc.ts` conserva el menú superior y
el submenú de ITEM STORAGE dibujados sobre el campo canvas (adaptador de
`player_pc.c`); "Withdraw" llama a `ItemPc_Init`. Adaptaciones: `save.pcItems` y
`save.pcItems` usa una lista compacta; el buzón indexa los slots C 6–15 y ejecuta
la compactación de `PCMailCompaction`. Corre en su propia escena hw (fondo negro,
ventana de diálogo estándar) en vez de sobre el mapa;
sin Quest Log ni help system. Verificado: `check:port`, `build` y paridad de
cdata/incbin/textos; sin probar en navegador.

### Tienda Pokémon: `shop.c`, `buy_menu_helpers.c` (2026-09-25)

`shop.ts` porta `shop.c` (menú COMPRAR/VENDER/SALIR, pantalla de compra con
vista del mostrador dibujada desde los metatiles del mapa, lista con precios,
icono y descripción, diálogo de cantidad, compra, historial de transacciones) y
`buyMenuHelpers.ts` porta `buy_menu_helpers.c` completo. La vista del mapa
necesitó `objectEventGraphics.ts` (parte de `event_object_movement.c`:
`CreateObjectGraphicsSprite` y la carga de paletas de objetos) y copiar los tilesets
del mapa a la VRAM hw (`BuyMenuLoadMapTilesets`, el C los encuentra ya cargados).
Reemplaza y borra `menus/shopMenu.ts` y `menus/shopModel.ts`. Adaptaciones: la
ventana COMPRAR/VENDER/SALIR y el mensaje "¿Algo más?" se dibujan sobre el
campo canvas (como `menus/playerPc.ts`); COMPRAR y VENDER (bolsa) corren como
escena hw dentro de `fieldMenu` y al salir se cierra la escena y vuelve el menú;
sin Quest Log (`RecordItemTransaction` guarda el historial pero nada lo registra)
ni help system. Verificado: `check:port`, `build` y paridad de cdata/incbin/textos;
sin probar en navegador.

### Hall of Fame y créditos: `hall_of_fame.c`, `credits.c` (2026-09-25)

`hallOfFame.ts` porta `hall_of_fame.c` completo: la pantalla de ingreso (cada
Pokémon entra volando con su grito y ficha, aplausos y confeti, foto y ficha del
jugador, salida hacia los créditos) y el visor del PC del Hall of Fame (efecto
CRT, barra superior, equipos guardados). `postBattleEventFuncs.ts` conserva
`EnterHallOfFame` (curar, flags, cintas, tickets, warp de continuación) y
`SetWarpsToRollCredits`. `credits.ts` porta `credits.c`: guion de textos, ventana
WIN0 con banda oscurecida, corredor jugador/rival y suelo, las cuatro escenas de
Pokémon (círculo afín BG2, ventanas con la imagen), pantallas de copyright y THE
END. `overworldCredits.ts` porta la parte de créditos de `overworld.c`
(`Overworld_DoScrollSceneForCredits`, cámara con las órdenes de velocidad) dibujando
el mapa como BGs hw con `field/hwTilesets.ts` (extraído de la tienda). Los equipos
se guardan en `save.hallOfFame` como 6 entradas (`HofMon`, huecos con
`SPECIES_NONE`). Adaptaciones: las escenas de mapa de los créditos no ejecutan NPCs,
clima ni animaciones de tileset; `SoftReset` recarga la página; sin Quest Log ni
help system; `StopCryAndClearCrySongs` solo limpia el temporizador del grito.
Verificado: `check:port`, `build` y paridad de cdata/incbin/textos; sin probar en
navegador.

### Lista de movimientos del Recordador (2026-09-25)

`moveRelearner.ts` reemplaza la lista genérica por la pantalla de selección del C:
lee `sBgTemplates`, `sWindowTemplates`, el fondo y la paleta exportados; dibuja
los iconos de tipo/poder/precisión/PP/efecto, las estadísticas y la descripción
para el movimiento seleccionado; usa el `ListMenu` común y la fila
`gFameCheckerText_Cancel`. La navegación pregunta antes de enseñar y confirmar
salida; con cuatro movimientos usa `ShowSelectMovePokemonSummaryScreen`, actualiza
slot/PP/bonus, y presenta los textos de olvido/aprendizaje del decomp.
`hardwareChoice.ts` expande placeholders y ahora ofrece la pregunta seguida por
`CreateYesNoMenu` en la misma pantalla, sin el A intermedio ni una falsa fila de
cancelación; el Recordador pasa su `sMoveRelearnerYesNoMenuTemplate` y usa B como
No. Los textos de aprendizaje/olvido conservan sus estados de fanfarria: espera
la duración correcta y un A final, incluidos los dos arranques de fanfarria al
olvidar un movimiento. Verificado: `npm run check:port`, `npm run build` y
paridad de claves cdata/INCBIN referenciadas. No se comprobó aún en navegador.
Faltan el ciclo original de fades/tareas, sprites/animaciones propios del
Recordador y comparación visual.

### Pokédex area marker logic (2026-09-25)

`src/fr/pokedexArea.ts` now ports the source data resolution shared by
`wild_pokemon_area.c` and `pokedex_area_markers.c`:

- Reads the exported FireRed wild encounter rows and MAPSEC-to-DEX_AREA tables;
  applies unlocked Sevii flags, the current Altering Cave set and the roamer's
  starter/location rules.
- Builds marker descriptors from the exported `sAreaMarkers` and C subsprite
  templates, preserving source coordinates, shape, size, priority and tile offset.

`npm run check:port` passes. This is a partial port: the Pokédex area page does
not call the helper yet, and the C sprite/task lifecycle, compressed marker
sheet, palette and OBJ-window blend remain unported. Browser rendering is not
verified.

## Single-player completion audit (2026-09-25)

This is the fastest path to a trustworthy missing-work list. Audit only the
main-story path first; do not count optional/postgame or visual-only work as a
single-player blocker. A feature is complete only when its TS implementation
matches the source behavior needed at that point and has a recorded check.

| Order | Audit slice | Work product | Status |
|---:|---|---|---|
| 1 | Starting town → Route 1 → Viridian | Source scripts located; TS behavior still needs execution/parity checks | In progress |
| 2 | Pewter → Mt. Moon → Cerulean → Vermilion | Same map/event inventory, following actual story gates | Not audited |
| 3 | Lavender → Celadon → Saffron → Fuchsia → Cinnabar | Same inventory, including key items, rival/Rocket events and HM gates | Not audited |
| 4 | Victory Road → Indigo Plateau → Champion | Confirm Elite Four, Champion, credits/result flags and return/save behavior | Not audited |
| 5 | Re-run from a regression save at each discovered blocker | Record reproducible checks and fix only confirmed gaps | Not started |

Within each slice, inspect only source scripts and TS handlers actually
referenced by its story events. This keeps the first pass small and produces a
ranked list by real blockers, rather than treating every registered command or
every C file as equally important. Add optional content, Sevii Islands and
visual/audio parity after the main-story list is closed.

### First slice: initial source-derived checklist

- **Pallet Town and Oak's Lab:** starter/rival scene and flags are already
  implemented according to the earlier status notes. Recheck exit gating and
  return behavior during a browser walkthrough. Source: `data/maps/PalletTown/`
  and `data/maps/PalletTown_ProfessorOaksLab/`.
- **Route 1:** verify the one-time Potion gift, bag-full branch, its persistent
  flag, wild encounters and both exits. Source: `data/maps/Route1/scripts.inc`.
- **Viridian City:** verify Oak's Parcel pickup and return handoff, the Old Man
  road/tutorial scenes and their scene flags, shop/center interactions, and
  exits. Source: `data/maps/ViridianCity/` and
  `data/maps/ViridianCity_Mart/`.
- **Static code cross-check:** all 213 exported script command names have a
  TypeScript handler. The direct story specials found in this slice
  (`GetPokedexCount`, `SetWalkingIntoSignVars`, `DisableMsgBoxWalkaway`,
  `HealPlayerParty` and `StartOldManTutorialBattle`) also have handlers. The
  Parcel macro expands to `additem` plus the standard received-item script;
  both routes exist in the interpreter. This finds no missing command/special
  registration for the inspected scripts, but does not prove their runtime
  behavior matches the C.
- **Known irrelevant stub in this slice:** `QuestLog_CutRecording` and
  `GetQuestLogState` are Quest Log support, which the project lists as out of
  scope. The standard solo-player route does not require Quest Log playback.
- **Still unverified:** execute the new-game path through leaving the house,
  Oak's Lab/rival battle, Route 1's one-time Potion (including the full-bag
  branch), the Viridian Mart Parcel, and delivery back to Oak. Check flags,
  party/bag contents, map transitions and save/continue state. Static checks
  locate these paths but cannot establish the results.

## Inventario por archivo C (2026-09-25)

`npm run inventory` regenera [PORT-INVENTORY.md](PORT-INVENTORY.md): una fila por
`pokefirered/src/*.c` con las funciones que existen con el mismo nombre en
`src/fr`, los TS que citan el archivo y su categoría (fuera de alcance, cubierto
por hw/exportador, adaptador). Primera medición: 3531 de 9825 funciones en
alcance (36 %). La capa de campo antigua (`field/`, `gba/`) usa nombres propios,
así que su porcentaje bajo indica que no es una traducción 1:1, no que falte
la funcionalidad. Actualiza las tablas del script cuando cambie un archivo.

## Pendiente, de más sencillo a más difícil (actualizado 2026-09-25)

> La lista completa y actualizada de faltantes (archivos sin empezar, adaptadores,
> parciales con más C sin cubrir, huecos conocidos y pantallas sin probar) está en
> [PENDING.md](PENDING.md) (`npm run pending`). Esta sección conserva el orden de
> trabajo y el contexto de cada punto.


Orden aproximado por esfuerzo. Cada punto dice qué `.c` portar, qué archivo
TS reemplaza y por qué importa (**[juego]** afecta a la progresión o a las
reglas, **[visual]** solo a la fidelidad visual). Ya portados como pantallas
de hardware: intro/título, menú principal, Oak, teclado de nombres, mapa de
región, opciones, mochila, estuche MT, saquito de bayas, menú de equipo,
iconos de Pokémon, list_menu, Salón de la Fama y créditos, PC de objetos y buzón,
tienda, escena de "usar objeto", Pokédex, tarjeta de entrenador, resumen, evolución,
diploma, Seagallop, motor de batalla completo. Método y verificación: [AGENTS.md](AGENTS.md).

### Prioridad actual: jugar bien las primeras ~2 horas (2026-09-25)

Ruta objetivo: intro → Pueblo Paleta → laboratorio (inicial y rival) → Ruta 1 →
Ciudad Verde (paquete de Oak, Pokédex) → Ruta 2/22 → Bosque Verde → Ciudad
Plateada (museo, Brock) → Ruta 3 → Monte Moon. Orden de trabajo:

1. **Prueba en navegador de la ruta completa** (`?fr=new`, `window.frDebug`) y
   arreglo de todo lo que bloquee o rompa: nombres, inicial, combate rival,
   paquete, entrenadores, captura, Centro Pokémon, tienda, PC, Brock,
   guardar/continuar. Registrar cada fallo y su arreglo aquí.
2. **Transiciones a batalla** (`battle_transition.c`, ~3000 líneas) **[PARCIAL]**: 12 efectos de las
   tablas salvaje/entrenador en `battle/transition.ts` (26/134 funciones); solo ANGLED_WIPES visto en navegador.
3. **Pantalla de nombres** (`naming_screen.c`, 35/109 por nombre): reglas de
   entrada, iconos, transición de página y destellos de botones/cursor revisados
   contra C; quedan otras funciones de la pantalla.
   No se hizo prueba de juego en este bloque.
4. **Efectos de campo** (`field_effect_helpers.c`, 1421 líneas) **[STUBS]**: `src/fr/field/fieldEffectHelpers.ts`
   tiene los 76 nombres pero 62 son stubs y nadie lo importa (auditoría 2026-09-25). Los efectos
   visibles siguen en `field/fieldEffects.ts`. Hay que portar los cuerpos y conectarlo.
5. **Clima de campo** (`field_weather.c`, 1147 líneas) **[PARCIAL: 45/50, 5 stubs]**
   en `src/fr/field/weather.ts`; tablas gamma normal/alternativa, aplicación/mezcla, hooks BG/OBJ, carga y ajuste de paleta OBJ, dispatcher, fundidos por clima, las cuatro variantes de `FadeScreen`/`FadeSelectedPals` y la máquina de gamma de sequía tienen check headless. En FRLG el loader de paletas de sequía es no-op en el C, así que su inicialización queda en el paso 2. La creación/render de sprites y Canvas2D siguen parciales. `check:weather` ejecuta rutas seleccionadas con estado preparado.
6. **Movimiento de NPC fiel** (`event_object_movement.c`): grande; hoy funciona
   con la capa antigua.
7. **Cajas del PC reales** (`pokemon_storage_system_*.c`): el adaptador funciona.

No hacen falta para este tramo: intercambios, Easy Chat, Fame Checker,
tragaperras, Islas Sevii.

8. **Teachy TV** (`teachy_tv.c`, 1400 líneas) **[ADAPTADOR; 28/58, 30 stubs, sin conectar]**:
   el juego sigue abriendo `menus/keyItemScreens.ts`. Texto original de `src/fr/teachyTv.ts`: Implementa máquina de estados de init
   (`TeachyTvMainCallback`), controlador de lista de opciones (`TeachyTvOptionListController`),
   movimientos y comandos del Pokédude (`TTVcmd_*`), carga de gráficos de televisor
   (`gTeachyTv_Gfx`, `gTeachyTv_Pal`, tilemaps), e integración con demos de batalla y bolsa.
   (El check `check:teachytv` solo comprueba datos y estado; no abre la pantalla.)

### Nivel 1 — pequeño (menos de un día cada uno)

1. **Buzón del PC** (`mailbox_pc.c`, parte de `player_pc.c`) **[PORTADO, sin probar]**:
   `mailboxPc.ts` + `playerPcMailbox.ts` (lista, leer, pasar a la bolsa, dar a un
   Pokémon). El menú superior de `player_pc.c` sigue sobre el campo canvas
   (`menus/playerPc.ts`). La escritura Easy Chat sigue pendiente.
2. **Objetos ocultos renovables** (`renewable_hidden_items.c`, 608 líneas)
   **[juego]**: Portado fiel en `src/fr/renewableHiddenItems.ts`, conectado a
   `fieldControl.ts` (conteo de pasos) y `overworld.ts` (`onMapLoad`), verificado
   headless con `npm run check:renewable` (15 mapas, límite de 1500 pasos,
   regeneración y distribución exacta de rare/uncommon/common).
3. **Vista previa de mapa al entrar en cuevas/bosques** (`map_preview_screen.c`,
   transición en `fldeff_flash.c`) **[visual]**: Portado fiel en `src/fr/mapPreviewScreen.ts`,
   conectado a `overworld.ts` (`finishMapLoad`, `setUpWarpExitTask`, `cb2`, `render`)
   y `commands.ts` (`setworldmapflag`). Soporta los 28 mapas (bosques con blend EVA/EVB
   sobre el mapa y cuevas con fade blanco y salto con botón B). Verificado headless con
   `npm run check:preview` (28/28 pantallas renderizadas a 240×160, duraciones 120/40 y banderas).
4. **Efecto de Destello al usarlo** (`field_screen_effect.c`) **[visual]**: máscara por scanlines del algoritmo midpoint C y animación de radio implementadas; falta comparación de píxeles/frame con GBA.
5. **Bolsa del Viejo y bolsas de Teachy TV** (`item_menu.c`, `InitOldManBag`/`InitPokedudeBag`) **[visual]**: Old Man y “Register Item” usan inventarios temporales con la secuencia de bolsillos/contexto del C. “About TMs” abre el TM Case con cuatro TMs temporales y restaura las pertenencias al salir; falta el guion cronometrado y recorrido forzado del TM Case. Status/catching siguen pendientes. `npm run check:port` pasó; falta verificar frames/presentación.
6. **Marcas de Pokémon** (`mon_markings.c`, 605 líneas) **[PORTADO]**:
   portado fielmente en `src/fr/monMarkings.ts`. Incluye el menú interactivo de marcas
   (círculo, cuadrado, triángulo, corazón) con cursor y OK/Cancel, sprites combo para
   el resumen y las cajas (`CreateMonMarkingAllCombosSprite`, `CreateMonMarkingComboSprite`,
   `UpdateMonMarkingTiles`), y `BufferMonMarkingsMenuTiles` que genera las tiles del marco
   del usuario (`GetUserWindowGraphics`). Exportada también `GetUserWindowGraphics` en
   `hw/menu.ts` para uso compartido. Compila y pasa build.
7. **Registro de batallas** (`battle_records.c`) **[diferido]**: guarda rivales de combates por cable y muestra resultados de Trainer Tower. El port no tiene sesiones Cable Club y Trainer Tower es postgame; no bloquea la historia individual.
8. **Contador de tiempo y utilidades pequeñas** (`play_time.c`, `coins.c`,
   `save_location.c`, `heal_location.c`): revisados; tiempo, monedas y recuperación
   estándar tras derrota ya reflejan la lógica principal. Las banderas de guardado
   para enlace/postgame siguen diferidas; queda verificación de ejecución.

### Nivel 2 — pantallas medianas (1–3 días cada una)

9. **Pantalla de datos del Pokémon** (`pokemon_summary_screen.c`, 5225 líneas)
   **[PORTADO]**: portada fielmente en `src/fr/pokemonSummaryScreen.ts` sobre la capa de hardware
   GBA (`hw/`). Implementa los 4 BGs, ventanas con auto-wrap y buffer dinámico de memo/habilidades,
   sprites interactivos (mon pic con vigor de rebote/vibración de huevo, Poké Ball, condición de
   estado, barras de HP y EXP animadas, estrella variocolor, marcas con combo, punto de Pokérus
   curado), cursores duales de selección/intercambio de movimientos, transiciones deslizantes de
   página (Info, Habilidades, Movimientos y Datos de movimiento), cambio dinámico de Pokémon con
   reproducción de grito (cries) y modo de selección de movimiento para aprender/olvidar movimientos
   (`PSS_MODE_SELECT_MOVE`). Reemplaza el adaptador de texto en `summaryScreen.ts` y en `battle/ext.ts`.
   Verificado headless (`npm run check:summary`).
10. **Escena de "usar objeto"** (`pokemon_special_anim.c`,
    `pokemon_special_anim_scene.c`) **[PORTADO, sin probar en navegador]**: ver
    la sección de 2026-09-25 más arriba.
11. **Recordador de movimientos** (`learn_move.c`, 932 líneas; reglas en
    `pokemon.c`) **[PORTADO 20/23, 3 stubs, sin probar en navegador]**: (texto original: "23/23")
    en `src/fr/menus/moveRelearner.ts`. Implementa máquina de estados completa
    (`MoveRelearnerStateMachine`), VBlank y callbacks `CB2_MoveRelearner_*`, carga de
    gráficos y tilemaps (`gMoveRelearner_Gfx`, `gMoveRelearner_Tilemap`, `gMoveRelearner_Pal`),
    indicadores de desplazamiento (`SpriteCB_ListMenuScrollIndicators`), menús de lista
    y Yes/No nativos con bordes y templates de cdata, impresión de info del movimiento
    con ventanas de VRAM y copia asíncrona, y retorno fluido al campo/resumen. Verificado
    con `npm run check:learnmove`.
12. **Tarjeta de entrenador** (`trainer_card.c`, 1959 líneas) **[PORTADO]**:
    portada fielmente en `src/fr/menus/trainerCard.ts` sobre la capa de hardware GBA (`hw/`).
    Implementa:
    - Anverso con nombre del jugador, ID de 5 dígitos, dinero con símbolo de yen, conteo de Pokédex,
      tiempo de juego con parpadeo del colon cada 60 frames, las 8 medallas de Kanto como bloques
      2×2 de tiles en BG3, color de tarjeta según estrellas (0: Azul, 1: Verde por entrar al Hall of Fame,
      2: Bronce por 150 Kanto, 3: Plata por 380 Nacional, 4: Oro por 200 saltos de bayas), y sprite frontal
      del entrenador (Red/Leaf) renderizado en ventana 2 sobre BG3.
    - Reverso con tiempo de debut en el Hall of Fame, estadísticas (victorias/derrotas por link, intercambios,
      Berry Crush, sala Unión) e iconos mini de los 6 Pokémon del Salón de la Fama.
    - Animación de perspectiva 3D al voltear la tarjeta con efectos scanline en BG0 y recorte vertical
      mediante `WIN0V` en 11 frames de contracción a 7px/frame y expansión a 5px/frame con sonidos `SE_CARD_FLIP`
      y `SE_CARD_FLIPPING`.
    - Verificado headless con `npm run check:card` (cdata, estrellas, escena de hardware, animación de volteo 3D y fade out).
13. **Fame Checker y Teachy TV** (`fame_checker.c`, `teachy_tv.c`)
    **[visual]**: `menus/keyItemScreens.ts` son adaptadores de texto; Teachy TV
    necesita además el controlador de batalla Pokédude
    (`battle_controller_pokedude.c`, 2698 líneas).
14. **PC de objetos** (`item_pc.c`, `pc_screen_effect.c`) **[PORTADO, sin probar]**:
    `itemPc.ts` y `pcScreenEffect.ts`; ver la sección de 2026-09-25.
15. **Escena de Evolución** (`evolution_scene.c`, 1704 líneas + `evolution_graphics.c`, 638 líneas)
    **[PORTADO]**: portada fielmente en `src/fr/evolutionScene.ts` sobre la capa de hardware GBA (`hw/`).
    Implementa:
    - `evolution_graphics.c`: matrices de escala OAM (20..31), 4 tareas de chispas (`EvolutionSparkles_SpiralUpward`,
      `EvolutionSparkles_ArcDown`, `EvolutionSparkles_CircleInward`, `EvolutionSparkles_SprayAndFlash`), sprite de
      chispas 8x8 (tag 1001), y morphing de silueta blanca en matrices 30 y 31 (`CycleEvolutionMonSprite`) con
      aceleración progresiva (velocidad 8 a 128) y alternancia de escala pre/post evo.
    - `evolution_scene.c`: animación de fondo con rotación y blend (`Task_AnimateBg` y `Task_UpdateBgPalette`
      con `sBgAnim_PaletteControl` y `sBgAnim_PalIndexes`), cancelación con botón B (`canStopEvo`), bloqueo
      automático sin Pokédex Nacional para especies >151, gritos de Pokémon, fanfarrias y música (`MUS_EVOLUTION`),
      separación de Shedinja (`trySpawnShedinja`), y flujo de aprendizaje de movimientos con la pantalla de resumen
      real (`ShowSelectMovePokemonSummaryScreen`).
    - Conectado tanto en combate (`battle/evoScene.ts` y `battle/main.ts`) como en el campo (`fieldPartyHooks.evolve`,
      piedras evolutivas, Caramelo Raro y `ingameTrade.ts`).
    - Verificado headless (`npm run check:evolution`).
16. **Intercambios en juego** (`trade.c` + `trade_scene.c`) **[PARCIAL, sin probar en navegador]**:
    auditoría: trade_scene.c 36/53 (3 stubs), trade.c 0/66 (15 stubs de enlace). Texto original:
    secuencia de intercambio fiel 1:1 en `src/fr/pokemon/ingameTrade.ts`. Traduce la
    máquina de estados completa de DoTradeAnim_Cable y DoTradeAnim_Wireless (70+ estados),
    deslizamiento de sprites de Pokémon, absorción por Pokéball (`CreateTradePokeballSprite`),
    trayectorias de salto parabólico de la Pokéball con rebotes sonoros y tabla
    `sTradeBallVerticalVelocityTable`, zoom y destellos de pantalla GBA con blending afín
    en hardware BG2, viaje del Pokémon luminoso por el cable link, secuencia de cruce
    con siluetas afines de ambos Pokémon, caída y rebote de llegada de la Pokéball
    (`SpriteCB_BouncingPokeballArrive`), liberación con `CreatePokeballSpriteToReleaseMon`,
    fanfare `MUS_EVOLVED`, registro en Pokédex, amistad a 70 y evolución posterior.
    `check:trade` solo comprueba datos (cdata/incbin), no ejecuta la escena.
17. **Tragaperras** (`slot_machine.c`) **[PORTADO 76/77, sin probar en navegador]**: pantalla
    en `src/fr/menus/slotMachine.ts`. Traduce el C completo: 3 rodillos animados
    con deformación afín en OAM y scanline blending en HBlank, mascotas Clefairy con
    animaciones (neutral, girando, baile de victoria y desmayo), dígitos de crédito
    y pagos, ventana de combinaciones deslizable con WIN0, botones iluminados,
    parpadeo de líneas ganadoras con tabla sinusoidal y menú Yes/No al salir.
    `check:slots` solo comprueba datos y reglas. `game/slots.ts` es un duplicado sin uso.

18. **Pokédex completa** (`pokedex_screen.c`, `pokedex_area_markers.c`,
    `wild_pokemon_area.c`, `trainer_pokemon_sprites.c`) **[PORTADO, sin probar]**:
    `src/fr/pokedexScreen.ts` traduce el C completo: menú principal, listas
    numérica/búsqueda, páginas de hábitat con pase de página, ficha con marco de
    zoom, página de área y registro tras una captura (`displaydexinfo`).
    `pokedexArea.ts` porta los marcadores (ventana OBJ) y `trainerPokemonSprites.ts`
    las imágenes de Pokémon/entrenador en sprite o ventana. Sustituye el adaptador
    `menus/pokedex.ts`. Se corrigió `GetPokedexHeightWeight` (leía un cdata vacío).
    Verificado solo con `check:port`, `build` y la paridad de cdata/incbin/textos.
19. **Menú Guardar e informe** (`start_menu.c` guardado, `save_menu_util.c`)
    **[visual]**: comparar la ventana de guardado y el resumen con el C.

20a. **Tienda Pokémon** (`shop.c`, `buy_menu_helpers.c`) **[PORTADO, sin probar]**:
    ver la sección de 2026-09-25.
20b. **Hall of Fame y créditos** (`hall_of_fame.c`, `credits.c`) **[PORTADO, sin probar]**:
    ver la sección de 2026-09-25.

### Nivel 3 — sistemas grandes (varios días)

20. **Transiciones de combate** (`battle_transition.c`, 3037 líneas)
    **[visual]**: hoy no hay transición (espiral, persianas, etc.); se nota en
    cada combate. El pack `graphics_battle_transitions` ya se exporta.
21. **Menú de almacenamiento de cajas** (`pokemon_storage_system_menu.c`, 660 líneas)
    **[PORTADO]**: portada fielmente al 100% (29/29 funciones del C) en `src/fr/menus/storageMenu.ts`.
    Implementa la máquina de estados de `Task_PCMainMenu` (`STATE_LOAD`, `STATE_FADE_IN`, `STATE_HANDLE_INPUT`,
    `STATE_ERROR_MSG`, `STATE_ENTER_PC`), validación de cupo en equipo (`CountPartyMons`), chequeo de huevos
    (`CountPartyNonEggMons`), menú de selección de caja (`ChooseBoxMenu`) con sprites de esquinas y flechas
    animadas (`SpriteCB_ChooseBoxArrow`), y reseteo completo de cajas (`ResetPokemonStorageSystem`).
    Eliminado de la lista de adaptadores pendientes. Verificado con `npm run check:storage`.
22. **Easy Chat** (`easy_chat*.c`, ~4000 líneas) **[juego]**: escribir cartas
    (hoy quedan en blanco), perfiles y frases de algunos NPC.
23. **Animaciones de ataques restantes** (`battle_anim_*.c`, ~30 000 líneas)
    **[visual]**: el intérprete está completo y ~68 % de las referencias tienen
    tareas reales; faltan flechas de stats, sacudidas de terreno, sustituto/
    transformación, scroll de BG, copias mon→BG y los efectos por tipo
    (`battle_anim_fire.c`, `…_ice.c`, `…_effects_1/2/3.c`…). Portar por
    frecuencia de uso (Growl/Tail Whip primero).
24. **Audio fino** (`m4a*.c`) **[visual/sonido]**: reverb, ADSR exacto,
    duty/sweep, keysplit, atenuación de BGM bajo los gritos, paneo.
25. **Torre Entrenador de Isla Siete** (`trainer_tower.c` + `trainer_tower_sets.c`,
    ~9000 líneas de datos) **[juego postgame]**: specials registrados, falta
    completar reglas y datos de equipos.
26. **Casos límite de revanchas/roaming/guardería** **[juego]**: Buscapelea,
    Pokémon errantes, huevos; núcleo portado, falta verificación contra el C.

### Nivel 4 — validación de juego completo (lo más largo)

27. **Recorrido zona por zona** de toda la historia de Kanto y Sevii con
    comparación contra el C/emulador: eventos, specials que aún devuelven
    valores fijos, entrenadores, objetos, capturas, Safari. Es el único
    criterio real de "juego completo".
28. **Guardados de regresión**: snapshots por zona + cargador para repetir
    pruebas rápido; checks headless por sistema en `tools/checks/`.
29. **Decisión de diseño postgame**: eventos de distribución (tickets de Mew/
    Deoxys): inalcanzables (fiel) o ruta alternativa.

### Fuera de alcance (no hay hardware de enlace en el navegador)

Batallas/intercambios por cable, Union Room y su chat, Berry Crush, Dodrio
Berry Picking, Pokémon Jump, Mystery Gift/Mystery Event, e-Reader, adaptador
inalámbrico, `link*.c`/`librfu*.c`, `quest_log*.c` (repetición de partida) y
el sistema de ayuda (`help_system.c`). Los stubs devuelven los códigos de
"cable desconectado" del C.

### Mejoras futuras posibles (no son parte del port fiel)

16:9 con cámara ampliada del overworld, escalado entero/filtros, guardado en
la nube, atajos de calidad de vida (correr siempre, texto instantáneo),
sin tocar las reglas: hacerlo detrás de opciones para mantener el modo fiel.

## Removed legacy code (2026-09-24)

Later cleanup: the text-list party adapter helpers (`fieldMovesOf`,
`fieldMoveName`, `flyDestinations`, `mapSecName`) and the unused exported PNGs
(`gfx/pokemon/{back,back_shiny,icon}`, `gfx/items`, `gfx/trainers`,
`gfx/battle`, `gfx/interface`, `gfx/fieldfx`, ~7 MB) were removed; the ports
read those graphics from INCBIN. `step_graphics.py` now exports only fonts,
window frames, doors and front pics. `tools/check_down_arrow.ts` moved to
`tools/checks/downArrow.ts` (`npm run check:arrow`).

The Phaser prototype (`src/engine`, `src/scenes`, `src/content`, `src/game`,
`src/audio`, `src/ui`), the `phaser` dependency, the legacy importers
(`tools/import_*.py`), their generated `public/assets/`, `Pallet Town.mp3`
and the prototype documents (`ENGINE-PORTING.md`, `PALLET-TOWN-TASKLIST.md`)
were deleted; they remain in the Git history. `tools/decomp/` is the only
exporter. `npm run build` passes without Phaser.

Existing Pokémon, inventory and save logic should be reused and compared with
source behavior; missing interfaces do not mean those rules are absent.
`game.ts` throws when no battle runner is installed, but normal boot installs
the battle host. Trainer sight and wild encounters are connected through
`fieldControl.ts` → `fieldEffects.ts` → `game.wild`/`game.trainerSee`; the
keyboard naming screen (`namingScreen.ts`) is connected for player, rival,
party, box and caught-mon naming. Several field services and specials still
return fixed results or resume without implementing the source behavior.

The exporter covers all steps including audio (`tools/decomp/step_audio.py`:
songs, voice groups, instrument samples, cries).

## Porting method and document ownership

The full method (data pipeline, cdata/INCBIN access, faithful translation
rules, animations, verification levels) is in [AGENTS.md](AGENTS.md).

This file describes the active `src/fr` port. `START-FLOW.md` describes its
launch path.
`SECONDARY-MISSIONS-AUDIT.md` inventories source content, not completed features.

## Battle engine (src/fr/battle)

The battle port is wired into
the game (`boot.ts` → `installBattleHost`, assets via `battle/preload.ts`).
Ported modules: battle_main (init + turn flow), all 248 battle script commands,
battle_util, battle_message, the player / opponent / Oak-Old Man controllers,
controller data transfer, damage calc, the trainer AI (script interpreter plus
switching and item use), battle_interface (health boxes, HP/EXP bars, party
ball tray), battle_gfx_sfx_util, battle_intro (terrain slide), pokeball (send-out,
ball particles, mon fade), reshow_battle_screen, battle_anim_mons (coordinates,
translations, rot/scale) and the level-up sprites.

Earlier implementation notes report a browser check: the Oak's Lab rival battle plays end to end (intro,
Oak's tutorial commentary, move selection, AI turns, damage, faint, EXP and
level-up, prize money, return to the field). Debug shortcut after launching a
game: `frDebug.rivalBattle()` (optionally `"SPECIES_SQUIRTLE"` / `"SPECIES_CHARMANDER"`).

Pending / placeholders:
- Battle animations are a faithful port of every `battle_anim*.c` file:
  `battle/animScript.ts` (the `battle_anim.c` interpreter, all `Cmd_*` and BG/pan
  helpers) plus one module per file under `battle/anims/` (mons, mon_movement,
  utility_funcs, normal, special, sound_tasks, status_effects, effects_1/2/3,
  smokescreen and every type file). Sprite callbacks and tasks register by their
  C name (`battle/animRegistry.ts`); `animTasks.ts` only dispatches.
  `npm run check:anims` boots a real wild battle headless and runs all 354 move
  scripts from both sides, the general/status tables, level-up/switch-out/
  Substitute specials, every ball × every throw outcome (0–3 shakes, trainer
  block, ghost dodge, capture) and the shiny sparkles: 0 failures, 0 missing
  callbacks/tasks, no leaked sprites or tasks. Adaptations: contest paths are
  compiled but unreachable (`IsContest()` is false), cries and SEs ignore the pan
  value (the m4a mixer has no panning yet), and the Safari bait/rock throws are
  skipped by the check because they need the Safari trainer sprite. Not yet
  compared frame by frame against the ROM.
- Bag and party screens are the ported `bagMenu.ts` / `partyMenu.ts`; the
  summary screen and move-forget selection use the faithful `pokemonSummaryScreen.ts`;
  Pokédex page in `battle/ext.ts` remains a text adapter.
- Battle evolution runs the full presentation in `battle/evoScene.ts` (intro
  message, cry, evolution music, white flashes with B-hold cancel, national-dex
  auto-stop past Mew, congrats/stopped messages, Shedinja split, new-move
  learning); verified headless (complete, cancel, stone-no-cancel, auto-stop).
  Sprite/background animation callbacks remain pending.
- Link battles, VS Seeker rematch state.
- The battle continue-arrow source offset is corrected: C's 256-byte alternate
  offset maps to x=64 in the exported image. A focused check compared 960 pixels
  against the packed source tiles across both variants and all four frames,
  including delay ticks. TypeScript and production build pass. An interactive
  battle check of the corrected arrow is still pending.
- `bg_regs.c`: added `hw/bgRegs.ts` with the BG0–BG3 control/scroll register
  offsets, display flags and both BLDCNT target masks. C MMIO pointer tables
  are represented by their register offsets. `npm run check:port` passes;
  the Canvas2D field does not yet consume these shared hardware tables, and
  runtime/visual parity was not checked.
- `post_battle_event_funcs.c`: `EnterHallOfFame` already covered healing,
  game-clear/first-play-time stats, Pallet continue warp, ribbons, revision-0
  ticket rewards and screen handoff. Source comparison with `hall_of_fame.c`
  found and fixed first-clear history reset before recording the first team;
  repeat entries preserve prior teams. `SetCB2WhiteOut` already delegates to
  `Game.whiteOut`. `npm run check:port` passes; HOF presentation remains adapted
  and runtime behavior was not exercised.
- `field_weather_util.c`: `FieldWeather.setWeather` now narrows to the C `u8`,
  updates saved weather and the rain stat, then sets next weather immediately;
  the `setweather` script command uses it. Map-header reset and
  `DoCurrentWeather` remain separate. `npm run check:port` passes. Route-cycle
  stages, paused-weather resume and the unused variant remain unported; visual
  renderer limits are tracked under `field_weather.c`.
- `field_message_box.c`: compared the six header APIs and enum with
  `field/messageBox.ts`; exported state values now use generated C constants
  (`HIDDEN=0`, `UNUSED=1`, `NORMAL=2`, `AUTO_SCROLL=3`). Init/show/hide and
  printer completion exist; Canvas frame/task timing remains adapted.
  `npm run check:port` passes; no visual runtime check.
- `berry_powder.c`: added the missing `GiveBerryPowder` API with C `u32`
  wraparound, the 99,999 cap, and the success/failure return. Existing read,
  spend and vendor-menu paths remain in `specialsExtra.ts`. Browser save stores
  the value plainly instead of GBA XOR encryption; the only C grant caller is
  Berry Crush (link-only, not implemented). `npm run check:port` passes; vendor
  window remains Canvas-adapted.
- `money.c`: `isEnoughMoney`, `addMoney` and `removeMoney` now narrow inputs
  and balances to C `u32`; `AddMoney` reproduces wrap detection before its
  999,999 cap, and subtraction keeps the zero floor. `npm run check:port`
  passes. Encryption and GBA window/object rendering remain adapted; no runtime
  arithmetic exercise was run.
- `dynamic_placeholder_text_util.c`: the eight-slot dynamic placeholder APIs
  remain implemented in `pokemonSummaryScreen.ts`; extracted
  `GetColorFromTextColorTable` to `dynamicPlaceholderTextUtil.ts` with C `u16`
  narrowing, packed nibble selection and neutral fallback. Field dialogue uses
  the shared function, and `rom.scriptMenu.textColors` now has its exported
  flat-array type. `npm run check:port` passes; no runtime call exercise.
- `script_pokemon_util.c`: source callers are present under different names.
  Fixed `Game.scriptGiveMon` to set seen/caught only when `GiveMonToPlayer`
  succeeds to party or PC, as the C status switch specifies. Healing, eggs,
  move-slot updates and scripted wild creation already map to TS paths.
  Half-party selection, `ReducePlayerPartyToThree` and Battle Tower callbacks
  remain absent/adapted, outside the ordinary single-player story. Typecheck
  passes; no runtime scenario was exercised.
- `window_8bpp.c`: added all five APIs to `hw/window.ts`:
  `AddWindow8Bit`, 8bpp full/rect fills, the 4bpp-to-8bpp window blit, and
  `CopyWindowToVram8Bit` with MAP/GFX/FULL behavior. The buffer uses 64 bytes
  per tile and bypasses 4bpp auto-allocation. `npm run check:port` and the
  whitespace check pass. The storage multi-move caller in
  `pokemon_storage_system_misc.c` is still absent because storage UI remains
  an adapter; no pixel/runtime comparison was run.
- `new_game.c` / save path in `start_menu.c`: core initialization, options,
  player trainer ID, title-seeded RNG order, Pallet room warp and reset-map-flags
  script already map to `newSaveData`, `Game.newGame` and `random.ts`. Added
  `gDifferentSaveFile` behavior: if a valid previous browser save exists, the
  first save of the new game asks before replacement and selects No by default;
  declining leaves the old local save intact. `npm run check:port` passes.
  Browser overwrite/reload behavior was not exercised. Link/minigame/mystery-gift
  reset blocks remain outside the ordinary single-player path.
- `gpu_regs.c`: buffer bit updates now read `sGpuRegBuffer`; DISPSTAT flushes
  preserve non-interrupt status bits; Enable/DisableInterrupts track the C
  16-bit IE mask and update H/VBlank enable bits. SetGpuReg ignores offsets
  beyond `0x5f`, matching the C function. `SetGpuReg_ForcedBlank` is declared
  in the header but has no definition in this decomp, so no body was invented.
  The browser still dispatches callbacks from its frame loop. Typecheck passes;
  register/frame parity was not exercised.
- `text_window.c`: added signpost/help/quest-log/std tile loaders,
  `LoadUserWindowGfx2`, `DrawTextBorderInner` and `rbox_fill_rectangle` to the
  shared hardware helpers. `LoadUserWindowGfx` now defaults to the saved frame
  option as C does; palette IDs outside 0–3 resolve to frame palette 4.
  `GetOverworldTextboxPalettePtr` is declared but has no definition or caller
  in this decomp. `npm run check:port` passes; field Canvas presentation remains
  adapted and no visual comparison was run.
- Follow-up source pass: implemented the six missing C helpers for explicit BG
  destinations and frame-indexed user windows, and routed the existing window
  wrappers through them. `text_window.c` is 18/18 by name in the inventory;
  only source/type checks were run, with no browser or headless comparison.
- `pokemon_storage_system_menu.c` / `pokemon_storage_system.c`: added
  `resetPokemonStorageSystem` and call it during new-game initialization. It
  resets current box, all 14×30 slots, localized `gText_Box` names with C's
  two-digit conversion and wallpaper `boxId % (MAX_DEFAULT_WALLPAPER + 1)`.
  `getBoxName` now uses the same generated text/format and handles invalid u8
  box IDs as EOS. `npm run check:port` passes; storage screens remain adapted
  and no UI/runtime flow was exercised.
- `mail_data.c` (initial partial pass): added `SpeciesToMailSpecies` and
  `MailSpeciesToSpecies` in `pokemon/mail.ts`, preserving the C
  `UNOWN_OFFSET=30000` form encoding and personality-derived letter.
  This storage adaptation was superseded by the 2026-09-26 SaveBlock mail pass
  below. Easy Chat composition remains unported.

- `wild_encounter.c`: added the source `GetLocalWildMon` and `GetLocalWaterMon` behavior to `WildEncounter`, including no-header/no-table fallback, 80% land choice when both tables exist, water flag, and weighted 12-slot/5-slot selection using the shared C RNG. Ambient cries can reuse these APIs; ambient scheduling and cry-mixer parameters are still not ported. `npm run check:port` passes; no runtime RNG comparison was run.


## `field_tasks.c`: tareas persistentes del campo (2026-09-26)

- El inventario reconoce 10/12 funciones. Ya están la tarea de callback por
  paso, configuración/reset, selección de especie ambiental en cada carga,
  estado de espera del cry con los rangos RNG del C, compuerta de controls/Quest
  Log, surfability del tile de destino y persistencia del puzzle de hielo. Los
  helpers para cracked floor RSE están traducidos; `DummyPerStepCallback` es un
  no-op del C y `AshGrassPerStepCallback` depende de ceniza/metatiles RSE que
  FireRed no usa, así que no añadí sustitutos vacíos.
- Web adapta la tarea prioridad 80 como callback por frame. El audio actual no
  acepta pan, volumen, prioridad ambient ni modos STOP/KEEP de música; esos
  parámetros quedan sin equivalencia. Pasaron `check:port`, `check:honesty`,
  inventory, pending y `git diff --check`; no se verificaron RNG/audio en juego.

## `diploma.c`: estados y helpers de la pantalla de diploma (2026-09-26)

- Extraje la secuencia como `DiplomaScreen` y nombré sus diez rutinas con los
  nombres C. La pantalla conserva init por estados, fanfare/input/fade, BG,
  tilemap, texto y retorno del script; gráficos ya vienen descomprimidos por el
  exportador. El retorno de campo sigue siendo adaptación web. Pasaron
  `check:port`, `check:honesty`, inventory, pending y `git diff --check`; no se
  ejecutó en navegador ni se comparó el render.

## Field move show-mon source parity (2026-09-25)

- Compared `Task_FieldEffectShowMon_Init` in `../pokefirered/src/fldeff_rocksmash.c` with `FieldMoveEffects.createShowMon` in `src/fr/field/fieldMoves.ts`. The C has a `MAP_TYPE_UNDERWATER` branch that starts `FLDEFF_FIELD_MOVE_SHOW_MON_INIT` immediately, skipping the player summon animation; TS previously always ran that animation. Added the same branch using generated constants. FireRed currently marks underwater maps unused, so this is source parity rather than a presently reachable story path. `npm run check:port` passes; no runtime test was performed.

## `coins.c`: shared coin balance operations (2026-09-25)

- Added `GetCoins` and `SetCoins` to `pokemon/items.ts`; the browser save stores the decrypted C `u16` balance directly, so both APIs narrow to 16 bits without reproducing SaveBlock encryption. Reworked `addCoins`/`removeCoins` to use those shared operations and the generated `MAX_COINS` constant. Routed the slot machine's read, `checkcoins`, the script coin box, and Coin Case display through `GetCoins`. `tools/checks/coins.ts` executes u16 narrowing, cap, success, and insufficient-funds cases. Browser coin-window rendering remains Canvas-adapted.
- Follow-up source pass: implemented `PrintCoinsString`, `ShowCoinsWindow` and `HideCoinsWindow` in `hw/menuHelpers.ts`, including the original 8×3 window geometry, frame, heading and right-aligned four-digit amount. Also translated the unused parameterized display helper. Source/types only in this pass; no browser or headless test was run.

## `field_weather.c`: rain sound state (2026-09-25)

- Ported `SetRainStrengthFromSoundEffect` and `SetWeatherScreenFadeOut` into the active `field/weather.ts`. Rain, downpour and thunderstorm IDs now set the C `rainStrength` values 0, 1 and 2 and play only when the palette state is not screen-fading-out; unknown IDs leave state untouched. `SetWeatherScreenFadeOut` sets the generated state constant. `check:weather` now executes these mappings and guards. The browser audio backend's SE-player routing remains adapted; `PlayRainStoppingSoundEffect` still needs the C `IsSpecialSEPlaying` channel behavior and correct stop sounds.

## `trainer_see.c`: CheckTrainer (2026-09-25)

- Ported the C `CheckTrainer` decision sequence into `TrainerSee.CheckTrainer` and connected the normal-trainer scan to it: reject missing/already-defeated scripts, require a visible unobstructed approach, reject double battles without two usable non-egg Pokémon, configure the trainer battle, and retain `approachDistance - 1` for the approach task. The behavior was already inline in the TS scan; extracting the source routine makes the C-to-TS correspondence explicit without enabling the still-unported buried/disguise/ash paths or Quest Log playback. `trainer_see.c` inventory is now 14/37. `npm run check:port`, `npm run check:honesty`, `npm run build`, `npm run inventory` and `npm run pending` pass. No browser/game test was run.

## `field_control_avatar.c`: player position helpers (2026-09-25)

- Compared `GetPlayerPosition` and `GetInFrontOfPlayerPosition` with the two helpers in `fieldControl.ts`. Their coordinate/elevation logic already matched `PlayerGetDestCoords`, `PlayerGetElevation`, `GetXYCoordsOneStepInFrontOfPlayer` and `MapGridGetElevationAt`; renamed the TS methods to the C names and documented their source so call sites remain traceable. No gameplay behavior changed. Inventory: `field_control_avatar.c` 19/37. `npm run check:port`, `npm run check:honesty`, `npm run build`, `npm run inventory` and `npm run pending` pass. No browser/game test was run.
- Follow-up source comparison: `GetPlayerCurMetatileBehavior` also matches `PlayerGetDestCoords` plus `MapGridGetMetatileBehaviorAt`; aligned the TS method name and kept its existing use in `FieldGetPlayerInput`. The input/interaction sequence was compared against `ProcessPlayerFieldInput`; its step counters for Wonder News, massage, Resort Gorgeous and Birth Island are outside the early-story scope. Inventory: `field_control_avatar.c` 20/37. Static checks/build passed; no browser/game test was run.

## `event_object_movement.c`: object lookup by position (2026-09-25)

- Ported `GetObjectEventIdByPosition` and `ObjectEventDoesElevationMatch` into `ObjectEvents`, iterating the fixed 16-slot object-event table and preserving the C wildcard rule when either elevation is zero. `objectAtXYZ` now resolves through that source-equivalent lookup, so field interactions, counters and surf checks share it. Inventory: `event_object_movement.c` 45/752. `npm run check:port`, `npm run check:honesty`, `npm run build`, `npm run inventory` and `npm run pending` pass. No browser/game test was run.

## Follow-up source review: capture ball and held movement (2026-09-25)

- Rechecked `SpriteCB_ThrowBall_DoClick` / `SpriteCB_ThrowBall_FinishClick` in `battle_anim_special.c` against `battle/anims/special.ts`: both keep the ball visible through the caught-message interval and hide it only after the 16-step white blend. The instruction to fix a disappearing ball conflicts with this source comparison and the earlier browser note above; no code change is justified.
- C `ObjectEventCheckHeldMovementStatus` / `ObjectEventClearHeldMovementIfFinished` return `0` while active and unfinished, `1` when active and finished, and `16` when inactive. Caller review found direct truth checks across field moves, surf, doors, and trainer approach, so mapping inactive `16` to `false` changes their C branch behavior. Ported both APIs with the original numeric statuses, routed TS callers through `ObjectEventClearHeldMovementIfFinished`, and kept `isHeldMovementFinished` as a boolean view of the C status. The Quest Log playback override in `ObjectEventSetHeldMovement` remains out of scope. Inventory: `event_object_movement.c` 47/752. `npm run check:port`, `npm run check:honesty`, `npm run build`, `npm run inventory` and `npm run pending` pass. No browser/game test was run.
- Also compared the object lookup and turn wrappers used by `turnobject`: TS `byLocalIdAndMap` and `turn` already preserve the map-ID special case and direction/face-animation behavior. Source review only; no gameplay execution.

## `event_object_lock.c`: lock / lockall wait routines (2026-09-25)

- Ported and connected `walkrun_is_standing_still`, `IsFreezePlayerFinished`,
  `FreezeObjects_WaitForPlayer` and `FreezeObjects_WaitForPlayerAndSelected`
  in `script/eventObjectLock.ts`. `ScrCmd_lockall` and `ScrCmd_lock` now call
  these routines instead of keeping equivalent native-script wait logic inline
  in `script/commands.ts`. The selected-object path waits for the player's tile
  transition and the NPC's active single movement before resuming; it then
  restores the player's enforced facing and stops the avatar as the C helpers
  do. This affects common scripts in Oak's Lab and Viridian City.
- Source comparison covered the full `event_object_lock.c`,
  `include/event_object_lock.h`, the `lock`/`lockall`/`release`/`releaseall`
  callers in `scrcmd.c`, and relevant map scripts. Other routines in
  `event_object_lock.c` remain pending or are represented through separate
  existing paths; inventory now reports 8/11 names, which does not establish
  full parity. Static checks: `npm run check:port`, `npm run check:honesty`,
  `npm run build`, `npm run inventory` and `npm run pending` passed. No game or
  browser test was run.

## `field_poison.c`: field poison damage step (2026-09-25)

- Extracted `DoPoisonFieldEffect` into `field/poison.ts` and connected
  `FieldEffects.updatePoisonStepCounter` to it. It checks C's
  `MON_DATA_SANITY_HAS_SPECIES` and `STATUS1_PSN_ANY`, applies one HP loss,
  starts the existing `FldEffPoison_Start` adaptation when at least one
  Pokémon is poisoned, and returns the generated `FLDPSN_NONE` / `PSN` / `FNT`
  value. `fieldControl.ts` continues to start `EventScript_FieldPoison` only
  for the faint result, matching `UpdatePoisonStepCounter` in
  `field_control_avatar.c`; the existing `TryFieldPoisonWhiteOut` task clears
  poison and determines party wipeout.
- Compared `field_poison.c`, `field_poison.h`, `UpdatePoisonStepCounter`,
  `EventScript_FieldPoison`, and the active `fieldEffects.ts` / `fieldControl.ts`
  callers. The poison visual still uses the existing Canvas field effect and
  was not runtime-checked. Static checks and regenerated inventory/pending are
  recorded after this block; no game or browser test was run.

## `field_door.c`: consume exported door definitions (2026-09-25)

- Replaced the manually duplicated door table and four animation sequences in
  `field/doors.ts` with `sDoorGraphics` and `sDoorAnimFrames_*` from the
  exported `field_door.c` cdata. The field preload now loads `field_door`;
  door metatile IDs, sound/size, palette references, frame byte offsets and
  durations therefore come from the decomp export. `doorImageName` maps the
  exported tile symbols to keys from the existing `gfx/doors.json` export.
- Compared the complete `field_door.c`, its header and cdata with the active
  door script commands, field transition callers and Pallet Town scripts. This
  also corrected the unknown-door sound fallback to the C behavior
  (`GetDoorSoundType` returns -1, and `GetDoorSoundEffect` selects the sliding
  sound for every non-normal value). Door frames still render through Canvas
  rather than VRAM tile copies; no visual/runtime comparison was run.
- Static checks: `npm run check:port`, `npm run check:honesty`, `npm run build`,
  `npm run inventory` and `npm run pending` passed. No game or browser test was
  run.

## `overworld.c`: camera-transition map-name popup (2026-09-26)

- Al entrar en otro mapa por una conexión de cámara, `LoadMapFromCameraTransition`
  muestra el popup si cambia `regionMapSectionId`, sin comprobar
  `showMapName`. La condición extra del port se retiró para seguir el C; la
  ruta de cámara a través de límites del mapa sigue usando su render Canvas.
- Comparé el cuerpo completo de `LoadMapFromCameraTransition`, su declaración en
  `overworld.h`, el llamador `CameraMove` de `fieldmap.c`, el método activo
  `Overworld.loadMapFromCameraTransition` y los datos de mapas tempranos. No se
  ejecutó el juego ni el navegador.

## `field_control_avatar.c`: escaleras direccionales al ir en bicicleta (2026-09-26)

- `TryArrowWarp` ahora cambia al jugador a pie y pasa una espera de 12 frames a
  `DoStairWarp` cuando se activa una escalera direccional desde la Mach Bike o
  Acro Bike. Al caminar, mantiene demora 0. Esto sigue el orden del C:
  `SetPlayerAvatarTransitionFlags(PLAYER_AVATAR_FLAG_ON_FOOT)` antes de guardar
  el estado inicial y comenzar la transición.
- Comparé `TryArrowWarp`, `IsDirectionalStairWarpMetatileBehavior`, sus
  constantes del avatar, el llamador de la entrada de campo y las rutas activas
  `FieldControl.tryArrowWarp` / `Overworld.doStairWarp`. Sin prueba de juego ni
  navegador; el caso de bicicleta es posterior a las primeras horas.

## `battle_setup.c` / `field_control_avatar.c`: reinicio del enfriamiento de encuentros (2026-09-26)

- Conecté `RestartWildEncounterImmunitySteps` al final de la transición de
  batalla en `Game.startBattle`, antes de iniciar el motor. El C hace ese
  reinicio en `Task_BattleStart` tras `IsBattleTransitionDone`; antes, el port
  solo reiniciaba tras generar un encuentro salvaje y conservaba pasos y
  bonificación de frecuencia después de combates contra entrenadores.
- Comparé `Task_BattleStart`, la API `RestartWildEncounterImmunitySteps` y su
  implementación (`ResetEncounterRateModifiers`) con el callback de
  `BattleTransitionScene` y `WildEncounter.resetEncounterRateModifiers`. Esto
  afecta los encuentros posteriores a los entrenadores de Ruta 3. Verificación
  estática solamente; no ejecuté juego ni navegador.

## `event_object_lock.c`: limpieza compartida de release (2026-09-25)

- Porté `ClearPlayerHeldMovementAndUnfreezeObjectEvents` y conecté la función
  a `releaseall` y `release` en `script/commands.ts`. Limpia el movimiento
  retenido del jugador si ya terminó, detiene/descongela los movimientos de
  guion activos y luego descongela los objetos, como el C. `release` conserva
  antes su limpieza adicional del objeto seleccionado.
- Inventario actual: `event_object_lock.c` 9/11 nombres; no implica paridad del
  archivo. `npm run check:port`, `npm run check:honesty`, `npm run build`,
  `npm run inventory` y `npm run pending` pasaron. El build emitió advertencias
  existentes por imports dinámicos y tamaño de chunk. Sin prueba de juego ni
  navegador.

## `seagallop.c`: travesía del ferry (2026-09-26)

- Alineé la máquina de estados con callbacks nombrados como en C, incluida la
  secuencia de setup, VBlank, tareas 0–3, dirección, creación de estela,
  configuración/reset de GPU y carga/liberación de recursos. La transición
  conserva los 140 frames de desplazamiento y espera el fade de música/paleta
  antes del warp. Inventario: 22/22; esto mide nombres y cuerpos, no paridad de
  fotogramas.
- La pantalla continúa usando `HwScene`, PPU simulada y WebAudio. No se modelan
  explícitamente `HelpSystem_Disable/Enable` (no hay sistema de ayuda web en
  esta ruta), `PlayRainStoppingSoundEffect` ni la pantalla/efectos de warp GBA.
  Pasaron `check:port`, `check:honesty`, inventory, pending y `git diff --check`;
  sin navegador ni comparación visual.

## `battle_bg.c`: acceso a gráficos de terreno (2026-09-26)

- Añadí `GetBattleTerrainGfxPtrs`, que devuelve las referencias de tiles,
  tilemap y paleta del terreno desde la tabla exportada, y aplica el fallback a
  plain que indica el C. El resto del render/carga de fondos ya tenía
  implementación en `battle/bg.ts`.
- En la primera revisión también se dejaron fuera `CreateUnknownDebugSprite` y
  `CB2_unused` por ser utilidades marcadas unused. En la revisión posterior del
  2026-09-26 quedaron portadas junto con los callbacks del sprite en
  `battle/main_init.ts`; el inventario subió de 13/17 a 15/17. Solo quedan las
  dos rutinas VS link, fuera del alcance single-player. Pasaron `check:port`,
  `check:honesty`, inventory, pending y `git diff --check`; sin navegador ni
  prueba visual.

## `sound.c`: máquina de estados de música de mapa (2026-09-26)

- Porté `InitMapMusic`, `MapMusicMain`, `ResetMapMusic`, lectura de canción
  actual, stop/cambio de canción, fades de transición y los estados 1/5/6/7 al
  tick por frame de `Sound`. El cierre de fades ahora se resuelve por el estado
  de reproducción del backend, con contador de frames como fallback cuando no
  hay backend.
- No añadí la atenuación temporal exacta de `m4aMPlayFadeOutTemporarily` porque
  el backend web no expone el flag/automática de recuperación del mezclador;
  tampoco se portaron las tareas del Quest Log/enlace/ducking de cries de este
  bloque. El inventario subió de 23/48 a 33/48. Pasaron `check:port`,
  `check:honesty`, inventory, pending y `git diff --check`; sin navegador ni
  verificación auditiva.

## `field_screen_effect.c`: buffers del oscurecimiento por flash (2026-09-26)

- Expuse la rasterización de límites de ventana con el algoritmo C y añadí
  `WriteFlashScanlineEffectBuffer`, que rellena ambos buffers scanline desde el
  radio de nivel C. `Overworld.setDefaultFlashLevel` ahora instala esos
  parámetros en mapas que requieren Flash. Corregí también el special
  `Script_FadeOutMapMusic`: inicia el estado de fade de música de mapa y espera
  su fin antes de reanudar el script, en vez de consultar un fade genérico que
  no estaba marcado como pendiente.
- El oscurecimiento visible sigue teniendo además el render Canvas de
  `FieldEffects.renderFlash`; no hice comparación de fotogramas. Después añadí
  los callbacks con datos de tarea para el midpoint flash (update/wait) y el
  wipe barn-door, con guardado/restauración de WIN0/WIN1 y blend regs. Conecté
  el wipe de apertura en el flujo web de salida por puerta, en paralelo con el
  fade que ya ejecutaba `warpFadeInScreen(3)`. Porté también la impresión de
  recuperación whiteout y sus estados: selección casa/Centro mediante la
  última heal location, giro al norte, cierre de ventana, fade y continuación
  del script correspondiente. El inventario reconoce 19/19; el mensaje usa
  una ventana Canvas y no se compararon fotogramas. Pasaron `check:port`,
  `check:honesty`, inventory, pending y `git diff --check`; sin navegador.
- También avancé `sound.c` a 40/48: trasladé la permanencia/fin de la tarea de
  fanfarria, los predicados de BGM en reproducción y los cambios de volumen
  documentados en el C. Ese archivo salió de la lista de pendientes al superar
  el 80 % nominal; la auditoría aún deja fuera los canales/mixer y las tareas
  de cries que requieren soporte de audio adicional.
- En una segunda pasada del mismo bloque añadí la selección de fanfarria por
  índice y su parada por índice, reutilizando los datos/temporizadores ya
  exportados. Separé `Task_Fanfare` y `CreateFanfareTask` del tick, de modo que
  la tarea permanece activa hasta el tick que la destruye, como en C. Añadí
  `IsBGMPlaying` y los dos controles de volumen disponibles en el backend. El
  inventario actualizado marca 40/48 y ya no lista `sound.c` como pendiente.
  Las tareas del Quest Log, el ducking de cries y el fade temporal del mixer
  siguen fuera.

## `battle_util2.c`: ciclo de vida de recursos de batalla (2026-09-25)

- `AllocateBattleResources` ahora limpia los structs, pilas, flags, datos de IA,
  historial, stats previos al nivel, estados de Poké Dude y buffers BG que el C
  reserva con `AllocZeroed`; `runBattle()` lo llama antes de cada combate.
- `FreeBattleResources` limpia ese almacenamiento estático en el punto de
  liberación del C al cerrar un combate no-link. En JS no existe el heap GBA que
  `Free` libera. Los hooks de init/free propios de Trainer Tower siguen sin
  portarse y están anotados en los huecos conocidos.
- `AdjustFriendshipOnBattleFaint` ya está portado en `pokemon/mon_extra.ts`;
  `battle_util2.c` sigue parcial por sus ramas de Trainer Tower no conectadas.
  No agregué wrappers vacíos ni stubs para fingir que el allocator de C existe
  como heap separado en el navegador.
- `npm run check:port` pasa. No ejecuté checks headless ni el navegador; no hay
  verificación de comportamiento en runtime.

## `fldeff_softboiled.c`: validación de PS máximos para usar el movimiento (2026-09-25)

- Añadí `SetUpFieldMove_SoftBoiled` en `menus/fieldMoveMenu.ts` y conecté la
  selección de Softboiled/Milk Drink a esa función, conservando la condición C
  `curHp > maxHp / 5`.
- Las tareas restantes ya estaban traducidas en `partyMenu.ts`. El callback de
  mostrar HP restaurados mantiene el nombre `Task_SoftboiledDisplayHPRestored`
  porque el C define callbacks estáticos homónimos en `party_menu.c` y
  `fldeff_softboiled.c`, con continuaciones distintas, y ambos módulos TS están
  combinados. El inventario ahora deja el archivo en 7/8 nombres; la diferencia
  es ese callback con nombre adaptado, no un cuerpo vacío.
- `npm run check:port`, `npm run inventory`, `npm run pending` y
  `npm run check:honesty` pasan. Sin check headless ni prueba de navegador.

## `heal_location.c`: acceso de ID a punto de curación (2026-09-25)

- Añadí `GetHealLocation` en `field/overworld.ts`, leyendo la tabla exportada,
  respetando IDs 1-based y retornando null para NONE/fuera de rango; el método
  de overworld existente delega ahora en esa función.
- `SetWhiteoutRespawnWarpAndHealerNpc` sigue implementado como
  `Overworld.whiteOutRespawn()` y adapta su salida a la ruta de reaparición del
  navegador. El caso de escena de Trainer Tower del C no está conectado a esta
  ruta de FireRed ordinaria. Verificación estática: `check:port`, `inventory`,
  `pending` y `check:honesty` pasan. Sin check headless ni navegador.

## `window_8bpp.c`: conteo de ventanas 8bpp activas (2026-09-25)

- Añadí el helper `GetNumActiveWindowsOnBg8Bit` y lo conecté a `AddWindow8Bit`;
  cuenta la tabla compartida de ventanas por BG. Las otras APIs 8bpp ya estaban
  en `hw/window.ts`. `nullsub_9` del C es un callback vacío usado como sentinel;
  la adaptación ya limpia el buffer BG con `UnsetBgTilemapBuffer`.
- Las cajas del PC aún no llaman a la interfaz 8bpp porque siguen adaptadas.
  No ejecuté comparación de píxeles ni navegador.

## `fldeff_teleport.c`: condición de mapa para Teleport (2026-09-25)

- Añadí `SetUpFieldMove_Teleport` como la comprobación de tipos de mapa del C y
  la conecté al dispatcher de movimientos de campo. Los callbacks de transición
  del C permanecen integrados en los handlers del port: el diálogo confirma el
  destino, se resetea el estado del avatar, se crea el efecto y la rutina de
  campo sigue su secuencia de animación/warp existente.
- `npm run check:port` pasa; sin check headless ni navegador.

## `fldeff_dig.c`: condición de uso de Dig/Escape Rope (2026-09-25)

- Añadí y conecté `SetUpFieldMove_Dig`, equivalente a la consulta C
  `CanUseEscapeRopeOnCurrMap` sobre `gMapHeader.allowEscaping === TRUE`. El
  efecto ya estaba conectado y muestra el Pokémon, cambia el avatar a pie y
  arranca la tarea de salida existente.
- `npm run check:port` pasa; sin check headless ni navegador.

## `fldeff_strength.c`: requisitos de uso de Strength (2026-09-25)

- Extraje `SetUpFieldMove_Strength` de `CursorCB_FieldMove`: permite continuar
  solo si el avatar no está surfeando y el objeto inmediatamente delante tiene
  el gráfico de roca empujable. El dispatcher conserva la asignación de la
  variable de resultado y el inicio del script de campo.
- `npm run check:port` pasa; sin check headless ni navegador.

## `hof_pc.c`: visor de equipos del Hall of Fame desde el PC (2026-09-25)

- Revisé las cinco funciones del C contra `BeginHallOfFamePC`, `CB2_InitHofPC`,
  las tareas `Task_HofPC_*` y el cierre alojados en `hallOfFame.ts`. El port ya
  recorre los equipos guardados, selecciona Pokémon y vuelve al menú PC; su
  persistencia adapta `SAVE_HALL_OF_FAME` al arreglo del guardado web.
- Registré `hof_pc.c` como cubierto por esa pantalla conectada. Es revisión de
  código, no prueba runtime; no ejecuté navegador ni check headless.

## `scanline_effect.c`: primer registro y generación de ondas (2026-09-25)

- Porté `CopyValue16Bit`, `CopyValue32Bit` y `GenerateWave` en `hw/scanline.ts`.
  `ScanlineEffect_InitHBlankDmaTransfer` aplica ahora el valor de la primera
  scanline antes de intercambiar buffers; el callback del PPU representa el
  valor de cada línea usando la tabla doble-buffered. `GenerateWave` reproduce
  el avance de `theta` como `u8`, la amplitud y la división del C.
- El inventario marca `scanline_effect.c` 9/9 por nombre. `check:port` y
  `check:honesty` pasan. No ejecuté check headless ni comparé frames/runtime.

## `party_menu_specials.c`: desplazamiento de movimientos y PP Ups (2026-09-25)

- `MoveDeleterForgetMove` ahora sigue el orden del C: pone `MOVE_NONE` en el
  slot elegido, quita sus PP Ups y desplaza los slots siguientes con
  `ShiftMoveSlot`, preservando los PP actuales y moviendo los bits de PP Ups
  junto a cada movimiento. Antes usaba `splice`, que ocultaba esa regla C en una
  transformación de arreglos.
- La selección de Pokémon y el callback de la pantalla ya están conectados en
  `game.ts`/`partyMenu.ts`; no agregué otro task artificial para reemplazar el
  flujo de callback del port. `check:port` pasa. Sin check headless ni navegador.

## `mail_data.c`: SaveBlock mail y flujo de buzón/daycare (2026-09-26)

- Reemplacé el mail inline/array `pcMail` por los 16 slots de `SaveBlock1` con
  palabras, nombre, trainer ID, especie e item; `setSave` migra los saves web
  previos. `ClearMailData`, `ClearMailStruct`, `MonHasMail`, `GiveMailToMon`,
  `GiveMailToMon2`, `TakeMailFromMon`, `ClearMailItemId` y
  `TakeMailFromMon2` están en `pokemon/mail.ts`. La party, buzón PC y daycare
  ya leen o mutan esos slots; el buzón compacta los slots 6–15 como C.
- `SpeciesToMailSpecies`, `MailSpeciesToSpecies` e `ItemIsMail` usan las reglas
  del decomp. `DummyMailFunc` permanece sin declaración porque su cuerpo C es
  vacío. Inventario: 11/12 funciones por nombre. `check:port`, `check:honesty`,
  `inventory`, `pending` y `git diff --check` pasaron. No ejecuté pruebas
  headless ni navegador; Easy Chat y el flujo completo de mail de enlace siguen
  fuera de este bloque.

## `script_pokemon_util.c`: corrección del comando de slot y retiro de no-ops (2026-09-26)

- `ScriptSetMonMoveSlot` ya estaba reflejado indirectamente por `setmonmove`,
  pero el comando no reproducía el clamp del índice del helper C ni la llamada
  con el orden de argumentos de `script_pokemon_util.c`. Añadí el helper con el
  nombre del C y conecté el comando usando el orden de operandos de `scrcmd.c`.
- Eliminé los tres specials vacíos de selección de equipos (`ChooseHalfPartyForBattle`,
  `ChooseBattleTowerPlayerParty` y `ReducePlayerPartyToThree`). La selección
  para Cable Club y Battle Tower sigue sin implementación, acorde a los límites
  de alcance registrados arriba; no cuentan como implementaciones falsas.
- El cuerpo C de las otras funciones ya conectadas no se reescribió. Sin prueba
  en navegador ni ejercicio runtime; verificación estática con `check:port`.

## `field_poison.c`: helpers de validez, desmayo y desmayo total (2026-09-26)

- Separé `IsMonValidSpecies`, `AllMonsFainted`, `MonFaintedFromPoison` y
  `FaintFromFieldPoison` en `field/poison.ts`, conservando sus nombres C y la
  lectura de los seis slots de party. `TryFieldPoisonWhiteOut` usa esos helpers;
  la baja de amistad precede al borrado de status y al mensaje, como en C.
- `DoPoisonFieldEffect` ya estaba conectado desde el contador de pasos y la
  animación ya estaba conectada a `FieldEffects`. Revisión contra
  `../pokefirered/src/field_poison.c`; `check:port` pasa. No ejecuté runtime,
  headless ni navegador.

## `menu_helpers.c`: reinicio de callbacks y memoria de vídeo (2026-09-26)

- Añadí `SetVBlankHBlankCallbacksToNull` y `ResetVramOamAndBgCntRegs` a
  `hw/menuHelpers.ts`. El reinicio borra VRAM, OAM y paletas con los tamaños
  GBA y restablece registros/coordenadas BG usando las funciones de hardware
  existentes.
- Las comprobaciones de colas y enlace (`IsActiveOverworldLinkBusy`,
  `MenuHelpers_ShouldWaitForLinkRecv`) quedan pendientes: el subsistema link
  no está implementado y sus APIs no se deben simular como port real.
  `IsHoldingItemAllowed` conserva la restricción de Enigma Berry en Trade
  Center; `IsWritingMailAllowed` aplica la regla cuando el estado de enlace
  indique actividad. `check:port`, `check:honesty`, `inventory`, `pending` y
  `git diff --check` pasaron; sin navegador ni runtime.

## `pokedex.c`: conteos de dex y completitud (2026-09-26)

- Añadí `GetPokedexCategoryName`, `GetNationalPokedexCount`,
  `GetKantoPokedexCount` y `HasAllHoennMons` a `pokemon/pokemon.ts`. La categoría
  usa el dato exportado; los conteos respetan las banderas GET del C y la
  paridad caught/seen de `DexScreen_GetSetPokedexFlag`. El orden Hoenn se
  resuelve con los símbolos `HOENN_DEX_*` y `SPECIES_*` exportados, sin tabla
  escrita a mano.
- Conecté los conteos al special `GetPokedexCount`, al panel de estadísticas
  del guardado y al conteo de la tarjeta. `HasAllKantoMons` y `HasAllMons`
  quedan como helpers con nombre C y comparten la regla de lectura C.
- Corregí `portInventory.py` para ignorar comentarios C y aceptar funciones
  cuyo tipo de retorno es `const`; así el cuerpo comentado de
  `GetHoennPokedexCount` deja de figurar como deuda y se cuenta
  `GetPokedexCategoryName`. El inventario cambió de 96 a 97 pendientes y su
  nueva primera fila es `prof_pc.c`. `check:port` y `check:honesty` pasaron;
  regeneré `PORT-INVENTORY.md` y `PENDING.md`. No ejecuté headless ni navegador.
  `GetHoennPokedexCount` sigue comentado en C y no se declara como API.

## `prof_pc.c`: conteo y rating de Pokédex (2026-09-26)

- `GetPokedexCount` ya estaba conectado al special y ahora usa los conteos C de
  `pokedex.c`. Añadí `GetProfOaksRatingMessageByCount` con los umbrales y los
  dos casos de completitud del C; el caso de Mew consulta la bandera caught
  mediante su número nacional y el mensaje sigue viniendo de los textos
  exportados. `Game.profOakRating` consume el helper y conserva su salida de
  mensaje y `VAR_RESULT`.
- `prof_pc.c` figura 3/3 en el inventario actualizado. Pasaron
  `check:port`, `check:honesty`, inventory, pending y `git diff --check`; no
  ejecuté headless ni navegador.

## `heal_location.c`: búsqueda de punto de curación y respawn (2026-09-26)

- Añadí los helpers C de búsqueda por map group/map number, búsqueda del registro
  y selección del NPC que atiende tras un whiteout. Renombré el método de
  respawn al símbolo `SetWhiteoutRespawnWarpAndHealerNpc` y conecté el caller de
  `Game.whiteOut` a él. El caso de ubicación inválida conserva el warp previo,
  como la salida temprana `BUGFIX`; ya no inventa Pallet Town como respaldo.
- Añadí la rama de Trainer Tower: mapa y coordenadas vienen de constantes del
  decomp y el scene var se limpia según `spokeToOwner` cuando existe ese dato
  en el save web. El guardado web aún no modela la estructura completa de
  Trainer Tower, por lo que este caso depende de su estado opcional.
- `heal_location.c` figura 5/5 en el inventario actualizado. Pasaron
  `check:port`, `check:honesty`, inventory, pending y `git diff --check`; no
  ejecuté headless ni navegador.

## `berry_powder.c`: valor, operaciones y panel del vendedor (2026-09-26)

- Porté con nombres C la lectura/escritura lógica de Berry Powder, la adaptación
  de cambio de clave para el save web en texto plano, la comprobación y resta
  por costo, y el límite de 99,999 de `GiveBerryPowder` con aritmética `u32`.
- El panel Canvas conectado usa ahora los helpers de impresión/dibujo con los
  mismos parámetros y mensajes del C; el marco/paleta GBA se adapta al marco
  de ventana del campo y al ajuste del jugador. Los specials llaman los
  helpers nombrados.
- `berry_powder.c` figura 14/14 en el inventario actualizado. Pasaron
  `check:port`, `check:honesty`, inventory, pending y `git diff --check`; sin
  headless ni navegador.

## `roamer.c`: datos y movimiento del Pokémon errante (2026-09-26)

- Porté las 13 funciones activas del archivo con sus nombres C: inicialización,
  historial de mapas, movimiento entre rutas, selección del encuentro,
  restauración de la instancia y actualización del estado tras combate. La
  instancia conserva además cool, beauty, cute, smart y tough entre encuentros.
- El conteo de inventario marca `roamer.c` en 13/13. `check:port`,
  `check:honesty`, `npm run inventory`, `npm run pending` y `git diff --check`
  pasaron. Sin navegador ni checks headless.

## `fldeff_sweetscent.c`: efecto de campo del movimiento Dulce Aroma (2026-09-26)

- Conecté el preparador del movimiento al callback tras cerrar el menú y
  separé el callback, el inicio del efecto, la espera, el intento de encuentro
  y la recuperación del caso fallido con nombres de función C. El flujo espera
  a que termine el fundido de 8 niveles, cuenta 64 frames y restaura el estado
  del clima antes de ejecutar el script de fallo. También conservé la entrada
  C marcada como no usada, con su comportamiento de seleccionar el primer slot.
- El Canvas aplica el tinte rojo/rosado global en vez de copiar/restaurar los
  buffers de paleta GBA; es una adaptación visual pendiente de comparación. El
  inventario marca el archivo 7/7. `check:port`, `check:honesty`, inventario,
  pendientes y `git diff --check` pasaron. Sin navegador ni checks headless.

## `save_location.c`: clasificación de mapas y flags de guardado (2026-09-26)

- Porté las 10 funciones del inventario, incluidos los predicados de listas,
  los tres flags de warp y los flags de enlace de Pokédex/postgame. La lista de
  Centros Pokémon y salas de enlace usa los símbolos de mapa del C; las listas
  de lobby y mapa desconocido permanecen vacías como en la fuente.
- Conecté el recálculo de flags al cargar mapa por warp y transición de cámara,
  el special `SetUnlockedPokedexFlags` y el special de postgame existente.
  `check:port`, `check:honesty`, inventario, pendientes y `git diff --check`
  pasaron. Sin navegador ni checks headless.

## `script_pokemon_util.c`: party, regalos y equipos de batalla (2026-09-26)

- Completé las 13/13 funciones contabilizadas: los datos de huevo ahora pasan
  por `CreateEgg`; el chequeo Enigma y la creación de salvaje guionizado usan
  los helpers de party; y la selección múltiple cable/Tower conecta sus
  callbacks, validación (tres elegidos, especies prohibidas y objetos
  repetidos) y reducción del equipo en el orden elegido.
- `check:port`, `check:honesty`, inventario, pendientes y `git diff --check`
  pasaron. Sin checks headless ni navegador; no se comprobó el flujo de selección
  múltiple visualmente.

## `fldeff_rocksmash.c`: efecto de campo para Golpe Roca (2026-09-26)

- Porté las 10 funciones contabilizadas: el lookup frontal compara graphics ID
  y elevación, prepara `VAR_LAST_TALKED`, y el callback del menú inicia el script
  de Golpe Roca. El flujo de animación del jugador quedó dividido en sus cuatro
  estados C; el efecto reproduce SE, elimina el ID activo, reanuda el script y
  suma la estadística al comenzar el movimiento.
- `fldeff_rocksmash.c` figura 10/10. Pasaron `check:port`, `check:honesty`,
  inventory, pending y `git diff --check`. Sin navegador ni checks headless.

## `field_message_box.c`: ciclo y modos del cuadro de diálogo (2026-09-26)

- Completé las 14/14 funciones detectadas: inicialización, dibujo por estados,
  Show normal/auto-scroll, impresión desde `gStringVar4`, ocultar, consultas de
  tipo y reemplazo por marco estándar. Las rutinas privadas conservan los
  efectos funcionales en el adaptador Canvas.
- Límite: el marco GBA se representa con ventanas Canvas; no cargué los tiles del
  Quest Log, cuyo modo de playback no está conectado al `Game` web. Pasaron
  `check:port`, `check:honesty`, inventory, pending y `git diff --check`. Sin
  checks headless ni navegador.

## `pokemon_size_record.c`: récords de tamaño y cintas de regalo (2026-09-26)

- Porté las 13/13 funciones: hash de tamaño, tabla de intervalos, cálculo y
  formato imperial (el de `include/config.h`), comparación/actualización del
  récord y datos de Heracross/Magikarp. `newGame` inicializa ambos récords. La
  entrega de cintas persiste los 11 registros, aplica los siete tipos definidos
  a Pokémon elegibles y activa la flag si entregó al menos una.
- El C guarda once IDs de cinta pero su tabla de tipos solo tiene siete entradas;
  índices 7–10 leen fuera del array. El port preserva el registro de guardado,
  pero no inventa un tipo de cinta para esos índices. Pasaron `check:port`,
  `check:honesty`, inventory, pending y `git diff --check`; sin headless ni
  navegador.

## `new_game.c`: inicialización de partida nueva (2026-09-26)

- Las 11/11 funciones contabilizadas ya tienen homólogo: inicialización de ID
  entrenador en orden little-endian, opciones, flags del Pokédex, torre de
  batalla, partida nueva, reset parcial de menús/minijuegos y warp al cuarto.
  `newGame` ahora concentra la creación de SaveData y reinicia el mail, el PC,
  los datos de almacenamiento, el roamer, Fame Checker y récords de tamaño.
- Alcance limitado por sistemas aún no modelados: no se recrean los bloques de
  Easy Chat, Union Room, Mystery Gift, Berry Crush/Jumpluff completos, Trainer
  Fan Club, resultados de Trainer Tower, ni datos de enlace/Quest Log; tampoco
  hay modelo de flags National Dex y battle tower. No agregué stubs para ellos.
  `PORT-INVENTORY.md` cuenta nombres homólogos, no demuestra paridad integral.
- `check:port`, `check:honesty`, inventario, pendientes y `git diff --check`
  pasaron. No se ejecutaron checks headless ni pruebas de navegador, tal como
  pediste.

## `option_menu.c`: callbacks y ciclo de vida del menú de opciones (2026-09-26)

- Completé las 19/19 funciones contabilizadas. Añadí el punto de entrada desde
  el menú inicial, reset/install de callbacks VBlank/HBlank, creación de la
  tarea del menú y reset de sprites, fade, tareas y scanline; el ciclo existente
  ahora llama esas rutinas con los nombres del C.
- La entrada directa usa el callback `done` del adaptador web (no el callback
  global `gMain.savedCallback` del ejecutable GBA). Pasaron `check:port`,
  `check:honesty`, inventory, pending y `git diff --check`. Sin navegador ni
  checks headless.

## `text_printer.c`: estado global y copiado de glifos (2026-09-26)

- El inventario reconoce 15/15 funciones. Añadí la tabla global de fuentes,
  generación/guardado/restauración de colores, consulta del último color,
  `RenderFont`, copia de glifo a la ventana Canvas y la rutina parametrizada
  que escribe nibbles en el buffer 4bpp; `ClearTextSpan` se mantiene vacío
  porque su implementación C también lo está.
- Adaptación: las fuentes y superficies se representan con tipos/objetos web;
  no se emula el callback de copia DMA `CopyWindowToVram` dentro de estas APIs.
  El conteo de funciones homónimas no demuestra paridad de píxeles en GBA.
  Pasaron `check:port`, `check:honesty`, inventory, pending y `git diff --check`.
  No ejecuté checks headless ni pruebas en navegador.

## `decompress.c`: rutinas de gráficos comprimidos y sprites enlazados (2026-09-26)

- Las 18/18 funciones contabilizadas ya tienen contraparte. Añadí las llamadas
  WRAM/VRAM para bytes del pipeline, carga de sheets/paletas con buffer opcional,
  tamaño de header LZ, helpers de imágenes de Pokémon Unown/Deoxys/Spinda y el
  algoritmo de mosaico 8×8 (`StitchObjectsOn8x8Canvas`). La carga de sprites de
  créditos ya pasa por el módulo nuevo.
- La exportación de INCBIN elimina LZ77 previamente; no implementé un segundo
  decodificador del formato binario dentro del navegador. Pasaron `check:port`,
  `check:honesty`, inventory, pending y `git diff --check`; no corrí pruebas
  headless ni de navegador.

## `pokemon_storage_system.c`: acceso a las cajas y datos de Pokémon (2026-09-26)

- El inventario reconoce 21/21 funciones. Añadí lectura/escritura acotada por
  caja y slot, acceso al slot actual, nickname, backup/restore, creación/copia,
  conversión BoxMon→Mon con restauración de stats/HP, acceso mutable al slot,
  puntero persistente al nombre, wallpapers y búsqueda adelante/atrás con la
  regla de huevos del C. Los slots vacíos siguen representados como `null`
  hasta que una operación C necesita un BoxPokemon cero.
- `CreateBoxMonAt` usa los tipos OT y límites de IV de las constantes generadas;
  la representación web no almacena checksum/cifrado de BoxPokemon. Pasaron
  `check:port`, `check:honesty`, inventory, pending y `git diff --check`; sin
  pruebas headless ni de navegador.

## `main_menu.c`: estados, entrada y estadísticas de CONTINUE (2026-09-26)

- El inventario reconoce 29/29 funciones. Conecté `CB2_InitMainMenu` al arranque,
  añadí la segunda entrada C, separé las tareas de esperar fade/entrada, manejo
  de controles y retorno al título, desglosé nombre/tiempo/Pokédex/medallas en
  impresores propios y añadí el diálogo para un SaveData presente pero inválido.
- El chequeo de guardado del navegador solo distingue ausente/válido/JSON o
  versión inválidos; no modela los estados físicos de Flash `NO_FLASH` ni
  `SAVE_STATUS_INVALID`. Para un guardado inválido se muestra el mensaje de
  corrupción y se conserva la opción de continuación que define el C. Pasaron
  `check:port`, `check:honesty`, inventory, pending y `git diff --check`; no se
  ejecutaron checks headless ni pruebas en navegador.

## `list_menu.c`: utilidades de selección y menú de Mystery Gift (2026-09-26)

- Las 31/31 funciones aparecen en el inventario. Añadí el flujo de tres estados
  para abrir/procesar/cerrar la lista de Mystery Gift; cambios de paleta y
  coordenadas, simulación de un input sin dibujar, lectura del índice/plantilla
  y carga de paleta de icono. `ListMenuDummyTask` se conserva vacío porque el C
  también lo deja vacío.
- `ListMenuTestInput` devuelve el resultado y los dos cursores en un objeto TS;
  `ListMenuGetTemplateField` devuelve valores/callbacks JS, no direcciones C.
  Pasaron `check:port`, `check:honesty`, inventory, pending y `git diff --check`;
  sin checks headless ni navegador.

## `ss_anne.c`: salida del S.S. Anne (2026-09-26)

- El inventario reconoce 8/8 funciones. Extraje la espera de 50 frames, el
  avance del barco, humo cada 70 frames, estela animada y los callbacks de humo
  y estela como estados/tareas C con nombres equivalentes; el script se libera
  tras los 40 frames finales.
- Adaptación: sprites Canvas conservan imágenes RGBA por sprite, así que liberar
  tags GBA no tiene un recurso web equivalente. Pasaron `check:port`,
  `check:honesty`, inventory, pending y `git diff --check`; sin headless ni
  pruebas de navegador.

## `trainer_fan_club.c`: contador, pérdida y selección de fans (2026-09-26)

- El inventario reconoce 23/23 funciones. Descompuse el contador empaquetado
  en `VAR_FANCLUB_FAN_COUNTER`, el avance por interacciones, altas/bajas con
  las prioridades y tiradas RNG del C, primera obtención, pérdida por horas,
  game clear, miembro consultado y buffer de nombre. Los specials ahora llaman
  esos helpers y la actualización de link recibe el resultado de batalla.
- Los nombres de trainers de link no están guardados porque el port no implementa
  los registros/enlace; la rutina usa los fallbacks NPC del C. Pasaron
  `check:port`, `check:honesty`, inventory, pending y `git diff --check`; sin
  checks headless ni pruebas en navegador.

## `script_movement.c`: slots y tareas de movimiento de objetos (2026-09-26)

- El inventario reconoce 19/19 funciones. Reemplacé la lista compacta de
  entradas por los 16 slots indexados del C, con sentinel `0xFF`, ID del objeto,
  puntero/bytes de script y estado terminado. La máquina de tareas porta la
  asignación/reutilización de slots, bit de fin, ejecución por frame, freeze al
  terminar y unfreeze al cancelar.
- La API web conserva una representación de slot `{taskId, moveScriptId}` en
  vez de exponer un puntero C a `gTasks[].data`; scripts del ROM avanzan su
  puntero de byte tras cada movimiento aceptado. Pasaron `check:port`,
  `check:honesty`, inventory, pending y `git diff --check`; sin pruebas
  headless ni navegador.

## `tileset_anims.c`: callbacks de animación de tilesets (2026-09-26)

- Porté los callbacks primarios/secundarios y la cola de hasta 20 transferencias
  a `TilesetAnimator`, con contadores reiniciados por tileset y actualización
  frame a frame. La copia síncrona sustituye DMA/VBlank del navegador; no hice
  comparación de píxeles ni prueba de frames contra C.
- Corregí el arranque para no precargar el primer frame con `prime()`: el C
  arranca los contadores a cero y entra por `UpdateTilesetAnimations`.
  `check:port`, `check:honesty`, inventario, pendientes y `git diff --check`
  pasaron; sin navegador.

## `fldeff_cut.c`: comprobación y corte de hierba (2026-09-26)

- Ajusté el área 3×3 de `SetUpFieldMove_Cut` y `FldEff_CutGrass` para usar la
  casilla de destino frente al jugador, igual que `PlayerGetDestCoords` en C;
  antes se centraba en la casilla ocupada. Las conversiones de metatiles,
  elevación y efecto de sonido ya estaban representadas. Añadí callbacks C con
  nombres equivalentes para el uso en hierba/árbol, la reanudación del script y
  los ocho sprites de corte. La animación usa `Math.sin/cos` redondeados en vez
  de la tabla trigonométrica GBA; su temporización de vida sigue los 29 ticks C.
- El efecto web usa sprites Canvas y desbloquea al limpiar el grupo. El inventario
  reconoce ahora 13/13 funciones; esto no certifica paridad de píxeles. Pasaron
  `check:port`, `check:honesty`, inventory, pending y `git diff --check`; sin
  navegador.

## `map_name_popup.c`: ciclo del rótulo de mapa (2026-09-26)

- El inventario reconoce 7/7 funciones. Nombré el ciclo de tarea y helpers como
  en C; conserva entrada/salida en 12 frames, espera 121 frames, reaparición,
  descarte, altura del piso y techo. La copia de ventana Canvas es síncrona, por
  lo que no modela el busy flag DMA3 ni selección de paleta fadeada. Pasaron
  `check:port`, `check:honesty`, inventory, pending y `git diff --check`; sin
  navegador ni comparación visual.

## `event_data.c`: variables, flags y condiciones de sistemas opcionales (2026-09-26)

- El inventario reconoce 26/26 funciones. Añadí inicialización y reset de
  especiales, punteros web a variables/bytes de flags, reglas de elegibilidad
  del Quest Log, marcadores completos del National Dex (incluida migración de
  partidas web previas), flags/vars de Mystery Gift, gate de reset RTC y APIs
  RSE que el C conserva sin uso. National Dex ya consume el mismo predicado en
  Pokédex y specials.
- La capa de pointers conserva lectura/escritura, pero no aplica las
  redirecciones `QuestLogGetFlagOrVarPtr` ni registra/reproduce acciones; esas
  funciones requieren el motor de Quest Log. Los helpers Mystery Gift/RTC no
  sustituyen un flujo de hardware o enlace. Pasaron las comprobaciones estáticas
  y la regeneración; sin navegador ni prueba de Quest Log.

## `util.c`: helpers de sprites, afinidad BG y CRC (2026-09-26)

- El inventario reconoce 10/10 funciones en `util.ts`: sprites invisibles,
  palabras en dos halfwords, struct/BIOS BG affine, copia de tiles con flips,
  trailing-zero count, CRC16 (bucle y tabla) y suma `u32`. Conecté el conteo de
  bits desde `battle/util.ts` para que el módulo nuevo tenga un caller real.
- Gráficos/tile data usan `Uint8Array`; el exportador sigue siendo la fuente de
  datos. Pasaron `check:port`, `check:honesty`, inventory, pending y
  `git diff --check`; no hay comparación CRC ni pixel check en este bloque.

## `menu_indicators.c`: indicadores de scroll y cursores de lista (2026-09-26)

- El inventario reconoce 18/20 funciones en `hw/listMenu.ts`. Extraje los
  callbacks de flecha, el conteo/generación de subsprites del outline y los
  callbacks C de actualización/eliminación para ambos cursores, y los conecté
  a los dispatchers públicos de ListMenu.
- `Task_RedOutlineCursor` y `Task_RedArrowCursor` tienen cuerpo vacío en el C;
  no creé stubs TS para ellos. Las hojas/paletas provienen de INCBIN y el render
  usa sprites del runtime web. Pasaron `check:port`, `check:honesty`, inventory,
  pending y `git diff --check`; sin navegador ni comparación de píxeles.

## `palette.c`: helpers de fade y reset de paletas (2026-09-26)

- Añadí `CopyPaletteInvertedTint` con el paso ponderado en enteros del C,
  extraje `BeginFastPaletteFadeInternal` de la API que lo usa y porté el reset
  de slots de `PaletteStruct` junto con `PaletteStruct_ResetById`, incluyendo
  su limpieza desde `ResetPaletteFade`. El inventario reconoce 34/41 funciones;
  las siete ausentes son `BeginPlttFade` (marcada unused en C) y seis helpers
  privados del sistema `PaletteStruct`, que el propio C describe como no usado
  y de funcionalidad desconocida. Los fades/tintes existentes no recibieron
  prueba de píxel en este pase, y `CopyPaletteInvertedTint` aún no tiene caller
  en la web porque el Quest Log no está portado. Pasaron `check:port`,
  `check:honesty`, inventory, pending y `git diff --check`; no se probó en
  navegador.

## `map_preview_screen.c`: rótulos de bosque y preview de mapas (2026-09-26)

- El inventario reconoce 14/14 funciones. Nombré y conecté la transición de
  bosque y su tarea, los helpers de inicio/carga/finalización/descarga y el
  estado invertido `ForestMapPreviewScreenIsRunning`. `MapHasPreviewScreen_HandleQLState2`
  ahora omite previews cuando Quest Log está en `QL_STATE_PLAYBACK`, según el C.
  El Canvas arma el bitmap desde cdata/incbin de forma síncrona; sustituye la
  carga de BG/VRAM, DMA y el window ID por un flag de capa y referencias de
  Canvas. Por eso no hay equivalencia de timing DMA ni prueba de píxeles. Pasaron
  `check:port`, `check:honesty`, inventory, pending y `git diff --check`; sin
  navegador.

## `gpu_regs.c`: bits de interrupción de DISPSTAT (2026-09-26)

- Ajusté `UpdateRegDispstatIntrBits` al C: solo deriva los bits HBlank/VBlank
  de `REG_IE`; la escritura al hardware conserva los bits restantes de
  `DISPSTAT`, incluido el comparador VCount. Quité la actualización adicional
  del bit `DISPSTAT_VCOUNT_INTR`, que no existe en el helper C.
- Pasaron `check:port`, `check:honesty`, inventory, pending y `git diff --check`.
  No hay check headless ni validación en navegador para este cambio.

## `fldeff_softboiled.c`: rechazo de destinatario no válido (2026-09-26)

- Extraje `CantUseSoftboiledOnMon` como función nombrada y la conecté desde la
  validación del destinatario. El inventario ahora reconoce 8/8 funciones por
  nombre y reduce de 98 a 97 los archivos con huecos.
- Pasaron `check:port`, `check:honesty`, inventory, pending y `git diff --check`;
  sin prueba headless ni navegador.

## `money.c`: GetMoney y SetMoney (2026-09-26)

- Añadí los accesores del C y los conecté a las operaciones de saldo. La capa de
  guardado web almacena `save.money` descifrado y sin puntero a SaveBlock; por
  eso no aplica XOR localmente. `money.c` ahora aparece con 13/13 nombres.
- Pasaron `check:port`, `check:honesty`, inventory, pending y `git diff --check`;
  sin prueba headless ni navegador.

## `clear_save_data_screen.c`: reinicio previo a la pantalla de borrar partida (2026-09-26)

- Extraje `CB2_Sub_SaveClearScreen_Init` para nombrar el reset compartido de
  sprites, fade y tareas que se ejecuta antes de dibujar el aviso. El archivo
  ahora aparece con 8/8 nombres en el inventario.
- Pasaron `check:port`, `check:honesty`, inventory, pending y `git diff --check`;
  sin prueba headless ni navegador.

## `dynamic_placeholder_text_util.c`: acceso a placeholder (2026-09-26)

- Añadí `DynamicPlaceholderTextUtil_GetPlaceholderPtr`, que comparte la tabla
  nullable de ocho entradas con Reset/Set/Expand. El archivo ahora aparece con
  5/5 nombres; la expansión conserva su adaptación de devolver un buffer nuevo.
- Pasaron `check:port`, `check:honesty`, inventory, pending y `git diff --check`;
  sin check headless ni navegador.

## `task.c`: nombres C de orden y búsqueda de tareas (2026-09-26)

- Renombré los métodos privados de inserción y búsqueda a `InsertTask` y
  `FindFirstActiveTask`, como en C; el orden de prioridad y el callback por
  frame se mantienen. El inventario reconoce ahora 14/14 nombres.
- Pasaron `check:port`, `check:honesty`, inventory, pending y `git diff --check`;
  sin comparación de orden frame a frame.
