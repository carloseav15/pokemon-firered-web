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
    ("shop.c + buy_menu_helpers.c (+ event_object_movement.c parcial)", "shop.ts, buyMenuHelpers.ts, objectEventGraphics.ts"),
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
    ("(registros BG)", "hw/bgRegs.ts", "solo lo lee InitOverworldGraphicsRegisters (registros GBA) y link.c"),
]

# Known functional gaps that the per-function count does not show.
KNOWN_GAPS = [
    "Easy Chat: escribir cartas conectado (`partyMenu.ts` → `fieldMenus.writeMail` → `DoEasyChatScreen` de `easy_chat_2.c`, con `CommitECWords` escribiendo en `save.mail`); editor sin probar en navegador.",
    "Intercambios de NPC: `pokemon/ingameTrade.ts` porta la animación; `SpriteCB_BouncingPokeball` se comparó con C y `check:trade` valida el rebote y el ciclo de escena. `GetInGameTradeMail` se adapta como `attachTradeMail`; animación pendiente de revisión visual en navegador. De `trade.c` solo hay stubs de la parte de enlace.",
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
    "Clima: `field/weather.ts` porta tablas, aplicación/mezcla gamma, hooks BG/OBJ, dispatcher, fundidos, oscurecimiento de paletas de quest log y la máquina de gamma de sequía; en FRLG `LoadDroughtWeatherPalette` es no-op y `Drought_Main` se atasca en el paso 2. La conexión a Canvas2D sigue pendiente.",
    "Huecos de caller individual revisados: `quest_log.c` conserva helpers de punteros/layout GBA y callback de objeto sustituido por el driver web; `event_object_movement.c` mantiene la cámara, reflexiones, plantillas de hardware y helpers sin caller detrás del render Canvas; `field_effect.c` conserva el VM GBA y la gestión de tiles/paletas, mientras el renderer web posee los recursos de imagen.",
    "Créditos: las escenas de mapa no ejecutan NPCs, clima ni animación de tilesets.",
    "Audio fino (`m4a*.c`): cry usa WAV con pitch, duración, reverse, volumen y pan configurados; chorus/ADSR no reproducen el sintetizador M4A, la prioridad no arbitra cuatro voces y siguen faltando reverb/duty/sweep/keysplit.",
    "Guardado desde scripts de campo (`Field_AskSaveTheGame`): confirmación, cancelación, escritura y retorno del resultado del script ya están conectados; flujo pendiente de revisión en navegador.",
    "Quest Log: el playback restaura flags/vars, rematches, party/cajas, objetos y layout; las cargas normal/warp usan el driver escalonado de C, avanzan escenas y restauran el save. El retorno al mapa guardado está conectado; faltan validar ese retorno y la reproducción/UI en navegador.",
    "Party menu: retorno desde la selección del Pokémon conectado a fade y espera de clima como en `CB2_FadeFromPartyMenu`/`Task_PartyMenuWaitForFade`; validación de pantalla pendiente en navegador.",
    "Trainer Tower: `trainer_tower.c` queda en 43/43 nombres y conectado al dispatcher de scripts y al ciclo de recursos de batalla; gameplay/navegador siguen pendientes de revisión.",
    "Uso de objetos (`item_use.c`): dispatch Enigma, rechazo de Oak, consumo/mensaje común de Repel, Escape Rope y Poké Doll, flautas, cañas, Item Finder, TM Case, Berry Pouch, Mail, Bike y la secuencia de potenciadores de combate están conectados. El helper registra eventos en el buffer de escena (`questLogEventBuffer.ts`) y la carga/reproducción de esos eventos existe (`LoadEvent_UsedItem` y `QuestLog_PlayCurrentEvent`); sin probar en navegador.",
    "Barrido de candidatos (2026-09-28): `item_menu.c` conserva Teachy TV Catching/Status sin ruta conectada y `Task_UnusedReturnToBag` no tiene caller; `main.c` conserva solo inicialización/interrupciones de GBA ya adaptadas o sin equivalente de navegador; `sprite.c` CopyFrom/ToSprites copia el layout crudo de Sprite y no tiene callers; `battle_setup.c` PokéDude no tiene caller; los huecos de `battle_bg.c` y `evolution_scene.c` son de enlace/intercambio.",
    "Bloqueo de tanda (2026-09-28): los cinco `Debug_NamingScreen*` restantes son funciones estáticas sin callers en `naming_screen.c`; los últimos huecos de `field_control_avatar.c` son interacciones de jugadores de enlace y `SetCableClubWarp` es solo Cable Club, fuera de la meta principal.",
    "Menú de guardado (`start_menu.c`): `SaveQuestLogData` cierra y ordena escenas. La restauración y el playback del Quest Log ya están conectados; la pantalla final y la revisión de fidelidad del flujo siguen pendientes.",
    "Summary Pokémon: la ruta activa preserva ranuras vacías de caja, filtra especie/huevo según la página y porta navegación de party individual, selección/cambio de movimiento, transición de páginas y callback dummy del retrato. Los seek de party multi son de enlace; quedan seis nombres por caller ausente o alcance LINK. El recorrido de caja/resumen aún no se ha validado en navegador.",
    "pokemon.c (2026-09-29): 135/140; los cinco huecos son de enlace (`GetLinkTrainerFlankId`, `GetBattlerMultiplayerId`, `GetUnionRoomTrainerPic`, `GetUnionRoomTrainerClass`) y `GetTrainerPartnerName`, que necesita `GetMultiplayerId` de `link.c`. Sin caller tampoco en el C: `CreateSecretBaseEnemyParty`, `DrawSpindaSpotsUnused`, `GetMonFlavorRelation`, `EncryptBoxMon`/`DecryptBoxMon`/`CalculateBoxMonChecksum`/`GetSubstruct`; `RandomlyGivePartyPokerus`/`UpdatePartyPokerusTime`/`PartySpreadPokerus` son no-op porque el cuerpo C también lo es (comentario de RS en `pokemon.c:5608`). Sin cablear en la ruta TS: `SetDeoxysStats` (sus dos callers C son de `battle_main.c` en enlace) y `SpeciesToCryId` (su caller C es `PlayCryInternal` en `sound.c:476`, mientras `audio/sound.ts` manda la especie a la tabla WAV `cries.json` sin pasar por ella).",
    "text.c (2026-09-29): 37/37 con `GetStringWidth`/`GetStringWidthFixedWidthFont`, las familias `FontFunc_*`, `TextPrinter*`, `GetGlyphWidth_*` y `DecompressGlyph_*`, `RenderText` y los iconos de keypad en `gba/font.ts`/`gba/textPrinter.ts`. Las ramas japonesas y el relleno de `glyphId == 0` con los colores del printer están portadas pero no se ejercitan (la ruta TS corre en latín); `FONT_BOLD` (fontId 7) no tiene `fontFunction` en el C y TS lanza si se pinta con él, sin llamadores; con un placeholder dinámico inexistente `GetStringWidth` mide en vez de leer el puntero nulo que el C desreferenciaría. Paridad headless: `DecompressGlyph_*` coincide con los PNG exportados en 6 fuentes x 512 glifos y las anchuras de `text.c` con `fonts.json`; `check:arrow` y `check:braille` pasan (ambos necesitaban `setupNodeGbaMock.ts`); sin prueba en navegador.",
    "battle_records.c (2026-09-29): 31/31 en `battleRecords.ts` con la pantalla HwScene, el save `SaveBlock2.linkBattleRecords` (`save.ts` con backfill) y `gTrainerCards` (`menus/trainerCard.ts`); el especial `ShowBattleRecords` sustituye al adaptador y `ClearPlayerLinkBattleRecords` corre en `NewGameInitData`. `UpdatePlayerLinkBattleRecords` solo lo llama `cable_club.c` `CB2_ReturnFromCableClubBattle`, sin portar (9/54), así que la actualización de récords no se dispara por ninguna ruta viva; el lado `ShowTrainerCardInLink` de `gTrainerCards` sigue pendiente en `trainer_card.c` (66/73). Check focalizado temporal (backfill, borrado, alta/evicción/orden/prefijo japonés, apertura de pantalla, A y salida) pasó y se borró; sin prueba en navegador.",
    "battle_tower.c (2026-09-29): 45/45 nombres; los datos C de `sBattleTowerTrainers` y las clases/gráficos de jugador están vacíos en FireRed. La ruta e-Reader de Seven Island usa el save, greeting, nombres, sprites, flags de batalla y resultado, pero depende de un registro externo válido que el flujo web de e-Reader no produce; circuito Tower normal y flujo e-Reader sin validar en navegador.",
    "Checks headless (2026-10-01): `sText_100` de `battle_tower.c` se codificaba en ámbito de módulo, de modo que cualquier entrada que importara la cadena de batalla chocaba con `rom.charmap` antes de cargarla; ahora es perezoso y 18 checks que fallaban con `chars` pasan. Quedan 12 con fallos propios (datos que el check no registra, imports sin export y aserciones): lista y pasos en `TAREAS-FINALES.md` §1.11.",
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
                  f"- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **{done}/{allf} ({100 * done / allf:.1f} %)**.",
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
