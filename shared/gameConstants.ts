export const GAME_CONFIG = {
  MAX_PLAYERS: 10,
  // Solo test mode. Raise back to 4 before a production team-building session.
  MIN_PLAYERS: 1,
  HIDE_PHASE_SEC: 30,
  SEEK_PHASE_SEC: 180,
  ROLE_REVEAL_SEC: 5,
  RESULT_SEC: 10,
  HIDER_SPEED: 200,
  // Bumped back up from 216 (only 8% faster) — playtest feedback wanted the
  // seeker to feel noticeably quicker without being drastic.
  SEEKER_SPEED: 230,
  HIDE_RANGE_PX: 40,
  HIDE_MAX_DURATION_MS: 10000,
  HIDE_SPOT_COOLDOWN_MS: 12000,
  INSPECT_RANGE_PX: 40,
  INSPECT_COOLDOWN_MS: 3000,
  TAG_RANGE_PX: 45,
  EMOTE_COOLDOWN_MS: 2000,
  MOVE_RATE_HZ: 15,
  MAX_INSPECT_ATTEMPTS: 12,
  RELOCATE_INTERVAL_SEC: 45,
  RELOCATE_WINDOW_SEC: 12,
  DECOY_COOLDOWN_MS: 20000,
  ROOM_PROP_RANGE_PX: 55,
  WHITEBOARD_DECOY_COOLDOWN_MS: 25000,
  COFFEE_BOOST_COOLDOWN_MS: 30000,
  COFFEE_BOOST_DURATION_MS: 6000,
  COFFEE_BOOST_MULTIPLIER: 1.4,
  MONITOR_PEEK_COOLDOWN_MS: 20000,
  // Universal per-room light switch — any role can toggle any room's
  // lights via its physical switch prop (reuses ROOM_PROP_RANGE_PX for
  // interaction range). Numbers below are proportionally adapted from the
  // office-map-lights spec's 32px-tile-scale originals to this codebase's
  // existing continuous-coordinate scale (e.g. its 60px inspect range ->
  // our INSPECT_RANGE_PX=40 baseline), not copied verbatim.
  SWITCH_COOLDOWN_MS: 5000,
  MAX_DARK_ROOMS: 3,
  DARK_VISION_RADIUS_PX: 130,
  DARK_INSPECT_RANGE_PX: 32,
  // Bumped from 0.85 — with real (lit) GLB furniture in the scene, a merely
  // "dim" overlay still let shapes read through; this is close to fully
  // opaque so a dark room reads as an actual blackout, not just a tint.
  DARKNESS_ALPHA: 0.97,
  // Comedic toilet-use gimmick — short cooldown just to stop spam-triggering,
  // not a real strategic ability.
  TOILET_USE_COOLDOWN_MS: 4000,
  // Smoke-bomb pickup (hider-only): scattered collectible items (see
  // SMOKE_ITEM_SPAWNS in shared/mapLayout.ts), auto-picked-up by walking
  // near one, carried until used near a seeker to daze them (slower move
  // speed + a fogged screen) for a few seconds — a real scarce resource,
  // unlike the always-available cooldown-gated decoy ability.
  SMOKE_PICKUP_RANGE_PX: 30,
  SMOKE_ITEM_RESPAWN_MS: 25000,
  SMOKE_BLAST_RADIUS_PX: 110,
  SMOKE_DAZE_DURATION_MS: 4000,
  SMOKE_DAZE_SPEED_MULTIPLIER: 0.55,
  ITEM_USE_COOLDOWN_MS: 3000,
  STUN_DURATION_MS: 2500,
  STUN_TRAP_LIFETIME_MS: 45000,
  STUN_TRAP_TRIGGER_RANGE_PX: 28,
  MAX_STUN_TRAPS: 2,
  SPRINT_DURATION_MS: 4000,
  SPRINT_MULTIPLIER: 1.4,
  // Playtest feedback: missions could be chained instantly back-to-back —
  // a short cooldown after each completion forces some travel time between them.
  MISSION_COOLDOWN_MS: 12000,
  MISSION_INTERACTION_MS: 3000,
  EXIT_SCORE: 100,
  // Seeker's "scan" ability (F key) — a one-shot reveal of hidden hiders
  // within radius, sent as a private snapshot message (not a live schema
  // exposure) so it can't be exploited by just watching network traffic
  // continuously; the reveal is a fixed-in-time ping, not live tracking.
  SCAN_COOLDOWN_MS: 15000,
  SCAN_RADIUS_PX: 220,
  SCAN_REVEAL_DURATION_MS: 3000,
  // Seeker's "trace terminal" mission — a fixed-location, long-cooldown
  // reveal of EVERY hider's current position (not just nearby ones), same
  // one-shot-snapshot approach as scan, just bigger radius/payoff/cooldown.
  TRACE_COOLDOWN_MS: 60000,
  TRACE_REVEAL_DURATION_MS: 10000,
  SCORE: { SURVIVE: 100, CATCH: 50, FIRST_CATCH_BONUS: 20, LAST_SURVIVOR_BONUS: 50, RELOCATE_BONUS: 15 },
} as const;
