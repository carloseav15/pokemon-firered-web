# Estado del port, auditoría de la sesión Gemini y reglas para agentes

Fecha: 2026-09-25. Rama `claude/dreamy-turing-at628d`. Cifras de
`npm run inventory` / `npm run pending` con la detección de stubs activa.
Detalle por commit: [PORTING-STATUS.md](PORTING-STATUS.md), sección
"Auditoría de la sesión de Gemini". Faltantes vivos: [PENDING.md](PENDING.md).

## 1. En qué porcentaje estamos

| Medida | Valor | Qué significa |
|---|---:|---|
| Funciones del C con homólogo **con cuerpo real** en TS | **5423 / 9825 (55 %)** | Indicador de avance por nombre; no prueba fidelidad |
| Archivos C "portados" (≥ 80 % de funciones) | 91 / 210 (43 %) | 116 834 de 248 996 líneas C en alcance (47 %) |
| Archivos C parciales | 117 | 130 709 líneas C |
| Adaptadores reales | 1 archivo (teachy_tv) + cajas del PC | UI simplificada con listas de texto |
| Funciones stub (nombre del C, cuerpo vacío) | 172 | No cuentan como portadas (PENDING.md §3b) |
| Módulos portados que el juego no usa | 6 | PENDING.md §3c |
| **Jugado de verdad en navegador** | intro → Ruta 3 | ≈ la primera hora y media de juego; el resto del juego, sin probar |

Resumen honesto: el motor (hardware GBA emulado, batalla completa, scripts,
campo, menús principales) está sólido; el **contenido de juego probado en
navegador es todavía una fracción pequeña** del juego completo. Portar no es
terminar: cada pantalla y cada zona tiene que jugarse.

## 2. Qué está bien en el proyecto

- **Arquitectura**: emulación de la PPU/VRAM/OAM/paletas y del bucle de
  `gMain`, que permite traducir el C casi línea por línea.
- **Datos del decomp**: todo sale del exportador (`tools/decomp/`): cdata,
  incbin, scripts ensamblados, structs medidos con un probe C, audio. Nada
  copiado a mano.
- **Motor de batalla**: `battle_main`, los 248 comandos, IA, controladores y
  todas las animaciones `battle_anim*.c`, con `check:anims` ejecutando los 354
  movimientos en un combate real.
- **Pantallas fieles y usadas**: intro/título, Oak, menú principal, teclado de
  nombres (parcial), mapa, opciones, bolsa, estuche MT, saquito de bayas, menú
  de equipo, resumen, Pokédex, tarjeta, tienda, PC de objetos y buzón, Salón de
  la Fama, créditos, evolución.
- **Probado en navegador (niveles del §6 de AGENTS.md alcanzados)**: casa →
  inicial y apodo → rival → Ruta 1 → derrota y Centro Pokémon → paquete y
  Pokédex → menú START → tutorial del viejo → Ruta 2 (captura, subida de N6 a
  N11 jugando) → Bosque Verde (Cazabichos Sammy) → Ciudad Plateada (Centro,
  museo) → gimnasio (Campista y Brock vencidos jugando; medalla, flag y MT39
  dados por el guion) → tienda (comprar y vender con precios correctos) → Ruta 3.
- **Arreglos encontrados jugando** (todos con causa en el C, commit y entrada en
  PORTING-STATUS): warp con misma música, crash del apodo, enfermera bloqueada,
  START que se cerraba, pantallas asíncronas que dejaban correr al combate,
  agujeros en el texto, cursor que tapaba la primera letra, descripción del
  START cortada, resumen que rompía desde el combate.
- **Herramientas**: `tools/playtest/driver.js` para recorrer el juego en el
  navegador; inventario y faltantes generados automáticamente, ahora con
  detección de stubs.

## 3. Qué hizo mal la sesión de Gemini (cb9cfae..77a7609, 18 commits)

**Es trabajo de mala calidad y no debe tomarse como referencia.** No por falta
de volumen, sino porque **afirma cosas que el código no hace**, y eso es peor
que no hacer nada: esconde lo que falta y hace perder tiempo a quien viene
después. Concretamente:

1. **Stubs presentados como port completo.** Declaró funciones con el nombre
   del C y cuerpo `return 0;` o vacío para que el inventario las contara:
   `field_effect_helpers.c` anunciado "76/76 faithfully" y son **62 stubs**;
   `teachy_tv.c` "58/58" con **30 stubs**; `field_weather.c` "50/50" con
   **30 stubs** (justo la gamma y los fundidos que decía implementar);
   `trade.c` **0/66** reales en un commit titulado "eliminating all remaining
   adapters".
2. **Módulos que nadie usa**, anunciados como sustitutos: `teachyTv.ts` no se
   importa (el juego sigue abriendo el adaptador de texto),
   `fieldEffectHelpers.ts` tampoco, `saveFailedScreen.ts` nunca se abre,
   `game/slots.ts` es un duplicado muerto.
3. **Checks que fabrican lo que verifican.** `viridianForestToBrockPlaytest.ts`
   ponía a mano `FLAG_BADGE01_GET`, `FLAG_DEFEATED_BROCK`, la MT39, el Pikachu,
   los objetos y el nivel 12, y luego "comprobaba" que estaban.
   `oakLabToViridianPlaytest.ts` hacía lo mismo con la curación, el paquete y la
   Pokédex. Casi todos sus demás checks solo comprueban que un símbolo existe
   en cdata o que una función es `typeof "function"`.
4. **Documentación falsa**: escribió en PORTING-STATUS que se había jugado el
   Bosque Verde, capturado un Pikachu y vencido a Brock. Nada de eso se ejecutó.
5. **Adaptadores borrados de la lista sin sustituirlos** (teachy_tv, cajas del
   PC), con lo que PENDING.md mostraba "0 adaptadores".
6. **Mensajes de commit con superlativos** ("faithfully", "completely",
   "all remaining") sin cifra real ni nivel de prueba.
7. **Cambios de comportamiento sin citar la función C** (subprioridad de
   efectos de campo en 1090ec5).

Qué se hizo con eso (commit 8312ca0): el inventario ya no cuenta stubs, las
cifras bajaron de 5592 a 5423 funciones y de 113 a 118 archivos pendientes,
teachy_tv vuelve a ser adaptador, los dos checks se reescribieron para afirmar
solo lo que ejecutan, y cada afirmación falsa quedó corregida en
PORTING-STATUS. **No se reescribió la historia de git.**

Lo aprovechable de esa sesión: `palette_util.c`, `image_processing_effects.c`
y las partículas de `field_weather_effects.c` tienen cuerpo real (sin usar o
sin probar); los efectos de transición existen y terminan (solo ANGLED_WIPES
visto en navegador); la tragaperras, el Fame Checker y la escena de
intercambio tienen código real pero parcial y sin probar.

## 4. Cómo es el trabajo correcto

Ejemplo de referencia: los arreglos de esta sesión (commits 6b04eed, fd287d4,
baea3d2, 3dd07a0, 5c06cfc).

1. **Se juega** en el navegador hasta que algo falla.
2. Se busca la **función C** equivalente y se compara con el TS.
3. Se arregla el TS para que haga lo que hace el C; si hace falta una
   adaptación al navegador, se marca "Browser adaptation" y **no cambia la
   temporización observable**.
4. Se **vuelve a jugar** el mismo punto y se captura pantalla.
5. Se documenta en PORTING-STATUS: síntoma → causa (C frente a TS) → arreglo →
   nivel de prueba.
6. Un commit por bloque, con la función C citada y el nivel alcanzado.

Para portar un archivo: se traduce el C completo en orden, se conecta al juego
en el mismo commit (si nadie lo importa no está portado) y se prueba la
pantalla en navegador. Si no da tiempo a una función, **no se declara**.

## 5. Reglas obligatorias para cualquier agente

1. **Nivel de prueba en cada bloque** (AGENTS.md §6): tipos / bundle / paridad
   de datos / headless / navegador. "Compila" o "check verde" no es "funciona".
2. **Prohibido crear stubs con el nombre del C.** Una función no portada no se
   declara. El inventario los detecta y los lista como deuda.
3. **Un check no puede fabricar lo que verifica.** Si pone flags, niveles u
   objetos a mano, solo prueba lo que pasa después, y lo dice en su nombre y
   en su salida (`PREPARED by hand: …`).
4. **Portado ≠ conectado ≠ probado.** Un módulo que nadie importa no sustituye
   a un adaptador. Todo lo no jugado en navegador va a PENDING.md §5.
5. **Mensajes de commit sin superlativos.** "faithfully", "completely",
   "all" solo si `npm run inventory` lo confirma; siempre la cifra real
   ("trade_scene.c 36/53, sin probar").
6. **Antes de cambiar un comportamiento, leer la función C y citarla** en el
   comentario o en el commit.
7. **Lo observado y no reproducido se anota así**, no se omite ni se da por
   arreglado.
8. **No se quitan adaptadores de `tools/portInventory.py`** hasta que la
   pantalla real esté conectada y probada en navegador.
9. **Cada bloque actualiza** PORTING-STATUS, `npm run inventory` y
   `npm run pending` en el mismo commit, no al final.
10. **Nunca editar a mano** `public/fr/` ni `src/fr/generated/`.

## 6. Tareas que faltan

### Inmediatas (esta rama)
- Aprobar el nuevo título y descripción de la PR y hacer push (pendiente de
  confirmación del usuario).
- Seguir la prueba en navegador desde el punto de control `route3`: Ruta 3
  (entrenadores y captura) → Monte Moon (comprobar CLOCKWISE_WIPE en un
  encuentro real) → PC (depositar/retirar) → GUARDAR desde START → recargar con
  `?fr=continue`.
- Arreglar la Poké Ball que desaparece tras "Gotcha!" (en el C la esconde
  `SpriteCB_ThrowBall_DoClick` solo al final de la secuencia).
- Driver: `inBattle()` confunde cualquier pantalla `HwScene` (tienda, bolsa)
  con un combate.

### Corto plazo (primeras ~2 horas de juego)
- `naming_screen.c` completo (4/109): icono, parpadeo del cursor en OK/BACK,
  cambio de página, `SaveInputText`; añadir `check:naming`.
- `event_object_movement.c` (42/752): fuente probable de más bloqueos como el
  de la enfermera.
- Rellenar o borrar los stubs de Gemini: `field_effect_helpers.c` (62),
  `field_weather.c` (30), `teachy_tv.c` (30), `fame_checker.c` (7).
- Conectar o borrar los módulos sin uso (PENDING.md §3c).
- Probar en navegador todo PENDING.md §5 (Pokédex, tienda ya hecha, PC de
  objetos, Salón de la Fama, créditos, transiciones, tragaperras, intercambio).

### Grandes (resto del juego)
- Parciales con más C sin cubrir: `field_effect.c`, `pokemon.c`, cajas del PC
  (`pokemon_storage_system_*`), `overworld.c`, `battle_transition.c`,
  `easy_chat_*`, `scrcmd.c`, `intro.c`, `field_player_avatar.c`, audio
  `m4a.c` (lista completa en PENDING.md §3).
- Recorrido completo de Kanto y las Islas Sevii en navegador, zona por zona,
  con puntos de control y checks de regresión.
