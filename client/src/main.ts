import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import { ScreenManager, type Navigate } from "./core/ScreenManager";
import { keyboard } from "./core/Keyboard";
import { GameScreen } from "./screens/GameScreen";
import { MenuScreen } from "./screens/MenuScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { NetworkManager } from "./network/NetworkManager";
import { loadReconnectToken, clearReconnectToken } from "./network/reconnect";
import { musicPlayer } from "./audio/music";
import { setSfxMuted } from "./audio/sfx";
import { icon } from "./dom/icons";
import { preloadCharacterModels } from "./loaders/characterModels";
import { preloadFurnitureModels } from "./loaders/furnitureModels";
import { getLang, setLang } from "./i18n/lang";
import { t } from "./i18n/strings";

// Kicked off once here, as early as possible (menu screen has plenty of time
// while the player types a nickname) — every later consumer (menu preview,
// GameScreen furniture/characters) just awaits this same shared promise
// instead of each re-triggering its own fetch.
preloadCharacterModels();
preloadFurnitureModels();

const app = document.getElementById("app")!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
// Real-time shadow mapping — the single biggest "does this look real"
// upgrade available without new art assets (everything before this was
// flat-lit with only fake painted-on shadow decals under characters/plants).
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const screens = new ScreenManager();
let syncGlobalControls = () => {};
const navigate: Navigate = (name, data) => {
  screens.show(name, data);
  syncGlobalControls();
};

screens.register("Menu", new MenuScreen(navigate));
screens.register("Lobby", new LobbyScreen(navigate));
screens.register("Game", new GameScreen(renderer, navigate));
screens.register("Result", new ResultScreen(navigate));

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  screens.resize(window.innerWidth, window.innerHeight);
});

// Background music needs a real user gesture to unlock audio in the
// browser — starts on the very first click/keypress anywhere, then never
// again (Web Audio autoplay policy), independent of which screen is active.
function unlockMusic() {
  musicPlayer.start();
  window.removeEventListener("pointerdown", unlockMusic);
  window.removeEventListener("keydown", unlockMusic);
}
window.addEventListener("pointerdown", unlockMusic);
window.addEventListener("keydown", unlockMusic);

const AUDIO_MUTED_KEY = "clockout_audio_muted";
const initialMuted = localStorage.getItem(AUDIO_MUTED_KEY) === "1";
musicPlayer.setMuted(initialMuted);
setSfxMuted(initialMuted);
const muteBtn = document.createElement("button");
const renderMuteButton = (muted: boolean) => {
  muteBtn.innerHTML = `${icon(muted ? "speaker-off" : "speaker-on", { size: 18 })}<span>${t(muted ? "audio.off" : "audio.on")}</span>`;
};
renderMuteButton(initialMuted);
muteBtn.style.cssText =
  "position:fixed;bottom:24px;left:24px;z-index:999;font-size:12px;font-weight:800;background:#0a0f1cdd;color:#fff;border:1px solid #ffffff22;border-radius:10px;padding:9px 12px;cursor:pointer;display:flex;align-items:center;gap:7px;";
muteBtn.addEventListener("click", () => {
  const muted = !musicPlayer.isMuted();
  musicPlayer.setMuted(muted);
  setSfxMuted(muted);
  localStorage.setItem(AUDIO_MUTED_KEY, muted ? "1" : "0");
  renderMuteButton(muted);
});
document.body.appendChild(muteBtn);

// Language toggle rebuilds only the currently mounted UI. The Colyseus Room
// object and WebSocket stay alive, so changing language can never consume a
// reconnection token, destroy a lobby, or end a round for a Seeker.
// Keep the compact TH/EN pill tucked against the edge so it remains readable
// without covering the in-game help button or minimap.
const langBtn = document.createElement("button");
langBtn.style.cssText =
  "position:fixed;top:18px;right:calc(20px + env(safe-area-inset-right, 0px));z-index:999;min-width:38px;height:26px;font-size:11px;font-weight:900;line-height:1;background:#0a0f1ccc;color:#fff;border:1px solid #ffffff2a;border-radius:13px;padding:0 7px;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0.72;transition:opacity .15s,right .15s;box-sizing:border-box;";
syncGlobalControls = () => {
  // In-game the help button occupies the top-right corner. Keep language to
  // its left; on menus use a scrollbar/safe-area inset so the pill is never
  // clipped by the viewport edge.
  langBtn.style.right = screens.activeName === "Game"
    ? "calc(78px + env(safe-area-inset-right, 0px))"
    : "calc(20px + env(safe-area-inset-right, 0px))";
};
const renderLanguageButton = () => {
  langBtn.textContent = getLang().toUpperCase();
  langBtn.title = t("lang.toggle");
  langBtn.setAttribute("aria-label", t("lang.toggle"));
};
renderLanguageButton();
langBtn.addEventListener("mouseenter", () => (langBtn.style.opacity = "1"));
langBtn.addEventListener("mouseleave", () => (langBtn.style.opacity = "0.55"));
langBtn.addEventListener("click", () => {
  setLang(getLang() === "th" ? "en" : "th");
  renderLanguageButton();
  renderMuteButton(musicPlayer.isMuted());
  screens.refresh();
});
document.body.appendChild(langBtn);

function tick(dt: number, now: number) {
  TWEEN.update(now);
  screens.update(dt);
  keyboard.clearFrame();
}

let lastTime = performance.now();
function loop(now: number) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  tick(dt, now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function screenForPhase(phase: string): string {
  if (phase === "lobby") return "Lobby";
  if (phase === "result") return "Result";
  return "Game"; // role_reveal | hide | seek
}

async function boot() {
  const token = loadReconnectToken();
  if (token) {
    try {
      const room = await new NetworkManager().reconnect(token);
      navigate(screenForPhase(room.state.phase), { room });
      return;
    } catch {
      clearReconnectToken();
    }
  }
  navigate("Menu");
}
boot();

if (import.meta.env.DEV) {
  // Manual tick escape hatch for headless/backgrounded-tab testing, where
  // rAF gets throttled — not used by the real game loop.
  (window as unknown as { __hns: unknown }).__hns = {
    screens,
    renderer,
    tick: (dtMs: number) => tick(dtMs / 1000, performance.now()),
  };
}
