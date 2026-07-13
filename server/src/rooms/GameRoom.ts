import { Room, Client, matchMaker } from "@colyseus/core";
import { GameState } from "../schema/GameState.js";
import { Player } from "../schema/Player.js";
import { GAME_CONFIG } from "../config/gameConfig.js";
import { MAP_WIDTH, MAP_HEIGHT } from "../../../shared/mapConfig.js";
import {
  COVER_POINTS,
  ROOMS,
  ROOM_PROPS,
  SEEKER_SPAWN,
  SMOKE_ITEM_SPAWNS,
  randomHiderSpawn,
  collidesWithAnyWall,
  resolveWallSlide,
  findRoomAt,
} from "../../../shared/mapLayout.js";
import { CoverPoint } from "../schema/CoverPoint.js";
import {
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  JOIN_ERROR,
  CHARACTER_VARIANTS,
  DEFAULT_APPEARANCE,
  type CreateRoomOptions,
  type JoinRoomOptions,
  type MoveMessage,
  type StartGameMessage,
  type CoverPointMessage,
  type EmoteMessage,
  type UsePropMessage,
  type ItemKind,
} from "../../../shared/messages.js";
import { MISSION_POOL, MISSIONS_PER_ROUND, ACTIVE_MISSIONS, MISSION_SCORE, ALL_MISSIONS_BONUS } from "../../../shared/missions.js";

const BOT_TICK_MS = Math.round(1000 / GAME_CONFIG.MOVE_RATE_HZ);

// Looks identical to a real cover point client-side, but can never actually
// hide anyone — computed once from the shared map data rather than kept in
// schema, since @colyseus/schema syncs whatever fields exist and this must
// never reach clients (would give away decoys instantly).
function shuffled<T>(arr: T[]): T[] {
  return arr
    .map((item) => ({ item, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(({ item }) => item);
}

function sanitizeAppearance(input: unknown) {
  const raw = (input ?? {}) as { variant?: unknown };
  return {
    variant: typeof raw.variant === "string" && (CHARACTER_VARIANTS as readonly string[]).includes(raw.variant) ? raw.variant : DEFAULT_APPEARANCE.variant,
  };
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export class GameRoom extends Room<GameState> {
  // Real player cap is enforced in onAuth (so we control the rejection message);
  // maxClients here just guards against runaway seat reservations.
  maxClients = 64;

  private nextJoinSeq = 0;
  private joinSeq = new Map<string, number>();
  private lastMoveAt = new Map<string, number>();
  private previousSeekerIds = new Set<string>();
  // Cover-point occupancy lives ONLY here, never in schema — the schema only
  // exposes CoverPoint.isOccupied (spec 4.2: never expose occupant identity).
  private coverOccupants = new Map<string, string>();
  private inspectCooldownUntil = new Map<string, number>();
  private lastEmoteAt = new Map<string, number>();
  private decoyCooldownUntil = new Map<string, number>();
  private switchCooldownUntil = new Map<string, number>();
  private lastRoomId = new Map<string, string>();
  private whiteboardCooldownUntil = new Map<string, number>();
  private coffeeCooldownUntil = new Map<string, number>();
  private monitorCooldownUntil = new Map<string, number>();
  private toiletUseCooldownUntil = new Map<string, number>();
  private firstCatchAwarded = false;
  private itemCooldownUntil = new Map<string, number>();
  private stunTraps: Array<{ id: string; x: number; y: number; ownerId: string }> = [];
  private survivalMilestones = new Set<number>();
  private missionCooldownUntil = new Map<string, number>();
  private missionStartedAt = new Map<string, { missionId: string; startedAt: number }>();
  private missionQueue: typeof MISSION_POOL = [];
  private scanCooldownUntil = new Map<string, number>();
  private traceCooldownUntil = new Map<string, number>();
  private roundDecoyCoverPointIds = new Set<string>();
  private personalHideCooldownUntil = new Map<string, number>();
  private botTargets = new Map<string, { x: number; y: number }>();
  private isPublicRoom = false;
  private roomTitle = "Public Office";

  async onCreate(options: CreateRoomOptions) {
    this.setState(new GameState());
    this.isPublicRoom = options.visibility === "public";
    this.roomTitle = String(options.roomTitle || "Public Office").slice(0, 28);
    this.setPrivate(!this.isPublicRoom);
    await this.setMetadata({ title: this.roomTitle, visibility: this.isPublicRoom ? "public" : "private", playerCount: 0, maxPlayers: GAME_CONFIG.MAX_PLAYERS, phase: "lobby" });

    const code = await this.generateUniqueCode();
    this.roomId = code;
    this.state.roomCode = code;
    // filterBy(["code"]) matches against top-level listing fields (populated from
    // the room-creator's own options), not this.metadata — the code only exists
    // *after* onCreate runs, so it must be written directly to the listing + saved.
    (this.listing as unknown as { code: string }).code = code;
    await this.listing.save();

    for (const cp of COVER_POINTS) {
      const coverPoint = new CoverPoint();
      coverPoint.id = cp.id;
      coverPoint.x = cp.x;
      coverPoint.y = cp.y;
      coverPoint.kind = cp.kind;
      this.state.coverPoints.set(cp.id, coverPoint);
    }

    this.onMessage("move", (client, message: MoveMessage) => this.handleMove(client, message));
    this.onMessage("startGame", (client, message: StartGameMessage) => this.handleStartGame(client, message));
    this.onMessage("hide", (client, message: CoverPointMessage) => this.handleHide(client, message));
    this.onMessage("unhide", (client) => this.handleUnhide(client));
    this.onMessage("inspect", (client, message: CoverPointMessage) => this.handleInspect(client, message));
    this.onMessage("tag", (client) => this.handleTag(client));
    this.onMessage("emote", (client, message: EmoteMessage) => this.handleEmote(client, message));
    this.onMessage("decoy", (client) => this.handleDecoy(client));
    this.onMessage("useProp", (client, message: UsePropMessage) => this.handleUseProp(client, message));
    this.onMessage("useSmoke", (client) => this.handleUseSmoke(client));
    this.onMessage("scanPulse", (client) => this.handleScanPulse(client));
    this.onMessage("useItem", (client) => this.handleUseItem(client));
    this.onMessage("completeMission", (client, message: { missionId?: string }) => this.handleCompleteMission(client, message));
    this.onMessage("startMission", (client, message: { missionId?: string }) => this.handleStartMission(client, message));
    this.onMessage("cancelMission", (client) => this.missionStartedAt.delete(client.sessionId));
    this.onMessage("toggleReady", (client) => this.handleToggleReady(client));
    this.onMessage("kickPlayer", (client, message: { playerId?: string }) => this.handleKickPlayer(client, message));
    this.onMessage("addBot", (client) => this.handleAddBot(client));
    this.onMessage("removeBot", (client) => this.handleRemoveBot(client));

    this.clock.setInterval(() => this.tick(), 1000);
    // Matches MOVE_RATE_HZ (real players' move-message cadence) — bots used
    // to tick at a flat 250ms, four times slower, which read as visibly
    // jerky since RemotePlayer3D's per-frame lerp toward the last known
    // position fully settles well before the next update arrives.
    this.clock.setInterval(() => this.tickBots(), BOT_TICK_MS);

    this.addBots(Math.min(8, Math.max(0, Math.floor(Number(options.botCount) || 0))));

    console.log(`Room created: ${code}`);
  }

  private tick() {
    this.checkAfkPlayers();
    if (this.state.phase === "lobby") return;

    if (this.state.phase === "seek") {
      this.updateRelocateWindow();
      const elapsed = GAME_CONFIG.SEEK_PHASE_SEC - this.state.timeRemaining;
      if (elapsed > 0 && elapsed % 60 === 0 && !this.survivalMilestones.has(elapsed)) {
        this.survivalMilestones.add(elapsed);
        this.state.players.forEach((p) => {
          if (p.role === "hider" && !p.isCaught) p.score += 25;
        });
        this.broadcastToHiders("survivalBonus", { points: 25 });
      }
    }

    this.state.timeRemaining = Math.max(0, this.state.timeRemaining - 1);
    if (this.state.timeRemaining > 0) return;

    if (this.state.phase === "role_reveal") this.beginHidePhase();
    else if (this.state.phase === "hide") this.beginSeekPhase();
    else if (this.state.phase === "seek") this.endRound();
    else if (this.state.phase === "result") {
      if (this.state.matchRound < this.state.roundsPerMatch) {
        this.state.matchRound += 1;
        this.state.round += 1;
        this.beginRound();
      } else {
        this.state.matchComplete = true;
        this.beginLobby();
      }
    }
  }

  // Recurring "come out and relocate" window during the seek phase, computed
  // from elapsed time rather than a separate timer so it can't drift out of
  // sync with the per-second tick that already drives timeRemaining.
  private updateRelocateWindow() {
    const elapsed = GAME_CONFIG.SEEK_PHASE_SEC - this.state.timeRemaining;
    const cyclePos = ((elapsed % GAME_CONFIG.RELOCATE_INTERVAL_SEC) + GAME_CONFIG.RELOCATE_INTERVAL_SEC) % GAME_CONFIG.RELOCATE_INTERVAL_SEC;
    this.state.relocateActive = cyclePos < GAME_CONFIG.RELOCATE_WINDOW_SEC;
  }

  private updateListing() {
    void this.setMetadata({
      title: this.roomTitle,
      playerCount: this.state.players.size,
      maxPlayers: GAME_CONFIG.MAX_PLAYERS,
      phase: this.state.phase,
      visibility: this.isPublicRoom ? "public" : "private",
    });
  }

  private addBots(count: number) {
    for (let i = 0; i < count && this.state.players.size < GAME_CONFIG.MAX_PLAYERS; i++) {
      const bot = new Player();
      bot.id = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      bot.nickname = `Office Bot ${this.state.players.size + 1}`;
      bot.isBot = true;
      bot.isReady = true;
      bot.characterVariant = CHARACTER_VARIANTS[Math.floor(Math.random() * CHARACTER_VARIANTS.length)];
      const spawn = randomHiderSpawn();
      bot.x = spawn.x;
      bot.y = spawn.y;
      this.state.players.set(bot.id, bot);
    }
    this.updateListing();
  }

  private handleAddBot(client: Client) {
    if (this.state.phase !== "lobby" || !this.state.players.get(client.sessionId)?.isHost) return;
    this.addBots(1);
  }

  private handleRemoveBot(client: Client) {
    if (this.state.phase !== "lobby" || !this.state.players.get(client.sessionId)?.isHost) return;
    const botId = [...this.state.players.values()].find((player) => player.isBot)?.id;
    if (botId) this.state.players.delete(botId);
    this.updateListing();
  }

  private handleToggleReady(client: Client) {
    if (this.state.phase !== "lobby") return;
    const player = this.state.players.get(client.sessionId);
    if (!player || player.isBot) return;
    player.isReady = !player.isReady;
    this.lastMoveAt.set(client.sessionId, Date.now());
  }

  private handleKickPlayer(client: Client, message: { playerId?: string }) {
    const host = this.state.players.get(client.sessionId);
    if (this.state.phase !== "lobby" || !host?.isHost || !message.playerId || message.playerId === client.sessionId) return;
    const targetPlayer = this.state.players.get(message.playerId);
    if (targetPlayer?.isBot) {
      this.state.players.delete(message.playerId);
      this.updateListing();
      return;
    }
    const targetClient = this.clients.find((candidate) => candidate.sessionId === message.playerId);
    targetClient?.leave(4001, "KICKED_BY_HOST");
  }

  private checkAfkPlayers() {
    const now = Date.now();
    for (const client of this.clients) {
      if (now - (this.lastMoveAt.get(client.sessionId) ?? now) < GAME_CONFIG.AFK_TIMEOUT_MS) continue;
      client.send("afkRemoved", {});
      client.leave(4002, "AFK_TIMEOUT");
    }
  }

  private tickBots() {
    if (this.state.phase !== "hide" && this.state.phase !== "seek") return;
    const dt = BOT_TICK_MS / 1000;
    const bots = [...this.state.players.values()].filter((player) => player.isBot && !player.isCaught && !player.isEscaped);
    for (const bot of bots) {
      if (bot.role === "seeker" && this.state.phase === "hide") continue;
      if (bot.isHidden) continue;

      let target: { x: number; y: number } | undefined;
      if (bot.role === "seeker") {
        const exposed = [...this.state.players.values()]
          .filter((player) => player.role === "hider" && !player.isCaught && !player.isEscaped && !player.isHidden)
          .sort((a, b) => Math.hypot(bot.x - a.x, bot.y - a.y) - Math.hypot(bot.x - b.x, bot.y - b.y))[0];
        if (exposed) {
          target = exposed;
          if (Math.hypot(bot.x - exposed.x, bot.y - exposed.y) <= GAME_CONFIG.TAG_RANGE_PX) {
            this.resolveCatch(undefined, bot, exposed);
            continue;
          }
        } else {
          const occupied = [...this.coverOccupants.keys()][0];
          const cp = occupied ? this.state.coverPoints.get(occupied) : undefined;
          if (cp) {
            target = cp;
            if (Math.hypot(bot.x - cp.x, bot.y - cp.y) <= GAME_CONFIG.INSPECT_RANGE_PX) {
              const hider = this.state.players.get(this.coverOccupants.get(cp.id) ?? "");
              this.coverOccupants.delete(cp.id);
              cp.isOccupied = false;
              this.resolveCatch(undefined, bot, hider);
              continue;
            }
          }
        }
      } else {
        const nearby = [...this.state.coverPoints.values()].find((cp) =>
          !cp.isOccupied && !this.roundDecoyCoverPointIds.has(cp.id) && Math.hypot(bot.x - cp.x, bot.y - cp.y) < GAME_CONFIG.HIDE_RANGE_PX
        );
        if (nearby && Math.random() < 0.18) {
          nearby.isOccupied = true;
          this.coverOccupants.set(nearby.id, bot.id);
          bot.isHidden = true;
          bot.coverPointId = nearby.id;
          this.clock.setTimeout(() => {
            if (!bot.isHidden || bot.coverPointId !== nearby.id) return;
            this.freeCoverPoint(nearby.id, bot.id);
            bot.isHidden = false;
            bot.coverPointId = "";
          }, GAME_CONFIG.BOT_HIDE_DURATION_MS);
          continue;
        }
      }

      if (!target) {
        let roam = this.botTargets.get(bot.id);
        if (!roam || Math.hypot(bot.x - roam.x, bot.y - roam.y) < 30) {
          roam = randomHiderSpawn();
          this.botTargets.set(bot.id, roam);
        }
        target = roam;
      }
      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const speed = bot.role === "seeker" ? GAME_CONFIG.SEEKER_SPEED : GAME_CONFIG.HIDER_SPEED;
      const desiredX = bot.x + (dx / distance) * Math.min(distance, speed * dt);
      const desiredY = bot.y + (dy / distance) * Math.min(distance, speed * dt);
      // Slide along whichever axis is still open (same resolveWallSlide a
      // real player's client prediction uses) instead of freezing solid the
      // instant the direct line to the target clips a wall corner.
      const resolved = resolveWallSlide(bot.x, bot.y, desiredX, desiredY, 16);
      const moved = Math.hypot(resolved.x - bot.x, resolved.y - bot.y);
      if (moved > 0.5) {
        bot.x = resolved.x;
        bot.y = resolved.y;
        bot.rotY = Math.atan2(dx, dy);
        bot.anim = "walk";
      } else {
        // Genuinely blocked on both axes — drop this target so the next
        // tick picks a fresh one instead of grinding against the same wall.
        this.botTargets.delete(bot.id);
      }
    }
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateCode();
      const existing = await matchMaker.query({ name: "game" });
      if (!existing.some((room) => (room as unknown as { code?: string }).code === code)) return code;
    }
    return generateCode();
  }

  async onAuth(_client: Client, options: JoinRoomOptions | CreateRoomOptions) {
    if (this.state.phase !== "lobby") {
      throw new Error(JOIN_ERROR.GAME_ALREADY_STARTED);
    }
    if (this.state.players.size >= GAME_CONFIG.MAX_PLAYERS) {
      throw new Error(JOIN_ERROR.ROOM_FULL);
    }
    return options;
  }

  onJoin(client: Client, options: CreateRoomOptions) {
    const seq = this.nextJoinSeq++;
    this.joinSeq.set(client.sessionId, seq);
    this.lastMoveAt.set(client.sessionId, Date.now());

    const player = new Player();
    player.id = client.sessionId;
    player.nickname = (options.nickname || `Player-${client.sessionId.slice(0, 4)}`).slice(0, 12);
    player.isHost = seq === 0;
    // No roles yet (lands in Phase 3) — spawn everyone at a hider edge point,
    // since the seeker room's spawn is reserved for that role specifically.
    const spawn = randomHiderSpawn();
    player.x = spawn.x;
    player.y = spawn.y;

    const appearance = sanitizeAppearance((options as CreateRoomOptions | JoinRoomOptions).appearance);
    player.characterVariant = appearance.variant;

    this.state.players.set(client.sessionId, player);
    this.updateListing();
  }

  private hasConnectedSeeker(): boolean {
    return this.clients.some((c) => this.state.players.get(c.sessionId)?.role === "seeker");
  }

  async onLeave(client: Client, consented: boolean) {
    const leavingPlayer = this.state.players.get(client.sessionId);
    const wasHost = leavingPlayer?.isHost;

    // DoD: don't let the round hang on a disconnected seeker. Checked immediately
    // against currently-connected clients — independent of the reconnection grace
    // window below, so a flaky wifi drop still ends the round right away for
    // everyone else even though the seeker personally gets a chance to rejoin.
    if ((this.state.phase === "hide" || this.state.phase === "seek") && leavingPlayer?.role === "seeker" && !this.hasConnectedSeeker()) {
      this.endRound();
    }

    // Phase 5: reconnect within 30s and resume the same seat/state (spec DoD).
    if (!consented) {
      try {
        await this.allowReconnection(client, 30);
        return; // reconnected — player entry was never removed, nothing else to do
      } catch {
        // grace period expired — fall through to full cleanup
      }
    }

    if (leavingPlayer?.isHidden) this.freeCoverPoint(leavingPlayer.coverPointId, client.sessionId);

    this.state.players.delete(client.sessionId);
    this.joinSeq.delete(client.sessionId);
    this.lastMoveAt.delete(client.sessionId);
    this.inspectCooldownUntil.delete(client.sessionId);
    this.lastEmoteAt.delete(client.sessionId);
    this.decoyCooldownUntil.delete(client.sessionId);
    this.switchCooldownUntil.delete(client.sessionId);
    this.lastRoomId.delete(client.sessionId);
    this.whiteboardCooldownUntil.delete(client.sessionId);
    this.coffeeCooldownUntil.delete(client.sessionId);
    this.monitorCooldownUntil.delete(client.sessionId);
    this.toiletUseCooldownUntil.delete(client.sessionId);
    this.itemCooldownUntil.delete(client.sessionId);
    this.missionCooldownUntil.delete(client.sessionId);
    this.missionStartedAt.delete(client.sessionId);
    this.scanCooldownUntil.delete(client.sessionId);
    this.traceCooldownUntil.delete(client.sessionId);

    if (wasHost) this.migrateHost();
    this.updateListing();
  }

  private handleEmote(client: Client, message: EmoteMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.isCaught) return; // ghosts can't emote (spec 2.5/2.3)
    if (!Number.isInteger(message?.id) || message.id < 1 || message.id > 4) return;

    const now = Date.now();
    const last = this.lastEmoteAt.get(client.sessionId) ?? 0;
    if (now - last < GAME_CONFIG.EMOTE_COOLDOWN_MS) return;
    this.lastEmoteAt.set(client.sessionId, now);

    this.broadcast("emote", { sessionId: client.sessionId, id: message.id });
  }

  private migrateHost() {
    const nextId = [...this.joinSeq.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
    if (!nextId) return;
    const next = this.state.players.get(nextId);
    if (next) next.isHost = true;
  }

  private handleStartGame(client: Client, message: StartGameMessage) {
    if (this.state.phase !== "lobby") return;
    const player = this.state.players.get(client.sessionId);
    if (!player?.isHost) return;
    if (this.state.players.size < GAME_CONFIG.MIN_PLAYERS) return;
    const unreadyHuman = [...this.state.players.values()].some((candidate) => !candidate.isBot && !candidate.isHost && !candidate.isReady);
    if (unreadyHuman) return;

    this.state.seekerCount = this.clampSeekerCount(message?.seekerCount);
    this.state.roundsPerMatch = message?.roundsPerMatch === 5 ? 5 : 3;
    this.state.matchRound = 1;
    this.state.matchComplete = false;
    this.state.players.forEach((candidate) => (candidate.score = 0));
    this.state.round += 1;
    this.beginRound();
    this.updateListing();
  }

  private maxSeekersFor(playerCount: number): number {
    return playerCount <= 5 ? 1 : 2; // spec 2.1 ratio table caps at 2 seekers
  }

  private clampSeekerCount(requested: unknown): number {
    const n = this.state.players.size;
    const max = this.maxSeekersFor(n);
    const fallback = Math.max(1, Math.floor(n / 5));
    const value = typeof requested === "number" && Number.isFinite(requested) ? Math.round(requested) : fallback;
    return Math.min(max, Math.max(1, value));
  }

  private assignRoles() {
    const ids = [...this.state.players.keys()];
    const seekerCount = Math.min(this.clampSeekerCount(this.state.seekerCount), ids.length - 1);

    const fresh = shuffled(ids.filter((id) => !this.previousSeekerIds.has(id)));
    const stale = shuffled(ids.filter((id) => this.previousSeekerIds.has(id)));
    // Prefer players who weren't seeker last round (spec 2.1: avoid repeats when avoidable).
    const seekerIds = [...fresh, ...stale].slice(0, seekerCount);
    const seekerSet = new Set(seekerIds);

    ids.forEach((id) => {
      const player = this.state.players.get(id)!;
      player.role = seekerSet.has(id) ? "seeker" : "hider";
      player.isCaught = false;
      player.isEscaped = false;
      player.isHidden = false;
      player.coverPointId = "";
      player.inspectsRemaining = seekerSet.has(id) ? GAME_CONFIG.MAX_INSPECT_ATTEMPTS : 0;
      player.speedBoosted = false;
      player.hasSmokeBomb = false;
      player.isDazed = false;
      player.heldItem = "";
      player.isStunned = false;
      player.speedMultiplier = 1;
    });

    this.previousSeekerIds = seekerSet;
  }

  private beginRound() {
    this.lock();
    this.assignRoles();
    this.firstCatchAwarded = false;
    this.coverOccupants.clear();
    this.inspectCooldownUntil.clear();
    this.decoyCooldownUntil.clear();
    this.switchCooldownUntil.clear();
    this.lastRoomId.clear();
    this.whiteboardCooldownUntil.clear();
    this.coffeeCooldownUntil.clear();
    this.monitorCooldownUntil.clear();
    this.toiletUseCooldownUntil.clear();
    this.itemCooldownUntil.clear();
    this.missionCooldownUntil.clear();
    this.missionStartedAt.clear();
    this.scanCooldownUntil.clear();
    this.traceCooldownUntil.clear();
    this.personalHideCooldownUntil.clear();
    // Furniture stays coherent with the office, but which pieces are genuine
    // cover changes every round. The remainder behave as indistinguishable
    // decoys, so memorising last round's answers does not help.
    this.roundDecoyCoverPointIds = new Set(
      shuffled(COVER_POINTS).slice(0, Math.floor(COVER_POINTS.length * 0.32)).map((cp) => cp.id)
    );
    this.stunTraps = [];
    this.survivalMilestones.clear();
    this.state.relocateActive = false;
    this.state.exitUnlocked = false;
    this.state.darkRooms.clear();
    this.state.collectedSmokeItems.clear();
    this.state.missions.clear();
    this.missionQueue = shuffled(MISSION_POOL).slice(0, MISSIONS_PER_ROUND);
    this.state.missionsCompleted = 0;
    this.state.missionGoal = MISSIONS_PER_ROUND;
    this.state.phase = "role_reveal";
    this.state.timeRemaining = GAME_CONFIG.ROLE_REVEAL_SEC;
    this.updateListing();

    this.clients.forEach((c) => {
      const player = this.state.players.get(c.sessionId);
      if (player) c.send("yourRole", { role: player.role });
    });
  }

  private beginHidePhase() {
    this.state.coverPoints.forEach((cp) => (cp.isOccupied = false));
    this.state.players.forEach((player) => {
      if (player.role === "seeker") {
        player.x = SEEKER_SPAWN.x + (Math.random() * 40 - 20);
        player.y = SEEKER_SPAWN.y + (Math.random() * 40 - 20);
      } else {
        const spawn = randomHiderSpawn();
        player.x = spawn.x;
        player.y = spawn.y;
      }
    });

    this.state.phase = "hide";
    this.state.timeRemaining = GAME_CONFIG.HIDE_PHASE_SEC;
  }

  private beginSeekPhase() {
    this.state.phase = "seek";
    this.state.timeRemaining = GAME_CONFIG.SEEK_PHASE_SEC;
    this.activateNextMissions();
  }

  private activateNextMissions() {
    while (this.state.missions.size < ACTIVE_MISSIONS && this.missionQueue.length > 0) {
      const mission = this.missionQueue.shift()!;
      this.state.missions.set(mission.id, false);
    }
  }

  private endRound() {
    const hiders = [...this.state.players.values()].filter((p) => p.role === "hider");
    const survivors = hiders.filter((p) => p.isEscaped);

    for (const survivor of survivors) survivor.score += GAME_CONFIG.SCORE.SURVIVE;
    if (survivors.length === 1) survivors[0].score += GAME_CONFIG.SCORE.LAST_SURVIVOR_BONUS;

    this.state.relocateActive = false;
    this.state.darkRooms.clear();
    this.state.phase = "result";
    this.state.timeRemaining = GAME_CONFIG.RESULT_SEC;
  }

  private beginLobby() {
    this.state.phase = "lobby";
    this.state.timeRemaining = 0;
    this.state.players.forEach((player) => (player.isReady = player.isBot));
    this.unlock();
    this.updateListing();
  }

  private handleMove(client: Client, message: MoveMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (this.state.phase !== "hide" && this.state.phase !== "seek") return;
    if (this.state.phase === "hide" && player.role === "seeker") return; // blacked out, can't move
    if (player.isStunned) return;
    if (player.isHidden) return; // must send "unhide" first — SPACE toggles, WASD doesn't

    const now = Date.now();
    const dt = Math.max(1, now - (this.lastMoveAt.get(client.sessionId) ?? now - 1)) / 1000;
    const maxSpeed = Math.max(GAME_CONFIG.HIDER_SPEED, GAME_CONFIG.SEEKER_SPEED);
    const maxDist = maxSpeed * dt * 1.5;

    const dist = Math.hypot(message.x - player.x, message.y - player.y);
    if (dist > maxDist) return; // reject implausible jump, per spec 4.2 #3

    const nextX = Math.max(0, Math.min(MAP_WIDTH, message.x));
    const nextY = Math.max(0, Math.min(MAP_HEIGHT, message.y));
    if (!player.isCaught && collidesWithAnyWall(nextX, nextY)) return; // ghosts float through walls

    player.x = nextX;
    player.y = nextY;
    player.anim = message.anim;
    if (Number.isFinite(message.rotY)) player.rotY = message.rotY;
    this.lastMoveAt.set(client.sessionId, now);

    if (player.role === "seeker") this.checkStunTraps(player);

    if (player.role === "seeker") this.checkServerRoomAlarm(client.sessionId, player);
    else if (player.role === "hider") this.checkSmokeItemPickup(player);
  }

  // Auto-pickup on proximity (no SPACE needed — item kind is rolled only now,
  // not a fixed-location gimmick prop) — at most one carried at a time, and
  // a collected spot respawns after SMOKE_ITEM_RESPAWN_MS.
  private checkSmokeItemPickup(player: Player) {
    if (player.isCaught || player.heldItem) return;
    for (const spawn of SMOKE_ITEM_SPAWNS) {
      if (this.state.collectedSmokeItems.has(spawn.id)) continue;
      if (Math.hypot(player.x - spawn.x, player.y - spawn.y) > GAME_CONFIG.SMOKE_PICKUP_RANGE_PX) continue;
      this.state.collectedSmokeItems.set(spawn.id, true);
      const roll = Math.random();
      const item: ItemKind = roll < 0.30 ? "smoke" : roll < 0.60 ? "decoy" : roll < 0.85 ? "stun" : "sprint";
      player.heldItem = item;
      player.hasSmokeBomb = item === "smoke";
      this.clients.find((c) => c.sessionId === player.id)?.send("itemPicked", { item });
      this.clock.setTimeout(() => {
        this.state.collectedSmokeItems.delete(spawn.id);
      }, GAME_CONFIG.SMOKE_ITEM_RESPAWN_MS);
      return;
    }
  }

  private checkStunTraps(player: Player) {
    if (player.isStunned) return;
    const index = this.stunTraps.findIndex((trap) => Math.hypot(player.x - trap.x, player.y - trap.y) <= GAME_CONFIG.STUN_TRAP_TRIGGER_RANGE_PX);
    if (index < 0) return;
    const [trap] = this.stunTraps.splice(index, 1);
    player.isStunned = true;
    this.inspectCooldownUntil.set(player.id, Date.now() + GAME_CONFIG.STUN_DURATION_MS);
    this.clients.find((c) => c.sessionId === player.id)?.send("stunned", { durationMs: GAME_CONFIG.STUN_DURATION_MS });
    this.broadcastToHiders("trapRemoved", { id: trap.id });
    this.clock.setTimeout(() => { player.isStunned = false; }, GAME_CONFIG.STUN_DURATION_MS);
  }

  private broadcastToHiders(type: string, payload: unknown) {
    this.clients.forEach((c) => {
      if (this.state.players.get(c.sessionId)?.role === "hider") c.send(type, payload);
    });
  }

  private handleUseItem(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.role !== "hider" || player.isCaught || player.isHidden || !player.heldItem) return;
    if (this.state.phase !== "hide" && this.state.phase !== "seek") return;
    const now = Date.now();
    if (now < (this.itemCooldownUntil.get(client.sessionId) ?? 0)) return;
    this.itemCooldownUntil.set(client.sessionId, now + GAME_CONFIG.ITEM_USE_COOLDOWN_MS);
    const item = player.heldItem as ItemKind;
    player.heldItem = "";
    player.hasSmokeBomb = false;
    if (item === "smoke") this.deploySmoke(player);
    else if (item === "decoy") this.handleDecoy(client, true);
    else if (item === "sprint") {
      player.speedMultiplier = GAME_CONFIG.SPRINT_MULTIPLIER;
      this.clock.setTimeout(() => { player.speedMultiplier = 1; }, GAME_CONFIG.SPRINT_DURATION_MS);
    } else if (item === "stun") {
      const trap = { id: `trap-${client.sessionId}-${now}`, x: player.x, y: player.y, ownerId: client.sessionId };
      this.stunTraps.push(trap);
      this.broadcastToHiders("trapPlaced", trap);
      if (this.stunTraps.length > GAME_CONFIG.MAX_STUN_TRAPS) {
        const removed = this.stunTraps.shift()!;
        this.broadcastToHiders("trapRemoved", { id: removed.id });
      }
      this.clock.setTimeout(() => {
        const i = this.stunTraps.findIndex((t) => t.id === trap.id);
        if (i >= 0) this.stunTraps.splice(i, 1);
        this.broadcastToHiders("trapRemoved", { id: trap.id });
      }, GAME_CONFIG.STUN_TRAP_LIFETIME_MS);
    }
  }

  private handleStartMission(client: Client, message: { missionId?: string }) {
    if (this.state.phase !== "seek") return;
    const player = this.state.players.get(client.sessionId);
    if (!player || player.role !== "hider" || player.isCaught || player.isEscaped || player.isHidden || !message?.missionId) return;
    const mission = MISSION_POOL.find((candidate) => candidate.id === message.missionId);
    const prop = mission ? ROOM_PROPS.find((candidate) => candidate.id === mission.propId) : undefined;
    if (!mission || !prop || !this.state.missions.has(mission.id) || this.state.missions.get(mission.id)) return;
    if (Math.hypot(player.x - prop.x, player.y - prop.y) > GAME_CONFIG.ROOM_PROP_RANGE_PX) return;
    this.missionStartedAt.set(client.sessionId, { missionId: mission.id, startedAt: Date.now() });
  }

  private handleCompleteMission(client: Client, message: { missionId?: string }) {
    if (this.state.phase !== "seek") return;
    const player = this.state.players.get(client.sessionId);
    if (!player || player.role !== "hider" || player.isCaught || player.isEscaped || player.isHidden) return;
    if (!message?.missionId || !this.state.missions.has(message.missionId) || this.state.missions.get(message.missionId)) return;
    const now = Date.now();
    const interaction = this.missionStartedAt.get(client.sessionId);
    this.missionStartedAt.delete(client.sessionId);
    if (!interaction || interaction.missionId !== message.missionId || now - interaction.startedAt < GAME_CONFIG.MISSION_INTERACTION_MS - 100) return;
    if (now < (this.missionCooldownUntil.get(client.sessionId) ?? 0)) return;
    const mission = MISSION_POOL.find((candidate) => candidate.id === message.missionId);
    const prop = mission ? ROOM_PROPS.find((candidate) => candidate.id === mission.propId) : undefined;
    if (!mission || !prop || Math.hypot(player.x - prop.x, player.y - prop.y) > GAME_CONFIG.ROOM_PROP_RANGE_PX) return;

    this.missionCooldownUntil.set(client.sessionId, now + GAME_CONFIG.MISSION_COOLDOWN_MS);
    this.state.missions.delete(mission.id);
    this.state.missionsCompleted += 1;
    player.score += MISSION_SCORE;
    this.broadcast("missionComplete", { missionId: mission.id, title: mission.title, nickname: player.nickname, points: MISSION_SCORE });

    this.activateNextMissions();
    if (this.state.missionsCompleted >= this.state.missionGoal) {
      this.state.players.forEach((candidate) => {
        if (candidate.role === "hider" && !candidate.isCaught) candidate.score += ALL_MISSIONS_BONUS;
      });
      this.state.timeRemaining = Math.max(30, this.state.timeRemaining - 20);
      this.state.exitUnlocked = true;
      this.broadcast("allMissionsComplete", { points: ALL_MISSIONS_BONUS, timeReduced: 20 });
      this.broadcast("exitUnlocked", {});
    }
  }

  // Passive server-room gimmick: no interaction needed from either side —
  // walking a seeker into the server room is inherently risky, since every
  // hider gets an early warning the instant they cross the threshold.
  // Tracked per-session (not global) since two seekers can be in different
  // rooms at once; only fires on the top of a fresh threshold-cross, not
  // every tick, otherwise it'd spam a broadcast on every move inside the room.
  private checkServerRoomAlarm(sessionId: string, player: Player) {
    const roomId = findRoomAt(player.x, player.y)?.id ?? "";
    const prevRoomId = this.lastRoomId.get(sessionId) ?? "";
    this.lastRoomId.set(sessionId, roomId);
    if (roomId !== "server" || prevRoomId === "server") return;

    this.clients.forEach((c) => {
      if (this.state.players.get(c.sessionId)?.role === "hider") c.send("serverAlarm", {});
    });
  }

  private freeCoverPoint(coverPointId: string, expectedOccupant: string) {
    if (!coverPointId) return;
    if (this.coverOccupants.get(coverPointId) !== expectedOccupant) return;
    this.coverOccupants.delete(coverPointId);
    const cp = this.state.coverPoints.get(coverPointId);
    if (cp) cp.isOccupied = false;
  }

  private handleHide(client: Client, message: CoverPointMessage) {
    if (this.state.phase !== "hide" && this.state.phase !== "seek") return;

    const player = this.state.players.get(client.sessionId);
    const cp = this.state.coverPoints.get(message.coverPointId);
    if (!player || !cp) return;
    if (this.roundDecoyCoverPointIds.has(cp.id)) {
      client.send("hideUnavailable", { coverPointId: cp.id });
      return; // randomised each round
    }
    if (player.role !== "hider" || player.isCaught || player.isHidden) return;
    if (cp.isOccupied) return; // spec 2.3: 1 point, 1 person
    if (Math.hypot(player.x - cp.x, player.y - cp.y) > GAME_CONFIG.HIDE_RANGE_PX) return;
    const cooldownKey = `${client.sessionId}:${cp.id}`;
    const cooldownRemaining = (this.personalHideCooldownUntil.get(cooldownKey) ?? 0) - Date.now();
    if (cooldownRemaining > 0) {
      client.send("hideCooldown", { coverPointId: cp.id, remainingMs: cooldownRemaining });
      return;
    }

    cp.isOccupied = true;
    this.coverOccupants.set(cp.id, client.sessionId);
    player.isHidden = true;
    player.coverPointId = cp.id;
    player.x = cp.x;
    player.y = cp.y;
    if (this.state.relocateActive) player.score += GAME_CONFIG.SCORE.RELOCATE_BONUS;
  }

  private handleUnhide(client: Client) {
    if (this.state.phase !== "hide" && this.state.phase !== "seek") return;

    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isHidden) return;

    this.releaseHiddenPlayer(client, player);
  }

  private releaseHiddenPlayer(client: Client, player: Player) {
    const coverPointId = player.coverPointId;
    this.freeCoverPoint(coverPointId, client.sessionId);
    if (coverPointId) this.personalHideCooldownUntil.set(`${client.sessionId}:${coverPointId}`, Date.now() + GAME_CONFIG.HIDE_SPOT_COOLDOWN_MS);
    player.isHidden = false;
    player.coverPointId = "";
    client.send("hideCooldown", {
      coverPointId,
      remainingMs: GAME_CONFIG.HIDE_SPOT_COOLDOWN_MS,
    });
  }

  private handleInspect(client: Client, message: CoverPointMessage) {
    if (this.state.phase !== "seek") return;

    const seeker = this.state.players.get(client.sessionId);
    const cp = this.state.coverPoints.get(message.coverPointId);
    if (!seeker || !cp) return;
    if (seeker.role !== "seeker" || seeker.isCaught) return;
    // Harder to search a dark room thoroughly — a seeker who toggled the
    // lights off themselves pays this cost too, same as anyone else in there.
    const seekerRoom = findRoomAt(seeker.x, seeker.y);
    const inspectRange =
      seekerRoom && this.state.darkRooms.has(seekerRoom.id) ? GAME_CONFIG.DARK_INSPECT_RANGE_PX : GAME_CONFIG.INSPECT_RANGE_PX;
    if (Math.hypot(seeker.x - cp.x, seeker.y - cp.y) > inspectRange) return;
    if (seeker.inspectsRemaining <= 0) return; // budget exhausted — no more free sweeps

    const now = Date.now();
    if (now < (this.inspectCooldownUntil.get(client.sessionId) ?? 0)) return; // still on cooldown

    seeker.inspectsRemaining -= 1;
    const occupantId = this.coverOccupants.get(cp.id);
    if (!occupantId) {
      this.inspectCooldownUntil.set(client.sessionId, now + GAME_CONFIG.INSPECT_COOLDOWN_MS);
      client.send("inspectMiss", { cooldownMs: GAME_CONFIG.INSPECT_COOLDOWN_MS });
      return;
    }

    this.coverOccupants.delete(cp.id);
    cp.isOccupied = false;

    const hider = this.state.players.get(occupantId);
    this.resolveCatch(client, seeker, hider);
  }

  // Shared "hider gets caught" side effects — used by both a successful
  // cover-point inspect and a direct tag on an exposed hider. `hider` can be
  // undefined (matches the original inspect behavior: if the recorded
  // occupant somehow no longer exists in state, the seeker still gets the
  // score/message/end-round-check, just no hider-side mutation).
  private resolveCatch(seekerClient: Client | undefined, seeker: Player, hider: Player | undefined) {
    if (hider) {
      hider.isHidden = false;
      hider.isCaught = true;
      hider.coverPointId = "";
      this.clients.forEach((c) => {
        if (c.sessionId === hider.id) c.send("caught", { byNickname: seeker.nickname });
      });
    }

    const points = GAME_CONFIG.SCORE.CATCH + (this.firstCatchAwarded ? 0 : GAME_CONFIG.SCORE.FIRST_CATCH_BONUS);
    seeker.score += points;
    this.firstCatchAwarded = true;
    seekerClient?.send("catchSuccess", { targetNickname: hider?.nickname ?? "", points });

    const anyHiderLeft = [...this.state.players.values()].some((p) => p.role === "hider" && !p.isCaught);
    if (!anyHiderLeft) this.endRound(); // seeker caught everyone before time ran out
  }

  // Seeker action: catch a hider who is out in the open (not hidden at a
  // cover point) by walking up to them — free relocation only makes sense
  // if being caught exposed has a real consequence. No cooldown/inspect-
  // budget cost: this is a skill/positioning reward, deliberately separate
  // from the cover-point-search economy.
  private handleTag(client: Client) {
    if (this.state.phase !== "seek") return;

    const seeker = this.state.players.get(client.sessionId);
    if (!seeker || seeker.role !== "seeker" || seeker.isCaught) return;

    let nearest: Player | undefined;
    let nearestDist: number = GAME_CONFIG.TAG_RANGE_PX;
    this.state.players.forEach((p) => {
      if (p.role !== "hider" || p.isHidden || p.isCaught) return;
      const dist = Math.hypot(seeker.x - p.x, seeker.y - p.y);
      if (dist <= nearestDist) {
        nearest = p;
        nearestDist = dist;
      }
    });
    if (!nearest) return;

    this.resolveCatch(client, seeker, nearest);
  }

  // Visible moving clone. Everyone sees the same fake player, including the
  // owner, so the item has readable feedback and can genuinely fool seekers.
  private handleDecoy(client: Client, bypassCooldown = false) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.role !== "hider" || player.isCaught) return;
    if (this.state.phase !== "hide" && this.state.phase !== "seek") return;

    const now = Date.now();
    if (!bypassCooldown && now < (this.decoyCooldownUntil.get(client.sessionId) ?? 0)) return;
    if (!bypassCooldown) this.decoyCooldownUntil.set(client.sessionId, now + GAME_CONFIG.DECOY_COOLDOWN_MS);

    this.broadcast("decoySpawned", {
      id: `decoy-${client.sessionId}-${now}`,
      x: player.x,
      y: player.y,
      rotY: player.rotY,
      nickname: player.nickname,
      characterVariant: player.characterVariant,
      durationMs: 5000,
    });
  }

  // Any player triggers whichever room-prop gimmick they're standing next
  // to via proximity + the same SPACE key as hide/tag/inspect — kept off a
  // dedicated key so the control scheme doesn't grow. propId identifies
  // which ROOM_PROPS entry was used; its `kind` picks the ability. The
  // light switch is available to every role (universal lights mechanic);
  // whiteboard/coffee-machine/monitor stay hider-only. chair/alarm-light
  // have no active ability, just serve as physical anchors/flavor.
  private handleUseProp(client: Client, message: UsePropMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.isCaught) return;
    if (this.state.phase !== "hide" && this.state.phase !== "seek") return;

    const prop = ROOM_PROPS.find((p) => p.id === message?.propId);
    if (!prop) return;
    if (Math.hypot(player.x - prop.x, player.y - prop.y) > GAME_CONFIG.ROOM_PROP_RANGE_PX) return;

    if (prop.kind === "light-switch") {
      this.triggerToggleLight(client, player);
      return;
    }
    if (prop.kind === "toilet-use") {
      this.triggerToiletUse(client);
      return;
    }
    if (prop.kind === "trace-terminal") {
      this.triggerTraceTerminal(client, player);
      return;
    }
    if (prop.kind === "exit-gate") {
      this.triggerEscape(client, player);
      return;
    }
    if (player.role !== "hider") return;
    if (prop.kind === "whiteboard") this.triggerWhiteboardDecoy(client);
    else if (prop.kind === "coffee-machine") this.triggerCoffeeBoost(client, player);
    else if (prop.kind === "monitor") this.triggerMonitorPeek(client);
  }

  private triggerEscape(client: Client, player: Player) {
    if (this.state.phase !== "seek" || !this.state.exitUnlocked || player.role !== "hider" || player.isCaught || player.isEscaped) return;
    if (player.isHidden) this.freeCoverPoint(player.coverPointId, client.sessionId);
    player.isHidden = false;
    player.coverPointId = "";
    player.isEscaped = true;
    player.isCaught = true; // escaped players become safe spectators
    player.score += GAME_CONFIG.EXIT_SCORE;
    client.send("escaped", { points: GAME_CONFIG.EXIT_SCORE });
    this.broadcast("playerEscaped", { nickname: player.nickname });

    const anyHiderStillInside = [...this.state.players.values()].some((candidate) =>
      candidate.role === "hider" && !candidate.isCaught && !candidate.isEscaped
    );
    if (!anyHiderStillInside) this.endRound();
  }

  // Seeker's "scan" ability (F key) — a one-shot private snapshot of every
  // currently-HIDDEN hider within radius, not a live/continuous exposure.
  // Exposed (non-hidden) hiders aren't included — they're already visible
  // to the seeker in the 3D world via the normal visibility rules, so
  // there's nothing this ability needs to reveal about them.
  private handleScanPulse(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.role !== "seeker" || player.isCaught) return;
    if (this.state.phase !== "hide" && this.state.phase !== "seek") return;

    const now = Date.now();
    if (now < (this.scanCooldownUntil.get(client.sessionId) ?? 0)) return;
    this.scanCooldownUntil.set(client.sessionId, now + GAME_CONFIG.SCAN_COOLDOWN_MS);

    const points: { x: number; y: number }[] = [];
    this.state.players.forEach((hider) => {
      if (hider.role !== "hider" || hider.isCaught || !hider.isHidden) return;
      if (Math.hypot(hider.x - player.x, hider.y - player.y) <= GAME_CONFIG.SCAN_RADIUS_PX) {
        points.push({ x: hider.x, y: hider.y });
      }
    });
    client.send("scanResult", { points, durationMs: GAME_CONFIG.SCAN_REVEAL_DURATION_MS });
  }

  // Seeker's "trace terminal" mission (reception hub, long cooldown) — same
  // one-shot-snapshot approach as scan, but map-wide and including exposed
  // hiders too, matching its bigger payoff/cooldown.
  private triggerTraceTerminal(client: Client, player: Player) {
    if (player.role !== "seeker") return;
    const now = Date.now();
    const remainingMs = (this.traceCooldownUntil.get(client.sessionId) ?? 0) - now;
    if (remainingMs > 0) {
      client.send("traceCooldown", { remainingMs });
      return;
    }
    this.traceCooldownUntil.set(client.sessionId, now + GAME_CONFIG.TRACE_COOLDOWN_MS);
    client.send("traceCooldown", { remainingMs: GAME_CONFIG.TRACE_COOLDOWN_MS });

    const points: { x: number; y: number }[] = [];
    this.state.players.forEach((hider) => {
      if (hider.role !== "hider" || hider.isCaught) return;
      points.push({ x: hider.x, y: hider.y });
    });
    client.send("traceReveal", { points, durationMs: GAME_CONFIG.TRACE_REVEAL_DURATION_MS });
  }

  // Universal light switch: any role, any room, toggle on/off via the
  // physical switch prop. Turning a room OFF is always allowed (freeing a
  // slot); turning one ON is rejected once MAX_DARK_ROOMS are already dark.
  private triggerToggleLight(client: Client, player: Player) {
    const now = Date.now();
    if (now < (this.switchCooldownUntil.get(client.sessionId) ?? 0)) return;

    const room = findRoomAt(player.x, player.y);
    if (!room) return; // standing in the open cubicle floor — nothing to toggle, cooldown not spent

    if (this.state.darkRooms.has(room.id)) {
      this.state.darkRooms.delete(room.id);
    } else {
      if (this.state.darkRooms.size >= GAME_CONFIG.MAX_DARK_ROOMS) return; // capped, cooldown not spent
      this.state.darkRooms.set(room.id, true);
    }

    this.switchCooldownUntil.set(client.sessionId, now + GAME_CONFIG.SWITCH_COOLDOWN_MS);
  }

  // Pure comedic gag (toilet room) — any role, no gameplay effect at all,
  // just broadcasts to every client so everyone nearby sees/hears it too.
  private triggerToiletUse(client: Client) {
    const now = Date.now();
    if (now < (this.toiletUseCooldownUntil.get(client.sessionId) ?? 0)) return;
    this.toiletUseCooldownUntil.set(client.sessionId, now + GAME_CONFIG.TOILET_USE_COOLDOWN_MS);
    this.broadcast("toiletUse", { sessionId: client.sessionId });
  }

  // Whiteboard decoy (meeting room): pure misdirection — names a random
  // *other* real room to every seeker, never where any hider actually is.
  // Excludes "meeting" itself (telling seekers to check the room the hider
  // is literally standing in would be a giveaway, not a decoy).
  private triggerWhiteboardDecoy(client: Client) {
    const now = Date.now();
    if (now < (this.whiteboardCooldownUntil.get(client.sessionId) ?? 0)) return;
    this.whiteboardCooldownUntil.set(client.sessionId, now + GAME_CONFIG.WHITEBOARD_DECOY_COOLDOWN_MS);

    const pool = ROOMS.filter((r) => r.id !== "meeting");
    const fakeRoom = pool[Math.floor(Math.random() * pool.length)];
    if (!fakeRoom) return;

    this.clients.forEach((c) => {
      if (this.state.players.get(c.sessionId)?.role === "seeker") {
        c.send("wrongRoomHint", { roomName: fakeRoom.name });
      }
    });
  }

  // Coffee boost (work zone B): temporary speed multiplier — a "modest"
  // multiplier deliberately chosen to stay within handleMove's existing
  // implausible-jump tolerance (maxSpeed * dt * 1.5) without needing any
  // server-side movement-validation changes.
  private triggerCoffeeBoost(client: Client, player: Player) {
    const now = Date.now();
    if (now < (this.coffeeCooldownUntil.get(client.sessionId) ?? 0)) return;
    this.coffeeCooldownUntil.set(client.sessionId, now + GAME_CONFIG.COFFEE_BOOST_COOLDOWN_MS);

    player.speedBoosted = true;
    this.clock.setTimeout(() => {
      player.speedBoosted = false;
    }, GAME_CONFIG.COFFEE_BOOST_DURATION_MS);
  }

  // Smoke bomb: consumes the carried item, deploys at the hider's own
  // current position (no aiming needed), broadcasts the visual puff to
  // everyone, then dazes (slows + fogs the screen of) any seeker caught
  // within the blast radius at that instant.
  private handleUseSmoke(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.role !== "hider" || player.isCaught || !player.hasSmokeBomb) return;
    if (this.state.phase !== "hide" && this.state.phase !== "seek") return;

    player.hasSmokeBomb = false;
    player.heldItem = "";
    this.deploySmoke(player);
  }

  private deploySmoke(player: Player) {
    this.clients.forEach((c) => c.send("smokeDeployed", { x: player.x, y: player.y }));

    this.state.players.forEach((target) => {
      if (target.role !== "seeker" || target.isCaught) return;
      if (Math.hypot(target.x - player.x, target.y - player.y) > GAME_CONFIG.SMOKE_BLAST_RADIUS_PX) return;
      target.isDazed = true;
      this.clock.setTimeout(() => {
        target.isDazed = false;
      }, GAME_CONFIG.SMOKE_DAZE_DURATION_MS);
    });
  }

  // Security monitor peek (reception): one-shot, targeted only at the
  // triggering hider — names whichever real room a seeker currently occupies
  // (first connected seeker; games run with 1-2 seekers per spec's ratio table).
  private triggerMonitorPeek(client: Client) {
    const now = Date.now();
    if (now < (this.monitorCooldownUntil.get(client.sessionId) ?? 0)) return;
    this.monitorCooldownUntil.set(client.sessionId, now + GAME_CONFIG.MONITOR_PEEK_COOLDOWN_MS);

    const seeker = [...this.state.players.values()].find((p) => p.role === "seeker");
    const roomName = seeker ? findRoomAt(seeker.x, seeker.y)?.name ?? "อยู่นอกห้อง" : "อยู่นอกห้อง";
    client.send("monitorPeek", { roomName });
  }
}
