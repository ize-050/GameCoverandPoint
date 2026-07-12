import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import type { Room } from "colyseus.js";
import type { Screen, Navigate } from "../core/ScreenManager";
import { GameState, Player, CoverPoint } from "../schema/GameState";
import {
  WALLS,
  COVER_POINTS,
  DECORATIONS,
  ROOMS,
  ROOM_PROPS,
  ROOM_VISUALS,
  CEILING_LIGHTS,
  SMOKE_ITEM_SPAWNS,
  pointInRoom,
  findRoomAt,
  collidesWithAnyWall,
  type RoomPropDef,
} from "../../../shared/mapLayout";
import { MAP_WIDTH, MAP_HEIGHT } from "../../../shared/mapConfig";
import { GAME_CONFIG } from "../../../shared/gameConstants";
import type {
  CharacterAppearance,
  YourRoleMessage,
  CaughtMessage,
  CatchSuccessMessage,
  InspectMissMessage,
  EmoteBroadcastMessage,
  DecoyNoiseMessage,
  DecoySpawnedMessage,
  ServerAlarmMessage,
  WrongRoomHintMessage,
  MonitorPeekMessage,
  ToiletUseMessage,
  SmokeDeployedMessage,
  RevealPingMessage,
  ItemPickedMessage,
  TrapMessage,
  CooldownMessage,
} from "../../../shared/messages";
import { MISSION_POOL } from "../../../shared/missions";
import {
  generateGroundTexture,
  generateCabinetTexture,
  generateServerRackTexture,
  generatePlantSmallTexture,
  generatePapersTexture,
  generateWhiteboardTexture,
  generateCoffeeMachineTexture,
  generateMonitorTexture,
  generateLightSwitchTexture,
  generateDeskTopTexture,
  generateShelfTexture,
  generateSofaTexture,
  generateStallTexture,
  generateSinkTexture,
  generateMirrorTexture,
  generateReceptionDeskTexture,
  generateWindowTexture,
  generateWallClockTexture,
  generateBulletinBoardTexture,
} from "../textures/proceduralTextures";
import { createReactionTexture } from "../textures/emote";
import { icon, escapeHtml, EMOTE_ICON_NAMES } from "../dom/icons";
import { LocalPlayer3D } from "../entities3d/LocalPlayer3D";
import { RemotePlayer3D } from "../entities3d/RemotePlayer3D";
import { Character3D } from "../entities3d/Character3D";
import { GameHud } from "../dom/GameHud";
import { Minimap } from "../dom/Minimap";
import { keyboard } from "../core/Keyboard";
import {
  playCatchSuccessSfx,
  playCaughtSfx,
  playInspectMissSfx,
  playCountdownTickSfx,
  playHideSfx,
  playUnhideSfx,
  playDecoyScareSfx,
  playLightsOffSfx,
  playLightsOnSfx,
  playServerAlarmSfx,
  playEmoteSfx,
  playToiletFlushSfx,
  playSmokePickupSfx,
  playSmokeDeploySfx,
} from "../audio/sfx";
import { musicPlayer } from "../audio/music";
import { cloneFurniture, preloadFurnitureModels } from "../loaders/furnitureModels";

function appearanceOf(player: { characterVariant: string }): CharacterAppearance {
  return { variant: player.characterVariant as CharacterAppearance["variant"] };
}

// The seeker's nameplate always reads red (to whoever can see them at all —
// role isn't secret once you've spotted someone) so a hider who spots the
// seeker gets an unmistakable "that's the threat" cue.
function nameColorFor(player: { role: string }): string {
  return player.role === "seeker" ? "#ef4444" : "#ffffff";
}

function propHintText(kind: RoomPropDef["kind"]): string {
  if (kind === "whiteboard") return "[SPACE] เขียนกระดานหลอกคนหา";
  if (kind === "coffee-machine") return "[SPACE] ดื่มกาแฟ (เร็วขึ้นชั่วคราว)";
  if (kind === "light-switch") return "[SPACE] เปิด/ปิดไฟห้องนี้";
  if (kind === "toilet-use") return "[SPACE] เข้าห้องน้ำ";
  if (kind === "trace-terminal") return "[SPACE] เทรซสัญญาณ (เห็นตำแหน่งคนซ่อนทุกคน 10 วิ)";
  return "[SPACE] แอบดูจอมอนิเตอร์";
}

const WALL_HEIGHT = 60;
// Among Us-style chunky/iconic furniture — every dimension and Y-position
// below is written at its originally-designed 1x size then multiplied by
// this, so scaling stays uniform (preserves every stacked-part relationship,
// e.g. monitor-on-desk) without hand-recomputing each number.
const FURNITURE_SCALE = 1.5;
// Measured empirically (e.g. desk.glb's bind bounding box is ~0.73 units
// wide) against the old procedural desk box's already-tuned width (66 units,
// see FURNITURE_SCALE above) — Kenney's Furniture Kit is NOT on the same
// unit scale as the Blocky Characters rig (see MODEL_SCALE in
// Character3D.ts), so this is calibrated independently.
const FURNITURE_MODEL_SCALE = 90;

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    const disposeMaterial = (mat: THREE.Material | THREE.Material[]) => {
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    };
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      disposeMaterial(obj.material);
    }
  });
}
const GROUND_TEX_WORLD_SIZE = 64; // matches the 64x64 canvas in generateGroundTexture
const EMOTE_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4"];
// Hider-only active props triggered via proximity + SPACE — chair/
// alarm-light are visual-only. Checked separately from (and after) the
// light switch below, which every role can use.
const ACTIVE_PROP_KINDS = new Set<RoomPropDef["kind"]>(["whiteboard", "coffee-machine", "monitor"]);
// The universal light switch — any role, checked first in the SPACE
// priority chain (ahead of the hider-only props above).
const LIGHT_SWITCH_KIND = new Set<RoomPropDef["kind"]>(["light-switch"]);
// Comedic toilet-use gag — also universal/any-role, no gameplay effect.
const TOILET_USE_KIND = new Set<RoomPropDef["kind"]>(["toilet-use"]);
// Seeker-only ability anchor (reception hub) — long-cooldown reveal.
const TRACE_TERMINAL_KIND = new Set<RoomPropDef["kind"]>(["trace-terminal"]);
const EXIT_GATE_KIND = new Set<RoomPropDef["kind"]>(["exit-gate"]);
const TOILET_USE_ANIM_MS = 2200;
const URGENT_TIME_SEC = 30;
// PART 3 final-polish pass §3.1 — contrast flipped: corridors are the
// office's "lights off after hours" baseline now (was uniformly bright
// everywhere), rooms read as lit via their own warm floor overlay below
// (buildLitRoomOverlays) rather than a bright global ambient.
const BASE_AMBIENT_INTENSITY = 0.22;
const BASE_SUN_INTENSITY = 0.4;
// A lit room's warm floor/wall glow (spec's flat 0xfff0d8) — additive, so it
// reads as "this room's lights are on" independent of the dim global
// ambient above, and drops to 0 the instant that room's switch goes dark
// (reusing the same darkRooms server state the black overlay below does).
const ROOM_LIT_WARM_COLOR = 0xfff0d8;
const ROOM_LIT_OVERLAY_OPACITY = 0.4;
// Lowered further (was 0.12/0.05) to pair with the near-opaque darkness
// overlay (DARKNESS_ALPHA) — the goal is "the lights are actually off", not
// just dim, for whoever is standing inside the dark room themselves too.
const LIGHTS_OFF_AMBIENT_INTENSITY = 0.045;
const LIGHTS_OFF_SUN_INTENSITY = 0.015;

// Isometric camera angle. 45° azimuth is the classic isometric starting
// look; a steeper elevation than "true" isometric (35.264°) reads better
// for gameplay — more of the ground is visible around the followed
// character. Azimuth is no longer a constant — Q/E orbit the camera around
// the followed character (elevation/tilt stays fixed, this is a horizontal
// 360° orbit, not free-look pitch).
const ISO_AZIMUTH_DEFAULT = Math.PI / 4;
const ISO_ELEVATION = Math.atan(1 / Math.sqrt(2));
const ISO_DISTANCE = 900;
// Among Us-style tight framing by default — a smaller half-height means
// characters and furniture fill much more of the screen than a wide
// strategy-game view. Scroll still reaches out to MAX_CAMERA_ZOOM for
// players who want the wider view back.
const VIEW_SIZE = 270; // tighter framing so furniture/room detail remains readable
const CAMERA_FOLLOW_DAMP = 5;
// How fast ambient/sun intensity and the darkness overlay fade toward their
// target when a room's lights get toggled — slower than zoom, reads more
// like eyes adjusting than a camera setting.
const LIGHT_EASE_RATE = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isoOffset(azimuth: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.cos(ISO_ELEVATION) * Math.cos(azimuth),
    Math.sin(ISO_ELEVATION),
    Math.cos(ISO_ELEVATION) * Math.sin(azimuth)
  )
    .normalize()
    .multiplyScalar(ISO_DISTANCE);
}

export class GameScreen implements Screen {
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private followTarget = new THREE.Vector3(MAP_WIDTH / 2, 0, MAP_HEIGHT / 2);
  private cameraAzimuth = ISO_AZIMUTH_DEFAULT;
  private cameraZoom = VIEW_SIZE;
  private desiredFollowTarget = new THREE.Vector3(MAP_WIDTH / 2, 0, MAP_HEIGHT / 2);
  private built = false;

  private room?: Room<GameState>;
  private localPlayer?: LocalPlayer3D;
  private myPlayer?: Player;
  private remotePlayers = new Map<string, RemotePlayer3D>();
  private prevHidden = new Map<string, boolean>();
  private prevHasSmokeBomb = false;
  private prevDazed = false;
  // Trace terminal grants the seeker a temporary minimap view of every
  // revealed hider (they normally have no minimap at all) — client-side
  // timer only, matching the world-space shadow reveal's same approach.
  private traceRevealUntil = 0;
  private traceRevealPoints: { x: number; y: number }[] = [];
  private traceCooldownUntil = 0;
  private personalHideCooldowns = new Map<string, number>();
  // Client-predicted scan cooldown/origin — the server enforces the real
  // cooldown independently (see handleScanPulse), this is only so the HUD
  // can show a countdown and the radius ring can be drawn without waiting
  // on a round-trip for a press that's going to be silently rejected anyway.
  private scanCooldownUntil = 0;
  private lastScanOrigin: { x: number; z: number } | null = null;
  private smokeItemMeshes = new Map<string, THREE.Object3D>();
  private trapMeshes = new Map<string, THREE.Object3D>();
  private missionMarkers = new Map<string, THREE.Object3D>();
  private activeDecoys: Array<{ id: string; character: Character3D; vx: number; vz: number; expiresAt: number }> = [];
  private heldItemSprite?: THREE.Sprite;
  private heldItemVisualKind = "";
  private cameraTargetPlayerId = "";
  private teammateCameraUntil = 0;
  private missionInteractionId = "";
  private missionInteractionStartedAt = 0;
  private missionInteractionSent = false;
  private teammateCameraCursor = -1;
  private unsubs: Array<() => void> = [];
  private navigate: Navigate;
  private stateChangeHandler = () => this.checkPhase();
  private hud?: GameHud;
  private minimap?: Minimap;
  private lastTickedSecond = -1;
  private prevDimForLights = false;
  private ambientLight!: THREE.AmbientLight;
  private sunLight!: THREE.DirectionalLight;
  private darkRoomOverlays = new Map<string, { mesh: THREE.Mesh; opacity: number }>();
  private litRoomOverlays = new Map<string, { mesh: THREE.Mesh; opacity: number }>();
  // Real GLB furniture models load async; every cover point/prop starts as
  // the existing procedural generated-texture mesh (a perfectly good
  // fallback) and gets swapped for a real model once preloadFurnitureModels()
  // resolves, for whichever kinds have one (see FURNITURE_MODEL_PATHS).
  private coverPointModelTargets: Array<{ id: string; kind: string; obj: THREE.Object3D; tween: TWEEN.Tween<THREE.Vector3> }> = [];
  private roomPropModelTargets: Array<{ id: string; kind: string; obj: THREE.Object3D }> = [];
  private exitGateMaterials: THREE.MeshStandardMaterial[] = [];
  // PART 3 final-polish pass §3.2 — server-rack LED strips, randomly
  // re-toggled green/amber every 0.5-1s per spec, independent per rack.
  private serverRackLeds: Array<{ material: THREE.MeshStandardMaterial; nextToggle: number }> = [];

  // Mouse camera controls (Stage 3) — additive alongside Q/E, not a
  // replacement. Bound as instance fields (not prototype methods) so the
  // exact same function reference can be passed to both addEventListener
  // (mount) and removeEventListener (unmount).
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
  };

  constructor(renderer: THREE.WebGLRenderer, navigate: Navigate) {
    this.renderer = renderer;
    this.navigate = navigate;
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(-this.cameraZoom * aspect, this.cameraZoom * aspect, this.cameraZoom, -this.cameraZoom, 10, 12000);
  }

  mount(data?: { room: Room<GameState> }) {
    if (!this.built) {
      this.buildWorld();
      this.built = true;
    }
    if (data?.room) {
      this.room = data.room;
      this.hud = new GameHud({
        onEmote: (id) => this.room?.send("emote", { id }),
        onDecoy: () => this.room?.send("decoy"),
        onUseItem: () => this.room?.send("useItem"),
      });
      this.minimap = new Minimap();
      this.wireNetworking();
    }
    const canvas = this.renderer.domElement;
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  unmount() {
    this.unsubs.forEach((unsub) => unsub());
    this.unsubs = [];
    this.localPlayer?.destroy();
    this.localPlayer = undefined;
    this.myPlayer = undefined;
    this.remotePlayers.forEach((p) => p.destroy());
    this.remotePlayers.clear();
    this.trapMeshes.forEach((mesh) => {
      mesh.parent?.remove(mesh);
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.trapMeshes.clear();
    this.activeDecoys.forEach((decoy) => decoy.character.destroy());
    this.activeDecoys = [];
    this.heldItemSprite?.parent?.remove(this.heldItemSprite);
    this.heldItemSprite = undefined;
    this.heldItemVisualKind = "";
    this.prevHidden.clear();
    this.prevHasSmokeBomb = false;
    this.prevDazed = false;
    this.traceRevealUntil = 0;
    this.traceRevealPoints = [];
    this.scanCooldownUntil = 0;
    this.missionInteractionId = "";
    this.missionInteractionStartedAt = 0;
    this.missionInteractionSent = false;
    this.lastScanOrigin = null;
    this.hud?.destroy();
    this.hud = undefined;
    this.minimap?.destroy();
    this.minimap = undefined;
    this.lastTickedSecond = -1;
    this.prevDimForLights = false;
    this.ambientLight.intensity = BASE_AMBIENT_INTENSITY;
    this.sunLight.intensity = BASE_SUN_INTENSITY;
    this.room = undefined;
    musicPlayer.setMood("calm");

    const canvas = this.renderer.domElement;
    canvas.removeEventListener("wheel", this.onWheel);
  }

  resize(width: number, height: number) {
    const aspect = width / height;
    this.camera.left = -this.cameraZoom * aspect;
    this.camera.right = this.cameraZoom * aspect;
    this.camera.top = this.cameraZoom;
    this.camera.bottom = -this.cameraZoom;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number) {
    const phase = this.room?.state.phase ?? "lobby";

    if (this.room && this.localPlayer && this.myPlayer) {
      const isGhost = this.myPlayer.isCaught;
      const blackedOut = phase === "hide" && this.myPlayer.role === "seeker";
      const canMove = (phase === "hide" || phase === "seek") && !blackedOut && !this.myPlayer.isHidden && !this.missionInteractionId;

      this.localPlayer.update(dt * 1000, {
        canMove,
        role: this.myPlayer.role,
        isGhost,
        speedBoosted: this.myPlayer.speedBoosted,
        isDazed: this.myPlayer.isDazed,
        isStunned: this.myPlayer.isStunned,
        speedMultiplier: this.myPlayer.speedMultiplier,
        cameraAzimuth: this.cameraAzimuth,
      });
      if (isGhost) this.ensureSpectatorCamera();
      if (isGhost && keyboard.justDown("KeyC")) this.cycleTeammateCamera(true);
      const cameraRemote = (isGhost || performance.now() < this.teammateCameraUntil) ? this.remotePlayers.get(this.cameraTargetPlayerId) : undefined;
      this.desiredFollowTarget.copy(cameraRemote?.character.position ?? this.localPlayer.character.position);
      // Keep the orthographic frustum inside the playable floor. Without
      // this, players near an outside wall see a large black void.
      const viewAspect = window.innerWidth / Math.max(1, window.innerHeight);
      const cameraMarginX = Math.min(MAP_WIDTH / 2, this.cameraZoom * viewAspect * 0.98);
      const cameraMarginZ = Math.min(MAP_HEIGHT / 2, this.cameraZoom * 0.98);
      this.desiredFollowTarget.x = THREE.MathUtils.clamp(this.desiredFollowTarget.x, cameraMarginX, MAP_WIDTH - cameraMarginX);
      this.desiredFollowTarget.z = THREE.MathUtils.clamp(this.desiredFollowTarget.z, cameraMarginZ, MAP_HEIGHT - cameraMarginZ);

      // NOT gated on canMove — canMove excludes isHidden (so WASD doesn't
      // drag a hidden player around), but SPACE's own job while hidden is
      // to un-hide. handleSpacePress (and the server) already gate what
      // each role/phase is allowed to do from here.
      if (!isGhost && (phase === "hide" || phase === "seek") && keyboard.justDown("Space")) this.handleSpacePress();
      if (!isGhost) {
        EMOTE_KEYS.forEach((code, idx) => {
          if (keyboard.justDown(code)) this.room!.send("emote", { id: idx + 1 });
        });
        if (this.myPlayer.role === "hider") {
          if (keyboard.justDown("KeyQ") && this.myPlayer.heldItem) this.room!.send("useItem");
          this.updateMissionInteraction();
          if (keyboard.justDown("KeyC")) this.cycleTeammateCamera();
        }
        if (this.myPlayer.role === "seeker") {
          if (keyboard.justDown("KeyF") && performance.now() >= this.scanCooldownUntil) {
            this.scanCooldownUntil = performance.now() + GAME_CONFIG.SCAN_COOLDOWN_MS;
            const pos = this.localPlayer.character.position;
            this.lastScanOrigin = { x: pos.x, z: pos.z };
            this.room!.send("scanPulse");
          }
        }
      }
    }

    this.remotePlayers.forEach((p) => p.update(dt));
    this.updateDecoys(dt);
    this.updateHeldItemVisual();

    // Seekers normally have no minimap at all — the trace terminal's payoff
    // is a temporary exception, timed purely client-side (same one-shot
    // snapshot approach as the world-space shadow reveal).
    const traceRevealActive = performance.now() < this.traceRevealUntil;
    const canUseMap = this.myPlayer?.role === "hider" || this.myPlayer?.isCaught || traceRevealActive;
    this.minimap?.setVisible(!!canUseMap);
    if (canUseMap && keyboard.justDown("KeyM")) this.minimap?.toggle();
    if (canUseMap && this.localPlayer) {
      const pos = this.localPlayer.character.position;
      // Hiders must never see the seeker's position on the minimap — that
      // would trivialize "is the coast clear" tension. Ghosts (spectators)
      // are exempt and still see everyone, same as their 3D-world visibility.
      const viewerIsGhost = this.myPlayer?.isCaught ?? false;
      const minimapRemotes = viewerIsGhost
        ? this.remotePlayers
        : new Map([...this.remotePlayers].filter(([sessionId]) => this.room?.state.players.get(sessionId)?.role !== "seeker"));
      this.minimap?.render(
        { x: pos.x, z: pos.z },
        minimapRemotes,
        new Map(this.room?.state.missions.entries() ?? []),
        traceRevealActive ? this.traceRevealPoints : undefined,
        this.room?.state.exitUnlocked ?? false
      );
    }

    this.updateDarkRoomOverlays(dt);
    this.updateSmokeItems();
    this.updateMissionMarkers();
    // PART 3 §3.2 — server rack LEDs blink green/amber on random 0.5-1s intervals.
    const ledNow = performance.now();
    for (const led of this.serverRackLeds) {
      if (ledNow > led.nextToggle) {
        const isGreen = led.material.color.getHex() === 0x22c55e;
        led.material.color.setHex(isGreen ? 0xfacc15 : 0x22c55e);
        led.material.emissive.setHex(isGreen ? 0xfacc15 : 0x22c55e);
        led.nextToggle = ledNow + 500 + Math.random() * 500;
      }
    }
    const exitColour = this.room?.state.exitUnlocked ? 0x22c55e : 0xef4444;
    this.exitGateMaterials.forEach((material) => {
      material.color.setHex(exitColour);
      material.emissive.setHex(exitColour);
    });
    if (this.myPlayer && (this.myPlayer.isDazed || this.myPlayer.isStunned) !== this.prevDazed) {
      this.prevDazed = this.myPlayer.isDazed || this.myPlayer.isStunned;
      this.hud?.setDazed(this.prevDazed);
    }
    // Dark-room vision depends on both viewer AND target position, so it
    // can't rely solely on the reactive onChange-triggered recompute
    // elsewhere — cheap enough (at most ~9 remotes) to just redo every frame.
    this.refreshAllVisibility();
    // Universal light switch: dims for WHOEVER is standing in a dark room,
    // any role — unlike the old hider-only sabotage this replaces, which
    // only dimmed the seeker's own view. Eased toward the target each frame
    // (was an instant snap) so a toggle reads as lights fading, not popping.
    const dimForLights = this.isStandingInDarkRoom();
    const targetAmbient = dimForLights ? LIGHTS_OFF_AMBIENT_INTENSITY : BASE_AMBIENT_INTENSITY;
    const targetSun = dimForLights ? LIGHTS_OFF_SUN_INTENSITY : BASE_SUN_INTENSITY;
    const lightEase = Math.min(1, LIGHT_EASE_RATE * dt);
    this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientLight.intensity, targetAmbient, lightEase);
    this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, targetSun, lightEase);
    if (dimForLights !== this.prevDimForLights) {
      this.prevDimForLights = dimForLights;
      if (dimForLights) playLightsOffSfx();
      else playLightsOnSfx();
    }

    this.followTarget.lerp(this.desiredFollowTarget, 1 - Math.exp(-CAMERA_FOLLOW_DAMP * dt));
    this.camera.position.copy(this.followTarget).add(isoOffset(this.cameraAzimuth));
    this.camera.lookAt(this.followTarget);
    this.renderer.render(this.scene, this.camera);

    this.updateHud(phase);
  }

  private updateHud(phase: string) {
    if (!this.hud || !this.room) return;

    const timeRemaining = this.room.state.timeRemaining;
    musicPlayer.setMood(phase === "seek" && timeRemaining <= URGENT_TIME_SEC ? "urgent" : phase === "seek" ? "tense" : "calm");
    this.hud.setTimer(phase, timeRemaining, performance.now());

    const blackedOut = phase === "hide" && this.myPlayer?.role === "seeker";
    this.hud.setBlackout(!!blackedOut, timeRemaining);

    const showInspects = this.myPlayer?.role === "seeker" && (phase === "hide" || phase === "seek");
    this.hud.setInspectsRemaining(this.myPlayer?.inspectsRemaining ?? 0, GAME_CONFIG.MAX_INSPECT_ATTEMPTS, showInspects);

    this.hud.setRelocateActive(this.room.state.relocateActive, this.myPlayer?.role ?? "");

    const showAbilities = this.myPlayer?.role === "hider" && !this.myPlayer?.isCaught && (phase === "hide" || phase === "seek");
    this.hud.setAbilitiesVisible(!!showAbilities);
    this.hud.setHeldItem(this.myPlayer?.heldItem ?? "", !!showAbilities);
    const activeMissions = MISSION_POOL.filter((mission) => this.room!.state.missions.has(mission.id));
    const completedMissions = new Set(activeMissions.filter((mission) => this.room!.state.missions.get(mission.id)).map((mission) => mission.id));
    const showHiderMissions = this.myPlayer?.role === "hider" && !this.myPlayer?.isCaught && phase === "seek" && activeMissions.length > 0;
    const showSeekerMission = this.myPlayer?.role === "seeker" && !this.myPlayer?.isCaught && (phase === "hide" || phase === "seek");
    // Hider and seeker objectives share the same HUD element. Calling both
    // setters every frame meant setSeekerMission(false) immediately hid the
    // hider checklist that setMissions had just rendered.
    if (showSeekerMission) {
      const traceRemainingSec = Math.ceil(Math.max(0, this.traceCooldownUntil - performance.now()) / 1000);
      this.hud.setSeekerMission(true, traceRemainingSec);
    } else {
      this.hud.setMissions(activeMissions, completedMissions, !!showHiderMissions, this.room.state.exitUnlocked, this.room.state.missionsCompleted, this.room.state.missionGoal);
    }
    const scanRemainingSec = this.myPlayer?.role === "seeker" ? Math.ceil(Math.max(0, this.scanCooldownUntil - performance.now()) / 1000) : 0;
    this.hud.setScanCooldown(scanRemainingSec);

    this.hud.setHint(this.computeHint(phase));

    const players = [...this.room.state.players.values()];
    this.hud.setInfo(
      `ห้อง: ${this.room.state.roomCode}  |  รอบ ${this.room.state.round}  |  Phase: ${phase.toUpperCase()} (${timeRemaining}s)<br/>` +
        players
          .map(
            (p) =>
              `${escapeHtml(p.nickname)}${p.isHost ? " " + icon("crown", { size: 13, color: "#fbbf24" }) : ""}${
                p.isCaught ? " " + icon("ghost", { size: 13, color: "#94a3b8" }) : ""
              }`
          )
          .join(", ")
    );

    const urgent = (phase === "hide" || phase === "seek") && timeRemaining < URGENT_TIME_SEC;
    if (urgent && timeRemaining !== this.lastTickedSecond && timeRemaining > 0) {
      this.lastTickedSecond = timeRemaining;
      playCountdownTickSfx();
    } else if (!urgent) {
      this.lastTickedSecond = -1;
    }
  }

  private wireNetworking() {
    const room = this.room!;
    const localId = room.sessionId;

    const unsubAdd = room.state.players.onAdd((player, sessionId) => {
      this.prevHidden.set(sessionId, player.isHidden);

      if (sessionId === localId) {
        this.myPlayer = player;
        this.localPlayer = new LocalPlayer3D(this.scene, room, player.x, player.y, player.nickname, appearanceOf(player));
        this.localPlayer.character.setNameColor(nameColorFor(player));
        const unsubSelf = player.onChange(() => {
          this.checkHideGimmick(sessionId, player);
          this.checkSmokePickup(player);
          this.refreshAllVisibility();
          this.localPlayer?.character.setNameColor(nameColorFor(player));
        });
        this.unsubs.push(unsubSelf);
        return;
      }

      const remote = new RemotePlayer3D(this.scene, player.x, player.y, player.nickname, appearanceOf(player));
      remote.character.setNameColor(nameColorFor(player));
      this.remotePlayers.set(sessionId, remote);
      this.updateRemoteVisibility(remote, player);

      const unsubChange = player.onChange(() => {
        remote.setTarget(player.x, player.y, player.rotY);
        remote.setAppearance(appearanceOf(player));
        remote.character.setNameColor(nameColorFor(player));
        remote.playAnimation(player.isCaught ? "die" : player.anim);
        remote.character.setGait(player.role, player.isCaught, player.isDazed, player.anim === "walk" || player.anim === "sprint", player.anim === "sprint" ? 1.35 : 1);
        this.updateRemoteVisibility(remote, player);
        this.checkHideGimmick(sessionId, player);
      });
      this.unsubs.push(unsubChange);
    });
    this.unsubs.push(unsubAdd);

    const unsubRemove = room.state.players.onRemove((_player, sessionId) => {
      this.prevHidden.delete(sessionId);
      if (sessionId === localId) return;
      this.remotePlayers.get(sessionId)?.destroy();
      this.remotePlayers.delete(sessionId);
    });
    this.unsubs.push(unsubRemove);

    const offRole = room.onMessage("yourRole", (msg: YourRoleMessage) => this.hud?.showRoleBanner(msg.role));
    this.unsubs.push(offRole);

    const offCaught = room.onMessage("caught", (msg: CaughtMessage) => {
      this.hud?.showFeedback(`${icon("scared", { size: 18 })} คุณถูก ${escapeHtml(msg.byNickname)} จับได้แล้ว!`);
      playCaughtSfx();
      if (this.localPlayer) this.playCatchEffect(this.localPlayer.character.position, 0xff5252);
    });
    this.unsubs.push(offCaught);

    const offCatchSuccess = room.onMessage("catchSuccess", (msg: CatchSuccessMessage) => {
      this.hud?.showFeedback(`${icon("target", { size: 18 })} จับ ${escapeHtml(msg.targetNickname)} ได้! +${msg.points}`);
      playCatchSuccessSfx();
      if (this.localPlayer) this.playCatchEffect(this.localPlayer.character.position, 0xffe066);
    });
    this.unsubs.push(offCatchSuccess);

    const offInspectMiss = room.onMessage("inspectMiss", (msg: InspectMissMessage) => {
      this.hud?.showFeedback(`${icon("x", { size: 18 })} ไม่มีใครซ่อนอยู่ที่นี่`, Math.min(1200, msg.cooldownMs));
      playInspectMissSfx();
    });
    this.unsubs.push(offInspectMiss);

    const offEmote = room.onMessage("emote", (msg: EmoteBroadcastMessage) => {
      this.showEmoteAbove(msg.sessionId, msg.id);
      playEmoteSfx();
    });
    this.unsubs.push(offEmote);

    const offDecoy = room.onMessage("decoyNoise", (msg: DecoyNoiseMessage) => {
      this.playDecoyEffect(msg.x, msg.y);
      playDecoyScareSfx();
    });
    this.unsubs.push(offDecoy);

    const offDecoySpawned = room.onMessage("decoySpawned", (msg: DecoySpawnedMessage) => {
      const character = new Character3D({ variant: msg.characterVariant as CharacterAppearance["variant"] }, msg.nickname);
      character.position.set(msg.x, 0, msg.y);
      character.setTargetRotation(msg.rotY);
      character.playAnimation("walk");
      this.scene.add(character.group);
      const speed = 150;
      this.activeDecoys.push({ id: msg.id, character, vx: Math.sin(msg.rotY) * speed, vz: Math.cos(msg.rotY) * speed, expiresAt: performance.now() + msg.durationMs });
      this.hud?.showFeedback("🤡 DECOY DEPLOYED — fake employee running!");
    });
    this.unsubs.push(offDecoySpawned);

    const offToiletUse = room.onMessage("toiletUse", (msg: ToiletUseMessage) => {
      this.getCharacterFor(msg.sessionId)?.playOneShot("sit", TOILET_USE_ANIM_MS);
      playToiletFlushSfx();
      if (msg.sessionId === this.room?.sessionId) this.hud?.showFeedback(`${icon("check", { size: 18 })} สดชื่น!`);
    });
    this.unsubs.push(offToiletUse);

    const offSmokeDeployed = room.onMessage("smokeDeployed", (msg: SmokeDeployedMessage) => {
      this.playSmokeEffect(msg.x, msg.y);
      playSmokeDeploySfx();
    });
    this.unsubs.push(offSmokeDeployed);

    // Both scan (small radius, short cooldown) and the trace terminal
    // (map-wide, long cooldown) are one-shot private snapshots — same
    // rendering, just different point counts/duration.
    const offScanResult = room.onMessage("scanResult", (msg: RevealPingMessage) => {
      this.playRevealBeacons(msg.points, msg.durationMs);
      const origin = this.lastScanOrigin ?? { x: this.localPlayer?.character.position.x ?? 0, z: this.localPlayer?.character.position.z ?? 0 };
      this.playScanRing(origin.x, origin.z, msg.points.length > 0);
    });
    this.unsubs.push(offScanResult);

    const offTraceReveal = room.onMessage("traceReveal", (msg: RevealPingMessage) => {
      this.playRevealBeacons(msg.points, msg.durationMs);
      this.traceRevealPoints = msg.points;
      this.traceRevealUntil = performance.now() + msg.durationMs;
      this.hud?.showFeedback(`${icon("target", { size: 18, color: "#facc15" })} เทรซสัญญาณสำเร็จ! เห็นตำแหน่งคนซ่อน ${msg.points.length} คน`);
    });
    this.unsubs.push(offTraceReveal);

    const offTraceCooldown = room.onMessage("traceCooldown", (msg: CooldownMessage) => {
      this.traceCooldownUntil = performance.now() + Math.max(0, msg.remainingMs);
      if (msg.remainingMs > 0 && msg.remainingMs < GAME_CONFIG.TRACE_COOLDOWN_MS)
        this.hud?.showFeedback(`Trace Terminal พร้อมอีก ${Math.ceil(msg.remainingMs / 1000)} วิ`);
    });
    const offHideCooldown = room.onMessage("hideCooldown", (msg: CooldownMessage) => {
      if (msg.coverPointId) this.personalHideCooldowns.set(msg.coverPointId, performance.now() + msg.remainingMs);
    });
    const offHideUnavailable = room.onMessage("hideUnavailable", () => {
      this.hud?.showFeedback("เฟอร์นิเจอร์ชิ้นนี้ไม่ใช่จุดซ่อนในรอบนี้ — ลองจุดอื่น");
    });
    this.unsubs.push(offTraceCooldown, offHideCooldown, offHideUnavailable);

    const offItemPicked = room.onMessage("itemPicked", (msg: ItemPickedMessage) => {
      const labels: Record<string, string> = { smoke: "💨 Smoke Bomb", decoy: "🤡 Decoy", stun: "😵 Stun Trap", sprint: "⚡ Sprint" };
      this.hud?.showFeedback(`ได้ ${labels[msg.item] ?? msg.item}!`);
    });
    this.unsubs.push(offItemPicked);

    const offStunned = room.onMessage("stunned", () => {
      this.hud?.showFeedback("💫 โดนกับดักมึน!");
    });
    this.unsubs.push(offStunned);

    const offSurvivalBonus = room.onMessage("survivalBonus", (msg: { points: number }) => {
      this.hud?.showFeedback(`รอดครบ 60 วิ +${msg.points}`);
    });
    this.unsubs.push(offSurvivalBonus);

    const offMissionComplete = room.onMessage("missionComplete", (msg: { title: string; nickname: string; points: number }) => {
      this.hud?.showFeedback(`✅ ${escapeHtml(msg.nickname)} completed ${escapeHtml(msg.title)} +${msg.points}`);
    });
    const offAllMissions = room.onMessage("allMissionsComplete", (msg: { points: number; timeReduced: number }) => {
      this.hud?.showFeedback(`🚪 EXIT UNLOCKED! ไปที่ประตู Reception · +${msg.points}`, 3200);
    });
    this.unsubs.push(offMissionComplete, offAllMissions);

    const offEscaped = room.onMessage("escaped", (msg: { points: number }) => {
      this.hud?.showFeedback(`✅ CLOCKED OUT! หนีสำเร็จ +${msg.points}`, 3000);
    });
    const offPlayerEscaped = room.onMessage("playerEscaped", (msg: { nickname: string }) => {
      this.hud?.showFeedback(`🚪 ${escapeHtml(msg.nickname)} escaped the office!`, 1800);
    });
    this.unsubs.push(offEscaped, offPlayerEscaped);

    const offTrapPlaced = room.onMessage("trapPlaced", (msg: TrapMessage) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(12, 12, 1.5, 16),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.35 })
      );
      mesh.position.set(msg.x, 1, msg.y);
      this.scene.add(mesh);
      this.trapMeshes.set(msg.id, mesh);
    });
    const offTrapRemoved = room.onMessage("trapRemoved", (msg: { id: string }) => {
      const mesh = this.trapMeshes.get(msg.id);
      if (!mesh) return;
      mesh.parent?.remove(mesh);
      this.trapMeshes.delete(msg.id);
    });
    this.unsubs.push(offTrapPlaced, offTrapRemoved);

    const offServerAlarm = room.onMessage("serverAlarm", (_msg: ServerAlarmMessage) => {
      this.hud?.showFeedback(`${icon("bell", { size: 18, color: "#f87171" })} มีคนหาเข้าห้อง Server!`);
      playServerAlarmSfx();
    });
    this.unsubs.push(offServerAlarm);

    const offWrongRoomHint = room.onMessage("wrongRoomHint", (msg: WrongRoomHintMessage) => {
      this.hud?.showFeedback(`${icon("eyes", { size: 18, color: "#fbbf24" })} มีคนเห็นคนซ่อนที่ ${msg.roomName}!`);
    });
    this.unsubs.push(offWrongRoomHint);

    const offMonitorPeek = room.onMessage("monitorPeek", (msg: MonitorPeekMessage) => {
      this.hud?.showFeedback(`${icon("target", { size: 18, color: "#22d3ee" })} คนหาอยู่ที่: ${msg.roomName}`);
    });
    this.unsubs.push(offMonitorPeek);

    room.onStateChange(this.stateChangeHandler);
    this.unsubs.push(() => room.onStateChange.remove(this.stateChangeHandler));
    const roomLeaveHandler = () => this.navigate("Menu");
    room.onLeave(roomLeaveHandler);
    this.unsubs.push(() => room.onLeave.remove(roomLeaveHandler));

    // Self-correct immediately — a reconnect landing here mid-round shouldn't
    // wait for a future phase change that may never come.
    this.checkPhase();
  }

  private checkPhase() {
    if (!this.room) return;
    const phase = this.room.state.phase;
    if (phase === "result") this.navigate("Result", { room: this.room });
    else if (phase === "lobby") this.navigate("Lobby", { room: this.room });
  }

  private getGroupFor(sessionId: string): THREE.Group | undefined {
    if (sessionId === this.room?.sessionId) return this.localPlayer?.character.group;
    return this.remotePlayers.get(sessionId)?.character.group;
  }

  private getCharacterFor(sessionId: string): Character3D | undefined {
    if (sessionId === this.room?.sessionId) return this.localPlayer?.character;
    return this.remotePlayers.get(sessionId)?.character;
  }

  private updateRemoteVisibility(remote: RemotePlayer3D, player: Player) {
    const viewerIsGhost = this.myPlayer?.isCaught ?? false;
    // spec 2.3: ghosts see each other; non-ghosts see neither ghosts nor hidden hiders.
    let visible = viewerIsGhost || (!player.isCaught && !player.isHidden);

    // Universal light switch: can't see into a dark room from outside it;
    // inside one, vision is limited to a short radius around yourself.
    // Ghosts bypass this like every other visibility rule (already omniscient).
    if (visible && !viewerIsGhost && this.room) {
      const remoteRoom = ROOMS.find((r) => pointInRoom(player.x, player.y, r));
      if (remoteRoom && this.room.state.darkRooms.has(remoteRoom.id)) {
        const localPos = this.localPlayer?.character.position;
        const localRoom = localPos ? ROOMS.find((r) => pointInRoom(localPos.x, localPos.z, r)) : undefined;
        if (localRoom?.id !== remoteRoom.id) {
          visible = false;
        } else if (localPos && Math.hypot(localPos.x - player.x, localPos.z - player.y) > GAME_CONFIG.DARK_VISION_RADIUS_PX) {
          visible = false;
        }
      }
    }

    remote.setVisible(visible);
  }

  private refreshAllVisibility() {
    this.remotePlayers.forEach((remote, sessionId) => {
      const player = this.room?.state.players.get(sessionId);
      if (player) this.updateRemoteVisibility(remote, player);
    });
  }

  private checkHideGimmick(sessionId: string, player: Player) {
    const was = this.prevHidden.get(sessionId) ?? false;
    if (was === player.isHidden) return;
    this.prevHidden.set(sessionId, player.isHidden);

    const group = this.getGroupFor(sessionId);
    if (group) this.playHideGimmick(group, player.isHidden);

    if (sessionId === this.room?.sessionId) {
      if (player.isHidden) playHideSfx();
      else playUnhideSfx();
    }
  }

  // Auto-pickup happens server-side purely from proximity (no SPACE), so the
  // only way the client learns about it is reactively, off the local
  // player's own onChange — same shape as checkHideGimmick above.
  private checkSmokePickup(player: Player) {
    if (!this.prevHasSmokeBomb && player.hasSmokeBomb) playSmokePickupSfx();
    this.prevHasSmokeBomb = player.hasSmokeBomb;
  }

  private playHideGimmick(group: THREE.Group, hiding: boolean) {
    const state = { scaleY: group.scale.y };
    new TWEEN.Tween(state)
      .to({ scaleY: hiding ? 0.3 : 1 }, 160)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate(() => (group.scale.y = state.scaleY))
      .start();

    const poof = new THREE.Mesh(
      new THREE.RingGeometry(2, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    poof.rotation.x = -Math.PI / 2;
    poof.position.copy(group.position);
    poof.position.y = 2;
    this.scene.add(poof);

    const poofState = { scale: 0.2, opacity: 0.7 };
    new TWEEN.Tween(poofState)
      .to({ scale: 3, opacity: 0 }, 350)
      .easing(TWEEN.Easing.Cubic.Out)
      .onUpdate(() => {
        poof.scale.set(poofState.scale, poofState.scale, poofState.scale);
        (poof.material as THREE.MeshBasicMaterial).opacity = poofState.opacity;
      })
      .onComplete(() => {
        this.scene.remove(poof);
        poof.geometry.dispose();
        (poof.material as THREE.Material).dispose();
      })
      .start();
  }

  private playCatchEffect(pos: THREE.Vector3, color: number) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(14, 20, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 2, pos.z);
    this.scene.add(ring);

    const state = { scale: 0.3, opacity: 0.6 };
    new TWEEN.Tween(state)
      .to({ scale: 2.2, opacity: 0 }, 450)
      .easing(TWEEN.Easing.Cubic.Out)
      .onUpdate(() => {
        ring.scale.set(state.scale, state.scale, state.scale);
        (ring.material as THREE.MeshBasicMaterial).opacity = state.opacity;
      })
      .onComplete(() => {
        this.scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      })
      .start();
  }

  // Only ever received by seeker clients (server targets the send) — a
  // "sound wave" cue (two staggered expanding rings) at a decoy location, to
  // make it read as a startling noise rather than the catch-ring's "hit".
  private playDecoyEffect(x: number, z: number) {
    [0, 120].forEach((delay) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(10, 15, 24),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 2, z);
      this.scene.add(ring);

      const state = { scale: 0.2, opacity: 0.7 };
      new TWEEN.Tween(state)
        .delay(delay)
        .to({ scale: 4, opacity: 0 }, 700)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
          ring.scale.set(state.scale, state.scale, state.scale);
          (ring.material as THREE.MeshBasicMaterial).opacity = state.opacity;
        })
        .onComplete(() => {
          this.scene.remove(ring);
          ring.geometry.dispose();
          (ring.material as THREE.Material).dispose();
        })
        .start();
    });
  }

  // Smoke bomb puff — a handful of soft gray spheres billowing outward and
  // upward then fading, visible to every client (not just affected seekers)
  // so the deploy itself always reads as a real event happening in the world.
  private playSmokeEffect(x: number, z: number) {
    const puffMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.75 });
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), puffMat.clone());
      const angle = (i / 6) * Math.PI * 2;
      puff.position.set(x, 4, z);
      this.scene.add(puff);

      const target = {
        x: x + Math.cos(angle) * 26,
        y: 22 + Math.random() * 10,
        z: z + Math.sin(angle) * 26,
        scale: 0.4,
        opacity: 0.75,
      };
      const state = { x, y: 4, z, scale: 0.4, opacity: 0.75 };
      new TWEEN.Tween(state)
        .to({ x: target.x, y: target.y, z: target.z, scale: 2.4, opacity: 0 }, 750 + Math.random() * 200)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
          puff.position.set(state.x, state.y, state.z);
          puff.scale.set(state.scale, state.scale, state.scale);
          (puff.material as THREE.MeshBasicMaterial).opacity = state.opacity;
        })
        .onComplete(() => {
          this.scene.remove(puff);
          puff.geometry.dispose();
          (puff.material as THREE.Material).dispose();
        })
        .start();
    }
  }

  // Scan/trace reveal — a dark humanoid shadow silhouette standing at each
  // snapshot position (not just an abstract marker), held for the reveal
  // duration then fading out. This client-side timer is the ONLY thing
  // tracking "how long the reveal lasts" — the server doesn't send an end event.
  private playRevealBeacons(points: { x: number; y: number }[], durationMs: number) {
    for (const point of points) {
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x05050a, transparent: true, opacity: 0.85 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(9, 22, 4, 12), shadowMat);
      body.position.y = 22;
      const head = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 10), shadowMat);
      head.position.y = 40;

      const groundMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
      const ground = new THREE.Mesh(new THREE.CircleGeometry(13, 20), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 1;

      const group = new THREE.Group();
      group.add(ground, body, head);
      group.position.set(point.x, 0, point.y);
      this.scene.add(group);

      // Subtle idle bob so it reads as "a figure standing there," not a
      // static cardboard cutout.
      const bobTween = new TWEEN.Tween(group.position)
        .to({ y: 3 }, 700)
        .yoyo(true)
        .repeat(Infinity)
        .easing(TWEEN.Easing.Sinusoidal.InOut)
        .start();

      const cleanup = () => {
        bobTween.stop();
        this.scene.remove(group);
        body.geometry.dispose();
        head.geometry.dispose();
        shadowMat.dispose();
        ground.geometry.dispose();
        groundMat.dispose();
      };
      const fadeMs = 500;
      new TWEEN.Tween({ opacity: 1 })
        .to({ opacity: 0 }, fadeMs)
        .delay(Math.max(0, durationMs - fadeMs))
        .easing(TWEEN.Easing.Cubic.In)
        .onUpdate((state) => {
          shadowMat.opacity = 0.85 * state.opacity;
          groundMat.opacity = 0.5 * state.opacity;
        })
        .onComplete(cleanup)
        .start();
    }
  }

  // Expanding ground ring showing exactly which area the scan covered — red
  // if it caught someone, cyan if the area was clear, so the seeker can read
  // the result at a glance instead of only seeing hits (or nothing at all).
  private playScanRing(centerX: number, centerZ: number, hasHit: boolean) {
    const radius = GAME_CONFIG.SCAN_RADIUS_PX;
    const color = hasHit ? 0xef4444 : 0x22d3ee;
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 5, radius, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(centerX, 2, centerZ);
    ring.scale.setScalar(0.05);
    this.scene.add(ring);

    const cleanup = () => {
      this.scene.remove(ring);
      ring.geometry.dispose();
      ringMat.dispose();
    };
    new TWEEN.Tween({ scale: 0.05, opacity: 0.9 })
      .to({ scale: 1, opacity: 0 }, 900)
      .easing(TWEEN.Easing.Cubic.Out)
      .onUpdate((state) => {
        ring.scale.setScalar(state.scale);
        ringMat.opacity = state.opacity;
      })
      .onComplete(cleanup)
      .start();
  }

  private showEmoteAbove(sessionId: string, id: number) {
    const group = this.getGroupFor(sessionId);
    const iconName = EMOTE_ICON_NAMES[id - 1];
    if (!group || !iconName) return;

    const tex = createReactionTexture(iconName);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(16, 16, 1);
    sprite.position.set(0, 55, 0);
    group.add(sprite);

    const state = { y: 55, opacity: 1 };
    new TWEEN.Tween(state)
      .to({ y: 85, opacity: 0 }, 2000)
      .onUpdate(() => {
        sprite.position.y = state.y;
        (sprite.material as THREE.SpriteMaterial).opacity = state.opacity;
      })
      .onComplete(() => {
        group.remove(sprite);
        tex.dispose();
        sprite.material.dispose();
      })
      .start();
  }

  private findNearestCoverPoint(maxDist: number): CoverPoint | undefined {
    if (!this.room || !this.localPlayer) return undefined;
    const pos = this.localPlayer.character.position;
    let nearest: CoverPoint | undefined;
    let nearestDist = maxDist;
    this.room.state.coverPoints.forEach((cp) => {
      const dist = Math.hypot(pos.x - cp.x, pos.z - cp.y);
      if (dist <= nearestDist) {
        nearest = cp;
        nearestDist = dist;
      }
    });
    return nearest;
  }

  // Free relocation only has real stakes if an exposed (not-hidden) hider
  // can actually be caught — this is the seeker's priority action, checked
  // before falling back to cover-point inspection.
  private findNearestExposedHider(maxDist: number): Player | undefined {
    if (!this.room || !this.localPlayer) return undefined;
    const pos = this.localPlayer.character.position;
    let nearest: Player | undefined;
    let nearestDist = maxDist;
    this.room.state.players.forEach((p) => {
      if (p.role !== "hider" || p.isHidden || p.isCaught) return;
      const dist = Math.hypot(pos.x - p.x, pos.z - p.y);
      if (dist <= nearestDist) {
        nearest = p;
        nearestDist = dist;
      }
    });
    return nearest;
  }

  private findNearestUsableProp(maxDist: number, kinds: Set<RoomPropDef["kind"]>): RoomPropDef | undefined {
    if (!this.localPlayer) return undefined;
    const pos = this.localPlayer.character.position;
    let nearest: RoomPropDef | undefined;
    let nearestDist = maxDist;
    for (const prop of ROOM_PROPS) {
      if (!kinds.has(prop.kind)) continue;
      const dist = Math.hypot(pos.x - prop.x, pos.z - prop.y);
      if (dist <= nearestDist) {
        nearest = prop;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  // Universal light switch: is the local player currently standing inside
  // a room that's in the server's `darkRooms` set? Affects everyone in
  // that room, not just seekers — the old hider-only sabotage mechanic
  // this replaces only dimmed a seeker's own view.
  private isStandingInDarkRoom(): boolean {
    if (!this.localPlayer || !this.room) return false;
    const pos = this.localPlayer.character.position;
    const room = ROOMS.find((r) => pointInRoom(pos.x, pos.z, r));
    return !!room && this.room.state.darkRooms.has(room.id);
  }

  // "What does SPACE do right now" — without this a hidden player has no
  // on-screen indication of how to come back out.
  private computeHint(phase: string): string | null {
    const me = this.myPlayer;
    if (!me || me.isCaught || !this.localPlayer || !this.room) return null;
    if (phase !== "hide" && phase !== "seek") return null;

    if (me.role === "hider" && me.isHidden) return "[SPACE] ออกจากที่ซ่อน";

    const lightSwitch = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, LIGHT_SWITCH_KIND);
    if (lightSwitch) return propHintText(lightSwitch.kind);

    const toiletUse = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, TOILET_USE_KIND);
    if (toiletUse) return propHintText(toiletUse.kind);

    if (me.role === "hider") {
      const exit = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, EXIT_GATE_KIND);
      if (exit) return this.room.state.exitUnlocked ? "[SPACE] CLOCK OUT — หนีออกจาก Office" : "EXIT LOCKED — ทำ Mission ให้ครบก่อน";
      const mission = this.findNearbyMission();
      if (mission) {
        if (this.missionInteractionId === mission.id) {
          const ratio = Math.min(1, (performance.now() - this.missionInteractionStartedAt) / GAME_CONFIG.MISSION_INTERACTION_MS);
          const filled = Math.round(ratio * 10);
          return `HOLD E ${mission.title}  ${"█".repeat(filled)}${"░".repeat(10 - filled)} ${Math.round(ratio * 100)}%`;
        }
        return `[HOLD E 3s] ${mission.title}`;
      }
      const prop = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, ACTIVE_PROP_KINDS);
      if (prop) return propHintText(prop.kind);
      if (me.heldItem) return "[Q] ใช้ไอเท็มที่ถืออยู่";
      const cp = this.findNearestCoverPoint(GAME_CONFIG.HIDE_RANGE_PX);
      if (!cp) return null;
      const hideCooldownSec = Math.ceil(Math.max(0, (this.personalHideCooldowns.get(cp.id) ?? 0) - performance.now()) / 1000);
      if (hideCooldownSec > 0) return `จุดนี้พร้อมสำหรับคุณอีก ${hideCooldownSec} วิ`;
      return cp.isOccupied ? "จุดนี้มีคนซ่อนอยู่แล้ว" : "[SPACE] ซ่อนที่นี่";
    }

    if (me.role === "seeker") {
      if (this.findNearestExposedHider(GAME_CONFIG.TAG_RANGE_PX)) return "[SPACE] จับ!";
      const trace = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, TRACE_TERMINAL_KIND);
      if (trace) {
        const seconds = Math.ceil(Math.max(0, this.traceCooldownUntil - performance.now()) / 1000);
        return seconds > 0 ? `Trace Terminal พร้อมอีก ${seconds} วิ` : propHintText(trace.kind);
      }
      const cp = this.findNearestCoverPoint(GAME_CONFIG.INSPECT_RANGE_PX);
      if (cp) return me.inspectsRemaining > 0 ? "[SPACE] ตรวจจุดนี้" : `${icon("blocked", { size: 14 })} หมดโควตาตรวจแล้ว`;
      // Fallback reminder — scan has no fixed location (unlike trace
      // terminal), so without this a seeker standing in open floor would
      // never see any hint that F does something at all.
      return "[F] สแกนหาคนซ่อนในรัศมี (cooldown 15 วิ)";
    }

    return null;
  }

  private findNearbyMission() {
    if (!this.room || !this.localPlayer || this.myPlayer?.role !== "hider" || this.room.state.phase !== "seek") return undefined;
    const pos = this.localPlayer.character.position;
    return MISSION_POOL.find((mission) => {
      if (!this.room!.state.missions.has(mission.id) || this.room!.state.missions.get(mission.id)) return false;
      const prop = ROOM_PROPS.find((candidate) => candidate.id === mission.propId);
      return !!prop && Math.hypot(pos.x - prop.x, pos.z - prop.y) <= GAME_CONFIG.ROOM_PROP_RANGE_PX;
    });
  }

  private updateMissionInteraction() {
    const mission = this.findNearbyMission();
    if (!keyboard.isDown("KeyE") || !mission) {
      if (this.missionInteractionId) this.room?.send("cancelMission");
      this.missionInteractionId = "";
      this.missionInteractionStartedAt = 0;
      this.missionInteractionSent = false;
      return;
    }
    if (this.missionInteractionId !== mission.id) {
      this.missionInteractionId = mission.id;
      this.missionInteractionStartedAt = performance.now();
      this.missionInteractionSent = false;
      this.room?.send("startMission", { missionId: mission.id });
    }
    if (!this.missionInteractionSent && performance.now() - this.missionInteractionStartedAt >= GAME_CONFIG.MISSION_INTERACTION_MS) {
      this.missionInteractionSent = true;
      this.room?.send("completeMission", { missionId: mission.id });
    }
  }

  private handleSpacePress() {
    const me = this.myPlayer;
    if (!me || me.isCaught) return;

    if (me.role === "hider" && me.isHidden) {
      this.room?.send("unhide");
      return;
    }

    const lightSwitch = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, LIGHT_SWITCH_KIND);
    if (lightSwitch) {
      // No feedback banner needed — the darkness overlay + dimming that
      // follows from the server's state change already is the feedback.
      this.room?.send("useProp", { propId: lightSwitch.id });
      return;
    }

    const toiletUse = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, TOILET_USE_KIND);
    if (toiletUse) {
      // No local feedback here either — the server's broadcast "toiletUse"
      // message (handled in wireNetworking) is what actually plays the
      // animation/sfx, for every nearby client including this one.
      this.room?.send("useProp", { propId: toiletUse.id });
      return;
    }

    if (me.role === "hider") {
      const exit = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, EXIT_GATE_KIND);
      if (exit) {
        if (this.room?.state.exitUnlocked) this.room.send("useProp", { propId: exit.id });
        else this.hud?.showFeedback("EXIT LOCKED — ทำ Office Missions ให้ครบก่อน");
        return;
      }
      const prop = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, ACTIVE_PROP_KINDS);
      if (prop) {
        this.room?.send("useProp", { propId: prop.id });
        if (prop.kind === "whiteboard") this.hud?.showFeedback(`${icon("target", { size: 18 })} หลอกคนหาด้วยกระดานแล้ว!`);
        else if (prop.kind === "coffee-machine")
          this.hud?.showFeedback(`${icon("run", { size: 18, color: "#4ade80" })} ดื่มกาแฟ! เร็วขึ้นชั่วคราว`);
        return;
      }
      const cp = this.findNearestCoverPoint(GAME_CONFIG.HIDE_RANGE_PX);
      if (cp && !cp.isOccupied) {
        if ((this.personalHideCooldowns.get(cp.id) ?? 0) > performance.now()) return;
        this.room?.send("hide", { coverPointId: cp.id });
        if (this.room?.state.relocateActive)
          this.hud?.showFeedback(`${icon("check", { size: 18 })} ย้ายที่ซ่อนสำเร็จ! +${GAME_CONFIG.SCORE.RELOCATE_BONUS}`);
      }
      return;
    }

    if (me.role === "seeker") {
      const target = this.findNearestExposedHider(GAME_CONFIG.TAG_RANGE_PX);
      if (target) {
        this.room?.send("tag");
        return;
      }

      const trace = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, TRACE_TERMINAL_KIND);
      if (trace) {
        this.room?.send("useProp", { propId: trace.id });
        return;
      }

      if (me.inspectsRemaining <= 0) {
        this.hud?.showFeedback(`${icon("blocked", { size: 18 })} หมดจำนวนครั้งตรวจแล้ว!`);
        return;
      }
      const cp = this.findNearestCoverPoint(GAME_CONFIG.INSPECT_RANGE_PX);
      if (cp) this.room?.send("inspect", { coverPointId: cp.id });
    }
  }

  private buildWorld() {
    this.scene.background = new THREE.Color(0x1c2430);
    this.scene.fog = new THREE.Fog(0x1c2430, 900, 2300);

    this.ambientLight = new THREE.AmbientLight(0xffffff, BASE_AMBIENT_INTENSITY);
    this.scene.add(this.ambientLight);
    this.sunLight = new THREE.DirectionalLight(0xf5f7fa, BASE_SUN_INTENSITY);
    this.sunLight.position.set(300, 500, 200);
    this.scene.add(this.sunLight);
    const skyFill = new THREE.HemisphereLight(0xbfe8ff, 0x2b1d35, 0.32);
    this.scene.add(skyFill);

    this.buildGround();
    this.buildWayfinding();
    this.buildRoomVisuals();
    this.buildWalls();
    this.buildCoverPoints();
    this.buildDecorations();
    this.buildOfficeSetDressing();
    this.buildRoomProps();
    this.buildCeilingLights();
    this.buildDarkRoomOverlays();
    this.buildLitRoomOverlays();
    this.buildSmokeItems();
    this.buildMissionMarkers();
  }

  private buildMissionMarkers() {
    for (const mission of MISSION_POOL) {
      const prop = ROOM_PROPS.find((candidate) => candidate.id === mission.propId);
      if (!prop) continue;
      const group = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(18, 2.2, 8, 28),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xf59e0b, emissiveIntensity: 0.8 })
      );
      ring.rotation.x = Math.PI / 2;
      const diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(7),
        new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 1 })
      );
      diamond.position.y = 34;
      group.add(ring, diamond);
      group.position.set(prop.x, 2, prop.y);
      group.visible = false;
      this.scene.add(group);
      this.missionMarkers.set(mission.id, group);
      new TWEEN.Tween(diamond.position).to({ y: 43 }, 850).yoyo(true).repeat(Infinity).easing(TWEEN.Easing.Sinusoidal.InOut).start();
    }
  }

  private updateMissionMarkers() {
    if (!this.room) return;
    // PART 2 final-polish pass §2.2 — marker only shows once the hider has
    // actually walked into that mission's room (was visible map-wide before).
    const myRoomId = this.localPlayer ? findRoomAt(this.localPlayer.character.position.x, this.localPlayer.character.position.z)?.id : undefined;
    this.missionMarkers.forEach((marker, missionId) => {
      const mission = MISSION_POOL.find((candidate) => candidate.id === missionId);
      const sameRoom = !!mission && mission.roomId === myRoomId;
      marker.visible =
        sameRoom &&
        this.myPlayer?.role === "hider" &&
        this.room!.state.phase === "seek" &&
        this.room!.state.missions.has(missionId) &&
        !this.room!.state.missions.get(missionId);
      marker.rotation.y += 0.012;
    });
  }

  private updateDecoys(dt: number) {
    const now = performance.now();
    this.activeDecoys = this.activeDecoys.filter((decoy) => {
      const pos = decoy.character.position;
      const nextX = pos.x + decoy.vx * dt;
      const nextZ = pos.z + decoy.vz * dt;
      const alive = now < decoy.expiresAt && !collidesWithAnyWall(nextX, nextZ);
      if (!alive) {
        this.playSmokeEffect(pos.x, pos.z);
        decoy.character.destroy();
        return false;
      }
      pos.x = nextX;
      pos.z = nextZ;
      decoy.character.update(dt);
      return true;
    });
  }

  private updateHeldItemVisual() {
    const item = this.myPlayer?.heldItem ?? "";
    if (item !== this.heldItemVisualKind) {
      this.heldItemSprite?.parent?.remove(this.heldItemSprite);
      this.heldItemSprite = undefined;
      this.heldItemVisualKind = item;
      if (item) {
        const emoji: Record<string, string> = { smoke: "💨", decoy: "🤡", stun: "⚠️", sprint: "⚡" };
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 96;
        const ctx = canvas.getContext("2d")!;
        ctx.font = "60px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(emoji[item] ?? "🎁", 48, 50);
        this.heldItemSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
        this.heldItemSprite.scale.set(28, 28, 1);
        this.scene.add(this.heldItemSprite);
      }
    }
    if (this.heldItemSprite && this.localPlayer) {
      this.heldItemSprite.position.copy(this.localPlayer.character.position).add(new THREE.Vector3(20, 58, 0));
    }
  }

  private ensureSpectatorCamera() {
    if (!this.room) return;
    const target = this.room.state.players.get(this.cameraTargetPlayerId);
    if (target && !target.isCaught && !target.isEscaped && this.remotePlayers.has(target.id)) return;
    const hasSurvivor = [...this.room.state.players.entries()].some(([id, player]) => id !== this.room!.sessionId && player.role === "hider" && !player.isCaught && !player.isEscaped && this.remotePlayers.has(id));
    if (!hasSurvivor && this.cameraTargetPlayerId === "__none__") return;
    this.cycleTeammateCamera(true);
  }

  private cycleTeammateCamera(spectator = false) {
    if (!this.room || this.myPlayer?.role !== "hider") return;
    const ids = [...this.room.state.players.entries()]
      .filter(([id, player]) => id !== this.room!.sessionId && player.role === "hider" && !player.isCaught && !player.isEscaped && this.remotePlayers.has(id))
      .map(([id]) => id);
    if (ids.length === 0) {
      this.cameraTargetPlayerId = "__none__";
      this.hud?.showFeedback("👥 No active Hider teammates to view");
      return;
    }
    this.teammateCameraCursor = (this.teammateCameraCursor + 1) % ids.length;
    this.cameraTargetPlayerId = ids[this.teammateCameraCursor];
    this.teammateCameraUntil = spectator ? Number.POSITIVE_INFINITY : performance.now() + 4000;
    const teammate = this.room.state.players.get(this.cameraTargetPlayerId);
    this.hud?.showFeedback(`👁 ${spectator ? "SPECTATING" : "CAMERA"}: ${escapeHtml(teammate?.nickname ?? "teammate")}${spectator ? " · C to switch" : " · 4s"}`);
  }

  private buildWayfinding() {
    const lineMaterial = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x075985, emissiveIntensity: 0.18 });
    const strips = [
      { x: MAP_WIDTH / 2, z: MAP_HEIGHT / 2, w: 34, d: MAP_HEIGHT * 0.88 },
      { x: MAP_WIDTH / 2, z: MAP_HEIGHT / 2, w: MAP_WIDTH * 0.88, d: 34 },
    ];
    for (const strip of strips) {
      const runner = new THREE.Mesh(new THREE.PlaneGeometry(strip.w, strip.d), lineMaterial);
      runner.rotation.x = -Math.PI / 2;
      runner.position.set(strip.x, 0.18, strip.z);
      this.scene.add(runner);
    }
    const directions = [
      { id: "server", fx: 0.5, fz: 0.96 }, { id: "lounge", fx: 0.5, fz: 0.96 },
      { id: "toilet", fx: 0.5, fz: 0.96 }, { id: "work_a", fx: 0.96, fz: 0.5 },
      { id: "meeting", fx: 0.04, fz: 0.5 }, { id: "work_b", fx: 0.96, fz: 0.18 },
      { id: "reception", fx: 0.5, fz: 0.04 },
    ];
    for (const direction of directions) {
      const room = ROOMS.find((candidate) => candidate.id === direction.id);
      if (!room) continue;
      const marker = new THREE.Mesh(new THREE.PlaneGeometry(32, 8), accentMaterial.clone());
      (marker.material as THREE.MeshStandardMaterial).color.set(ROOM_VISUALS[direction.id]?.accent ?? 0x38bdf8);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(room.x + room.w * direction.fx, 0.62, room.y + room.h * direction.fz);
      this.scene.add(marker);
    }

    // Repeating ceiling-light pools projected on the main corridors add depth
    // without adding collision geometry.
    const poolMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4cf, transparent: true, opacity: 0.055, depthWrite: false });
    for (let x = 180; x < MAP_WIDTH; x += 280) {
      for (const z of [MAP_HEIGHT * 0.5 - 45, MAP_HEIGHT * 0.5 + 45]) {
        const pool = new THREE.Mesh(new THREE.CircleGeometry(48, 24), poolMaterial);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(x, 0.5, z);
        this.scene.add(pool);
      }
    }
  }

  private buildOfficeSetDressing() {
    const box = (x: number, z: number, w: number, h: number, d: number, color: number, y = h / 2, emissive = 0) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 0.65 : 0, roughness: 0.72 })
      );
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      return mesh;
    };
    const cylinder = (x: number, z: number, radius: number, height: number, color: number, y = height / 2) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.68 })
      );
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      return mesh;
    };
    const room = (id: string) => ROOMS.find((r) => r.id === id)!;
    const at = (id: string, fx: number, fz: number) => {
      const r = room(id);
      return { x: r.x + r.w * fx, z: r.y + r.h * fz };
    };

    // Server lab: extra rack bank, patch panels, glowing status LEDs and cable trays.
    for (let i = 0; i < 4; i++) {
      const p = at("server", 0.2 + i * 0.18, 0.2);
      box(p.x, p.z, 30, 48, 18, 0x172033);
      for (let led = 0; led < 4; led++) box(p.x + 10, p.z - 9.3, 3, 2, 1, 0x22d3ee, 12 + led * 7, 0x22d3ee);
    }
    {
      const r = room("server");
      box(r.x + r.w / 2, r.y + r.h * 0.72, r.w * 0.62, 3, 8, 0x0f172a, 4);
    }

    // Lounge: coffee tables, lamps, side cabinets and planters make it feel occupied.
    for (const [fx, fz] of [[0.3, 0.63], [0.68, 0.63]] as const) {
      const p = at("lounge", fx, fz);
      cylinder(p.x, p.z, 16, 8, 0xb77945);
      cylinder(p.x + 11, p.z - 5, 4, 5, 0xf8fafc, 10);
    }
    for (const fx of [0.16, 0.84]) {
      const p = at("lounge", fx, 0.35);
      cylinder(p.x, p.z, 7, 30, 0x7c4a2d);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(13, 13, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd6a5, emissive: 0xfb923c, emissiveIntensity: 0.28 }));
      shade.position.set(p.x, 36, p.z);
      this.scene.add(shade);
    }

    // Restroom: tiled walk strips, vanity counter, soap dispensers and waste bins.
    {
      const r = room("toilet");
      for (let i = 0; i < 6; i++) box(r.x + r.w * (0.14 + i * 0.14), r.y + r.h * 0.55, r.w * 0.1, 0.7, 5, 0x8be1ef, 0.8);
      const p = at("toilet", 0.25, 0.78);
      box(p.x, p.z, 70, 22, 22, 0xe5eef2);
      box(p.x - 20, p.z - 12, 8, 12, 5, 0x38bdf8, 28);
      cylinder(p.x + 45, p.z, 8, 18, 0x64748b);
    }

    // Work zones: monitor pairs, document trays, mugs and filing islands.
    for (const id of ["work_a", "work_b"] as const) {
      const style = ROOM_VISUALS[id];
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          const p = at(id, 0.22 + col * 0.27, 0.28 + row * 0.38);
          box(p.x, p.z, 20, 13, 3, 0x111827, 25);
          box(p.x - 13, p.z + 7, 12, 2, 9, style.accent, 17);
          cylinder(p.x + 15, p.z + 8, 3.5, 8, col % 2 ? 0xf8fafc : style.accent, 20);
        }
      }
    }

    // Meeting room: projector, presentation screen, conference phone and notebooks.
    {
      const r = room("meeting");
      const c = at("meeting", 0.5, 0.5);
      box(c.x, r.y + 16, r.w * 0.55, 30, 3, 0xf8fafc, 42);
      box(c.x, c.z, 20, 6, 14, 0x1f2937, 22);
      for (const dx of [-45, -20, 20, 45]) box(c.x + dx, c.z + 16, 17, 1.5, 11, dx < 0 ? 0xfde68a : 0xfda4af, 19);
      const projector = box(c.x, c.z - 65, 24, 8, 18, 0xe2e8f0, 55);
      projector.rotation.y = Math.PI / 2;
    }

    // Reception: queue posts, logo wall, parcel stack and visitor seating markers.
    {
      const r = room("reception");
      for (const fx of [0.28, 0.5, 0.72]) {
        const p = at("reception", fx, 0.58);
        cylinder(p.x, p.z, 3, 24, 0xd4a72c);
      }
      box(r.x + r.w / 2, r.y + 12, r.w * 0.62, 34, 3, 0x172033, 48);
      box(r.x + r.w / 2, r.y + 10, r.w * 0.34, 10, 4, 0xfacc15, 48, 0xfacc15);
      const p = at("reception", 0.82, 0.78);
      box(p.x, p.z, 18, 18, 18, 0xb77945);
      box(p.x + 13, p.z + 5, 15, 13, 15, 0xd6a760);
    }

    // Phone booth: desk phone, acoustic panels and a tiny status lamp.
    {
      const r = room("phonebooth");
      const c = at("phonebooth", 0.5, 0.5);
      box(c.x, c.z, 18, 7, 10, 0x111827, 25);
      for (let i = 0; i < 3; i++) box(r.x + 8, r.y + 16 + i * 28, 3, 20, 18, i % 2 ? 0xdb2777 : 0x831843, 22);
      cylinder(c.x + 14, c.z - 7, 3, 9, 0xf472b6, 30);
    }

    // Large room landmarks: a few strong silhouettes do more for navigation
    // than dozens of tiny scattered props, while remaining visual-only so
    // the established collision layout does not change.
    {
      const p = at("server", 0.5, 0.48);
      const core = cylinder(p.x, p.z, 22, 62, 0x0f2740);
      core.material = new THREE.MeshStandardMaterial({ color: 0x0f2740, emissive: 0x0891b2, emissiveIntensity: 0.32, metalness: 0.45 });
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(25 + i * 3, 2, 8, 24), new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(p.x, 18 + i * 15, p.z);
        this.scene.add(ring);
      }
    }
    {
      const r = room("lounge");
      box(r.x + r.w * 0.5, r.y + r.h * 0.64, r.w * 0.58, 1, r.h * 0.32, 0x7c3f58, 0.65);
      const p = at("lounge", 0.83, 0.33);
      box(p.x, p.z, 30, 58, 24, 0xdc2626);
      box(p.x, p.z - 12.5, 20, 34, 1, 0x111827, 36, 0x38bdf8);
    }
    {
      const r = room("toilet");
      const p = at("toilet", 0.5, 0.82);
      box(p.x, p.z, r.w * 0.42, 26, 24, 0xdbeafe);
      for (const dx of [-36, 0, 36]) cylinder(p.x + dx, p.z - 13, 7, 4, 0x93c5fd, 31);
    }
    for (const id of ["work_a", "work_b"] as const) {
      const p = at(id, 0.5, 0.82);
      box(p.x, p.z, 58, 32, 30, 0xe2e8f0);
      box(p.x, p.z - 16, 34, 8, 2, 0x1e293b, 25);
      box(p.x + 38, p.z, 10, 42, 10, ROOM_VISUALS[id].accent);
    }
    {
      const r = room("meeting");
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x8be7f4, transparent: true, opacity: 0.25, roughness: 0.15, metalness: 0.25 });
      const glass = new THREE.Mesh(new THREE.BoxGeometry(r.w * 0.68, 48, 3), glassMat);
      glass.position.set(r.x + r.w * 0.5, 24, r.y + r.h * 0.18);
      this.scene.add(glass);
    }
    {
      const p = at("reception", 0.5, 0.72);
      for (const dx of [-38, 0, 38]) {
        cylinder(p.x + dx, p.z, 5, 28, 0x1e293b);
        box(p.x + dx, p.z, 34, 3, 7, 0xfacc15, 22, 0xfacc15);
      }
    }
  }

  private buildRoomVisuals() {
    for (const room of ROOMS) {
      const style = ROOM_VISUALS[room.id];
      if (!style) continue;

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(1, room.w - 14), Math.max(1, room.h - 14)),
        new THREE.MeshStandardMaterial({ color: style.floor, roughness: 0.82, metalness: room.id === "server" ? 0.2 : 0.02 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(room.x + room.w / 2, 0.35, room.y + room.h / 2);
      this.scene.add(floor);

      // Room-specific floor language: circuits, carpet bands, tiles or a
      // central rug. These are deliberately subtle so players/items stay legible.
      const patternMat = new THREE.MeshBasicMaterial({ color: style.accent, transparent: true, opacity: 0.16, depthWrite: false });
      const addPattern = (x: number, z: number, w: number, d: number, rotation = 0) => {
        const piece = new THREE.Mesh(new THREE.PlaneGeometry(w, d), patternMat);
        piece.rotation.x = -Math.PI / 2;
        piece.rotation.z = rotation;
        piece.position.set(x, 0.72, z);
        this.scene.add(piece);
      };
      if (room.id === "server") {
        for (let i = 1; i < 6; i++) addPattern(room.x + room.w * i / 6, room.y + room.h / 2, 2.5, room.h * 0.82);
        for (let i = 1; i < 5; i++) addPattern(room.x + room.w / 2, room.y + room.h * i / 5, room.w * 0.82, 2.5);
      } else if (room.id === "toilet") {
        for (let i = 1; i < 7; i++) addPattern(room.x + room.w * i / 7, room.y + room.h / 2, 1.6, room.h * 0.88);
        for (let i = 1; i < 6; i++) addPattern(room.x + room.w / 2, room.y + room.h * i / 6, room.w * 0.88, 1.6);
      } else if (room.id === "work_a" || room.id === "work_b") {
        for (let i = -3; i <= 3; i++) addPattern(room.x + room.w / 2 + i * 28, room.y + room.h / 2, 8, room.h * 0.86, Math.PI / 14);
      } else if (room.id === "meeting") {
        addPattern(room.x + room.w / 2, room.y + room.h / 2, room.w * 0.66, room.h * 0.52);
        addPattern(room.x + room.w / 2, room.y + room.h / 2, room.w * 0.58, room.h * 0.44);
      } else if (room.id === "lounge") {
        addPattern(room.x + room.w / 2, room.y + room.h * 0.58, room.w * 0.68, room.h * 0.42, Math.PI / 36);
      } else if (room.id === "reception") {
        for (let i = -3; i <= 3; i++) addPattern(room.x + room.w / 2 + i * 34, room.y + room.h / 2, 12, room.h * 0.75, Math.PI / 4);
      } else {
        addPattern(room.x + room.w / 2, room.y + room.h / 2, room.w * 0.52, room.h * 0.52, Math.PI / 4);
      }

      const borderMaterial = new THREE.MeshStandardMaterial({ color: style.accent, emissive: style.accent, emissiveIntensity: 0.18 });
      const thickness = 7;
      const borderY = 0.9;
      const edges = [
        new THREE.Mesh(new THREE.BoxGeometry(room.w, 1.8, thickness), borderMaterial),
        new THREE.Mesh(new THREE.BoxGeometry(room.w, 1.8, thickness), borderMaterial),
        new THREE.Mesh(new THREE.BoxGeometry(thickness, 1.8, room.h), borderMaterial),
        new THREE.Mesh(new THREE.BoxGeometry(thickness, 1.8, room.h), borderMaterial),
      ];
      edges[0].position.set(room.x + room.w / 2, borderY, room.y + thickness / 2);
      edges[1].position.set(room.x + room.w / 2, borderY, room.y + room.h - thickness / 2);
      edges[2].position.set(room.x + thickness / 2, borderY, room.y + room.h / 2);
      edges[3].position.set(room.x + room.w - thickness / 2, borderY, room.y + room.h / 2);
      this.scene.add(...edges);

      // PART 2 final-polish pass §2.1 #1 — door sign, now bilingual (Thai
      // above, English below) per spec, same dark-plate/accent-border look.
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 512;
      labelCanvas.height = 96;
      const ctx = labelCanvas.getContext("2d")!;
      ctx.fillStyle = "rgba(8,15,25,.86)";
      ctx.roundRect(8, 8, 496, 80, 18);
      ctx.fill();
      ctx.strokeStyle = `#${style.accent.toString(16).padStart(6, "0")}`;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 24px 'Segoe UI', sans-serif";
      ctx.fillText(style.labelTh, 256, 34);
      ctx.font = "700 28px Segoe UI, sans-serif";
      ctx.fillText(style.label, 256, 68);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(labelCanvas), transparent: true, depthTest: false }));
      label.scale.set(Math.min(170, room.w * 0.55), 32, 1);
      label.position.set(room.x + room.w / 2, 58, room.y + 18);
      this.scene.add(label);

      // PART 2 final-polish pass §2.1 #2 — faint giant lettering flat on the
      // floor at room center, readable from the isometric camera at a
      // glance ("confirm you're inside" vs. the door sign's "which room is
      // this from the corridor").
      const floorLabelCanvas = document.createElement("canvas");
      floorLabelCanvas.width = 512;
      floorLabelCanvas.height = 128;
      const flCtx = floorLabelCanvas.getContext("2d")!;
      flCtx.fillStyle = "#ffffff";
      flCtx.textAlign = "center";
      flCtx.textBaseline = "middle";
      flCtx.font = "900 88px Segoe UI, sans-serif";
      flCtx.fillText(style.label, 256, 64);
      const floorLabelSize = Math.min(room.w, room.h) * 0.82;
      const floorLabel = new THREE.Mesh(
        new THREE.PlaneGeometry(floorLabelSize, floorLabelSize * (128 / 512)),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(floorLabelCanvas), transparent: true, opacity: 0.12, depthWrite: false })
      );
      floorLabel.rotation.x = -Math.PI / 2;
      floorLabel.position.set(room.x + room.w / 2, 0.85, room.y + room.h / 2);
      this.scene.add(floorLabel);

      const glow = new THREE.PointLight(style.accent, room.id === "phonebooth" ? 0.35 : 0.22, Math.max(room.w, room.h) * 0.65, 2);
      glow.position.set(room.x + room.w / 2, 75, room.y + room.h / 2);
      this.scene.add(glow);
    }
  }

  private buildGround() {
    const tex = generateGroundTexture();
    tex.repeat.set(MAP_WIDTH / GROUND_TEX_WORLD_SIZE, MAP_HEIGHT / GROUND_TEX_WORLD_SIZE);
    const geo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT);
    const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0x718096, roughness: 0.96, metalness: 0.02 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(MAP_WIDTH / 2, 0, MAP_HEIGHT / 2);
    this.scene.add(mesh);
  }

  private buildWalls() {
    for (const wall of WALLS) {
      const cx = wall.x + wall.w / 2;
      const cz = wall.y + wall.h / 2;
      const owner = ROOMS.find((room) => pointInRoom(cx, cz, room));
      const style = owner ? ROOM_VISUALS[owner.id] : undefined;
      const mat = new THREE.MeshStandardMaterial({
        color: style?.wall ?? 0xcfd4dc,
        roughness: 0.78,
        emissive: style?.accent ?? 0x000000,
        emissiveIntensity: style ? 0.025 : 0,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, WALL_HEIGHT, wall.h), mat);
      mesh.position.set(wall.x + wall.w / 2, WALL_HEIGHT / 2, wall.y + wall.h / 2);
      this.scene.add(mesh);

      // Dark wall caps and room-coloured baseboards make the office plan
      // readable from the isometric camera and stop walls looking like
      // unshaded blocks.
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(wall.w + 2, 3, wall.h + 2),
        new THREE.MeshStandardMaterial({ color: 0x243244, roughness: 0.72 })
      );
      cap.position.set(cx, WALL_HEIGHT + 1.5, cz);
      this.scene.add(cap);
      const baseboard = new THREE.Mesh(
        new THREE.BoxGeometry(wall.w + 1, 6, wall.h + 1),
        new THREE.MeshStandardMaterial({ color: style?.accent ?? 0x64748b, roughness: 0.8 })
      );
      baseboard.position.set(cx, 3, cz);
      this.scene.add(baseboard);
    }
  }

  private buildCoverPoints() {
    const cabinetTex = generateCabinetTexture();
    const serverTex = generateServerRackTexture();
    const deskTopTex = generateDeskTopTexture();
    const deskSideMat = new THREE.MeshStandardMaterial({ color: 0xc9a876 });
    const monitorTex = generateMonitorTexture();
    const monitorBodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36 });
    const shelfTex = generateShelfTexture();
    const sofaTex = generateSofaTexture();
    const stallTex = generateStallTexture();

    const S = FURNITURE_SCALE;
    for (const cp of COVER_POINTS) {
      let obj: THREE.Object3D;

      if (cp.kind === "plant") {
        const group = new THREE.Group();
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(10 * S, 8 * S, 14 * S, 12),
          new THREE.MeshStandardMaterial({ color: 0x8a6a4a })
        );
        pot.position.y = 7 * S;
        const foliage = new THREE.Mesh(new THREE.SphereGeometry(16 * S, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2e7d32 }));
        foliage.position.y = 22 * S;
        const foliage2 = new THREE.Mesh(new THREE.SphereGeometry(11 * S, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4caf50 }));
        foliage2.position.set(-3 * S, 30 * S, -2 * S);
        group.add(pot, foliage, foliage2);
        obj = group;
      } else if (cp.kind === "desk") {
        // A real workstation, not a single texture-on-every-face box: a
        // materials array gives the TOP face its own keyboard/mouse decal
        // (the old approach smeared that decal across the side faces too,
        // which is what made desks read as flat/fake from an isometric
        // angle) plus an actual 3D monitor standing on the desk surface —
        // every desk cover point gets one, not just one special prop.
        const group = new THREE.Group();
        const desk = new THREE.Mesh(new THREE.BoxGeometry(44 * S, 16 * S, 26 * S), [
          deskSideMat,
          deskSideMat,
          new THREE.MeshStandardMaterial({ map: deskTopTex }),
          deskSideMat,
          deskSideMat,
          deskSideMat,
        ]);
        desk.position.y = 8 * S;
        const monitorBase = new THREE.Mesh(new THREE.BoxGeometry(8 * S, 1 * S, 5 * S), monitorBodyMat);
        monitorBase.position.set(6 * S, 16.5 * S, -3 * S);
        const monitorStand = new THREE.Mesh(new THREE.BoxGeometry(2 * S, 5 * S, 2 * S), monitorBodyMat);
        monitorStand.position.set(6 * S, 19 * S, -3 * S);
        const monitorScreen = new THREE.Mesh(new THREE.BoxGeometry(11 * S, 8 * S, 1.2 * S), new THREE.MeshStandardMaterial({ map: monitorTex }));
        monitorScreen.position.set(6 * S, 25.5 * S, -3 * S);
        // PART 3 final-polish pass §3.2 — every desk is now a "cubicle set"
        // (desk + monitor + chair), never a bare box; chair sits on the
        // open side opposite the monitor, where a seated player would face it.
        const chairMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
        const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(12 * S, 2 * S, 12 * S), chairMat);
        chairSeat.position.set(0, 9 * S, 17 * S);
        const chairBack = new THREE.Mesh(new THREE.BoxGeometry(12 * S, 14 * S, 2 * S), chairMat);
        chairBack.position.set(0, 15 * S, 22 * S);
        group.add(desk, monitorBase, monitorStand, monitorScreen, chairSeat, chairBack);
        obj = group;
      } else if (cp.kind === "conference-table") {
        // Meeting room centerpiece — one long shared table (chairs sit
        // around it as separate ROOM_PROPS), same top/side material split
        // as a desk but stretched, no personal monitor on a shared table.
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(90 * S, 16 * S, 34 * S), [
          deskSideMat,
          deskSideMat,
          new THREE.MeshStandardMaterial({ map: deskTopTex }),
          deskSideMat,
          deskSideMat,
          deskSideMat,
        ]);
        mesh.position.y = 8 * S;
        obj = mesh;
      } else if (cp.kind === "cabinet") {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(16 * S, 34 * S, 18 * S), new THREE.MeshStandardMaterial({ map: cabinetTex }));
        mesh.position.y = 17 * S;
        obj = mesh;
      } else if (cp.kind === "shelf") {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(30 * S, 40 * S, 18 * S), new THREE.MeshStandardMaterial({ map: shelfTex }));
        mesh.position.y = 20 * S;
        obj = mesh;
      } else if (cp.kind === "sofa") {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(40 * S, 14 * S, 20 * S), new THREE.MeshStandardMaterial({ map: sofaTex }));
        base.position.y = 7 * S;
        const back = new THREE.Mesh(new THREE.BoxGeometry(40 * S, 16 * S, 5 * S), new THREE.MeshStandardMaterial({ map: sofaTex }));
        back.position.set(0, 18 * S, -7.5 * S);
        group.add(base, back);
        obj = group;
      } else if (cp.kind === "stall") {
        const group = new THREE.Group();
        const panel = new THREE.Mesh(new THREE.BoxGeometry(4 * S, 46 * S, 30 * S), new THREE.MeshStandardMaterial({ map: stallTex }));
        const door = new THREE.Mesh(new THREE.BoxGeometry(24 * S, 44 * S, 3 * S), new THREE.MeshStandardMaterial({ map: stallTex }));
        door.position.set(0, -1 * S, 15 * S);
        panel.position.y = 23 * S;
        door.position.y = 22 * S;
        group.add(panel, door);
        obj = group;
      } else {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(18 * S, 42 * S, 18 * S), new THREE.MeshStandardMaterial({ map: serverTex }));
        mesh.position.y = 21 * S;
        // PART 3 final-polish pass §3.2 — blinking LED strip on the rack's
        // front face; toggled green/amber on a random 0.5-1s interval (see
        // serverRackLeds ticking in update()).
        const ledMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.4 });
        const led = new THREE.Mesh(new THREE.BoxGeometry(2 * S, 30 * S, 1 * S), ledMat);
        led.position.set(7 * S, 21 * S, 9.2 * S);
        group.add(mesh, led);
        this.serverRackLeds.push({ material: ledMat, nextToggle: performance.now() + 500 + Math.random() * 500 });
        obj = group;
      }

      obj.position.x = cp.x;
      obj.position.z = cp.y;
      this.scene.add(obj);
      this.addFurnitureAccent(cp.x, cp.y, 17 * S);

      // Subtle idle sway so cover points read as livelier props rather than
      // static scenery. Deliberately NOT reflecting occupancy visually —
      // that would hand the seeker a free "someone's here" beacon and
      // trivialize the entire hide/seek tension.
      const swayTarget = obj.position.y + 2 * S;
      const tween = new TWEEN.Tween(obj.position)
        .to({ y: swayTarget }, 1400 + Math.random() * 400)
        .yoyo(true)
        .repeat(Infinity)
        .delay(Math.random() * 1000)
        .easing(TWEEN.Easing.Sinusoidal.InOut)
        .start();
      this.coverPointModelTargets.push({ id: cp.id, kind: cp.kind, obj, tween });
    }

    preloadFurnitureModels().then(() => this.upgradeCoverPointModels());
  }

  private upgradeCoverPointModels() {
    for (const { id, kind, obj, tween } of this.coverPointModelTargets) {
      const model = cloneFurniture(kind, id);
      if (!model) continue;
      tween.stop();
      model.scale.setScalar(FURNITURE_MODEL_SCALE);
      model.position.copy(obj.position);
      model.position.y = 0;
      this.tintFurnitureForRoom(model, model.position.x, model.position.z);
      this.scene.add(model);
      this.scene.remove(obj);
      disposeObject3D(obj);

      const swayTarget = FURNITURE_MODEL_SCALE * 0.05;
      new TWEEN.Tween(model.position)
        .to({ y: swayTarget }, 1400 + Math.random() * 400)
        .yoyo(true)
        .repeat(Infinity)
        .delay(Math.random() * 1000)
        .easing(TWEEN.Easing.Sinusoidal.InOut)
        .start();
    }
    this.coverPointModelTargets = [];
  }

  private buildDecorations() {
    const binMat = new THREE.MeshStandardMaterial({ color: 0x5b6470 });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xb08d57 });
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x6b7280 });

    DECORATIONS.forEach((deco, i) => {
      if (deco.kind === "bin") {
        const bin = new THREE.Mesh(new THREE.CylinderGeometry(7, 5.5, 14, 12), binMat);
        bin.position.set(deco.x, 7, deco.y);
        this.scene.add(bin);
        return;
      }

      if (deco.kind === "plant-small") {
        const plant = new THREE.Group();
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(7, 5.5, 11, 12),
          new THREE.MeshStandardMaterial({ color: i % 2 ? 0xc26d3a : 0x3d7c78, roughness: 0.82 })
        );
        pot.position.y = 5.5;
        plant.add(pot);
        const leafMat = new THREE.MeshStandardMaterial({ color: i % 3 ? 0x3f8f55 : 0x67a34f, roughness: 0.9 });
        for (let leaf = 0; leaf < 5; leaf += 1) {
          const blade = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), leafMat);
          blade.scale.set(0.65, 1.7, 0.45);
          const angle = (leaf / 5) * Math.PI * 2;
          blade.position.set(Math.cos(angle) * 4, 17 + (leaf % 2) * 4, Math.sin(angle) * 4);
          blade.rotation.z = Math.cos(angle) * 0.35;
          blade.rotation.x = Math.sin(angle) * 0.35;
          plant.add(blade);
        }
        plant.position.set(deco.x, 0, deco.y);
        this.scene.add(plant);
        return;
      }

      if (deco.kind === "papers") {
        const paperGroup = new THREE.Group();
        const paperColours = [0xf8fafc, 0xffe7a3, 0xb9e5ff];
        for (let page = 0; page < 3; page += 1) {
          const sheet = new THREE.Mesh(
            new THREE.BoxGeometry(15, 0.45, 11),
            new THREE.MeshStandardMaterial({ color: paperColours[(i + page) % paperColours.length], roughness: 0.95 })
          );
          sheet.position.set(page * 3 - 3, 0.35 + page * 0.4, page * 1.6 - 1.6);
          sheet.rotation.y = (page - 1) * 0.18;
          paperGroup.add(sheet);
        }
        paperGroup.position.set(deco.x, 0.3, deco.y);
        this.scene.add(paperGroup);
        return;
      }

      // Real-GLB clutter (Among Us-style messiness) — placeholder box/pole
      // now, swapped for the real model once furniture preloads, same as
      // every other cover point/room prop.
      if (deco.kind === "cardboard-box" || deco.kind === "coat-rack") {
        const obj =
          deco.kind === "cardboard-box"
            ? new THREE.Mesh(new THREE.BoxGeometry(18, 16, 16), boxMat)
            : new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 32, 8), rackMat);
        obj.position.set(deco.x, deco.kind === "cardboard-box" ? 8 : 16, deco.y);
        this.scene.add(obj);
        this.roomPropModelTargets.push({ id: `deco-${deco.kind}-${i}`, kind: deco.kind, obj });
        return;
      }
    });
  }

  // One physical prop per real room (Stage 2 of the room-gimmick pass) —
  // purely visual for now, same box-with-generated-texture technique as
  // buildCoverPoints. Stage 3/4 hang server room alarm + the active
  // hider abilities off these same positions.
  private buildRoomProps() {
    const whiteboardTex = generateWhiteboardTexture();
    const coffeeTex = generateCoffeeMachineTexture();
    const monitorTex = generateMonitorTexture();
    const switchTex = generateLightSwitchTexture();
    const sinkTex = generateSinkTexture();
    const mirrorTex = generateMirrorTexture();
    const receptionDeskTex = generateReceptionDeskTexture();
    const windowTex = generateWindowTexture();
    const clockTex = generateWallClockTexture();
    const bulletinTex = generateBulletinBoardTexture();
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const chairLegMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const alarmMountMat = new THREE.MeshStandardMaterial({ color: 0xcfd4dc });
    const alarmDomeMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0x330000 });
    const counterMat = new THREE.MeshStandardMaterial({ color: 0xd8dbe0 });
    const tableMat = new THREE.MeshStandardMaterial({ color: 0xc9a876 });

    const S = FURNITURE_SCALE;
    for (const prop of ROOM_PROPS) {
      let obj: THREE.Object3D;
      let y: number;

      if (prop.kind === "whiteboard") {
        obj = new THREE.Mesh(new THREE.BoxGeometry(50 * S, 34 * S, 3 * S), new THREE.MeshStandardMaterial({ map: whiteboardTex }));
        y = 42 * S;
      } else if (prop.kind === "chair") {
        const group = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(14 * S, 3 * S, 14 * S), chairMat);
        seat.position.y = 12 * S;
        const back = new THREE.Mesh(new THREE.BoxGeometry(14 * S, 16 * S, 3 * S), chairMat);
        back.position.set(0, 21.5 * S, -5.5 * S);
        const legGeo = new THREE.CylinderGeometry(1 * S, 1 * S, 12 * S, 6);
        for (const [lx, lz] of [
          [5.5, 5.5],
          [-5.5, 5.5],
          [5.5, -5.5],
          [-5.5, -5.5],
        ]) {
          const leg = new THREE.Mesh(legGeo, chairLegMat);
          leg.position.set(lx * S, 6 * S, lz * S);
          group.add(leg);
        }
        group.add(seat, back);
        obj = group;
        y = 0;
      } else if (prop.kind === "alarm-light") {
        const group = new THREE.Group();
        const mount = new THREE.Mesh(new THREE.BoxGeometry(8 * S, 6 * S, 6 * S), alarmMountMat);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(5 * S, 12, 8), alarmDomeMat);
        dome.position.y = 4 * S;
        group.add(mount, dome);
        obj = group;
        y = 50 * S;
      } else if (prop.kind === "coffee-machine") {
        const group = new THREE.Group();
        const counter = new THREE.Mesh(new THREE.BoxGeometry(26 * S, 12 * S, 18 * S), counterMat);
        counter.position.y = 6 * S;
        const machine = new THREE.Mesh(new THREE.BoxGeometry(20 * S, 26 * S, 16 * S), new THREE.MeshStandardMaterial({ map: coffeeTex }));
        machine.position.y = 25 * S;
        group.add(counter, machine);
        obj = group;
        y = 0;
      } else if (prop.kind === "monitor") {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(14 * S, 2 * S, 8 * S), new THREE.MeshStandardMaterial({ color: 0x2b2f36 }));
        const stand = new THREE.Mesh(new THREE.BoxGeometry(4 * S, 10 * S, 4 * S), new THREE.MeshStandardMaterial({ color: 0x2b2f36 }));
        stand.position.y = 6 * S;
        const screen = new THREE.Mesh(new THREE.BoxGeometry(24 * S, 16 * S, 2 * S), new THREE.MeshStandardMaterial({ map: monitorTex }));
        screen.position.y = 16 * S;
        group.add(base, stand, screen);
        obj = group;
        y = 0;
      } else if (prop.kind === "report-terminal") {
        const group = new THREE.Group();
        const pedestal = new THREE.Mesh(new THREE.BoxGeometry(18 * S, 26 * S, 14 * S), new THREE.MeshStandardMaterial({ color: 0x1e3a5f }));
        pedestal.position.y = 13 * S;
        const screen = new THREE.Mesh(
          new THREE.BoxGeometry(22 * S, 15 * S, 3 * S),
          new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x0891b2, emissiveIntensity: 0.75 })
        );
        screen.position.set(0, 30 * S, -5 * S);
        const tray = new THREE.Mesh(new THREE.BoxGeometry(20 * S, 2 * S, 16 * S), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
        tray.position.set(0, 22 * S, 3 * S);
        group.add(pedestal, screen, tray);
        obj = group;
        y = 0;
      } else if (prop.kind === "sink") {
        const group = new THREE.Group();
        const stand = new THREE.Mesh(new THREE.BoxGeometry(16 * S, 20 * S, 12 * S), counterMat);
        stand.position.y = 10 * S;
        const basin = new THREE.Mesh(new THREE.BoxGeometry(22 * S, 6 * S, 16 * S), new THREE.MeshStandardMaterial({ map: sinkTex }));
        basin.position.y = 21 * S;
        group.add(stand, basin);
        obj = group;
        y = 0;
      } else if (prop.kind === "mirror") {
        obj = new THREE.Mesh(new THREE.BoxGeometry(22 * S, 26 * S, 2 * S), new THREE.MeshStandardMaterial({ map: mirrorTex }));
        y = 40 * S;
      } else if (prop.kind === "reception-desk") {
        obj = new THREE.Mesh(new THREE.BoxGeometry(56 * S, 22 * S, 28 * S), new THREE.MeshStandardMaterial({ map: receptionDeskTex }));
        y = 11 * S;
      } else if (prop.kind === "table") {
        obj = new THREE.Mesh(new THREE.BoxGeometry(16 * S, 14 * S, 16 * S), tableMat);
        y = 7 * S;
      } else if (prop.kind === "tv") {
        obj = new THREE.Mesh(new THREE.BoxGeometry(30 * S, 18 * S, 3 * S), new THREE.MeshStandardMaterial({ color: 0x14181f }));
        y = 42 * S;
      } else if (prop.kind === "toilet-use") {
        // No real GLB match for this one (it's a pure gag trigger, not a
        // real fixture) — stays this small procedural marker permanently.
        obj = new THREE.Mesh(new THREE.CylinderGeometry(2 * S, 2 * S, 6 * S, 8), new THREE.MeshStandardMaterial({ color: 0xf5f5f0 }));
        y = 3 * S;
      } else if (prop.kind === "trace-terminal") {
        // Seeker's own console — amber/gold instead of the hider mission
        // terminal's cyan, so the two read as visually distinct at a glance.
        const group = new THREE.Group();
        const pedestal = new THREE.Mesh(new THREE.BoxGeometry(18 * S, 26 * S, 14 * S), new THREE.MeshStandardMaterial({ color: 0x3f2d0f }));
        pedestal.position.y = 13 * S;
        const screen = new THREE.Mesh(
          new THREE.BoxGeometry(22 * S, 15 * S, 3 * S),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xb45309, emissiveIntensity: 0.75 })
        );
        screen.position.set(0, 30 * S, -5 * S);
        const dish = new THREE.Mesh(new THREE.CylinderGeometry(9 * S, 9 * S, 2 * S, 16), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
        dish.position.set(0, 40 * S, -5 * S);
        dish.rotation.x = Math.PI / 3;
        group.add(pedestal, screen, dish);
        obj = group;
        y = 0;
      } else if (prop.kind === "exit-gate") {
        const group = new THREE.Group();
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x172033, roughness: 0.55, metalness: 0.45 });
        const statusMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.7 });
        this.exitGateMaterials.push(statusMat);
        const left = new THREE.Mesh(new THREE.BoxGeometry(8 * S, 52 * S, 10 * S), frameMat);
        const right = left.clone();
        left.position.set(-24 * S, 26 * S, 0);
        right.position.set(24 * S, 26 * S, 0);
        const header = new THREE.Mesh(new THREE.BoxGeometry(56 * S, 10 * S, 10 * S), frameMat);
        header.position.y = 52 * S;
        const sign = new THREE.Mesh(new THREE.BoxGeometry(34 * S, 8 * S, 2 * S), statusMat);
        sign.position.set(0, 52 * S, -6 * S);
        const doorGlow = new THREE.Mesh(
          new THREE.PlaneGeometry(38 * S, 42 * S),
          new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
        );
        doorGlow.position.y = 25 * S;
        group.add(left, right, header, sign, doorGlow);
        obj = group;
        y = 0;
      } else if (prop.kind === "window") {
        obj = new THREE.Mesh(new THREE.BoxGeometry(44 * S, 34 * S, 2 * S), new THREE.MeshStandardMaterial({ map: windowTex }));
        y = 34 * S;
      } else if (prop.kind === "wall-clock") {
        obj = new THREE.Mesh(new THREE.CircleGeometry(7 * S, 20), new THREE.MeshStandardMaterial({ map: clockTex }));
        y = 40 * S;
      } else if (prop.kind === "bulletin-board") {
        obj = new THREE.Mesh(new THREE.BoxGeometry(34 * S, 26 * S, 2 * S), new THREE.MeshStandardMaterial({ map: bulletinTex }));
        y = 32 * S;
      } else if (prop.kind === "water-cooler") {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(7 * S, 8 * S, 20 * S, 10), new THREE.MeshStandardMaterial({ color: 0xe5e7eb }));
        base.position.y = 10 * S;
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(6 * S, 5 * S, 16 * S, 12),
          new THREE.MeshStandardMaterial({ color: 0x60c8f0, transparent: true, opacity: 0.75 })
        );
        bottle.position.y = 28 * S;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.5 * S, 5.5 * S, 2 * S, 12), new THREE.MeshStandardMaterial({ color: 0x1e3a5f }));
        cap.position.y = 36.5 * S;
        group.add(base, bottle, cap);
        obj = group;
        y = 0;
      } else {
        obj = new THREE.Mesh(new THREE.BoxGeometry(6 * S, 9 * S, 2 * S), new THREE.MeshStandardMaterial({ map: switchTex }));
        y = 45 * S;
      }

      obj.position.x = prop.x;
      obj.position.y = y;
      obj.position.z = prop.y;
      this.scene.add(obj);
      const propRoom = ROOMS.find((r) => pointInRoom(prop.x, prop.y, r));
      const propStyle = propRoom ? ROOM_VISUALS[propRoom.id] : undefined;
      if (propStyle) {
        const marker = new THREE.Mesh(
          new THREE.RingGeometry(13 * S, 17 * S, 24),
          new THREE.MeshBasicMaterial({ color: propStyle.accent, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(prop.x, 0.75, prop.y);
        this.scene.add(marker);
      }
      this.roomPropModelTargets.push({ id: prop.id, kind: prop.kind, obj });
    }

    preloadFurnitureModels().then(() => this.upgradeRoomPropModels());
  }

  private upgradeRoomPropModels() {
    for (const { id, kind, obj } of this.roomPropModelTargets) {
      const model = cloneFurniture(kind, id);
      if (!model) continue;
      model.scale.setScalar(FURNITURE_MODEL_SCALE);
      model.position.set(obj.position.x, 0, obj.position.z);
      this.tintFurnitureForRoom(model, model.position.x, model.position.z);
      this.scene.add(model);
      this.scene.remove(obj);
      disposeObject3D(obj);
    }
    this.roomPropModelTargets = [];
  }

  private addFurnitureAccent(x: number, z: number, radius: number) {
    const owner = ROOMS.find((room) => pointInRoom(x, z, room));
    const style = owner ? ROOM_VISUALS[owner.id] : undefined;
    if (!style) return;
    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color: style.accent, transparent: true, opacity: 0.13, depthWrite: false })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 0.55, z);
    this.scene.add(marker);
  }

  private tintFurnitureForRoom(root: THREE.Object3D, x: number, z: number) {
    const owner = ROOMS.find((room) => pointInRoom(x, z, room));
    const style = owner ? ROOM_VISUALS[owner.id] : undefined;
    if (!style) return;
    const accent = new THREE.Color(style.accent);
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const wasArray = Array.isArray(obj.material);
      const materials = wasArray ? obj.material : [obj.material];
      const tinted = materials.map((source: THREE.Material) => {
        const material = source.clone();
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.lerp(accent, 0.16);
          material.roughness = Math.min(1, material.roughness + 0.08);
        }
        return material;
      });
      obj.material = wasArray ? tinted : tinted[0];
    });
  }

  // Hanging pendant lights — purely ambient, reinforces "indoors under
  // office lighting" instead of the floor just fading into open darkness.
  private buildCeilingLights() {
    const cordMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36 });
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffd97a, emissiveIntensity: 0.6 });

    const S = FURNITURE_SCALE;
    for (const light of CEILING_LIGHTS) {
      const group = new THREE.Group();
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * S, 0.6 * S, 12 * S, 6), cordMat);
      cord.position.y = WALL_HEIGHT - 6 * S;
      const shade = new THREE.Mesh(new THREE.ConeGeometry(8 * S, 6 * S, 12, 1, true), shadeMat);
      shade.position.y = WALL_HEIGHT - 12 * S;
      group.add(cord, shade);
      group.position.set(light.x, 0, light.y);
      this.scene.add(group);
    }
  }

  // One semi-transparent black volume per room, built once and toggled by
  // `darkRooms` state — deliberately a full-height box (not a floor decal),
  // so a dark room reads as genuinely dark from any camera angle/zoom,
  // matching the spec's "don't over-engineer, pick the most stable method."
  private buildDarkRoomOverlays() {
    for (const room of ROOMS) {
      // Each room gets its OWN material instance (not shared) so one room's
      // fade-in/out animates independently of every other dark room.
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.h), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(room.x + room.w / 2, WALL_HEIGHT + 4, room.y + room.h / 2);
      mesh.renderOrder = 50;
      mesh.visible = false;
      this.scene.add(mesh);
      this.darkRoomOverlays.set(room.id, { mesh, opacity: 0 });
    }
  }

  // PART 3 final-polish pass §3.1 — the inverse of buildDarkRoomOverlays:
  // a warm additive floor glow for whichever rooms currently have their
  // lights ON (i.e. NOT in `darkRooms`), so a lit room reads as visibly
  // brighter than the now-dim corridor baseline. Same one-mesh-per-room,
  // fade-toward-target approach, just additive/warm instead of black.
  private buildLitRoomOverlays() {
    for (const room of ROOMS) {
      const mat = new THREE.MeshBasicMaterial({
        color: ROOM_LIT_WARM_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.h), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(room.x + room.w / 2, 0.6, room.y + room.h / 2);
      mesh.visible = false;
      this.scene.add(mesh);
      this.litRoomOverlays.set(room.id, { mesh, opacity: 0 });
    }
  }

  private updateLitRoomOverlays(dt: number) {
    if (!this.room) return;
    const ease = Math.min(1, LIGHT_EASE_RATE * dt);
    this.litRoomOverlays.forEach((entry, roomId) => {
      const target = this.room!.state.darkRooms.has(roomId) ? 0 : ROOM_LIT_OVERLAY_OPACITY;
      entry.opacity = THREE.MathUtils.lerp(entry.opacity, target, ease);
      (entry.mesh.material as THREE.MeshBasicMaterial).opacity = entry.opacity;
      entry.mesh.visible = entry.opacity > 0.001;
    });
  }

  private updateDarkRoomOverlays(dt: number) {
    if (!this.room) return;
    const ease = Math.min(1, LIGHT_EASE_RATE * dt);
    this.darkRoomOverlays.forEach((entry, roomId) => {
      const target = this.room!.state.darkRooms.has(roomId) ? GAME_CONFIG.DARKNESS_ALPHA : 0;
      entry.opacity = THREE.MathUtils.lerp(entry.opacity, target, ease);
      (entry.mesh.material as THREE.MeshBasicMaterial).opacity = entry.opacity;
      entry.mesh.visible = entry.opacity > 0.001;
    });
    this.updateLitRoomOverlays(dt);
  }

  // Floating glowing gift box per spawn point — hidden while that spot is on
  // cooldown (server's `collectedSmokeItems`), same bob-and-spin idle
  // treatment as a typical "pick this up" game item.
  private buildSmokeItems() {
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x4c1d95, emissiveIntensity: 0.6 });
    const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x854d0e, emissiveIntensity: 0.35 });
    for (const spawn of SMOKE_ITEM_SPAWNS) {
      const gift = new THREE.Group();
      const cube = new THREE.Mesh(new THREE.BoxGeometry(18, 15, 18), boxMat);
      const ribbonX = new THREE.Mesh(new THREE.BoxGeometry(4, 16, 19), ribbonMat);
      const ribbonZ = new THREE.Mesh(new THREE.BoxGeometry(19, 16, 4), ribbonMat);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(20, 3, 20), boxMat);
      lid.position.y = 9;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(14, 1.2, 6, 24), ribbonMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = -7;
      gift.add(cube, ribbonX, ribbonZ, lid, halo);
      gift.position.set(spawn.x, 14, spawn.y);
      this.scene.add(gift);
      this.smokeItemMeshes.set(spawn.id, gift);

      new TWEEN.Tween(gift.position)
        .to({ y: 20 }, 900 + Math.random() * 300)
        .yoyo(true)
        .repeat(Infinity)
        .delay(Math.random() * 800)
        .easing(TWEEN.Easing.Sinusoidal.InOut)
        .start();
    }
  }

  private updateSmokeItems() {
    if (!this.room) return;
    this.smokeItemMeshes.forEach((mesh, id) => {
      mesh.visible = !this.room!.state.collectedSmokeItems.has(id);
      mesh.rotation.y += 0.03;
    });
  }
}
