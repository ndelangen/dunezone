/*
 * The tablet's voice: a clock (Norbert, 2026-11-09: the high whine was unpleasant to children, so the tablet ticks
 * like a clock instead). It ticks four times a second, without end, and every tick carries one symbol of its call, so
 * a phone that hears the ticks knows it is still linked, and knows whose bid it is.
 *
 * Each tick is a 16 ms chirp from 4.5 to 8.5 kHz with a sharp start and a quick fade, which the ear hears as a click.
 * A call is one frame of six beats: a "tock" (the sweep run downwards, which marks where a frame starts and exactly
 * when) and then five ticks, one per symbol (0 to 15), each started at its own point along the sweep. Above the
 * phones' notes (noteTunes.ts tops out at 3.5 kHz), so the tablet can tick while a phone plays.
 */

export const TICK_LOW_HZ = 4500;
export const TICK_BAND_HZ = 4000;
const CHIPS = 64;
const TICK_S = CHIPS / TICK_BAND_HZ;
const SPACING = CHIPS / 16;
/** One beat of the clock: four ticks a second. */
export const BEAT_S = 0.25;
/** The symbols in a call. */
export const CALL_SYMBOLS = 5;
/** The beats in a frame: the tock, then a tick per symbol. */
export const FRAME_BEATS = CALL_SYMBOLS + 1;
/** How long one frame lasts. */
export const FRAME_S = FRAME_BEATS * BEAT_S;

/* The sweep's phase at time t (s) into a tick that starts `shift` points along it; a tock runs downwards. */
function sweepPhase(t: number, shift: number, up: boolean): number {
  const start = shift / CHIPS;
  const u = t / TICK_S;
  const position = (u + start) % 1;
  const wrapped = u + start >= 1;
  const sweep = TICK_BAND_HZ * TICK_S * ((position * position) / 2 - (start * start) / 2 + (wrapped ? 0.5 : 0));
  return up ? 2 * Math.PI * (TICK_LOW_HZ * t + sweep) : 2 * Math.PI * ((TICK_LOW_HZ + TICK_BAND_HZ) * t - sweep);
}

/* A click's shape: a 1 ms rise, then a fast fade, to nothing at the end. */
function envelope(t: number): number {
  const rise = 0.001;
  if (t < rise) {
    return Math.sin(((t / rise) * Math.PI) / 2) ** 2;
  }
  const tail = Math.max(0, Math.min(1, (TICK_S - t) / 0.002));
  return Math.exp(-(t - rise) / 0.008) * tail;
}

/** One call's frame of ticks, as samples at `rate`: the tock on the first beat, then a tick per symbol. */
export function tickFrame(symbols: readonly number[], rate: number): Float32Array<ArrayBuffer> {
  const beat = Math.round(BEAT_S * rate);
  const tick = Math.round(TICK_S * rate);
  const out = new Float32Array(beat * FRAME_BEATS);
  [undefined, ...symbols].forEach((symbol, index) => {
    for (let n = 0; n < tick; n++) {
      const t = n / rate;
      const phase = symbol === undefined ? sweepPhase(t, 0, false) : sweepPhase(t, symbol * SPACING, true);
      out[index * beat + n] = Math.cos(phase) * envelope(t);
    }
  });
  return out;
}

/* An in-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const wr = Math.cos(step * k);
        const wi = Math.sin(step * k);
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b]! * wr - im[b]! * wi;
        const ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
    }
  }
}

type Mirror = readonly [Float64Array, Float64Array];

function mirrorSweep(rate: number, up: boolean): Mirror {
  const length = Math.ceil(TICK_S * rate);
  const cos = new Float64Array(length);
  const sin = new Float64Array(length);
  for (let n = 0; n < length; n++) {
    const phase = sweepPhase(n / rate, 0, up);
    cos[n] = Math.cos(phase);
    sin[n] = -Math.sin(phase);
  }
  return [cos, sin];
}

/** A tick read: the point along the sweep it reads at (its symbol's point plus how late the window is) and how clearly. */
type Reading = Readonly<{ shift: number; clarity: number }>;

function readTick(samples: Float32Array, from: number, rate: number, [cos, sin]: Mirror, up: boolean): Reading {
  const re = new Float64Array(CHIPS);
  const im = new Float64Array(CHIPS);
  const perChip = rate / TICK_BAND_HZ;
  for (let chip = 0; chip < CHIPS; chip++) {
    const last = Math.floor((chip + 1) * perChip);
    let sumRe = 0;
    let sumIm = 0;
    for (let n = Math.floor(chip * perChip); n < last; n++) {
      const value = samples[from + n] ?? 0;
      sumRe += value * cos[n]!;
      sumIm += value * sin[n]!;
    }
    re[chip] = sumRe;
    im[chip] = sumIm;
  }
  fft(re, im);
  let best = 0;
  let bestPower = 0;
  let total = 0;
  for (let bin = 0; bin < CHIPS; bin++) {
    const power = re[bin]! * re[bin]! + im[bin]! * im[bin]!;
    total += power;
    if (power > bestPower) {
      bestPower = power;
      best = bin;
    }
  }
  const rest = (total - bestPower) / (CHIPS - 1) || 1e-12;
  return { shift: up ? best : (CHIPS - best) % CHIPS, clarity: bestPower / rest };
}

/* How clearly a tock must stand out to start a frame, and a tick to count: noise alone stays near 5. */
const TOCK_CLARITY = 20;
const TICK_CLARITY = 8;

/**
 * Listens for the clock and hands over every call in it.
 * It looks for a tock a quarter tick at a time;
 * where the tock reads along its sweep says exactly when it started, so the frame's five ticks are read right on their beats.
 */
export class TickReceiver {
  private buffer = new Float32Array(0);
  /** The absolute index of buffer[0]. */
  private offset = 0;
  private cursor = 0;
  private best: { at: number; reading: Reading } | undefined;
  private frame: { start: number; read: number[] } | undefined;
  private readonly tick: number;
  private readonly hop: number;
  private readonly up: Mirror;
  private readonly down: Mirror;
  /** How clear the ticks are lately, for a meter. */
  clarity = 0;

  constructor(
    private readonly rate: number,
    private readonly onFrame: (symbols: number[]) => void
  ) {
    this.tick = Math.round(TICK_S * rate);
    this.hop = Math.max(1, Math.round(this.tick / 4));
    this.up = mirrorSweep(rate, true);
    this.down = mirrorSweep(rate, false);
  }

  push(samples: Float32Array) {
    const joined = new Float32Array(this.buffer.length + samples.length);
    joined.set(this.buffer);
    joined.set(samples, this.buffer.length);
    this.buffer = joined;
    this.run();
    const keepFrom = Math.min(this.frame?.start ?? this.cursor, this.best?.at ?? this.cursor) - this.tick;
    const drop = Math.max(
      0,
      Math.min(this.buffer.length - Math.round(FRAME_S * 2 * this.rate), keepFrom - this.offset)
    );
    if (drop > 0) {
      this.buffer = this.buffer.slice(drop);
      this.offset += drop;
    }
  }

  private read(at: number, up: boolean): Reading | undefined {
    const from = at - this.offset;
    if (from < 0 || from + this.tick > this.buffer.length) {
      return undefined;
    }
    return readTick(this.buffer, from, this.rate, up ? this.up : this.down, up);
  }

  private run() {
    for (;;) {
      if (this.frame) {
        const { start, read } = this.frame;
        const at = start + Math.round((read.length + 1) * BEAT_S * this.rate);
        const reading = this.read(at, true);
        if (!reading) {
          return;
        }
        this.clarity = this.clarity * 0.7 + Math.min(reading.clarity, 100) * 0.3;
        if (reading.clarity < TICK_CLARITY) {
          this.frame = undefined;
          this.cursor = start + this.tick;
          continue;
        }
        read.push(Math.round(reading.shift / SPACING) % 16);
        if (read.length === CALL_SYMBOLS) {
          this.onFrame(read);
          this.frame = undefined;
          this.cursor = at + this.tick;
        }
        continue;
      }
      const reading = this.read(this.cursor, false);
      if (!reading) {
        return;
      }
      if (reading.clarity >= TOCK_CLARITY && (!this.best || reading.clarity > this.best.reading.clarity)) {
        this.best = { at: this.cursor, reading };
      } else if (this.best) {
        /* The clearest window is past: where it read along the sweep says how far it was from the tock's start. */
        const { at, reading: tock } = this.best;
        this.best = undefined;
        const perChip = this.rate / TICK_BAND_HZ;
        const start =
          tock.shift < CHIPS / 2
            ? at - Math.round(tock.shift * perChip)
            : at + Math.round((CHIPS - tock.shift) * perChip);
        this.frame = { start, read: [] };
        continue;
      }
      this.cursor += this.hop;
    }
  }
}
