import { Schema, type, MapSchema } from "@colyseus/schema";
import { Player } from "./Player.js";
import { CoverPoint } from "./CoverPoint.js";

export class GameState extends Schema {
  @type("string") phase: string = "lobby"; // lobby|role_reveal|hide|seek|result
  @type("number") timeRemaining: number = 0;
  @type("number") round: number = 0;
  @type("number") seekerCount: number = 1;
  @type("string") roomCode: string = "";
  // Recurring window during "seek" where hiders are encouraged to relocate
  // (bonus points for hiding successfully while it's open) — a reactive
  // flag, same pattern as `phase`, no separate message needed.
  @type("boolean") relocateActive: boolean = false;
  // Universal light-switch mechanic: presence of a room id key (value
  // `true`) means that room is currently dark. Any player can toggle any
  // room via its switch prop, capped at GAME_CONFIG.MAX_DARK_ROOMS at once.
  @type({ map: "boolean" }) darkRooms = new MapSchema<boolean>();
  // Smoke-bomb pickups: presence of a spawn id key (value `true`) means
  // that spot was already collected and is on cooldown until it respawns.
  @type({ map: "boolean" }) collectedSmokeItems = new MapSchema<boolean>();
  @type({ map: "boolean" }) missions = new MapSchema<boolean>();
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: CoverPoint }) coverPoints = new MapSchema<CoverPoint>();
}

export { Player, CoverPoint };
