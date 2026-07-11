import * as THREE from "three";

// Mechanical port helpers: Phaser's Graphics.fillStyle(hex, alpha) took a
// packed 0xRRGGBB number; native Canvas2D wants a CSS color string. Keeping
// the same 0xRRGGBB constants already tuned in the Phaser version and just
// converting them here avoids re-deriving every color by hand.
export function rgba(hex: number, alpha = 1): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d")! };
}

export function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
