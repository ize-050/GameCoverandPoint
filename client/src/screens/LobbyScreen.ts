import type { Room } from "colyseus.js";
import type { Screen, Navigate } from "../core/ScreenManager";
import { createOverlay, removeOverlay } from "../dom/overlay";
import type { GameState } from "../schema/GameState";
import { GAME_CONFIG } from "../../../shared/gameConstants";
import { icon, escapeHtml } from "../dom/icons";

export class LobbyScreen implements Screen {
  private navigate: Navigate;
  private room?: Room<GameState>;
  private overlay?: HTMLDivElement;
  private listEl?: HTMLDivElement;
  private hostControlsEl?: HTMLDivElement;
  private waitingEl?: HTMLDivElement;
  private seekerSelect?: HTMLSelectElement;
  private startBtn?: HTMLButtonElement;
  private startHintEl?: HTMLDivElement;
  private unsubs: Array<() => void> = [];
  private stateChangeHandler = () => this.checkPhase();

  constructor(navigate: Navigate) {
    this.navigate = navigate;
  }

  mount(data?: { room: Room<GameState> }) {
    this.room = data?.room;
    if (!this.room) return;

    this.overlay = createOverlay();
    this.overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;align-items:center;">
        <div style="color:var(--text-dim);font-size:13px;font-weight:700;">รหัสห้อง</div>
        <span class="hns-code-pill" style="font-size:26px;">${this.room.state.roomCode}</span>

        <div class="hns-panel" style="display:flex;flex-direction:column;gap:16px;width:360px;color:#fff;text-align:center;margin-top:6px;">
          <div class="hns-label" style="text-align:left;">ผู้เล่นในห้อง</div>
          <div id="playerList" style="white-space:pre-line;font-size:14px;color:#dde3ea;min-height:110px;text-align:left;line-height:1.6;"></div>

          <div id="hostControls" style="display:none;flex-direction:column;gap:10px;text-align:left;">
            <div class="hns-label">จำนวนคนหา (Seeker)</div>
            <select id="seekerCount" class="hns-input"></select>
            <button id="startBtn" class="hns-btn hns-btn-primary">${icon("play", { size: 15 })} เริ่มเกม</button>
            <div id="startHint" style="color:#fbbf24;font-size:12px;text-align:center;min-height:16px;"></div>
          </div>
          <div id="waiting" style="text-align:center;color:#94a3b8;font-size:14px;display:flex;align-items:center;justify-content:center;gap:6px;">${icon(
            "hourglass",
            { size: 14 }
          )} รอ host เริ่มเกม...</div>
        </div>
      </div>
    `;

    this.listEl = this.overlay.querySelector("#playerList") as HTMLDivElement;
    this.hostControlsEl = this.overlay.querySelector("#hostControls") as HTMLDivElement;
    this.waitingEl = this.overlay.querySelector("#waiting") as HTMLDivElement;
    this.seekerSelect = this.overlay.querySelector("#seekerCount") as HTMLSelectElement;
    this.startBtn = this.overlay.querySelector("#startBtn") as HTMLButtonElement;
    this.startHintEl = this.overlay.querySelector("#startHint") as HTMLDivElement;

    this.startBtn.addEventListener("click", () => {
      this.room!.send("startGame", { seekerCount: Number(this.seekerSelect!.value) });
    });

    const offAdd = this.room.state.players.onAdd((player) => {
      const offChange = player.onChange(() => this.renderPlayers());
      this.unsubs.push(offChange);
      this.renderPlayers();
    });
    this.unsubs.push(offAdd);

    const offRemove = this.room.state.players.onRemove(() => this.renderPlayers());
    this.unsubs.push(offRemove);

    this.room.onStateChange(this.stateChangeHandler);
    this.unsubs.push(() => this.room?.onStateChange.remove(this.stateChangeHandler));

    // Self-correct immediately — e.g. after a reconnect that lands here while
    // the round is already mid-game, nothing will ever fire onStateChange for
    // a phase that doesn't subsequently change.
    this.checkPhase();
  }

  unmount() {
    this.unsubs.forEach((unsub) => unsub());
    this.unsubs = [];
    if (this.overlay) removeOverlay(this.overlay);
    this.overlay = undefined;
    this.room = undefined;
  }

  private checkPhase() {
    if (this.room && this.room.state.phase !== "lobby") {
      this.navigate("Game", { room: this.room });
    }
  }

  private renderPlayers() {
    if (!this.listEl || !this.room) return;
    const players = [...this.room.state.players.values()];
    const me = this.room.state.players.get(this.room.sessionId);

    this.listEl.innerHTML =
      `${players.length}/${GAME_CONFIG.MAX_PLAYERS} คนเข้าร่วมแล้ว<br/><br/>` +
      players
        .map((p) => `${p.isHost ? icon("crown", { size: 13, color: "#fbbf24" }) + " " : "&bull;&nbsp; "}${escapeHtml(p.nickname)}`)
        .join("<br/>");

    const isHost = !!me?.isHost;
    this.hostControlsEl!.style.display = isHost ? "flex" : "none";
    this.waitingEl!.style.display = isHost ? "none" : "block";
    if (!isHost) return;

    const max = players.length <= 5 ? 1 : 2;
    const wanted = Array.from({ length: max }, (_, i) => String(i + 1));
    const current = Array.from(this.seekerSelect!.options).map((o) => o.value);
    if (current.join(",") !== wanted.join(",")) {
      this.seekerSelect!.innerHTML = wanted.map((v) => `<option value="${v}">${v} คน</option>`).join("");
    }

    const canStart = players.length >= GAME_CONFIG.MIN_PLAYERS;
    this.startBtn!.disabled = !canStart;
    this.startHintEl!.textContent = canStart ? "" : `ต้องมีผู้เล่นอย่างน้อย ${GAME_CONFIG.MIN_PLAYERS} คน (ตอนนี้ ${players.length} คน)`;
  }
}
