# Handoff: lote `overworld.c` (primera prueba de producción del flujo generado)

Contexto operativo únicamente. Responde en español. Lee además `AGENTS.md` y `CLAUDE.md` (se cargan solos).
Escrito el 2026-09-28. Este archivo no está commiteado.

## Objetivo

Reducir backlog real de `overworld.c` con este flujo, sin ampliar infraestructura:

```text
C original -> clang_codegen (congelado) -> TS generado -> oracle/revisión -> integración real
```

El objetivo es **medir cuánto backlog nominal elimina el flujo**, no confirmar la estimación previa.

## Referencia git

HEAD al escribir esto: `2c1aa49`. Commits recientes relevantes (infraestructura ya cerrada):

```text
2c1aa49 oracle: add differential C/WASM verification
234b9e6 generator: reject unsupported C constructs
44eb7a5 generator: add type-directed integer semantics
60be9d5 fix: preserve C integer semantics in GetReceivedValueInPixels
```

**Cambios ajenos que NO se tocan, stagean ni commitean:** `src/fr/bagMenu.ts` y `src/fr/battle/transition.ts` (modificados en el working tree).
`check:honesty` falla solo por el commit previo `9ecc74f` (mensaje con "complete"); no modificarlo ni ampliar baselines.
No hacer commit del lote hasta que el usuario lo pida; commits de tanda solo con código (estado una vez al final).

## Prohibiciones de este lote

No desarrollar features generales en `clang_codegen`/`clang_support`/`clang_intsem` (**generador congelado**), ni adaptadores del oracle.
No trabajar en: `event_object_movement`, STRUCT, PTR, gráficos, hardware, Sprite/Task general, Mon, SaveBlock.
Si una función falla al generar: documentar el motivo, reclasificar, **no** tocar el generador.

## Oracle: NO debe ampliarse

`tools/oracle/` (opt-in, no está en `check:port`/CI): compila el C del decomp a wasm32 y compara con TS. Solo engancha funciones de
enteros puros, cursores de bytes ya modelados y los specs existentes (`specs/*.mjs`, `controls/*`). **No soporta globals escalares
observables ni structs** (esos adaptadores se descartaron). Regla: si una función necesita observar globals que el oracle actual no
soporta, se verifica con, por orden:

1. `EXISTING_TS_MATCH` (equivalente TS existente, comparado);
2. `CHECK_COVERED` (checks existentes);
3. `SOURCE_REVIEW_ONLY` (revisión frente al C).

**No crear un adaptador nuevo para conseguir `ORACLE_MATCH`.** Niveles de evidencia a reportar por función:
`ORACLE_MATCH | EXISTING_TS_MATCH | CHECK_COVERED | SOURCE_REVIEW_ONLY`. Ver `tools/oracle/README.md` (`node tools/oracle/run.mjs --help`).

## Baseline del backlog (hacerlo PRIMERO, antes de modificar nada)

```bash
npm run inventory
npm run pending
```

Guardar (p. ej. en `/tmp` o en el informe): backlog global, backlog de `overworld` (funciones / hallado) y la lista de nombres
pendientes de `overworld` (`python3 tools/handoff/overworld_candidates.py` la imprime, 124 nominales al escribir esto).
Al terminar repetir **exactamente** las mismas mediciones. Las cifras vivas están solo en `PENDING.md` y `PORT-INVENTORY.md`
(no editarlos a mano ni en commits de tanda).

## Equivalencias vs backlog nominal

`ALREADY_PORTED_EQUIVALENT` es un resultado válido, pero **no reduce el backlog nominal automáticamente**. Si el nombre TS no coincide
con el C y `inventory/pending` sigue viéndola pendiente: reportar la equivalencia, mantener separadas `equivalencias confirmadas` y
`backlog nominal`, y **no** modificar el inventario ni añadir aliases artificiales para mejorar la métrica. El backlog solo baja si la
integración correcta hace que los mecanismos existentes la reconozcan (la función TS con el nombre C, ver `portInventory.count_found`).
Renombrar/reestructurar una implementación manual con el nombre y la forma del C es trabajo válido de AGENTS.md (se reporta aparte
como equivalencia), pero no reemplaces una versión manual mejor integrada/verificada solo porque el generador pueda producir otra.

## Expectativa

Las candidatas **no son funciones prometidas para integrar**. Pueden convertirse en `GENERATE`, `ALREADY_PORTED_EQUIVALENT`,
`REVIEW_ONLY` o `NOT_ACTUALLY_SAFE`. Un número final pequeño es un resultado completamente válido.

## Lista inicial de candidatas (COTA SUPERIOR por análisis; revalidar)

El análisis original (por nombres, globals no comprobados) dio ~20 (188 en total sobre todos los archivos) con criterio
"SUPPORTED + callees ya en TS o también SUPPORTED + sin marca hw/gfx". Reaplicando el mismo criterio a `overworld.c`:

```text
SetFieldVBlankCallback        ResetAllMultiplayerState      SetKeyInterceptCallback     ResetAllLinkStates
AreAllPlayersInLinkState      IsAnyPlayerInLinkState        GetDirectionForDpadKey      KeyInterCB_Idle
KeyInterCB_DeferToEventScript KeyInterCB_DoNothingAndKeepAlive KeyInterCB_SetReady      KeyInterCB_SendNothing
KeyInterCB_SendExitRoomKey    KeyInterCB_SendNothing_2      GetCableClubPartnersReady   IsAnyPlayerExitingCableClub
SetInCableClubSeat            SetLinkWaitingForScript       QueueExitLinkRoomKey        SetStartedCableClubActivity
InitLinkPlayerQueueScript     FlipVerticalAndClearForced
```

(22 nombres; el conteo "20" del informe salió de la fixpoint original y difiere en un par de dependencias entre funciones.)
El script reproducible es más estricto: además exige que **cada global usado tenga un identificador en TS**. Con ese criterio
sobreviven al escribir esto **15 sin ninguna dependencia visible sin resolver**:

```text
SetFieldVBlankCallback, ResetAllMultiplayerState, GetDirectionForDpadKey, KeyInterCB_Idle, KeyInterCB_DeferToEventScript,
KeyInterCB_DoNothingAndKeepAlive, KeyInterCB_SendNothing, KeyInterCB_SendNothing_2, IsAnyPlayerExitingCableClub,
SetInCableClubSeat, SetLinkWaitingForScript, QueueExitLinkRoomKey, SetStartedCableClubActivity, InitLinkPlayerQueueScript,
FlipVerticalAndClearForced
```

Y **44** funciones pendientes de `overworld.c` son SUPPORTED en total (el resto están bloqueadas por callees/globals sin TS o marcadas hw/gfx).

Estado conocido por candidata (al 2026-09-28; todas figuran `missing` por nombre en TS):

- Sin globals ni callees pendientes: las 15 de arriba. Todas son cuerpos cortos (asignaciones a globals/estado de callbacks C, `return` de constantes de teclas). Verificar si hay ya un equivalente manual con otro nombre en `src/fr/field/overworld.ts`, `src/fr/field/linkPlayers*`/enlace o en `game.ts` **antes** de generar.
- `SetKeyInterceptCallback`: **falso positivo de SUPPORTED conocido**. Su parámetro es un `typedef` de puntero a función (`KeyInterCB`); el audit solo detecta `(*` en el tipo desugarado y el `ptype` del parámetro llega sin resolver. Reclasificar `NOT_ACTUALLY_SAFE`, no arreglar el generador. Sus globals (`sPlayerKeyInterceptCallback`, `sRfuKeepAliveTimer`) no tienen identificador en TS.
- `KeyInterCB_SetReady`, `KeyInterCB_SendExitRoomKey`, `GetCableClubPartnersReady`: llaman a `KeyInterCB_Ready` / `KeyInterCB_WaitForPlayersToExit` (sin TS). Además `GetCableClubPartnersReady` usa `gLocalLinkPlayerId`, `sPlayerKeyInterceptCallback`, `sPlayerLinkStates` (sin TS).
- `AreAllPlayersInLinkState`, `IsAnyPlayerInLinkState`, `ResetAllLinkStates`: usan `gFieldLinkPlayerCount` / `sPlayerLinkStates` (sin identificador en TS).
- **Alcance:** la mayoría son cable club / link de `overworld.c`. `LINK` (enlace) está **fuera de la meta principal** según AGENTS.md, aunque `overworld` no esté en la tabla `LINK` de `tools/portInventory.py` (comprobar). Decide con el inventario y anota la duda; no muevas archivos a `LINK`/`COVERED` sin indicación del usuario.
- Otras SUPPORTED con dependencias: `CB2_ReturnToFieldCableClub`, `CB2_ReturnToFieldWithOpenMenu`, `CB2_ReturnToFieldFromDiploma` (`FieldClearVBlankHBlankCallbacks` sin TS, `gFieldCallback(2)` sin identificador), `ReturnToFieldLocal`, `InitViewGraphics`, `InitObjectEventsLink`, `ReloadObjectsAndRunReturnToFieldMapScript` (callees `InitOverworldBgs`, `InitMapView`, `SpawnObjectEventsOnReturnToField`…).
- Marcadas hw/gfx heurísticamente (no elegibles): `VBlankCB_Field`, `MoveSaveBlocks_ResetHeap_`, `InitOverworldGraphicsRegisters`, `SetCameraToTrackGuestPlayer(_2)`, `CB2_EnterFieldFromQuestLog`, `CheckRfuKeepAliveTimer`, `UpdateHeldKeyCode`, `KeyInterCB_SelfIdle`, `KeyInterCB_DeferToRecvQueue`, `InitLinkRoomStartMenuScript`, `Overworld_SendKeysToLinkIsRunning`, `IsSendingKeysOverCable`, `CB2_ReturnToFieldFromMultiplayer`. La marca es heurística: leer el cuerpo.

Bloqueos ya anotados en `PORTING-STATUS.md` que afectan a `overworld.c`: `CB2_EnterFieldFromQuestLog` no llama a `Overworld_ResetStateOnContinue`; `DoWhiteOut`/`CB2_WhiteOut` dependen de `EventScript_ResetEliteFourEnd`; faltan `gMapHeader`/`mapLayoutId` y persistencia de obj events.

## Ubicaciones

- C original: `../pokefirered/src/overworld.c` (funciones desde línea ~250; las candidatas en 1593–3479). Headers: `../pokefirered/include/overworld.h`, `link.h`, `field_*`.
- TS relacionado: `src/fr/field/overworld.ts` (+ `overworldCredits.ts`), `src/fr/game.ts`, `src/fr/field/fieldmap.ts`, `src/fr/save.ts`. Ver mapa en `docs/PORTING-GUIDE.md` (leer solo la sección necesaria).
- Decomp helpers: `tools/decomp/clang_codegen.py`, `clang_support.py`, `clang_intsem.py`, `clang_ast.py`, `common.py` (no modificar).
- Generación de una función: `ClangTsEmitter("overworld.c", func, known_functions=…, enums=I.enum_constants(ast)).emit_function()`; ver el uso en `tools/handoff/overworld_candidates.py` (o `generate_string_util_ts` en `clang_codegen.py` como ejemplo de convención `(buffer, offset)`).

## Reproducir el análisis (comandos exactos)

```bash
python3 tools/handoff/overworld_candidates.py      # lista SUPPORTED/pendientes de overworld.c, callees y globals sin TS (~1 min)
npm run inventory && npm run pending                # baseline nominal
```

`tools/handoff/overworld_candidates.py` (nuevo, sin commitear) usa el generador actual y `portInventory`; su columna hw/gfx está congelada
en el script (viene de la clasificación heurística original del corpus, no se recalcula). El análisis global de origen (corpus de
11.991 funciones, 2.124 SUPPORTED, 2.237 pendientes en alcance, 386 SUPPORTED entre ellas, 261 con callees resueltos, 188 sin hw/gfx)
estaba en scratchpads de la sesión anterior y **no es reproducible desde el repo**; solo el script anterior lo es para `overworld.c`.

## Definición de SUPPORTED (fail-closed, `tools/decomp/clang_support.py`)

SUPPORTED = todas las construcciones de la función están dentro del modelo del generador (auditoría estructural sobre el AST de Clang),
**no equivalencia probada**. Modelo: expresiones enteras (INT), cursores de bytes `u8`/`char` como `(buffer, offset)`, símbolos
`gStringVar*`, `gSaveBlock1/2Ptr.{playerName,playerGender,rivalName}`, `gExpandedPlaceholder_*`, arrays escalares `const` con inicializador
completo, una tabla local de referencias a función con llamada indirecta, `sizeof(a)/sizeof(*a)`, globals escalares por nombre y llamadas a
funciones ya generadas con la misma convención. Rechaza con `UNSUPPORTED_*`: structs (acceso/valor/puntero), uniones, `long long`, float,
goto/asm, acceso hardware, punteros fuera del cursor (aritmética, comparación, null, asignación, retorno, punteros anchos/void/doble),
`&` de local/miembro/elemento/global, funciones-puntero como parámetro/retorno/local, llamadas con punteros a funciones no generadas,
arrays locales sin inicializador completo, varargs, `sizeof` fuera de `sizeof(a)/sizeof(*a)`. Detalle en `tools/decomp/INT_SEMANTICS.md`.

Limitación importante: SUPPORTED solo dice que el generador *sabe* traducir la forma. **Los globals escalares y los punteros a estado C
siguen sin enlazarse a las variables TS reales**, y un cuerpo correcto en el C puede depender de estado del runtime (callbacks, Game)
que el TS gestiona de otra forma. Por eso hay que leer el cuerpo y el uso real.

## Reglas de AGENTS.md/CLAUDE.md que afectan a la tanda

- Tanda = archivo C completo o familia completa; no agrupar 3–10 funciones sueltas. Aquí el lote está acotado por el usuario a las candidatas seguras de `overworld.c`.
- Localiza primero equivalencias TS existentes con otro nombre; reporta equivalencias/wrappers aparte de funciones nuevas.
- Lee completas las funciones C, headers/tipos, globals y callers C/TS/scripts. Integra antes de cerrar: un import aislado no cuenta.
- No emitas stubs ni aproximaciones. No edites `src/fr/generated/` ni `public/fr/` a mano.
- Al cerrar el código: `npm run check:port`, `npm run check:honesty`, `npm run build`, `git diff --check`. Comprueba cdata/INCBIN nuevos que se usen.
- No crees pruebas que solo repitan la implementación. Navegador/capturas quedan para la revisión posterior; anota lo no validado.
- Estado (inventario, pending, KNOWN_GAPS, `PORTING-STATUS.md`) una vez al final, en un único commit de estado, solo si el usuario pide commits.
- No subagentes por defecto. Commit en inglés, imperativo, `Co-Authored-By` con tu entorno. No push.

## Checks relevantes

```bash
npm run check:port && npm run build && git diff --check      # obligatorios al cerrar código
npm run check:honesty                                        # fallará solo por 9ecc74f (preexistente)
npm run check:string-util                                    # si se toca algo que regenere stringUtil.ts (no debería)
node tools/oracle/run.mjs --group controls,real              # gate del generador (solo si se tocara el generador; no se debe)
```

## Informe final esperado (distinguir explícitamente)

```text
candidatas iniciales | candidatas realmente seguras | generadas | verificadas (con nivel de evidencia) | integradas |
equivalencias confirmadas | backlog nominal eliminado | pendientes restantes
```

Más: divergencias encontradas, falsos positivos de SUPPORTED, backlog de `overworld` antes/después, backlog global antes/después,
archivos modificados, resultados de checks, `git status`, y recomendación del siguiente lote (`event_object_movement`,
`battle_ai_script_commands`, otra familia, o volver a manual/runtime). No avanzar al siguiente lote después de responder.
