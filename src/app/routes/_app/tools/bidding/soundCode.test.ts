import { describe, expect, it } from 'vitest';

import { callReader, commandReader, decode, decodeCall, encode, encodeCall } from './soundCode';
import type { RemoteCommand, Tone } from './soundCode';

describe('the sound code', () => {
  it.each<RemoteCommand>([
    { seat: 0, kind: 'pass' },
    { seat: 5, kind: 'bid', amount: 17 },
    { seat: 15, kind: 'raise' },
    { seat: 3, kind: 'bid', amount: 1 },
    { seat: 6, kind: 'join' },
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
    const reader = commandReader((command) => got.push(command));
    const command: RemoteCommand = { seat: 1, kind: 'bid', amount: 17 };
    heard(['start', ...encode(command)]).forEach((tone) => reader.hear(tone));
    expect(encode(command)[1]).toBe(encode(command)[2]);
    expect(got).toEqual([command]);
  });

  it('ignores a blip too short to be a tone', () => {
    const got: RemoteCommand[] = [];
    const reader = commandReader((command) => got.push(command));
    [...heard([7], 2), ...heard(['start', ...encode({ seat: 4, kind: 'pass' })])].forEach((tone) => reader.hear(tone));
    expect(got).toEqual([{ seat: 4, kind: 'pass' }]);
  });
});

describe('the tablet’s call', () => {
  it('carries whose bid it is, the bid to beat and the time to answer', () => {
    expect(decodeCall(encodeCall({ seat: 3, beat: 17, seconds: 15 }))).toEqual({ seat: 3, beat: 17, seconds: 15 });
  });

  it('is read only by a call reader, and a remote’s command only by a command reader', () => {
    const calls: unknown[] = [];
    const commands: unknown[] = [];
    const tones = (start: 'start' | 'call', symbols: number[]) =>
      [start, ...symbols].flatMap((tone) => [...Array(9).fill(tone), ...Array(4).fill(null)]);
    const heard = [
      ...tones('call', encodeCall({ seat: 1, beat: 2, seconds: 20 })),
      ...tones('start', encode({ seat: 2, kind: 'pass' })),
    ];
    const calling = callReader((call) => calls.push(call));
    const commanding = commandReader((command) => commands.push(command));
    heard.forEach((tone) => {
      calling.hear(tone);
      commanding.hear(tone);
    });
    expect(calls).toEqual([{ seat: 1, beat: 2, seconds: 20 }]);
    expect(commands).toEqual([{ seat: 2, kind: 'pass' }]);
  });
});
