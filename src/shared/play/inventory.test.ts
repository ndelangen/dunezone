import { describe, expect, it } from 'vitest';

import { initialSnapshot } from './commands';
import { emptyPublicControls, publicControlsSchema } from './inventory';

const withRequest = (requester: { requesterSeat?: string | null }) => ({
  ...emptyPublicControls(),
  requests: [
    {
      id: 'spawn-1',
      requesterName: 'Player',
      contents: {
        assetId: 'recovery',
        name: 'Recovery token',
        type: 'token-disc',
        members: [],
        definitions: [],
        pieces: [initialSnapshot().table.pieces[0]],
      },
      ...requester,
    },
  ],
});

describe('spawn requests', () => {
  it('name the seat that filed them, so approval can always refuse that seat', () => {
    expect(publicControlsSchema.safeParse(withRequest({ requesterSeat: 'harkonnen' })).success).toBe(true);
    expect(publicControlsSchema.safeParse(withRequest({})).success).toBe(false);
    expect(publicControlsSchema.safeParse(withRequest({ requesterSeat: null })).success).toBe(false);
  });
});
