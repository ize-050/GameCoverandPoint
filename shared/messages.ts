// Shared between client and server — message payload shapes and room-code format.
// Colyseus Schema classes are NOT here: they must be duplicated (decorated) in
// each side's own bundle, per Colyseus's client/server schema convention.

export const ROOM_CODE_LENGTH = 4;
// Avoid visually ambiguous characters (0/O, 1/I).
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const JOIN_ERROR = {
  ROOM_FULL: "ROOM_FULL",
  GAME_ALREADY_STARTED: "GAME_ALREADY_STARTED",
} as const;

// Character customization — not in the original spec, added on request.
// Each variant is one complete pre-made look (Kenney "Blocky Characters"
// pack) rather than a tintable color, since that pack bakes its color/texture
// per-variant — so customization is "pick one of 18 looks", not swatches.
export const CHARACTER_VARIANTS = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i",
  "j", "k", "l", "m", "n", "o", "p", "q", "r",
] as const;
export type CharacterVariantId = (typeof CHARACTER_VARIANTS)[number];

export interface CharacterAppearance {
  variant: CharacterVariantId;
}

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  variant: "a",
};

export interface CreateRoomOptions {
  nickname: string;
  appearance: CharacterAppearance;
  visibility?: "public" | "private";
  roomTitle?: string;
  botCount?: number;
}

export interface JoinRoomOptions {
  nickname: string;
  code: string;
  appearance: CharacterAppearance;
}

export interface PublicRoomInfo {
  roomId: string;
  title: string;
  playerCount: number;
  maxPlayers: number;
}

// client -> server
export interface MoveMessage {
  x: number;
  y: number;
  anim: string;
  rotY: number;
}

export interface CoverPointMessage {
  coverPointId: string;
}

export interface EmoteMessage {
  id: number; // 1-4
}

export interface StartGameMessage {
  seekerCount: number;
  roundsPerMatch?: 3 | 5;
}

// client -> server (hider triggers a room-prop gimmick by proximity + SPACE —
// see ROOM_PROPS in shared/mapLayout.ts for what propId can refer to)
export interface UsePropMessage {
  propId: string;
}

// server -> client (private)
export interface YourRoleMessage {
  role: "hider" | "seeker";
}

export interface CaughtMessage {
  byNickname: string;
}

export interface CatchSuccessMessage {
  targetNickname: string;
  points: number;
}

export interface InspectMissMessage {
  cooldownMs: number;
}

export interface CooldownMessage {
  remainingMs: number;
  coverPointId?: string;
}

// server -> all clients (broadcast)
export interface EmoteBroadcastMessage {
  sessionId: string;
  id: number;
}

// server -> seeker clients only (hider's decoy-noise ability)
export interface DecoyNoiseMessage {
  x: number;
  y: number;
}
export interface DecoySpawnedMessage {
  id: string;
  x: number;
  y: number;
  rotY: number;
  nickname: string;
  characterVariant: string;
  durationMs: number;
}

// server -> hider clients only (a seeker just walked into the server room —
// zero-payload, the alarm itself is the whole message)
export type ServerAlarmMessage = Record<string, never>;

// server -> seeker clients only (hider's whiteboard-decoy ability) — pure
// misdirection, the named room is never actually where any hider is
export interface WrongRoomHintMessage {
  roomName: string;
}

// server -> the triggering hider only (hider's monitor-peek ability)
export interface MonitorPeekMessage {
  roomName: string;
}

// server -> all clients (broadcast) — comedic toilet-use gimmick, purely
// cosmetic (plays a "sit" animation + flush sfx on whichever player triggered
// it, for every client that can see them).
export interface ToiletUseMessage {
  sessionId: string;
}

// server -> all clients (broadcast) — smoke bomb deployed at (x, y), pure
// visual feedback (the puff cloud everyone sees); the actual daze effect
// (Player.isDazed) is applied server-side directly to whichever seekers
// were in range, not carried in this message.
export interface SmokeDeployedMessage {
  x: number;
  y: number;
}

export type ItemKind = "smoke" | "decoy" | "stun" | "sprint";
export interface ItemPickedMessage { item: ItemKind }
export interface TrapMessage { id: string; x: number; y: number }

// server -> the triggering seeker only (private one-shot snapshot, never a
// live/continuous exposure) — hidden hiders caught within the scan/trace
// radius at the instant it fired. Position filtering still applies to
// everything else; this is a deliberate, cooldown-gated exception.
export interface RevealPingMessage {
  points: { x: number; y: number }[];
  durationMs: number;
}

export type CorporateEventKind = "mandatory_meeting" | "freeze_review" | "printer_meltdown";
export interface CorporateEventMessage {
  kind: CorporateEventKind;
  title: string;
  instruction: string;
  durationSec: number;
}

export interface MissionChallengeMessage {
  missionId: string;
  title: string;
  sequence: string[];
  durationMs: number;
}

export interface OfficePrankMessage {
  kind: "paper" | "mission_fail" | "ghost";
  x: number;
  y: number;
  nickname?: string;
}
