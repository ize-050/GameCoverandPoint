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
  CEILING_LIGHTS,
  SMOKE_ITEM_SPAWNS,
  pointInRoom,
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
  ServerAlarmMessage,
  WrongRoomHintMessage,
  MonitorPeekMessage,
  ToiletUseMessage,
  SmokeDeployedMessage,
} from "../../../shared/messages";
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
import type { Character3D } from "../entities3d/Character3D";
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

function propHintText(kind: RoomPropDef["kind"]): string {
  if (kind === "whiteboard") return "[SPACE] เขียนกระดานหลอกคนหา";
  if (kind === "coffee-machine") return "[SPACE] ดื่มกาแฟ (เร็วขึ้นชั่วคราว)";
  if (kind === "light-switch") return "[SPACE] เปิด/ปิดไฟห้องนี้";
  if (kind === "toilet-use") return "[SPACE] เข้าห้องน้ำ";
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
const TOILET_USE_ANIM_MS = 2200;
const URGENT_TIME_SEC = 30;
const BASE_AMBIENT_INTENSITY = 0.7;
const BASE_SUN_INTENSITY = 0.95;
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
const ISO_ELEVATION = (50 * Math.PI) / 180;
const ISO_DISTANCE = 900;
const CAMERA_ROTATE_SPEED = Math.PI * 0.75; // rad/sec while Q/E held
// Among Us-style tight framing by default — a smaller half-height means
// characters and furniture fill much more of the screen than a wide
// strategy-game view. Scroll still reaches out to MAX_CAMERA_ZOOM for
// players who want the wider view back.
const VIEW_SIZE = 320; // world units of half-height visible in the viewport, default zoom
const MIN_CAMERA_ZOOM = 200;
const MAX_CAMERA_ZOOM = 1400;
const MOUSE_DRAG_SENSITIVITY = 0.006; // radians of orbit per pixel of horizontal drag
const WHEEL_ZOOM_SENSITIVITY = 0.6; // world units of zoom per wheel-delta unit
// Wheel input sets a TARGET zoom (see targetCameraZoom); the actual zoom
// eases toward it every frame at this rate instead of snapping per tick —
// a mouse notch (large deltaY) used to jump the view instantly.
const ZOOM_EASE_RATE = 10;
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
  private targetCameraZoom = VIEW_SIZE;
  private isDragging = false;
  private lastDragX = 0;
  private built = false;

  private room?: Room<GameState>;
  private localPlayer?: LocalPlayer3D;
  private myPlayer?: Player;
  private remotePlayers = new Map<string, RemotePlayer3D>();
  private prevHidden = new Map<string, boolean>();
  private prevHasSmokeBomb = false;
  private prevDazed = false;
  private smokeItemMeshes = new Map<string, THREE.Object3D>();
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
  // Real GLB furniture models load async; every cover point/prop starts as
  // the existing procedural generated-texture mesh (a perfectly good
  // fallback) and gets swapped for a real model once preloadFurnitureModels()
  // resolves, for whichever kinds have one (see FURNITURE_MODEL_PATHS).
  private coverPointModelTargets: Array<{ id: string; kind: string; obj: THREE.Object3D; tween: TWEEN.Tween<THREE.Vector3> }> = [];
  private roomPropModelTargets: Array<{ id: string; kind: string; obj: THREE.Object3D }> = [];

  // Mouse camera controls (Stage 3) — additive alongside Q/E, not a
  // replacement. Bound as instance fields (not prototype methods) so the
  // exact same function reference can be passed to both addEventListener
  // (mount) and removeEventListener (unmount).
  private onPointerDown = (e: PointerEvent) => {
    this.isDragging = true;
    this.lastDragX = e.clientX;
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastDragX;
    this.lastDragX = e.clientX;
    this.cameraAzimuth += dx * MOUSE_DRAG_SENSITIVITY;
  };
  private onPointerUp = () => {
    this.isDragging = false;
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.targetCameraZoom = clamp(this.targetCameraZoom + e.deltaY * WHEEL_ZOOM_SENSITIVITY, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
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
      });
      this.minimap = new Minimap();
      this.wireNetworking();
    }
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
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
    this.prevHidden.clear();
    this.prevHasSmokeBomb = false;
    this.prevDazed = false;
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
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("wheel", this.onWheel);
    this.isDragging = false;
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

    // Camera orbit works regardless of role/phase/ghost state — it's a
    // viewing preference, not a gameplay action.
    if (keyboard.isDown("KeyQ")) this.cameraAzimuth -= CAMERA_ROTATE_SPEED * dt;
    if (keyboard.isDown("KeyE")) this.cameraAzimuth += CAMERA_ROTATE_SPEED * dt;

    if (Math.abs(this.cameraZoom - this.targetCameraZoom) > 0.01) {
      this.cameraZoom = THREE.MathUtils.lerp(this.cameraZoom, this.targetCameraZoom, Math.min(1, ZOOM_EASE_RATE * dt));
      this.resize(window.innerWidth, window.innerHeight);
    }

    if (this.room && this.localPlayer && this.myPlayer) {
      const isGhost = this.myPlayer.isCaught;
      const blackedOut = phase === "hide" && this.myPlayer.role === "seeker";
      const canMove = (phase === "hide" || phase === "seek") && !blackedOut && !this.myPlayer.isHidden;

      this.localPlayer.update(dt * 1000, {
        canMove,
        role: this.myPlayer.role,
        isGhost,
        speedBoosted: this.myPlayer.speedBoosted,
        isDazed: this.myPlayer.isDazed,
      });
      this.followTarget.copy(this.localPlayer.character.position);

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
          if (keyboard.justDown("KeyF")) this.room!.send("decoy");
          if (keyboard.justDown("KeyG") && this.myPlayer.hasSmokeBomb) this.room!.send("useSmoke");
        }
      }
    }

    this.remotePlayers.forEach((p) => p.update(dt));

    if (keyboard.justDown("KeyM")) this.minimap?.toggle();
    if (this.localPlayer) {
      const pos = this.localPlayer.character.position;
      this.minimap?.render({ x: pos.x, z: pos.z }, this.remotePlayers);
    }

    this.updateDarkRoomOverlays(dt);
    this.updateSmokeItems();
    if (this.myPlayer && this.myPlayer.isDazed !== this.prevDazed) {
      this.prevDazed = this.myPlayer.isDazed;
      this.hud?.setDazed(this.myPlayer.isDazed);
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

    this.camera.position.copy(this.followTarget).add(isoOffset(this.cameraAzimuth));
    this.camera.lookAt(this.followTarget);
    this.renderer.render(this.scene, this.camera);

    this.updateHud(phase);
  }

  private updateHud(phase: string) {
    if (!this.hud || !this.room) return;

    musicPlayer.setMood(phase === "seek" ? "tense" : "calm");

    const timeRemaining = this.room.state.timeRemaining;
    this.hud.setTimer(phase, timeRemaining, performance.now());

    const blackedOut = phase === "hide" && this.myPlayer?.role === "seeker";
    this.hud.setBlackout(!!blackedOut, timeRemaining);

    const showInspects = this.myPlayer?.role === "seeker" && (phase === "hide" || phase === "seek");
    this.hud.setInspectsRemaining(this.myPlayer?.inspectsRemaining ?? 0, GAME_CONFIG.MAX_INSPECT_ATTEMPTS, showInspects);

    this.hud.setRelocateActive(this.room.state.relocateActive, this.myPlayer?.role ?? "");

    const showAbilities = this.myPlayer?.role === "hider" && !this.myPlayer?.isCaught && (phase === "hide" || phase === "seek");
    this.hud.setAbilitiesVisible(!!showAbilities);

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
        const unsubSelf = player.onChange(() => {
          this.checkHideGimmick(sessionId, player);
          this.checkSmokePickup(player);
          this.refreshAllVisibility();
        });
        this.unsubs.push(unsubSelf);
        return;
      }

      const remote = new RemotePlayer3D(this.scene, player.x, player.y, player.nickname, appearanceOf(player));
      this.remotePlayers.set(sessionId, remote);
      this.updateRemoteVisibility(remote, player);

      const unsubChange = player.onChange(() => {
        remote.setTarget(player.x, player.y);
        remote.setAppearance(appearanceOf(player));
        remote.playAnimation(player.isCaught ? "die" : player.anim);
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
    if (!me || me.isCaught || !this.localPlayer) return null;
    if (phase !== "hide" && phase !== "seek") return null;

    if (me.role === "hider" && me.isHidden) return "[SPACE] ออกจากที่ซ่อน";

    const lightSwitch = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, LIGHT_SWITCH_KIND);
    if (lightSwitch) return propHintText(lightSwitch.kind);

    const toiletUse = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, TOILET_USE_KIND);
    if (toiletUse) return propHintText(toiletUse.kind);

    if (me.role === "hider") {
      const prop = this.findNearestUsableProp(GAME_CONFIG.ROOM_PROP_RANGE_PX, ACTIVE_PROP_KINDS);
      if (prop) return propHintText(prop.kind);
      if (me.hasSmokeBomb) return "[G] ใช้ระเบิดควัน";
      const cp = this.findNearestCoverPoint(GAME_CONFIG.HIDE_RANGE_PX);
      if (!cp) return null;
      return cp.isOccupied ? "จุดนี้มีคนซ่อนอยู่แล้ว" : "[SPACE] ซ่อนที่นี่";
    }

    if (me.role === "seeker") {
      if (this.findNearestExposedHider(GAME_CONFIG.TAG_RANGE_PX)) return "[SPACE] จับ!";
      const cp = this.findNearestCoverPoint(GAME_CONFIG.INSPECT_RANGE_PX);
      if (!cp) return null;
      return me.inspectsRemaining > 0 ? "[SPACE] ตรวจจุดนี้" : `${icon("blocked", { size: 14 })} หมดโควตาตรวจแล้ว`;
    }

    return null;
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

    this.ambientLight = new THREE.AmbientLight(0xffffff, BASE_AMBIENT_INTENSITY);
    this.scene.add(this.ambientLight);
    this.sunLight = new THREE.DirectionalLight(0xf5f7fa, BASE_SUN_INTENSITY);
    this.sunLight.position.set(300, 500, 200);
    this.scene.add(this.sunLight);

    this.buildGround();
    this.buildWalls();
    this.buildCoverPoints();
    this.buildDecorations();
    this.buildRoomProps();
    this.buildCeilingLights();
    this.buildDarkRoomOverlays();
    this.buildSmokeItems();
  }

  private buildGround() {
    const tex = generateGroundTexture();
    tex.repeat.set(MAP_WIDTH / GROUND_TEX_WORLD_SIZE, MAP_HEIGHT / GROUND_TEX_WORLD_SIZE);
    const geo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT);
    const mat = new THREE.MeshStandardMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(MAP_WIDTH / 2, 0, MAP_HEIGHT / 2);
    this.scene.add(mesh);
  }

  private buildWalls() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xcfd4dc });
    for (const wall of WALLS) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, WALL_HEIGHT, wall.h), mat);
      mesh.position.set(wall.x + wall.w / 2, WALL_HEIGHT / 2, wall.y + wall.h / 2);
      this.scene.add(mesh);
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
        group.add(desk, monitorBase, monitorStand, monitorScreen);
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
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(18 * S, 42 * S, 18 * S), new THREE.MeshStandardMaterial({ map: serverTex }));
        mesh.position.y = 21 * S;
        obj = mesh;
      }

      obj.position.x = cp.x;
      obj.position.z = cp.y;
      this.scene.add(obj);

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
    const plantTex = generatePlantSmallTexture();
    const papersTex = generatePapersTexture();
    const binMat = new THREE.MeshStandardMaterial({ color: 0x5b6470 });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xb08d57 });
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x6b7280 });

    DECORATIONS.forEach((deco, i) => {
      if (deco.kind === "bin") {
        const bin = new THREE.Mesh(new THREE.CylinderGeometry(4, 3, 8, 10), binMat);
        bin.position.set(deco.x, 4, deco.y);
        this.scene.add(bin);
        return;
      }

      // Real-GLB clutter (Among Us-style messiness) — placeholder box/pole
      // now, swapped for the real model once furniture preloads, same as
      // every other cover point/room prop.
      if (deco.kind === "cardboard-box" || deco.kind === "coat-rack") {
        const obj =
          deco.kind === "cardboard-box"
            ? new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), boxMat)
            : new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 22, 6), rackMat);
        obj.position.set(deco.x, deco.kind === "cardboard-box" ? 5 : 11, deco.y);
        this.scene.add(obj);
        this.roomPropModelTargets.push({ id: `deco-${deco.kind}-${i}`, kind: deco.kind, obj });
        return;
      }

      const tex = deco.kind === "plant-small" ? plantTex : papersTex;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      const scale = deco.kind === "plant-small" ? 14 : 10;
      sprite.scale.set(scale, scale, 1);
      sprite.position.set(deco.x, scale / 2, deco.y);
      this.scene.add(sprite);
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
      this.scene.add(model);
      this.scene.remove(obj);
      disposeObject3D(obj);
    }
    this.roomPropModelTargets = [];
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
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(room.w, WALL_HEIGHT, room.h), mat);
      mesh.position.set(room.x + room.w / 2, WALL_HEIGHT / 2, room.y + room.h / 2);
      mesh.visible = false;
      this.scene.add(mesh);
      this.darkRoomOverlays.set(room.id, { mesh, opacity: 0 });
    }
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
  }

  // Floating glowing orb per spawn point — hidden while that spot is on
  // cooldown (server's `collectedSmokeItems`), same bob-and-spin idle
  // treatment as a typical "pick this up" game item.
  private buildSmokeItems() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x6d28d9, emissiveIntensity: 0.7 });
    for (const spawn of SMOKE_ITEM_SPAWNS) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 10), mat);
      mesh.position.set(spawn.x, 14, spawn.y);
      this.scene.add(mesh);
      this.smokeItemMeshes.set(spawn.id, mesh);

      new TWEEN.Tween(mesh.position)
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
