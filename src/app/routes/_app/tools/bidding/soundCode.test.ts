import { describe, expect, it } from 'vitest';

import { decode, decodeCall, encode, encodeCall } from './soundCode';
import type { RemoteCommand } from './soundCode';

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

describe('the tablet’s call', () => {
  it('carries whose bid it is, the bid to beat and the time to answer', () => {
    expect(decodeCall(encodeCall({ seat: 3, beat: 17, seconds: 15 }))).toEqual({ seat: 3, beat: 17, seconds: 15 });
    expect(decodeCall(encodeCall({ seat: 3, beat: 17, seconds: 70 }))).toEqual({ seat: 3, beat: 17, seconds: 70 });
    expect(decodeCall(encodeCall({ seat: 4, beat: 0, seconds: 0, welcome: true }))).toEqual({
      seat: 4,
      beat: 0,
      seconds: 0,
      welcome: true,
    });
  });
});
