import * as THREE from "three";
import type { Room } from "colyseus.js";
import { GameState } from "../schema/GameState";
import { GAME_CONFIG } from "../../../shared/gameConstants";
import { MAP_WIDTH, MAP_HEIGHT } from "../../../shared/mapConfig";
import { resolveWallSlide } from "../../../shared/mapLayout";
import type { CharacterAppearance } from "../../../shared/messages";
import { Character3D } from "./Character3D";
import { keyboard } from "../core/Keyboard";

const SEND_INTERVAL_MS = 1000 / GAME_CONFIG.MOVE_RATE_HZ;

export interface LocalMoveStatus {
  canMove: boolean;
  role: string;
  isGhost: boolean;
  speedBoosted: boolean;
  isDazed: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Movement is fully client-predicted: applied to the local Character3D
// immediately, sent to the server at MOVE_RATE_HZ, never read back from
// schema for itself (the server is authoritative for everyone ELSE's view
// of this player, but local rendering doesn't wait on a round trip).
export class LocalPlayer3D {
  readonly character: Character3D;
  private room: Room<GameState>;
  private lastSentAt = 0;

  constructor(scene: THREE.Scene, room: Room<GameState>, x: number, y: number, nickname: string, appearance: CharacterAppearance) {
    this.room = room;
    this.character = new Character3D(appearance, nickname);
    this.character.position.set(x, 0, y);
    scene.add(this.character.group);
  }

  setAppearance(appearance: CharacterAppearance) {
    this.character.setAppearance(appearance);
  }

  update(deltaMs: number, status: LocalMoveStatus) {
    this.character.update(deltaMs / 1000);
    if (!status.canMove) {
      this.character.playAnimation("idle");
      return;
    }

    let dx = 0;
    let dz = 0;
    if (keyboard.isDown("KeyA") || keyboard.isDown("ArrowLeft")) dx -= 1;
    if (keyboard.isDown("KeyD") || keyboard.isDown("ArrowRight")) dx += 1;
    if (keyboard.isDown("KeyW") || keyboard.isDown("ArrowUp")) dz -= 1;
    if (keyboard.isDown("KeyS") || keyboard.isDown("ArrowDown")) dz += 1;

    let anim = "idle";
    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      const baseSpeed = status.role === "seeker" ? GAME_CONFIG.SEEKER_SPEED : GAME_CONFIG.HIDER_SPEED;
      const speed = status.speedBoosted
        ? baseSpeed * GAME_CONFIG.COFFEE_BOOST_MULTIPLIER
        : status.isDazed
          ? baseSpeed * GAME_CONFIG.SMOKE_DAZE_SPEED_MULTIPLIER
          : baseSpeed;
      const step = (speed * deltaMs) / 1000;

      const fromX = this.character.position.x;
      const fromZ = this.character.position.z;
      const desiredX = clamp(fromX + (dx / len) * step, 0, MAP_WIDTH);
      const desiredZ = clamp(fromZ + (dz / len) * step, 0, MAP_HEIGHT);

      // resolveWallSlide operates on the shared 2D (x, y) plane — 2D "y" is
      // this world's z (depth); it's collision math only, agnostic to axis names.
      const resolved = status.isGhost
        ? { x: desiredX, y: desiredZ }
        : resolveWallSlide(fromX, fromZ, desiredX, desiredZ);

      this.character.position.x = resolved.x;
      this.character.position.z = resolved.y;
      anim = status.speedBoosted ? "sprint" : "walk";
      this.character.setFacing(dx, dz);
    }
    this.character.playAnimation(anim);

    const now = performance.now();
    if (now - this.lastSentAt >= SEND_INTERVAL_MS) {
      this.lastSentAt = now;
      this.room.send("move", { x: this.character.position.x, y: this.character.position.z, anim });
    }
  }

  destroy() {
    this.character.destroy();
  }
}
