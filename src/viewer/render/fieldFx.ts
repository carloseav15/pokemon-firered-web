export function spawnFieldFx(
  content: HTMLElement,
  xPx: number,
  yPx: number,
  type: "grass" | "dust" | "ripple" | "sand" | "tire"
): void {
  const fx = document.createElement("div");
  fx.className = "field-fx";
  fx.style.left = `${xPx}px`;

  if (type === "grass") {
    fx.style.top = `${yPx + 2}px`;
    fx.style.width = "16px";
    fx.style.height = "16px";
    fx.style.backgroundImage = "url(/fr/fieldfx/tallgrass__ette1.png)";
    fx.style.backgroundPosition = "0px 0px";
    content.appendChild(fx);
    let f = 0;
    const animInterval = setInterval(() => {
      f++;
      if (f < 5) {
        fx.style.backgroundPosition = `0px -${f * 16}px`;
      } else {
        clearInterval(animInterval);
        fx.remove();
      }
    }, 50);
  } else if (type === "dust") {
    fx.style.top = `${yPx + 8}px`;
    fx.style.width = "16px";
    fx.style.height = "8px";
    fx.style.backgroundImage = "url(/fr/fieldfx/groundimpactdust__ette0.png)";
    fx.style.backgroundPosition = "0px 0px";
    content.appendChild(fx);
    let f = 0;
    const animInterval = setInterval(() => {
      f++;
      if (f < 3) {
        fx.style.backgroundPosition = `0px -${f * 8}px`;
      } else {
        clearInterval(animInterval);
        fx.remove();
      }
    }, 60);
  } else if (type === "ripple") {
    fx.style.top = `${yPx + 4}px`;
    fx.style.width = "16px";
    fx.style.height = "16px";
    fx.style.backgroundImage = "url(/fr/fieldfx/ripple__ette1.png)";
    fx.style.backgroundPosition = "0px 0px";
    content.appendChild(fx);
    let f = 0;
    const animInterval = setInterval(() => {
      f++;
      if (f < 5) {
        fx.style.backgroundPosition = `0px -${f * 16}px`;
      } else {
        clearInterval(animInterval);
        fx.remove();
      }
    }, 70);
  } else if (type === "sand") {
    fx.style.top = `${yPx + 8}px`;
    fx.style.width = "16px";
    fx.style.height = "8px";
    fx.style.backgroundImage = "url(/fr/fieldfx/sandfootprints__ette0.png)";
    fx.style.backgroundPosition = "0px 0px";
    fx.style.opacity = "0.7";
    content.appendChild(fx);
    setTimeout(() => {
      fx.style.transition = "opacity 0.6s ease-out";
      fx.style.opacity = "0";
      setTimeout(() => fx.remove(), 600);
    }, 1200);
  } else if (type === "tire") {
    fx.style.top = `${yPx + 8}px`;
    fx.style.width = "16px";
    fx.style.height = "8px";
    fx.style.backgroundImage = "url(/fr/fieldfx/biketiretracks__ette0.png)";
    fx.style.backgroundPosition = "0px 0px";
    fx.style.opacity = "0.7";
    content.appendChild(fx);
    setTimeout(() => {
      fx.style.transition = "opacity 0.6s ease-out";
      fx.style.opacity = "0";
      setTimeout(() => fx.remove(), 600);
    }, 1200);
  }
}
