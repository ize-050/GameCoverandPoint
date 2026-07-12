import { Schema, type, MapSchema } from "@colyseus/schema";
import { Player } from "./Player";
import { CoverPoint } from "./CoverPoint";

export class GameState extends Schema {
  @type("string") phase: string = "lobby";
  @type("number") timeRemaining: number = 0;
  @type("number") round: number = 0;
  @type("number") matchRound: number = 0;
  @type("number") roundsPerMatch: number = 3;
  @type("boolean") matchComplete: boolean = false;
  @type("number") seekerCount: number = 1;
  @type("string") roomCode: string = "";
  @type("boolean") relocateActive: boolean = false;
  @type("boolean") exitUnlocked: boolean = false;
  @type("number") missionsCompleted: number = 0;
  @type("number") missionGoal: number = 4;
  @type({ map: "boolean" }) darkRooms = new MapSchema<boolean>();
  @type({ map: "boolean" }) collectedSmokeItems = new MapSchema<boolean>();
  @type({ map: "boolean" }) missions = new MapSchema<boolean>();
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: CoverPoint }) coverPoints = new MapSchema<CoverPoint>();
}

export { Player, CoverPoint };
