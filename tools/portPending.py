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
]

# Known functional gaps that the per-function count does not show.
KNOWN_GAPS = [
    "Easy Chat: escribir cartas (`easy_chat*.c`); hoy las cartas quedan en blanco.",
    "Intercambios en juego sin escena (`trade.c`, `trade_scene.c`).",
    "Almacenamiento de cajas con listas en vez de la interfaz real (`pokemon_storage_system_*.c`).",
    "Fame Checker y Teachy TV son adaptadores de texto (`fame_checker.c`, `teachy_tv.c`, `battle_controller_pokedude.c`).",
    "Tragaperras sin gráficos (`slot_machine.c`).",
    "Sin transiciones de combate (`battle_transition.c`) ni `image_processing_effects.c`.",
    "Animaciones de ataques restantes (`battle_anim_*.c`, ~30 000 líneas).",
    "Pantalla de nombres: solo 4/109 funciones (`naming_screen.c`).",
    "Clima y efectos de campo parciales (`field_weather*.c`, `field_effect*.c`, `field_effect_helpers.c`).",
    "`scrcmd.c` y `event_object_movement.c`: el intérprete de scripts y el movimiento de objetos usan la capa de campo antigua (nombres propios).",
    "Créditos: las escenas de mapa no ejecutan NPCs, clima ni animación de tilesets.",
    "Audio fino (`m4a*.c`): reverb, ADSR exacto, duty/sweep, keysplit, paneo.",
    "Quest Log, sistema de ayuda y todo el hardware de enlace están fuera de alcance por decisión.",
]


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
                  "- Es un indicador de nombres, no de fidelidad, y **no incluye la fase de pruebas en navegador** (ninguna pantalla nueva se ha ejecutado aún).", ""]
    parts += ["## 1. Sin empezar (0 funciones portadas)", "", table(falta), "",
              "## 2. Adaptadores (UI simplificada; hay que portar la pantalla real)", "", table(adaptador), "",
              "## 3. Parciales con más C sin cubrir (top 40)", "", table(parcial, 40), "",
              f"Hay {len(parcial)} archivos parciales en total; la lista completa está en [PORT-INVENTORY.md](PORT-INVENTORY.md).", "",
              "## 4. Huecos conocidos que el conteo no muestra", ""]
    parts += [f"- {g}" for g in KNOWN_GAPS]
    parts += ["", "## 5. Portado pero sin probar en navegador", "",
              "Verificado solo con `check:port`, `build` y paridad de cdata/incbin/textos:", ""]
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
