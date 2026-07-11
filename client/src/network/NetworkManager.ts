import { Client, Room } from "colyseus.js";
import { GameState } from "../schema/GameState";
import { JOIN_ERROR, type CharacterAppearance } from "../../../shared/messages";
import { saveReconnectToken } from "./reconnect";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";

export type JoinFailureReason = "NOT_FOUND" | "ROOM_FULL" | "GAME_ALREADY_STARTED";

export class JoinError extends Error {
  constructor(public reason: JoinFailureReason) {
    super(reason);
  }
}

function toJoinError(err: unknown): JoinError {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes(JOIN_ERROR.ROOM_FULL)) return new JoinError("ROOM_FULL");
  if (message.includes(JOIN_ERROR.GAME_ALREADY_STARTED)) return new JoinError("GAME_ALREADY_STARTED");
  return new JoinError("NOT_FOUND");
}

export class NetworkManager {
  private client = new Client(SERVER_URL);

  async createRoom(nickname: string, appearance: CharacterAppearance): Promise<Room<GameState>> {
    try {
      const room = await this.client.create<GameState>("game", { nickname, appearance });
      saveReconnectToken(room.reconnectionToken);
      return room;
    } catch (err) {
      throw toJoinError(err);
    }
  }

  async joinRoom(code: string, nickname: string, appearance: CharacterAppearance): Promise<Room<GameState>> {
    try {
      const room = await this.client.join<GameState>("game", { nickname, appearance, code: code.toUpperCase() });
      saveReconnectToken(room.reconnectionToken);
      return room;
    } catch (err) {
      throw toJoinError(err);
    }
  }

  async reconnect(token: string): Promise<Room<GameState>> {
    const room = await this.client.reconnect<GameState>(token);
    saveReconnectToken(room.reconnectionToken);
    return room;
  }
}
