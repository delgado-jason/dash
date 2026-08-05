// Comic-noir UI sound cues, synthesized live with the Web Audio API — no audio
// files to host. Gated by a client preference (default ON, per Jason) and
// unlocked on the first user gesture so later, non-gesture cues (a KPI count-up
// on page load, an award pop) can still play once the page has been touched.
//
// Design rule: cues fire ONLY on earned/celebratory moments, never routine
// actions. Everything is short and quiet, and collapses rapid repeats.

const PREF_KEY = "dash.sfx"; // "off" disables; unset/anything else = on (default on)

export const sfxEnabled = (): boolean => localStorage.getItem(PREF_KEY) !== "off";
export const setSfxEnabled = (on: boolean): void =>
  localStorage.setItem(PREF_KEY, on ? "on" : "off");

export type Cue = "stamp" | "kaching" | "pow" | "odometer" | "rankup";

type WinAudio = typeof window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

const audio = (): { c: AudioContext; out: GainNode } | null => {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as WinAudio).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5; // keep the whole thing quiet
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return master ? { c: ctx, out: master } : null;
};

// Unlock on the first interaction so cues that fire without a direct gesture
// (count-ups, award pops) work for the rest of the session.
if (typeof window !== "undefined") {
  const unlock = () => audio();
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

interface ToneOpts {
  freq: number;
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  glideTo?: number;
  delay?: number;
}
const tone = (c: AudioContext, out: GainNode, o: ToneOpts) => {
  const { freq, type = "sine", dur = 0.15, gain = 0.3, glideTo, delay = 0 } = o;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
};

interface NoiseOpts {
  dur?: number;
  gain?: number;
  type?: BiquadFilterType;
  freq?: number;
  q?: number;
  delay?: number;
}
const noise = (c: AudioContext, out: GainNode, o: NoiseOpts) => {
  const { dur = 0.12, gain = 0.3, type = "lowpass", freq = 800, q = 1, delay = 0 } = o;
  const t0 = c.currentTime + delay;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.03);
};

// A struck bell via inharmonic partials — reads as a metallic register ding.
const bell = (
  c: AudioContext,
  out: GainNode,
  { base, dur, gain, delay = 0 }: { base: number; dur: number; gain: number; delay?: number },
) => {
  const t0 = c.currentTime + delay;
  const ratios = [1, 2.76, 5.4, 8.93];
  const amps = [1, 0.55, 0.36, 0.22];
  ratios.forEach((r, i) => {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = base * r;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * amps[i], t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * (1 - i * 0.14));
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  });
};

const CUES: Record<Cue, (c: AudioContext, out: GainNode) => void> = {
  stamp(c, out) {
    noise(c, out, { dur: 0.09, gain: 0.5, type: "lowpass", freq: 480 });
    tone(c, out, { freq: 160, glideTo: 52, type: "sine", dur: 0.15, gain: 0.5 });
  },
  kaching(c, out) {
    bell(c, out, { base: 1050, dur: 0.5, gain: 0.22 });
    bell(c, out, { base: 1420, dur: 0.55, gain: 0.2, delay: 0.11 });
  },
  pow(c, out) {
    noise(c, out, { dur: 0.08, gain: 0.42, type: "bandpass", freq: 950, q: 0.7 });
    [392, 523, 784].forEach((f, i) =>
      tone(c, out, { freq: f, type: "triangle", dur: 0.17, gain: 0.18, delay: i * 0.055 }),
    );
  },
  odometer(c, out) {
    [0, 0.04, 0.085, 0.14, 0.205].forEach((t, i) =>
      noise(c, out, { dur: 0.02, gain: 0.15, type: "lowpass", freq: 1150 - i * 90, q: 1, delay: t }),
    );
    tone(c, out, { freq: 190, glideTo: 120, type: "sine", dur: 0.08, gain: 0.13, delay: 0.235 });
  },
  rankup(c, out) {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(c, out, { freq: f, type: "triangle", dur: 0.22, gain: 0.2, delay: i * 0.1 }),
    );
    tone(c, out, { freq: 1047, type: "sine", dur: 0.45, gain: 0.1, delay: 0.4 });
  },
};

const lastPlayed: Record<string, number> = {};

// Play a cue if sound is enabled and the context is unlocked. Collapses rapid
// repeats (e.g. five KPI count-ups firing together = one tick).
export const playSfx = (cue: Cue): void => {
  if (!sfxEnabled()) return;
  const a = audio();
  if (!a || a.c.state !== "running") return; // suspended (no gesture yet) → skip
  const now = Date.now();
  if (now - (lastPlayed[cue] ?? 0) < 300) return;
  lastPlayed[cue] = now;
  CUES[cue](a.c, a.out);
};
