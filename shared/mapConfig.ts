// Map dimensions shared by client (camera/world bounds) and server (position clamping).
// Full tile layout / cover points / spawns land in Phase 2.

// Shrunk from the prior 6400x4800 (see MAP_SCALE in mapLayout.ts, which
// scales every room/cover-point/prop position by the same factor) — real
// furniture models were reading as sparse in rooms sized for the old
// oversized procedural boxes, so the whole layout got denser, not just
// smaller.
export const MAP_WIDTH = 4160;
export const MAP_HEIGHT = 3120;
export const VIEWPORT_WIDTH = 800;
export const VIEWPORT_HEIGHT = 600;
