// Procedurally generated background music — same "no external audio files"
// approach as sfx.ts, using a lookahead scheduler (the standard technique
// for reliable Web Audio timing, avoiding setTimeout jitter) to loop a soft
// pad + arpeggio over a 4-chord progression. Reacts to game phase: calmer
// in menu/lobby/hide, subtly faster and brighter during the "seek" chase.

import { getAudioContext } from "./sfx";

export type MusicMood = "calm" | "tense" | "urgent";

// Am - F - C - G, a gentle, slightly wistful loop that doesn't get tiring
// on repeat — notes as Hz (root, third, fifth of each chord).
const CHORDS_HZ: number[][] = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [130.81, 164.81, 196.0], // C
  [196.0, 246.94, 293.66], // G
];
const ARP_PATTERN = [0, 1, 2, 1]; // indices into a chord's note list, up-down

const BASE_STEP_SEC = 0.42; // one arpeggio note; 4 steps per chord
const LOOKAHEAD_SEC = 0.2;
const SCHEDULER_INTERVAL_MS = 50;

class MusicPlayer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private mood: MusicMood = "calm";
  private muted = false;
  private running = false;
  private nextStepTime = 0;
  private chordIndex = 0;
  private stepIndex = 0;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  start() {
    if (this.running) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    this.ctx = ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.16;
    this.masterGain.connect(ctx.destination);

    this.running = true;
    this.nextStepTime = ctx.currentTime + 0.1;
    this.schedule();
  }

  stop() {
    this.running = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.masterGain?.disconnect();
    this.masterGain = null;
  }

  setMood(mood: MusicMood) {
    if (this.mood === mood) return;
    this.mood = mood;
    if (this.masterGain && !this.muted && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(mood === "urgent" ? 0.19 : 0.16, this.ctx.currentTime + 0.45);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain) this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : 0.16, (this.ctx?.currentTime ?? 0) + 0.15);
  }

  isMuted() {
    return this.muted;
  }

  private schedule = () => {
    if (!this.running || !this.ctx) return;
    while (this.nextStepTime < this.ctx.currentTime + LOOKAHEAD_SEC) {
      this.playStep(this.nextStepTime);
      const tempoScale = this.mood === "urgent" ? 0.48 : this.mood === "tense" ? 0.72 : 1;
      this.nextStepTime += BASE_STEP_SEC * tempoScale;
    }
    this.timerId = setTimeout(this.schedule, SCHEDULER_INTERVAL_MS);
  };

  private playStep(time: number) {
    const chord = CHORDS_HZ[this.chordIndex];

    if (this.stepIndex === 0) this.playPad(chord, time);

    const noteFreq = chord[ARP_PATTERN[this.stepIndex % ARP_PATTERN.length]] * 2; // one octave up from the pad
    this.playArpNote(noteFreq, time);
    if (this.mood === "urgent") this.playUrgentPulse(time, this.stepIndex % 2 === 0);

    this.stepIndex++;
    if (this.stepIndex >= ARP_PATTERN.length) {
      this.stepIndex = 0;
      this.chordIndex = (this.chordIndex + 1) % CHORDS_HZ.length;
    }
  }

  private playPad(chordFreqs: number[], time: number) {
    const ctx = this.ctx!;
    const tempoScale = this.mood === "urgent" ? 0.48 : this.mood === "tense" ? 0.72 : 1;
    const dur = BASE_STEP_SEC * ARP_PATTERN.length * tempoScale * 1.05;
    chordFreqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain).connect(this.masterGain!);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.5, time + 0.4);
      gain.gain.linearRampToValueAtTime(0, time + dur);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    });
  }

  private playArpNote(freq: number, time: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = this.mood === "urgent" ? "square" : this.mood === "tense" ? "triangle" : "sine";
    osc.frequency.value = freq;
    osc.connect(gain).connect(this.masterGain!);
    const dur = 0.5;
    const peak = this.mood === "urgent" ? 0.16 : this.mood === "tense" ? 0.22 : 0.14;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playUrgentPulse(time: number, strong: boolean) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(strong ? 92 : 116, time);
    osc.frequency.exponentialRampToValueAtTime(58, time + 0.12);
    osc.connect(gain).connect(this.masterGain!);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.32 : 0.2, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    osc.start(time);
    osc.stop(time + 0.18);
  }
}

export const musicPlayer = new MusicPlayer();
