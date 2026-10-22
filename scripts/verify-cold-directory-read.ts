import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { api } from '../convex/_generated/api';
import { verifyColdPlayRead } from './lib/cold-play-read';

/** Checks directory initialization before a regular flow warms it, with the native UDF deadline unchanged. */
export function verifyColdDirectoryRead(
  url: string,
  backendPid: number | undefined,
  directory = api.playGameDirectory.getGameByAddress
) {
  return verifyColdPlayRead({
    url,
    backendPid,
    activeMs: 4,
    pauseMs: 49,
    read: async (client) => {
      const result = await client.query(directory, { address: `cold-read-${randomUUID()}` });
      assert.deepEqual(result, { status: 'sign_in_required' }, 'An unsigned directory read must remain refused.');
    },
  });
}
