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
import { icon } from "./dom/icons";
import { preloadCharacterModels } from "./loaders/characterModels";
import { preloadFurnitureModels } from "./loaders/furnitureModels";

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
app.appendChild(renderer.domElement);

const screens = new ScreenManager();
const navigate: Navigate = (name, data) => screens.show(name, data);

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

const muteBtn = document.createElement("button");
muteBtn.innerHTML = icon("speaker-on", { size: 18 });
muteBtn.style.cssText =
  "position:fixed;bottom:24px;left:24px;z-index:8;font-size:20px;background:#0a0f1cbb;color:#fff;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;";
muteBtn.addEventListener("click", () => {
  const muted = !musicPlayer.isMuted();
  musicPlayer.setMuted(muted);
  muteBtn.innerHTML = icon(muted ? "speaker-off" : "speaker-on", { size: 18 });
});
document.body.appendChild(muteBtn);

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
      screens.show(screenForPhase(room.state.phase), { room });
      return;
    } catch {
      clearReconnectToken();
    }
  }
  screens.show("Menu");
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
