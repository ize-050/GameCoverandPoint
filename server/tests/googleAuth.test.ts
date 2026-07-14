import test from "node:test";
import assert from "node:assert/strict";
import { createAppSession, verifyAppSession, type AuthUser } from "../src/auth/googleAuth.js";

const user: AuthUser = { id: "google:123", displayName: "Test Employee", email: "test@example.com", picture: "", provider: "google" };

test("app session round-trips a verified Google user", () => {
  const token = createAppSession(user, "test-secret", 1000);
  assert.deepEqual(verifyAppSession(token, "test-secret", 1001), user);
});

test("app session rejects tampering and the wrong secret", () => {
  const token = createAppSession(user, "test-secret", 1000);
  assert.equal(verifyAppSession(`${token}x`, "test-secret", 1001), null);
  assert.equal(verifyAppSession(token, "wrong-secret", 1001), null);
});

test("app session expires after seven days", () => {
  const token = createAppSession(user, "test-secret", 1000);
  assert.equal(verifyAppSession(token, "test-secret", 1000 + 7 * 24 * 60 * 60), null);
});
