import { Schema, type, filter } from "@colyseus/schema";
import type { GameState } from "./GameState.js";

function occupancyFilter(this: CoverPoint, client: { sessionId: string }, _value: boolean, root: GameState): boolean {
  return root.players.get(client.sessionId)?.role !== "seeker";
}

export class CoverPoint extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") kind: string = "bush"; // "bush" | "crate" | "barrel" | "hay"
  // Only tells clients "someone is here" — the occupant's playerId is kept in
  // server memory (GameRoom's own Map), never in this schema. See spec 4.2.
  @filter(occupancyFilter) @type("boolean") isOccupied: boolean = false;
}
