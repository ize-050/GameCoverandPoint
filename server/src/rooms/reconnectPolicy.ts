export type DisconnectAction = "continue" | "pause_for_reconnect" | "end_round";

export function decideDisconnectAction(input: {
  phase: string;
  role?: string;
  consented: boolean;
  hasOtherConnectedSeeker: boolean;
}): DisconnectAction {
  const inRound = input.phase === "hide" || input.phase === "seek";
  if (!inRound || input.role !== "seeker" || input.hasOtherConnectedSeeker) return "continue";
  return input.consented ? "end_round" : "pause_for_reconnect";
}
