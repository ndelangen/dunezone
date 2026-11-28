import { createHmac } from 'node:crypto';

import { installEngineHost } from '@shared/play/engine/host';
import { RoomProjection } from '@shared/play/engine/state';
import { piece } from '@shared/play/setupSupply';
import { afterEach, expect, test } from 'vite-plus/test';

import { workerEngineHost } from '../../../../../../workers/game/engineHost';
import { browserEngineHost } from './engineHost';

afterEach(() => installEngineHost(workerEngineHost));

const deck = {
  ...piece('deck', 'Treachery cards', 'shared', '#888888', 'card', 'cards:treachery'),
  items: [{ id: 'stored-card', faceUp: false }],
};

/* The id a projection showed for `stored-card` under the secret `secret` before the engine took signing from its host. */
const PROJECTED_BEFORE = 'card-5c9cf71924b7279cd52384f12bbc17645b3abe83df91bdde07ca0f9ab9af0782';

test.each([
  ['Worker', workerEngineHost],
  ['browser', browserEngineHost],
])(
  'a room projects the same card identities on the %s host as it did with Node crypto in the engine',
  (_name, host) => {
    installEngineHost(host);
    const [card] = new RoomProjection('secret').piece(deck).items;
    expect(card?.id).toBe(PROJECTED_BEFORE);
    expect(card?.id).toBe(`card-${createHmac('sha256', 'secret').update('stored-card').digest('hex')}`);
  }
);

test('the browser host signs as Node does, for any key and message', () => {
  for (const [key, message] of [
    ['a'.repeat(64), 'token-stack-cards:treachery'],
    ['local', 'reveal-piece-1-deck'],
    ['ünïcode key', 'ünïcode message'],
  ] as const) {
    expect(browserEngineHost.hmacSha256(key, message)).toBe(workerEngineHost.hmacSha256(key, message));
  }
});

test('the browser host draws integers in [0, max) and refuses a range Node refuses', () => {
  const seen = new Set(Array.from({ length: 400 }, () => browserEngineHost.randomInt(4)));
  expect([...seen].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  expect(() => browserEngineHost.randomInt(0)).toThrow(RangeError);
  expect(() => browserEngineHost.randomInt(2 ** 32 + 1)).toThrow(RangeError);
});
