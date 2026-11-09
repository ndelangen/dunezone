/*
 * The phones' voice: a short tune of bell-like notes (Norbert, 2026-11-09: the chirps were unpleasant, and the high
 * whine reached children's ears; sound that people hear should at least be pleasant). Every note is one of sixteen on a
 * pentatonic scale from A4 (440 Hz) up three octaves, so any tune the symbols make sounds in key.
 *
 * A command is six notes, 130 ms apart: two fixed opening notes (an octave leap, A5 to A6, which tells the listener a
 * tune is starting and when), then its four symbols. The tablet's clock ticks above 4.5 kHz, out of the way.
 */

const SCALE = [0, 2, 4, 7, 9];
/** The sixteen notes, in Hz. */
export const NOTE_HZ: readonly number[] = Array.from(
  { length: 16 },
  (_, index) => 440 * 2 ** ((Math.floor(index / 5) * 12 + SCALE[index % 5]!) / 12)
);
const NOTE_S = 0.1;
/** From one note's start to the next one's. */
export const STEP_S = 0.13;
const OPENING = [5, 10] as const;
/** How long a tune lasts, for the four symbols of a command. */
export const TUNE_S = (OPENING.length + 4) * STEP_S;

/* A bell's shape: a soft 6 ms strike, a slow fade, and a gentle stop. */
function envelope(t: number): number {
  const strike = Math.min(1, t / 0.006);
  const stop = Math.max(0, Math.min(1, (NOTE_S - t) / 0.015));
  return Math.sin((strike * Math.PI) / 2) ** 2 * Math.exp(-t / 0.15) * stop;
}

/** A tune's sound, as samples at `rate`: the opening, then a note per symbol. */
export function tune(symbols: readonly number[], rate: number): Float32Array<ArrayBuffer> {
  const notes = [...OPENING, ...symbols];
  const step = Math.round(STEP_S * rate);
  const length = Math.round(NOTE_S * rate);
  const out = new Float32Array(step * (notes.length - 1) + length);
  notes.forEach((note, index) => {
    const hz = NOTE_HZ[note]!;
    for (let n = 0; n < length; n++) {
      const t = n / rate;
      out[index * step + n] = Math.sin(2 * Math.PI * hz * t) * envelope(t);
    }
  });
  return out;
}

/* How a window's sound reads: the strongest note, what share of the sound it holds, and how far ahead of the next. */
type Heard = Readonly<{ note: number; share: number; lead: number }>;

/* Goertzel's filter: the power of one frequency over a window. */
function power(samples: Float32Array, from: number, length: number, coefficient: number): number {
  let s1 = 0;
  let s2 = 0;
  for (let n = 0; n < length; n++) {
    const s = (samples[from + n] ?? 0) + coefficient * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return s1 * s1 + s2 * s2 - coefficient * s1 * s2;
}

/* The strongest note needs a quarter of the sound, at twice the next note, to count as heard. */
const SHARE = 0.25;
const LEAD = 2;

/**
 * Listens for tunes and hands over each one's symbols.
 * It reads 40 ms windows every 5 ms;
 * once it hears the opening's two notes the right time apart, it knows when each symbol's note sounds and reads it in its middle.
 */
export class NoteReceiver {
  private buffer = new Float32Array(0);
  private offset = 0;
  private cursor = 0;
  private readonly window: number;
  private readonly hop: number;
  private readonly coefficients: number[];
  /* The run of one note the windows are in, and when the last opening note's run started. */
  private run: { note: number; start: number; length: number } | undefined;
  private opened: number | undefined;
  private tuneAt: number | undefined;
  private read: number[] = [];
  /** How clearly notes stand out lately, for a meter. */
  clarity = 0;

  constructor(
    private readonly rate: number,
    private readonly onTune: (symbols: number[]) => void
  ) {
    this.window = Math.round(0.04 * rate);
    this.hop = Math.round(0.005 * rate);
    this.coefficients = NOTE_HZ.map((hz) => 2 * Math.cos((2 * Math.PI * hz) / rate));
  }

  push(samples: Float32Array) {
    const joined = new Float32Array(this.buffer.length + samples.length);
    joined.set(this.buffer);
    joined.set(samples, this.buffer.length);
    this.buffer = joined;
    this.process();
    const keepFrom = Math.min(this.cursor, this.opened ?? this.cursor, this.tuneAt ?? this.cursor) - this.window;
    const drop = Math.max(0, Math.min(this.buffer.length - Math.round(TUNE_S * 2 * this.rate), keepFrom - this.offset));
    if (drop > 0) {
      this.buffer = this.buffer.slice(drop);
      this.offset += drop;
    }
  }

  private hear(at: number): Heard | undefined {
    const from = at - this.offset;
    if (from < 0 || from + this.window > this.buffer.length) {
      return undefined;
    }
    let energy = 0;
    for (let n = 0; n < this.window; n++) {
      energy += this.buffer[from + n]! ** 2;
    }
    let note = 0;
    let best = 0;
    let second = 0;
    this.coefficients.forEach((coefficient, index) => {
      const p = power(this.buffer, from, this.window, coefficient);
      if (p > best) {
        second = best;
        best = p;
        note = index;
      } else if (p > second) {
        second = p;
      }
    });
    /* A steady note fills the window: its power is energy · window / 2. */
    const share = energy > 1e-9 ? best / ((energy * this.window) / 2) : 0;
    return { note, share, lead: best / (second || 1e-12) };
  }

  private process() {
    for (;;) {
      if (this.tuneAt !== undefined) {
        /* The middle of the next symbol's note. */
        const at =
          this.tuneAt +
          Math.round((OPENING.length + this.read.length) * STEP_S * this.rate + (NOTE_S / 2) * this.rate) -
          Math.round(this.window / 2);
        const heard = this.hear(at);
        if (!heard) {
          return;
        }
        if (heard.share < SHARE / 2 || heard.lead < LEAD) {
          this.tuneAt = undefined;
          this.read = [];
          continue;
        }
        this.read.push(heard.note);
        if (this.read.length === 4) {
          this.onTune(this.read);
          this.read = [];
          this.tuneAt = undefined;
          this.opened = undefined;
          this.run = undefined;
          this.cursor = at + this.window;
        }
        continue;
      }
      const heard = this.hear(this.cursor);
      if (!heard) {
        return;
      }
      const note = heard.share >= SHARE && heard.lead >= LEAD ? heard.note : -1;
      if (note >= 0) {
        this.clarity = this.clarity * 0.9 + Math.min(heard.lead, 100) * 0.1;
      }
      if (this.run?.note === note) {
        this.run.length++;
      } else {
        if (this.run?.note === OPENING[0] && this.run.length >= 3) {
          this.opened = this.run.start;
        }
        this.run = { note, start: this.cursor, length: 1 };
        if (note === OPENING[1] && this.opened !== undefined) {
          const apart = (this.cursor - this.opened) / this.rate;
          if (Math.abs(apart - STEP_S) < 0.03) {
            /* A window first hears a note when it is about half inside it. */
            this.tuneAt = this.opened + Math.round(this.window * 0.4);
            this.cursor += this.hop;
            continue;
          }
        }
      }
      this.cursor += this.hop;
    }
  }
}
