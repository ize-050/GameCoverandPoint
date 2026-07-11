// Procedurally generated map layout — office theme per the 7-room
// hub-and-corridor spec (server, lounge, toilet, work zone A, meeting,
// work zone B, reception-as-hub), plus a small phone-booth nook. Reuses
// the same 3x3-grid slot geometry the map was built on before (each
// slot's box/doors already validated collision-free) — only which room
// occupies each slot changed, not the slots themselves. Shared so client
// (rendering/prediction) and server (collision validation) never drift apart.

import { MAP_WIDTH, MAP_HEIGHT } from "./mapConfig.js";

export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DoorSide = "top" | "bottom" | "left" | "right";
interface Door {
  side: DoorSide;
  at: number; // offset along the side, from its start corner
  width: number;
}
export interface RoomSpec {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  doors: Door[];
}

const WALL_THICKNESS = 20;

// Every hand-authored coordinate below (rooms, cover points, props, spawns)
// was designed against the map's original, larger footprint. Rather than
// hand-rewriting hundreds of literals, MAP_SCALE shrinks the whole layout
// uniformly at each export boundary — relative proportions/collisions stay
// exactly as authored, just denser overall (less empty floor per room,
// since furniture's own rendered size in GameScreen.ts is untouched).
const MAP_SCALE = 0.65;
function scale(n: number): number {
  return Math.round(n * MAP_SCALE);
}
function scaleWallRect(r: WallRect): WallRect {
  return { x: scale(r.x), y: scale(r.y), w: scale(r.w), h: scale(r.h) };
}
function scaleXY<T extends { x: number; y: number }>(p: T): T {
  return { ...p, x: scale(p.x), y: scale(p.y) };
}

// Builds a room's 4 walls, cutting door-sized gaps out of whichever sides need one.
// Keeps hand-authored room layouts readable (each room is just its box + door list)
// instead of dozens of hand-computed wall-segment rectangles.
function buildRoomWalls(spec: RoomSpec): WallRect[] {
  const { x, y, w, h, doors } = spec;
  const walls: WallRect[] = [];

  function addSide(side: DoorSide) {
    const sideDoors = doors.filter((d) => d.side === side).sort((a, b) => a.at - b.at);
    const horizontal = side === "top" || side === "bottom";
    const start = horizontal ? x : y;
    const end = horizontal ? x + w : y + h;
    const fixedCoord = horizontal ? (side === "top" ? y : y + h - WALL_THICKNESS) : side === "left" ? x : x + w - WALL_THICKNESS;

    let cursor = start;
    for (const door of sideDoors) {
      const doorStart = start + door.at;
      if (doorStart > cursor) {
        walls.push(
          horizontal
            ? { x: cursor, y: fixedCoord, w: doorStart - cursor, h: WALL_THICKNESS }
            : { x: fixedCoord, y: cursor, w: WALL_THICKNESS, h: doorStart - cursor }
        );
      }
      cursor = doorStart + door.width;
    }
    if (cursor < end) {
      walls.push(
        horizontal
          ? { x: cursor, y: fixedCoord, w: end - cursor, h: WALL_THICKNESS }
          : { x: fixedCoord, y: cursor, w: WALL_THICKNESS, h: end - cursor }
      );
    }
  }

  (["top", "bottom", "left", "right"] as const).forEach(addSide);
  return walls;
}

// 3x3-grid hub layout — reception (center-bottom) is the hub/seeker-spawn,
// the other 6 rooms sit at 6 of the remaining 8 grid slots (2 slots are
// left as open floor rather than forced-empty rooms — one gets an extra
// cubicle cluster below so it doesn't read as bare).
const ROOMS_RAW: RoomSpec[] = [
  // Server room — top-left
  {
    id: "server",
    name: "ห้อง Server",
    x: 320,
    y: 520,
    w: 1360,
    h: 1240,
    doors: [{ side: "right", at: 520, width: 200 }, { side: "bottom", at: 560, width: 200 }],
  },
  // Lounge — top-middle
  {
    id: "lounge",
    name: "ห้องนั่งเล่น",
    x: 2750,
    y: 520,
    w: 900,
    h: 700,
    doors: [{ side: "bottom", at: 350, width: 200 }, { side: "right", at: 250, width: 150 }],
  },
  // Toilet — top-right
  {
    id: "toilet",
    name: "ห้องน้ำ",
    x: 4720,
    y: 520,
    w: 1360,
    h: 1240,
    doors: [{ side: "left", at: 520, width: 200 }, { side: "bottom", at: 560, width: 200 }],
  },
  // Work Zone A — middle-left
  {
    id: "work_a",
    name: "โซนทำงาน A",
    x: 320,
    y: 1950,
    w: 700,
    h: 900,
    doors: [{ side: "right", at: 350, width: 200 }, { side: "top", at: 250, width: 150 }],
  },
  // Meeting room — middle-right
  {
    id: "meeting",
    name: "ห้องประชุม",
    x: 5050,
    y: 1950,
    w: 700,
    h: 900,
    doors: [{ side: "left", at: 350, width: 200 }, { side: "top", at: 250, width: 150 }],
  },
  // Work Zone B — bottom-left
  {
    id: "work_b",
    name: "โซนทำงาน B",
    x: 320,
    y: 3040,
    w: 1360,
    h: 1240,
    doors: [{ side: "top", at: 560, width: 200 }, { side: "right", at: 520, width: 200 }],
  },
  // Reception — bottom-middle. The hub: seeker spawn lives here, movement
  // is already blocked for seekers during "hide" phase (existing
  // handleMove check) so no literal locked door/wall is needed to keep
  // them in before "seek" starts.
  {
    id: "reception",
    name: "ห้องต้อนรับ",
    x: 2850,
    y: 3680,
    w: 700,
    h: 600,
    doors: [{ side: "top", at: 250, width: 200 }, { side: "right", at: 150, width: 150 }],
  },
  // Phone booth — tiny bonus nook in the NW corridor, not part of the spec
  // but harmless flavor (spec explicitly invites "design our own office").
  {
    id: "phonebooth",
    name: "ห้องโทรศัพท์",
    x: 2000,
    y: 700,
    w: 200,
    h: 200,
    doors: [{ side: "bottom", at: 50, width: 100 }],
  },
];

export const ROOMS: RoomSpec[] = ROOMS_RAW.map((room) => ({
  ...room,
  x: scale(room.x),
  y: scale(room.y),
  w: scale(room.w),
  h: scale(room.h),
  doors: room.doors.map((d) => ({ ...d, at: scale(d.at), width: scale(d.width) })),
}));

// Freestanding wall segments in the open cubicle floor between rooms — break
// sightlines without being a full room; also read as cubicle partitions.
// Position-based, not room-name-based, so these stayed valid unchanged
// across the room re-skin above.
const STANDALONE_WALLS_RAW: WallRect[] = [
  { x: 2040, y: 1400, w: 640, h: WALL_THICKNESS },
  { x: 3720, y: 3360, w: WALL_THICKNESS, h: 640 },
  { x: 1800, y: 3800, w: WALL_THICKNESS, h: 520 },
  { x: 4560, y: 1120, w: 520, h: WALL_THICKNESS },
  { x: 2500, y: 1900, w: 440, h: WALL_THICKNESS },
  { x: 3700, y: 1900, w: 440, h: WALL_THICKNESS },
  { x: 2500, y: 2840, w: WALL_THICKNESS, h: 440 },
  { x: 1800, y: 1300, w: WALL_THICKNESS, h: 300 },
  { x: 1400, y: 2400, w: 300, h: WALL_THICKNESS },
  { x: 3900, y: 2400, w: 300, h: WALL_THICKNESS },
  { x: 2600, y: 2900, w: WALL_THICKNESS, h: 300 },
  { x: 4000, y: 1000, w: WALL_THICKNESS, h: 300 },
  { x: 2300, y: 3300, w: 400, h: WALL_THICKNESS },
];

// A cubicle-farm cluster: internal partition dividers only (no outer
// perimeter), so every bay stays reachable from its two outward-facing
// sides — same shape as a real open-plan desk block. Returns both the
// divider walls and each bay's center point (for a cover point to sit at).
// Thinner than a structural room wall (8 vs 20) since these read as fabric
// cubicle screens, not building walls.
const CUBICLE_PARTITION_THICKNESS = 8;
function cubicleBlock(originX: number, originY: number, cols: number, rows: number, cellW: number, cellH: number) {
  const walls: WallRect[] = [];
  for (let r = 1; r < rows; r++) {
    walls.push({ x: originX, y: originY + r * cellH - CUBICLE_PARTITION_THICKNESS / 2, w: cols * cellW, h: CUBICLE_PARTITION_THICKNESS });
  }
  for (let c = 1; c < cols; c++) {
    walls.push({ x: originX + c * cellW - CUBICLE_PARTITION_THICKNESS / 2, y: originY, w: CUBICLE_PARTITION_THICKNESS, h: rows * cellH });
  }
  const bayCenters: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      bayCenters.push({ x: originX + c * cellW + cellW / 2, y: originY + r * cellH + cellH / 2 });
    }
  }
  return { walls, bayCenters };
}

// Open-floor cubicle-farm clusters (unrelated to which named room sits in
// each grid slot — these fill the corridor space between rooms).
const CUBICLE_NW = cubicleBlock(1900, 1060, 2, 2, 200, 160);
const CUBICLE_NE = cubicleBlock(3950, 1350, 2, 2, 200, 160);
const CUBICLE_SW = cubicleBlock(1900, 2950, 2, 2, 200, 160);
const CUBICLE_SE = cubicleBlock(3950, 2950, 2, 2, 200, 160);
// A 5th cluster in the grid slot freed up by dropping the old
// "manager's office" room, so that slot doesn't read as bare open floor.
const CUBICLE_C = cubicleBlock(5000, 3300, 2, 2, 200, 160);

// Work Zone A/B's own in-room cubicle clusters — the spec calls for
// "6 desks in a grid + partition" per work zone, which is exactly what
// cubicleBlock() already produces.
const WORK_A_DESKS = cubicleBlock(390, 1980, 2, 3, 280, 280);
const WORK_B_DESKS = cubicleBlock(420, 3140, 3, 2, 280, 280);

export const WALLS: WallRect[] = [
  // ROOMS is already the scaled export (buildRoomWalls commutes with a
  // uniform scale, so building from the scaled rooms is equivalent to
  // scaling the wall output — and this way door gaps stay aligned with the
  // scaled room box).
  ...ROOMS.flatMap(buildRoomWalls),
  ...STANDALONE_WALLS_RAW.map(scaleWallRect),
  ...CUBICLE_NW.walls.map(scaleWallRect),
  ...CUBICLE_NE.walls.map(scaleWallRect),
  ...CUBICLE_SW.walls.map(scaleWallRect),
  ...CUBICLE_SE.walls.map(scaleWallRect),
  ...CUBICLE_C.walls.map(scaleWallRect),
  ...WORK_A_DESKS.walls.map(scaleWallRect),
  ...WORK_B_DESKS.walls.map(scaleWallRect),
];

const PLAYER_RADIUS = 16;

export function circleOverlapsWall(cx: number, cy: number, wall: WallRect, radius = PLAYER_RADIUS): boolean {
  const closestX = Math.max(wall.x, Math.min(cx, wall.x + wall.w));
  const closestY = Math.max(wall.y, Math.min(cy, wall.y + wall.h));
  return Math.hypot(cx - closestX, cy - closestY) < radius;
}

export function collidesWithAnyWall(x: number, y: number, radius = PLAYER_RADIUS): boolean {
  return WALLS.some((wall) => circleOverlapsWall(x, y, wall, radius));
}

// Zone-containment check reused by the light-switch room lookup (server),
// several room-prop gimmicks, and the minimap / dark-room checks (client).
export function pointInRoom(x: number, y: number, room: RoomSpec): boolean {
  return x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h;
}

export function findRoomAt(x: number, y: number): RoomSpec | undefined {
  return ROOMS.find((room) => pointInRoom(x, y, room));
}

// Per-axis sliding resolution (try X alone, then Y alone) so players glide
// along wall surfaces instead of stopping dead — used for client prediction.
export function resolveWallSlide(fromX: number, fromY: number, toX: number, toY: number, radius = PLAYER_RADIUS) {
  let x = toX;
  let y = toY;
  if (WALLS.some((wall) => circleOverlapsWall(x, fromY, wall, radius))) x = fromX;
  if (WALLS.some((wall) => circleOverlapsWall(x, y, wall, radius))) y = fromY;
  return { x, y };
}

export type CoverKind = "desk" | "cabinet" | "server-rack" | "plant" | "shelf" | "sofa" | "stall" | "conference-table";

export interface CoverPointDef {
  id: string;
  x: number;
  y: number;
  kind: CoverKind;
  // Looks identical to a real cover point but can never actually hide anyone
  // (handleHide rejects it server-side) — forces the seeker to spend a real
  // inspect attempt to learn that, stretching their limited budget further.
  // Known trade-off: this flag ships in the client bundle like the rest of
  // this file, so it's not secret from someone reading devtools — the
  // anti-cheat boundary here is live position data (@filter), not static
  // map data.
  isDecoy?: boolean;
}

const COVER_POINTS_RAW: CoverPointDef[] = [
  // Server room — a row of racks (shifted from the old top-left room's
  // desk/cabinet layout by the same delta, reskinned as server-racks).
  { id: "cp-server1", x: 1400, y: 840, kind: "server-rack" },
  { id: "cp-server2", x: 800, y: 760, kind: "server-rack" },
  { id: "cp-server3", x: 1120, y: 1400, kind: "server-rack" },
  { id: "cp-server4", x: 650, y: 1250, kind: "server-rack" },
  { id: "cp-server5", x: 1550, y: 1150, kind: "server-rack" },

  // Lounge — sofas + a game cabinet.
  { id: "cp-lounge1", x: 2950, y: 700, kind: "sofa" },
  { id: "cp-lounge2", x: 3450, y: 950, kind: "sofa" },
  { id: "cp-lounge3", x: 3150, y: 1100, kind: "cabinet" },

  // Toilet — stalls + a supply cabinet (the room is bigger than the old
  // bathroom slot it reuses, so it gets more stalls than that slot had).
  { id: "cp-toilet1", x: 4970, y: 740, kind: "stall" },
  { id: "cp-toilet2", x: 5220, y: 940, kind: "stall" },
  { id: "cp-toilet3", x: 5500, y: 740, kind: "stall" },
  { id: "cp-toilet4", x: 5750, y: 940, kind: "stall" },
  { id: "cp-toilet5", x: 4870, y: 1040, kind: "cabinet" },

  // Work Zone A — 6 desks in a partitioned grid (from WORK_A_DESKS below).
  { id: "cp-worka1", x: WORK_A_DESKS.bayCenters[0].x, y: WORK_A_DESKS.bayCenters[0].y, kind: "desk" },
  { id: "cp-worka2", x: WORK_A_DESKS.bayCenters[1].x, y: WORK_A_DESKS.bayCenters[1].y, kind: "desk" },
  { id: "cp-worka3", x: WORK_A_DESKS.bayCenters[2].x, y: WORK_A_DESKS.bayCenters[2].y, kind: "desk" },
  { id: "cp-worka4", x: WORK_A_DESKS.bayCenters[3].x, y: WORK_A_DESKS.bayCenters[3].y, kind: "desk" },
  { id: "cp-worka5", x: WORK_A_DESKS.bayCenters[4].x, y: WORK_A_DESKS.bayCenters[4].y, kind: "desk" },
  { id: "cp-worka6", x: WORK_A_DESKS.bayCenters[5].x, y: WORK_A_DESKS.bayCenters[5].y, kind: "desk" },

  // Meeting room — one long conference table + a side cabinet.
  { id: "cp-meeting-table", x: 5400, y: 2400, kind: "conference-table" },
  { id: "cp-meeting-cabinet", x: 5150, y: 2700, kind: "cabinet" },

  // Work Zone B — 6 desks in a partitioned grid + a file-cabinet row.
  { id: "cp-workb1", x: WORK_B_DESKS.bayCenters[0].x, y: WORK_B_DESKS.bayCenters[0].y, kind: "desk" },
  { id: "cp-workb2", x: WORK_B_DESKS.bayCenters[1].x, y: WORK_B_DESKS.bayCenters[1].y, kind: "desk" },
  { id: "cp-workb3", x: WORK_B_DESKS.bayCenters[2].x, y: WORK_B_DESKS.bayCenters[2].y, kind: "desk" },
  { id: "cp-workb4", x: WORK_B_DESKS.bayCenters[3].x, y: WORK_B_DESKS.bayCenters[3].y, kind: "desk" },
  { id: "cp-workb5", x: WORK_B_DESKS.bayCenters[4].x, y: WORK_B_DESKS.bayCenters[4].y, kind: "desk" },
  { id: "cp-workb6", x: WORK_B_DESKS.bayCenters[5].x, y: WORK_B_DESKS.bayCenters[5].y, kind: "desk" },
  { id: "cp-workb-file1", x: 420, y: 4150, kind: "cabinet" },
  { id: "cp-workb-file2", x: 750, y: 4150, kind: "cabinet" },
  { id: "cp-workb-file3", x: 1080, y: 4150, kind: "cabinet" },

  // Reception (hub) — waiting sofa + a big plant.
  { id: "cp-reception-sofa", x: 3300, y: 3980, kind: "sofa" },
  { id: "cp-reception-plant", x: 3400, y: 4130, kind: "plant" },

  // Open cubicle floor between rooms
  { id: "cp15", x: 1800, y: 2360, kind: "plant" },
  { id: "cp16", x: 4600, y: 2360, kind: "server-rack" },
  { id: "cp17", x: 2300, y: 3560, kind: "desk" },
  { id: "cp18", x: 4100, y: 1300, kind: "cabinet" },
  { id: "cp45", x: 3600, y: 2400, kind: "plant" },
  { id: "cp46", x: 2800, y: 2400, kind: "cabinet" },
  { id: "cp47", x: 3200, y: 1750, kind: "desk" },
  { id: "cp48", x: 3200, y: 3050, kind: "cabinet" },
  // Far edges
  { id: "cp19", x: 180, y: 2400, kind: "plant" },
  { id: "cp20", x: 6220, y: 2400, kind: "desk" },
  // Decoys — same props, never actually usable
  { id: "cp21", x: 2600, y: 1700, kind: "desk", isDecoy: true },
  { id: "cp22", x: 3800, y: 1700, kind: "cabinet", isDecoy: true },
  { id: "cp23", x: 2660, y: 3100, kind: "plant", isDecoy: true },
  { id: "cp24", x: 3800, y: 3100, kind: "server-rack", isDecoy: true },
  { id: "cp25", x: 1400, y: 2000, kind: "desk", isDecoy: true },
  { id: "cp26", x: 5000, y: 2000, kind: "cabinet", isDecoy: true },
  { id: "cp27", x: 1400, y: 2800, kind: "plant", isDecoy: true },
  { id: "cp28", x: 5000, y: 2800, kind: "server-rack", isDecoy: true },
  { id: "cp39", x: 2000, y: 1500, kind: "desk", isDecoy: true },
  { id: "cp40", x: 4400, y: 1500, kind: "cabinet", isDecoy: true },
  { id: "cp41", x: 2000, y: 3300, kind: "plant", isDecoy: true },
  { id: "cp42", x: 4400, y: 3300, kind: "server-rack", isDecoy: true },
  { id: "cp43", x: 1600, y: 2460, kind: "shelf", isDecoy: true },
  { id: "cp44", x: 4800, y: 2400, kind: "sofa", isDecoy: true },
  // Open-floor cubicle-farm clusters — 3 desks + 1 cabinet per 2x2 block.
  { id: "cp-cube-nw1", x: CUBICLE_NW.bayCenters[0].x, y: CUBICLE_NW.bayCenters[0].y, kind: "desk" },
  { id: "cp-cube-nw2", x: CUBICLE_NW.bayCenters[1].x, y: CUBICLE_NW.bayCenters[1].y, kind: "desk" },
  { id: "cp-cube-nw3", x: CUBICLE_NW.bayCenters[2].x, y: CUBICLE_NW.bayCenters[2].y, kind: "desk" },
  { id: "cp-cube-nw4", x: CUBICLE_NW.bayCenters[3].x, y: CUBICLE_NW.bayCenters[3].y, kind: "cabinet" },
  { id: "cp-cube-ne1", x: CUBICLE_NE.bayCenters[0].x, y: CUBICLE_NE.bayCenters[0].y, kind: "desk" },
  { id: "cp-cube-ne2", x: CUBICLE_NE.bayCenters[1].x, y: CUBICLE_NE.bayCenters[1].y, kind: "desk" },
  { id: "cp-cube-ne3", x: CUBICLE_NE.bayCenters[2].x, y: CUBICLE_NE.bayCenters[2].y, kind: "desk" },
  { id: "cp-cube-ne4", x: CUBICLE_NE.bayCenters[3].x, y: CUBICLE_NE.bayCenters[3].y, kind: "cabinet" },
  { id: "cp-cube-sw1", x: CUBICLE_SW.bayCenters[0].x, y: CUBICLE_SW.bayCenters[0].y, kind: "desk" },
  { id: "cp-cube-sw2", x: CUBICLE_SW.bayCenters[1].x, y: CUBICLE_SW.bayCenters[1].y, kind: "desk" },
  { id: "cp-cube-sw3", x: CUBICLE_SW.bayCenters[2].x, y: CUBICLE_SW.bayCenters[2].y, kind: "desk" },
  { id: "cp-cube-sw4", x: CUBICLE_SW.bayCenters[3].x, y: CUBICLE_SW.bayCenters[3].y, kind: "cabinet" },
  { id: "cp-cube-se1", x: CUBICLE_SE.bayCenters[0].x, y: CUBICLE_SE.bayCenters[0].y, kind: "desk" },
  { id: "cp-cube-se2", x: CUBICLE_SE.bayCenters[1].x, y: CUBICLE_SE.bayCenters[1].y, kind: "desk" },
  { id: "cp-cube-se3", x: CUBICLE_SE.bayCenters[2].x, y: CUBICLE_SE.bayCenters[2].y, kind: "desk" },
  { id: "cp-cube-se4", x: CUBICLE_SE.bayCenters[3].x, y: CUBICLE_SE.bayCenters[3].y, kind: "cabinet" },
  { id: "cp-cube-c1", x: CUBICLE_C.bayCenters[0].x, y: CUBICLE_C.bayCenters[0].y, kind: "desk" },
  { id: "cp-cube-c2", x: CUBICLE_C.bayCenters[1].x, y: CUBICLE_C.bayCenters[1].y, kind: "desk" },
  { id: "cp-cube-c3", x: CUBICLE_C.bayCenters[2].x, y: CUBICLE_C.bayCenters[2].y, kind: "desk" },
  { id: "cp-cube-c4", x: CUBICLE_C.bayCenters[3].x, y: CUBICLE_C.bayCenters[3].y, kind: "cabinet" },
];

export const COVER_POINTS: CoverPointDef[] = COVER_POINTS_RAW.map((cp) => ({ ...cp, x: scale(cp.x), y: scale(cp.y) }));

// Center of the reception room — the hub, and the seeker's holding spot
// before "hide" phase ends (movement is already blocked for seekers during
// hide phase, so no sealed room is needed here, just a room they spawn in).
export const SEEKER_SPAWN = scaleXY({ x: 3150, y: 3900 });

// Points spread around the map so hiders spawn well clear of each other,
// even with up to 9 concurrent hiders.
const HIDER_SPAWNS_RAW: { x: number; y: number }[] = [
  { x: 200, y: 200 },
  { x: 3200, y: 160 },
  { x: 6200, y: 200 },
  { x: 200, y: 2400 },
  { x: 6200, y: 2400 },
  { x: 200, y: 4600 },
  { x: 3200, y: 4640 },
  { x: 6200, y: 4600 },
  { x: 1800, y: 300 },
  { x: 4600, y: 300 },
  { x: 1800, y: 4500 },
  { x: 4600, y: 4500 },
  { x: 3200, y: 900 },
  { x: 600, y: 2400 },
  { x: 5450, y: 2350 },
  { x: 5200, y: 3800 },
  { x: 2130, y: 1100 },
  { x: 3900, y: 2900 },
  { x: 2450, y: 2900 },
  { x: 1300, y: 2400 },
];

export const HIDER_SPAWNS: { x: number; y: number }[] = HIDER_SPAWNS_RAW.map(scaleXY);

export function randomHiderSpawn(): { x: number; y: number } {
  return HIDER_SPAWNS[Math.floor(Math.random() * HIDER_SPAWNS.length)];
}

// Purely cosmetic scatter (office props) — never collided against, not
// synced through room state, just a fixed list every client renders
// identically so the floor doesn't read as empty between furniture.
export type DecorationKind = "plant-small" | "papers" | "bin" | "cardboard-box" | "coat-rack";
export interface DecorationDef {
  x: number;
  y: number;
  kind: DecorationKind;
}

function scatter(kind: DecorationKind, count: number, seed: number, mapW: number, mapH: number): DecorationDef[] {
  const items: DecorationDef[] = [];
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    items.push({ kind, x: rand() * mapW, y: rand() * mapH });
  }
  return items;
}

// Real-volume decoration kinds (unlike the flat billboard sprites above)
// also need to dodge existing cover points, or a box/rack can visually clip
// straight through a desk/cabinet mesh.
const REAL_MODEL_DECO_CLEARANCE_PX = 45;
function tooCloseToCoverPoint(x: number, y: number): boolean {
  return COVER_POINTS.some((cp) => Math.hypot(cp.x - x, cp.y - y) < REAL_MODEL_DECO_CLEARANCE_PX);
}

export const DECORATIONS: DecorationDef[] = [
  ...scatter("plant-small", 80, 7, MAP_WIDTH, MAP_HEIGHT),
  ...scatter("bin", 44, 41, MAP_WIDTH, MAP_HEIGHT),
  ...scatter("papers", 60, 113, MAP_WIDTH, MAP_HEIGHT),
  // Real-model clutter (Among Us-style messy office feel) — moved boxes and
  // coat racks scattered around, on top of the existing flat-sprite scatter.
  ...scatter("cardboard-box", 30, 271, MAP_WIDTH, MAP_HEIGHT),
  ...scatter("coat-rack", 14, 389, MAP_WIDTH, MAP_HEIGHT),
]
  .filter((d) => !collidesWithAnyWall(d.x, d.y, 60))
  .filter((d) => (d.kind === "cardboard-box" || d.kind === "coat-rack" ? !tooCloseToCoverPoint(d.x, d.y) : true));

// One or more physical props per room — gives every room its own identity,
// and doubles as the anchor for that room's gimmick (server alarm,
// whiteboard decoy, coffee boost, monitor peek, and every room's light
// switch for the universal lights mechanic). Purely cosmetic like
// DECORATIONS — never collided against, not synced through room state.
export type RoomPropKind =
  | "whiteboard"
  | "chair"
  | "alarm-light"
  | "coffee-machine"
  | "monitor"
  | "light-switch"
  | "sink"
  | "mirror"
  | "reception-desk"
  | "table"
  | "tv"
  | "toilet-use";
export interface RoomPropDef {
  id: string;
  x: number;
  y: number;
  kind: RoomPropKind;
}

const ROOM_PROPS_RAW: RoomPropDef[] = [
  // Server room — alarm light (passive motion-alarm gimmick's anchor).
  { id: "server-alarm", x: 1000, y: 600, kind: "alarm-light" },
  { id: "server-switch", x: 1580, y: 1000, kind: "light-switch" },

  // Lounge — wall-mounted TV facing the sofas.
  { id: "lounge-switch", x: 3580, y: 650, kind: "light-switch" },
  { id: "lounge-tv", x: 3200, y: 610, kind: "tv" },

  // Toilet — sink below a wall-mounted mirror near the entrance, plus a
  // comedic "use the toilet" gimmick anchor (away from any stall's own
  // cover point so its interaction range never overlaps with hiding there).
  { id: "toilet-sink", x: 4790, y: 620, kind: "sink" },
  { id: "toilet-mirror", x: 4790, y: 585, kind: "mirror" },
  { id: "toilet-switch", x: 4810, y: 1000, kind: "light-switch" },
  { id: "toilet-use", x: 4830, y: 820, kind: "toilet-use" },

  // Work Zone A
  { id: "worka-switch", x: 950, y: 2020, kind: "light-switch" },

  // Meeting room — whiteboard (decoy gimmick's anchor) + chairs around the
  // conference table.
  { id: "meeting-whiteboard", x: 5400, y: 2010, kind: "whiteboard" },
  { id: "meeting-chair1", x: 5280, y: 2300, kind: "chair" },
  { id: "meeting-chair2", x: 5520, y: 2300, kind: "chair" },
  { id: "meeting-chair3", x: 5280, y: 2500, kind: "chair" },
  { id: "meeting-chair4", x: 5520, y: 2500, kind: "chair" },
  { id: "meeting-switch", x: 5120, y: 2020, kind: "light-switch" },

  // Work Zone B — coffee machine (coffee-boost gimmick's anchor, same slot
  // as the old break room so it keeps its exact position).
  { id: "workb-coffee", x: 440, y: 4160, kind: "coffee-machine" },
  { id: "workb-switch", x: 1120, y: 3130, kind: "light-switch" },

  // Reception (hub) — reception desk + the relocated security monitor
  // (monitor-peek gimmick's anchor — the old manager's office is gone, a
  // front-desk security monitor fits the hub room thematically).
  { id: "reception-desk", x: 2930, y: 3740, kind: "reception-desk" },
  { id: "reception-monitor", x: 3450, y: 3830, kind: "monitor" },
  { id: "reception-switch", x: 3480, y: 3750, kind: "light-switch" },

  // Phone booth — small table + chair, a tiny detour nook.
  { id: "phonebooth-table", x: 2100, y: 780, kind: "table" },
  { id: "phonebooth-chair", x: 2100, y: 830, kind: "chair" },
];

export const ROOM_PROPS: RoomPropDef[] = ROOM_PROPS_RAW.map((p) => ({ ...p, x: scale(p.x), y: scale(p.y) }));

// Hanging pendant lights — one per room plus one per cubicle-farm cluster,
// purely ambient (reinforces "indoors under office lighting"), never
// collided against, no gameplay effect.
const CEILING_LIGHTS_RAW: { x: number; y: number }[] = [
  { x: 1000, y: 1140 },
  { x: 3200, y: 870 },
  { x: 5400, y: 1140 },
  { x: 670, y: 2400 },
  { x: 5400, y: 2400 },
  { x: 1000, y: 3660 },
  { x: 3200, y: 3980 },
  { x: 2100, y: 800 },
  { x: 2100, y: 1220 },
  { x: 4150, y: 1510 },
  { x: 2100, y: 3110 },
  { x: 4150, y: 3110 },
  { x: 5200, y: 3460 },
];

export const CEILING_LIGHTS: { x: number; y: number }[] = CEILING_LIGHTS_RAW.map(scaleXY);
