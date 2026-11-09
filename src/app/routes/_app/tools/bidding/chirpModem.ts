/*
 * The sound remotes' radio, built to be heard in a noisy room (Norbert, 2026-11-09) and not by the people in it:
 * chirp spread spectrum, as LoRa radios use, high in the band at 18 to 20 kHz. Most adults hear nothing up there,
 * chatter and music carry almost no energy there, and phone speakers and microphones still reach it at the 44.1 and
 * 48 kHz rates browsers record at.
 *
 * The two directions sweep opposite ways (Norbert, 2026-11-09: the tablet broadcasts all the time, so phones always
 * know whether they still hear it): phones' commands sweep up, the tablet's calls sweep down. Every symbol is one sweep
 * across the band, started at one of 128 points; the receiver multiplies what it hears by its own direction's mirror
 * image, which squeezes a matching sweep's energy into a single frequency while noise, and a sweep the other way,
 * stay spread out (about 21 dB of gain). So the tablet can talk without drowning what it listens for.
 *
 * A message is three plain sweeps (the preamble, which also tells the receiver where each symbol starts), one sweep
 * that says what kind of message follows, then its symbols, each 0 to 15, spread 8 points apart so a small timing error
 * never turns one symbol into another. Every symbol lasts 64 ms, and the phase runs on unbroken from one sweep to the
 * next, so the joins do not click.
 */

/** What a message is: a phone's command (4 symbols) or the tablet's call (5 symbols). */
export type MessageKind = 'command' | 'call';
export const LOW_HZ = 18_000;
export const BAND_HZ = 2000;
/** Points on the sweep: the sweep lasts CHIPS / BAND_HZ seconds. */
export const CHIPS = 128;
export const SYMBOL_S = CHIPS / BAND_HZ;
const SPACING = CHIPS / 16;
const PREAMBLE = 3;

const KIND_SHIFT: Readonly<Record<MessageKind, number>> = { command: CHIPS / 4, call: (CHIPS * 3) / 4 };
const KIND_LENGTH: Readonly<Record<MessageKind, number>> = { command: 4, call: 5 };

/** The sweep's phase at time t (s) into a symbol that starts `shift` points along it; a call's sweep runs down. */
function sweepPhase(t: number, shift: number, kind: MessageKind): number {
  /* Frequency runs from LOW + BAND·shift/CHIPS up to the top, wraps to the bottom and runs on to the start point. */
  const start = shift / CHIPS;
  const u = t / SYMBOL_S;
  const position = (u + start) % 1;
  const wrapped = u + start >= 1;
  /* Phase is the integral of frequency: LOW·t + BAND·SYMBOL·(position²/2), minus the jump at the wrap. */
  const sweep = BAND_HZ * SYMBOL_S * ((position * position) / 2 - (start * start) / 2 + (wrapped ? 0.5 : 0));
  return kind === 'command' ? 2 * Math.PI * (LOW_HZ * t + sweep) : 2 * Math.PI * ((LOW_HZ + BAND_HZ) * t - sweep);
}

/** A message's sound, as samples at `rate`, softly faded in and out so it never clicks. */
export function modulate(kind: MessageKind, symbols: readonly number[], rate: number): Float32Array<ArrayBuffer> {
  const shifts = [...Array<number>(PREAMBLE).fill(0), KIND_SHIFT[kind], ...symbols.map((symbol) => symbol * SPACING)];
  const perSymbol = Math.round(SYMBOL_S * rate);
  const out = new Float32Array(perSymbol * shifts.length);
  const fade = Math.round(0.01 * rate);
  /* Each sweep starts where the last one's phase ended, so the joins do not click. */
  let offset = 0;
  shifts.forEach((shift, index) => {
    for (let n = 0; n < perSymbol; n++) {
      out[index * perSymbol + n] = Math.cos(offset + sweepPhase(n / rate, shift, kind));
    }
    offset += sweepPhase(perSymbol / rate, shift, kind);
  });
  for (let n = 0; n < fade; n++) {
    out[n]! *= n / fade;
    out[out.length - 1 - n]! *= n / fade;
  }
  return out;
}

/* An in-place radix-2 FFT over CHIPS complex points. */
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

/** One symbol read from samples: the point its sweep started at, and how far it stands above the rest (power ratio). */
export type Reading = Readonly<{ shift: number; clarity: number }>;

/**
 * Reads one symbol starting at `from`: mixes the samples with the plain sweep's mirror image, averages each chip's samples (which also folds the wrap onto the same point), and finds the strongest of the CHIPS points.
 */
export function readSymbol(
  samples: Float32Array,
  from: number,
  rate: number,
  mirror: Float64Array[],
  kind: MessageKind = 'command'
): Reading {
  const re = new Float64Array(CHIPS);
  const im = new Float64Array(CHIPS);
  const perChip = rate / BAND_HZ;
  const [cos, sin] = mirror as [Float64Array, Float64Array];
  for (let chip = 0; chip < CHIPS; chip++) {
    const first = Math.floor(chip * perChip);
    const last = Math.floor((chip + 1) * perChip);
    let sumRe = 0;
    let sumIm = 0;
    for (let n = first; n < last; n++) {
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
  /* Mixed down, a sweep started `shift` points along is a steady tone in bin `shift`; a downward one, in bin -shift. */
  best = kind === 'command' ? best : (CHIPS - best) % CHIPS;
  const rest = (total - bestPower) / (CHIPS - 1) || 1e-12;
  return { shift: best, clarity: bestPower / rest };
}

/** The plain sweep's mirror image at `rate`: what every symbol is multiplied by to read it. */
export function mirrorSweep(rate: number, kind: MessageKind): Float64Array[] {
  const length = Math.ceil(SYMBOL_S * rate);
  const cos = new Float64Array(length);
  const sin = new Float64Array(length);
  for (let n = 0; n < length; n++) {
    const phase = sweepPhase(n / rate, 0, kind);
    cos[n] = Math.cos(phase);
    sin[n] = -Math.sin(phase);
  }
  return [cos, sin];
}

/* How clearly a preamble sweep must stand out to start reading: noise alone almost never reaches it. */
const LOCK_CLARITY = 30;
/* How far apart, in samples, the receiver looks for a preamble: a quarter symbol. */
const HOP_SYMBOLS = 0.25;

/** A message heard: its kind and its symbols, each 0 to 15. */
export type Heard = Readonly<{ kind: MessageKind; symbols: number[] }>;

/**
 * Listens to a stream of samples and hands over every message in it.
 * It looks for the preamble a quarter symbol at a time;
 * the point a preamble sweep reads at tells it exactly where each symbol starts, so from there it reads symbol by symbol.
 */
export class ChirpReceiver {
  private buffer = new Float32Array(0);
  /** The absolute index of buffer[0]. */
  private offset = 0;
  private cursor = 0;
  private locked: { at: number; read: number[]; kind?: MessageKind } | undefined;
  private readonly perSymbol: number;
  private readonly mirror: Float64Array[];
  /** The clearest preamble reading lately, for a meter. */
  clarity = 0;

  constructor(
    private readonly rate: number,
    /** The one kind of message this receiver hears: each has its own band. */
    private readonly kind: MessageKind,
    private readonly onMessage: (heard: Heard) => void
  ) {
    this.perSymbol = Math.round(SYMBOL_S * rate);
    this.mirror = mirrorSweep(rate, kind);
  }

  push(samples: Float32Array) {
    const joined = new Float32Array(this.buffer.length + samples.length);
    joined.set(this.buffer);
    joined.set(samples, this.buffer.length);
    this.buffer = joined;
    this.run();
    /* Keeps two messages' worth of sound, enough to go back to a preamble's start. */
    const keep = this.perSymbol * 24;
    const drop = Math.max(
      0,
      Math.min(this.buffer.length - keep, (this.locked?.at ?? this.cursor) - this.offset - this.perSymbol)
    );
    if (drop > 0) {
      this.buffer = this.buffer.slice(drop);
      this.offset += drop;
    }
  }

  private read(at: number): Reading | undefined {
    const from = at - this.offset;
    if (from < 0 || from + this.perSymbol > this.buffer.length) {
      return undefined;
    }
    return readSymbol(this.buffer, from, this.rate, this.mirror, this.kind);
  }

  private run() {
    for (;;) {
      if (this.locked) {
        const reading = this.read(this.locked.at);
        if (!reading) {
          return;
        }
        this.step(reading);
        continue;
      }
      const reading = this.read(this.cursor);
      const next = this.read(this.cursor + this.perSymbol);
      if (!reading || !next) {
        return;
      }
      this.clarity = this.clarity * 0.8 + Math.min(reading.clarity, 200) * 0.2;
      /*
       * Two windows a symbol apart that read the same clear sweep are both inside the preamble, whose sweeps are all
       * alike; the point they read at is how many chips late the window started into its sweep.
       */
      const same = Math.min(Math.abs(reading.shift - next.shift), CHIPS - Math.abs(reading.shift - next.shift)) <= 2;
      if (reading.clarity >= LOCK_CLARITY && next.clarity >= LOCK_CLARITY && same) {
        const late = Math.round((reading.shift / CHIPS) * this.perSymbol);
        /* Reading starts at the next symbol boundary, which is still in the preamble (or its first sweep). */
        this.locked = { at: this.cursor + (late > 0 ? this.perSymbol - late : 0), read: [] };
      } else {
        this.cursor += Math.round(this.perSymbol * HOP_SYMBOLS);
      }
    }
  }

  /* One aligned symbol: more preamble, the kind, or the next data symbol. */
  private step({ shift, clarity }: Reading) {
    const locked = this.locked!;
    locked.at += this.perSymbol;
    if (clarity < LOCK_CLARITY / 4) {
      this.unlock();
      return;
    }
    const near = (target: number) => Math.min(Math.abs(shift - target), CHIPS - Math.abs(shift - target)) < SPACING / 2;
    if (!locked.kind) {
      if (near(0)) {
        return;
      }
      const kind = near(KIND_SHIFT[this.kind]) ? this.kind : undefined;
      if (!kind) {
        this.unlock();
        return;
      }
      locked.kind = kind;
      return;
    }
    locked.read.push(Math.round(shift / SPACING) % 16);
    if (locked.read.length === KIND_LENGTH[locked.kind]) {
      this.onMessage({ kind: locked.kind, symbols: locked.read });
      this.unlock();
    }
  }

  private unlock() {
    this.cursor = this.locked!.at;
    this.locked = undefined;
  }
}
