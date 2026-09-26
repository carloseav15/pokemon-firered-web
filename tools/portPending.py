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
]

# Ported modules that nothing in the game imports yet (dead until wired).
UNWIRED = [
    ("teachy_tv.c", "teachyTv.ts", "el juego abre la lista de texto de `menus/keyItemScreens.ts`"),
    ("field_effect_helpers.c", "field/fieldEffectHelpers.ts", "los efectos reales siguen en `field/fieldEffects.ts`"),
    ("save_failed_screen.c", "saveFailedScreen.ts", "ningún fallo de guardado la abre"),
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
    "Almacenamiento de cajas con listas en vez de la interfaz real (`pokemon_storage_system_tasks.c`, `_graphics.c`, `_misc.c`, `_data.c`).",
    "Teachy TV: sigue siendo el adaptador de texto de `menus/keyItemScreens.ts`; `teachyTv.ts` tiene 30 stubs y no está conectado.",
    "Fame Checker: `fameChecker.ts` está conectado pero sus funciones de gráficos (ventanas, flechas, info box) son stubs.",
    "Transiciones de combate: 12 efectos de las tablas salvaje/entrenador dibujados sobre una instantánea del canvas; faltan las mugshots (Alto Mando/Campeón) y el resto de `battle_transition.c`.",
    "Pantalla de nombres: solo 4/109 funciones (`naming_screen.c`).",
    "Efectos de campo: `field_effect_helpers.c` son stubs (ver tabla de stubs); `field_effect.c` parcial.",
    "Clima: `field/weather.ts` porta tablas, aplicación/mezcla gamma, hooks BG/OBJ, dispatcher, fundidos, oscurecimiento de paletas de quest log y la máquina de gamma de sequía; en FRLG `LoadDroughtWeatherPalette` es no-op y `Drought_Main` se atasca en el paso 2. La conexión a Canvas2D sigue pendiente.",
    "`scrcmd.c` y `event_object_movement.c`: el intérprete de scripts y el movimiento de objetos usan la capa de campo antigua (nombres propios).",
    "Créditos: las escenas de mapa no ejecutan NPCs, clima ni animación de tilesets.",
    "Audio fino (`m4a*.c`): reverb, ADSR exacto, duty/sweep, keysplit, paneo.",
    "Quest Log, sistema de ayuda y todo el hardware de enlace están fuera de alcance por decisión.",
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
    rows = sorted(rows, key=missing, reverse=True)
    if limit:
        rows = rows[:limit]
    out = ["| Archivo C | Líneas | Funciones | Líneas sin cubrir (est.) | Nota |", "|---|---:|---:|---:|---|"]
    for r in rows:
        out.append(f"| `{r[0]}` | {r[1]} | {r[2]}/{r[3]} | ~{missing(r)} | {r[4]} |")
    return "\n".join(out)


def main() -> None:
    falta = section("Falta")
    adaptador = section("Adaptador")
    parcial = section("Parcial")
    total = re.search(r"\*\*Total en alcance\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)/(\d+)\*\*", SRC)
    pend = re.search(r"\*\*Pendiente de portar\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\*", SRC)
    parts = ["# Faltantes del port (generado)", "",
             "Generado por `tools/portPending.py` (`npm run pending`) a partir de [PORT-INVENTORY.md](PORT-INVENTORY.md); no editar a mano.",
             "Las listas de \"pruebas\" y \"huecos conocidos\" salen del script.", ""]
    if total and pend:
        done, allf = int(total.group(3)), int(total.group(4))
        parts += ["## Avance", "",
                  f"- Funciones con homólogo del mismo nombre en `src/fr` (en alcance): **{done}/{allf} ({100 * done // allf} %)**.",
                  f"- Archivos C pendientes: **{pend.group(1)}** ({pend.group(2)} líneas de C).",
                  "- Es un indicador de nombres, no de fidelidad: las funciones stub no cuentan (sección 3b) y **no incluye la fase de pruebas en navegador** (sección 5).", ""]
    parts += ["## 1. Sin empezar (0 funciones portadas)", "", table(falta), "",
              "## 2. Adaptadores (UI simplificada; hay que portar la pantalla real)", "", table(adaptador), "",
              "## 3. Parciales con más C sin cubrir (top 40)", "", table(parcial, 40), "",
              f"Hay {len(parcial)} archivos parciales en total; la lista completa está en [PORT-INVENTORY.md](PORT-INVENTORY.md).", "",
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
    print(f"PENDING.md: {len(falta)} sin empezar, {len(adaptador)} adaptadores, {len(parcial)} parciales")


if __name__ == "__main__":
    main()
