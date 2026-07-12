import { Schema, type, filter } from "@colyseus/schema";
import type { GameState } from "./GameState.js";

// Anti-cheat (spec 4.2 #1): a hider's exact position/hiding-spot must never
// reach a seeker's client — not even to peek at over the network. Colyseus
// encodes a different byte patch per client when any @filter() is present
// (see @colyseus/schema's Schema#applyFilters), so this is enforced at the
// wire level, not just in rendering.
function isPositionSensitive(player: Player, root: GameState): boolean {
  return player.isHidden || (root.phase === "hide" && player.role === "hider");
}

function positionFilter(this: Player, client: { sessionId: string }, _value: number, root: GameState): boolean {
  if (!isPositionSensitive(this, root)) return true;
  if (client.sessionId === this.id) return true; // you can always see yourself
  return root.players.get(client.sessionId)?.role !== "seeker";
}

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") nickname: string = "";
  @type("string") role: string = "none"; // "hider" | "seeker" | "none"
  @filter(positionFilter) @type("number") x: number = 0;
  @filter(positionFilter) @type("number") y: number = 0;
  @type("string") anim: string = "idle";
  @type("number") rotY: number = 0;
  @type("boolean") isHidden: boolean = false;
  // Which cover point you're at would reveal your exact position just as much
  // as x/y would (it's a lookup into a publicly-known list of coordinates).
  @filter(positionFilter) @type("string") coverPointId: string = "";
  @type("boolean") isCaught: boolean = false;
  @type("boolean") isEscaped: boolean = false;
  @type("number") score: number = 0;
  @type("boolean") isHost: boolean = false;
  @type("boolean") isReady: boolean = false;
  @type("boolean") isBot: boolean = false;
  // Seeker's total inspect budget for the round (spec: no more infinite
  // sweep-every-cover-point). Unused/0 for hiders. Not filtered — safe to
  // reveal like score/isCaught, no anti-cheat concern.
  @type("number") inspectsRemaining: number = 0;
  // Coffee-boost gimmick (break room). Doesn't reveal position, just a
  // temporary speed multiplier — safe unfiltered like isCaught.
  @type("boolean") speedBoosted: boolean = false;
  // Smoke-bomb pickup item. Doesn't reveal position — safe unfiltered.
  @type("boolean") hasSmokeBomb: boolean = false;
  @type("boolean") isDazed: boolean = false;
  @type("string") heldItem: string = "";
  @type("boolean") isStunned: boolean = false;
  @type("number") speedMultiplier: number = 1;

  // Character customization (not in original spec, added on request) — one
  // of CHARACTER_VARIANTS in shared/messages.ts (Kenney "Blocky Characters"
  // pre-made look, not a tintable color).
  @type("string") characterVariant: string = "a";
}
