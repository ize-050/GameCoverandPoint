import * as THREE from "three";
import { makeCanvas, rgba, toTexture } from "./canvasUtil";
import type { EmoteIconName } from "../dom/icons";

// Hand-drawn Canvas2D equivalents of the same 4 reaction icons drawn as
// inline SVG in dom/icons.ts (laugh/scared/eyes/heart), so the DOM emote
// buttons and this world-space floating sprite render the same shapes —
// no emoji font dependency, no CDN, works identically on every machine.
// Rendered per-use (not cached) since call volume is low (rate-limited to
// once per 2s per player server-side).
export function createReactionTexture(name: EmoteIconName): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(48, 48);

  if (name === "heart") {
    drawHeart(ctx, 24, 11, 30, 27, rgba(0xfb7185, 1));
    return toTexture(canvas);
  }

  const bg = name === "laugh" ? 0xfbbf24 : name === "scared" ? 0xf87171 : 0x22d3ee;
  ctx.fillStyle = rgba(bg, 0.22);
  ctx.strokeStyle = rgba(bg, 1);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(24, 24, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = rgba(bg, 1);
  ctx.fillStyle = rgba(bg, 1);
  ctx.lineCap = "round";

  if (name === "laugh") {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(13, 19);
    ctx.bezierCurveTo(15, 16.6, 19, 16.6, 21, 19);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(27, 19);
    ctx.bezierCurveTo(29, 16.6, 33, 16.6, 35, 19);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(15, 28.6);
    ctx.bezierCurveTo(18, 33.8, 30, 33.8, 33, 28.6);
    ctx.stroke();
  } else if (name === "scared") {
    ctx.beginPath();
    ctx.arc(16.6, 20, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(31.4, 20, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(24, 32, 4.4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(15.2, 24, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(32.8, 24, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(17.2, 24, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(34.8, 24, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }

  return toTexture(canvas);
}

function drawHeart(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  width: number,
  height: number,
  color: string
): void {
  const topCurveHeight = height * 0.3;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, top + topCurveHeight);
  ctx.bezierCurveTo(cx, top, cx - width / 2, top, cx - width / 2, top + topCurveHeight);
  ctx.bezierCurveTo(
    cx - width / 2,
    top + (height + topCurveHeight) / 2,
    cx,
    top + (height + topCurveHeight) / 2,
    cx,
    top + height
  );
  ctx.bezierCurveTo(
    cx,
    top + (height + topCurveHeight) / 2,
    cx + width / 2,
    top + (height + topCurveHeight) / 2,
    cx + width / 2,
    top + topCurveHeight
  );
  ctx.bezierCurveTo(cx + width / 2, top, cx, top, cx, top + topCurveHeight);
  ctx.closePath();
  ctx.fill();
}
