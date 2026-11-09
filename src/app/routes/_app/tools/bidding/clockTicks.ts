/*
 * The tablet's heartbeat: a clock (Norbert, 2026-11-09: the tablet sounds like a clock, ticking once a second like a
 * real one). It ticks and tocks without end, so a phone that hears it knows it is still near the tablet; what the
 * tablet has to say goes out as a tune (noteTunes.ts) only when something changes.
 *
 * Each beat is a few millimetres of escapement: a short knock of damped high resonances, the tock a little lower than
 * the tick. They sit above 4 kHz, out of the way of the tunes' notes (440 Hz to 3.5 kHz).
 */

/** One beat a second. */
export const BEAT_S = 1;
const BEAT_SOUND_S = 0.03;

/* A repeatable rustle, so every beat sounds the same. */
function rustle(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7f_ff_ff_ff;
    return (state / 0x7f_ff_ff_ff) * 2 - 1;
  };
}

/** One beat's sound at `rate`: the tick, or the lower tock. */
export function beat(tock: boolean, rate: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.round(BEAT_SOUND_S * rate));
  const ring = tock ? [4100, 6100, 7900] : [4700, 6900, 8800];
  const noise = rustle(tock ? 11 : 7);
  /* The knock's rattle: a bright burst under a millisecond, high-passed so it stays above the notes. */
  let last = 0;
  for (let n = 0; n < out.length; n++) {
    const t = n / rate;
    const hit = Math.min(1, t / 0.0004);
    let value = 0;
    ring.forEach((hz, index) => {
      value += Math.sin(2 * Math.PI * hz * t) * Math.exp(-t / (0.004 - index * 0.0008)) * (1 - index * 0.25);
    });
    const raw = noise();
    const high = raw - last;
    last = raw;
    value += high * 0.6 * Math.exp(-t / 0.0006);
    out[n] = value * hit * 0.5;
  }
  return out;
}

/* A second-order band-pass around the beats' resonances. */
function bandPass(rate: number) {
  const w = (2 * Math.PI * 6500) / rate;
  const alpha = Math.sin(w) / (2 * 0.8);
  const a0 = 1 + alpha;
  const [b0, b2, a1, a2] = [alpha / a0, -alpha / a0, (-2 * Math.cos(w)) / a0, (1 - alpha) / a0];
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  return (x: number) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    [x2, x1, y2, y1] = [x1, x, y1, y];
    return y;
  };
}

/* A knock stands this far above the room's usual sound in the band, and falls this far from its peak within KNOCK_S. */
const RISE = 8;
const FALL = 30;
const KNOCK_S = 0.02;
const BRIGHT = 0.15;
/* How far off the second a knock may land and still be the clock. */
const SLACK_S = 0.03;

/**
 * Listens for the clock.
 * It hears a knock as a sudden jump of sound in the beats' band, and counts it as the tablet only when it comes a whole number of seconds (up to three) after the last knock it heard.
 */
export class ClockListener {
  private readonly filter: (x: number) => number;
  private readonly hop: number;
  private sum = 0;
  private total = 0;
  private count = 0;
  /* The room's usual loudness in the band, learnt slowly from the quiet between knocks. */
  private floor = 0;
  private samples = 0;
  /* Knocks heard in the last few seconds: a stray clap among them does not break the count. */
  private knocks: number[] = [];
  private quietUntil = 0;
  /* A sudden jump being watched: a knock dies away within a few milliseconds, a note rings on. */
  private rising: { at: number; peak: number; hops: number } | undefined;
  /** How clearly the last beat stood out, for a meter. */
  clarity = 0;

  constructor(
    private readonly rate: number,
    private readonly onBeat: () => void
  ) {
    const [first, second] = [bandPass(rate), bandPass(rate)];
    this.filter = (x) => second(first(x));
    this.hop = Math.round(0.0025 * rate);
  }

  push(samples: Float32Array) {
    for (const sample of samples) {
      const y = this.filter(sample);
      this.sum += y * y;
      this.total += sample * sample;
      this.count++;
      this.samples++;
      if (this.count === this.hop) {
        this.step(this.sum / this.hop, this.total / this.hop);
        this.sum = 0;
        this.total = 0;
        this.count = 0;
      }
    }
  }

  private step(energy: number, total: number) {
    const at = this.samples / this.rate;
    if (this.floor === 0) {
      this.floor = energy || 1e-12;
      return;
    }
    const rising = this.rising;
    if (rising) {
      rising.peak = Math.max(rising.peak, energy);
      rising.hops++;
      if (energy < Math.max(rising.peak / FALL, this.floor * 2)) {
        this.rising = undefined;
        this.quietUntil = at + 0.1;
        this.knock(rising.at, rising.peak);
      } else if (rising.hops * 0.0025 > KNOCK_S) {
        this.rising = undefined;
      }
      return;
    }
    /* A knock is mostly high sound; a note's start splashes some up there, but its body is far louder. */
    if (energy > this.floor * RISE && energy > total * BRIGHT && at >= this.quietUntil) {
      this.rising = { at, peak: energy, hops: 0 };
      return;
    }
    if (energy < this.floor * RISE) {
      this.floor += (Math.max(energy, 1e-12) - this.floor) * 0.01;
    }
  }

  private knock(at: number, peak: number) {
    this.clarity = peak / this.floor;
    this.knocks = this.knocks.filter((knock) => at - knock < 3.5 * BEAT_S);
    const onTime = this.knocks.some((knock) => {
      const seconds = (at - knock) / BEAT_S;
      return Math.round(seconds) >= 1 && Math.abs(seconds - Math.round(seconds)) * BEAT_S <= SLACK_S;
    });
    this.knocks.push(at);
    if (onTime) {
      this.onBeat();
    }
  }
}
