// Playful corporate-heist score for Clock Out Protocol. Everything is
// synthesized with Web Audio: muted-office plucks, clock/keyboard percussion,
// a sneaky bass line and elevator-style chimes. The same motif accelerates
// and becomes more urgent during SEEK, so transitions feel musical rather
// than switching to an unrelated track.

import { getAudioContext } from "./sfx";

export type MusicMood = "calm" | "tense" | "urgent";

// Dm - Bb - F - C: playful spy/heist colour without sounding too dark.
const CHORDS = [
  [146.83, 174.61, 220.0],
  [116.54, 146.83, 174.61],
  [174.61, 220.0, 261.63],
  [130.81, 164.81, 196.0],
];
const PLUCK_PATTERN = [0, 2, 1, 2, 0, 1, 2, 1];
const LOOKAHEAD_SEC = 0.2;
const SCHEDULER_INTERVAL_MS = 40;

class MusicPlayer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private mood: MusicMood = "calm";
  private muted = false;
  private running = false;
  private nextStepTime = 0;
  private step = 0;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  start() {
    if (this.running) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.13;
    this.masterGain.connect(ctx.destination);
    this.running = true;
    this.nextStepTime = ctx.currentTime + 0.08;
    this.schedule();
  }

  stop() {
    this.running = false;
    if (this.timerId !== null) clearTimeout(this.timerId);
    this.timerId = null;
    this.masterGain?.disconnect();
    this.masterGain = null;
  }

  setMood(mood: MusicMood) {
    if (this.mood === mood) return;
    this.mood = mood;
    if (this.masterGain && this.ctx && !this.muted) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(mood === "urgent" ? 0.155 : mood === "tense" ? 0.142 : 0.13, now + 0.35);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : 0.13, now + 0.12);
    }
  }

  isMuted() { return this.muted; }

  private bpm() { return this.mood === "urgent" ? 158 : this.mood === "tense" ? 132 : 108; }

  private schedule = () => {
    if (!this.running || !this.ctx) return;
    while (this.nextStepTime < this.ctx.currentTime + LOOKAHEAD_SEC) {
      this.playStep(this.nextStepTime, this.step);
      this.nextStepTime += 60 / this.bpm() / 2; // eighth notes
      this.step = (this.step + 1) % 32;
    }
    this.timerId = setTimeout(this.schedule, SCHEDULER_INTERVAL_MS);
  };

  private playStep(time: number, step: number) {
    const chordIndex = Math.floor(step / 8) % CHORDS.length;
    const chord = CHORDS[chordIndex];
    const local = step % 8;

    if (local === 0) this.playSoftChord(chord, time);
    if (local === 0 || local === 4 || (this.mood !== "calm" && local === 6)) this.playBass(chord[0] / 2, time, local === 0);
    this.playOfficePluck(chord[PLUCK_PATTERN[local]] * 2, time, local % 2 === 0);

    // Clock ticks are the office identity; SEEK adds keyboard clacks between
    // them and URGENT adds a low printer-like thump on every beat.
    this.playClockTick(time, local % 2 === 0);
    if (this.mood !== "calm" && local % 2 === 1) this.playKeyboardClack(time);
    if (this.mood === "urgent" && local % 2 === 0) this.playUrgentThump(time, local === 0 || local === 4);
    if (local === 7 && (chordIndex === 1 || chordIndex === 3)) this.playElevatorChime(chord[2] * 2, time);
  }

  private tone(freq: number, time: number, duration: number, peak: number, type: OscillatorType, attack = 0.008, filterHz?: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    let destination: AudioNode = gain;
    if (filterHz) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = filterHz;
      osc.connect(filter).connect(gain);
      destination = filter;
    }
    if (!filterHz) osc.connect(gain);
    gain.connect(this.masterGain!);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.start(time);
    osc.stop(time + duration + 0.02);
    void destination;
  }

  private playSoftChord(chord: number[], time: number) {
    const duration = (60 / this.bpm()) * 3.8;
    chord.forEach((freq, index) => this.tone(freq, time, duration, 0.12 - index * 0.015, "triangle", 0.18, 900));
  }

  private playBass(freq: number, time: number, strong: boolean) {
    this.tone(freq, time, 0.34, strong ? 0.34 : 0.24, "triangle", 0.01, 420);
  }

  private playOfficePluck(freq: number, time: number, accented: boolean) {
    const type: OscillatorType = this.mood === "urgent" ? "square" : "triangle";
    this.tone(freq, time, 0.16, accented ? 0.14 : 0.085, type, 0.004, this.mood === "urgent" ? 1500 : 1100);
  }

  private playClockTick(time: number, strong: boolean) {
    this.tone(strong ? 1850 : 1320, time, 0.035, strong ? 0.11 : 0.065, "square", 0.002, 2400);
  }

  private playKeyboardClack(time: number) {
    this.tone(520, time, 0.045, 0.08, "square", 0.002, 850);
  }

  private playUrgentThump(time: number, strong: boolean) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(strong ? 105 : 82, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.11);
    osc.connect(gain).connect(this.masterGain!);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.3 : 0.2, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  private playElevatorChime(freq: number, time: number) {
    this.tone(freq, time, 0.42, 0.11, "sine", 0.012);
    this.tone(freq * 1.25, time + 0.07, 0.38, 0.08, "sine", 0.012);
  }
}

export const musicPlayer = new MusicPlayer();
