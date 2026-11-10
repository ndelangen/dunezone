import { expect, test } from 'vite-plus/test';

import { clientMessageSchema } from './protocol';

test('nudge carries only a request and target seat', () => {
  const message = { type: 'nudge', requestId: 'request-one', toSeat: 'seat-two' };
  expect(clientMessageSchema.parse(message)).toEqual(message);
  expect(clientMessageSchema.safeParse({ ...message, text: 'hello' }).success).toBe(false);
  expect(clientMessageSchema.safeParse({ ...message, toSeat: '' }).success).toBe(false);
});
