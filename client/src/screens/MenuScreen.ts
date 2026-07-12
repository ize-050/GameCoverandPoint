import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import type { Screen, Navigate } from "../core/ScreenManager";
import { createOverlay, removeOverlay } from "../dom/overlay";
import { NetworkManager, JoinError } from "../network/NetworkManager";
import { Character3D } from "../entities3d/Character3D";
import { DEFAULT_APPEARANCE, CHARACTER_VARIANTS, type CharacterAppearance } from "../../../shared/messages";
import { icon, escapeHtml, EMOTE_ICON_NAMES } from "../dom/icons";
import { playUiClickSfx } from "../audio/sfx";

const NICKNAME_KEY = "hns_nickname";
const APPEARANCE_KEY = "hns_appearance";
const PREVIEW_SIZE = 200;

function loadAppearance(): CharacterAppearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw) return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
  } catch {
    // ignore malformed stored value, fall back to default
  }
  return { ...DEFAULT_APPEARANCE };
}

// Menu's live character preview needs its own small renderer (per the plan) —
// separate scene/camera/canvas from the main game world, since it's shown
// before any room/world exists.
export class MenuScreen implements Screen {
  private navigate: Navigate;
  private network = new NetworkManager();
  private appearance = loadAppearance();

  private overlay?: HTMLDivElement;
  private previewRenderer?: THREE.WebGLRenderer;
  private previewScene?: THREE.Scene;
  private previewCamera?: THREE.PerspectiveCamera;
  private previewCharacter?: Character3D;
  private previewTween?: TWEEN.Tween<THREE.Vector3>;

  constructor(navigate: Navigate) {
    this.navigate = navigate;
  }

  mount() {
    this.overlay = createOverlay();
    this.overlay.className = "hns-landing";
    this.overlay.style.display = "block";
    this.overlay.style.overflowY = "auto";
    this.overlay.style.overflowX = "hidden";
    this.overlay.style.background = "#070b14";
    this.overlay.innerHTML = this.template();
    this.wire();
    this.buildPreview();
  }

  unmount() {
    this.previewTween?.stop();
    this.previewCharacter?.destroy();
    this.previewRenderer?.dispose();
    if (this.overlay) removeOverlay(this.overlay);
    this.overlay = undefined;
  }

  update() {
    if (this.previewRenderer && this.previewScene && this.previewCamera) {
      this.previewRenderer.render(this.previewScene, this.previewCamera);
    }
  }

  private template(): string {
    const savedNickname = localStorage.getItem(NICKNAME_KEY) ?? "";
    return `
      <nav class="landing-nav">
        <a href="#top" class="landing-brand">${icon("hider", { size: 25, color: "#fbbf24" })}<span>CLOCK OUT<br/><small>PROTOCOL</small></span></a>
        <div class="landing-links"><a href="#story">Story</a><a href="#how">How to Play</a><a href="#roles">Roles</a><a href="#play" class="nav-cta">Play Now</a></div>
      </nav>

      <main id="top">
        <section class="landing-hero">
          <div class="hero-art" aria-hidden="true"></div>
          <div class="hero-content">
            <div class="eyebrow">ONLINE OFFICE PARTY GAME · 1–10 PLAYERS</div>
            <h1>ESCAPE THE<br/><span>OVERTIME.</span></h1>
            <p>The office AI has locked the doors. Complete secret missions, deploy ridiculous gadgets, hide from Office Patrol—and clock out before time runs out.</p>
            <div class="hero-actions"><a href="#play" class="hero-primary">PLAY IN BROWSER</a><a href="#story" class="hero-secondary">DISCOVER THE STORY ↓</a></div>
            <div class="hero-chips"><span>⚡ No install</span><span>👥 Team building</span><span>🎁 Random gadgets</span></div>
          </div>
        </section>

        <section id="story" class="landing-section story-section">
          <div class="section-kicker">THE STORY</div>
          <div class="story-grid">
            <div><h2>THE LAST MEETING<br/>WAS A TRAP.</h2><p>It is 6:00 PM. Just as everyone prepares to leave, the building enters <b>Overtime Lockdown</b>. Doors seal. Lights fail. The office AI schedules one final meeting—with no end time.</p><p>You are part of the <b>Clock-Out Crew</b>: employees completing covert Office Missions to unlock the Reception exit and escape. But the company has activated <b>Office Patrol</b>, relentless seekers equipped with scans and trace terminals.</p></div>
            <div class="story-card"><div class="story-time">18:00</div><div class="story-alert">⚠ OVERTIME LOCKDOWN</div><p>Three missions. One escape window. Trust your team—but never trust a filing cabinet.</p></div>
          </div>
        </section>

        <section id="roles" class="landing-section roles-section">
          <div class="section-kicker">CHOOSE YOUR FATE</div><h2 class="center-title">TWO ROLES. ONE VERY LONG SHIFT.</h2>
          <div class="role-grid">
            <article class="role-card hider-card"><div class="role-icon">🫣</div><div class="role-label">CLOCK-OUT CREW</div><h3>HIDER</h3><p>Hold E to complete three risky missions, unlock Reception's exit and clock out before Office Patrol catches you.</p><ul><li>◆ Mission markers & private minimap</li><li>🎁 Smoke, Decoy, Stun and Sprint</li><li>👁 Press C to check on teammates</li></ul></article>
            <article class="role-card seeker-card"><div class="role-icon">👁️</div><div class="role-label">OFFICE PATROL</div><h3>SEEKER</h3><p>Read the room, inspect suspicious cover and use tactical scans to catch every employee before the overtime timer expires.</p><ul><li>◉ F: short-range hidden-player scan</li><li>⌁ Trace Terminal: temporary reveal</li><li>🔍 Limited inspections—choose wisely</li></ul></article>
          </div>
        </section>

        <section id="how" class="landing-section how-section">
          <div class="section-kicker">HOW TO PLAY</div><h2 class="center-title">YOUR FIRST SHIFT IN 4 STEPS</h2>
          <div class="steps-grid">
            <article><b>01</b><span>CREATE A ROOM</span><p>Choose a character, create a room and share the four-character code.</p></article>
            <article><b>02</b><span>REVEAL YOUR ROLE</span><p>Each round randomly assigns the Clock-Out Crew and Office Patrol.</p></article>
            <article><b>03</b><span>WORK UNDER PRESSURE</span><p>Hiders hold E for 3 seconds at mission markers. Moving or releasing E cancels the task.</p></article>
            <article><b>04</b><span>CLOCK OUT</span><p>Finish all three missions, unlock the Reception exit and escape. Patrol wins by catching the crew first.</p></article>
          </div>
          <div class="controls-strip"><span><kbd>WASD</kbd> MOVE</span><span><kbd>SPACE</kbd> HIDE / INSPECT</span><span><kbd>E</kbd> MISSION</span><span><kbd>Q</kbd> GADGET</span><span><kbd>F</kbd> SCAN</span><span><kbd>1–4</kbd> EMOTE ${EMOTE_ICON_NAMES.map((n) => icon(n, { size: 14 })).join("")}</span></div>
        </section>

        <section id="play" class="landing-section play-section">
          <div class="play-copy"><div class="section-kicker">READY TO CLOCK OUT?</div><h2>START YOUR<br/>ESCAPE PLAN.</h2><p>No download. Create a private room and invite your team instantly.</p><div id="previewBox" style="width:${PREVIEW_SIZE}px;height:${PREVIEW_SIZE}px;border-radius:24px;overflow:hidden;background:#0c1528;border:1px solid #22d3ee66;"></div></div>
          <div class="hns-panel play-panel">
            <div class="hns-label">YOUR NICKNAME</div><input id="nickname" class="hns-input" maxlength="12" placeholder="Nickname (max 12 characters)" value="${escapeHtml(savedNickname)}" />
            <div class="hns-label">CHOOSE YOUR EMPLOYEE</div><div class="variant-row"><button id="variantPrev" class="hns-btn hns-btn-ghost">${icon("chevron-left", { size: 14 })}</button><span id="variantLabel">Employee 1</span><button id="variantNext" class="hns-btn hns-btn-ghost">${icon("chevron-right", { size: 14 })}</button></div>
            <button id="createBtn" class="hns-btn hns-btn-primary">${icon("door", { size: 16 })} CREATE PRIVATE ROOM</button>
            <div class="join-divider"><span>OR JOIN A TEAM</span></div><div class="join-row"><input id="code" class="hns-input" maxlength="4" placeholder="ROOM CODE" /><button id="joinBtn" class="hns-btn hns-btn-secondary">${icon("key", { size: 16 })} JOIN</button></div>
            <div id="error" class="hns-error"></div>
          </div>
        </section>
      </main>
      <footer>Clock Out Protocol · Browser Multiplayer Prototype · Built for teams that deserve to go home.</footer>
    `;
  }

  private buildPreview() {
    const box = this.overlay!.querySelector("#previewBox") as HTMLDivElement;
    this.previewScene = new THREE.Scene();
    this.previewCamera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
    this.previewCamera.position.set(70, 75, 100);
    this.previewCamera.lookAt(0, 28, 0);

    this.previewScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.9);
    sun.position.set(80, 120, 60);
    this.previewScene.add(sun);

    this.previewCharacter = new Character3D(this.appearance, "");
    this.previewScene.add(this.previewCharacter.group);

    this.previewTween = new TWEEN.Tween(this.previewCharacter.group.position)
      .to({ y: 6 }, 900)
      .yoyo(true)
      .repeat(Infinity)
      .easing(TWEEN.Easing.Sinusoidal.InOut)
      .start();

    this.previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.previewRenderer.setSize(PREVIEW_SIZE, PREVIEW_SIZE);
    box.appendChild(this.previewRenderer.domElement);
  }

  private wire() {
    const root = this.overlay!;
    const nicknameInput = root.querySelector("#nickname") as HTMLInputElement;
    const codeInput = root.querySelector("#code") as HTMLInputElement;
    const createBtn = root.querySelector("#createBtn") as HTMLButtonElement;
    const joinBtn = root.querySelector("#joinBtn") as HTMLButtonElement;
    const errorEl = root.querySelector("#error") as HTMLDivElement;
    const variantLabelEl = root.querySelector("#variantLabel") as HTMLSpanElement;
    const variantPrevBtn = root.querySelector("#variantPrev") as HTMLButtonElement;
    const variantNextBtn = root.querySelector("#variantNext") as HTMLButtonElement;

    const persistAppearance = () => localStorage.setItem(APPEARANCE_KEY, JSON.stringify(this.appearance));

    let variantIndex = Math.max(0, CHARACTER_VARIANTS.indexOf(this.appearance.variant));
    const applyVariant = () => {
      this.appearance.variant = CHARACTER_VARIANTS[variantIndex];
      variantLabelEl.textContent = `Employee ${variantIndex + 1}`;
      this.previewCharacter?.setAppearance(this.appearance);
      persistAppearance();
    };
    applyVariant();

    variantPrevBtn.addEventListener("click", () => {
      variantIndex = (variantIndex - 1 + CHARACTER_VARIANTS.length) % CHARACTER_VARIANTS.length;
      applyVariant();
      playUiClickSfx();
    });
    variantNextBtn.addEventListener("click", () => {
      variantIndex = (variantIndex + 1) % CHARACTER_VARIANTS.length;
      applyVariant();
      playUiClickSfx();
    });

    codeInput.addEventListener("input", () => {
      codeInput.value = codeInput.value.toUpperCase();
    });

    const showError = (text: string) => {
      errorEl.textContent = text;
    };

    const getNickname = () => {
      const value = nicknameInput.value.trim().slice(0, 12) || `Player${Math.floor(Math.random() * 1000)}`;
      localStorage.setItem(NICKNAME_KEY, value);
      return value;
    };

    createBtn.addEventListener("click", async () => {
      playUiClickSfx();
      showError("");
      createBtn.disabled = true;
      try {
        const room = await this.network.createRoom(getNickname(), this.appearance);
        this.navigate("Lobby", { room });
      } catch (err) {
        showError(this.describeError(err));
        createBtn.disabled = false;
      }
    });

    joinBtn.addEventListener("click", async () => {
      playUiClickSfx();
      showError("");
      const code = codeInput.value.trim();
      if (code.length !== 4) {
        showError("Enter a 4-character room code");
        return;
      }
      joinBtn.disabled = true;
      try {
        const room = await this.network.joinRoom(code, getNickname(), this.appearance);
        this.navigate("Lobby", { room });
      } catch (err) {
        showError(this.describeError(err));
        joinBtn.disabled = false;
      }
    });
  }

  private describeError(err: unknown): string {
    if (err instanceof JoinError) {
      if (err.reason === "ROOM_FULL") return "This room is full (10 players)";
      if (err.reason === "GAME_ALREADY_STARTED") return "This round has already started";
      return "Room not found";
    }
    console.error(err);
    return "Could not connect to the server. Try again.";
  }
}
