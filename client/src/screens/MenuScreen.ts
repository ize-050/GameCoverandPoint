import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import type { Screen, Navigate } from "../core/ScreenManager";
import { createOverlay, removeOverlay } from "../dom/overlay";
import { NetworkManager, JoinError } from "../network/NetworkManager";
import { Character3D } from "../entities3d/Character3D";
import { DEFAULT_APPEARANCE, CHARACTER_VARIANTS, type CharacterAppearance } from "../../../shared/messages";
import { icon, EMOTE_ICON_NAMES } from "../dom/icons";
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
      <div style="display:flex;gap:28px;align-items:flex-start;">
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div style="text-align:center;">
            <div class="hns-title" style="font-size:34px;color:#fff;display:flex;align-items:center;justify-content:center;gap:10px;">${icon(
              "hider",
              { size: 30, color: "#fbbf24" }
            )} Hide &amp; Seek Online</div>
            <div style="color:var(--text-dim);font-size:14px;margin-top:4px;">เกมซ่อนหาออนไลน์ สำหรับกิจกรรมทีม</div>
          </div>

          <div class="hns-panel" style="display:flex;flex-direction:column;gap:14px;width:320px;color:#fff;">
            <input id="nickname" class="hns-input" maxlength="12" placeholder="ชื่อเล่น (สูงสุด 12 ตัว)" value="${savedNickname}" />

            <div>
              <div class="hns-label" style="margin-bottom:6px;">ตัวละคร</div>
              <div style="display:flex;gap:10px;align-items:center;">
                <button id="variantPrev" class="hns-btn hns-btn-ghost">${icon("chevron-left", { size: 14 })}</button>
                <span id="variantLabel" style="flex:1;text-align:center;font-size:14px;">แบบที่ 1</span>
                <button id="variantNext" class="hns-btn hns-btn-ghost">${icon("chevron-right", { size: 14 })}</button>
              </div>
            </div>

            <div style="height:1px;background:rgba(255,255,255,0.08);margin:4px 0;"></div>

            <button id="createBtn" class="hns-btn hns-btn-primary">${icon("door", { size: 16 })} สร้างห้อง</button>
            <div style="display:flex;gap:8px;">
              <input id="code" class="hns-input" maxlength="4" placeholder="รหัสห้อง" style="flex:1;width:0;text-transform:uppercase;letter-spacing:0.15em;text-align:center;" />
              <button id="joinBtn" class="hns-btn hns-btn-secondary" style="white-space:nowrap;">${icon("key", { size: 16 })} เข้าร่วม</button>
            </div>
            <div id="error" class="hns-error"></div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;align-items:center;">
          <div class="hns-label">ตัวละครของคุณ</div>
          <div id="previewBox" style="width:${PREVIEW_SIZE}px;height:${PREVIEW_SIZE}px;border-radius:18px;overflow:hidden;
                      background:#0f1729e6;border:2px solid rgba(34,211,238,0.45);"></div>
          <div class="hns-panel" style="width:220px;font-size:12.5px;line-height:1.65;color:#cbd5e1;">
            <div class="hns-label" style="margin-bottom:8px;">${icon("play", { size: 14 })} วิธีเล่น</div>
            ${icon("keyboard", { size: 14 })} WASD / ลูกศร — เดิน<br/>
            ␣ SPACE — ซ่อน / ตรวจจุดซ่อน<br/>
            1-4 — ส่งอีโมจิ ${EMOTE_ICON_NAMES.map((n) => icon(n, { size: 14 })).join("")}<br/><br/>
            ${icon("hider", { size: 15, color: "#fbbf24" })} <b style="color:#f1f5f9;">คนซ่อน</b>: กด SPACE ที่จุดซ่อน<br/>คนหาจะไม่เห็นตำแหน่งคุณเลย<br/><br/>
            ${icon("seeker", { size: 15, color: "#22d3ee" })} <b style="color:#f1f5f9;">คนหา</b>: เข้าใกล้จุดซ่อนแล้วกด SPACE<br/>มีคนซ่อน = จับได้ทันที
          </div>
        </div>
      </div>
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
      variantLabelEl.textContent = `แบบที่ ${variantIndex + 1}`;
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
        showError("กรุณากรอกรหัสห้อง 4 ตัวอักษร");
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
      if (err.reason === "ROOM_FULL") return "ห้องเต็ม (10 คน)";
      if (err.reason === "GAME_ALREADY_STARTED") return "เกมเริ่มไปแล้ว";
      return "ไม่พบห้อง";
    }
    console.error(err);
    return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง";
  }
}
