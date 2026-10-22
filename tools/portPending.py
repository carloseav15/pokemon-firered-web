#!/usr/bin/env python3
"""Generate PENDING.md: what is still missing to finish the port.

Reads PORT-INVENTORY.md (run `npm run inventory` first) and writes the list of
pending C files by category with an estimate of the C lines not yet covered
(lines * missing/total functions). Also prints the overall progress numbers.

Usage: python3 tools/portPending.py   (or npm run pending)
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "PORT-INVENTORY.md").read_text()


def fmt_int(value: int) -> str:
    return f"{value:,}".replace(",", ".")

# Screens/systems ported from the C but never run in a browser (fase de pruebas).
UNTESTED = [
    ("pokedex_screen.c + pokedex_area_markers.c + wild_pokemon_area.c + trainer_pokemon_sprites.c", "pokedexScreen.ts"),
    ("pokemon_special_anim.c + pokemon_special_anim_scene.c (usar objeto)", "pokemonSpecialAnim.ts"),
    ("item_pc.c + mailbox_pc.c + pc_screen_effect.c + player_pc.c (buzón)", "itemPc.ts, mailboxPc.ts, playerPcMailbox.ts, pcScreenEffect.ts"),
    ("shop.c + buy_menu_helpers.c (venta/revisión general pendientes; compra focal 3935b183) + event_object_movement.c parcial", "shop.ts, buyMenuHelpers.ts, objectEventGraphics.ts"),
    ("hall_of_fame.c + credits.c (+ overworld.c créditos)", "hallOfFame.ts, credits.ts, overworldCredits.ts"),
    # Sesión Gemini (cb9cfae..77a7609): sus checks solo prueban datos/estado, no la pantalla.
    ("battle_transition.c (todas salvo ANGLED_WIPES)", "battle/transition.ts"),
    ("player_pc.c (menú superior del PC del jugador)", "menus/playerPc.ts"),
    ("learn_move.c", "menus/moveRelearner.ts"),
    ("field_weather.c + field_weather_effects.c", "field/weather.ts, field/weatherEffects.ts"),
    ("fame_checker.c", "fameChecker.ts"),
    ("slot_machine.c", "menus/slotMachine.ts"),
    ("trade_scene.c (intercambios en juego)", "pokemon/ingameTrade.ts"),
    ("itemfinder.c", "menus/itemFinder.ts"),
    ("help_message.c (ciclo de vida de la ventana de ayuda)", "menus/helpMessage.ts, game.ts"),
    ("link.c + overworld.c (predicados y cola de recepción; sin transporte)", "linkState.ts, hw/menuHelpers.ts"),
    ("item.c (compactación de PC y bolsillos)", "pokemon/items.ts, itemPc.ts, bagMenu.ts, tmCase.ts"),
    ("trainer_see.c (revelación de entrenador enterrado)", "field/trainerSee.ts, field/objectEvents.ts"),
    ("braille_text.c (callback de impresora Braille)", "gba/textPrinter.ts, gba/font.ts"),
    ("text.c (impresoras, glifos latinos e iconos de keypad)", "gba/textPrinter.ts, gba/font.ts"),
    ("script.c (estado de entrada Quest Log)", "script/context.ts"),
    ("teachy_tv.c (los seis programas y el menú)", "teachyTv.ts"),
    ("oak_speech.c + pokemon.c (naming, manager de sprites de combate, flauta/estimulante)", "oakSpeech.ts, battle/anim.ts, menus/fieldMenus.ts"),
    ("battle_records.c (pantalla de Battle Records/Trainer Tower)", "battleRecords.ts"),
]

# Ported modules that nothing in the game imports yet (dead until wired).
UNWIRED = [
    ("image_processing_effects.c", "imageProcessingEffects.ts", "sin caller en el C (solo su .c/.h)"),
    ("palette_util.c", "paletteUtil.ts", "sin caller en el C (RouletteFlash/PulseBlend/rectángulos)"),
    ("cable_car_util.c", "cableCarUtil.ts", "sin caller en el C (helpers static sin uso)"),
    ("(registros BG)", "hw/bgRegs.ts", "registros GBA sustituidos por Canvas (decisión del usuario, 2026-10-01); en C solo los lee InitOverworldGraphicsRegisters y link.c"),
]

# Known functional gaps that the per-function count does not show.
KNOWN_GAPS = [
    "Hoenn: banco regional (6e2d62a9), entrada (67d14da8), circuito mínimo (76a49c81) y ferry/Continue (8aba7d5d). 299ece60: Chromium PASS de recorrido continuo desde ferry Kanto por Slateport/Centro/tienda/Ruta 110, victoria/experiencia, derrota natural Emerald y regreso; guardar/Home Continue y equipo/bolsa/dinero/progreso conservados. Solo entrenador inicial PREPARED, sin escrituras de estado entre paradas ni comandos sin implementar en ese circuito. Portados DoWhiteOut/Overworld_ResetStateAfterWhiteOut (overworld.c) y UpdateCyclingRoadState (field_specials.c); check focal de 120 frames, dinero impar, flags/clima y una recolocación PASS; regresión recuperación Kanto Chromium PASS. 627fafc9: respawn inicial del viajero en el warp fuente Slateport (adaptación del ferry, precedente S.S. Tidal), reparación de bancos con warp vacío y conservación de respawns registrados; Chromium PASS derrota natural antes de cualquier Centro, guardar/Home Continue antes y después y retorno Kanto aislado (solo entrenador lab-done junto al ferry PREPARED). check:region-save cubre bancos antiguos y respawn Kanto. 9201e625: rotating_tile_puzzle.c completo, cuatro comandos y familia LockAnim/UnlockAnim integrados con traducción explícita de IDs; comparación C 1447+41 casos PREPARED y nueve scripts alcanzables (35 desplazamientos de plantillas) PASS sin render. Retirado contador adaptado; teletransportes adaptados sin sustituir. b62faba9: Continue conserva plantillas, TEMP y poses activas del puzzle; nueve scripts con almacenamiento, banco Hoenn aparcado al guardar Kanto, siguiente pulsación contra C y reinicio por entrada normal PASS. Chromium PASS de interruptor amarillo real en ambos mapas, Save/Home Continue/segundo Save/Continue del menú/recarga; entrenador y casilla contigua inicial PREPARED. Regresión ferry PASS; aislamiento del puzzle entre bancos probado en almacenamiento, sin caminata puzzle-ferry ni recorrido completo/paridad audiovisual. Delta FireRed 0 nuevos/0 equivalencias; 0 cuerpos Emerald nuevos. f8321b31: buffers Emerald de entrenador/concurso/decoración, cinco helpers y tablas fuente (30 estándar/121 decoración/5 concursos/43 bayas); correcciones de plural y texto virtual. check:emerald-script-text PASS: 4112 casos PREPARED contra C, cuatro prefijos de scripts fuente y buffers virtuales, sin render ni sistemas completos. Exportación determinista y rechazo focal PASS. 24ea031f–8116c5c5 (P1): quedan bloqueados `pokenavcall` y `fadescreenswapbuffers` (resto de comandos Emerald conectado); 23 specials de field_specials.c portados, con contenido Emerald solo corren 18 homónimos FireRed idénticos y el resto lanza error (faltan ~437 specials usados); alias de la special var 0x8015; contrato de movimiento transitivo (WALK_SLOW→WALK_SLOWER, tipos 77–80) con 37 acciones regionales aún sin cuerpo; Mossdeep requiere conservar plantillas durante su warp fuente y conectarlo al visor. Pendientes: reto Cycling Road completo (warp/música/reloj/colisiones), restantes comandos/specials, campañas, otros recorridos, paridad audiovisual, móvil y producción. Cinemáticas adaptadas y títulos residuales en español conservados; elección Johto diferida. Ver docs/HOJA-DE-RUTA.md y TAREAS-FINALES.md.",
    "UI web en inglés (fd61199e): menús Kanto/Hoenn, controles accesibles y ocho inspectores comprobados en Vite/build servido; viewport 390 px. Johto en exploración sigue bloqueado: falta public/hns/fieldfx.json (la ruta de carga no se modificó ni se añadió fallback); no acredita juego Johto ni paridad de contenido original. Revisar exportación fuente antes de ampliar su integración.",
    "Visor, objetos (2fc61ad4, 50350097, f5e80a9c): flags controlan presencia/colisión; temporales acotados al mapa y reiniciados en conexiones/puertas/warps; 49 flags iniciales fuente solo en partidas nuevas. Puente de posición/dirección/invisibilidad y retiradas explícitas para objetos observados del mapa actual; hidrata instancias cargadas entre interacciones y recompone ocupación/sectores. Chromium: Liam (3,8)→(5,8), recompensa 3000→3220, menú conserva pose, colisión nueva/antigua libre; Corte/guardar/Continuar/recarga/conexión, flags/interior, victoria Liam/Brock→Plateada y puerta/menú/Cuerda Huida/Excavar PASS (PREPARED según jobs). Invisibilidad con colisión, identidad por mapa, retirada no indexada/observador y warp mismo mapa con fixtures PREPARED; 58 checks/tipos/honesty/build PASS. 31dfe405 añade persistencia de poses observadas del visor en la misma partida: guardar/Continuar/recargar URL con Liam real y colisiones PASS, SAVE del menú fuente PASS; serialización/legacy/identidad/mapa con fixtures PREPARED y checks focales/tipos/honesty/build PASS. 059a1a25 comparte los predicados C de aparición de árboles/rocas entre motor y visor; resuelve identidades de clones sin duplicar entidades y conserva obstáculos activos entre conexiones/reconstrucciones. Chromium: Corte/guardar/Continuar/recarga→Celeste, clon cercano oculto/aparición al alejarse y regreso a Ruta 9 retenido PASS (entradas PREPARED según job); fixtures PREPARED para cuatro bordes/flags/límites y siete identidades/coordenadas fuente, tipos/honesty/build PASS. c46538b4 separa identidad de mapa y coordenadas de clones: observación/retiradas e hidratación por identidad completa, proyección v2 compatible con v1 y culling distinto de retirada. Chromium: menú fuente observa clon de Ruta 9 desde Celeste en (2,8), guardar desde ajustes/Continuar/recargar y retorno a Ruta 9 PASS; fixtures PREPARED para siete conversiones/identidades/migración, tipos/honesty/build PASS. Pendientes selección/interacción de scripts de clones, actores nunca cargados, captura fresca al escribir SAVE fuente, resto de fronteras/clones NPC, gráficos/elevación/tipos de movimiento y eventos/VM generales. No acredita historia completa. Delta 0 cuerpos C nuevos/0 equivalencias por nombre.",
    "Visor, menús (5af2a378): retirada la lista DOM de equipo/mochila; ajustes abre el menú existente del motor. Chromium focalizado: apertura/retorno, resumen/orden, Poción, opciones persistentes, curación/sesión y compra/recarga PASS (PREPARED según jobs). 58 checks/tipos/honesty/build PASS. Se conservan pendientes táctil/móvil, resto de acciones/objetos y paridad audiovisual; no valida la aventura completa. Delta 0 cuerpos C nuevos/0 equivalencias por nombre.",
    "Visor→juego (3935b183): inicio temporal Nv.5/cinco Poké Balls/₽3.000 y SaveBlock compartido con clave independiente; menú básico DOM, guardar/continuar, VM fuente de enfermera/tienda y ventanas/sprites sobre el mismo mapa, sin modal con segundo escenario. Chromium: curación (lesión PREPARED)/continuidad de mapa/cámara Rojo/Hoja; compra 3+12, rechazo sin dinero y recarga persistente PASS; 58 checks/tipos/honesty/build PASS. Inicio definitivo, VM general/eventos automáticos de historia, objetos dinámicos del visor, otros NPC/centros/tiendas, venta/menús completos, prioridades generales y audiovisual/ROM pendientes. Siguientes hitos acordados: salvaje/captura y Brock; planificación conjunta para otros agentes en TAREAS-FINALES.md §6.5p-s. Delta: 0 cuerpos C nuevos/0 equivalencias por nombre.",
    "5ec96850 (guardas a03de99a) conecta ascensores al visor: cuatro menús/20 destinos fuente, animación C compartida, cancelación/misma planta, retorno por coordenadas y recarga; Azulona Rojo/Hoja, Silph, Rocket (llave PREPARED y rechazo sin llave) y Trainer Tower PASS. Menú DOM/adaptador acotado; VM general, obtención de la llave y ROM pendientes. d41c93d0 respeta connections_no_include (mapjson.cpp:155-159): Saffron real sin conexiones exteriores; cuatro casetas ida/vuelta hasta Rutas 5-8 Rojo/Hoja PASS. Suite de navegación 25/25 Rojo +25/25 Hoja PASS; inserción visual de la ciudad real en el atlas y revisión exhaustiva pendientes.",
    "Atlas principal (fe68ee77): plano exclusivo de superficie, interiores desde entradas y submarinos desde Dive/Emerge/retorno o búsqueda; ferris de consulta desde ciudades/puertos identificados. Franjas terrestres no verificadas y submarino retirados del plano; 39 posiciones de superficie pendientes en el catálogo. Datos/determinismo y Chromium focalizado comprobados; no acredita mundo continuo ni simulación de Dive/ferris. Siete referencias fronterizas, seis discrepancias HnS, selección completa/ROM/paletas/dispositivos/producción y simulación por sectores pendientes. Ver docs/ATLAS.md y TAREAS-FINALES.md §6.5g.",
    "Visor común (79ec8960): consulta estática FireRed/Emerald/HnS/Crystal con bloques/mips y límite de RGBA estimado. Datos y recorridos focalizados Chromium pasan; no mide memoria total/GPU ni valida todas las imágenes o ROM. Explorar Kanto continental usa mapas próximos con colisiones/canvas liberables, borde de cámara y modo inmersivo; conserva simulación adaptada, sin historia/combates. 33a980b4 añade interiores básicos con control/render compartidos y warps fuente; Chromium de Paleta entrada/caminar/salida/recarga/escaleras PASS. a4b1148b integra puertas/fades con el animador y reloj compartidos; Rojo/Hoja Paleta y Centro Pokémon de Ciudad Verde pasan gráficos/cadencias/entrada/salida. c9624819 integra desplazamiento diagonal de escaleras; Rojo/Hoja Paleta 1F↔2F pasan offsets/prioridad y no rebote. 4aab2061 comparte teletransportes C (3700 frames/24 casos) y Rojo/Hoja gimnasio Saffron/Silph ida/vuelta PASS. "
    "4c5126a4 comparte caídas C (944 frames/24 casos) y Rojo/Hoja Islas Espuma seco/agua, aterrizaje/prioridad/sacudida/Surf PASS. Salida de agujero adaptada de hole.inc, sin VM de historia; ancla virtual GBA y clima global sin comparación ROM. 97a3122d comparte movimiento forzado C (49152 casos) y Rojo/Hoja hielo/giros/corriente/cascada PASS; eebdadff comparte escaleras mecánicas C (3488 frames) y Rojo/Hoja Ciudad Verde 1F↔2F PASS. Quedan revisión exhaustiva de recorridos, oclusión por puentes/elevaciones e inserción visual de Saffron real en el atlas; ascensores/plantas y casetas conectados en 5ec96850/d41c93d0. Interiores sin NPC/scripts generales. Hoenn e inspector técnico conservan carga global; Johto estático. Arranque sin capa de carga residual y sprites preparados; pasos/saltos/surf/recarga corregidos y probados con teclado (6.5i). Chromium focalizado ~59 FPS iniciales y ~60 en recorrido Pallet/Ruta 1; no garantiza rendimiento general. Avatar base Rojo/Hoja usa fotogramas/comandos C y Sprite compartido (6.5j): 32 combinaciones Chromium, colisiones/saltos y capturas comprobadas. Soporte SurfBlob normal integrado (6.5k), con geometría OAM, cuatro animaciones y desplazamiento del jinete desde C; Chromium Rojo/Hoja, pausa/recarga/retirada y capturas comprobados. "
    "Soporte durante salto de orilla y sombra de salto integrados (6.5l), con cobertura desactivada en vuelo y Chromium Rojo/Hoja/capturas comprobados. Reflejos del avatar integrados (6.5m) con paleta/frames C y deformación affine/trig; Chromium Rojo/Hoja, bici/surf/pausa y máscara de agua comprobados. La máscara adapta BG del mapa aplanado. Cobertura local BG1/BG2 restaurada en 6.5n desde DrawMetatile/elevación C (128KiB), sin recorte fijo de hierba; píxeles Rojo/Hoja y recorrido ~60 FPS comprobados. f87e8e28 incorpora colisión direccional/elevación; 297fc052 incorpora charcos/agua somera/aterrizajes y prioridad C de efectos. Harness PREPARED y teclado exterior de 62 pasos ~60 FPS/p95≤16,8 ms pasan; no valida todos los terrenos. 70c81706 verifica Rojo/Hoja con teclado y píxeles en tejado/árbol/mueble/pared interior, y efectos reales de hierba/arena/bici/ondas/agua somera (pausa y retirada); d7aa1aeb verifica ocultación completa en tres casillas de Ciudad Carmín con rutas reales Rojo/Hoja y píxeles de ida/vuelta. Censo geométrico: seis casillas candidatas en 255 mapas; accesos alternativos a Fucsia/laboratorio/Ruta 10 sin validar. No acredita todos los sectores/mapas. "
    "Los 88 metatiles de charco censados tienen colisión: sin prueba caminable real, conservar harness PREPARED. Objetivo activo §6.5o: terminar ocultación, terrenos, efectos e interiores; los cuatro puntos siguen abiertos. Compositor de cámara completa, NPC/subsprites, puentes/prioridades altas/SPLIT sin recorrido real, clima y revisión exhaustiva de efectos siguen pendientes, junto con NPC, terrenos especiales/revisión exhaustiva, interiores/sesión, sectores Hoenn/Johto, gestos táctiles reales y producción. Inspector GBA/grafo Crystal conservados como herramientas específicas. Ver docs/ATLAS.md y TAREAS-FINALES.md §6.5d.",
    "Visor HnS (dfe3926b): mapas 2D estáticos desde fuente fijada, con warps navegables y mundo por bloques; no ejecuta motor/historia. Objetos como marcadores, sin animación/horario/audio. Revisión ROM/táctil pendiente; consulta trasladada al visor común (79ec8960); Route 7 referencia metatile 902 fuera de su tileset y se conserva sin render; discrepancias de conexiones y layouts incompatibles registrados en public/hns/maps.json. Ver docs/ATLAS.md y TAREAS-FINALES.md §6.5c.",
    "Driver de pruebas: modo manual y replay fase 1 (5de398c3), 10×10.000 fotogramas desde partida nueva con observación idéntica. Snapshot v1 no es un savestate: no captura closures, sprites, audio ni combate completo; cargas posteriores, audio lógico, intro/título, combate, consumo RNG por VBlank y paridad ROM quedan pendientes (DRV-15). 98dc7ab1 añade recorrido reanudable Celeste→Ruta5 por UI y checkpoints SAVE/continue/movimiento; no acredita historia anterior, Liga/Sevii ni todas las opciones (DRV-16). DRV-10/12/13 siguen abiertos; revisión independiente de Muse y del tramo2 pendiente.",
    "Guardado: 1.22 (bab7d84a) integra SaveObjectEvents/LoadObjectEvents, 16 slots y campos C. NPC movido y objeto runtime conservados tras SAVE/continue con/sin Quest Log; pruebas focalizadas con entradas PREPARED declaradas, no paridad audiovisual completa. Saves antiguos sin snapshot solo recuperan templates; no se pueden reconstruir sus posiciones dinámicas perdidas.",
    "Easy Chat: escribir cartas conectado (`partyMenu.ts` → `fieldMenus.writeMail` → `DoEasyChatScreen` de `easy_chat_2.c`, con `CommitECWords` escribiendo en `save.mail`); editor sin probar en navegador.",
    "Intercambios de NPC: `pokemon/ingameTrade.ts` porta la animación; `SpriteCB_BouncingPokeball` se comparó con C y `check:trade` valida el rebote y el ciclo de escena. `GetInGameTradeMail` se adapta como `attachTradeMail`; `STATE_TRY_EVOLUTION` sigue al C vía `TradeEvolutionScene` (`evolution_scene.c`, tarea 1.7, 2026-10-01); animación pendiente de revisión visual en navegador. De `trade.c` solo hay stubs de la parte de enlace.",
    "Enlace: `linkState.ts` modela estado, identidad del callback y umbrales de cola de `menu_helpers.c`, `link.c` y `overworld.c`; todavía no hay productor de comandos ni transporte cable/RFU que alimente ese estado.",
    "Combate de enlace: `battle_controllers.c` 68/68 con la ruta de buffers `LINK_BUFF_*` y las tareas de envío/recepción, pero `SetControllerToLinkOpponent`/`SetControllerToLinkPartner` (parciales en sus archivos) quedan sustituidos por `BattleControllerDummy` y `linkTransport` no envía paquetes; un enlace real no tendría controladores propios ni transporte.",
    "Almacenamiento de cajas: `pokemon_storage_system_misc.c` conserva cuatro helpers estáticos `UnkUtil_CpuAdd/Run` y `UnkUtil_DmaAdd/Run`; el C los describe como cola funcionalmente sin uso y los Add no tienen callers. La navegación del resumen usa ranuras nullable y filtra especie/huevo según el C; cajas y resumen siguen pendientes de revisión en navegador.",
    "Teachy TV: `teachyTv.ts` está conectado (`Game.openTeachyTv` → `StartTeachyTv`); la lista de texto `keyItemScreens.openTeachyTv` se borró el 2026-10-01 por duplicada. Pantalla sin probar en navegador.",
    "Fame Checker: `fameChecker.ts` está conectado y sus gráficos (ventanas, flechas, info box) tienen cuerpo; sin prueba de navegador.",
    "Transiciones de combate: 12 efectos de las tablas salvaje/entrenador dibujados sobre una instantánea del canvas; las mugshots (Alto Mando/Campeón) están portadas en `battle/mugshotTransition.ts` y seleccionadas desde `battle/transition.ts` (rango LORELEI–BLUE), sin probar en navegador. `battle_transition.c` 129/134: faltan cinco nombres internos (`BattleTransition_Start`, `InitTransitionData`, `VBlankCB_BattleTransition`, `GetBg0TilesDst`, `GetBg0TilemapDst`).",
    "Visión de entrenadores: `trainer_see.c` porta la vista direccional, el chequeo de ruta, la compuerta QL_IsTrainerSightDisabled, los cinco iconos/emote, SpriteCB_TrainerIcons y la revelación enterrada con AshPuff, salto y continuación de acercamiento; falta prueba de runtime. El gate `QL_IsTrainerSightDisabled` ya lee el estado activo del playback del Quest Log. Dos handlers de disfraz no se usan en FRLG y TrainerSeeFunc_Dummy es vacío en C.",
    "Save cifrado: `ApplyNewEncryptionKeyToBagItems` y su alias recorren cantidades almacenadas con XOR por la clave del SaveBlock. El save web guarda las cantidades descifradas en JSON y no modela ese layout físico GBA.",
    "Scripts RAM: `GetSavedRamScriptIfValid` aún depende de `ValidateSavedWonderCard`, cuya tarjeta Wonder no está implementada; el slot RAM y su checksum sí existen en `script/context.ts`.",
    "Pantalla de nombres: 104/109 funciones (`naming_screen.c`); estados, sprites, iconos, renderizado, teclado y callbacks conectados. Quedan cinco `Debug_NamingScreen*` estáticos sin callers en el C; pantalla e historia sin validar en navegador.",
    "Efectos de campo: `field_effect_helpers.c` 76/76 con solo las flechas de warp conectadas "
    "(`field/fieldEffectHelpers.ts` ← `playerAvatar.ts`); los efectos reales viven en `field/fieldEffects.ts` "
    "y los helpers de reflexión de `fieldEffectHelpers.ts` quedan sin caller TS; `field_effect.c` parcial; "
    "Dive conserva la secuencia single-player heredada, pero los mapas FireRed no definen conexiones Dive.",
    "Marcas de bicicleta del motor: DoTracksGroundEffect_BikeTireTracks usa índices JS negativos; revisar direccionamiento contiguo u8 del C (previous * 4 + facing - 5), tarea 1.19. Viewer M13 corregido aparte.",
    "Clima: `field/weather.ts` porta tablas, aplicación/mezcla gamma, hooks BG/OBJ, dispatcher, fundidos y la máquina de gamma de sequía; `Drought_Main`/paleta son no-op en FRLG. FireRed solo usa niebla horizontal (19 mapas) y sombra (7 mapas + script), ambas validadas con Playwright en `MAP_POKEMON_TOWER_3F` y `MAP_VIRIDIAN_FOREST` (header weather 6/11, niebla móvil y sombra oscura; 2026-10-01). Los demás climas son `// unused` en FireRed; sprites de nieve/nubes/burbujas no dibujados quedan fuera de esta tarea.",
    "Huecos de caller individual revisados: `quest_log.c` conserva helpers de punteros/layout GBA y callback de objeto sustituido por el driver web; `event_object_movement.c` mantiene la cámara, reflexiones, plantillas de hardware y helpers sin caller detrás del render Canvas; `field_effect.c` conserva el VM GBA y la gestión de tiles/paletas, mientras el renderer web posee los recursos de imagen.",
    "Créditos: no crean NPCs (igual que `MapLdr_Credits` C) ni clima (13 mapas `WEATHER_SUNNY`, no-op); ahora corren Init/UpdateTilesetAnimations para General water/flowers/sand-edge y la fuente Celadon. Playwright headless confirmó scroll/pan inicial, agua cambiando VRAM y cero errores. Se quitó el callback de cámara del CB idle para preservar el índice de comandos entre mapas; durations CData ausentes se normalizan a cero. El recorrido completo de pantallas queda para revisión visual.",
    "Audio fino (`m4a*.c`): `m4a.ts` aplica ADSR M4A, duty, sweep NR10, keysplit, envío de reverb, chorus cry y arbitraje de dos jugadores/cuatro pistas; `check:m4a` y `m4aAudio.job.mjs` validan tablas y render OfflineAudioContext. Los cries siguen en WAV y no hay comparación auditiva con hardware; onda programable y el modelo WebAudio de DSP siguen aproximados.",
    "Guardado desde scripts de campo (`Field_AskSaveTheGame`): confirmación, cancelación, escritura y retorno del resultado del script ya están conectados; flujo pendiente de revisión en navegador.",
    "Quest Log: el playback restaura flags/vars, rematches, party/cajas, objetos y layout; las cargas normal/warp usan el driver escalonado de C, avanzan escenas y restauran el save. La grabación siembra input vacío (índice 2) y descarta acciones pasado el tope 32 del buffer (tarea 1.8, 2026-10-01). El retorno al mapa guardado está conectado; faltan validar ese retorno y la reproducción/UI en navegador.",
    "Party menu: retorno desde la selección del Pokémon conectado a fade y espera de clima como en `CB2_FadeFromPartyMenu`/`Task_PartyMenuWaitForFade`; validación de pantalla pendiente en navegador.",
    "Trainer Tower: `trainer_tower.c` queda en 43/43 nombres y conectado al dispatcher de scripts y al ciclo de recursos de batalla; gameplay/navegador siguen pendientes de revisión.",
    "Uso de objetos (`item_use.c`): dispatch Enigma, rechazo de Oak, consumo/mensaje común de Repel, Escape Rope y Poké Doll, flautas, cañas, Item Finder, TM Case, Berry Pouch, Mail, Bike y la secuencia de potenciadores de combate están conectados. El helper registra eventos en el buffer de escena (`questLogEventBuffer.ts`) y la carga/reproducción de esos eventos existe (`LoadEvent_UsedItem` y `QuestLog_PlayCurrentEvent`); sin probar en navegador.",
    "Barrido de candidatos (2026-09-28): `item_menu.c` conserva Teachy TV Catching/Status sin ruta conectada y `Task_UnusedReturnToBag` no tiene caller; `main.c` conserva solo inicialización/interrupciones de GBA ya adaptadas o sin equivalente de navegador; `sprite.c` CopyFrom/ToSprites copia el layout crudo de Sprite y no tiene callers; `battle_setup.c` PokéDude no tiene caller; los huecos de `battle_bg.c` son de enlace y los de `evolution_scene.c` quedan solo en enlace (la familia Trade de intercambio interno se portó en la tarea 1.7).",
    "Bloqueo de tanda (2026-09-28): los cinco `Debug_NamingScreen*` restantes son funciones estáticas sin callers en `naming_screen.c`; los últimos huecos de `field_control_avatar.c` son interacciones de jugadores de enlace y `SetCableClubWarp` es solo Cable Club, fuera de la meta principal.",
    "Menú de guardado (`start_menu.c`): `SaveQuestLogData` cierra y ordena escenas. La restauración y el playback del Quest Log ya están conectados; la pantalla final y la revisión de fidelidad del flujo siguen pendientes.",
    "Summary Pokémon: la ruta activa preserva ranuras vacías de caja, filtra especie/huevo según la página y porta navegación de party individual, selección/cambio de movimiento, transición de páginas y callback dummy del retrato. Los seek de party multi son de enlace; quedan seis nombres por caller ausente o alcance LINK. El recorrido de caja/resumen aún no se ha validado en navegador.",
    "pokemon.c (2026-09-29): 135/140; los cinco huecos son de enlace (`GetLinkTrainerFlankId`, `GetBattlerMultiplayerId`, `GetUnionRoomTrainerPic`, `GetUnionRoomTrainerClass`) y `GetTrainerPartnerName`, que necesita `GetMultiplayerId` de `link.c`. Sin caller tampoco en el C: `CreateSecretBaseEnemyParty`, `DrawSpindaSpotsUnused`, `GetMonFlavorRelation`, `EncryptBoxMon`/`DecryptBoxMon`/`CalculateBoxMonChecksum`/`GetSubstruct`; `RandomlyGivePartyPokerus`/`UpdatePartyPokerusTime`/`PartySpreadPokerus` son no-op porque el cuerpo C también lo es (comentario de RS en `pokemon.c:5608`). Sin cablear en la ruta TS: `SetDeoxysStats` (sus dos callers C son de `battle_main.c` en enlace) y `SpeciesToCryId` (su caller C es `PlayCryInternal` en `sound.c:476`, mientras `audio/sound.ts` manda la especie a la tabla WAV `cries.json` sin pasar por ella).",
    "text.c (2026-09-29): 37/37 con `GetStringWidth`/`GetStringWidthFixedWidthFont`, las familias `FontFunc_*`, `TextPrinter*`, `GetGlyphWidth_*` y `DecompressGlyph_*`, `RenderText` y los iconos de keypad en `gba/font.ts`/`gba/textPrinter.ts`. Las ramas japonesas y el relleno de `glyphId == 0` con los colores del printer están portadas pero no se ejercitan (la ruta TS corre en latín); `FONT_BOLD` (fontId 7) no tiene `fontFunction` en el C y TS lanza si se pinta con él, sin llamadores; con un placeholder dinámico inexistente `GetStringWidth` mide en vez de leer el puntero nulo que el C desreferenciaría. Paridad headless: `DecompressGlyph_*` coincide con los PNG exportados en 6 fuentes x 512 glifos y las anchuras de `text.c` con `fonts.json`; `check:arrow` y `check:braille` pasan (ambos necesitaban `setupNodeGbaMock.ts`); sin prueba en navegador.",
    "battle_records.c (2026-09-29): 31/31 en `battleRecords.ts` con la pantalla HwScene, el save `SaveBlock2.linkBattleRecords` (`save.ts` con backfill) y `gTrainerCards` (`menus/trainerCard.ts`); el especial `ShowBattleRecords` sustituye al adaptador y `ClearPlayerLinkBattleRecords` corre en `NewGameInitData`. `UpdatePlayerLinkBattleRecords` solo lo llama `cable_club.c` `CB2_ReturnFromCableClubBattle`, sin portar (9/54), así que la actualización de récords no se dispara por ninguna ruta viva; el lado `ShowTrainerCardInLink` de `gTrainerCards` sigue pendiente en `trainer_card.c` (66/73). Check focalizado temporal (backfill, borrado, alta/evicción/orden/prefijo japonés, apertura de pantalla, A y salida) pasó y se borró; sin prueba en navegador.",
    "battle_tower.c (2026-09-29): 45/45 nombres; los datos C de `sBattleTowerTrainers` y las clases/gráficos de jugador están vacíos en FireRed. La ruta e-Reader de Seven Island usa el save, greeting, nombres, sprites, flags de batalla y resultado, pero depende de un registro externo válido que el flujo web de e-Reader no produce; circuito Tower normal y flujo e-Reader sin validar en navegador.",
    "Checks headless: tras hacer perezoso `sText_100` (`battle_tower.c`), registrar datos del harness y corregir escenarios, pasan 8/12 checks que estaban conocidos. Cuatro permanecen en `known-failing.json`: `check:questlog-battle` usa API inexistente y LINK; `check:evolution`, `check:famechecker` y `check:transitions` contienen expectativas que contradicen los cuerpos C (detalles en TAREAS-FINALES.md §1.11). `check:all` los separa de regresiones.",
]


def stub_rows() -> list[tuple[str, int, int, int, int]]:
    """(file, lines, ported, total, stubs) for every inventory row with stubs."""
    rows = []
    for line in SRC.splitlines():
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if len(c) < 6 or not c[0].startswith("`") or not c[5].isdigit():
            continue
        fn = re.match(r"(\d+)/(\d+)", c[2])
        if fn:
            rows.append((c[0].strip("`"), int(c[1]), int(fn.group(1)), int(fn.group(2)), int(c[5])))
    return sorted(rows, key=lambda r: -r[4])


def section(name: str) -> list[tuple[str, int, int, int, str]]:
    m = re.search(rf"^## {re.escape(name)}.*?\n(.*?)(?=^## |\Z)", SRC, re.S | re.M)
    rows = []
    if not m:
        return rows
    for line in m.group(1).splitlines():
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if len(c) < 5 or not c[0].startswith("`"):
            continue
        fn = re.match(r"(\d+)/(\d+)", c[2])
        if not fn:
            continue
        rows.append((c[0].strip("`"), int(c[1]), int(fn.group(1)), int(fn.group(2)), c[4]))
    return rows


def missing(row: tuple[str, int, int, int, str]) -> int:
    _, lines, done, total, _ = row
    return int(lines * (1 - done / total)) if total else 0


def table(rows: list[tuple[str, int, int, int, str]], limit: int | None = None) -> str:
    rows = sorted(rows, key=missing)
    if limit:
        rows = rows[:limit]
    out = ["| Archivo C | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |", "|---|---:|---:|---:|---|"]
    for r in rows:
        out.append(f"| `{r[0]}` | {r[1]} | {r[2]}/{r[3]} | ~{missing(r)} | {r[4]} |")
    return "\n".join(out)


def ordered_table(rows: list[tuple[str, int, int, int, str]], statuses: dict[str, str]) -> str:
    rows = sorted(rows, key=missing)
    out = ["| # | Archivo C | Estado | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |",
           "|---:|---|---|---:|---:|---:|---|"]
    for rank, row in enumerate(rows, 1):
        name, lines, done, total, note = row
        out.append(f"| {rank} | `{name}` | {statuses[name]} | {lines} | {done}/{total} | ~{missing(row)} | {note} |")
    return "\n".join(out)


def main() -> None:
    falta = section("Falta")
    adaptador = section("Adaptador")
    parcial = section("Parcial")
    casi = section("Casi completo")
    total = re.search(r"\*\*Total en alcance\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)/(\d+)\*\*", SRC)
    pend = re.search(r"\*\*Pendiente de portar\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\*", SRC)
    pendientes = falta + adaptador + casi + parcial
    link = re.search(r"\*\*Enlace \(aparte\)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)/(\d+)\*\*", SRC)
    lineas_estimadas_sin_cubrir = sum(missing(r) for r in pendientes)
    parts = ["# Faltantes del port (generado)", "",
             "Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.",
             "Las listas de \"pruebas\" y \"huecos conocidos\" salen del script.", ""]
    if total and pend:
        done, allf = int(total.group(3)), int(total.group(4))
        parts += ["## Avance", "",
                  f"- Funciones con homólogo del mismo nombre en `src/games/firered` (en alcance): **{done}/{allf} ({100 * done / allf:.1f} %)**.",
                  f"- Archivos C con funciones aún sin homólogo: **{pend.group(1)}**; quedan **{allf - done} nombres**.",
                  *([f"- Fuera de la meta principal, enlace e inalámbrico: {link.group(3)}/{link.group(4)} en {link.group(1)} archivos (sección aparte en PORT-INVENTORY.md)."] if link else []),
                  f"- Estos archivos contienen {fmt_int(int(pend.group(2)))} líneas C en total; la estimación de líneas sin cubrir se muestra por archivo abajo.",
                  f"- Estimación ponderada del C sin homólogo: **~{fmt_int(lineas_estimadas_sin_cubrir)} líneas** (aproximación por proporción de funciones).",
                  "- Es un indicador de nombres, no de fidelidad: las funciones stub no cuentan (sección 3b) y **no incluye la fase de pruebas en navegador** (sección 5).", ""]
    statuses = {r[0]: "sin empezar" for r in falta}
    statuses.update({r[0]: "adaptador" for r in adaptador})
    statuses.update({r[0]: "casi completo" for r in casi})
    statuses.update({r[0]: "parcial" for r in parcial})
    parts += ["## 1. Archivos con huecos de implementación, de menos a más C sin cubrir", "",
              "Orden sugerido por la estimación de líneas C aún no cubiertas; no mide fidelidad ni dificultad real.", "",
              ordered_table(pendientes, statuses), "",
              f"Total: {len(pendientes)} archivos con huecos: {len(falta)} sin empezar, {len(adaptador)} adaptador, {len(casi)} casi completos y {len(parcial)} parciales.", "",
              "## 3b. Funciones stub (nombre del C con cuerpo vacío o `return 0;`)", "",
              "No cuentan como portadas. Hay que escribir su cuerpo desde el C o borrarlas.", "",
              "| Archivo C | Líneas | Portadas | Stubs |", "|---|---:|---:|---:|"]
    parts += [f"| `{f}` | {l} | {d}/{t} | {n} |" for f, l, d, t, n in stub_rows()]
    parts += ["",
              "## 3c. Portado pero sin conectar al juego", "",
              "| Archivo C | TS | Motivo |", "|---|---|---|"]
    parts += [f"| `{a}` | `{b}` | {c} |" for a, b, c in UNWIRED]
    parts += ["",
              "## 4. Huecos conocidos que el conteo no muestra", ""]
    parts += [f"- {g}" for g in KNOWN_GAPS]
    parts += ["", "## 5. Portado pero sin probar en navegador", "",
              "Verificado solo con `check:port`, `build`, paridad de cdata/incbin/textos o checks headless de estado:", ""]
    parts += [f"- {a} → `{b}`" for a, b in UNTESTED]
    parts += ["", "## 6. Fase final (después de portar)", "",
              "1. Probar en navegador cada pantalla de la sección 5 y las portadas antes (`window.frDebug`, `?fr=new`/`?fr=continue`).",
              "2. Recorrido zona por zona de Kanto y Sevii contra el C/emulador (eventos, specials con valores fijos, entrenadores, capturas, Safari).",
              "3. Guardados de regresión por zona y checks headless por sistema en `tools/checks/`.",
              "4. Decisión de diseño postgame (tickets de Mew/Deoxys)."]
    (ROOT / "PENDING.md").write_text("\n".join(parts) + "\n")
    print(f"PENDING.md: {len(falta)} sin empezar, {len(adaptador)} adaptadores, {len(casi)} casi completos, {len(parcial)} parciales")


if __name__ == "__main__":
    main()
