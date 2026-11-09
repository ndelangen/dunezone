import { describe, expect, it } from 'vitest';

import { ChirpReceiver, modulate } from './chirpModem';
import type { Heard, MessageKind } from './chirpModem';

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

/* A message in a room: some silence first, the tune at `level`, and white noise of unit power over everything. */
function room(
  signal: Float32Array,
  { lead, level, noisePower, seed = 7 }: { lead: number; level: number; noisePower: number; seed?: number }
) {
  const random = noise(seed);
  const out = new Float32Array(lead + signal.length + 9600);
  for (let n = 0; n < out.length; n++) {
    const tune = n >= lead && n < lead + signal.length ? signal[n - lead]! * level : 0;
    out[n] = tune + random() * Math.sqrt(noisePower);
  }
  return out;
}

function hear(samples: Float32Array, rate: number, kind: MessageKind = 'command', chunk = 2048): Heard[] {
  const heard: Heard[] = [];
  const receiver = new ChirpReceiver(rate, kind, (message) => heard.push(message));
  for (let at = 0; at < samples.length; at += chunk) {
    receiver.push(samples.subarray(at, at + chunk));
  }
  return heard;
}

describe('the chirp radio', () => {
  const rate = 48_000;

  it('reads a clean message wherever it starts', () => {
    for (const lead of [0, 1234, 5000, 7777]) {
      const signal = modulate('command', [3, 0, 15, 9], rate);
      expect(hear(room(signal, { lead, level: 1, noisePower: 0 }), rate)).toEqual([
        { kind: 'command', symbols: [3, 0, 15, 9] },
      ]);
    }
  });

  it('hears only its own direction', () => {
    const signal = modulate('call', [1, 3, 0, 2, 11], rate);
    const sound = room(signal, { lead: 3000, level: 1, noisePower: 0.01 });
    expect(hear(sound, rate, 'call')).toEqual([{ kind: 'call', symbols: [1, 3, 0, 2, 11] }]);
    expect(hear(sound, rate, 'command')).toEqual([]);
  });

  it('reads a message quieter than the noise around it', () => {
    /* The tune's power is a quarter of the noise's: 6 dB below it. */
    const signal = modulate('command', [5, 1, 1, 12], rate);
    for (const seed of [1, 2, 3]) {
      expect(hear(room(signal, { lead: 4321, level: Math.SQRT1_2, noisePower: 1, seed }), rate)).toEqual([
        { kind: 'command', symbols: [5, 1, 1, 12] },
      ]);
    }
  });

  it('reads a message 12 dB below the noise, most of the time', () => {
    /* A sixteenth of the noise's power. Three tries stand in for the three repeats every message is sent with. */
    const signal = modulate('command', [5, 1, 1, 12], rate);
    const heard = [11, 12, 13, 14, 15, 16].filter(
      (seed) => hear(room(signal, { lead: 2222, level: 0.25 * Math.SQRT2, noisePower: 1, seed }), rate).length === 1
    );
    expect(heard.length).toBeGreaterThanOrEqual(3);
  });

  it('hears nothing in noise alone', () => {
    expect(hear(room(new Float32Array(0), { lead: 48_000, level: 0, noisePower: 1 }), rate)).toEqual([]);
  });

  it('works at 44.1 kHz too', () => {
    const signal = modulate('command', [0, 8, 4, 2], 44_100);
    expect(hear(room(signal, { lead: 999, level: 1, noisePower: 0.1 }), 44_100)).toEqual([
      { kind: 'command', symbols: [0, 8, 4, 2] },
    ]);
  });
});
