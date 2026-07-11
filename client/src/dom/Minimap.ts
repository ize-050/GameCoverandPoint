import { ROOMS, ROOM_VISUALS } from "../../../shared/mapLayout";
import { MAP_WIDTH, MAP_HEIGHT } from "../../../shared/mapConfig";
import type { RemotePlayer3D } from "../entities3d/RemotePlayer3D";
import { MISSION_POOL } from "../../../shared/missions";
import { ROOM_PROPS } from "../../../shared/mapLayout";

// 4:3 matches MAP_WIDTH:MAP_HEIGHT (3200:2400) exactly, so the schematic
// isn't stretched at either size.
const COLLAPSED_SIZE = { w: 160, h: 120 };
const EXPANDED_SIZE = { w: 640, h: 480 };

// Canvas-based schematic overlay, small in a corner by default, "M" toggles
// a larger centered view. Draws only what this client is already allowed to
// see — remote player dots reuse `RemotePlayer3D`'s existing `.visible` flag
// (the same anti-cheat-respecting value `GameScreen.updateRemoteVisibility`
// already computed), no new visibility logic needed here.
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private backdrop: HTMLDivElement;
  private expanded = false;

  constructor() {
    this.backdrop = document.createElement("div");
    this.backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.55);display:none;z-index:6;";
    document.body.appendChild(this.backdrop);

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:fixed;z-index:7;border-radius:10px;border:2px solid rgba(255,255,255,0.35);background:#141a24;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.35);";
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.title = "คลิกเพื่อขยาย/ย่อแผนที่ (M)";
    this.canvas.addEventListener("click", this.toggle);
    this.backdrop.addEventListener("click", this.collapse);

    this.applyLayout();
  }

  toggle = () => {
    this.expanded = !this.expanded;
    this.applyLayout();
  };

  private collapse = () => {
    if (!this.expanded) return;
    this.expanded = false;
    this.applyLayout();
  };

  private applyLayout() {
    const size = this.expanded ? EXPANDED_SIZE : COLLAPSED_SIZE;
    this.canvas.width = size.w;
    this.canvas.height = size.h;
    if (this.expanded) {
      this.canvas.style.top = "50%";
      this.canvas.style.left = "50%";
      this.canvas.style.right = "";
      this.canvas.style.transform = "translate(-50%, -50%)";
    } else {
      this.canvas.style.top = "70px";
      this.canvas.style.right = "24px";
      this.canvas.style.left = "";
      this.canvas.style.transform = "";
    }
    this.backdrop.style.display = this.expanded ? "block" : "none";
  }

  destroy() {
    this.canvas.remove();
    this.backdrop.remove();
  }

  render(localPos: { x: number; z: number }, remotes: Map<string, RemotePlayer3D>, missions?: Map<string, boolean>) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const scaleX = width / MAP_WIDTH;
    const scaleY = height / MAP_HEIGHT;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#141a24";
    ctx.fillRect(0, 0, width, height);

    ROOMS.forEach((room) => {
      const rx = room.x * scaleX;
      const ry = room.y * scaleY;
      const rw = room.w * scaleX;
      const rh = room.h * scaleY;
      ctx.fillStyle = "rgba(148,163,184,0.25)";
      ctx.fillStyle = ROOM_VISUALS[room.id]?.minimap ?? "rgba(148,163,184,0.25)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = "rgba(148,163,184,0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry, rw, rh);

      if (this.expanded) {
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(room.name, rx + rw / 2, ry + rh / 2);
      }
    });

    if (missions) {
      missions.forEach((completed, missionId) => {
        if (completed) return;
        const mission = MISSION_POOL.find((candidate) => candidate.id === missionId);
        const prop = mission ? ROOM_PROPS.find((candidate) => candidate.id === mission.propId) : undefined;
        if (!prop) return;
        const x = prop.x * scaleX;
        const y = prop.y * scaleY;
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.moveTo(x, y - (this.expanded ? 7 : 4));
        ctx.lineTo(x + (this.expanded ? 7 : 4), y);
        ctx.lineTo(x, y + (this.expanded ? 7 : 4));
        ctx.lineTo(x - (this.expanded ? 7 : 4), y);
        ctx.closePath();
        ctx.fill();
      });
    }

    ctx.fillStyle = "#38bdf8";
    remotes.forEach((remote) => {
      if (!remote.character.group.visible) return;
      const pos = remote.character.position;
      ctx.beginPath();
      ctx.arc(pos.x * scaleX, pos.z * scaleY, this.expanded ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(localPos.x * scaleX, localPos.z * scaleY, this.expanded ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
