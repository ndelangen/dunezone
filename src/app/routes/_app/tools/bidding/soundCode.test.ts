import { describe, expect, it } from 'vitest';

import { decode, encode, ToneReader } from './soundCode';
import type { RemoteCommand, Tone } from './soundCode';

describe('the sound code', () => {
  it.each<RemoteCommand>([
    { seat: 0, kind: 'pass' },
    { seat: 5, kind: 'bid', amount: 17 },
    { seat: 15, kind: 'raise' },
    { seat: 3, kind: 'bid', amount: 1 },
  ])('carries %o there and back', (command) => {
    expect(decode(encode(command))).toEqual(command);
  });

  it('refuses a message with one symbol misheard', () => {
    const symbols = encode({ seat: 2, kind: 'bid', amount: 6 });
    for (let at = 0; at < 4; at++) {
      const wrong = symbols.map((symbol, index) => (index === at ? (symbol + 1) % 16 : symbol));
      expect(decode(wrong)).toBeUndefined();
    }
  });
});

describe('the tone reader', () => {
  /* A tune as the tablet hears it, ten moments a tone and four of silence between. */
  const heard = (tones: Tone[], each = 9, gap = 4): Tone[] =>
    tones.flatMap((tone) => [...Array<Tone>(each).fill(tone), ...Array<Tone>(gap).fill(null)]);

  it('reads a whole message, two equal symbols in a row included', () => {
    const got: RemoteCommand[] = [];
    const reader = new ToneReader((command) => got.push(command));
    const command: RemoteCommand = { seat: 1, kind: 'bid', amount: 17 };
    heard(['start', ...encode(command)]).forEach((tone) => reader.hear(tone));
    expect(encode(command)[1]).toBe(encode(command)[2]);
    expect(got).toEqual([command]);
  });

  it('ignores a blip too short to be a tone', () => {
    const got: RemoteCommand[] = [];
    const reader = new ToneReader((command) => got.push(command));
    [...heard([7], 2), ...heard(['start', ...encode({ seat: 4, kind: 'pass' })])].forEach((tone) => reader.hear(tone));
    expect(got).toEqual([{ seat: 4, kind: 'pass' }]);
  });
});
