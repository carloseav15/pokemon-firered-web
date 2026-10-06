const POPOVER_MARGIN = 8;
const NATIVE = "popover" in HTMLElement.prototype;

function isOpen(menu: HTMLElement): boolean {
  if (NATIVE) return menu.matches(":popover-open");
  return menu.classList.contains("popover-open");
}

function syncBtn(btn: HTMLElement | null, menu: HTMLElement | null): void {
  if (!btn || !menu) return;
  btn.setAttribute("aria-expanded", isOpen(menu) ? "true" : "false");
}

export function positionPopover(btn: HTMLElement, menu: HTMLElement): void {
  // Medir con el menú ya visible; si no cabe debajo, situar arriba o con scroll interno.
  const rect = btn.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const maxH = Math.max(120, window.innerHeight - 2 * POPOVER_MARGIN);
  menu.style.maxHeight = `${maxH}px`;
  menu.style.overflowY = "auto";
  const h = Math.min(menuRect.height || maxH, maxH);

  let top = rect.bottom + 6;
  if (top + h + POPOVER_MARGIN > window.innerHeight) {
    top = Math.max(POPOVER_MARGIN, rect.top - h - 6);
  }
  menu.style.top = `${Math.max(POPOVER_MARGIN, top)}px`;

  if (menu.id === "overflow-menu") {
    menu.style.right = `${Math.max(POPOVER_MARGIN, window.innerWidth - rect.right)}px`;
    menu.style.left = "auto";
  } else {
    const left = Math.min(rect.left, window.innerWidth - menuRect.width - POPOVER_MARGIN);
    menu.style.left = `${Math.max(POPOVER_MARGIN, left)}px`;
    menu.style.right = "auto";
  }
}

function repositionOpen(
  pairs: Array<{ btn: HTMLElement | null; menu: HTMLElement | null }>
): void {
  for (const { btn, menu } of pairs) {
    if (btn && menu && isOpen(menu)) positionPopover(btn, menu);
  }
}

export function setupPopovers(
  layersBtn: HTMLElement | null,
  layerBox: HTMLElement,
  overflowBtn: HTMLElement | null,
  overflowMenu: HTMLElement | null
): void {
  const pairs = [
    { btn: layersBtn, menu: layerBox as HTMLElement | null },
    { btn: overflowBtn, menu: overflowMenu },
  ];

  for (const { btn, menu } of pairs) {
    if (!btn || !menu) continue;
    btn.setAttribute("aria-controls", menu.id);
    btn.setAttribute("aria-expanded", "false");
    if (NATIVE) {
      // Cubre apertura, Esc, clic fuera y alternancia automática entre menús.
      menu.addEventListener("toggle", () => {
        if (menu.matches(":popover-open")) positionPopover(btn, menu);
        syncBtn(btn, menu);
      });
    }
  }

  if (!NATIVE) {
    const closeFallback = (btn: HTMLElement | null, menu: HTMLElement | null, refocus: boolean) => {
      if (!menu || !menu.classList.contains("popover-open")) return;
      menu.classList.remove("popover-open");
      syncBtn(btn, menu);
      if (refocus) btn?.focus();
    };

    layersBtn?.addEventListener("click", () => {
      if (!layersBtn) return;
      overflowMenu?.classList.remove("popover-open");
      syncBtn(overflowBtn, overflowMenu);
      layerBox.classList.toggle("popover-open");
      if (isOpen(layerBox)) positionPopover(layersBtn, layerBox);
      syncBtn(layersBtn, layerBox);
    });

    if (overflowBtn && overflowMenu) {
      overflowBtn.addEventListener("click", () => {
        layerBox.classList.remove("popover-open");
        syncBtn(layersBtn, layerBox);
        overflowMenu.classList.toggle("popover-open");
        if (isOpen(overflowMenu)) positionPopover(overflowBtn, overflowMenu);
        syncBtn(overflowBtn, overflowMenu);
      });
    }

    document.addEventListener("click", (e) => {
      const target = e.target as Node;
      // Clic fuera: cerrar sin robar foco al control elegido.
      if (!layerBox.contains(target) && !layersBtn?.contains(target)) {
        closeFallback(layersBtn, layerBox, false);
      }
      if (!overflowMenu?.contains(target) && !overflowBtn?.contains(target)) {
        closeFallback(overflowBtn, overflowMenu, false);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      // Cierre por Esc devuelve foco al botón.
      closeFallback(layersBtn, layerBox, true);
      closeFallback(overflowBtn, overflowMenu, true);
    });
  }

  // Reposicionar con el menú abierto ante resize, sin reabrirlo.
  window.addEventListener("resize", () => repositionOpen(pairs));
}
