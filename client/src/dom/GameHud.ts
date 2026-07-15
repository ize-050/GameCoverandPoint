import { icon, EMOTE_ICON_NAMES } from "./icons";
import type { MissionDef } from "../../../shared/missions";
import { t } from "../i18n/strings";

const URGENT_TIME_SEC = 30;

function helpHtml(): string {
  return `
  <div style="font-weight:800;margin-bottom:10px;">${t("help.title")}</div>
  <div style="margin-bottom:6px;">${icon("keyboard", { size: 15 })} ${t("help.move")}</div>
  <div style="margin-bottom:6px;">${t("help.camera")}</div>
  <div style="margin-bottom:6px;">${t("help.minimap")}</div>
  <div style="margin-bottom:6px;">${t("help.space")}</div>
  <div style="margin-bottom:6px;">${t("help.mission")}</div>
  <div style="margin-bottom:6px;">${t("help.camSwitch")}</div>
  <div style="margin-bottom:12px;display:flex;align-items:center;gap:6px;">
    ${t("help.emote")}
    ${EMOTE_ICON_NAMES.map((n) => icon(n, { size: 15 })).join("")}
  </div>
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">${icon("hider", { size: 16, color: "#fbbf24" })} <b>${t("help.hiderTitle")}</b></div>
  <div style="margin-bottom:4px;">${t("help.hider1")}</div>
  <div style="margin-bottom:4px;">${t("help.hider2")}</div>
  <div style="margin-bottom:4px;">${t("help.hider3")}</div>
  <div style="margin-bottom:4px;">${t("help.hider4")}</div>
  <div style="margin-bottom:12px;">${t("help.hider5")}</div>
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">${icon("lightbulb", { size: 16, color: "#fbbf24" })} <b>${t("help.lightTitle")}</b></div>
  <div style="margin-bottom:4px;">${t("help.light1")}</div>
  <div style="margin-bottom:12px;">${t("help.light2")}</div>
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">${icon("seeker", { size: 16, color: "#22d3ee" })} <b>${t("help.seekerTitle")}</b></div>
  <div style="margin-bottom:4px;">${t("help.seeker1")}</div>
  <div style="margin-bottom:4px;">${t("help.seeker2")}</div>
  <div style="margin-bottom:4px;">${t("help.seeker3")}</div>
  <div style="margin-bottom:12px;">${t("help.serverWarn")}</div>
  <div>${t("help.decoyNote")}</div>
`;
}

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
  private corporateEventEl: HTMLDivElement;
  private challengeEl: HTMLDivElement;
  private reconnectPauseEl: HTMLDivElement;
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
      <div id="hudCorporateEvent" style="position:absolute;top:72px;left:50%;transform:translateX(-50%);width:min(520px,calc(100vw - 32px));box-sizing:border-box;color:#fff;background:linear-gradient(135deg,#7f1d1dee,#b45309ee);border:2px solid #fbbf24;border-radius:14px;padding:10px 18px;text-align:center;display:none;box-shadow:0 0 28px #f59e0b55;"></div>
      <div id="hudChallenge" style="position:absolute;bottom:128px;left:50%;transform:translateX(-50%);width:min(440px,calc(100vw - 32px));box-sizing:border-box;color:#fff;background:#07111df2;border:2px solid #22d3ee;border-radius:14px;padding:14px 18px;text-align:center;display:none;box-shadow:0 0 26px #22d3ee44;"></div>
      <div id="hudReconnectPause" style="position:absolute;inset:0;background:#020617d9;display:none;align-items:center;justify-content:center;z-index:4;"><div style="max-width:420px;color:#fff;background:#0f172af2;border:2px solid #fbbf24;border-radius:16px;padding:24px;text-align:center;font-weight:800;box-shadow:0 0 32px #f59e0b44;"></div></div>
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
    this.helpPanelEl.innerHTML = helpHtml();
    this.abilitiesEl = this.root.querySelector("#hudAbilities") as HTMLDivElement;
    this.hintEl = this.root.querySelector("#hudHint") as HTMLDivElement;
    this.itemEl = this.root.querySelector("#hudItem") as HTMLDivElement;
    this.missionsEl = this.root.querySelector("#hudMissions") as HTMLDivElement;
    this.corporateEventEl = this.root.querySelector("#hudCorporateEvent") as HTMLDivElement;
    this.challengeEl = this.root.querySelector("#hudChallenge") as HTMLDivElement;
    this.reconnectPauseEl = this.root.querySelector("#hudReconnectPause") as HTMLDivElement;
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
    this.inspectsEl.innerHTML = `${icon("search", { size: 15 })} ${t("hud.inspectsRemaining", { count, max })}`;
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
        ? `${icon("run", { size: 15 })} ${t("hud.relocateHider")}`
        : `${icon("eyes", { size: 15 })} ${t("hud.relocateSeeker")}`;
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
    this.scanCooldownEl.innerHTML = `${icon("clock", { size: 13 })} ${t("hud.scanCooldown", { sec: remainingSec })}`;
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
    const labels: Record<string, string> = { smoke: t("item.smoke"), decoy: t("item.decoy"), stun: t("item.stun"), sprint: t("item.sprint"), coffee: t("item.coffee") };
    this.itemEl.textContent = item ? `${labels[item] ?? item} · ${t("hud.itemUseHint")}` : t("hud.itemSlotEmpty");
    this.itemEl.style.opacity = item ? "1" : "0.55";
    const styles: Record<string, string> = {
      smoke: "linear-gradient(135deg,#334155dd,#94a3b8dd)", decoy: "linear-gradient(135deg,#7c3aeddd,#ec4899dd)",
      stun: "repeating-linear-gradient(135deg,#713f12dd 0 8px,#eab308dd 8px 16px)", sprint: "linear-gradient(135deg,#075985dd,#22d3eedd)",
      coffee: "linear-gradient(135deg,#78350fdd,#f59e0bdd)",
    };
    this.itemEl.style.background = styles[item] ?? "#0f172acc";
  }

  setMissions(missions: MissionDef[], completed: Set<string>, visible: boolean, exitUnlocked = false, totalDone = 0, missionGoal = missions.length) {
    this.missionsEl.style.display = visible ? "block" : "none";
    if (!visible) return;
    this.missionsEl.innerHTML = `<div style="font-size:13px;font-weight:900;letter-spacing:.08em;color:#facc15;margin-bottom:3px;">${t("hud.hiderMissions", { done: totalDone, goal: missionGoal })}</div><div style="color:#94a3b8;margin-bottom:7px;">${t("hud.missionSub")}</div>` +
      missions.map((mission) => `<div style="margin:4px 0;color:${completed.has(mission.id) ? "#86efac" : "#e2e8f0"};text-decoration:${completed.has(mission.id) ? "line-through" : "none"}">${completed.has(mission.id) ? "✓" : "◆"} ${mission.title}</div>`).join("") +
      `<div style="margin-top:9px;padding-top:7px;border-top:1px solid #ffffff22;color:${exitUnlocked ? "#4ade80" : "#fca5a5"};font-weight:800;">${exitUnlocked ? t("hud.exitOpen") : t("hud.exitLocked")}</div>`;
  }

  setCorporateEvent(kind: string, seconds: number) {
    if (!kind || seconds <= 0) {
      this.corporateEventEl.style.display = "none";
      return;
    }
    const copy: Record<string, [string, string]> = {
      mandatory_meeting: [t("event.meetingTitle"), t("event.meetingBody")],
      freeze_review: [t("event.freezeTitle"), t("event.freezeBody")],
      printer_meltdown: [t("event.printerTitle"), t("event.printerBody")],
      fire_drill: [t("event.fireTitle"), t("event.fireBody")],
      lights_out: [t("event.lightsTitle"), t("event.lightsBody")],
    };
    const [title, instruction] = copy[kind] ?? [kind, t("event.fallback")];
    this.corporateEventEl.style.display = "block";
    this.corporateEventEl.innerHTML = `<div style="font-weight:950;letter-spacing:.09em;color:#fef3c7;">${title} · ${seconds}s</div><div style="font-size:12px;margin-top:3px;color:#fff7ed;">${instruction}</div>`;
  }

  setMissionChallenge(title: string, sequence: string[], current: number, seconds: number) {
    if (!sequence.length) {
      this.challengeEl.style.display = "none";
      return;
    }
    this.challengeEl.style.display = "block";
    const keys = sequence.map((key, index) => `<span style="display:inline-flex;width:38px;height:38px;margin:7px 4px;align-items:center;justify-content:center;border-radius:8px;font-size:20px;font-weight:950;background:${index < current ? "#16a34a" : index === current ? "#0891b2" : "#1e293b"};border:1px solid ${index === current ? "#67e8f9" : "#ffffff22"};">${key}</span>`).join("");
    this.challengeEl.innerHTML = `<div style="font-size:12px;color:#facc15;font-weight:900;letter-spacing:.08em;">${t("hud.skillCheck", { sec: seconds })}</div><div style="font-size:13px;margin-top:3px;">${title}</div><div>${keys}</div><div style="font-size:11px;color:#94a3b8;">${t("hud.skillCheckWrong")}</div>`;
  }

  setReconnectPause(active: boolean) {
    this.reconnectPauseEl.style.display = active ? "flex" : "none";
    if (active) (this.reconnectPauseEl.firstElementChild as HTMLDivElement).innerHTML = t("hud.reconnectPause");
  }

  // Seeker's equivalent of the hider mission panel — reuses the same corner
  // slot (the two roles never see it at the same time) since there's just
  // one repeatable objective, not a checklist.
  setSeekerMission(visible: boolean, traceCooldownSec = 0) {
    this.missionsEl.style.display = visible ? "block" : "none";
    if (!visible) return;
    const status = traceCooldownSec > 0 ? t("hud.traceCooldown", { sec: traceCooldownSec }) : t("hud.traceReady");
    this.missionsEl.innerHTML =
      `<div style="font-size:13px;font-weight:900;letter-spacing:.08em;color:#facc15;margin-bottom:3px;">${t("hud.seekerMissionTitle")}</div>` +
      `<div style="color:#94a3b8;margin-bottom:7px;">${t("hud.seekerMissionHidden")}</div>` +
      `<div style="margin:4px 0;color:${traceCooldownSec > 0 ? "#94a3b8" : "#e2e8f0"};">${t("hud.traceLine", { status })}</div>` +
      `<div style="margin:8px 0 4px;color:#e2e8f0;">${t("hud.scanLine")}</div>`;
  }

  setBlackout(active: boolean, timeRemaining: number) {
    this.blackoutEl.style.display = active ? "flex" : "none";
    if (active) {
      (this.blackoutEl.firstElementChild as HTMLDivElement).innerHTML =
        `${icon("blocked", { size: 26 })}<br/>${t("hud.blackout")}<br/><br/>${t("hud.blackoutRemaining", { sec: timeRemaining })}`;
    }
  }

  showRoleBanner(role: string) {
    const child = this.roleBannerEl.firstElementChild as HTMLDivElement;
    if (role === "seeker") child.innerHTML = `${icon("seeker", { size: 32, color: "#22d3ee" })} ${t("hud.roleSeeker")}`;
    else if (role === "hider") child.innerHTML = `${icon("hider", { size: 32, color: "#fbbf24" })} ${t("hud.roleHider")}`;
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
