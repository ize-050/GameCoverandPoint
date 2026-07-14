import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import type { Screen, Navigate } from "../core/ScreenManager";
import { createOverlay, removeOverlay } from "../dom/overlay";
import { NetworkManager, JoinError } from "../network/NetworkManager";
import { Character3D } from "../entities3d/Character3D";
import { DEFAULT_APPEARANCE, CHARACTER_VARIANTS, type CharacterAppearance } from "../../../shared/messages";
import { icon, escapeHtml, EMOTE_ICON_NAMES } from "../dom/icons";
import { playUiClickSfx } from "../audio/sfx";
import { getLang } from "../i18n/lang";
import { authManager, type AuthUser } from "../auth/AuthManager";

const NICKNAME_KEY = "hns_nickname";
const APPEARANCE_KEY = "hns_appearance";
const PREVIEW_SIZE = 200;
type MenuRefreshData = { nickname: string; code: string; visibility: string; scrollTop: number };

const tr = (th: string, en: string) => getLang() === "th" ? th : en;

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

  mount(data?: Partial<MenuRefreshData>) {
    this.overlay = createOverlay();
    this.overlay.className = "hns-landing";
    this.overlay.style.display = "block";
    this.overlay.style.overflowY = "auto";
    this.overlay.style.overflowX = "hidden";
    this.overlay.style.background = "#070b14";
    this.overlay.innerHTML = this.template(data);
    this.wire();
    this.buildPreview();
    if (data?.scrollTop) requestAnimationFrame(() => { if (this.overlay) this.overlay.scrollTop = data.scrollTop!; });
  }

  getRefreshData(): MenuRefreshData {
    return {
      nickname: (this.overlay?.querySelector("#nickname") as HTMLInputElement | null)?.value ?? "",
      code: (this.overlay?.querySelector("#code") as HTMLInputElement | null)?.value ?? "",
      visibility: (this.overlay?.querySelector("#visibility") as HTMLSelectElement | null)?.value ?? "private",
      scrollTop: this.overlay?.scrollTop ?? 0,
    };
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

  private template(data?: Partial<MenuRefreshData>): string {
    const savedNickname = data?.nickname ?? localStorage.getItem(NICKNAME_KEY) ?? "";
    const savedCode = data?.code ?? "";
    const visibility = data?.visibility ?? "private";
    return `
      <nav class="landing-nav">
        <a href="#top" class="landing-brand">${icon("hider", { size: 25, color: "#fbbf24" })}<span>CLOCK OUT<br/><small>PROTOCOL</small></span></a>
        <div class="landing-links"><a href="#story">${tr("เนื้อเรื่อง", "Story")}</a><a href="#how">${tr("วิธีเล่น", "How to Play")}</a><a href="#roles">${tr("บทบาท", "Roles")}</a><a href="#play" class="nav-cta">${tr("เล่นเลย", "Play Now")}</a></div>
      </nav>

      <main id="top">
        <section class="landing-hero">
          <div class="hero-art" aria-hidden="true"></div>
          <div class="hero-content">
            <div class="eyebrow">${tr("เกมปาร์ตี้ออฟฟิศออนไลน์ · 1–10 คน", "ONLINE OFFICE PARTY GAME · 1–10 PLAYERS")}</div>
            <h1>${tr("หนีออกจาก", "ESCAPE THE")}<br/><span>${tr("โอที", "OVERTIME.")}</span></h1>
            <p>${tr("AI ประจำออฟฟิศล็อกประตูทุกบาน ทำภารกิจลับ ใช้อุปกรณ์สุดป่วน ซ่อนตัวจากสายตรวจ และตอกบัตรออกก่อนเวลาหมด", "The office AI has locked the doors. Complete secret missions, deploy ridiculous gadgets, hide from Office Patrol—and clock out before time runs out.")}</p>
            <div class="hero-actions"><a href="#play" class="hero-primary">${tr("เล่นบนเบราว์เซอร์", "PLAY IN BROWSER")}</a><a href="#story" class="hero-secondary">${tr("อ่านเนื้อเรื่อง ↓", "DISCOVER THE STORY ↓")}</a></div>
            <div class="hero-chips"><span>⚡ ${tr("ไม่ต้องติดตั้ง", "No install")}</span><span>👥 ${tr("เหมาะกับทีม", "Team building")}</span><span>🎁 ${tr("อุปกรณ์สุ่ม", "Random gadgets")}</span></div>
          </div>
        </section>

        <section id="story" class="landing-section story-section">
          <div class="section-kicker">${tr("เนื้อเรื่อง", "THE STORY")}</div>
          <div class="story-grid">
            <div><h2>${tr("ประชุมครั้งสุดท้าย", "THE LAST MEETING")}<br/>${tr("คือกับดัก", "WAS A TRAP.")}</h2><p>${tr("เวลา 18:00 น. ขณะที่ทุกคนกำลังจะกลับบ้าน อาคารเข้าสู่", "It is 6:00 PM. Just as everyone prepares to leave, the building enters")} <b>${tr("โหมดล็อกดาวน์โอที", "Overtime Lockdown")}</b>${tr(" ประตูถูกล็อก ไฟเริ่มดับ และ AI นัดประชุมสุดท้ายที่ไม่มีเวลาเลิก", ". Doors seal. Lights fail. The office AI schedules one final meeting—with no end time.")}</p><p>${tr("คุณคือสมาชิก", "You are part of the")} <b>Clock-Out Crew</b>${tr(" พนักงานที่ต้องทำภารกิจลับเพื่อปลดล็อกทางออก Reception แต่บริษัทส่ง", ": employees completing covert Office Missions to unlock the Reception exit and escape. But the company has activated")} <b>Office Patrol</b>${tr(" พร้อมสแกนและเครื่องติดตามออกมาล่าทุกคน", ", relentless seekers equipped with scans and trace terminals.")}</p></div>
            <div class="story-card"><div class="story-time">18:00</div><div class="story-alert">⚠ ${tr("ล็อกดาวน์โอที", "OVERTIME LOCKDOWN")}</div><p>${tr("สี่ภารกิจ เปิดครั้งละสอง มีโอกาสหนีเพียงครั้งเดียว และอย่าไว้ใจตู้เอกสาร", "Four missions, revealed two at a time. One escape window. Never trust a filing cabinet.")}</p></div>
          </div>
        </section>

        <section id="roles" class="landing-section roles-section">
          <div class="section-kicker">${tr("เลือกชะตาของคุณ", "CHOOSE YOUR FATE")}</div><h2 class="center-title">${tr("สองบทบาท หนึ่งกะงานที่ยาวเกินไป", "TWO ROLES. ONE VERY LONG SHIFT.")}</h2>
          <div class="role-grid">
            <article class="role-card hider-card"><div class="role-icon">🫣</div><div class="role-label">CLOCK-OUT CREW</div><h3>${tr("คนซ่อน", "HIDER")}</h3><p>${tr("ทำสี่ภารกิจเสี่ยง ๆ ซึ่งเปิดครั้งละสอง เพื่อปลดล็อกทางออก Reception และกลับบ้าน", "Complete four risky missions—two active at a time—then unlock Reception's exit and clock out.")}</p><ul><li>◆ ${tr("จุดภารกิจและ minimap ส่วนตัว", "Mission markers & private minimap")}</li><li>🎁 ${tr("ควัน ตัวล่อ กับดัก และสปีด", "Smoke, Decoy, Stun and Sprint")}</li><li>👁 ${tr("กด C ดูเพื่อนร่วมทีม", "Press C to check on teammates")}</li></ul></article>
            <article class="role-card seeker-card"><div class="role-icon">👁️</div><div class="role-label">OFFICE PATROL</div><h3>${tr("คนหา", "SEEKER")}</h3><p>${tr("อ่านสถานการณ์ ตรวจจุดซ่อนต้องสงสัย และใช้สแกนจับพนักงานทุกคนก่อนเวลาโอทีหมด", "Read the room, inspect suspicious cover and use tactical scans to catch every employee before the overtime timer expires.")}</p><ul><li>◉ F: ${tr("สแกนคนซ่อนระยะใกล้", "short-range hidden-player scan")}</li><li>⌁ Trace Terminal: ${tr("เปิดตำแหน่งชั่วคราว", "temporary reveal")}</li><li>🔍 ${tr("จำนวนตรวจจำกัด เลือกให้ดี", "Limited inspections—choose wisely")}</li></ul></article>
          </div>
        </section>

        <section id="how" class="landing-section how-section">
          <div class="section-kicker">${tr("วิธีเล่น", "HOW TO PLAY")}</div><h2 class="center-title">${tr("กะแรกของคุณใน 4 ขั้นตอน", "YOUR FIRST SHIFT IN 4 STEPS")}</h2>
          <div class="steps-grid">
            <article><b>01</b><span>${tr("สร้างห้อง", "CREATE A ROOM")}</span><p>${tr("เลือกตัวละคร สร้างห้อง แล้วส่งรหัสสี่ตัวให้เพื่อน", "Choose a character, create a room and share the four-character code.")}</p></article>
            <article><b>02</b><span>${tr("เปิดบทบาท", "REVEAL YOUR ROLE")}</span><p>${tr("แต่ละรอบจะสุ่มว่าใครอยู่ Clock-Out Crew และใครเป็น Office Patrol", "Each round randomly assigns the Clock-Out Crew and Office Patrol.")}</p></article>
            <article><b>03</b><span>${tr("ทำงานใต้ความกดดัน", "WORK UNDER PRESSURE")}</span><p>${tr("กด E ที่จุดภารกิจ แล้วกด WASD ตามโจทย์ กดผิดจะส่งเสียงและเปิดตำแหน่ง", "Press E at mission markers, then match the WASD skill check. Mistakes make noise and reveal you.")}</p></article>
            <article><b>04</b><span>${tr("ตอกบัตรออก", "CLOCK OUT")}</span><p>${tr("ทำครบสี่ภารกิจ ปลดล็อกทางออก Reception แล้วหนี ส่วน Patrol ต้องจับทุกคนให้ได้ก่อน", "Finish all four missions, unlock the Reception exit and escape. Patrol wins by catching the crew first.")}</p></article>
          </div>
          <div class="controls-strip"><span><kbd>WASD</kbd> ${tr("เดิน", "MOVE")}</span><span><kbd>SPACE</kbd> ${tr("ซ่อน / ตรวจ", "HIDE / INSPECT")}</span><span><kbd>E</kbd> ${tr("ภารกิจ", "MISSION")}</span><span><kbd>Q</kbd> ${tr("อุปกรณ์", "GADGET")}</span><span><kbd>F</kbd> ${tr("สแกน", "SCAN")}</span><span><kbd>1–4</kbd> ${tr("อีโมจิ", "EMOTE")} ${EMOTE_ICON_NAMES.map((n) => icon(n, { size: 14 })).join("")}</span></div>
        </section>

        <section id="play" class="landing-section play-section">
          <div class="play-copy"><div class="section-kicker">${tr("พร้อมกลับบ้านหรือยัง?", "READY TO CLOCK OUT?")}</div><h2>${tr("เริ่มแผน", "START YOUR")}<br/>${tr("หลบหนี", "ESCAPE PLAN.")}</h2><p>${tr("เข้า Quick Play เลือกห้องสาธารณะ ชวนเพื่อนด้วยรหัสส่วนตัว หรือฝึกกับ Office Bots", "Quick Play, browse public rooms, invite friends with a private code, or practise with Office Bots.")}</p><div id="previewBox" style="width:${PREVIEW_SIZE}px;height:${PREVIEW_SIZE}px;border-radius:24px;overflow:hidden;background:#0c1528;border:1px solid #22d3ee66;"></div></div>
          <div class="hns-panel play-panel">
            <div id="accountPanel" style="padding:12px;border:1px solid #ffffff1f;border-radius:14px;background:#080d18aa;display:flex;flex-direction:column;align-items:center;gap:9px;">
              <div id="accountIdentity" style="width:100%;display:flex;align-items:center;gap:10px;"></div>
              <div id="googleSignIn"></div>
              <button id="signOutBtn" class="hns-btn hns-btn-ghost" style="display:none;width:100%;">${tr("ออกจากบัญชี", "SIGN OUT")}</button>
              <div id="authHint" style="font-size:11px;color:#94a3b8;text-align:center;"></div>
            </div>
            <div class="hns-label">${tr("ชื่อเล่น", "YOUR NICKNAME")}</div><input id="nickname" class="hns-input" maxlength="12" placeholder="${tr("ชื่อเล่น (ไม่เกิน 12 ตัวอักษร)", "Nickname (max 12 characters)")}" value="${escapeHtml(savedNickname)}" />
            <div class="hns-label">${tr("เลือกพนักงานของคุณ", "CHOOSE YOUR EMPLOYEE")}</div><div class="variant-row"><button id="variantPrev" class="hns-btn hns-btn-ghost">${icon("chevron-left", { size: 14 })}</button><span id="variantLabel">${tr("พนักงาน", "Employee")} 1</span><button id="variantNext" class="hns-btn hns-btn-ghost">${icon("chevron-right", { size: 14 })}</button></div>
            <button id="quickBtn" class="hns-btn hns-btn-primary">⚡ ${tr("เล่นด่วน", "QUICK PLAY")}</button>
            <button id="botPlayBtn" class="hns-btn hns-btn-secondary">🤖 ${tr("เล่นกับบอท 3 ตัว", "PLAY WITH 3 BOTS")}</button>
            <div class="hns-label">${tr("สร้างห้อง", "CREATE ROOM")}</div><select id="visibility" class="hns-input"><option value="private" ${visibility === "private" ? "selected" : ""}>${tr("ส่วนตัว · ใช้รหัสห้อง", "PRIVATE · ROOM CODE")}</option><option value="public" ${visibility === "public" ? "selected" : ""}>${tr("สาธารณะ · รายการห้อง", "PUBLIC · ROOM BROWSER")}</option></select>
            <button id="createBtn" class="hns-btn hns-btn-primary">${icon("door", { size: 16 })} ${visibility === "public" ? tr("สร้างห้องสาธารณะ", "CREATE PUBLIC ROOM") : tr("สร้างห้องส่วนตัว", "CREATE PRIVATE ROOM")}</button>
            <div class="join-divider"><span>${tr("หรือเข้าร่วมทีม", "OR JOIN A TEAM")}</span></div><div class="join-row"><input id="code" class="hns-input" maxlength="4" placeholder="${tr("รหัสห้อง", "ROOM CODE")}" value="${escapeHtml(savedCode)}" /><button id="joinBtn" class="hns-btn hns-btn-secondary">${icon("key", { size: 16 })} ${tr("เข้าร่วม", "JOIN")}</button></div>
            <div class="join-divider"><span>${tr("ห้องสาธารณะ", "PUBLIC ROOMS")}</span></div><button id="refreshRoomsBtn" class="hns-btn hns-btn-ghost">↻ ${tr("รีเฟรชห้อง", "REFRESH ROOMS")}</button><div id="publicRooms" style="display:flex;flex-direction:column;gap:7px;max-height:180px;overflow:auto;"></div>
            <div id="error" class="hns-error"></div>
          </div>
        </section>
      </main>
      <footer>${tr("Clock Out Protocol · เกมมัลติเพลเยอร์บนเบราว์เซอร์ · สร้างเพื่อทีมที่สมควรได้กลับบ้าน", "Clock Out Protocol · Browser Multiplayer Prototype · Built for teams that deserve to go home.")}</footer>
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
    const quickBtn = root.querySelector("#quickBtn") as HTMLButtonElement;
    const botPlayBtn = root.querySelector("#botPlayBtn") as HTMLButtonElement;
    const visibilitySelect = root.querySelector("#visibility") as HTMLSelectElement;
    const publicRoomsEl = root.querySelector("#publicRooms") as HTMLDivElement;
    const refreshRoomsBtn = root.querySelector("#refreshRoomsBtn") as HTMLButtonElement;
    const errorEl = root.querySelector("#error") as HTMLDivElement;
    const variantLabelEl = root.querySelector("#variantLabel") as HTMLSpanElement;
    const variantPrevBtn = root.querySelector("#variantPrev") as HTMLButtonElement;
    const variantNextBtn = root.querySelector("#variantNext") as HTMLButtonElement;
    const accountIdentityEl = root.querySelector("#accountIdentity") as HTMLDivElement;
    const googleSignInEl = root.querySelector("#googleSignIn") as HTMLDivElement;
    const signOutBtn = root.querySelector("#signOutBtn") as HTMLButtonElement;
    const authHintEl = root.querySelector("#authHint") as HTMLDivElement;

    const renderAccount = (user: AuthUser | null = authManager.user) => {
      accountIdentityEl.innerHTML = "";
      const avatar = document.createElement("div");
      avatar.style.cssText = "width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#172033;color:#fbbf24;font-weight:950;overflow:hidden;flex:0 0 auto;";
      if (user?.picture.startsWith("https://")) {
        const image = document.createElement("img");
        image.src = user.picture;
        image.alt = "";
        image.referrerPolicy = "no-referrer";
        image.style.cssText = "width:100%;height:100%;object-fit:cover;";
        avatar.appendChild(image);
      } else avatar.textContent = user ? user.displayName.slice(0, 1).toUpperCase() : "G";
      const copy = document.createElement("div");
      copy.style.cssText = "min-width:0;flex:1;text-align:left;";
      const title = document.createElement("div");
      title.style.cssText = "font-size:13px;font-weight:900;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      title.textContent = user?.displayName ?? tr("เล่นแบบ Guest", "PLAYING AS GUEST");
      const subtitle = document.createElement("div");
      subtitle.style.cssText = "font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      subtitle.textContent = user?.email ?? tr("เข้าเล่นได้ทันที · ความคืบหน้าเก็บในเครื่อง", "Jump in instantly · progress stays on this device");
      copy.append(title, subtitle);
      accountIdentityEl.append(avatar, copy);
      googleSignInEl.style.display = user ? "none" : "block";
      signOutBtn.style.display = user ? "block" : "none";
      authHintEl.textContent = user
        ? tr("✓ ยืนยันบัญชี Google แล้ว", "✓ GOOGLE ACCOUNT VERIFIED")
        : authManager.isGoogleConfigured
          ? tr("Login เป็นทางเลือก — Guest ยังเล่นได้ตามปกติ", "Login is optional — Guest play remains available")
          : tr("Google Login กำลังเปิดใช้งาน · ตอนนี้เล่นแบบ Guest ได้เลย", "Google Login is being activated · Guest play is ready now");
      authHintEl.style.color = user ? "#86efac" : "#94a3b8";
    };

    const mountGoogleButton = () => {
      if (!authManager.isGoogleConfigured || authManager.user) return;
      void authManager.renderGoogleButton(googleSignInEl, (user) => {
        if (!nicknameInput.value.trim()) nicknameInput.value = user.displayName.slice(0, 12);
        renderAccount(user);
      }, () => {
        authHintEl.textContent = tr("Google Login ไม่สำเร็จ กรุณาลองใหม่", "Google sign-in failed. Please try again.");
        authHintEl.style.color = "#fca5a5";
      });
    };

    renderAccount();
    mountGoogleButton();
    void authManager.restore().then((user) => { if (this.overlay === root) { renderAccount(user); mountGoogleButton(); } });
    signOutBtn.addEventListener("click", () => { authManager.signOut(); renderAccount(null); mountGoogleButton(); });

    const persistAppearance = () => localStorage.setItem(APPEARANCE_KEY, JSON.stringify(this.appearance));

    let variantIndex = Math.max(0, CHARACTER_VARIANTS.indexOf(this.appearance.variant));
    const applyVariant = () => {
      this.appearance.variant = CHARACTER_VARIANTS[variantIndex];
      variantLabelEl.textContent = `${tr("พนักงาน", "Employee")} ${variantIndex + 1}`;
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

    const openRoom = (room: Awaited<ReturnType<NetworkManager["createRoom"]>>) => this.navigate("Lobby", { room });

    const refreshRooms = async () => {
      publicRoomsEl.innerHTML = `<div style="color:#94a3b8;font-size:12px;">${tr("กำลังโหลดห้องสาธารณะ...", "Loading public rooms...")}</div>`;
      try {
        const rooms = await this.network.listPublicRooms();
        publicRoomsEl.innerHTML = rooms.length ? rooms.map((room) =>
          `<button class="hns-btn hns-btn-ghost" data-public-room="${room.roomId}" style="display:flex;justify-content:space-between;gap:10px;"><span>${escapeHtml(room.title)}</span><b>${room.playerCount}/${room.maxPlayers}</b></button>`
        ).join("") : `<div style="color:#94a3b8;font-size:12px;">${tr("ยังไม่มีห้องสาธารณะ Quick Play จะสร้างห้องให้", "No public rooms yet. Quick Play will create one.")}</div>`;
      } catch {
        publicRoomsEl.innerHTML = `<div style="color:#fca5a5;font-size:12px;">${tr("โหลดห้องสาธารณะไม่สำเร็จ", "Could not load public rooms.")}</div>`;
      }
    };

    createBtn.addEventListener("click", async () => {
      playUiClickSfx();
      showError("");
      createBtn.disabled = true;
      try {
        const visibility = visibilitySelect.value === "public" ? "public" : "private";
        const room = await this.network.createRoom(getNickname(), this.appearance, visibility);
        openRoom(room);
      } catch (err) {
        showError(this.describeError(err));
        createBtn.disabled = false;
      }
    });

    quickBtn.addEventListener("click", async () => {
      quickBtn.disabled = true;
      showError("");
      try { openRoom(await this.network.quickPlay(getNickname(), this.appearance)); }
      catch (err) { showError(this.describeError(err)); quickBtn.disabled = false; }
    });

    botPlayBtn.addEventListener("click", async () => {
      botPlayBtn.disabled = true;
      showError("");
      try { openRoom(await this.network.createRoom(getNickname(), this.appearance, "private", 3)); }
      catch (err) { showError(this.describeError(err)); botPlayBtn.disabled = false; }
    });

    visibilitySelect.addEventListener("change", () => {
      createBtn.textContent = visibilitySelect.value === "public" ? tr("สร้างห้องสาธารณะ", "CREATE PUBLIC ROOM") : tr("สร้างห้องส่วนตัว", "CREATE PRIVATE ROOM");
    });
    refreshRoomsBtn.addEventListener("click", () => void refreshRooms());
    publicRoomsEl.addEventListener("click", async (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-public-room]");
      if (!button?.dataset.publicRoom) return;
      button.disabled = true;
      try { openRoom(await this.network.joinPublicRoom(button.dataset.publicRoom, getNickname(), this.appearance)); }
      catch (err) { showError(this.describeError(err)); button.disabled = false; }
    });
    void refreshRooms();

    joinBtn.addEventListener("click", async () => {
      playUiClickSfx();
      showError("");
      const code = codeInput.value.trim();
      if (code.length !== 4) {
        showError(tr("กรอกรหัสห้อง 4 ตัวอักษร", "Enter a 4-character room code"));
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
      if (err.reason === "ROOM_FULL") return tr("ห้องนี้เต็มแล้ว (10 คน)", "This room is full (10 players)");
      if (err.reason === "GAME_ALREADY_STARTED") return tr("รอบนี้เริ่มไปแล้ว", "This round has already started");
      return tr("ไม่พบห้องนี้", "Room not found");
    }
    console.error(err);
    return tr("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองอีกครั้ง", "Could not connect to the server. Try again.");
  }
}
