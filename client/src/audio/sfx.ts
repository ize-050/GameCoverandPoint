// Real Kenney "Interface Sounds" / "Music Jingles" clips (CC0), decoded once
// into AudioBuffers and played through the same shared AudioContext the
// procedural background music already uses — replaces the old
// oscillator-synthesized beep() placeholders with actual recorded sound design.

let ctx: AudioContext | null = null;

// Shared across SFX and the background music player — browsers cap the
// number of live AudioContexts, and reusing one keeps the same user-gesture
// unlock working for both.
export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!ctx) ctx = new AudioCtor();
  return ctx;
}

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();

function loadBuffer(path: string): Promise<AudioBuffer> {
  const cached = buffers.get(path);
  if (cached) return Promise.resolve(cached);
  const inFlight = loading.get(path);
  if (inFlight) return inFlight;

  const audioCtx = getAudioContext();
  if (!audioCtx) return Promise.reject(new Error("no AudioContext"));

  const promise = fetch(path)
    .then((res) => res.arrayBuffer())
    .then((data) => audioCtx.decodeAudioData(data))
    .then((buffer) => {
      buffers.set(path, buffer);
      loading.delete(path);
      return buffer;
    });
  loading.set(path, promise);
  return promise;
}

function play(path: string, { gain = 0.6, delay = 0 }: { gain?: number; delay?: number } = {}) {
  const audioCtx = getAudioContext();
  if (!audioCtx) return;
  loadBuffer(path)
    .then((buffer) => {
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = gain;
      source.connect(gainNode).connect(audioCtx.destination);
      source.start(audioCtx.currentTime + delay);
    })
    .catch(() => {
      // A dropped fetch/decode (e.g. offline) shouldn't break gameplay —
      // SFX are pure feedback, never load-bearing for game logic.
    });
}

const SFX = {
  catchSuccess: "/audio/sfx/catch-success.ogg",
  caught: "/audio/sfx/caught.ogg",
  inspectMiss: "/audio/sfx/inspect-miss.ogg",
  countdownTick: "/audio/sfx/countdown-tick.ogg",
  roundWin: "/audio/sfx/round-win.ogg",
  hide: "/audio/sfx/hide.ogg",
  unhide: "/audio/sfx/unhide.ogg",
  decoyScare: "/audio/sfx/decoy-scare.ogg",
  lightsOff: "/audio/sfx/lights-off.ogg",
  lightsOn: "/audio/sfx/lights-on.ogg",
  serverAlarm: "/audio/sfx/server-alarm.ogg",
  serverAlarm2: "/audio/sfx/server-alarm-2.ogg",
  emote: "/audio/sfx/emote.ogg",
  uiClick: "/audio/sfx/ui-click.ogg",
  toiletFlush: "/audio/sfx/toilet-flush.ogg",
} as const;
const ROUND_WIN_JINGLE = "/audio/jingles/round-win.ogg";

// Decode every clip up front (doesn't require a user gesture — only actual
// playback does) so the first real play of each has zero fetch/decode delay.
Object.values(SFX).forEach((path) => loadBuffer(path).catch(() => {}));
loadBuffer(ROUND_WIN_JINGLE).catch(() => {});

export function playCatchSuccessSfx() {
  play(SFX.catchSuccess, { gain: 0.7 });
}

export function playCaughtSfx() {
  play(SFX.caught, { gain: 0.6 });
}

export function playInspectMissSfx() {
  play(SFX.inspectMiss, { gain: 0.45 });
}

export function playCountdownTickSfx() {
  play(SFX.countdownTick, { gain: 0.35 });
}

export function playRoundWinSfx() {
  play(SFX.roundWin, { gain: 0.6 });
  play(ROUND_WIN_JINGLE, { gain: 0.5, delay: 0.1 });
}

export function playHideSfx() {
  play(SFX.hide, { gain: 0.5 });
}

export function playUnhideSfx() {
  play(SFX.unhide, { gain: 0.5 });
}

export function playDecoyScareSfx() {
  play(SFX.decoyScare, { gain: 0.55 });
}

export function playLightsOffSfx() {
  play(SFX.lightsOff, { gain: 0.5 });
}

export function playLightsOnSfx() {
  play(SFX.lightsOn, { gain: 0.5 });
}

// Server-room motion alarm — layers two distinct clips, same "not a single
// flat cue" treatment the old two-tone klaxon beep() pair had.
export function playServerAlarmSfx() {
  play(SFX.serverAlarm, { gain: 0.55 });
  play(SFX.serverAlarm2, { gain: 0.4, delay: 0.12 });
}

export function playEmoteSfx() {
  play(SFX.emote, { gain: 0.4 });
}

export function playUiClickSfx() {
  play(SFX.uiClick, { gain: 0.35 });
}

export function playToiletFlushSfx() {
  play(SFX.toiletFlush, { gain: 0.5 });
}
