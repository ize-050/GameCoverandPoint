import { icon, EMOTE_ICON_NAMES } from "./icons";
import type { MissionDef } from "../../../shared/missions";

const URGENT_TIME_SEC = 30;

const HELP_HTML = `
  <div style="font-weight:800;margin-bottom:10px;">วิธีเล่น</div>
  <div style="margin-bottom:6px;">${icon("keyboard", { size: 15 })} WASD / ลูกศร — เดิน</div>
  <div style="margin-bottom:6px;">กล้อง isometric ล็อกมุมและซูมเท่ากันสำหรับผู้เล่นทุกคน</div>
  <div style="margin-bottom:6px;">M — ขยาย/ย่อ minimap</div>
  <div style="margin-bottom:6px;">␣ SPACE — ซ่อนตัว (คนซ่อน) / จับ-ตรวจ (คนหา)</div>
  <div style="margin-bottom:6px;">กด E ค้าง 3 วินาที — ทำ Office Mission (ปล่อยหรือเดินออกเพื่อยกเลิก)</div>
  <div style="margin-bottom:6px;">C — Hider: สลับกล้องไปดูเพื่อน 4 วินาที</div>
  <div style="margin-bottom:12px;display:flex;align-items:center;gap:6px;">
    1 2 3 4 — ส่งอีโมจิ
    ${EMOTE_ICON_NAMES.map((n) => icon(n, { size: 15 })).join("")}
  </div>
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">${icon("hider", { size: 16, color: "#fbbf24" })} <b>คนซ่อน</b></div>
  <div style="margin-bottom:4px;">กด SPACE เพื่อซ่อนจนกว่าจะกดออกเอง จากนั้นจุดเดิม cooldown 12 วินาทีเฉพาะคุณ</div>
  <div style="margin-bottom:4px;">คนหาจะไม่เห็นตำแหน่งคุณเลยตอนซ่อนอยู่ แต่ถ้าเดินโล่งๆ คนหาจับได้ทันที</div>
  <div style="margin-bottom:4px;">เดินผ่านกล่องของขวัญเพื่อสุ่มไอเท็ม และกด Q เพื่อใช้ (ถือได้ครั้งละ 1 ชิ้น)</div>
  <div style="margin-bottom:4px;">ทำ Mission ครบ 3 จุดเพื่อปลดล็อก EXIT ที่ Reception แล้วไปกด SPACE เพื่อหนี</div>
  <div style="margin-bottom:12px;">เข้าใกล้ของในห้องแล้วกด SPACE: กระดาน (หลอกคนหา) / เครื่องชงกาแฟ (วิ่งเร็วขึ้น) / จอมอนิเตอร์ (ดูตำแหน่งห้องของคนหา)</div>
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">${icon("lightbulb", { size: 16, color: "#fbbf24" })} <b>สวิตช์ไฟ (ทุกคน)</b></div>
  <div style="margin-bottom:4px;">เข้าใกล้สวิตช์ข้างประตูแล้วกด SPACE เพื่อเปิด/ปิดไฟห้องนั้น</div>
  <div style="margin-bottom:12px;">ห้องมืดพร้อมกันได้สูงสุด 3 ห้อง — คนในห้องมืดเห็นแค่รัศมีรอบตัว</div>
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">${icon("seeker", { size: 16, color: "#22d3ee" })} <b>คนหา</b></div>
  <div style="margin-bottom:4px;">เข้าใกล้คนซ่อนที่ไม่ได้ซ่อนแล้วกด SPACE จับได้ทันที ไม่จำกัดจำนวนครั้ง</div>
  <div style="margin-bottom:4px;">หรือเข้าใกล้จุดซ่อนแล้วกด SPACE เพื่อตรวจ — มีคนซ่อนอยู่ = จับได้ทันที</div>
  <div style="margin-bottom:4px;">ตรวจจุดซ่อนได้จำกัดจำนวนครั้งต่อรอบ ใช้ให้คุ้ม!</div>
  <div style="margin-bottom:12px;">ระวัง — เข้าห้อง Server จะมีเสียงเตือนไปหาคนซ่อนทุกคน</div>
  <div>จุดซ่อนบางจุดเป็นของหลอก ดูเหมือนจริงแต่ซ่อนไม่ได้</div>
`;

// Screen-space HUD as a plain DOM overlay (per the plan) — everything here is
// 2D chrome on top of the persistent 3D canvas; world-space effects (catch
// ring, emote float, hide gimmick) live in GameScreen/entities3d instead.
export class GameHud {
  private root: HTMLDivElement;
  private infoEl: HTMLDivElement;
  private timerEl: HTMLDivElement;
  private inspectsEl: HTMLDivElement;
  private relocateEl: HTMLDivElement;
  private scanCooldownEl: HTMLDivElement;
  private roleBannerEl: HTMLDivElement;
  private blackoutEl: HTMLDivElement;
  private dazedEl: HTMLDivElement;
  private feedbackEl: HTMLDivElement;
  private helpPanelEl: HTMLDivElement;
  private abilitiesEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private itemEl: HTMLDivElement;
  private missionsEl: HTMLDivElement;
  private roleBannerTimeout?: ReturnType<typeof setTimeout>;
  private feedbackTimeout?: ReturnType<typeof setTimeout>;
  private helpVisible = false;

  constructor(callbacks: { onEmote: (id: number) => void; onDecoy: () => void; onUseItem: () => void }) {
    const { onEmote, onDecoy, onUseItem } = callbacks;
    this.root = document.createElement("div");
    this.root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:5;font-family:'Segoe UI',system-ui,sans-serif;";
    this.root.innerHTML = `
      <div id="hudInfo" style="position:absolute;top:10px;left:10px;color:#fff;font-size:13px;background:#00000088;padding:6px 8px;border-radius:6px;white-space:pre-line;"></div>
      <div id="hudTimer" style="position:absolute;top:20px;left:50%;transform:translateX(-50%);font-size:26px;font-weight:800;color:#fff;display:none;align-items:center;gap:6px;"></div>
      <div id="hudInspects" style="position:absolute;top:58px;left:50%;transform:translateX(-50%);font-size:14px;font-weight:700;color:#fbbf24;background:#00000088;padding:4px 10px;border-radius:8px;display:none;align-items:center;gap:6px;"></div>
      <div id="hudRelocate" style="position:absolute;top:92px;left:50%;transform:translateX(-50%);font-size:14px;font-weight:700;color:#4ade80;background:#00000088;padding:4px 12px;border-radius:8px;display:none;white-space:nowrap;align-items:center;gap:6px;"></div>
      <div id="hudScanCooldown" style="position:absolute;top:126px;left:50%;transform:translateX(-50%);font-size:13px;font-weight:700;color:#22d3ee;background:#00000088;padding:4px 10px;border-radius:8px;display:none;white-space:nowrap;align-items:center;gap:6px;"></div>
      <div id="hudFeedback" style="position:absolute;top:20%;left:50%;transform:translateX(-50%);font-size:18px;color:#ffe066;background:#000000aa;padding:10px 16px;border-radius:10px;text-align:center;display:none;align-items:center;gap:8px;justify-content:center;"></div>
      <div id="hudRoleBanner" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;">
        <div style="background:#000000d9;padding:30px 50px;border-radius:16px;font-size:30px;color:#fff;text-align:center;display:flex;align-items:center;gap:14px;"></div>
      </div>
      <div id="hudBlackout" style="position:absolute;inset:0;background:#000000f7;display:none;align-items:center;justify-content:center;">
        <div style="color:#fff;font-size:20px;text-align:center;white-space:pre-line;"></div>
      </div>
      <div id="hudDazed" style="position:absolute;inset:0;background:radial-gradient(circle, transparent 15%, #d6dbe255 55%, #9aa3ad9c 100%);backdrop-filter:blur(3px);opacity:0;transition:opacity 0.6s ease;"></div>
      <button id="hudHelpBtn" style="position:absolute;top:20px;right:24px;pointer-events:auto;font-size:18px;font-weight:800;background:#0a0f1cbb;color:#fff;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;">?</button>
      <div id="hudHelpPanel" style="position:absolute;top:70px;right:24px;width:280px;background:#0a0f1cf0;border:2px solid #22d3ee80;border-radius:12px;padding:16px;color:#f1f5f9;font-size:13px;line-height:1.6;display:none;"></div>
      <div id="hudHint" style="position:absolute;bottom:118px;left:50%;transform:translateX(-50%);font-size:14px;font-weight:700;color:#fff;background:#000000aa;padding:6px 14px;border-radius:8px;display:none;white-space:nowrap;align-items:center;gap:6px;"></div>
      <div id="hudAbilities" style="position:absolute;bottom:70px;left:50%;transform:translateX(-50%);display:none;gap:14px;pointer-events:auto;"></div>
      <div id="hudItem" style="position:absolute;bottom:24px;left:24px;min-width:150px;color:#fff;background:#0f172acc;border:1px solid #ffffff33;border-radius:12px;padding:10px 14px;display:none;pointer-events:auto;font-weight:700;"></div>
      <div id="hudMissions" style="position:absolute;top:92px;left:10px;width:255px;color:#fff;background:#07111dcc;border:1px solid #38bdf855;border-radius:12px;padding:11px 13px;display:none;font-size:12px;line-height:1.45;"></div>
      <div id="hudEmotes" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:10px;pointer-events:auto;"></div>
    `;
    document.body.appendChild(this.root);

    this.infoEl = this.root.querySelector("#hudInfo") as HTMLDivElement;
    this.timerEl = this.root.querySelector("#hudTimer") as HTMLDivElement;
    this.inspectsEl = this.root.querySelector("#hudInspects") as HTMLDivElement;
    this.relocateEl = this.root.querySelector("#hudRelocate") as HTMLDivElement;
    this.scanCooldownEl = this.root.querySelector("#hudScanCooldown") as HTMLDivElement;
    this.feedbackEl = this.root.querySelector("#hudFeedback") as HTMLDivElement;
    this.roleBannerEl = this.root.querySelector("#hudRoleBanner") as HTMLDivElement;
    this.blackoutEl = this.root.querySelector("#hudBlackout") as HTMLDivElement;
    this.dazedEl = this.root.querySelector("#hudDazed") as HTMLDivElement;
    this.helpPanelEl = this.root.querySelector("#hudHelpPanel") as HTMLDivElement;
    this.helpPanelEl.innerHTML = HELP_HTML;
    this.abilitiesEl = this.root.querySelector("#hudAbilities") as HTMLDivElement;
    this.hintEl = this.root.querySelector("#hudHint") as HTMLDivElement;
    this.itemEl = this.root.querySelector("#hudItem") as HTMLDivElement;
    this.missionsEl = this.root.querySelector("#hudMissions") as HTMLDivElement;
    this.itemEl.addEventListener("click", onUseItem);

    (this.root.querySelector("#hudHelpBtn") as HTMLButtonElement).addEventListener("click", () => {
      this.helpVisible = !this.helpVisible;
      this.helpPanelEl.style.display = this.helpVisible ? "block" : "none";
    });

    const emotesEl = this.root.querySelector("#hudEmotes") as HTMLDivElement;
    EMOTE_ICON_NAMES.forEach((name, idx) => {
      const btn = document.createElement("button");
      btn.innerHTML = icon(name, { size: 26, color: "#f1f5f9" });
      btn.style.cssText = "background:none;border:none;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));padding:4px;";
      btn.addEventListener("click", () => onEmote(idx + 1));
      emotesEl.appendChild(btn);
    });

    void onDecoy;
  }

  destroy() {
    clearTimeout(this.roleBannerTimeout);
    clearTimeout(this.feedbackTimeout);
    this.root.remove();
  }

  setInfo(html: string) {
    this.infoEl.innerHTML = html;
  }

  setTimer(phase: string, timeRemaining: number, nowMs: number) {
    if (phase !== "hide" && phase !== "seek") {
      this.timerEl.style.display = "none";
      return;
    }
    const urgent = timeRemaining < URGENT_TIME_SEC;
    this.timerEl.style.display = "flex";
    this.timerEl.innerHTML = `${icon("clock", { size: 22 })} ${timeRemaining}s`;
    this.timerEl.style.color = urgent ? "#ff5252" : "#ffffff";
    const shakeX = urgent ? Math.sin(nowMs / 60) * 3 : 0;
    this.timerEl.style.transform = `translateX(calc(-50% + ${shakeX}px))`;
  }

  setInspectsRemaining(count: number, max: number, visible: boolean) {
    if (!visible) {
      this.inspectsEl.style.display = "none";
      return;
    }
    this.inspectsEl.style.display = "flex";
    this.inspectsEl.innerHTML = `${icon("search", { size: 15 })} ตรวจเหลือ ${count}/${max}`;
    this.inspectsEl.style.color = count <= 2 ? "#ff5252" : "#fbbf24";
  }

  setRelocateActive(active: boolean, role: string) {
    if (!active) {
      this.relocateEl.style.display = "none";
      return;
    }
    this.relocateEl.style.display = "flex";
    this.relocateEl.innerHTML =
      role === "hider"
        ? `${icon("run", { size: 15 })} ภารกิจ: ย้ายที่ซ่อนตอนนี้! (+15 แต้ม)`
        : `${icon("eyes", { size: 15 })} คนซ่อนกำลังโยกย้าย...`;
  }

  // Seeker's scan (F) cooldown — hidden while ready (the hint pill already
  // says "press F"), shown as a countdown once used so it's obvious why F
  // is doing nothing.
  setScanCooldown(remainingSec: number) {
    if (remainingSec <= 0) {
      this.scanCooldownEl.style.display = "none";
      return;
    }
    this.scanCooldownEl.style.display = "flex";
    this.scanCooldownEl.innerHTML = `${icon("clock", { size: 13 })} สแกนพร้อมใช้อีก ${remainingSec} วิ`;
  }

  // Contextual "what does SPACE do right now" prompt — without this, nothing
  // on screen told a hidden player how to get back out.
  setHint(html: string | null) {
    if (!html) {
      this.hintEl.style.display = "none";
      return;
    }
    this.hintEl.style.display = "flex";
    this.hintEl.innerHTML = html;
  }

  setAbilitiesVisible(visible: boolean) {
    this.abilitiesEl.style.display = visible ? "flex" : "none";
  }

  setDazed(active: boolean) {
    this.dazedEl.style.opacity = active ? "1" : "0";
  }

  setHeldItem(item: string, visible: boolean) {
    this.itemEl.style.display = visible ? "block" : "none";
    if (!visible) return;
    const labels: Record<string, string> = { smoke: "💨 Smoke Bomb", decoy: "🤡 Decoy", stun: "😵 Stun Trap", sprint: "⚡ Sprint" };
    this.itemEl.textContent = item ? `${labels[item] ?? item} · กด Q ใช้` : "ช่องไอเท็มว่าง";
    this.itemEl.style.opacity = item ? "1" : "0.55";
    const styles: Record<string, string> = {
      smoke: "linear-gradient(135deg,#334155dd,#94a3b8dd)", decoy: "linear-gradient(135deg,#7c3aeddd,#ec4899dd)",
      stun: "repeating-linear-gradient(135deg,#713f12dd 0 8px,#eab308dd 8px 16px)", sprint: "linear-gradient(135deg,#075985dd,#22d3eedd)",
    };
    this.itemEl.style.background = styles[item] ?? "#0f172acc";
  }

  setMissions(missions: MissionDef[], completed: Set<string>, visible: boolean, exitUnlocked = false) {
    this.missionsEl.style.display = visible ? "block" : "none";
    if (!visible) return;
    const done = missions.filter((mission) => completed.has(mission.id)).length;
    this.missionsEl.innerHTML = `<div style="font-size:13px;font-weight:900;letter-spacing:.08em;color:#facc15;margin-bottom:3px;">HIDER MISSIONS ${done}/${missions.length}</div><div style="color:#94a3b8;margin-bottom:7px;">Go to ◆ and hold E for 3s.</div>` +
      missions.map((mission) => `<div style="margin:4px 0;color:${completed.has(mission.id) ? "#86efac" : "#e2e8f0"};text-decoration:${completed.has(mission.id) ? "line-through" : "none"}">${completed.has(mission.id) ? "✓" : "◆"} ${mission.title}</div>`).join("") +
      `<div style="margin-top:9px;padding-top:7px;border-top:1px solid #ffffff22;color:${exitUnlocked ? "#4ade80" : "#fca5a5"};font-weight:800;">${exitUnlocked ? "🚪 EXIT OPEN — ESCAPE AT RECEPTION" : "🔒 EXIT LOCKED"}</div>`;
  }

  // Seeker's equivalent of the hider mission panel — reuses the same corner
  // slot (the two roles never see it at the same time) since there's just
  // one repeatable objective, not a checklist.
  setSeekerMission(visible: boolean, traceCooldownSec = 0) {
    this.missionsEl.style.display = visible ? "block" : "none";
    if (!visible) return;
    this.missionsEl.innerHTML =
      `<div style="font-size:13px;font-weight:900;letter-spacing:.08em;color:#facc15;margin-bottom:3px;">SEEKER MISSION</div>` +
      `<div style="color:#94a3b8;margin-bottom:7px;">Hiders cannot see this.</div>` +
      `<div style="margin:4px 0;color:${traceCooldownSec > 0 ? "#94a3b8" : "#e2e8f0"};">◆ Trace Terminal (Reception): ${traceCooldownSec > 0 ? `READY IN ${traceCooldownSec}s` : "READY — press SPACE to reveal hiders for 10s"}</div>` +
      `<div style="margin:8px 0 4px;color:#e2e8f0;">F — Scan nearby hidden hiders (15s cooldown)</div>`;
  }

  setBlackout(active: boolean, timeRemaining: number) {
    this.blackoutEl.style.display = active ? "flex" : "none";
    if (active) {
      (this.blackoutEl.firstElementChild as HTMLDivElement).innerHTML =
        `${icon("blocked", { size: 26 })}<br/>Hider กำลังหาที่ซ่อน...<br/><br/>อีก ${timeRemaining} วิ`;
    }
  }

  showRoleBanner(role: string) {
    const child = this.roleBannerEl.firstElementChild as HTMLDivElement;
    if (role === "seeker") child.innerHTML = `${icon("seeker", { size: 32, color: "#22d3ee" })} คุณคือคนหา!`;
    else if (role === "hider") child.innerHTML = `${icon("hider", { size: 32, color: "#fbbf24" })} คุณคือคนซ่อน!`;
    else child.textContent = role;
    this.roleBannerEl.style.display = "flex";
    clearTimeout(this.roleBannerTimeout);
    this.roleBannerTimeout = setTimeout(() => (this.roleBannerEl.style.display = "none"), 2000);
  }

  showFeedback(html: string, ms = 1500) {
    this.feedbackEl.innerHTML = html;
    this.feedbackEl.style.display = "flex";
    clearTimeout(this.feedbackTimeout);
    this.feedbackTimeout = setTimeout(() => (this.feedbackEl.style.display = "none"), ms);
  }
}
