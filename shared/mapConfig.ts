import { WORLD_WIDTH, WORLD_HEIGHT } from "./mapLayout.js";

// Map dimensions shared by client (camera/world bounds) and server (position clamping).
// Full tile layout / cover points / spawns land in Phase 2.

// Shrunk from the prior 6400x4800 (see MAP_SCALE in mapLayout.ts, which
// scales every room/cover-point/prop position by the same factor) — real
// furniture models were reading as sparse in rooms sized for the old
// oversized procedural boxes, so the whole layout got denser, not just
// smaller.
//
// PART 1 final-polish pass (AI-SPEC-final-polish_1.md): these are now
// DERIVED from mapLayout.ts's gap-compression pass (WORLD_WIDTH/HEIGHT),
// not a fixed literal — that pass shrinks the empty corridor/perimeter
// space between rooms (room interiors stay 100% size) so this can never
// drift out of sync with the actual compressed layout.
export const MAP_WIDTH = WORLD_WIDTH;
export const MAP_HEIGHT = WORLD_HEIGHT;
export const VIEWPORT_WIDTH = 800;
export const VIEWPORT_HEIGHT = 600;
