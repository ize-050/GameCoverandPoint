export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 1200;

export const SEEKER_SPAWN = { x: 800, y: 860 };

// Axis-aligned wall rectangles carve out three small rooms (two side rooms +
// the seeker spawn room), each with a doorway gap — mirrors section 2.4 of
// the plan without needing exact tile-map authoring for v1.
export const WALLS: { x: number; y: number; w: number; h: number }[] = [
  // Room A (left)
  { x: 300, y: 250, w: 360, h: 20 },
  { x: 300, y: 250, w: 20, h: 300 },
  { x: 300, y: 540, w: 360, h: 20 },
  { x: 640, y: 250, w: 20, h: 110 },
  { x: 640, y: 410, w: 20, h: 150 },
  // Room B (right)
  { x: 950, y: 250, w: 360, h: 20 },
  { x: 950, y: 250, w: 20, h: 110 },
  { x: 950, y: 410, w: 20, h: 150 },
  { x: 950, y: 540, w: 360, h: 20 },
  { x: 1290, y: 250, w: 20, h: 300 },
  // Seeker spawn room (center)
  { x: 700, y: 780, w: 220, h: 20 },
  { x: 700, y: 780, w: 20, h: 180 },
  { x: 700, y: 940, w: 220, h: 20 },
  { x: 900, y: 780, w: 20, h: 70 },
  { x: 900, y: 900, w: 20, h: 60 },
];

export type CoverKind = "bush" | "crate" | "barrel" | "haystack";

export const COVER_POINTS: { id: string; x: number; y: number; kind: CoverKind }[] = [
  { id: "cp1", x: 150, y: 200, kind: "bush" },
  { id: "cp2", x: 480, y: 150, kind: "crate" },
  { id: "cp3", x: 560, y: 150, kind: "crate" },
  { id: "cp4", x: 1300, y: 180, kind: "bush" },
  { id: "cp5", x: 1420, y: 320, kind: "barrel" },
  { id: "cp6", x: 120, y: 450, kind: "haystack" },
  { id: "cp7", x: 780, y: 380, kind: "bush" },
  { id: "cp8", x: 1500, y: 500, kind: "crate" },
  { id: "cp9", x: 150, y: 700, kind: "barrel" },
  { id: "cp10", x: 500, y: 650, kind: "haystack" },
  { id: "cp11", x: 1100, y: 650, kind: "bush" },
  { id: "cp12", x: 1300, y: 700, kind: "bush" },
  { id: "cp13", x: 150, y: 900, kind: "crate" },
  { id: "cp14", x: 600, y: 950, kind: "barrel" },
  { id: "cp15", x: 1450, y: 950, kind: "haystack" },
];

export function randomEdgeSpawn(): { x: number; y: number } {
  const margin = 60;
  const edge = Math.floor(Math.random() * 4);
  switch (edge) {
    case 0: // top
      return { x: margin + Math.random() * (MAP_WIDTH - margin * 2), y: margin };
    case 1: // bottom
      return { x: margin + Math.random() * (MAP_WIDTH - margin * 2), y: MAP_HEIGHT - margin };
    case 2: // left
      return { x: margin, y: margin + Math.random() * (MAP_HEIGHT - margin * 2) };
    default: // right
      return { x: MAP_WIDTH - margin, y: margin + Math.random() * (MAP_HEIGHT - margin * 2) };
  }
}
