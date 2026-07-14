import test from "node:test";
import assert from "node:assert/strict";
import { MAP_WIDTH, MAP_HEIGHT } from "../../shared/mapConfig.js";
import { COVER_POINTS, HIDER_SPAWNS, ROOM_PROPS, SEEKER_SPAWN, collidesWithAnyWall } from "../../shared/mapLayout.js";

const RADIUS = 16;
const STEP = 20;
const key = (x: number, y: number) => `${Math.round(x / STEP)},${Math.round(y / STEP)}`;

test("all player spawns are in clear map space", () => {
  const spawns = [SEEKER_SPAWN, ...HIDER_SPAWNS];
  spawns.forEach((spawn) => assert.equal(collidesWithAnyWall(spawn.x, spawn.y, RADIUS), false, `blocked spawn: ${key(spawn.x, spawn.y)}`));
});

test("all spawns, hiding spots and mission props share one reachable walkable region", () => {
  const start = HIDER_SPAWNS[0];
  const queue = [{ x: Math.round(start.x / STEP) * STEP, y: Math.round(start.y / STEP) * STEP }];
  const visited = new Set<string>();
  while (queue.length) {
    const point = queue.shift()!;
    const pointKey = key(point.x, point.y);
    if (visited.has(pointKey) || point.x < RADIUS || point.y < RADIUS || point.x > MAP_WIDTH - RADIUS || point.y > MAP_HEIGHT - RADIUS) continue;
    if (collidesWithAnyWall(point.x, point.y, RADIUS)) continue;
    visited.add(pointKey);
    queue.push({ x: point.x + STEP, y: point.y }, { x: point.x - STEP, y: point.y }, { x: point.x, y: point.y + STEP }, { x: point.x, y: point.y - STEP });
  }

  const anchors = [
    ...[SEEKER_SPAWN, ...HIDER_SPAWNS].map((anchor) => ({ ...anchor, reach: 35 })),
    ...COVER_POINTS.map((anchor) => ({ ...anchor, reach: 90 })),
    ...ROOM_PROPS.map((anchor) => ({ ...anchor, reach: 90 })),
  ];
  anchors.forEach((anchor) => {
    let nearby = false;
    for (let dx = -anchor.reach; dx <= anchor.reach && !nearby; dx += STEP) {
      for (let dy = -anchor.reach; dy <= anchor.reach; dy += STEP) {
        if (Math.hypot(dx, dy) <= anchor.reach && visited.has(key(anchor.x + dx, anchor.y + dy))) { nearby = true; break; }
      }
    }
    assert.equal(nearby, true, `unreachable anchor: ${"id" in anchor ? anchor.id : key(anchor.x, anchor.y)}`);
  });
});
