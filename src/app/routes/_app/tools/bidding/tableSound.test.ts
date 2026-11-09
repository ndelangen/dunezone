import { describe, expect, it } from 'vitest';

import { TickReceiver, tickFrame } from './clockTicks';
import { NoteReceiver, tune } from './noteTunes';

/* A repeatable noise source, so a failure can be replayed. */
function noise(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7f_ff_ff_ff;
    const u = state / 0x7f_ff_ff_ff;
    state = (state * 1_103_515_245 + 12_345) & 0x7f_ff_ff_ff;
    const v = state / 0x7f_ff_ff_ff;
    return Math.sqrt(-2 * Math.log(u + 1e-12)) * Math.cos(2 * Math.PI * v);
  };
}

/* Sounds in a room: each at its own start and level, plus white noise of `noisePower` over everything. */
function room(
  sounds: { signal: Float32Array; at: number; level?: number }[],
  { noisePower = 0, seed = 7, tail = 9600 } = {}
) {
  const length = Math.max(...sounds.map(({ signal, at }) => at + signal.length)) + tail;
  const random = noise(seed);
  const out = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    out[n] = random() * Math.sqrt(noisePower);
  }
  for (const { signal, at, level = 1 } of sounds) {
    signal.forEach((value, n) => {
      out[at + n]! += value * level;
    });
  }
  return out;
}

function feed(receiver: { push(samples: Float32Array): void }, samples: Float32Array, chunk = 2048) {
  for (let at = 0; at < samples.length; at += chunk) {
    receiver.push(samples.subarray(at, at + chunk));
  }
}

const ticks = (samples: Float32Array, rate: number) => {
  const heard: number[][] = [];
  feed(new TickReceiver(rate, (symbols) => heard.push(symbols)), samples);
  return heard;
};
const notes = (samples: Float32Array, rate: number) => {
  const heard: number[][] = [];
  feed(new NoteReceiver(rate, (symbols) => heard.push(symbols)), samples);
  return heard;
};

describe('the tablet clock', () => {
  const rate = 48_000;

  it('reads a frame wherever it starts', () => {
    for (const at of [0, 1234, 5000, 7777]) {
      expect(ticks(room([{ signal: tickFrame([3, 0, 15, 9, 6], rate), at }]), rate)).toEqual([[3, 0, 15, 9, 6]]);
    }
  });

  it('reads frames back to back, at 44.1 kHz too', () => {
    for (const r of [48_000, 44_100]) {
      const a = tickFrame([1, 2, 3, 4, 5], r);
      const b = tickFrame([15, 14, 0, 7, 8], r);
      expect(
        ticks(
          room(
            [
              { signal: a, at: 300 },
              { signal: b, at: 300 + a.length },
            ],
            { noisePower: 0.01 }
          ),
          r
        )
      ).toEqual([
        [1, 2, 3, 4, 5],
        [15, 14, 0, 7, 8],
      ]);
    }
  });

  it('reads a frame in noise as loud as the ticks', () => {
    for (const seed of [1, 2, 3]) {
      const sound = room([{ signal: tickFrame([5, 1, 1, 12, 0], rate), at: 4321 }], { noisePower: 0.05, seed });
      expect(ticks(sound, rate)).toEqual([[5, 1, 1, 12, 0]]);
    }
  });

  it('hears nothing in noise alone, nor in a phone’s tune', () => {
    expect(ticks(room([{ signal: new Float32Array(48_000), at: 0 }], { noisePower: 1 }), rate)).toEqual([]);
    expect(ticks(room([{ signal: tune([1, 2, 3, 4], rate), at: 100 }]), rate)).toEqual([]);
  });
});

describe('the phone tunes', () => {
  const rate = 48_000;

  it('reads a tune wherever it starts, at 44.1 kHz too', () => {
    for (const r of [48_000, 44_100]) {
      for (const at of [0, 1234, 5000]) {
        expect(notes(room([{ signal: tune([3, 0, 15, 9], r), at }]), r)).toEqual([[3, 0, 15, 9]]);
      }
    }
  });

  it('reads repeated notes and the opening notes as symbols', () => {
    expect(notes(room([{ signal: tune([5, 5, 10, 10], rate), at: 500 }]), rate)).toEqual([[5, 5, 10, 10]]);
  });

  it('reads a tune while the clock ticks over it, in some noise', () => {
    const clock = tickFrame([1, 2, 3, 4, 5], rate);
    for (const seed of [1, 2, 3]) {
      const sound = room(
        [
          { signal: clock, at: 0, level: 2 },
          { signal: tune([7, 12, 0, 3], rate), at: 3000 },
        ],
        { noisePower: 0.02, seed }
      );
      expect(notes(sound, rate)).toEqual([[7, 12, 0, 3]]);
      expect(ticks(sound, rate)).toEqual([[1, 2, 3, 4, 5]]);
    }
  });

  it('hears nothing in noise alone', () => {
    expect(notes(room([{ signal: new Float32Array(48_000), at: 0 }], { noisePower: 1 }), rate)).toEqual([]);
  });
});
