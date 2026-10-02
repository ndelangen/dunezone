import { ConvexError } from 'convex/values';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { db } from './core';
import { loadPublicFaction } from './factions';

vi.mock('@db/core', () => ({ db: { query: vi.fn() } }));
afterEach(() => vi.resetAllMocks());

describe('public faction absence', () => {
  test('a missing record becomes absence, while backend and malformed-data failures propagate', async () => {
    vi.mocked(db.query).mockRejectedValueOnce(new ConvexError({ code: 'NOT_FOUND', message: 'not found' }));
    await expect(loadPublicFaction('missing')).resolves.toBeNull();
    const outage = new Error('backend unreachable');
    vi.mocked(db.query).mockRejectedValueOnce(outage);
    await expect(loadPublicFaction('existing')).rejects.toBe(outage);
    const denied = new ConvexError({ code: 'FORBIDDEN', message: 'not allowed' });
    vi.mocked(db.query).mockRejectedValueOnce(denied);
    await expect(loadPublicFaction('existing')).rejects.toBe(denied);
  });
});
