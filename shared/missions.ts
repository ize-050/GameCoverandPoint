import { ROOM_VISUALS } from "./mapLayout.js";

export interface MissionDef {
  id: string;
  roomId: string;
  title: string;
  description: string;
  propId: string;
}

const MISSION_POOL_BASE: MissionDef[] = [
  { id: "backup-server", roomId: "server", title: "BACK UP THE SERVER", description: "Secure the office data", propId: "server-alarm" },
  { id: "fix-tv", roomId: "lounge", title: "RESET THE LOUNGE TV", description: "Restore the break-room display", propId: "lounge-tv" },
  { id: "fix-leak", roomId: "toilet", title: "FIX THE LEAK", description: "Stop the restroom sink", propId: "toilet-sink" },
  { id: "submit-report", roomId: "work_a", title: "SUBMIT THE REPORT", description: "Send the team status report", propId: "worka-report" },
  { id: "erase-board", roomId: "meeting", title: "CLEAR THE WHITEBOARD", description: "Remove confidential notes", propId: "meeting-whiteboard" },
  { id: "brew-coffee", roomId: "work_b", title: "BREW EMERGENCY COFFEE", description: "Refuel the clock-out crew", propId: "workb-coffee" },
  { id: "print-badge", roomId: "reception", title: "PRINT AN EXIT BADGE", description: "Authorize the escape route", propId: "reception-monitor" },
];

// PART 2 final-polish pass (AI-SPEC-final-polish_1.md §2.2): every mission
// title gets its room name appended (e.g. "SUBMIT THE REPORT @ WORK ZONE A")
// so a new player immediately knows where to go — derived from
// ROOM_VISUALS, the same source the in-world door signage/floor lettering
// uses, so the two can never say different room names.
export const MISSION_POOL: MissionDef[] = MISSION_POOL_BASE.map((m) => ({
  ...m,
  title: `${m.title} @ ${ROOM_VISUALS[m.roomId].label}`,
}));

export const MISSIONS_PER_ROUND = 4;
export const ACTIVE_MISSIONS = 2;
export const MISSION_SCORE = 30;
export const ALL_MISSIONS_BONUS = 50;
