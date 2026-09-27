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
    ("script.c (estado de entrada Quest Log)", "script/context.ts"),
]

# Ported modules that nothing in the game imports yet (dead until wired).
UNWIRED = [
    ("teachy_tv.c", "teachyTv.ts", "el juego abre la lista de texto de `menus/keyItemScreens.ts`"),
    ("field_effect_helpers.c", "field/fieldEffectHelpers.ts", "los efectos reales siguen en `field/fieldEffects.ts`"),
    ("slot_machine.c (reglas)", "game/slots.ts", "duplicado sin uso; el juego usa `menus/slotMachine.ts`"),
    ("image_processing_effects.c", "imageProcessingEffects.ts", "sin llamador en FireRed de un jugador"),
    ("palette_util.c", "paletteUtil.ts", "sin llamador todavía"),
    ("mon_markings.c", "monMarkings.ts", "el resumen no abre el menú de marcas todavía"),
    ("cable_car_util.c", "cableCarUtil.ts", "sin llamador todavía"),
    ("tilemap_util.c", "hw/tilemapUtil.ts", "sin llamador todavía"),
    ("(registros BG)", "hw/bgRegs.ts", "sin llamador todavía"),
]

# Known functional gaps that the per-function count does not show.
KNOWN_GAPS = [
    "Easy Chat: escribir cartas (`easy_chat*.c`); hoy las cartas quedan en blanco.",
    "Intercambios: `pokemon/ingameTrade.ts` porta la escena de `trade_scene.c` (sin probar); de `trade.c` solo hay stubs de la parte de enlace.",
    "Enlace: `linkState.ts` modela estado, identidad del callback y umbrales de cola de `menu_helpers.c`, `link.c` y `overworld.c`; todavía no hay productor de comandos ni transporte cable/RFU que alimente ese estado.",
    "Combate de enlace: `battle_controllers.c` 68/68 con la ruta de buffers `LINK_BUFF_*` y las tareas de envío/recepción, pero `SetControllerToLinkOpponent`/`SetControllerToLinkPartner` (parciales en sus archivos) quedan sustituidos por `BattleControllerDummy` y `linkTransport` no envía paquetes; un enlace real no tendría controladores propios ni transporte.",
    "Almacenamiento de cajas con listas en vez de la interfaz real (`pokemon_storage_system_tasks.c`, `_graphics.c`, `_misc.c`, `_data.c`).",
    "Teachy TV: sigue siendo el adaptador de texto de `menus/keyItemScreens.ts`; `teachyTv.ts` tiene 30 stubs y no está conectado.",
    "Fame Checker: `fameChecker.ts` está conectado pero sus funciones de gráficos (ventanas, flechas, info box) son stubs.",
    "Transiciones de combate: 12 efectos de las tablas salvaje/entrenador dibujados sobre una instantánea del canvas; faltan las mugshots (Alto Mando/Campeón) y el resto de `battle_transition.c`.",
    "Visión de entrenadores: `trainer_see.c` porta la vista direccional, el chequeo de ruta, la compuerta QL_IsTrainerSightDisabled, los cinco iconos/emote, SpriteCB_TrainerIcons y la revelación enterrada con AshPuff, salto y continuación de acercamiento; falta prueba de runtime. El playback de Quest Log no está modelado por completo en Game (los campos se leen si el runtime los proporciona). Dos handlers de disfraz no se usan en FRLG y TrainerSeeFunc_Dummy es vacío en C.",
    "Save cifrado: `ApplyNewEncryptionKeyToBagItems` y su alias recorren cantidades almacenadas con XOR por la clave del SaveBlock. El save web guarda las cantidades descifradas en JSON y no modela ese layout físico GBA.",
    "Scripts RAM: `GetSavedRamScriptIfValid` aún depende de `ValidateSavedWonderCard`, cuya tarjeta Wonder no está implementada; el slot RAM y su checksum sí existen en `script/context.ts`.",
    "Pantalla de nombres: 34/109 funciones (`naming_screen.c`); reglas de entrada y buffer con nombres C, cuatro iconos de destino, transición de página y destellos de botones/cursor; quedan otras funciones de la pantalla.",
    "Efectos de campo: `field_effect_helpers.c` son stubs (ver tabla de stubs); `field_effect.c` parcial.",
    "Clima: `field/weather.ts` porta tablas, aplicación/mezcla gamma, hooks BG/OBJ, dispatcher, fundidos, oscurecimiento de paletas de quest log y la máquina de gamma de sequía; en FRLG `LoadDroughtWeatherPalette` es no-op y `Drought_Main` se atasca en el paso 2. La conexión a Canvas2D sigue pendiente.",
    "`scrcmd.c` y `event_object_movement.c`: el intérprete de scripts y el movimiento de objetos usan la capa de campo antigua (nombres propios).",
    "Créditos: las escenas de mapa no ejecutan NPCs, clima ni animación de tilesets.",
    "Audio fino (`m4a*.c`): reverb, ADSR exacto, duty/sweep, keysplit, paneo.",
    "Quest Log: el inventario incluye quest_log*.c; los eventos de tienda ya persisten en SaveData, pero faltan el buffer/serialización original, escenas, acciones y reproducción.",
    "Trainer Tower: `trainer_tower.c` y sus llamadas `InitTrainerTowerBattleStruct`/`FreeTrainerTowerBattleStruct` aún no están portadas; `battle_util2.c` tiene recursos normales cubiertos, pero ese branch queda pendiente.",
    "Uso de objetos (`item_use.c`): dispatch de baya Enigma de campo/combate, rechazo de Oak, consumo diferido de Repel hasta acabar SE, retardo de ocho frames de las flautas y espera de fanfarria de la Poké Flauta están conectados. Quest Log al usar objetos y el retardo/mensaje/botones de `BattleUseFunc_StatBooster` siguen adaptados; quedan 32/73 funciones sin homólogo.",
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
    lineas_estimadas_sin_cubrir = sum(missing(r) for r in pendientes)
    parts = ["# Faltantes del port (generado)", "",
             "Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.",
             "Las listas de \"pruebas\" y \"huecos conocidos\" salen del script.", ""]
    if total and pend:
        done, allf = int(total.group(3)), int(total.group(4))
        parts += ["## Avance", "",
                  f"- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **{done}/{allf} ({100 * done / allf:.1f} %)**.",
                  f"- Archivos C con funciones aún sin homólogo: **{pend.group(1)}**; quedan **{allf - done} nombres**.",
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
