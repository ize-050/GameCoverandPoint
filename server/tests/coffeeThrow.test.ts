import test from "node:test";
import assert from "node:assert/strict";
import { resolveCoffeeThrow } from "../src/gameplay/coffeeThrow.js";

test("coffee hits the first seeker in the facing direction", () => {
  const result = resolveCoffeeThrow(
    { x: 100, y: 100 }, 0,
    [{ id: "near", x: 108, y: 180 }, { id: "far", x: 100, y: 260 }],
    () => false, 240, 34,
  );
  assert.equal(result.hitTargetId, "near");
  assert.deepEqual(result.to, { x: 108, y: 180 });
});

test("coffee misses seekers outside the throw corridor", () => {
  const result = resolveCoffeeThrow(
    { x: 100, y: 100 }, 0,
    [{ id: "side", x: 150, y: 180 }],
    () => false, 240, 34,
  );
  assert.equal(result.hitTargetId, undefined);
  assert.deepEqual(result.to, { x: 100, y: 340 });
});

test("walls clip coffee and prevent hits through them", () => {
  const result = resolveCoffeeThrow(
    { x: 100, y: 100 }, 0,
    [{ id: "behind-wall", x: 100, y: 220 }],
    (_x, y) => y >= 180, 240, 34,
  );
  assert.equal(result.hitTargetId, undefined);
  assert.equal(result.to.y, 172);
});
