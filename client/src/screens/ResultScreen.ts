import type { Room } from "colyseus.js";
import type { Screen, Navigate } from "../core/ScreenManager";
import { createOverlay, removeOverlay } from "../dom/overlay";
import type { GameState } from "../schema/GameState";
import { playRoundWinSfx } from "../audio/sfx";
import { icon, escapeHtml } from "../dom/icons";

export class ResultScreen implements Screen {
  private navigate: Navigate;
  private room?: Room<GameState>;
  private overlay?: HTMLDivElement;
  private stateChangeHandler = () => this.checkPhase();

  constructor(navigate: Navigate) {
    this.navigate = navigate;
  }

  mount(data?: { room: Room<GameState> }) {
    this.room = data?.room;
    if (!this.room) return;

    const hiderWon = [...this.room.state.players.values()].some((p) => p.role === "hider" && p.isEscaped);
    if (this.room.state.phase === "result") playRoundWinSfx();

    const sorted = [...this.room.state.players.values()].sort((a, b) => b.score - a.score);
    const mvp = sorted[0];
    const medalColors = ["#fbbf24", "#cbd5e1", "#d97706"];
    const rows = sorted
      .map((p, i) => {
        const isMvp = p === mvp && p.score > 0;
        const rank = medalColors[i] ? icon("medal", { size: 18, color: medalColors[i] }) : String(i + 1);
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;
                      background:${isMvp ? "rgba(251,191,36,0.12)" : i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent"};
                      border:${isMvp ? "1px solid rgba(251,191,36,0.35)" : "1px solid transparent"};">
            <div style="width:26px;text-align:center;font-size:15px;">${rank}</div>
            <div style="flex:1;font-size:14px;color:#f1f5f9;display:flex;align-items:center;gap:5px;">${
              p.isHost ? icon("crown", { size: 13, color: "#fbbf24" }) : ""
            }${escapeHtml(p.nickname)}${p.isEscaped ? " 🚪 ESCAPED" : ""}${isMvp ? " " + icon("star", { size: 13, color: "#fbbf24" }) : ""}</div>
            <div style="font-weight:800;color:${isMvp ? "#fbbf24" : "#67e8f9"};font-size:15px;">${p.score} pts</div>
          </div>`;
      })
      .join("");

    const actionHtml = `<div style="text-align:center;color:#94a3b8;font-size:13px;margin-top:10px;">${icon("hourglass", { size: 13 })} ROUND ${this.room.state.matchRound}/${this.room.state.roundsPerMatch} · พัก ${this.room.state.timeRemaining}s</div>`;

    this.overlay = createOverlay();
    this.overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px;align-items:center;">
        <div class="hns-title" style="font-size:32px;color:#fff;text-shadow:0 0 16px ${hiderWon ? "#4ade80" : "#22d3ee"};display:flex;align-items:center;justify-content:center;gap:10px;">
          ${
            hiderWon
              ? icon("party", { size: 28, color: "#4ade80" }) + " Clock-Out Crew หนีสำเร็จ!"
              : icon("seeker", { size: 28, color: "#22d3ee" }) + " ทีมหาชนะ!"
          }
        </div>
        <div class="hns-panel" style="display:flex;flex-direction:column;gap:6px;width:360px;">
          <div class="hns-label" style="margin-bottom:2px;">คะแนนสะสม</div>
          ${rows}
          ${actionHtml}
        </div>
      </div>
    `;

    this.room.onStateChange(this.stateChangeHandler);

    // Self-correct immediately — see LobbyScreen for why this can't wait for
    // a future onStateChange event.
    this.checkPhase();
  }

  unmount() {
    this.room?.onStateChange.remove(this.stateChangeHandler);
    if (this.overlay) removeOverlay(this.overlay);
    this.overlay = undefined;
    this.room = undefined;
  }

  private checkPhase() {
    if (!this.room) return;
    if (this.room.state.phase === "role_reveal") {
      this.navigate("Game", { room: this.room });
    } else if (this.room.state.phase === "lobby") {
      this.navigate("Lobby", { room: this.room });
    }
  }
}
