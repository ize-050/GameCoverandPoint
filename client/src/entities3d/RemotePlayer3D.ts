import * as THREE from "three";
import { Character3D } from "./Character3D";
import type { CharacterAppearance } from "../../../shared/messages";

const LERP_FACTOR = 0.25;

// Renders whatever position the server sends — no seeker/hider special-casing
// needed client-side: the schema @filter already stops a seeker's client from
// ever receiving a hidden hider's true coordinates, so this class just naively
// interpolates toward the last value it was given. Full show/hide (ghosts and
// hidden hiders invisible to non-ghost viewers, per spec 2.3) is driven by
// GameScreen via setVisible, since it depends on the viewer's own state too.
export class RemotePlayer3D {
  readonly character: Character3D;
  private targetX: number;
  private targetZ: number;

  constructor(scene: THREE.Scene, x: number, y: number, nickname: string, appearance: CharacterAppearance) {
    this.character = new Character3D(appearance, nickname);
    this.character.position.set(x, 0, y);
    scene.add(this.character.group);
    this.targetX = x;
    this.targetZ = y;
  }

  setTarget(x: number, y: number) {
    this.targetX = x;
    this.targetZ = y;
  }

  setAppearance(appearance: CharacterAppearance) {
    this.character.setAppearance(appearance);
  }

  setVisible(visible: boolean) {
    this.character.setVisible(visible);
  }

  playAnimation(name: string) {
    this.character.playAnimation(name);
  }

  update(deltaSeconds: number) {
    this.character.update(deltaSeconds);
    const pos = this.character.position;
    pos.x = THREE.MathUtils.lerp(pos.x, this.targetX, LERP_FACTOR);
    pos.z = THREE.MathUtils.lerp(pos.z, this.targetZ, LERP_FACTOR);
  }

  destroy() {
    this.character.destroy();
  }
}
