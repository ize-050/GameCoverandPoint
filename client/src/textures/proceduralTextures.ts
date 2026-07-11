import * as THREE from "three";
import { rgba, makeCanvas, toTexture } from "./canvasUtil";

// Office floor tile — light speckled carpet-tile look with a subtle grid,
// same mottling technique as before (Phaser Graphics -> native Canvas2D),
// just re-themed from grass to floor tile per the office reskin. Caller sets
// wrapS/wrapT + .repeat since that depends on the ground plane's world size,
// which this function doesn't know about.
export function generateGroundTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);

  ctx.fillStyle = rgba(0xb9c2cc, 1);
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = rgba(0xa9b4c0, 0.5);
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 2 + Math.random() * 4;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = rgba(0x8b96a3, 0.8);
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

  const tex = toTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Desk surface — a laminate top with a hint of a keyboard/monitor shadow,
// maps cleanly onto a BoxGeometry top face (flat surface, no UV distortion).
export function generateDeskTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0xc9a876, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = rgba(0x9a7a4e, 1);
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  ctx.fillStyle = rgba(0x2b2f36, 0.85);
  ctx.fillRect(14, 12, 24, 16);
  ctx.fillStyle = rgba(0x5c6773, 0.6);
  ctx.fillRect(16, 14, 20, 12);
  ctx.fillStyle = rgba(0xffffff, 0.1);
  ctx.fillRect(4, 4, size - 8, 6);
  return toTexture(canvas);
}

// Filing cabinet — drawer bands + handles, maps onto a BoxGeometry face.
export function generateCabinetTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0x8a95a3, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = rgba(0x555f6b, 1);
  ctx.lineWidth = 3;
  for (const yy of [size * 0.34, size * 0.67]) {
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(size, yy);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(0x3d454f, 0.9);
  for (const yy of [size * 0.17, size * 0.5, size * 0.83]) {
    ctx.fillRect(size / 2 - 8, yy - 2, 16, 4);
  }
  ctx.fillStyle = rgba(0xffffff, 0.1);
  ctx.fillRect(0, 0, size * 0.15, size);
  return toTexture(canvas);
}

// Server rack — dark tower face with rows of blinking status LEDs, maps
// onto a BoxGeometry face. The strongest "this is the server room" read.
export function generateServerRackTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0x14181f, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = rgba(0x2a323d, 1);
  ctx.lineWidth = 2;
  for (let row = 0; row < 6; row++) {
    const yy = 6 + row * 9;
    ctx.beginPath();
    ctx.moveTo(2, yy + 6);
    ctx.lineTo(size - 2, yy + 6);
    ctx.stroke();
    for (let led = 0; led < 4; led++) {
      const on = Math.random() > 0.35;
      ctx.fillStyle = on ? rgba(0x4ade80, 0.95) : rgba(0xef4444, 0.85);
      ctx.fillRect(6 + led * 8, yy, 4, 4);
    }
  }
  return toTexture(canvas);
}

// Chibi face — eyes/pupils/sparkle-highlight/blush/smile. Transparent
// background; applied to a camera-facing billboard sprite on top of the 3D
// head. Character art, unrelated to the map theme — unchanged by the reskin.
export function generateFaceTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(34, 28);

  ctx.fillStyle = rgba(0xffffff, 1);
  ctx.beginPath();
  ctx.ellipse(10, 13, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(24, 13, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = rgba(0x241a12, 1);
  ctx.beginPath();
  ctx.arc(10.5, 14, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(24.5, 14, 4.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = rgba(0xffffff, 0.95);
  ctx.beginPath();
  ctx.arc(8.7, 11.5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(22.7, 11.5, 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = rgba(0xff8fa3, 0.45);
  ctx.beginPath();
  ctx.ellipse(4, 20, 3, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(30, 20, 3, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rgba(0x241a12, 0.8);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(17, 21, 3.2, (20 * Math.PI) / 180, (160 * Math.PI) / 180);
  ctx.stroke();

  return toTexture(canvas);
}

// Purely cosmetic decoration billboards — office props scattered on the
// cubicle floor for visual density between furniture.
export function generatePlantSmallTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(14, 16);
  ctx.fillStyle = rgba(0x8a6a4a, 1);
  ctx.fillRect(4, 11, 6, 4);
  ctx.fillStyle = rgba(0x3f7a34, 1);
  ctx.beginPath();
  ctx.arc(7, 6, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(0x4caf50, 0.9);
  ctx.beginPath();
  ctx.arc(5, 4, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(9.5, 5, 2.4, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas);
}

export function generatePapersTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(14, 14);
  ctx.fillStyle = rgba(0xf4f4f0, 0.95);
  ctx.fillRect(2, 4, 10, 9);
  ctx.fillRect(1, 2, 10, 9);
  ctx.strokeStyle = rgba(0xc7c7bd, 0.9);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(2.5, 4 + i * 2);
    ctx.lineTo(9.5, 4 + i * 2);
    ctx.stroke();
  }
  return toTexture(canvas);
}

// Room props — one per real room, giving each its own physical identity and
// (from Stage 3/4 onward) an anchor for that room's gimmick. Same
// 64px-canvas-onto-BoxGeometry technique as the desk/cabinet/server-rack
// cover points above.
export function generateWhiteboardTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0xe8ebef, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = rgba(0x9aa3ad, 1);
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  // Scribbled brainstorm diagram — a box, an arrow, a couple of bullet
  // dashes — reads as "meeting room" from across the map.
  ctx.strokeStyle = rgba(0x2563eb, 0.85);
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, 16, 10);
  ctx.beginPath();
  ctx.moveTo(28, 15);
  ctx.lineTo(44, 15);
  ctx.moveTo(40, 11);
  ctx.lineTo(44, 15);
  ctx.lineTo(40, 19);
  ctx.stroke();
  ctx.strokeStyle = rgba(0xef4444, 0.8);
  for (const yy of [32, 40, 48]) {
    ctx.beginPath();
    ctx.moveTo(10, yy);
    ctx.lineTo(30, yy);
    ctx.stroke();
  }
  return toTexture(canvas);
}

export function generateCoffeeMachineTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0x2b2f36, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = rgba(0x1a1d22, 1);
  ctx.fillRect(8, 6, size - 16, 20);
  ctx.fillStyle = rgba(0xf59e0b, 0.9);
  ctx.beginPath();
  ctx.arc(size / 2, 16, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(0x5c453a, 1);
  ctx.fillRect(14, 34, size - 28, 22);
  ctx.fillStyle = rgba(0x8a6a4a, 0.9);
  ctx.fillRect(18, 38, size - 36, 6);
  return toTexture(canvas);
}

export function generateMonitorTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0x14181f, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = rgba(0x22d3ee, 0.8);
  ctx.fillRect(6, 6, size - 12, size - 20);
  ctx.strokeStyle = rgba(0x0e7490, 0.9);
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(6, 6 + ((size - 20) * i) / 4);
    ctx.lineTo(size - 6, 6 + ((size - 20) * i) / 4);
    ctx.stroke();
  }
  return toTexture(canvas);
}

export function generateLightSwitchTexture(): THREE.CanvasTexture {
  const size = 24;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0xe8ebef, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = rgba(0xaab1ba, 1);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.fillStyle = rgba(0xfbbf24, 0.95);
  ctx.fillRect(size / 2 - 3, size / 2 - 6, 6, 12);
  return toTexture(canvas);
}

// Desk TOP face only (mapped via a materials array so it's distinct from the
// plain side faces) — wood grain plus a keyboard + mouse decal, so a desk
// reads as an actual workstation from directly above instead of the old
// single-texture-on-every-face box (which is what made desks look flat/fake
// from an isometric angle — the decal used to smear across the side faces
// too). Higher-res than the 64px furniture textures since it's viewed close.
export function generateDeskTopTexture(): THREE.CanvasTexture {
  const size = 96;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0xc9a876, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = rgba(0xb08c5e, 0.5);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const y = 8 + i * 15;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + 4, size * 0.7, y - 4, size, y);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(0x9a7a4e, 1);
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  // mouse pad (drawn first so the mouse sits on top of it)
  ctx.fillStyle = rgba(0x334155, 0.3);
  ctx.fillRect(size * 0.6, size * 0.52, size * 0.2, size * 0.26);

  // keyboard
  ctx.fillStyle = rgba(0x1f2937, 0.92);
  ctx.fillRect(size * 0.16, size * 0.56, size * 0.4, size * 0.18);
  ctx.strokeStyle = rgba(0x0a0f1c, 0.6);
  ctx.lineWidth = 1;
  for (let col = 0; col < 8; col++) {
    ctx.strokeRect(size * 0.16 + (col * (size * 0.4)) / 8, size * 0.56, (size * 0.4) / 8 - 1, size * 0.18);
  }

  // mouse
  ctx.fillStyle = rgba(0x1f2937, 0.9);
  ctx.beginPath();
  ctx.ellipse(size * 0.7, size * 0.65, size * 0.045, size * 0.065, 0, 0, Math.PI * 2);
  ctx.fill();

  return toTexture(canvas);
}

// Storage shelving — a wood/metal frame with colored boxes stacked on each
// shelf band, reads as "cluttered storage" at a glance.
export function generateShelfTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0x6b5a45, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = rgba(0x453a2d, 1);
  ctx.lineWidth = 2;
  for (const yy of [size * 0.34, size * 0.67]) {
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(size, yy);
    ctx.stroke();
  }
  const boxColors = [0xd9a441, 0xc97a3f, 0xb5651d];
  [0, 1, 2].forEach((row) => {
    ctx.fillStyle = rgba(boxColors[row], 0.9);
    ctx.fillRect(6 + row * 4, row * (size * 0.33) + 4, 20, size * 0.26);
    ctx.strokeStyle = rgba(0x5c3d1a, 0.7);
    ctx.strokeRect(6 + row * 4, row * (size * 0.33) + 4, 20, size * 0.26);
  });
  return toTexture(canvas);
}

// Reception sofa — a two/three-seat cushion pattern in a warm fabric blue.
export function generateSofaTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0x3b5b7a, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = rgba(0x274257, 1);
  ctx.lineWidth = 2;
  for (const xx of [size * 0.33, size * 0.67]) {
    ctx.beginPath();
    ctx.moveTo(xx, 0);
    ctx.lineTo(xx, size);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(0xffffff, 0.08);
  ctx.fillRect(0, 0, size, size * 0.12);
  return toTexture(canvas);
}

// Bathroom stall partition — a plain panel with a slide-lock indicator.
export function generateStallTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0x8a97a3, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = rgba(0x5c6773, 1);
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  ctx.fillStyle = rgba(0xfbbf24, 0.85);
  ctx.fillRect(size * 0.42, size * 0.46, size * 0.16, size * 0.08);
  return toTexture(canvas);
}

// Bathroom sink — basin + faucet.
export function generateSinkTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0xf1f5f9, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = rgba(0xcbd5e1, 0.9);
  ctx.beginPath();
  ctx.ellipse(size / 2, size * 0.55, size * 0.32, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(0x94a3b8, 1);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = rgba(0x64748b, 0.9);
  ctx.fillRect(size * 0.46, size * 0.15, size * 0.08, size * 0.25);
  return toTexture(canvas);
}

// Bathroom mirror — cool-toned gradient with a frame + a glare streak.
export function generateMirrorTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, rgba(0xcbe8f7, 0.9));
  grad.addColorStop(1, rgba(0x8fb8cc, 0.9));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = rgba(0x6b7280, 1);
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  ctx.strokeStyle = rgba(0xffffff, 0.5);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(size * 0.2, size * 0.1);
  ctx.lineTo(size * 0.5, size * 0.6);
  ctx.stroke();
  return toTexture(canvas);
}

// Reception desk/counter — dark counter body with a cyan accent stripe.
export function generateReceptionDeskTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = rgba(0x3b3f46, 1);
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = rgba(0x22d3ee, 0.85);
  ctx.fillRect(0, size * 0.7, size, size * 0.12);
  ctx.fillStyle = rgba(0xffffff, 0.08);
  ctx.fillRect(0, 0, size, size * 0.15);
  return toTexture(canvas);
}
