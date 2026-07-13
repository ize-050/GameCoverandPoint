// Same preload-once/clone-many pattern as characterModels.ts, but for static
// (non-skinned) furniture — a plain THREE.Object3D clone is correct here since
// there's no skeleton to rebind, unlike the animated character models.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// CoverKind/RoomPropKind -> Kenney "Furniture Kit" model(s), for the kinds
// that have a real match. Deliberately left out (kept procedural,
// generated-texture boxes instead): "whiteboard" (needs a custom drawn
// texture per decoy, a GLB can't carry that), "alarm-light" and
// "light-switch" (no dedicated siren/switch model in this pack and both are
// tiny/low visual priority — not worth a mismatched substitute).
//
// Kinds that repeat many times across the map (desk/cabinet/server-rack/
// shelf/sofa/chair) get MULTIPLE model variants instead of one — every
// instance otherwise renders the exact same mesh, which is what read as
// "too repetitive" once there were 6-9+ of them in view at once.
export const FURNITURE_MODEL_VARIANTS: Record<string, string[]> = {
  desk: ["/models/furniture/desk.glb", "/models/furniture/deskCorner.glb"],
  cabinet: [
    "/models/furniture/kitchenCabinet.glb",
    "/models/furniture/kitchenCabinetDrawer.glb",
    "/models/furniture/bookcaseClosed.glb",
  ],
  "server-rack": ["/models/furniture/cabinetTelevision.glb", "/models/furniture/cabinetTelevisionDoors.glb"],
  plant: ["/models/furniture/pottedPlant.glb"],
  shelf: ["/models/furniture/bookcaseOpen.glb", "/models/furniture/bookcaseOpenLow.glb"],
  sofa: [
    "/models/furniture/loungeSofa.glb",
    "/models/furniture/loungeSofaLong.glb",
    "/models/furniture/loungeSofaCorner.glb",
  ],
  stall: ["/models/furniture/toilet.glb"],
  "conference-table": ["/models/furniture/tableCross.glb"],
  chair: ["/models/furniture/chairDesk.glb", "/models/furniture/chair.glb", "/models/furniture/chairCushion.glb"],
  "coffee-machine": ["/models/furniture/kitchenCoffeeMachine.glb"],
  monitor: ["/models/furniture/computerScreen.glb"],
  sink: ["/models/furniture/bathroomSink.glb"],
  mirror: ["/models/furniture/bathroomMirror.glb"],
  "reception-desk": ["/models/furniture/kitchenBar.glb"],
  table: ["/models/furniture/sideTable.glb"],
  tv: ["/models/furniture/televisionModern.glb"],
  "cardboard-box": ["/models/furniture/cardboardBoxClosed.glb", "/models/furniture/cardboardBoxOpen.glb"],
  "coat-rack": ["/models/furniture/coatRack.glb"],
  bin: ["/models/furniture/trashcan.glb"],
};

// Simple deterministic string hash (djb2) — picks the SAME variant for the
// same seed (e.g. a cover point's own id) on every client/every load, so
// the world looks consistent to everyone instead of shuffling on refresh.
function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (h * 33) ^ seed.charCodeAt(i);
  return h >>> 0;
}

const loader = new GLTFLoader();
const templates = new Map<string, THREE.Group>();
let preloadPromise: Promise<void> | null = null;

export function preloadFurnitureModels(): Promise<void> {
  if (!preloadPromise) {
    const uniquePaths = [...new Set(Object.values(FURNITURE_MODEL_VARIANTS).flat())];
    preloadPromise = Promise.all(
      uniquePaths.map((path) =>
        loader.loadAsync(path).then((gltf) => {
          templates.set(path, gltf.scene);
        })
      )
    ).then(() => undefined);
  }
  return preloadPromise;
}

// Returns undefined for kinds deliberately kept procedural (see comment
// above) — callers fall back to their existing generated-texture geometry.
// `seed` (typically the cover point/prop's own id) picks which variant of a
// multi-model kind to use, deterministically.
export function cloneFurniture(kind: string, seed = ""): THREE.Group | undefined {
  const variants = FURNITURE_MODEL_VARIANTS[kind];
  if (!variants || variants.length === 0) return undefined;
  const path = variants[hashSeed(seed) % variants.length];
  const template = templates.get(path);
  if (!template) return undefined;
  return template.clone(true);
}
