import test from "node:test";
import assert from "node:assert/strict";
import { calculateProgressReward, levelForXp } from "../src/progression/rewards.js";

test("match rewards always include participation XP and coins", () => {
  assert.deepEqual(calculateProgressReward(0), { xpEarned: 50, coinsEarned: 10 });
  assert.deepEqual(calculateProgressReward(-100), { xpEarned: 50, coinsEarned: 10 });
});

test("match rewards scale predictably with server score", () => {
  assert.deepEqual(calculateProgressReward(240), { xpEarned: 170, coinsEarned: 22 });
});

test("level curve starts at one and grows with cumulative XP", () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(900), 4);
});
