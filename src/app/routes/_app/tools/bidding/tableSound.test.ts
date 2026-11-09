import { describe, expect, it } from 'vitest';

import { BEAT_S, ClockListener, beat } from './clockTicks';
import { NoteReceiver, tune } from './noteTunes';
import type { TuneKind } from './noteTunes';

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

const beats = (samples: Float32Array, rate: number) => {
  let heard = 0;
  feed(new ClockListener(rate, () => heard++), samples);
  return heard;
};
const notes = (samples: Float32Array, rate: number, kind: TuneKind = 'command') => {
  const heard: number[][] = [];
  feed(new NoteReceiver(rate, kind, (symbols) => heard.push(symbols)), samples);
  return heard;
};

/* The clock's beats from `from` for `count` seconds, alternating tick and tock. */
const clock = (rate: number, count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => ({
    signal: beat(index % 2 === 1, rate),
    at: from + Math.round(index * BEAT_S * rate),
  }));

describe('the tablet clock', () => {
  const rate = 48_000;

  it('hears every beat after the first', () => {
    expect(beats(room(clock(rate, 6, 1234)), rate)).toBe(5);
  });

  it('hears the beats in noise and under a tune, at 44.1 kHz too', () => {
    for (const r of [48_000, 44_100]) {
      const sound = room([...clock(r, 5, 500), { signal: tune('command', [15, 14, 13, 12], r), at: 9000 }], {
        noisePower: 0.001,
      });
      expect(beats(sound, r)).toBe(4);
    }
  });

  it('hears no clock in noise alone, nor in tunes', () => {
    expect(beats(room([{ signal: new Float32Array(5 * rate), at: 0 }], { noisePower: 1 }), rate)).toBe(0);
    expect(
      beats(
        room([
          { signal: tune('call', [1, 2, 3, 4, 5], rate), at: 100 },
          { signal: tune('command', [15, 15, 15, 15], rate), at: Math.round(rate * 0.77) },
        ]),
        rate
      )
    ).toBe(0);
  });
});

describe('the tunes', () => {
  const rate = 48_000;

  it('reads a tune wherever it starts, at 44.1 kHz too', () => {
    for (const r of [48_000, 44_100]) {
      for (const at of [0, 1234, 5000]) {
        expect(notes(room([{ signal: tune('command', [3, 0, 15, 9], r), at }]), r)).toEqual([[3, 0, 15, 9]]);
      }
    }
  });

  it('reads repeated notes and the opening notes as symbols', () => {
    expect(notes(room([{ signal: tune('command', [5, 5, 10, 10], rate), at: 500 }]), rate)).toEqual([[5, 5, 10, 10]]);
  });

  it('tells a phone’s tune from the tablet’s', () => {
    const sound = room([
      { signal: tune('call', [1, 2, 3, 4, 5], rate), at: 300 },
      { signal: tune('command', [6, 7, 8, 9], rate), at: rate },
    ]);
    expect(notes(sound, rate, 'call')).toEqual([[1, 2, 3, 4, 5]]);
    expect(notes(sound, rate, 'command')).toEqual([[6, 7, 8, 9]]);
  });

  it('reads a tune while the clock knocks over it, in some noise', () => {
    for (const seed of [1, 2, 3]) {
      const sound = room([...clock(rate, 3), { signal: tune('command', [7, 12, 0, 3], rate), at: rate - 2000 }], {
        noisePower: 0.02,
        seed,
      });
      expect(notes(sound, rate)).toEqual([[7, 12, 0, 3]]);
    }
  });

  it('hears nothing in noise alone', () => {
    expect(notes(room([{ signal: new Float32Array(48_000), at: 0 }], { noisePower: 1 }), rate)).toEqual([]);
  });
});
