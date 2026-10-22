import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { api } from '../convex/_generated/api';
import { verifyColdPlayRead } from './lib/cold-play-read';

/** Checks the read-only name module before a regular flow warms it, with the native UDF deadline unchanged. */
export function verifyColdNameRead(
  url: string,
  backendPid: number | undefined,
  availability = api.playGameNameAvailability.nameAvailability
) {
  return verifyColdPlayRead({
    url,
    backendPid,
    activeMs: 4,
    pauseMs: 46,
    read: async (client) => {
      const result = await client.query(availability, { name: `Cold read ${randomUUID()}` });
      assert.equal(result, null, 'An unsigned availability read must remain refused.');
    },
  });
}
