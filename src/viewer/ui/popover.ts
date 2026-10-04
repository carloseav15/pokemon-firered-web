export function positionPopover(btn: HTMLElement, menu: HTMLElement): void {
  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  if (menu.id === "overflow-menu") {
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.left = "auto";
  } else {
    menu.style.left = `${rect.left}px`;
    menu.style.right = "auto";
  }
}

export function setupPopovers(
  layersBtn: HTMLElement | null,
  layerBox: HTMLElement,
  overflowBtn: HTMLElement | null,
  overflowMenu: HTMLElement | null
): void {
  if (layersBtn) {
    layersBtn.addEventListener("click", () => {
      positionPopover(layersBtn, layerBox);
      if (!("popover" in HTMLElement.prototype)) {
        overflowMenu?.classList.remove("popover-open");
        layerBox.classList.toggle("popover-open");
      }
    });
  }

  if (overflowBtn && overflowMenu) {
    overflowBtn.addEventListener("click", () => {
      positionPopover(overflowBtn, overflowMenu);
      if (!("popover" in HTMLElement.prototype)) {
        layerBox.classList.remove("popover-open");
        overflowMenu.classList.toggle("popover-open");
      }
    });
  }

  if (!("popover" in HTMLElement.prototype)) {
    document.addEventListener("click", (e) => {
      const target = e.target as Node;
      if (!layerBox.contains(target) && !layersBtn?.contains(target)) {
        layerBox.classList.remove("popover-open");
      }
      if (!overflowMenu?.contains(target) && !overflowBtn?.contains(target)) {
        overflowMenu?.classList.remove("popover-open");
      }
    });
  }
}
