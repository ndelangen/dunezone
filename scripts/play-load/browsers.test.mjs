import { expect, test } from 'vitest';

import { socketOriginAllowed } from './browsers.mjs';

test('a game or backend socket is allowed only when it upgrades from an allowed origin, secure or not', () => {
  const hosted = new Set([
    'https://dunezone-play-load-1.ndelangen.workers.dev',
    'https://isolated-load-1.eu-west-1.convex.cloud',
  ]);
  expect(socketOriginAllowed(hosted, 'wss://dunezone-play-load-1.ndelangen.workers.dev/__play/games/g/socket')).toBe(
    true
  );
  expect(socketOriginAllowed(hosted, 'wss://isolated-load-1.eu-west-1.convex.cloud/api/1.0/sync')).toBe(true);
  expect(socketOriginAllowed(hosted, 'wss://exuberant-finch-263.eu-west-1.convex.cloud/api/1.0/sync')).toBe(false);
  expect(socketOriginAllowed(hosted, 'ws://dunezone-play-load-1.ndelangen.workers.dev/__play/games/g/socket')).toBe(
    false
  );
  const local = new Set(['http://127.0.0.1:4000', 'http://127.0.0.1:4001']);
  expect(socketOriginAllowed(local, 'ws://127.0.0.1:4000/__play/games/g/socket')).toBe(true);
  expect(socketOriginAllowed(local, 'ws://127.0.0.1:4002/__play/games/g/socket')).toBe(false);
});
