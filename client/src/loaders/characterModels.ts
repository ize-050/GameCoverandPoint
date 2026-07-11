// Preloads every Kenney "Blocky Characters" variant ONCE at app start, then
// hands out cheap synchronous clones. GLTFLoader itself is promise-based, but
// the rest of the codebase constructs characters synchronously (a new
// Character3D per player-join), so the async work happens exactly once here
// and every call site afterward just clones whatever already finished loading.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export const CHARACTER_VARIANTS = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i",
  "j", "k", "l", "m", "n", "o", "p", "q", "r",
] as const;
export type CharacterVariant = (typeof CHARACTER_VARIANTS)[number];

export interface CharacterTemplate {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export interface ClonedCharacter {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const loader = new GLTFLoader();
const templates = new Map<CharacterVariant, CharacterTemplate>();
let preloadPromise: Promise<void> | null = null;

export function isCharacterVariant(value: string): value is CharacterVariant {
  return (CHARACTER_VARIANTS as readonly string[]).includes(value);
}

export function preloadCharacterModels(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Promise.all(
      CHARACTER_VARIANTS.map((variant) =>
        loader.loadAsync(`/models/characters/character-${variant}.glb`).then((gltf) => {
          templates.set(variant, { scene: gltf.scene, animations: gltf.animations });
        })
      )
    ).then(() => undefined);
  }
  return preloadPromise;
}

// Synchronous — only valid to call once preloadCharacterModels() has
// resolved. Every call site awaits (or chains .then on) that shared promise
// before ever constructing a Character3D.
export function cloneCharacter(variant: string): ClonedCharacter {
  const key = isCharacterVariant(variant) ? variant : "a";
  const template = templates.get(key) ?? templates.get("a");
  if (!template) throw new Error("cloneCharacter called before preloadCharacterModels() resolved");
  return {
    scene: cloneSkeleton(template.scene) as THREE.Group,
    animations: template.animations,
  };
}
