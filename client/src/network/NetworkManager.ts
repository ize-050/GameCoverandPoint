import { Client, Room } from "colyseus.js";
import { GameState } from "../schema/GameState";
import { JOIN_ERROR, type CharacterAppearance, type PublicRoomInfo } from "../../../shared/messages";
import { saveReconnectToken } from "./reconnect";
import { authManager } from "../auth/AuthManager";

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

  async createRoom(nickname: string, appearance: CharacterAppearance, visibility: "public" | "private" = "private", botCount = 0): Promise<Room<GameState>> {
    try {
      const room = await this.client.create<GameState>("game", { nickname, appearance, visibility, botCount, ...authManager.getRoomIdentity() });
      saveReconnectToken(room.reconnectionToken);
      return room;
    } catch (err) {
      throw toJoinError(err);
    }
  }

  async listPublicRooms(): Promise<PublicRoomInfo[]> {
    const rooms = await this.client.getAvailableRooms("game");
    return rooms
      .filter((room) => room.metadata?.visibility === "public" && Number(room.metadata?.playerCount ?? room.clients) < Number(room.metadata?.maxPlayers ?? 10))
      .map((room) => ({
        roomId: room.roomId,
        title: String(room.metadata?.title ?? "Public Office"),
        playerCount: Number(room.metadata?.playerCount ?? room.clients),
        maxPlayers: Number(room.metadata?.maxPlayers ?? 10),
      }));
  }

  async joinPublicRoom(roomId: string, nickname: string, appearance: CharacterAppearance): Promise<Room<GameState>> {
    try {
      const room = await this.client.joinById<GameState>(roomId, { nickname, appearance, ...authManager.getRoomIdentity() });
      saveReconnectToken(room.reconnectionToken);
      return room;
    } catch (err) {
      throw toJoinError(err);
    }
  }

  async quickPlay(nickname: string, appearance: CharacterAppearance): Promise<Room<GameState>> {
    const rooms = await this.listPublicRooms();
    if (rooms.length > 0) return this.joinPublicRoom(rooms.sort((a, b) => b.playerCount - a.playerCount)[0].roomId, nickname, appearance);
    return this.createRoom(nickname, appearance, "public");
  }

  async joinRoom(code: string, nickname: string, appearance: CharacterAppearance): Promise<Room<GameState>> {
    try {
      const room = await this.client.joinById<GameState>(code.toUpperCase(), { nickname, appearance, code: code.toUpperCase(), ...authManager.getRoomIdentity() });
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
