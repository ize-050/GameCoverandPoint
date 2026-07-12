import * as THREE from "three";
import type { CharacterAppearance } from "../../../shared/messages";
import { createNameTexture } from "../textures/nameplate";
import { cloneCharacter, preloadCharacterModels } from "../loaders/characterModels";

// Measured empirically (bind-pose bounding box is 1.6 x 2.7 x 0.8 units,
// feet at y=0) against this world's existing nameplate-height convention
// (~46-50 units, see NAMEPLATE_Y) — Kenney's rig isn't on the same unit
// scale as this project's other geometry, so this is tuned to look right
// here rather than derived from any "real world meters" assumption.
const MODEL_SCALE = 17;
const NAMEPLATE_Y = 50;
const CROSSFADE_SECONDS = 0.15;
// Radians/sec the character can turn — fast enough to feel responsive but
// still a smooth sweep rather than an instant snap when reversing direction.
const FACING_DAMPING = 12;
// Kenney's rig faces its local +Z by default; adjust this if a character
// visibly walks backward/sideways relative to where it's actually heading.
const FACING_OFFSET = 0;

// A model swap (variant change, or the very first frame before the async
// GLTF clone resolves) needs *some* visible geometry so a character never
// reads as literally invisible mid-load — matches the same shadow-circle
// treatment the old primitive body already had.
function buildPlaceholder(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(9, 24, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
  );
  mesh.position.y = 24;
  return mesh;
}

export class Character3D {
  readonly group = new THREE.Group();
  private modelRoot: THREE.Object3D;
  private mixer?: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private currentAction?: THREE.AnimationAction;
  private currentVariant = "";
  private pendingAnim?: string;
  private oneShotUntil = 0;
  private targetFacing = 0;
  private hasFacing = false;
  private nameSprite: THREE.Sprite;
  private nickname: string;
  private nameColor = "#ffffff";
  private gaitTime = 0;
  private gait = { role: "", ghost: false, dazed: false, moving: false, speed: 1 };

  constructor(appearance: CharacterAppearance, nickname: string) {
    this.nickname = nickname;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(13, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.5;
    this.group.add(shadow);

    this.modelRoot = buildPlaceholder();
    this.group.add(this.modelRoot);

    const { texture: nameTex, width: nameW, height: nameH } = createNameTexture(nickname);
    this.nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex, transparent: true }));
    this.nameSprite.scale.set(nameW, nameH, 1);
    this.nameSprite.position.set(0, NAMEPLATE_Y, 0);
    this.group.add(this.nameSprite);

    this.setAppearance(appearance);
    // If the preload promise hasn't resolved yet, the call above silently
    // no-ops and leaves the placeholder mesh in place — retry once loading
    // finishes. Harmless no-op if setAppearance already succeeded above
    // (currentVariant only gets set on a successful clone, so this re-runs
    // the same variant and the equality guard below skips it).
    preloadCharacterModels().then(() => this.setAppearance(appearance));
  }

  setAppearance(appearance: CharacterAppearance) {
    const variant = appearance.variant;
    if (variant === this.currentVariant) return;

    let clone;
    try {
      clone = cloneCharacter(variant);
    } catch {
      return; // preload hasn't resolved yet — keep the placeholder for now
    }
    this.currentVariant = variant;

    this.group.remove(this.modelRoot);
    disposeObject(this.modelRoot);

    clone.scene.scale.setScalar(MODEL_SCALE);
    this.modelRoot = clone.scene;
    this.group.add(this.modelRoot);

    this.mixer = new THREE.AnimationMixer(clone.scene);
    this.actions.clear();
    for (const clip of clone.animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    this.currentAction = undefined;
    this.playAnimation(this.pendingAnim ?? "idle");
  }

  // Crossfades toward the named clip (e.g. "idle"/"walk"/"sprint"/"die");
  // silently ignored if that clip doesn't exist on this rig, and a no-op if
  // it's already the active clip (called every frame from the game loop).
  // Ignored entirely while a one-shot gag animation (see playOneShot) is
  // still playing, so a frame's routine idle/walk update can't stomp it.
  playAnimation(name: string) {
    this.pendingAnim = name;
    if (performance.now() < this.oneShotUntil) return;
    const next = this.actions.get(name) ?? this.actions.get("idle");
    if (!next || next === this.currentAction) return;

    next.reset().fadeIn(CROSSFADE_SECONDS).play();
    this.currentAction?.fadeOut(CROSSFADE_SECONDS);
    this.currentAction = next;
  }

  setGait(role: string, ghost: boolean, dazed: boolean, moving: boolean, speed = 1) {
    this.gait = { role, ghost, dazed, moving, speed };
    if (this.currentAction) this.currentAction.timeScale = ghost ? 0.75 : dazed ? 0.65 : role === "seeker" ? 1.16 * speed : 0.92 * speed;
  }

  // A brief, uninterruptible gag animation (e.g. the toilet-use gimmick's
  // "sit") — bypasses the one-shot lock itself, then the lock expires
  // naturally and the next routine playAnimation() call (idle/walk from the
  // normal per-frame movement update) takes back over with no cleanup needed.
  playOneShot(name: string, durationMs: number) {
    const next = this.actions.get(name);
    if (!next) return;
    this.oneShotUntil = 0; // let the switch through regardless of any prior lock
    if (next !== this.currentAction) {
      next.reset().fadeIn(CROSSFADE_SECONDS).play();
      this.currentAction?.fadeOut(CROSSFADE_SECONDS);
      this.currentAction = next;
    }
    this.oneShotUntil = performance.now() + durationMs;
  }

  // Turns the character to face a movement direction, given as a world-space
  // (dx, dz) vector — NOT a raw angle, so callers never need to know this
  // class's forward-axis convention. Smoothly sweeps toward it (shortest
  // way around) rather than snapping, so reversing direction turns instead
  // of instantly flipping.
  setFacing(dx: number, dz: number) {
    if (dx === 0 && dz === 0) return;
    this.targetFacing = Math.atan2(dx, dz) + FACING_OFFSET;
    this.hasFacing = true;
  }

  update(deltaSeconds: number) {
    this.mixer?.update(deltaSeconds);
    this.gaitTime += deltaSeconds;
    const bobRate = this.gait.role === "seeker" ? 9 : 7;
    this.modelRoot.position.y = this.gait.ghost ? 5 + Math.sin(this.gaitTime * 3) * 3 : this.gait.moving ? Math.abs(Math.sin(this.gaitTime * bobRate)) * (this.gait.role === "seeker" ? 2.2 : 1.2) : 0;
    this.modelRoot.rotation.z = this.gait.dazed ? Math.sin(this.gaitTime * 5) * 0.12 : 0;
    this.modelRoot.rotation.x = this.gait.moving && this.gait.role === "seeker" ? -0.08 : this.gait.moving ? 0.035 : 0;
    if (this.hasFacing) {
      const diff = Math.atan2(Math.sin(this.targetFacing - this.group.rotation.y), Math.cos(this.targetFacing - this.group.rotation.y));
      this.group.rotation.y += diff * (1 - Math.exp(-FACING_DAMPING * deltaSeconds));
    }
  }

  get rotationY(): number {
    return this.group.rotation.y;
  }

  setTargetRotation(rotationY: number) {
    if (!Number.isFinite(rotationY)) return;
    this.targetFacing = rotationY;
    this.hasFacing = true;
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  // Re-bakes the nameplate texture in a new color (e.g. red once a player's
  // role is revealed as "seeker") — the name is baked into a canvas texture,
  // not a shader uniform, so a color change means building a new one, same
  // dispose-old/swap-in-new shape as setAppearance's model swap.
  setNameColor(color: string) {
    if (color === this.nameColor) return;
    this.nameColor = color;

    const oldMat = this.nameSprite.material;
    oldMat.map?.dispose();
    oldMat.dispose();

    const { texture: nameTex, width: nameW, height: nameH } = createNameTexture(this.nickname, color);
    this.nameSprite.material = new THREE.SpriteMaterial({ map: nameTex, transparent: true });
    this.nameSprite.scale.set(nameW, nameH, 1);
  }

  destroy() {
    this.group.parent?.remove(this.group);
    disposeObject(this.group);
  }
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const disposeMaterial = (mat: THREE.Material | THREE.Material[]) => {
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    };
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      disposeMaterial(obj.material);
    } else if (obj instanceof THREE.Sprite) {
      disposeMaterial(obj.material);
    }
  });
}
