// Menu/Lobby/Result are plain DOM overlays on top of the persistent Three.js
// canvas (which just freezes on its last frame while they're shown) — same
// markup/CSS/logic the old Phaser DOM Elements used, just mounted directly.
export function createOverlay(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.inset = "0";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.background = "radial-gradient(120% 120% at 20% 0%, #16233b 0%, #0d1526 45%, #0a0f1c 100%)";
  el.style.zIndex = "10";
  document.body.appendChild(el);
  return el;
}

export function removeOverlay(el: HTMLDivElement) {
  el.remove();
}
