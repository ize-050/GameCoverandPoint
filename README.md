# Hide & Seek Online — hns-party

Real-time multiplayer Hide & Seek party game for internal team building.
Built with Three.js + Vite (client) + Colyseus (server), per the spec at
`~/Desktop/AI-SPEC-hide-and-seek.md`.

## Structure

- `server/` — Colyseus room server (Node + TypeScript)
- `client/` — Phaser 3 game client (Vite + TypeScript)
- `shared/` — types/constants used by both sides (message shapes, room-code format, `GAME_CONFIG`)

## Run locally

```bash
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd client && npm install && npm run dev
```

Client dev server prints a local URL (default http://localhost:5173).
It connects to the Colyseus server at `ws://localhost:2567`.

## Supabase Google Login and progression

Guest play remains the default with a stable device-local Guest ID. Accounts,
profiles, XP/Level, coins, stats and match history use Supabase:

1. Create a Supabase project and run `supabase/migrations/202607150001_progression.sql`.
2. In Google Auth Platform, create a Web OAuth client. Add localhost, the Vercel
   URL and the custom domain as Authorized JavaScript origins. Add the callback
   URL shown on Supabase's Google provider page as an Authorized redirect URI.
3. Enable Google in Supabase Authentication → Providers and configure Site URL
   plus Redirect URLs for production and localhost.
4. Copy `client/.env.example` and `server/.env.example` for local development.

Production variables:

- Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Render: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`

The publishable key is intentionally safe for the browser. The secret key must
exist only on Render. Colyseus verifies the Supabase access token before showing
the account badge, calculates rewards server-side, and calls the protected
`record_match_result` database function after a complete 3/5-round match. RLS
allows clients to read only their own profile, stats, history and inventory.

## Progress (per spec section 7)

- [x] Phase 1 — skeleton: monorepo, Colyseus room with 4-char room codes (create/join,
      with distinct "not found" / "full" / "already started" errors), Phaser client
      with Menu → Game flow, players render and move with server-validated,
      15Hz-throttled position sync + remote-player interpolation
- [x] Phase 2 — map + collision: walls, 15 cover points, and role-specific spawn
      points generated in `shared/mapLayout.ts`; server rejects moves into walls,
      client slides along them; fullscreen resizable canvas
- [x] Phase 3 — roles + phase machine: full lobby → role_reveal → hide → seek →
      result → lobby cycle on a server-authoritative timer; host controls
      (seeker count, start, next round) in a dedicated `LobbyScene`; seeker ratio
      table with avoid-repeat-seeker logic; seeker movement blocked during HIDE;
      `ResultScene` with scoreboard/MVP/next-round
- [x] Phase 4 — hide / inspect / catch: `Player.x/y/coverPointId` carry a real
      per-client `@filter()` (spec 4.2 #1) so a seeker's own client never
      receives a hidden hider's true position over the wire — verified by
      reading each side's own decoded state, not just checking the renderer.
      1-point-1-person enforced server-side; catch awards score (+first-catch
      bonus) and flips the hider to ghost (invisible to non-ghosts, floats
      through walls); catching every hider ends the round immediately.
- [x] Phase 5 — polish:
      emotes (1–4 keys or click, ghosts can't emote, 2s server-side rate limit,
      floats above the sender for everyone including the opposite role, per spec 2.5);
      countdown turns red under 30s with a subtle shake + tick sound;
      flash-ring effect + sound on catch/caught/inspect-miss/round-win;
      **reconnect within 30s resumes the exact same seat** (score, role, position,
      appearance) via `Room.allowReconnection` + a stored `reconnectionToken` —
      verified with a real involuntary disconnect (not a clean `.leave()`) and a
      full page reload, not just a server-side check.
- [x] Phase 6 — deployed: Vercel client + Render server with `/health`

## Balance, movement, items, and camera

- Smooth 8-direction facing with shortest-angle damping, acceleration/deceleration,
  normalized diagonal movement, and synced remote rotation.
- Locked isometric camera with damped follow; zoom, drag rotation, and keyboard
  rotation are disabled for a consistent competitive viewport.
- Hider item boxes roll their contents server-side: Smoke, Decoy, Stun Trap, or
  Sprint. One held item per player, Q to use, and server-authoritative effects.
- Stun traps are sent only to hiders. Cover occupancy is filtered from seekers.

## Visual design pass (not a spec phase — user feedback)

Functionality carried Phases 1-5, but the look stayed flat rectangles and
unstyled dark forms. Did a real design pass instead of just adding features:

- Shared CSS design system in `client/index.html` (`.hns-panel`, `.hns-btn-*`,
  `.hns-input`, `.hns-swatch`, `.hns-code-pill`, etc.) reused across Menu/Lobby/
  Result instead of copy-pasted inline styles — gradients, glows, rounded
  cards, hover/disabled states.
- Character sprite redrawn chibi/anime-ish: oversized rounded head, big
  sparkly eyes with highlight dots, blush, a tiny smile, and a dark
  cel-shade outline on body/shirt/hats — no art assets or internet access to
  fetch real anime sprite sheets, so pushed the procedural shapes as far
  that direction as they'll go. Menu preview scaled up 3x with an idle bob
  so players can actually see their color/hat choices.
- Ground is a tileable mottled-grass texture instead of a flat fill; walls get
  a drop shadow + top highlight strip for a beveled look; cover-point icons
  (bush/crate/barrel/hay) got shading and a ground shadow instead of flat
  silhouettes.
- Result scoreboard is a styled DOM list (medals, MVP highlight row) instead
  of a monospace-padded text block.
- **Map roughly 4x bigger** (1600×1200 → 3200×2400, per user request — spec's
  own number was 1600×1200) with 4 corner rooms plus the sealed center seeker
  room (was 2 side rooms + center), a couple of standalone blocking walls for
  extra line-of-sight variety, 20 cover points (was 15), 12 hider spawns (was
  8), and a purely cosmetic decoration layer (flowers/rocks/grass tufts) so
  open ground doesn't read as empty — fixed-seed scatter so every client
  renders it identically, filtered to never land inside a wall.
  `shared/mapLayout.ts` now builds each room from a box + door-list spec
  instead of hand-computed wall rectangles, since hand-authoring that many
  segments directly stopped being maintainable.
- **In-game controls/tutorial**: a "❓" button in `GameScene` (top-right,
  always available) toggles a panel explaining the controls and the hide/seek
  mechanic in plain terms; `MenuScene` shows a condensed version by default
  before a player has even joined a room.

## Added beyond the spec

- **Character customization** — players pick a skin color, shirt color, and hat
  (none/cap/cone/band) in the menu before joining. Rendered as layered colored
  shapes (no external art needed), synced via `Player` schema fields
  (`skinColor`, `shirtColor`, `hat`), validated server-side in `GameRoom.onJoin`.

## Known simplifications (temporary, flagged for later phases)

- No real sprites/walk animation — spec makes this conditional on having
  Kenney art assets ("ถ้ามี asset"), which aren't available in this environment;
  stayed with the colored-shape fallback throughout.
- SFX are procedurally synthesized (Web Audio oscillator beeps), not Kenney
  audio files, for the same reason.
- Cover-point occupancy (`GameRoom.coverOccupants`) and inspect cooldowns live
  in plain server memory, not schema — matches spec 4.2's instruction to never
  expose occupant identity, but also means they reset if the room restarts.

## Bugs found and fixed during development

- `LobbyScene`/`GameScene`/`ResultScene` only reacted to *future* phase changes
  (`room.onStateChange`), never checking the phase they were already handed on
  creation. A reconnect landing mid-round would get stuck in the wrong scene
  forever, since nothing was going to change again. Fixed by having each scene
  self-correct once immediately in `create()`.
