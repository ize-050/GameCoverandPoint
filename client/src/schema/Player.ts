import { Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") nickname: string = "";
  @type("string") role: string = "none";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") anim: string = "idle";
  @type("boolean") isHidden: boolean = false;
  @type("string") coverPointId: string = "";
  @type("boolean") isCaught: boolean = false;
  @type("number") score: number = 0;
  @type("boolean") isHost: boolean = false;
  @type("number") inspectsRemaining: number = 0;
  @type("boolean") speedBoosted: boolean = false;
  @type("boolean") hasSmokeBomb: boolean = false;
  @type("boolean") isDazed: boolean = false;

  @type("string") characterVariant: string = "a";
}
