import { ConvexError } from 'convex/values';
import { expect, test } from 'vitest';

import { loadPublicPage } from './publicPage';

test('public loaders preserve records and translate only structured absence', async () => {
  const record = { name: 'Dreamers' };
  await expect(loadPublicPage(Promise.resolve(record))).resolves.toBe(record);
  await expect(loadPublicPage(Promise.reject(new ConvexError({ code: 'NOT_FOUND' })))).resolves.toBeNull();
  for (const error of [
    new Error('Connection lost'),
    new ConvexError({ code: 'FORBIDDEN' }),
    new Error('Profile not found'),
  ]) {
    await expect(loadPublicPage(Promise.reject(error))).rejects.toBe(error);
  }
});
