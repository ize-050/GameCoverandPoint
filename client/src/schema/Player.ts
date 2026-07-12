import { Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") nickname: string = "";
  @type("string") role: string = "none";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") anim: string = "idle";
  @type("number") rotY: number = 0;
  @type("boolean") isHidden: boolean = false;
  @type("number") hiddenUntil: number = 0;
  @type("string") coverPointId: string = "";
  @type("boolean") isCaught: boolean = false;
  @type("boolean") isEscaped: boolean = false;
  @type("number") score: number = 0;
  @type("boolean") isHost: boolean = false;
  @type("number") inspectsRemaining: number = 0;
  @type("boolean") speedBoosted: boolean = false;
  @type("boolean") hasSmokeBomb: boolean = false;
  @type("boolean") isDazed: boolean = false;
  @type("string") heldItem: string = "";
  @type("boolean") isStunned: boolean = false;
  @type("number") speedMultiplier: number = 1;

  @type("string") characterVariant: string = "a";
}
