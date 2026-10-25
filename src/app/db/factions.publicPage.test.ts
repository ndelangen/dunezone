import { ConvexError } from 'convex/values';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { db } from './core';
import { loadPublicFaction, loadPublicFactionDetail } from './factions';

vi.mock('@db/core', () => ({ db: { query: vi.fn() } }));
afterEach(() => vi.resetAllMocks());

describe('public faction absence', () => {
  test.each([loadPublicFaction, loadPublicFactionDetail])(
    'a missing record becomes absence, while backend and malformed-data failures propagate',
    async (load) => {
      vi.mocked(db.query).mockRejectedValueOnce(new ConvexError({ code: 'NOT_FOUND', message: 'not found' }));
      await expect(load('missing')).resolves.toBeNull();
      const outage = new Error('backend unreachable');
      vi.mocked(db.query).mockRejectedValueOnce(outage);
      await expect(load('existing')).rejects.toBe(outage);
      const denied = new ConvexError({ code: 'FORBIDDEN', message: 'not allowed' });
      vi.mocked(db.query).mockRejectedValueOnce(denied);
      await expect(load('existing')).rejects.toBe(denied);
    }
  );
});
