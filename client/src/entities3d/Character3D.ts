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
  private nameSprite: THREE.Sprite;

  constructor(appearance: CharacterAppearance, nickname: string) {
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

  update(deltaSeconds: number) {
    this.mixer?.update(deltaSeconds);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  setVisible(visible: boolean) {
    this.group.visible = visible;
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
