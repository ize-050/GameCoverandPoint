import { makeCanvas, toTexture } from "./canvasUtil";
import * as THREE from "three";

// Floating nickname — a small canvas-rendered label used as a billboard
// sprite above each character (simpler than DOM-projecting 3D->2D each frame).
export function createNameTexture(nickname: string): { texture: THREE.CanvasTexture; width: number; height: number } {
  const fontSize = 22;
  const paddingX = 10;
  const { ctx: measureCtx } = makeCanvas(1, 1);
  measureCtx.font = `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  const textWidth = measureCtx.measureText(nickname).width;

  const width = Math.ceil(textWidth + paddingX * 2);
  const height = fontSize + 14;
  const { canvas, ctx } = makeCanvas(width, height);

  ctx.font = `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(nickname, width / 2, height / 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(nickname, width / 2, height / 2);

  return { texture: toTexture(canvas), width: width / 4, height: height / 4 };
}
