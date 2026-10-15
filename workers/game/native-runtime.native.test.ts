import { expect, test } from 'vitest';

import { createPeer } from './native-runtime.fixture';

test('the native backend requires asset query types and remains available after rejecting an invalid request', async () => {
  const peer = await createPeer();
  try {
    const query = (args: unknown) =>
      fetch(`${peer.url}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'assets:listByTypes', args: [args] }),
      });
    expect((await query({})).status).toBe(400);
    expect(peer.requests).toHaveLength(0);
    const valid = await query({ types: ['card'] });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({ status: 'success', value: [] });
    expect(peer.requests).toHaveLength(1);
  } finally {
    await peer.close();
  }
});
