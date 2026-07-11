import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom.js";

const PORT = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game", GameRoom).filterBy(["code"]);

gameServer.listen(PORT).then(() => {
  console.log(`hns-party server listening on ws://localhost:${PORT}`);
});
