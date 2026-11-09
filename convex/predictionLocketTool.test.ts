import { expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

test('answers with the server clock, and writes nothing', async () => {
  const t = applicationTest();
  const before = Date.now();
  const locked = await t.mutation(api.predictionLocketTool.lockTime, {});
  expect(locked).toBeGreaterThanOrEqual(before);
  expect(locked).toBeLessThanOrEqual(Date.now());
});
