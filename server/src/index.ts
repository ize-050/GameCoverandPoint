import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom.js";
import { GAME_CONFIG } from "./config/gameConfig.js";
import { createAppSession, getAuthConfig, verifyAppSession, verifyGoogleCredential } from "./auth/googleAuth.js";

const PORT = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());
const authConfig = getAuthConfig();

app.post("/auth/google", async (req, res) => {
  if (!authConfig.googleClientId || !authConfig.authSecret) {
    res.status(503).json({ error: "GOOGLE_AUTH_NOT_CONFIGURED" });
    return;
  }
  try {
    const user = await verifyGoogleCredential(String(req.body?.credential ?? ""), authConfig.googleClientId);
    if (!user) {
      res.status(401).json({ error: "INVALID_GOOGLE_CREDENTIAL" });
      return;
    }
    res.json({ token: createAppSession(user, authConfig.authSecret), user });
  } catch (error) {
    console.warn("Google sign-in rejected", error instanceof Error ? error.message : error);
    res.status(401).json({ error: "INVALID_GOOGLE_CREDENTIAL" });
  }
});

app.get("/auth/me", (req, res) => {
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const user = verifyAppSession(token, authConfig.authSecret);
  if (!user) {
    res.status(401).json({ error: "INVALID_SESSION" });
    return;
  }
  res.json({ user });
});
app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    release: "google-auth-mvp-v14",
    minPlayers: GAME_CONFIG.MIN_PLAYERS,
    googleAuth: Boolean(authConfig.googleClientId && authConfig.authSecret),
  })
);

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game", GameRoom).filterBy(["code"]);

gameServer.listen(PORT).then(() => {
  console.log(`hns-party server listening on ws://localhost:${PORT}`);
});
