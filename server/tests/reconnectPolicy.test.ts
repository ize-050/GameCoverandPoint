import test from "node:test";
import assert from "node:assert/strict";
import { decideDisconnectAction } from "../src/rooms/reconnectPolicy.js";

test("unexpected last Seeker disconnect pauses an active round", () => {
  assert.equal(decideDisconnectAction({ phase: "seek", role: "seeker", consented: false, hasOtherConnectedSeeker: false }), "pause_for_reconnect");
  assert.equal(decideDisconnectAction({ phase: "hide", role: "seeker", consented: false, hasOtherConnectedSeeker: false }), "pause_for_reconnect");
});

test("round continues when another Seeker is still connected", () => {
  assert.equal(decideDisconnectAction({ phase: "seek", role: "seeker", consented: false, hasOtherConnectedSeeker: true }), "continue");
});

test("intentional last-Seeker quit ends the round", () => {
  assert.equal(decideDisconnectAction({ phase: "seek", role: "seeker", consented: true, hasOtherConnectedSeeker: false }), "end_round");
});

test("lobby, result and Hider disconnects never trigger Seeker failover", () => {
  assert.equal(decideDisconnectAction({ phase: "lobby", role: "seeker", consented: false, hasOtherConnectedSeeker: false }), "continue");
  assert.equal(decideDisconnectAction({ phase: "result", role: "seeker", consented: false, hasOtherConnectedSeeker: false }), "continue");
  assert.equal(decideDisconnectAction({ phase: "seek", role: "hider", consented: false, hasOtherConnectedSeeker: false }), "continue");
});
