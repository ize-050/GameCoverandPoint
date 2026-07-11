import { Schema, type } from "@colyseus/schema";

export class CoverPoint extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") kind: string = "bush";
  @type("boolean") isOccupied: boolean = false;
}
